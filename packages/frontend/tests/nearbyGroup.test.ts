import { describe, it, expect } from '@jest/globals';
import type { ImageRecord } from '@spyo-map/shared';
import { computeNearbyGroup } from '../src/utils/nearbyGroup.js';

function makeImage(id: string, lat: number, lng: number): ImageRecord {
  return {
    id,
    imageUrl: `http://test/images/${id}.jpg`,
    thumbnailUrl: `http://test/images/thumbnails/${id}.jpg`,
    latitude: lat,
    longitude: lng,
    timestamp: '2024-01-01T00:00:00.000Z',
  };
}

// London, roughly 0.5 km east of origin
const ORIGIN = makeImage('origin', 51.5, -0.12);
const NEAR   = makeImage('near',   51.5, -0.113);  // ~0.5 km
const FAR    = makeImage('far',    52.0,  1.0);    // ~120 km

describe('computeNearbyGroup', () => {
  it('returns selected image first', () => {
    const group = computeNearbyGroup(ORIGIN, [ORIGIN, NEAR, FAR]);
    expect(group[0].id).toBe('origin');
  });

  it('includes images within 1 km', () => {
    const group = computeNearbyGroup(ORIGIN, [ORIGIN, NEAR, FAR]);
    expect(group.map(i => i.id)).toContain('near');
  });

  it('excludes images beyond 1 km', () => {
    const group = computeNearbyGroup(ORIGIN, [ORIGIN, NEAR, FAR]);
    expect(group.map(i => i.id)).not.toContain('far');
  });

  it('does not duplicate selected image', () => {
    const group = computeNearbyGroup(ORIGIN, [ORIGIN, NEAR, FAR]);
    expect(group.filter(i => i.id === 'origin')).toHaveLength(1);
  });

  it('returns only selected image when nothing nearby', () => {
    const group = computeNearbyGroup(FAR, [FAR, ORIGIN, NEAR]);
    expect(group).toHaveLength(1);
    expect(group[0].id).toBe('far');
  });

  it('sorts nearby images by distance ascending after the selected image', () => {
    const MED = makeImage('med', 51.5, -0.116); // between NEAR and ORIGIN
    const group = computeNearbyGroup(ORIGIN, [ORIGIN, NEAR, MED, FAR]);
    expect(group[0].id).toBe('origin');
    // MED is closer to ORIGIN than NEAR
    expect(group[1].id).toBe('med');
    expect(group[2].id).toBe('near');
  });

  it('uses custom radius when provided', () => {
    const group = computeNearbyGroup(ORIGIN, [ORIGIN, NEAR, FAR], 200);
    expect(group.map(i => i.id)).toContain('far');
  });

  it('returns only selected image when allImages is empty', () => {
    const group = computeNearbyGroup(ORIGIN, []);
    expect(group).toHaveLength(1);
    expect(group[0].id).toBe('origin');
  });

  it('works when selected is not present in allImages', () => {
    const group = computeNearbyGroup(ORIGIN, [NEAR, FAR]);
    expect(group[0].id).toBe('origin');
    expect(group.map(i => i.id)).toContain('near');
    expect(group.map(i => i.id)).not.toContain('far');
  });
});
