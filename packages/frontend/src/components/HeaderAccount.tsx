import type React from 'react';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { MeResponse } from '@spyo-map/shared';
import { isNativeApp } from '../utils/native.js';
import './HeaderAccount.css';

interface HeaderAccountProps {
  me: MeResponse | null | undefined;
  onSignOut: () => Promise<void>;
}

const NOTICES: Record<string, string> = {
  denied: "This Google account isn't allowed to sign in.",
  error: 'Sign-in failed — please try again.',
};

const HeaderAccount: React.FC<HeaderAccountProps> = ({ me, onSignOut }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signin = params.get('signin');
  const signedIn = !!me;

  // A successful sign-in leaves nothing worth keeping in the URL.
  useEffect(() => {
    if (signedIn && signin) navigate({ search: '' }, { replace: true });
  }, [signedIn, signin, navigate]);

  if (me === undefined || isNativeApp()) return null;

  const notice = !signedIn && signin ? NOTICES[signin] : undefined;

  return (
    <>
      {me ? (
        <>
          <a className="header-btn" href="#/upload" title="Upload photos" aria-label="Upload photos">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 15V4" />
              <path d="M7 9l5-5 5 5" />
              <path d="M5 15v4h14v-4" />
            </svg>
          </a>
          <button
            type="button"
            className="header-btn"
            title={me.displayName}
            aria-label={`Sign out ${me.displayName}`}
            onClick={() => void onSignOut()}
          >
            <svg viewBox="0 0 24 24" fill="#fff" stroke="#fff" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
            </svg>
          </button>
        </>
      ) : (
        <a className="header-btn" href="/auth/login/google?return=map" title="Sign in" aria-label="Sign in">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
          </svg>
        </a>
      )}
      {notice && (
        <div className="header-notice" role="status">
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => navigate({ search: '' }, { replace: true })}>
            ×
          </button>
        </div>
      )}
    </>
  );
};

export default HeaderAccount;
