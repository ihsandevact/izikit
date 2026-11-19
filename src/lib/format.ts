export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

export interface SavingsSummary {
  savedBytes: number;
  percent: number;
  isSmaller: boolean;
}

export function calculateSavings(beforeBytes: number, afterBytes: number): SavingsSummary {
  if (beforeBytes <= 0) {
    return { savedBytes: 0, percent: 0, isSmaller: false };
  }
  const savedBytes = beforeBytes - afterBytes;
  const percent = Math.round((savedBytes / beforeBytes) * 100);
  return {
    savedBytes,
    percent,
    isSmaller: savedBytes > 0,
  };
}

export function sanitizeFilename(rawName: string, fallback: string, requiredExt?: string): string {
  const cleaned = rawName
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  let base = cleaned || fallback;

  if (requiredExt) {
    const ext = requiredExt.startsWith('.') ? requiredExt.toLowerCase() : `.${requiredExt.toLowerCase()}`;
    if (!base.toLowerCase().endsWith(ext)) {
      base = `${base.replace(/\.[^.]+$/, '')}${ext}`;
    }
  }

  return base;
}

export function replaceFileExtension(filename: string, newExt: string): string {
  const cleanExt = newExt.startsWith('.') ? newExt.slice(1) : newExt;
  const stem = filename.replace(/\.[^/.]+$/, '');
  return `${stem || 'file'}.${cleanExt}`;
}
