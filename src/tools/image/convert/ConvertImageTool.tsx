import { useEffect, useId, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes } from '@/lib/format';
import {
  mimeToExtension,
  validateConvertibleImageFiles,
  validateHeicFiles,
  type ConvertibleImageMime,
  type ConvertibleInputMime,
} from '@/lib/file-validation';
import { runWorkerTask } from '@/lib/worker-client';
import { downloadAsZip, downloadBlob } from '@/lib/download';
import { useFileHandoff } from '@/lib/use-file-handoff';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import HandoffChainBar from '@/components/shared/HandoffChainBar';
import HandoffNotice from '@/components/shared/HandoffNotice';
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
  mime: ConvertibleInputMime;
  previewUrl: string | null;
  convertedBlob?: Blob;
  outputFilename?: string;
  outputMime?: ConvertibleImageMime;
  dimensions?: { width: number; height: number };
}

interface ConvertImageToolProps {
  locale: Locale;
  mode?: 'all' | 'heic';
  defaultTargetFormat?: ConvertibleImageMime;
}

function createConvertWorker(): Worker {
  return new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' });
}

export default function ConvertImageTool({
  locale,
  mode = 'all',
  defaultTargetFormat,
}: ConvertImageToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.convertImage;
  const isHeicMode = mode === 'heic';

  const targetId = useId();
  const qualityId = useId();
  const bgId = useId();

  const [items, setItems] = useState<ConvertQueueItem[]>([]);
  const [targetFormat, setTargetFormat] = useState<ConvertibleImageMime>(
    defaultTargetFormat ?? (isHeicMode ? 'image/jpeg' : 'image/webp'),
  );

  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('format')?.toLowerCase();
      if (param === 'jpg' || param === 'jpeg') setTargetFormat('image/jpeg');
      else if (param === 'png') setTargetFormat('image/png');
      else if (param === 'webp') setTargetFormat('image/webp');
      else if (param === 'avif') setTargetFormat('image/avif');
    } catch {
      // Ignore URL parse errors
    }
  }, []);
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
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const handleFilesSelected = async (incoming: File[]) => {
    setErrors([]);
    const validator = isHeicMode ? validateHeicFiles : validateConvertibleImageFiles;
    const errorMessages = isHeicMode
      ? { ...copy.errors, notImage: copy.errors.notHeic }
      : copy.errors;
    const { accepted, errors: nextErrors } = await validator(incoming, errorMessages);

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
    }
    if (accepted.length > 0) {
      const nextItems: ConvertQueueItem[] = accepted.map(({ id, file, mime }) => ({
        id,
        file,
        mime,
        previewUrl: mime === 'image/heic' ? null : URL.createObjectURL(file),
      }));
      setItems((prev) => [...prev, ...nextItems]);
    }
  };

  const { handoffSource, handoffMeta, dismissHandoffNotice } = useFileHandoff((incomingFiles) =>
    handleFilesSelected(incomingFiles),
  );

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const resetAll = () => {
    abortRef.current?.abort();
    for (const item of items) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
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

      const hasHeic = items.some((item) => item.mime === 'image/heic');
      const heicMod = hasHeic ? await import('heic-to') : null;

      const jobById = new Map(jobs.map((job) => [job.id, job]));
      const prepared = [];
      for (let i = 0; i < items.length; i += 1) {
        if (controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const item = items[i];
        const job = jobById.get(item.id)!;
        if (item.mime === 'image/heic' && heicMod) {
          setProgress({
            percent: Math.round(((i + 0.3) / items.length) * 45),
            detail: `${copy.progressDecodingHeic} ${i + 1}/${items.length}: ${item.file.name}`,
          });
          const decodedPng = await heicMod.heicTo({
            blob: item.file,
            type: 'image/png',
          });
          prepared.push({
            job: { ...job, inputMime: 'image/png' as const },
            buffer: await decodedPng.arrayBuffer(),
          });
        } else {
          prepared.push({
            job,
            buffer: await item.file.arrayBuffer(),
          });
        }
      }
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
            const scaledPercent = hasHeic ? 45 + Math.round(evt.percent * 0.55) : evt.percent;
            setProgress({ percent: scaledPercent, detail });
          },
        },
      );

      const resultById = new Map(response.results.map((r) => [r.id, r]));
      setItems((prev) =>
        prev.map((item) => {
          const out = resultById.get(item.id);
          if (!out) return item;
          const convertedBlob = new Blob([out.buffer], { type: out.outputMime });
          let nextPreviewUrl = item.previewUrl;
          if (!nextPreviewUrl && out.outputMime !== 'image/avif') {
            nextPreviewUrl = URL.createObjectURL(convertedBlob);
          }
          return {
            ...item,
            previewUrl: nextPreviewUrl,
            convertedBlob,
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

  const handleDownloadAllSingle = () => {
    const done = items.filter((item) => item.convertedBlob && item.outputFilename);
    done.forEach((item, idx) => {
      window.setTimeout(() => {
        downloadBlob(item.convertedBlob!, item.outputFilename!);
      }, idx * 140);
    });
  };

  const doneItems = items.filter((item) => item.convertedBlob);
  const targetExtUpper = mimeToExtension(targetFormat).toUpperCase();
  const acceptAttr = isHeicMode
    ? 'image/heic,image/heif,.heic,.heif'
    : 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif';
  const formatsHint = isHeicMode ? copy.heicFormatsHint : copy.formatsHint;

  return (
    <div className="space-y-5">
      <HandoffNotice
        sourceRoute={handoffSource}
        locale={locale}
        onDismiss={dismissHandoffNotice}
      />
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {items.length === 0 ? (
        <Dropzone
          accept={acceptAttr}
          multiple
          disabled={isConverting}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={formatsHint}
          onFilesSelected={handleFilesSelected}
        />
      ) : (
        <div className="space-y-5">
          <Dropzone
            accept={acceptAttr}
            multiple
            compact
            disabled={isConverting}
            idleLabel={dict.shared.dropzoneIdle}
            activeLabel={dict.shared.dropzoneActive}
            buttonLabel={dict.shared.dropzoneAddMore}
            formatsHint={formatsHint}
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

            <div
              className={`grid gap-4 ${
                targetFormat === 'image/png'
                  ? 'sm:grid-cols-1 max-w-sm'
                  : targetFormat === 'image/webp' || targetFormat === 'image/avif'
                    ? 'sm:grid-cols-2'
                    : 'sm:grid-cols-2 lg:grid-cols-3'
              }`}
            >
              <div className="space-y-1.5">
                <label htmlFor={targetId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.targetFormatLabel}
                </label>
                <select
                  id={targetId}
                  value={targetFormat}
                  onChange={(e) => setTargetFormat(e.target.value as ConvertibleImageMime)}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value="image/webp">WebP (.webp)</option>
                  <option value="image/avif">AVIF (.avif)</option>
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
                className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-lg px-6 text-sm font-semibold sm:w-auto"
              >
                {copy.convertButton} {items.length} → {targetExtUpper}
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

                <div className="flex flex-wrap items-center gap-2">
                  {doneItems.length > 1 ? (
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
                        onClick={() =>
                          downloadBlob(doneItems[0].convertedBlob!, doneItems[0].outputFilename!)
                        }
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

              <HandoffChainBar
                locale={locale}
                sourceRoute={isHeicMode ? '/heic-to-jpg' : '/convert-image'}
                originSource={handoffSource}
                originMeta={handoffMeta}
                getFiles={() =>
                  doneItems.map(
                    (item) =>
                      new File(
                        [item.convertedBlob!],
                        item.outputFilename || item.file.name,
                        { type: item.outputMime || item.convertedBlob!.type || 'image/jpeg' },
                      ),
                  )
                }
                actions={[
                  {
                    label: locale === 'id' ? 'Kompres < 200 KB (JPG)' : 'Compress < 200 KB (JPG)',
                    href: '/compress-image?preset=200kb',
                  },
                  {
                    label: locale === 'id' ? 'Gabung ke PDF' : 'Image to PDF',
                    href: '/image-to-pdf',
                  },
                ]}
              />

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
                  {item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      width={56}
                      height={56}
                      className="h-14 w-14 shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] object-cover"
                    />
                  ) : (
                    <span className="font-data inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] text-[11px] font-bold text-[var(--ink-muted)]">
                      {mimeToExtension(item.mime).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <p className="m-0 truncate text-sm font-medium text-[var(--ink-primary)]">
                      {item.outputFilename || item.file.name}
                    </p>
                    <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                      {mimeToExtension(item.mime).toUpperCase()} ({formatBytes(item.file.size)})
                      {item.convertedBlob && item.outputMime
                        ? ` → ${mimeToExtension(item.outputMime).toUpperCase()} (${formatBytes(item.convertedBlob.size)})`
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
