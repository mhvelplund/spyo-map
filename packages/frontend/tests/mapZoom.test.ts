import { describe, it, expect } from '@jest/globals';
import { MAP_MAX_ZOOM, TILE_MAX_NATIVE_ZOOM } from '../src/utils/mapZoom';

describe('map zoom limits', () => {
  it('uses the deepest zoom OSM serves tiles for', () => {
    expect(TILE_MAX_NATIVE_ZOOM).toBe(19);
  });

  it("lets the map zoom past the tile limit (Leaflet's TileLayer default of 18 would cap it)", () => {
    expect(MAP_MAX_ZOOM).toBeGreaterThan(TILE_MAX_NATIVE_ZOOM);
  });
});
