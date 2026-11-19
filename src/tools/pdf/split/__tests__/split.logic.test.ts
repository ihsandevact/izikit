import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  parsePageRanges,
  splitPdfDocument,
  SplitPdfError,
} from '@/tools/pdf/split/split.logic';

async function createDistinctPdf(sizes: Array<[number, number]>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const [width, height] of sizes) {
    doc.addPage([width, height]);
  }
  return doc.save();
}

describe('split.logic', () => {
  it('parses comma-separated ranges and single pages into 0-based page groups', () => {
    const groups = parsePageRanges('1-3, 5', 6);

    expect(groups).toEqual([
      { label: '1-3', pageIndices: [0, 1, 2] },
      { label: '5', pageIndices: [4] },
    ]);
  });

  it('rejects empty, malformed, reversed, or out-of-bounds page ranges with SplitPdfError', () => {
    expect(() => parsePageRanges('   ', 5)).toThrowError(SplitPdfError);
    expect(() => parsePageRanges('abc', 5)).toThrowError(SplitPdfError);
    expect(() => parsePageRanges('4-2', 5)).toThrowError(SplitPdfError);
    expect(() => parsePageRanges('0', 5)).toThrowError(SplitPdfError);
    expect(() => parsePageRanges('1-9', 5)).toThrowError(
      expect.objectContaining({ code: 'OUT_OF_RANGE' }),
    );
  });

  it('splits a PDF into separate documents per range group and preserves exact page order', async () => {
    const sourceBytes = await createDistinctPdf([
      [200, 300],
      [300, 400],
      [400, 500],
      [500, 600],
    ]);
    const percents: number[] = [];

    const outputs = await splitPdfDocument(
      sourceBytes,
      { mode: 'ranges', rangeSpec: '1-2, 4', baseName: 'kontrak' },
      (info) => percents.push(info.percent),
    );

    expect(outputs).toHaveLength(2);
    expect(outputs[0].filename).toBe('kontrak-pages-1-2.pdf');
    expect(outputs[0].pageCount).toBe(2);
    expect(outputs[1].filename).toBe('kontrak-page-4.pdf');
    expect(outputs[1].pageCount).toBe(1);
    expect(percents.at(-1)).toBe(100);

    const firstPdf = await PDFDocument.load(outputs[0].bytes);
    expect(firstPdf.getPageCount()).toBe(2);
    expect(firstPdf.getPage(0).getSize()).toEqual({ width: 200, height: 300 });
    expect(firstPdf.getPage(1).getSize()).toEqual({ width: 300, height: 400 });

    const secondPdf = await PDFDocument.load(outputs[1].bytes);
    expect(secondPdf.getPageCount()).toBe(1);
    expect(secondPdf.getPage(0).getSize()).toEqual({ width: 500, height: 600 });
  });

  it('extracts every page into an individual PDF file in all-pages mode', async () => {
    const sourceBytes = await createDistinctPdf([
      [210, 297],
      [250, 350],
      [300, 420],
    ]);

    const outputs = await splitPdfDocument(sourceBytes, {
      mode: 'all-pages',
      baseName: 'laporan.pdf',
    });

    expect(outputs.map((o) => o.filename)).toEqual([
      'laporan-page-1.pdf',
      'laporan-page-2.pdf',
      'laporan-page-3.pdf',
    ]);
    expect(outputs.every((o) => o.pageCount === 1)).toBe(true);

    const thirdPdf = await PDFDocument.load(outputs[2].bytes);
    expect(thirdPdf.getPage(0).getSize()).toEqual({ width: 300, height: 420 });
  });

  it('extracts selected pages into one combined PDF in extract-single mode', async () => {
    const sourceBytes = await createDistinctPdf([
      [100, 100],
      [200, 200],
      [300, 300],
      [400, 400],
    ]);

    const outputs = await splitPdfDocument(sourceBytes, {
      mode: 'extract-single',
      rangeSpec: '2, 4',
      baseName: 'lampiran',
    });

    expect(outputs).toHaveLength(1);
    expect(outputs[0].filename).toBe('lampiran-extracted.pdf');
    expect(outputs[0].pageCount).toBe(2);

    const extracted = await PDFDocument.load(outputs[0].bytes);
    expect(extracted.getPageCount()).toBe(2);
    expect(extracted.getPage(0).getSize()).toEqual({ width: 200, height: 200 });
    expect(extracted.getPage(1).getSize()).toEqual({ width: 400, height: 400 });
  });

  it('classifies unreadable PDF bytes as SplitPdfError(CORRUPT)', async () => {
    const corruptBytes = new TextEncoder().encode('%PDF-1.7 broken body');

    await expect(
      splitPdfDocument(corruptBytes, { mode: 'all-pages', baseName: 'broken' }),
    ).rejects.toBeInstanceOf(SplitPdfError);

    await expect(
      splitPdfDocument(corruptBytes, { mode: 'all-pages', baseName: 'broken' }),
    ).rejects.toMatchObject({ code: 'CORRUPT' });
  });
});
