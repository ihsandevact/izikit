import { describe, expect, it } from 'vitest';
import {
  buildCleanMetadataFilename,
  hasAnyDetectedMetadata,
  inspectWebpMetadata,
  processJpegMetadata,
  processPngMetadata,
} from '@/tools/image/strip-exif/exif-strip.logic';

function buildSyntheticJpegWithExifAndGps(): Uint8Array {
  // Minimal TIFF little-endian IFD0 with 2 entries: Make ('TestCam\0') and GPS pointer (0x8825)
  const tiff = new Uint8Array(64);
  // 'II', 0x002A, IFD0 offset = 8
  tiff.set([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00], 0);
  // IFD0 entry count = 2
  tiff.set([0x02, 0x00], 8);
  // Entry 0: Tag 0x010F (Make), Type 2 (ASCII), Count 8, Offset 38
  tiff.set([0x0f, 0x01, 0x02, 0x00, 0x08, 0x00, 0x00, 0x00, 0x26, 0x00, 0x00, 0x00], 10);
  // Entry 1: Tag 0x8825 (GPSInfo), Type 4 (LONG), Count 1, Value 0
  tiff.set([0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], 22);
  // Next IFD = 0
  tiff.set([0x00, 0x00, 0x00, 0x00], 34);
  // Make string at offset 38: "TestCam\0"
  tiff.set(new TextEncoder().encode('TestCam\0'), 38);

  const exifPayload = new Uint8Array(6 + tiff.length);
  exifPayload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0); // Exif\0\0
  exifPayload.set(tiff, 6);

  const app1Length = exifPayload.length + 2;
  const sosAndEoi = new Uint8Array([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0xff, 0xd9]);

  const jpeg = new Uint8Array(2 + 2 + 2 + exifPayload.length + sosAndEoi.length);
  let pos = 0;
  jpeg.set([0xff, 0xd8], pos);
  pos += 2;
  jpeg.set([0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff], pos);
  pos += 4;
  jpeg.set(exifPayload, pos);
  pos += exifPayload.length;
  jpeg.set(sosAndEoi, pos);
  return jpeg;
}

function buildSyntheticPngWithTextChunk(): Uint8Array {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // tEXt chunk (length 4, type 'tEXt', data 'abcd', crc 4 bytes)
  const textChunk = new Uint8Array([
    0x00, 0x00, 0x00, 0x04, 0x74, 0x45, 0x58, 0x74, 0x61, 0x62, 0x63, 0x64, 0, 0, 0, 0,
  ]);
  // IEND chunk (length 0, type 'IEND', crc 4 bytes)
  const iendChunk = new Uint8Array([
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const out = new Uint8Array(sig.length + textChunk.length + iendChunk.length);
  out.set(sig, 0);
  out.set(textChunk, sig.length);
  out.set(iendChunk, sig.length + textChunk.length);
  return out;
}

describe('exif-strip.logic', () => {
  it('detects EXIF Make & GPS in JPEG and strips APP1 losslessly while keeping SOI and SOS', () => {
    const jpeg = buildSyntheticJpegWithExifAndGps();
    const { bytes: stripped, metadata } = processJpegMetadata(jpeg);

    expect(metadata.hasExif).toBe(true);
    expect(metadata.hasGps).toBe(true);
    expect(metadata.make).toBe('TestCam');
    expect(metadata.strippedSegments).toBe(1);
    expect(hasAnyDetectedMetadata(metadata)).toBe(true);

    // Re-inspecting stripped bytes should show zero metadata remaining
    const after = processJpegMetadata(stripped);
    expect(after.metadata.hasExif).toBe(false);
    expect(after.metadata.hasGps).toBe(false);
    expect(after.metadata.strippedSegments).toBe(0);
    // Starts with SOI (FF D8) and ends with EOI (FF D9)
    expect(stripped[0]).toBe(0xff);
    expect(stripped[1]).toBe(0xd8);
    expect(stripped[stripped.length - 2]).toBe(0xff);
    expect(stripped[stripped.length - 1]).toBe(0xd9);
  });

  it('detects and strips PNG metadata chunks while preserving signature and IEND', () => {
    const png = buildSyntheticPngWithTextChunk();
    const { bytes: stripped, metadata } = processPngMetadata(png);

    expect(metadata.hasComment).toBe(true);
    expect(metadata.strippedSegments).toBe(1);
    expect(stripped.length).toBeLessThan(png.length);

    const after = processPngMetadata(stripped);
    expect(after.metadata.strippedSegments).toBe(0);
  });

  it('detects EXIF chunk in WebP RIFF container and builds clean filenames', () => {
    const webp = new Uint8Array(24);
    webp.set(new TextEncoder().encode('RIFF'), 0);
    webp.set(new TextEncoder().encode('WEBP'), 8);
    webp.set(new TextEncoder().encode('EXIF'), 12);
    webp.set([0x04, 0x00, 0x00, 0x00], 16);

    const meta = inspectWebpMetadata(webp);
    expect(meta.hasExif).toBe(true);
    expect(meta.strippedSegments).toBe(1);
    expect(buildCleanMetadataFilename('liburan.JPG', 'image/jpeg')).toBe('liburan-clean.jpg');
  });
});
