import { useEffect, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import {
  comparePdfPage,
  openPdfDocument,
  type LoadedPdfHandle,
  type PageComparisonResult,
} from './diff-renderer';

interface ComparePdfToolProps {
  locale: Locale;
}

type DiffViewMode = 'overlay' | 'side-by-side' | 'text';

export default function ComparePdfTool({ locale }: ComparePdfToolProps) {
  const dict = getDictionary(locale);
  const isId = locale === 'id';

  const [pdfA, setPdfA] = useState<LoadedPdfHandle | null>(null);
  const [pdfB, setPdfB] = useState<LoadedPdfHandle | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [threshold, setThreshold] = useState(28);
  const [viewMode, setViewMode] = useState<DiffViewMode>('overlay');

  const [loadingPdf, setLoadingPdf] = useState<'A' | 'B' | null>(null);
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<PageComparisonResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasCompared, setHasCompared] = useState(false);

  const maxPages = Math.max(pdfA?.numPages ?? 0, pdfB?.numPages ?? 0);

  // Clean up PDF.js handles on unmount
  useEffect(() => {
    return () => {
      pdfA?.doc.destroy().catch(() => {});
    };
  }, [pdfA]);

  useEffect(() => {
    return () => {
      pdfB?.doc.destroy().catch(() => {});
    };
  }, [pdfB]);

  const handleLoadPdf = async (slot: 'A' | 'B', files: File[]) => {
    const file = files[0];
    if (!file) return;
    setErrorMsg(null);
    setLoadingPdf(slot);
    try {
      const handle = await openPdfDocument(file);
      if (slot === 'A') {
        setPdfA(handle);
      } else {
        setPdfB(handle);
      }
      setPageNumber(1);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isId
            ? 'Gagal membuka file PDF. Pastikan file tidak terenkripsi.'
            : 'Failed to open PDF file. Ensure it is not password-protected.',
      );
    } finally {
      setLoadingPdf(null);
    }
  };

  // Run comparison automatically whenever both PDFs, pageNumber, or threshold change
  useEffect(() => {
    if (!pdfA || !pdfB) {
      setComparison(null);
      return;
    }

    let cancelled = false;
    setComparing(true);
    setErrorMsg(null);

    comparePdfPage(pdfA, pdfB, pageNumber, threshold)
      .then((res) => {
        if (!cancelled) {
          setComparison(res);
          setHasCompared(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Gagal membandingkan halaman PDF.');
        }
      })
      .finally(() => {
        if (!cancelled) setComparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pdfA, pdfB, pageNumber, threshold]);

  const handleDownloadDiffPng = async () => {
    if (!comparison?.diffDataUrl) return;
    const res = await fetch(comparison.diffDataUrl);
    const blob = await res.blob();
    downloadBlob(blob, `izikit-pdf-diff-page-${pageNumber}.png`);
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <ErrorAlert
          messages={[errorMsg]}
          dismissLabel={dict.shared.dismissError}
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      {/* Dual Dropzones */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Slot A */}
        <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-extrabold text-[var(--ink-primary)]">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              {isId ? 'PDF Asli (Versi A)' : 'Original PDF (Version A)'}
            </span>
            {pdfA && (
              <button
                type="button"
                onClick={() => setPdfA(null)}
                className="text-xs font-semibold text-[var(--ink-muted)] hover:text-rose-500"
              >
                {isId ? 'Ganti' : 'Replace'}
              </button>
            )}
          </div>

          {pdfA ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-3.5 py-3">
              <p className="m-0 truncate text-xs font-bold text-[var(--ink-primary)]">
                {pdfA.filename}
              </p>
              <p className="font-data m-0 mt-0.5 text-[11px] text-[var(--ink-muted)]">
                {pdfA.numPages} {isId ? 'halaman' : 'pages'}
              </p>
            </div>
          ) : (
            <Dropzone
              accept=".pdf,application/pdf"
              multiple={false}
              compact
              idleLabel={dict.shared.dropzoneIdle}
              activeLabel={dict.shared.dropzoneActive}
              buttonLabel={dict.shared.dropzoneSelectButton}
              formatsHint={
                loadingPdf === 'A'
                  ? isId
                    ? 'Memuat PDF A...'
                    : 'Loading PDF A...'
                  : isId
                    ? 'Pilih dokumen PDF pertama (lama / asli)'
                    : 'Select first PDF (original)'
              }
              onFilesSelected={(files) => handleLoadPdf('A', files)}
            />
          )}
        </div>

        {/* Slot B */}
        <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-extrabold text-[var(--ink-primary)]">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              {isId ? 'PDF Revisi (Versi B)' : 'Revised PDF (Version B)'}
            </span>
            {pdfB && (
              <button
                type="button"
                onClick={() => setPdfB(null)}
                className="text-xs font-semibold text-[var(--ink-muted)] hover:text-rose-500"
              >
                {isId ? 'Ganti' : 'Replace'}
              </button>
            )}
          </div>

          {pdfB ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-3.5 py-3">
              <p className="m-0 truncate text-xs font-bold text-[var(--ink-primary)]">
                {pdfB.filename}
              </p>
              <p className="font-data m-0 mt-0.5 text-[11px] text-[var(--ink-muted)]">
                {pdfB.numPages} {isId ? 'halaman' : 'pages'}
              </p>
            </div>
          ) : (
            <Dropzone
              accept=".pdf,application/pdf"
              multiple={false}
              compact
              idleLabel={dict.shared.dropzoneIdle}
              activeLabel={dict.shared.dropzoneActive}
              buttonLabel={dict.shared.dropzoneSelectButton}
              formatsHint={
                loadingPdf === 'B'
                  ? isId
                    ? 'Memuat PDF B...'
                    : 'Loading PDF B...'
                  : isId
                    ? 'Pilih dokumen PDF kedua (baru / revisi)'
                    : 'Select second PDF (revised)'
              }
              onFilesSelected={(files) => handleLoadPdf('B', files)}
            />
          )}
        </div>
      </div>

      {/* Comparison Controls & Output */}
      {pdfA && pdfB && (
        <div className="space-y-4">
          {/* Control Toolbar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 lg:flex-row lg:items-center lg:justify-between">
            {/* View Mode Tabs */}
            <div role="tablist" className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'overlay', label: isId ? 'Overlay Visual' : 'Visual Overlay' },
                  { id: 'side-by-side', label: isId ? 'Berdampingan' : 'Side-by-Side' },
                  { id: 'text', label: isId ? 'Perbandingan Teks' : 'Text Diff' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === tab.id}
                  onClick={() => setViewMode(tab.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                    viewMode === tab.id
                      ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-recess)] text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Page Navigator */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pageNumber <= 1 || comparing}
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                className="btn-secondary rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-40"
              >
                ←
              </button>
              <span className="font-data text-xs font-semibold text-[var(--ink-primary)]">
                {isId ? 'Halaman' : 'Page'} {pageNumber} / {maxPages}
              </span>
              <button
                type="button"
                disabled={pageNumber >= maxPages || comparing}
                onClick={() => setPageNumber((p) => Math.min(maxPages, p + 1))}
                className="btn-secondary rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-40"
              >
                →
              </button>

              {comparison && (
                <span
                  className={`font-data ml-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    comparison.diffPercent === 0
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {comparison.diffPercent === 0
                    ? isId
                      ? 'Identik (0%)'
                      : 'Identical (0%)'
                    : `${comparison.diffPercent.toFixed(2)}% ${isId ? 'berbeda' : 'changed'}`}
                </span>
              )}
            </div>
          </div>

          {/* Visual Legend + Sensitivity Slider + Export */}
          {viewMode === 'overlay' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-[var(--ink-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-rose-600" />
                  {isId ? 'Dihapus (hanya di A)' : 'Removed (A only)'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                  {isId ? 'Ditambah (hanya di B)' : 'Added (B only)'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                  {isId ? 'Warna berubah' : 'Modified'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-[var(--ink-muted)]">
                  <span>{isId ? 'Toleransi:' : 'Threshold:'}</span>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={2}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-24 accent-[var(--accent)]"
                  />
                </label>

                {comparison?.diffDataUrl && (
                  <button
                    type="button"
                    onClick={handleDownloadDiffPng}
                    className="btn-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" />
                    <span>{isId ? 'Unduh Diff PNG' : 'Export Diff PNG'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Main Comparison Canvas / Text View */}
          {comparing ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm font-semibold text-[var(--ink-muted)]">
              {isId ? 'Merender & membandingkan halaman...' : 'Rendering & comparing page...'}
            </div>
          ) : comparison ? (
            <>
              {viewMode === 'overlay' && (
                <div className="flex justify-center overflow-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-4">
                  {comparison.diffDataUrl ? (
                    <img
                      src={comparison.diffDataUrl}
                      alt={`PDF Diff Page ${pageNumber}`}
                      className="max-h-[760px] w-auto rounded-lg border border-[var(--border-subtle)] bg-white shadow-sm"
                    />
                  ) : null}
                </div>
              )}

              {viewMode === 'side-by-side' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-3">
                    <p className="m-0 text-xs font-bold text-rose-600 dark:text-rose-400">
                      PDF A · {pdfA.filename}
                    </p>
                    {comparison.imageADataUrl ? (
                      <img
                        src={comparison.imageADataUrl}
                        alt={`PDF A Page ${pageNumber}`}
                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-white"
                      />
                    ) : (
                      <div className="rounded-xl border border-dashed border-[var(--border-control)] py-16 text-center text-xs text-[var(--ink-muted)]">
                        {isId ? 'Halaman ini tidak ada di PDF A' : 'Page does not exist in PDF A'}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-3">
                    <p className="m-0 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      PDF B · {pdfB.filename}
                    </p>
                    {comparison.imageBDataUrl ? (
                      <img
                        src={comparison.imageBDataUrl}
                        alt={`PDF B Page ${pageNumber}`}
                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-white"
                      />
                    ) : (
                      <div className="rounded-xl border border-dashed border-[var(--border-control)] py-16 text-center text-xs text-[var(--ink-muted)]">
                        {isId ? 'Halaman ini tidak ada di PDF B' : 'Page does not exist in PDF B'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {viewMode === 'text' && (
                <div className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                  <div className="font-data flex flex-wrap gap-3 text-xs">
                    <span className="rounded-md bg-emerald-500/15 px-2.5 py-1 font-bold text-emerald-700 dark:text-emerald-300">
                      +{comparison.textDiff.addedCount} {isId ? 'ditambah' : 'added'}
                    </span>
                    <span className="rounded-md bg-rose-500/15 px-2.5 py-1 font-bold text-rose-700 dark:text-rose-300">
                      -{comparison.textDiff.removedCount} {isId ? 'dihapus' : 'removed'}
                    </span>
                    <span className="rounded-md bg-[var(--bg-recess)] px-2.5 py-1 font-semibold text-[var(--ink-muted)]">
                      {comparison.textDiff.unchangedCount} {isId ? 'sama' : 'unchanged'}
                    </span>
                  </div>

                  {comparison.textDiff.lines.length === 0 ? (
                    <p className="m-0 py-8 text-center text-xs text-[var(--ink-muted)]">
                      {isId
                        ? 'Tidak ada teks yang dapat diekstrak pada halaman ini (kemungkinan PDF hasil scan). Gunakan mode Overlay Visual.'
                        : 'No selectable text found on this page (likely a scanned PDF). Use Visual Overlay mode instead.'}
                    </p>
                  ) : (
                    <div className="font-data max-h-[520px] space-y-1 overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3 text-xs leading-relaxed">
                      {comparison.textDiff.lines.map((line, idx) => (
                        <div
                          key={idx}
                          className={`rounded px-2 py-1 whitespace-pre-wrap ${
                            line.type === 'added'
                              ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                              : line.type === 'removed'
                                ? 'bg-rose-500/15 text-rose-800 line-through dark:text-rose-200'
                                : 'text-[var(--ink-muted)]'
                          }`}
                        >
                          <span className="mr-2 inline-block w-3 font-bold select-none">
                            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                          </span>
                          <span>{line.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {hasCompared && (
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
