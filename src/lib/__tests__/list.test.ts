import { describe, expect, it } from 'vitest';
import { moveListItem, reorderById } from '../list';

describe('list reordering helpers', () => {
  it('moves an item up or down within bounds', () => {
    const items = ['a', 'b', 'c'];
    expect(moveListItem(items, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveListItem(items, 1, 1)).toEqual(['a', 'c', 'b']);
    expect(items).toEqual(['a', 'b', 'c']);
  });

  it('keeps order unchanged when move is out of bounds', () => {
    const items = ['a', 'b'];
    expect(moveListItem(items, 0, -1)).toEqual(['a', 'b']);
    expect(moveListItem(items, 1, 1)).toEqual(['a', 'b']);
  });

  it('reorders keyed items by sourceId and targetId', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    expect(reorderById(items, '3', '1').map((x) => x.id)).toEqual(['3', '1', '2']);
    expect(reorderById(items, '1', '3').map((x) => x.id)).toEqual(['2', '3', '1']);
    expect(reorderById(items, '2', '2').map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(reorderById(items, 'missing', '1').map((x) => x.id)).toEqual(['1', '2', '3']);
  });
});
