export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_CHECK_HASHES = 500;

export type ImageType = 'jpg' | 'tif';

export function detectImageType(head: Uint8Array): ImageType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head.length >= 4) {
    if (head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0x00) return 'tif';
    if (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0x00 && head[3] === 0x2a) return 'tif';
  }
  return null;
}

export function isSha256Hex(s: string): boolean {
  return /^[0-9a-f]{64}$/.test(s);
}

export interface UploadCheckRequest {
  hashes: string[];
}

export interface UploadCheckResponse {
  known: string[];
}

export type UploadOutcome =
  | { status: 'added' | 'duplicate' }
  | { status: 'rejected'; reason: string };

export interface MeResponse {
  displayName: string;
}

/** Body of POST /auth/google/idtoken: a Google ID token obtained by the mobile app's native sign-in. */
export interface IdTokenSignInRequest {
  idToken: string;
}

export const REJECT_COPY = {
  noGps: 'No location data — on Android the browser may have removed it; try a computer.',
  wrongType: 'Not a JPEG or TIFF file.',
  tooLarge: 'Larger than 50 MB.',
  noGpsInApp: 'No location data — the sharing app may have removed it; use Choose photos instead.',
} as const;
