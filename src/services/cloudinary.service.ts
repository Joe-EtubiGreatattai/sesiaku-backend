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
  const destination = `seisaku/${type === 'avatar' ? 'avatars' : type === 'cover' ? 'covers' : 'panels'}/${folder}`;
  console.log(`[Cloudinary] Uploading ${type} | folder: ${destination} | buffer size: ${buffer?.length} bytes`);
  console.log(`[Cloudinary] Config — cloud_name: ${process.env.CLOUDINARY_CLOUD_NAME || 'MISSING'} | api_key set: ${!!process.env.CLOUDINARY_API_KEY} | api_secret set: ${!!process.env.CLOUDINARY_API_SECRET}`);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: destination,
        transformation: TRANSFORMATIONS[type],
        resource_type: 'image',
      },
      (error, result) => {
        if (error || !result) {
          console.error('[Cloudinary] Upload error:', error?.message, '| http_code:', error?.http_code);
          reject(error || new Error('Upload failed'));
        } else {
          console.log('[Cloudinary] Upload success | public_id:', result.public_id, '| url:', result.secure_url);
          resolve({ url: result.secure_url, publicId: result.public_id });
        }
      }
    );
    uploadStream.end(buffer);
  });
}

export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}
