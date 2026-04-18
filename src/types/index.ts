export interface GeoLocation {
  latitude: number;
  longitude: number;
}

export interface ImageRecord {
  id: string;
  path: string;
  thumbnailPath: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  latitudeRef?: string; // e.g.: North latitude
  longitudeRef?: string; // e.g.: East longitude
  altitudeRef?: string; // e.g.: Sea level
  altitude?: number;
  speedRef?: string; // e.g.: Kilometers per hour
  speed?: number;
  imgDirectionRef?: string; // e.g.: Magnetic direction
  imgDirection?: number;
  destBearingRef?: string; // e.g.: Magnetic direction
  destBearing?: number;
  hPositioningError?: number;
}

export interface AppState {
  images: ImageRecord[];
  selectedImage: ImageRecord | null;
  mapCenter: GeoLocation;
  mapZoom: number;
  isModalOpen: boolean;
}

export interface MapContainerProps {
  images: ImageRecord[];
  selectedImageId?: string;
  onImageSelect: (imageId: string) => void;
}

export interface ImageModalProps {
  image: ImageRecord | null;
  nearbyImages: ImageRecord[];
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
}

export interface SocialShareProps {
  imageUrl: string;
  imageTitle?: string;
}
