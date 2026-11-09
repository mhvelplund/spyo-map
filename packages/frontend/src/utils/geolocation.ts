import type { GeoLocation } from '@spyo-map/shared';
import { isNativeApp } from './native.js';

/**
 * True on devices that likely have GPS: the Android app, or a touch-first (phone/tablet) browser. Desktop browsers
 * only have IP-based location, which is too coarse to center a 400 m view on.
 */
export function hasGps(): boolean {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
  if (isNativeApp()) return true;
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** The device position, or null if unavailable, denied or too slow. */
export function getPosition(timeoutMs = 10_000): Promise<GeoLocation | null> {
  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 }
      );
    } catch {
      resolve(null);
    }
  });
}
