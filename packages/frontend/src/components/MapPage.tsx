import L from 'leaflet';
import type React from 'react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { apiClient } from '../services';
import type { GeoLocation, ImageRecord } from '../types';
import { extractImageId } from '../utils/urlUtils';
import { lightboxOrder } from '../utils/groups';
import { getPosition, hasGps, watchPosition } from '../utils/geolocation';
import { canOpenGallery, nativeOpenGallery } from '../utils/native';
import { initialViewBounds } from '../utils/initialView';
import { moveReducer, type LatLng } from '../utils/moveGesture';
import albumIcon from '../assets/album.png';
import ImageModal from './ImageModal';
import MapView from './MapView';
import HeaderAccount from './HeaderAccount';
import { useSession } from '../hooks/useSession';
import './MapPage.css';

// Admin-only: keep it out of the main bundle.
const MoveAccept = lazy(() => import('./admin/MoveAccept'));
const VisibilityButton = lazy(() => import('./admin/VisibilityButton'));
const UngroupButton = lazy(() => import('./admin/UngroupButton'));

const SAVE_ERROR = "Couldn't save the new position.";
const VISIBILITY_ERROR = "Couldn't change visibility.";
const GROUP_SAVE_ERROR = "Couldn't group the photos.";
const UNGROUP_ERROR = "Couldn't change the group.";
const TOAST_MS = 3000;

