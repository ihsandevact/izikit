import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  computeFittedPageBox,
  CompressPdfError,
  evaluateCompressionOutcome,
  resolveTargetPageDimensions,
  validateCompressPdfOptions,
  type CompressPdfOptions,
} from '@/tools/pdf/compress/plan';
import {
  buildRasterizedPdfFromJpegs,
  inspectCompressPdf,
  optimizePdfStructure,
} from '@/tools/pdf/compress/compress-pdf.logic';

// Minimal valid 1x1 baseline JPEG bytes for testing embedJpg in Node/Vitest.
const TINY_JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0xff, 0xc4, 0x00, 0x14,
  0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0x00, 0xff, 0xd9,
]);

async function createSamplePdf(options?: {
  sizes?: Array<[number, number]>;
  heavyMetadata?: boolean;
  useObjectStreams?: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const sizes = options?.sizes ?? [[595, 842]];

  if (options?.heavyMetadata) {
    doc.setTitle('Laporan Tahunan ' + 'X'.repeat(600));
    doc.setAuthor('Tim Administrasi ' + 'Y'.repeat(600));
    doc.setSubject('Subjek Panjang ' + 'Z'.repeat(600));
    doc.setKeywords(['laporan', 'arsip', 'dokumen']);
    doc.setCreator('Heavy Creator Tool');
    doc.setProducer('Heavy Producer Engine');
  }

  for (let i = 0; i < sizes.length; i += 1) {
    const [w, h] = sizes[i];
    const page = doc.addPage([w, h]);
    page.drawText(`Page ${i + 1}`, { x: 40, y: h - 60, size: 16, font });
  }

  return doc.save({ useObjectStreams: options?.useObjectStreams ?? false });
}

function makeOptions(overrides: Partial<CompressPdfOptions> = {}): CompressPdfOptions {
  return {
    mode: 'lossless',
    stripMetadata: true,
    pageSize: 'keep',
    dpi: 120,
    jpegQuality: 0.72,
    ...overrides,
  };
}

describe('compress-pdf plan helpers', () => {
  it('validates mode, DPI, and JPEG quality bounds', () => {
    expect(() => validateCompressPdfOptions(makeOptions())).not.toThrow();
    expect(() =>
      validateCompressPdfOptions(makeOptions({ mode: 'rasterize', dpi: 150, jpegQuality: 0.8 })),
    ).not.toThrow();

    expect(() =>
      validateCompressPdfOptions(makeOptions({ mode: 'rasterize', dpi: 30 })),
    ).toThrowError(CompressPdfError);
    expect(() =>
      validateCompressPdfOptions(makeOptions({ mode: 'rasterize', jpegQuality: 1.2 })),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_OPTIONS' }));
  });

  it('resolves portrait and landscape A4 / Letter dimensions based on source orientation', () => {
    expect(resolveTargetPageDimensions(400, 700, 'keep')).toEqual({ width: 400, height: 700 });

    const a4Portrait = resolveTargetPageDimensions(400, 700, 'a4');
    expect(a4Portrait.width).toBeCloseTo(595.28, 1);
    expect(a4Portrait.height).toBeCloseTo(841.89, 1);

    const a4Landscape = resolveTargetPageDimensions(900, 500, 'a4');
    expect(a4Landscape.width).toBeCloseTo(841.89, 1);
    expect(a4Landscape.height).toBeCloseTo(595.28, 1);

    const letterPortrait = resolveTargetPageDimensions(500, 700, 'letter');
    expect(letterPortrait).toEqual({ width: 612, height: 792 });
  });

  it('fits source page proportionally and centers it inside target dimensions', () => {
    const box = computeFittedPageBox(1000, 500, 600, 600);
    expect(box.scale).toBeCloseTo(0.6, 5);
    expect(box.width).toBeCloseTo(600, 5);
    expect(box.height).toBeCloseTo(300, 5);
    expect(box.x).toBeCloseTo(0, 5);
    expect(box.y).toBeCloseTo(150, 5);
  });

  it('flags keptOriginal honestly when non-resized output is not smaller than input', () => {
    expect(evaluateCompressionOutcome(1000, 1150, false)).toEqual({
      keptOriginal: true,
      finalBytes: 1000,
      savedBytes: 0,
      savedPercent: 0,
    });

    // If user explicitly requested page resize, keep the resized output even if bytes grew slightly
    expect(evaluateCompressionOutcome(1000, 1150, true)).toEqual({
      keptOriginal: false,
      finalBytes: 1150,
      savedBytes: -150,
      savedPercent: -15,
    });

    expect(evaluateCompressionOutcome(2000, 1200, false)).toEqual({
      keptOriginal: false,
      finalBytes: 1200,
      savedBytes: 800,
      savedPercent: 40,
    });
  });
});

describe('compress-pdf.logic PDF processing', () => {
  it('inspects page count and first-page dimensions, and rejects corrupt PDFs', async () => {
    const sample = await createSamplePdf({
      sizes: [
        [612, 792],
        [595, 842],
      ],
    });
    const info = await inspectCompressPdf(sample);
    expect(info).toEqual({
      pageCount: 2,
      firstPageWidth: 612,
      firstPageHeight: 792,
    });

    const corrupt = new TextEncoder().encode('%PDF-1.7 broken');
    await expect(inspectCompressPdf(corrupt)).rejects.toMatchObject({ code: 'CORRUPT' });
  });

  it('strips heavy metadata and shrinks unoptimized PDF structure while preserving pages', async () => {
    const bloated = await createSamplePdf({
      sizes: [
        [595, 842],
        [595, 842],
      ],
      heavyMetadata: true,
      useObjectStreams: false,
    });
    const percents: number[] = [];

    const result = await optimizePdfStructure(
      bloated,
      makeOptions({ mode: 'lossless', stripMetadata: true, pageSize: 'keep' }),
      (p) => percents.push(p.percent),
    );

    expect(result.pageCount).toBe(2);
    expect(result.keptOriginal).toBe(false);
    expect(result.bytes.byteLength).toBeLessThan(bloated.byteLength);
    expect(percents.at(-1)).toBe(100);

    const outDoc = await PDFDocument.load(result.bytes);
    expect(outDoc.getPageCount()).toBe(2);
    expect(outDoc.getTitle() ?? '').toBe('');
    expect(outDoc.getAuthor() ?? '').toBe('');
  });

  it('resizes portrait and landscape pages proportionally to A4 while preserving page count', async () => {
    const oversized = await createSamplePdf({
      sizes: [
        [800, 1200],
        [1200, 800],
      ],
    });

    const result = await optimizePdfStructure(
      oversized,
      makeOptions({ mode: 'lossless', stripMetadata: true, pageSize: 'a4' }),
    );

    expect(result.pageCount).toBe(2);
    expect(result.keptOriginal).toBe(false);

    const outDoc = await PDFDocument.load(result.bytes);
    expect(outDoc.getPageCount()).toBe(2);
    const p1 = outDoc.getPage(0).getSize();
    const p2 = outDoc.getPage(1).getSize();
    expect(p1.width).toBeCloseTo(595.28, 1);
    expect(p1.height).toBeCloseTo(841.89, 1);
    expect(p2.width).toBeCloseTo(841.89, 1);
    expect(p2.height).toBeCloseTo(595.28, 1);
  });

  it('builds a valid multi-page PDF from rasterized JPEG page buffers and rejects empty input', async () => {
    const percents: number[] = [];
    const result = await buildRasterizedPdfFromJpegs(
      [
        { jpegBytes: TINY_JPEG_BYTES, widthPt: 595, heightPt: 842 },
        { jpegBytes: TINY_JPEG_BYTES, widthPt: 842, heightPt: 595 },
      ],
      {
        originalByteLength: 50000,
        pageSize: 'letter',
        stripMetadata: true,
      },
      (p) => percents.push(p.percent),
    );

    expect(result.pageCount).toBe(2);
    expect(result.keptOriginal).toBe(false);
    expect(percents.at(-1)).toBe(100);

    const outDoc = await PDFDocument.load(result.bytes);
    expect(outDoc.getPageCount()).toBe(2);
    expect(outDoc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(outDoc.getPage(1).getSize()).toEqual({ width: 792, height: 612 });

    await expect(
      buildRasterizedPdfFromJpegs([], {
        originalByteLength: 100,
        pageSize: 'keep',
        stripMetadata: true,
      }),
    ).rejects.toMatchObject({ code: 'EMPTY_PAGES' });
  });
});
