import { S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Config } from "./config.js";
import {
  fetchExistingIds,
  upsertImages,
  type D1Client,
  type ImageInsert,
} from "./d1.js";
import { extractExif, processImage } from "./processor.js";
import {
  getObjectWithMetadata,
  listObjects,
  moveObject,
  putObject,
} from "./storage.js";

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".tiff", ".tif"]);

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function failedKey(key: string): string {
  return key.startsWith("raw/") ? `failed/${key.slice(4)}` : `failed/${key}`;
}

function originalsKey(key: string): string {
  return key.startsWith("raw/") ? `originals/${key.slice(4)}` : `originals/${key}`;
}

/** The object's key as it was (or would have been) under raw/, so ids are stable across re-ingest. */
function canonicalRawKey(key: string, prefix: string): string {
  return key.startsWith(prefix) ? `raw/${key.slice(prefix.length)}` : key;
}

function originalName(metadata: Record<string, string>, key: string): string {
  const fallback = key.split("/").pop() ?? key;
  const encoded = metadata["original-name"];
  if (!encoded) return fallback;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return fallback;
  }
}

function generateIdFromS3(key: string, etag: string): string {
  return createHash("md5")
    .update(key + etag)
    .digest("hex");
}

function generateIdFromLocal(relativePath: string, mtime: string): string {
  return createHash("md5")
    .update(relativePath + mtime)
    .digest("hex");
}

async function collectLocalImages(sourceDir: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }
  await walk(sourceDir);
  return results;
}

export async function runExtractor(
  config: Config,
  s3: S3Client,
  d1: D1Client,
): Promise<void> {
  console.log("Fetching known image ids from D1...");
  const existingIds = await fetchExistingIds(d1);
  console.log(`D1 holds ${existingIds.size} image(s).`);

  if (config.localSourcePath) {
    const rows = await processLocalSource(config, s3, existingIds);
    await upsertImages(d1, rows);
    console.log(`Wrote ${rows.length} new row(s) to D1.`);
    console.log("Extractor complete.");
    return;
  }

  const { rows, keysToArchive, keysToFail } = await processBucketSource(config, s3, existingIds);

  // Commit metadata before moving anything, so a failure never loses a photo.
  await upsertImages(d1, rows);
  console.log(`Wrote ${rows.length} new row(s) to D1.`);

  if (config.sourcePrefix === "originals/") {
    // Re-ingest: originals stay exactly where they are.
    if (keysToFail.length > 0) {
      console.warn(`Could not re-ingest ${keysToFail.length} original(s): ${keysToFail.join(", ")}`);
    }
    console.log("Extractor complete.");
    return;
  }

  for (const key of keysToArchive) {
    try {
      await moveObject(s3, config.storagePrivateBucket, key, originalsKey(key));
      console.log(`Moved to originals/: ${key}`);
    } catch (err) {
      // Left in raw/; the next run sees it as already processed and retries the move.
      console.warn(`Warning: could not move ${key} to originals/:`, err);
    }
  }

  for (const key of keysToFail) {
    try {
      await moveObject(s3, config.storagePrivateBucket, key, failedKey(key));
      console.log(`Moved to failed/: ${key}`);
    } catch (err) {
      console.warn(`Warning: could not move ${key} to failed/:`, err);
    }
  }
  console.log(`Failed: ${keysToFail.length} object(s)`);

  console.log("Extractor complete.");
}

async function processLocalSource(
  config: Config,
  s3: S3Client,
  existingIds: Set<string>,
): Promise<ImageInsert[]> {
  const sourceDir = config.localSourcePath!;
  console.log(`Scanning local source: ${sourceDir}`);
  const files = await collectLocalImages(sourceDir);
  console.log(`Found ${files.length} image(s).`);

  const rows: ImageInsert[] = [];
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const fullPath = files[i]!;
    const relPath = relative(sourceDir, fullPath);
    const fileStat = await stat(fullPath);
    const id = generateIdFromLocal(relPath, String(fileStat.mtimeMs));

    console.log(`Processing ${i + 1}/${files.length}: ${relPath}`);

    if (existingIds.has(id)) {
      console.log(`  Skipping (already processed).`);
      skipped++;
      continue;
    }

    try {
      const buffer = await readFile(fullPath);
      const exif = await extractExif(buffer);
      if (!exif) {
        console.warn(`  Warning: no GPS data — skipping.`);
        continue;
      }

      const { fullSize, thumbnail } = await processImage(buffer);
      await putObject(s3, config.storageBucket, `images/${id}.jpg`, fullSize, "image/jpeg");
      await putObject(
        s3,
        config.storageBucket,
        `images/thumbnails/${id}.jpg`,
        thumbnail,
        "image/jpeg",
      );
      rows.push({
        id,
        path: relPath,
        exif,
        uploaderId: 1,
        contentHash: sha256Hex(buffer),
      });
    } catch (err) {
      console.error(`  Error processing ${relPath}:`, err);
    }
  }

  console.log(`Done: ${rows.length} processed, ${skipped} skipped.`);
  return rows;
}