const MapPage: React.FC = () => {
  const navigate = useNavigate();
  const { me, signOut } = useSession();
  const { imageId: rawImageId } = useParams<{ imageId: string }>();

  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageRecord | null>(null);
  const [nearbyGroup, setNearbyGroup] = useState<ImageRecord[]>([]);
  const [showAlbum] = useState(canOpenGallery);
  const [userPosition, setUserPosition] = useState<GeoLocation | null>(null);
  const [move, dispatchMove] = useReducer(moveReducer, null);
  // `id` changes on every show, so a repeat of the same message restarts the timer.
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [groupBusy, setGroupBusy] = useState(false);
  const isAdmin = !!me?.isAdmin;

  // useRef fields — mutations do NOT trigger re-renders
  const mapRef = useRef<L.Map | null>(null);
  const pendingPanRef = useRef<[number, number] | null>(null);

  // Read through refs so a reload can reconcile the list and open lightbox without re-running on every change.
  const selectedRef = useRef(selectedImage);
  const imagesRef = useRef(images);
  // Id a reload just closed. Navigation lands as a transition, so the URL sync below briefly still sees it.
  const closedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRef.current = selectedImage;
    imagesRef.current = images;
  }, [selectedImage, images]);

  // Swap in a reloaded list. The open photo is refreshed, or closed when the new list no longer has it (e.g. a
  // hidden photo after sign-out).
  const reconcileImages = (loadedImages: ImageRecord[]) => {
    setImages(loadedImages);
    const current = selectedRef.current;
    if (!current) return;
    const fresh = loadedImages.find(img => img.id === current.id);
    if (!fresh) {
      closedIdRef.current = current.id;
      setSelectedImage(null);
      setNearbyGroup([]);
      navigate('/map', { replace: true });
      return;
    }
    setSelectedImage(fresh);
    setNearbyGroup(lightboxOrder(fresh, loadedImages));
  };

  // Every load takes the next sequence number; only the latest may apply its response, so a slow mount load can't
  // overwrite a reload that already landed. Unmounting bumps it too, which makes everything in flight stale.
  const loadSeqRef = useRef(0);
  const firstLoadDoneRef = useRef(false);

  // First list to land (normally the mount load): resolve a deep link if imageId is present in the URL.
  const applyFirstLoad = (loadedImages: ImageRecord[]) => {
    firstLoadDoneRef.current = true;
    setError(null);
    setImages(loadedImages);
    setLoading(false);
    if (!rawImageId) return;

    const cleanId = extractImageId(rawImageId);
    const image = loadedImages.find(img => img.id === cleanId);
    if (!image) {
      navigate('/', { replace: true });
      return;
    }
    setSelectedImage(image);
    setNearbyGroup(lightboxOrder(image, loadedImages));

    // Pan to image — defer via pendingPanRef if map isn't mounted yet
    if (mapRef.current) {
      mapRef.current.panTo([image.latitude, image.longitude]);
    } else {
      pendingPanRef.current = [image.latitude, image.longitude];
    }
  };

  // The one image loader, for the mount load and admin-change reloads alike. Resolves true when its list was
  // applied. A failed reload drops hidden photos so nothing private lingers after sign-out.
  const loadImages = async (): Promise<boolean> => {
    const seq = ++loadSeqRef.current;
    try {
      const loadedImages = await apiClient.getAllImages();
      if (seq !== loadSeqRef.current) return false;
      if (firstLoadDoneRef.current) reconcileImages(loadedImages);
      else applyFirstLoad(loadedImages);
      return true;
    } catch (err) {
      if (seq !== loadSeqRef.current) return false;
      if (firstLoadDoneRef.current) {
        console.error('Failed to reload images:', err);
        reconcileImages(imagesRef.current.filter(img => !img.hidden));
      } else {
        console.error('Failed to load images:', err);
        setError(err instanceof Error ? err.message : 'Failed to load images');
        setLoading(false);
      }
      return false;
    }
  };

  // Load images once on mount (`loading` starts true and `error` null).
  useEffect(() => {
    // loadImages only sets state after awaiting the fetch; the rule can't see through the async helper.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadImages();
    return () => {
      loadSeqRef.current += 1;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once on mount — rawImageId is intentionally not a dep (deep-link only)

  // Reload when admin state changes after the session first resolves: sign-out must drop hidden photos, and a late
  // (silent) sign-in must bring them in. The first resolved value is only a baseline — the mount load already
  // fetched with whatever cookie there was. `listAdminRef` is what the applied list was loaded for; `wantedAdminRef`
  // is the target of the latest load started. A failed reload rolls `wanted` back so the next change can retry.
  const resolvedAdmin = me === undefined ? undefined : !!me?.isAdmin;
  const listAdminRef = useRef<boolean | undefined>(undefined);
  const wantedAdminRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (resolvedAdmin === undefined) return;
    if (wantedAdminRef.current === undefined) {
      wantedAdminRef.current = resolvedAdmin;
      listAdminRef.current = resolvedAdmin;
      return;
    }
    if (wantedAdminRef.current === resolvedAdmin) return;
    wantedAdminRef.current = resolvedAdmin;
    void loadImages().then((applied) => {
      if (applied) listAdminRef.current = resolvedAdmin;
      else if (wantedAdminRef.current === resolvedAdmin) wantedAdminRef.current = listAdminRef.current;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedAdmin]); // loadImages reads the latest selection/list through refs

  // Track the device for the "you are here" dot.
  useEffect(() => (hasGps() ? watchPosition(setUserPosition) : undefined), []);

  // Sync modal state when URL changes (browser back/forward navigation)
  // `images` must be loaded before we can resolve image IDs
  useEffect(() => {
    // Once the URL has left the photo a reload closed, forget it — even with an empty list — so a later visit to
    // that id is handled like any other unknown id.
    if (!rawImageId || extractImageId(rawImageId) !== closedIdRef.current) closedIdRef.current = null;
    if (images.length === 0) return;

    if (!rawImageId) {
      // Syncing local modal state to a router-owned URL param, not deriving state from props.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedImage(null);
      setNearbyGroup([]);
      return;
    }

    const cleanId = extractImageId(rawImageId);
    const image = images.find(img => img.id === cleanId);
    if (!image) {
      // A reload dropped the open photo and is already heading to /map; anything else unknown goes to the landing page.
      if (cleanId !== closedIdRef.current) navigate('/', { replace: true });
      return;
    }

    // Only update state if the URL-driven image differs from current selection
    if (image.id !== selectedImage?.id) {
      const group = lightboxOrder(image, images);
      setSelectedImage(image);
      setNearbyGroup(group);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawImageId, images]); // selectedImage excluded — prevents loop on handleNavigate updates
  const onMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
    if (pendingPanRef.current) {
      map.panTo(pendingPanRef.current);
      pendingPanRef.current = null;
    } else if (!rawImageId && hasGps()) {
      // Start at the device, wide enough to show the nearest image. MapView calls this once, when the map mounts.
      void getPosition().then((pos) => {
        if (pos && mapRef.current === map) map.fitBounds(initialViewBounds(pos, images));
      });
    }
  }, [images, rawImageId]);

  // A pending move is read through a ref so handleImageSelect stays stable (MapView rebuilds markers when it changes).
  const moveRef = useRef(move);
  useEffect(() => {
    moveRef.current = move;
  }, [move]);

  const handleImageSelect = useCallback((imageId: string) => {
    if (moveRef.current) {
      // While a move is pending, tapping any marker discards it rather than opening a photo.
      dispatchMove({ type: 'discard' });
      return;
    }
    const cleanId = extractImageId(imageId);
    const image = images.find(img => img.id === cleanId);
    if (!image) return;
    const group = lightboxOrder(image, images);
    setSelectedImage(image);
    setNearbyGroup(group);
    navigate(`/map/image/${image.id}`);
  }, [images, navigate]);

  const handleImageNavigated = useCallback((imageId: string) => {
    const image = images.find(img => img.id === imageId);
    if (image && mapRef.current) {
      mapRef.current.panTo([image.latitude, image.longitude]);
    }
  }, [images]);

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!selectedImage || nearbyGroup.length <= 1) return;
    const currentIndex = nearbyGroup.findIndex(img => img.id === selectedImage.id);
    const nextIndex = direction === 'prev'
      ? (currentIndex > 0 ? currentIndex - 1 : nearbyGroup.length - 1)
      : (currentIndex < nearbyGroup.length - 1 ? currentIndex + 1 : 0);
    const nextImage = nearbyGroup[nextIndex];
    setSelectedImage(nextImage);
    navigate(`/map/image/${nextImage.id}`, { replace: true });
    handleImageNavigated(nextImage.id);
  }, [selectedImage, nearbyGroup, navigate, handleImageNavigated]);

  const handleMarkerDrop = useCallback((imageId: string, to: LatLng, targetId?: string) => {
    const image = images.find(img => img.id === imageId);
    if (!image) return;
    dispatchMove({ type: 'drop', imageId, from: { lat: image.latitude, lng: image.longitude }, to, targetId });
  }, [images]);

  // Swap the records an admin mutation returned (by id) into the list, the open photo and its lightbox order.
  const mergeRecords = useCallback((updated: ImageRecord[]) => {
    const byId = new Map(updated.map(img => [img.id, img]));
    const merge = (img: ImageRecord) => byId.get(img.id) ?? img;
    setImages(prev => prev.map(merge));
    setNearbyGroup(prev => prev.map(merge));
    setSelectedImage(prev => (prev ? merge(prev) : prev));
  }, []);

  const showToast = useCallback((text: string) => setToast(prev => ({ id: (prev?.id ?? 0) + 1, text })), []);

  const discardMove = useCallback(() => dispatchMove({ type: 'discard' }), []);

  const handleAccept = useCallback(() => {
    if (!move || move.status !== 'pending') return;
    dispatchMove({ type: 'accept' });
    // Dropped onto another marker: group with it. Either call returns every affected record (a moved or dragged
    // group representative brings its whole group along).
    const { imageId, targetId, to } = move;
    const save = targetId
      ? apiClient.groupImages(imageId, targetId).catch((err: unknown) => {
        console.error('Failed to group images:', err);
        showToast(GROUP_SAVE_ERROR);
        return null;
      })
      : apiClient.setImageLocation(imageId, to.lat, to.lng).catch((err: unknown) => {
        console.error('Failed to save image location:', err);
        showToast(SAVE_ERROR);
        return null;
      });
    void save
      .then((updated) => {
        if (updated) mergeRecords(updated);
      })
      .finally(() => dispatchMove({ type: 'settled' }));
  }, [move, mergeRecords, showToast]);

  // Hide/unhide the open photo. The API returns every record sharing its content hash (new URLs, `hidden` flag).
  const handleToggleHidden = useCallback(() => {
    if (!selectedImage || visibilityBusy) return;
    setVisibilityBusy(true);
    apiClient
      .setHidden(selectedImage.id, !selectedImage.hidden)
      .then(mergeRecords)
      .catch((err: unknown) => {
        console.error('Failed to change image visibility:', err);
        showToast(VISIBILITY_ERROR);
      })
      .finally(() => setVisibilityBusy(false));
  }, [selectedImage, visibilityBusy, mergeRecords, showToast]);

  // Take the open photo out of its group. The API returns it and any partner a two-photo group leaves behind.
  const handleUngroup = useCallback(() => {
    if (!selectedImage || groupBusy) return;
    setGroupBusy(true);
    apiClient
      .ungroupImage(selectedImage.id)
      .then((updated) => {
        mergeRecords(updated);
        // Membership changed, so the lightbox order does too: rebuild it from the merged list.
        const byId = new Map(updated.map(img => [img.id, img]));
        const merge = (img: ImageRecord) => byId.get(img.id) ?? img;
        const selected = selectedRef.current;
        if (selected) setNearbyGroup(lightboxOrder(merge(selected), imagesRef.current.map(merge)));
      })
      .catch((err: unknown) => {
        console.error('Failed to change image group:', err);
        showToast(UNGROUP_ERROR);
      })
      .finally(() => setGroupBusy(false));
  }, [selectedImage, groupBusy, mergeRecords, showToast]);

  // Escape discards a pending move; only listen while there is one.
  const hasMove = move !== null;
  useEffect(() => {
    if (!hasMove) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatchMove({ type: 'discard' });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hasMove]);

  // Signing out (or losing admin) mid-move drops the move so the marker snaps back and the album FAB returns.
  useEffect(() => {
    if (!isAdmin && hasMove) dispatchMove({ type: 'discard' });
  }, [isAdmin, hasMove]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Stable identity so MapView only repositions markers when the move actually changes.
  const moveId = move?.imageId;
  const moveLat = move?.to.lat;
  const moveLng = move?.to.lng;
  const pendingMove = useMemo(
    () => (moveId !== undefined && moveLat !== undefined && moveLng !== undefined
      ? { imageId: moveId, to: { lat: moveLat, lng: moveLng } }
      : null),
    [moveId, moveLat, moveLng],
  );

  const handleCloseModal = useCallback(() => {
    setSelectedImage(null);
    setNearbyGroup([]);
    navigate('/map');
  }, [navigate]);

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
        <h1>Spyo Map</h1>
        <div className="map-header-right">
          <div className="image-count">{images.length} geo-tagged images</div>
          <HeaderAccount me={me} onSignOut={signOut} />
        </div>
      </header>

      <div className="map-wrapper">
        <MapView
          images={images}
          selectedImageId={selectedImage?.id}
          onImageSelect={handleImageSelect}
          onMapReady={onMapReady}
          userPosition={userPosition}
          editable={isAdmin && move?.status !== 'saving'}
          onMarkerDrop={handleMarkerDrop}
          pendingMove={pendingMove}
          onMapClick={discardMove}
        />
      </div>

      {showAlbum && !selectedImage && !move && (
        <button
          type="button"
          className="fab"
          aria-label="Open photo album"
          onClick={() => void nativeOpenGallery()}
        >
          <img src={albumIcon} alt="" className="fab-icon" />
        </button>
      )}

      {isAdmin && move && (
        <Suspense fallback={null}>
          <MoveAccept
            variant={move.targetId ? 'group' : 'move'}
            saving={move.status === 'saving'}
            onAccept={handleAccept}
          />
        </Suspense>
      )}

      {toast && (
        <div key={toast.id} className="map-toast" role="status">
          {toast.text}
        </div>
      )}

      <ImageModal
        image={selectedImage}
        nearbyImages={nearbyGroup}
        isOpen={!!selectedImage}
        onClose={handleCloseModal}
        onNavigate={handleNavigate}
        onImageNavigated={handleImageNavigated}
        adminActions={isAdmin && selectedImage ? (
          <Suspense fallback={null}>
            {selectedImage.groupId && <UngroupButton busy={groupBusy} onUngroup={handleUngroup} />}
            <VisibilityButton image={selectedImage} busy={visibilityBusy} onToggle={handleToggleHidden} />
          </Suspense>
        ) : undefined}
      />
    </div>
  );
};

export default MapPage;
