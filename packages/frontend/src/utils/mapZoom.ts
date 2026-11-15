/** Deepest zoom OpenStreetMap serves tiles for; beyond it Leaflet upscales the z19 tiles. */
export const TILE_MAX_NATIVE_ZOOM = 19;

/** How far the map can zoom in. Past the native tile zoom, so nearby markers can be pulled apart on small screens. */
export const MAP_MAX_ZOOM = 22;
