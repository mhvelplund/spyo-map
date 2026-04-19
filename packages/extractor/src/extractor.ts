import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { S3Client } from '@aws-sdk/client-s3';
import type { Config } from './config.js';
import { getObject, putObject, listObjects } from './storage.js';
import { extractExif, processImage } from './processor.js';
import { openDatabase, imageExists, insertImage, copyDatabase } from './database.js';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.tiff', '.tif']);
const DB_KEY = 'images.db';
const TMP_DB_PATH = 'images.db.tmp';
const LOCAL_DB_PATH = 'images.db.local';

function generateIdFromS3(key: string, etag: string): string {
  return createHash('md5').update(key + etag).digest('hex');
}

function generateIdFromLocal(relativePath: string, mtime: string): string {
  return createHash('md5').update(relativePath + mtime).digest('hex');
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
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }
  await walk(sourceDir);
  return results;
}

async function downloadExistingDb(
  s3: S3Client,
  bucket: string,
): Promise<boolean> {
  console.log('Downloading existing images.db from object storage...');
  const data = await getObject(s3, bucket, DB_KEY);
  if (!data) {
    console.log('No existing images.db found — starting fresh.');
    return false;
  }
  await import('node:fs/promises').then((fs) => fs.writeFile(LOCAL_DB_PATH, data));
  await copyDatabase(LOCAL_DB_PATH, TMP_DB_PATH);
  console.log('Existing database copied to images.db.tmp');
  return true;
}

export async function runExtractor(config: Config, s3: S3Client): Promise<void> {
  // 1. Download existing DB (if present) and create tmp copy
  const hadExisting = await downloadExistingDb(s3, config.storageBucket);
  if (!hadExisting) {
    // Create fresh empty DB
  }

  const db = openDatabase(TMP_DB_PATH);

  try {
    if (config.localSourcePath) {
      await processLocalSource(config, s3, db);
    } else {
      await processBucketSource(config, s3, db);
    }
  } finally {
    db.close();
  }

  // 7. Upload images.db.tmp as images.db
  console.log('Uploading images.db to object storage...');
  const { readFile: rf } = await import('node:fs/promises');
  const dbBuffer = await rf(TMP_DB_PATH);
  await putObject(s3, config.storageBucket, DB_KEY, dbBuffer, 'application/octet-stream');
  console.log('images.db uploaded successfully.');

  // 8. Cleanup
  for (const path of [TMP_DB_PATH, LOCAL_DB_PATH]) {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  console.log('Extractor complete.');
}

async function processLocalSource(
  config: Config,
  s3: S3Client,
  db: ReturnType<typeof openDatabase>,
): Promise<void> {
  const sourceDir = config.localSourcePath!;
  console.log(`Scanning local source: ${sourceDir}`);
  const files = await collectLocalImages(sourceDir);
  console.log(`Found ${files.length} image(s).`);

  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const fullPath = files[i]!;
    const relPath = relative(sourceDir, fullPath);
    const fileStat = await stat(fullPath);
    const mtime = String(fileStat.mtimeMs);
    const id = generateIdFromLocal(relPath, mtime);

    console.log(`Processing ${i + 1}/${files.length}: ${relPath}`);

    if (imageExists(db, id)) {
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
      await putObject(s3, config.storageBucket, `images/${id}.jpg`, fullSize, 'image/jpeg');
      await putObject(
        s3,
        config.storageBucket,
        `images/thumbnails/${id}.jpg`,
        thumbnail,
        'image/jpeg',
      );
      insertImage(db, id, relPath, exif);
      processed++;
    } catch (err) {
      console.error(`  Error processing ${relPath}:`, err);
    }
  }

  console.log(`Done: ${processed} processed, ${skipped} skipped.`);
}

async function processBucketSource(
  config: Config,
  s3: S3Client,
  db: ReturnType<typeof openDatabase>,
): Promise<void> {
  console.log(`Scanning bucket ${config.storageBucket}/raw/ ...`);
  const objects = await listObjects(s3, config.storageBucket, 'raw/');
  const imageObjects = objects.filter((o) => {
    const lower = o.key.toLowerCase();
    return SUPPORTED_EXTENSIONS.has(lower.slice(lower.lastIndexOf('.')));
  });
  console.log(`Found ${imageObjects.length} image(s) in raw/.`);

  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < imageObjects.length; i++) {
    const obj = imageObjects[i]!;
    const id = generateIdFromS3(obj.key, obj.etag);
    const filename = obj.key.split('/').pop() ?? obj.key;

    console.log(`Processing ${i + 1}/${imageObjects.length}: ${obj.key}`);

    if (imageExists(db, id)) {
      console.log(`  Skipping (already processed).`);
      skipped++;
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
      await putObject(s3, config.storageBucket, `images/${id}.jpg`, fullSize, 'image/jpeg');
      await putObject(
        s3,
        config.storageBucket,
        `images/thumbnails/${id}.jpg`,
        thumbnail,
        'image/jpeg',
      );
      insertImage(db, id, filename, exif);
      processed++;
    } catch (err) {
      console.error(`  Error processing ${obj.key}:`, err);
    }
  }

  console.log(`Done: ${processed} processed, ${skipped} skipped.`);
}
