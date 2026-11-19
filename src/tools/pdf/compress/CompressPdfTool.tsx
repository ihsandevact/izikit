import { useEffect, useId, useRef, useState } from 'react';
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
import type { CompressPdfMode, PdfPageSizeTarget, RasterizeDpi } from './plan';
import { rasterizePdfToJpegs } from './rasterize';
import type {
  CompressPdfInspectResponse,
  CompressPdfWorkerRequest,
  CompressPdfWorkerResponse,
} from './compress-pdf.worker';

interface CompressPdfToolProps {
  locale: Locale;
}

interface CompressPdfOutputState {
  filename: string;
  pageCount: number;
  originalBytes: number;
  finalBytes: number;
  savedBytes: number;
  savedPercent: number;
  keptOriginal: boolean;
  modeUsed: CompressPdfMode;
  blob: Blob;
}

function createCompressPdfWorker(): Worker {
  return new Worker(new URL('./compress-pdf.worker.ts', import.meta.url), { type: 'module' });
}

export default function CompressPdfTool({ locale }: CompressPdfToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.compressPdf;

  const stripMetaId = useId();
  const pageSizeId = useId();
  const dpiId = useId();
  const qualityId = useId();
  const outputNameId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [inspectInfo, setInspectInfo] = useState<CompressPdfInspectResponse | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const [mode, setMode] = useState<CompressPdfMode>('lossless');
  const [stripMetadata, setStripMetadata] = useState(true);
  const [pageSize, setPageSize] = useState<PdfPageSizeTarget>('keep');
  const [dpi, setDpi] = useState<RasterizeDpi>(120);
  const [jpegQuality, setJpegQuality] = useState(0.72);
  const [outputName, setOutputName] = useState('');

  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [output, setOutput] = useState<CompressPdfOutputState | null>(null);

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
      const stem = selected.name.replace(/\.pdf$/i, '') || 'izikit-document';
      setOutputName(`${stem}-compressed.pdf`);

      const buffer = await selected.arrayBuffer();
      const info = await runWorkerTask<CompressPdfWorkerRequest, CompressPdfInspectResponse>(
        createCompressPdfWorker,
        { action: 'inspect', buffer },
        { transfer: [buffer] },
      );
      setInspectInfo(info);
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
    setInspectInfo(null);
    setInspecting(false);
    setErrors([]);
    setOutput(null);
    setIsProcessing(false);
    setProgress({ percent: 0, detail: '' });
  };

  const runCompression = async (chosenMode: CompressPdfMode) => {
    if (!file || !inspectInfo) return;

    setErrors([]);
    setOutput(null);
    setIsProcessing(true);
    setProgress({ percent: 5, detail: copy.progressStarting });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let response: CompressPdfWorkerResponse;

      if (chosenMode === 'lossless') {
        const buffer = await file.arrayBuffer();
        response = await runWorkerTask<CompressPdfWorkerRequest, CompressPdfWorkerResponse>(
          createCompressPdfWorker,
          {
            action: 'optimize',
            buffer,
            options: {
              mode: 'lossless',
              stripMetadata,
              pageSize,
              dpi,
              jpegQuality,
            },
          },
          {
            transfer: [buffer],
            signal: controller.signal,
            onProgress: (evt) => {
              const detail =
                evt.current && evt.total
                  ? `${copy.progressPacking} (${evt.current}/${evt.total})`
                  : copy.progressPacking;
              setProgress({ percent: evt.percent, detail });
            },
          },
        );
      } else {
        const sourceBuffer = await file.arrayBuffer();
        const renderedPages = await rasterizePdfToJpegs(sourceBuffer, {
          dpi,
          jpegQuality,
          signal: controller.signal,
          onPageRendered: (current, total) => {
            const pct = Math.max(8, Math.round((current / total) * 70));
            setProgress({
              percent: pct,
              detail: `${copy.progressRendering} ${current}/${total}`,
            });
          },
        });

        setProgress({ percent: 75, detail: copy.progressPacking });
        const transferables = renderedPages.map((p) => p.jpegBuffer);

        response = await runWorkerTask<CompressPdfWorkerRequest, CompressPdfWorkerResponse>(
          createCompressPdfWorker,
          {
            action: 'pack-jpegs',
            pages: renderedPages,
            originalByteLength: file.size,
            pageSize,
            stripMetadata,
          },
          {
            transfer: transferables,
            signal: controller.signal,
            onProgress: (evt) => {
              const mapped = 75 + Math.round(evt.percent * 0.25);
              setProgress({ percent: Math.min(100, mapped), detail: copy.progressPacking });
            },
          },
        );
      }

      const safeFilename = sanitizeFilename(
        outputName || `${file.name.replace(/\.pdf$/i, '')}-compressed.pdf`,
        'izikit-compressed.pdf',
      );
      const finalName = safeFilename.toLowerCase().endsWith('.pdf')
        ? safeFilename
        : `${safeFilename}.pdf`;

      const finalBlob = response.keptOriginal
        ? file
        : new Blob([response.buffer], { type: 'application/pdf' });

      setOutput({
        filename: finalName,
        pageCount: response.pageCount,
        originalBytes: response.originalBytes,
        finalBytes: response.keptOriginal ? file.size : response.finalBytes,
        savedBytes: response.savedBytes,
        savedPercent: response.savedPercent,
        keptOriginal: response.keptOriginal,
        modeUsed: chosenMode,
        blob: finalBlob,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const code = (err as Error & { code?: string }).code;
      if (code === 'ENCRYPTED') {
        setErrors([`${copy.errors.encrypted} ${file.name}`]);
      } else if (code === 'CORRUPT') {
        setErrors([`${copy.errors.corrupt} ${file.name}`]);
      } else {
        setErrors([copy.errors.generic]);
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
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
                {inspecting || !inspectInfo
                  ? copy.inspectingPages
                  : `${inspectInfo.pageCount} ${dict.shared.pagesUnit} (${inspectInfo.firstPageWidth}×${inspectInfo.firstPageHeight} pt)`}
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

          <fieldset
            disabled={isProcessing || inspecting}
            className="m-0 space-y-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
          >
            <legend className="px-1 text-sm font-semibold text-[var(--ink-primary)]">
              {copy.modeHeading}
            </legend>

            {/* Mode Cards */}
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  {
                    value: 'lossless' as const,
                    title: copy.modeLosslessTitle,
                    description: copy.modeLosslessDesc,
                  },
                  {
                    value: 'rasterize' as const,
                    title: copy.modeRasterizeTitle,
                    description: copy.modeRasterizeDesc,
                  },
                ]
              ).map((opt) => {
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
                        name="compress-pdf-mode"
                        value={opt.value}
                        checked={selected}
                        onChange={() => {
                          setMode(opt.value);
                          setOutput(null);
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

            {mode === 'rasterize' && (
              <div className="space-y-4 rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] p-4">
                <p className="m-0 text-xs leading-relaxed text-[var(--ink-muted)]">
                  {copy.rasterizeNotice}
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor={dpiId}
                      className="block text-sm font-medium text-[var(--ink-primary)]"
                    >
                      {copy.dpiLabel}
                    </label>
                    <select
                      id={dpiId}
                      value={dpi}
                      onChange={(e) => {
                        setDpi(Number(e.target.value) as RasterizeDpi);
                        setOutput(null);
                      }}
                      className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-paper)] px-3 text-sm text-[var(--ink-primary)]"
                    >
                      <option value={96}>{copy.dpi96}</option>
                      <option value={120}>{copy.dpi120}</option>
                      <option value={150}>{copy.dpi150}</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <label htmlFor={qualityId} className="font-medium text-[var(--ink-primary)]">
                        {copy.qualityLabel}
                      </label>
                      <span className="font-data text-xs text-[var(--ink-muted)]">
                        {Math.round(jpegQuality * 100)}%
                      </span>
                    </div>
                    <input
                      id={qualityId}
                      type="range"
                      min={0.5}
                      max={0.88}
                      step={0.02}
                      value={jpegQuality}
                      onChange={(e) => {
                        setJpegQuality(Number(e.target.value));
                        setOutput(null);
                      }}
                      className="h-11 w-full accent-[var(--accent)]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Page Size & Metadata Options */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor={pageSizeId}
                  className="block text-sm font-medium text-[var(--ink-primary)]"
                >
                  {copy.pageSizeLabel}
                </label>
                <select
                  id={pageSizeId}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(e.target.value as PdfPageSizeTarget);
                    setOutput(null);
                  }}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value="keep">{copy.pageSizeKeep}</option>
                  <option value="a4">{copy.pageSizeA4}</option>
                  <option value="letter">{copy.pageSizeLetter}</option>
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

            <label
              htmlFor={stripMetaId}
              className="inline-flex min-h-11 items-center gap-2.5 text-sm text-[var(--ink-primary)]"
            >
              <input
                id={stripMetaId}
                type="checkbox"
                checked={stripMetadata}
                onChange={(e) => {
                  setStripMetadata(e.target.checked);
                  setOutput(null);
                }}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span>{copy.stripMetadataLabel}</span>
            </label>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border-subtle)] pt-4">
              <button
                type="button"
                onClick={() => runCompression(mode)}
                disabled={isProcessing || inspecting || !inspectInfo}
                className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
              >
                {copy.compressButton}
              </button>
            </div>
          </fieldset>
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
                {output.filename} · {output.pageCount} {dict.shared.pagesUnit}
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

          <div className="grid gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5 sm:grid-cols-3">
            <div>
              <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.resultBeforeLabel}</p>
              <p className="font-data m-0 mt-0.5 text-sm font-semibold text-[var(--ink-primary)]">
                {formatBytes(output.originalBytes)}
              </p>
            </div>
            <div>
              <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.resultAfterLabel}</p>
              <p className="font-data m-0 mt-0.5 text-sm font-semibold text-[var(--ink-primary)]">
                {formatBytes(output.finalBytes)}
              </p>
            </div>
            <div>
              <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.resultSavedLabel}</p>
              <p className="font-data m-0 mt-0.5 text-sm font-semibold text-[var(--success)]">
                {output.savedPercent > 0
                  ? `-${output.savedPercent}% (${formatBytes(output.savedBytes)})`
                  : output.savedPercent === 0
                    ? '0%'
                    : `+${Math.abs(output.savedPercent)}%`}
              </p>
            </div>
          </div>

          {output.keptOriginal && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-4 py-3">
              <p className="m-0 text-xs leading-relaxed text-[var(--ink-muted)]">
                {copy.keptOriginalNotice}
              </p>
              {output.modeUsed === 'lossless' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('rasterize');
                    runCompression('rasterize');
                  }}
                  className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-xs font-semibold"
                >
                  {copy.tryStrongModeCta}
                </button>
              )}
            </div>
          )}

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
