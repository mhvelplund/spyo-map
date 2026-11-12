import type React from 'react';
import type { ImageRecord } from '../../types';
import './VisibilityButton.css';

interface VisibilityButtonProps {
  image: ImageRecord;
  busy: boolean;
  onToggle(): void;
}

/** Lightbox Hide/Unhide toggle for admins. Loaded lazily — only admins ever need it. */
const VisibilityButton: React.FC<VisibilityButtonProps> = ({ image, busy, onToggle }) => {
  const label = image.hidden ? 'Unhide' : 'Hide';
  return (
    <button
      type="button"
      className="visibility-button"
      aria-label={`${label} photo`}
      disabled={busy}
      onClick={onToggle}
    >
      {label}
    </button>
  );
};

export default VisibilityButton;
