import { useState } from 'react';
import { formatBytes } from '@/lib/format';
import ErrorAlert from '@/components/shared/ErrorAlert';
import {
  CPNS_DOC_SLOTS,
  validateCpnsBuffer,
  type CpnsCheckResult,
  type CpnsDocSlot,
} from './cpns-checker.logic';

export default function CpnsCheckerTool() {
  const [results, setResults] = useState<Record<string, CpnsCheckResult>>({});
  const [maxKbOverrides, setMaxKbOverrides] = useState<Record<string, number>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const passedCount = CPNS_DOC_SLOTS.filter((slot) => results[slot.id]?.status === 'pass').length;
  const checkedCount = Object.keys(results).length;

  const handleFileChange = async (slot: CpnsDocSlot, file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    setCheckingId(slot.id);
    try {
      const buf = await file.arrayBuffer();
      const maxKb = maxKbOverrides[slot.id] ?? slot.defaultMaxKb;
      const res = await validateCpnsBuffer(
        slot,
        { name: file.name, size: file.size, bytes: new Uint8Array(buf) },
        maxKb,
      );
      setResults((prev) => ({ ...prev, [slot.id]: res }));
    } catch {
      setErrorMsg(
        `Gagal membaca file "${file.name}". Pastikan file tidak terkunci aplikasi lain lalu coba pilih ulang.`,
      );
    } finally {
      setCheckingId(null);
    }
  };

  const handleMaxKbChange = (slot: CpnsDocSlot, nextKb: number) => {
    setMaxKbOverrides((prev) => ({ ...prev, [slot.id]: nextKb }));
    setResults((prev) => {
      if (!prev[slot.id]) return prev;
      const copy = { ...prev };
      delete copy[slot.id];
      return copy;
    });
  };

  const handleReset = () => {
    setResults({});
    setErrorMsg(null);
  };

  return (
    <div className="space-y-5">
      {errorMsg && (
        <ErrorAlert
          messages={[errorMsg]}
          dismissLabel="Tutup"
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      {/* Summary Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)]/60 p-4">
        <div className="min-w-0 space-y-1">
          <p className="font-display m-0 text-sm font-extrabold text-[var(--ink-primary)]">
            Progres kelengkapan berkas SSCASN
          </p>
          <p className="font-data m-0 text-xs text-[var(--ink-muted)] tabular-nums">
            {passedCount} / {CPNS_DOC_SLOTS.length} berkas lolos cek · {checkedCount} sudah diperiksa
          </p>
        </div>

        {checkedCount > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
          >
            Bersihkan hasil
          </button>
        )}
      </div>

      {/* Checklist Slots */}
      <div className="space-y-3">
        {CPNS_DOC_SLOTS.map((slot) => {
          const res = results[slot.id];
          const maxKb = maxKbOverrides[slot.id] ?? slot.defaultMaxKb;
          const isChecking = checkingId === slot.id;

          const borderClass =
            res?.status === 'pass'
              ? 'border-emerald-500/60 bg-emerald-500/5'
              : res?.status === 'fail'
                ? 'border-rose-500/60 bg-rose-500/5'
                : 'border-[var(--border-subtle)] bg-[var(--bg-card)]';

          return (
            <div
              key={slot.id}
              className={`rounded-xl border p-4 transition-colors ${borderClass}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display m-0 text-sm font-extrabold text-[var(--ink-primary)]">
                      {slot.title}
                    </h3>
                    <span className="font-data rounded border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ink-muted)] uppercase">
                      {slot.expectedFormat} · ≤ {maxKb >= 1000 ? '1 MB' : `${maxKb} KB`}
                    </span>
                    {res?.status === 'pass' && (
                      <span className="font-data rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        LOLOS
                      </span>
                    )}
                    {res?.status === 'fail' && (
                      <span className="font-data rounded bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                        PERLU PERBAIKAN
                      </span>
                    )}
                  </div>
                  <p className="m-0 text-xs text-[var(--ink-muted)]">{slot.subtitle}</p>
                </div>

                <div className="grid w-full grid-cols-2 gap-2.5 sm:flex sm:w-auto sm:shrink-0 sm:items-center">
                  <div className="relative w-full sm:w-auto">
                    <select
                      aria-label={`Batas ukuran maksimal ${slot.title}`}
                      value={maxKb}
                      onChange={(e) => handleMaxKbChange(slot, Number(e.target.value))}
                      className="font-data min-h-11 w-full appearance-none rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] pl-3 pr-9 text-xs font-semibold text-[var(--ink-primary)] sm:w-auto"
                    >
                      {slot.allowedKbChoices.map((kb) => (
                        <option key={kb} value={kb}>
                          Maks. {kb >= 1000 ? '1 MB' : `${kb} KB`}
                        </option>
                      ))}
                    </select>
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 right-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)]"
                    >
                      <path
                        d="M4 6l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  <label className="btn-primary inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-3.5 text-xs font-bold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]">
                    <span>
                      {isChecking
                        ? 'Mengecek...'
                        : res
                          ? 'Cek ulang'
                          : 'Cek file'}
                    </span>
                    <input
                      type="file"
                      className="sr-only"
                      onChange={(e) => {
                        void handleFileChange(slot, e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Validation Result Details */}
              {res && (
                <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)]/70 pt-3 text-xs">
                  <div className="font-data flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--ink-muted)] tabular-nums">
                    <span className="min-w-0 break-all font-semibold text-[var(--ink-primary)]">
                      {res.fileName}
                    </span>
                    <span>Ukuran: {formatBytes(res.fileSizeBytes)}</span>
                    <span>Format asli: {res.detectedFormat}</span>
                    {res.pageCount !== undefined && <span>{res.pageCount} halaman</span>}
                  </div>

                  {res.status === 'pass' ? (
                    <p className="m-0 font-semibold text-emerald-700 dark:text-emerald-300">
                      Berkas ini sesuai format dan ukuran batas SSCASN. Siap diunggah!
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <ul className="m-0 list-disc space-y-1 pl-4 text-rose-700 dark:text-rose-300">
                        {res.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                      {res.fixes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {res.fixes.map((fix) => (
                            <a
                              key={fix.href}
                              href={fix.href}
                              className="inline-flex min-h-11 items-center rounded-lg border border-[var(--accent)] bg-[var(--accent-pill)] px-3.5 text-xs font-bold text-[var(--accent-pill-ink)] no-underline hover:opacity-90"
                            >
                              {fix.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Quick tool shortcuts when not yet checked */}
              {!res && slot.quickTools.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {slot.quickTools.map((tool) => (
                    <a
                      key={tool.href}
                      href={tool.href}
                      className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-3 text-xs font-semibold text-[var(--ink-muted)] no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--ink-primary)]"
                    >
                      {tool.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
