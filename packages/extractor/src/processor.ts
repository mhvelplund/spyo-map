import exifr from 'exifr';
import sharp from 'sharp';

export interface ProcessedImage {
  fullSize: Buffer;
  thumbnail: Buffer;
}

export interface ExifData {
  latitude: number;
  longitude: number;
  timestamp: string | undefined;
  latitudeRef: string | undefined;
  longitudeRef: string | undefined;
  altitudeRef: string | undefined;
  altitude: number | undefined;
  speedRef: string | undefined;
  speed: number | undefined;
  imgDirectionRef: string | undefined;
  imgDirection: number | undefined;
  destBearingRef: string | undefined;
  destBearing: number | undefined;
  hPositioningError: number | undefined;
}

export async function extractExif(imageBuffer: Buffer): Promise<ExifData | null> {
  const exif = await exifr.parse(imageBuffer, {
    gps: true,
    tiff: true,
    exif: true,
  });

  if (!exif || exif.latitude == null || exif.longitude == null) {
    return null;
  }

  const timestamp =
    exif.DateTimeOriginal ?? exif.CreateDate ?? exif.ModifyDate ?? undefined;

  return {
    latitude: exif.latitude as number,
    longitude: exif.longitude as number,
    timestamp: timestamp instanceof Date ? timestamp.toISOString() : (timestamp as string | undefined),
    latitudeRef: exif.GPSLatitudeRef as string | undefined,
    longitudeRef: exif.GPSLongitudeRef as string | undefined,
    altitudeRef:
      exif.GPSAltitudeRef != null ? String(exif.GPSAltitudeRef) : undefined,
    altitude: exif.GPSAltitude as number | undefined,
    speedRef: exif.GPSSpeedRef as string | undefined,
    speed: exif.GPSSpeed as number | undefined,
    imgDirectionRef: exif.GPSImgDirectionRef as string | undefined,
    imgDirection: exif.GPSImgDirection as number | undefined,
    destBearingRef: exif.GPSDestBearingRef as string | undefined,
    destBearing: exif.GPSDestBearing as number | undefined,
    hPositioningError: exif.GPSHPositioningError as number | undefined,
  };
}

export async function processImage(imageBuffer: Buffer): Promise<ProcessedImage> {
  const [fullSize, thumbnail] = await Promise.all([
    sharp(imageBuffer)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer(),
    sharp(imageBuffer)
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer(),
  ]);

  return { fullSize, thumbnail };
}
