import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { SITE_CONFIG } from '@/config/site';
import { formatBytes } from '@/lib/format';
import { hasPdfMagicBytes, readFileHeaderBytes } from '@/lib/file-validation';
import { runWorkerTask } from '@/lib/worker-client';
import { downloadAsZip, downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import { parsePageRanges, type SplitMode } from './range-parser';
import type {
  SplitInspectResponse,
  SplitWorkerRequest,
  SplitWorkerResponse,
} from './split.worker';

interface SplitOutputItem {
  filename: string;
  label: string;
  pageCount: number;
  blob: Blob;
}

interface SplitPdfToolProps {
  locale: Locale;
}

function createSplitWorker(): Worker {
  return new Worker(new URL('./split.worker.ts', import.meta.url), { type: 'module' });
}

export default function SplitPdfTool({ locale }: SplitPdfToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.splitPdf;
  const rangeInputId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [mode, setMode] = useState<SplitMode>('ranges');
  const [rangeSpec, setRangeSpec] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [outputs, setOutputs] = useState<SplitOutputItem[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleFileSelected = async (incoming: File[]) => {
    const selected = incoming[0];
    if (!selected) return;

    setErrors([]);
    setOutputs([]);

    if (selected.size > SITE_CONFIG.limits.pdfSoftMaxBytes) {
      setErrors([`${copy.errors.tooLarge} ${selected.name} (${formatBytes(selected.size)})`]);
      return;
    }

    try {
      const header = await readFileHeaderBytes(selected, 1024);
      if (!hasPdfMagicBytes(header)) {
        setErrors([`${copy.errors.notPdf} ${selected.name}`]);
        return;
      }
    } catch {
      setErrors([`${copy.errors.corrupt} ${selected.name}`]);
      return;
    }

    setFile(selected);
    setPageCount(null);
    setInspecting(true);

    try {
      const buffer = await selected.arrayBuffer();
      const inspected = await runWorkerTask<SplitWorkerRequest, SplitInspectResponse>(
        createSplitWorker,
        { action: 'inspect', buffer },
        { transfer: [buffer] },
      );
      setPageCount(inspected.pageCount);
      setRangeSpec(inspected.pageCount > 1 ? `1-${Math.ceil(inspected.pageCount / 2)}` : '1');
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

  const rangePreview = useMemo(() => {
    if (!pageCount || mode === 'all-pages') return null;
    try {
      const groups = parsePageRanges(rangeSpec, pageCount);
      const outputCount = mode === 'extract-single' ? 1 : groups.length;
      const totalSelectedPages = groups.reduce((sum, g) => sum + g.pageIndices.length, 0);
      return { valid: true as const, outputCount, totalSelectedPages };
    } catch {
      return { valid: false as const };
    }
  }, [mode, pageCount, rangeSpec]);

  const resetAll = () => {
    abortRef.current?.abort();
    setFile(null);
    setPageCount(null);
    setInspecting(false);
    setRangeSpec('');
    setErrors([]);
    setOutputs([]);
    setIsSplitting(false);
    setProgress({ percent: 0, detail: '' });
  };

  const handleSplit = async () => {
    if (!file || !pageCount) return;

    if (mode !== 'all-pages') {
      try {
        parsePageRanges(rangeSpec, pageCount);
      } catch (err) {
        const code = (err as Error & { code?: string }).code;
        if (code === 'OUT_OF_RANGE') {
          setErrors([`${copy.errors.outOfRange} (1-${pageCount}).`]);
        } else {
          setErrors([copy.errors.invalidRange]);
        }
        return;
      }
    }

    setErrors([]);
    setOutputs([]);
    setIsSplitting(true);
    setProgress({ percent: 5, detail: copy.progressStarting });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const buffer = await file.arrayBuffer();
      const response = await runWorkerTask<SplitWorkerRequest, SplitWorkerResponse>(
        createSplitWorker,
        {
          action: 'split',
          buffer,
          mode,
          rangeSpec: mode === 'all-pages' ? undefined : rangeSpec,
          baseName: file.name,
        },
        {
          transfer: [buffer],
          signal: controller.signal,
          onProgress: (evt) => {
            const detail = evt.label
              ? `${copy.progressSplitting} ${evt.current ?? ''}/${evt.total ?? ''}: ${evt.label}`
              : copy.progressStarting;
            setProgress({ percent: evt.percent, detail });
          },
        },
      );

      setOutputs(
        response.files.map((item) => ({
          filename: item.filename,
          label: item.label,
          pageCount: item.pageCount,
          blob: new Blob([item.buffer], { type: 'application/pdf' }),
        })),
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const code = (err as Error & { code?: string }).code;
      if (code === 'OUT_OF_RANGE') {
        setErrors([`${copy.errors.outOfRange} (1-${pageCount}).`]);
      } else if (code === 'INVALID_RANGE') {
        setErrors([copy.errors.invalidRange]);
      } else {
        setErrors([copy.errors.generic]);
      }
    } finally {
      setIsSplitting(false);
      abortRef.current = null;
    }
  };

  const handleDownloadZip = async () => {
    if (outputs.length === 0 || !file) return;
    setIsZipping(true);
    try {
      const stem = file.name.replace(/\.pdf$/i, '') || 'izikit-split';
      await downloadAsZip(
        outputs.map((item) => ({ filename: item.filename, blob: item.blob })),
        `${stem}-split.zip`,
      );
    } finally {
      setIsZipping(false);
    }
  };

  const modeOptions: Array<{ value: SplitMode; title: string; description: string }> = [
    {
      value: 'ranges',
      title: copy.modeRangesTitle,
      description: copy.modeRangesDesc,
    },
    {
      value: 'extract-single',
      title: copy.modeExtractTitle,
      description: copy.modeExtractDesc,
    },
    {
      value: 'all-pages',
      title: copy.modeAllTitle,
      description: copy.modeAllDesc,
    },
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
          accept=".pdf,application/pdf"
          multiple={false}
          disabled={isSplitting}
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
                  : `${pageCount ?? 0} ${dict.mergePdf.pagesUnit}`}
              </p>
            </div>
            <button
              type="button"
              onClick={resetAll}
              disabled={isSplitting}
              className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-xs font-medium"
            >
              {copy.changeFileButton}
            </button>
          </div>

          {/* Mode Selection */}
          <fieldset
            disabled={isSplitting || inspecting}
            className="m-0 space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
          >
            <legend className="px-1 text-sm font-semibold text-[var(--ink-primary)]">
              {copy.modeHeading}
            </legend>

            <div className="grid gap-3 md:grid-cols-3">
              {modeOptions.map((opt) => {
                const selected = mode === opt.value;
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
                        name="split-mode"
                        value={opt.value}
                        checked={selected}
                        onChange={() => {
                          setMode(opt.value);
                          setOutputs([]);
                        }}
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

            {mode !== 'all-pages' && (
              <div className="space-y-1.5 pt-1">
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
                    setOutputs([]);
                  }}
                  placeholder={copy.rangePlaceholder}
                  className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                />
                <p className="m-0 text-xs text-[var(--ink-muted)]">
                  {copy.rangeHint}{' '}
                  {pageCount ? `(1-${pageCount})` : ''}
                </p>
                {rangePreview && (
                  <p
                    className={`font-data m-0 text-xs font-medium ${
                      rangePreview.valid ? 'text-[var(--success)]' : 'text-[var(--danger)]'
                    }`}
                  >
                    {rangePreview.valid
                      ? `${copy.previewSummary}: ${rangePreview.outputCount} ${copy.filesUnit} (${rangePreview.totalSelectedPages} ${dict.mergePdf.pagesUnit})`
                      : copy.errors.invalidRange}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border-subtle)] pt-4">
              <button
                type="button"
                onClick={handleSplit}
                disabled={
                  isSplitting ||
                  inspecting ||
                  !pageCount ||
                  (mode !== 'all-pages' && !rangePreview?.valid)
                }
                className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
              >
                {copy.splitButton}
              </button>
            </div>
          </fieldset>
        </div>
      )}

      {isSplitting && (
        <ProgressBanner
          title={dict.shared.processingTitle}
          detail={progress.detail}
          percent={progress.percent}
          cancelLabel={dict.shared.cancelAction}
          onCancel={() => abortRef.current?.abort()}
        />
      )}

      {outputs.length > 0 && !isSplitting && (
        <div className="space-y-4 rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                {copy.resultReadyTitle} ({outputs.length} {copy.filesUnit})
              </h3>
            </div>

            {outputs.length > 1 ? (
              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={isZipping}
                className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
              >
                <DownloadIcon className="h-4 w-4" />
                <span>{isZipping ? dict.compressImage.buildingZip : copy.downloadZip}</span>
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
                key={item.filename}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-medium text-[var(--ink-primary)]">
                    {item.filename}
                  </p>
                  <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                    {item.pageCount} {dict.mergePdf.pagesUnit} · {formatBytes(item.blob.size)}
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
