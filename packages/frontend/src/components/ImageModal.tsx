import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ImageModalProps } from '../types';
import './ImageModal.css';
import SocialShare from './SocialShare';

const ImageModal: React.FC<ImageModalProps> = ({
  image,
  nearbyImages,
  isOpen,
  onClose,
  onNavigate
}) => {
  const modalTitleId = useId();
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Handle escape key press
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;

    switch (event.key) {
      case 'Escape':
        if (isExpanded) {
          setIsExpanded(false);
        } else {
          onClose();
        }
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
  }, [isOpen, isExpanded, onClose, onNavigate, nearbyImages.length]);

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

  // Touch event handlers for swipe navigation
  const handleTouchStart = (event: React.TouchEvent) => {
    if (!nearbyImages.length || nearbyImages.length <= 1) return;

    const touch = event.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setTouchEnd(null);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (!touchStart) return;

    const touch = event.touches[0];
    setTouchEnd({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd || nearbyImages.length <= 1) {
      setTouchStart(null);
      setTouchEnd(null);
      return;
    }

    const deltaX = touchStart.x - touchEnd.x;
    const deltaY = touchStart.y - touchEnd.y;
    const minSwipeDistance = 50;

    // Only trigger swipe if horizontal movement is greater than vertical
    // and the swipe distance is sufficient
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      if (deltaX > 0) {
        // Swiped left - go to next image
        onNavigate('next');
      } else {
        // Swiped right - go to previous image
        onNavigate('prev');
      }
    }

    setTouchStart(null);
    setTouchEnd(null);
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

  const handleImageClick = () => {
    setIsExpanded(!isExpanded);
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
      className={`image-modal-overlay ${isExpanded ? 'expanded' : ''}`}
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
          <i className="fas fa-times" aria-hidden="true"></i>
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
              <i className="fas fa-chevron-left" aria-hidden="true"></i>
            </button>
            <button
              className="modal-nav-button modal-nav-next"
              onClick={handleNext}
              aria-label="Next image"
              type="button"
            >
              <i className="fas fa-chevron-right" aria-hidden="true"></i>
            </button>
          </>
        )}

        {/* Image container */}
        <div className="image-modal-content">
          <div
            className="image-container"
            ref={imageContainerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={image.imageUrl}
              alt={`Taken on ${imageDate} at ${imageTime}`}
              className="modal-image"
              onClick={handleImageClick}
              onError={(e) => {
                // Fallback to thumbnail if full image fails to load
                const target = e.target as HTMLImageElement;
                if (target.src !== image.thumbnailUrl) {
                  target.src = image.thumbnailUrl;
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

            {/* Social sharing */}
            <SocialShare
              imageUrl={`/#/image/${image.id}`}
              imageTitle={`Photo taken on ${imageDate} at ${imageTime}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageModal;
