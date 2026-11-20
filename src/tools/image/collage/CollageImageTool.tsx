import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes, sanitizeFilename } from '@/lib/format';
import { createClientId } from '@/lib/id';
import { moveListItem } from '@/lib/list';
import { validateImageFiles, type SupportedImageMime } from '@/lib/file-validation';
import { runWorkerTask } from '@/lib/worker-client';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { ArrowDownIcon, ArrowUpIcon, DownloadIcon, TrashIcon } from '@/components/shared/icons';
import {
  extensionForCollageFormat,
  resolveCanvasSize,
  resolveGridDimensions,
  type CollageAspectRatio,
  type CollageFitMode,
  type CollageLayoutPreset,
  type CollageOutputFormat,
} from './collage.logic';
import type { CollageWorkerRequest, CollageWorkerResponse } from './collage.worker';

interface CollageImageToolProps {
  locale: Locale;
}

interface CollagePhotoItem {
  id: string;
  file: File;
  mime: SupportedImageMime;
  previewUrl: string;
}

interface CollageOutputState {
  filename: string;
  width: number;
  height: number;
  placedCount: number;
  blob: Blob;
  previewUrl: string;
}

const LAYOUT_PRESETS: CollageLayoutPreset[] = [
  'auto',
  '2x1',
  '1x2',
  '2x2',
  '3x1',
  '1x3',
  '3x2',
  '2x3',
  '3x3',
];

const RESOLUTION_PRESETS = [1200, 1800, 2400] as const;

function createCollageWorker(): Worker {
  return new Worker(new URL('./collage.worker.ts', import.meta.url), { type: 'module' });
}

function aspectRatioCssValue(aspectRatio: CollageAspectRatio): string {
  switch (aspectRatio) {
    case '4:5':
      return '4 / 5';
    case '16:9':
      return '16 / 9';
    case '3:2':
      return '3 / 2';
    case 'a4':
      return '210 / 297';
    case '1:1':
    default:
      return '1 / 1';
  }
}

