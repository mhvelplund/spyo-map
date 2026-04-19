import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { ImageRecord, MapViewProps } from '../types';
import './MapContainer.css';

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006];
const DEFAULT_ZOOM = 2;

interface MarkerLayerProps {
  images: ImageRecord[];
  selectedImageId?: string;
  onImageSelect: (imageId: string) => void;
}

interface MapViewPropsExtended extends MapViewProps {
  onMapReady?: (map: L.Map) => void;
}

const MarkerClusterLayer: React.FC<MarkerLayerProps> = ({ images, selectedImageId, onImageSelect }) => {
  const map = useMap();
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current);
      clusterGroupRef.current = null;
    }

    const clusterGroup = L.markerClusterGroup();
    clusterGroupRef.current = clusterGroup;

    images.forEach(image => {
      const isSelected = image.id === selectedImageId;
      const borderColor = isSelected ? '#4285f4' : 'white';
      const extraShadow = isSelected ? ', 0 0 0 3px rgba(66,133,244,0.4)' : '';

      const icon = L.divIcon({
        className: '',
        html: `<div style="
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: 3px solid ${borderColor};
            box-shadow: 0 2px 6px rgba(0,0,0,0.3)${extraShadow};
            overflow: hidden;
            cursor: pointer;
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
          "><img
            src="${image.thumbnailUrl}"
            alt=""
            style="width: 54px; height: 54px; border-radius: 50%; object-fit: cover;"
          /></div>`,
        iconSize: [60, 60],
        iconAnchor: [30, 30],
      });

      const marker = L.marker([image.latitude, image.longitude], { icon });
      marker.on('click', () => onImageSelect(image.id));
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    return () => {
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current);
        clusterGroupRef.current = null;
      }
    };
  }, [map, images, selectedImageId, onImageSelect]);

  return null;
};

interface MapReadyCaptureProps {
  onReady?: (map: L.Map) => void;
}

const MapReadyCapture: React.FC<MapReadyCaptureProps> = ({ onReady }) => {
  const map = useMap();
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  // Fire exactly once when the Leaflet map instance mounts.
  // Using a ref for the callback avoids the caller-stability contract.
  useEffect(() => { onReadyRef.current?.(map); }, [map]);
  return null;
};

const MapView: React.FC<MapViewPropsExtended> = ({ images, selectedImageId, onImageSelect, onMapReady }) => {
  const initialCenter: [number, number] = images.length > 0
    ? [
        images.reduce((sum, img) => sum + img.latitude, 0) / images.length,
        images.reduce((sum, img) => sum + img.longitude, 0) / images.length,
      ]
    : DEFAULT_CENTER;

  const initialZoom = images.length > 0 ? 10 : DEFAULT_ZOOM;

  return (
    <div className="map-container">
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MarkerClusterLayer
          images={images}
          selectedImageId={selectedImageId}
          onImageSelect={onImageSelect}
        />
        <MapReadyCapture onReady={onMapReady} />
      </MapContainer>
    </div>
  );
};

export default MapView;
