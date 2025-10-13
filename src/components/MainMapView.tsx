import { useEffect, useState } from 'react';
import MapContainer from './MapContainer';
import ImageModal from './ImageModal';
import { databaseService } from '../services/DatabaseService';
import type { ImageRecord } from '../types';
import './MainMapView.css';

const MainMapView: React.FC = () => {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null);
  const [nearbyImages, setNearbyImages] = useState<ImageRecord[]>([]);

  useEffect(() => {
    const loadImages = async () => {
      try {
        setLoading(true);
        setError(null);
        const loadedImages = await databaseService.loadImages();
        setImages(loadedImages);
      } catch (err) {
        console.error('Failed to load images:', err);
        setError(err instanceof Error ? err.message : 'Failed to load images');
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, []);

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

  const handleImageSelect = (imageId: string) => {
    setSelectedImageId(imageId);
    
    // Find the selected image
    const image = images.find(img => img.id === imageId);
    if (!image) return;

    // Find nearby images within 1km radius
    const nearby = images
      .filter(img => img.id !== imageId)
      .map(img => ({
        ...img,
        distance: calculateDistance(image.latitude, image.longitude, img.latitude, img.longitude)
      }))
      .filter(img => img.distance <= 1) // Within 1km
      .sort((a, b) => a.distance - b.distance)
      .map(({ distance, ...img }) => img); // Remove distance property

    // Include the selected image in the nearby list for navigation
    const allNearbyImages = [image, ...nearby];

    setSelectedImage(image);
    setNearbyImages(allNearbyImages);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedImage(null);
    setNearbyImages([]);
    setSelectedImageId(undefined);
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
    setSelectedImage(nextImage);
    setSelectedImageId(nextImage.id);
  };

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
        <h1>Spyro Map</h1>
        <div className="image-count">
          {images.length} geo-tagged images
        </div>
      </header>
      
      <div className="map-wrapper">
        <MapContainer
          images={images}
          selectedImageId={selectedImageId}
          onImageSelect={handleImageSelect}
        />
      </div>

      <ImageModal
        image={selectedImage}
        nearbyImages={nearbyImages}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onNavigate={handleNavigate}
      />
    </div>
  );
};

export default MainMapView;