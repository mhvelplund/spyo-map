import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Wrapper, Status } from '@googlemaps/react-wrapper';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import type { MapContainerProps, ImageRecord } from '../types';
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
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
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
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }]
        }
      ]
    });
  }, [images]);

  // Create custom marker with thumbnail
  const createImageMarker = useCallback((image: ImageRecord): google.maps.Marker => {
    if (!mapInstanceRef.current) {
      throw new Error('Map not initialized');
    }

    // Create custom marker icon with thumbnail
    const markerIcon = {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg width="60" height="60" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="circle">
              <circle cx="30" cy="30" r="25"/>
            </clipPath>
          </defs>
          <circle cx="30" cy="30" r="28" fill="white" stroke="#333" stroke-width="2"/>
          <image href="/${image.thumbnailPath}" x="5" y="5" width="50" height="50" clip-path="url(#circle)"/>
        </svg>
      `)}`,
      scaledSize: new google.maps.Size(60, 60),
      anchor: new google.maps.Point(30, 30)
    };

    const marker = new google.maps.Marker({
      position: { lat: image.latitude, lng: image.longitude },
      map: mapInstanceRef.current,
      icon: markerIcon,
      title: `Image taken on ${new Date(image.timestamp).toLocaleDateString()}`,
      optimized: false // Required for custom SVG icons
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
      marker.setMap(null);
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
            // Custom cluster marker
            const svg = `
              <svg width="50" height="50" xmlns="http://www.w3.org/2000/svg">
                <circle cx="25" cy="25" r="20" fill="#4285f4" stroke="white" stroke-width="3"/>
                <text x="25" y="30" text-anchor="middle" fill="white" font-family="Arial" font-size="12" font-weight="bold">${count}</text>
              </svg>
            `;
            
            return new google.maps.Marker({
              position,
              icon: {
                url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
                scaledSize: new google.maps.Size(50, 50),
                anchor: new google.maps.Point(25, 25)
              }
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
      const position = selectedMarker.getPosition();
      if (position) {
        mapInstanceRef.current.panTo(position);
        mapInstanceRef.current.setZoom(Math.max(mapInstanceRef.current.getZoom() || 10, 15));
        
        // Optionally add a bounce animation
        selectedMarker.setAnimation(google.maps.Animation.BOUNCE);
        setTimeout(() => {
          selectedMarker.setAnimation(null);
        }, 2000);
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
        libraries={['geometry']}
      />
    </div>
  );
};

export default MapContainer;