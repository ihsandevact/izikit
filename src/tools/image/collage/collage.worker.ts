/// <reference lib="webworker" />
import type { SupportedImageMime } from '../../../lib/file-validation';
import {
  computeCollageCells,
  computeImageFitRect,
  resolveCanvasSize,
  resolveGridDimensions,
  validateCollageOptions,
  type CollageOptions,
  type CollageOutputFormat,
} from './collage.logic';

export interface CollageWorkerImageInput {
  buffer: ArrayBuffer;
  mime: SupportedImageMime;
}

export interface CollageWorkerRequest {
  images: CollageWorkerImageInput[];
  options: CollageOptions;
}

export interface CollageWorkerResponse {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  outputMime: CollageOutputFormat;
  placedCount: number;
}

function drawRoundedRectPath(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

self.onmessage = async (event: MessageEvent<CollageWorkerRequest>) => {
  const { images, options } = event.data;

  try {
    validateCollageOptions(options, images.length);

    const { cols, rows } = resolveGridDimensions(options.layout, images.length);
    const { width, height } = resolveCanvasSize(options.aspectRatio, options.longEdgePx);
    const cells = computeCollageCells(
      width,
      height,
      cols,
      rows,
      options.gapPx,
      options.paddingPx,
    );

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D OffscreenCanvas context.');
    }

    const isTransparentAllowed = options.outputFormat !== 'image/jpeg';
    if (options.backgroundColor !== 'transparent') {
      ctx.fillStyle = options.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    } else if (!isTransparentAllowed) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }

    const placedCount = Math.min(images.length, cells.length);

    for (let i = 0; i < placedCount; i += 1) {
      self.postMessage({
        type: 'progress',
        percent: Math.round((i / placedCount) * 85),
        current: i + 1,
        total: placedCount,
      });

      const entry = images[i];
      const cell = cells[i];
      const bitmap = await createImageBitmap(new Blob([entry.buffer], { type: entry.mime }));

      try {
        const rect = computeImageFitRect(
          bitmap.width,
          bitmap.height,
          cell.x,
          cell.y,
          cell.width,
          cell.height,
          options.fitMode,
        );

        ctx.save();
        if (options.borderRadiusPx > 0) {
          drawRoundedRectPath(ctx, cell.x, cell.y, cell.width, cell.height, options.borderRadiusPx);
          ctx.clip();
        } else {
          ctx.beginPath();
          ctx.rect(cell.x, cell.y, cell.width, cell.height);
          ctx.clip();
        }
        ctx.drawImage(
          bitmap,
          rect.sx,
          rect.sy,
          rect.sw,
          rect.sh,
          rect.dx,
          rect.dy,
          rect.dw,
          rect.dh,
        );
        ctx.restore();
      } finally {
        bitmap.close();
      }
    }

    self.postMessage({
      type: 'progress',
      percent: 95,
      current: placedCount,
      total: placedCount,
    });

    const outBlob = await canvas.convertToBlob({
      type: options.outputFormat,
      quality: options.outputFormat === 'image/png' ? undefined : options.quality / 100,
    });
    const outBuffer = await outBlob.arrayBuffer();

    self.postMessage({
      type: 'progress',
      percent: 100,
      current: placedCount,
      total: placedCount,
    });

    self.postMessage(
      {
        type: 'result',
        data: {
          buffer: outBuffer,
          width,
          height,
          outputMime: options.outputFormat,
          placedCount,
        } satisfies CollageWorkerResponse,
      },
      [outBuffer],
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      code: 'COLLAGE_FAILED',
      message: err instanceof Error ? err.message : 'Collage creation failed.',
    });
  }
};
