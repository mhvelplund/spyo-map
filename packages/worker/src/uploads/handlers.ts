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

const MAX_FILENAME_HEADER = 1024;

function decodeFilename(header: string, fallback: string): string {
  try {
    return decodeURIComponent(header);
  } catch {
    return fallback;
  }
}

/**
 * Reads just enough of the body to sniff the magic bytes, then returns a stream that replays those bytes and
 * forwards the rest. Never buffers the whole body (no arrayBuffer(), no tee()).
 */
async function sniffBody(
  body: ReadableStream<Uint8Array>,
): Promise<{ ext: ReturnType<typeof detectImageType>; stream: ReadableStream<Uint8Array> | null }> {
  const reader = body.getReader();
  const head: Uint8Array[] = [];
  let headLength = 0;
  while (headLength < 4) {
    const { done, value } = await reader.read();
    if (done) break;
    head.push(value);
    headLength += value.byteLength;
  }
  const magic = new Uint8Array(Math.min(4, headLength));
  let offset = 0;
  for (const chunk of head) {
    if (offset === magic.length) break;
    const n = Math.min(chunk.byteLength, magic.length - offset);
    magic.set(chunk.subarray(0, n), offset);
    offset += n;
  }
  const ext = detectImageType(magic);
  if (!ext) {
    await reader.cancel().catch(() => {});
    return { ext, stream: null };
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of head) controller.enqueue(chunk);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { ext, stream };
}

/** R2 needs a known length in the Workers runtime; FixedLengthStream provides it. Absent in tests. */
function withKnownLength(stream: ReadableStream<Uint8Array>, length: number): ReadableStream<Uint8Array> {
  const Fixed = (globalThis as { FixedLengthStream?: new (n: number) => TransformStream<Uint8Array, Uint8Array> })
    .FixedLengthStream;
  if (!Fixed) return stream;
  const fixed = new Fixed(length);
  stream.pipeTo(fixed.writable).catch(() => {});
  return fixed.readable;
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

  if (!request.body) return rejected(REJECT_COPY.wrongType, 400);
  const { ext, stream } = await sniffBody(request.body);
  if (!ext || !stream) return rejected(REJECT_COPY.wrongType, 400);

  const rawKey = `raw/${sha256}.${ext}`;
  const fallbackName = `${sha256}.${ext}`;
  const header = request.headers.get("x-original-filename");
  const sentName = header && header.length <= MAX_FILENAME_HEADER ? header : null;
  try {
    await env.BUCKET.put(rawKey, withKnownLength(stream, length), {
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
