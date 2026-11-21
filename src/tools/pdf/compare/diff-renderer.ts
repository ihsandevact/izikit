import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  computeLineDiff,
  computePixelDiff,
  type RgbaBuffer,
  type TextDiffSummary,
} from './compare-pdf.logic';

export interface LoadedPdfHandle {
  doc: PDFDocumentProxy;
  numPages: number;
  filename: string;
}

export interface PageComparisonResult {
  pageNumber: number;
  imageADataUrl: string | null;
  imageBDataUrl: string | null;
  diffDataUrl: string | null;
  diffPercent: number;
  changedPixels: number;
  textDiff: TextDiffSummary;
}

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }
  return pdfjs;
}

export async function openPdfDocument(file: File): Promise<LoadedPdfHandle> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  return {
    doc,
    numPages: doc.numPages,
    filename: file.name,
  };
}

async function renderPageToBuffer(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale = 1.35,
): Promise<{ buffer: RgbaBuffer; dataUrl: string; textLines: string[] }> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/png');

  // Extract text grouped roughly by Y coordinate (lines)
  const textContent = await page.getTextContent();
  const linesMap = new Map<number, { x: number; str: string }[]>();
  for (const item of textContent.items) {
    if ('str' in item && item.str.trim()) {
      const yBucket = Math.round(item.transform[5] / 4) * 4;
      const xPos = item.transform[4];
      const bucket = linesMap.get(yBucket) ?? [];
      bucket.push({ x: xPos, str: item.str });
      linesMap.set(yBucket, bucket);
    }
  }
  // PDF Y coordinates grow upward, so sort descending for top-to-bottom reading order
  const textLines = Array.from(linesMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, items]) =>
      items
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);

  return {
    buffer: { width: canvas.width, height: canvas.height, data: imgData.data },
    dataUrl,
    textLines,
  };
}

export async function comparePdfPage(
  handleA: LoadedPdfHandle,
  handleB: LoadedPdfHandle,
  pageNumber: number,
  threshold = 28,
): Promise<PageComparisonResult> {
  const [renderedA, renderedB] = await Promise.all([
    pageNumber <= handleA.numPages ? renderPageToBuffer(handleA.doc, pageNumber) : Promise.resolve(null),
    pageNumber <= handleB.numPages ? renderPageToBuffer(handleB.doc, pageNumber) : Promise.resolve(null),
  ]);

  const pixelDiff = computePixelDiff(
    renderedA?.buffer ?? null,
    renderedB?.buffer ?? null,
    threshold,
  );

  let diffDataUrl: string | null = null;
  if (pixelDiff.width > 0 && pixelDiff.height > 0) {
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = pixelDiff.width;
    diffCanvas.height = pixelDiff.height;
    const ctx = diffCanvas.getContext('2d');
    if (ctx) {
      const outImg = ctx.createImageData(pixelDiff.width, pixelDiff.height);
      outImg.data.set(pixelDiff.diffData);
      ctx.putImageData(outImg, 0, 0);
      diffDataUrl = diffCanvas.toDataURL('image/png');
    }
  }

  const textDiff = computeLineDiff(
    renderedA?.textLines ?? [],
    renderedB?.textLines ?? [],
  );

  return {
    pageNumber,
    imageADataUrl: renderedA?.dataUrl ?? null,
    imageBDataUrl: renderedB?.dataUrl ?? null,
    diffDataUrl,
    diffPercent: pixelDiff.diffPercent,
    changedPixels: pixelDiff.changedPixels,
    textDiff,
  };
}
