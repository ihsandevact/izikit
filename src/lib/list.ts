/**
 * Move an item in a list up (-1) or down (+1) by one slot, returning a new array.
 * Returns the original array reference unchanged when the move is out of bounds.
 */
export function moveListItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * Reorder a list of keyed items by dragging sourceId onto targetId.
 */
export function reorderById<T extends { id: string }>(
  items: readonly T[],
  sourceId: string,
  targetId: string,
): T[] {
  if (sourceId === targetId) return [...items];
  const fromIdx = items.findIndex((item) => item.id === sourceId);
  const toIdx = items.findIndex((item) => item.id === targetId);
  if (fromIdx === -1 || toIdx === -1) return [...items];
  const next = [...items];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}
