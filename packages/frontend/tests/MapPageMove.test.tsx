import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { ImageRecord } from '../../shared/src/types';
import type { LatLng } from '../src/utils/moveGesture';

interface CapturedProps {
  images: ImageRecord[];
  editable?: boolean;
  pendingMove?: { imageId: string; to: LatLng } | null;
  onImageSelect: (id: string) => void;
  onMarkerDrop?: (id: string, to: LatLng) => void;
  onMapClick?: () => void;
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
      <button type="button" onClick={() => p.onMarkerDrop?.('a', { lat: 1, lng: 2 })}>
        drop a
      </button>
    );
  },
}));

jest.unstable_mockModule('../src/components/ImageModal', () => ({ default: () => null }));

const session = { useSession: jest.fn<() => { me: unknown; signOut: () => Promise<void> }>() };
jest.unstable_mockModule('../src/hooks/useSession', () => session);

const api = {
  getAllImages: jest.fn<() => Promise<ImageRecord[]>>(),
  setImageLocation: jest.fn<(id: string, lat: number, lon: number) => Promise<ImageRecord[]>>(),
};
jest.unstable_mockModule('../src/services', () => ({ apiClient: api, ApiClient: class {} }));

jest.unstable_mockModule('../src/utils/native', () => ({
  canOpenGallery: () => true,
  nativeOpenGallery: jest.fn(),
  isNativeApp: () => false,
}));
jest.unstable_mockModule('../src/utils/geolocation', () => ({
  hasGps: () => false,
  watchPosition: jest.fn(),
  getPosition: jest.fn(),
}));

const { default: MapPage } = await import('../src/components/MapPage');

const imageA: ImageRecord = {
  id: 'a',
  imageUrl: 'https://img.example/a.jpg',
  thumbnailUrl: 'https://img.example/a_t.jpg',
  uploaderName: 'MH',
  latitude: 10,
  longitude: 20,
  timestamp: '2024-01-01T12:00:00Z',
};

const PathProbe = () => <div data-testid="path">{useLocation().pathname}</div>;

const renderPage = async () => {
  render(
    <MemoryRouter initialEntries={['/map']}>
      <Routes>
        <Route path="/map" element={<MapPage />} />
        <Route path="/map/image/:imageId" element={<MapPage />} />
      </Routes>
      <PathProbe />
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'drop a' });
};

const asAdmin = () =>
  session.useSession.mockReturnValue({ me: { displayName: 'Ad', isAdmin: true }, signOut: async () => {} });

const dropAndWaitForAccept = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'drop a' }));
  return screen.findByRole('button', { name: 'Save new position' });
};

