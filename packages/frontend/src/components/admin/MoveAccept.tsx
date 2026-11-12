import type React from 'react';
import './MoveAccept.css';

interface MoveAcceptProps {
  /** `group`: the drop landed on another marker, so accepting groups the photos instead of moving one. */
  variant?: 'move' | 'group';
  saving: boolean;
  onAccept(): void;
}

/** Green FAB that saves an admin's pending marker move or grouping. Loaded lazily — only admins ever need it. */
const MoveAccept: React.FC<MoveAcceptProps> = ({ variant = 'move', saving, onAccept }) => (
  <button
    type="button"
    className="app-fab move-accept"
    aria-label={variant === 'group' ? 'Group photos' : 'Save new position'}
    disabled={saving}
    onClick={onAccept}
  >
    <svg className="move-accept-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {variant === 'group' ? (
        // Chain link
        <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"
          fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.8"
          strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  </button>
);

export default MoveAccept;
