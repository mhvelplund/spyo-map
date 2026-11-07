import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { useSearchParams } from 'react-router';
import { REJECT_COPY, type MeResponse } from '@spyo-map/shared';
import { UploadClient, UPLOAD_FAILED_COPY } from '../services/UploadClient.js';
import { inspectFile } from '../utils/fileInspection.js';
import {
  isNativeApp,
  nativeHasSignedInBefore,
  nativePickPhotos,
  nativeSharedPhotos,
  nativeSignIn,
  nativeSignOut,
  onNativeShare,
  type NativeFiles,
} from '../utils/native.js';
import { runWithConcurrency } from '../utils/pool.js';
import { planBatch } from '../utils/uploadBatch.js';
import './UploadPage.css';

const client = new UploadClient();

type FileStatus = 'waiting' | 'uploading' | 'done';
interface Row {
  id: number;
  file: File;
  status: FileStatus;
}
interface AddedItem {
  id: number;
  file: File;
  url: string;
}
interface Rejected {
  id: number;
  file: File;
  reason: string;
}
interface Dup {
  id: number;
  file: File;
}

const isSignedOut = (e: unknown) => e instanceof Error && e.name === 'SignedOutError';

const UploadPage: React.FC = () => {
  const [params] = useSearchParams();
  const [me, setMe] = useState<MeResponse | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [added, setAdded] = useState<AddedItem[]>([]);
  const [duplicates, setDuplicates] = useState<Dup[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [busy, setBusy] = useState(false);
  const [inApp] = useState(isNativeApp);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<'denied' | 'error' | null>(null);
  const urls = useRef<string[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const silentSignIn = async () => {
      try {
        if (!(await nativeHasSignedInBefore())) return;
        const token = await nativeSignIn(true);
        if (!token || cancelled) return;
        const result = await client.signInWithIdToken(token);
        if (!cancelled && result !== 'denied') setMe(result);
      } catch {
        // Silent sign-in is best effort; the Sign in button stays available.
      }
    };
    client
      .getMe()
      .then((m) => {
        if (cancelled) return;
        setMe(m);
        if (m === null && inApp) void silentSignIn();
      })
      .catch(() => !cancelled && setMe(null));
    return () => {
      cancelled = true;
    };
  }, [inApp]);

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    },
    []
  );

  const clearResults = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    setAdded([]);
    setDuplicates([]);
    setRejected([]);
    setRows([]);
  };

  const handleFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (files.length === 0) return;
    setBusy(true);
    const addRejected = (file: File, reason: string) =>
      setRejected((r) => [...r, { id: nextId.current++, file, reason }]);
    const addDup = (file: File) => setDuplicates((d) => [...d, { id: nextId.current++, file }]);
    try {
      const inspected = await runWithConcurrency(files, 3, async (file) => ({
        file,
        inspection: await inspectFile(file),
      }));
      const hashes = inspected.flatMap((i) => (i.inspection.ok ? [i.inspection.sha256] : []));
      let known: Set<string>;
      try {
        known = new Set(hashes.length ? await client.checkHashes(hashes) : []);
      } catch (e) {
        if (isSignedOut(e)) throw e;
        // Check failed: keep local rejection reasons; only would-be uploads fail.
        const fallback = planBatch(inspected, new Set());
        fallback.rejected.forEach((r) => addRejected(r.file, r.reason));
        fallback.duplicates.forEach(addDup);
        fallback.toUpload.forEach((u) => addRejected(u.file, UPLOAD_FAILED_COPY));
        return;
      }
      const plan = planBatch(inspected, known);
      plan.rejected.forEach((r) => addRejected(r.file, r.reason));
      plan.duplicates.forEach(addDup);

      const queued = plan.toUpload.map((u) => ({ ...u, id: nextId.current++ }));
      setRows((r) => [...r, ...queued.map((q) => ({ id: q.id, file: q.file, status: 'waiting' as const }))]);
      const setStatus = (id: number, status: FileStatus) =>
        setRows((r) => r.map((row) => (row.id === id ? { ...row, status } : row)));

      let signedOut = false;
      await runWithConcurrency(queued, 3, async (q) => {
        if (signedOut) return;
        setStatus(q.id, 'uploading');
        try {
          const outcome = await client.uploadFile(q.file, q.sha256);
          if (outcome.status === 'rejected') {
            addRejected(q.file, outcome.reason);
          } else if (outcome.status === 'added') {
            const url = URL.createObjectURL(q.file);
            urls.current.push(url);
            setAdded((a) => [...a, { id: q.id, file: q.file, url }]);
          } else {
            addDup(q.file);
          }
        } catch (e) {
          if (isSignedOut(e)) {
            signedOut = true;
            setMe(null);
          } else {
            addRejected(q.file, UPLOAD_FAILED_COPY);
          }
        }
        setStatus(q.id, 'done');
      });
    } catch (e) {
      if (isSignedOut(e)) setMe(null);
      else files.forEach((f) => addRejected(f, UPLOAD_FAILED_COPY));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleNative = useCallback(
    async ({ files, failed }: NativeFiles) => {
      failed.forEach((name) =>
        setRejected((r) => [...r, { id: nextId.current++, file: new File([], name), reason: UPLOAD_FAILED_COPY }])
      );
      await handleFiles(files);
    },
    [handleFiles]
  );

  const signedIn = me !== null && me !== undefined;
  useEffect(() => {
    if (!inApp || !signedIn) return;
    const drain = () => {
      nativeSharedPhotos()
        .then(handleNative)
        .catch(() => {});
    };
    drain();
    return onNativeShare(drain);
  }, [inApp, signedIn, handleNative]);

  const onNativeSignIn = async () => {
    setSigningIn(true);
    setSignInError(null);
    try {
      const token = await nativeSignIn(false);
      if (!token) return;
      const result = await client.signInWithIdToken(token);
      if (result === 'denied') setSignInError('denied');
      else setMe(result);
    } catch {
      setSignInError('error');
    } finally {
      setSigningIn(false);
    }
  };

  const onNativePick = async () => {
    try {
      await handleNative(await nativePickPhotos());
    } catch {
      // Picker failed to open; nothing was selected.
    }
  };

  const shownReason = (reason: string) =>
    inApp && reason === REJECT_COPY.noGps ? REJECT_COPY.noGpsInApp : reason;

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    void handleFiles(e.dataTransfer.files);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => e.preventDefault();
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files ?? []);
    e.target.value = '';
  };

  const onLogout = async () => {
    try {
      if (inApp) await nativeSignOut().catch(() => {});
      await client.logout();
    } catch {
      // Network failure: still drop local signed-in state.
    } finally {
      clearResults();
      setMe(null);
    }
  };

  if (me === undefined) {
    return (
      <div className="upload-page">
        <p>Loading…</p>
      </div>
    );
  }

  if (me === null) {
    return (
      <div className="upload-page">
        <h1>Upload</h1>
        {(params.get('denied') === '1' || signInError === 'denied') && (
          <p role="alert">This account is not allowed to upload.</p>
        )}
        {(params.get('error') === '1' || signInError === 'error') && (
          <p role="alert">Sign-in failed. Please try again.</p>
        )}
        {inApp ? (
          <button
            type="button"
            className="upload-button"
            onClick={() => void onNativeSignIn()}
            disabled={signingIn}
          >
            Sign in with Google
          </button>
        ) : (
          <a className="upload-button" href="/auth/login/google">
            Sign in with Google
          </a>
        )}
        <p>
          <a href="/privacy.html">Privacy</a>
        </p>
      </div>
    );
  }

  const hasResults = added.length + duplicates.length + rejected.length > 0;
  return (
    <div className="upload-page">
      <header className="upload-header">
        <h1>Upload</h1>
        <span>
          Signed in as <strong>{me.displayName}</strong>
        </span>
        <button type="button" onClick={() => void onLogout()}>
          Log out
        </button>
      </header>
      <p className="upload-notice">Photos showing faces or licence plates will be removed.</p>
      {inApp ? (
        <div className="upload-drop">
          <p>Choose JPEG or TIFF photos with location data.</p>
          <button type="button" className="upload-button" onClick={() => void onNativePick()} disabled={busy}>
            Choose photos
          </button>
        </div>
      ) : (
        <div className="upload-drop" onDragOver={onDragOver} onDrop={onDrop}>
          <p>Drop JPEG or TIFF photos with location data here, or choose files.</p>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/tiff"
            aria-label="Choose photos"
            onChange={onPick}
            disabled={busy}
          />
        </div>
      )}

      {rows.length > 0 && (
        <ul className="upload-progress" aria-label="Progress">
          {rows.map((r) => (
            <li key={r.id}>
              {r.file.name} — {r.status}
            </li>
          ))}
        </ul>
      )}

      {hasResults && (
        <button type="button" onClick={clearResults} disabled={busy}>
          Clear results
        </button>
      )}

      {added.length > 0 && (
        <section aria-label="Added">
          <h2>Added</h2>
          <ul className="upload-added">
            {added.map((a) => (
              <li key={a.id}>
                <img src={a.url} alt="" />
                <span>{a.file.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {duplicates.length > 0 && (
        <section aria-label="Duplicates skipped">
          <h2>Duplicates skipped</h2>
          <ul>
            {duplicates.map((d) => (
              <li key={d.id}>{d.file.name}</li>
            ))}
          </ul>
        </section>
      )}
      {rejected.length > 0 && (
        <section aria-label="Rejected">
          <h2>Rejected</h2>
          <ul>
            {rejected.map((r) => (
              <li key={r.id}>
                {r.file.name} — {shownReason(r.reason)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default UploadPage;
