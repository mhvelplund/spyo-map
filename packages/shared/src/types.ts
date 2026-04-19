export interface GeoLocation {
  latitude: number;
  longitude: number;
}

export interface ImageRecord {
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  latitudeRef?: string;
  longitudeRef?: string;
  altitudeRef?: string;
  altitude?: number;
  speedRef?: string;
  speed?: number;
  imgDirectionRef?: string;
  imgDirection?: number;
  destBearingRef?: string;
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

export interface MapViewProps {
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
