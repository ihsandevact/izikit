import { useEffect, useId, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes } from '@/lib/format';
import { validatePdfFiles } from '@/lib/file-validation';
import { downloadAsZip, downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import { extractImagesFromPdf, type ExtractedPdfImage } from './extractor';

interface ExtractedPreviewItem extends ExtractedPdfImage {
  previewUrl: string;
}

interface ExtractPdfImagesToolProps {
  locale: Locale;
}

export default function ExtractPdfImagesTool({ locale }: ExtractPdfImagesToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.extractPdfImages;

  const formatId = useId();

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [outputMime, setOutputMime] = useState<'image/png' | 'image/jpeg'>('image/png');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [images, setImages] = useState<ExtractedPreviewItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const imagesRef = useRef<ExtractedPreviewItem[]>([]);
  imagesRef.current = images;

  const revokeImages = (list: readonly ExtractedPreviewItem[]) => {
    for (const item of list) {
      URL.revokeObjectURL(item.previewUrl);
    }
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      revokeImages(imagesRef.current);
    };
  }, []);

  const runExtraction = async (
    file: File,
    buffer: ArrayBuffer,
    mime: 'image/png' | 'image/jpeg',
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    revokeImages(imagesRef.current);
    setImages([]);
    setErrors([]);
    setHasScanned(false);
    setIsExtracting(true);
    setProgress({ percent: 5, detail: copy.progressScanning });

    try {
      const result = await extractImagesFromPdf(buffer, file.name, {
        outputMime: mime,
        signal: controller.signal,
        onProgress: (pageNum, pages, found) => {
          setProgress({
            percent: Math.max(5, Math.round((pageNum / Math.max(1, pages)) * 100)),
            detail: `${copy.progressPage} ${pageNum}/${pages} · ${found} ${copy.imagesUnit}`,
          });
        },
      });

      setTotalPages(result.totalPages);
      setImages(
        result.images.map((item) => ({
          ...item,
          previewUrl: URL.createObjectURL(item.blob),
        })),
      );
      setHasScanned(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : '';
      if (/password|encrypt/i.test(msg)) {
        setErrors([copy.errors.encrypted]);
      } else {
        setErrors([copy.errors.generic]);
      }
    } finally {
      setIsExtracting(false);
      abortRef.current = null;
    }
  };

  const handleFilesSelected = async (incoming: File[]) => {
    setErrors([]);
    const { accepted, errors: validationErrors } = await validatePdfFiles(
      incoming.slice(0, 1),
      copy.errors,
    );
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (accepted.length === 0) return;

    const chosen = accepted[0].file;
    const buffer = await chosen.arrayBuffer();
    setPdfFile(chosen);
    setPdfBuffer(buffer);
    await runExtraction(chosen, buffer, outputMime);
  };

  const resetAll = () => {
    abortRef.current?.abort();
    revokeImages(imagesRef.current);
    setPdfFile(null);
    setPdfBuffer(null);
    setImages([]);
    setTotalPages(0);
    setHasScanned(false);
    setIsExtracting(false);
    setErrors([]);
  };

  const handleDownloadZip = async () => {
    if (images.length === 0 || !pdfFile) return;
    setIsZipping(true);
    try {
      const stem = pdfFile.name.replace(/\.pdf$/i, '').trim() || 'dokumen';
      await downloadAsZip(
        images.map((item) => ({
          filename: item.filename,
          blob: item.blob,
        })),
        `${stem}-images.zip`,
      );
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadAllSingle = () => {
    images.forEach((item, idx) => {
      window.setTimeout(() => {
        downloadBlob(item.blob, item.filename);
      }, idx * 140);
    });
  };

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {!pdfFile ? (
        <Dropzone
          accept="application/pdf,.pdf"
          multiple={false}
          disabled={isExtracting}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleFilesSelected}
        />
      ) : (
        <div className="space-y-5">
          {/* File & Format Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5 sm:p-4">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 truncate text-sm font-bold text-[var(--ink-primary)]">
                {pdfFile.name}
              </p>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {formatBytes(pdfFile.size)}
                {totalPages > 0 ? ` · ${totalPages} ${copy.pagesUnit}` : ''}
                {hasScanned ? ` · ${images.length} ${copy.imagesUnit}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={formatId} className="sr-only">
                {copy.formatLabel}
              </label>
              <select
                id={formatId}
                value={outputMime}
                disabled={isExtracting}
                onChange={(e) => {
                  const nextMime = e.target.value as 'image/png' | 'image/jpeg';
                  setOutputMime(nextMime);
                  if (pdfFile && pdfBuffer) {
                    void runExtraction(pdfFile, pdfBuffer, nextMime);
                  }
                }}
                className="h-10 rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-xs font-semibold text-[var(--ink-primary)]"
              >
                <option value="image/png">PNG (.png)</option>
                <option value="image/jpeg">JPEG (.jpg)</option>
              </select>

              <button
                type="button"
                onClick={resetAll}
                disabled={isExtracting}
                className="btn-secondary inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold"
              >
                {copy.changeFile}
              </button>
            </div>
          </div>

          {isExtracting && (
            <ProgressBanner
              title={dict.shared.processingTitle}
              detail={progress.detail}
              percent={progress.percent}
              cancelLabel={dict.shared.cancelAction}
              onCancel={() => abortRef.current?.abort()}
            />
          )}

          {hasScanned && !isExtracting && images.length === 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] px-6 py-10 text-center">
              <p className="m-0 text-sm font-bold text-[var(--ink-primary)]">
                {copy.emptyResultTitle}
              </p>
              <p className="mx-auto mt-1.5 mb-0 max-w-md text-xs leading-relaxed text-[var(--ink-muted)]">
                {copy.emptyResultBody}
              </p>
            </div>
          )}

          {images.length > 0 && !isExtracting && (
            <div className="space-y-5">
              <div className="rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                    {copy.resultReadyTitle} ({images.length} {copy.imagesUnit})
                  </h3>

                  <div className="flex flex-wrap items-center gap-2">
                    {images.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={handleDownloadZip}
                          disabled={isZipping}
                          className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
                        >
                          <DownloadIcon className="h-4 w-4" />
                          <span>{isZipping ? dict.shared.buildingZip : copy.downloadZip}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadAllSingle}
                          className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
                        >
                          <DownloadIcon className="h-4 w-4" />
                          <span>{copy.downloadAllSingle}</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => downloadBlob(images[0].blob, images[0].filename)}
                          className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
                        >
                          <DownloadIcon className="h-4 w-4" />
                          <span>{copy.downloadSingle}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadZip}
                          disabled={isZipping}
                          className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
                        >
                          <DownloadIcon className="h-4 w-4" />
                          <span>{isZipping ? dict.shared.buildingZip : copy.downloadZipSingle}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <SupportCard
                  locale={locale}
                  heading={dict.shared.supportHeading}
                  body={dict.shared.supportBody}
                  aboutCta={dict.shared.supportAboutCta}
                  dismissLabel={dict.shared.supportDismiss}
                />
              </div>

              <ul className="m-0 grid list-none grid-cols-1 gap-3.5 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)]"
                  >
                    <div className="bg-checkerboard flex aspect-[4/3] items-center justify-center p-3">
                      <img
                        src={item.previewUrl}
                        alt={item.filename}
                        className="max-h-full max-w-full rounded object-contain shadow-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] p-3">
                      <div className="min-w-0">
                        <p className="m-0 truncate text-xs font-bold text-[var(--ink-primary)]">
                          {copy.pageLabel} {item.pageNumber}
                        </p>
                        <p className="font-data m-0 text-[11px] text-[var(--ink-muted)]">
                          {item.width}×{item.height} · {formatBytes(item.blob.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => downloadBlob(item.blob, item.filename)}
                        className="btn-secondary inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
                      >
                        <DownloadIcon className="h-3.5 w-3.5" />
                        <span>{copy.downloadSingle}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
