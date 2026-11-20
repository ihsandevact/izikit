import { mimeToExtension, type SupportedImageMime } from '@/lib/file-validation';

export interface DetectedMetadata {
  hasExif: boolean;
  hasGps: boolean;
  hasXmp: boolean;
  hasIptc: boolean;
  hasComment: boolean;
  make?: string;
  model?: string;
  dateTime?: string;
  software?: string;
  strippedSegments: number;
}

export function createEmptyMetadata(): DetectedMetadata {
  return {
    hasExif: false,
    hasGps: false,
    hasXmp: false,
    hasIptc: false,
    hasComment: false,
    strippedSegments: 0,
  };
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  const end = Math.min(bytes.length, offset + length);
  let out = '';
  for (let i = offset; i < end; i += 1) {
    const code = bytes[i];
    if (code === 0) break;
    if (code >= 32 && code <= 126) {
      out += String.fromCharCode(code);
    }
  }
  return out.trim();
}

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset + 2 > bytes.length) return 0;
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset + 4 > bytes.length) return 0;
  return littleEndian
    ? (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>>
        0
    : ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
        0;
}

function parseExifPayload(payload: Uint8Array, meta: DetectedMetadata) {
  // Exif\0\0 header (6 bytes) followed by TIFF header
  if (payload.length < 14) return;
  if (readAscii(payload, 0, 4) !== 'Exif') return;

  meta.hasExif = true;
  const tiffStart = 6;
  const byteOrder = readAscii(payload, tiffStart, 2);
  const littleEndian = byteOrder === 'II';
  if (!littleEndian && byteOrder !== 'MM') return;

  const firstIfdOffset = readUint32(payload, tiffStart + 4, littleEndian);
  const ifdStart = tiffStart + firstIfdOffset;
  if (ifdStart + 2 > payload.length) return;

  const entryCount = readUint16(payload, ifdStart, littleEndian);
  for (let i = 0; i < entryCount; i += 1) {
    const entryOffset = ifdStart + 2 + i * 12;
    if (entryOffset + 12 > payload.length) break;

    const tag = readUint16(payload, entryOffset, littleEndian);
    const type = readUint16(payload, entryOffset + 2, littleEndian);
    const count = readUint32(payload, entryOffset + 4, littleEndian);
    const valueOffset = readUint32(payload, entryOffset + 8, littleEndian);

    if (tag === 0x8825) {
      // GPSInfoIFDPointer
      meta.hasGps = true;
      continue;
    }

    // ASCII string tag (type === 2)
    if (type === 2 && count > 0 && count <= 256) {
      const strPos = count <= 4 ? entryOffset + 8 : tiffStart + valueOffset;
      if (strPos + count <= payload.length) {
        const text = readAscii(payload, strPos, count);
        if (text) {
          if (tag === 0x010f && !meta.make) meta.make = text;
          else if (tag === 0x0110 && !meta.model) meta.model = text;
          else if (tag === 0x0131 && !meta.software) meta.software = text;
          else if (tag === 0x0132 && !meta.dateTime) meta.dateTime = text;
        }
      }
    }
  }
}

/**
 * Inspect JPEG segments and return both detected metadata and a lossless stripped JPEG
 * with APP1 (EXIF/XMP), APP13 (IPTC/Photoshop), and COM comment segments removed.
 */