async function processBucketSource(
  config: Config,
  s3: S3Client,
  existingIds: Set<string>,
): Promise<{ rows: ImageInsert[]; keysToArchive: string[]; keysToFail: string[] }> {
  const prefix = config.sourcePrefix;
  console.log(`Scanning bucket ${config.storagePrivateBucket}/${prefix} ...`);
  const objects = await listObjects(s3, config.storagePrivateBucket, prefix);
  const imageObjects = objects.filter((o) => {
    const lower = o.key.toLowerCase();
    return SUPPORTED_EXTENSIONS.has(lower.slice(lower.lastIndexOf(".")));
  });
  console.log(`Found ${imageObjects.length} image(s) in ${prefix}.`);

  const rows: ImageInsert[] = [];
  const keysToArchive: string[] = [];
  const keysToFail: string[] = [];
  let skipped = 0;

  for (let i = 0; i < imageObjects.length; i++) {
    const obj = imageObjects[i]!;
    const id = generateIdFromS3(canonicalRawKey(obj.key, prefix), obj.etag);

    console.log(`Processing ${i + 1}/${imageObjects.length}: ${obj.key}`);

    if (existingIds.has(id)) {
      console.log(`  Skipping (already processed).`);
      skipped++;
      keysToArchive.push(obj.key);
      continue;
    }

    try {
      const downloaded = await getObjectWithMetadata(s3, config.storagePrivateBucket, obj.key);
      if (!downloaded) {
        console.warn(`  Warning: could not download ${obj.key} — skipping.`);
        continue;
      }
      const { body: buffer, metadata } = downloaded;

      const contentHash = sha256Hex(buffer);
      const declaredHash = metadata["sha256"];
      if (declaredHash && declaredHash.toLowerCase() !== contentHash) {
        console.error(
          `  Error: sha256 mismatch for ${obj.key} (declared ${declaredHash}, actual ${contentHash}).`,
        );
        keysToFail.push(obj.key);
        continue;
      }

      const declaredUploader = metadata["uploader-id"] ?? "";
      const uploaderId = /^[1-9][0-9]*$/.test(declaredUploader)
        ? parseInt(declaredUploader, 10)
        : 1;

      let exif: Awaited<ReturnType<typeof extractExif>>;
      let processed: Awaited<ReturnType<typeof processImage>>;
      try {
        exif = await extractExif(buffer);
        if (!exif) {
          console.warn(`  Warning: no GPS data — moving to failed/.`);
          keysToFail.push(obj.key);
          continue;
        }
        processed = await processImage(buffer);
      } catch (err) {
        console.error(`  Error processing ${obj.key}:`, err);
        keysToFail.push(obj.key);
        continue;
      }
      const { fullSize, thumbnail } = processed;
      await putObject(s3, config.storageBucket, `images/${id}.jpg`, fullSize, "image/jpeg");
      await putObject(
        s3,
        config.storageBucket,
        `images/thumbnails/${id}.jpg`,
        thumbnail,
        "image/jpeg",
      );
      rows.push({
        id,
        path: originalName(metadata, obj.key),
        exif,
        uploaderId,
        contentHash,
      });
      keysToArchive.push(obj.key);
    } catch (err) {
      // Transient (download/upload) error: leave the object in place for the next run.
      console.error(`  Error handling ${obj.key}; leaving it in ${prefix}:`, err);
    }
  }

  console.log(`Done: ${rows.length} processed, ${skipped} skipped.`);
  return { rows, keysToArchive, keysToFail };
}
