import React, { useEffect, useState } from 'react';
import MapContainer from './MapContainer';
import { databaseService } from '../services/DatabaseService';
import type { ImageRecord } from '../types';
import './MainMapView.css';

const MainMapView: React.FC = () => {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleImageSelect = (imageId: string) => {
    setSelectedImageId(imageId);
    // In later tasks, this will open the image modal
    console.log('Selected image:', imageId);
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
    </div>
  );
};

export default MainMapView;