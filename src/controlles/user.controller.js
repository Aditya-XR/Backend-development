import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.models.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";


const generateAccessAndRefreshToken = async(userId) =>{
    try{
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshAccessToken();

        //storing refresh token in db
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});
        return {accessToken, refreshToken};

    }catch(error){
        throw new ApiError(500, "Error generating Access and refresh tokens");
    }
}

const registerUser = asyncHandler(async (req, res) => {
    //get user data from req.body/frontend
    //validate user data
    //check if user already exists-by email or username
    //check for images(mandatory), check for avatar(not mandatory).
    //upload images to cloudinary, check for errors
    //create user object - create entry in db
    //send response 
    //remove password and refresh token from response
    //check for user creation
    //return response email

    const {userName, email, fullName, password} = req.body;
    //console.log("req.body in registerUser: ", req.body);

    if(
        [userName, email, fullName, password].some((field) =>
            field?.trim() === "")
    ){
        throw new ApiError(400, "All fields are required");
    } 

    //chaecking if user already exists
    const userExists = await User.findOne({
        $or: [{email}, {userName}]
    });

    if(userExists){
        throw new ApiError(409, "User already exists");
    }

    //files are locally stored in req.files by multer middleware
    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    //console.log("console log req.file from userController: ", req.files);
    //👇this line will cause an error if user doesn't upload a cover image
   // const coverImageLocalPath = req.files?.coverImages[0]?.path;


    //avatar is mandatory
    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar image is required");
    }

    let coverImageLocalPath = null; 
     if(req.files && Array.isArray(req.files.coverImages) && 
        req.files.coverImages.length > 0) {
            coverImageLocalPath = req.files.coverImages[0].path;
        }

    //upload images to cloudinary
    const avatarUrl = await uploadOnCloudinary(avatarLocalPath);
    const coverImageUrl = coverImageLocalPath
        ? await uploadOnCloudinary(coverImageLocalPath)
        : null;

    //final comformation for avatar upload since it's mandatory
    if(!avatarUrl){
        throw new ApiError(500, "Error in uploading avatar image, please try again");
    } 

    //console.log("password before creating user: ", password);
    //create user entry in db
    const user = await User.create({
        fullName,
        avatar: avatarUrl,                    // avatarUrl is already a string URL
        coverImages: coverImageUrl ?? "",      // schema field is singular; adjust requiredness if needed
        email,
        password,                             // will be hashed by pre-save hook
        userName: userName.toLowerCase()
});

    //console.log("Newly created user: ", user);

    //confirming user creation
    const createduser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if(!createduser){
        throw new ApiError(500, "User registration failed, please try again");
    }

    //send response
    return res.status(201).json(
        new ApiResponse(201, createduser, "User registered successfully")
    );

})

const loginUser = asyncHandler(async (req, res) => {
    const {email, userName, password} = req.body;
    if(!email && !userName) {
        throw new ApiError(400, "Email or Username is required to login");
    }

    const user = await User.findOne({
        $or: [{email}, {userName}]
    })

    if(!user){
        throw new ApiError(404, "User not found, please register");
    }
   // console.log("User found during login: ", user);
    //console.log("Password received during login: ", password);
    const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid){
        throw new ApiError(401, "Plaease check your password and try again");
    }
    console.log("User authenticated successfully: ", user._id);
    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id);

    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );
   // console.log("Logged in user data to be sent: ", loggedInUser);

    const options = {//cookie options -> only server can modify httpOnly
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200,
                 {
                    user: loggedInUser, accessToken, refreshToken
                 },
                "User logged in successfully"
            )
        );

});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                 refreshToken: undefined 
            }

        },
        {
            new: true
        }
    )

    const options = {//cookie options -> only server can modify httpOnly
        httpOnly: true,
        secure: true
    }
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(200, null, "User logged out successfully")
        );
});

const refreshAcessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if(!incomingRefreshToken){
        throw new ApiError(400, "Refresh token is required");
    }

    //verify incoming refresh token
    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id);
    
        if(!user || user?.refreshToken !== incomingRefreshToken){
            throw new ApiError(401, "Invalid refresh token, please login again");
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken,newRefreshToken} = await generateAccessAndRefreshToken(user._id);
    
        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {accessToken,  refreshToken: newRefreshToken},
                    "Access token refreshed successfully"
                )
    
            )
    } catch (error) {
        throw new ApiError(401,  error?.message || "Invalid or expired refresh token, please login again");
    }

});

const changeCurrentPassword = asyncHandler(async (req,res) => {
    const {oldPassword, newPassword, conformNewPassword} = req.body;

    if(!oldPassword || !newPassword || !conformNewPassword){
        throw new ApiError(400, "All fields are required");
    }
    if(newPassword !== conformNewPassword){
        throw new ApiError(400, "New password and confirm new password do not match");
    }
    const user = await User.findById(req.user?._id);
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if(!isPasswordCorrect){
        throw new ApiError(401, "Old password is incorrect");
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: false});

    return res
    .status(200)
    .json(new ApiResponse(200, null, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    const {fullName, email} = req.body;

    if(!fullName || !email){
        throw new ApiError(400, "Full name and email are required");
    }

    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName: fullName,
                email: email
            }
        },
        {new: true}
    ).select("-password");

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req,res) => {
    const avatarLocalPath = req.files?.avatar?.[0]?.path;

    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar image is required");
    }

    const avatarUrl = await uploadOnCloudinary(avatarLocalPath);

    if(!avatarUrl){
        throw new ApiError(500, "Error in uploading avatar image, please try again");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatarUrl
            }
        },
        {new: true}
    ).select("-password");

    return res
    .status(200)
    .json(new ApiResponse(200, user, "User avatar updated successfully"));

});


const updateUserCoverImage = asyncHandler(async (req,res) => {
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

    if(!coverImageLocalPath) {
        throw new ApiError(400, "Cover image is required");
    }

    const coverImageUrl = await uploadOnCloudinary(coverImageLocalPath);

    if(!coverImageUrl){
        throw new ApiError(500, "Error in uploading cover image, please try again");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImageUrl
            }
        },
        {new: true}
    ).select("-password");

    return res
    .status(200)
    .json(new ApiResponse(200, user, "User cover image updated successfully"));

});

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAcessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateUserAvatar,
    updateUserCoverImage
};