import initSqlJs, { type Database } from 'sql.js';
import type { ImageRecord } from '../types';
import { calculateHaversineDistance } from '../utils/distance';

export class DatabaseService {
  private db: Database | null = null;
  private isInitialized = false;

  /**
   * Initialize the SQL.js library and load the database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize SQL.js
      const SQL = await initSqlJs({
        locateFile: (file) => `https://sql.js.org/dist/${file}`
      });

      // Load the database file
      const response = await fetch('/images.db');
      if (!response.ok) {
        throw new Error(`Failed to load database: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      this.db = new SQL.Database(new Uint8Array(buffer));
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw new Error('Database initialization failed');
    }
  }

  /**
   * Ensure database is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Load all images from the database
   */
  async loadImages(): Promise<ImageRecord[]> {
    await this.ensureInitialized();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT
          id,
          latitude,
          longitude,
          timestamp,
          latitude_ref as latitudeRef,
          longitude_ref as longitudeRef,
          altitude_ref as altitudeRef,
          altitude,
          speed_ref as speedRef,
          speed,
          img_direction_ref as imgDirectionRef,
          img_direction as imgDirection,
          dest_bearing_ref as destBearingRef,
          dest_bearing as destBearing,
          h_positioning_error as hPositioningError
        FROM images
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        ORDER BY timestamp DESC
      `);

      const images: ImageRecord[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        images.push(this.mapRowToImageRecord(row));
      }
      stmt.free();

      return images;
    } catch (error) {
      console.error('Failed to load images:', error);
      throw new Error('Failed to load images from database');
    }
  }

  /**
   * Get a specific image by ID
   */
  async getImageById(id: string): Promise<ImageRecord | null> {
    await this.ensureInitialized();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT
          id,
          latitude,
          longitude,
          timestamp,
          latitude_ref as latitudeRef,
          longitude_ref as longitudeRef,
          altitude_ref as altitudeRef,
          altitude,
          speed_ref as speedRef,
          speed,
          img_direction_ref as imgDirectionRef,
          img_direction as imgDirection,
          dest_bearing_ref as destBearingRef,
          dest_bearing as destBearing,
          h_positioning_error as hPositioningError
        FROM images
        WHERE id = ?
      `);

      stmt.bind([id]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return this.mapRowToImageRecord(row);
      }

      stmt.free();
      return null;
    } catch (error) {
      console.error('Failed to get image by ID:', error);
      throw new Error(`Failed to get image with ID: ${id}`);
    }
  }

  /**
   * Find images within a specified radius of a given location
   */
  async getNearbyImages(lat: number, lng: number, radiusKm: number = 1): Promise<ImageRecord[]> {
    await this.ensureInitialized();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT
          id,
          latitude,
          longitude,
          timestamp,
          latitude_ref as latitudeRef,
          longitude_ref as longitudeRef,
          altitude_ref as altitudeRef,
          altitude,
          speed_ref as speedRef,
          speed,
          img_direction_ref as imgDirectionRef,
          img_direction as imgDirection,
          dest_bearing_ref as destBearingRef,
          dest_bearing as destBearing,
          h_positioning_error as hPositioningError
        FROM images
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      `);

      const images: ImageRecord[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const image = this.mapRowToImageRecord(row);

        // Calculate distance using haversine formula
        const distance = calculateHaversineDistance(
          lat, lng,
          image.latitude, image.longitude
        );

        if (distance <= radiusKm) {
          images.push(image);
        }
      }
      stmt.free();

      // Sort by distance (closest first)
      images.sort((a, b) => {
        const distanceA = calculateHaversineDistance(lat, lng, a.latitude, a.longitude);
        const distanceB = calculateHaversineDistance(lat, lng, b.latitude, b.longitude);
        return distanceA - distanceB;
      });

      return images;
    } catch (error) {
      console.error('Failed to get nearby images:', error);
      throw new Error('Failed to get nearby images');
    }
  }



  /**
   * Map database row to ImageRecord interface
   */
  private mapRowToImageRecord(row: Record<string, unknown>): ImageRecord {
    const id = row.id as string;
    return {
      id,
      path: `/images/${id}.jpg`,
      thumbnailPath: `/images/thumbnails/${id}.jpg`,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      timestamp: row.timestamp as string,
      latitudeRef: row.latitudeRef as string | undefined,
      longitudeRef: row.longitudeRef as string | undefined,
      altitudeRef: row.altitudeRef as string | undefined,
      altitude: row.altitude as number | undefined,
      speedRef: row.speedRef as string | undefined,
      speed: row.speed as number | undefined,
      imgDirectionRef: row.imgDirectionRef as string | undefined,
      imgDirection: row.imgDirection as number | undefined,
      destBearingRef: row.destBearingRef as string | undefined,
      destBearing: row.destBearing as number | undefined,
      hPositioningError: row.hPositioningError as number | undefined,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }
}

// Export a singleton instance
export const databaseService = new DatabaseService();
