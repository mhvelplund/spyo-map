import type React from 'react';
// Same lightbox toolbar look as Hide/Unhide.
import './VisibilityButton.css';

interface UngroupButtonProps {
  busy: boolean;
  onUngroup(): void;
}

/** Lightbox button that takes the open photo out of its group. Loaded lazily — only admins ever need it. */
const UngroupButton: React.FC<UngroupButtonProps> = ({ busy, onUngroup }) => (
  <button
    type="button"
    className="visibility-button"
    aria-label="Ungroup photo"
    disabled={busy}
    onClick={onUngroup}
  >
    Ungroup
  </button>
);

export default UngroupButton;
