import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  inspectPdfPages,
  mergePdfBuffers,
  PdfProcessingError,
} from '@/tools/pdf/merge/merge.logic';

async function createSamplePdf(pageSizes: Array<[number, number]>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const [width, height] of pageSizes) {
    doc.addPage([width, height]);
  }
  return doc.save();
}

describe('merge.logic', () => {
  it('inspects page count accurately', async () => {
    const pdfBytes = await createSamplePdf([
      [300, 400],
      [300, 400],
      [300, 400],
    ]);
    await expect(inspectPdfPages(pdfBytes, 'three-pages.pdf')).resolves.toBe(3);
  });

  it('merges multiple PDFs in order and reports progress', async () => {
    const first = await createSamplePdf([[200, 300]]);
    const second = await createSamplePdf([
      [400, 500],
      [600, 700],
    ]);

    const progressPercents: number[] = [];
    const result = await mergePdfBuffers(
      [
        { name: 'first.pdf', bytes: first },
        { name: 'second.pdf', bytes: second },
      ],
      (info) => progressPercents.push(info.percent),
    );

    expect(result.fileCount).toBe(2);
    expect(result.totalPages).toBe(3);
    expect(progressPercents.at(-1)).toBe(100);

    const parsed = await PDFDocument.load(result.bytes);
    expect(parsed.getPageCount()).toBe(3);
    expect(parsed.getPage(0).getSize()).toEqual({ width: 200, height: 300 });
    expect(parsed.getPage(1).getSize()).toEqual({ width: 400, height: 500 });
    expect(parsed.getPage(2).getSize()).toEqual({ width: 600, height: 700 });
  });

  it('rejects merge with fewer than 2 files', async () => {
    const one = await createSamplePdf([[200, 300]]);
    await expect(
      mergePdfBuffers([{ name: 'only-one.pdf', bytes: one }]),
    ).rejects.toMatchObject({
      code: 'NEED_TWO_FILES',
    });
  });

  it('classifies corrupt buffers as PdfProcessingError(CORRUPT)', async () => {
    const corrupt = new TextEncoder().encode('%PDF-1.7 broken content');
    await expect(inspectPdfPages(corrupt, 'broken.pdf')).rejects.toBeInstanceOf(
      PdfProcessingError,
    );
    await expect(inspectPdfPages(corrupt, 'broken.pdf')).rejects.toMatchObject({
      code: 'CORRUPT',
      fileName: 'broken.pdf',
    });
  });
});
