import { describe, expect, it } from 'vitest';
import {
  buildUnifiedPatch,
  computeInlineDiff,
  computeTextDiff,
  filterDiffWithContext,
  tryFormatJson,
} from '../text-diff.logic';

describe('text-diff.logic', () => {
  it('returns identical lines with zero changes when inputs match', () => {
    const res = computeTextDiff('Baris 1\nBaris 2', 'Baris 1\r\nBaris 2');
    expect(res.stats.added).toBe(0);
    expect(res.stats.removed).toBe(0);
    expect(res.stats.modified).toBe(0);
    expect(res.stats.unchanged).toBe(2);
    expect(res.lines.every((l) => l.type === 'equal')).toBe(true);
    expect(res.sideBySide).toHaveLength(2);
  });

  it('detects added, removed, and modified lines with accurate 1-based line numbers', () => {
    const oldText = ['Nama: Budi', 'Role: Staff', 'Kota: Bandung'].join('\n');
    const newText = ['Nama: Budi', 'Role: Lead', 'Kota: Bandung', 'Aktif: Ya'].join('\n');

    const res = computeTextDiff(oldText, newText);
    expect(res.stats.unchanged).toBe(2);
    expect(res.stats.modified).toBe(1);
    expect(res.stats.removed).toBe(1);
    expect(res.stats.added).toBe(2);
    expect(res.stats.truncated).toBe(false);

    const changedRow = res.sideBySide[1];
    expect(changedRow.isChanged).toBe(true);
    expect(changedRow.left?.oldLine).toBe(2);
    expect(changedRow.right?.newLine).toBe(2);
    expect(changedRow.left?.segments?.some((s) => s.type === 'removed' && s.text === 'Staff')).toBe(
      true,
    );
    expect(changedRow.right?.segments?.some((s) => s.type === 'added' && s.text === 'Lead')).toBe(
      true,
    );

    const appendedRow = res.sideBySide[3];
    expect(appendedRow.left).toBeNull();
    expect(appendedRow.right?.text).toBe('Aktif: Ya');
    expect(appendedRow.right?.newLine).toBe(4);
  });

  it('respects ignoreWhitespace and ignoreCase options without mutating displayed text', () => {
    const oldText = '  Hello   World  ';
    const newText = 'hello world';

    const strict = computeTextDiff(oldText, newText);
    expect(strict.stats.modified).toBe(1);

    const relaxed = computeTextDiff(oldText, newText, {
      ignoreWhitespace: true,
      ignoreCase: true,
    });
    expect(relaxed.stats.modified).toBe(0);
    expect(relaxed.stats.unchanged).toBe(1);
    expect(relaxed.lines[0].text).toBe('hello world');
  });

  it('computes inline word segments cleanly', () => {
    const { leftSegments, rightSegments } = computeInlineDiff(
      'Harga: Rp 50.000 per bulan',
      'Harga: Rp 75.000 per tahun',
    );
    expect(leftSegments.map((s) => `${s.type}:${s.text}`).join('|')).toContain('removed:50');
    expect(leftSegments.map((s) => `${s.type}:${s.text}`).join('|')).toContain('removed:bulan');
    expect(rightSegments.map((s) => `${s.type}:${s.text}`).join('|')).toContain('added:75');
    expect(rightSegments.map((s) => `${s.type}:${s.text}`).join('|')).toContain('added:tahun');
  });

  it('filters unchanged regions with context and collapses gaps', () => {
    const a = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n');
    const b = Array.from({ length: 12 }, (_, i) =>
      i === 5 ? 'line 6 UPDATED' : `line ${i + 1}`,
    ).join('\n');

    const { sideBySide } = computeTextDiff(a, b);
    const filtered = filterDiffWithContext(sideBySide, (r) => r.isChanged, 1);

    expect(filtered[0]).toEqual({ kind: 'collapsed', count: 4 });
    expect(filtered[filtered.length - 1]).toEqual({ kind: 'collapsed', count: 5 });
    const rows = filtered.filter((item) => item.kind === 'row');
    expect(rows).toHaveLength(3); // line 5, line 6 (changed), line 7
  });

  it('builds a valid unified diff patch with @@ hunk headers', () => {
    const patch = buildUnifiedPatch(
      'alpha\nbeta\ngamma',
      'alpha\nBETA\ngamma\ndelta',
      'a/old.txt',
      'b/new.txt',
    );
    expect(patch).toContain('--- a/old.txt');
    expect(patch).toContain('+++ b/new.txt');
    expect(patch).toContain('@@ -1,3 +1,4 @@');
    expect(patch).toContain('-beta');
    expect(patch).toContain('+BETA');
    expect(patch).toContain('+delta');
  });

  it('formats valid JSON and returns error for invalid JSON', () => {
    const good = tryFormatJson('{"b":2,"a":1}');
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.formatted).toBe('{\n  "b": 2,\n  "a": 1\n}');
    }

    const bad = tryFormatJson('{invalid');
    expect(bad.ok).toBe(false);
  });
});
