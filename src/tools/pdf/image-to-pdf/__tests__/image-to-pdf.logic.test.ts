import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import UPNG from 'upng-js';
import {
  buildImageToPdf,
  computeImagePlacement,
  ImageToPdfError,
} from '@/tools/pdf/image-to-pdf/image-to-pdf.logic';

const TINY_VALID_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function createTinyJpeg(): Uint8Array {
  return new Uint8Array(Buffer.from(TINY_VALID_JPEG_BASE64, 'base64'));
}

function createSolidPng(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 185;
    rgba[i + 1] = 56;
    rgba[i + 2] = 21;
    rgba[i + 3] = 255;
  }
  return new Uint8Array(UPNG.encode([rgba.buffer], width, height, 0));
}

describe('image-to-pdf.logic', () => {
  it('scales and centers a landscape image inside A4 portrait with margin', () => {
    const placement = computeImagePlacement({
      imageWidth: 1600,
      imageHeight: 800,
      paperSize: 'a4',
      orientation: 'portrait',
      marginPt: 36,
    });

    expect(placement.pageWidth).toBeCloseTo(595.28, 2);
    expect(placement.pageHeight).toBeCloseTo(841.89, 2);
    expect(placement.drawWidth).toBeCloseTo(523.28, 2);
    expect(placement.drawHeight).toBeCloseTo(261.64, 2);
    expect(placement.x).toBeCloseTo(36, 2);
    expect(placement.y).toBeCloseTo(290.125, 2);
  });

  it('supports fit-to-image, letter paper size, and auto landscape orientation', () => {
    const autoLandscape = computeImagePlacement({
      imageWidth: 1200,
      imageHeight: 600,
      paperSize: 'a4',
      orientation: 'auto',
      marginPt: 0,
    });
    expect(autoLandscape.pageWidth).toBeCloseTo(841.89, 2);
    expect(autoLandscape.pageHeight).toBeCloseTo(595.28, 2);

    const letterPortrait = computeImagePlacement({
      imageWidth: 600,
      imageHeight: 900,
      paperSize: 'letter',
      orientation: 'portrait',
      marginPt: 20,
    });
    expect(letterPortrait.pageWidth).toBeCloseTo(612, 2);
    expect(letterPortrait.pageHeight).toBeCloseTo(792, 2);

    const fit = computeImagePlacement({
      imageWidth: 800,
      imageHeight: 500,
      paperSize: 'fit',
      orientation: 'portrait',
      marginPt: 10,
    });
    expect(fit).toEqual({
      pageWidth: 820,
      pageHeight: 520,
      drawWidth: 800,
      drawHeight: 500,
      x: 10,
      y: 10,
    });
  });

  it('builds a multi-page PDF from real PNG images with auto orientation and progress', async () => {
    const landscapePng = createSolidPng(400, 200);
    const portraitPng = createSolidPng(300, 500);
    const percents: number[] = [];

    const result = await buildImageToPdf(
      [
        { name: 'slide.png', mime: 'image/png', bytes: landscapePng },
        { name: 'poster.png', mime: 'image/png', bytes: portraitPng },
      ],
      { paperSize: 'a4', orientation: 'auto', marginPt: 24 },
      (info) => percents.push(info.percent),
    );

    expect(result.pageCount).toBe(2);
    expect(percents.at(-1)).toBe(100);

    const parsed = await PDFDocument.load(result.bytes);
    expect(parsed.getPageCount()).toBe(2);
    expect(parsed.getPage(0).getSize().width).toBeCloseTo(841.89, 1);
    expect(parsed.getPage(0).getSize().height).toBeCloseTo(595.28, 1);
    expect(parsed.getPage(1).getSize().width).toBeCloseTo(595.28, 1);
    expect(parsed.getPage(1).getSize().height).toBeCloseTo(841.89, 1);
  });

  it('embeds mixed JPEG and PNG images in exact order', async () => {
    const jpegBytes = createTinyJpeg();
    const pngBytes = createSolidPng(120, 80);

    const result = await buildImageToPdf(
      [
        { name: 'cover.jpg', mime: 'image/jpeg', bytes: jpegBytes },
        { name: 'chart.png', mime: 'image/png', bytes: pngBytes },
      ],
      { paperSize: 'fit', orientation: 'auto', marginPt: 0 },
    );

    expect(result.pageCount).toBe(2);
    const parsed = await PDFDocument.load(result.bytes);
    expect(parsed.getPage(0).getSize()).toEqual({ width: 1, height: 1 });
    expect(parsed.getPage(1).getSize()).toEqual({ width: 120, height: 80 });
  });

  it('rejects empty inputs and corrupt image buffers with ImageToPdfError', async () => {
    await expect(
      buildImageToPdf([], { paperSize: 'a4', orientation: 'auto', marginPt: 24 }),
    ).rejects.toMatchObject({ code: 'EMPTY_INPUT' });

    const brokenBytes = new TextEncoder().encode('not-an-image');
    await expect(
      buildImageToPdf(
        [{ name: 'broken.png', mime: 'image/png', bytes: brokenBytes }],
        { paperSize: 'a4', orientation: 'auto', marginPt: 24 },
      ),
    ).rejects.toBeInstanceOf(ImageToPdfError);

    await expect(
      buildImageToPdf(
        [{ name: 'broken.png', mime: 'image/png', bytes: brokenBytes }],
        { paperSize: 'a4', orientation: 'auto', marginPt: 24 },
      ),
    ).rejects.toMatchObject({ code: 'CORRUPT_IMAGE', fileName: 'broken.png' });
  });
});
