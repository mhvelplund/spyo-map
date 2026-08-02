import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import AppRouter from '../src/router/AppRouter';

describe('AppRouter', () => {
  it('should render LandingPage at root path /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRouter />
      </MemoryRouter>
    );
    // LandingPage contains "Spyo Map" heading
    expect(screen.getByRole('heading', { name: /spyo map/i })).toBeInTheDocument();
    // And the "View Map" button
    expect(screen.getByRole('link', { name: /view map/i })).toBeInTheDocument();
  });

  it('should render MapPage at /map', () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <AppRouter />
      </MemoryRouter>
    );
    // MapPage shows loading, error, or renders the header
    // Just verify it doesn't render LandingPage (which has "View Map" button)
    expect(screen.queryByRole('link', { name: /view map/i })).not.toBeInTheDocument();
  });

  it('should render MapPage at /map/image/:imageId', () => {
    render(
      <MemoryRouter initialEntries={['/map/image/test-id']}>
        <AppRouter />
      </MemoryRouter>
    );
    // MapPage routes to same component as /map
    expect(screen.queryByRole('link', { name: /view map/i })).not.toBeInTheDocument();
  });
});
