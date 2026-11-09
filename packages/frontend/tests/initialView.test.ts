import { describe, it, expect } from '@jest/globals';
import {
  MIN_VIEW_WIDTH_M,
  initialViewBounds,
  initialViewWidthMeters,
  squareBounds,
} from '../src/utils/initialView.js';
import { calculateHaversineDistance } from '../src/utils/distance.js';

const USER = { latitude: 55.676, longitude: 12.568 }; // Copenhagen
const offsetEast = (m: number) => ({
  latitude: USER.latitude,
  longitude: USER.longitude + m / (111_320 * Math.cos((USER.latitude * Math.PI) / 180)),
});

describe('initialViewWidthMeters', () => {
  it('is the minimum with no images', () => {
    expect(initialViewWidthMeters(USER, [])).toBe(MIN_VIEW_WIDTH_M);
  });

  it('is the minimum when the nearest image is close', () => {
    expect(initialViewWidthMeters(USER, [offsetEast(100), offsetEast(5000)])).toBe(MIN_VIEW_WIDTH_M);
  });

  it('widens to include the nearest image when it is far', () => {
    const width = initialViewWidthMeters(USER, [offsetEast(5000), offsetEast(1000)]);
    expect(width).toBeGreaterThan(2000);
    expect(width).toBeLessThan(2400);
  });
});

describe('squareBounds', () => {
  it('spans the requested size in both directions', () => {
    const [[s, w], [n, e]] = squareBounds(USER, 400);
    const widthKm = calculateHaversineDistance(USER.latitude, w, USER.latitude, e);
    const heightKm = calculateHaversineDistance(s, USER.longitude, n, USER.longitude);
    expect(widthKm).toBeCloseTo(0.4, 2);
    expect(heightKm).toBeCloseTo(0.4, 2);
  });
});

describe('initialViewBounds', () => {
  it('contains the nearest image', () => {
    const img = offsetEast(3000);
    const [[s, w], [n, e]] = initialViewBounds(USER, [img]);
    expect(img.longitude).toBeGreaterThan(w);
    expect(img.longitude).toBeLessThan(e);
    expect(USER.latitude).toBeGreaterThan(s);
    expect(USER.latitude).toBeLessThan(n);
  });
});
