import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  NoSuchKey,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import type { Config } from './config.js';

export interface S3Object {
  key: string;
  etag: string;
  size: number;
}

export function createS3Client(config: Config): S3Client {
  return new S3Client({
    region: config.storageRegion,
    endpoint: config.storageEndpoint ?? undefined,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.storageAccessKey,
      secretAccessKey: config.storageSecretKey,
    },
  });
}

export async function getObject(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer | null> {
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  } catch (err) {
    if (err instanceof NoSuchKey) return null;
    throw err;
  }
}

export async function putObject(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function listObjects(
  s3: S3Client,
  bucket: string,
  prefix: string,
): Promise<S3Object[]> {
  const objects: S3Object[] = [];
  let continuationToken: string | undefined;

  do {
    const response: ListObjectsV2CommandOutput = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of response.Contents ?? []) {
      if (obj.Key && obj.ETag) {
        objects.push({
          key: obj.Key,
          etag: obj.ETag.replace(/"/g, ''),
          size: obj.Size ?? 0,
        });
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}
