import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes } from '@/lib/format';
import { createClientId } from '@/lib/id';
import { validateImageFiles, type SupportedImageMime } from '@/lib/file-validation';
import { runWorkerTask } from '@/lib/worker-client';
import { downloadAsZip, downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon, TrashIcon } from '@/components/shared/icons';
import {
  buildUniqueWatermarkedNames,
  validateImageWatermarkOptions,
  type ImageWatermarkFormatChoice,
  type ImageWatermarkKind,
  type ImageWatermarkOptions,
  type ImageWatermarkPosition,
} from './watermark-image.logic';
import type {
  WatermarkImageWorkerItem,
  WatermarkImageWorkerRequest,
  WatermarkImageWorkerResponse,
} from './watermark-image.worker';

interface WatermarkImageToolProps {
  locale: Locale;
}

interface ImageQueueEntry {
  id: string;
  file: File;
  mime: SupportedImageMime;
  previewUrl: string;
}

interface LogoEntry {
  file: File;
  mime: SupportedImageMime;
  previewUrl: string;
}

interface WatermarkOutputEntry {
  id: string;
  filename: string;
  width: number;
  height: number;
  blob: Blob;
}

const COLOR_SWATCHES = [
  { hex: '#FFFFFF', labelId: 'Putih', labelEn: 'White' },
  { hex: '#181615', labelId: 'Hitam Tinta', labelEn: 'Ink Black' },
  { hex: '#B93815', labelId: 'Vermilion', labelEn: 'Vermilion' },
  { hex: '#F3C623', labelId: 'Kuning Emas', labelEn: 'Amber Gold' },
] as const;

function createWatermarkImageWorker(): Worker {
  return new Worker(new URL('./watermark-image.worker.ts', import.meta.url), { type: 'module' });
}

function getPreviewAlignmentClasses(position: ImageWatermarkPosition): string {
  switch (position) {
    case 'top-left':
      return 'items-start justify-start';
    case 'top-center':
      return 'items-start justify-center';
    case 'top-right':
      return 'items-start justify-end';
    case 'center-left':
      return 'items-center justify-start';
    case 'center-right':
      return 'items-center justify-end';
    case 'bottom-left':
      return 'items-end justify-start';
    case 'bottom-center':
      return 'items-end justify-center';
    case 'bottom-right':
      return 'items-end justify-end';
    case 'center':
    default:
      return 'items-center justify-center';
  }
}

