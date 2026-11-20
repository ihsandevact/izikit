import {
  mimeToExtension,
  type ConvertibleImageMime,
  type ConvertibleInputMime,
} from '@/lib/file-validation';

export type ConvertImageErrorCode = 'INVALID_QUALITY' | 'EMPTY_BATCH';

export class ConvertImageError extends Error {
  readonly code: ConvertImageErrorCode;

  constructor(code: ConvertImageErrorCode, message: string) {
    super(message);
    this.name = 'ConvertImageError';
    this.code = code;
  }
}

export function normalizeQuality(
  qualityPercent: number,
  targetFormat: ConvertibleImageMime,
): number | undefined {
  if (targetFormat === 'image/png') {
    return undefined;
  }
  if (!Number.isFinite(qualityPercent)) {
    throw new ConvertImageError('INVALID_QUALITY', 'Quality must be a finite number.');
  }
  const clamped = Math.max(10, Math.min(100, qualityPercent));
  return clamped / 100;
}

export function deduplicateOutputNames(
  inputNames: string[],
  targetFormat: ConvertibleImageMime,
): string[] {
  const ext = mimeToExtension(targetFormat);
  const counts = new Map<string, number>();

  return inputNames.map((rawName) => {
    const stem = rawName.replace(/\.[^/.]+$/, '').trim() || 'image';
    const key = stem.toLowerCase();
    const seen = counts.get(key) ?? 0;
    counts.set(key, seen + 1);
    return seen === 0 ? `${stem}.${ext}` : `${stem}-${seen + 1}.${ext}`;
  });
}

export interface ConvertPlanInputItem {
  id: string;
  name: string;
  mime: ConvertibleInputMime;
}

export interface ConvertPlanOptions {
  targetFormat: ConvertibleImageMime;
  quality: number;
  jpegBackground: string;
}

export interface ConversionJob {
  id: string;
  inputMime: ConvertibleInputMime;
  outputMime: ConvertibleImageMime;
  outputFilename: string;
  qualityRatio: number | undefined;
  needsBackgroundFill: boolean;
  backgroundColor: string;
}

export function buildConversionPlan(
  items: ConvertPlanInputItem[],
  options: ConvertPlanOptions,
): ConversionJob[] {
  if (items.length === 0) {
    throw new ConvertImageError('EMPTY_BATCH', 'At least one image is required to convert.');
  }

  const qualityRatio = normalizeQuality(options.quality, options.targetFormat);
  const outputNames = deduplicateOutputNames(
    items.map((item) => item.name),
    options.targetFormat,
  );

  return items.map((item, idx) => ({
    id: item.id,
    inputMime: item.mime,
    outputMime: options.targetFormat,
    outputFilename: outputNames[idx],
    qualityRatio,
    needsBackgroundFill: options.targetFormat === 'image/jpeg' && item.mime !== 'image/jpeg',
    backgroundColor: options.jpegBackground,
  }));
}
