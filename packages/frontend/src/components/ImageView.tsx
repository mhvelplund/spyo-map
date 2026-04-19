import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MapView from './MapView';
import ImageModal from './ImageModal';
import { apiClient } from '../services';
import { extractImageId } from '../utils/urlUtils';
import type { ImageRecord } from '../types';
import './MainMapView.css';

// Calculate distance between two points using haversine formula
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const ImageView: React.FC = () => {
  const { imageId } = useParams<{ imageId: string }>();
  const navigate = useNavigate();

  const [images, setImages] = useState<ImageRecord[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null);
  const [nearbyImages, setNearbyImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadImagesAndSelectImage = async () => {
      try {
        setLoading(true);
        setError(null);


        // Load all images
        const loadedImages = await apiClient.getAllImages();
        setImages(loadedImages);

        // Find the requested image
        if (imageId) {
          // Clean the image ID to handle any path issues
          const cleanImageId = extractImageId(imageId);
          const image = loadedImages.find(img => img.id === cleanImageId);

          if (!image) {
            // Image not found, redirect to main map
            navigate('/', { replace: true });
            return;
          }

          // Find nearby images within 1km radius
          const nearbyWithDistance = loadedImages
            .filter(img => img.id !== cleanImageId)
            .map(img => ({
              image: img,
              distance: calculateDistance(image.latitude, image.longitude, img.latitude, img.longitude)
            }))
            .filter(item => item.distance <= 1) // Within 1km
            .sort((a, b) => a.distance - b.distance);

          // Extract just the images for final array
          const nearby = nearbyWithDistance.map(item => item.image);

          // Include the selected image in the nearby list for navigation
          const allNearbyImages = [image, ...nearby];

          setSelectedImage(image);
          setNearbyImages(allNearbyImages);
        } else {
          // No imageId provided, redirect to main map
          navigate('/', { replace: true });
        }
      } catch (err) {
        console.error('Failed to load images:', err);
        setError(err instanceof Error ? err.message : 'Failed to load images');
      } finally {
        setLoading(false);
      }
    };

    loadImagesAndSelectImage();
  }, [imageId, navigate]);

  const handleImageSelect = (newImageId: string) => {
    // Ensure we have a clean image ID
    const cleanImageId = extractImageId(newImageId);
    // Update URL to reflect the new selected image
    navigate(`/image/${cleanImageId}`, { replace: true });
  };

  const handleCloseModal = () => {
    // Return to main map view
    navigate('/', { replace: true });
  };

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!selectedImage || nearbyImages.length <= 1) return;

    const currentIndex = nearbyImages.findIndex(img => img.id === selectedImage.id);
    let nextIndex: number;

    if (direction === 'prev') {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : nearbyImages.length - 1;
    } else {
      nextIndex = currentIndex < nearbyImages.length - 1 ? currentIndex + 1 : 0;
    }

    const nextImage = nearbyImages[nextIndex];
    // Update URL to reflect the new selected image
    navigate(`/image/${nextImage.id}`, { replace: true });
  };

  if (loading) {
    return (
      <div className="main-map-view">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading image...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="main-map-view">
        <div className="error-container">
          <h2>Error Loading Image</h2>
          <p>{error}</p>
          <button type="button" onClick={() => navigate('/')}>
            Return to Map
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="main-map-view">
      <header className="map-header">
        <h1>Spyo Map</h1>
        <div className="image-count">
          {images.length} geo-tagged images
        </div>
      </header>

      <div className="map-wrapper">
        <MapView
          images={images}
          selectedImageId={selectedImage?.id}
          onImageSelect={handleImageSelect}
        />
      </div>

      <ImageModal
        image={selectedImage}
        nearbyImages={nearbyImages}
        isOpen={!!selectedImage}
        onClose={handleCloseModal}
        onNavigate={handleNavigate}
      />
    </div>
  );
};

export default ImageView;
