export interface RgbaBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PixelDiffResult {
  width: number;
  height: number;
  diffData: Uint8ClampedArray;
  changedPixels: number;
  totalPixels: number;
  diffPercent: number;
}

export interface TextDiffLine {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

export interface TextDiffSummary {
  lines: TextDiffLine[];
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
}

/**
 * Compares two RGBA page images and produces a visual diff image:
 * - Unchanged pixels are rendered as soft dimmed grayscale so differences pop out.
 * - Pixels darker/present in A (removed in B) are highlighted in rose/red.
 * - Pixels darker/present in B (added in B) are highlighted in emerald/green.
 * - Pixels modified in both are highlighted in vivid amber/magenta.
 */
export function computePixelDiff(
  imgA: RgbaBuffer | null,
  imgB: RgbaBuffer | null,
  threshold = 28,
): PixelDiffResult {
  const width = Math.max(imgA?.width ?? 0, imgB?.width ?? 0);
  const height = Math.max(imgA?.height ?? 0, imgB?.height ?? 0);
  const totalPixels = width * height;
  const diffData = new Uint8ClampedArray(totalPixels * 4);

  if (totalPixels === 0) {
    return { width: 0, height: 0, diffData, changedPixels: 0, totalPixels: 0, diffPercent: 0 };
  }

  let changedPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const outIdx = (y * width + x) * 4;

      const hasA = imgA !== null && x < imgA.width && y < imgA.height;
      const hasB = imgB !== null && x < imgB.width && y < imgB.height;

      const idxA = hasA ? (y * imgA!.width + x) * 4 : -1;
      const idxB = hasB ? (y * imgB!.width + x) * 4 : -1;

      const rA = hasA ? imgA!.data[idxA] : 255;
      const gA = hasA ? imgA!.data[idxA + 1] : 255;
      const bA = hasA ? imgA!.data[idxA + 2] : 255;

      const rB = hasB ? imgB!.data[idxB] : 255;
      const gB = hasB ? imgB!.data[idxB + 1] : 255;
      const bB = hasB ? imgB!.data[idxB + 2] : 255;

      const delta = Math.abs(rA - rB) + Math.abs(gA - gB) + Math.abs(bA - bB);

      if (delta <= threshold) {
        // Soft faded grayscale for unchanged background/content
        const lum = Math.round(0.299 * rB + 0.587 * gB + 0.114 * bB);
        const faded = Math.round(lum * 0.45 + 255 * 0.55);
        diffData[outIdx] = faded;
        diffData[outIdx + 1] = faded;
        diffData[outIdx + 2] = faded;
        diffData[outIdx + 3] = 255;
      } else {
        changedPixels++;
        const lumA = 0.299 * rA + 0.587 * gA + 0.114 * bA;
        const lumB = 0.299 * rB + 0.587 * gB + 0.114 * bB;

        if (lumA < lumB - 18) {
          // Present/darker in A -> removed in B (rose red)
          diffData[outIdx] = 225;
          diffData[outIdx + 1] = 29;
          diffData[outIdx + 2] = 72;
          diffData[outIdx + 3] = 255;
        } else if (lumB < lumA - 18) {
          // Present/darker in B -> added in B (emerald green)
          diffData[outIdx] = 16;
          diffData[outIdx + 1] = 185;
          diffData[outIdx + 2] = 129;
          diffData[outIdx + 3] = 255;
        } else {
          // Color/tone changed (vivid amber)
          diffData[outIdx] = 245;
          diffData[outIdx + 1] = 158;
          diffData[outIdx + 2] = 11;
          diffData[outIdx + 3] = 255;
        }
      }
    }
  }

  const diffPercent = totalPixels > 0 ? (changedPixels / totalPixels) * 100 : 0;
  return {
    width,
    height,
    diffData,
    changedPixels,
    totalPixels,
    diffPercent,
  };
}

/**
 * Computes a clean line-by-line diff between two arrays of text lines using LCS.
 * Caps LCS table size for very large pages to keep UI responsive.
 */
export function computeLineDiff(linesA: string[], linesB: string[]): TextDiffSummary {
  const a = linesA.map((s) => s.trim()).filter(Boolean);
  const b = linesB.map((s) => s.trim()).filter(Boolean);

  const m = a.length;
  const n = b.length;

  // Fallback simple diff if page has unusually huge line count
  if (m * n > 250_000) {
    const lines: TextDiffLine[] = [
      ...a.map((text): TextDiffLine => ({ type: 'removed', text })),
      ...b.map((text): TextDiffLine => ({ type: 'added', text })),
    ];
    return { lines, addedCount: n, removedCount: m, unchangedCount: 0 };
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const lines: TextDiffLine[] = [];
  let i = 0;
  let j = 0;
  let addedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;

  while (i < m && j < n) {
    if (a[i] === b[j]) {
      lines.push({ type: 'equal', text: a[i] });
      unchangedCount++;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'removed', text: a[i] });
      removedCount++;
      i++;
    } else {
      lines.push({ type: 'added', text: b[j] });
      addedCount++;
      j++;
    }
  }

  while (i < m) {
    lines.push({ type: 'removed', text: a[i++] });
    removedCount++;
  }
  while (j < n) {
    lines.push({ type: 'added', text: b[j++] });
    addedCount++;
  }

  return { lines, addedCount, removedCount, unchangedCount };
}
