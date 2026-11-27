import {
  applyScanFilterToPixels,
  type ScanAdjustments,
  type ScanFilterKey,
} from './scanner.logic';

export interface RenderScanOptions {
  rotation: 0 | 90 | 180 | 270;
  filter: ScanFilterKey;
  adjustments: ScanAdjustments;
  maxDimension: number;
}

/**
 * Draws a scanned document photo onto a canvas with rotation and scan enhancement filter.
 */
export function drawScannedPageOnCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  options: RenderScanOptions,
): { width: number; height: number } {
  const srcW = Math.max(1, image.naturalWidth || image.width);
  const srcH = Math.max(1, image.naturalHeight || image.height);
  const swapped = options.rotation === 90 || options.rotation === 270;

  const rotW = swapped ? srcH : srcW;
  const rotH = swapped ? srcW : srcH;

  const scale = Math.min(1, options.maxDimension / Math.max(rotW, rotH));
  const outW = Math.max(1, Math.round(rotW * scale));
  const outH = Math.max(1, Math.round(rotH * scale));

  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { width: outW, height: outH };

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, outW, outH);

  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((options.rotation * Math.PI) / 180);
  const drawW = swapped ? outH : outW;
  const drawH = swapped ? outW : outH;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();

  if (
    options.filter !== 'original' ||
    options.adjustments.brightness !== 0 ||
    options.adjustments.contrast !== 0
  ) {
    const imgData = ctx.getImageData(0, 0, outW, outH);
    applyScanFilterToPixels(imgData.data, options.filter, options.adjustments);
    ctx.putImageData(imgData, 0, 0);
  }

  return { width: outW, height: outH };
}

export async function renderScannedPageToJpeg(
  image: HTMLImageElement,
  options: RenderScanOptions,
  quality = 0.88,
): Promise<{ jpegBytes: Uint8Array; width: number; height: number }> {
  const offscreen = document.createElement('canvas');
  const { width, height } = drawScannedPageOnCanvas(offscreen, image, options);

  const blob = await new Promise<Blob>((resolve, reject) => {
    offscreen.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode scanned page as JPEG'))),
      'image/jpeg',
      quality,
    );
  });

  const buf = await blob.arrayBuffer();
  offscreen.width = 0;
  offscreen.height = 0;

  return { jpegBytes: new Uint8Array(buf), width, height };
}
