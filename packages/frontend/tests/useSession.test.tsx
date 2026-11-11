import { renderHook, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';

type Me = { displayName: string; isAdmin: boolean };
const getMe = jest.fn<() => Promise<Me | null>>();
const logout = jest.fn<() => Promise<void>>();
const signInWithIdToken = jest.fn<(t: string) => Promise<Me | 'denied' | null>>();

const native = {
  isNativeApp: jest.fn<() => boolean>(),
  nativeSignIn: jest.fn<(silent: boolean) => Promise<string | null>>(),
  nativeHasSignedInBefore: jest.fn<() => Promise<boolean>>(),
};

jest.unstable_mockModule('../src/services/UploadClient', () => ({
  UploadClient: class {
    getMe = getMe;
    logout = logout;
    signInWithIdToken = signInWithIdToken;
  },
}));
jest.unstable_mockModule('../src/utils/native', () => native);

const { useSession } = await import('../src/hooks/useSession');

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

const ME: Me = { displayName: 'MH', isAdmin: true };

describe('useSession', () => {
  const unhandled = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    process.on('unhandledRejection', unhandled);
    native.isNativeApp.mockReturnValue(false);
    native.nativeHasSignedInBefore.mockResolvedValue(true);
    logout.mockResolvedValue();
  });

  afterEach(() => {
    process.off('unhandledRejection', unhandled);
  });

  it('is loading until getMe resolves, then exposes me (web)', async () => {
    getMe.mockResolvedValue(ME);
    const { result } = renderHook(() => useSession());
    expect(result.current.me).toBeUndefined();
    await waitFor(() => expect(result.current.me).toEqual(ME));
    expect(native.nativeSignIn).not.toHaveBeenCalled();
  });

  it('is null when signed out on web, without native sign-in', async () => {
    getMe.mockResolvedValue(null);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.me).toBeNull());
    expect(native.nativeSignIn).not.toHaveBeenCalled();
  });

  it('is null when getMe rejects', async () => {
    getMe.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.me).toBeNull());
  });

  describe('in the app', () => {
    beforeEach(() => {
      native.isNativeApp.mockReturnValue(true);
      getMe.mockResolvedValue(null);
    });

    it('renews silently when signed in before', async () => {
      native.nativeSignIn.mockResolvedValue('tok');
      signInWithIdToken.mockResolvedValue(ME);
      const { result } = renderHook(() => useSession());
      await waitFor(() => expect(result.current.me).toEqual(ME));
      expect(native.nativeSignIn).toHaveBeenCalledWith(true);
      expect(signInWithIdToken).toHaveBeenCalledWith('tok');
    });

    it('stays null when the server denies', async () => {
      native.nativeSignIn.mockResolvedValue('tok');
      signInWithIdToken.mockResolvedValue('denied');
      const { result } = renderHook(() => useSession());
      await waitFor(() => expect(signInWithIdToken).toHaveBeenCalled());
      await flush();
      expect(result.current.me).toBeNull();
    });

    it('stays null when nativeSignIn returns null', async () => {
      native.nativeSignIn.mockResolvedValue(null);
      const { result } = renderHook(() => useSession());
      await waitFor(() => expect(native.nativeSignIn).toHaveBeenCalled());
      await flush();
      expect(result.current.me).toBeNull();
      expect(signInWithIdToken).not.toHaveBeenCalled();
    });

    it('stays null when nativeSignIn throws', async () => {
      native.nativeSignIn.mockRejectedValue(new Error('boom'));
      const { result } = renderHook(() => useSession());
      await waitFor(() => expect(native.nativeSignIn).toHaveBeenCalled());
      await flush();
      expect(result.current.me).toBeNull();
      // Node reports unhandled rejections on a later tick.
      await new Promise((r) => setTimeout(r, 10));
      expect(unhandled).not.toHaveBeenCalled();
    });

    it('does not renew when never signed in before', async () => {
      native.nativeHasSignedInBefore.mockResolvedValue(false);
      const { result } = renderHook(() => useSession());
      await waitFor(() => expect(native.nativeHasSignedInBefore).toHaveBeenCalled());
      await flush();
      expect(result.current.me).toBeNull();
      expect(native.nativeSignIn).not.toHaveBeenCalled();
    });
  });

  it('signOut calls logout and clears me', async () => {
    getMe.mockResolvedValue(ME);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.me).toEqual(ME));
    await act(async () => {
      await result.current.signOut();
    });
    expect(logout).toHaveBeenCalled();
    expect(result.current.me).toBeNull();
  });
});
