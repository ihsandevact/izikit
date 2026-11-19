/// <reference lib="webworker" />
import type { SupportedImageMime } from '../../../lib/file-validation';
import {
  computeImageWatermarkCenters,
  computeLogoDrawBox,
  computeProportionalFontPx,
  resolveOutputImageMime,
  validateImageWatermarkOptions,
  type ImageWatermarkOptions,
} from './watermark-image.logic';

export interface WatermarkImageWorkerItem {
  id: string;
  inputMime: SupportedImageMime;
  outputFilename: string;
  buffer: ArrayBuffer;
}

export interface WatermarkImageWorkerRequest {
  items: WatermarkImageWorkerItem[];
  options: ImageWatermarkOptions;
  logo?: {
    buffer: ArrayBuffer;
    mime: SupportedImageMime;
  };
}

export interface WatermarkImageWorkerOutputItem {
  id: string;
  outputFilename: string;
  outputMime: SupportedImageMime;
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

export interface WatermarkImageWorkerResponse {
  results: WatermarkImageWorkerOutputItem[];
}

async function watermarkSingleImage(
  item: WatermarkImageWorkerItem,
  options: ImageWatermarkOptions,
  logoBitmap: ImageBitmap | null,
): Promise<WatermarkImageWorkerOutputItem> {
  const sourceBlob = new Blob([item.buffer], { type: item.inputMime });
  const bitmap = await createImageBitmap(sourceBlob);

  try {
    const width = bitmap.width;
    const height = bitmap.height;
    const outputMime = resolveOutputImageMime(item.inputMime, options.outputFormat);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D OffscreenCanvas context.');
    }

    if (outputMime === 'image/jpeg' && item.inputMime !== 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(bitmap, 0, 0);

    const rad = (options.rotation * Math.PI) / 180;

    if (options.kind === 'text') {
      const label = options.text.trim();
      const fontPx = computeProportionalFontPx(width, height, options.fontPercent);
      ctx.font = `700 ${fontPx}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const metrics = ctx.measureText(label);
      const boxWidth = Math.max(fontPx, metrics.width);
      const boxHeight = fontPx * 1.15;

      const centers = computeImageWatermarkCenters({
        imageWidth: width,
        imageHeight: height,
        boxWidth,
        boxHeight,
        position: options.position,
        marginPercent: options.marginPercent,
      });

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (const { cx, cy } of centers) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rad);
        ctx.globalAlpha = options.opacity;
        if (options.textShadow) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
          ctx.shadowBlur = Math.max(2, Math.round(fontPx * 0.14));
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = Math.max(1, Math.round(fontPx * 0.05));
        }
        ctx.fillStyle = options.colorHex;
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    } else if (logoBitmap) {
      const logoBox = computeLogoDrawBox(
        width,
        height,
        logoBitmap.width,
        logoBitmap.height,
        options.logoScalePercent,
      );
      const centers = computeImageWatermarkCenters({
        imageWidth: width,
        imageHeight: height,
        boxWidth: logoBox.width,
        boxHeight: logoBox.height,
        position: options.position,
        marginPercent: options.marginPercent,
      });

      for (const { cx, cy } of centers) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rad);
        ctx.globalAlpha = options.opacity;
        ctx.drawImage(
          logoBitmap,
          -logoBox.width / 2,
          -logoBox.height / 2,
          logoBox.width,
          logoBox.height,
        );
        ctx.restore();
      }
    }

    const outBlob = await canvas.convertToBlob({
      type: outputMime,
      quality: outputMime === 'image/png' ? undefined : options.quality / 100,
    });
    const outBuffer = await outBlob.arrayBuffer();

    return {
      id: item.id,
      outputFilename: item.outputFilename,
      outputMime,
      buffer: outBuffer,
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (event: MessageEvent<WatermarkImageWorkerRequest>) => {
  const { items, options, logo } = event.data;
  let logoBitmap: ImageBitmap | null = null;

  try {
    validateImageWatermarkOptions(options, Boolean(logo));

    if (options.kind === 'logo' && logo) {
      logoBitmap = await createImageBitmap(new Blob([logo.buffer], { type: logo.mime }));
    }

    const results: WatermarkImageWorkerOutputItem[] = [];
    const transferables: Transferable[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      self.postMessage({
        type: 'progress',
        percent: Math.round((i / items.length) * 95),
        current: i + 1,
        total: items.length,
        label: item.outputFilename,
      });

      const stamped = await watermarkSingleImage(item, options, logoBitmap);
      results.push(stamped);
      transferables.push(stamped.buffer);
    }

    self.postMessage({
      type: 'progress',
      percent: 100,
      current: items.length,
      total: items.length,
    });

    self.postMessage(
      {
        type: 'result',
        data: { results } satisfies WatermarkImageWorkerResponse,
      },
      transferables,
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      code: 'WATERMARK_FAILED',
      message: err instanceof Error ? err.message : 'Image watermark failed.',
    });
  } finally {
    logoBitmap?.close();
  }
};
