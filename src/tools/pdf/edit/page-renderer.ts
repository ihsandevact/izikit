import type { UiPdfAnnotation } from './plan';
import type { RasterizedOverrideTransfer } from './edit.worker';

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

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode signature image.'));
    img.src = src;
  });
}

function canvasToJpegBuffer(canvas: HTMLCanvasElement, quality: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode flattened PDF page.'));
          return;
        }
        blob.arrayBuffer().then(resolve, reject);
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Renders a single PDF page (0-based index) into a crisp data URL for interactive canvas editing.
 */
export async function renderSinglePdfPagePreview(
  pdfBytes: ArrayBuffer,
  pageIndex: number,
  maxWidth = 900,
): Promise<{ dataUrl: string; widthPt: number; heightPt: number }> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes.slice(0)) });
  const doc = await loadingTask.promise;

  try {
    const page = await doc.getPage(pageIndex + 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, Math.max(0.8, maxWidth / Math.max(1, baseViewport.width)));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      page.cleanup();
      throw new Error('Could not initialize 2D canvas context.');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();

    return {
      dataUrl,
      widthPt: baseViewport.width,
      heightPt: baseViewport.height,
    };
  } finally {
    await doc.destroy();
  }
}

/**
 * Permanently rasterizes pages containing redact annotations at 150 DPI,
 * burning all annotations on those pages into JPEG pixels so original hidden text is destroyed.
 */
export async function flattenRedactedPdfPages(
  pdfBytes: ArrayBuffer,
  redactedPageIndices: number[],
  allAnnotations: readonly UiPdfAnnotation[],
  signal?: AbortSignal,
): Promise<RasterizedOverrideTransfer[]> {
  if (redactedPageIndices.length === 0) return [];

  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes.slice(0)) });
  const doc = await loadingTask.promise;
  const results: RasterizedOverrideTransfer[] = [];

  try {
    const dpiScale = 150 / 72;

    for (const pageIndex of redactedPageIndices) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const page = await doc.getPage(pageIndex + 1);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: dpiScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        page.cleanup();
        throw new Error('Could not initialize 2D canvas context.');
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const pageAnns = allAnnotations.filter((a) => a.pageIndex === pageIndex);
      const w = canvas.width;
      const h = canvas.height;

      // Burn annotations in consistent layer order: highlight -> redact -> signature -> text
      for (const hl of pageAnns.filter((a) => a.type === 'highlight')) {
        ctx.save();
        ctx.globalAlpha = hl.opacity;
        ctx.fillStyle = hl.colorHex;
        ctx.fillRect(hl.x * w, hl.y * h, hl.width * w, hl.height * h);
        ctx.restore();
      }

      for (const rd of pageAnns.filter((a) => a.type === 'redact')) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = rd.colorHex;
        ctx.fillRect(rd.x * w, rd.y * h, rd.width * w, rd.height * h);
        ctx.restore();
      }

      for (const sig of pageAnns.filter((a) => a.type === 'signature')) {
        const img = await loadHtmlImage(sig.imageDataUrl);
        ctx.drawImage(img, sig.x * w, sig.y * h, sig.width * w, sig.height * h);
      }

      for (const txt of pageAnns.filter((a) => a.type === 'text')) {
        const scaledFontPx = txt.fontSize * dpiScale;
        ctx.save();
        ctx.fillStyle = txt.colorHex;
        ctx.font = `${scaledFontPx}px Helvetica, Arial, sans-serif`;
        ctx.textBaseline = 'top';
        const lines = txt.text.trim().split(/\r?\n/);
        for (let idx = 0; idx < lines.length; idx += 1) {
          ctx.fillText(lines[idx], txt.x * w, txt.y * h + idx * scaledFontPx * 1.25);
        }
        ctx.restore();
      }

      const jpegBuffer = await canvasToJpegBuffer(canvas, 0.88);
      results.push({
        pageIndex,
        jpegBuffer,
        widthPt: baseViewport.width,
        heightPt: baseViewport.height,
      });

      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  return results;
}
