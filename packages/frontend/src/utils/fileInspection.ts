import exifr from 'exifr';
import { MAX_UPLOAD_BYTES, REJECT_COPY, detectImageType } from '@spyo-map/shared';

export type Inspection = { ok: true; sha256: string } | { ok: false; reason: string };

export interface InspectDeps {
  gps(f: File): Promise<unknown>;
  digest(b: ArrayBuffer): Promise<ArrayBuffer>;
}

const defaultDeps: InspectDeps = {
  gps: (f) => exifr.gps(f),
  digest: (b) => crypto.subtle.digest('SHA-256', b),
};

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function inspectFile(file: File, deps: InspectDeps = defaultDeps): Promise<Inspection> {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: REJECT_COPY.tooLarge };

  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (detectImageType(head) === null) return { ok: false, reason: REJECT_COPY.wrongType };

  let gps: unknown;
  try {
    gps = await deps.gps(file);
  } catch {
    gps = undefined;
  }
  const g = gps as { latitude?: unknown; longitude?: unknown } | null | undefined;
  if (!g || !Number.isFinite(g.latitude) || !Number.isFinite(g.longitude)) {
    return { ok: false, reason: REJECT_COPY.noGps };
  }

  const sha256 = toHex(await deps.digest(await file.arrayBuffer()));
  return { ok: true, sha256 };
}
