import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import {User} from "../models/user.models.js";
import {uploadOnCloudinary} from "../utils/cloudinary.js";
import {ApiResponse} from "../utils/ApiResponse.js";

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
    //console.log("email:", email);

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
    const avatarLocalPath = req.files?.avatar[0]?.path;
    console.log(req.files);
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

    //create user entry in db
    const user = await User.create({
        fullName,
        avatar: avatarUrl,                    // avatarUrl is already a string URL
        coverImages: coverImageUrl ?? "",      // schema field is singular; adjust requiredness if needed
        email,
        password,                             // will be hashed by pre-save hook
        userName: userName.toLowerCase()
});

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

export { registerUser };