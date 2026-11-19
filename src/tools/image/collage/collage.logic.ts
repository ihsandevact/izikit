export type CollageLayoutPreset =
  | 'auto'
  | '2x1'
  | '1x2'
  | '2x2'
  | '3x1'
  | '1x3'
  | '3x2'
  | '2x3'
  | '3x3';

export type CollageAspectRatio = '1:1' | '4:5' | '16:9' | '3:2' | 'a4';
export type CollageFitMode = 'cover' | 'contain';
export type CollageOutputFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export type CollageErrorCode = 'NEED_TWO_IMAGES' | 'INVALID_OPTIONS';

export class CollageError extends Error {
  readonly code: CollageErrorCode;

  constructor(code: CollageErrorCode, message: string) {
    super(message);
    this.name = 'CollageError';
    this.code = code;
  }
}

export interface CollageOptions {
  layout: CollageLayoutPreset;
  aspectRatio: CollageAspectRatio;
  longEdgePx: number;
  gapPx: number;
  paddingPx: number;
  borderRadiusPx: number;
  backgroundColor: string;
  fitMode: CollageFitMode;
  outputFormat: CollageOutputFormat;
  quality: number;
}

export interface GridDimensions {
  cols: number;
  rows: number;
}

export interface CollageCellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawImageRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

const PRESET_GRIDS: Record<Exclude<CollageLayoutPreset, 'auto'>, GridDimensions> = {
  '2x1': { cols: 2, rows: 1 },
  '1x2': { cols: 1, rows: 2 },
  '2x2': { cols: 2, rows: 2 },
  '3x1': { cols: 3, rows: 1 },
  '1x3': { cols: 1, rows: 3 },
  '3x2': { cols: 3, rows: 2 },
  '2x3': { cols: 2, rows: 3 },
  '3x3': { cols: 3, rows: 3 },
};

export function resolveGridDimensions(
  layout: CollageLayoutPreset,
  imageCount: number,
): GridDimensions {
  if (layout !== 'auto') {
    return PRESET_GRIDS[layout];
  }

  const count = Math.max(1, imageCount);
  if (count === 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

export function resolveCanvasSize(
  aspectRatio: CollageAspectRatio,
  longEdgePx: number,
): { width: number; height: number } {
  const edge = Math.max(200, Math.round(longEdgePx));
  switch (aspectRatio) {
    case '4:5':
      return { width: Math.round(edge * 0.8), height: edge };
    case '16:9':
      return { width: edge, height: Math.round((edge * 9) / 16) };
    case '3:2':
      return { width: edge, height: Math.round((edge * 2) / 3) };
    case 'a4':
      return { width: Math.round((edge * 210) / 297), height: edge };
    case '1:1':
    default:
      return { width: edge, height: edge };
  }
}

export function computeCollageCells(
  canvasWidth: number,
  canvasHeight: number,
  cols: number,
  rows: number,
  gapPx: number,
  paddingPx: number,
): CollageCellRect[] {
  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, rows);
  const safePad = Math.max(0, paddingPx);
  const safeGap = Math.max(0, gapPx);

  const usableW = Math.max(safeCols, canvasWidth - safePad * 2 - safeGap * (safeCols - 1));
  const usableH = Math.max(safeRows, canvasHeight - safePad * 2 - safeGap * (safeRows - 1));
  const cellW = usableW / safeCols;
  const cellH = usableH / safeRows;

  const cells: CollageCellRect[] = [];
  for (let r = 0; r < safeRows; r += 1) {
    for (let c = 0; c < safeCols; c += 1) {
      cells.push({
        x: Math.round(safePad + c * (cellW + safeGap)),
        y: Math.round(safePad + r * (cellH + safeGap)),
        width: Math.max(1, Math.round(cellW)),
        height: Math.max(1, Math.round(cellH)),
      });
    }
  }
  return cells;
}

export function computeImageFitRect(
  srcW: number,
  srcH: number,
  dstX: number,
  dstY: number,
  dstW: number,
  dstH: number,
  fitMode: CollageFitMode,
): DrawImageRect {
  const safeSrcW = Math.max(1, srcW);
  const safeSrcH = Math.max(1, srcH);
  const safeDstW = Math.max(1, dstW);
  const safeDstH = Math.max(1, dstH);

  const srcAspect = safeSrcW / safeSrcH;
  const dstAspect = safeDstW / safeDstH;

  if (fitMode === 'cover') {
    if (srcAspect > dstAspect) {
      const sw = safeSrcH * dstAspect;
      const sx = (safeSrcW - sw) / 2;
      return { sx, sy: 0, sw, sh: safeSrcH, dx: dstX, dy: dstY, dw: safeDstW, dh: safeDstH };
    }
    const sh = safeSrcW / dstAspect;
    const sy = (safeSrcH - sh) / 2;
    return { sx: 0, sy, sw: safeSrcW, sh, dx: dstX, dy: dstY, dw: safeDstW, dh: safeDstH };
  }

  // Contain mode: full source image centered inside destination cell
  const scale = Math.min(safeDstW / safeSrcW, safeDstH / safeSrcH);
  const dw = safeSrcW * scale;
  const dh = safeSrcH * scale;
  const dx = dstX + (safeDstW - dw) / 2;
  const dy = dstY + (safeDstH - dh) / 2;
  return { sx: 0, sy: 0, sw: safeSrcW, sh: safeSrcH, dx, dy, dw, dh };
}

export function validateCollageOptions(options: CollageOptions, imageCount: number): void {
  if (imageCount < 2) {
    throw new CollageError('NEED_TWO_IMAGES', 'Select at least 2 images to create a collage.');
  }
  if (!Number.isFinite(options.longEdgePx) || options.longEdgePx < 400 || options.longEdgePx > 4000) {
    throw new CollageError('INVALID_OPTIONS', 'Output resolution must be between 400 and 4000 px.');
  }
  if (!Number.isFinite(options.gapPx) || options.gapPx < 0 || options.gapPx > 120) {
    throw new CollageError('INVALID_OPTIONS', 'Gap must be between 0 and 120 px.');
  }
  if (!Number.isFinite(options.paddingPx) || options.paddingPx < 0 || options.paddingPx > 160) {
    throw new CollageError('INVALID_OPTIONS', 'Padding must be between 0 and 160 px.');
  }
  if (!Number.isFinite(options.borderRadiusPx) || options.borderRadiusPx < 0 || options.borderRadiusPx > 120) {
    throw new CollageError('INVALID_OPTIONS', 'Border radius must be between 0 and 120 px.');
  }
  if (!Number.isFinite(options.quality) || options.quality < 10 || options.quality > 100) {
    throw new CollageError('INVALID_OPTIONS', 'Quality must be between 10 and 100.');
  }
}

export function extensionForCollageFormat(format: CollageOutputFormat): string {
  if (format === 'image/png') return 'png';
  if (format === 'image/webp') return 'webp';
  return 'jpg';
}
