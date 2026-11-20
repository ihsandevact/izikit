/**
 * Lazily imports pdfjs-dist only when a user opens a PDF in Rotate & Reorder,
 * using a locally bundled worker URL (zero external CDN requests, offline-ready).
 */
export async function renderPdfThumbnails(
  pdfBytes: ArrayBuffer,
  onThumbnail: (pageIndex: number, dataUrl: string) => void,
  signal?: AbortSignal,
  maxPages?: number,
): Promise<void> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes) });
  const doc = await loadingTask.promise;

  try {
    const total = maxPages ? Math.min(doc.numPages, maxPages) : doc.numPages;
    for (let pageNum = 1; pageNum <= total; pageNum += 1) {
      if (signal?.aborted) break;

      const page = await doc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const targetWidth = 220;
      const scale = Math.min(1.5, targetWidth / Math.max(1, baseViewport.width));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!signal?.aborted) {
          onThumbnail(pageNum - 1, canvas.toDataURL('image/jpeg', 0.72));
        }
      }
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
}
