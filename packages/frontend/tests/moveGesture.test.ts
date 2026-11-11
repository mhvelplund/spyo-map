import { describe, it, expect } from '@jest/globals';
import {
  pressReducer,
  moveReducer,
  type PressState,
  type MoveState,
} from '../src/utils/moveGesture.js';

const from = { lat: 1, lng: 2 };
const to = { lat: 3, lng: 4 };
const to2 = { lat: 5, lng: 6 };

describe('pressReducer', () => {
  const idle: PressState = { kind: 'idle' };
  const pending: PressState = { kind: 'pending', x: 100, y: 100 };
  const armed: PressState = { kind: 'armed' };

  it('idle + down -> pending', () => {
    expect(pressReducer(idle, { type: 'down', x: 5, y: 6 })).toEqual({ kind: 'pending', x: 5, y: 6 });
  });
  it('pending + timeout -> armed', () => {
    expect(pressReducer(pending, { type: 'timeout' })).toEqual(armed);
  });
  it('pending + small move stays pending', () => {
    expect(pressReducer(pending, { type: 'move', x: 105, y: 106 })).toBe(pending);
  });
  it('pending + move beyond 8px (Euclidean) -> idle', () => {
    expect(pressReducer(pending, { type: 'move', x: 106, y: 106 })).toEqual(idle);
    expect(pressReducer(pending, { type: 'move', x: 109, y: 100 })).toEqual(idle);
  });
  it('pending + up -> idle', () => {
    expect(pressReducer(pending, { type: 'up' })).toEqual(idle);
  });
  it('armed + move -> armed', () => {
    expect(pressReducer(armed, { type: 'move', x: 500, y: 500 })).toEqual(armed);
  });
  it('armed + up -> idle', () => {
    expect(pressReducer(armed, { type: 'up' })).toEqual(idle);
  });
  it('any + cancel -> idle', () => {
    for (const s of [idle, pending, armed]) {
      expect(pressReducer(s, { type: 'cancel' })).toEqual(idle);
    }
  });
  it('idle + timeout -> idle (stale timer)', () => {
    expect(pressReducer(idle, { type: 'timeout' })).toEqual(idle);
  });
});

describe('moveReducer', () => {
  const pending: MoveState = { imageId: 'a', from, to, status: 'pending' };
  const saving: MoveState = { imageId: 'a', from, to, status: 'saving' };

  it('null + drop -> pending', () => {
    expect(moveReducer(null, { type: 'drop', imageId: 'a', from, to })).toEqual(pending);
  });
  it('pending + drop keeps original from, updates to', () => {
    const next = moveReducer(pending, { type: 'drop', imageId: 'a', from: to, to: to2 });
    expect(next).toEqual({ imageId: 'a', from, to: to2, status: 'pending' });
  });
  it('pending + accept -> saving', () => {
    expect(moveReducer(pending, { type: 'accept' })).toEqual(saving);
  });
  it('saving + accept unchanged', () => {
    expect(moveReducer(saving, { type: 'accept' })).toBe(saving);
  });
  it('saving + discard unchanged', () => {
    expect(moveReducer(saving, { type: 'discard' })).toBe(saving);
  });
  it('pending + discard -> null', () => {
    expect(moveReducer(pending, { type: 'discard' })).toBeNull();
  });
  it('saving + settled -> null', () => {
    expect(moveReducer(saving, { type: 'settled' })).toBeNull();
  });
  it('pending(a) + drop(b) -> pending move for b with b from', () => {
    const bFrom = { lat: 7, lng: 8 };
    expect(moveReducer(pending, { type: 'drop', imageId: 'b', from: bFrom, to: to2 })).toEqual({
      imageId: 'b',
      from: bFrom,
      to: to2,
      status: 'pending',
    });
  });
  it('saving + drop unchanged', () => {
    expect(moveReducer(saving, { type: 'drop', imageId: 'b', from: to, to: to2 })).toBe(saving);
  });
  it('null + accept -> null', () => {
    expect(moveReducer(null, { type: 'accept' })).toBeNull();
  });
});
