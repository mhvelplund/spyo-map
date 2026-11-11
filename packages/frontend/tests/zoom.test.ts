import { describe, it, expect } from '@jest/globals';
import {
  IDENTITY,
  MAX_SCALE,
  clampPan,
  clampScale,
  isZoomed,
  pan,
  pinch,
  toggleZoom,
  zoomAt,
} from '../src/utils/zoom';

describe('zoom math', () => {
  it('clamps scale to 1..5', () => {
    expect(clampScale(0.3)).toBe(1);
    expect(clampScale(9)).toBe(MAX_SCALE);
    expect(clampScale(2)).toBe(2);
  });

  it('keeps the focus point fixed when zooming', () => {
    const focus = { x: 40, y: -20 };
    const next = zoomAt(IDENTITY, focus, 2);
    // The image point under the focus before zooming (40,-20) maps back to the focus afterwards.
    expect(next.x + 40 * next.scale).toBeCloseTo(focus.x);
    expect(next.y + -20 * next.scale).toBeCloseTo(focus.y);
  });

  it('snaps to identity when zoomed all the way out', () => {
    expect(zoomAt({ scale: 3, x: 50, y: 50 }, { x: 0, y: 0 }, 0.5)).toEqual(IDENTITY);
  });

  it('scales by the finger-distance ratio and follows the midpoint during a pinch', () => {
    const next = pinch(IDENTITY, { x: 0, y: 0 }, 100, { x: 30, y: 10 }, 300);
    expect(next.scale).toBe(3);
    expect(next.x).toBeCloseTo(30);
    expect(next.y).toBeCloseTo(10);
  });

  it('ignores a degenerate pinch start', () => {
    expect(pinch(IDENTITY, { x: 0, y: 0 }, 0, { x: 0, y: 0 }, 50)).toBe(IDENTITY);
  });

  it('toggles between 1x and 2.5x around the tap', () => {
    const zoomed = toggleZoom(IDENTITY, { x: 10, y: 0 });
    expect(zoomed.scale).toBe(2.5);
    expect(zoomed.x).toBeCloseTo(10 - 10 * 2.5);
    expect(isZoomed(zoomed)).toBe(true);
    expect(toggleZoom(zoomed, { x: 0, y: 0 })).toEqual(IDENTITY);
  });

  it('pans by the given delta', () => {
    expect(pan({ scale: 2, x: 1, y: 2 }, 5, -3)).toEqual({ scale: 2, x: 6, y: -1 });
  });

  it('limits panning to the overflowing part of the image', () => {
    const container = { width: 400, height: 300 };
    const content = { width: 400, height: 200 };
    // At 2x the image is 800x400: up to 200px of horizontal and 50px of vertical travel.
    expect(clampPan({ scale: 2, x: 999, y: -999 }, container, content)).toEqual({ scale: 2, x: 200, y: -50 });
    // At 1x nothing overflows, so the image stays centred.
    expect(clampPan({ scale: 1, x: 30, y: 30 }, container, content)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
