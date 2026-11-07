import { MAX_CHECK_HASHES, detectImageType } from '@spyo-map/shared';
import type { MeResponse, UploadCheckResponse, UploadOutcome } from '@spyo-map/shared';
import { API_BASE_URL } from '../config.js';

export class SignedOutError extends Error {
  constructor() {
    super('Signed out');
    this.name = 'SignedOutError';
  }
}

export const UPLOAD_FAILED_COPY = 'Upload failed — please retry.';

export class UploadClient {
  async getMe(): Promise<MeResponse | null> {
    const res = await fetch(`${API_BASE_URL}/api/me`, { credentials: 'same-origin' });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`);
    return (await res.json()) as MeResponse;
  }

  async checkHashes(hashes: string[]): Promise<string[]> {
    const known: string[] = [];
    for (let i = 0; i < hashes.length; i += MAX_CHECK_HASHES) {
      const res = await fetch(`${API_BASE_URL}/api/uploads/check`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes: hashes.slice(i, i + MAX_CHECK_HASHES) }),
      });
      if (res.status === 401) throw new SignedOutError();
      if (!res.ok) throw new Error(`Hash check failed: ${res.status}`);
      known.push(...((await res.json()) as UploadCheckResponse).known);
    }
    return known;
  }

  async uploadFile(file: File, sha256: string): Promise<UploadOutcome> {
    // The Worker picks the R2 key extension from Content-Type and verifies it against the stored bytes,
    // so declare the type from the magic bytes rather than trusting file.type (often empty on Android).
    const type = detectImageType(new Uint8Array(await file.slice(0, 4).arrayBuffer()));
    const res = await fetch(`${API_BASE_URL}/api/uploads/${sha256}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'Content-Type': type === 'tif' ? 'image/tiff' : 'image/jpeg',
        'X-Original-Filename': encodeURIComponent(file.name),
      },
      body: file,
    });
    if (res.status === 401) throw new SignedOutError();
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const status = (body as { status?: unknown } | null)?.status;
    if (status === 'added' || status === 'duplicate') {
      return { status };
    }
    if (status === 'rejected') {
      const reason = (body as { reason?: unknown }).reason;
      return { status: 'rejected', reason: typeof reason === 'string' ? reason : UPLOAD_FAILED_COPY };
    }
    return { status: 'rejected', reason: UPLOAD_FAILED_COPY };
  }

  async logout(): Promise<void> {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'same-origin' });
  }
}
