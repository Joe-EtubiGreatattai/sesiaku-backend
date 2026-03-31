import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type UploadType = 'avatar' | 'cover' | 'panel';

const TRANSFORMATIONS: Record<UploadType, object> = {
  avatar: {
    width: 200, height: 200,
    crop: 'fill', gravity: 'face',
    format: 'webp', quality: 'auto',
  },
  cover: {
    width: 600, height: 800,
    crop: 'fill',
    format: 'webp', quality: 'auto:good',
  },
  // Panels are artwork — preserve aspect ratio, cap width, keep quality high
  panel: {
    width: 1200,
    crop: 'limit',
    format: 'webp', quality: 'auto:best',
  },
};

export async function uploadImage(
  buffer: Buffer,
  type: UploadType,
  folder: string
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `seisaku/${type === 'avatar' ? 'avatars' : type === 'cover' ? 'covers' : 'panels'}/${folder}`,
        transformation: TRANSFORMATIONS[type],
        resource_type: 'image',
      },
      (error, result) => {
        if (error || !result) reject(error || new Error('Upload failed'));
        else resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    uploadStream.end(buffer);
  });
}

export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}
