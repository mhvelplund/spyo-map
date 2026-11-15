export const LONG_PRESS_MS = 500;
export const MOVE_TOLERANCE_PX = 8;

export type PressState =
  | { kind: 'idle' }
  | { kind: 'pending'; x: number; y: number }
  | { kind: 'armed' };

export type PressEvent =
  | { type: 'down'; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'timeout' }
  | { type: 'up' }
  | { type: 'cancel' };

export function pressReducer(state: PressState, event: PressEvent): PressState {
  switch (event.type) {
    case 'down':
      return { kind: 'pending', x: event.x, y: event.y };
    case 'timeout':
      return state.kind === 'pending' ? { kind: 'armed' } : state;
    case 'move':
      if (state.kind === 'pending') {
        const dist = Math.hypot(event.x - state.x, event.y - state.y);
        return dist > MOVE_TOLERANCE_PX ? { kind: 'idle' } : state;
      }
      return state;
    case 'up':
    case 'cancel':
      return { kind: 'idle' };
  }
}

export interface LatLng {
  lat: number;
  lng: number;
}

export type MoveState =
  | null
  | { imageId: string; from: LatLng; to: LatLng; status: 'pending' | 'saving'; targetId?: string };

export type MoveAction =
  | { type: 'drop'; imageId: string; from: LatLng; to: LatLng; targetId?: string }
  | { type: 'accept' }
  | { type: 'settled' }
  | { type: 'discard' };

export function moveReducer(state: MoveState, action: MoveAction): MoveState {
  switch (action.type) {
    case 'drop':
      if (state && state.status === 'saving') return state;
      if (state && state.imageId === action.imageId) {
        return { ...state, to: action.to, targetId: action.targetId, status: 'pending' };
      }
      return {
        imageId: action.imageId,
        from: action.from,
        to: action.to,
        status: 'pending',
        targetId: action.targetId,
      };
    case 'accept':
      return state && state.status === 'pending' ? { ...state, status: 'saving' } : state;
    case 'discard':
      return state && state.status === 'saving' ? state : null;
    case 'settled':
      return null;
  }
}

/**
 * Whether a `lostpointercapture` heard on a marker element means the press really lost its pointer. The event bubbles,
 * and on touch the browser implicitly captures the pointer to the pressed child (the thumbnail `<img>`); moving capture
 * to the marker element on lift fires `lostpointercapture` at that child, which must not cancel the lift.
 */
export function isOwnCaptureLoss(eventTarget: EventTarget | null, el: EventTarget): boolean {
  return eventTarget === el;
}
