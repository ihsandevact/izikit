import type { SupportedImageMime } from '@/lib/file-validation';

export type OutputFormatOption = 'image/webp' | 'original' | 'image/jpeg' | 'image/png';
export type ImageTargetPresetKey = 'custom' | '200kb' | '500kb';

export interface CompressOptions {
  quality: number; // 10..100
  outputFormat: OutputFormatOption;
  maxWidth: number | null; // null keeps original width
  targetMaxBytes?: number | null; // optional iterative target-size fit (e.g. CPNS < 200 KB)
}

export function parseImageTargetPreset(raw: string | null): ImageTargetPresetKey {
  if (!raw) return 'custom';
  const norm = raw.trim().toLowerCase();
  if (norm === '200kb' || norm === 'cpns-200kb') return '200kb';
  if (norm === '500kb' || norm === 'cpns-500kb') return '500kb';
  return 'custom';
}

export function getImageTargetBytes(preset: ImageTargetPresetKey): number | null {
  // ~97% safety buffer so files stay comfortably below strict portal limits (e.g. SSCASN)
  if (preset === '200kb') return 194 * 1024;
  if (preset === '500kb') return 485 * 1024;
  return null;
}

export function getImageTargetAttempts(
  initialMaxWidth: number | null,
): Array<{ quality: number; maxWidth: number | null }> {
  const cap = (w: number) => (initialMaxWidth ? Math.min(initialMaxWidth, w) : w);
  return [
    { quality: 82, maxWidth: cap(1600) },
    { quality: 68, maxWidth: cap(1400) },
    { quality: 54, maxWidth: cap(1200) },
    { quality: 42, maxWidth: cap(960) },
    { quality: 32, maxWidth: cap(760) },
  ];
}

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Computes scaled dimensions while keeping aspect ratio and never upscaling.
 */
export function calculateTargetDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number | null,
): Dimensions {
  if (!maxWidth || maxWidth <= 0 || sourceWidth <= maxWidth) {
    return { width: sourceWidth, height: sourceHeight };
  }
  const scale = maxWidth / sourceWidth;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function resolveOutputMime(
  inputMime: SupportedImageMime,
  outputFormat: OutputFormatOption,
): SupportedImageMime {
  if (outputFormat === 'original') {
    return inputMime;
  }
  return outputFormat;
}

/**
 * Maps a 10-100 quality slider to UPNG palette quantization colors.
 * 0 instructs UPNG.encode to use lossless compression.
 */
export function qualityToPngColorCount(quality: number): number {
  const clamped = Math.max(10, Math.min(100, Math.round(quality)));
  if (clamped >= 98) return 0; // Lossless
  if (clamped >= 80) return 256;
  if (clamped >= 60) return 160;
  if (clamped >= 40) return 96;
  if (clamped >= 25) return 64;
  return 32;
}

/**
 * Determines whether the original buffer should be preserved because
 * re-encoding in the same format at the same dimensions did not shrink it.
 */
export function shouldKeepOriginal(params: {
  inputMime: SupportedImageMime;
  outputMime: SupportedImageMime;
  originalSize: number;
  compressedSize: number;
  resized: boolean;
}): boolean {
  return (
    !params.resized &&
    params.inputMime === params.outputMime &&
    params.compressedSize >= params.originalSize
  );
}
