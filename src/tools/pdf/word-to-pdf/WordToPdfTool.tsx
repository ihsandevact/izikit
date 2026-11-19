import { useEffect, useId, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes, sanitizeFilename } from '@/lib/format';
import { validateDocxFiles } from '@/lib/file-validation';
import { runWorkerTask } from '@/lib/worker-client';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ProgressBanner from '@/components/shared/ProgressBanner';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import type {
  DocxSummary,
  WordFontFamily,
  WordMarginPreset,
  WordPaperSize,
} from './types';
import type {
  WordToPdfInspectResponse,
  WordToPdfWorkerRequest,
  WordToPdfWorkerResponse,
} from './word-to-pdf.worker';

interface WordToPdfToolProps {
  locale: Locale;
}

interface WordToPdfOutputState {
  filename: string;
  pageCount: number;
  blob: Blob;
}

function createWordToPdfWorker(): Worker {
  return new Worker(new URL('./word-to-pdf.worker.ts', import.meta.url), { type: 'module' });
}

export default function WordToPdfTool({ locale }: WordToPdfToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.wordToPdf;

  const paperId = useId();
  const marginId = useId();
  const fontId = useId();
  const spacingId = useId();
  const pageNumId = useId();
  const outputNameId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<DocxSummary | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const [paperSize, setPaperSize] = useState<WordPaperSize>('a4');
  const [marginPreset, setMarginPreset] = useState<WordMarginPreset>('normal');
  const [fontFamily, setFontFamily] = useState<WordFontFamily>('sans');
  const [lineSpacing, setLineSpacing] = useState<number>(1.35);
  const [includePageNumbers, setIncludePageNumbers] = useState(true);
  const [outputName, setOutputName] = useState('');

  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, detail: '' });
  const [output, setOutput] = useState<WordToPdfOutputState | null>(null);

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
      const { accepted, errors: validationErrors } = await validateDocxFiles([selected], {
        tooLarge: copy.errors.tooLarge,
        notDocx: copy.errors.notDocx,
        generic: copy.errors.invalidDocx,
      });

      if (validationErrors.length > 0 || accepted.length === 0) {
        setErrors(
          validationErrors.length > 0
            ? validationErrors
            : [`${copy.errors.notDocx} ${selected.name}`],
        );
        return;
      }

      setFile(selected);
      setSummary(null);
      setInspecting(true);
      const stem = selected.name.replace(/\.docx$/i, '') || 'izikit-document';
      setOutputName(`${stem}.pdf`);

      const buffer = await selected.arrayBuffer();
      const inspected = await runWorkerTask<WordToPdfWorkerRequest, WordToPdfInspectResponse>(
        createWordToPdfWorker,
        { action: 'inspect', buffer },
        { transfer: [buffer] },
      );
      setSummary(inspected);
    } catch {
      setFile(null);
      setErrors([`${copy.errors.invalidDocx} ${selected.name}`]);
    } finally {
      setInspecting(false);
    }
  };

  const resetAll = () => {
    abortRef.current?.abort();
    setFile(null);
    setSummary(null);
    setInspecting(false);
    setErrors([]);
    setOutput(null);
    setIsProcessing(false);
    setProgress({ percent: 0, detail: '' });
  };

  const handleConvert = async () => {
    if (!file) return;

    setErrors([]);
    setOutput(null);
    setIsProcessing(true);
    setProgress({ percent: 10, detail: copy.progressConverting });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const buffer = await file.arrayBuffer();
      const response = await runWorkerTask<WordToPdfWorkerRequest, WordToPdfWorkerResponse>(
        createWordToPdfWorker,
        {
          action: 'convert',
          buffer,
          options: {
            paperSize,
            marginPreset,
            fontFamily,
            lineSpacing,
            includePageNumbers,
          },
        },
        {
          transfer: [buffer],
          signal: controller.signal,
          onProgress: (evt) => {
            setProgress({ percent: evt.percent, detail: copy.progressConverting });
          },
        },
      );

      const safeFilename = sanitizeFilename(
        outputName || `${file.name.replace(/\.docx$/i, '')}.pdf`,
        'izikit-converted.pdf',
      );
      const finalName = safeFilename.toLowerCase().endsWith('.pdf')
        ? safeFilename
        : `${safeFilename}.pdf`;

      setOutput({
        filename: finalName,
        pageCount: response.pageCount,
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

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {!file ? (
        <Dropzone
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                {formatBytes(file.size)} ·{' '}
                {inspecting || !summary
                  ? copy.inspectingDocx
                  : `${summary.wordCount} ${copy.wordsUnit}`}
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

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-start">
            {/* Layout & Typography Options */}
            <fieldset
              disabled={isProcessing || inspecting}
              className="m-0 space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
            >
              <legend className="px-1 text-sm font-semibold text-[var(--ink-primary)]">
                {copy.layoutHeading}
              </legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor={paperId}
                    className="block text-sm font-medium text-[var(--ink-primary)]"
                  >
                    {copy.paperSizeLabel}
                  </label>
                  <select
                    id={paperId}
                    value={paperSize}
                    onChange={(e) => {
                      setPaperSize(e.target.value as WordPaperSize);
                      setOutput(null);
                    }}
                    className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                  >
                    <option value="a4">{copy.paperA4}</option>
                    <option value="letter">{copy.paperLetter}</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={marginId}
                    className="block text-sm font-medium text-[var(--ink-primary)]"
                  >
                    {copy.marginLabel}
                  </label>
                  <select
                    id={marginId}
                    value={marginPreset}
                    onChange={(e) => {
                      setMarginPreset(e.target.value as WordMarginPreset);
                      setOutput(null);
                    }}
                    className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                  >
                    <option value="normal">{copy.marginNormal}</option>
                    <option value="narrow">{copy.marginNarrow}</option>
                    <option value="wide">{copy.marginWide}</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor={fontId}
                    className="block text-sm font-medium text-[var(--ink-primary)]"
                  >
                    {copy.fontFamilyLabel}
                  </label>
                  <select
                    id={fontId}
                    value={fontFamily}
                    onChange={(e) => {
                      setFontFamily(e.target.value as WordFontFamily);
                      setOutput(null);
                    }}
                    className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                  >
                    <option value="sans">{copy.fontSans}</option>
                    <option value="serif">{copy.fontSerif}</option>
                    <option value="mono">{copy.fontMono}</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor={spacingId}
                    className="block text-sm font-medium text-[var(--ink-primary)]"
                  >
                    {copy.lineSpacingLabel}
                  </label>
                  <select
                    id={spacingId}
                    value={lineSpacing}
                    onChange={(e) => {
                      setLineSpacing(Number(e.target.value));
                      setOutput(null);
                    }}
                    className="font-data h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                  >
                    <option value={1.15}>1.15</option>
                    <option value={1.35}>1.35</option>
                    <option value={1.5}>1.50</option>
                  </select>
                </div>
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

              <label
                htmlFor={pageNumId}
                className="inline-flex min-h-11 items-center gap-2.5 text-sm text-[var(--ink-primary)]"
              >
                <input
                  id={pageNumId}
                  type="checkbox"
                  checked={includePageNumbers}
                  onChange={(e) => {
                    setIncludePageNumbers(e.target.checked);
                    setOutput(null);
                  }}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>{copy.pageNumbersLabel}</span>
              </label>

              <div className="flex justify-end border-t border-[var(--border-subtle)] pt-4">
                <button
                  type="button"
                  onClick={handleConvert}
                  disabled={isProcessing || inspecting || !summary}
                  className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-6 text-sm font-semibold"
                >
                  {copy.convertButton}
                </button>
              </div>
            </fieldset>

            {/* Document Structure Summary & Content Outline */}
            {summary && (
              <aside
                aria-label={copy.summaryHeading}
                className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
              >
                <h3 className="m-0 text-sm font-semibold text-[var(--ink-primary)]">
                  {copy.summaryHeading}
                </h3>

                <div className="font-data grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-2">
                    <span className="block font-bold text-[var(--ink-primary)]">
                      {summary.headingCount}
                    </span>
                    <span className="text-[var(--ink-muted)]">{copy.headingsUnit}</span>
                  </div>
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-2">
                    <span className="block font-bold text-[var(--ink-primary)]">
                      {summary.paragraphCount}
                    </span>
                    <span className="text-[var(--ink-muted)]">{copy.paragraphsUnit}</span>
                  </div>
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-2">
                    <span className="block font-bold text-[var(--ink-primary)]">
                      {summary.listItemCount}
                    </span>
                    <span className="text-[var(--ink-muted)]">{copy.listsUnit}</span>
                  </div>
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-2">
                    <span className="block font-bold text-[var(--ink-primary)]">
                      {summary.tableCount} {copy.tablesUnit} · {summary.imageCount}{' '}
                      {copy.imagesUnit}
                    </span>
                    <span className="text-[var(--ink-muted)]">OpenXML</span>
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-[var(--border-subtle)] pt-3">
                  <span className="block text-xs font-semibold text-[var(--ink-primary)]">
                    {copy.previewHeading}
                  </span>
                  {summary.previewItems.length === 0 ? (
                    <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.previewEmpty}</p>
                  ) : (
                    <ul className="m-0 max-h-52 list-none space-y-1.5 overflow-y-auto p-0">
                      {summary.previewItems.map((item, idx) => (
                        <li
                          key={idx}
                          className="rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs"
                        >
                          <span className="font-data mr-1.5 text-[10px] font-bold tracking-wide text-[var(--accent)] uppercase">
                            {item.kind}
                          </span>
                          <span
                            className={
                              item.kind === 'heading'
                                ? 'font-semibold text-[var(--ink-primary)]'
                                : 'text-[var(--ink-muted)]'
                            }
                          >
                            {item.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </aside>
            )}
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
