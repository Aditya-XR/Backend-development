import {v2 as cloudinary} from "cloudinary";
import fs from "fs";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFillPath) => {
    try{
        if(!localFillPath) return null;
        //uploding the file to cloudinary
        const response = await cloudinary.uploader.upload(localFillPath, {
            resource_type: "auto"
        })
        //file uploaded successfully
        console.log("msg/cloudinary.js: File uploaded on cloudinary successfully", response.url);
        return response.url;
    } catch (error) {
        //removing the file from local storage in case of error
        fs.unlinkSync(localFillPath);
        return null;
    }
}

export {uploadOnCloudinary};