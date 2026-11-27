export interface DiffOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
}

export interface InlineSegment {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

export interface DiffLine {
  type: 'equal' | 'added' | 'removed';
  text: string;
  oldLine: number | null;
  newLine: number | null;
  segments?: InlineSegment[];
}

export interface SideBySideRow {
  left: DiffLine | null;
  right: DiffLine | null;
  isChanged: boolean;
}

export interface DiffStats {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  changedRows: number;
  truncated: boolean;
}

export interface TextDiffResult {
  lines: DiffLine[];
  sideBySide: SideBySideRow[];
  stats: DiffStats;
}

export type ContextItem<T> =
  | { kind: 'row'; item: T; originalIndex: number }
  | { kind: 'collapsed'; count: number };

const MAX_LCS_CELLS = 300_000;
const MAX_INLINE_CELLS = 25_000;

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function splitTextLines(text: string): string[] {
  if (text.length === 0) return [];
  return normalizeLineEndings(text).split('\n');
}

export function normalizeForCompare(text: string, options: DiffOptions = {}): string {
  let out = text;
  if (options.ignoreWhitespace) {
    out = out.trim().replace(/\s+/g, ' ');
  }
  if (options.ignoreCase) {
    out = out.toLowerCase();
  }
  return out;
}

function tokenizeForInline(text: string): string[] {
  if (text.length === 0) return [];
  return text.match(/\s+|[A-Za-z0-9_\u00C0-\u024F]+|./gu) ?? [];
}

function mergeSegments(segments: InlineSegment[]): InlineSegment[] {
  const merged: InlineSegment[] = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.type === seg.type) {
      prev.text += seg.text;
    } else {
      merged.push({ type: seg.type, text: seg.text });
    }
  }
  return merged;
}

/**
 * Computes word/token-level inline diff between two modified lines.
 */
