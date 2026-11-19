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
  TrashIcon,
} from '@/components/shared/icons';
import {
  normalizeRotation,
  type PdfPageMetadata,
  type RotationAngle,
} from './plan';
import type {
  RotateApplyResponse,
  RotateInspectResponse,
  RotateReorderWorkerRequest,
} from './rotate-reorder.worker';

interface EditablePageCard {
  id: string;
  sourcePageIndex: number;
  width: number;
  height: number;
  initialRotation: RotationAngle;
  deltaRotation: RotationAngle;
  thumbnailUrl: string | null;
}

interface SavedPdfResult {
  blob: Blob;
  filename: string;
  pageCount: number;
}

interface RotateReorderPdfToolProps {
  locale: Locale;
}

function createRotateWorker(): Worker {
  return new Worker(new URL('./rotate-reorder.worker.ts', import.meta.url), { type: 'module' });
}

export default function RotateReorderPdfTool({ locale }: RotateReorderPdfToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.rotateReorderPdf;
  const outputId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [originalPages, setOriginalPages] = useState<PdfPageMetadata[]>([]);
  const [pages, setPages] = useState<EditablePageCard[]>([]);
  const [inspecting, setInspecting] = useState(false);
  const [outputName, setOutputName] = useState(copy.outputNamePlaceholder);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [result, setResult] = useState<SavedPdfResult | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const workerAbortRef = useRef<AbortController | null>(null);
  const thumbAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      workerAbortRef.current?.abort();
      thumbAbortRef.current?.abort();
    };
  }, []);

  const handleFileSelected = async (incoming: File[]) => {
    const selected = incoming[0];
    if (!selected) return;

    thumbAbortRef.current?.abort();
    setErrors([]);
    setResult(null);

    if (selected.size > SITE_CONFIG.limits.pdfSoftMaxBytes) {
      setErrors([`${copy.errors.tooLarge} ${selected.name} (${formatBytes(selected.size)})`]);
      return;
    }

    const header = await readFileHeaderBytes(selected, 1024);
    if (!hasPdfMagicBytes(header)) {
      setErrors([`${copy.errors.notPdf} ${selected.name}`]);
      return;
    }

    setFile(selected);
    setInspecting(true);
    setPages([]);

    const stem = selected.name.replace(/\.pdf$/i, '');
    setOutputName(`${stem}-organized.pdf`);

    try {
      const rawBuffer = await selected.arrayBuffer();
      const workerBuffer = rawBuffer.slice(0);
      const inspected = await runWorkerTask<RotateReorderWorkerRequest, RotateInspectResponse>(
        createRotateWorker,
        { action: 'inspect', buffer: workerBuffer },
        { transfer: [workerBuffer] },
      );

      setOriginalPages(inspected.pages);
      setPages(
        inspected.pages.map((meta) => ({
          id: `page-${meta.pageIndex}`,
          sourcePageIndex: meta.pageIndex,
          width: meta.width,
          height: meta.height,
          initialRotation: meta.initialRotation,
          deltaRotation: 0,
          thumbnailUrl: null,
        })),
      );
      setInspecting(false);

      // Lazily render visual thumbnails progressively using pdfjs-dist
      const thumbController = new AbortController();
      thumbAbortRef.current = thumbController;
      void import('./thumbnails')
        .then(({ renderPdfThumbnails }) =>
          renderPdfThumbnails(
            rawBuffer,
            (pageIndex, dataUrl) => {
              setPages((prev) =>
                prev.map((card) =>
                  card.sourcePageIndex === pageIndex ? { ...card, thumbnailUrl: dataUrl } : card,
                ),
              );
            },
            thumbController.signal,
          ),
        )
        .catch(() => {
          // Graceful fallback: cards remain fully usable with page number & dimension markers
        });
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      setFile(null);
      setInspecting(false);
      if (code === 'ENCRYPTED') {
        setErrors([`${copy.errors.encrypted} ${selected.name}`]);
      } else {
        setErrors([`${copy.errors.corrupt} ${selected.name}`]);
      }
    }
  };

  const rotatePage = (id: string, delta: number) => {
    setResult(null);
    setPages((prev) =>
      prev.map((card) =>
        card.id === id
          ? { ...card, deltaRotation: normalizeRotation(card.deltaRotation + delta) }
          : card,
      ),
    );
  };

  const rotateAll = (delta: number) => {
    setResult(null);
    setPages((prev) =>
      prev.map((card) => ({
        ...card,
        deltaRotation: normalizeRotation(card.deltaRotation + delta),
      })),
    );
  };

  const movePage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    setResult(null);
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const reorderByIds = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setResult(null);
    setPages((prev) => {
      const fromIndex = prev.findIndex((p) => p.id === sourceId);
      const toIndex = prev.findIndex((p) => p.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const removePage = (id: string) => {
    if (pages.length <= 1) return;
    setResult(null);
    setPages((prev) => prev.filter((card) => card.id !== id));
  };

  const resetOrderAndRotations = () => {
    setResult(null);
    setPages((prev) => {
      const thumbByIndex = new Map(prev.map((p) => [p.sourcePageIndex, p.thumbnailUrl]));
      return originalPages.map((meta) => ({
        id: `page-${meta.pageIndex}`,
        sourcePageIndex: meta.pageIndex,
        width: meta.width,
        height: meta.height,
        initialRotation: meta.initialRotation,
        deltaRotation: 0,
        thumbnailUrl: thumbByIndex.get(meta.pageIndex) ?? null,
      }));
    });
  };

  const resetFile = () => {
    workerAbortRef.current?.abort();
    thumbAbortRef.current?.abort();
    setFile(null);
    setOriginalPages([]);
    setPages([]);
    setErrors([]);
    setResult(null);
    setInspecting(false);
    setIsSaving(false);
  };

  const handleSave = async () => {
    if (!file || pages.length === 0) return;

    setErrors([]);
    setResult(null);
    setIsSaving(true);
    setProgress({ percent: 5, detail: copy.progressApplying });

    const controller = new AbortController();
    workerAbortRef.current = controller;

    try {
      const buffer = await file.arrayBuffer();
      const response = await runWorkerTask<RotateReorderWorkerRequest, RotateApplyResponse>(
        createRotateWorker,
        {
          action: 'apply',
          buffer,
          plan: pages.map((card) => ({
            sourcePageIndex: card.sourcePageIndex,
            deltaRotation: card.deltaRotation,
          })),
        },
        {
          transfer: [buffer],
          signal: controller.signal,
          onProgress: (evt) => {
            setProgress({
              percent: evt.percent,
              detail: `${copy.progressPage} ${evt.current ?? ''}/${evt.total ?? pages.length}`,
            });
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
      setErrors([copy.errors.generic]);
    } finally {
      setIsSaving(false);
      workerAbortRef.current = null;
    }
  };

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {!file ? (
        <Dropzone
          accept=".pdf,application/pdf"
          multiple={false}
          disabled={isSaving}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleFileSelected}
        />
      ) : (
        <div className="space-y-5">
          {/* File Header + Bulk Actions */}
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 truncate text-sm font-semibold text-[var(--ink-primary)]">
                {file.name}
              </p>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {formatBytes(file.size)} ·{' '}
                {inspecting
                  ? copy.inspectingPages
                  : `${pages.length}/${originalPages.length} ${dict.mergePdf.pagesUnit}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => rotateAll(90)}
                disabled={isSaving || inspecting || pages.length === 0}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
              >
                {copy.rotateAllRight}
              </button>
              <button
                type="button"
                onClick={resetOrderAndRotations}
                disabled={isSaving || inspecting}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
              >
                {copy.resetPages}
              </button>
              <button
                type="button"
                onClick={resetFile}
                disabled={isSaving}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
              >
                {copy.changeFileButton}
              </button>
            </div>
          </div>

          {/* Page Thumbnail Grid */}
          {pages.length > 0 && (
            <div className="space-y-2.5">
              <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.gridHint}</p>
              <ol className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {pages.map((card, index) => (
                  <li
                    key={card.id}
                    draggable={!isSaving}
                    onDragStart={() => setDraggedId(card.id)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (draggedId && draggedId !== card.id) {
                        reorderByIds(draggedId, card.id);
                      }
                    }}
                    onDragEnd={() => setDraggedId(null)}
                    className={`flex flex-col justify-between gap-3 rounded-lg border p-3 transition-colors ${
                      draggedId === card.id
                        ? 'border-[var(--accent)] bg-[var(--accent-tint)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-paper)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-data font-semibold text-[var(--ink-primary)]">
                        #{index + 1} ({copy.originalPageLabel} {card.sourcePageIndex + 1})
                      </span>
                      {card.deltaRotation !== 0 && (
                        <span className="font-data rounded-sm bg-[var(--accent-tint)] px-1.5 py-0.5 font-semibold text-[var(--accent)]">
                          +{card.deltaRotation}°
                        </span>
                      )}
                    </div>

                    <div className="flex h-44 items-center justify-center overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-2">
                      {card.thumbnailUrl ? (
                        <img
                          src={card.thumbnailUrl}
                          alt={`${copy.originalPageLabel} ${card.sourcePageIndex + 1}`}
                          width={160}
                          height={200}
                          style={{ transform: `rotate(${card.deltaRotation}deg)` }}
                          className="max-h-36 max-w-36 rounded-xs bg-white object-contain shadow-xs transition-transform duration-150"
                        />
                      ) : (
                        <div className="text-center text-xs text-[var(--ink-muted)]">
                          <p className="font-data m-0 font-semibold text-[var(--ink-primary)]">
                            {copy.originalPageLabel} {card.sourcePageIndex + 1}
                          </p>
                          <p className="font-data m-0 mt-1">
                            {Math.round(card.width)}x{Math.round(card.height)} pt
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => rotatePage(card.id, -90)}
                          disabled={isSaving}
                          aria-label={`${copy.rotateLeft}: ${copy.originalPageLabel} ${card.sourcePageIndex + 1}`}
                          title={copy.rotateLeft}
                          className="btn-secondary font-data inline-flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xs font-semibold"
                        >
                          -90°
                        </button>
                        <button
                          type="button"
                          onClick={() => rotatePage(card.id, 90)}
                          disabled={isSaving}
                          aria-label={`${copy.rotateRight}: ${copy.originalPageLabel} ${card.sourcePageIndex + 1}`}
                          title={copy.rotateRight}
                          className="btn-secondary font-data inline-flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-xs font-semibold"
                        >
                          +90°
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => movePage(index, -1)}
                          disabled={isSaving || index === 0}
                          aria-label={`${dict.mergePdf.moveUp}: #${index + 1}`}
                          title={dict.mergePdf.moveUp}
                          className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg"
                        >
                          <ArrowUpIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => movePage(index, 1)}
                          disabled={isSaving || index === pages.length - 1}
                          aria-label={`${dict.mergePdf.moveDown}: #${index + 1}`}
                          title={dict.mergePdf.moveDown}
                          className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg"
                        >
                          <ArrowDownIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePage(card.id)}
                          disabled={isSaving || pages.length <= 1}
                          aria-label={`${copy.removePage}: #${index + 1}`}
                          title={copy.removePage}
                          className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--danger)]"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Output & Save Bar */}
          {pages.length > 0 && (
            <div className="grid gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4 sm:grid-cols-[1fr_auto] sm:items-end">
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
                  disabled={isSaving}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                />
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || inspecting || pages.length === 0}
                className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
              >
                {copy.saveButton} ({pages.length} {dict.mergePdf.pagesUnit})
              </button>
            </div>
          )}
        </div>
      )}

      {isSaving && (
        <ProgressBanner
          title={dict.shared.processingTitle}
          detail={progress.detail}
          percent={progress.percent}
          cancelLabel={dict.shared.cancelAction}
          onCancel={() => workerAbortRef.current?.abort()}
        />
      )}

      {result && !isSaving && (
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
                onClick={resetFile}
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
