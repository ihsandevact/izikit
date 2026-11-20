import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes, sanitizeFilename } from '@/lib/format';
import { createClientId } from '@/lib/id';
import { validatePdfFiles } from '@/lib/file-validation';
import { runWorkerTask } from '@/lib/worker-client';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon, TrashIcon } from '@/components/shared/icons';
import {
  clamp01,
  getRedactedPageIndices,
  isEditWinAnsiText,
  validateAnnotations,
  type EditToolMode,
  type UiPdfAnnotation,
} from './plan';
import { flattenRedactedPdfPages, renderSinglePdfPagePreview } from './page-renderer';
import SignaturePadModal, { type SignatureResult } from './SignaturePadModal';
import type {
  EditInspectResponse,
  EditWorkerRequest,
  EditWorkerResponse,
  WorkerAnnotationTransfer,
} from './edit.worker';

interface EditPdfToolProps {
  locale: Locale;
}

interface EditOutputState {
  filename: string;
  pageCount: number;
  modifiedPages: number;
  blob: Blob;
}

const TEXT_COLORS = ['#181615', '#B93815', '#1F4E79', '#1F6B48'] as const;
const HIGHLIGHT_COLORS = ['#FDE047', '#86EFAC', '#FCA5A5', '#93C5FD'] as const;
const REDACT_COLORS = ['#181615', '#FFFFFF'] as const;

