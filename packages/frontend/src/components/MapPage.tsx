import L from 'leaflet';
import type React from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { apiClient } from '../services';
import type { GeoLocation, ImageRecord } from '../types';
import { extractImageId } from '../utils/urlUtils';
import { computeNearbyGroup } from '../utils/nearbyGroup';
import { getPosition, hasGps, watchPosition } from '../utils/geolocation';
import { canOpenGallery, nativeOpenGallery } from '../utils/native';
import { initialViewBounds } from '../utils/initialView';
import { moveReducer, type LatLng } from '../utils/moveGesture';
import albumIcon from '../assets/album.png';
import ImageModal from './ImageModal';
import MapView from './MapView';
import HeaderAccount from './HeaderAccount';
import { useSession } from '../hooks/useSession';
import './MapPage.css';

// Admin-only: keep it out of the main bundle.
const MoveAccept = lazy(() => import('./admin/MoveAccept'));

const SAVE_ERROR = "Couldn't save the new position.";
const TOAST_MS = 3000;

const MapPage: React.FC = () => {
  const navigate = useNavigate();
  const { me, signOut } = useSession();
  const { imageId: rawImageId } = useParams<{ imageId: string }>();

  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null);
  const [nearbyGroup, setNearbyGroup] = useState<ImageRecord[]>([]);
  const [showAlbum] = useState(canOpenGallery);
  const [userPosition, setUserPosition] = useState<GeoLocation | null>(null);
  const [move, dispatchMove] = useReducer(moveReducer, null);
  const [toast, setToast] = useState<string | null>(null);
  const isAdmin = !!me?.isAdmin;

  // useRef fields — mutations do NOT trigger re-renders
  const mapRef = useRef<L.Map | null>(null);
  const pendingPanRef = useRef<[number, number] | null>(null);

  // Load images once on mount; handle deep-link if imageId is present in the URL
  useEffect(() => {
    const controller = new AbortController();

    const loadImages = async () => {
      try {
        setLoading(true);
        setError(null);
        const loadedImages = await apiClient.getAllImages();
        if (controller.signal.aborted) return;
        setImages(loadedImages);

        if (rawImageId) {
          const cleanId = extractImageId(rawImageId);
          const image = loadedImages.find(img => img.id === cleanId);

          if (!image) {
            navigate('/', { replace: true });
            return;
          }

          const group = computeNearbyGroup(image, loadedImages);
          setSelectedImage(image);
          setNearbyGroup(group);

          // Pan to image — defer via pendingPanRef if map isn't mounted yet
          if (mapRef.current) {
            mapRef.current.panTo([image.latitude, image.longitude]);
          } else {
            pendingPanRef.current = [image.latitude, image.longitude];
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Failed to load images:', err);
        setError(err instanceof Error ? err.message : 'Failed to load images');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadImages();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once on mount — rawImageId is intentionally not a dep (deep-link only)

  // Track the device for the "you are here" dot.
  useEffect(() => (hasGps() ? watchPosition(setUserPosition) : undefined), []);

  // Sync modal state when URL changes (browser back/forward navigation)
  // `images` must be loaded before we can resolve image IDs
  useEffect(() => {
    if (images.length === 0) return;

    if (!rawImageId) {
      // Syncing local modal state to a router-owned URL param, not deriving state from props.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedImage(null);
      setNearbyGroup([]);
      return;
    }

    const cleanId = extractImageId(rawImageId);
    const image = images.find(img => img.id === cleanId);
    if (!image) {
      navigate('/', { replace: true });
      return;
    }

    // Only update state if the URL-driven image differs from current selection
    if (image.id !== selectedImage?.id) {
      const group = computeNearbyGroup(image, images);
      setSelectedImage(image);
      setNearbyGroup(group);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawImageId, images]); // selectedImage excluded — prevents loop on handleNavigate updates
  const onMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
    if (pendingPanRef.current) {
      map.panTo(pendingPanRef.current);
      pendingPanRef.current = null;
    } else if (!rawImageId && hasGps()) {
      // Start at the device, wide enough to show the nearest image. MapView calls this once, when the map mounts.
      void getPosition().then((pos) => {
        if (pos && mapRef.current === map) map.fitBounds(initialViewBounds(pos, images));
      });
    }
  }, [images, rawImageId]);

  // A pending move is read through a ref so handleImageSelect stays stable (MapView rebuilds markers when it changes).
  const moveRef = useRef(move);
  useEffect(() => {
    moveRef.current = move;
  }, [move]);

  const handleImageSelect = useCallback((imageId: string) => {
    if (moveRef.current) {
      // While a move is pending, tapping any marker discards it rather than opening a photo.
      dispatchMove({ type: 'discard' });
      return;
    }
    const cleanId = extractImageId(imageId);
    const image = images.find(img => img.id === cleanId);
    if (!image) return;
    const group = computeNearbyGroup(image, images);
    setSelectedImage(image);
    setNearbyGroup(group);
    navigate(`/map/image/${image.id}`);
  }, [images, navigate]);

  const handleImageNavigated = useCallback((imageId: string) => {
    const image = images.find(img => img.id === imageId);
    if (image && mapRef.current) {
      mapRef.current.panTo([image.latitude, image.longitude]);
    }
  }, [images]);

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!selectedImage || nearbyGroup.length <= 1) return;
    const currentIndex = nearbyGroup.findIndex(img => img.id === selectedImage.id);
    const nextIndex = direction === 'prev'
      ? (currentIndex > 0 ? currentIndex - 1 : nearbyGroup.length - 1)
      : (currentIndex < nearbyGroup.length - 1 ? currentIndex + 1 : 0);
    const nextImage = nearbyGroup[nextIndex];
    setSelectedImage(nextImage);
    navigate(`/map/image/${nextImage.id}`, { replace: true });
    handleImageNavigated(nextImage.id);
  }, [selectedImage, nearbyGroup, navigate, handleImageNavigated]);

  const handleMarkerDrop = useCallback((imageId: string, to: LatLng) => {
    const image = images.find(img => img.id === imageId);
    if (!image) return;
    dispatchMove({ type: 'drop', imageId, from: { lat: image.latitude, lng: image.longitude }, to });
  }, [images]);

  const discardMove = useCallback(() => dispatchMove({ type: 'discard' }), []);

  const handleAccept = useCallback(() => {
    if (!move || move.status !== 'pending') return;
    dispatchMove({ type: 'accept' });
    apiClient
      .setImageLocation(move.imageId, move.to.lat, move.to.lng)
      .then((updated) => {
        const byId = new Map(updated.map(img => [img.id, img]));
        setImages(prev => prev.map(img => byId.get(img.id) ?? img));
      })
      .catch((err: unknown) => {
        console.error('Failed to save image location:', err);
        setToast(SAVE_ERROR);
      })
      .finally(() => dispatchMove({ type: 'settled' }));
  }, [move]);

  // Escape discards a pending move; only listen while there is one.
  const hasMove = move !== null;
  useEffect(() => {
    if (!hasMove) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatchMove({ type: 'discard' });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hasMove]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Stable identity so MapView only repositions markers when the move actually changes.
  const moveId = move?.imageId;
  const moveLat = move?.to.lat;
  const moveLng = move?.to.lng;
  const pendingMove = useMemo(
    () => (moveId !== undefined && moveLat !== undefined && moveLng !== undefined
      ? { imageId: moveId, to: { lat: moveLat, lng: moveLng } }
      : null),
    [moveId, moveLat, moveLng],
  );

  const handleCloseModal = useCallback(() => {
    setSelectedImage(null);
    setNearbyGroup([]);
    navigate('/map');
  }, [navigate]);

  if (loading) {
    return (
      <div className="main-map-view">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading images...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="main-map-view">
        <div className="error-container">
          <h2>Error Loading Images</h2>
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="main-map-view">
      <header className="map-header">
        <h1>Spyo Map</h1>
        <div className="map-header-right">
          <div className="image-count">{images.length} geo-tagged images</div>
          <HeaderAccount me={me} onSignOut={signOut} />
        </div>
      </header>

      <div className="map-wrapper">
        <MapView
          images={images}
          selectedImageId={selectedImage?.id}
          onImageSelect={handleImageSelect}
          onMapReady={onMapReady}
          userPosition={userPosition}
          editable={isAdmin && move?.status !== 'saving'}
          onMarkerDrop={handleMarkerDrop}
          pendingMove={pendingMove}
          onMapClick={discardMove}
        />
      </div>

      {showAlbum && !selectedImage && !move && (
        <button
          type="button"
          className="fab"
          aria-label="Open photo album"
          onClick={() => void nativeOpenGallery()}
        >
          <img src={albumIcon} alt="" className="fab-icon" />
        </button>
      )}

      {isAdmin && move && (
        <Suspense fallback={null}>
          <MoveAccept saving={move.status === 'saving'} onAccept={handleAccept} />
        </Suspense>
      )}

      {toast && (
        <div className="map-toast" role="status">
          {toast}
        </div>
      )}

      <ImageModal
        image={selectedImage}
        nearbyImages={nearbyGroup}
        isOpen={!!selectedImage}
        onClose={handleCloseModal}
        onNavigate={handleNavigate}
        onImageNavigated={handleImageNavigated}
      />
    </div>
  );
};

export default MapPage;
