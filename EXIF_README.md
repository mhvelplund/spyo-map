# EXIF Extraction Script

This Python script extracts GPS and EXIF metadata from images and creates an SQLite database for the geo-image map browser.

## Requirements

- Python 3.7+
- Pillow library for image processing

## Installation

```bash
pip install -r requirements.txt
```

## Usage

```bash
python extract_exif.py <path_to_image_folder>
```

Example:
```bash
python extract_exif.py ./photos
```

## What it does

1. **Scans recursively** through the specified folder for supported image formats (JPG, JPEG, TIFF, TIF)
2. **Extracts EXIF data** including GPS coordinates, altitude, speed, direction, and other location metadata
3. **Creates optimized thumbnails** (200x200px) for web display
4. **Generates SQLite database** (`images.db`) with comprehensive GPS fields
5. **Skips images** without GPS data

## Output

- `images.db` - SQLite database containing image metadata
- `thumbnails/` - Directory containing optimized thumbnail images
- Console output showing processing progress

## Database Schema

The generated SQLite database includes these fields:
- `id` - Unique image identifier
- `path` - Relative path to original image
- `thumbnail_path` - Path to thumbnail image
- `latitude`, `longitude` - GPS coordinates
- `timestamp` - Image capture time
- `altitude`, `speed`, `img_direction` - Additional GPS metadata
- Various reference fields for GPS data interpretation

## Supported Image Formats

- JPEG (.jpg, .jpeg)
- TIFF (.tiff, .tif)

Images without GPS metadata are automatically skipped.