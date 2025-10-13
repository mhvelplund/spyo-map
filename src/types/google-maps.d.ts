// Google Maps type declarations
/// <reference types="google.maps" />

declare global {
  namespace google {
    namespace maps {
      class Map {
        constructor(mapDiv: HTMLElement, opts?: MapOptions);
        panTo(latLng: LatLng | LatLngLiteral): void;
        setZoom(zoom: number): void;
        getZoom(): number | undefined;
      }
      
      class Marker {
        constructor(opts?: MarkerOptions);
        setMap(map: Map | null): void;
        getPosition(): LatLng | undefined;
        setAnimation(animation: Animation | null): void;
        addListener(eventName: string, handler: Function): void;
      }
      
      class Size {
        constructor(width: number, height: number);
      }
      
      class Point {
        constructor(x: number, y: number);
      }
      
      interface MapOptions {
        center?: LatLng | LatLngLiteral;
        zoom?: number;
        mapTypeId?: MapTypeId;
        styles?: MapTypeStyle[];
      }
      
      interface MarkerOptions {
        position?: LatLng | LatLngLiteral;
        map?: Map;
        icon?: string | Icon | Symbol;
        title?: string;
        optimized?: boolean;
      }
      
      interface LatLng {
        lat(): number;
        lng(): number;
      }
      
      interface LatLngLiteral {
        lat: number;
        lng: number;
      }
      
      interface Icon {
        url: string;
        scaledSize?: Size;
        anchor?: Point;
      }
      
      interface MapTypeStyle {
        featureType?: string;
        elementType?: string;
        stylers?: Array<{ [key: string]: string }>;
      }
      
      enum MapTypeId {
        ROADMAP = 'roadmap',
        SATELLITE = 'satellite',
        HYBRID = 'hybrid',
        TERRAIN = 'terrain'
      }
      
      enum Animation {
        BOUNCE = 1,
        DROP = 2
      }
    }
  }
}

export {};