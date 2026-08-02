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
import { deleteObject, getObject, listObjects, putObject } from "./storage.js";

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".tiff", ".tif"]);

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

  const { rows, keysToDelete } = await processBucketSource(config, s3, existingIds);

  // Commit metadata before deleting anything, so a failure never loses a photo.
  await upsertImages(d1, rows);
  console.log(`Wrote ${rows.length} new row(s) to D1.`);

  for (const key of keysToDelete) {
    try {
      await deleteObject(s3, config.storageBucket, key);
      console.log(`Deleted raw file: ${key}`);
    } catch (err) {
      console.warn(`Warning: could not delete ${key} from raw/:`, err);
    }
  }

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
      rows.push({ id, path: relPath, exif });
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
): Promise<{ rows: ImageInsert[]; keysToDelete: string[] }> {
  console.log(`Scanning bucket ${config.storageBucket}/raw/ ...`);
  const objects = await listObjects(s3, config.storageBucket, "raw/");
  const imageObjects = objects.filter((o) => {
    const lower = o.key.toLowerCase();
    return SUPPORTED_EXTENSIONS.has(lower.slice(lower.lastIndexOf(".")));
  });
  console.log(`Found ${imageObjects.length} image(s) in raw/.`);

  const rows: ImageInsert[] = [];
  const keysToDelete: string[] = [];
  let skipped = 0;

  for (let i = 0; i < imageObjects.length; i++) {
    const obj = imageObjects[i]!;
    const id = generateIdFromS3(obj.key, obj.etag);
    const filename = obj.key.split("/").pop() ?? obj.key;

    console.log(`Processing ${i + 1}/${imageObjects.length}: ${obj.key}`);

    if (existingIds.has(id)) {
      console.log(`  Skipping (already processed).`);
      skipped++;
      keysToDelete.push(obj.key);
      continue;
    }

    try {
      const buffer = await getObject(s3, config.storageBucket, obj.key);
      if (!buffer) {
        console.warn(`  Warning: could not download ${obj.key} — skipping.`);
        continue;
      }

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
      rows.push({ id, path: filename, exif });
      keysToDelete.push(obj.key);
    } catch (err) {
      console.error(`  Error processing ${obj.key}:`, err);
    }
  }

  console.log(`Done: ${rows.length} processed, ${skipped} skipped.`);
  return { rows, keysToDelete };
}