function createEditWorker(): Worker {
  return new Worker(new URL('./edit.worker.ts', import.meta.url), { type: 'module' });
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export default function EditPdfTool({ locale }: EditPdfToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.editPdf;

  const textInputId = useId();
  const fontSizeId = useId();
  const widthSliderId = useId();
  const flattenId = useId();
  const outputNameId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [inspectInfo, setInspectInfo] = useState<EditInspectResponse | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const [currentPage, setCurrentPage] = useState(0);
  const [pagePreviewUrl, setPagePreviewUrl] = useState<string | null>(null);
  const [renderingPage, setRenderingPage] = useState(false);

  const [toolMode, setToolMode] = useState<EditToolMode>('select');
  const [annotations, setAnnotations] = useState<UiPdfAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);

  // Default tool parameters
  const [defaultTextColor, setDefaultTextColor] = useState<string>('#181615');
  const [defaultFontSize, setDefaultFontSize] = useState<number>(16);
  const [defaultHighlightColor, setDefaultHighlightColor] = useState<string>('#FDE047');
  const [defaultRedactColor, setDefaultRedactColor] = useState<string>('#181615');
  const [flattenRedacted, setFlattenRedacted] = useState(true);
  const [outputName, setOutputName] = useState('');

  // Pointer drag state on stage
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageCacheRef = useRef<Map<number, string>>(new Map());
  const [dragState, setDragState] = useState<
    | {
        kind: 'draw-box';
        mode: 'highlight' | 'redact';
        startX: number;
        startY: number;
        currX: number;
        currY: number;
      }
    | {
        kind: 'move-item';
        id: string;
        offsetX: number;
        offsetY: number;
      }
    | null
  >(null);

  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [output, setOutput] = useState<EditOutputState | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Render active page preview on demand
  useEffect(() => {
    if (!pdfBuffer || !inspectInfo) return;
    const cached = pageCacheRef.current.get(currentPage);
    if (cached) {
      setPagePreviewUrl(cached);
      return;
    }

    let cancelled = false;
    setRenderingPage(true);
    renderSinglePdfPagePreview(pdfBuffer, currentPage)
      .then((res) => {
        if (cancelled) return;
        pageCacheRef.current.set(currentPage, res.dataUrl);
        setPagePreviewUrl(res.dataUrl);
      })
      .catch(() => {
        if (!cancelled) setPagePreviewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setRenderingPage(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentPage, inspectInfo, pdfBuffer]);

  const pageAnnotations = useMemo(
    () => annotations.filter((a) => a.pageIndex === currentPage),
    [annotations, currentPage],
  );

  const selectedAnnotation = useMemo(
    () => annotations.find((a) => a.id === selectedId) ?? null,
    [annotations, selectedId],
  );

  const redactedPages = useMemo(() => getRedactedPageIndices(annotations), [annotations]);

  const validationIssue = useMemo<string | null>(() => {
    if (!inspectInfo) return null;
    if (annotations.length === 0) return copy.errors.noAnnotations;
    for (const item of annotations) {
      if (item.type === 'text') {
        if (!item.text.trim()) return copy.errors.emptyText;
        if (!isEditWinAnsiText(item.text.trim())) return copy.errors.unsupportedCharacters;
      }
    }
    try {
      validateAnnotations(annotations, inspectInfo.pageCount);
    } catch {
      return copy.errors.generic;
    }
    return null;
  }, [annotations, copy.errors, inspectInfo]);

  const handleFileSelected = async (incoming: File[]) => {
    const selected = incoming[0];
    if (!selected) return;

    setErrors([]);
    setOutput(null);

    try {
      const { accepted, errors: validationErrors } = await validatePdfFiles([selected], {
        tooLarge: copy.errors.tooLarge,
        notPdf: copy.errors.notPdf,
        generic: copy.errors.corrupt,
      });
      if (validationErrors.length > 0 || accepted.length === 0) {
        setErrors(
          validationErrors.length > 0
            ? validationErrors
            : [`${copy.errors.corrupt} ${selected.name}`],
        );
        return;
      }

      setFile(selected);
      setInspectInfo(null);
      setInspecting(true);
      setAnnotations([]);
      setSelectedId(null);
      setCurrentPage(0);
      pageCacheRef.current.clear();

      const stem = selected.name.replace(/\.pdf$/i, '') || 'izikit-document';
      setOutputName(`${stem}-edited.pdf`);

      const rawBuffer = await selected.arrayBuffer();
      setPdfBuffer(rawBuffer.slice(0));

      const info = await runWorkerTask<EditWorkerRequest, EditInspectResponse>(
        createEditWorker,
        { action: 'inspect', buffer: rawBuffer },
        { transfer: [rawBuffer] },
      );
      setInspectInfo(info);
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      setFile(null);
      setPdfBuffer(null);
      if (code === 'ENCRYPTED') {
        setErrors([`${copy.errors.encrypted} ${selected.name}`]);
      } else {
        setErrors([`${copy.errors.corrupt} ${selected.name}`]);
      }
    } finally {
      setInspecting(false);
    }
  };

  const resetAll = () => {
    abortRef.current?.abort();
    pageCacheRef.current.clear();
    setFile(null);
    setPdfBuffer(null);
    setInspectInfo(null);
    setInspecting(false);
    setCurrentPage(0);
    setPagePreviewUrl(null);
    setAnnotations([]);
    setSelectedId(null);
    setErrors([]);
    setOutput(null);
    setIsProcessing(false);
  };

  const addTextAt = (normX: number, normY: number) => {
    const id = createClientId();
    const newAnn: UiPdfAnnotation = {
      id,
      type: 'text',
      pageIndex: currentPage,
      x: clamp01(Math.min(0.82, normX)),
      y: clamp01(Math.min(0.9, normY)),
      text: locale === 'id' ? 'Catatan teks' : 'Text note',
      fontSize: defaultFontSize,
      colorHex: defaultTextColor,
    };
    setAnnotations((prev) => [...prev, newAnn]);
    setSelectedId(id);
    setToolMode('select');
    setOutput(null);
  };

  const handleInsertSignature = (sig: SignatureResult) => {
    const id = createClientId();
    const widthNorm = 0.26;
    const pageSize = inspectInfo?.pageSizes[currentPage] ?? { width: 595, height: 842 };
    const pageAspect = pageSize.width / Math.max(1, pageSize.height);
    const heightNorm = clamp01(
      Math.max(0.05, Math.min(0.35, (widthNorm * pageAspect) / Math.max(0.3, sig.aspectRatio))),
    );

    const newAnn: UiPdfAnnotation = {
      id,
      type: 'signature',
      pageIndex: currentPage,
      x: 0.37,
      y: 0.72,
      width: widthNorm,
      height: heightNorm,
      imageMime: sig.imageMime,
      imageDataUrl: sig.imageDataUrl,
      label: sig.label,
    };
    setAnnotations((prev) => [...prev, newAnn]);
    setSelectedId(id);
    setSignatureModalOpen(false);
    setToolMode('select');
    setOutput(null);
  };

  const updateSelected = (updater: (item: UiPdfAnnotation) => UiPdfAnnotation) => {
    if (!selectedId) return;
    setAnnotations((prev) => prev.map((item) => (item.id === selectedId ? updater(item) : item)));
    setOutput(null);
  };

  const removeAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
    setOutput(null);
  };

  const undoLast = () => {
    setAnnotations((prev) => {
      if (prev.length === 0) return prev;
      const removed = prev[prev.length - 1];
      if (removed.id === selectedId) setSelectedId(null);
      return prev.slice(0, -1);
    });
    setOutput(null);
  };

  const clearCurrentPage = () => {
    setAnnotations((prev) => prev.filter((a) => a.pageIndex !== currentPage));
    setSelectedId(null);
    setOutput(null);
  };

  const getStageNormCoords = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0.5, y: 0.5 };
    const rect = stage.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp01((clientY - rect.top) / Math.max(1, rect.height)),
    };
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== stageRef.current && !(e.target as HTMLElement).dataset.stageSurface) {
      return;
    }
    const pt = getStageNormCoords(e.clientX, e.clientY);

    if (toolMode === 'text') {
      addTextAt(pt.x, pt.y);
      return;
    }

    if (toolMode === 'highlight' || toolMode === 'redact') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragState({
        kind: 'draw-box',
        mode: toolMode,
        startX: pt.x,
        startY: pt.y,
        currX: pt.x,
        currY: pt.y,
      });
      setSelectedId(null);
      return;
    }

    setSelectedId(null);
  };

  const handleAnnotationPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    ann: UiPdfAnnotation,
  ) => {
    e.stopPropagation();
    setSelectedId(ann.id);
    const pt = getStageNormCoords(e.clientX, e.clientY);
    stageRef.current?.setPointerCapture(e.pointerId);
    setDragState({
      kind: 'move-item',
      id: ann.id,
      offsetX: pt.x - ann.x,
      offsetY: pt.y - ann.y,
    });
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    const pt = getStageNormCoords(e.clientX, e.clientY);

    if (dragState.kind === 'draw-box') {
      setDragState({ ...dragState, currX: pt.x, currY: pt.y });
      return;
    }

    if (dragState.kind === 'move-item') {
      setAnnotations((prev) =>
        prev.map((item) => {
          if (item.id !== dragState.id) return item;
          const maxW = item.type === 'text' ? 0.15 : item.width;
          const maxH = item.type === 'text' ? 0.05 : item.height;
          return {
            ...item,
            x: clamp01(Math.min(1 - maxW, Math.max(0, pt.x - dragState.offsetX))),
            y: clamp01(Math.min(1 - maxH, Math.max(0, pt.y - dragState.offsetY))),
          };
        }),
      );
      setOutput(null);
    }
  };

  const handleStagePointerUp = () => {
    if (!dragState) return;

    if (dragState.kind === 'draw-box') {
      const x = Math.min(dragState.startX, dragState.currX);
      const y = Math.min(dragState.startY, dragState.currY);
      const width = Math.max(0.04, Math.abs(dragState.currX - dragState.startX));
      const height = Math.max(0.025, Math.abs(dragState.currY - dragState.startY));
      const id = createClientId();

      const newAnn: UiPdfAnnotation =
        dragState.mode === 'highlight'
          ? {
              id,
              type: 'highlight',
              pageIndex: currentPage,
              x,
              y,
              width: Math.min(1 - x, width),
              height: Math.min(1 - y, height),
              colorHex: defaultHighlightColor,
              opacity: 0.35,
            }
          : {
              id,
              type: 'redact',
              pageIndex: currentPage,
              x,
              y,
              width: Math.min(1 - x, width),
              height: Math.min(1 - y, height),
              colorHex: defaultRedactColor,
            };

      setAnnotations((prev) => [...prev, newAnn]);
      setSelectedId(id);
      setOutput(null);
    }

    setDragState(null);
  };

  const handleSavePdf = async () => {
    if (!file || !pdfBuffer || !inspectInfo) return;
    if (validationIssue) {
      setErrors([validationIssue]);
      return;
    }

    setErrors([]);
    setOutput(null);
    setIsProcessing(true);
    setProgress({ percent: 10, detail: copy.progressSaving });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const transferables: Transferable[] = [];
      let rasterizedOverrides;

      if (flattenRedacted && redactedPages.length > 0) {
        setProgress({ percent: 20, detail: copy.progressFlattening });
        rasterizedOverrides = await flattenRedactedPdfPages(
          pdfBuffer,
          redactedPages,
          annotations,
          controller.signal,
        );
        for (const ov of rasterizedOverrides) {
          transferables.push(ov.jpegBuffer);
        }
      }

      const workerAnnotations: WorkerAnnotationTransfer[] = annotations.map((ann) => {
        if (ann.type === 'signature') {
          const imageBuffer = dataUrlToArrayBuffer(ann.imageDataUrl);
          transferables.push(imageBuffer);
          return {
            id: ann.id,
            type: 'signature',
            pageIndex: ann.pageIndex,
            x: ann.x,
            y: ann.y,
            width: ann.width,
            height: ann.height,
            imageMime: ann.imageMime,
            label: ann.label,
            imageBuffer,
          };
        }
        return ann;
      });

      const workBuffer = pdfBuffer.slice(0);
      transferables.push(workBuffer);

      const response = await runWorkerTask<EditWorkerRequest, EditWorkerResponse>(
        createEditWorker,
        {
          action: 'apply',
          buffer: workBuffer,
          annotations: workerAnnotations,
          rasterizedOverrides,
        },
        {
          transfer: transferables,
          signal: controller.signal,
          onProgress: (evt) => {
            setProgress({ percent: evt.percent, detail: copy.progressSaving });
          },
        },
      );

      const safeFilename = sanitizeFilename(
        outputName || `${file.name.replace(/\.pdf$/i, '')}-edited.pdf`,
        'izikit-edited.pdf',
      );
      const finalName = safeFilename.toLowerCase().endsWith('.pdf')
        ? safeFilename
        : `${safeFilename}.pdf`;

      setOutput({
        filename: finalName,
        pageCount: response.pageCount,
        modifiedPages: response.modifiedPages,
        blob: new Blob([response.buffer], { type: 'application/pdf' }),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setErrors([copy.errors.generic]);
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  };

  const activePageSize = inspectInfo?.pageSizes[currentPage] ?? { width: 595, height: 842 };

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
          disabled={isProcessing}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleFileSelected}
        />
      ) : (
        <div className="space-y-5">
          {/* Header & Page Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 truncate text-sm font-semibold text-[var(--ink-primary)]">
                {file.name}
              </p>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {formatBytes(file.size)} ·{' '}
                {inspecting || !inspectInfo
                  ? copy.inspectingFile
                  : `${copy.pageIndicator} ${currentPage + 1} / ${inspectInfo.pageCount}`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {inspectInfo && inspectInfo.pageCount > 1 && (
                <>
                  <button
                    type="button"
                    disabled={isProcessing || currentPage === 0}
                    onClick={() => {
                      setCurrentPage((p) => Math.max(0, p - 1));
                      setSelectedId(null);
                    }}
                    className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
                  >
                    {copy.prevPage}
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing || currentPage >= inspectInfo.pageCount - 1}
                    onClick={() => {
                      setCurrentPage((p) => Math.min(inspectInfo.pageCount - 1, p + 1));
                      setSelectedId(null);
                    }}
                    className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
                  >
                    {copy.nextPage}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={resetAll}
                disabled={isProcessing}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-xs font-medium"
              >
                {copy.changeFileButton}
              </button>
            </div>
          </div>

          {/* Annotation Mode Toolbar */}
          <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                role="toolbar"
                aria-label={copy.toolbarHeading}
                className="flex flex-wrap items-center gap-2"
              >
                {(
                  [
                    { mode: 'select' as const, label: copy.modeSelect },
                    { mode: 'text' as const, label: copy.modeText },
                    { mode: 'highlight' as const, label: copy.modeHighlight },
                    { mode: 'redact' as const, label: copy.modeRedact },
                    { mode: 'signature' as const, label: copy.modeSignature },
                  ]
                ).map((btn) => {
                  const active = toolMode === btn.mode;
                  return (
                    <button
                      key={btn.mode}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setToolMode(btn.mode);
                        if (btn.mode === 'signature') {
                          setSignatureModalOpen(true);
                        }
                      }}
                      className={`inline-flex min-h-11 items-center rounded-lg border px-3.5 text-xs font-medium transition-colors sm:text-sm ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)] hover:border-[var(--border-control)]'
                      }`}
                    >
                      {btn.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={undoLast}
                  disabled={isProcessing || annotations.length === 0}
                  className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
                >
                  {copy.undoButton}
                </button>
                {pageAnnotations.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCurrentPage}
                    disabled={isProcessing}
                    className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
                  >
                    {copy.clearPageButton}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5">
              <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.stageHints[toolMode]}</p>

              {toolMode === 'text' && (
                <button
                  type="button"
                  onClick={() => addTextAt(0.32, 0.45)}
                  className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-semibold"
                >
                  {copy.addTextQuickButton}
                </button>
              )}

              {toolMode === 'signature' && (
                <button
                  type="button"
                  onClick={() => setSignatureModalOpen(true)}
                  className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-semibold"
                >
                  {copy.openSignatureButton}
                </button>
              )}
            </div>
          </div>

          {/* Main Interactive Page Stage + Right Inspector */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-start">
            {/* Page Canvas Stage */}
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-3 sm:p-5">
              <div
                ref={stageRef}
                data-stage-surface="true"
                onPointerDown={handleStagePointerDown}
                onPointerMove={handleStagePointerMove}
                onPointerUp={handleStagePointerUp}
                onPointerCancel={handleStagePointerUp}
                className={`relative mx-auto w-full max-w-[620px] overflow-hidden rounded-md border border-[var(--border-control)] bg-white shadow-sm select-none touch-none ${
                  toolMode === 'highlight' || toolMode === 'redact' || toolMode === 'text'
                    ? 'cursor-crosshair'
                    : 'cursor-default'
                }`}
                style={{
                  aspectRatio: `${activePageSize.width} / ${activePageSize.height}`,
                }}
              >
                {pagePreviewUrl ? (
                  <img
                    src={pagePreviewUrl}
                    alt=""
                    data-stage-surface="true"
                    draggable={false}
                    className="pointer-events-none block h-full w-full object-contain"
                  />
                ) : (
                  <div
                    data-stage-surface="true"
                    className="flex h-full w-full items-center justify-center text-xs text-[var(--ink-muted)]"
                  >
                    {renderingPage ? copy.renderingPage : ''}
                  </div>
                )}

                {/* Rendered Annotations on Current Page */}
                {pageAnnotations.map((ann) => {
                  const isSelected = ann.id === selectedId;
                  const ringClass = isSelected
                    ? 'ring-2 ring-[var(--accent)] ring-offset-1'
                    : 'hover:ring-1 hover:ring-[var(--accent)]/60';

                  if (ann.type === 'text') {
                    return (
                      <div
                        key={ann.id}
                        onPointerDown={(e) => handleAnnotationPointerDown(e, ann)}
                        style={{
                          left: `${ann.x * 100}%`,
                          top: `${ann.y * 100}%`,
                          color: ann.colorHex,
                          fontSize: `${Math.max(11, Math.round(ann.fontSize * 0.95))}px`,
                        }}
                        className={`absolute cursor-move rounded px-1 py-0.5 font-sans leading-tight font-semibold whitespace-pre-wrap ${ringClass}`}
                      >
                        {ann.text}
                      </div>
                    );
                  }

                  if (ann.type === 'highlight') {
                    return (
                      <div
                        key={ann.id}
                        onPointerDown={(e) => handleAnnotationPointerDown(e, ann)}
                        style={{
                          left: `${ann.x * 100}%`,
                          top: `${ann.y * 100}%`,
                          width: `${ann.width * 100}%`,
                          height: `${ann.height * 100}%`,
                          backgroundColor: ann.colorHex,
                          opacity: ann.opacity,
                        }}
                        className={`absolute cursor-move rounded-xs ${ringClass}`}
                      />
                    );
                  }

                  if (ann.type === 'redact') {
                    return (
                      <div
                        key={ann.id}
                        onPointerDown={(e) => handleAnnotationPointerDown(e, ann)}
                        style={{
                          left: `${ann.x * 100}%`,
                          top: `${ann.y * 100}%`,
                          width: `${ann.width * 100}%`,
                          height: `${ann.height * 100}%`,
                          backgroundColor: ann.colorHex,
                        }}
                        className={`absolute cursor-move border border-black/30 ${ringClass}`}
                      />
                    );
                  }

                  return (
                    <div
                      key={ann.id}
                      onPointerDown={(e) => handleAnnotationPointerDown(e, ann)}
                      style={{
                        left: `${ann.x * 100}%`,
                        top: `${ann.y * 100}%`,
                        width: `${ann.width * 100}%`,
                        height: `${ann.height * 100}%`,
                      }}
                      className={`absolute cursor-move ${ringClass}`}
                    >
                      <img
                        src={ann.imageDataUrl}
                        alt={ann.label ?? copy.typeLabels.signature}
                        draggable={false}
                        className="pointer-events-none h-full w-full object-contain"
                      />
                    </div>
                  );
                })}

                {/* Active Drag Draft Box */}
                {dragState?.kind === 'draw-box' && (
                  <div
                    style={{
                      left: `${Math.min(dragState.startX, dragState.currX) * 100}%`,
                      top: `${Math.min(dragState.startY, dragState.currY) * 100}%`,
                      width: `${Math.abs(dragState.currX - dragState.startX) * 100}%`,
                      height: `${Math.abs(dragState.currY - dragState.startY) * 100}%`,
                      backgroundColor:
                        dragState.mode === 'highlight'
                          ? defaultHighlightColor
                          : defaultRedactColor,
                      opacity: dragState.mode === 'highlight' ? 0.35 : 0.9,
                    }}
                    className="pointer-events-none absolute border border-dashed border-[var(--accent)]"
                  />
                )}
              </div>
            </div>

            {/* Right Sidebar: Selected Annotation Inspector + Page List + Save */}
            <div className="space-y-4">
              {/* Selected Item Inspector */}
              {selectedAnnotation && (
                <div className="space-y-3 rounded-lg border border-[var(--accent)] bg-[var(--bg-paper)] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tracking-wide text-[var(--accent)] uppercase">
                      {copy.typeLabels[selectedAnnotation.type]}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAnnotation(selectedAnnotation.id)}
                      aria-label={`${dict.shared.removeFile}: ${copy.typeLabels[selectedAnnotation.type]}`}
                      className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--danger)]"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>

                  {selectedAnnotation.type === 'text' && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label
                          htmlFor={textInputId}
                          className="block text-xs font-medium text-[var(--ink-primary)]"
                        >
                          {copy.textInputLabel}
                        </label>
                        <input
                          id={textInputId}
                          type="text"
                          value={selectedAnnotation.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateSelected((item) =>
                              item.type === 'text' ? { ...item, text: val } : item,
                            );
                          }}
                          placeholder={copy.textPlaceholder}
                          className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <label htmlFor={fontSizeId} className="font-medium text-[var(--ink-primary)]">
                            {copy.fontSizeLabel}
                          </label>
                          <span className="font-data text-[var(--ink-muted)]">
                            {selectedAnnotation.fontSize} pt
                          </span>
                        </div>
                        <input
                          id={fontSizeId}
                          type="range"
                          min={10}
                          max={48}
                          step={2}
                          value={selectedAnnotation.fontSize}
                          onChange={(e) => {
                            const size = Number(e.target.value);
                            setDefaultFontSize(size);
                            updateSelected((item) =>
                              item.type === 'text' ? { ...item, fontSize: size } : item,
                            );
                          }}
                          className="izikit-range h-11 w-full"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        {TEXT_COLORS.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`${copy.colorLabel}: ${hex}`}
                            aria-pressed={selectedAnnotation.colorHex === hex}
                            onClick={() => {
                              setDefaultTextColor(hex);
                              updateSelected((item) =>
                                item.type === 'text' ? { ...item, colorHex: hex } : item,
                              );
                            }}
                            className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border bg-[var(--bg-card)] ${
                              selectedAnnotation.colorHex === hex
                                ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40'
                                : 'border-[var(--border-control)]'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="h-5 w-5 rounded-full border border-[var(--border-control)]"
                              style={{ backgroundColor: hex }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedAnnotation.type !== 'text' && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <label
                            htmlFor={widthSliderId}
                            className="font-medium text-[var(--ink-primary)]"
                          >
                            {copy.widthPercentLabel}
                          </label>
                          <span className="font-data text-[var(--ink-muted)]">
                            {Math.round(selectedAnnotation.width * 100)}%
                          </span>
                        </div>
                        <input
                          id={widthSliderId}
                          type="range"
                          min={8}
                          max={85}
                          step={2}
                          value={Math.round(selectedAnnotation.width * 100)}
                          onChange={(e) => {
                            const nextW = Number(e.target.value) / 100;
                            updateSelected((item) => {
                              if (item.type === 'text') return item;
                              const ratio = item.height / Math.max(0.02, item.width);
                              const nextH =
                                item.type === 'signature'
                                  ? clamp01(nextW * ratio)
                                  : item.height;
                              return {
                                ...item,
                                width: Math.min(1 - item.x, nextW),
                                height: Math.min(1 - item.y, nextH),
                              };
                            });
                          }}
                          className="izikit-range h-11 w-full"
                        />
                      </div>

                      {selectedAnnotation.type === 'highlight' && (
                        <div className="flex items-center gap-2">
                          {HIGHLIGHT_COLORS.map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              aria-label={`${copy.colorLabel}: ${hex}`}
                              aria-pressed={selectedAnnotation.colorHex === hex}
                              onClick={() => {
                                setDefaultHighlightColor(hex);
                                updateSelected((item) =>
                                  item.type === 'highlight' ? { ...item, colorHex: hex } : item,
                                );
                              }}
                              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border bg-[var(--bg-card)] ${
                                selectedAnnotation.colorHex === hex
                                  ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40'
                                  : 'border-[var(--border-control)]'
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className="h-5 w-5 rounded-full border border-[var(--border-control)]"
                                style={{ backgroundColor: hex }}
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      {selectedAnnotation.type === 'redact' && (
                        <div className="flex items-center gap-2">
                          {REDACT_COLORS.map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              aria-label={`${copy.colorLabel}: ${hex}`}
                              aria-pressed={selectedAnnotation.colorHex === hex}
                              onClick={() => {
                                setDefaultRedactColor(hex);
                                updateSelected((item) =>
                                  item.type === 'redact' ? { ...item, colorHex: hex } : item,
                                );
                              }}
                              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border bg-[var(--bg-card)] ${
                                selectedAnnotation.colorHex === hex
                                  ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40'
                                  : 'border-[var(--border-control)]'
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className="h-5 w-5 rounded-full border border-[var(--border-control)]"
                                style={{ backgroundColor: hex }}
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Page Annotations List */}
              <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="m-0 text-sm font-semibold text-[var(--ink-primary)]">
                    {copy.annotationsHeading} ({pageAnnotations.length})
                  </h3>
                  <span className="font-data text-xs text-[var(--ink-muted)]">
                    {copy.totalAnnotationsLabel}: {annotations.length}
                  </span>
                </div>

                {pageAnnotations.length === 0 ? (
                  <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.annotationsEmpty}</p>
                ) : (
                  <ul className="m-0 max-h-48 list-none space-y-1.5 overflow-y-auto p-0">
                    {pageAnnotations.map((ann) => {
                      const active = ann.id === selectedId;
                      const detail =
                        ann.type === 'text'
                          ? ann.text
                          : ann.type === 'signature'
                            ? ann.label ?? copy.typeLabels.signature
                            : `${Math.round(ann.width * 100)}% × ${Math.round(ann.height * 100)}%`;
                      return (
                        <li
                          key={ann.id}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--accent-tint)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-card)]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedId(ann.id)}
                            className="min-h-11 min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
                          >
                            <span className="block text-xs font-semibold text-[var(--ink-primary)]">
                              {copy.typeLabels[ann.type]}
                            </span>
                            <span className="block truncate text-xs text-[var(--ink-muted)]">
                              {detail}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAnnotation(ann.id)}
                            aria-label={`${dict.shared.removeFile}: ${copy.typeLabels[ann.type]}`}
                            className="btn-secondary inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--danger)]"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Redact Flattening + Filename + Save Button */}
              <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
                {redactedPages.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] p-3">
                    <label
                      htmlFor={flattenId}
                      className="flex items-start gap-2.5 text-xs font-medium text-[var(--ink-primary)]"
                    >
                      <input
                        id={flattenId}
                        type="checkbox"
                        checked={flattenRedacted}
                        onChange={(e) => setFlattenRedacted(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <span>{copy.flattenRedactedLabel}</span>
                    </label>
                    <p className="m-0 pl-6 text-xs text-[var(--ink-muted)]">
                      {copy.flattenRedactedHint}
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor={outputNameId}
                    className="block text-xs font-medium text-[var(--ink-primary)]"
                  >
                    {copy.outputNameLabel}
                  </label>
                  <input
                    id={outputNameId}
                    type="text"
                    value={outputName}
                    onChange={(e) => setOutputName(e.target.value)}
                    className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                  />
                </div>

                {validationIssue && (
                  <p className="m-0 text-xs font-medium text-[var(--ink-muted)]">
                    {validationIssue}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSavePdf}
                  disabled={
                    isProcessing || inspecting || !inspectInfo || Boolean(validationIssue)
                  }
                  className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-lg px-5 text-sm font-semibold"
                >
                  {copy.saveButton}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SignaturePadModal
        open={signatureModalOpen}
        copy={copy.signatureModal}
        invalidImageError={copy.errors.invalidImage}
        onClose={() => setSignatureModalOpen(false)}
        onConfirm={handleInsertSignature}
      />

      {isProcessing && (
        <ProgressBanner
          title={dict.shared.processingTitle}
          detail={progress.detail}
          percent={progress.percent}
          cancelLabel={dict.shared.cancelAction}
          onCancel={() => abortRef.current?.abort()}
        />
      )}

      {output && !isProcessing && (
        <div className="space-y-4 rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                {copy.resultReadyTitle}
              </h3>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {output.filename} · {output.pageCount} {dict.shared.pagesUnit} ·{' '}
                {formatBytes(output.blob.size)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => downloadBlob(output.blob, output.filename)}
              className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
            >
              <DownloadIcon className="h-4 w-4" />
              <span>{copy.downloadButton}</span>
            </button>
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