export default function WatermarkImageTool({ locale }: WatermarkImageToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.watermarkImage;

  const textInputId = useId();
  const fontScaleId = useId();
  const shadowId = useId();
  const logoInputId = useId();
  const logoScaleId = useId();
  const opacityId = useId();
  const rotationId = useId();
  const positionId = useId();
  const marginId = useId();
  const formatId = useId();
  const qualityId = useId();

  const [items, setItems] = useState<ImageQueueEntry[]>([]);
  const [logo, setLogo] = useState<LogoEntry | null>(null);

  const [kind, setKind] = useState<ImageWatermarkKind>('text');
  const [text, setText] = useState('© izikit');
  const [fontPercent, setFontPercent] = useState(6);
  const [colorHex, setColorHex] = useState('#FFFFFF');
  const [textShadow, setTextShadow] = useState(true);
  const [logoScalePercent, setLogoScalePercent] = useState(22);
  const [opacity, setOpacity] = useState(0.5);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState<ImageWatermarkPosition>('bottom-right');
  const [marginPercent, setMarginPercent] = useState(5);
  const [outputFormat, setOutputFormat] = useState<ImageWatermarkFormatChoice>('original');
  const [quality, setQuality] = useState(88);

  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [outputs, setOutputs] = useState<WatermarkOutputEntry[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<ImageQueueEntry[]>([]);
  const logoRef = useRef<LogoEntry | null>(null);
  itemsRef.current = items;
  logoRef.current = logo;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
      if (logoRef.current) {
        URL.revokeObjectURL(logoRef.current.previewUrl);
      }
    };
  }, []);

  const options = useMemo<ImageWatermarkOptions>(
    () => ({
      kind,
      text,
      fontPercent,
      colorHex,
      textShadow,
      logoScalePercent,
      opacity,
      rotation,
      position,
      marginPercent,
      outputFormat,
      quality,
    }),
    [
      colorHex,
      fontPercent,
      kind,
      logoScalePercent,
      marginPercent,
      opacity,
      outputFormat,
      position,
      quality,
      rotation,
      text,
      textShadow,
    ],
  );

  const validationIssue = useMemo<string | null>(() => {
    if (kind === 'text' && !text.trim()) return copy.errors.emptyText;
    if (kind === 'logo' && !logo) return copy.logoMissingHint;
    try {
      validateImageWatermarkOptions(options, Boolean(logo));
    } catch {
      return copy.errors.generic;
    }
    return null;
  }, [copy.errors.emptyText, copy.errors.generic, copy.logoMissingHint, kind, logo, options, text]);

  const handleImagesSelected = async (incoming: File[]) => {
    if (incoming.length === 0) return;
    setErrors([]);
    setOutputs([]);

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

      const added: ImageQueueEntry[] = accepted.map(({ file, mime }) => ({
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

  const handleLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;

    setErrors([]);
    setOutputs([]);

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

      const nextLogo: LogoEntry = {
        file: accepted[0].file,
        mime: accepted[0].mime,
        previewUrl: URL.createObjectURL(accepted[0].file),
      };

      setLogo((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return nextLogo;
      });
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
    setOutputs([]);
  };

  const clearAll = () => {
    abortRef.current?.abort();
    for (const item of items) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setItems([]);
    setOutputs([]);
    setErrors([]);
    setIsProcessing(false);
  };

  const handleApply = async () => {
    if (items.length === 0) return;
    if (validationIssue) {
      setErrors([validationIssue]);
      return;
    }

    setErrors([]);
    setOutputs([]);
    setIsProcessing(true);
    setProgress({ percent: 5, detail: `${copy.progressProcessing} 1/${items.length}` });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const outputNames = buildUniqueWatermarkedNames(
        items.map((item) => ({
          name: item.file.name,
          inputMime: item.mime,
          outputFormat,
        })),
      );

      const workerItems: WatermarkImageWorkerItem[] = [];
      const transferables: Transferable[] = [];

      for (let i = 0; i < items.length; i += 1) {
        const buffer = await items[i].file.arrayBuffer();
        workerItems.push({
          id: items[i].id,
          inputMime: items[i].mime,
          outputFilename: outputNames[i],
          buffer,
        });
        transferables.push(buffer);
      }

      let logoPayload: WatermarkImageWorkerRequest['logo'];
      if (kind === 'logo' && logo) {
        const logoBuffer = await logo.file.arrayBuffer();
        logoPayload = { buffer: logoBuffer, mime: logo.mime };
        transferables.push(logoBuffer);
      }

      const response = await runWorkerTask<
        WatermarkImageWorkerRequest,
        WatermarkImageWorkerResponse
      >(
        createWatermarkImageWorker,
        {
          items: workerItems,
          options,
          logo: logoPayload,
        },
        {
          transfer: transferables,
          signal: controller.signal,
          onProgress: (evt) => {
            const detail =
              evt.current && evt.total
                ? `${copy.progressProcessing} ${evt.current}/${evt.total}`
                : copy.progressProcessing;
            setProgress({ percent: evt.percent, detail });
          },
        },
      );

      setOutputs(
        response.results.map((res) => ({
          id: res.id,
          filename: res.outputFilename,
          width: res.width,
          height: res.height,
          blob: new Blob([res.buffer], { type: res.outputMime }),
        })),
      );
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

  const handleDownloadZip = async () => {
    if (outputs.length === 0) return;
    setIsZipping(true);
    try {
      await downloadAsZip(
        outputs.map((item) => ({ filename: item.filename, blob: item.blob })),
        'izikit-watermarked-images.zip',
      );
    } finally {
      setIsZipping(false);
    }
  };

  const firstPreview = items[0] ?? null;

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
          {/* Batch Toolbar + Add More */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5">
            <p className="font-data m-0 text-sm font-semibold text-[var(--ink-primary)]">
              {items.length} {copy.imagesUnit}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Dropzone
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                multiple={true}
                compact={true}
                disabled={isProcessing}
                idleLabel={dict.shared.dropzoneAddMore}
                activeLabel={dict.shared.dropzoneActive}
                buttonLabel={dict.shared.dropzoneAddMore}
                formatsHint=""
                onFilesSelected={handleImagesSelected}
              />
              <button
                type="button"
                onClick={clearAll}
                disabled={isProcessing}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
              >
                {dict.shared.clearAll}
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
            {/* Watermark Controls */}
            <fieldset disabled={isProcessing} className="m-0 space-y-4 border-0 p-0">
              <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
                {/* Watermark Kind Toggle */}
                <div className="space-y-2">
                  <span className="block text-sm font-semibold text-[var(--ink-primary)]">
                    {copy.kindHeading}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { value: 'text' as const, label: copy.kindText },
                        { value: 'logo' as const, label: copy.kindLogo },
                      ]
                    ).map((opt) => {
                      const active = kind === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setKind(opt.value);
                            setOutputs([]);
                          }}
                          className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--accent-tint)] font-semibold text-[var(--ink-primary)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:border-[var(--border-control)]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Text Mode Controls */}
                {kind === 'text' ? (
                  <div className="space-y-4 border-t border-[var(--border-subtle)] pt-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={textInputId}
                        className="block text-sm font-medium text-[var(--ink-primary)]"
                      >
                        {copy.textLabel}
                      </label>
                      <input
                        id={textInputId}
                        type="text"
                        value={text}
                        onChange={(e) => {
                          setText(e.target.value);
                          setOutputs([]);
                        }}
                        placeholder={copy.textPlaceholder}
                        maxLength={80}
                        className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <label htmlFor={fontScaleId} className="font-medium text-[var(--ink-primary)]">
                            {copy.fontScaleLabel}
                          </label>
                          <span className="font-data text-[var(--ink-muted)]">{fontPercent}%</span>
                        </div>
                        <input
                          id={fontScaleId}
                          type="range"
                          min={2}
                          max={16}
                          step={1}
                          value={fontPercent}
                          onChange={(e) => {
                            setFontPercent(Number(e.target.value));
                            setOutputs([]);
                          }}
                          className="h-9 w-full accent-[var(--accent)]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <span className="block text-xs font-medium text-[var(--ink-primary)]">
                          {copy.colorLabel}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {COLOR_SWATCHES.map((swatch) => {
                            const active = colorHex.toUpperCase() === swatch.hex;
                            const label = locale === 'id' ? swatch.labelId : swatch.labelEn;
                            return (
                              <button
                                key={swatch.hex}
                                type="button"
                                aria-label={`${copy.colorLabel}: ${label}`}
                                aria-pressed={active}
                                onClick={() => {
                                  setColorHex(swatch.hex);
                                  setOutputs([]);
                                }}
                                className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
                                  active
                                    ? 'border-[var(--accent)] bg-[var(--accent-tint)] ring-2 ring-[var(--accent)]/40'
                                    : 'border-[var(--border-control)] bg-[var(--bg-card)]'
                                }`}
                              >
                                <span
                                  aria-hidden="true"
                                  className="h-5 w-5 rounded-full border border-black/20"
                                  style={{ backgroundColor: swatch.hex }}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <label
                      htmlFor={shadowId}
                      className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--ink-primary)]"
                    >
                      <input
                        id={shadowId}
                        type="checkbox"
                        checked={textShadow}
                        onChange={(e) => {
                          setTextShadow(e.target.checked);
                          setOutputs([]);
                        }}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span>{copy.textShadowLabel}</span>
                    </label>
                  </div>
                ) : (
                  /* Logo Mode Controls */
                  <div className="space-y-4 border-t border-[var(--border-subtle)] pt-4">
                    <div className="space-y-2">
                      <span className="block text-sm font-medium text-[var(--ink-primary)]">
                        {copy.logoLabel}
                      </span>
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          id={logoInputId}
                          data-role="logo-input"
                          type="file"
                          accept=".png,.webp,.jpg,.jpeg,image/png,image/webp,image/jpeg"
                          onChange={handleLogoChange}
                          className="sr-only"
                        />
                        <label
                          htmlFor={logoInputId}
                          className="btn-secondary inline-flex min-h-11 cursor-pointer items-center rounded-lg px-4 text-sm font-medium"
                        >
                          {logo ? copy.logoChangeButton : copy.logoPickButton}
                        </label>
                        {logo && (
                          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5">
                            <img
                              src={logo.previewUrl}
                              alt=""
                              className="h-8 w-8 rounded object-contain"
                            />
                            <span className="max-w-[180px] truncate text-xs font-medium text-[var(--ink-primary)]">
                              {logo.file.name}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <label htmlFor={logoScaleId} className="font-medium text-[var(--ink-primary)]">
                          {copy.logoScaleLabel}
                        </label>
                        <span className="font-data text-[var(--ink-muted)]">{logoScalePercent}%</span>
                      </div>
                      <input
                        id={logoScaleId}
                        type="range"
                        min={8}
                        max={60}
                        step={2}
                        value={logoScalePercent}
                        onChange={(e) => {
                          setLogoScalePercent(Number(e.target.value));
                          setOutputs([]);
                        }}
                        className="h-9 w-full accent-[var(--accent)]"
                      />
                    </div>
                  </div>
                )}

                {/* Shared Placement & Opacity Controls */}
                <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={positionId}
                      className="block text-sm font-medium text-[var(--ink-primary)]"
                    >
                      {copy.positionLabel}
                    </label>
                    <select
                      id={positionId}
                      value={position}
                      onChange={(e) => {
                        setPosition(e.target.value as ImageWatermarkPosition);
                        setOutputs([]);
                      }}
                      className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                    >
                      {(Object.keys(copy.positions) as ImageWatermarkPosition[]).map((pos) => (
                        <option key={pos} value={pos}>
                          {copy.positions[pos]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={marginId} className="font-medium text-[var(--ink-primary)]">
                        {copy.marginLabel}
                      </label>
                      <span className="font-data text-[var(--ink-muted)]">{marginPercent}%</span>
                    </div>
                    <input
                      id={marginId}
                      type="range"
                      min={1}
                      max={15}
                      step={1}
                      value={marginPercent}
                      onChange={(e) => {
                        setMarginPercent(Number(e.target.value));
                        setOutputs([]);
                      }}
                      className="h-11 w-full accent-[var(--accent)]"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={opacityId} className="font-medium text-[var(--ink-primary)]">
                        {copy.opacityLabel}
                      </label>
                      <span className="font-data text-[var(--ink-muted)]">
                        {Math.round(opacity * 100)}%
                      </span>
                    </div>
                    <input
                      id={opacityId}
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={opacity}
                      onChange={(e) => {
                        setOpacity(Number(e.target.value));
                        setOutputs([]);
                      }}
                      className="h-9 w-full accent-[var(--accent)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={rotationId} className="font-medium text-[var(--ink-primary)]">
                        {copy.rotationLabel}
                      </label>
                      <span className="font-data text-[var(--ink-muted)]">{rotation}°</span>
                    </div>
                    <input
                      id={rotationId}
                      type="range"
                      min={-90}
                      max={90}
                      step={5}
                      value={rotation}
                      onChange={(e) => {
                        setRotation(Number(e.target.value));
                        setOutputs([]);
                      }}
                      className="h-9 w-full accent-[var(--accent)]"
                    />
                  </div>
                </div>

                {/* Output Format & Quality */}
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
                        setOutputFormat(e.target.value as ImageWatermarkFormatChoice);
                        setOutputs([]);
                      }}
                      className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                    >
                      <option value="original">{dict.shared.outputFormatOriginal}</option>
                      <option value="image/webp">WebP</option>
                      <option value="image/jpeg">JPEG</option>
                      <option value="image/png">PNG</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor={qualityId} className="font-medium text-[var(--ink-primary)]">
                        {copy.qualityLabel}
                      </label>
                      <span className="font-data text-[var(--ink-muted)]">{quality}%</span>
                    </div>
                    <input
                      id={qualityId}
                      type="range"
                      min={50}
                      max={100}
                      step={2}
                      value={quality}
                      onChange={(e) => {
                        setQuality(Number(e.target.value));
                        setOutputs([]);
                      }}
                      className="h-11 w-full accent-[var(--accent)]"
                    />
                  </div>
                </div>

                {validationIssue && (
                  <p className="m-0 text-xs font-medium text-[var(--danger)]">{validationIssue}</p>
                )}

                <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={isProcessing || Boolean(validationIssue)}
                    className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
                  >
                    {copy.applyButtonPrefix} {items.length} {copy.imagesUnit}
                  </button>
                </div>
              </div>
            </fieldset>

            {/* Live Preview on First Image */}
            {firstPreview && (
              <aside
                aria-label={copy.previewHeading}
                className="space-y-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4 lg:sticky lg:top-20"
              >
                <h3 className="m-0 text-sm font-semibold text-[var(--ink-primary)]">
                  {copy.previewHeading}
                </h3>

                <div className="relative overflow-hidden rounded-lg border border-[var(--border-control)] bg-[var(--bg-recess)]">
                  <img
                    src={firstPreview.previewUrl}
                    alt={firstPreview.file.name}
                    className="block max-h-64 w-full object-contain"
                  />

                  {/* Watermark Live Overlay */}
                  <div
                    aria-hidden="true"
                    className={
                      position === 'tiled'
                        ? 'pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-3 place-items-center overflow-hidden p-2'
                        : `pointer-events-none absolute inset-0 flex overflow-hidden ${getPreviewAlignmentClasses(
                            position,
                          )}`
                    }
                    style={
                      position === 'tiled'
                        ? undefined
                        : { padding: `${Math.max(6, marginPercent * 1.4)}px` }
                    }
                  >
                    {position === 'tiled' ? (
                      Array.from({ length: 6 }).map((_, idx) =>
                        kind === 'text' ? (
                          <span
                            key={idx}
                            className="font-sans font-bold whitespace-nowrap select-none"
                            style={{
                              color: colorHex,
                              opacity,
                              fontSize: `${Math.max(10, Math.round(fontPercent * 1.7))}px`,
                              transform: `rotate(${rotation}deg)`,
                              textShadow: textShadow ? '0 1px 4px rgba(0,0,0,0.5)' : 'none',
                            }}
                          >
                            {text.trim()}
                          </span>
                        ) : logo ? (
                          <img
                            key={idx}
                            src={logo.previewUrl}
                            alt=""
                            className="object-contain select-none"
                            style={{
                              opacity,
                              width: `${Math.max(18, Math.round(logoScalePercent * 0.7))}%`,
                              transform: `rotate(${rotation}deg)`,
                            }}
                          />
                        ) : null,
                      )
                    ) : kind === 'text' ? (
                      <span
                        className="font-sans font-bold whitespace-nowrap select-none"
                        style={{
                          color: colorHex,
                          opacity,
                          fontSize: `${Math.max(11, Math.round(fontPercent * 2.4))}px`,
                          transform: `rotate(${rotation}deg)`,
                          textShadow: textShadow ? '0 1px 4px rgba(0,0,0,0.5)' : 'none',
                        }}
                      >
                        {text.trim()}
                      </span>
                    ) : logo ? (
                      <img
                        src={logo.previewUrl}
                        alt=""
                        className="object-contain select-none"
                        style={{
                          opacity,
                          width: `${logoScalePercent}%`,
                          transform: `rotate(${rotation}deg)`,
                        }}
                      />
                    ) : null}
                  </div>
                </div>

                <p className="m-0 text-xs leading-relaxed text-[var(--ink-muted)]">
                  {copy.previewHint}
                </p>
              </aside>
            )}
          </div>

          {/* Selected Batch List */}
          <ul className="m-0 list-none space-y-2 p-0">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] px-3.5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
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

                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  disabled={isProcessing}
                  aria-label={`${dict.shared.removeFile}: ${item.file.name}`}
                  className="btn-secondary inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
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

      {outputs.length > 0 && !isProcessing && (
        <div className="space-y-4 rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
              {copy.resultReadyTitle} ({outputs.length} {copy.imagesUnit})
            </h3>

            {outputs.length > 1 ? (
              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={isZipping}
                className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
              >
                <DownloadIcon className="h-4 w-4" />
                <span>{isZipping ? dict.shared.buildingZip : copy.downloadZip}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => downloadBlob(outputs[0].blob, outputs[0].filename)}
                className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
              >
                <DownloadIcon className="h-4 w-4" />
                <span>{copy.downloadSingle}</span>
              </button>
            )}
          </div>

          <ul className="m-0 list-none space-y-2 p-0">
            {outputs.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-medium text-[var(--ink-primary)]">
                    {item.filename}
                  </p>
                  <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                    {item.width}×{item.height} px · {formatBytes(item.blob.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadBlob(item.blob, item.filename)}
                  className="btn-secondary inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold"
                >
                  <DownloadIcon className="h-4 w-4" />
                  <span>{copy.downloadSingle}</span>
                </button>
              </li>
            ))}
          </ul>

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