describe('MapPage admin move', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    lastProps = null;
    api.getAllImages.mockResolvedValue([imageA]);
  });

  it('is not editable for visitors', async () => {
    session.useSession.mockReturnValue({ me: null, signOut: async () => {} });
    await renderPage();
    expect(props().editable).toBeFalsy();
  });

  it('is not editable for non-admins', async () => {
    session.useSession.mockReturnValue({ me: { displayName: 'U', isAdmin: false }, signOut: async () => {} });
    await renderPage();
    expect(props().editable).toBeFalsy();
  });

  it('shows the accept button after a drop and hides the album fab', async () => {
    asAdmin();
    await renderPage();
    expect(props().editable).toBe(true);
    expect(screen.getByRole('button', { name: 'Open photo album' })).toBeInTheDocument();
    expect(await dropAndWaitForAccept()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open photo album' })).not.toBeInTheDocument();
    expect(props().pendingMove).toEqual({ imageId: 'a', to: { lat: 1, lng: 2 } });
  });

  it('accept saves, then merges the returned records', async () => {
    asAdmin();
    api.setImageLocation.mockResolvedValue([{ ...imageA, latitude: 1, longitude: 2 }]);
    await renderPage();
    fireEvent.click(await dropAndWaitForAccept());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save new position' })).not.toBeInTheDocument(),
    );
    expect(api.setImageLocation).toHaveBeenCalledTimes(1);
    expect(api.setImageLocation).toHaveBeenCalledWith('a', 1, 2);
    expect(props().pendingMove).toBeNull();
    expect(props().images).toEqual([{ ...imageA, latitude: 1, longitude: 2 }]);
  });

  it('accept failure snaps back and shows a toast', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      asAdmin();
      api.setImageLocation.mockRejectedValue(new Error('nope'));
      await renderPage();
      fireEvent.click(await dropAndWaitForAccept());
      expect(await screen.findByText("Couldn't save the new position.")).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save new position' })).not.toBeInTheDocument();
      expect(props().pendingMove).toBeNull();
      expect(props().images).toEqual([imageA]);
      expect(errorSpy).toHaveBeenCalledWith('Failed to save image location:', expect.anything());
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('is not editable while a save is in flight', async () => {
    asAdmin();
    api.setImageLocation.mockReturnValue(new Promise<ImageRecord[]>(() => {}));
    await renderPage();
    fireEvent.click(await dropAndWaitForAccept());
    expect(screen.getByRole('button', { name: 'Save new position' })).toBeDisabled();
    expect(props().editable).toBe(false);
  });

  it('losing admin discards a pending move and brings the album fab back', async () => {
    asAdmin();
    const view = render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'drop a' });
    await dropAndWaitForAccept();
    session.useSession.mockReturnValue({ me: { displayName: 'U', isAdmin: false }, signOut: async () => {} });
    view.rerender(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    expect(props().pendingMove).toBeNull();
    expect(props().editable).toBeFalsy();
    expect(screen.getByRole('button', { name: 'Open photo album' })).toBeInTheDocument();
  });

  it('Escape discards a pending move without calling the API', async () => {
    asAdmin();
    await renderPage();
    await dropAndWaitForAccept();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props().pendingMove).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save new position' })).not.toBeInTheDocument();
    expect(api.setImageLocation).not.toHaveBeenCalled();
  });

  it('selecting a marker while pending discards instead of opening the photo', async () => {
    asAdmin();
    await renderPage();
    await dropAndWaitForAccept();
    act(() => props().onImageSelect('a'));
    expect(props().pendingMove).toBeNull();
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/map$/);
  });

  it('a map click while pending discards', async () => {
    asAdmin();
    await renderPage();
    await dropAndWaitForAccept();
    act(() => props().onMapClick?.());
    expect(props().pendingMove).toBeNull();
  });
});

describe('MapPage admin move toast', () => {
  const TOAST = "Couldn't save the new position.";
  let errorSpy: ReturnType<typeof jest.spyOn>;

  // The lazy MoveAccept chunk is already resolved by the suite above, so no real-timer waiting is needed here.
  const flush = () => act(async () => { await jest.advanceTimersByTimeAsync(0); });
  const advance = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
  const failOnce = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'drop a' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Save new position' }));
    await flush();
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    lastProps = null;
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.useFakeTimers();
    asAdmin();
    api.getAllImages.mockResolvedValue([imageA]);
    api.setImageLocation.mockRejectedValue(new Error('nope'));
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    await flush();
  });

  afterEach(() => {
    jest.useRealTimers();
    errorSpy.mockRestore();
  });

  it('clears after 3s', async () => {
    await failOnce();
    expect(screen.getByText(TOAST)).toBeInTheDocument();
    await advance(2999);
    expect(screen.getByText(TOAST)).toBeInTheDocument();
    await advance(1);
    expect(screen.queryByText(TOAST)).not.toBeInTheDocument();
  });

  it('restarts the 3s timer on a repeat identical failure', async () => {
    await failOnce();
    await advance(2000);
    await failOnce();
    await advance(2000);
    expect(screen.getByText(TOAST)).toBeInTheDocument();
    await advance(1000);
    expect(screen.queryByText(TOAST)).not.toBeInTheDocument();
  });
});
