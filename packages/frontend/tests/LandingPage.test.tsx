import { render, screen } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router';
import LandingPage, { LANDING_SEEN_KEY } from '../src/components/LandingPage';

const g = globalThis as unknown as { Capacitor?: unknown };

function renderAtRoot() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/map" element={<p>map page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LandingPage first-launch behaviour', () => {
  afterEach(() => {
    delete g.Capacitor;
    localStorage.clear();
  });

  it('always shows the landing page in a browser', () => {
    localStorage.setItem(LANDING_SEEN_KEY, '1');
    renderAtRoot();
    expect(screen.getByRole('link', { name: /view map/i })).toBeInTheDocument();
  });

  it('shows the landing page once in the app, then goes straight to the map', () => {
    g.Capacitor = { isNativePlatform: () => true, Plugins: { SpyoNative: {} } };
    const first = renderAtRoot();
    expect(screen.getByRole('link', { name: /view map/i })).toBeInTheDocument();
    first.unmount();

    renderAtRoot();
    expect(screen.getByText('map page')).toBeInTheDocument();
  });
});

describe('LandingPage', () => {
  it('should render title and description', () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(
      screen.getByText(/interactive map documenting my walks/i)
    ).toBeInTheDocument();
  });

  it('should render a View Map button', () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );
    expect(screen.getByRole('link', { name: /view map/i })).toBeInTheDocument();
  });

  it('should navigate to /map when View Map button is clicked', async () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );
    const link = screen.getByRole('link', { name: /view map/i });
    expect(link).toHaveAttribute('href', '/map');
  });
});
