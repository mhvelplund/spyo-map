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
import { LONG_PRESS_MS, MOVE_TOLERANCE_PX, pressReducer, type LatLng, type PressEvent, type PressState } from '../utils/moveGesture';
import './MapContainer.css';

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006];
const DEFAULT_ZOOM = 2;

interface PendingMove {
  imageId: string;
  to: LatLng;
}

interface AdminMoveProps {
  /** Admin mode: long-press a marker (whose image is not `editable: false`) to pick it up and drag it. */
  editable?: boolean;
  /** A lifted marker was released at `to`. */
  onMarkerDrop?: (imageId: string, to: LatLng) => void;
  /** That marker renders at `to`; when this goes back to null, markers return to their `images` positions. */
  pendingMove?: PendingMove | null;
  /** Click on the bare map while `pendingMove` is set. */
  onMapClick?: () => void;
}

interface MarkerLayerProps extends AdminMoveProps {
  images: ImageRecord[];
  selectedImageId?: string;
  onImageSelect: (imageId: string) => void;
}

interface MapViewPropsExtended extends MapViewProps, AdminMoveProps {
  onMapReady?: (map: L.Map) => void;
  userPosition?: GeoLocation | null;
}

interface MarkerEntry {
  marker: L.Marker;
  image: ImageRecord;
}

/**
 * Swallow the click the browser sends after a lifted marker is released, so it neither opens the photo nor discards.
 * Only a click on that marker's element counts; anything else passes through.
 */
function suppressNextClick(el: HTMLElement): void {
  const stop = (e: MouseEvent) => {
    if (!(e.target instanceof Node) || !el.contains(e.target)) return;
    e.stopPropagation();
    e.preventDefault();
    window.removeEventListener('click', stop, true);
  };
  window.addEventListener('click', stop, true);
  setTimeout(() => window.removeEventListener('click', stop, true), 400);
}

