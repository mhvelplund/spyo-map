import type React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ImageRecord } from '../../shared/src/types';
import type { LatLng } from '../src/utils/moveGesture';

interface CapturedProps {
  images: ImageRecord[];
  pendingMove?: { imageId: string; to: LatLng } | null;
  onMarkerDrop?: (id: string, to: LatLng, targetId?: string) => void;
}

let lastProps: CapturedProps | null = null;
const props = (): CapturedProps => {
  if (!lastProps) throw new Error('MapView not rendered');
  return lastProps;
};

jest.unstable_mockModule('../src/components/MapView', () => ({
  default: (p: CapturedProps) => {
    lastProps = p;
    return (
      <>
        <button type="button" onClick={() => p.onMarkerDrop?.('a', { lat: 1, lng: 2 }, 'b')}>drop a on b</button>
        <button type="button" onClick={() => p.onMarkerDrop?.('a', { lat: 1, lng: 2 })}>drop a</button>
      </>
    );
  },
}));

interface ModalProps {
  image: ImageRecord | null;
  nearbyImages: ImageRecord[];
  isOpen: boolean;
  adminActions?: React.ReactNode;
}
jest.unstable_mockModule('../src/components/ImageModal', () => ({
  default: ({ image, nearbyImages, isOpen, adminActions }: ModalProps) => (isOpen && image ? (
    <div role="dialog">
      <div data-testid="order">{nearbyImages.map(img => img.id).join(',')}</div>
      {adminActions}
    </div>
  ) : null),
}));

const session = { useSession: jest.fn<() => { me: unknown; signOut: () => Promise<void> }>() };
jest.unstable_mockModule('../src/hooks/useSession', () => session);

const api = {
  getAllImages: jest.fn<() => Promise<ImageRecord[]>>(),
  setImageLocation: jest.fn<(id: string, lat: number, lon: number) => Promise<ImageRecord[]>>(),
  groupImages: jest.fn<(id: string, targetId: string) => Promise<ImageRecord[]>>(),
  ungroupImage: jest.fn<(id: string) => Promise<ImageRecord[]>>(),
};
jest.unstable_mockModule('../src/services', () => ({ apiClient: api, ApiClient: class {} }));

jest.unstable_mockModule('../src/utils/native', () => ({
  canOpenGallery: () => false,
  nativeOpenGallery: jest.fn(),
  isNativeApp: () => false,
}));
jest.unstable_mockModule('../src/utils/geolocation', () => ({
  hasGps: () => false,
  watchPosition: jest.fn(),
  getPosition: jest.fn(),
}));

const { default: MapPage } = await import('../src/components/MapPage');

const base: ImageRecord = {
  id: 'a',
  imageUrl: 'https://img.example/a.jpg',
  thumbnailUrl: 'https://img.example/a_t.jpg',
  uploaderName: 'MH',
  latitude: 10,
  longitude: 20,
  timestamp: '2024-01-01T12:00:00Z',
};
const imageA: ImageRecord = base;
const imageB: ImageRecord = { ...base, id: 'b', latitude: 50, longitude: 60 };
const groupedB: ImageRecord = { ...imageB, groupId: 'g1', groupedAt: '2026-01-01T00:00:00Z' };
const groupedA: ImageRecord = {
  ...imageA, latitude: 50, longitude: 60, groupId: 'g1', groupedAt: '2026-01-02T00:00:00Z',
};

// A grouped pair 'a' (joined later) and 'b' (the group's first), plus ungrouped 'c', which is closer to 'a' than 'b'.
const nearA: ImageRecord = { ...imageA, groupId: 'g2', groupedAt: '2026-02-02T00:00:00Z' };
const nearB: ImageRecord = { ...base, id: 'b', longitude: 20.002, groupId: 'g2', groupedAt: '2026-02-01T00:00:00Z' };
const nearC: ImageRecord = { ...base, id: 'c', longitude: 20.001 };

const asAdmin = () =>
  session.useSession.mockReturnValue({ me: { displayName: 'Ad', isAdmin: true }, signOut: async () => {} });
const asVisitor = () => session.useSession.mockReturnValue({ me: null, signOut: async () => {} });

const renderAt = async (path: string) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/map" element={<MapPage />} />
        <Route path="/map/image/:imageId" element={<MapPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'drop a' });
};

