import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
  api_key: process.env.CLOUDINARY_API_KEY as string,
  api_secret: process.env.CLOUDINARY_API_SECRET as string,
});

export const uploadImage = async (filePath: string): Promise<{ secure_url: string }> => {
  try {
    const result = await cloudinary.uploader.upload(filePath, { folder: 'user_images' });
    return result;
  } catch (error) {
    throw new Error(`Image upload failed: ${error}`);
  }
};

export const uploadAudio = async (filePath: string): Promise<{ secure_url: string }> => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'video', // Use 'video' for audio files in Cloudinary
      folder: 'user_audio',
    });
    return result;
  } catch (error) {
    throw new Error(`Audio upload failed: ${error}`);
  }
};