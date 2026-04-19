import type { ImageRecord } from '../types/index.js';
import { calculateHaversineDistance } from './distance.js';

/**
 * Compute the navigation group for a modal open session.
 * Returns an array with `selected` first, followed by all images within
 * `radiusKm` kilometres sorted by distance ascending.
 * The group is locked for the duration of the modal session — it must NOT
 * be recomputed on prev/next navigation.
 */
export function computeNearbyGroup(
  selected: ImageRecord,
  allImages: ImageRecord[],
  radiusKm = 1,
): ImageRecord[] {
  const nearby = allImages
    .filter(img => img.id !== selected.id)
    .map(img => ({
      image: img,
      distance: calculateHaversineDistance(
        selected.latitude,
        selected.longitude,
        img.latitude,
        img.longitude,
      ),
    }))
    .filter(item => item.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .map(item => item.image);

  return [selected, ...nearby];
}
