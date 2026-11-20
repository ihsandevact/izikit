import type { SupportedImageMime } from '@/lib/file-validation';

export interface RenderedPdfPageImage {
  pageNumber: number;
  filename: string;
  blob: Blob;
  width: number;
  height: number;
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

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: SupportedImageMime,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Failed to encode PDF page as ${mime}.`));
          return;
        }
        resolve(blob);
      },
      mime,
      quality,
    );
  });
}

export async function inspectPdfDocumentPages(pdfBytes: ArrayBuffer): Promise<number> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes.slice(0)) });
  const doc = await loadingTask.promise;
  try {
    return doc.numPages;
  } finally {
    await doc.destroy();
  }
}

export async function renderPdfPagesToImages(
  pdfBytes: ArrayBuffer,
  options: {
    pageNumbers: readonly number[];
    filenames: readonly string[];
    format: SupportedImageMime;
    dpi: number;
    quality?: number;
    signal?: AbortSignal;
    onPageRendered?: (completed: number, total: number, pageNumber: number) => void;
  },
): Promise<RenderedPdfPageImage[]> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes.slice(0)) });
  const doc = await loadingTask.promise;

  const scale = Math.max(0.75, Math.min(4.2, options.dpi / 72));
  const results: RenderedPdfPageImage[] = [];

  try {
    const total = options.pageNumbers.length;
    for (let idx = 0; idx < total; idx += 1) {
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const pageNumber = options.pageNumbers[idx];
      const page = await doc.getPage(pageNumber);
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

      const blob = await canvasToBlob(canvas, options.format, options.quality);
      results.push({
        pageNumber,
        filename: options.filenames[idx],
        blob,
        width: canvas.width,
        height: canvas.height,
      });

      // Release canvas backing memory immediately between pages
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      options.onPageRendered?.(idx + 1, total, pageNumber);
    }
  } finally {
    await doc.destroy();
  }

  return results;
}
