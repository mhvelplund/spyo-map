import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import UngroupButton from '../src/components/admin/UngroupButton';

describe('UngroupButton', () => {
  it('shows Ungroup and calls onUngroup', () => {
    const onUngroup = jest.fn();
    render(<UngroupButton busy={false} onUngroup={onUngroup} />);
    const button = screen.getByRole('button', { name: 'Ungroup photo' });
    expect(button).toHaveTextContent('Ungroup');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onUngroup).toHaveBeenCalledTimes(1);
  });

  it('is disabled while busy', () => {
    const onUngroup = jest.fn();
    render(<UngroupButton busy onUngroup={onUngroup} />);
    const button = screen.getByRole('button', { name: 'Ungroup photo' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onUngroup).not.toHaveBeenCalled();
  });
});
