export type AspectRatioKey = 'auto' | '16:9' | '4:3' | '1:1' | '4:5' | '9:16';
export type BackgroundType = 'gradient' | 'solid' | 'transparent';
export type FrameStyleKey =
  | 'none'
  | 'macos-light'
  | 'macos-dark'
  | 'browser-light'
  | 'browser-dark'
  | 'glass';
export type ShadowPresetKey = 'none' | 'soft' | 'elevated' | 'dramatic';
export type ExportFormatKey = 'png' | 'webp';

export interface GradientPreset {
  id: string;
  labelId: string;
  labelEn: string;
  angleDeg: number;
  stops: readonly [string, string] | readonly [string, string, string];
}

export interface MockupConfig {
  aspectRatio: AspectRatioKey;
  backgroundType: BackgroundType;
  gradientId: string;
  solidColor: string;
  frameStyle: FrameStyleKey;
  frameTitle: string;
  padding: number;
  borderRadius: number;
  shadow: ShadowPresetKey;
  exportScale: 1 | 2;
}

export interface MockupLayout {
  canvasWidth: number;
  canvasHeight: number;
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
  chromeHeight: number;
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  effectiveScale: number;
  effectiveRadius: number;
  glassRimPx: number;
}

export const MAX_EXPORT_DIMENSION = 4096;

export const GRADIENT_PRESETS: readonly GradientPreset[] = [
  {
    id: 'emerald-mint',
    labelId: 'Zamrud Mint',
    labelEn: 'Emerald Mint',
    angleDeg: 135,
    stops: ['#059669', '#34D399', '#A7F3D0'],
  },
  {
    id: 'ocean-indigo',
    labelId: 'Samudra Indigo',
    labelEn: 'Ocean Indigo',
    angleDeg: 135,
    stops: ['#1D4ED8', '#6366F1', '#38BDF8'],
  },
  {
    id: 'sunset-peach',
    labelId: 'Senja Persik',
    labelEn: 'Sunset Peach',
    angleDeg: 135,
    stops: ['#F97316', '#FB7185', '#FDE047'],
  },
  {
    id: 'carbon-slate',
    labelId: 'Karbon Gelap',
    labelEn: 'Carbon Slate',
    angleDeg: 145,
    stops: ['#0F172A', '#1E293B', '#334155'],
  },
  {
    id: 'warm-sand',
    labelId: 'Pasir Hangat',
    labelEn: 'Warm Sand',
    angleDeg: 135,
    stops: ['#F5F5F4', '#E7E5E4', '#D6D3D1'],
  },
  {
    id: 'lavender-mist',
    labelId: 'Kabut Lavender',
    labelEn: 'Lavender Mist',
    angleDeg: 135,
    stops: ['#7C3AED', '#C084FC', '#F5D0FE'],
  },
  {
    id: 'aurora-teal',
    labelId: 'Aurora Teal',
    labelEn: 'Aurora Teal',
    angleDeg: 125,
    stops: ['#0F766E', '#0EA5E9', '#818CF8'],
  },
  {
    id: 'rose-quartz',
    labelId: 'Mawar Lembut',
    labelEn: 'Rose Quartz',
    angleDeg: 135,
    stops: ['#FFE4E6', '#FBCFE8', '#DDD6FE'],
  },
] as const;

export const ASPECT_RATIO_PRESETS: Record<
  AspectRatioKey,
  { label: string; width: number; height: number }
> = {
  auto: { label: 'Auto', width: 0, height: 0 },
  '16:9': { label: '16:9', width: 1600, height: 900 },
  '4:3': { label: '4:3', width: 1600, height: 1200 },
  '1:1': { label: '1:1', width: 1440, height: 1440 },
  '4:5': { label: '4:5', width: 1440, height: 1800 },
  '9:16': { label: '9:16', width: 1080, height: 1920 },
};

export const DEFAULT_MOCKUP_CONFIG: MockupConfig = {
  aspectRatio: '16:9',
  backgroundType: 'gradient',
  gradientId: 'emerald-mint',
  solidColor: '#E5E7EB',
  frameStyle: 'macos-light',
  frameTitle: 'izikit.app',
  padding: 72,
  borderRadius: 16,
  shadow: 'elevated',
  exportScale: 1,
};

export function getGradientById(id: string): GradientPreset {
  return GRADIENT_PRESETS.find((g) => g.id === id) ?? GRADIENT_PRESETS[0];
}

