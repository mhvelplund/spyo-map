import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import type { ImageRecord } from '../../shared/src/types';
import ImageModal from '../src/components/ImageModal';

describe('ImageModal', () => {
  const mockImage: ImageRecord = {
    id: 'test-1',
    imageUrl: 'https://example.com/image.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    latitude: 40.7128,
    longitude: -74.006,
    timestamp: '2024-01-01T12:00:00Z',
    altitude: 100,
  };

  it('should render when open', () => {
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

  it('should not render when closed', () => {
    const { container } = render(
      <ImageModal
        image={mockImage}
        nearbyImages={[mockImage]}
        isOpen={false}
        onClose={jest.fn()}
        onNavigate={jest.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should display image', () => {
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={[mockImage]}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={jest.fn()}
      />
    );
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', mockImage.imageUrl);
  });

  it('should display metadata', () => {
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={[mockImage]}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={jest.fn()}
      />
    );
    const title = screen.getByText(/Photo taken on/);
    expect(title).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={[mockImage]}
        isOpen={true}
        onClose={onClose}
        onNavigate={jest.fn()}
      />
    );
    const closeButton = screen.getByLabelText('Close image modal');
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('should call onNavigate with prev when previous button is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();
    const nearby = [
      mockImage,
      { ...mockImage, id: 'test-2' },
    ];
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={nearby}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={onNavigate}
      />
    );
    const prevButton = screen.getByLabelText('Previous image');
    await user.click(prevButton);
    expect(onNavigate).toHaveBeenCalledWith('prev');
  });

  it('should call onNavigate with next when next button is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();
    const nearby = [
      mockImage,
      { ...mockImage, id: 'test-2' },
    ];
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={nearby}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={onNavigate}
      />
    );
    const nextButton = screen.getByLabelText('Next image');
    await user.click(nextButton);
    expect(onNavigate).toHaveBeenCalledWith('next');
  });

  it('should call onNavigate with prev on ArrowLeft', async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();
    const nearby = [
      mockImage,
      { ...mockImage, id: 'test-2' },
    ];
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={nearby}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={onNavigate}
      />
    );
    await user.keyboard('{ArrowLeft}');
    expect(onNavigate).toHaveBeenCalledWith('prev');
  });

  it('should call onNavigate with next on ArrowRight', async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();
    const nearby = [
      mockImage,
      { ...mockImage, id: 'test-2' },
    ];
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={nearby}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={onNavigate}
      />
    );
    await user.keyboard('{ArrowRight}');
    expect(onNavigate).toHaveBeenCalledWith('next');
  });

  it('should call onClose on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={[mockImage]}
        isOpen={true}
        onClose={onClose}
        onNavigate={jest.fn()}
      />
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ImageModal - Expansion', () => {
  const mockImage: ImageRecord = {
    id: 'test-1',
    imageUrl: 'https://example.com/image.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    latitude: 40.7128,
    longitude: -74.006,
    timestamp: '2024-01-01T12:00:00Z',
    altitude: 100,
  };

  it('should not be expanded by default', () => {
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
    expect(modal).not.toHaveClass('expanded');
  });

  it('should expand when image is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={[mockImage]}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={jest.fn()}
      />
    );
    const img = screen.getByRole('img');
    await user.click(img);
    const modal = screen.getByRole('dialog');
    expect(modal).toHaveClass('expanded');
  });

  it('should collapse when Escape is pressed while expanded', async () => {
    const user = userEvent.setup();
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={[mockImage]}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={jest.fn()}
      />
    );
    const img = screen.getByRole('img');
    await user.click(img); // Expand
    let modal = screen.getByRole('dialog');
    expect(modal).toHaveClass('expanded');

    await user.keyboard('{Escape}'); // Collapse
    modal = screen.getByRole('dialog');
    expect(modal).not.toHaveClass('expanded');
  });

  it('should collapse when image is clicked again while expanded', async () => {
    const user = userEvent.setup();
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={[mockImage]}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={jest.fn()}
      />
    );
    const img = screen.getByRole('img');
    await user.click(img); // Expand
    let modal = screen.getByRole('dialog');
    expect(modal).toHaveClass('expanded');

    await user.click(img); // Collapse
    modal = screen.getByRole('dialog');
    expect(modal).not.toHaveClass('expanded');
  });

  it('should allow arrow key navigation while expanded', async () => {
    const user = userEvent.setup();
    const onNavigate = jest.fn();
    const nearby = [
      mockImage,
      { ...mockImage, id: 'test-2' },
      { ...mockImage, id: 'test-3' },
    ];
    render(
      <ImageModal
        image={mockImage}
        nearbyImages={nearby}
        isOpen={true}
        onClose={jest.fn()}
        onNavigate={onNavigate}
      />
    );
    const img = screen.getByRole('img');
    await user.click(img); // Expand

    await user.keyboard('{ArrowRight}'); // Navigate next
    expect(onNavigate).toHaveBeenCalledWith('next');
  });
});
