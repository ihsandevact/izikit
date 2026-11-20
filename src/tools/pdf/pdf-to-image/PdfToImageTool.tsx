import { useEffect, useId, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes } from '@/lib/format';
import {
  mimeToExtension,
  validatePdfFiles,
  type SupportedImageMime,
} from '@/lib/file-validation';
import { downloadAsZip, downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import { SplitPdfError } from '@/tools/pdf/split/range-parser';
import {
  buildPdfToImageFilenames,
  normalizePdfToImageQuality,
  resolvePdfToImagePages,
  type PdfToImageDpi,
  type PdfToImagePageMode,
} from './pdf-to-image.logic';
import {
  inspectPdfDocumentPages,
  renderPdfPagesToImages,
  type RenderedPdfPageImage,
} from './renderer';

interface RenderedResultItem extends RenderedPdfPageImage {
  previewUrl: string;
}

interface PdfToImageToolProps {
  locale: Locale;
}

export default function PdfToImageTool({ locale }: PdfToImageToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.pdfToImage;

  const formatId = useId();
  const dpiId = useId();
  const qualityId = useId();
  const rangeId = useId();

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [isInspecting, setIsInspecting] = useState(false);

  const [format, setFormat] = useState<SupportedImageMime>('image/jpeg');
  const [dpi, setDpi] = useState<PdfToImageDpi>(200);
  const [quality, setQuality] = useState(90);
  const [pageMode, setPageMode] = useState<PdfToImagePageMode>('all');
  const [rangeSpec, setRangeSpec] = useState('');

  const [isRendering, setIsRendering] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [results, setResults] = useState<RenderedResultItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<RenderedResultItem[]>([]);
  resultsRef.current = results;

  const revokeResults = (items: readonly RenderedResultItem[]) => {
    for (const item of items) {
      URL.revokeObjectURL(item.previewUrl);
    }
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      revokeResults(resultsRef.current);
    };
  }, []);

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
    setIsInspecting(true);
    revokeResults(resultsRef.current);
    setResults([]);

    try {
      const buffer = await chosen.arrayBuffer();
      const pages = await inspectPdfDocumentPages(buffer);
      if (pages < 1) {
        setErrors([copy.errors.corrupt]);
        return;
      }
      setPdfFile(chosen);
      setPdfBuffer(buffer);
      setTotalPages(pages);
      setRangeSpec(pages > 1 ? `1-${Math.min(pages, 3)}` : '1');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password|encrypt/i.test(msg)) {
        setErrors([copy.errors.encrypted]);
      } else {
        setErrors([copy.errors.corrupt]);
      }
    } finally {
      setIsInspecting(false);
    }
  };

  const resetAll = () => {
    abortRef.current?.abort();
    revokeResults(resultsRef.current);
    setPdfFile(null);
    setPdfBuffer(null);
    setTotalPages(0);
    setResults([]);
    setErrors([]);
    setIsRendering(false);
    setProgress({ percent: 0, detail: '' });
  };

  const handleConvert = async () => {
    if (!pdfFile || !pdfBuffer || totalPages < 1) return;

    setErrors([]);
    let pageNumbers: number[];
    try {
      pageNumbers = resolvePdfToImagePages(pageMode, rangeSpec, totalPages);
    } catch (err) {
      if (err instanceof SplitPdfError) {
        setErrors([
          err.code === 'OUT_OF_RANGE' ? copy.errors.outOfRange : copy.errors.invalidRange,
        ]);
      } else {
        setErrors([copy.errors.invalidRange]);
      }
      return;
    }

    if (pageNumbers.length === 0) {
      setErrors([copy.errors.invalidRange]);
      return;
    }

    revokeResults(resultsRef.current);
    setResults([]);
    setIsRendering(true);
    setProgress({
      percent: 4,
      detail: `${copy.progressRendering} 1/${pageNumbers.length}...`,
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const filenames = buildPdfToImageFilenames(pdfFile.name, pageNumbers, totalPages, format);
      const qualityRatio = normalizePdfToImageQuality(quality, format);

      const rendered = await renderPdfPagesToImages(pdfBuffer, {
        pageNumbers,
        filenames,
        format,
        dpi,
        quality: qualityRatio,
        signal: controller.signal,
        onPageRendered: (completed, total, pageNum) => {
          setProgress({
            percent: Math.round((completed / total) * 100),
            detail: `${copy.progressRendering} ${completed}/${total} (${copy.pageLabel} ${pageNum})`,
          });
        },
      });

      setResults(
        rendered.map((item) => ({
          ...item,
          previewUrl: URL.createObjectURL(item.blob),
        })),
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrors([copy.errors.generic]);
    } finally {
      setIsRendering(false);
      abortRef.current = null;
    }
  };

  const handleDownloadZip = async () => {
    if (results.length === 0 || !pdfFile) return;
    setIsZipping(true);
    try {
      const stem = pdfFile.name.replace(/\.pdf$/i, '').trim() || 'dokumen';
      const ext = mimeToExtension(format);
      await downloadAsZip(
        results.map((item) => ({
          filename: item.filename,
          blob: item.blob,
        })),
        `${stem}-${ext}.zip`,
      );
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadAllSingle = () => {
    results.forEach((item, idx) => {
      window.setTimeout(() => {
        downloadBlob(item.blob, item.filename);
      }, idx * 140);
    });
  };

  const extUpper = mimeToExtension(format).toUpperCase();

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
          disabled={isInspecting}
          idleLabel={isInspecting ? copy.inspectingLabel : dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleFilesSelected}
        />
      ) : (
        <div className="space-y-5">
          {/* Selected PDF Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5 sm:p-4">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 truncate text-sm font-bold text-[var(--ink-primary)]">
                {pdfFile.name}
              </p>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {formatBytes(pdfFile.size)} · {totalPages} {copy.pagesUnit}
              </p>
            </div>
            <button
              type="button"
              onClick={resetAll}
              disabled={isRendering}
              className="btn-secondary inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold"
            >
              {copy.changeFile}
            </button>
          </div>

          {/* Export Settings */}
          <fieldset
            disabled={isRendering}
            className="m-0 space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
          >
            <legend className="px-1 text-sm font-semibold text-[var(--ink-primary)]">
              {copy.settingsHeading}
            </legend>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor={formatId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.formatLabel}
                </label>
                <select
                  id={formatId}
                  value={format}
                  onChange={(e) => setFormat(e.target.value as SupportedImageMime)}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value="image/jpeg">JPEG (.jpg)</option>
                  <option value="image/png">PNG (.png)</option>
                  <option value="image/webp">WebP (.webp)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={dpiId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.dpiLabel}
                </label>
                <select
                  id={dpiId}
                  value={dpi}
                  onChange={(e) => setDpi(Number(e.target.value) as PdfToImageDpi)}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value={150}>{copy.dpi150}</option>
                  <option value={200}>{copy.dpi200}</option>
                  <option value={300}>{copy.dpi300}</option>
                </select>
              </div>

              {format !== 'image/png' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <label htmlFor={qualityId} className="font-medium text-[var(--ink-primary)]">
                      {copy.qualityLabel}
                    </label>
                    <span className="font-data font-semibold text-[var(--accent)]">{quality}%</span>
                  </div>
                  <input
                    id={qualityId}
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="izikit-range h-11 w-full"
                  />
                </div>
              )}
            </div>

            {/* Page Selection Mode */}
            <div className="space-y-2.5 border-t border-[var(--border-subtle)] pt-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPageMode('all')}
                  aria-pressed={pageMode === 'all'}
                  className={`inline-flex min-h-10 items-center rounded-lg border px-3.5 text-xs font-semibold transition-colors ${
                    pageMode === 'all'
                      ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {copy.modeAllPages} ({totalPages})
                </button>
                <button
                  type="button"
                  onClick={() => setPageMode('range')}
                  aria-pressed={pageMode === 'range'}
                  className={`inline-flex min-h-10 items-center rounded-lg border px-3.5 text-xs font-semibold transition-colors ${
                    pageMode === 'range'
                      ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {copy.modeRangePages}
                </button>
              </div>

              {pageMode === 'range' && (
                <div className="max-w-md space-y-1">
                  <label htmlFor={rangeId} className="block text-xs font-medium text-[var(--ink-muted)]">
                    {copy.rangeLabel}
                  </label>
                  <input
                    id={rangeId}
                    type="text"
                    value={rangeSpec}
                    onChange={(e) => setRangeSpec(e.target.value)}
                    placeholder={copy.rangePlaceholder}
                    className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end border-t border-[var(--border-subtle)] pt-4">
              <button
                type="button"
                onClick={handleConvert}
                className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-lg px-6 text-sm font-semibold sm:w-auto"
              >
                {copy.convertButton} → {extUpper}
              </button>
            </div>
          </fieldset>

          {isRendering && (
            <ProgressBanner
              title={dict.shared.processingTitle}
              detail={progress.detail}
              percent={progress.percent}
              cancelLabel={dict.shared.cancelAction}
              onCancel={() => abortRef.current?.abort()}
            />
          )}

          {results.length > 0 && !isRendering && (
            <div className="space-y-5">
              <div className="rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                    {copy.resultReadyTitle} ({results.length} {copy.pagesUnit})
                  </h3>

                  <div className="flex flex-wrap items-center gap-2">
                    {results.length > 1 ? (
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
                          onClick={() => downloadBlob(results[0].blob, results[0].filename)}
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

              {/* Rendered Page Gallery */}
              <ul className="m-0 grid list-none grid-cols-1 gap-3.5 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((item) => (
                  <li
                    key={item.pageNumber}
                    className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)]"
                  >
                    <div className="flex aspect-[4/3] items-center justify-center bg-[var(--bg-recess)] p-3">
                      <img
                        src={item.previewUrl}
                        alt={item.filename}
                        className="max-h-full max-w-full rounded border border-[var(--border-subtle)] object-contain shadow-xs"
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
