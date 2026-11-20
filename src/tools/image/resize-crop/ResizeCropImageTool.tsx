import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes, replaceFileExtension } from '@/lib/format';
import {
  mimeToExtension,
  validateImageFiles,
  type SupportedImageMime,
} from '@/lib/file-validation';
import { runWorkerTask } from '@/lib/worker-client';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import {
  calculateResizeDimensions,
  clampCropRect,
  computeCenteredCropPreset,
  resolveRotatedBounds,
  type CropPreset,
  type CropRect,
  type ImageRotation,
} from './resize-crop.logic';
import type {
  ResizeCropWorkerRequest,
  ResizeCropWorkerResponse,
} from './resize-crop.worker';

type FormatChoice = 'original' | SupportedImageMime;

interface OutputImage {
  blob: Blob;
  url: string;
  filename: string;
  width: number;
  height: number;
}

interface ResizeCropImageToolProps {
  locale: Locale;
}

function createResizeCropWorker(): Worker {
  return new Worker(new URL('./resize-crop.worker.ts', import.meta.url), { type: 'module' });
}

function readNaturalDimensions(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to read image dimensions.'));
    img.src = objectUrl;
  });
}

export default function ResizeCropImageTool({ locale }: ResizeCropImageToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.resizeCropImage;

  const cropXId = useId();
  const cropYId = useId();
  const cropWId = useId();
  const cropHId = useId();
  const widthId = useId();
  const heightId = useId();
  const percentId = useId();
  const lockId = useId();
  const formatId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [inputMime, setInputMime] = useState<SupportedImageMime>('image/png');
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceDims, setSourceDims] = useState<{ width: number; height: number } | null>(null);

  const [cropPreset, setCropPreset] = useState<CropPreset>('free');
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [rotation, setRotation] = useState<ImageRotation>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);

  const [resizeMode, setResizeMode] = useState<'pixels' | 'percent'>('pixels');
  const [lockAspect, setLockAspect] = useState(true);
  const [targetW, setTargetW] = useState(1);
  const [targetH, setTargetH] = useState(1);
  const [scalePercent, setScalePercent] = useState(100);
  const [outputFormat, setOutputFormat] = useState<FormatChoice>('original');

  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState<OutputImage | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const outputUrlRef = useRef<string | null>(null);
  sourceUrlRef.current = sourceUrl;
  outputUrlRef.current = output?.url ?? null;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    };
  }, []);

  const rotatedCropBounds = useMemo(() => {
    return resolveRotatedBounds(crop.width, crop.height, rotation);
  }, [crop.height, crop.width, rotation]);

  const syncTargetFromRotated = (nextCrop: CropRect, nextRotation: ImageRotation) => {
    const bounds = resolveRotatedBounds(nextCrop.width, nextCrop.height, nextRotation);
    if (resizeMode === 'percent') {
      const scaled = calculateResizeDimensions({
        sourceWidth: bounds.width,
        sourceHeight: bounds.height,
        mode: 'percent',
        percent: Math.max(1, scalePercent),
      });
      setTargetW(scaled.width);
      setTargetH(scaled.height);
    } else {
      setTargetW(bounds.width);
      setTargetH(bounds.height);
    }
  };

  const handleFileSelected = async (incoming: File[]) => {
    const selected = incoming[0];
    if (!selected) return;

    setErrors([]);
    if (output?.url) URL.revokeObjectURL(output.url);
    setOutput(null);

    const { accepted, errors: validationErrors } = await validateImageFiles(
      [selected],
      copy.errors,
    );
    if (validationErrors.length > 0 || accepted.length === 0) {
      setErrors(validationErrors.length > 0 ? validationErrors : [copy.errors.generic]);
      return;
    }
    const { mime } = accepted[0];

    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const nextUrl = URL.createObjectURL(selected);

    try {
      const dims = await readNaturalDimensions(nextUrl);
      setFile(selected);
      setInputMime(mime);
      setSourceUrl(nextUrl);
      setSourceDims(dims);
      setCropPreset('free');
      const fullCrop: CropRect = { x: 0, y: 0, width: dims.width, height: dims.height };
      setCrop(fullCrop);
      setRotation(0);
      setFlipH(false);
      setFlipV(false);
      setResizeMode('pixels');
      setLockAspect(true);
      setScalePercent(100);
      setTargetW(dims.width);
      setTargetH(dims.height);
      setOutputFormat('original');
    } catch {
      URL.revokeObjectURL(nextUrl);
      setErrors([copy.errors.generic]);
    }
  };

  const applyPreset = (preset: CropPreset) => {
    if (!sourceDims) return;
    setOutput(null);
    setCropPreset(preset);
    const nextCrop = computeCenteredCropPreset(sourceDims.width, sourceDims.height, preset);
    setCrop(nextCrop);
    syncTargetFromRotated(nextCrop, rotation);
  };

  const updateCropField = (field: keyof CropRect, rawVal: string) => {
    if (!sourceDims) return;
    const num = Number(rawVal);
    if (!Number.isFinite(num)) return;
    setOutput(null);
    setCropPreset('free');
    const next = clampCropRect({ ...crop, [field]: num }, sourceDims.width, sourceDims.height);
    setCrop(next);
    syncTargetFromRotated(next, rotation);
  };

  const handleRotate = (delta: number) => {
    setOutput(null);
    const next = resolveRotatedBounds(crop.width, crop.height, rotation + delta);
    setRotation(next.angle);
    syncTargetFromRotated(crop, next.angle);
  };

  const handleWidthChange = (rawVal: string) => {
    const val = Math.max(1, Math.round(Number(rawVal) || 1));
    setOutput(null);
    if (lockAspect) {
      const dims = calculateResizeDimensions({
        sourceWidth: rotatedCropBounds.width,
        sourceHeight: rotatedCropBounds.height,
        mode: 'pixels',
        width: val,
        lockAspectRatio: true,
        changedAxis: 'width',
      });
      setTargetW(dims.width);
      setTargetH(dims.height);
    } else {
      setTargetW(val);
    }
  };

  const handleHeightChange = (rawVal: string) => {
    const val = Math.max(1, Math.round(Number(rawVal) || 1));
    setOutput(null);
    if (lockAspect) {
      const dims = calculateResizeDimensions({
        sourceWidth: rotatedCropBounds.width,
        sourceHeight: rotatedCropBounds.height,
        mode: 'pixels',
        height: val,
        lockAspectRatio: true,
        changedAxis: 'height',
      });
      setTargetW(dims.width);
      setTargetH(dims.height);
    } else {
      setTargetH(val);
    }
  };

  const handlePercentChange = (rawVal: string) => {
    const pct = Math.max(5, Math.min(300, Math.round(Number(rawVal) || 100)));
    setOutput(null);
    setScalePercent(pct);
    const dims = calculateResizeDimensions({
      sourceWidth: rotatedCropBounds.width,
      sourceHeight: rotatedCropBounds.height,
      mode: 'percent',
      percent: pct,
    });
    setTargetW(dims.width);
    setTargetH(dims.height);
  };

  const resetTransforms = () => {
    if (!sourceDims) return;
    setOutput(null);
    const fullCrop: CropRect = { x: 0, y: 0, width: sourceDims.width, height: sourceDims.height };
    setCropPreset('free');
    setCrop(fullCrop);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setResizeMode('pixels');
    setScalePercent(100);
    setTargetW(sourceDims.width);
    setTargetH(sourceDims.height);
  };

  const clearFile = () => {
    abortRef.current?.abort();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (output?.url) URL.revokeObjectURL(output.url);
    setFile(null);
    setSourceUrl(null);
    setSourceDims(null);
    setOutput(null);
    setErrors([]);
    setIsProcessing(false);
  };

  const handleApply = async () => {
    if (!file || !sourceDims) return;
    setErrors([]);
    if (output?.url) URL.revokeObjectURL(output.url);
    setOutput(null);
    setIsProcessing(true);
    setProgress(10);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const buffer = await file.arrayBuffer();
      const resolvedMime: SupportedImageMime =
        outputFormat === 'original' ? inputMime : outputFormat;

      const res = await runWorkerTask<ResizeCropWorkerRequest, ResizeCropWorkerResponse>(
        createResizeCropWorker,
        {
          buffer,
          inputMime,
          outputMime: resolvedMime,
          crop,
          rotation,
          flipHorizontal: flipH,
          flipVertical: flipV,
          targetWidth: targetW,
          targetHeight: targetH,
          quality: 0.9,
        },
        {
          transfer: [buffer],
          signal: controller.signal,
          onProgress: (evt) => setProgress(evt.percent),
        },
      );

      const blob = new Blob([res.buffer], { type: res.outputMime });
      const ext = mimeToExtension(res.outputMime);
      const stem = file.name.replace(/\.[^/.]+$/, '');
      const filename = replaceFileExtension(`${stem}-${res.outputWidth}x${res.outputHeight}`, ext);

      setOutput({
        blob,
        url: URL.createObjectURL(blob),
        filename,
        width: res.outputWidth,
        height: res.outputHeight,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrors([copy.errors.generic]);
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  };

  const presets: Array<{ value: CropPreset; label: string }> = [
    { value: 'free', label: copy.presetFree },
    { value: '1:1', label: '1:1' },
    { value: '16:9', label: '16:9' },
    { value: '4:3', label: '4:3' },
    { value: '3:2', label: '3:2' },
  ];

  // Crop overlay percentage coordinates relative to original unrotated image
  const overlayStyle = sourceDims
    ? {
        left: `${(crop.x / sourceDims.width) * 100}%`,
        top: `${(crop.y / sourceDims.height) * 100}%`,
        width: `${(crop.width / sourceDims.width) * 100}%`,
        height: `${(crop.height / sourceDims.height) * 100}%`,
      }
    : undefined;

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {!file || !sourceUrl || !sourceDims ? (
        <Dropzone
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
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
          {/* File bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 truncate text-sm font-semibold text-[var(--ink-primary)]">
                {file.name}
              </p>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {sourceDims.width}x{sourceDims.height} px · {formatBytes(file.size)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resetTransforms}
                disabled={isProcessing}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
              >
                {copy.resetButton}
              </button>
              <button
                type="button"
                onClick={clearFile}
                disabled={isProcessing}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
              >
                {copy.changeImageButton}
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            {/* Visual Preview Stage */}
            <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-4">
              <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
                <span className="font-semibold text-[var(--ink-primary)]">{copy.previewLabel}</span>
                <span className="font-data">
                  {targetW}x{targetH} px
                  {rotation !== 0 ? ` · ${rotation}°` : ''}
                  {flipH ? ' · Flip H' : ''}
                  {flipV ? ' · Flip V' : ''}
                </span>
              </div>

              <div className="bg-checkerboard flex min-h-[280px] items-center justify-center overflow-hidden rounded-lg border border-[var(--border-control)] p-6 sm:min-h-[360px]">
                <div
                  className="relative inline-block max-w-full transition-transform duration-150"
                  style={{
                    transform: `rotate(${rotation}deg) scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
                  }}
                >
                  <img
                    src={sourceUrl}
                    alt={file.name}
                    width={sourceDims.width}
                    height={sourceDims.height}
                    className={`block w-auto rounded object-contain ${
                      rotation === 90 || rotation === 270
                        ? 'max-h-[240px] max-w-[240px] sm:max-h-[300px] sm:max-w-[300px]'
                        : 'max-h-[340px] max-w-full sm:max-h-[420px]'
                    }`}
                  />
                  {overlayStyle && (
                    <div
                      aria-hidden="true"
                      style={overlayStyle}
                      className="pointer-events-none absolute border-2 border-[var(--accent)] bg-[var(--accent)]/12"
                    />
                  )}
                </div>
              </div>

              {/* Rotate & Flip Bar */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleRotate(-90)}
                  disabled={isProcessing}
                  className="btn-secondary font-data inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-semibold"
                >
                  {copy.rotateLeft}
                </button>
                <button
                  type="button"
                  onClick={() => handleRotate(90)}
                  disabled={isProcessing}
                  className="btn-secondary font-data inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-semibold"
                >
                  {copy.rotateRight}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOutput(null);
                    setFlipH((v) => !v);
                  }}
                  aria-pressed={flipH}
                  disabled={isProcessing}
                  className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium ${
                    flipH
                      ? 'border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)]'
                      : 'btn-secondary'
                  }`}
                >
                  {copy.flipHorizontal}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOutput(null);
                    setFlipV((v) => !v);
                  }}
                  aria-pressed={flipV}
                  disabled={isProcessing}
                  className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium ${
                    flipV
                      ? 'border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)]'
                      : 'btn-secondary'
                  }`}
                >
                  {copy.flipVertical}
                </button>
              </div>
            </div>

            {/* Crop & Resize Controls */}
            <fieldset
              disabled={isProcessing}
              className="m-0 space-y-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
            >
              <legend className="px-1 text-sm font-semibold text-[var(--ink-primary)]">
                {copy.controlsHeading}
              </legend>

              {/* Crop Presets & Coordinates */}
              <div className="space-y-2.5">
                <p className="m-0 text-xs font-semibold text-[var(--ink-primary)]">
                  {copy.cropSectionLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => {
                    const active = cropPreset === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => applyPreset(p.value)}
                        aria-pressed={active}
                        className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)] hover:border-[var(--border-control)]'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div className="space-y-1">
                    <label htmlFor={cropXId} className="block text-xs text-[var(--ink-muted)]">
                      X (px)
                    </label>
                    <input
                      id={cropXId}
                      type="number"
                      min={0}
                      max={sourceDims.width - 1}
                      value={crop.x}
                      onChange={(e) => updateCropField('x', e.target.value)}
                      className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2.5 text-sm text-[var(--ink-primary)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={cropYId} className="block text-xs text-[var(--ink-muted)]">
                      Y (px)
                    </label>
                    <input
                      id={cropYId}
                      type="number"
                      min={0}
                      max={sourceDims.height - 1}
                      value={crop.y}
                      onChange={(e) => updateCropField('y', e.target.value)}
                      className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2.5 text-sm text-[var(--ink-primary)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={cropWId} className="block text-xs text-[var(--ink-muted)]">
                      {copy.widthShort}
                    </label>
                    <input
                      id={cropWId}
                      type="number"
                      min={1}
                      max={sourceDims.width}
                      value={crop.width}
                      onChange={(e) => updateCropField('width', e.target.value)}
                      className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2.5 text-sm text-[var(--ink-primary)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={cropHId} className="block text-xs text-[var(--ink-muted)]">
                      {copy.heightShort}
                    </label>
                    <input
                      id={cropHId}
                      type="number"
                      min={1}
                      max={sourceDims.height}
                      value={crop.height}
                      onChange={(e) => updateCropField('height', e.target.value)}
                      className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2.5 text-sm text-[var(--ink-primary)]"
                    />
                  </div>
                </div>
              </div>

              {/* Resize Mode & Inputs */}
              <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--ink-primary)]">
                    {copy.resizeSectionLabel}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setResizeMode('pixels')}
                      aria-pressed={resizeMode === 'pixels'}
                      className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium ${
                        resizeMode === 'pixels'
                          ? 'border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)]'
                      }`}
                    >
                      {copy.modePixels}
                    </button>
                    <button
                      type="button"
                      onClick={() => setResizeMode('percent')}
                      aria-pressed={resizeMode === 'percent'}
                      className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium ${
                        resizeMode === 'percent'
                          ? 'border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)]'
                      }`}
                    >
                      {copy.modePercent}
                    </button>
                  </div>
                </div>

                {resizeMode === 'pixels' ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label htmlFor={widthId} className="block text-xs text-[var(--ink-muted)]">
                          {copy.targetWidthLabel}
                        </label>
                        <input
                          id={widthId}
                          type="number"
                          min={1}
                          max={10000}
                          value={targetW}
                          onChange={(e) => handleWidthChange(e.target.value)}
                          className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={heightId} className="block text-xs text-[var(--ink-muted)]">
                          {copy.targetHeightLabel}
                        </label>
                        <input
                          id={heightId}
                          type="number"
                          min={1}
                          max={10000}
                          value={targetH}
                          onChange={(e) => handleHeightChange(e.target.value)}
                          className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                        />
                      </div>
                    </div>

                    <label
                      htmlFor={lockId}
                      className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-[var(--ink-primary)]"
                    >
                      <input
                        id={lockId}
                        type="checkbox"
                        checked={lockAspect}
                        onChange={(e) => setLockAspect(e.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>{copy.lockAspectLabel}</span>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={percentId} className="text-[var(--ink-muted)]">
                        {copy.scalePercentLabel}
                      </label>
                      <span className="font-data font-semibold text-[var(--accent)]">
                        {scalePercent}% ({targetW}x{targetH} px)
                      </span>
                    </div>
                    <input
                      id={percentId}
                      type="range"
                      min={10}
                      max={200}
                      step={5}
                      value={scalePercent}
                      onChange={(e) => handlePercentChange(e.target.value)}
                      className="izikit-range h-11 w-full"
                    />
                  </div>
                )}
              </div>

              {/* Output format + Apply CTA */}
              <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
                <div className="space-y-1.5">
                  <label htmlFor={formatId} className="block text-xs font-semibold text-[var(--ink-primary)]">
                    {dict.shared.outputFormatLabel}
                  </label>
                  <select
                    id={formatId}
                    value={outputFormat}
                    onChange={(e) => {
                      setOutput(null);
                      setOutputFormat(e.target.value as FormatChoice);
                    }}
                    className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                  >
                    <option value="original">{dict.shared.outputFormatOriginal}</option>
                    <option value="image/webp">WebP</option>
                    <option value="image/jpeg">JPEG</option>
                    <option value="image/png">PNG</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleApply}
                  disabled={isProcessing}
                  className="btn-primary inline-flex min-h-11 w-full items-center justify-center rounded-lg px-6 text-sm font-semibold"
                >
                  {copy.applyButton} ({targetW}x{targetH} px)
                </button>
              </div>
            </fieldset>
          </div>
        </div>
      )}

      {isProcessing && (
        <ProgressBanner
          title={dict.shared.processingTitle}
          detail={copy.progressLabel}
          percent={progress}
          cancelLabel={dict.shared.cancelAction}
          onCancel={() => abortRef.current?.abort()}
        />
      )}

      {output && !isProcessing && (
        <div className="space-y-4 rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <img
                src={output.url}
                alt={output.filename}
                width={80}
                height={80}
                className="bg-checkerboard h-20 w-20 shrink-0 rounded-lg border border-[var(--border-control)] object-contain"
              />
              <div className="space-y-0.5">
                <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                  {copy.resultReadyTitle}
                </h3>
                <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                  {output.filename} · {output.width}×{output.height} px ·{' '}
                  {formatBytes(output.blob.size)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => downloadBlob(output.blob, output.filename)}
              className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold sm:w-auto"
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
