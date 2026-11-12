import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { ImageRecord } from '../../shared/src/types';
import VisibilityButton from '../src/components/admin/VisibilityButton';

const image: ImageRecord = {
  id: 'a',
  imageUrl: 'https://img.example/a.jpg',
  thumbnailUrl: 'https://img.example/a_t.jpg',
  uploaderName: 'MH',
  latitude: 10,
  longitude: 20,
  timestamp: '2024-01-01T12:00:00Z',
};

describe('VisibilityButton', () => {
  it('shows Hide for a visible image and calls onToggle', () => {
    const onToggle = jest.fn();
    render(<VisibilityButton image={image} busy={false} onToggle={onToggle} />);
    const button = screen.getByRole('button', { name: 'Hide photo' });
    expect(button).toHaveTextContent('Hide');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows Unhide for a hidden image', () => {
    render(<VisibilityButton image={{ ...image, hidden: true }} busy={false} onToggle={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Unhide photo' })).toHaveTextContent('Unhide');
  });

  it('is disabled while busy', () => {
    const onToggle = jest.fn();
    render(<VisibilityButton image={image} busy onToggle={onToggle} />);
    const button = screen.getByRole('button', { name: 'Hide photo' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
