import { jest, describe, it, expect, afterEach } from '@jest/globals';
import { getPosition, hasGps } from '../src/utils/geolocation.js';

const g = globalThis as unknown as { matchMedia?: unknown; Capacitor?: unknown };
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const inApp = () => {
  g.Capacitor = { isNativePlatform: () => true, Plugins: { SpyoNative: {} } };
};

function setNavigator(value: unknown) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

afterEach(() => {
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
  delete g.matchMedia;
  delete g.Capacitor;
});

describe('hasGps', () => {
  const geolocation = { getCurrentPosition: jest.fn() };

  it('is false without navigator.geolocation', () => {
    setNavigator({});
    inApp();
    expect(hasGps()).toBe(false);
  });

  it('is true in the app', () => {
    setNavigator({ geolocation });
    inApp();
    expect(hasGps()).toBe(true);
  });

  it('is true in a touch browser', () => {
    setNavigator({ geolocation });
    g.matchMedia = (q: string) => ({ matches: q === '(pointer: coarse)' });
    expect(hasGps()).toBe(true);
  });

  it('is false in a desktop browser', () => {
    setNavigator({ geolocation });
    g.matchMedia = () => ({ matches: false });
    expect(hasGps()).toBe(false);
  });
});

describe('getPosition', () => {
  it('resolves with the coordinates', async () => {
    setNavigator({
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 1, longitude: 2 } }),
      },
    });
    expect(await getPosition()).toEqual({ latitude: 1, longitude: 2 });
  });

  it('resolves null when denied', async () => {
    setNavigator({
      geolocation: {
        getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => fail({ code: 1 }),
      },
    });
    expect(await getPosition()).toBeNull();
  });
});
