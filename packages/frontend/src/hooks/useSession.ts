import { useCallback, useEffect, useState } from 'react';
import type { MeResponse } from '@spyo-map/shared';
import { UploadClient } from '../services/UploadClient.js';
import { isNativeApp, nativeHasSignedInBefore, nativeSignIn } from '../utils/native.js';

const client = new UploadClient();

export interface SessionState {
  /** undefined while loading, null when signed out. */
  me: MeResponse | null | undefined;
  signOut(): Promise<void>;
}

export function useSession(): SessionState {
  const [me, setMe] = useState<MeResponse | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const silentSignIn = async () => {
      try {
        if (!(await nativeHasSignedInBefore())) return;
        const token = await nativeSignIn(true);
        if (!token || cancelled) return;
        const result = await client.signInWithIdToken(token);
        if (!cancelled && result && result !== 'denied') setMe(result);
      } catch {
        // Silent renewal is best effort; stay signed out without UI.
      }
    };
    client
      .getMe()
      .then((m) => {
        if (cancelled) return;
        setMe(m);
        if (m === null && isNativeApp()) void silentSignIn();
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await client.logout();
    } finally {
      setMe(null);
    }
  }, []);

  return { me, signOut };
}