export function processJpegMetadata(bytes: Uint8Array): {
  bytes: Uint8Array;
  metadata: DetectedMetadata;
} {
  const meta = createEmptyMetadata();
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return { bytes, metadata: meta };
  }

  const keptChunks: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let offset = 2;

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      // Unexpected non-marker data: copy remainder intact
      keptChunks.push(bytes.subarray(offset));
      break;
    }

    // Skip fill 0xFF bytes
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    const markerStart = offset - 1;
    offset += 1;

    // SOS (Start of Scan, 0xDA) or EOI (0xD9): copy rest of image untouched
    if (marker === 0xda || marker === 0xd9) {
      keptChunks.push(bytes.subarray(markerStart));
      break;
    }

    // Standalone markers without length (RST0..RST7, TEM)
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      keptChunks.push(bytes.subarray(markerStart, offset));
      continue;
    }

    if (offset + 2 > bytes.length) {
      keptChunks.push(bytes.subarray(markerStart));
      break;
    }

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > bytes.length) {
      keptChunks.push(bytes.subarray(markerStart));
      break;
    }

    const payload = bytes.subarray(offset + 2, segmentEnd);

    // APP1 (EXIF / XMP), APP13 (IPTC / Photoshop), COM (Comment)
    if (marker === 0xe1) {
      const prefix = readAscii(payload, 0, 29);
      if (prefix.startsWith('Exif')) {
        parseExifPayload(payload, meta);
      } else if (prefix.includes('http://ns.adobe.com/xap')) {
        meta.hasXmp = true;
      } else {
        meta.hasExif = true;
      }
      meta.strippedSegments += 1;
    } else if (marker === 0xed) {
      meta.hasIptc = true;
      meta.strippedSegments += 1;
    } else if (marker === 0xfe) {
      meta.hasComment = true;
      meta.strippedSegments += 1;
    } else {
      keptChunks.push(bytes.subarray(markerStart, segmentEnd));
    }

    offset = segmentEnd;
  }

  const totalLength = keptChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(totalLength);
  let cursor = 0;
  for (const chunk of keptChunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }

  return { bytes: out, metadata: meta };
}

const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

/**
 * Inspect PNG chunks and losslessly remove metadata chunks (eXIf, tEXt, iTXt, zTXt, tIME).
 */
export function processPngMetadata(bytes: Uint8Array): {
  bytes: Uint8Array;
  metadata: DetectedMetadata;
} {
  const meta = createEmptyMetadata();
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
    return { bytes, metadata: meta };
  }

  const keptChunks: Uint8Array[] = [bytes.subarray(0, 8)]; // PNG signature
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset, false);
    const type = readAscii(bytes, offset + 4, 4);
    const chunkTotal = 12 + length;
    if (offset + chunkTotal > bytes.length) {
      keptChunks.push(bytes.subarray(offset));
      break;
    }

    if (PNG_METADATA_CHUNKS.has(type)) {
      if (type === 'eXIf') meta.hasExif = true;
      else if (type === 'iTXt') meta.hasXmp = true;
      else meta.hasComment = true;
      meta.strippedSegments += 1;
    } else {
      keptChunks.push(bytes.subarray(offset, offset + chunkTotal));
    }

    offset += chunkTotal;
    if (type === 'IEND') break;
  }

  const totalLength = keptChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(totalLength);
  let cursor = 0;
  for (const chunk of keptChunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }

  return { bytes: out, metadata: meta };
}

/**
 * Inspect WebP RIFF container chunks for EXIF and XMP metadata.
 */
export function inspectWebpMetadata(bytes: Uint8Array): DetectedMetadata {
  const meta = createEmptyMetadata();
  if (bytes.length < 16 || readAscii(bytes, 0, 4) !== 'RIFF') {
    return meta;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = readAscii(bytes, offset, 4);
    const chunkSize = readUint32(bytes, offset + 4, true);
    if (chunkType === 'EXIF') {
      meta.hasExif = true;
      meta.strippedSegments += 1;
    } else if (chunkType === 'XMP ') {
      meta.hasXmp = true;
      meta.strippedSegments += 1;
    }
    const paddedSize = chunkSize + (chunkSize % 2);
    offset += 8 + paddedSize;
  }

  return meta;
}

export function hasAnyDetectedMetadata(meta: DetectedMetadata): boolean {
  return (
    meta.hasExif ||
    meta.hasGps ||
    meta.hasXmp ||
    meta.hasIptc ||
    meta.hasComment ||
    meta.strippedSegments > 0
  );
}

export function buildCleanMetadataFilename(
  originalFilename: string,
  mime: SupportedImageMime,
): string {
  const stem = originalFilename.replace(/\.[^/.]+$/, '').trim() || 'foto';
  const ext = mimeToExtension(mime);
  return `${stem}-clean.${ext}`;
}
