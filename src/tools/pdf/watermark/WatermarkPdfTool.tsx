import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes, sanitizeFilename } from '@/lib/format';
import { validatePdfFiles } from '@/lib/file-validation';
import { runWorkerTask } from '@/lib/worker-client';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import { parsePageRanges } from '../split/range-parser';
import {
  formatPageNumberLabel,
  isWinAnsiText,
  validateWatermarkOptions,
  type PageNumberFormat,
  type PageNumberPosition,
  type WatermarkPageScope,
  type WatermarkPdfOptions,
  type WatermarkPosition,
} from './plan';
import type {
  WatermarkInspectResponse,
  WatermarkWorkerRequest,
  WatermarkWorkerResponse,
} from './watermark.worker';

interface WatermarkPdfToolProps {
  locale: Locale;
}

interface WatermarkOutputState {
  filename: string;
  pageCount: number;
  modifiedPages: number;
  blob: Blob;
}

const WATERMARK_PRESETS = ['CONFIDENTIAL', 'DRAFT', 'INTERNAL', 'SALINAN'] as const;

const COLOR_SWATCHES = [
  { hex: '#B93815', labelId: 'Vermilion', labelEn: 'Vermilion' },
  { hex: '#181615', labelId: 'Tinta Gelap', labelEn: 'Dark Ink' },
  { hex: '#57524B', labelId: 'Abu Arsip', labelEn: 'Archival Gray' },
  { hex: '#1F4E79', labelId: 'Biru Arsip', labelEn: 'Archival Blue' },
] as const;

function createWatermarkWorker(): Worker {
  return new Worker(new URL('./watermark.worker.ts', import.meta.url), { type: 'module' });
}

function getWatermarkPreviewAlignment(position: WatermarkPosition): string {
  switch (position) {
    case 'top-left':
      return 'items-start justify-start p-5';
    case 'top-right':
      return 'items-start justify-end p-5';
    case 'bottom-left':
      return 'items-end justify-start p-5';
    case 'bottom-right':
      return 'items-end justify-end p-5';
    case 'center':
    default:
      return 'items-center justify-center p-4';
  }
}

function getPageNumberPreviewClasses(position: PageNumberPosition): string {
  const vertical = position.startsWith('top-') ? 'top-2.5' : 'bottom-2.5';
  if (position.endsWith('-left')) return `${vertical} left-3.5 text-left`;
  if (position.endsWith('-right')) return `${vertical} right-3.5 text-right`;
  return `${vertical} inset-x-3 text-center`;
}

