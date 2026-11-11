import type { ImageRecord } from '../types/index.js';
import { computeNearbyGroup } from './nearbyGroup.js';

export interface CollapsedImages {
  /** Ungrouped images plus one representative per group. */
  markers: ImageRecord[];
  /** Member count keyed by marker id; only for groups with 2+ received members. */
  counts: Map<string, number>;
}

export const DROP_RADIUS_PX = 30;

function compareMembers(a: ImageRecord, b: ImageRecord): number {
  const ta = a.groupedAt ?? '';
  const tb = b.groupedAt ?? '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Collapse each group to its representative: the member with the smallest (groupedAt, id). */
export function collapseGroups(images: ImageRecord[]): CollapsedImages {
  const reps = new Map<string, ImageRecord>();
  const sizes = new Map<string, number>();
  for (const img of images) {
    if (!img.groupId) continue;
    sizes.set(img.groupId, (sizes.get(img.groupId) ?? 0) + 1);
    const rep = reps.get(img.groupId);
    if (!rep || compareMembers(img, rep) < 0) reps.set(img.groupId, img);
  }
  const markers = images.filter(img => !img.groupId || reps.get(img.groupId) === img);
  const counts = new Map<string, number>();
  for (const [groupId, rep] of reps) {
    const size = sizes.get(groupId) ?? 0;
    if (size >= 2) counts.set(rep.id, size);
  }
  return { markers, counts };
}

/** All members of the image's group (including itself) ordered by (groupedAt, id); [] when ungrouped. */
export function groupMembers(image: ImageRecord, images: ImageRecord[]): ImageRecord[] {
  if (!image.groupId) return [];
  return images.filter(img => img.groupId === image.groupId).sort(compareMembers);
}

/** Selected first, then other group members, then nearby non-members; no duplicates. */
export function lightboxOrder(
  selected: ImageRecord,
  images: ImageRecord[],
  radiusKm = 1,
): ImageRecord[] {
  const nearby = computeNearbyGroup(selected, images, radiusKm);
  const members = groupMembers(selected, images).filter(m => m.id !== selected.id);
  if (members.length === 0) return nearby;
  const seen = new Set<string>([selected.id, ...members.map(m => m.id)]);
  return [selected, ...members, ...nearby.filter(n => !seen.has(n.id))];
}

export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

/** Nearest candidate within DROP_RADIUS_PX of the point, excluding the dragged marker. */
export function findDropTarget(
  point: { x: number; y: number },
  candidates: ScreenPoint[],
  draggedId: string,
): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (c.id === draggedId) continue;
    const d = Math.hypot(c.x - point.x, c.y - point.y);
    if (d <= DROP_RADIUS_PX && d < bestDist) {
      best = c.id;
      bestDist = d;
    }
  }
  return best;
}
