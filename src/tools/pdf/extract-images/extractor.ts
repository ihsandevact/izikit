import {
  buildExtractedImageFilename,
  normalizePdfRawImageToRgba,
  shouldSkipExtractedImage,
} from './extract-pdf-images.logic';

export interface ExtractedPdfImage {
  id: string;
  pageNumber: number;
  filename: string;
  width: number;
  height: number;
  blob: Blob;
}

interface PdfJsImageObject {
  width?: number;
  height?: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: ImageBitmap;
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

function resolvePdfObj(
  store: { has: (name: string) => boolean; get: (name: string, cb?: (v: unknown) => void) => unknown },
  name: string,
): Promise<PdfJsImageObject | null> {
  return new Promise((resolve) => {
    try {
      if (store.has(name)) {
        resolve(store.get(name) as PdfJsImageObject);
        return;
      }
      store.get(name, (val) => resolve((val as PdfJsImageObject) ?? null));
    } catch {
      resolve(null);
    }
  });
}

async function pdfImageObjToBlob(
  imgObj: PdfJsImageObject,
  outputMime: 'image/png' | 'image/jpeg',
): Promise<{ blob: Blob; width: number; height: number } | null> {
  const width = imgObj.bitmap?.width ?? imgObj.width ?? 0;
  const height = imgObj.bitmap?.height ?? imgObj.height ?? 0;
  if (width <= 0 || height <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (outputMime === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
  }

  if (imgObj.bitmap) {
    ctx.drawImage(imgObj.bitmap, 0, 0);
  } else if (imgObj.data) {
    const rgba = normalizePdfRawImageToRgba(imgObj.data, width, height);
    if (!rgba) return null;
    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(imageData, 0, 0);
  } else {
    return null;
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (res) => {
        canvas.width = 0;
        canvas.height = 0;
        resolve(res);
      },
      outputMime,
      outputMime === 'image/jpeg' ? 0.92 : undefined,
    );
  });

  if (!blob) return null;
  return { blob, width, height };
}

export async function extractImagesFromPdf(
  pdfBytes: ArrayBuffer,
  pdfFilename: string,
  options: {
    outputMime?: 'image/png' | 'image/jpeg';
    minDimension?: number;
    signal?: AbortSignal;
    onProgress?: (pageNumber: number, totalPages: number, extractedCount: number) => void;
  } = {},
): Promise<{ totalPages: number; images: ExtractedPdfImage[] }> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes.slice(0)) });
  const doc = await loadingTask.promise;

  const outputMime = options.outputMime ?? 'image/png';
  const ext = outputMime === 'image/jpeg' ? 'jpg' : 'png';
  const minDim = options.minDimension ?? 16;

  const images: ExtractedPdfImage[] = [];
  const seenObjNames = new Set<string>();
  let globalSeq = 0;

  try {
    const totalPages = doc.numPages;

    for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const page = await doc.getPage(pageNum);
      try {
        const opList = await page.getOperatorList();
        const { OPS } = pdfjs;

        for (let i = 0; i < opList.fnArray.length; i += 1) {
          if (options.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          const fn = opList.fnArray[i];
          const args = opList.argsArray[i];

          let imgObj: PdfJsImageObject | null = null;

          if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
            const objName = typeof args?.[0] === 'string' ? args[0] : null;
            if (!objName || seenObjNames.has(objName)) continue;
            seenObjNames.add(objName);

            const store = objName.startsWith('g_') ? page.commonObjs : page.objs;
            imgObj = await resolvePdfObj(
              store as unknown as {
                has: (n: string) => boolean;
                get: (n: string, cb?: (v: unknown) => void) => unknown;
              },
              objName,
            );
          } else if (fn === OPS.paintInlineImageXObject) {
            imgObj = (args?.[0] as PdfJsImageObject) ?? null;
          }

          if (!imgObj) continue;

          const w = imgObj.bitmap?.width ?? imgObj.width ?? 0;
          const h = imgObj.bitmap?.height ?? imgObj.height ?? 0;
          if (shouldSkipExtractedImage(w, h, minDim)) continue;

          const converted = await pdfImageObjToBlob(imgObj, outputMime);
          if (!converted) continue;

          globalSeq += 1;
          images.push({
            id: `p${pageNum}-i${globalSeq}`,
            pageNumber: pageNum,
            filename: buildExtractedImageFilename(pdfFilename, pageNum, globalSeq, ext),
            width: converted.width,
            height: converted.height,
            blob: converted.blob,
          });
        }
      } finally {
        page.cleanup();
      }

      options.onProgress?.(pageNum, totalPages, images.length);
    }

    return { totalPages, images };
  } finally {
    await doc.destroy();
  }
}