export default function WatermarkPdfTool({ locale }: WatermarkPdfToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.watermarkPdf;

  const wmToggleId = useId();
  const wmTextId = useId();
  const wmOpacityId = useId();
  const wmFontSizeId = useId();
  const wmRotationId = useId();
  const wmPosId = useId();
  const pnToggleId = useId();
  const pnFormatId = useId();
  const pnPosId = useId();
  const pnStartId = useId();
  const pnSizeId = useId();
  const pnMarginId = useId();
  const pnSkipFirstId = useId();
  const rangeInputId = useId();
  const outputNameId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [inspecting, setInspecting] = useState(false);

  // Watermark config
  const [wmEnabled, setWmEnabled] = useState(true);
  const [wmText, setWmText] = useState('CONFIDENTIAL');
  const [wmOpacity, setWmOpacity] = useState(0.25);
  const [wmFontSize, setWmFontSize] = useState(48);
  const [wmRotation, setWmRotation] = useState(-45);
  const [wmPosition, setWmPosition] = useState<WatermarkPosition>('center');
  const [wmColor, setWmColor] = useState('#B93815');

  // Page numbers config
  const [pnEnabled, setPnEnabled] = useState(false);
  const [pnFormat, setPnFormat] = useState<PageNumberFormat>('slash');
  const [pnPosition, setPnPosition] = useState<PageNumberPosition>('bottom-center');
  const [pnStartNumber, setPnStartNumber] = useState(1);
  const [pnSkipFirst, setPnSkipFirst] = useState(false);
  const [pnFontSize, setPnFontSize] = useState(11);
  const [pnMargin, setPnMargin] = useState(28);
  const [pnColor, setPnColor] = useState('#57524B');

  // Scope & output
  const [pageScope, setPageScope] = useState<WatermarkPageScope>('all');
  const [rangeSpec, setRangeSpec] = useState('');
  const [outputName, setOutputName] = useState('');

  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [output, setOutput] = useState<WatermarkOutputState | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const currentOptions = useMemo<WatermarkPdfOptions>(
    () => ({
      watermark: {
        enabled: wmEnabled,
        text: wmText,
        opacity: wmOpacity,
        fontSize: wmFontSize,
        rotation: wmRotation,
        position: wmPosition,
        colorHex: wmColor,
      },
      pageNumbers: {
        enabled: pnEnabled,
        format: pnFormat,
        position: pnPosition,
        startNumber: pnStartNumber,
        skipFirstPage: pnSkipFirst,
        fontSize: pnFontSize,
        margin: pnMargin,
        colorHex: pnColor,
        ofTemplate: {
          prefix: copy.ofPrefix,
          connector: copy.ofConnector,
        },
      },
      pageScope,
      rangeSpec: pageScope === 'custom' ? rangeSpec : undefined,
    }),
    [
      copy.ofConnector,
      copy.ofPrefix,
      pageScope,
      pnColor,
      pnEnabled,
      pnFontSize,
      pnFormat,
      pnMargin,
      pnPosition,
      pnSkipFirst,
      pnStartNumber,
      rangeSpec,
      wmColor,
      wmEnabled,
      wmFontSize,
      wmOpacity,
      wmPosition,
      wmRotation,
      wmText,
    ],
  );

  const validationIssue = useMemo<string | null>(() => {
    if (!wmEnabled && !pnEnabled) return copy.errors.nothingEnabled;
    if (wmEnabled && !wmText.trim()) return copy.errors.emptyWatermark;
    if (wmEnabled && !isWinAnsiText(wmText.trim())) return copy.errors.unsupportedCharacters;
    if (pageScope === 'custom' && pageCount) {
      try {
        parsePageRanges(rangeSpec, pageCount);
      } catch (err) {
        const code = (err as Error & { code?: string }).code;
        if (code === 'OUT_OF_RANGE') {
          return `${copy.errors.outOfRange} (1-${pageCount}).`;
        }
        return copy.errors.invalidRange;
      }
    }
    try {
      validateWatermarkOptions(currentOptions);
    } catch {
      return copy.errors.generic;
    }
    return null;
  }, [copy.errors, currentOptions, pageCount, pageScope, pnEnabled, rangeSpec, wmEnabled, wmText]);

  const previewPageNumber = useMemo(() => {
    const sampleTotal = pageCount
      ? pnSkipFirst
        ? Math.max(1, pageCount - 1)
        : pageCount
      : 12;
    const totalNumber = pnStartNumber + sampleTotal - 1;
    return formatPageNumberLabel({
      format: pnFormat,
      current: pnStartNumber,
      total: totalNumber,
      ofTemplate: {
        prefix: copy.ofPrefix,
        connector: copy.ofConnector,
      },
    });
  }, [copy.ofConnector, copy.ofPrefix, pageCount, pnFormat, pnSkipFirst, pnStartNumber]);

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
      setPageCount(null);
      setInspecting(true);
      const stem = selected.name.replace(/\.pdf$/i, '') || 'izikit-document';
      setOutputName(`${stem}-watermarked.pdf`);

      const buffer = await selected.arrayBuffer();
      const inspected = await runWorkerTask<WatermarkWorkerRequest, WatermarkInspectResponse>(
        createWatermarkWorker,
        { action: 'inspect', buffer },
        { transfer: [buffer] },
      );
      setPageCount(inspected.pageCount);
      setRangeSpec(inspected.pageCount > 1 ? `1-${inspected.pageCount}` : '1');
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      setFile(null);
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
    setFile(null);
    setPageCount(null);
    setInspecting(false);
    setErrors([]);
    setOutput(null);
    setIsProcessing(false);
    setProgress({ percent: 0, detail: '' });
  };

  const mapErrorCodeToMessage = (code?: string): string => {
    switch (code) {
      case 'NOTHING_ENABLED':
        return copy.errors.nothingEnabled;
      case 'EMPTY_WATERMARK':
        return copy.errors.emptyWatermark;
      case 'UNSUPPORTED_CHARACTERS':
        return copy.errors.unsupportedCharacters;
      case 'OUT_OF_RANGE':
        return `${copy.errors.outOfRange} (1-${pageCount ?? 1}).`;
      case 'INVALID_RANGE':
        return copy.errors.invalidRange;
      case 'ENCRYPTED':
        return copy.errors.encrypted;
      case 'CORRUPT':
        return copy.errors.corrupt;
      default:
        return copy.errors.generic;
    }
  };

  const handleApply = async () => {
    if (!file || !pageCount) return;
    if (validationIssue) {
      setErrors([validationIssue]);
      return;
    }

    setErrors([]);
    setOutput(null);
    setIsProcessing(true);
    setProgress({ percent: 5, detail: copy.progressStarting });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const buffer = await file.arrayBuffer();
      const response = await runWorkerTask<WatermarkWorkerRequest, WatermarkWorkerResponse>(
        createWatermarkWorker,
        {
          action: 'apply',
          buffer,
          options: currentOptions,
        },
        {
          transfer: [buffer],
          signal: controller.signal,
          onProgress: (evt) => {
            const detail =
              evt.current && evt.total
                ? `${copy.progressStamping} ${evt.current}/${evt.total}`
                : copy.progressStarting;
            setProgress({ percent: evt.percent, detail });
          },
        },
      );

      const safeFilename = sanitizeFilename(
        outputName || `${file.name.replace(/\.pdf$/i, '')}-watermarked.pdf`,
        'izikit-watermarked.pdf',
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
      const code = (err as Error & { code?: string }).code;
      setErrors([mapErrorCodeToMessage(code)]);
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  };

  const previewFontPx = Math.max(10, Math.min(28, Math.round(wmFontSize * 0.4)));
  const previewNumberPx = Math.max(9, Math.min(14, Math.round(pnFontSize * 0.9)));

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
          {/* Selected PDF Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 truncate text-sm font-semibold text-[var(--ink-primary)]">
                {file.name}
              </p>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {formatBytes(file.size)} ·{' '}
                {inspecting
                  ? copy.inspectingPages
                  : `${pageCount ?? 0} ${dict.shared.pagesUnit}`}
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

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px] lg:items-start">
            {/* Configuration Controls */}
            <fieldset
              disabled={isProcessing || inspecting}
              className="m-0 space-y-5 border-0 p-0"
            >
              {/* Text Watermark Section */}
              <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="m-0 text-sm font-semibold text-[var(--ink-primary)]">
                    {copy.watermarkSectionTitle}
                  </h3>
                  <label
                    htmlFor={wmToggleId}
                    className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-[var(--ink-primary)]"
                  >
                    <input
                      id={wmToggleId}
                      type="checkbox"
                      checked={wmEnabled}
                      onChange={(e) => {
                        setWmEnabled(e.target.checked);
                        setOutput(null);
                      }}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span>{copy.watermarkToggleLabel}</span>
                  </label>
                </div>

                {wmEnabled && (
                  <div className="space-y-4 border-t border-[var(--border-subtle)] pt-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={wmTextId}
                        className="block text-sm font-medium text-[var(--ink-primary)]"
                      >
                        {copy.textLabel}
                      </label>
                      <input
                        id={wmTextId}
                        type="text"
                        value={wmText}
                        onChange={(e) => {
                          setWmText(e.target.value);
                          setOutput(null);
                        }}
                        placeholder={copy.textPlaceholder}
                        maxLength={80}
                        className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                      />
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs text-[var(--ink-muted)]">{copy.presetsLabel}:</span>
                        {WATERMARK_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setWmText(preset);
                              setOutput(null);
                            }}
                            className={`font-data inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium transition-colors ${
                              wmText === preset
                                ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:border-[var(--border-control)] hover:text-[var(--ink-primary)]'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label
                          htmlFor={wmPosId}
                          className="block text-sm font-medium text-[var(--ink-primary)]"
                        >
                          {copy.positionLabel}
                        </label>
                        <select
                          id={wmPosId}
                          value={wmPosition}
                          onChange={(e) => {
                            setWmPosition(e.target.value as WatermarkPosition);
                            setOutput(null);
                          }}
                          className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                        >
                          {(Object.keys(copy.positions) as WatermarkPosition[]).map((pos) => (
                            <option key={pos} value={pos}>
                              {copy.positions[pos]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <span className="block text-sm font-medium text-[var(--ink-primary)]">
                          {copy.colorLabel}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {COLOR_SWATCHES.map((swatch) => {
                            const active = wmColor.toUpperCase() === swatch.hex;
                            const label = locale === 'id' ? swatch.labelId : swatch.labelEn;
                            return (
                              <button
                                key={swatch.hex}
                                type="button"
                                aria-label={`${copy.colorLabel}: ${label}`}
                                aria-pressed={active}
                                onClick={() => {
                                  setWmColor(swatch.hex);
                                  setOutput(null);
                                }}
                                className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
                                  active
                                    ? 'border-[var(--accent)] bg-[var(--accent-tint)] ring-2 ring-[var(--accent)]/40'
                                    : 'border-[var(--border-control)] bg-[var(--bg-card)]'
                                }`}
                              >
                                <span
                                  aria-hidden="true"
                                  className="h-5 w-5 rounded-full border border-black/15"
                                  style={{ backgroundColor: swatch.hex }}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <label htmlFor={wmOpacityId} className="font-medium text-[var(--ink-primary)]">
                            {copy.opacityLabel}
                          </label>
                          <span className="font-data text-[var(--ink-muted)]">
                            {Math.round(wmOpacity * 100)}%
                          </span>
                        </div>
                        <input
                          id={wmOpacityId}
                          type="range"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={wmOpacity}
                          onChange={(e) => {
                            setWmOpacity(Number(e.target.value));
                            setOutput(null);
                          }}
                          className="h-9 w-full accent-[var(--accent)]"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <label htmlFor={wmFontSizeId} className="font-medium text-[var(--ink-primary)]">
                            {copy.fontSizeLabel}
                          </label>
                          <span className="font-data text-[var(--ink-muted)]">{wmFontSize} pt</span>
                        </div>
                        <input
                          id={wmFontSizeId}
                          type="range"
                          min={16}
                          max={96}
                          step={2}
                          value={wmFontSize}
                          onChange={(e) => {
                            setWmFontSize(Number(e.target.value));
                            setOutput(null);
                          }}
                          className="h-9 w-full accent-[var(--accent)]"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <label htmlFor={wmRotationId} className="font-medium text-[var(--ink-primary)]">
                            {copy.rotationLabel}
                          </label>
                          <span className="font-data text-[var(--ink-muted)]">{wmRotation}°</span>
                        </div>
                        <input
                          id={wmRotationId}
                          type="range"
                          min={-90}
                          max={90}
                          step={5}
                          value={wmRotation}
                          onChange={(e) => {
                            setWmRotation(Number(e.target.value));
                            setOutput(null);
                          }}
                          className="h-9 w-full accent-[var(--accent)]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Page Numbers Section */}
              <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="m-0 text-sm font-semibold text-[var(--ink-primary)]">
                    {copy.pageNumbersSectionTitle}
                  </h3>
                  <label
                    htmlFor={pnToggleId}
                    className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-[var(--ink-primary)]"
                  >
                    <input
                      id={pnToggleId}
                      type="checkbox"
                      checked={pnEnabled}
                      onChange={(e) => {
                        setPnEnabled(e.target.checked);
                        setOutput(null);
                      }}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span>{copy.pageNumbersToggleLabel}</span>
                  </label>
                </div>

                {pnEnabled && (
                  <div className="space-y-4 border-t border-[var(--border-subtle)] pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label
                          htmlFor={pnFormatId}
                          className="block text-sm font-medium text-[var(--ink-primary)]"
                        >
                          {copy.formatLabel}
                        </label>
                        <select
                          id={pnFormatId}
                          value={pnFormat}
                          onChange={(e) => {
                            setPnFormat(e.target.value as PageNumberFormat);
                            setOutput(null);
                          }}
                          className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                        >
                          {(Object.keys(copy.formats) as PageNumberFormat[]).map((fmt) => (
                            <option key={fmt} value={fmt}>
                              {copy.formats[fmt]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor={pnPosId}
                          className="block text-sm font-medium text-[var(--ink-primary)]"
                        >
                          {copy.pageNumberPositionLabel}
                        </label>
                        <select
                          id={pnPosId}
                          value={pnPosition}
                          onChange={(e) => {
                            setPnPosition(e.target.value as PageNumberPosition);
                            setOutput(null);
                          }}
                          className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                        >
                          {(Object.keys(copy.pageNumberPositions) as PageNumberPosition[]).map((pos) => (
                            <option key={pos} value={pos}>
                              {copy.pageNumberPositions[pos]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <label
                          htmlFor={pnStartId}
                          className="block text-sm font-medium text-[var(--ink-primary)]"
                        >
                          {copy.startNumberLabel}
                        </label>
                        <input
                          id={pnStartId}
                          type="number"
                          min={1}
                          max={9999}
                          value={pnStartNumber}
                          onChange={(e) => {
                            const val = Number.parseInt(e.target.value, 10);
                            setPnStartNumber(Number.isFinite(val) && val >= 1 ? val : 1);
                            setOutput(null);
                          }}
                          className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor={pnSizeId}
                          className="block text-sm font-medium text-[var(--ink-primary)]"
                        >
                          {copy.fontSizeLabel}
                        </label>
                        <input
                          id={pnSizeId}
                          type="number"
                          min={8}
                          max={24}
                          value={pnFontSize}
                          onChange={(e) => {
                            const val = Number.parseInt(e.target.value, 10);
                            setPnFontSize(Number.isFinite(val) ? Math.min(24, Math.max(8, val)) : 11);
                            setOutput(null);
                          }}
                          className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor={pnMarginId}
                          className="block text-sm font-medium text-[var(--ink-primary)]"
                        >
                          {copy.marginLabel}
                        </label>
                        <input
                          id={pnMarginId}
                          type="number"
                          min={12}
                          max={96}
                          value={pnMargin}
                          onChange={(e) => {
                            const val = Number.parseInt(e.target.value, 10);
                            setPnMargin(Number.isFinite(val) ? Math.min(96, Math.max(12, val)) : 28);
                            setOutput(null);
                          }}
                          className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label
                        htmlFor={pnSkipFirstId}
                        className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--ink-primary)]"
                      >
                        <input
                          id={pnSkipFirstId}
                          type="checkbox"
                          checked={pnSkipFirst}
                          onChange={(e) => {
                            setPnSkipFirst(e.target.checked);
                            setOutput(null);
                          }}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        <span>{copy.skipFirstPageLabel}</span>
                      </label>

                      <div className="flex items-center gap-2">
                        {COLOR_SWATCHES.map((swatch) => {
                          const active = pnColor.toUpperCase() === swatch.hex;
                          const label = locale === 'id' ? swatch.labelId : swatch.labelEn;
                          return (
                            <button
                              key={swatch.hex}
                              type="button"
                              aria-label={`${copy.pageNumbersSectionTitle} ${copy.colorLabel}: ${label}`}
                              aria-pressed={active}
                              onClick={() => {
                                setPnColor(swatch.hex);
                                setOutput(null);
                              }}
                              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
                                active
                                  ? 'border-[var(--accent)] bg-[var(--accent-tint)] ring-2 ring-[var(--accent)]/40'
                                  : 'border-[var(--border-control)] bg-[var(--bg-card)]'
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className="h-5 w-5 rounded-full border border-black/15"
                                style={{ backgroundColor: swatch.hex }}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Page Scope & Output Filename */}
              <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
                <div className="space-y-2">
                  <span className="block text-sm font-semibold text-[var(--ink-primary)]">
                    {copy.scopeHeading}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(['all', 'custom'] as const).map((scope) => {
                      const active = pageScope === scope;
                      return (
                        <button
                          key={scope}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setPageScope(scope);
                            setOutput(null);
                          }}
                          className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--accent-tint)] font-semibold text-[var(--ink-primary)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:border-[var(--border-control)]'
                          }`}
                        >
                          {scope === 'all' ? copy.scopeAll : copy.scopeCustom}
                        </button>
                      );
                    })}
                  </div>

                  {pageScope === 'custom' && (
                    <div className="space-y-1 pt-2">
                      <label
                        htmlFor={rangeInputId}
                        className="block text-sm font-medium text-[var(--ink-primary)]"
                      >
                        {copy.rangeLabel}
                      </label>
                      <input
                        id={rangeInputId}
                        type="text"
                        value={rangeSpec}
                        onChange={(e) => {
                          setRangeSpec(e.target.value);
                          setOutput(null);
                        }}
                        placeholder={copy.rangePlaceholder}
                        className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                      />
                      <p className="m-0 text-xs text-[var(--ink-muted)]">
                        {copy.rangeHint} {pageCount ? `(1-${pageCount})` : ''}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 border-t border-[var(--border-subtle)] pt-4">
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

                {validationIssue && (
                  <p className="m-0 text-xs font-medium text-[var(--danger)]">{validationIssue}</p>
                )}

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border-subtle)] pt-4">
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={isProcessing || inspecting || !pageCount || Boolean(validationIssue)}
                    className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
                  >
                    {copy.applyButton}
                  </button>
                </div>
              </div>
            </fieldset>

            {/* Live Simulated A4 Sheet Preview */}
            <aside
              aria-label={copy.previewHeading}
              className="space-y-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4 lg:sticky lg:top-20"
            >
              <h3 className="m-0 text-sm font-semibold text-[var(--ink-primary)]">
                {copy.previewHeading}
              </h3>

              <div
                aria-hidden="true"
                className="relative mx-auto aspect-[210/297] w-full max-w-[230px] overflow-hidden rounded-md border border-[var(--border-control)] bg-white shadow-xs"
              >
                {/* Faint simulated document lines */}
                <div className="space-y-2.5 p-5 opacity-25">
                  <div className="h-2.5 w-2/3 rounded bg-neutral-400" />
                  <div className="h-1.5 w-full rounded bg-neutral-300" />
                  <div className="h-1.5 w-11/12 rounded bg-neutral-300" />
                  <div className="h-1.5 w-4/5 rounded bg-neutral-300" />
                  <div className="pt-2" />
                  <div className="h-1.5 w-full rounded bg-neutral-300" />
                  <div className="h-1.5 w-10/12 rounded bg-neutral-300" />
                  <div className="h-1.5 w-9/12 rounded bg-neutral-300" />
                  <div className="pt-2" />
                  <div className="h-1.5 w-full rounded bg-neutral-300" />
                  <div className="h-1.5 w-3/4 rounded bg-neutral-300" />
                </div>

                {/* Live Watermark Overlay */}
                {wmEnabled && wmText.trim() && (
                  wmPosition === 'tiled' ? (
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-3 place-items-center overflow-hidden p-2">
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <span
                          key={idx}
                          className="font-sans font-bold tracking-wide whitespace-nowrap select-none"
                          style={{
                            color: wmColor,
                            opacity: wmOpacity,
                            fontSize: `${Math.max(9, Math.round(previewFontPx * 0.6))}px`,
                            transform: `rotate(${-wmRotation}deg)`,
                          }}
                        >
                          {wmText.trim()}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div
                      className={`pointer-events-none absolute inset-0 flex overflow-hidden ${getWatermarkPreviewAlignment(
                        wmPosition,
                      )}`}
                    >
                      <span
                        className="font-sans font-bold tracking-wide whitespace-nowrap select-none"
                        style={{
                          color: wmColor,
                          opacity: wmOpacity,
                          fontSize: `${previewFontPx}px`,
                          transform: `rotate(${-wmRotation}deg)`,
                        }}
                      >
                        {wmText.trim()}
                      </span>
                    </div>
                  )
                )}

                {/* Live Page Number Overlay */}
                {pnEnabled && (
                  <span
                    className={`pointer-events-none absolute font-sans font-medium whitespace-nowrap select-none ${getPageNumberPreviewClasses(
                      pnPosition,
                    )}`}
                    style={{
                      color: pnColor,
                      fontSize: `${previewNumberPx}px`,
                    }}
                  >
                    {previewPageNumber}
                  </span>
                )}
              </div>

              <p className="m-0 text-xs leading-relaxed text-[var(--ink-muted)]">
                {copy.previewHint}
              </p>
            </aside>
          </div>
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
                {output.filename} · {copy.resultSummaryPrefix}: {output.modifiedPages}/
                {output.pageCount} {dict.shared.pagesUnit} · {formatBytes(output.blob.size)}
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
