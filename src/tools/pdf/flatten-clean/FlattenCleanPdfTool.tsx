import { useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes } from '@/lib/format';
import { validatePdfFiles } from '@/lib/file-validation';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ErrorAlert from '@/components/shared/ErrorAlert';
import ProgressBanner from '@/components/shared/ProgressBanner';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import { rasterizePdfToJpegs } from '../compress/rasterize';
import {
  buildFlattenFilename,
  buildRasterizedCleanPdf,
  flattenFormsAndScrubPdf,
  FlattenPdfError,
  inspectPdfPrivacy,
  type FlattenMode,
  type PdfPrivacyInspection,
} from './flatten-clean.logic';

interface FlattenCleanPdfToolProps {
  locale: Locale;
}

interface CompletedOutput {
  blob: Blob;
  filename: string;
  pageCount: number;
  mode: FlattenMode;
  flattenedFields: number;
  removedAnnotations: number;
  scrubbedMetadata: number;
}

export default function FlattenCleanPdfTool({ locale }: FlattenCleanPdfToolProps) {
  const dict = getDictionary(locale);
  const isId = locale === 'id';

  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [inspection, setInspection] = useState<PdfPrivacyInspection | null>(null);

  const [mode, setMode] = useState<FlattenMode>('forms-and-metadata');
  const [flattenForms, setFlattenForms] = useState(true);
  const [stripMetadata, setStripMetadata] = useState(true);
  const [removeAnnotations, setRemoveAnnotations] = useState(false);
  const [rasterDpi, setRasterDpi] = useState<150 | 200 | 300>(200);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [output, setOutput] = useState<CompletedOutput | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const handleFilesSelected = async (incoming: File[]) => {
    setErrors([]);
    setOutput(null);

    const { accepted, errors: valErrors } = await validatePdfFiles(incoming.slice(0, 1), {
      tooLarge: isId ? 'Ukuran PDF melebihi batas 100 MB:' : 'PDF exceeds 100 MB limit:',
      notPdf: isId ? 'File bukan dokumen PDF yang valid:' : 'File is not a valid PDF document:',
      generic: isId ? 'Gagal membaca file PDF:' : 'Failed to read PDF file:',
    });

    if (valErrors.length > 0) {
      setErrors(valErrors);
      return;
    }
    if (accepted.length === 0) return;

    const chosen = accepted[0].file;
    try {
      const buf = await chosen.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const info = await inspectPdfPrivacy(bytes);
      setFile(chosen);
      setPdfBytes(bytes);
      setInspection(info);
    } catch (err) {
      if (err instanceof FlattenPdfError && err.code === 'ENCRYPTED') {
        setErrors([
          isId
            ? 'PDF ini terkunci kata sandi. Buka dulu sandinya di tool Kunci & Buka Sandi PDF.'
            : 'This PDF is password-protected. Unlock it first using the Protect & Unlock PDF tool.',
        ]);
      } else {
        setErrors([
          isId
            ? 'Gagal memeriksa file PDF. Pastikan dokumen tidak rusak.'
            : 'Could not inspect this PDF file. Please ensure it is not corrupted.',
        ]);
      }
    }
  };

  const handleProcess = async () => {
    if (!file || !pdfBytes || !inspection || isProcessing) return;
    setErrors([]);
    setOutput(null);
    setIsProcessing(true);
    setProgressPercent(10);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let outBytes: Uint8Array;
      let flattenedFields = 0;
      let removedAnnotations = 0;
      let scrubbedMetadata = 0;

      if (mode === 'forms-and-metadata') {
        setProgressLabel(
          isId
            ? 'Mengunci formulir & membersihkan metadata PDF...'
            : 'Flattening form fields & scrubbing PDF metadata...',
        );
        const res = await flattenFormsAndScrubPdf(pdfBytes, {
          flattenForms,
          stripMetadata,
          removeAnnotations,
        });
        outBytes = res.bytes;
        flattenedFields = res.flattenedFieldCount;
        removedAnnotations = res.removedAnnotationCount;
        scrubbedMetadata = res.scrubbedMetadataFields;
        setProgressPercent(100);
      } else {
        setProgressLabel(
          isId
            ? 'Merasterisasi halaman agar anti-edit...'
            : 'Rasterizing pages into uneditable images...',
        );
        const rawBuf = pdfBytes.buffer.slice(
          pdfBytes.byteOffset,
          pdfBytes.byteOffset + pdfBytes.byteLength,
        ) as ArrayBuffer;
        const rasterPages = await rasterizePdfToJpegs(rawBuf, {
          dpi: rasterDpi,
          jpegQuality: rasterDpi >= 300 ? 0.92 : 0.88,
          signal: controller.signal,
          onPageRendered: (current, total) => {
            setProgressPercent(Math.round(15 + (current / Math.max(1, total)) * 75));
            setProgressLabel(
              isId
                ? `Merasterisasi halaman ${current} dari ${total}...`
                : `Rasterizing page ${current} of ${total}...`,
            );
          },
        });

        setProgressLabel(isId ? 'Menyusun PDF bersih...' : 'Assembling clean PDF...');
        outBytes = await buildRasterizedCleanPdf(rasterPages);
        flattenedFields = inspection.formFieldCount;
        removedAnnotations = inspection.annotationCount;
        scrubbedMetadata = inspection.metadataFieldCount;
        setProgressPercent(100);
      }

      const blob = new Blob([new Uint8Array(outBytes)], { type: 'application/pdf' });
      const filename = buildFlattenFilename(file.name, mode);
      setOutput({
        blob,
        filename,
        pageCount: inspection.pageCount,
        mode,
        flattenedFields,
        removedAnnotations,
        scrubbedMetadata,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrors([isId ? 'Proses dibatalkan.' : 'Processing cancelled.']);
      } else {
        setErrors([
          isId
            ? 'Gagal memproses PDF. Coba ulangi atau gunakan mode lain.'
            : 'Failed to process PDF. Please try again or switch modes.',
        ]);
      }
    } finally {
      abortRef.current = null;
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPdfBytes(null);
    setInspection(null);
    setOutput(null);
    setErrors([]);
  };

  const metadataEntries = inspection
    ? ([
        [isId ? 'Judul' : 'Title', inspection.metadata.title],
        [isId ? 'Penulis' : 'Author', inspection.metadata.author],
        [isId ? 'Subjek' : 'Subject', inspection.metadata.subject],
        [isId ? 'Aplikasi Pembuat' : 'Creator', inspection.metadata.creator],
        [isId ? 'Producer PDF' : 'Producer', inspection.metadata.producer],
        [isId ? 'Kata Kunci' : 'Keywords', inspection.metadata.keywords],
        ['XMP Stream', inspection.hasXmpMetadata ? (isId ? 'Ada' : 'Present') : ''],
      ] as Array<[string, string]>).filter(([, val]) => Boolean(val))
    : [];

  return (
    <div className="space-y-5">
      {errors.length > 0 && (
        <ErrorAlert
          messages={errors}
          dismissLabel={dict.shared.dismissError}
          onDismiss={() => setErrors([])}
        />
      )}

      {!file || !inspection ? (
        <Dropzone
          accept=".pdf,application/pdf"
          multiple={false}
          idleLabel={
            isId
              ? 'Tarik & lepas file PDF di sini, atau klik untuk memilih'
              : 'Drag & drop a PDF file here, or click to browse'
          }
          activeLabel={isId ? 'Lepaskan file PDF di sini...' : 'Drop your PDF file here...'}
          buttonLabel={isId ? 'Pilih File PDF' : 'Choose PDF File'}
          formatsHint={isId ? '1 file PDF • Maks. 100 MB' : '1 PDF file • Max 100 MB'}
          onFilesSelected={(files) => {
            void handleFilesSelected(files);
          }}
        />
      ) : (
        <div className="space-y-5">
          {/* File & Privacy Inspection Summary */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)]/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <div>
                <p className="m-0 text-sm font-bold text-[var(--ink-primary)]">{file.name}</p>
                <p className="font-data m-0 mt-0.5 text-xs text-[var(--ink-muted)] tabular-nums">
                  {formatBytes(file.size)} · {inspection.pageCount}{' '}
                  {isId ? 'halaman' : inspection.pageCount === 1 ? 'page' : 'pages'}
                </p>
              </div>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleReset}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)] disabled:opacity-40"
              >
                {isId ? 'Ganti PDF' : 'Change PDF'}
              </button>
            </div>

            {/* Inspection counters */}
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                <div className="text-[11px] font-semibold text-[var(--ink-muted)]">
                  {isId ? 'Kolom Formulir (AcroForm)' : 'Form Fields (AcroForm)'}
                </div>
                <div className="font-data mt-1 text-lg font-extrabold text-[var(--ink-primary)] tabular-nums">
                  {inspection.formFieldCount}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                <div className="text-[11px] font-semibold text-[var(--ink-muted)]">
                  {isId ? 'Anotasi & Widget' : 'Annotations & Widgets'}
                </div>
                <div className="font-data mt-1 text-lg font-extrabold text-[var(--ink-primary)] tabular-nums">
                  {inspection.annotationCount}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                <div className="text-[11px] font-semibold text-[var(--ink-muted)]">
                  {isId ? 'Metadata Terdeteksi' : 'Detected Metadata'}
                </div>
                <div className="font-data mt-1 text-lg font-extrabold text-[var(--ink-primary)] tabular-nums">
                  {inspection.metadataFieldCount}
                </div>
              </div>
            </div>

            {metadataEntries.length > 0 && (
              <div className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                <p className="m-0 mb-2 text-[11px] font-bold tracking-wide text-[var(--ink-muted)] uppercase">
                  {isId ? 'Detail Metadata Tersembunyi' : 'Hidden Metadata Details'}
                </p>
                <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  {metadataEntries.map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="shrink-0 font-semibold text-[var(--ink-muted)]">{k}:</dt>
                      <dd className="m-0 truncate text-[var(--ink-primary)]" title={v}>
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          {/* Mode Selection */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode('forms-and-metadata')}
              className={`rounded-xl border p-4 text-left transition-colors ${
                mode === 'forms-and-metadata'
                  ? 'border-[var(--accent)] bg-[var(--accent-row-bg)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-extrabold text-[var(--ink-primary)]">
                  {isId ? 'Flatten Formulir & Bersihkan Metadata' : 'Flatten Forms & Clean Metadata'}
                </span>
                <span className="font-data rounded bg-[var(--bg-recess)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ink-muted)]">
                  {isId ? 'TEKS TAJAM' : 'VECTOR'}
                </span>
              </div>
              <p className="m-0 mt-1.5 text-xs leading-relaxed text-[var(--ink-muted)]">
                {isId
                  ? 'Mengunci kolom formulir interaktif dan menghapus metadata penulis tanpa menurunkan ketajaman teks atau membesarkan ukuran file.'
                  : 'Locks interactive form fields and strips hidden author metadata while keeping vector text sharp and searchable.'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode('full-raster')}
              className={`rounded-xl border p-4 text-left transition-colors ${
                mode === 'full-raster'
                  ? 'border-[var(--accent)] bg-[var(--accent-row-bg)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-extrabold text-[var(--ink-primary)]">
                  {isId ? 'Flatten Total (Anti-Edit / Gambar)' : 'Full Flatten (Uneditable Pages)'}
                </span>
                <span className="font-data rounded bg-[var(--bg-recess)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ink-muted)]">
                  READ-ONLY
                </span>
              </div>
              <p className="m-0 mt-1.5 text-xs leading-relaxed text-[var(--ink-muted)]">
                {isId
                  ? 'Merasterisasi seluruh halaman beserta tanda tangan/stempel menjadi gambar datar + nol metadata agar dokumen tidak bisa diubah.'
                  : 'Converts every page, annotation, and signature into flat high-DPI page images with zero metadata so nothing can be edited.'}
              </p>
            </button>
          </div>

          {/* Mode-specific Controls */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)]/40 p-4">
            {mode === 'forms-and-metadata' ? (
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-xs font-semibold text-[var(--ink-primary)]">
                  <input
                    type="checkbox"
                    checked={flattenForms}
                    onChange={(e) => setFlattenForms(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>{isId ? 'Kunci kolom formulir (AcroForm)' : 'Flatten form fields (AcroForm)'}</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-xs font-semibold text-[var(--ink-primary)]">
                  <input
                    type="checkbox"
                    checked={stripMetadata}
                    onChange={(e) => setStripMetadata(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>{isId ? 'Hapus semua metadata & XMP' : 'Strip all metadata & XMP'}</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-xs font-semibold text-[var(--ink-primary)]">
                  <input
                    type="checkbox"
                    checked={removeAnnotations}
                    onChange={(e) => setRemoveAnnotations(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  <span>{isId ? 'Hapus anotasi / komentar' : 'Remove annotations / comments'}</span>
                </label>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-xs font-bold text-[var(--ink-primary)]">
                    {isId ? 'Resolusi Halaman (DPI)' : 'Page Resolution (DPI)'}
                  </p>
                  <p className="m-0 text-[11px] text-[var(--ink-muted)]">
                    {isId
                      ? '200 DPI seimbang antara tajam dan ringan; 300 DPI untuk cetak resmi.'
                      : '200 DPI balances crispness and file size; 300 DPI is print-grade.'}
                  </p>
                </div>
                <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0.5">
                  {([150, 200, 300] as const).map((dpi) => (
                    <button
                      key={dpi}
                      type="button"
                      onClick={() => setRasterDpi(dpi)}
                      className={`font-data rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                        rasterDpi === dpi
                          ? 'bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                          : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                      }`}
                    >
                      {dpi} DPI
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {isProcessing && (
            <ProgressBanner
              title={isId ? 'Memproses PDF...' : 'Processing PDF...'}
              detail={progressLabel}
              percent={progressPercent}
              cancelLabel={isId ? 'Batal' : 'Cancel'}
              onCancel={() => abortRef.current?.abort()}
            />
          )}

          {/* Action CTA */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={
                isProcessing ||
                (mode === 'forms-and-metadata' &&
                  !flattenForms &&
                  !stripMetadata &&
                  !removeAnnotations)
              }
              onClick={() => void handleProcess()}
              className="btn-primary inline-flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-bold disabled:opacity-40"
            >
              {isProcessing
                ? isId
                  ? 'Memproses PDF...'
                  : 'Processing PDF...'
                : mode === 'full-raster'
                  ? isId
                    ? 'Flatten Total & Bersihkan PDF'
                    : 'Full Flatten & Clean PDF'
                  : isId
                    ? 'Flatten & Hapus Metadata'
                    : 'Flatten & Strip Metadata'}
            </button>
          </div>

          {/* Completed Output */}
          {output && (
            <div className="rounded-2xl border border-[var(--accent)] bg-[var(--accent-row-bg)] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-display m-0 text-sm font-extrabold text-[var(--ink-primary)]">
                    {isId ? 'PDF berhasil di-flatten & dibersihkan' : 'PDF flattened & cleaned'}
                  </p>
                  <p className="font-data m-0 text-xs text-[var(--ink-muted)] tabular-nums">
                    {output.filename} · {formatBytes(file.size)} → {formatBytes(output.blob.size)} ·{' '}
                    {output.scrubbedMetadata} {isId ? 'metadata dihapus' : 'metadata scrubbed'}
                    {output.flattenedFields > 0
                      ? ` · ${output.flattenedFields} ${isId ? 'field dikunci' : 'fields locked'}`
                      : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => downloadBlob(output.blob, output.filename)}
                  className="btn-primary inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-sm font-bold"
                >
                  <DownloadIcon className="h-4 w-4" />
                  <span>{isId ? 'Unduh PDF' : 'Download PDF'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {output && (
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
