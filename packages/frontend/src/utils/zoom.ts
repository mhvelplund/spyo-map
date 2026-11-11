/**
 * Pure zoom/pan math for the expanded lightbox.
 *
 * The image is rendered with `transform: translate(x, y) scale(scale)` and a centred transform-origin. All points are
 * measured in CSS pixels relative to the centre of the container (which is also the image's untransformed centre).
 */

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
export const DOUBLE_TAP_SCALE = 2.5;

export const IDENTITY: ZoomState = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function isZoomed(state: ZoomState): boolean {
  return state.scale > MIN_SCALE + 0.001;
}

/** Scale to `nextScale` while keeping the image point under `focus` fixed on screen. */
export function zoomAt(state: ZoomState, focus: Point, nextScale: number): ZoomState {
  const scale = clampScale(nextScale);
  if (scale === MIN_SCALE) return IDENTITY;
  const ratio = scale / state.scale;
  return {
    scale,
    x: focus.x - (focus.x - state.x) * ratio,
    y: focus.y - (focus.y - state.y) * ratio,
  };
}

/**
 * State during a pinch, given the state and finger geometry when the pinch started.
 * The point under the starting midpoint follows the current midpoint, so a two-finger drag also pans.
 */
export function pinch(
  start: ZoomState,
  startMid: Point,
  startDistance: number,
  mid: Point,
  distance: number,
): ZoomState {
  if (startDistance <= 0) return start;
  const scale = clampScale(start.scale * (distance / startDistance));
  if (scale === MIN_SCALE) return IDENTITY;
  const localX = (startMid.x - start.x) / start.scale;
  const localY = (startMid.y - start.y) / start.scale;
  return { scale, x: mid.x - localX * scale, y: mid.y - localY * scale };
}

export function pan(state: ZoomState, dx: number, dy: number): ZoomState {
  return { ...state, x: state.x + dx, y: state.y + dy };
}

/** Double-tap: zoom in around the tapped point, or back out if already zoomed. */
export function toggleZoom(state: ZoomState, focus: Point): ZoomState {
  return isZoomed(state) ? IDENTITY : zoomAt(state, focus, DOUBLE_TAP_SCALE);
}

/** Keep the scaled image covering the container where it can, so it can't be dragged off-screen. */
export function clampPan(state: ZoomState, container: Size, content: Size): ZoomState {
  const maxX = Math.max(0, (content.width * state.scale - container.width) / 2);
  const maxY = Math.max(0, (content.height * state.scale - container.height) / 2);
  return {
    scale: state.scale,
    x: Math.min(maxX, Math.max(-maxX, state.x)),
    y: Math.min(maxY, Math.max(-maxY, state.y)),
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function toTransform(state: ZoomState): string {
  return `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}
