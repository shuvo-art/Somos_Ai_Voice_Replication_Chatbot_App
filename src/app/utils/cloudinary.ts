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
    throw new Error(`Image upload failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
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
    throw new Error(`Audio upload failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
  }
};

export const uploadHeroImage = async (filePath: string): Promise<{ secure_url: string }> => {
  try {
    const result = await cloudinary.uploader.upload(filePath, { folder: 'hero_images' });
    return result;
  } catch (error) {
    throw new Error(`Image upload failed: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
  }
};

export const getHeroImages = async (): Promise<{ public_id: string; secure_url: string }[]> => {
  try {
    const result = await cloudinary.api.resources({
      resource_type: 'image',
      type: 'upload', // Add this to specify the storage type
      prefix: 'hero_images', // Folder where hero images are stored
      max_results: 100, // Adjust as needed (Cloudinary's max per request)
    });
    return result.resources.map((resource: any) => ({
      public_id: resource.public_id,
      secure_url: resource.secure_url,
    }));
  } catch (error) {
    // Handle Cloudinary-specific errors
    if (error instanceof Error) {
      throw new Error(`Failed to retrieve hero images: ${error.message}`);
    } else {
      // Cloudinary errors are often objects with a `message` property
      const errorObj = error as { message?: string; http_code?: number };
      const errorMessage = errorObj.message || JSON.stringify(errorObj);
      throw new Error(`Failed to retrieve hero images: ${errorMessage}`);
    }
  }
};