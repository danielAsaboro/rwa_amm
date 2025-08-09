export interface UploadResult {
  url: string;
  publicId: string;
}

export async function uploadToCloudinary(file: File): Promise<UploadResult> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }

    return {
      url: result.url,
      publicId: result.publicId,
    };
  } catch (error) {
    console.error('Upload error:', error);
    throw new Error('Failed to upload file to Cloudinary');
  }
}

export async function uploadMultipleFiles(files: FileList | File[]): Promise<UploadResult[]> {
  const uploadPromises = Array.from(files).map(file => uploadToCloudinary(file));
  
  try {
    return await Promise.all(uploadPromises);
  } catch (error) {
    console.error('Multiple upload error:', error);
    throw new Error('Failed to upload one or more files');
  }
}