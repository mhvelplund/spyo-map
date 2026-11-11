import type React from 'react';
import './MoveAccept.css';

interface MoveAcceptProps {
  saving: boolean;
  onAccept(): void;
}

/** Green check FAB that saves an admin's pending marker move. Loaded lazily — only admins ever need it. */
const MoveAccept: React.FC<MoveAcceptProps> = ({ saving, onAccept }) => (
  <button
    type="button"
    className="fab move-accept"
    aria-label="Save new position"
    disabled={saving}
    onClick={onAccept}
  >
    <svg className="move-accept-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.8"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </button>
);

export default MoveAccept;
