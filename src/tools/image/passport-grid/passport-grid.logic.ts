export type PassportPhotoSizeKey = '2x3' | '3x4' | '4x6';
export type PrintPaperSizeKey = '4r' | 'a4';

export interface MmSize {
  widthMm: number;
  heightMm: number;
}

export const PASSPORT_PHOTO_SIZES_MM: Record<PassportPhotoSizeKey, MmSize> = {
  '2x3': { widthMm: 20, heightMm: 30 },
  '3x4': { widthMm: 30, heightMm: 40 },
  '4x6': { widthMm: 40, heightMm: 60 },
};

export const PRINT_PAPER_SIZES_MM: Record<PrintPaperSizeKey, MmSize> = {
  '4r': { widthMm: 102, heightMm: 152 },
  a4: { widthMm: 210, heightMm: 297 },
};

export const PRINT_DPI = 300;
const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

export function mmToPx(mm: number, dpi = PRINT_DPI): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

export interface SheetCell {
  index: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PassportSheetLayout {
  paperKey: PrintPaperSizeKey;
  photoKey: PassportPhotoSizeKey;
  paperWidthMm: number;
  paperHeightMm: number;
  paperWidthPx: number;
  paperHeightPx: number;
  paperWidthPt: number;
  paperHeightPt: number;
  photoWidthMm: number;
  photoHeightMm: number;
  cols: number;
  rows: number;
  maxCopies: number;
  copies: number;
  gapMm: number;
  marginMm: number;
  cells: SheetCell[];
}

export interface ComputeLayoutOptions {
  paper: PrintPaperSizeKey;
  photo: PassportPhotoSizeKey;
  copies?: number;
  gapMm?: number;
  marginMm?: number;
}

function fitGrid(
  paperW: number,
  paperH: number,
  photoW: number,
  photoH: number,
  marginMm: number,
  gapMm: number,
) {
  const usableW = Math.max(0, paperW - marginMm * 2);
  const usableH = Math.max(0, paperH - marginMm * 2);
  const cols = Math.max(1, Math.floor((usableW + gapMm) / (photoW + gapMm)));
  const rows = Math.max(1, Math.floor((usableH + gapMm) / (photoH + gapMm)));
  return { cols, rows, capacity: cols * rows };
}

/**
 * Computes an optimal 300 DPI passport photo print sheet layout.
 * Automatically picks portrait or landscape paper orientation to maximize capacity.
 */
export function computePassportSheetLayout(options: ComputeLayoutOptions): PassportSheetLayout {
  const basePaper = PRINT_PAPER_SIZES_MM[options.paper];
  const photo = PASSPORT_PHOTO_SIZES_MM[options.photo];
  const gapMm = Math.max(0, Math.min(10, options.gapMm ?? 3));
  const marginMm = Math.max(3, Math.min(15, options.marginMm ?? 5));

  const portrait = fitGrid(
    basePaper.widthMm,
    basePaper.heightMm,
    photo.widthMm,
    photo.heightMm,
    marginMm,
    gapMm,
  );
  const landscape = fitGrid(
    basePaper.heightMm,
    basePaper.widthMm,
    photo.widthMm,
    photo.heightMm,
    marginMm,
    gapMm,
  );

  const useLandscape = landscape.capacity > portrait.capacity;
  const paperWidthMm = useLandscape ? basePaper.heightMm : basePaper.widthMm;
  const paperHeightMm = useLandscape ? basePaper.widthMm : basePaper.heightMm;
  const { cols, rows, capacity: maxCopies } = useLandscape ? landscape : portrait;

  const requested = options.copies ?? maxCopies;
  const copies = Math.max(1, Math.min(maxCopies, Math.round(requested)));

  const gridWidthMm = cols * photo.widthMm + (cols - 1) * gapMm;
  const gridHeightMm = rows * photo.heightMm + (rows - 1) * gapMm;
  const startXMm = (paperWidthMm - gridWidthMm) / 2;
  const startYMm = (paperHeightMm - gridHeightMm) / 2;

  const cells: SheetCell[] = [];
  for (let i = 0; i < copies; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    cells.push({
      index: i,
      xMm: startXMm + col * (photo.widthMm + gapMm),
      yMm: startYMm + row * (photo.heightMm + gapMm),
      widthMm: photo.widthMm,
      heightMm: photo.heightMm,
    });
  }

  return {
    paperKey: options.paper,
    photoKey: options.photo,
    paperWidthMm,
    paperHeightMm,
    paperWidthPx: mmToPx(paperWidthMm, PRINT_DPI),
    paperHeightPx: mmToPx(paperHeightMm, PRINT_DPI),
    paperWidthPt: mmToPt(paperWidthMm),
    paperHeightPt: mmToPt(paperHeightMm),
    photoWidthMm: photo.widthMm,
    photoHeightMm: photo.heightMm,
    cols,
    rows,
    maxCopies,
    copies,
    gapMm,
    marginMm,
    cells,
  };
}

export interface SourceCropRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

/**
 * Smart cover-crop calculation with top vertical bias (0.25) so passport photo heads
 * are preserved instead of centered vertically.
 */
export function computePortraitCoverCrop(
  srcWidth: number,
  srcHeight: number,
  targetAspect: number,
): SourceCropRect {
  const srcAspect = srcWidth / Math.max(1, srcHeight);
  if (Math.abs(srcAspect - targetAspect) < 0.001) {
    return { sx: 0, sy: 0, sWidth: srcWidth, sHeight: srcHeight };
  }

  if (srcAspect > targetAspect) {
    // Source is wider than target: crop left/right symmetrically
    const sWidth = srcHeight * targetAspect;
    const sx = (srcWidth - sWidth) / 2;
    return { sx, sy: 0, sWidth, sHeight: srcHeight };
  }

  // Source is taller than target: bias crop toward top (25%) to keep head in frame
  const sHeight = srcWidth / targetAspect;
  const sy = (srcHeight - sHeight) * 0.25;
  return { sx: 0, sy, sWidth: srcWidth, sHeight };
}

export function buildPassportSheetFilename(
  originalFilename: string,
  photo: PassportPhotoSizeKey,
  paper: PrintPaperSizeKey,
  ext: 'jpg' | 'pdf',
): string {
  const stem = originalFilename.replace(/\.[^/.]+$/, '').trim() || 'pasfoto';
  return `${stem}-pasfoto-${photo}-${paper}.${ext}`;
}