export function getBaseChromeHeight(frameStyle: FrameStyleKey): number {
  if (frameStyle === 'macos-light' || frameStyle === 'macos-dark') return 36;
  if (frameStyle === 'browser-light' || frameStyle === 'browser-dark') return 44;
  return 0;
}

/**
 * Computes exact pixel placement for the canvas, window chrome, and screenshot image
 * while preserving aspect ratio and capping output within MAX_EXPORT_DIMENSION.
 */
export function computeMockupLayout(
  sourceWidth: number,
  sourceHeight: number,
  config: MockupConfig,
): MockupLayout {
  const safeSrcW = Math.max(1, Math.round(sourceWidth));
  const safeSrcH = Math.max(1, Math.round(sourceHeight));
  const padding = Math.max(0, Math.min(240, config.padding));
  const baseChrome = getBaseChromeHeight(config.frameStyle);
  const baseGlassRim = config.frameStyle === 'glass' ? 10 : 0;

  let baseCanvasW: number;
  let baseCanvasH: number;
  let baseImageW: number;
  let baseImageH: number;
  let baseChromeH: number;

  if (config.aspectRatio === 'auto') {
    // Normalize huge screenshots down to a comfortable 1x logical width (<= 1600) for consistent padding/chrome
    const logicalFit = Math.min(1, 1600 / Math.max(safeSrcW, safeSrcH));
    baseImageW = Math.max(1, Math.round(safeSrcW * logicalFit));
    baseImageH = Math.max(1, Math.round(safeSrcH * logicalFit));
    baseChromeH = baseChrome;
    baseCanvasW = baseImageW + (padding + baseGlassRim) * 2;
    baseCanvasH = baseImageH + baseChromeH + (padding + baseGlassRim) * 2;
  } else {
    const preset = ASPECT_RATIO_PRESETS[config.aspectRatio];
    baseCanvasW = preset.width;
    baseCanvasH = preset.height;
    baseChromeH = baseChrome;

    const maxInnerW = Math.max(64, baseCanvasW - (padding + baseGlassRim) * 2);
    const maxInnerH = Math.max(64, baseCanvasH - (padding + baseGlassRim) * 2 - baseChromeH);

    const fit = Math.min(maxInnerW / safeSrcW, maxInnerH / safeSrcH);
    baseImageW = Math.max(1, Math.round(safeSrcW * fit));
    baseImageH = Math.max(1, Math.round(safeSrcH * fit));
  }

  const desiredScale = config.exportScale;
  const maxSideAtScale = Math.max(baseCanvasW, baseCanvasH) * desiredScale;
  const clampFactor =
    maxSideAtScale > MAX_EXPORT_DIMENSION ? MAX_EXPORT_DIMENSION / maxSideAtScale : 1;
  const effectiveScale = desiredScale * clampFactor;

  const canvasWidth = Math.max(1, Math.round(baseCanvasW * effectiveScale));
  const canvasHeight = Math.max(1, Math.round(baseCanvasH * effectiveScale));
  const imageWidth = Math.max(1, Math.round(baseImageW * effectiveScale));
  const imageHeight = Math.max(1, Math.round(baseImageH * effectiveScale));
  const chromeHeight = Math.round(baseChromeH * effectiveScale);
  const glassRimPx = Math.round(baseGlassRim * effectiveScale);

  const frameWidth = imageWidth;
  const frameHeight = imageHeight + chromeHeight;
  const frameX = Math.round((canvasWidth - frameWidth) / 2);
  const frameY = Math.round((canvasHeight - frameHeight) / 2);

  return {
    canvasWidth,
    canvasHeight,
    frameX,
    frameY,
    frameWidth,
    frameHeight,
    chromeHeight,
    imageX: frameX,
    imageY: frameY + chromeHeight,
    imageWidth,
    imageHeight,
    effectiveScale,
    effectiveRadius: Math.round(Math.max(0, config.borderRadius) * effectiveScale),
    glassRimPx,
  };
}

export function buildMockupFilename(
  originalName: string,
  aspectRatio: AspectRatioKey,
  format: ExportFormatKey,
): string {
  const base =
    originalName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'screenshot';
  const ratioTag = aspectRatio === 'auto' ? 'auto' : aspectRatio.replace(':', 'x');
  return `mockup-${base}-${ratioTag}.${format}`;
}
