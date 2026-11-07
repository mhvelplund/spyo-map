import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  isNativeApp,
  nativeSignIn,
  nativeSignOut,
  nativeHasSignedInBefore,
  nativePickPhotos,
  nativeSharedPhotos,
  onNativeShare,
} from '../src/utils/native.js';

const g = globalThis as unknown as { Capacitor?: unknown };

function codeError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

const plugin = {
  signIn: jest.fn<(o: { silent: boolean }) => Promise<{ idToken: string }>>(),
  signOut: jest.fn<() => Promise<void>>(),
  hasSignedInBefore: jest.fn<() => Promise<{ value: boolean }>>(),
  pickPhotos: jest.fn<() => Promise<{ photos: unknown[]; failed?: string[] }>>(),
  getSharedPhotos: jest.fn<() => Promise<{ photos: unknown[]; failed?: string[] }>>(),
  addListener: jest.fn<(e: string, cb: () => void) => unknown>(),
};

function install(withPlugin = true, native = true) {
  g.Capacitor = {
    isNativePlatform: () => native,
    Plugins: withPlugin ? { SpyoNative: plugin } : {},
  };
}

let fetchSpy: ReturnType<typeof jest.spyOn>;

beforeEach(() => {
  jest.clearAllMocks();
  install();
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/missing.jpg')) return new Response('nope', { status: 404 });
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]), { status: 200 });
  });
});

afterEach(() => {
  fetchSpy.mockRestore();
  delete g.Capacitor;
});

describe('isNativeApp', () => {
  it('is false without window.Capacitor', () => {
    delete g.Capacitor;
    expect(isNativeApp()).toBe(false);
  });
  it('is false when SpyoNative is missing', () => {
    install(false);
    expect(isNativeApp()).toBe(false);
  });
  it('is false on the web platform even with the plugin', () => {
    install(true, false);
    expect(isNativeApp()).toBe(false);
  });
  it('is true when native and SpyoNative is present', () => {
    expect(isNativeApp()).toBe(true);
  });
});

describe('nativeSignIn', () => {
  it('returns the token and passes silent through', async () => {
    plugin.signIn.mockResolvedValue({ idToken: 'tok' });
    expect(await nativeSignIn(true)).toBe('tok');
    expect(plugin.signIn).toHaveBeenCalledWith({ silent: true });
  });
  it.each(['CANCELED', 'NO_CREDENTIAL'])('returns null for %s', async (code) => {
    plugin.signIn.mockRejectedValue(codeError(code));
    expect(await nativeSignIn(false)).toBeNull();
  });
  it('rethrows FAILED', async () => {
    plugin.signIn.mockRejectedValue(codeError('FAILED'));
    await expect(nativeSignIn(false)).rejects.toThrow('FAILED');
  });
});

describe('sign-out and flag', () => {
  it('nativeSignOut calls the plugin', async () => {
    plugin.signOut.mockResolvedValue();
    await nativeSignOut();
    expect(plugin.signOut).toHaveBeenCalled();
  });
  it('nativeHasSignedInBefore unwraps value', async () => {
    plugin.hasSignedInBefore.mockResolvedValue({ value: true });
    expect(await nativeHasSignedInBefore()).toBe(true);
  });
});

describe('photos', () => {
  const photo = (name: string, webPath: string) => ({ name, mimeType: 'image/jpeg', size: 4, webPath });

  it('nativePickPhotos turns webPaths into Files with name and mimeType, and lists a 404 under failed', async () => {
    plugin.pickPhotos.mockResolvedValue({
      photos: [photo('a.jpg', 'https://app.test/_capacitor_file_/c/a.jpg'), photo('b.jpg', 'https://app.test/missing.jpg')],
    });
    const { files, failed } = await nativePickPhotos();
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('a.jpg');
    expect(files[0].type).toBe('image/jpeg');
    expect(files[0].size).toBe(4);
    expect(failed).toEqual(['b.jpg']);
  });

  it('a fetch that throws is listed under failed, others still returned', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('net'));
    plugin.getSharedPhotos.mockResolvedValue({
      photos: [photo('x.jpg', 'https://app.test/x.jpg'), photo('y.jpg', 'https://app.test/y.jpg')],
    });
    const { files, failed } = await nativeSharedPhotos();
    expect(files.map((f) => f.name)).toEqual(['y.jpg']);
    expect(failed).toEqual(['x.jpg']);
  });

  it('photos the app could not read are listed under failed alongside fetch failures', async () => {
    plugin.pickPhotos.mockResolvedValue({
      photos: [photo('a.jpg', 'https://app.test/a.jpg'), photo('b.jpg', 'https://app.test/missing.jpg')],
      failed: ['cloud.jpg'],
    });
    const { files, failed } = await nativePickPhotos();
    expect(files.map((f) => f.name)).toEqual(['a.jpg']);
    expect(failed).toEqual(['cloud.jpg', 'b.jpg']);
  });

  it('an empty pick returns nothing', async () => {
    plugin.pickPhotos.mockResolvedValue({ photos: [] });
    expect(await nativePickPhotos()).toEqual({ files: [], failed: [] });
  });
});

describe('onNativeShare', () => {
  it('works with the synchronous handle window.Capacitor.Plugins returns', () => {
    const remove = jest.fn<() => Promise<void>>().mockResolvedValue();
    plugin.addListener.mockReturnValue({ remove });
    const off = onNativeShare(jest.fn());
    expect(() => off()).not.toThrow();
    return Promise.resolve().then(() => expect(remove).toHaveBeenCalled());
  });

  it('subscribes to photosShared and the unsubscribe calls handle.remove()', async () => {
    const remove = jest.fn<() => Promise<void>>().mockResolvedValue();
    plugin.addListener.mockResolvedValue({ remove });
    const cb = jest.fn();
    const off = onNativeShare(cb);
    expect(plugin.addListener).toHaveBeenCalledWith('photosShared', cb);
    off();
    await Promise.resolve();
    await Promise.resolve();
    expect(remove).toHaveBeenCalled();
  });
});
