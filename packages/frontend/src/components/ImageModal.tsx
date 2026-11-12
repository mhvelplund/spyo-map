import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ImageModalProps } from '../types';
import { useZoomPan } from '../hooks/useZoomPan';
import { toTransform } from '../utils/zoom';
import './ImageModal.css';
import SocialShare from './SocialShare';

/** Frontend-only extension: React types stay out of the shared package. */
export interface LightboxProps extends ImageModalProps {
  /** Admin controls (e.g. Hide/Unhide) rendered in the lightbox toolbar; ImageModal itself has no admin logic. */
  adminActions?: React.ReactNode;
}

const ImageModal: React.FC<LightboxProps> = ({
  image,
  nearbyImages,
  isOpen,
  onClose,
  onNavigate,
  adminActions,
  // onImageNavigated prop is accepted but not currently used by this component.
  // It's called by MapPage when navigation occurs to trigger map recentering.
}) => {
  const modalTitleId = useId();
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  // Set once a touch gesture has used more than one finger (a pinch), so it never counts as a swipe.
  const multiTouchRef = useRef(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Pinch/double-tap/wheel zoom, only in the expanded view. A single tap there collapses it.
  const zoom = useZoomPan({
    enabled: isOpen && isExpanded,
    resetKey: image?.id,
    containerRef: imageContainerRef,
    contentRef: imageRef,
    onSingleTap: () => setIsExpanded(false),
  });

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
  // Swipes only navigate at 1x with a single finger; while zoomed, dragging pans instead.
  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length > 1) multiTouchRef.current = true;
    if (multiTouchRef.current || zoom.zoomed) {
      setTouchStart(null);
      setTouchEnd(null);
      return;
    }
    if (!nearbyImages.length || nearbyImages.length <= 1) return;

    const touch = event.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setTouchEnd(null);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length > 1) multiTouchRef.current = true;
    if (!touchStart) return;

    const touch = event.touches[0];
    setTouchEnd({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    const wasMultiTouch = multiTouchRef.current;
    if (event.touches.length === 0) multiTouchRef.current = false;

    if (!touchStart || !touchEnd || nearbyImages.length <= 1 || wasMultiTouch || zoom.zoomed) {
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

  // Expands the lightbox. Collapsing is a single tap handled by useZoomPan, so it can tell taps from double taps.
  const handleImageClick = () => {
    if (!isExpanded) setIsExpanded(true);
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
            {...zoom.handlers}
          >
            <img
              ref={imageRef}
              src={image.imageUrl}
              alt={`Taken on ${imageDate} at ${imageTime}`}
              className={`modal-image${zoom.gesturing ? ' gesturing' : ''}${zoom.zoomed ? ' zoomed' : ''}`}
              style={isExpanded ? { transform: toTransform(zoom.state) } : undefined}
              draggable={false}
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
              {image.hidden && <span className="image-hidden-label">Hidden</span>}
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
              {image.uploaderName && (
                <span className="image-uploader">Uploaded by {image.uploaderName}</span>
              )}
            </div>
            {hasNavigation && (
              <div className="navigation-info">
                {nearbyImages.length} nearby images
              </div>
            )}

            {/* Social sharing — a hidden photo has no public link to share */}
            {!image.hidden && (
              <SocialShare
                imageUrl={`/#/image/${image.id}`}
                imageTitle={`Photo taken on ${imageDate} at ${imageTime}`}
              />
            )}

            {adminActions && <div className="image-admin-actions">{adminActions}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageModal;
