import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { formatBytes } from '@/lib/format';
import { appendHandoffParam, saveHandoffFiles } from '@/lib/file-handoff';
import { useFileHandoff } from '@/lib/use-file-handoff';
import ErrorAlert from '@/components/shared/ErrorAlert';
import {
  CPNS_DOC_SLOTS,
  CPNS_SESSION_STORAGE_KEY,
  detectFileFormatFromBytes,
  parseCpnsPersistedChecklist,
  validateCpnsBuffer,
  type CpnsCheckResult,
  type CpnsDocSlot,
  type ImageDimensions,
} from './cpns-checker.logic';

function readImageDimensions(file: File): Promise<ImageDimensions | undefined> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(objectUrl);
      resolve(width > 0 && height > 0 ? { width, height } : undefined);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(undefined);
    };
    img.src = objectUrl;
  });
}

export default function CpnsCheckerTool() {
  const [results, setResults] = useState<Record<string, CpnsCheckResult>>({});
  const [filesBySlot, setFilesBySlot] = useState<Record<string, File>>({});
  const [maxKbOverrides, setMaxKbOverrides] = useState<Record<string, number>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [handingOffKey, setHandingOffKey] = useState<string | null>(null);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);
  const [returnedNotice, setReturnedNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hydratedStorageRef = useRef(false);
  const maxKbOverridesRef = useRef(maxKbOverrides);
  maxKbOverridesRef.current = maxKbOverrides;
  const slotElementRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Restore lightweight checklist progress (metadata only, never raw files) from sessionStorage
  useEffect(() => {
    try {
      const parsed = parseCpnsPersistedChecklist(
        window.sessionStorage.getItem(CPNS_SESSION_STORAGE_KEY),
      );
      if (parsed) {
        setResults(parsed.results);
        setMaxKbOverrides(parsed.maxKbOverrides);
        maxKbOverridesRef.current = parsed.maxKbOverrides;
      }
    } catch {
      // Ignore storage access errors in restricted privacy modes
    } finally {
      hydratedStorageRef.current = true;
    }
  }, []);

  // Persist checklist metadata so returning from a tool keeps prior slot progress intact
  useEffect(() => {
    if (!hydratedStorageRef.current) return;
    try {
      const hasData =
        Object.keys(results).length > 0 || Object.keys(maxKbOverrides).length > 0;
      if (!hasData) {
        window.sessionStorage.removeItem(CPNS_SESSION_STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(
          CPNS_SESSION_STORAGE_KEY,
          JSON.stringify({ results, maxKbOverrides }),
        );
      }
    } catch {
      // Ignore storage write errors
    }
  }, [results, maxKbOverrides]);

  const passedCount = CPNS_DOC_SLOTS.filter((slot) => results[slot.id]?.status === 'pass').length;
  const checkedCount = Object.keys(results).length;

  const handleFileChange = async (
    slot: CpnsDocSlot,
    file: File | undefined,
    explicitMaxKb?: number,
  ) => {
    if (!file) return;
    setErrorMsg(null);
    setCheckingId(slot.id);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const format = detectFileFormatFromBytes(bytes);
      const isBrowserDecodableImage =
        format === 'JPG' || format === 'PNG' || format === 'WEBP' || format === 'AVIF';
      const dimensions = isBrowserDecodableImage ? await readImageDimensions(file) : undefined;

      const maxKb = explicitMaxKb ?? maxKbOverridesRef.current[slot.id] ?? slot.defaultMaxKb;
      const res = await validateCpnsBuffer(
        slot,
        { name: file.name, size: file.size, bytes, dimensions },
        maxKb,
      );
      setResults((prev) => ({ ...prev, [slot.id]: res }));
      setFilesBySlot((prev) => ({ ...prev, [slot.id]: file }));
    } catch {
      setErrorMsg(
        `Gagal membaca file "${file.name}". Pastikan file tidak terkunci aplikasi lain lalu coba pilih ulang.`,
      );
    } finally {
      setCheckingId(null);
    }
  };

  // Receive round-trip processed files returning from a tool and auto-recheck the originating slot
  useFileHandoff(async (incomingFiles, _sourceRoute, meta) => {
    const returnedFile = incomingFiles[0];
    if (!returnedFile) return;

    let targetSlot = meta?.sourceSlotId
      ? CPNS_DOC_SLOTS.find((s) => s.id === meta.sourceSlotId)
      : undefined;

    if (!targetSlot) {
      const bytes = new Uint8Array(await returnedFile.slice(0, 16).arrayBuffer());
      const detected = detectFileFormatFromBytes(bytes);
      targetSlot = CPNS_DOC_SLOTS.find(
        (s) => s.id === (detected === 'PDF' ? 'ijazah' : 'pasfoto'),
      );
    }

    if (!targetSlot) return;

    await handleFileChange(targetSlot, returnedFile);
    setReturnedNotice(`Hasil perbaikan "${returnedFile.name}" langsung dicek ulang di slot ${targetSlot.title}.`);

    const el = slotElementRefs.current[targetSlot.id];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  const handleMaxKbChange = (slot: CpnsDocSlot, nextKb: number) => {
    setMaxKbOverrides((prev) => ({ ...prev, [slot.id]: nextKb }));
    maxKbOverridesRef.current = { ...maxKbOverridesRef.current, [slot.id]: nextKb };

    const existingFile = filesBySlot[slot.id];
    if (existingFile) {
      void handleFileChange(slot, existingFile, nextKb);
      return;
    }

    setResults((prev) => {
      if (!prev[slot.id]) return prev;
      const copy = { ...prev };
      delete copy[slot.id];
      return copy;
    });
  };

  const handleReset = () => {
    setResults({});
    setFilesBySlot({});
    setMaxKbOverrides({});
    setReturnedNotice(null);
    setErrorMsg(null);
    try {
      window.sessionStorage.removeItem(CPNS_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const handleHandoffClick = async (
    event: MouseEvent<HTMLAnchorElement>,
    slotId: string,
    href: string,
  ) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    const slotFile = filesBySlot[slotId];
    if (!slotFile) return;

    event.preventDefault();
    const actionKey = `${slotId}:${href}`;
    if (handingOffKey) return;
    setHandingOffKey(actionKey);

    try {
      const handoffId = await saveHandoffFiles([slotFile], '/cpns', { sourceSlotId: slotId });
      const targetUrl = handoffId ? appendHandoffParam(href, handoffId) : href;
      window.location.assign(targetUrl);
    } catch {
      window.location.assign(href);
    }
  };

  const handleSlotDragOver = (event: DragEvent<HTMLDivElement>, slotId: string) => {
    event.preventDefault();
    if (dragOverSlotId !== slotId) {
      setDragOverSlotId(slotId);
    }
  };

  const handleSlotDragLeave = (event: DragEvent<HTMLDivElement>, slotId: string) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      if (dragOverSlotId === slotId) {
        setDragOverSlotId(null);
      }
    }
  };

  const handleSlotDrop = (event: DragEvent<HTMLDivElement>, slot: CpnsDocSlot) => {
    event.preventDefault();
    setDragOverSlotId(null);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      void handleFileChange(slot, droppedFile);
    }
  };

  return (
    <div className="space-y-5">
      {returnedNotice && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--accent-row-border)] bg-[var(--accent-row-bg)] px-4 py-2.5 text-xs text-[var(--ink-primary)]"
        >
          <p className="m-0 font-semibold">{returnedNotice}</p>
          <button
            type="button"
            onClick={() => setReturnedNotice(null)}
            className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
          >
            Tutup
          </button>
        </div>
      )}

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
          const isDragOver = dragOverSlotId === slot.id;
          const hasInMemoryFile = Boolean(filesBySlot[slot.id]);

          const canEditPassportBg =
            slot.id === 'pasfoto' &&
            Boolean(res) &&
            hasInMemoryFile &&
            res.detectedFormat !== 'PDF' &&
            res.detectedFormat !== 'HEIC' &&
            res.detectedFormat !== 'UNKNOWN';

          const borderClass = isDragOver
            ? 'border-[var(--accent)] bg-[var(--accent-row-bg)] ring-2 ring-[var(--accent)]/30'
            : res?.status === 'pass'
              ? 'border-emerald-500/60 bg-emerald-500/5'
              : res?.status === 'fail'
                ? 'border-rose-500/60 bg-rose-500/5'
                : 'border-[var(--border-subtle)] bg-[var(--bg-card)]';

          return (
            <div
              key={slot.id}
              ref={(node) => {
                slotElementRefs.current[slot.id] = node;
              }}
              onDragOver={(event) => handleSlotDragOver(event, slot.id)}
              onDragLeave={(event) => handleSlotDragLeave(event, slot.id)}
              onDrop={(event) => handleSlotDrop(event, slot)}
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
                    {isDragOver && (
                      <span className="font-data rounded bg-[var(--accent-pill)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent-pill-ink)]">
                        Lepas file di sini
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
                      {isChecking ? 'Mengecek...' : res ? 'Cek ulang' : 'Cek file'}
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
                    {res.dimensions && (
                      <span>
                        Dimensi: {res.dimensions.width}×{res.dimensions.height} px
                      </span>
                    )}
                    {res.pageCount !== undefined && <span>{res.pageCount} halaman</span>}
                  </div>

                  {res.status === 'pass' ? (
                    <p className="m-0 font-semibold text-emerald-700 dark:text-emerald-300">
                      Berkas ini sesuai format dan ukuran batas SSCASN. Siap diunggah!
                    </p>
                  ) : (
                    <ul className="m-0 list-disc space-y-1 pl-4 text-rose-700 dark:text-rose-300">
                      {res.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}

                  {res.warnings.length > 0 && (
                    <ul className="m-0 list-disc space-y-1 pl-4 text-amber-700 dark:text-amber-300">
                      {res.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}

                  {(res.fixes.length > 0 || canEditPassportBg) && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {res.fixes.map((fix) => {
                        const actionKey = `${slot.id}:${fix.href}`;
                        const isPreparing = handingOffKey === actionKey;
                        return (
                          <a
                            key={fix.href}
                            href={fix.href}
                            onClick={(event) => {
                              void handleHandoffClick(event, slot.id, fix.href);
                            }}
                            aria-busy={isPreparing || undefined}
                            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--accent)] bg-[var(--accent-pill)] px-3.5 text-xs font-bold text-[var(--accent-pill-ink)] no-underline hover:opacity-90"
                          >
                            {isPreparing ? 'Menyiapkan file...' : fix.label}
                          </a>
                        );
                      })}

                      {canEditPassportBg && (
                        <a
                          href="/remove-bg"
                          onClick={(event) => {
                            void handleHandoffClick(event, slot.id, '/remove-bg');
                          }}
                          aria-busy={handingOffKey === `${slot.id}:/remove-bg` || undefined}
                          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3.5 text-xs font-semibold text-[var(--ink-primary)] no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--link)]"
                        >
                          {handingOffKey === `${slot.id}:/remove-bg`
                            ? 'Menyiapkan file...'
                            : 'Ganti latar merah/biru'}
                        </a>
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
