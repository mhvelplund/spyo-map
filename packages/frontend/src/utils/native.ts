/**
 * Bridge to the Spyo Map Android app (spyo-map-mobile). The app loads this site in a Capacitor WebView and injects
 * `window.Capacitor` with the `SpyoNative` plugin; in a normal browser none of this exists and isNativeApp() is false.
 *
 * Keep these types in sync with spyo-map-mobile/src/definitions.ts (the source of truth).
 */

export interface PickedPhoto {
  name: string;
  mimeType: string;
  size: number;
  /** Same-origin URL the page can fetch(). */
  webPath: string;
}

export interface SpyoNativePlugin {
  /** Rejects with code 'CANCELED' | 'NO_CREDENTIAL' | 'FAILED'. */
  signIn(options: { silent: boolean }): Promise<{ idToken: string }>;
  signOut(): Promise<void>;
  hasSignedInBefore(): Promise<{ value: boolean }>;
  /** Resolves with [] when the user cancels. */
  pickPhotos(): Promise<{ photos: PickedPhoto[] }>;
  /** Drains the pending share queue. */
  getSharedPhotos(): Promise<{ photos: PickedPhoto[] }>;
  addListener(event: 'photosShared', cb: () => void): Promise<{ remove(): Promise<void> }>;
}

interface CapacitorGlobal {
  isNativePlatform(): boolean;
  Plugins: { SpyoNative?: SpyoNativePlugin };
}

export interface NativeFiles {
  files: File[];
  /** Names of photos the page could not read. */
  failed: string[];
}

function plugin(): SpyoNativePlugin | null {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.SpyoNative ?? null;
}

function requirePlugin(): SpyoNativePlugin {
  const p = plugin();
  if (!p) throw new Error('Not running in the Spyo Map app');
  return p;
}

export function isNativeApp(): boolean {
  return plugin() !== null;
}

/** The Google ID token, or null when the user cancelled or (silent) no authorized account exists. */
export async function nativeSignIn(silent: boolean): Promise<string | null> {
  try {
    return (await requirePlugin().signIn({ silent })).idToken;
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    if (code === 'CANCELED' || code === 'NO_CREDENTIAL') return null;
    throw e;
  }
}

export async function nativeSignOut(): Promise<void> {
  await requirePlugin().signOut();
}

export async function nativeHasSignedInBefore(): Promise<boolean> {
  return (await requirePlugin().hasSignedInBefore()).value;
}

async function toFiles(photos: PickedPhoto[]): Promise<NativeFiles> {
  const result: NativeFiles = { files: [], failed: [] };
  const read = await Promise.all(
    photos.map(async (p) => {
      try {
        const res = await fetch(p.webPath);
        if (!res.ok) return null;
        return new File([await res.blob()], p.name, { type: p.mimeType });
      } catch {
        return null;
      }
    })
  );
  read.forEach((file, i) => (file ? result.files.push(file) : result.failed.push(photos[i].name)));
  return result;
}

export async function nativePickPhotos(): Promise<NativeFiles> {
  return toFiles((await requirePlugin().pickPhotos()).photos);
}

export async function nativeSharedPhotos(): Promise<NativeFiles> {
  return toFiles((await requirePlugin().getSharedPhotos()).photos);
}

/** Calls cb whenever photos are shared to the app; returns an unsubscribe. */
export function onNativeShare(cb: () => void): () => void {
  const handle = requirePlugin().addListener('photosShared', cb);
  return () => {
    void handle.then((h) => h.remove());
  };
}
