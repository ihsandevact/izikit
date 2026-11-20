import { scaleBoxToPixels, type RedactionBox } from './blur-redact.logic';

function applyPixelateRegion(
  ctx: CanvasRenderingContext2D,
  sourceImage: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  box: RedactionBox,
) {
  const rect = scaleBoxToPixels(box, targetWidth, targetHeight);
  const srcRect = scaleBoxToPixels(box, sourceWidth, sourceHeight);

  // Block size scales proportionally with target canvas size and intensity (10..100)
  const baseDim = Math.max(targetWidth, targetHeight);
  const blockSize = Math.max(
    4,
    Math.round((baseDim / 90) * (0.4 + (box.intensity / 100) * 1.8)),
  );
  const sampleW = Math.max(1, Math.ceil(rect.width / blockSize));
  const sampleH = Math.max(1, Math.ceil(rect.height / blockSize));

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = sampleW;
  tempCanvas.height = sampleH;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;

  tempCtx.imageSmoothingEnabled = true;
  tempCtx.drawImage(
    sourceImage,
    srcRect.x,
    srcRect.y,
    srcRect.width,
    srcRect.height,
    0,
    0,
    sampleW,
    sampleH,
  );

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tempCanvas, 0, 0, sampleW, sampleH, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function applyBlurRegion(
  ctx: CanvasRenderingContext2D,
  sourceImage: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
  box: RedactionBox,
) {
  const rect = scaleBoxToPixels(box, targetWidth, targetHeight);
  const baseDim = Math.max(targetWidth, targetHeight);
  const radius = Math.max(4, Math.round((baseDim / 110) * (0.4 + (box.intensity / 100) * 2.0)));

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);
  ctx.restore();
}

function applySolidRegion(
  ctx: CanvasRenderingContext2D,
  targetWidth: number,
  targetHeight: number,
  box: RedactionBox,
) {
  const rect = scaleBoxToPixels(box, targetWidth, targetHeight);
  ctx.save();
  ctx.fillStyle = box.color || '#0F172A';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

export function renderRedactedCanvas(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  boxes: readonly RedactionBox[],
  activeDraft?: Omit<RedactionBox, 'id'> | null,
) {
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  const srcW = image.naturalWidth || targetWidth;
  const srcH = image.naturalHeight || targetHeight;

  const drawBox = (box: RedactionBox) => {
    if (box.mode === 'solid') {
      applySolidRegion(ctx, targetWidth, targetHeight, box);
    } else if (box.mode === 'blur') {
      applyBlurRegion(ctx, image, targetWidth, targetHeight, box);
    } else {
      applyPixelateRegion(ctx, image, srcW, srcH, targetWidth, targetHeight, box);
    }
  };

  for (const box of boxes) {
    drawBox(box);
  }

  if (activeDraft) {
    drawBox({ ...activeDraft, id: 'draft' });
    const rect = scaleBoxToPixels(activeDraft, targetWidth, targetHeight);
    ctx.save();
    ctx.strokeStyle = '#FFB020';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }
}
