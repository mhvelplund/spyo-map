import L from 'leaflet';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../services';
import type { ImageRecord } from '../types';
import { extractImageId } from '../utils/urlUtils';
import { computeNearbyGroup } from '../utils/nearbyGroup';
import ImageModal from './ImageModal';
import MapView from './MapView';
import './MapPage.css';

const MapPage: React.FC = () => {
  const navigate = useNavigate();
  const { imageId: rawImageId } = useParams<{ imageId: string }>();

  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null);
  const [nearbyGroup, setNearbyGroup] = useState<ImageRecord[]>([]);

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

  // Sync modal state when URL changes (browser back/forward navigation)
  // `images` must be loaded before we can resolve image IDs
  useEffect(() => {
    if (images.length === 0) return;

    if (!rawImageId) {
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
    }
  }, []);

  const handleImageSelect = useCallback((imageId: string) => {
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
        <div className="image-count">{images.length} geo-tagged images</div>
      </header>

      <div className="map-wrapper">
        <MapView
          images={images}
          selectedImageId={selectedImage?.id}
          onImageSelect={handleImageSelect}
          onMapReady={onMapReady}
        />
      </div>

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
