import { describe, it, expect } from '@jest/globals';
import type { ImageRecord } from '@spyo-map/shared';
import {
  collapseGroups,
  groupMembers,
  lightboxOrder,
  findDropTarget,
  DROP_RADIUS_PX,
} from '../src/utils/groups.js';
import { computeNearbyGroup } from '../src/utils/nearbyGroup.js';

function img(id: string, lat = 51.5, lng = -0.12, groupId?: string, groupedAt?: string): ImageRecord {
  return {
    id,
    imageUrl: `http://test/images/${id}.jpg`,
    thumbnailUrl: `http://test/images/thumbnails/${id}.jpg`,
    uploaderName: 'MH',
    latitude: lat,
    longitude: lng,
    timestamp: '2024-01-01T00:00:00.000Z',
    ...(groupId ? { groupId, groupedAt } : {}),
  };
}

const T1 = '2024-02-01T00:00:00.000Z';
const T2 = '2024-02-02T00:00:00.000Z';

describe('collapseGroups', () => {
  it('keeps ungrouped images and counts nothing for them', () => {
    const a = img('a');
    const { markers, counts } = collapseGroups([a, img('b')]);
    expect(markers.map(i => i.id)).toEqual(['a', 'b']);
    expect(counts.size).toBe(0);
    expect(markers[0]).toBe(a);
  });

  it('emits one marker per group: smallest (groupedAt, id)', () => {
    const all = [img('z', 1, 1, 'g', T1), img('b', 1, 1, 'g', T2), img('a', 1, 1, 'g', T2), img('solo')];
    const { markers, counts } = collapseGroups(all);
    expect(markers.map(i => i.id)).toEqual(['z', 'solo']);
    expect(counts.get('z')).toBe(3);
    expect(counts.has('solo')).toBe(false);
  });

  it('breaks groupedAt ties by id', () => {
    const { markers } = collapseGroups([img('b', 1, 1, 'g', T1), img('a', 1, 1, 'g', T1)]);
    expect(markers.map(i => i.id)).toEqual(['a']);
  });

  it('uses next member when the representative is missing from the list', () => {
    const { markers, counts } = collapseGroups([img('b', 1, 1, 'g', T2), img('c', 1, 1, 'g', T2)]);
    expect(markers.map(i => i.id)).toEqual(['b']);
    expect(counts.get('b')).toBe(2);
  });

  it('a group with a single visible member shows no count', () => {
    const { markers, counts } = collapseGroups([img('b', 1, 1, 'g', T2)]);
    expect(markers.map(i => i.id)).toEqual(['b']);
    expect(counts.size).toBe(0);
  });
});

describe('groupMembers', () => {
  it('returns [] when ungrouped', () => {
    const a = img('a');
    expect(groupMembers(a, [a, img('b', 1, 1, 'g', T1)])).toEqual([]);
  });

  it('orders members by (groupedAt, id), including the image itself', () => {
    const b = img('b', 1, 1, 'g', T2);
    const all = [b, img('a', 1, 1, 'g', T2), img('c', 1, 1, 'g', T1), img('x', 1, 1, 'h', T1)];
    expect(groupMembers(b, all).map(i => i.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('lightboxOrder', () => {
  it('ungrouped selected equals computeNearbyGroup', () => {
    const a = img('a');
    const all = [a, img('n1', 51.5, -0.115), img('n2', 51.5, -0.113), img('far', 52, 1)];
    expect(lightboxOrder(a, all).map(i => i.id)).toEqual(computeNearbyGroup(a, all).map(i => i.id));
  });

  it('selected first, then other members, then nearby non-members, no duplicates', () => {
    const sel = img('b', 51.5, -0.12, 'g', T2);
    const first = img('a', 51.5, -0.12, 'g', T1);
    const memberFar = img('m', 52.5, 1, 'g', T2);
    const near = img('near', 51.5, -0.115);
    const all = [near, sel, memberFar, first, img('far', 53, 2)];
    const order = lightboxOrder(sel, all).map(i => i.id);
    expect(order).toEqual(['b', 'a', 'm', 'near']);
    expect(new Set(order).size).toBe(order.length);
  });
});

describe('findDropTarget', () => {
  const cands = [
    { id: 'a', x: 100, y: 100 },
    { id: 'b', x: 120, y: 100 },
    { id: 'drag', x: 100, y: 100 },
  ];

  it('returns nearest candidate within radius', () => {
    expect(findDropTarget({ x: 118, y: 100 }, cands, 'drag')).toBe('b');
  });
  it('ignores the dragged id', () => {
    expect(findDropTarget({ x: 100, y: 100 }, cands, 'drag')).toBe('a');
    expect(findDropTarget({ x: 100, y: 100 }, [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 110, y: 100 }], 'a')).toBe('b');
  });
  it('includes exactly 30 px, excludes 31', () => {
    expect(DROP_RADIUS_PX).toBe(30);
    expect(findDropTarget({ x: 130, y: 100 }, [{ id: 'a', x: 100, y: 100 }], 'd')).toBe('a');
    expect(findDropTarget({ x: 131, y: 100 }, [{ id: 'a', x: 100, y: 100 }], 'd')).toBeUndefined();
  });
  it('returns undefined with no candidates or only the dragged one', () => {
    expect(findDropTarget({ x: 0, y: 0 }, [], 'd')).toBeUndefined();
    expect(findDropTarget({ x: 100, y: 100 }, [{ id: 'drag', x: 100, y: 100 }], 'drag')).toBeUndefined();
  });
});