const MarkerClusterLayer: React.FC<MarkerLayerProps> = ({
  images,
  selectedImageId,
  onImageSelect,
  editable,
  onMarkerDrop,
  pendingMove,
  onMapClick,
}) => {
  const map = useMap();
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  // Ends an in-flight lift (lifted marker, disabled map dragging) when the markers are torn down.
  const abortLiftRef = useRef<(() => void) | null>(null);
  // Callbacks and move state are read at event time, so changing them never rebuilds the cluster group.
  const latest = useRef({ onImageSelect, editable, onMarkerDrop, pendingMove, onMapClick });
  useLayoutEffect(() => {
    latest.current = { onImageSelect, editable, onMarkerDrop, pendingMove, onMapClick };
  });

  useEffect(() => {
    const restingLatLng = (image: ImageRecord): L.LatLngExpression => {
      const move = latest.current.pendingMove;
      return move?.imageId === image.id ? [move.to.lat, move.to.lng] : [image.latitude, image.longitude];
    };

    // Long-press to lift, drag, release to drop. `el` is one rendering of the marker; it is discarded on 'remove'.
    const attachPress = (el: HTMLElement, marker: L.Marker, image: ImageRecord) => {
      let press: PressState = { kind: 'idle' };
      let timer: ReturnType<typeof setTimeout> | undefined;
      let pointerId = -1;
      let restoreDragging = false;
      // Last pointer position seen, and where it was when the marker lifted (for the "didn't really move" check).
      let lastX = 0;
      let lastY = 0;
      let liftX = 0;
      let liftY = 0;

      const send = (event: PressEvent) => {
        press = pressReducer(press, event);
        if (press.kind !== 'pending') clearTimeout(timer);
      };
      const stop = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
      };
      const lift = () => {
        restoreDragging = map.dragging.enabled();
        map.dragging.disable(); // also ends the map pan Leaflet started on pointerdown
        marker.fire('dragstart'); // markercluster: don't re-cluster on every move until 'dragend'
        liftX = lastX;
        liftY = lastY;
        el.classList.add('marker-lifted');
        try { el.setPointerCapture(pointerId); } catch { /* pointer already gone */ }
        abortLiftRef.current = () => land(false);
      };
      const land = (dropped: boolean) => {
        send({ type: dropped ? 'up' : 'cancel' });
        el.classList.remove('marker-lifted');
        if (restoreDragging) map.dragging.enable();
        restoreDragging = false;
        abortLiftRef.current = null;
        if (!dropped) marker.setLatLng(restingLatLng(image));
        // Deferred so the element isn't replaced (re-clustered) before the browser dispatches the click.
        setTimeout(() => marker.fire('dragend'), 0);
      };

      el.addEventListener('contextmenu', (e) => {
        if (latest.current.editable) e.preventDefault();
      });
      el.addEventListener('pointerdown', (e) => {
        if (!latest.current.editable || image.editable === false) return;
        if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
        pointerId = e.pointerId;
        lastX = e.clientX;
        lastY = e.clientY;
        clearTimeout(timer);
        send({ type: 'down', x: e.clientX, y: e.clientY });
        timer = setTimeout(() => {
          send({ type: 'timeout' });
          if (press.kind === 'armed') lift();
        }, LONG_PRESS_MS);
      });
      el.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pointerId) return;
        lastX = e.clientX;
        lastY = e.clientY;
        if (press.kind === 'armed') {
          stop(e);
          marker.setLatLng(map.mouseEventToLatLng(e).wrap());
        } else {
          send({ type: 'move', x: e.clientX, y: e.clientY });
        }
      });
      el.addEventListener('pointerup', (e) => {
        if (e.pointerId !== pointerId) return;
        if (press.kind !== 'armed') {
          send({ type: 'up' });
          return;
        }
        stop(e);
        suppressNextClick(el);
        // Lifted but released (almost) where it was picked up: not a move, so put it back and record nothing.
        if (Math.hypot(e.clientX - liftX, e.clientY - liftY) < MOVE_TOLERANCE_PX) {
          land(false);
          return;
        }
        const { lat, lng } = map.mouseEventToLatLng(e).wrap();
        marker.setLatLng([lat, lng]);
        land(true);
        latest.current.onMarkerDrop?.(image.id, { lat, lng });
      });
      const cancel = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        if (press.kind === 'armed') land(false);
        else send({ type: 'cancel' });
      };
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('lostpointercapture', cancel); // after a normal drop the press is already idle
      // Mouse leaving the marker before it lifts is a map pan, not a press (touch keeps its target implicitly).
      el.addEventListener('pointerleave', (e) => {
        if (press.kind === 'pending' && e.pointerId === pointerId) send({ type: 'cancel' });
      });
      marker.once('remove', () => {
        if (press.kind === 'armed') land(false);
        else send({ type: 'cancel' });
      });
    };

    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current);
      clusterGroupRef.current = null;
    }
    markersRef.current.clear();

    const clusterGroup = L.markerClusterGroup();
    clusterGroupRef.current = clusterGroup;

    images.forEach(image => {
      const isSelected = image.id === selectedImageId;
      const borderColor = isSelected ? '#4285f4' : 'white';
      const extraShadow = isSelected ? ', 0 0 0 3px rgba(66,133,244,0.4)' : '';

      const icon = L.divIcon({
        className: '',
        html: `<div class="photo-marker${image.hidden ? ' marker-hidden' : ''}" style="
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
            draggable="false"
            style="width: 54px; height: 54px; border-radius: 50%; object-fit: cover;"
          /></div>`,
        iconSize: [60, 60],
        iconAnchor: [30, 30],
      });

      const marker = L.marker(restingLatLng(image), { icon });
      marker.on('click', () => latest.current.onImageSelect(image.id));
      // markercluster creates a fresh element each time the marker is shown (e.g. after un-clustering).
      marker.on('add', () => {
        const el = marker.getElement();
        if (el) attachPress(el, marker, image);
      });
      markersRef.current.set(image.id, { marker, image });
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    return () => {
      abortLiftRef.current?.();
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current);
        clusterGroupRef.current = null;
      }
    };
  }, [map, images, selectedImageId]);

  // Keep the pending marker at its new spot; put a previously moved marker back where its image says (snap-back).
  const shownMoveIdRef = useRef<string | null>(null);
  useEffect(() => {
    const markers = markersRef.current;
    const prevId = shownMoveIdRef.current;
    if (prevId && prevId !== pendingMove?.imageId) {
      const entry = markers.get(prevId);
      entry?.marker.setLatLng([entry.image.latitude, entry.image.longitude]);
    }
    if (pendingMove) markers.get(pendingMove.imageId)?.marker.setLatLng([pendingMove.to.lat, pendingMove.to.lng]);
    shownMoveIdRef.current = pendingMove?.imageId ?? null;
  }, [pendingMove, images]);

  useEffect(() => {
    const onClick = () => {
      if (latest.current.pendingMove) latest.current.onMapClick?.();
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map]);

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
  editable,
  onMarkerDrop,
  pendingMove,
  onMapClick,
}) => {
  const initialCenter: [number, number] = images.length > 0
    ? [
        images.reduce((sum, img) => sum + img.latitude, 0) / images.length,
        images.reduce((sum, img) => sum + img.longitude, 0) / images.length,
      ]
    : DEFAULT_CENTER;

  const initialZoom = images.length > 0 ? 10 : DEFAULT_ZOOM;

  return (
    <div className={editable ? 'map-container map-admin' : 'map-container'}>
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
          editable={editable}
          onMarkerDrop={onMarkerDrop}
          pendingMove={pendingMove}
          onMapClick={onMapClick}
        />
        {userPosition && <UserLocationLayer position={userPosition} />}
        <MapReadyCapture onReady={onMapReady} />
      </MapContainer>
    </div>
  );
};

export default MapView;
