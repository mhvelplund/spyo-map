import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import {
  IDENTITY,
  clampPan,
  distance,
  isZoomed,
  midpoint,
  pan,
  pinch,
  toggleZoom,
  zoomAt,
  type Point,
  type ZoomState,
} from '../utils/zoom';

/** A press that moves less than this (px) and lifts within TAP_MS is a tap. */
const TAP_SLOP = 10;
const TAP_MS = 300;
/** Two taps within this window (ms) and radius (px) are a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 30;
const WHEEL_SENSITIVITY = 0.002;

interface Options {
  /** Gestures are only handled while enabled; disabling resets the zoom. */
  enabled: boolean;
  /** Changing this (e.g. the image id) resets the zoom. */
  resetKey: string | undefined;
  containerRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  /** Called for a single tap, once it is clear it is not the first half of a double tap. */
  onSingleTap?: () => void;
}

interface PinchStart {
  state: ZoomState;
  mid: Point;
  distance: number;
}

interface TapCandidate {
  point: Point;
  time: number;
}

export interface ZoomPan {
  state: ZoomState;
  zoomed: boolean;
  /** True while fingers/mouse are actively pinching or panning (disable CSS transitions). */
  gesturing: boolean;
  handlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  };
}

export function useZoomPan({
  enabled,
  resetKey,
  containerRef,
  contentRef,
  onSingleTap,
}: Options): ZoomPan {
  const [state, setStateRaw] = useState<ZoomState>(IDENTITY);
  const [gesturing, setGesturing] = useState(false);
  const stateRef = useRef<ZoomState>(IDENTITY);
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<PinchStart | null>(null);
  const panLast = useRef<Point | null>(null);
  const tapCandidate = useRef<TapCandidate | null>(null);
  const lastTap = useRef<TapCandidate | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSingleTapRef = useRef(onSingleTap);
  useEffect(() => {
    onSingleTapRef.current = onSingleTap;
  }, [onSingleTap]);

  // Reset whenever zoom is switched off or the image changes (state adjusted during render, refs in the effect below).
  const resetToken = `${enabled}:${resetKey ?? ''}`;
  const [prevResetToken, setPrevResetToken] = useState(resetToken);
  if (prevResetToken !== resetToken) {
    setPrevResetToken(resetToken);
    setStateRaw(IDENTITY);
    setGesturing(false);
  }

  const setState = useCallback(
    (next: ZoomState) => {
      const container = containerRef.current;
      const content = contentRef.current;
      const clamped =
        container && content
          ? clampPan(
              next,
              { width: container.clientWidth, height: container.clientHeight },
              { width: content.offsetWidth, height: content.offsetHeight },
            )
          : next;
      stateRef.current = clamped;
      setStateRaw(clamped);
    },
    [containerRef, contentRef],
  );

  const clearSingleTap = () => {
    if (singleTapTimer.current !== null) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
    }
  };

  useEffect(() => {
    stateRef.current = IDENTITY;
    pointers.current.clear();
    pinchStart.current = null;
    panLast.current = null;
    tapCandidate.current = null;
    lastTap.current = null;
    clearSingleTap();
  }, [resetToken]);

  useEffect(() => clearSingleTap, []);

  /** Pointer position relative to the container centre. */
  const toLocal = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: clientX, y: clientY };
      return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
    },
    [containerRef],
  );

  // Wheel zoom (desktop). Must be a non-passive native listener so it can preventDefault page scrolling.
  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const focus = toLocal(e.clientX, e.clientY);
      const current = stateRef.current;
      setState(zoomAt(current, focus, current.scale * Math.exp(-e.deltaY * WHEEL_SENSITIVITY)));
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [enabled, containerRef, toLocal, setState]);

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    pinchStart.current = { state: stateRef.current, mid: midpoint(a, b), distance: distance(a, b) };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled) return;
    const point = toLocal(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, point);
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Capture is best-effort (unsupported in some environments).
    }

    if (pointers.current.size === 2) {
      tapCandidate.current = null;
      panLast.current = null;
      startPinch();
      setGesturing(true);
    } else if (pointers.current.size === 1) {
      tapCandidate.current = { point, time: e.timeStamp };
      panLast.current = point;
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || !pointers.current.has(e.pointerId)) return;
    const point = toLocal(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, point);

    const tap = tapCandidate.current;
    if (tap && distance(tap.point, point) > TAP_SLOP) {
      tapCandidate.current = null;
    }

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const start = pinchStart.current;
      setState(pinch(start.state, start.mid, start.distance, midpoint(a!, b!), distance(a!, b!)));
      return;
    }

    if (pointers.current.size === 1 && isZoomed(stateRef.current) && panLast.current) {
      setGesturing(true);
      setState(pan(stateRef.current, point.x - panLast.current.x, point.y - panLast.current.y));
      panLast.current = point;
    }
  };

  const endPointer = (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    const point = toLocal(e.clientX, e.clientY);
    pointers.current.delete(e.pointerId);

    if (pointers.current.size === 1) {
      // Pinch ended with one finger still down: continue as a pan from where that finger is.
      pinchStart.current = null;
      tapCandidate.current = null;
      panLast.current = [...pointers.current.values()][0] ?? null;
      return;
    }
    if (pointers.current.size > 1) {
      startPinch();
      return;
    }

    pinchStart.current = null;
    panLast.current = null;
    setGesturing(false);

    const tap = tapCandidate.current;
    tapCandidate.current = null;
    if (cancelled || !tap || e.timeStamp - tap.time > TAP_MS) return;

    const previous = lastTap.current;
    if (
      previous &&
      e.timeStamp - previous.time <= DOUBLE_TAP_MS &&
      distance(previous.point, point) <= DOUBLE_TAP_SLOP
    ) {
      lastTap.current = null;
      clearSingleTap();
      setState(toggleZoom(stateRef.current, point));
      return;
    }

    lastTap.current = { point, time: e.timeStamp };
    clearSingleTap();
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      lastTap.current = null;
      onSingleTapRef.current?.();
    }, DOUBLE_TAP_MS);
  };

  return {
    state,
    zoomed: isZoomed(state),
    gesturing,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => endPointer(e, false),
      onPointerCancel: (e) => endPointer(e, true),
    },
  };
}
