export interface SupportChannel {
  id: string;
  label: string;
  url: string | null;
}

export const SITE_CONFIG = {
  brandName: 'izikit',
  siteUrl: 'https://izikit.app',
  version: '0.1.0',
  /**
   * Configure real donation links (Saweria, Trakteer, Ko-fi) once ready.
   * When null, the UI links honestly to /about#support without dead external URLs.
   */
  supportChannels: [
    { id: 'saweria', label: 'Saweria', url: null },
    { id: 'trakteer', label: 'Trakteer', url: null },
    { id: 'kofi', label: 'Ko-fi', url: null },
  ] as readonly SupportChannel[],
  limits: {
    pdfSoftMaxBytes: 100 * 1024 * 1024, // 100 MB recommended per file for browser memory
    pdfTotalSoftMaxBytes: 250 * 1024 * 1024, // 250 MB total batch recommendation
    imageSoftMaxBytes: 30 * 1024 * 1024, // 30 MB per image recommendation
    maxBatchFiles: 50,
  },
} as const;

export function getActiveSupportChannels(): Array<{ id: string; label: string; url: string }> {
  return SITE_CONFIG.supportChannels.filter(
    (ch): ch is { id: string; label: string; url: string } => Boolean(ch.url),
  );
}
