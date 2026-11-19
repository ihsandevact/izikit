import { useEffect, useId, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { SITE_CONFIG } from '@/config/site';
import { formatBytes, sanitizeFilename } from '@/lib/format';
import { createClientId } from '@/lib/id';
import {
  detectImageMimeFromBytes,
  readFileHeaderBytes,
  type SupportedImageMime,
} from '@/lib/file-validation';
import { runWorkerTask } from '@/lib/worker-client';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  GripIcon,
  TrashIcon,
} from '@/components/shared/icons';
import type {
  ImageToPdfOptions,
  OrientationOption,
  PaperSizeOption,
} from './layout';
import type {
  ImageToPdfWorkerRequest,
  ImageToPdfWorkerResponse,
} from './image-to-pdf.worker';

interface ImagePdfQueueItem {
  id: string;
  file: File;
  mime: SupportedImageMime;
  previewUrl: string;
}

interface GeneratedPdf {
  blob: Blob;
  filename: string;
  pageCount: number;
}

interface ImageToPdfToolProps {
  locale: Locale;
}

function createImageToPdfWorker(): Worker {
  return new Worker(new URL('./image-to-pdf.worker.ts', import.meta.url), { type: 'module' });
}

export default function ImageToPdfTool({ locale }: ImageToPdfToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.imageToPdf;

  const paperId = useId();
  const orientId = useId();
  const marginId = useId();
  const outputId = useId();

  const [items, setItems] = useState<ImagePdfQueueItem[]>([]);
  const [options, setOptions] = useState<ImageToPdfOptions>({
    paperSize: 'a4',
    orientation: 'auto',
    marginPt: 24,
  });
  const [outputName, setOutputName] = useState(copy.outputNamePlaceholder);
  const [errors, setErrors] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [result, setResult] = useState<GeneratedPdf | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<ImagePdfQueueItem[]>([]);
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
    setResult(null);

    const nextErrors: string[] = [];
    const accepted: ImagePdfQueueItem[] = [];

    for (const file of incoming) {
      if (file.size > SITE_CONFIG.limits.imageSoftMaxBytes) {
        nextErrors.push(`${copy.errors.tooLarge} ${file.name} (${formatBytes(file.size)})`);
        continue;
      }

      try {
        const header = await readFileHeaderBytes(file, 32);
        const mime = detectImageMimeFromBytes(header);
        if (!mime) {
          nextErrors.push(`${copy.errors.notImage} ${file.name}`);
          continue;
        }

        accepted.push({
          id: `${file.name}-${file.size}-${createClientId()}`,
          file,
          mime,
          previewUrl: URL.createObjectURL(file),
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

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setResult(null);
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const reorderByIds = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setResult(null);
    setItems((prev) => {
      const fromIndex = prev.findIndex((item) => item.id === sourceId);
      const toIndex = prev.findIndex((item) => item.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const removeItem = (id: string) => {
    setResult(null);
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const resetAll = () => {
    abortRef.current?.abort();
    for (const item of items) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setItems([]);
    setErrors([]);
    setResult(null);
    setIsBuilding(false);
    setProgress({ percent: 0, detail: '' });
  };

  const handleGenerate = async () => {
    if (items.length === 0) return;

    setErrors([]);
    setResult(null);
    setIsBuilding(true);
    setProgress({ percent: 5, detail: copy.progressPreparing });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const prepared = await Promise.all(
        items.map(async (item) => ({
          name: item.file.name,
          mime: item.mime,
          buffer: await item.file.arrayBuffer(),
        })),
      );
      const transferables = prepared.map((entry) => entry.buffer);

      const response = await runWorkerTask<ImageToPdfWorkerRequest, ImageToPdfWorkerResponse>(
        createImageToPdfWorker,
        { items: prepared, options },
        {
          transfer: transferables,
          signal: controller.signal,
          onProgress: (evt) => {
            const detail = evt.label
              ? `${copy.progressEmbedding} ${evt.current ?? ''}/${evt.total ?? items.length}: ${evt.label}`
              : copy.progressPreparing;
            setProgress({ percent: evt.percent, detail });
          },
        },
      );

      const finalFilename = sanitizeFilename(outputName, copy.outputNamePlaceholder, '.pdf');
      setResult({
        blob: new Blob([response.buffer], { type: 'application/pdf' }),
        filename: finalFilename,
        pageCount: response.pageCount,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const code = (err as Error & { code?: string }).code;
      const errMessage = err instanceof Error ? err.message : '';
      if (code === 'CORRUPT_IMAGE') {
        setErrors([`${copy.errors.corruptImage} ${errMessage}`]);
      } else {
        setErrors([copy.errors.generic]);
      }
    } finally {
      setIsBuilding(false);
      abortRef.current = null;
    }
  };

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
          disabled={isBuilding}
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
            disabled={isBuilding}
            idleLabel={dict.shared.dropzoneIdle}
            activeLabel={dict.shared.dropzoneActive}
            buttonLabel={dict.shared.dropzoneAddMore}
            formatsHint={copy.formatsHint}
            onFilesSelected={handleFilesSelected}
          />

          {/* Image Page Order List */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                  {copy.listHeading} ({items.length})
                </h2>
                <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.listHint}</p>
              </div>
              <button
                type="button"
                onClick={resetAll}
                disabled={isBuilding}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
              >
                {dict.shared.clearAll}
              </button>
            </div>

            <ol className="m-0 list-none space-y-2 p-0">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  draggable={!isBuilding}
                  onDragStart={() => setDraggedId(item.id)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggedId && draggedId !== item.id) {
                      reorderByIds(draggedId, item.id);
                    }
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  className={`flex flex-col gap-3 rounded-lg border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                    draggedId === item.id
                      ? 'border-[var(--accent)] bg-[var(--accent-tint)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-paper)]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="hidden text-[var(--ink-muted)] sm:inline-flex">
                      <GripIcon className="h-4 w-4" />
                    </span>
                    <span className="font-data inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--ink-primary)]">
                      {index + 1}
                    </span>
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      width={44}
                      height={44}
                      className="h-11 w-11 shrink-0 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] object-cover"
                    />
                    <div className="min-w-0">
                      <p className="m-0 truncate text-sm font-medium text-[var(--ink-primary)]">
                        {item.file.name}
                      </p>
                      <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                        {formatBytes(item.file.size)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveItem(index, -1)}
                      disabled={isBuilding || index === 0}
                      aria-label={`${dict.mergePdf.moveUp}: ${item.file.name}`}
                      title={dict.mergePdf.moveUp}
                      className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg"
                    >
                      <ArrowUpIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(index, 1)}
                      disabled={isBuilding || index === items.length - 1}
                      aria-label={`${dict.mergePdf.moveDown}: ${item.file.name}`}
                      title={dict.mergePdf.moveDown}
                      className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg"
                    >
                      <ArrowDownIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={isBuilding}
                      aria-label={`${dict.shared.removeFile}: ${item.file.name}`}
                      title={dict.shared.removeFile}
                      className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--danger)]"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Paper & Page Layout Settings */}
          <fieldset
            disabled={isBuilding}
            className="m-0 space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
          >
            <legend className="px-1 text-sm font-semibold text-[var(--ink-primary)]">
              {copy.settingsHeading}
            </legend>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor={paperId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.paperSizeLabel}
                </label>
                <select
                  id={paperId}
                  value={options.paperSize}
                  onChange={(e) => {
                    setResult(null);
                    setOptions((prev) => ({
                      ...prev,
                      paperSize: e.target.value as PaperSizeOption,
                    }));
                  }}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value="a4">{copy.paperA4}</option>
                  <option value="letter">{copy.paperLetter}</option>
                  <option value="fit">{copy.paperFit}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={orientId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.orientationLabel}
                </label>
                <select
                  id={orientId}
                  value={options.orientation}
                  disabled={options.paperSize === 'fit'}
                  onChange={(e) => {
                    setResult(null);
                    setOptions((prev) => ({
                      ...prev,
                      orientation: e.target.value as OrientationOption,
                    }));
                  }}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)] disabled:opacity-50"
                >
                  <option value="auto">{copy.orientationAuto}</option>
                  <option value="portrait">{copy.orientationPortrait}</option>
                  <option value="landscape">{copy.orientationLandscape}</option>
                </select>
              </div>

              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <label htmlFor={marginId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.marginLabel}
                </label>
                <select
                  id={marginId}
                  value={String(options.marginPt)}
                  onChange={(e) => {
                    setResult(null);
                    setOptions((prev) => ({ ...prev, marginPt: Number(e.target.value) }));
                  }}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value="0">{copy.marginNone}</option>
                  <option value="24">{copy.marginSmall}</option>
                  <option value="48">{copy.marginLarge}</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <label htmlFor={outputId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.outputNameLabel}
                </label>
                <input
                  id={outputId}
                  type="text"
                  value={outputName}
                  onChange={(e) => setOutputName(e.target.value)}
                  placeholder={copy.outputNamePlaceholder}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                />
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isBuilding || items.length === 0}
                className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
              >
                {copy.convertButton} ({items.length})
              </button>
            </div>
          </fieldset>
        </div>
      )}

      {isBuilding && (
        <ProgressBanner
          title={dict.shared.processingTitle}
          detail={progress.detail}
          percent={progress.percent}
          cancelLabel={dict.shared.cancelAction}
          onCancel={() => abortRef.current?.abort()}
        />
      )}

      {result && !isBuilding && (
        <div className="rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                {copy.resultReadyTitle}
              </h3>
              <p className="font-data m-0 text-sm text-[var(--ink-muted)]">
                {result.filename} · {result.pageCount} {dict.mergePdf.pagesUnit} ·{' '}
                {formatBytes(result.blob.size)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => downloadBlob(result.blob, result.filename)}
                className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold"
              >
                <DownloadIcon className="h-4 w-4" />
                <span>{copy.downloadButton}</span>
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium"
              >
                {dict.shared.startOver}
              </button>
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
      )}
    </div>
  );
}