describe('MapPage admin group', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    lastProps = null;
    api.getAllImages.mockResolvedValue([imageA, imageB]);
  });

  it('passes the full image list to MapView (it collapses groups itself)', async () => {
    asVisitor();
    api.getAllImages.mockResolvedValue([nearA, nearB, nearC]);
    await renderAt('/map');
    expect(props().images).toEqual([nearA, nearB, nearC]);
  });

  it('a drop onto another marker offers "Group photos"; accept groups, then merges', async () => {
    asAdmin();
    api.groupImages.mockResolvedValue([groupedB, groupedA]);
    await renderAt('/map');
    fireEvent.click(screen.getByRole('button', { name: 'drop a on b' }));
    const accept = await screen.findByRole('button', { name: 'Group photos' });
    expect(screen.queryByRole('button', { name: 'Save new position' })).not.toBeInTheDocument();
    fireEvent.click(accept);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Group photos' })).not.toBeInTheDocument());
    expect(api.groupImages).toHaveBeenCalledTimes(1);
    expect(api.groupImages).toHaveBeenCalledWith('a', 'b');
    expect(api.setImageLocation).not.toHaveBeenCalled();
    expect(props().images).toEqual([groupedA, groupedB]);
    expect(props().pendingMove).toBeNull();
  });

  it('a re-drop of the same photo without a target is a plain move again', async () => {
    asAdmin();
    await renderAt('/map');
    fireEvent.click(screen.getByRole('button', { name: 'drop a on b' }));
    await screen.findByRole('button', { name: 'Group photos' });
    fireEvent.click(screen.getByRole('button', { name: 'drop a' }));
    expect(await screen.findByRole('button', { name: 'Save new position' })).toBeInTheDocument();
  });

  it('shows a toast and keeps the records when grouping fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      asAdmin();
      api.groupImages.mockRejectedValue(new Error('nope'));
      await renderAt('/map');
      fireEvent.click(screen.getByRole('button', { name: 'drop a on b' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Group photos' }));
      expect(await screen.findByText("Couldn't group the photos.")).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Group photos' })).not.toBeInTheDocument();
      expect(props().pendingMove).toBeNull();
      expect(props().images).toEqual([imageA, imageB]);
      expect(errorSpy).toHaveBeenCalledWith('Failed to group images:', expect.anything());
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('orders the lightbox of a grouped photo: group members first, then nearby photos', async () => {
    asVisitor();
    api.getAllImages.mockResolvedValue([nearA, nearB, nearC]);
    await renderAt('/map/image/a');
    expect(await screen.findByTestId('order')).toHaveTextContent('a,b,c');
  });

  it('shows Ungroup to admins on a grouped photo; it ungroups and merges', async () => {
    asAdmin();
    api.getAllImages.mockResolvedValue([nearA, nearB, nearC]);
    const plainA: ImageRecord = { ...imageA };
    const plainB: ImageRecord = { ...base, id: 'b', longitude: 20.002 };
    api.ungroupImage.mockResolvedValue([plainA, plainB]);
    await renderAt('/map/image/a');
    fireEvent.click(await screen.findByRole('button', { name: 'Ungroup photo' }));
    expect(api.ungroupImage).toHaveBeenCalledTimes(1);
    expect(api.ungroupImage).toHaveBeenCalledWith('a');
    await waitFor(() => expect(props().images).toEqual([plainA, plainB, nearC]));
    expect(screen.queryByRole('button', { name: 'Ungroup photo' })).not.toBeInTheDocument();
    // The lightbox order is recomputed: 'c' is nearer to 'a' than 'b', which is no longer a group member.
    expect(screen.getByTestId('order')).toHaveTextContent('a,c,b');
  });

  it('shows a toast when ungrouping fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      asAdmin();
      api.getAllImages.mockResolvedValue([nearA, nearB, nearC]);
      api.ungroupImage.mockRejectedValue(new Error('nope'));
      await renderAt('/map/image/a');
      fireEvent.click(await screen.findByRole('button', { name: 'Ungroup photo' }));
      expect(await screen.findByText("Couldn't change the group.")).toBeInTheDocument();
      expect(props().images).toEqual([nearA, nearB, nearC]);
      expect(screen.getByRole('button', { name: 'Ungroup photo' })).toBeEnabled();
      expect(errorSpy).toHaveBeenCalledWith('Failed to change image group:', expect.anything());
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('shows no Ungroup to admins on an ungrouped photo', async () => {
    asAdmin();
    api.getAllImages.mockResolvedValue([nearA, nearB, nearC]);
    await renderAt('/map/image/c');
    // Admin actions share one Suspense boundary, so once Hide shows, Ungroup would have too.
    await screen.findByRole('button', { name: 'Hide photo' });
    expect(screen.queryByRole('button', { name: 'Ungroup photo' })).not.toBeInTheDocument();
  });

  it('shows no Ungroup to visitors', async () => {
    asVisitor();
    api.getAllImages.mockResolvedValue([nearA, nearB, nearC]);
    await renderAt('/map/image/a');
    await screen.findByTestId('order');
    expect(screen.queryByRole('button', { name: 'Ungroup photo' })).not.toBeInTheDocument();
  });
});
