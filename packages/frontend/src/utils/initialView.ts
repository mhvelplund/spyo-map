import type { GeoLocation } from '@spyo-map/shared';
import { calculateHaversineDistance } from './distance.js';

/** Narrowest initial view on a device with GPS. */
export const MIN_VIEW_WIDTH_M = 400;
/** Keeps the nearest image's marker off the very edge of the view. */
const EDGE_PADDING = 1.1;
const METERS_PER_DEGREE_LAT = 111_320;

export type Bounds = [[number, number], [number, number]];

/**
 * Width in meters of the initial view centered on `user`: wide enough to include the nearest image, never below
 * MIN_VIEW_WIDTH_M.
 */
export function initialViewWidthMeters(user: GeoLocation, images: readonly GeoLocation[]): number {
  let nearestKm = Infinity;
  for (const img of images) {
    nearestKm = Math.min(
      nearestKm,
      calculateHaversineDistance(user.latitude, user.longitude, img.latitude, img.longitude)
    );
  }
  if (!Number.isFinite(nearestKm)) return MIN_VIEW_WIDTH_M;
  return Math.max(MIN_VIEW_WIDTH_M, 2 * nearestKm * 1000 * EDGE_PADDING);
}

/** A square of `sizeM` meters per side centered on `center`, as Leaflet [[south, west], [north, east]] bounds. */
export function squareBounds(center: GeoLocation, sizeM: number): Bounds {
  const half = sizeM / 2;
  const dLat = half / METERS_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos((center.latitude * Math.PI) / 180), 1e-6);
  const dLng = half / (METERS_PER_DEGREE_LAT * cosLat);
  return [
    [center.latitude - dLat, center.longitude - dLng],
    [center.latitude + dLat, center.longitude + dLng],
  ];
}

/**
 * Initial bounds for a device at `user`. Fitting the map to this square makes the view at least as wide as
 * initialViewWidthMeters, so the nearest image is visible.
 */
export function initialViewBounds(user: GeoLocation, images: readonly GeoLocation[]): Bounds {
  return squareBounds(user, initialViewWidthMeters(user, images));
}
