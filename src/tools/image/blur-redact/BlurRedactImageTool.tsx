import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes } from '@/lib/format';
import { createClientId } from '@/lib/id';
import {
  mimeToExtension,
  validateImageFiles,
  type SupportedImageMime,
} from '@/lib/file-validation';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import {
  buildRedactedFilename,
  normalizeDragRect,
  type RedactionBox,
  type RedactionMode,
} from './blur-redact.logic';
import { renderRedactedCanvas } from './canvas-render';

interface BlurRedactImageToolProps {
  locale: Locale;
}

export default function BlurRedactImageTool({ locale }: BlurRedactImageToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.blurRedactImage;

  const intensityId = useId();
  const formatId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<RedactionMode>('pixelate');
  const [intensity, setIntensity] = useState(65);
  const [solidColor, setSolidColor] = useState('#0F172A');
  const [outputFormat, setOutputFormat] = useState<SupportedImageMime>('image/png');
  const [boxes, setBoxes] = useState<RedactionBox[]>([]);
  const [draftBox, setDraftBox] = useState<Omit<RedactionBox, 'id'> | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [hasExported, setHasExported] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  imageUrlRef.current = imageUrl;

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
    };
  }, []);

  // Re-render preview canvas whenever image, boxes, or active draft changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageEl) return;

    const maxPreviewW = 1200;
    const scale = Math.min(1, maxPreviewW / Math.max(1, imageEl.naturalWidth));
    const targetW = Math.max(1, Math.round(imageEl.naturalWidth * scale));
    const targetH = Math.max(1, Math.round(imageEl.naturalHeight * scale));

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderRedactedCanvas(ctx, imageEl, targetW, targetH, boxes, draftBox);
  }, [boxes, draftBox, imageEl]);

  const handleFilesSelected = async (incoming: File[]) => {
    setErrors([]);
    const { accepted, errors: validationErrors } = await validateImageFiles(
      incoming.slice(0, 1),
      copy.errors,
    );
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (accepted.length === 0) return;

    const chosen = accepted[0];
    const nextUrl = URL.createObjectURL(chosen.file);
    const img = new Image();

    img.onload = () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
      setImageUrl(nextUrl);
      setImageEl(img);
      setFile(chosen.file);
      setOutputFormat(chosen.mime);
      setBoxes([]);
      setDraftBox(null);
      setHasExported(false);
    };
    img.onerror = () => {
      URL.revokeObjectURL(nextUrl);
      setErrors([copy.errors.generic]);
    };
    img.src = nextUrl;
  };

  const resetAll = () => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
    }
    setImageUrl(null);
    setImageEl(null);
    setFile(null);
    setBoxes([]);
    setDraftBox(null);
    setHasExported(false);
    setErrors([]);
  };

  const getPointerCanvasCoords = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y, width: canvas.width, height: canvas.height };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const pos = getPointerCanvasCoords(event);
    if (!pos) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { x: pos.x, y: pos.y };
    setDraftBox(null);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragStartRef.current) return;
    const pos = getPointerCanvasCoords(event);
    if (!pos) return;

    const norm = normalizeDragRect(
      dragStartRef.current.x,
      dragStartRef.current.y,
      pos.x,
      pos.y,
      pos.width,
      pos.height,
    );
    if (norm) {
      setDraftBox({
        ...norm,
        mode,
        intensity,
        color: solidColor,
      });
    }
  };

  const finishDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!dragStartRef.current) return;
    const pos = getPointerCanvasCoords(event);
    const start = dragStartRef.current;
    dragStartRef.current = null;

    if (pos) {
      const norm = normalizeDragRect(start.x, start.y, pos.x, pos.y, pos.width, pos.height);
      if (norm) {
        setBoxes((prev) => [
          ...prev,
          {
            id: createClientId(),
            ...norm,
            mode,
            intensity,
            color: solidColor,
          },
        ]);
        setHasExported(false);
      }
    }
    setDraftBox(null);
  };

  const handleUndo = () => {
    setBoxes((prev) => prev.slice(0, -1));
  };

  const handleClearBoxes = () => {
    setBoxes([]);
  };

  const handleExport = async () => {
    if (!file || !imageEl) return;
    setIsExporting(true);
    setErrors([]);

    try {
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = imageEl.naturalWidth;
      exportCanvas.height = imageEl.naturalHeight;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not initialize export canvas context.');
      }

      if (outputFormat === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      }

      renderRedactedCanvas(ctx, imageEl, exportCanvas.width, exportCanvas.height, boxes, null);

      const blob = await new Promise<Blob>((resolve, reject) => {
        exportCanvas.toBlob(
          (result) => {
            if (!result) {
              reject(new Error('Failed to encode redacted image.'));
              return;
            }
            resolve(result);
          },
          outputFormat,
          outputFormat === 'image/png' ? undefined : 0.92,
        );
      });

      const filename = buildRedactedFilename(file.name, outputFormat);
      downloadBlob(blob, filename);
      setHasExported(true);
    } catch {
      setErrors([copy.errors.generic]);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {!file || !imageEl ? (
        <Dropzone
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple={false}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleFilesSelected}
        />
      ) : (
        <div className="space-y-5">
          {/* File summary & actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5 sm:p-4">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 truncate text-sm font-bold text-[var(--ink-primary)]">
                {file.name}
              </p>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {imageEl.naturalWidth}×{imageEl.naturalHeight} · {formatBytes(file.size)} ·{' '}
                {boxes.length} {copy.regionsUnit}
              </p>
            </div>
            <button
              type="button"
              onClick={resetAll}
              className="btn-secondary inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold"
            >
              {copy.changeFile}
            </button>
          </div>

          {/* Censor Toolbar */}
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label={copy.modeHeading}>
                {(
                  [
                    ['pixelate', copy.modePixelate],
                    ['blur', copy.modeBlur],
                    ['solid', copy.modeSolid],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    onClick={() => setMode(value)}
                    className={`inline-flex min-h-10 items-center rounded-lg border px-3.5 text-xs font-semibold transition-colors ${
                      mode === value
                        ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={boxes.length === 0}
                  className="btn-secondary inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold"
                >
                  {copy.undoButton}
                </button>
                <button
                  type="button"
                  onClick={handleClearBoxes}
                  disabled={boxes.length === 0}
                  className="btn-secondary inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold text-[var(--danger)]"
                >
                  {copy.clearRegionsButton}
                </button>
              </div>
            </div>

            <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
              {mode === 'solid' ? (
                <div className="space-y-1.5">
                  <span className="block text-sm font-medium text-[var(--ink-primary)]">
                    {copy.solidColorLabel}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSolidColor('#0F172A')}
                      aria-pressed={solidColor === '#0F172A'}
                      className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${
                        solidColor === '#0F172A'
                          ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)]'
                      }`}
                    >
                      <span className="h-4 w-4 rounded-sm border border-white/20 bg-[#0F172A]" />
                      <span>{copy.colorBlack}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSolidColor('#FFFFFF')}
                      aria-pressed={solidColor === '#FFFFFF'}
                      className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${
                        solidColor === '#FFFFFF'
                          ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)]'
                      }`}
                    >
                      <span className="h-4 w-4 rounded-sm border border-slate-400 bg-white" />
                      <span>{copy.colorWhite}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <label htmlFor={intensityId} className="font-medium text-[var(--ink-primary)]">
                      {copy.intensityLabel}
                    </label>
                    <span className="font-data font-semibold text-[var(--accent)]">
                      {intensity}%
                    </span>
                  </div>
                  <input
                    id={intensityId}
                    type="range"
                    min={15}
                    max={100}
                    step={5}
                    value={intensity}
                    onChange={(e) => setIntensity(Number(e.target.value))}
                    className="izikit-range h-10 w-full"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor={formatId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.outputFormatLabel}
                </label>
                <select
                  id={formatId}
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as SupportedImageMime)}
                  className="h-10 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value="image/png">PNG (.png)</option>
                  <option value="image/jpeg">JPEG (.jpg)</option>
                  <option value="image/webp">WebP (.webp)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Interactive Canvas */}
          <div className="space-y-2">
            <p className="m-0 text-xs font-medium text-[var(--ink-muted)]">{copy.dragHint}</p>
            <div className="flex justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-2 sm:p-4">
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                className="max-h-[65vh] max-w-full cursor-crosshair touch-none rounded-lg shadow-sm"
              />
            </div>
          </div>

          {/* Download Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
            <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
              {boxes.length === 0 ? copy.emptyRegionsHint : `${boxes.length} ${copy.regionsReady}`}
            </p>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold sm:w-auto"
            >
              <DownloadIcon className="h-4 w-4" />
              <span>
                {copy.downloadButton} (.{mimeToExtension(outputFormat)})
              </span>
            </button>
          </div>

          {hasExported && (
            <SupportCard
              locale={locale}
              heading={dict.shared.supportHeading}
              body={dict.shared.supportBody}
              aboutCta={dict.shared.supportAboutCta}
              dismissLabel={dict.shared.supportDismiss}
            />
          )}
        </div>
      )}
    </div>
  );
}
