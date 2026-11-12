import type { ImageRecord } from '../types/index.js';
import { API_BASE_URL } from '../config.js';

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

  async setImageLocation(id: string, latitude: number, longitude: number): Promise<ImageRecord[]> {
    const response = await fetch(`${API_BASE_URL}/api/images/${encodeURIComponent(id)}/location`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ latitude, longitude }),
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new Error(`Failed to set image location: ${response.statusText}`);
    }
    return response.json() as Promise<ImageRecord[]>;
  }

  /** Admin: hide or unhide an image. Returns every record sharing its content hash. */
  async setHidden(id: string, hidden: boolean): Promise<ImageRecord[]> {
    const action = hidden ? 'hide' : 'unhide';
    const response = await fetch(`${API_BASE_URL}/api/images/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new Error(`Failed to ${action} image: ${response.statusText}`);
    }
    return response.json() as Promise<ImageRecord[]>;
  }

  /** Admin: group an image with a target image. Returns the affected records. */
  async groupImages(id: string, targetId: string): Promise<ImageRecord[]> {
    const response = await fetch(`${API_BASE_URL}/api/images/${encodeURIComponent(id)}/group`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetId }),
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new Error(`Failed to group image: ${response.statusText}`);
    }
    return response.json() as Promise<ImageRecord[]>;
  }

  /** Admin: remove an image from its group. Returns the affected records. */
  async ungroupImage(id: string): Promise<ImageRecord[]> {
    const response = await fetch(`${API_BASE_URL}/api/images/${encodeURIComponent(id)}/ungroup`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new Error(`Failed to ungroup image: ${response.statusText}`);
    }
    return response.json() as Promise<ImageRecord[]>;
  }
}

export const apiClient = new ApiClient();
