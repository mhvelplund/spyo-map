import { render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { ImageRecord } from '../../shared/src/types';
import ImageModal from '../src/components/ImageModal';

describe('ImageModal - onImageNavigated prop', () => {
  const mockImage: ImageRecord = {
    id: 'test-1',
    imageUrl: 'https://example.com/image.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    latitude: 40.7128,
    longitude: -74.006,
    timestamp: '2024-01-01T12:00:00Z',
    altitude: 100,
  };

  it('should accept onImageNavigated prop', () => {
    const onImageNavigated = jest.fn();
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={[mockImage]}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={jest.fn()}
        onImageNavigated={onImageNavigated}
      />
    );
    const modal = screen.getByRole('dialog');
    expect(modal).toBeInTheDocument();
  });

  it('should render without onImageNavigated prop when not provided', () => {
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={[mockImage]}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={jest.fn()}
      />
    );
    const modal = screen.getByRole('dialog');
    expect(modal).toBeInTheDocument();
  });
});
