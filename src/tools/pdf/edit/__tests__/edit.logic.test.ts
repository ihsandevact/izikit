import { describe, expect, it } from 'vitest';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  StandardFonts,
} from 'pdf-lib';
import {
  EditPdfError,
  getRedactedPageIndices,
  normalizedRectToPdfRect,
  normalizedTextOriginToPdf,
  validateAnnotations,
  type HighlightAnnotationInput,
  type PdfAnnotationInput,
  type TextAnnotationInput,
  type WorkerPdfAnnotation,
} from '@/tools/pdf/edit/plan';
import { applyPdfAnnotations, inspectEditPdf } from '@/tools/pdf/edit/edit.logic';

// Minimal valid 1x1 PNG (red pixel)
const TINY_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

// Minimal valid 1x1 JPEG
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

async function createTextPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([595, 842]);
  p1.drawText('TOP SECRET 12345', { x: 40, y: 760, size: 16, font });
  const p2 = doc.addPage([612, 792]);
  p2.drawText('PUBLIC PAGE 2', { x: 40, y: 710, size: 16, font });
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

describe('edit-pdf plan helpers', () => {
  it('converts top-left normalized rectangles to PDF bottom-left coordinates accurately', () => {
    // Top-left box: x=0.1, y=0.2, width=0.5, height=0.25 on 600x800 page
    // Bottom edge in top-left UI is y + h = 0.45 -> from bottom in PDF = 1 - 0.45 = 0.55 -> 440 pt
    const rect = normalizedRectToPdfRect(
      { x: 0.1, y: 0.2, width: 0.5, height: 0.25 },
      600,
      800,
    );
    expect(rect.x).toBeCloseTo(60, 4);
    expect(rect.y).toBeCloseTo(440, 4);
    expect(rect.width).toBeCloseTo(300, 4);
    expect(rect.height).toBeCloseTo(200, 4);
  });

  it('converts top-left normalized text origin to PDF baseline inside page bounds', () => {
    const pt = normalizedTextOriginToPdf({ x: 0.2, y: 0.1 }, 20, 500, 1000);
    expect(pt.x).toBeCloseTo(100, 4);
    // 1000 - 100 - 20 * 0.85 = 883
    expect(pt.y).toBeCloseTo(883, 4);
  });

  it('validates annotation array, text content, WinAnsi characters, and page bounds', () => {
    expect(() => validateAnnotations([], 2)).toThrowError(
      expect.objectContaining({ code: 'NO_ANNOTATIONS' }),
    );

    const validText: TextAnnotationInput = {
      id: 't1',
      type: 'text',
      pageIndex: 0,
      x: 0.1,
      y: 0.1,
      text: 'Disetujui',
      fontSize: 16,
      colorHex: '#181615',
    };
    const validHighlight: HighlightAnnotationInput = {
      id: 'h1',
      type: 'highlight',
      pageIndex: 1,
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.05,
      colorHex: '#FDE047',
      opacity: 0.35,
    };
    const valid: PdfAnnotationInput[] = [validText, validHighlight];
    expect(() => validateAnnotations(valid, 2)).not.toThrow();

    expect(() =>
      validateAnnotations(
        [{ ...validText, pageIndex: 3 }],
        2,
      ),
    ).toThrowError(expect.objectContaining({ code: 'OUT_OF_RANGE' }));

    expect(() =>
      validateAnnotations(
        [{ ...validText, text: '   ' }],
        2,
      ),
    ).toThrowError(expect.objectContaining({ code: 'EMPTY_TEXT' }));

    expect(() =>
      validateAnnotations(
        [{ ...validText, text: 'Approved ✅' }],
        2,
      ),
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_CHARACTERS' }));

    expect(() =>
      validateAnnotations(
        [{ ...validHighlight, width: 0 }],
        2,
      ),
    ).toThrowError(EditPdfError);
  });

  it('extracts sorted unique page indices that contain redact annotations', () => {
    const items: PdfAnnotationInput[] = [
      {
        id: 'r1',
        type: 'redact',
        pageIndex: 2,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.05,
        colorHex: '#181615',
      },
      {
        id: 't1',
        type: 'text',
        pageIndex: 1,
        x: 0.1,
        y: 0.1,
        text: 'Note',
        fontSize: 14,
        colorHex: '#181615',
      },
      {
        id: 'r2',
        type: 'redact',
        pageIndex: 0,
        x: 0.2,
        y: 0.3,
        width: 0.3,
        height: 0.05,
        colorHex: '#181615',
      },
      {
        id: 'r3',
        type: 'redact',
        pageIndex: 2,
        x: 0.5,
        y: 0.5,
        width: 0.2,
        height: 0.05,
        colorHex: '#181615',
      },
    ];

    expect(getRedactedPageIndices(items)).toEqual([0, 2]);
  });
});

describe('edit.logic PDF annotation engine', () => {
  it('inspects page count and page dimensions, and rejects corrupt PDFs', async () => {
    const sample = await createTextPdf();
    const info = await inspectEditPdf(sample);
    expect(info).toEqual({
      pageCount: 2,
      pageSizes: [
        { width: 595, height: 842 },
        { width: 612, height: 792 },
      ],
    });

    const corrupt = new TextEncoder().encode('%PDF-1.7 invalid');
    await expect(inspectEditPdf(corrupt)).rejects.toMatchObject({ code: 'CORRUPT' });
  });

  it('applies text, highlight, redact, and PNG/JPEG signatures cleanly while preserving page sizes', async () => {
    const sample = await createTextPdf();
    const percents: number[] = [];

    const annotations: WorkerPdfAnnotation[] = [
      {
        id: 't1',
        type: 'text',
        pageIndex: 0,
        x: 0.1,
        y: 0.2,
        text: 'SIGNED OK',
        fontSize: 16,
        colorHex: '#B93815',
      },
      {
        id: 'h1',
        type: 'highlight',
        pageIndex: 0,
        x: 0.05,
        y: 0.08,
        width: 0.4,
        height: 0.05,
        colorHex: '#FDE047',
        opacity: 0.35,
      },
      {
        id: 's1',
        type: 'signature',
        pageIndex: 0,
        x: 0.5,
        y: 0.7,
        width: 0.25,
        height: 0.1,
        imageMime: 'image/png',
        imageBytes: TINY_PNG_BYTES,
      },
      {
        id: 'r1',
        type: 'redact',
        pageIndex: 1,
        x: 0.1,
        y: 0.1,
        width: 0.3,
        height: 0.06,
        colorHex: '#181615',
      },
      {
        id: 's2',
        type: 'signature',
        pageIndex: 1,
        x: 0.5,
        y: 0.6,
        width: 0.2,
        height: 0.08,
        imageMime: 'image/jpeg',
        imageBytes: TINY_JPEG_BYTES,
      },
    ];

    const result = await applyPdfAnnotations(
      sample,
      annotations,
      undefined,
      (p) => percents.push(p.percent),
    );

    expect(result.pageCount).toBe(2);
    expect(result.modifiedPages).toBe(2);
    expect(percents.at(-1)).toBe(100);

    const outDoc = await PDFDocument.load(result.bytes);
    expect(outDoc.getPageCount()).toBe(2);
    expect(outDoc.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    expect(outDoc.getPage(1).getSize()).toEqual({ width: 612, height: 792 });
    expect(extractDrawnAsciiStrings(outDoc, 0)).toContain('SIGNED OK');
  });

  it('permanently destroys underlying text on redacted pages via rasterizedPageOverrides while keeping other pages vector', async () => {
    const sample = await createTextPdf();

    const annotations: WorkerPdfAnnotation[] = [
      {
        id: 'r1',
        type: 'redact',
        pageIndex: 0,
        x: 0.05,
        y: 0.05,
        width: 0.4,
        height: 0.08,
        colorHex: '#181615',
      },
      {
        id: 't2',
        type: 'text',
        pageIndex: 1,
        x: 0.1,
        y: 0.3,
        text: 'KEEP VECTOR',
        fontSize: 14,
        colorHex: '#181615',
      },
    ];

    const result = await applyPdfAnnotations(sample, annotations, {
      rasterizedPageOverrides: {
        0: {
          jpegBytes: TINY_JPEG_BYTES,
          widthPt: 595,
          heightPt: 842,
        },
      },
    });

    const outDoc = await PDFDocument.load(result.bytes);
    expect(outDoc.getPageCount()).toBe(2);
    // Page 0 was replaced with rasterized JPEG: original secret text is gone from PDF stream!
    expect(extractDrawnAsciiStrings(outDoc, 0)).not.toContain('TOP SECRET 12345');
    // Page 1 remained vector: original text AND new vector annotation are both present!
    const page2Texts = extractDrawnAsciiStrings(outDoc, 1);
    expect(page2Texts).toContain('PUBLIC PAGE 2');
    expect(page2Texts).toContain('KEEP VECTOR');
  });
});
