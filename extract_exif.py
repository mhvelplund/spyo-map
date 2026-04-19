#!/usr/bin/env python3
"""
EXIF Extraction Script for Geo-Image Map Browser

This script scans a folder recursively for images, extracts GPS and EXIF metadata,
creates optimized thumbnails, and stores everything in an SQLite database.

Usage: python extract_exif.py <image_folder_path>
"""

import os
import sys
import sqlite3
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from PIL import Image, ExifTags
from PIL.ExifTags import GPSTAGS
import json


class ExifExtractor:
    """Handles EXIF data extraction and database operations."""

    # Supported image formats
    SUPPORTED_FORMATS = {'.jpg', '.jpeg', '.tiff', '.tif'}

    # Image processing settings
    MAX_IMAGE_SIZE = (2048, 2048)
    THUMBNAIL_SIZE = (200, 200)
    IMAGE_QUALITY = 90
    THUMBNAIL_QUALITY = 85

    def __init__(self, root_folder: str):
        self.root_folder = Path(root_folder).resolve()
        # Create images directory structure in web application root
        self.images_dir = Path.cwd() / "images"
        self.thumbnails_dir = self.images_dir / "thumbnails"
        self.images_dir.mkdir(exist_ok=True)
        self.thumbnails_dir.mkdir(exist_ok=True)
        # Database goes in web application root
        self.db_path = Path.cwd() / "images.db"

    def scan_images(self) -> List[Dict[str, Any]]:
        """Scan folder recursively for images and extract EXIF data."""
        images_data = []

        print(f"Scanning folder: {self.root_folder}")

        for file_path in self.root_folder.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in self.SUPPORTED_FORMATS:
                try:
                    image_data = self.extract_exif(file_path)
                    if image_data:
                        images_data.append(image_data)
                        print(f"✓ Processed: {file_path.relative_to(self.root_folder)}")
                    else:
                        print(f"⚠ No GPS data: {file_path.relative_to(self.root_folder)}")
                except Exception as e:
                    print(f"✗ Error processing {file_path.relative_to(self.root_folder)}: {e}")

        print(f"\nFound {len(images_data)} images with GPS data")
        return images_data

    def extract_exif(self, image_path: Path) -> Optional[Dict[str, Any]]:
        """Extract EXIF data from an image file."""
        try:
            with Image.open(image_path) as img:
                exif_data = img._getexif()

                if not exif_data:
                    return None

                # Convert numeric EXIF tags to readable names
                exif_dict = {}
                for tag_id, value in exif_data.items():
                    tag = ExifTags.TAGS.get(tag_id, tag_id)
                    exif_dict[tag] = value

                # Extract GPS data
                gps_data = self.extract_gps_data(exif_dict.get('GPSInfo', {}))

                if not gps_data or 'latitude' not in gps_data or 'longitude' not in gps_data:
                    return None

                # Generate unique ID for the image
                image_id = self.generate_image_id(image_path)

                # Create relative path for web access
                relative_path = image_path.relative_to(self.root_folder)

                # Create scaled image and thumbnail (paths can be derived from ID)
                self.create_scaled_image(image_path, image_id)
                self.create_thumbnail(image_path, image_id)

                # Compile image record (no path fields needed - can be derived from ID)
                image_record = {
                    'id': image_id,
                    'latitude': gps_data['latitude'],
                    'longitude': gps_data['longitude'],
                    'timestamp': self.extract_timestamp(exif_dict),
                    'latitude_ref': gps_data.get('latitude_ref'),
                    'longitude_ref': gps_data.get('longitude_ref'),
                    'altitude_ref': gps_data.get('altitude_ref'),
                    'altitude': gps_data.get('altitude'),
                    'speed_ref': gps_data.get('speed_ref'),
                    'speed': gps_data.get('speed'),
                    'img_direction_ref': gps_data.get('img_direction_ref'),
                    'img_direction': gps_data.get('img_direction'),
                    'dest_bearing_ref': gps_data.get('dest_bearing_ref'),
                    'dest_bearing': gps_data.get('dest_bearing'),
                    'h_positioning_error': gps_data.get('h_positioning_error')
                }

                return image_record

        except Exception as e:
            # Common issues: corrupted files, unsupported formats, permission errors
            return None

    def extract_gps_data(self, gps_info: Dict) -> Dict[str, Any]:
        """Extract and convert GPS data from EXIF GPS info."""
        if not gps_info:
            return {}

        gps_data = {}

        # Convert GPS info to readable format
        for key, value in gps_info.items():
            tag = GPSTAGS.get(key, key)
            gps_data[tag] = value

        # Extract latitude
        if 'GPSLatitude' in gps_data and 'GPSLatitudeRef' in gps_data:
            lat = self.convert_to_degrees(gps_data['GPSLatitude'])
            if gps_data['GPSLatitudeRef'] == 'S':
                lat = -lat
            gps_data['latitude'] = lat
            gps_data['latitude_ref'] = gps_data['GPSLatitudeRef']

        # Extract longitude
        if 'GPSLongitude' in gps_data and 'GPSLongitudeRef' in gps_data:
            lon = self.convert_to_degrees(gps_data['GPSLongitude'])
            if gps_data['GPSLongitudeRef'] == 'W':
                lon = -lon
            gps_data['longitude'] = lon
            gps_data['longitude_ref'] = gps_data['GPSLongitudeRef']

        # Extract altitude
        if 'GPSAltitude' in gps_data:
            altitude = float(gps_data['GPSAltitude'])
            if 'GPSAltitudeRef' in gps_data and gps_data['GPSAltitudeRef'] == 1:
                altitude = -altitude  # Below sea level
            gps_data['altitude'] = altitude
            gps_data['altitude_ref'] = gps_data.get('GPSAltitudeRef', 0)

        # Extract speed
        if 'GPSSpeed' in gps_data:
            gps_data['speed'] = float(gps_data['GPSSpeed'])
            gps_data['speed_ref'] = gps_data.get('GPSSpeedRef', 'K')  # Default to km/h

        # Extract image direction
        if 'GPSImgDirection' in gps_data:
            gps_data['img_direction'] = float(gps_data['GPSImgDirection'])
            gps_data['img_direction_ref'] = gps_data.get('GPSImgDirectionRef', 'M')  # Magnetic

        # Extract destination bearing
        if 'GPSDestBearing' in gps_data:
            gps_data['dest_bearing'] = float(gps_data['GPSDestBearing'])
            gps_data['dest_bearing_ref'] = gps_data.get('GPSDestBearingRef', 'M')  # Magnetic

        # Extract horizontal positioning error
        if 'GPSHPositioningError' in gps_data:
            gps_data['h_positioning_error'] = float(gps_data['GPSHPositioningError'])

        return gps_data

    def convert_to_degrees(self, value: Tuple) -> float:
        """Convert GPS coordinates from degrees/minutes/seconds to decimal degrees."""
        degrees, minutes, seconds = value
        return float(degrees) + float(minutes) / 60.0 + float(seconds) / 3600.0

    def extract_timestamp(self, exif_dict: Dict) -> Optional[str]:
        """Extract timestamp from EXIF data."""
        # Try different timestamp fields
        timestamp_fields = ['DateTime', 'DateTimeOriginal', 'DateTimeDigitized']

        for field in timestamp_fields:
            if field in exif_dict:
                return str(exif_dict[field])

        return None

    def generate_image_id(self, image_path: Path) -> str:
        """Generate a unique ID for the image based on its path and modification time."""
        path_str = str(image_path.relative_to(self.root_folder))
        mtime = image_path.stat().st_mtime
        unique_string = f"{path_str}_{mtime}"
        return hashlib.md5(unique_string.encode()).hexdigest()

    def create_scaled_image(self, image_path: Path, image_id: str) -> None:
        """Create a scaled version of the image (max 2048x2048) and save it in images folder."""
        scaled_filename = f"{image_id}.jpg"
        scaled_path = self.images_dir / scaled_filename

        try:
            with Image.open(image_path) as img:
                # Convert to RGB if necessary (for PNG, etc.)
                if img.mode != 'RGB':
                    img = img.convert('RGB')

                # Scale image maintaining aspect ratio (max 2048x2048)
                img.thumbnail(self.MAX_IMAGE_SIZE, Image.Resampling.LANCZOS)

                # Save with optimization
                img.save(scaled_path, 'JPEG', quality=self.IMAGE_QUALITY, optimize=True)

        except Exception as e:
            print(f"Error creating scaled image for {image_path}: {e}")

    def create_thumbnail(self, image_path: Path, image_id: str) -> None:
        """Create an optimized thumbnail for the image."""
        thumbnail_filename = f"{image_id}.jpg"
        thumbnail_path = self.thumbnails_dir / thumbnail_filename

        try:
            with Image.open(image_path) as img:
                # Convert to RGB if necessary (for PNG, etc.)
                if img.mode != 'RGB':
                    img = img.convert('RGB')

                # Create thumbnail maintaining aspect ratio
                img.thumbnail(self.THUMBNAIL_SIZE, Image.Resampling.LANCZOS)

                # Save with optimization
                img.save(thumbnail_path, 'JPEG', quality=self.THUMBNAIL_QUALITY, optimize=True)

        except Exception as e:
            print(f"Error creating thumbnail for {image_path}: {e}")

    def create_database(self, images_data: List[Dict[str, Any]]) -> None:
        """Create SQLite database and insert image data."""
        print(f"\nCreating database: {self.db_path}")

        # Remove existing database
        if self.db_path.exists():
            self.db_path.unlink()

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Create table with comprehensive GPS fields (paths derived from ID)
        cursor.execute('''
            CREATE TABLE images (
                id TEXT PRIMARY KEY,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                timestamp TEXT,
                latitude_ref TEXT,
                longitude_ref TEXT,
                altitude_ref INTEGER,
                altitude REAL,
                speed_ref TEXT,
                speed REAL,
                img_direction_ref TEXT,
                img_direction REAL,
                dest_bearing_ref TEXT,
                dest_bearing REAL,
                h_positioning_error REAL
            )
        ''')

        # Create indexes for performance
        cursor.execute('CREATE INDEX idx_location ON images(latitude, longitude)')
        cursor.execute('CREATE INDEX idx_timestamp ON images(timestamp)')

        # Insert image data
        for image_data in images_data:
            cursor.execute('''
                INSERT INTO images (
                    id, latitude, longitude, timestamp,
                    latitude_ref, longitude_ref, altitude_ref, altitude,
                    speed_ref, speed, img_direction_ref, img_direction,
                    dest_bearing_ref, dest_bearing, h_positioning_error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                image_data['id'],
                image_data['latitude'],
                image_data['longitude'],
                image_data['timestamp'],
                image_data['latitude_ref'],
                image_data['longitude_ref'],
                image_data['altitude_ref'],
                image_data['altitude'],
                image_data['speed_ref'],
                image_data['speed'],
                image_data['img_direction_ref'],
                image_data['img_direction'],
                image_data['dest_bearing_ref'],
                image_data['dest_bearing'],
                image_data['h_positioning_error']
            ))

        conn.commit()
        conn.close()

        print(f"✓ Database created with {len(images_data)} images")

    def run(self) -> None:
        """Main execution method."""
        print("EXIF Extraction Script for Geo-Image Map Browser")
        print("=" * 50)

        if not self.root_folder.exists():
            print(f"Error: Folder '{self.root_folder}' does not exist")
            return

        # Scan for images and extract EXIF data
        images_data = self.scan_images()

        if not images_data:
            print("No images with GPS data found.")
            return

        # Create database
        self.create_database(images_data)

        print("\n" + "=" * 50)
        print("Processing complete!")
        print(f"Database: {self.db_path}")
        print(f"Scaled images: {self.images_dir}")
        print(f"Thumbnails: {self.thumbnails_dir}")
        print(f"Images processed: {len(images_data)}")


def main():
    """Main entry point."""
    if len(sys.argv) != 2:
        print("Usage: python extract_exif.py <image_folder_path>")
        print("Example: python extract_exif.py ./photos")
        sys.exit(1)

    folder_path = sys.argv[1]
    extractor = ExifExtractor(folder_path)
    extractor.run()


if __name__ == "__main__":
    main()
