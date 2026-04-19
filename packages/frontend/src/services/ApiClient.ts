import type { ImageRecord } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export class ApiClient {
  async getAllImages(): Promise<ImageRecord[]> {
    const response = await fetch(`${API_BASE_URL}/api/images`);
    if (!response.ok) {
      throw new Error(`Failed to fetch images: ${response.statusText}`);
    }
    return response.json() as Promise<ImageRecord[]>;
  }

  async getImageById(id: string): Promise<ImageRecord | null> {
    const response = await fetch(`${API_BASE_URL}/api/images/${encodeURIComponent(id)}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    return response.json() as Promise<ImageRecord>;
  }

  async getNearbyImages(id: string, radius = 1): Promise<ImageRecord[]> {
    const response = await fetch(
      `${API_BASE_URL}/api/images/${encodeURIComponent(id)}/nearby?radius=${radius}`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch nearby images: ${response.statusText}`);
    }
    return response.json() as Promise<ImageRecord[]>;
  }
}

export const apiClient = new ApiClient();
