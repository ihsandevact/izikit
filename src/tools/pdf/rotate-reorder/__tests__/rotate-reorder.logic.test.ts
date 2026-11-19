import { describe, expect, it } from 'vitest';
import { degrees, PDFDocument } from 'pdf-lib';
import {
  applyPdfPagePlan,
  inspectPdfPagesMetadata,
  normalizeRotation,
  RotateReorderError,
} from '@/tools/pdf/rotate-reorder/rotate-reorder.logic';

async function createSamplePdfWithRotations(
  specs: Array<{ width: number; height: number; rotation?: number }>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const spec of specs) {
    const page = doc.addPage([spec.width, spec.height]);
    if (spec.rotation) {
      page.setRotation(degrees(spec.rotation));
    }
  }
  return doc.save();
}

describe('rotate-reorder.logic', () => {
  it('normalizes rotation angles into 0, 90, 180, or 270 degrees', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(270)).toBe(270);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-180)).toBe(180);
  });

  it('inspects page dimensions and existing rotations from a real PDF', async () => {
    const pdfBytes = await createSamplePdfWithRotations([
      { width: 200, height: 300 },
      { width: 400, height: 500, rotation: 90 },
      { width: 600, height: 400, rotation: 180 },
    ]);

    const pages = await inspectPdfPagesMetadata(pdfBytes);

    expect(pages).toEqual([
      { pageIndex: 0, width: 200, height: 300, initialRotation: 0 },
      { pageIndex: 1, width: 400, height: 500, initialRotation: 90 },
      { pageIndex: 2, width: 600, height: 400, initialRotation: 180 },
    ]);
  });

  it('reorders pages, accumulates rotation relative to initial angle, and drops omitted pages', async () => {
    const sourceBytes = await createSamplePdfWithRotations([
      { width: 200, height: 300, rotation: 0 },
      { width: 400, height: 500, rotation: 90 },
      { width: 600, height: 400, rotation: 180 },
    ]);
    const percents: number[] = [];

    const result = await applyPdfPagePlan(
      sourceBytes,
      [
        { sourcePageIndex: 1, deltaRotation: 90 },
        { sourcePageIndex: 0, deltaRotation: 270 },
      ],
      (info) => percents.push(info.percent),
    );

    expect(result.pageCount).toBe(2);
    expect(percents.at(-1)).toBe(100);

    const parsed = await PDFDocument.load(result.bytes);
    expect(parsed.getPageCount()).toBe(2);
    expect(parsed.getPage(0).getSize()).toEqual({ width: 400, height: 500 });
    expect(parsed.getPage(0).getRotation().angle).toBe(180);
    expect(parsed.getPage(1).getSize()).toEqual({ width: 200, height: 300 });
    expect(parsed.getPage(1).getRotation().angle).toBe(270);
  });

  it('rejects empty plans and out-of-range page indices with RotateReorderError', async () => {
    const sourceBytes = await createSamplePdfWithRotations([{ width: 200, height: 300 }]);

    await expect(applyPdfPagePlan(sourceBytes, [])).rejects.toBeInstanceOf(RotateReorderError);
    await expect(applyPdfPagePlan(sourceBytes, [])).rejects.toMatchObject({
      code: 'EMPTY_PLAN',
    });

    await expect(
      applyPdfPagePlan(sourceBytes, [{ sourcePageIndex: 5, deltaRotation: 0 }]),
    ).rejects.toMatchObject({ code: 'OUT_OF_RANGE' });

    await expect(
      applyPdfPagePlan(sourceBytes, [{ sourcePageIndex: -1, deltaRotation: 0 }]),
    ).rejects.toMatchObject({ code: 'OUT_OF_RANGE' });
  });

  it('classifies corrupt PDF bytes as RotateReorderError(CORRUPT)', async () => {
    const corrupt = new TextEncoder().encode('%PDF-1.7 broken content');

    await expect(inspectPdfPagesMetadata(corrupt)).rejects.toMatchObject({
      code: 'CORRUPT',
    });
    await expect(
      applyPdfPagePlan(corrupt, [{ sourcePageIndex: 0, deltaRotation: 90 }]),
    ).rejects.toMatchObject({ code: 'CORRUPT' });
  });
});
