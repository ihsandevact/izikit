import {
  computeMockupLayout,
  getGradientById,
  type ExportFormatKey,
  type MockupConfig,
  type MockupLayout,
} from './screenshot-mockup.logic';

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: MockupConfig,
) {
  if (config.backgroundType === 'transparent') {
    ctx.clearRect(0, 0, width, height);
    return;
  }

  if (config.backgroundType === 'solid') {
    ctx.fillStyle = config.solidColor || '#E5E7EB';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const preset = getGradientById(config.gradientId);
  const rad = ((preset.angleDeg - 90) * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const halfDiag = Math.hypot(width, height) / 2;
  const x0 = cx - Math.cos(rad) * halfDiag;
  const y0 = cy - Math.sin(rad) * halfDiag;
  const x1 = cx + Math.cos(rad) * halfDiag;
  const y1 = cy + Math.sin(rad) * halfDiag;

  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  if (preset.stops.length === 2) {
    grad.addColorStop(0, preset.stops[0]);
    grad.addColorStop(1, preset.stops[1]);
  } else {
    grad.addColorStop(0, preset.stops[0]);
    grad.addColorStop(0.52, preset.stops[1]);
    grad.addColorStop(1, preset.stops[2]);
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function drawShadowPasses(
  ctx: CanvasRenderingContext2D,
  layout: MockupLayout,
  config: MockupConfig,
) {
  if (config.shadow === 'none') return;

  const s = layout.effectiveScale;
  const passes =
    config.shadow === 'soft'
      ? [{ blur: 28 * s, offsetY: 12 * s, alpha: 0.16 }]
      : config.shadow === 'elevated'
        ? [
            { blur: 18 * s, offsetY: 8 * s, alpha: 0.14 },
            { blur: 52 * s, offsetY: 26 * s, alpha: 0.24 },
          ]
        : [
            { blur: 22 * s, offsetY: 10 * s, alpha: 0.2 },
            { blur: 78 * s, offsetY: 36 * s, alpha: 0.36 },
          ];

  for (const pass of passes) {
    ctx.save();
    ctx.shadowColor = `rgba(15, 23, 42, ${pass.alpha})`;
    ctx.shadowBlur = pass.blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = pass.offsetY;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    traceRoundedRect(
      ctx,
      layout.frameX,
      layout.frameY,
      layout.frameWidth,
      layout.frameHeight,
      layout.effectiveRadius,
    );
    ctx.fill();
    ctx.restore();
  }
}

function drawWindowChrome(
  ctx: CanvasRenderingContext2D,
  layout: MockupLayout,
  config: MockupConfig,
) {
  if (layout.chromeHeight <= 0) return;

  const isDark = config.frameStyle === 'macos-dark' || config.frameStyle === 'browser-dark';
  const isBrowser =
    config.frameStyle === 'browser-light' || config.frameStyle === 'browser-dark';
  const s = layout.effectiveScale;

  // Bar background
  ctx.fillStyle = isDark ? '#1E222B' : '#F3F4F6';
  ctx.fillRect(layout.frameX, layout.frameY, layout.frameWidth, layout.chromeHeight);

  // Bottom divider hairline
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  ctx.fillRect(
    layout.frameX,
    layout.frameY + layout.chromeHeight - Math.max(1, Math.round(s)),
    layout.frameWidth,
    Math.max(1, Math.round(s)),
  );

  // macOS traffic lights
  const dotRadius = Math.max(3, 5.5 * s);
  const dotY = layout.frameY + layout.chromeHeight / 2;
  const startX = layout.frameX + 18 * s;
  const gap = 18 * s;
  const colors = ['#FF5F56', '#FFBD2E', '#27C93F'];

  colors.forEach((color, idx) => {
    ctx.beginPath();
    ctx.arc(startX + idx * gap, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  // Title or Browser URL pill
  const label = config.frameTitle.trim();
  const fontSize = Math.max(10, Math.round(12 * s));
  ctx.font = `500 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (isBrowser) {
    const pillW = Math.min(layout.frameWidth * 0.56, Math.max(140 * s, layout.frameWidth - 180 * s));
    const pillH = Math.max(18, 24 * s);
    const pillX = layout.frameX + (layout.frameWidth - pillW) / 2;
    const pillY = dotY - pillH / 2;

    if (pillW > 80 * s) {
      ctx.save();
      traceRoundedRect(ctx, pillX, pillY, pillW, pillH, 7 * s);
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF';
      ctx.fill();
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)';
      ctx.lineWidth = Math.max(1, s);
      ctx.stroke();

      if (label) {
        ctx.fillStyle = isDark ? '#CBD5E1' : '#475569';
        ctx.fillText(label, layout.frameX + layout.frameWidth / 2, dotY, pillW - 18 * s);
      }
      ctx.restore();
    }
  } else if (label) {
    ctx.fillStyle = isDark ? '#94A3B8' : '#4B5563';
    const maxTitleW = Math.max(40, layout.frameWidth - 160 * s);
    ctx.fillText(label, layout.frameX + layout.frameWidth / 2, dotY, maxTitleW);
  }
}

export function drawMockupOnCanvas(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  config: MockupConfig,
  maxPreviewDimension?: number,
): MockupLayout {
  const fullLayout = computeMockupLayout(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    config,
  );

  let renderLayout = fullLayout;
  if (
    maxPreviewDimension &&
    Math.max(fullLayout.canvasWidth, fullLayout.canvasHeight) > maxPreviewDimension
  ) {
    const ratio = maxPreviewDimension / Math.max(fullLayout.canvasWidth, fullLayout.canvasHeight);
    renderLayout = {
      canvasWidth: Math.max(1, Math.round(fullLayout.canvasWidth * ratio)),
      canvasHeight: Math.max(1, Math.round(fullLayout.canvasHeight * ratio)),
      frameX: Math.round(fullLayout.frameX * ratio),
      frameY: Math.round(fullLayout.frameY * ratio),
      frameWidth: Math.max(1, Math.round(fullLayout.frameWidth * ratio)),
      frameHeight: Math.max(1, Math.round(fullLayout.frameHeight * ratio)),
      chromeHeight: Math.round(fullLayout.chromeHeight * ratio),
      imageX: Math.round(fullLayout.imageX * ratio),
      imageY: Math.round(fullLayout.imageY * ratio),
      imageWidth: Math.max(1, Math.round(fullLayout.imageWidth * ratio)),
      imageHeight: Math.max(1, Math.round(fullLayout.imageHeight * ratio)),
      effectiveScale: fullLayout.effectiveScale * ratio,
      effectiveRadius: Math.round(fullLayout.effectiveRadius * ratio),
      glassRimPx: Math.round(fullLayout.glassRimPx * ratio),
    };
  }

  canvas.width = renderLayout.canvasWidth;
  canvas.height = renderLayout.canvasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return fullLayout;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Background
  drawBackground(ctx, renderLayout.canvasWidth, renderLayout.canvasHeight, config);

  // 2. Optional Glass Rim behind frame
  if (config.frameStyle === 'glass' && renderLayout.glassRimPx > 0) {
    const rim = renderLayout.glassRimPx;
    ctx.save();
    traceRoundedRect(
      ctx,
      renderLayout.frameX - rim,
      renderLayout.frameY - rim,
      renderLayout.frameWidth + rim * 2,
      renderLayout.frameHeight + rim * 2,
      renderLayout.effectiveRadius + rim * 0.65,
    );
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = Math.max(1, renderLayout.effectiveScale);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Soft multi-pass shadow
  drawShadowPasses(ctx, renderLayout, config);

  // 4. Clipped window frame + chrome + screenshot
  ctx.save();
  traceRoundedRect(
    ctx,
    renderLayout.frameX,
    renderLayout.frameY,
    renderLayout.frameWidth,
    renderLayout.frameHeight,
    renderLayout.effectiveRadius,
  );
  ctx.clip();

  drawWindowChrome(ctx, renderLayout, config);
  ctx.drawImage(
    image,
    renderLayout.imageX,
    renderLayout.imageY,
    renderLayout.imageWidth,
    renderLayout.imageHeight,
  );
  ctx.restore();

  // 5. Crisp subtle outer rim on frame
  ctx.save();
  traceRoundedRect(
    ctx,
    renderLayout.frameX,
    renderLayout.frameY,
    renderLayout.frameWidth,
    renderLayout.frameHeight,
    renderLayout.effectiveRadius,
  );
  ctx.strokeStyle =
    config.frameStyle === 'macos-dark' || config.frameStyle === 'browser-dark'
      ? 'rgba(255, 255, 255, 0.14)'
      : 'rgba(15, 23, 42, 0.10)';
  ctx.lineWidth = Math.max(1, renderLayout.effectiveScale);
  ctx.stroke();
  ctx.restore();

  return fullLayout;
}

export async function renderMockupBlob(
  image: HTMLImageElement,
  config: MockupConfig,
  format: ExportFormatKey,
  webpQuality = 0.92,
): Promise<{ blob: Blob; layout: MockupLayout }> {
  const offscreen = document.createElement('canvas');
  const layout = drawMockupOnCanvas(offscreen, image, config);
  const mime = format === 'webp' ? 'image/webp' : 'image/png';
  const quality = format === 'webp' ? webpQuality : undefined;

  const blob = await new Promise<Blob>((resolve, reject) => {
    offscreen.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to encode mockup image'));
      },
      mime,
      quality,
    );
  });

  return { blob, layout };
}
