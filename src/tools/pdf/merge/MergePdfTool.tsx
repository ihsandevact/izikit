import { useEffect, useId, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { SITE_CONFIG } from '@/config/site';
import { formatBytes, sanitizeFilename } from '@/lib/format';
import { hasPdfMagicBytes, readFileHeaderBytes } from '@/lib/file-validation';
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
  InspectWorkerResponse,
  MergeWorkerRequest,
  MergeWorkerResponse,
} from './merge.worker';

interface PdfQueueItem {
  id: string;
  file: File;
  pageCount: number | null;
  inspecting: boolean;
}

interface MergedOutput {
  blob: Blob;
  filename: string;
  totalPages: number;
  fileCount: number;
}

interface MergePdfToolProps {
  locale: Locale;
}

function createMergeWorker(): Worker {
  return new Worker(new URL('./merge.worker.ts', import.meta.url), { type: 'module' });
}

export default function MergePdfTool({ locale }: MergePdfToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.mergePdf;
  const outputInputId = useId();

  const [items, setItems] = useState<PdfQueueItem[]>([]);
  const [outputName, setOutputName] = useState(copy.outputNamePlaceholder);
  const [errors, setErrors] = useState<string[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [result, setResult] = useState<MergedOutput | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleFilesSelected = async (incomingFiles: File[]) => {
    setErrors([]);
    setResult(null);

    const nextErrors: string[] = [];
    const accepted: PdfQueueItem[] = [];

    for (const file of incomingFiles) {
      if (file.size > SITE_CONFIG.limits.pdfSoftMaxBytes) {
        nextErrors.push(`${copy.errors.tooLarge} ${file.name} (${formatBytes(file.size)})`);
        continue;
      }

      const header = await readFileHeaderBytes(file, 1024);
      if (!hasPdfMagicBytes(header)) {
        nextErrors.push(`${copy.errors.notPdf} ${file.name}`);
        continue;
      }

      accepted.push({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        pageCount: null,
        inspecting: true,
      });
    }

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
    }

    if (accepted.length === 0) return;

    setItems((prev) => [...prev, ...accepted]);

    // Inspect page counts & encryption off the main thread
    for (const entry of accepted) {
      try {
        const buffer = await entry.file.arrayBuffer();
        const inspected = await runWorkerTask<MergeWorkerRequest, InspectWorkerResponse>(
          createMergeWorker,
          { action: 'inspect', fileName: entry.file.name, buffer },
          { transfer: [buffer] },
        );

        setItems((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? { ...item, pageCount: inspected.pageCount, inspecting: false }
              : item,
          ),
        );
      } catch (err) {
        const code = (err as Error & { code?: string }).code;
        setItems((prev) => prev.filter((item) => item.id !== entry.id));
        if (code === 'ENCRYPTED') {
          setErrors((prev) => [...prev, `${copy.errors.encrypted} ${entry.file.name}`]);
        } else {
          setErrors((prev) => [...prev, `${copy.errors.corrupt} ${entry.file.name}`]);
        }
      }
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
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const resetAll = () => {
    abortRef.current?.abort();
    setItems([]);
    setErrors([]);
    setResult(null);
    setIsMerging(false);
    setProgress({ percent: 0, detail: '' });
  };

  const handleMerge = async () => {
    if (items.length < 2) {
      setErrors([copy.errors.needTwoFiles]);
      return;
    }

    setErrors([]);
    setResult(null);
    setIsMerging(true);
    setProgress({ percent: 5, detail: copy.progressReading });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const buffers = await Promise.all(
        items.map(async (item) => ({
          name: item.file.name,
          buffer: await item.file.arrayBuffer(),
        })),
      );

      const transferables = buffers.map((item) => item.buffer);

      const merged = await runWorkerTask<MergeWorkerRequest, MergeWorkerResponse>(
        createMergeWorker,
        { action: 'merge', items: buffers },
        {
          transfer: transferables,
          signal: controller.signal,
          onProgress: (evt) => {
            const detail =
              evt.percent >= 90
                ? copy.progressFinalizing
                : evt.label
                  ? `${copy.progressMerging} ${evt.current ?? ''}/${evt.total ?? items.length}: ${evt.label}`
                  : copy.progressReading;
            setProgress({ percent: evt.percent, detail });
          },
        },
      );

      const finalFilename = sanitizeFilename(
        outputName,
        copy.outputNamePlaceholder,
        '.pdf',
      );
      const blob = new Blob([merged.buffer], { type: 'application/pdf' });

      setResult({
        blob,
        filename: finalFilename,
        totalPages: merged.totalPages,
        fileCount: merged.fileCount,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const code = (err as Error & { code?: string }).code;
      const errMessage = err instanceof Error ? err.message : '';
      if (code === 'ENCRYPTED') {
        setErrors([`${copy.errors.encrypted} ${errMessage}`]);
      } else if (code === 'CORRUPT') {
        setErrors([`${copy.errors.corrupt} ${errMessage}`]);
      } else {
        setErrors([copy.errors.generic]);
      }
    } finally {
      setIsMerging(false);
      abortRef.current = null;
    }
  };

  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const totalPages = items.reduce((sum, item) => sum + (item.pageCount ?? 0), 0);
  const anyInspecting = items.some((item) => item.inspecting);

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {items.length === 0 ? (
        <Dropzone
          accept=".pdf,application/pdf"
          multiple
          disabled={isMerging}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleFilesSelected}
        />
      ) : (
        <div className="space-y-5">
          <Dropzone
            accept=".pdf,application/pdf"
            multiple
            compact
            disabled={isMerging}
            idleLabel={dict.shared.dropzoneIdle}
            activeLabel={dict.shared.dropzoneActive}
            buttonLabel={dict.shared.dropzoneAddMore}
            formatsHint={copy.formatsHint}
            onFilesSelected={handleFilesSelected}
          />

          <div className="space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                  {copy.fileListHeading} ({items.length})
                </h2>
                <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.fileListHint}</p>
              </div>
              <button
                type="button"
                onClick={resetAll}
                disabled={isMerging}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
              >
                {dict.shared.clearAll}
              </button>
            </div>

            <ol className="m-0 list-none space-y-2 p-0">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  draggable={!isMerging}
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
                    <span
                      aria-hidden="true"
                      className="hidden text-[var(--ink-muted)] sm:inline-flex"
                    >
                      <GripIcon className="h-4 w-4" />
                    </span>
                    <span className="font-data inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--ink-primary)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="m-0 truncate text-sm font-medium text-[var(--ink-primary)]">
                        {item.file.name}
                      </p>
                      <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                        {formatBytes(item.file.size)} ·{' '}
                        {item.inspecting
                          ? copy.inspectingPages
                          : `${item.pageCount ?? 0} ${copy.pagesUnit}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveItem(index, -1)}
                      disabled={isMerging || index === 0}
                      aria-label={`${copy.moveUp}: ${item.file.name}`}
                      title={copy.moveUp}
                      className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg"
                    >
                      <ArrowUpIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(index, 1)}
                      disabled={isMerging || index === items.length - 1}
                      aria-label={`${copy.moveDown}: ${item.file.name}`}
                      title={copy.moveDown}
                      className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg"
                    >
                      <ArrowDownIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={isMerging}
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

          {items.length === 1 && (
            <p className="m-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-4 py-3 text-sm text-[var(--ink-muted)]">
              {copy.needMoreFilesHint}
            </p>
          )}

          <div className="grid gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label
                htmlFor={outputInputId}
                className="block text-sm font-medium text-[var(--ink-primary)]"
              >
                {copy.outputNameLabel}
              </label>
              <input
                id={outputInputId}
                type="text"
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
                placeholder={copy.outputNamePlaceholder}
                disabled={isMerging}
                className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
              />
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {copy.totalSummary}: {items.length} {copy.filesUnit} · {totalPages}{' '}
                {copy.pagesUnit} · {formatBytes(totalBytes)}
              </p>
            </div>

            <button
              type="button"
              onClick={handleMerge}
              disabled={isMerging || anyInspecting || items.length < 2}
              className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
            >
              {copy.mergeButton} {items.length} {copy.filesUnit}
            </button>
          </div>
        </div>
      )}

      {isMerging && (
        <ProgressBanner
          title={dict.shared.processingTitle}
          detail={progress.detail}
          percent={progress.percent}
          cancelLabel={dict.shared.cancelAction}
          onCancel={() => abortRef.current?.abort()}
        />
      )}

      {result && (
        <div className="rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                {copy.resultReadyTitle}
              </h3>
              <p className="font-data m-0 text-sm text-[var(--ink-muted)]">
                {result.filename} · {result.totalPages} {copy.pagesUnit} ·{' '}
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
