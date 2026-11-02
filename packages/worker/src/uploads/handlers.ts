import {
  detectImageType,
  isSha256Hex,
  MAX_CHECK_HASHES,
  MAX_UPLOAD_BYTES,
  REJECT_COPY,
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

function decodeFilename(header: string | null, fallback: string): string {
  if (!header) return fallback;
  try {
    return decodeURIComponent(header);
  } catch {
    return fallback;
  }
}

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

  const body = await request.arrayBuffer();
  const ext = detectImageType(new Uint8Array(body, 0, Math.min(4, body.byteLength)));
  if (!ext) return rejected(REJECT_COPY.wrongType, 400);

  const rawKey = `raw/${sha256}.${ext}`;
  const sentName = request.headers.get("x-original-filename");
  try {
    await env.BUCKET.put(rawKey, body, {
      httpMetadata: { contentType: ext === "jpg" ? "image/jpeg" : "image/tiff" },
      customMetadata: {
        "uploader-id": String(uploader.id),
        sha256,
        "original-name": sentName ?? `${sha256}.${ext}`,
      },
    });
  } catch {
    return json({ error: "Upload failed" }, 500);
  }

  await recordUpload(env.DB, {
    contentHash: sha256,
    uploaderId: uploader.id,
    originalFilename: decodeFilename(sentName, `${sha256}.${ext}`),
    rawKey,
  });
  return json({ status: "added" } satisfies UploadOutcome, 201);
}
