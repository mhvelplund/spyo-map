import { useEffect, useCallback, useId } from 'react';
import type { ImageModalProps } from '../types';
import './ImageModal.css';

const ImageModal: React.FC<ImageModalProps> = ({
  image,
  nearbyImages,
  isOpen,
  onClose,
  onNavigate
}) => {
  const modalTitleId = useId();
  // Handle escape key press
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;
    
    switch (event.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        if (nearbyImages.length > 1) {
          onNavigate('prev');
        }
        break;
      case 'ArrowRight':
        if (nearbyImages.length > 1) {
          onNavigate('next');
        }
        break;
    }
  }, [isOpen, onClose, onNavigate, nearbyImages.length]);

  // Add/remove event listeners
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  // Handle backdrop click
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  // Handle backdrop key press for accessibility
  const handleBackdropKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
      event.preventDefault();
      onClose();
    }
  };



  // Handle navigation
  const handlePrevious = () => {
    if (nearbyImages.length > 1) {
      onNavigate('prev');
    }
  };

  const handleNext = () => {
    if (nearbyImages.length > 1) {
      onNavigate('next');
    }
  };

  // Don't render if not open or no image
  if (!isOpen || !image) {
    return null;
  }

  const hasNavigation = nearbyImages.length > 1;
  const imageDate = new Date(image.timestamp).toLocaleDateString();
  const imageTime = new Date(image.timestamp).toLocaleTimeString();

  return (
    <div 
      className="image-modal-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
    >
      <div className="image-modal-container">
        {/* Close button */}
        <button
          className="modal-close-button"
          onClick={onClose}
          aria-label="Close image modal"
          type="button"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Navigation buttons */}
        {hasNavigation && (
          <>
            <button
              className="modal-nav-button modal-nav-prev"
              onClick={handlePrevious}
              aria-label="Previous image"
              type="button"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="15,18 9,12 15,6"></polyline>
              </svg>
            </button>
            <button
              className="modal-nav-button modal-nav-next"
              onClick={handleNext}
              aria-label="Next image"
              type="button"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="9,18 15,12 9,6"></polyline>
              </svg>
            </button>
          </>
        )}

        {/* Image container */}
        <div className="image-modal-content">
          <div className="image-container">
            <img
              src={image.path}
              alt={`Taken on ${imageDate} at ${imageTime}`}
              className="modal-image"
              onError={(e) => {
                // Fallback to thumbnail if full image fails to load
                const target = e.target as HTMLImageElement;
                if (target.src !== image.thumbnailPath) {
                  target.src = image.thumbnailPath;
                }
              }}
            />
          </div>

          {/* Image metadata */}
          <div className="image-metadata">
            <h2 id={modalTitleId} className="image-title">
              Photo taken on {imageDate}
            </h2>
            <div className="image-details">
              <span className="image-time">{imageTime}</span>
              {image.altitude && (
                <span className="image-altitude">
                  Altitude: {Math.round(image.altitude)}m
                </span>
              )}
              <span className="image-coordinates">
                {image.latitude.toFixed(6)}, {image.longitude.toFixed(6)}
              </span>
            </div>
            {hasNavigation && (
              <div className="navigation-info">
                {nearbyImages.length} nearby images
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageModal;