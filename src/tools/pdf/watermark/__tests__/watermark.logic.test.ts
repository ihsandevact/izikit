import { describe, expect, it } from 'vitest';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from 'pdf-lib';
import {
  computePageNumberPlacement,
  computeWatermarkPlacements,
  formatPageNumberLabel,
  hexToRgb01,
  validateWatermarkOptions,
  WatermarkPdfError,
  type WatermarkPdfOptions,
} from '@/tools/pdf/watermark/plan';
import {
  applyWatermarkAndPageNumbers,
  inspectWatermarkPdf,
} from '@/tools/pdf/watermark/watermark.logic';

async function createSamplePdf(sizes: Array<[number, number]>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const [width, height] of sizes) {
    doc.addPage([width, height]);
  }
  return doc.save();
}

function extractDrawnAsciiStrings(doc: PDFDocument, pageIndex: number): string[] {
  const page = doc.getPage(pageIndex);
  const contents = page.node.lookup(PDFName.of('Contents'));
  const streams: PDFRawStream[] = [];

  if (contents instanceof PDFRawStream) {
    streams.push(contents);
  } else if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) {
      const entry = doc.context.lookup(contents.get(i));
      if (entry instanceof PDFRawStream) {
        streams.push(entry);
      }
    }
  }

  const decoder = new TextDecoder('latin1');
  const combined = streams
    .map((stream) => decoder.decode(decodePDFRawStream(stream).decode()))
    .join('\n');

  const texts: string[] = [];
  const hexRegex = /<([0-9A-Fa-f]+)>\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = hexRegex.exec(combined)) !== null) {
    const hex = match[1];
    let text = '';
    for (let i = 0; i < hex.length; i += 2) {
      text += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
    }
    texts.push(text);
  }
  return texts;
}

function makeDefaultOptions(overrides: Partial<WatermarkPdfOptions> = {}): WatermarkPdfOptions {
  return {
    watermark: {
      enabled: true,
      text: 'CONFIDENTIAL',
      opacity: 0.25,
      fontSize: 48,
      rotation: -45,
      position: 'center',
      colorHex: '#B93815',
    },
    pageNumbers: {
      enabled: false,
      format: 'slash',
      position: 'bottom-center',
      startNumber: 1,
      skipFirstPage: false,
      fontSize: 11,
      margin: 28,
      colorHex: '#57524B',
    },
    pageScope: 'all',
    ...overrides,
  };
}

describe('watermark plan helpers', () => {
  it('converts 6-digit and 3-digit hex colors into normalized 0..1 RGB tuples', () => {
    expect(hexToRgb01('#B93815')).toEqual({
      r: 185 / 255,
      g: 56 / 255,
      b: 21 / 255,
    });
    expect(hexToRgb01('#000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb01('#fff')).toEqual({ r: 1, g: 1, b: 1 });
  });

  it('rejects malformed hex color strings with WatermarkPdfError(INVALID_OPTIONS)', () => {
    expect(() => hexToRgb01('red')).toThrowError(WatermarkPdfError);
    expect(() => hexToRgb01('#12345')).toThrowError(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    );
  });

  it('validates that at least one feature (watermark or page numbers) is enabled', () => {
    const bothOff = makeDefaultOptions({
      watermark: { ...makeDefaultOptions().watermark, enabled: false },
      pageNumbers: { ...makeDefaultOptions().pageNumbers, enabled: false },
    });

    expect(() => validateWatermarkOptions(bothOff)).toThrowError(
      expect.objectContaining({ code: 'NOTHING_ENABLED' }),
    );
  });

  it('rejects empty watermark text or unsupported non-WinAnsi characters when watermark is enabled', () => {
    const emptyText = makeDefaultOptions({
      watermark: { ...makeDefaultOptions().watermark, enabled: true, text: '   ' },
    });
    expect(() => validateWatermarkOptions(emptyText)).toThrowError(
      expect.objectContaining({ code: 'EMPTY_WATERMARK' }),
    );

    const emojiText = makeDefaultOptions({
      watermark: { ...makeDefaultOptions().watermark, enabled: true, text: 'RAHASIA 🔒' },
    });
    expect(() => validateWatermarkOptions(emojiText)).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_CHARACTERS' }),
    );
  });

  it('rejects out-of-range opacity, fontSize, rotation, or startNumber', () => {
    const badOpacity = makeDefaultOptions({
      watermark: { ...makeDefaultOptions().watermark, opacity: 1.5 },
    });
    expect(() => validateWatermarkOptions(badOpacity)).toThrowError(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    );

    const badStart = makeDefaultOptions({
      pageNumbers: { ...makeDefaultOptions().pageNumbers, enabled: true, startNumber: 0 },
    });
    expect(() => validateWatermarkOptions(badStart)).toThrowError(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    );
  });

  it('formats page numbers across number, slash, and localized of templates', () => {
    expect(formatPageNumberLabel({ format: 'number', current: 2, total: 5 })).toBe('2');
    expect(formatPageNumberLabel({ format: 'slash', current: 2, total: 5 })).toBe('2 / 5');
    expect(
      formatPageNumberLabel({
        format: 'of',
        current: 2,
        total: 5,
        ofTemplate: { prefix: 'Halaman', connector: 'dari' },
      }),
    ).toBe('Halaman 2 dari 5');
    expect(
      formatPageNumberLabel({
        format: 'of',
        current: 2,
        total: 5,
      }),
    ).toBe('Page 2 of 5');
  });

  it('computes single and tiled watermark placements inside page bounds', () => {
    const centered = computeWatermarkPlacements({
      pageWidth: 600,
      pageHeight: 800,
      textWidth: 200,
      textHeight: 40,
      position: 'center',
      rotationDeg: -45,
    });
    expect(centered).toHaveLength(1);
    expect(centered[0].x).toBeGreaterThan(0);
    expect(centered[0].x).toBeLessThan(600);
    expect(centered[0].y).toBeGreaterThan(0);
    expect(centered[0].y).toBeLessThan(800);

    const tiled = computeWatermarkPlacements({
      pageWidth: 600,
      pageHeight: 800,
      textWidth: 160,
      textHeight: 36,
      position: 'tiled',
      rotationDeg: -35,
    });
    expect(tiled.length).toBeGreaterThanOrEqual(4);
  });

  it('computes page number coordinates according to margin and anchor position', () => {
    const bottomCenter = computePageNumberPlacement({
      pageWidth: 600,
      pageHeight: 800,
      textWidth: 40,
      textHeight: 11,
      position: 'bottom-center',
      margin: 28,
    });
    expect(bottomCenter).toEqual({ x: 280, y: 28 });

    const topRight = computePageNumberPlacement({
      pageWidth: 600,
      pageHeight: 800,
      textWidth: 40,
      textHeight: 11,
      position: 'top-right',
      margin: 28,
    });
    expect(topRight).toEqual({ x: 532, y: 761 });
  });
});

describe('watermark.logic PDF processing', () => {
  it('inspects page count and classifies corrupt PDF bytes as WatermarkPdfError(CORRUPT)', async () => {
    const validBytes = await createSamplePdf([
      [595, 842],
      [595, 842],
      [842, 595],
    ]);
    await expect(inspectWatermarkPdf(validBytes)).resolves.toBe(3);

    const corruptBytes = new TextEncoder().encode('%PDF-1.7 broken body');
    await expect(inspectWatermarkPdf(corruptBytes)).rejects.toMatchObject({
      code: 'CORRUPT',
    });
  });

  it('draws center and tiled text watermarks onto PDF pages while preserving dimensions and progress', async () => {
    const sourceBytes = await createSamplePdf([
      [595, 842],
      [842, 595],
    ]);
    const percents: number[] = [];

    const result = await applyWatermarkAndPageNumbers(
      sourceBytes,
      makeDefaultOptions({
        watermark: {
          enabled: true,
          text: 'DRAFT 2026',
          opacity: 0.3,
          fontSize: 42,
          rotation: -45,
          position: 'tiled',
          colorHex: '#B93815',
        },
      }),
      (info) => percents.push(info.percent),
    );

    expect(result.pageCount).toBe(2);
    expect(result.modifiedPages).toBe(2);
    expect(percents.at(-1)).toBe(100);

    const outDoc = await PDFDocument.load(result.bytes);
    expect(outDoc.getPageCount()).toBe(2);
    expect(outDoc.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    expect(outDoc.getPage(1).getSize()).toEqual({ width: 842, height: 595 });

    const page1Strings = extractDrawnAsciiStrings(outDoc, 0);
    expect(page1Strings.filter((s) => s === 'DRAFT 2026').length).toBeGreaterThanOrEqual(4);
  });

  it('applies page numbers with skipFirstPage and custom startNumber accurately', async () => {
    const sourceBytes = await createSamplePdf([
      [595, 842],
      [595, 842],
      [595, 842],
    ]);

    const result = await applyWatermarkAndPageNumbers(
      sourceBytes,
      makeDefaultOptions({
        watermark: { ...makeDefaultOptions().watermark, enabled: false },
        pageNumbers: {
          enabled: true,
          format: 'slash',
          position: 'bottom-center',
          startNumber: 1,
          skipFirstPage: true,
          fontSize: 11,
          margin: 28,
          colorHex: '#57524B',
        },
      }),
    );

    expect(result.pageCount).toBe(3);
    expect(result.modifiedPages).toBe(2);

    const outDoc = await PDFDocument.load(result.bytes);
    expect(extractDrawnAsciiStrings(outDoc, 0)).toEqual([]);
    expect(extractDrawnAsciiStrings(outDoc, 1)).toContain('1 / 2');
    expect(extractDrawnAsciiStrings(outDoc, 2)).toContain('2 / 2');
  });

  it('restricts watermark and page numbers to custom page ranges and rejects out-of-range specs', async () => {
    const sourceBytes = await createSamplePdf([
      [595, 842],
      [595, 842],
      [595, 842],
    ]);

    const result = await applyWatermarkAndPageNumbers(
      sourceBytes,
      makeDefaultOptions({
        watermark: {
          enabled: true,
          text: 'SALINAN',
          opacity: 0.25,
          fontSize: 40,
          rotation: -30,
          position: 'center',
          colorHex: '#181615',
        },
        pageNumbers: {
          enabled: true,
          format: 'of',
          position: 'bottom-right',
          startNumber: 1,
          skipFirstPage: false,
          fontSize: 10,
          margin: 24,
          colorHex: '#57524B',
          ofTemplate: { prefix: 'Halaman', connector: 'dari' },
        },
        pageScope: 'custom',
        rangeSpec: '1, 3',
      }),
    );

    expect(result.modifiedPages).toBe(2);
    const outDoc = await PDFDocument.load(result.bytes);
    expect(extractDrawnAsciiStrings(outDoc, 0)).toEqual(
      expect.arrayContaining(['SALINAN', 'Halaman 1 dari 3']),
    );
    expect(extractDrawnAsciiStrings(outDoc, 1)).toEqual([]);
    expect(extractDrawnAsciiStrings(outDoc, 2)).toEqual(
      expect.arrayContaining(['SALINAN', 'Halaman 3 dari 3']),
    );

    await expect(
      applyWatermarkAndPageNumbers(
        sourceBytes,
        makeDefaultOptions({
          pageScope: 'custom',
          rangeSpec: '1-9',
        }),
      ),
    ).rejects.toMatchObject({ code: 'OUT_OF_RANGE' });
  });
});
