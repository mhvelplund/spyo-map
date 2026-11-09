import { jest, describe, it, expect, afterEach } from '@jest/globals';
import { getPosition, hasGps, watchPosition } from '../src/utils/geolocation.js';

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

describe('watchPosition', () => {
  it('reports each position and clears the watch on stop', () => {
    const clearWatch = jest.fn();
    let report: (p: unknown) => void = () => {};
    setNavigator({
      geolocation: {
        watchPosition: (ok: (p: unknown) => void) => {
          report = ok;
          return 7;
        },
        clearWatch,
      },
    });
    const onChange = jest.fn();
    const stop = watchPosition(onChange);
    report({ coords: { latitude: 1, longitude: 2 } });
    report({ coords: { latitude: 3, longitude: 4 } });
    expect(onChange.mock.calls).toEqual([[{ latitude: 1, longitude: 2 }], [{ latitude: 3, longitude: 4 }]]);
    stop();
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('is a no-op without geolocation', () => {
    setNavigator({});
    const onChange = jest.fn();
    expect(() => watchPosition(onChange)()).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
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
