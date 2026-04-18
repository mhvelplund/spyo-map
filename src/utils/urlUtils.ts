/**
 * Utility functions for URL generation and manipulation
 */

/**
 * Generate a direct image URL for sharing (with hash routing)
 * @param imageId - The ID of the image
 * @returns The full URL to the image
 */
export const generateImageUrl = (imageId: string): string => {
  const baseUrl = window.location.origin;
  return `${baseUrl}/#/image/${imageId}`;
};

/**
 * Extract image ID from a path or filename
 * @param pathOrId - Could be a full path, filename, or just the ID
 * @returns The clean image ID (hash without extension)
 */
export const extractImageId = (pathOrId: string): string => {
  // Remove any leading slash or path components
  const filename = pathOrId.split('/').pop() || pathOrId;
  // Remove file extension
  return filename.replace(/\.[^/.]+$/, '');
};

/**
 * Get the current image ID from the URL hash
 * @returns The image ID if present, null otherwise
 */
export const getCurrentImageId = (): string | null => {
  const hash = window.location.hash;
  const match = hash.match(/^#\/image\/(.+)$/);
  return match ? extractImageId(match[1]) : null;
};

/**
 * Check if the current URL is an image URL
 * @returns True if the current URL is an image URL
 */
export const isImageUrl = (): boolean => {
  return getCurrentImageId() !== null;
};

/**
 * Generate a shareable URL with metadata for social media
 * @param imageId - The ID of the image
 * @param title - Optional title for the image
 * @returns Object containing various URL formats for different platforms
 */
export const generateShareUrls = (imageId: string, title?: string) => {
  const imageUrl = generateImageUrl(imageId);
  const encodedUrl = encodeURIComponent(imageUrl);
  const encodedTitle = encodeURIComponent(title || 'Check out this photo on Spyo Map');

  return {
    direct: imageUrl,
    twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    // Instagram doesn't support direct URL sharing, so we provide the URL for copying
    instagram: imageUrl
  };
};