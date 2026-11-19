/// <reference lib="webworker" />
import type { SupportedImageMime } from '@/lib/file-validation';
import {
  clampCropRect,
  resolveRotatedBounds,
  type CropRect,
  type ImageRotation,
} from './resize-crop.logic';

export interface ResizeCropWorkerRequest {
  buffer: ArrayBuffer;
  inputMime: SupportedImageMime;
  outputMime: SupportedImageMime;
  crop: CropRect;
  rotation: ImageRotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
  targetWidth: number;
  targetHeight: number;
  quality: number; // 0.1..1.0
}

export interface ResizeCropWorkerResponse {
  buffer: ArrayBuffer;
  outputMime: SupportedImageMime;
  outputWidth: number;
  outputHeight: number;
}

self.onmessage = async (event: MessageEvent<ResizeCropWorkerRequest>) => {
  const req = event.data;

  try {
    self.postMessage({ type: 'progress', percent: 15 });

    const sourceBlob = new Blob([req.buffer], { type: req.inputMime });
    const bitmap = await createImageBitmap(sourceBlob);

    try {
      const safeCrop = clampCropRect(req.crop, bitmap.width, bitmap.height);
      const rotated = resolveRotatedBounds(safeCrop.width, safeCrop.height, req.rotation);

      self.postMessage({ type: 'progress', percent: 45 });

      // Step 1: Crop, rotate, and flip at native crop resolution
      const stageCanvas = new OffscreenCanvas(rotated.width, rotated.height);
      const stageCtx = stageCanvas.getContext('2d');
      if (!stageCtx) {
        throw new Error('Could not initialize 2D OffscreenCanvas context.');
      }

      stageCtx.translate(rotated.width / 2, rotated.height / 2);
      stageCtx.scale(req.flipHorizontal ? -1 : 1, req.flipVertical ? -1 : 1);
      stageCtx.rotate((rotated.angle * Math.PI) / 180);
      stageCtx.drawImage(
        bitmap,
        safeCrop.x,
        safeCrop.y,
        safeCrop.width,
        safeCrop.height,
        -safeCrop.width / 2,
        -safeCrop.height / 2,
        safeCrop.width,
        safeCrop.height,
      );

      self.postMessage({ type: 'progress', percent: 75 });

      // Step 2: Scale to final target dimensions and encode
      const outW = Math.max(1, Math.round(req.targetWidth));
      const outH = Math.max(1, Math.round(req.targetHeight));
      const finalCanvas = new OffscreenCanvas(outW, outH);
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) {
        throw new Error('Could not initialize output 2D context.');
      }

      if (req.outputMime === 'image/jpeg') {
        finalCtx.fillStyle = '#FFFFFF';
        finalCtx.fillRect(0, 0, outW, outH);
      }

      finalCtx.imageSmoothingEnabled = true;
      finalCtx.imageSmoothingQuality = 'high';
      finalCtx.drawImage(stageCanvas, 0, 0, outW, outH);

      const outBlob = await finalCanvas.convertToBlob({
        type: req.outputMime,
        quality: Math.max(0.1, Math.min(1, req.quality)),
      });
      const outBuffer = await outBlob.arrayBuffer();

      self.postMessage({ type: 'progress', percent: 100 });
      self.postMessage(
        {
          type: 'result',
          data: {
            buffer: outBuffer,
            outputMime: req.outputMime,
            outputWidth: outW,
            outputHeight: outH,
          } satisfies ResizeCropWorkerResponse,
        },
        [outBuffer],
      );
    } finally {
      bitmap.close();
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      code: 'RESIZE_CROP_FAILED',
      message: err instanceof Error ? err.message : 'Failed to resize/crop image.',
    });
  }
};
