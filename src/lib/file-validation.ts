import { SITE_CONFIG } from '@/config/site';
import { formatBytes } from './format';
import { createClientId } from './id';

export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type ConvertibleImageMime = SupportedImageMime | 'image/avif';
export type ConvertibleInputMime = ConvertibleImageMime | 'image/heic';

export interface ValidatedImageFile {
  id: string;
  file: File;
  mime: SupportedImageMime;
}

export interface ValidatedConvertibleImageFile {
  id: string;
  file: File;
  mime: ConvertibleInputMime;
}

export interface ValidatedPdfFile {
  id: string;
  file: File;
}

export interface ImageValidationMessages {
  tooLarge: string;
  notImage: string;
  generic: string;
}

export interface PdfValidationMessages {
  tooLarge: string;
  notPdf: string;
  generic: string;
}

export interface ValidatedDocxFile {
  id: string;
  file: File;
}

export interface DocxValidationMessages {
  tooLarge: string;
  notDocx: string;
  generic: string;
}

/**
 * Inspect magic bytes of a file buffer to verify real ZIP/OpenXML header (PK\x03\x04).
 */
export function hasZipMagicBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 && // P
    bytes[1] === 0x4b && // K
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

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
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
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
    bytes.length >= 12 &&
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

function readAsciiFourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

/**
 * Inspect ISO BMFF ftyp box magic bytes to detect AVIF images reliably.
 * Handles both direct 'avif'/'avis' major brands and 'mif1' with 'avif' compatible brand.
 */
export function isAvifBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (readAsciiFourCC(bytes, 4) !== 'ftyp') return false;

  const boxSize =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const majorBrand = readAsciiFourCC(bytes, 8);
  if (majorBrand === 'avif' || majorBrand === 'avis') {
    return true;
  }

  const end = Math.min(bytes.length, boxSize >= 16 ? boxSize : bytes.length);
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    const brand = readAsciiFourCC(bytes, offset);
    if (brand === 'avif' || brand === 'avis') {
      return true;
    }
  }

  return false;
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);

/**
 * Inspect ISO BMFF ftyp box magic bytes to detect HEIC/HEIF images reliably.
 * Must be checked after isAvifBytes so mif1+avif files are classified as AVIF.
 */
export function isHeicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (readAsciiFourCC(bytes, 4) !== 'ftyp') return false;

  const boxSize =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const majorBrand = readAsciiFourCC(bytes, 8);
  if (HEIC_BRANDS.has(majorBrand)) {
    return true;
  }

  const end = Math.min(bytes.length, boxSize >= 16 ? boxSize : bytes.length);
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    const brand = readAsciiFourCC(bytes, offset);
    if (HEIC_BRANDS.has(brand)) {
      return true;
    }
  }

  // Fallback for generic mif1 HEIF containers (not AVIF)
  return majorBrand === 'mif1' && !isAvifBytes(bytes);
}

export function detectConvertibleImageMimeFromBytes(
  bytes: Uint8Array,
): ConvertibleInputMime | null {
  const standard = detectImageMimeFromBytes(bytes);
  if (standard) return standard;
  if (isAvifBytes(bytes)) return 'image/avif';
  if (isHeicBytes(bytes)) return 'image/heic';
  return null;
}

function readBlobWithFileReader(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file bytes as ArrayBuffer.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed to read file.'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function readFileHeaderBytes(file: File, byteCount = 1024): Promise<Uint8Array> {
  const slice = file.slice(0, byteCount);
  if (typeof slice.arrayBuffer === 'function') {
    try {
      const buffer = await slice.arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      // Fall back to FileReader on browsers/WebViews where Blob.arrayBuffer fails
    }
  }
  const buffer = await readBlobWithFileReader(slice);
  return new Uint8Array(buffer);
}

export function mimeToExtension(mime: ConvertibleInputMime): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    case 'image/heic':
      return 'heic';
  }
}

export async function validateImageFiles(
  incomingFiles: readonly File[],
  messages: ImageValidationMessages,
): Promise<{ accepted: ValidatedImageFile[]; errors: string[] }> {
  const errors: string[] = [];
  const accepted: ValidatedImageFile[] = [];

  for (const file of incomingFiles) {
    if (file.size > SITE_CONFIG.limits.imageSoftMaxBytes) {
      errors.push(`${messages.tooLarge} ${file.name} (${formatBytes(file.size)})`);
      continue;
    }

    try {
      const header = await readFileHeaderBytes(file, 32);
      const mime = detectImageMimeFromBytes(header);
      if (!mime) {
        errors.push(`${messages.notImage} ${file.name}`);
        continue;
      }

      accepted.push({
        id: `${file.name}-${file.size}-${createClientId()}`,
        file,
        mime,
      });
    } catch {
      errors.push(`${messages.generic} (${file.name})`);
    }
  }

  return { accepted, errors };
}

