import type { RasterizedPageTransfer } from './compress-pdf.worker';

function canvasToJpegBuffer(canvas: HTMLCanvasElement, quality: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode PDF page as JPEG.'));
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
 * Lazily loads pdfjs-dist with a locally bundled worker to rasterize PDF pages
 * into JPEG buffers for strong compression of scan/image-heavy documents.
 */
export async function rasterizePdfToJpegs(
  pdfBytes: ArrayBuffer,
  options: {
    dpi: number;
    jpegQuality: number;
    signal?: AbortSignal;
    onPageRendered?: (current: number, total: number) => void;
  },
): Promise<RasterizedPageTransfer[]> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes) });
  const doc = await loadingTask.promise;

  const scale = Math.max(0.5, Math.min(3.5, options.dpi / 72));
  const pages: RasterizedPageTransfer[] = [];

  try {
    const total = doc.numPages;
    for (let pageNum = 1; pageNum <= total; pageNum += 1) {
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const page = await doc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        page.cleanup();
        throw new Error('Could not initialize 2D canvas context for PDF rendering.');
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const jpegBuffer = await canvasToJpegBuffer(canvas, options.jpegQuality);
      pages.push({
        jpegBuffer,
        widthPt: baseViewport.width,
        heightPt: baseViewport.height,
      });

      // Release canvas backing store immediately between pages
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      options.onPageRendered?.(pageNum, total);
    }
  } finally {
    await doc.destroy();
  }

  return pages;
}
