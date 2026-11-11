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
  uploaderName: string;
  /** Present and false only when the image has no content hash, so its position cannot be overridden. */
  editable?: boolean;
  /** Present and true only for hidden images, which only admins receive. */
  hidden?: boolean;
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
  onImageNavigated?: (imageId: string) => void;
}

export interface SocialShareProps {
  imageUrl: string;
  imageTitle?: string;
}

export * from './upload.js';