export async function validateConvertibleImageFiles(
  incomingFiles: readonly File[],
  messages: ImageValidationMessages,
): Promise<{ accepted: ValidatedConvertibleImageFile[]; errors: string[] }> {
  const errors: string[] = [];
  const accepted: ValidatedConvertibleImageFile[] = [];

  for (const file of incomingFiles) {
    if (file.size > SITE_CONFIG.limits.imageSoftMaxBytes) {
      errors.push(`${messages.tooLarge} ${file.name} (${formatBytes(file.size)})`);
      continue;
    }

    try {
      const header = await readFileHeaderBytes(file, 64);
      const mime = detectConvertibleImageMimeFromBytes(header);
      if (!mime) {
        errors.push(`${messages.notImage} ${file.name}`);
        continue;
      }

      accepted.push({
        id: `${file.name}-${file.size}-${createClientId()}`,
        file,
        mime,
      });
    } catch {
      errors.push(`${messages.generic} (${file.name})`);
    }
  }

  return { accepted, errors };
}

export async function validateHeicFiles(
  incomingFiles: readonly File[],
  messages: ImageValidationMessages,
): Promise<{ accepted: ValidatedConvertibleImageFile[]; errors: string[] }> {
  const errors: string[] = [];
  const accepted: ValidatedConvertibleImageFile[] = [];

  for (const file of incomingFiles) {
    if (file.size > SITE_CONFIG.limits.imageSoftMaxBytes) {
      errors.push(`${messages.tooLarge} ${file.name} (${formatBytes(file.size)})`);
      continue;
    }

    try {
      const header = await readFileHeaderBytes(file, 64);
      if (!isHeicBytes(header)) {
        errors.push(`${messages.notImage} ${file.name}`);
        continue;
      }

      accepted.push({
        id: `${file.name}-${file.size}-${createClientId()}`,
        file,
        mime: 'image/heic',
      });
    } catch {
      errors.push(`${messages.generic} (${file.name})`);
    }
  }

  return { accepted, errors };
}

export async function validatePdfFiles(
  incomingFiles: readonly File[],
  messages: PdfValidationMessages,
): Promise<{ accepted: ValidatedPdfFile[]; errors: string[] }> {
  const errors: string[] = [];
  const accepted: ValidatedPdfFile[] = [];

  for (const file of incomingFiles) {
    if (file.size > SITE_CONFIG.limits.pdfSoftMaxBytes) {
      errors.push(`${messages.tooLarge} ${file.name} (${formatBytes(file.size)})`);
      continue;
    }

    try {
      const header = await readFileHeaderBytes(file, 1024);
      if (!hasPdfMagicBytes(header)) {
        errors.push(`${messages.notPdf} ${file.name}`);
        continue;
      }

      accepted.push({
        id: `${file.name}-${file.size}-${createClientId()}`,
        file,
      });
    } catch {
      errors.push(`${messages.generic} (${file.name})`);
    }
  }

  return { accepted, errors };
}

export async function validateDocxFiles(
  incomingFiles: readonly File[],
  messages: DocxValidationMessages,
): Promise<{ accepted: ValidatedDocxFile[]; errors: string[] }> {
  const errors: string[] = [];
  const accepted: ValidatedDocxFile[] = [];

  for (const file of incomingFiles) {
    if (file.size > SITE_CONFIG.limits.pdfSoftMaxBytes) {
      errors.push(`${messages.tooLarge} ${file.name} (${formatBytes(file.size)})`);
      continue;
    }

    if (!file.name.toLowerCase().endsWith('.docx')) {
      errors.push(`${messages.notDocx} ${file.name}`);
      continue;
    }

    try {
      const header = await readFileHeaderBytes(file, 32);
      if (!hasZipMagicBytes(header)) {
        errors.push(`${messages.notDocx} ${file.name}`);
        continue;
      }

      accepted.push({
        id: `${file.name}-${file.size}-${createClientId()}`,
        file,
      });
    } catch {
      errors.push(`${messages.generic} (${file.name})`);
    }
  }

  return { accepted, errors };
}
