export interface SupportChannel {
  id: string;
  label: string;
  url: string | null;
}

export const SITE_CONFIG = {
  brandName: 'izikit',
  siteUrl: 'https://izikit.app',
  version: '0.1.1',
  /** Every support / "Dukung" action points here. */
  supportUrl: 'https://trakteer.id/ihsan97/tip',
  supportChannels: [
    { id: 'trakteer', label: 'Trakteer', url: 'https://trakteer.id/ihsan97/tip' },
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
