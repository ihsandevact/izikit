import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes } from '@/lib/format';
import { validateImageFiles } from '@/lib/file-validation';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import {
  buildSignaturePngFilename,
  cleanSignatureRgba,
  findOpaqueBoundingBox,
  type SignatureInkMode,
} from './signature-png.logic';

type SignatureSourceTab = 'photo' | 'draw';

interface StrokePoint {
  x: number;
  y: number;
}

interface DrawnStroke {
  points: StrokePoint[];
  color: string;
  width: number;
}

interface SignatureToPngToolProps {
  locale: Locale;
}

const DRAW_CANVAS_W = 900;
const DRAW_CANVAS_H = 360;

export default function SignatureToPngTool({ locale }: SignatureToPngToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.signatureToPng;

  const thresholdId = useId();
  const softnessId = useId();
  const strokeWidthId = useId();

  const [tab, setTab] = useState<SignatureSourceTab>('photo');

  // Mode 1: Photo from paper
  const [file, setFile] = useState<File | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(185);
  const [softness, setSoftness] = useState(35);
  const [inkMode, setInkMode] = useState<SignatureInkMode>('black');
  const [autoTrim, setAutoTrim] = useState(true);

  // Mode 2: Draw on screen
  const [strokes, setStrokes] = useState<DrawnStroke[]>([]);
  const [drawColor, setDrawColor] = useState('#0F172A');
  const [strokeWidth, setStrokeWidth] = useState(4);

  const [isExporting, setIsExporting] = useState(false);
  const [hasExported, setHasExported] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const photoPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<DrawnStroke | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  imageUrlRef.current = imageUrl;

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
    };
  }, []);

  // Re-render photo cleanup preview
  useEffect(() => {
    if (tab !== 'photo') return;
    const canvas = photoPreviewCanvasRef.current;
    if (!canvas || !imageEl) return;

    const maxSide = 960;
    const scale = Math.min(1, maxSide / Math.max(imageEl.naturalWidth, imageEl.naturalHeight));
    const w = Math.max(1, Math.round(imageEl.naturalWidth * scale));
    const h = Math.max(1, Math.round(imageEl.naturalHeight * scale));

    const temp = document.createElement('canvas');
    temp.width = w;
    temp.height = h;
    const tempCtx = temp.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) return;

    tempCtx.drawImage(imageEl, 0, 0, w, h);
    const srcData = tempCtx.getImageData(0, 0, w, h);
    const cleaned = cleanSignatureRgba(srcData.data, { threshold, softness, inkMode });
    const cleanedImageData = new ImageData(new Uint8ClampedArray(cleaned), w, h);
    tempCtx.putImageData(cleanedImageData, 0, 0);

    const bbox = autoTrim ? findOpaqueBoundingBox(cleaned, w, h, 16) : null;
    const outW = bbox ? bbox.width : w;
    const outH = bbox ? bbox.height : h;

    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, outW, outH);
    if (bbox) {
      ctx.drawImage(temp, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0, outW, outH);
    } else {
      ctx.drawImage(temp, 0, 0);
    }
  }, [autoTrim, imageEl, inkMode, softness, tab, threshold]);

  // Re-render draw canvas
  const redrawStrokes = (list: readonly DrawnStroke[], active?: DrawnStroke | null) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, DRAW_CANVAS_W, DRAW_CANVAS_H);
    const drawOne = (stroke: DrawnStroke) => {
      if (stroke.points.length === 0) return;
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i += 1) {
          const prev = stroke.points[i - 1];
          const curr = stroke.points[i];
          const midX = (prev.x + curr.x) / 2;
          const midY = (prev.y + curr.y) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }
        const last = stroke.points[stroke.points.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      }
      ctx.restore();
    };

    for (const stroke of list) {
      drawOne(stroke);
    }
    if (active) {
      drawOne(active);
    }
  };

  useEffect(() => {
    if (tab === 'draw') {
      redrawStrokes(strokes, null);
    }
  }, [strokes, tab]);

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

    const chosen = accepted[0].file;
    const nextUrl = URL.createObjectURL(chosen);
    const img = new Image();
    img.onload = () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
      setImageUrl(nextUrl);
      setImageEl(img);
      setFile(chosen);
      setHasExported(false);
    };
    img.onerror = () => {
      URL.revokeObjectURL(nextUrl);
      setErrors([copy.errors.generic]);
    };
    img.src = nextUrl;
  };

  const resetPhoto = () => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
    }
    setImageUrl(null);
    setImageEl(null);
    setFile(null);
    setHasExported(false);
    setErrors([]);
  };

  const getDrawPoint = (event: PointerEvent<HTMLCanvasElement>): StrokePoint | null => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * DRAW_CANVAS_W,
      y: ((event.clientY - rect.top) / rect.height) * DRAW_CANVAS_H,
    };
  };

  const handleDrawPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const pt = getDrawPoint(event);
    if (!pt) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextStroke: DrawnStroke = {
      points: [pt],
      color: drawColor,
      width: strokeWidth,
    };
    activeStrokeRef.current = nextStroke;
    redrawStrokes(strokes, nextStroke);
  };

  const handleDrawPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!activeStrokeRef.current) return;
    const pt = getDrawPoint(event);
    if (!pt) return;
    activeStrokeRef.current.points.push(pt);
    redrawStrokes(strokes, activeStrokeRef.current);
  };

  const finishDrawStroke = () => {
    if (!activeStrokeRef.current) return;
    const finished = activeStrokeRef.current;
    activeStrokeRef.current = null;
    setStrokes((prev) => [...prev, finished]);
    setHasExported(false);
  };

  const exportPhotoSignature = async () => {
    if (!imageEl || !file) return;
    setIsExporting(true);
    setErrors([]);

    try {
      const w = imageEl.naturalWidth;
      const h = imageEl.naturalHeight;
      const work = document.createElement('canvas');
      work.width = w;
      work.height = h;
      const workCtx = work.getContext('2d', { willReadFrequently: true });
      if (!workCtx) throw new Error('Could not initialize canvas.');

      workCtx.drawImage(imageEl, 0, 0, w, h);
      const src = workCtx.getImageData(0, 0, w, h);
      const cleaned = cleanSignatureRgba(src.data, { threshold, softness, inkMode });
      workCtx.putImageData(new ImageData(new Uint8ClampedArray(cleaned), w, h), 0, 0);

      const bbox = autoTrim ? findOpaqueBoundingBox(cleaned, w, h, 24) : null;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = bbox ? bbox.width : w;
      outCanvas.height = bbox ? bbox.height : h;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) throw new Error('Could not initialize export canvas.');

      if (bbox) {
        outCtx.drawImage(work, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0, bbox.width, bbox.height);
      } else {
        outCtx.drawImage(work, 0, 0);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        outCanvas.toBlob((res) => (res ? resolve(res) : reject(new Error('PNG export failed'))), 'image/png');
      });

      downloadBlob(blob, buildSignaturePngFilename(file.name));
      setHasExported(true);
    } catch {
      setErrors([copy.errors.generic]);
    } finally {
      setIsExporting(false);
    }
  };

  const exportDrawnSignature = async () => {
    const canvas = drawCanvasRef.current;
    if (!canvas || strokes.length === 0) {
      setErrors([copy.errors.emptyPad]);
      return;
    }

    setIsExporting(true);
    setErrors([]);

    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Could not read draw canvas.');
      const imgData = ctx.getImageData(0, 0, DRAW_CANVAS_W, DRAW_CANVAS_H);
      const bbox = findOpaqueBoundingBox(imgData.data, DRAW_CANVAS_W, DRAW_CANVAS_H, 24);
      if (!bbox) {
        setErrors([copy.errors.emptyPad]);
        return;
      }

      const outCanvas = document.createElement('canvas');
      outCanvas.width = bbox.width;
      outCanvas.height = bbox.height;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) throw new Error('Could not initialize export canvas.');
      outCtx.drawImage(canvas, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0, bbox.width, bbox.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        outCanvas.toBlob((res) => (res ? resolve(res) : reject(new Error('PNG export failed'))), 'image/png');
      });

      downloadBlob(blob, buildSignaturePngFilename(null));
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

      {/* Mode Switcher */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={copy.modeLabel}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'photo'}
          onClick={() => {
            setTab('photo');
            setErrors([]);
          }}
          className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-xs font-bold transition-colors sm:text-sm ${
            tab === 'photo'
              ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-paper)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
          }`}
        >
          {copy.tabPhoto}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'draw'}
          onClick={() => {
            setTab('draw');
            setErrors([]);
          }}
          className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-xs font-bold transition-colors sm:text-sm ${
            tab === 'draw'
              ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-paper)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
          }`}
        >
          {copy.tabDraw}
        </button>
      </div>

      {tab === 'photo' ? (
        !file || !imageEl ? (
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5 sm:p-4">
              <div className="min-w-0 space-y-0.5">
                <p className="m-0 truncate text-sm font-bold text-[var(--ink-primary)]">{file.name}</p>
                <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                  {imageEl.naturalWidth}×{imageEl.naturalHeight} · {formatBytes(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={resetPhoto}
                className="btn-secondary inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold"
              >
                {copy.changeFile}
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-[310px_minmax(0,1fr)] lg:items-start">
              <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <label htmlFor={thresholdId} className="font-medium text-[var(--ink-primary)]">
                      {copy.thresholdLabel}
                    </label>
                    <span className="font-data font-semibold text-[var(--accent)]">{threshold}</span>
                  </div>
                  <input
                    id={thresholdId}
                    type="range"
                    min={90}
                    max={240}
                    step={5}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="izikit-range h-10 w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <label htmlFor={softnessId} className="font-medium text-[var(--ink-primary)]">
                      {copy.softnessLabel}
                    </label>
                    <span className="font-data font-semibold text-[var(--accent)]">{softness}</span>
                  </div>
                  <input
                    id={softnessId}
                    type="range"
                    min={10}
                    max={80}
                    step={5}
                    value={softness}
                    onChange={(e) => setSoftness(Number(e.target.value))}
                    className="izikit-range h-10 w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="block text-sm font-medium text-[var(--ink-primary)]">
                    {copy.inkColorLabel}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['black', copy.inkBlack],
                        ['blue', copy.inkBlue],
                        ['navy', copy.inkNavy],
                        ['original', copy.inkOriginal],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        aria-pressed={inkMode === val}
                        onClick={() => setInkMode(val)}
                        className={`min-h-10 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                          inkMode === val
                            ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex min-h-9 items-center gap-2.5 text-xs font-medium text-[var(--ink-primary)]">
                  <input
                    type="checkbox"
                    checked={autoTrim}
                    onChange={(e) => setAutoTrim(e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span>{copy.autoTrimLabel}</span>
                </label>

                <button
                  type="button"
                  onClick={exportPhotoSignature}
                  disabled={isExporting}
                  className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
                >
                  <DownloadIcon className="h-4 w-4" />
                  <span>{copy.downloadPng}</span>
                </button>
              </div>

              <div className="space-y-2">
                <p className="m-0 text-xs font-semibold text-[var(--ink-primary)]">
                  {copy.previewLabel}
                </p>
                <div className="bg-checkerboard flex min-h-60 items-center justify-center rounded-xl border border-[var(--border-subtle)] p-4 sm:p-6">
                  <canvas
                    ref={photoPreviewCanvasRef}
                    className="max-h-[55vh] max-w-full object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                {(
                  [
                    ['#0F172A', copy.inkBlack],
                    ['#1D4ED8', copy.inkBlue],
                    ['#1E3A8A', copy.inkNavy],
                  ] as const
                ).map(([hex, label]) => (
                  <button
                    key={hex}
                    type="button"
                    aria-pressed={drawColor === hex}
                    onClick={() => setDrawColor(hex)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold ${
                      drawColor === hex
                        ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)]'
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: hex }} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor={strokeWidthId} className="text-xs font-medium text-[var(--ink-muted)]">
                  {copy.strokeWidthLabel}
                </label>
                <input
                  id={strokeWidthId}
                  type="range"
                  min={2}
                  max={10}
                  step={1}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="izikit-range w-24"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                disabled={strokes.length === 0}
                className="btn-secondary inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold"
              >
                {copy.undoButton}
              </button>
              <button
                type="button"
                onClick={() => setStrokes([])}
                disabled={strokes.length === 0}
                className="btn-secondary inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold text-[var(--danger)]"
              >
                {copy.clearPadButton}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.drawHint}</p>
            <div className="overflow-hidden rounded-xl border border-[var(--border-control)] bg-white">
              <canvas
                ref={drawCanvasRef}
                width={DRAW_CANVAS_W}
                height={DRAW_CANVAS_H}
                onPointerDown={handleDrawPointerDown}
                onPointerMove={handleDrawPointerMove}
                onPointerUp={finishDrawStroke}
                onPointerCancel={finishDrawStroke}
                className="block h-auto w-full cursor-crosshair touch-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={exportDrawnSignature}
              disabled={isExporting || strokes.length === 0}
              className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold sm:w-auto"
            >
              <DownloadIcon className="h-4 w-4" />
              <span>{copy.downloadPng}</span>
            </button>
          </div>
        </div>
      )}

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
  );
}
