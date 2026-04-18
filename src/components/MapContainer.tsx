import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { Status, Wrapper } from '@googlemaps/react-wrapper';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageRecord, MapContainerProps } from '../types';
import './MapContainer.css';

// Temporary type declarations for Google Maps
declare const google: any;

// Google Maps API key - should be set via environment variable
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

interface GoogleMapProps {
  images: ImageRecord[];
  selectedImageId?: string;
  onImageSelect: (imageId: string) => void;
}

const GoogleMap: React.FC<GoogleMapProps> = ({ images, selectedImageId, onImageSelect }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const markerClustererRef = useRef<MarkerClusterer | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Default center (can be updated based on images)
    const defaultCenter = { lat: 40.7128, lng: -74.0060 }; // New York City

    // Calculate center from images if available
    const center = images.length > 0 
      ? {
          lat: images.reduce((sum, img) => sum + img.latitude, 0) / images.length,
          lng: images.reduce((sum, img) => sum + img.longitude, 0) / images.length
        }
      : defaultCenter;

    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      center,
      zoom: images.length > 0 ? 10 : 2,
      mapId: 'DEMO_MAP_ID', // Required for AdvancedMarkerElement
      mapTypeId: google.maps.MapTypeId.ROADMAP
      // Note: styles cannot be used when mapId is present
      // Map styling must be configured in Google Cloud Console
    });
  }, [images]);

  // Create custom marker with thumbnail using AdvancedMarkerElement
  const createImageMarker = useCallback((image: ImageRecord): any => {
    if (!mapInstanceRef.current) {
      throw new Error('Map not initialized');
    }

    // Create HTML content for the marker
    const markerContent = document.createElement('div');
    markerContent.className = 'custom-marker';
    markerContent.style.cssText = `
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      overflow: hidden;
      cursor: pointer;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Create thumbnail image
    const thumbnailImg = document.createElement('img');
    thumbnailImg.src = image.thumbnailPath;
    thumbnailImg.alt = `Image taken on ${new Date(image.timestamp).toLocaleDateString()}`;
    thumbnailImg.style.cssText = `
      width: 54px;
      height: 54px;
      border-radius: 50%;
      object-fit: cover;
    `;
    
    // Handle image load error
    thumbnailImg.onerror = () => {
      markerContent.innerHTML = `
        <div style="
          width: 54px;
          height: 54px;
          border-radius: 50%;
          background: #f0f0f0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          color: #666;
        ">📷</div>
      `;
    };

    markerContent.appendChild(thumbnailImg);

    // Create the advanced marker
    const marker = new google.maps.marker.AdvancedMarkerElement({
      position: { lat: image.latitude, lng: image.longitude },
      map: mapInstanceRef.current,
      content: markerContent,
      title: `Image taken on ${new Date(image.timestamp).toLocaleDateString()}`
    });

    // Add click listener
    marker.addListener('click', () => {
      onImageSelect(image.id);
    });

    return marker;
  }, [onImageSelect]);

  // Update markers when images change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => {
      marker.map = null;
    });
    markersRef.current = [];

    // Clear existing clusterer
    if (markerClustererRef.current) {
      markerClustererRef.current.clearMarkers();
    }

    // Create new markers
    const newMarkers = images.map(image => createImageMarker(image));
    markersRef.current = newMarkers;

    // Create marker clusterer
    if (newMarkers.length > 0) {
      markerClustererRef.current = new MarkerClusterer({
        map: mapInstanceRef.current,
        markers: newMarkers,
        renderer: {
          render: ({ count, position }) => {
            // Create HTML content for cluster marker
            const clusterContent = document.createElement('div');
            clusterContent.style.cssText = `
              width: 50px;
              height: 50px;
              border-radius: 50%;
              background: #4285f4;
              border: 3px solid white;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 14px;
              box-shadow: 0 2px 6px rgba(0,0,0,0.3);
              cursor: pointer;
            `;
            clusterContent.textContent = count.toString();
            
            return new google.maps.marker.AdvancedMarkerElement({
              position,
              content: clusterContent
            });
          }
        }
      });
    }
  }, [images, createImageMarker]);

  // Highlight selected image
  useEffect(() => {
    if (!selectedImageId) return;

    const selectedImageIndex = images.findIndex(img => img.id === selectedImageId);
    const selectedMarker = selectedImageIndex >= 0 ? markersRef.current[selectedImageIndex] : null;

    if (selectedMarker && mapInstanceRef.current) {
      // Center map on selected marker
      const position = selectedMarker.position;
      if (position) {
        mapInstanceRef.current.panTo(position);
        mapInstanceRef.current.setZoom(Math.max(mapInstanceRef.current.getZoom() || 10, 15));
        
        // Add visual highlight to the selected marker
        const markerContent = selectedMarker.content as HTMLElement;
        if (markerContent) {
          // Add a pulsing animation
          markerContent.style.animation = 'pulse 2s ease-in-out 3';
          setTimeout(() => {
            markerContent.style.animation = '';
          }, 6000);
        }
      }
    }
  }, [selectedImageId, images]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
};

const MapContainer: React.FC<MapContainerProps> = ({ images, selectedImageId, onImageSelect }) => {
  const [mapError, setMapError] = useState<string | null>(null);

  const renderMap = (status: Status): React.ReactElement => {
    switch (status) {
      case Status.LOADING:
        return (
          <div className="map-loading">
            <div className="loading-spinner"></div>
            <p>Loading Google Maps...</p>
          </div>
        );
      case Status.FAILURE:
        setMapError('Failed to load Google Maps');
        return (
          <div className="map-error">
            <p>Failed to load Google Maps. Please check your internet connection and API key.</p>
            <button type="button" onClick={() => window.location.reload()}>Retry</button>
          </div>
        );
      case Status.SUCCESS:
        return (
          <GoogleMap 
            images={images} 
            selectedImageId={selectedImageId} 
            onImageSelect={onImageSelect} 
          />
        );
      default:
        return <div>Unknown status</div>;
    }
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="map-error">
        <p>Google Maps API key is not configured. Please set VITE_GOOGLE_MAPS_API_KEY environment variable.</p>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="map-error">
        <p>{mapError}</p>
        <button type="button" onClick={() => setMapError(null)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="map-container">
      <Wrapper 
        apiKey={GOOGLE_MAPS_API_KEY}
        render={renderMap}
        libraries={['marker']}
      />
    </div>
  );
};

export default MapContainer;