export function computeInlineDiff(
  oldText: string,
  newText: string,
  options: DiffOptions = {},
): { leftSegments: InlineSegment[]; rightSegments: InlineSegment[] } {
  const rawA = tokenizeForInline(oldText);
  const rawB = tokenizeForInline(newText);

  const cmpA = rawA.map((t) => normalizeForCompare(t, options));
  const cmpB = rawB.map((t) => normalizeForCompare(t, options));

  let prefix = 0;
  const minLen = Math.min(rawA.length, rawB.length);
  while (prefix < minLen && cmpA[prefix] === cmpB[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    cmpA[rawA.length - 1 - suffix] === cmpB[rawB.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const midA = rawA.slice(prefix, rawA.length - suffix);
  const midB = rawB.slice(prefix, rawB.length - suffix);
  const midCmpA = cmpA.slice(prefix, cmpA.length - suffix);
  const midCmpB = cmpB.slice(prefix, cmpB.length - suffix);

  const leftSegments: InlineSegment[] = [];
  const rightSegments: InlineSegment[] = [];

  if (prefix > 0) {
    leftSegments.push({ type: 'equal', text: rawA.slice(0, prefix).join('') });
    rightSegments.push({ type: 'equal', text: rawB.slice(0, prefix).join('') });
  }

  const m = midA.length;
  const n = midB.length;

  if (m === 0 && n > 0) {
    rightSegments.push({ type: 'added', text: midB.join('') });
  } else if (n === 0 && m > 0) {
    leftSegments.push({ type: 'removed', text: midA.join('') });
  } else if (m > 0 && n > 0) {
    if (m * n > MAX_INLINE_CELLS) {
      leftSegments.push({ type: 'removed', text: midA.join('') });
      rightSegments.push({ type: 'added', text: midB.join('') });
    } else {
      const dp: Int32Array[] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
      for (let i = m - 1; i >= 0; i -= 1) {
        const row = dp[i];
        const nextRow = dp[i + 1];
        for (let j = n - 1; j >= 0; j -= 1) {
          if (midCmpA[i] === midCmpB[j]) {
            row[j] = nextRow[j + 1] + 1;
          } else {
            row[j] = nextRow[j] >= row[j + 1] ? nextRow[j] : row[j + 1];
          }
        }
      }

      let i = 0;
      let j = 0;
      while (i < m && j < n) {
        if (midCmpA[i] === midCmpB[j]) {
          leftSegments.push({ type: 'equal', text: midA[i] });
          rightSegments.push({ type: 'equal', text: midB[j] });
          i += 1;
          j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
          leftSegments.push({ type: 'removed', text: midA[i] });
          i += 1;
        } else {
          rightSegments.push({ type: 'added', text: midB[j] });
          j += 1;
        }
      }
      while (i < m) {
        leftSegments.push({ type: 'removed', text: midA[i++] });
      }
      while (j < n) {
        rightSegments.push({ type: 'added', text: midB[j++] });
      }
    }
  }

  if (suffix > 0) {
    leftSegments.push({ type: 'equal', text: rawA.slice(rawA.length - suffix).join('') });
    rightSegments.push({ type: 'equal', text: rawB.slice(rawB.length - suffix).join('') });
  }

  return {
    leftSegments: mergeSegments(leftSegments),
    rightSegments: mergeSegments(rightSegments),
  };
}

/**
 * Computes line-by-line diff with common prefix/suffix trimming,
 * inline word highlights for paired changes, and aligned side-by-side rows.
 */
export function computeTextDiff(
  oldText: string,
  newText: string,
  options: DiffOptions = {},
): TextDiffResult {
  const linesA = splitTextLines(oldText);
  const linesB = splitTextLines(newText);

  const cmpA = linesA.map((line) => normalizeForCompare(line, options));
  const cmpB = linesB.map((line) => normalizeForCompare(line, options));

  let prefix = 0;
  const minLen = Math.min(linesA.length, linesB.length);
  while (prefix < minLen && cmpA[prefix] === cmpB[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    cmpA[linesA.length - 1 - suffix] === cmpB[linesB.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const lines: DiffLine[] = [];

  for (let idx = 0; idx < prefix; idx += 1) {
    lines.push({
      type: 'equal',
      text: linesB[idx],
      oldLine: idx + 1,
      newLine: idx + 1,
    });
  }

  const midStartA = prefix;
  const midEndA = linesA.length - suffix;
  const midStartB = prefix;
  const midEndB = linesB.length - suffix;

  const m = midEndA - midStartA;
  const n = midEndB - midStartB;
  let truncated = false;

  if (m > 0 && n > 0) {
    if (m * n > MAX_LCS_CELLS) {
      truncated = true;
      for (let i = 0; i < m; i += 1) {
        lines.push({
          type: 'removed',
          text: linesA[midStartA + i],
          oldLine: midStartA + i + 1,
          newLine: null,
        });
      }
      for (let j = 0; j < n; j += 1) {
        lines.push({
          type: 'added',
          text: linesB[midStartB + j],
          oldLine: null,
          newLine: midStartB + j + 1,
        });
      }
    } else {
      const dp: Int32Array[] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
      for (let i = m - 1; i >= 0; i -= 1) {
        const row = dp[i];
        const nextRow = dp[i + 1];
        const aVal = cmpA[midStartA + i];
        for (let j = n - 1; j >= 0; j -= 1) {
          if (aVal === cmpB[midStartB + j]) {
            row[j] = nextRow[j + 1] + 1;
          } else {
            row[j] = nextRow[j] >= row[j + 1] ? nextRow[j] : row[j + 1];
          }
        }
      }

      let i = 0;
      let j = 0;
      while (i < m && j < n) {
        if (cmpA[midStartA + i] === cmpB[midStartB + j]) {
          lines.push({
            type: 'equal',
            text: linesB[midStartB + j],
            oldLine: midStartA + i + 1,
            newLine: midStartB + j + 1,
          });
          i += 1;
          j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
          lines.push({
            type: 'removed',
            text: linesA[midStartA + i],
            oldLine: midStartA + i + 1,
            newLine: null,
          });
          i += 1;
        } else {
          lines.push({
            type: 'added',
            text: linesB[midStartB + j],
            oldLine: null,
            newLine: midStartB + j + 1,
          });
          j += 1;
        }
      }
      while (i < m) {
        lines.push({
          type: 'removed',
          text: linesA[midStartA + i],
          oldLine: midStartA + i + 1,
          newLine: null,
        });
        i += 1;
      }
      while (j < n) {
        lines.push({
          type: 'added',
          text: linesB[midStartB + j],
          oldLine: null,
          newLine: midStartB + j + 1,
        });
        j += 1;
      }
    }
  } else if (m > 0) {
    for (let i = 0; i < m; i += 1) {
      lines.push({
        type: 'removed',
        text: linesA[midStartA + i],
        oldLine: midStartA + i + 1,
        newLine: null,
      });
    }
  } else if (n > 0) {
    for (let j = 0; j < n; j += 1) {
      lines.push({
        type: 'added',
        text: linesB[midStartB + j],
        oldLine: null,
        newLine: midStartB + j + 1,
      });
    }
  }

  for (let idx = 0; idx < suffix; idx += 1) {
    const aIndex = linesA.length - suffix + idx;
    const bIndex = linesB.length - suffix + idx;
    lines.push({
      type: 'equal',
      text: linesB[bIndex],
      oldLine: aIndex + 1,
      newLine: bIndex + 1,
    });
  }

  // Build aligned side-by-side rows and enrich paired removed+added lines with inline segments
  const sideBySide: SideBySideRow[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;
  let unchanged = 0;
  let changedRows = 0;

  let cursor = 0;
  while (cursor < lines.length) {
    const current = lines[cursor];
    if (current.type === 'equal') {
      unchanged += 1;
      sideBySide.push({ left: current, right: current, isChanged: false });
      cursor += 1;
      continue;
    }

    const removedBlock: DiffLine[] = [];
    const addedBlock: DiffLine[] = [];

    while (cursor < lines.length && lines[cursor].type !== 'equal') {
      if (lines[cursor].type === 'removed') {
        removedBlock.push(lines[cursor]);
      } else {
        addedBlock.push(lines[cursor]);
      }
      cursor += 1;
    }

    const pairCount = Math.min(removedBlock.length, addedBlock.length);
    modified += pairCount;
    removed += removedBlock.length;
    added += addedBlock.length;

    const maxBlock = Math.max(removedBlock.length, addedBlock.length);
    for (let k = 0; k < maxBlock; k += 1) {
      const left = removedBlock[k] ?? null;
      const right = addedBlock[k] ?? null;
      if (left && right) {
        const { leftSegments, rightSegments } = computeInlineDiff(left.text, right.text, options);
        left.segments = leftSegments;
        right.segments = rightSegments;
      }
      changedRows += 1;
      sideBySide.push({ left, right, isChanged: true });
    }
  }

  return {
    lines,
    sideBySide,
    stats: {
      added,
      removed,
      modified,
      unchanged,
      changedRows,
      truncated,
    },
  };
}

/**
 * Filters a list of diff items to keep only changed items plus N lines of surrounding context,
 * collapsing unchanged gaps into `{ kind: 'collapsed', count }`.
 */
export function filterDiffWithContext<T>(
  items: readonly T[],
  isChanged: (item: T) => boolean,
  contextLines = 3,
): ContextItem<T>[] {
  const len = items.length;
  if (len === 0) return [];

  const visible = new Uint8Array(len);
  let anyChanged = false;

  for (let i = 0; i < len; i += 1) {
    if (isChanged(items[i])) {
      anyChanged = true;
      const start = Math.max(0, i - contextLines);
      const end = Math.min(len - 1, i + contextLines);
      for (let j = start; j <= end; j += 1) {
        visible[j] = 1;
      }
    }
  }

  if (!anyChanged) {
    return [{ kind: 'collapsed', count: len }];
  }

  const output: ContextItem<T>[] = [];
  let hiddenCount = 0;

  for (let i = 0; i < len; i += 1) {
    if (visible[i]) {
      if (hiddenCount > 0) {
        output.push({ kind: 'collapsed', count: hiddenCount });
        hiddenCount = 0;
      }
      output.push({ kind: 'row', item: items[i], originalIndex: i });
    } else {
      hiddenCount += 1;
    }
  }

  if (hiddenCount > 0) {
    output.push({ kind: 'collapsed', count: hiddenCount });
  }

  return output;
}

/**
 * Builds a standard unified diff (.diff / .patch) string with @@ hunk headers.
 */
export function buildUnifiedPatch(
  oldText: string,
  newText: string,
  oldLabel = 'a/original.txt',
  newLabel = 'b/modified.txt',
  options: DiffOptions = {},
  contextLines = 3,
): string {
  const { lines } = computeTextDiff(oldText, newText, options);
  const filtered = filterDiffWithContext(lines, (line) => line.type !== 'equal', contextLines);

  const hasChanges = lines.some((l) => l.type !== 'equal');
  if (!hasChanges) {
    return `--- ${oldLabel}\n+++ ${newLabel}\n`;
  }

  // Group contiguous 'row' items into hunks
  const hunks: DiffLine[][] = [];
  let currentHunk: DiffLine[] = [];

  for (const entry of filtered) {
    if (entry.kind === 'row') {
      currentHunk.push(entry.item);
    } else if (currentHunk.length > 0) {
      hunks.push(currentHunk);
      currentHunk = [];
    }
  }
  if (currentHunk.length > 0) {
    hunks.push(currentHunk);
  }

  const out: string[] = [`--- ${oldLabel}`, `+++ ${newLabel}`];

  for (const hunk of hunks) {
    const oldLines = hunk.filter((l) => l.oldLine !== null);
    const newLines = hunk.filter((l) => l.newLine !== null);

    const oldStart = oldLines.length > 0 ? oldLines[0].oldLine! : 0;
    const oldCount = oldLines.length;
    const newStart = newLines.length > 0 ? newLines[0].newLine! : 0;
    const newCount = newLines.length;

    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);

    for (const line of hunk) {
      const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
      out.push(`${prefix}${line.text}`);
    }
  }

  return `${out.join('\n')}\n`;
}

export function tryFormatJson(
  text: string,
): { ok: true; formatted: string } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text);
    return { ok: true, formatted: JSON.stringify(parsed, null, 2) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid JSON',
    };
  }
}
