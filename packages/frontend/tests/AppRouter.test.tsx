import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  });

  it('should render MapPage at /map', () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <AppRouter />
      </MemoryRouter>
    );
    // MapPage contains "Spyo Map" header and image count or loading
    expect(screen.getByRole('heading', { name: /spyo map/i })).toBeInTheDocument();
  });

  it('should render MapPage at /map/image/:imageId', () => {
    render(
      <MemoryRouter initialEntries={['/map/image/test-id']}>
        <AppRouter />
      </MemoryRouter>
    );
    // MapPage contains "Spyo Map" heading
    expect(screen.getByRole('heading', { name: /spyo map/i })).toBeInTheDocument();
  });
});
