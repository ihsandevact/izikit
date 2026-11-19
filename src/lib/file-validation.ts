export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Inspect magic bytes of a file buffer to verify real PDF header (%PDF-).
 */
export function hasPdfMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  // Allow optional UTF-8 BOM or leading whitespace within first 1024 bytes per PDF spec
  const scanLimit = Math.min(bytes.length - 5, 1024);
  for (let i = 0; i <= scanLimit; i += 1) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 && // F
      bytes[i + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Inspect magic bytes of an image buffer to detect JPEG, PNG, or WebP reliably.
 */
export function detectImageMimeFromBytes(bytes: Uint8Array): SupportedImageMime | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export async function readFileHeaderBytes(file: File, byteCount = 1024): Promise<Uint8Array> {
  const slice = file.slice(0, byteCount);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

export function mimeToExtension(mime: SupportedImageMime): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
  }
}
