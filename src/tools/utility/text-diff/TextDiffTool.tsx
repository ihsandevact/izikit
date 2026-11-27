import { useId, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { downloadBlob } from '@/lib/download';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import {
  buildUnifiedPatch,
  computeTextDiff,
  filterDiffWithContext,
  tryFormatJson,
  type InlineSegment,
} from './text-diff.logic';

interface TextDiffToolProps {
  locale: Locale;
}

type ViewMode = 'side-by-side' | 'unified';

const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

const SAMPLE_OLD_ID = `Perjanjian Layanan Proyek Web
Klien: PT Nusantara Digital
Durasi Pengerjaan: 30 hari kerja
Biaya Total: Rp 15.000.000
Metode Pembayaran: 50% DP, 50% setelah serah terima
Garansi Perbaikan Bug: 14 hari kalender
Catatan: Tidak termasuk biaya domain & hosting.`;

const SAMPLE_NEW_ID = `Perjanjian Layanan Proyek Web (Revisi 2)
Klien: PT Nusantara Digital
Durasi Pengerjaan: 25 hari kerja
Biaya Total: Rp 16.500.000
Metode Pembayaran: 40% DP, 40% UAT, 20% setelah serah terima
Garansi Perbaikan Bug: 30 hari kalender
Catatan: Termasuk bantuan setup domain & hosting tahun pertama.`;

const SAMPLE_OLD_EN = `Web Project Service Agreement
Client: Nusantara Digital Ltd.
Delivery Timeline: 30 business days
Total Fee: $2,500.00
Payment Terms: 50% upfront, 50% upon delivery
Bug-fix Warranty: 14 calendar days
Notes: Domain and hosting fees are excluded.`;

const SAMPLE_NEW_EN = `Web Project Service Agreement (Rev 2)
Client: Nusantara Digital Ltd.
Delivery Timeline: 25 business days
Total Fee: $2,850.00
Payment Terms: 40% upfront, 40% on UAT, 20% upon delivery
Bug-fix Warranty: 30 calendar days
Notes: Includes initial domain & hosting setup assistance.`;

function renderSegments(segments: InlineSegment[] | undefined, fallbackText: string) {
  if (!segments || segments.length === 0) {
    return fallbackText || '\u00A0';
  }
  return segments.map((seg, idx) => {
    if (seg.type === 'removed') {
      return (
        <mark
          key={idx}
          className="rounded-[3px] bg-rose-500/25 px-0.5 text-inherit dark:bg-rose-400/30"
        >
          {seg.text}
        </mark>
      );
    }
    if (seg.type === 'added') {
      return (
        <mark
          key={idx}
          className="rounded-[3px] bg-emerald-500/25 px-0.5 text-inherit dark:bg-emerald-400/30"
        >
          {seg.text}
        </mark>
      );
    }
    return <span key={idx}>{seg.text}</span>;
  });
}

export default function TextDiffTool({ locale }: TextDiffToolProps) {
  const dict = getDictionary(locale);
  const isId = locale === 'id';
  const leftId = useId();
  const rightId = useId();
  const leftFileRef = useRef<HTMLInputElement | null>(null);
  const rightFileRef = useRef<HTMLInputElement | null>(null);

  const [leftText, setLeftText] = useState(isId ? SAMPLE_OLD_ID : SAMPLE_OLD_EN);
  const [rightText, setRightText] = useState(isId ? SAMPLE_NEW_ID : SAMPLE_NEW_EN);
  const [leftName, setLeftName] = useState(isId ? 'teks-asli.txt' : 'original.txt');
  const [rightName, setRightName] = useState(isId ? 'teks-revisi.txt' : 'modified.txt');

  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasExported, setHasExported] = useState(false);

  const diffOptions = useMemo(
    () => ({ ignoreWhitespace, ignoreCase }),
    [ignoreWhitespace, ignoreCase],
  );

  const result = useMemo(
    () => computeTextDiff(leftText, rightText, diffOptions),
    [leftText, rightText, diffOptions],
  );

  const sideBySideDisplay = useMemo(() => {
    if (!onlyChanges) {
      return result.sideBySide.map((item, idx) => ({
        kind: 'row' as const,
        item,
        originalIndex: idx,
      }));
    }
    return filterDiffWithContext(result.sideBySide, (r) => r.isChanged, 3);
  }, [onlyChanges, result.sideBySide]);

  const unifiedDisplay = useMemo(() => {
    if (!onlyChanges) {
      return result.lines.map((item, idx) => ({
        kind: 'row' as const,
        item,
        originalIndex: idx,
      }));
    }
    return filterDiffWithContext(result.lines, (l) => l.type !== 'equal', 3);
  }, [onlyChanges, result.lines]);

  const handleLoadTextFile = async (side: 'left' | 'right', file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    if (file.size > MAX_TEXT_FILE_BYTES) {
      setErrorMsg(
        isId
          ? `Ukuran file "${file.name}" melebihi batas 5 MB untuk perbandingan teks di browser.`
          : `File "${file.name}" exceeds the 5 MB limit for in-browser text diff.`,
      );
      return;
    }
    try {
      const content = await file.text();
      if (side === 'left') {
        setLeftText(content);
        setLeftName(file.name);
      } else {
        setRightText(content);
        setRightName(file.name);
      }
    } catch {
      setErrorMsg(
        isId
          ? `Gagal membaca file "${file.name}". Pastikan file berformat teks.`
          : `Failed to read "${file.name}". Please ensure it is a text file.`,
      );
    }
  };

  const handleSwap = () => {
    setLeftText(rightText);
    setRightText(leftText);
    setLeftName(rightName);
    setRightName(leftName);
    setErrorMsg(null);
  };

  const handleClear = () => {
    setLeftText('');
    setRightText('');
    setLeftName(isId ? 'teks-asli.txt' : 'original.txt');
    setRightName(isId ? 'teks-revisi.txt' : 'modified.txt');
    setErrorMsg(null);
  };

  const handleLoadSample = () => {
    setLeftText(isId ? SAMPLE_OLD_ID : SAMPLE_OLD_EN);
    setRightText(isId ? SAMPLE_NEW_ID : SAMPLE_NEW_EN);
    setLeftName(isId ? 'perjanjian-v1.txt' : 'agreement-v1.txt');
    setRightName(isId ? 'perjanjian-v2.txt' : 'agreement-v2.txt');
    setErrorMsg(null);
  };

  const handleFormatBothJson = () => {
    setErrorMsg(null);
    const resL = leftText.trim() ? tryFormatJson(leftText) : { ok: true as const, formatted: '' };
    const resR = rightText.trim() ? tryFormatJson(rightText) : { ok: true as const, formatted: '' };
    if (!resL.ok || !resR.ok) {
      setErrorMsg(
        isId
          ? 'Salah satu atau kedua teks bukan JSON valid sehingga tidak bisa dirapikan otomatis.'
          : 'One or both inputs are not valid JSON and could not be auto-formatted.',
      );
      return;
    }
    setLeftText(resL.formatted);
    setRightText(resR.formatted);
  };

  const handleCopyPatch = async () => {
    const patch = buildUnifiedPatch(
      leftText,
      rightText,
      `a/${leftName}`,
      `b/${rightName}`,
      diffOptions,
    );
    try {
      await navigator.clipboard.writeText(patch);
      setCopied(true);
      setHasExported(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setErrorMsg(
        isId
          ? 'Gagal menyalin ke clipboard. Gunakan tombol Unduh .diff sebagai alternatif.'
          : 'Could not copy to clipboard. Use the Download .diff button instead.',
      );
    }
  };

  const handleDownloadPatch = () => {
    const patch = buildUnifiedPatch(
      leftText,
      rightText,
      `a/${leftName}`,
      `b/${rightName}`,
      diffOptions,
    );
    const blob = new Blob([patch], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, 'izikit-text-diff.diff');
    setHasExported(true);
  };

  const hasContent = leftText.length > 0 || rightText.length > 0;
  const isIdentical =
    hasContent && result.stats.added === 0 && result.stats.removed === 0;

  return (
    <div className="space-y-5">
      {errorMsg && (
        <ErrorAlert
          messages={[errorMsg]}
          dismissLabel={dict.shared.dismissError}
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      {/* Input Editors */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left (Original) */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={leftId}
              className="text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase"
            >
              {isId ? 'Teks Asli (A)' : 'Original Text (A)'}
              <span className="font-data ml-2 font-normal text-[var(--ink-muted)] normal-case">
                {leftName}
              </span>
            </label>
            <div>
              <input
                ref={leftFileRef}
                type="file"
                accept=".txt,.md,.json,.csv,.tsv,.xml,.html,.css,.js,.ts,.yaml,.yml,.log"
                className="sr-only"
                onChange={(e) => {
                  handleLoadTextFile('left', e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => leftFileRef.current?.click()}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)]"
              >
                {isId ? 'Unggah File' : 'Load File'}
              </button>
            </div>
          </div>
          <textarea
            id={leftId}
            value={leftText}
            onChange={(e) => setLeftText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={
              isId ? 'Tempel atau ketik teks asli di sini...' : 'Paste or type original text here...'
            }
            className="font-data w-full resize-y rounded-xl border border-[var(--border-control)] bg-[var(--bg-canvas)] p-3 text-xs leading-relaxed text-[var(--ink-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 sm:text-[13px]"
          />
        </div>

        {/* Right (Modified) */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={rightId}
              className="text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase"
            >
              {isId ? 'Teks Revisi (B)' : 'Modified Text (B)'}
              <span className="font-data ml-2 font-normal text-[var(--ink-muted)] normal-case">
                {rightName}
              </span>
            </label>
            <div>
              <input
                ref={rightFileRef}
                type="file"
                accept=".txt,.md,.json,.csv,.tsv,.xml,.html,.css,.js,.ts,.yaml,.yml,.log"
                className="sr-only"
                onChange={(e) => {
                  handleLoadTextFile('right', e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => rightFileRef.current?.click()}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)]"
              >
                {isId ? 'Unggah File' : 'Load File'}
              </button>
            </div>
          </div>
          <textarea
            id={rightId}
            value={rightText}
            onChange={(e) => setRightText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={
              isId
                ? 'Tempel atau ketik teks pembanding di sini...'
                : 'Paste or type modified text here...'
            }
            className="font-data w-full resize-y rounded-xl border border-[var(--border-control)] bg-[var(--bg-canvas)] p-3 text-xs leading-relaxed text-[var(--ink-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 sm:text-[13px]"
          />
        </div>
      </div>

      {/* Action & Options Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)]/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* View mode */}
          <div
            role="tablist"
            aria-label={isId ? 'Mode tampilan diff' : 'Diff view mode'}
            className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'side-by-side'}
              onClick={() => setViewMode('side-by-side')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'side-by-side'
                  ? 'bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {isId ? 'Berdampingan' : 'Side-by-Side'}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'unified'}
              onClick={() => setViewMode('unified')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                viewMode === 'unified'
                  ? 'bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {isId ? 'Satu Kolom' : 'Unified'}
            </button>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-primary)]">
            <input
              type="checkbox"
              checked={ignoreWhitespace}
              onChange={(e) => setIgnoreWhitespace(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            <span>{isId ? 'Abaikan spasi' : 'Ignore spaces'}</span>
          </label>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-primary)]">
            <input
              type="checkbox"
              checked={ignoreCase}
              onChange={(e) => setIgnoreCase(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            <span>{isId ? 'Abaikan kapital' : 'Ignore case'}</span>
          </label>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-primary)]">
            <input
              type="checkbox"
              checked={onlyChanges}
              onChange={(e) => setOnlyChanges(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            <span>{isId ? 'Hanya perubahan' : 'Changes only'}</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSwap}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)]"
          >
            {isId ? 'Tukar A ⇄ B' : 'Swap A ⇄ B'}
          </button>
          <button
            type="button"
            onClick={handleFormatBothJson}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)]"
          >
            {isId ? 'Rapikan JSON' : 'Format JSON'}
          </button>
          <button
            type="button"
            onClick={handleLoadSample}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--ink-primary)]"
          >
            {isId ? 'Contoh' : 'Sample'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--danger)]"
          >
            {isId ? 'Bersihkan' : 'Clear'}
          </button>
        </div>
      </div>

      {/* Stats & Export Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-data flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-bold text-emerald-700 dark:text-emerald-300">
            +{result.stats.added} {isId ? 'ditambah' : 'added'}
          </span>
          <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 font-bold text-rose-700 dark:text-rose-300">
            -{result.stats.removed} {isId ? 'dihapus' : 'removed'}
          </span>
          <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-2 py-1 font-semibold text-[var(--ink-muted)]">
            {result.stats.unchanged} {isId ? 'sama' : 'unchanged'}
          </span>
          {result.stats.truncated && (
            <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-semibold text-amber-800 dark:text-amber-300">
              {isId
                ? 'Mode cepat aktif (file sangat besar)'
                : 'Fast mode active (very large input)'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!hasContent}
            onClick={handleCopyPatch}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-40"
          >
            {copied
              ? isId
                ? 'Tersalin!'
                : 'Copied!'
              : isId
                ? 'Salin .diff'
                : 'Copy .diff'}
          </button>
          <button
            type="button"
            disabled={!hasContent}
            onClick={handleDownloadPatch}
            className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold disabled:opacity-40"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            <span>{isId ? 'Unduh .diff' : 'Download .diff'}</span>
          </button>
        </div>
      </div>

      {/* Diff Output */}
      {!hasContent ? (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-recess)]/40 p-8 text-center text-sm text-[var(--ink-muted)]">
          {isId
            ? 'Masukkan dua teks di atas untuk langsung melihat perbedaannya.'
            : 'Enter two texts above to immediately inspect their differences.'}
        </div>
      ) : isIdentical ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          {isId
            ? 'Kedua teks identik — tidak ada perbedaan yang ditemukan.'
            : 'Both texts are identical — no differences found.'}
        </div>
      ) : viewMode === 'side-by-side' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
          <table className="font-data w-full min-w-[640px] border-collapse text-xs leading-6">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-recess)] text-left text-[11px] text-[var(--ink-muted)]">
                <th className="w-10 px-2 py-2 text-right font-semibold">#</th>
                <th className="w-1/2 border-r border-[var(--border-subtle)] px-3 py-2 font-semibold">
                  {leftName}
                </th>
                <th className="w-10 px-2 py-2 text-right font-semibold">#</th>
                <th className="w-1/2 px-3 py-2 font-semibold">{rightName}</th>
              </tr>
            </thead>
            <tbody>
              {sideBySideDisplay.map((entry, idx) => {
                if (entry.kind === 'collapsed') {
                  return (
                    <tr
                      key={`col-${idx}`}
                      className="border-y border-[var(--border-subtle)] bg-[var(--bg-recess)]/70 text-center text-[11px] text-[var(--ink-muted)]"
                    >
                      <td colSpan={4} className="py-1.5">
                        ⋯ {entry.count} {isId ? 'baris sama disembunyikan' : 'unchanged lines hidden'} ⋯
                      </td>
                    </tr>
                  );
                }

                const { left, right } = entry.item;
                const leftBg =
                  left?.type === 'removed'
                    ? 'bg-rose-500/10 text-rose-950 dark:bg-rose-500/15 dark:text-rose-100'
                    : !left
                      ? 'bg-[var(--bg-recess)]/40 text-[var(--ink-muted)]'
                      : 'text-[var(--ink-primary)]';
                const rightBg =
                  right?.type === 'added'
                    ? 'bg-emerald-500/10 text-emerald-950 dark:bg-emerald-500/15 dark:text-emerald-100'
                    : !right
                      ? 'bg-[var(--bg-recess)]/40 text-[var(--ink-muted)]'
                      : 'text-[var(--ink-primary)]';

                return (
                  <tr
                    key={`sbs-${entry.originalIndex}`}
                    className="border-b border-[var(--border-subtle)]/50 align-top"
                  >
                    <td
                      className={`select-none px-2 py-0.5 text-right text-[11px] tabular-nums opacity-65 ${leftBg}`}
                    >
                      {left?.oldLine ?? ''}
                    </td>
                    <td
                      className={`border-r border-[var(--border-subtle)] px-3 py-0.5 break-words whitespace-pre-wrap ${leftBg}`}
                    >
                      {left && (
                        <>
                          <span className="mr-1.5 select-none font-bold opacity-70">
                            {left.type === 'removed' ? '-' : ' '}
                          </span>
                          {renderSegments(left.segments, left.text)}
                        </>
                      )}
                    </td>
                    <td
                      className={`select-none px-2 py-0.5 text-right text-[11px] tabular-nums opacity-65 ${rightBg}`}
                    >
                      {right?.newLine ?? ''}
                    </td>
                    <td
                      className={`px-3 py-0.5 break-words whitespace-pre-wrap ${rightBg}`}
                    >
                      {right && (
                        <>
                          <span className="mr-1.5 select-none font-bold opacity-70">
                            {right.type === 'added' ? '+' : ' '}
                          </span>
                          {renderSegments(right.segments, right.text)}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
          <table className="font-data w-full border-collapse text-xs leading-6">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-recess)] text-left text-[11px] text-[var(--ink-muted)]">
                <th className="w-10 px-2 py-2 text-right font-semibold">A</th>
                <th className="w-10 px-2 py-2 text-right font-semibold">B</th>
                <th className="px-3 py-2 font-semibold">
                  {isId ? 'Perubahan Baris' : 'Line Changes'}
                </th>
              </tr>
            </thead>
            <tbody>
              {unifiedDisplay.map((entry, idx) => {
                if (entry.kind === 'collapsed') {
                  return (
                    <tr
                      key={`ucol-${idx}`}
                      className="border-y border-[var(--border-subtle)] bg-[var(--bg-recess)]/70 text-center text-[11px] text-[var(--ink-muted)]"
                    >
                      <td colSpan={3} className="py-1.5">
                        ⋯ {entry.count} {isId ? 'baris sama disembunyikan' : 'unchanged lines hidden'} ⋯
                      </td>
                    </tr>
                  );
                }

                const line = entry.item;
                const rowClass =
                  line.type === 'removed'
                    ? 'bg-rose-500/10 text-rose-950 dark:bg-rose-500/15 dark:text-rose-100'
                    : line.type === 'added'
                      ? 'bg-emerald-500/10 text-emerald-950 dark:bg-emerald-500/15 dark:text-emerald-100'
                      : 'text-[var(--ink-primary)]';

                return (
                  <tr
                    key={`uni-${entry.originalIndex}`}
                    className={`border-b border-[var(--border-subtle)]/50 align-top ${rowClass}`}
                  >
                    <td className="select-none px-2 py-0.5 text-right text-[11px] tabular-nums opacity-65">
                      {line.oldLine ?? ''}
                    </td>
                    <td className="select-none px-2 py-0.5 text-right text-[11px] tabular-nums opacity-65">
                      {line.newLine ?? ''}
                    </td>
                    <td className="px-3 py-0.5 break-words whitespace-pre-wrap">
                      <span className="mr-2 select-none font-bold opacity-75">
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </span>
                      {renderSegments(line.segments, line.text)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
