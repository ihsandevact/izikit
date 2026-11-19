import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes, sanitizeFilename } from '@/lib/format';
import { validateImageFiles } from '@/lib/file-validation';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import { clearCachedModels, getCachedModelStats, type ModelCacheStats } from './idb-cache';
import { runOnnxBackgroundRemovalMask } from './onnx-runner';
import {
  applyBrushStrokeToMask,
  composeRgbaWithAlphaMask,
  computeColorKeyAlphaMask,
  detectCornerKeyColor,
  hexToRgb255,
  rgb255ToHex,
  type RefineBrushMode,
  type RemoveBgEngine,
  type RemoveBgOutputFormat,
} from './remove-bg.logic';

interface RemoveBgToolProps {
  locale: Locale;
}

export default function RemoveBgTool({ locale }: RemoveBgToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.removeBg;

  const keyColorId = useId();
  const toleranceId = useId();
  const featherId = useId();
  const brushSizeId = useId();
  const formatId = useId();
  const outputNameId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

  const [engine, setEngine] = useState<RemoveBgEngine>('ai-onnx');
  const [cacheStats, setCacheStats] = useState<ModelCacheStats>({ entryCount: 0, totalBytes: 0 });

  // Color key params
  const [keyColorHex, setKeyColorHex] = useState('#FFFFFF');
  const [tolerance, setTolerance] = useState(24);
  const [feather, setFeather] = useState(12);

  // Mask & refine brush state
  const sourceRgbaRef = useRef<Uint8ClampedArray | null>(null);
  const initialMaskRef = useRef<Uint8ClampedArray | null>(null);
  const currentMaskRef = useRef<Uint8ClampedArray | null>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintingRef = useRef(false);

  const [hasMask, setHasMask] = useState(false);
  const [brushMode, setBrushMode] = useState<RefineBrushMode>('none');
  const [brushRadius, setBrushRadius] = useState(20);
  const [backdropColor, setBackdropColor] = useState<string>('transparent');
  const [outputFormat, setOutputFormat] = useState<RemoveBgOutputFormat>('image/png');
  const [outputName, setOutputName] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });

  const previewUrlRef = useRef<string | null>(null);
  previewUrlRef.current = previewUrl;

  const refreshCacheStats = useCallback(() => {
    getCachedModelStats().then(setCacheStats).catch(() => {});
  }, []);

  useEffect(() => {
    refreshCacheStats();
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, [refreshCacheStats]);

  const redrawComposedCanvas = useCallback(
    (
      mask: Uint8ClampedArray | null,
      bg: string,
      fmt: RemoveBgOutputFormat,
      dims: { width: number; height: number } | null,
    ) => {
      const srcRgba = sourceRgbaRef.current;
      const canvas = resultCanvasRef.current;
      if (!srcRgba || !mask || !canvas || !dims) return;

      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const effectiveBg = bg === 'transparent' && fmt === 'image/jpeg' ? '#FFFFFF' : bg;
      const composed = composeRgbaWithAlphaMask(srcRgba, mask, effectiveBg);
      const imgData = new ImageData(new Uint8ClampedArray(composed), dims.width, dims.height);
      ctx.putImageData(imgData, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (blob) setResultBlob(blob);
        },
        fmt,
        fmt === 'image/png' ? undefined : 0.92,
      );
    },
    [],
  );

  useEffect(() => {
    if (hasMask && currentMaskRef.current && imageSize) {
      redrawComposedCanvas(currentMaskRef.current, backdropColor, outputFormat, imageSize);
    }
  }, [backdropColor, hasMask, imageSize, outputFormat, redrawComposedCanvas]);

  const decodeSourceImagePixels = (objectUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const width = Math.max(1, img.naturalWidth || 600);
      const height = Math.max(1, img.naturalHeight || 600);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const rgba = ctx.getImageData(0, 0, width, height).data;
        sourceRgbaRef.current = new Uint8ClampedArray(rgba);
        const cornerColor = detectCornerKeyColor(sourceRgbaRef.current, width, height);
        setKeyColorHex(rgb255ToHex(cornerColor));
      }
      canvas.width = 0;
      canvas.height = 0;
      setImageSize({ width, height });
    };
    img.src = objectUrl;
  };

  const handleFileSelected = async (incoming: File[]) => {
    const selected = incoming[0];
    if (!selected) return;

    setErrors([]);
    setHasMask(false);
    setResultBlob(null);

    try {
      const { accepted, errors: validationErrors } = await validateImageFiles([selected], {
        tooLarge: copy.errors.tooLarge,
        notImage: copy.errors.notImage,
        generic: copy.errors.generic,
      });
      if (validationErrors.length > 0 || accepted.length === 0) {
        setErrors(validationErrors.length > 0 ? validationErrors : [copy.errors.notImage]);
        return;
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const nextUrl = URL.createObjectURL(selected);
      setFile(selected);
      setPreviewUrl(nextUrl);

      const stem = selected.name.replace(/\.[^/.]+$/, '') || 'izikit-cutout';
      setOutputName(`${stem}-nobg`);

      if (typeof Image !== 'undefined') {
        decodeSourceImagePixels(nextUrl);
      }
    } catch {
      setErrors([copy.errors.generic]);
    }
  };

  const resetAll = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setImageSize(null);
    sourceRgbaRef.current = null;
    initialMaskRef.current = null;
    currentMaskRef.current = null;
    setHasMask(false);
    setResultBlob(null);
    setErrors([]);
    setIsProcessing(false);
  };

  const ensureSourcePixelsLoaded = async (): Promise<{
    rgba: Uint8ClampedArray;
    width: number;
    height: number;
  }> => {
    if (sourceRgbaRef.current && imageSize) {
      return {
        rgba: sourceRgbaRef.current,
        width: imageSize.width,
        height: imageSize.height,
      };
    }
    if (!file) throw new Error('No file');
    const bitmap = await createImageBitmap(file);
    try {
      const width = bitmap.width;
      const height = bitmap.height;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D context');
      ctx.drawImage(bitmap, 0, 0);
      const rgba = new Uint8ClampedArray(ctx.getImageData(0, 0, width, height).data);
      canvas.width = 0;
      canvas.height = 0;
      sourceRgbaRef.current = rgba;
      setImageSize({ width, height });
      return { rgba, width, height };
    } finally {
      bitmap.close();
    }
  };

  const handleRunColorKey = async () => {
    if (!file) return;
    setErrors([]);
    setIsProcessing(true);
    try {
      const { rgba, width, height } = await ensureSourcePixelsLoaded();
      const mask = computeColorKeyAlphaMask(rgba, width, height, {
        keyColor: hexToRgb255(keyColorHex),
        tolerance,
        feather,
      });
      initialMaskRef.current = new Uint8ClampedArray(mask);
      currentMaskRef.current = new Uint8ClampedArray(mask);
      setHasMask(true);
      redrawComposedCanvas(mask, backdropColor, outputFormat, { width, height });
    } catch {
      setErrors([copy.errors.generic]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunAiRemoval = async () => {
    if (!file) return;
    setErrors([]);
    setIsProcessing(true);
    setProgress({ percent: 8, detail: copy.progressDownloadingModel });

    try {
      const { width, height } = await ensureSourcePixelsLoaded();
      const mask = await runOnnxBackgroundRemovalMask(file, width, height, (info) => {
        setProgress({
          percent: info.percent,
          detail:
            info.phase === 'downloading'
              ? copy.progressDownloadingModel
              : copy.progressRunningAi,
        });
      });

      initialMaskRef.current = new Uint8ClampedArray(mask);
      currentMaskRef.current = new Uint8ClampedArray(mask);
      setHasMask(true);
      redrawComposedCanvas(mask, backdropColor, outputFormat, { width, height });
      refreshCacheStats();
    } catch {
      setErrors([copy.errors.aiFailed]);
    } finally {
      setIsProcessing(false);
    }
  };

  const applyBrushAtEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (brushMode === 'none' || !currentMaskRef.current || !imageSize) return;
    const canvas = resultCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = imageSize.width / Math.max(1, rect.width);
    const scaleY = imageSize.height / Math.max(1, rect.height);
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    const updated = applyBrushStrokeToMask(
      currentMaskRef.current,
      imageSize.width,
      imageSize.height,
      {
        mode: brushMode,
        centerX: cx,
        centerY: cy,
        radiusPx: Math.max(2, brushRadius * ((scaleX + scaleY) / 2)),
      },
    );
    currentMaskRef.current = updated;
    redrawComposedCanvas(updated, backdropColor, outputFormat, imageSize);
  };

  const handleResetMask = () => {
    if (!initialMaskRef.current || !imageSize) return;
    const restored = new Uint8ClampedArray(initialMaskRef.current);
    currentMaskRef.current = restored;
    redrawComposedCanvas(restored, backdropColor, outputFormat, imageSize);
  };

  const handleDownload = () => {
    if (!resultBlob) return;
    const ext =
      outputFormat === 'image/png' ? 'png' : outputFormat === 'image/webp' ? 'webp' : 'jpg';
    const stem = sanitizeFilename(outputName.replace(/\.[^/.]+$/, ''), 'izikit-cutout');
    downloadBlob(resultBlob, `${stem}.${ext}`);
  };

  const backdropOptions = [
    { value: 'transparent', label: copy.bgTransparent },
    { value: '#FFFFFF', label: copy.bgWhite },
    { value: '#DB1514', label: copy.bgPassportRed },
    { value: '#00529C', label: copy.bgPassportBlue },
    { value: '#181615', label: copy.bgDark },
  ];

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {!file ? (
        <Dropzone
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
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
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 truncate text-sm font-semibold text-[var(--ink-primary)]">
                {file.name}
              </p>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {formatBytes(file.size)}
                {imageSize ? ` · ${imageSize.width}×${imageSize.height} px` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={resetAll}
              disabled={isProcessing}
              className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-xs font-medium"
            >
              {copy.changeFileButton}
            </button>
          </div>

          {/* Engine Selector + Parameters */}
          <fieldset
            disabled={isProcessing}
            className="m-0 space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
          >
            <legend className="px-1 text-sm font-semibold text-[var(--ink-primary)]">
              {copy.engineHeading}
            </legend>

            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  {
                    value: 'ai-onnx' as const,
                    title: copy.engineAiTitle,
                    description: copy.engineAiDesc,
                  },
                  {
                    value: 'color-key' as const,
                    title: copy.engineColorTitle,
                    description: copy.engineColorDesc,
                  },
                ]
              ).map((opt) => {
                const selected = engine === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex flex-col gap-1 rounded-lg border p-3.5 transition-colors ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent-tint)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-control)]'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-primary)]">
                      <input
                        type="radio"
                        name="remove-bg-engine"
                        value={opt.value}
                        checked={selected}
                        onChange={() => setEngine(opt.value)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>{opt.title}</span>
                    </span>
                    <span className="pl-6 text-xs leading-relaxed text-[var(--ink-muted)]">
                      {opt.description}
                    </span>
                  </label>
                );
              })}
            </div>

            {engine === 'ai-onnx' ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-2.5">
                <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                  {cacheStats.totalBytes > 0
                    ? `${copy.cacheStatusReadyPrefix} (${formatBytes(cacheStats.totalBytes)})`
                    : copy.cacheStatusEmpty}
                </p>
                {cacheStats.totalBytes > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      await clearCachedModels();
                      refreshCacheStats();
                    }}
                    className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium"
                  >
                    {copy.clearCacheButton}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor={keyColorId}
                    className="block text-xs font-medium text-[var(--ink-primary)]"
                  >
                    {copy.keyColorLabel}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={keyColorId}
                      type="color"
                      value={keyColorHex}
                      onChange={(e) => setKeyColorHex(e.target.value.toUpperCase())}
                      className="h-11 w-14 cursor-pointer rounded border border-[var(--border-control)] bg-[var(--bg-paper)] p-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (sourceRgbaRef.current && imageSize) {
                          const detected = detectCornerKeyColor(
                            sourceRgbaRef.current,
                            imageSize.width,
                            imageSize.height,
                          );
                          setKeyColorHex(rgb255ToHex(detected));
                        }
                      }}
                      className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium"
                    >
                      {copy.autoDetectColorButton}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <label htmlFor={toleranceId} className="font-medium text-[var(--ink-primary)]">
                      {copy.toleranceLabel}
                    </label>
                    <span className="font-data text-[var(--ink-muted)]">{tolerance}</span>
                  </div>
                  <input
                    id={toleranceId}
                    type="range"
                    min={2}
                    max={85}
                    step={1}
                    value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                    className="h-11 w-full accent-[var(--accent)]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <label htmlFor={featherId} className="font-medium text-[var(--ink-primary)]">
                      {copy.featherLabel}
                    </label>
                    <span className="font-data text-[var(--ink-muted)]">{feather}</span>
                  </div>
                  <input
                    id={featherId}
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={feather}
                    onChange={(e) => setFeather(Number(e.target.value))}
                    className="h-11 w-full accent-[var(--accent)]"
                  />
                </div>
              </div>
            )}

            {/* Backdrop Color Presets (available before and after processing) */}
            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
              <span className="block text-sm font-medium text-[var(--ink-primary)]">
                {copy.backdropHeading}
              </span>
              <div className="flex flex-wrap gap-2">
                {backdropOptions.map((bg) => {
                  const active = backdropColor === bg.value;
                  return (
                    <button
                      key={bg.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setBackdropColor(bg.value);
                        if (bg.value === 'transparent' && outputFormat === 'image/jpeg') {
                          setOutputFormat('image/png');
                        }
                      }}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent-tint)] font-semibold text-[var(--ink-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:border-[var(--border-control)]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 rounded-full border border-black/20"
                        style={
                          bg.value === 'transparent'
                            ? {
                                backgroundImage:
                                  'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                                backgroundSize: '8px 8px',
                              }
                            : { backgroundColor: bg.value }
                        }
                      />
                      <span>{bg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
              <button
                type="button"
                onClick={engine === 'ai-onnx' ? handleRunAiRemoval : handleRunColorKey}
                disabled={isProcessing}
                className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
              >
                {engine === 'ai-onnx' ? copy.runAiButton : copy.runColorButton}
              </button>
            </div>
          </fieldset>

          {/* Interactive Refine Brush & Output Canvas */}
          {hasMask && (
            <div className="space-y-4 rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                  {copy.resultReadyTitle}
                </h3>

                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { mode: 'none' as const, label: copy.brushNone },
                      { mode: 'erase' as const, label: copy.brushErase },
                      { mode: 'restore' as const, label: copy.brushRestore },
                    ]
                  ).map((btn) => {
                    const active = brushMode === btn.mode;
                    return (
                      <button
                        key={btn.mode}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setBrushMode(btn.mode)}
                        className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)]'
                        }`}
                      >
                        {btn.label}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={handleResetMask}
                    className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium"
                  >
                    {copy.resetMaskButton}
                  </button>
                </div>
              </div>

              {brushMode !== 'none' && (
                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-2.5">
                  <label htmlFor={brushSizeId} className="text-xs font-medium text-[var(--ink-primary)]">
                    {copy.brushSizeLabel}: <span className="font-data">{brushRadius} px</span>
                  </label>
                  <input
                    id={brushSizeId}
                    type="range"
                    min={4}
                    max={80}
                    step={2}
                    value={brushRadius}
                    onChange={(e) => setBrushRadius(Number(e.target.value))}
                    className="h-9 w-48 accent-[var(--accent)]"
                  />
                  <span className="text-xs text-[var(--ink-muted)]">{copy.refineHint}</span>
                </div>
              )}

              <div
                className="overflow-hidden rounded-lg border border-[var(--border-control)] p-2"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg, #d8d3c8 25%, transparent 25%), linear-gradient(-45deg, #d8d3c8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d8d3c8 75%), linear-gradient(-45deg, transparent 75%, #d8d3c8 75%)',
                  backgroundSize: '16px 16px',
                  backgroundColor: '#eee9df',
                }}
              >
                <canvas
                  ref={resultCanvasRef}
                  onPointerDown={(e) => {
                    if (brushMode === 'none') return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    paintingRef.current = true;
                    applyBrushAtEvent(e);
                  }}
                  onPointerMove={(e) => {
                    if (!paintingRef.current) return;
                    applyBrushAtEvent(e);
                  }}
                  onPointerUp={() => {
                    paintingRef.current = false;
                  }}
                  onPointerCancel={() => {
                    paintingRef.current = false;
                  }}
                  className={`mx-auto block max-h-96 max-w-full rounded object-contain touch-none ${
                    brushMode === 'none' ? 'cursor-default' : 'cursor-crosshair'
                  }`}
                />
              </div>

              <div className="grid gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <label htmlFor={formatId} className="block text-xs font-medium text-[var(--ink-primary)]">
                    {dict.shared.outputFormatLabel}
                  </label>
                  <select
                    id={formatId}
                    value={outputFormat}
                    onChange={(e) => setOutputFormat(e.target.value as RemoveBgOutputFormat)}
                    className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-paper)] px-3 text-sm text-[var(--ink-primary)]"
                  >
                    <option value="image/png">PNG</option>
                    <option value="image/webp">WebP</option>
                    <option value="image/jpeg">JPEG</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor={outputNameId} className="block text-xs font-medium text-[var(--ink-primary)]">
                    {copy.outputNameLabel}
                  </label>
                  <input
                    id={outputNameId}
                    type="text"
                    value={outputName}
                    onChange={(e) => setOutputName(e.target.value)}
                    className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-paper)] px-3 text-sm text-[var(--ink-primary)]"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!resultBlob}
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
      )}

      {isProcessing && (
        <ProgressBanner
          title={dict.shared.processingTitle}
          detail={progress.detail}
          percent={progress.percent}
          cancelLabel={dict.shared.cancelAction}
          onCancel={() => setIsProcessing(false)}
        />
      )}
    </div>
  );
}
