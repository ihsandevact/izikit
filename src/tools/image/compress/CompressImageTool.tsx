import { useEffect, useId, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { SITE_CONFIG } from '@/config/site';
import { calculateSavings, formatBytes, replaceFileExtension } from '@/lib/format';
import { createClientId } from '@/lib/id';
import {
  detectImageMimeFromBytes,
  mimeToExtension,
  readFileHeaderBytes,
  type SupportedImageMime,
} from '@/lib/file-validation';
import { runWorkerTask } from '@/lib/worker-client';
import { downloadAsZip, downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon, TrashIcon } from '@/components/shared/icons';
import type { CompressOptions, OutputFormatOption } from './compress.logic';
import type {
  CompressWorkerRequest,
  CompressWorkerResponse,
} from './compress.worker';

interface ImageQueueItem {
  id: string;
  file: File;
  mime: SupportedImageMime;
  originalUrl: string;
  status: 'queued' | 'done' | 'error';
  compressedBlob?: Blob;
  compressedUrl?: string;
  outputFilename?: string;
  originalWidth?: number;
  originalHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  keptOriginal?: boolean;
}

interface CompressImageToolProps {
  locale: Locale;
}

function createCompressWorker(): Worker {
  return new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' });
}

export default function CompressImageTool({ locale }: CompressImageToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.compressImage;

  const qualityId = useId();
  const formatId = useId();
  const maxWidthId = useId();

  const [items, setItems] = useState<ImageQueueItem[]>([]);
  const [options, setOptions] = useState<CompressOptions>({
    quality: 80,
    outputFormat: 'image/webp',
    maxWidth: null,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [hasCompletedOnce, setHasCompletedOnce] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<ImageQueueItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.originalUrl);
        if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl);
      }
    };
  }, []);

  // Close comparison modal with Escape (Antislop R-26 / R-32)
  useEffect(() => {
    if (!previewId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewId]);

  const handleFilesSelected = async (incomingFiles: File[]) => {
    setErrors([]);
    const nextErrors: string[] = [];
    const accepted: ImageQueueItem[] = [];

    for (const file of incomingFiles) {
      if (file.size > SITE_CONFIG.limits.imageSoftMaxBytes) {
        nextErrors.push(`${copy.errors.tooLarge} ${file.name} (${formatBytes(file.size)})`);
        continue;
      }

      try {
        const header = await readFileHeaderBytes(file, 32);
        const detectedMime = detectImageMimeFromBytes(header);
        if (!detectedMime) {
          nextErrors.push(`${copy.errors.notImage} ${file.name}`);
          continue;
        }

        accepted.push({
          id: `${file.name}-${file.size}-${createClientId()}`,
          file,
          mime: detectedMime,
          originalUrl: URL.createObjectURL(file),
          status: 'queued',
        });
      } catch {
        nextErrors.push(`${copy.errors.generic} (${file.name})`);
      }
    }

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
    }

    if (accepted.length > 0) {
      setItems((prev) => [...prev, ...accepted]);
    }
  };

  const removeItem = (id: string) => {
    if (previewId === id) setPreviewId(null);
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.originalUrl);
        if (target.compressedUrl) URL.revokeObjectURL(target.compressedUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const resetAll = () => {
    abortRef.current?.abort();
    setPreviewId(null);
    for (const item of items) {
      URL.revokeObjectURL(item.originalUrl);
      if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl);
    }
    setItems([]);
    setErrors([]);
    setIsCompressing(false);
    setHasCompletedOnce(false);
    setProgress({ percent: 0, detail: '' });
  };

  const handleCompress = async () => {
    if (items.length === 0) return;

    setErrors([]);
    setIsCompressing(true);
    setProgress({ percent: 5, detail: `${copy.progressProcessing} 1/${items.length}...` });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const prepared = await Promise.all(
        items.map(async (item) => ({
          id: item.id,
          name: item.file.name,
          mime: item.mime,
          buffer: await item.file.arrayBuffer(),
        })),
      );

      const transferables = prepared.map((entry) => entry.buffer);

      const response = await runWorkerTask<CompressWorkerRequest, CompressWorkerResponse>(
        createCompressWorker,
        { items: prepared, options },
        {
          transfer: transferables,
          signal: controller.signal,
          onProgress: (evt) => {
            const detail = evt.label
              ? `${copy.progressProcessing} ${evt.current ?? ''}/${evt.total ?? items.length}: ${evt.label}`
              : copy.progressProcessing;
            setProgress({ percent: evt.percent, detail });
          },
        },
      );

      const byId = new Map(response.results.map((r) => [r.id, r]));

      setItems((prev) =>
        prev.map((item) => {
          const out = byId.get(item.id);
          if (!out) return item;
          if (item.compressedUrl) {
            URL.revokeObjectURL(item.compressedUrl);
          }
          const blob = new Blob([out.buffer], { type: out.outputMime });
          const ext = mimeToExtension(out.outputMime);
          const stem = item.file.name.replace(/\.[^/.]+$/, '');
          const outputFilename = replaceFileExtension(`${stem}-compressed`, ext);

          return {
            ...item,
            status: 'done',
            compressedBlob: blob,
            compressedUrl: URL.createObjectURL(blob),
            outputFilename,
            originalWidth: out.originalWidth,
            originalHeight: out.originalHeight,
            outputWidth: out.outputWidth,
            outputHeight: out.outputHeight,
            keptOriginal: out.keptOriginal,
          };
        }),
      );
      setHasCompletedOnce(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setErrors([copy.errors.generic]);
    } finally {
      setIsCompressing(false);
      abortRef.current = null;
    }
  };

  const handleDownloadAllZip = async () => {
    const doneItems = items.filter((item) => item.status === 'done' && item.compressedBlob);
    if (doneItems.length === 0) return;

    setIsZipping(true);
    try {
      await downloadAsZip(
        doneItems.map((item) => ({
          filename: item.outputFilename || item.file.name,
          blob: item.compressedBlob!,
        })),
        'izikit-compressed-images.zip',
      );
    } finally {
      setIsZipping(false);
    }
  };

  const doneItems = items.filter((item) => item.status === 'done' && item.compressedBlob);
  const totalOriginalBytes = doneItems.reduce((sum, item) => sum + item.file.size, 0);
  const totalCompressedBytes = doneItems.reduce(
    (sum, item) => sum + (item.compressedBlob?.size ?? 0),
    0,
  );
  const totalSavings = calculateSavings(totalOriginalBytes, totalCompressedBytes);
  const previewItem = items.find((item) => item.id === previewId) ?? null;

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {items.length === 0 ? (
        <Dropzone
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple
          disabled={isCompressing}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleFilesSelected}
        />
      ) : (
        <div className="space-y-5">
          <Dropzone
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            compact
            disabled={isCompressing}
            idleLabel={dict.shared.dropzoneIdle}
            activeLabel={dict.shared.dropzoneActive}
            buttonLabel={dict.shared.dropzoneAddMore}
            formatsHint={copy.formatsHint}
            onFilesSelected={handleFilesSelected}
          />

          {/* Configuration Panel */}
          <fieldset
            disabled={isCompressing}
            className="m-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
          >
            <legend className="px-1 text-sm font-semibold text-[var(--ink-primary)]">
              {copy.settingsHeading}
            </legend>

            <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={qualityId} className="text-sm font-medium text-[var(--ink-primary)]">
                    {copy.qualityLabel}
                  </label>
                  <span className="font-data text-sm font-semibold text-[var(--accent)]">
                    {options.quality}%
                  </span>
                </div>
                <input
                  id={qualityId}
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={options.quality}
                  onChange={(e) =>
                    setOptions((prev) => ({ ...prev, quality: Number(e.target.value) }))
                  }
                  className="izikit-range h-11 w-full"
                />
                <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.qualityHint}</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={formatId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.formatLabel}
                </label>
                <select
                  id={formatId}
                  value={options.outputFormat}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      outputFormat: e.target.value as OutputFormatOption,
                    }))
                  }
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value="image/webp">{copy.formatWebp}</option>
                  <option value="original">{copy.formatOriginal}</option>
                  <option value="image/jpeg">{copy.formatJpeg}</option>
                  <option value="image/png">{copy.formatPng}</option>
                </select>
              </div>

              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <label
                  htmlFor={maxWidthId}
                  className="block text-sm font-medium text-[var(--ink-primary)]"
                >
                  {copy.maxWidthLabel}
                </label>
                <select
                  id={maxWidthId}
                  value={options.maxWidth === null ? 'original' : String(options.maxWidth)}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      maxWidth: e.target.value === 'original' ? null : Number(e.target.value),
                    }))
                  }
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value="original">{copy.maxWidthOriginal}</option>
                  <option value="2560">2560 px</option>
                  <option value="1920">1920 px (Full HD)</option>
                  <option value="1280">1280 px (Web)</option>
                  <option value="800">800 px (Ringan)</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
              <button
                type="button"
                onClick={resetAll}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium"
              >
                {dict.shared.clearAll}
              </button>

              <button
                type="button"
                onClick={handleCompress}
                className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
              >
                {hasCompletedOnce
                  ? copy.recompressButton
                  : `${copy.compressButton} ${items.length} ${copy.imagesUnit}`}
              </button>
            </div>
          </fieldset>

          {isCompressing && (
            <ProgressBanner
              title={dict.shared.processingTitle}
              detail={progress.detail}
              percent={progress.percent}
              cancelLabel={dict.shared.cancelAction}
              onCancel={() => abortRef.current?.abort()}
            />
          )}

          {/* Batch Summary Bar when done */}
          {doneItems.length > 0 && !isCompressing && (
            <div className="rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <div>
                    <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.summaryBefore}</p>
                    <p className="font-data m-0 text-sm font-semibold text-[var(--ink-primary)]">
                      {formatBytes(totalOriginalBytes)}
                    </p>
                  </div>
                  <div>
                    <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.summaryAfter}</p>
                    <p className="font-data m-0 text-sm font-semibold text-[var(--ink-primary)]">
                      {formatBytes(totalCompressedBytes)}
                    </p>
                  </div>
                  <div>
                    <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.summarySaved}</p>
                    <p className="font-data m-0 text-sm font-semibold text-[var(--success)]">
                      {totalSavings.isSmaller
                        ? `-${totalSavings.percent}% (${formatBytes(totalSavings.savedBytes)})`
                        : '0%'}
                    </p>
                  </div>
                </div>

                {doneItems.length > 1 ? (
                  <button
                    type="button"
                    onClick={handleDownloadAllZip}
                    disabled={isZipping}
                    className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    <span>{isZipping ? copy.buildingZip : copy.downloadZip}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      downloadBlob(
                        doneItems[0].compressedBlob!,
                        doneItems[0].outputFilename || doneItems[0].file.name,
                      )
                    }
                    className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    <span>{copy.downloadSingle}</span>
                  </button>
                )}
              </div>

              <SupportCard
                locale={locale}
                heading={dict.shared.supportHeading}
                body={dict.shared.supportBody}
                aboutCta={dict.shared.supportAboutCta}
                dismissLabel={dict.shared.supportDismiss}
              />
            </div>
          )}

          {/* File Queue List */}
          <ul className="m-0 list-none space-y-2.5 p-0">
            {items.map((item) => {
              const savings = item.compressedBlob
                ? calculateSavings(item.file.size, item.compressedBlob.size)
                : null;

              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={item.compressedUrl || item.originalUrl}
                      alt={item.file.name}
                      width={52}
                      height={52}
                      className="h-13 w-13 shrink-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] object-cover"
                    />
                    <div className="min-w-0 space-y-0.5">
                      <p className="m-0 truncate text-sm font-medium text-[var(--ink-primary)]">
                        {item.outputFilename || item.file.name}
                      </p>
                      <div className="font-data flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--ink-muted)]">
                        <span>{formatBytes(item.file.size)}</span>
                        {item.compressedBlob ? (
                          <>
                            <span aria-hidden="true">-&gt;</span>
                            <span className="font-semibold text-[var(--ink-primary)]">
                              {formatBytes(item.compressedBlob.size)}
                            </span>
                            {savings && savings.isSmaller ? (
                              <span className="font-semibold text-[var(--success)]">
                                (-{savings.percent}%)
                              </span>
                            ) : (
                              <span>({copy.statusKeptOriginal})</span>
                            )}
                          </>
                        ) : (
                          <span>· {copy.statusQueued}</span>
                        )}
                      </div>
                      {item.outputWidth && item.outputHeight && (
                        <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                          {item.originalWidth}x{item.originalHeight} -&gt; {item.outputWidth}x
                          {item.outputHeight} px
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {item.status === 'done' && item.compressedBlob && (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewId(item.id)}
                          className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
                        >
                          {copy.previewButton}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadBlob(
                              item.compressedBlob!,
                              item.outputFilename || item.file.name,
                            )
                          }
                          className="btn-secondary inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold"
                        >
                          <DownloadIcon className="h-4 w-4" />
                          <span>{copy.downloadSingle}</span>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={isCompressing}
                      aria-label={`${dict.shared.removeFile}: ${item.file.name}`}
                      title={dict.shared.removeFile}
                      className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--danger)]"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Before / After Comparison Modal */}
      {previewItem && previewItem.compressedUrl && previewItem.compressedBlob && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewId(null);
            }
          }}
        >
          <div className="max-h-[90dvh] w-full max-w-4xl overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3
                  id="preview-dialog-title"
                  className="font-display m-0 text-lg font-semibold text-[var(--ink-primary)]"
                >
                  {copy.previewTitle}
                </h3>
                <p className="m-0 text-xs text-[var(--ink-muted)]">{previewItem.file.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewId(null)}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium"
              >
                {copy.previewClose}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <figure className="m-0 space-y-2">
                <figcaption className="font-data flex items-center justify-between text-xs text-[var(--ink-muted)]">
                  <span className="font-semibold text-[var(--ink-primary)]">
                    {copy.previewOriginal}
                  </span>
                  <span>
                    {formatBytes(previewItem.file.size)} · {previewItem.originalWidth}x
                    {previewItem.originalHeight}
                  </span>
                </figcaption>
                <div className="flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-2">
                  <img
                    src={previewItem.originalUrl}
                    alt={`${copy.previewOriginal}: ${previewItem.file.name}`}
                    width={previewItem.originalWidth || 400}
                    height={previewItem.originalHeight || 300}
                    className="max-h-80 w-auto max-w-full rounded object-contain"
                  />
                </div>
              </figure>

              <figure className="m-0 space-y-2">
                <figcaption className="font-data flex items-center justify-between text-xs text-[var(--ink-muted)]">
                  <span className="font-semibold text-[var(--success)]">
                    {copy.previewCompressed}
                  </span>
                  <span>
                    {formatBytes(previewItem.compressedBlob.size)} · {previewItem.outputWidth}x
                    {previewItem.outputHeight}
                  </span>
                </figcaption>
                <div className="flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-2">
                  <img
                    src={previewItem.compressedUrl}
                    alt={`${copy.previewCompressed}: ${previewItem.file.name}`}
                    width={previewItem.outputWidth || 400}
                    height={previewItem.outputHeight || 300}
                    className="max-h-80 w-auto max-w-full rounded object-contain"
                  />
                </div>
              </figure>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
