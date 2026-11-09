import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type React from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { GeoLocation, ImageRecord, MapViewProps } from '../types';
import dotIcon from '../assets/dot.png';
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
  userPosition?: GeoLocation | null;
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

// Own pane so the dot sits above the image markers (markerPane, z 600) and below popups; the page's floating button
// (z 1100) stays above it.
const USER_PANE = 'userLocation';
const USER_ICON = L.icon({ iconUrl: dotIcon, iconSize: [24, 24], iconAnchor: [12, 12] });

const UserLocationLayer: React.FC<{ position: GeoLocation }> = ({ position }) => {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const { latitude, longitude } = position;

  useEffect(() => {
    if (!map.getPane(USER_PANE)) map.createPane(USER_PANE).style.zIndex = '650';
    const marker = L.marker([latitude, longitude], {
      icon: USER_ICON,
      pane: USER_PANE,
      interactive: false,
      keyboard: false,
    }).addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]); // created once; position updates move it below

  useEffect(() => {
    markerRef.current?.setLatLng([latitude, longitude]);
  }, [latitude, longitude]);

  return null;
};

interface MapReadyCaptureProps {
  onReady?: (map: L.Map) => void;
}

const MapReadyCapture: React.FC<MapReadyCaptureProps> = ({ onReady }) => {
  const map = useMap();
  const onReadyRef = useRef(onReady);
  // Using a ref for the callback avoids the caller-stability contract.
  useLayoutEffect(() => { onReadyRef.current = onReady; });
  // Fire exactly once when the Leaflet map instance mounts.
  useEffect(() => { onReadyRef.current?.(map); }, [map]);
  return null;
};

const MapView: React.FC<MapViewPropsExtended> = ({
  images,
  selectedImageId,
  onImageSelect,
  onMapReady,
  userPosition,
}) => {
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
        {userPosition && <UserLocationLayer position={userPosition} />}
        <MapReadyCapture onReady={onMapReady} />
      </MapContainer>
    </div>
  );
};

export default MapView;
