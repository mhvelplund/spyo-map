import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ImageRecord } from '../../shared/src/types';

interface CapturedProps {
  images: ImageRecord[];
}

let lastProps: CapturedProps | null = null;
const props = (): CapturedProps => {
  if (!lastProps) throw new Error('MapView not rendered');
  return lastProps;
};

jest.unstable_mockModule('../src/components/MapView', () => ({
  default: (p: CapturedProps) => {
    lastProps = p;
    return <div data-testid="map" />;
  },
}));

const session = { useSession: jest.fn<() => { me: unknown; signOut: () => Promise<void> }>() };
jest.unstable_mockModule('../src/hooks/useSession', () => session);

const api = {
  getAllImages: jest.fn<() => Promise<ImageRecord[]>>(),
  setHidden: jest.fn<(id: string, hidden: boolean) => Promise<ImageRecord[]>>(),
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

const imageA: ImageRecord = {
  id: 'a',
  imageUrl: 'https://img.example/images/a.jpg',
  thumbnailUrl: 'https://img.example/images/thumbnails/a.jpg',
  uploaderName: 'MH',
  latitude: 10,
  longitude: 20,
  timestamp: '2024-01-01T12:00:00Z',
};
const hiddenA: ImageRecord = {
  ...imageA,
  hidden: true,
  imageUrl: 'https://img.example/private/f00.jpg',
  thumbnailUrl: 'https://img.example/private/thumbnails/f00.jpg',
};

const renderOpenLightbox = async () => {
  render(
    <MemoryRouter initialEntries={['/map/image/a']}>
      <Routes>
        <Route path="/map" element={<MapPage />} />
        <Route path="/map/image/:imageId" element={<MapPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('dialog');
};

const asAdmin = () =>
  session.useSession.mockReturnValue({ me: { displayName: 'Ad', isAdmin: true }, signOut: async () => {} });

describe('MapPage admin hide', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    lastProps = null;
    api.getAllImages.mockResolvedValue([imageA]);
  });

  it('shows no Hide button to visitors', async () => {
    session.useSession.mockReturnValue({ me: null, signOut: async () => {} });
    await renderOpenLightbox();
    expect(screen.queryByRole('button', { name: 'Hide photo' })).not.toBeInTheDocument();
  });

  it('hides the open photo and merges the returned record', async () => {
    asAdmin();
    api.setHidden.mockResolvedValue([hiddenA]);
    await renderOpenLightbox();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Hide photo' }));
    expect(api.setHidden).toHaveBeenCalledTimes(1);
    expect(api.setHidden).toHaveBeenCalledWith('a', true);
    expect(await screen.findByText('Hidden')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unhide photo' })).toBeEnabled();
    expect(props().images).toEqual([hiddenA]);
    expect(screen.getByRole('img', { name: /Taken on/ })).toHaveAttribute('src', hiddenA.imageUrl);
  });

  it('shows a toast and keeps the records when hiding fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      asAdmin();
      api.setHidden.mockRejectedValue(new Error('nope'));
      await renderOpenLightbox();
      fireEvent.click(await screen.findByRole('button', { name: 'Hide photo' }));
      expect(await screen.findByText("Couldn't change visibility.")).toBeInTheDocument();
      expect(props().images).toEqual([imageA]);
      expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hide photo' })).toBeEnabled();
      expect(errorSpy).toHaveBeenCalledWith('Failed to change image visibility:', expect.anything());
    } finally {
      errorSpy.mockRestore();
    }
  });
});
