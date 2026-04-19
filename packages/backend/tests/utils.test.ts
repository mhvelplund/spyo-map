import { haversineKm } from '../src/utils.js';

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineKm(51.5, -0.12, 51.5, -0.12)).toBe(0);
  });

  it('calculates London to Paris within 5% of 340 km', () => {
    const dist = haversineKm(51.5074, -0.1278, 48.8566, 2.3522);
    expect(dist).toBeGreaterThan(323);
    expect(dist).toBeLessThan(357);
  });

  it('calculates approximately half Earth circumference for antipodal points', () => {
    const dist = haversineKm(0, 0, 0, 180);
    expect(dist).toBeGreaterThan(20000);
    expect(dist).toBeLessThan(20100);
  });
});