export default function CollageImageTool({ locale }: CollageImageToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.collageImage;

  const layoutId = useId();
  const aspectId = useId();
  const resId = useId();
  const fitId = useId();
  const gapId = useId();
  const padId = useId();
  const radiusId = useId();
  const formatId = useId();
  const outputNameId = useId();

  const [items, setItems] = useState<CollagePhotoItem[]>([]);
  const [layout, setLayout] = useState<CollageLayoutPreset>('auto');
  const [aspectRatio, setAspectRatio] = useState<CollageAspectRatio>('1:1');
  const [longEdgePx, setLongEdgePx] = useState<number>(1800);
  const [fitMode, setFitMode] = useState<CollageFitMode>('cover');
  const [gapPx, setGapPx] = useState(16);
  const [paddingPx, setPaddingPx] = useState(24);
  const [borderRadiusPx, setBorderRadiusPx] = useState(12);
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF');
  const [outputFormat, setOutputFormat] = useState<CollageOutputFormat>('image/jpeg');
  const [outputName, setOutputName] = useState('izikit-collage');

  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [output, setOutput] = useState<CollageOutputState | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<CollagePhotoItem[]>([]);
  const outputRef = useRef<CollageOutputState | null>(null);
  itemsRef.current = items;
  outputRef.current = output;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
      if (outputRef.current) {
        URL.revokeObjectURL(outputRef.current.previewUrl);
      }
    };
  }, []);

  const grid = useMemo(
    () => resolveGridDimensions(layout, Math.max(2, items.length)),
    [items.length, layout],
  );
  const totalSlots = grid.cols * grid.rows;
  const targetDimensions = useMemo(
    () => resolveCanvasSize(aspectRatio, longEdgePx),
    [aspectRatio, longEdgePx],
  );

  const clearOutput = () => {
    setOutput((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  };

  const handleImagesSelected = async (incoming: File[]) => {
    if (incoming.length === 0) return;
    setErrors([]);
    clearOutput();

    try {
      const { accepted, errors: validationErrors } = await validateImageFiles(incoming, {
        tooLarge: copy.errors.tooLarge,
        notImage: copy.errors.notImage,
        generic: copy.errors.generic,
      });

      if (validationErrors.length > 0) {
        setErrors(validationErrors);
      }
      if (accepted.length === 0) return;

      const added: CollagePhotoItem[] = accepted.map(({ file, mime }) => ({
        id: createClientId(),
        file,
        mime,
        previewUrl: URL.createObjectURL(file),
      }));

      setItems((prev) => [...prev, ...added]);
    } catch {
      setErrors([copy.errors.generic]);
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
    clearOutput();
  };

  const reorderItem = (index: number, delta: -1 | 1) => {
    setItems((prev) => moveListItem(prev, index, delta));
    clearOutput();
  };

  const clearAll = () => {
    abortRef.current?.abort();
    for (const item of items) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setItems([]);
    clearOutput();
    setErrors([]);
    setIsProcessing(false);
  };

  const handleCreateCollage = async () => {
    if (items.length < 2) {
      setErrors([copy.errors.needTwoImages]);
      return;
    }

    setErrors([]);
    clearOutput();
    setIsProcessing(true);
    setProgress({ percent: 5, detail: copy.progressBuilding });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const transferables: Transferable[] = [];
      const workerImages: CollageWorkerRequest['images'] = [];

      for (const item of items) {
        const buffer = await item.file.arrayBuffer();
        workerImages.push({ buffer, mime: item.mime });
        transferables.push(buffer);
      }

      const response = await runWorkerTask<CollageWorkerRequest, CollageWorkerResponse>(
        createCollageWorker,
        {
          images: workerImages,
          options: {
            layout,
            aspectRatio,
            longEdgePx,
            gapPx,
            paddingPx,
            borderRadiusPx,
            backgroundColor,
            fitMode,
            outputFormat,
            quality: 90,
          },
        },
        {
          transfer: transferables,
          signal: controller.signal,
          onProgress: (evt) => {
            setProgress({ percent: evt.percent, detail: copy.progressBuilding });
          },
        },
      );

      const ext = extensionForCollageFormat(response.outputMime);
      const safeStem = sanitizeFilename(outputName.replace(/\.[^/.]+$/, ''), 'izikit-collage');
      const finalFilename = `${safeStem}.${ext}`;
      const blob = new Blob([response.buffer], { type: response.outputMime });

      setOutput({
        filename: finalFilename,
        width: response.width,
        height: response.height,
        placedCount: response.placedCount,
        blob,
        previewUrl: URL.createObjectURL(blob),
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

  const bgSwatches = [
    { value: '#FFFFFF', label: copy.bgWhite },
    { value: '#F7F4EE', label: copy.bgPaper },
    { value: '#181615', label: copy.bgInk },
    { value: 'transparent', label: copy.bgTransparent },
  ];

  const previewGapPx = Math.max(0, Math.round((gapPx / longEdgePx) * 260));
  const previewPadPx = Math.max(0, Math.round((paddingPx / longEdgePx) * 260));
  const previewRadiusPx = Math.max(0, Math.round((borderRadiusPx / longEdgePx) * 260));

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {items.length === 0 ? (
        <Dropzone
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          multiple={true}
          disabled={isProcessing}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleImagesSelected}
        />
      ) : (
        <div className="space-y-5">
          {/* Add More Dropzone Bar */}
          <Dropzone
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            multiple={true}
            compact={true}
            disabled={isProcessing}
            idleLabel={dict.shared.dropzoneAddMore}
            activeLabel={dict.shared.dropzoneActive}
            buttonLabel={dict.shared.dropzoneAddMore}
            formatsHint={copy.formatsHint}
            onFilesSelected={handleImagesSelected}
          />

          {/* Summary Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5">
            <div className="space-y-0.5">
              <p className="font-data m-0 text-sm font-semibold text-[var(--ink-primary)]">
                {items.length} {copy.imagesUnit} · {grid.cols}×{grid.rows} ({targetDimensions.width}
                ×{targetDimensions.height} px)
              </p>
              {items.length < 2 && (
                <p className="m-0 text-xs text-[var(--accent)]">{copy.needMoreImagesHint}</p>
              )}
            </div>
            <button
              type="button"
              onClick={clearAll}
              disabled={isProcessing}
              className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
            >
              {dict.shared.clearAll}
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            {/* Configuration Controls */}
            <fieldset disabled={isProcessing} className="m-0 space-y-4 border-0 p-0">
              <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={layoutId}
                      className="block text-sm font-medium text-[var(--ink-primary)]"
                    >
                      {copy.layoutLabel}
                    </label>
                    <select
                      id={layoutId}
                      value={layout}
                      onChange={(e) => {
                        setLayout(e.target.value as CollageLayoutPreset);
                        clearOutput();
                      }}
                      className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                    >
                      {LAYOUT_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset === 'auto' ? copy.layoutAuto : preset.replace('x', ' × ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor={aspectId}
                      className="block text-sm font-medium text-[var(--ink-primary)]"
                    >
                      {copy.aspectLabel}
                    </label>
                    <select
                      id={aspectId}
                      value={aspectRatio}
                      onChange={(e) => {
                        setAspectRatio(e.target.value as CollageAspectRatio);
                        clearOutput();
                      }}
                      className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                    >
                      {(Object.keys(copy.aspects) as CollageAspectRatio[]).map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {copy.aspects[ratio]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={resId}
                      className="block text-sm font-medium text-[var(--ink-primary)]"
                    >
                      {copy.resolutionLabel}
                    </label>
                    <select
                      id={resId}
                      value={longEdgePx}
                      onChange={(e) => {
                        setLongEdgePx(Number(e.target.value));
                        clearOutput();
                      }}
                      className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                    >
                      {RESOLUTION_PRESETS.map((px) => (
                        <option key={px} value={px}>
                          {px} px
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor={fitId}
                      className="block text-sm font-medium text-[var(--ink-primary)]"
                    >
                      {copy.fitModeLabel}
                    </label>
                    <select
                      id={fitId}
                      value={fitMode}
                      onChange={(e) => {
                        setFitMode(e.target.value as CollageFitMode);
                        clearOutput();
                      }}
                      className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                    >
                      <option value="cover">{copy.fitCover}</option>
                      <option value="contain">{copy.fitContain}</option>
                    </select>
                  </div>
                </div>

                {/* Spacing Sliders */}
                <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={gapId} className="font-medium text-[var(--ink-primary)]">
                        {copy.gapLabel}
                      </label>
                      <span className="font-data text-[var(--ink-muted)]">{gapPx} px</span>
                    </div>
                    <input
                      id={gapId}
                      type="range"
                      min={0}
                      max={64}
                      step={4}
                      value={gapPx}
                      onChange={(e) => {
                        setGapPx(Number(e.target.value));
                        clearOutput();
                      }}
                      className="izikit-range h-11 w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={padId} className="font-medium text-[var(--ink-primary)]">
                        {copy.paddingLabel}
                      </label>
                      <span className="font-data text-[var(--ink-muted)]">{paddingPx} px</span>
                    </div>
                    <input
                      id={padId}
                      type="range"
                      min={0}
                      max={80}
                      step={4}
                      value={paddingPx}
                      onChange={(e) => {
                        setPaddingPx(Number(e.target.value));
                        clearOutput();
                      }}
                      className="izikit-range h-11 w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={radiusId} className="font-medium text-[var(--ink-primary)]">
                        {copy.radiusLabel}
                      </label>
                      <span className="font-data text-[var(--ink-muted)]">{borderRadiusPx} px</span>
                    </div>
                    <input
                      id={radiusId}
                      type="range"
                      min={0}
                      max={64}
                      step={4}
                      value={borderRadiusPx}
                      onChange={(e) => {
                        setBorderRadiusPx(Number(e.target.value));
                        clearOutput();
                      }}
                      className="izikit-range h-11 w-full"
                    />
                  </div>
                </div>

                {/* Background Swatches */}
                <div className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
                  <span className="block text-sm font-medium text-[var(--ink-primary)]">
                    {copy.backgroundLabel}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {bgSwatches.map((swatch) => {
                      const active = backgroundColor === swatch.value;
                      return (
                        <button
                          key={swatch.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setBackgroundColor(swatch.value);
                            if (swatch.value === 'transparent' && outputFormat === 'image/jpeg') {
                              setOutputFormat('image/png');
                            }
                            clearOutput();
                          }}
                          className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--accent-tint)] font-semibold text-[var(--ink-primary)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:border-[var(--border-control)]'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-4 w-4 shrink-0 rounded-full border border-[var(--border-control)] ${
                              swatch.value === 'transparent' ? 'bg-checkerboard' : ''
                            }`}
                            style={
                              swatch.value === 'transparent'
                                ? undefined
                                : { backgroundColor: swatch.value }
                            }
                          />
                          <span>{swatch.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Output Format & Filename */}
                <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={formatId}
                      className="block text-sm font-medium text-[var(--ink-primary)]"
                    >
                      {dict.shared.outputFormatLabel}
                    </label>
                    <select
                      id={formatId}
                      value={outputFormat}
                      onChange={(e) => {
                        setOutputFormat(e.target.value as CollageOutputFormat);
                        clearOutput();
                      }}
                      className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                    >
                      <option value="image/jpeg">JPEG</option>
                      <option value="image/png">PNG</option>
                      <option value="image/webp">WebP</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor={outputNameId}
                      className="block text-sm font-medium text-[var(--ink-primary)]"
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
                </div>

                {items.length > totalSlots && (
                  <p className="m-0 rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3.5 py-2.5 text-xs text-[var(--ink-muted)]">
                    {copy.slotOverflowNoticePrefix} {totalSlots} {copy.slotOverflowNoticeMid}{' '}
                    {items.length} {copy.slotOverflowNoticeSuffix}
                  </p>
                )}

                <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
                  <button
                    type="button"
                    onClick={handleCreateCollage}
                    disabled={isProcessing || items.length < 2}
                    className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-lg px-6 text-sm font-semibold sm:w-auto"
                  >
                    {copy.createButtonPrefix} ({Math.min(items.length, totalSlots)} {copy.imagesUnit})
                  </button>
                </div>
              </div>
            </fieldset>

            {/* Live Grid Preview (shown first on mobile) */}
            <aside
              aria-label={copy.previewHeading}
              className="order-first space-y-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4 lg:order-none lg:sticky lg:top-20"
            >
              <h3 className="m-0 text-sm font-semibold text-[var(--ink-primary)]">
                {copy.previewHeading}
              </h3>

              <div
                aria-hidden="true"
                className={`mx-auto grid w-full max-w-[280px] overflow-hidden rounded-md border border-[var(--border-control)] ${
                  backgroundColor === 'transparent' ? 'bg-checkerboard' : ''
                }`}
                style={{
                  aspectRatio: aspectRatioCssValue(aspectRatio),
                  gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
                  gap: `${previewGapPx}px`,
                  padding: `${previewPadPx}px`,
                  backgroundColor:
                    backgroundColor === 'transparent' ? undefined : backgroundColor,
                }}
              >
                {Array.from({ length: totalSlots }).map((_, idx) => {
                  const photo = items[idx];
                  return (
                    <div
                      key={idx}
                      className="relative h-full w-full overflow-hidden bg-[var(--bg-recess)]"
                      style={{ borderRadius: `${previewRadiusPx}px` }}
                    >
                      {photo && (
                        <img
                          src={photo.previewUrl}
                          alt=""
                          className={`h-full w-full ${
                            fitMode === 'cover' ? 'object-cover' : 'object-contain'
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="m-0 text-xs leading-relaxed text-[var(--ink-muted)]">
                {copy.previewHint}
              </p>
            </aside>
          </div>

          {/* Ordered Photo List */}
          <ul className="m-0 list-none space-y-2 p-0">
            {items.map((item, idx) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] px-3.5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-data inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--bg-recess)] text-xs font-semibold text-[var(--ink-muted)]">
                    {idx + 1}
                  </span>
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded border border-[var(--border-subtle)] object-cover"
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => reorderItem(idx, -1)}
                    disabled={isProcessing || idx === 0}
                    aria-label={`${dict.shared.moveUp}: ${item.file.name}`}
                    className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg"
                  >
                    <ArrowUpIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => reorderItem(idx, 1)}
                    disabled={isProcessing || idx === items.length - 1}
                    aria-label={`${dict.shared.moveDown}: ${item.file.name}`}
                    className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg"
                  >
                    <ArrowDownIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={isProcessing}
                    aria-label={`${dict.shared.removeFile}: ${item.file.name}`}
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
                {output.filename} · {output.width}×{output.height} px · {formatBytes(output.blob.size)}
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

          <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2">
            <img
              src={output.previewUrl}
              alt={output.filename}
              className="mx-auto block max-h-80 w-auto rounded object-contain"
            />
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
