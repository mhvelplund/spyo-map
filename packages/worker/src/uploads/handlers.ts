import {
  detectImageType,
  isSha256Hex,
  MAX_CHECK_HASHES,
  MAX_UPLOAD_BYTES,
  REJECT_COPY,
  type ImageType,
  type UploadCheckResponse,
  type UploadOutcome,
} from "@spyo-map/shared";
import { currentUploader } from "../auth/currentUploader.js";
import { isSameOrigin } from "../auth/routes.js";
import type { Env } from "../env.js";
import { findKnownHashes, recordUpload } from "../services/uploads.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const rejected = (reason: string, status: number): Response =>
  json({ status: "rejected", reason } satisfies UploadOutcome, status);

export async function handleUploadCheck(request: Request, env: Env): Promise<Response> {
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  if (!(await currentUploader(request, env))) return json({ error: "Not signed in" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const hashes = (body as { hashes?: unknown } | null)?.hashes;
  if (
    !Array.isArray(hashes) ||
    hashes.length < 1 ||
    hashes.length > MAX_CHECK_HASHES ||
    !hashes.every((h) => typeof h === "string" && isSha256Hex(h))
  ) {
    return json({ error: "Bad request" }, 400);
  }
  const known = await findKnownHashes(env.DB, hashes as string[]);
  return json({ known } satisfies UploadCheckResponse);
}

const MAX_FILENAME_HEADER = 1024;

function decodeFilename(header: string, fallback: string): string {
  try {
    return decodeURIComponent(header);
  } catch {
    return fallback;
  }
}

/** The client declares the type (from the file's magic bytes); the server verifies it after storing. */
const CONTENT_TYPE_EXT: Record<string, ImageType> = { "image/jpeg": "jpg", "image/tiff": "tif" };

function declaredType(request: Request): ImageType | null {
  const ct = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return CONTENT_TYPE_EXT[ct] ?? null;
}

/**
 * Hands request.body to R2 untouched. A native request stream with a Content-Length goes to R2 without passing
 * through JavaScript, which keeps large uploads under the free plan's 10 ms CPU limit. Wrapping the body in a JS
 * stream (to sniff it inline) cost ~10 ms per photo and got requests killed with exceededCpu.
 */
export async function handleUploadPut(
  request: Request,
  env: Env,
  sha256: string,
): Promise<Response> {
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const uploader = await currentUploader(request, env);
  if (!uploader) return json({ error: "Not signed in" }, 401);

  if (!isSha256Hex(sha256)) return rejected("bad-hash", 400);

  const lengthHeader = request.headers.get("content-length");
  const length = Number(lengthHeader);
  if (lengthHeader === null || !Number.isFinite(length) || length > MAX_UPLOAD_BYTES) {
    return rejected(REJECT_COPY.tooLarge, 413);
  }

  const [known] = await findKnownHashes(env.DB, [sha256]);
  if (known) return json({ status: "duplicate" } satisfies UploadOutcome);

  const ext = declaredType(request);
  if (!request.body || length < 4 || !ext) return rejected(REJECT_COPY.wrongType, 400);

  const rawKey = `raw/${sha256}.${ext}`;
  const fallbackName = `${sha256}.${ext}`;
  const header = request.headers.get("x-original-filename");
  const sentName = header && header.length <= MAX_FILENAME_HEADER ? header : null;
  try {
    await env.BUCKET.put(rawKey, request.body, {
      httpMetadata: { contentType: ext === "jpg" ? "image/jpeg" : "image/tiff" },
      customMetadata: {
        "uploader-id": String(uploader.id),
        sha256,
        "original-name": sentName ?? fallbackName,
      },
    });
  } catch {
    return json({ error: "Upload failed" }, 500);
  }

  // Verify the declared type against the stored bytes; remove the object if it lied.
  let head: Uint8Array | null;
  try {
    const obj = await env.BUCKET.get(rawKey, { range: { offset: 0, length: 4 } });
    head = obj ? new Uint8Array(await obj.arrayBuffer()) : null;
  } catch {
    await env.BUCKET.delete(rawKey).catch(() => {});
    return json({ error: "Upload failed" }, 500);
  }
  if (!head || detectImageType(head) !== ext) {
    await env.BUCKET.delete(rawKey).catch(() => {});
    return rejected(REJECT_COPY.wrongType, 400);
  }

  try {
    await recordUpload(env.DB, {
      contentHash: sha256,
      uploaderId: uploader.id,
      originalFilename: sentName === null ? fallbackName : decodeFilename(sentName, fallbackName),
      rawKey,
    });
  } catch {
    return json({ error: "Upload failed" }, 500);
  }
  return json({ status: "added" } satisfies UploadOutcome, 201);
}
