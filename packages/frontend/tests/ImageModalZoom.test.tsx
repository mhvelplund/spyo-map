import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import type { ImageRecord } from '../../shared/src/types';
import ImageModal from '../src/components/ImageModal';

const base: ImageRecord = {
  id: 'z-1',
  imageUrl: 'https://example.com/z1.jpg',
  thumbnailUrl: 'https://example.com/z1-thumb.jpg',
  uploaderName: 'MH',
  latitude: 55.68,
  longitude: 12.57,
  timestamp: '2024-01-01T12:00:00Z',
};
const nearby: ImageRecord[] = [base, { ...base, id: 'z-2' }, { ...base, id: 'z-3' }];

/** Longer than the double-tap window, so a pending single tap has fired. */
const pastDoubleTapWindow = () => new Promise((resolve) => setTimeout(resolve, 400));

const container = () => document.querySelector('.image-container') as HTMLElement;
const img = () => screen.getByRole('img') as HTMLImageElement;

const tap = (x = 10, y = 10) => {
  fireEvent.pointerDown(container(), { pointerId: 1, clientX: x, clientY: y });
  fireEvent.pointerUp(container(), { pointerId: 1, clientX: x, clientY: y });
};

const doubleTap = () => {
  tap();
  tap();
};

const swipeLeft = () => {
  fireEvent.touchStart(container(), { touches: [{ clientX: 300, clientY: 100 }] });
  fireEvent.touchMove(container(), { touches: [{ clientX: 100, clientY: 100 }] });
  fireEvent.touchEnd(container(), { touches: [] });
};

function modal(image: ImageRecord, onNavigate = jest.fn()) {
  return (
    <ImageModal
      image={image}
      nearbyImages={nearby}
      isOpen={true}
      onClose={jest.fn()}
      onNavigate={onNavigate}
    />
  );
}

async function renderExpanded(onNavigate = jest.fn()) {
  const utils = render(modal(base, onNavigate));
  await userEvent.setup().click(img());
  // The click's own pointer events must not leave a pending tap behind.
  await pastDoubleTapWindow();
  expect(screen.getByRole('dialog')).toHaveClass('expanded');
  return utils;
}

describe('ImageModal - zoom in the expanded view', () => {
  it('does not zoom before the image is expanded', () => {
    render(modal(base));
    doubleTap();
    expect(img().style.transform).toBe('');
    expect(img()).not.toHaveClass('zoomed');
  });

  it('zooms in on double tap and stays expanded', async () => {
    await renderExpanded();
    doubleTap();
    expect(img().style.transform).toContain('scale(2.5)');
    expect(img()).toHaveClass('zoomed');
    await pastDoubleTapWindow();
    expect(screen.getByRole('dialog')).toHaveClass('expanded');
  });

  it('zooms back out on a second double tap', async () => {
    await renderExpanded();
    doubleTap();
    await pastDoubleTapWindow();
    doubleTap();
    expect(img().style.transform).toContain('scale(1)');
    expect(img()).not.toHaveClass('zoomed');
  });

  it('collapses on a single tap', async () => {
    await renderExpanded();
    tap();
    expect(screen.getByRole('dialog')).toHaveClass('expanded');
    await pastDoubleTapWindow();
    expect(screen.getByRole('dialog')).not.toHaveClass('expanded');
  });

  it('zooms with a pinch, and lifting the fingers is not a tap', async () => {
    await renderExpanded();
    fireEvent.pointerDown(container(), { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerDown(container(), { pointerId: 2, clientX: 100, clientY: 0 });
    fireEvent.pointerMove(container(), { pointerId: 2, clientX: 200, clientY: 0 });
    expect(img().style.transform).toContain('scale(2)');
    fireEvent.pointerUp(container(), { pointerId: 2, clientX: 200, clientY: 0 });
    fireEvent.pointerUp(container(), { pointerId: 1, clientX: 0, clientY: 0 });
    await pastDoubleTapWindow();
    expect(screen.getByRole('dialog')).toHaveClass('expanded');
  });

  it('navigates on a single-finger swipe at 1x', async () => {
    const onNavigate = jest.fn();
    await renderExpanded(onNavigate);
    swipeLeft();
    expect(onNavigate).toHaveBeenCalledWith('next');
  });

  it('does not navigate on a swipe while zoomed', async () => {
    const onNavigate = jest.fn();
    await renderExpanded(onNavigate);
    doubleTap();
    swipeLeft();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('does not treat a two-finger gesture as a swipe', async () => {
    const onNavigate = jest.fn();
    await renderExpanded(onNavigate);
    const two = [
      { clientX: 300, clientY: 100 },
      { clientX: 320, clientY: 120 },
    ];
    fireEvent.touchStart(container(), { touches: [two[0]] });
    fireEvent.touchStart(container(), { touches: two });
    fireEvent.touchMove(container(), {
      touches: [
        { clientX: 100, clientY: 100 },
        { clientX: 120, clientY: 120 },
      ],
    });
    fireEvent.touchEnd(container(), { touches: [{ clientX: 120, clientY: 120 }] });
    fireEvent.touchEnd(container(), { touches: [] });
    expect(onNavigate).not.toHaveBeenCalled();

    swipeLeft(); // A later single-finger swipe works again.
    expect(onNavigate).toHaveBeenCalledWith('next');
  });

  it('resets the zoom when the image changes', async () => {
    const { rerender } = await renderExpanded();
    doubleTap();
    expect(img()).toHaveClass('zoomed');
    rerender(modal(nearby[1]!));
    expect(img()).not.toHaveClass('zoomed');
    expect(img().style.transform).toContain('scale(1)');
  });

  it('resets the zoom when leaving expanded mode', async () => {
    await renderExpanded();
    doubleTap();
    await userEvent.setup().keyboard('{Escape}');
    expect(screen.getByRole('dialog')).not.toHaveClass('expanded');
    expect(img()).not.toHaveClass('zoomed');
    expect(img().style.transform).toBe('');
  });
});
