import { useEffect, useId, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { SITE_CONFIG } from '@/config/site';
import { formatBytes } from '@/lib/format';
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
import { buildConversionPlan } from './convert.logic';
import type {
  ConvertWorkerRequest,
  ConvertWorkerResponse,
} from './convert.worker';

interface ConvertQueueItem {
  id: string;
  file: File;
  mime: SupportedImageMime;
  previewUrl: string;
  convertedBlob?: Blob;
  outputFilename?: string;
  outputMime?: SupportedImageMime;
  dimensions?: { width: number; height: number };
}

interface ConvertImageToolProps {
  locale: Locale;
}

function createConvertWorker(): Worker {
  return new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' });
}

export default function ConvertImageTool({ locale }: ConvertImageToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.convertImage;

  const targetId = useId();
  const qualityId = useId();
  const bgId = useId();

  const [items, setItems] = useState<ConvertQueueItem[]>([]);
  const [targetFormat, setTargetFormat] = useState<SupportedImageMime>('image/webp');
  const [quality, setQuality] = useState(90);
  const [jpegBackground, setJpegBackground] = useState('#FFFFFF');
  const [errors, setErrors] = useState<string[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });

  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<ConvertQueueItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const handleFilesSelected = async (incoming: File[]) => {
    setErrors([]);
    const nextErrors: string[] = [];
    const accepted: ConvertQueueItem[] = [];

    for (const file of incoming) {
      if (file.size > SITE_CONFIG.limits.imageSoftMaxBytes) {
        nextErrors.push(`${copy.errors.tooLarge} ${file.name} (${formatBytes(file.size)})`);
        continue;
      }

      const header = await readFileHeaderBytes(file, 32);
      const mime = detectImageMimeFromBytes(header);
      if (!mime) {
        nextErrors.push(`${copy.errors.notImage} ${file.name}`);
        continue;
      }

      accepted.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        mime,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
    }
    if (accepted.length > 0) {
      setItems((prev) => [...prev, ...accepted]);
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const resetAll = () => {
    abortRef.current?.abort();
    for (const item of items) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setItems([]);
    setErrors([]);
    setIsConverting(false);
    setProgress({ percent: 0, detail: '' });
  };

  const handleConvert = async () => {
    if (items.length === 0) return;

    setErrors([]);
    setIsConverting(true);
    setProgress({ percent: 5, detail: `${copy.progressConverting} 1/${items.length}...` });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const jobs = buildConversionPlan(
        items.map((item) => ({ id: item.id, name: item.file.name, mime: item.mime })),
        { targetFormat, quality, jpegBackground },
      );

      const jobById = new Map(jobs.map((job) => [job.id, job]));
      const prepared = await Promise.all(
        items.map(async (item) => ({
          job: jobById.get(item.id)!,
          buffer: await item.file.arrayBuffer(),
        })),
      );
      const transferables = prepared.map((p) => p.buffer);

      const response = await runWorkerTask<ConvertWorkerRequest, ConvertWorkerResponse>(
        createConvertWorker,
        { items: prepared },
        {
          transfer: transferables,
          signal: controller.signal,
          onProgress: (evt) => {
            const detail = evt.label
              ? `${copy.progressConverting} ${evt.current ?? ''}/${evt.total ?? items.length}: ${evt.label}`
              : copy.progressConverting;
            setProgress({ percent: evt.percent, detail });
          },
        },
      );

      const resultById = new Map(response.results.map((r) => [r.id, r]));
      setItems((prev) =>
        prev.map((item) => {
          const out = resultById.get(item.id);
          if (!out) return item;
          return {
            ...item,
            convertedBlob: new Blob([out.buffer], { type: out.outputMime }),
            outputFilename: out.outputFilename,
            outputMime: out.outputMime,
            dimensions: { width: out.width, height: out.height },
          };
        }),
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrors([copy.errors.generic]);
    } finally {
      setIsConverting(false);
      abortRef.current = null;
    }
  };

  const handleDownloadZip = async () => {
    const done = items.filter((item) => item.convertedBlob && item.outputFilename);
    if (done.length === 0) return;

    setIsZipping(true);
    try {
      const targetExt = mimeToExtension(targetFormat);
      await downloadAsZip(
        done.map((item) => ({
          filename: item.outputFilename!,
          blob: item.convertedBlob!,
        })),
        `izikit-converted-${targetExt}.zip`,
      );
    } finally {
      setIsZipping(false);
    }
  };

  const doneItems = items.filter((item) => item.convertedBlob);
  const targetExtUpper = mimeToExtension(targetFormat).toUpperCase();

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
          disabled={isConverting}
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
            disabled={isConverting}
            idleLabel={dict.shared.dropzoneIdle}
            activeLabel={dict.shared.dropzoneActive}
            buttonLabel={dict.shared.dropzoneAddMore}
            formatsHint={copy.formatsHint}
            onFilesSelected={handleFilesSelected}
          />

          {/* Settings Panel */}
          <fieldset
            disabled={isConverting}
            className="m-0 space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
          >
            <legend className="px-1 text-sm font-semibold text-[var(--ink-primary)]">
              {copy.settingsHeading}
            </legend>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor={targetId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.targetFormatLabel}
                </label>
                <select
                  id={targetId}
                  value={targetFormat}
                  onChange={(e) => setTargetFormat(e.target.value as SupportedImageMime)}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value="image/webp">WebP (.webp)</option>
                  <option value="image/jpeg">JPEG (.jpg)</option>
                  <option value="image/png">PNG (.png)</option>
                </select>
              </div>

              {targetFormat !== 'image/png' && (
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

              {targetFormat === 'image/jpeg' && (
                <div className="space-y-1.5">
                  <label htmlFor={bgId} className="block text-sm font-medium text-[var(--ink-primary)]">
                    {copy.backgroundLabel}
                  </label>
                  <select
                    id={bgId}
                    value={jpegBackground}
                    onChange={(e) => setJpegBackground(e.target.value)}
                    className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                  >
                    <option value="#FFFFFF">{copy.bgWhite}</option>
                    <option value="#000000">{copy.bgBlack}</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
              <button
                type="button"
                onClick={resetAll}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium"
              >
                {dict.shared.clearAll}
              </button>

              <button
                type="button"
                onClick={handleConvert}
                className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
              >
                {copy.convertButton} {items.length} -&gt; {targetExtUpper}
              </button>
            </div>
          </fieldset>

          {isConverting && (
            <ProgressBanner
              title={dict.shared.processingTitle}
              detail={progress.detail}
              percent={progress.percent}
              cancelLabel={dict.shared.cancelAction}
              onCancel={() => abortRef.current?.abort()}
            />
          )}

          {doneItems.length > 0 && !isConverting && (
            <div className="rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                    {copy.resultReadyTitle} ({doneItems.length})
                  </h3>
                </div>

                {doneItems.length > 1 ? (
                  <button
                    type="button"
                    onClick={handleDownloadZip}
                    disabled={isZipping}
                    className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    <span>{isZipping ? dict.compressImage.buildingZip : copy.downloadZip}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      downloadBlob(doneItems[0].convertedBlob!, doneItems[0].outputFilename!)
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

          {/* File Queue */}
          <ul className="m-0 list-none space-y-2.5 p-0">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    width={48}
                    height={48}
                    className="h-12 w-12 shrink-0 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] object-cover"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <p className="m-0 truncate text-sm font-medium text-[var(--ink-primary)]">
                      {item.outputFilename || item.file.name}
                    </p>
                    <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                      {mimeToExtension(item.mime).toUpperCase()} ({formatBytes(item.file.size)})
                      {item.convertedBlob && item.outputMime
                        ? ` -> ${mimeToExtension(item.outputMime).toUpperCase()} (${formatBytes(item.convertedBlob.size)})`
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {item.convertedBlob && item.outputFilename && (
                    <button
                      type="button"
                      onClick={() => downloadBlob(item.convertedBlob!, item.outputFilename!)}
                      className="btn-secondary inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold"
                    >
                      <DownloadIcon className="h-4 w-4" />
                      <span>{copy.downloadSingle}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={isConverting}
                    aria-label={`${dict.shared.removeFile}: ${item.file.name}`}
                    title={dict.shared.removeFile}
                    className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--danger)]"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
