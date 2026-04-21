import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import LandingPage from '../src/components/LandingPage';

describe('LandingPage', () => {
  it('should render title and description', () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/explore geo-tagged photos/i)).toBeInTheDocument();
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
