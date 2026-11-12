import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import MoveAccept from '../src/components/admin/MoveAccept';

describe('MoveAccept', () => {
  it('renders a "Save new position" fab that calls onAccept', () => {
    const onAccept = jest.fn();
    render(<MoveAccept saving={false} onAccept={onAccept} />);
    const button = screen.getByRole('button', { name: 'Save new position' });
    expect(button).toHaveClass('app-fab');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('is disabled while saving', () => {
    const onAccept = jest.fn();
    render(<MoveAccept saving onAccept={onAccept} />);
    const button = screen.getByRole('button', { name: 'Save new position' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onAccept).not.toHaveBeenCalled();
  });
});

describe('MoveAccept group variant', () => {
  it('renders a "Group photos" fab that calls onAccept', () => {
    const onAccept = jest.fn();
    render(<MoveAccept variant="group" saving={false} onAccept={onAccept} />);
    const button = screen.getByRole('button', { name: 'Group photos' });
    expect(button).toHaveClass('app-fab', 'move-accept');
    expect(screen.queryByRole('button', { name: 'Save new position' })).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('move variant keeps the "Save new position" label', () => {
    render(<MoveAccept variant="move" saving={false} onAccept={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Save new position' })).toBeInTheDocument();
  });
});
