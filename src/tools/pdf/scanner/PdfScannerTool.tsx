import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { createClientId } from '@/lib/id';
import { formatBytes } from '@/lib/format';
import { validateImageFiles } from '@/lib/file-validation';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DownloadIcon,
  TrashIcon,
} from '@/components/shared/icons';
import {
  buildScannedPdfBytes,
  buildScannerFilename,
  type ScanAdjustments,
  type ScanFilterKey,
  type ScanPageMarginKey,
  type ScanPageSizeKey,
} from './scanner.logic';
import { drawScannedPageOnCanvas, renderScannedPageToJpeg } from './scanner-renderer';

interface PdfScannerToolProps {
  locale: Locale;
}

interface ScannedPageItem {
  id: string;
  name: string;
  objectUrl: string;
  imageEl: HTMLImageElement;
  rotation: 0 | 90 | 180 | 270;
  filter: ScanFilterKey;
  adjustments: ScanAdjustments;
}

const FILTER_OPTIONS: Array<{ key: ScanFilterKey; labelId: string; labelEn: string }> = [
  { key: 'magic-color', labelId: 'Scan Warna', labelEn: 'Magic Color' },
  { key: 'bw-document', labelId: 'Hitam-Putih', labelEn: 'B&W Doc' },
  { key: 'grayscale', labelId: 'Abu-abu', labelEn: 'Grayscale' },
  { key: 'original', labelId: 'Asli', labelEn: 'Original' },
];

export default function PdfScannerTool({ locale }: PdfScannerToolProps) {
  const dict = getDictionary(locale);
  const isId = locale === 'id';
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const brightnessId = useId();
  const contrastId = useId();

  const [pages, setPages] = useState<ScannedPageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<ScanPageSizeKey>('a4');
  const [margin, setMargin] = useState<ScanPageMarginKey>('small');
  const [errors, setErrors] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [resultBlob, setResultBlob] = useState<{ blob: Blob; filename: string } | null>(null);

  const pagesRef = useRef<ScannedPageItem[]>([]);
  pagesRef.current = pages;

  useEffect(() => {
    return () => {
      for (const p of pagesRef.current) {
        URL.revokeObjectURL(p.objectUrl);
      }
    };
  }, []);

  const selectedPage = pages.find((p) => p.id === selectedId) ?? pages[0] ?? null;

  // Render live filtered preview for the currently selected page
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !selectedPage) return;
    drawScannedPageOnCanvas(canvas, selectedPage.imageEl, {
      rotation: selectedPage.rotation,
      filter: selectedPage.filter,
      adjustments: selectedPage.adjustments,
      maxDimension: 1100,
    });
  }, [selectedPage]);

  const handleFilesSelected = useCallback(
    async (incoming: File[]) => {
      setErrors([]);
      setResultBlob(null);

      const { accepted, errors: valErrors } = await validateImageFiles(incoming, {
        tooLarge: isId ? 'Ukuran foto melebihi batas 30 MB:' : 'Photo exceeds 30 MB limit:',
        notImage: isId
          ? 'File bukan gambar JPG/PNG/WebP yang valid:'
          : 'File is not a valid JPG/PNG/WebP image:',
        generic: isId ? 'Gagal membaca foto:' : 'Failed to read photo:',
      });

      if (valErrors.length > 0) {
        setErrors(valErrors);
      }
      if (accepted.length === 0) return;

      const loaded: ScannedPageItem[] = [];
      for (const item of accepted) {
        const objectUrl = URL.createObjectURL(item.file);
        try {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('Decode failed'));
            el.src = objectUrl;
          });
          loaded.push({
            id: createClientId(),
            name: item.file.name || 'scan.jpg',
            objectUrl,
            imageEl: img,
            rotation: 0,
            filter: 'magic-color',
            adjustments: { brightness: 0, contrast: 0 },
          });
        } catch {
          URL.revokeObjectURL(objectUrl);
          setErrors((prev) => [
            ...prev,
            isId
              ? `Tidak dapat membaca gambar "${item.file.name}".`
              : `Could not decode image "${item.file.name}".`,
          ]);
        }
      }

      if (loaded.length > 0) {
        setPages((prev) => [...prev, ...loaded]);
        setSelectedId((prevSelected) => prevSelected ?? loaded[0].id);
      }
    },
    [isId],
  );

  const updateSelected = (patch: Partial<ScannedPageItem>) => {
    if (!selectedPage) return;
    setResultBlob(null);
    setPages((prev) =>
      prev.map((p) => (p.id === selectedPage.id ? { ...p, ...patch } : p)),
    );
  };

  const applyFilterToAll = () => {
    if (!selectedPage) return;
    setResultBlob(null);
    setPages((prev) =>
      prev.map((p) => ({
        ...p,
        filter: selectedPage.filter,
        adjustments: { ...selectedPage.adjustments },
      })),
    );
  };

  const handleMove = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= pages.length) return;
    setResultBlob(null);
    setPages((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
  };

  const handleRemove = (id: string) => {
    setResultBlob(null);
    setPages((prev) => {
      const victim = prev.find((p) => p.id === id);
      if (victim) URL.revokeObjectURL(victim.objectUrl);
      const next = prev.filter((p) => p.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleRotateSelected = () => {
    if (!selectedPage) return;
    const nextRot = ((selectedPage.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    updateSelected({ rotation: nextRot });
  };

  const handleBuildPdf = async () => {
    if (pages.length === 0 || isBuilding) return;
    setIsBuilding(true);
    setErrors([]);
    try {
      const rendered = [];
      for (const page of pages) {
        const jpg = await renderScannedPageToJpeg(
          page.imageEl,
          {
            rotation: page.rotation,
            filter: page.filter,
            adjustments: page.adjustments,
            maxDimension: 1800,
          },
          0.88,
        );
        rendered.push(jpg);
      }
      const pdfBytes = await buildScannedPdfBytes(rendered, { pageSize, margin });
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const filename = buildScannerFilename(pages.length, locale);
      setResultBlob({ blob, filename });
      downloadBlob(blob, filename);
    } catch {
      setErrors([
        isId
          ? 'Gagal membuat PDF dari halaman scan. Coba kurangi jumlah gambar atau ulangi.'
          : 'Failed to generate scanned PDF. Please try again.',
      ]);
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div className="space-y-5">
      {errors.length > 0 && (
        <ErrorAlert
          messages={errors}
          dismissLabel={dict.shared.dismissError}
          onDismiss={() => setErrors([])}
        />
      )}

      {/* Hidden mobile camera input */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) {
            void handleFilesSelected(Array.from(e.target.files));
          }
          e.target.value = '';
        }}
      />

      {pages.length === 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--accent-row-bg)] p-4">
            <div className="space-y-0.5">
              <p className="font-display m-0 text-sm font-extrabold text-[var(--ink-primary)]">
                {isId ? 'Scan langsung pakai kamera HP' : 'Scan straight from your phone camera'}
              </p>
              <p className="m-0 text-xs text-[var(--ink-muted)]">
                {isId
                  ? 'Buka kamera belakang untuk memotret dokumen, struk, atau catatan — otomatis ditingkatkan kontrasnya.'
                  : 'Open your rear camera to capture receipts, forms, or notes with automatic document enhancement.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="btn-primary inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold"
            >
              <span>{isId ? 'Buka Kamera / Foto' : 'Open Camera / Capture'}</span>
            </button>
          </div>

          <Dropzone
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            multiple
            idleLabel={
              isId
                ? 'Atau tarik & lepas foto dokumen dari galeri / komputer'
                : 'Or drag & drop document photos from your device'
            }
            activeLabel={isId ? 'Lepaskan foto dokumen di sini...' : 'Drop document photos here...'}
            buttonLabel={isId ? 'Pilih Foto Dokumen' : 'Choose Document Photos'}
            formatsHint={
              isId
                ? 'JPG, PNG, WebP • Bisa banyak halaman sekaligus (Maks. 30 MB/foto)'
                : 'JPG, PNG, WebP • Multi-page batch supported (Max 30 MB/photo)'
            }
            onFilesSelected={(files) => {
              void handleFilesSelected(files);
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Live Filtered Preview + Page Filmstrip */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-4 sm:min-h-[440px]">
              <canvas
                ref={previewCanvasRef}
                className="max-h-[500px] max-w-full rounded-lg bg-white shadow-md"
              />
            </div>

            {/* Page Strip */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-data text-xs font-bold text-[var(--ink-primary)] tabular-nums">
                  {pages.length} {isId ? 'halaman siap di-scan' : pages.length === 1 ? 'page ready' : 'pages ready'}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="rounded-lg border border-[var(--accent)] bg-[var(--accent-pill)] px-2.5 py-1 text-xs font-bold text-[var(--accent-pill-ink)]"
                  >
                    + {isId ? 'Foto Kamera' : 'Camera'}
                  </button>
                  <label className="cursor-pointer rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)]">
                    <span>+ {isId ? 'Tambah dari Galeri' : 'Add Photos'}</span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        if (e.target.files?.length) {
                          void handleFilesSelected(Array.from(e.target.files));
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                {pages.map((p, idx) => {
                  const active = selectedPage?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-2.5 transition-colors ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent-row-bg)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--accent)]'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="font-data inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--bg-recess)] text-xs font-bold text-[var(--ink-primary)] tabular-nums">
                          {idx + 1}
                        </span>
                        <img
                          src={p.objectUrl}
                          alt={p.name}
                          className="h-10 w-8 shrink-0 rounded border border-[var(--border-subtle)] object-cover"
                        />
                        <div className="min-w-0">
                          <p className="m-0 truncate text-xs font-bold text-[var(--ink-primary)]">
                            {p.name}
                          </p>
                          <p className="font-data m-0 text-[11px] text-[var(--ink-muted)]">
                            {p.filter} · {p.rotation}°
                          </p>
                        </div>
                      </div>

                      <div
                        className="flex shrink-0 items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={idx === 0}
                          aria-label={isId ? 'Geser naik' : 'Move up'}
                          onClick={() => handleMove(idx, -1)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)] disabled:opacity-30"
                        >
                          <ArrowUpIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === pages.length - 1}
                          aria-label={isId ? 'Geser turun' : 'Move down'}
                          onClick={() => handleMove(idx, 1)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)] disabled:opacity-30"
                        >
                          <ArrowDownIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={isId ? 'Hapus halaman' : 'Remove page'}
                          onClick={() => handleRemove(p.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Enhancement & PDF Export Controls */}
          <div className="space-y-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-recess)]/50 p-4 lg:col-span-5">
            {selectedPage && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
                      {isId ? 'Filter Scan' : 'Scan Filter'}
                    </span>
                    <button
                      type="button"
                      onClick={handleRotateSelected}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)]"
                    >
                      {isId ? 'Putar 90°' : 'Rotate 90°'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FILTER_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => updateSelected({ filter: opt.key })}
                        className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                          selectedPage.filter === opt.key
                            ? 'border-[var(--accent)] bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)] hover:border-[var(--accent)]'
                        }`}
                      >
                        {isId ? opt.labelId : opt.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Brightness & Contrast Sliders */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <label htmlFor={brightnessId} className="font-semibold text-[var(--ink-primary)]">
                        {isId ? 'Kecerahan Kertas' : 'Paper Brightness'}
                      </label>
                      <span className="font-data text-[11px] text-[var(--ink-muted)] tabular-nums">
                        {selectedPage.adjustments.brightness > 0
                          ? `+${selectedPage.adjustments.brightness}`
                          : selectedPage.adjustments.brightness}
                      </span>
                    </div>
                    <input
                      id={brightnessId}
                      type="range"
                      min={-40}
                      max={40}
                      step={2}
                      value={selectedPage.adjustments.brightness}
                      onChange={(e) =>
                        updateSelected({
                          adjustments: {
                            ...selectedPage.adjustments,
                            brightness: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <label htmlFor={contrastId} className="font-semibold text-[var(--ink-primary)]">
                        {isId ? 'Kontras Teks' : 'Text Contrast'}
                      </label>
                      <span className="font-data text-[11px] text-[var(--ink-muted)] tabular-nums">
                        {selectedPage.adjustments.contrast > 0
                          ? `+${selectedPage.adjustments.contrast}`
                          : selectedPage.adjustments.contrast}
                      </span>
                    </div>
                    <input
                      id={contrastId}
                      type="range"
                      min={-40}
                      max={60}
                      step={2}
                      value={selectedPage.adjustments.contrast}
                      onChange={(e) =>
                        updateSelected({
                          adjustments: {
                            ...selectedPage.adjustments,
                            contrast: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>

                  {pages.length > 1 && (
                    <button
                      type="button"
                      onClick={applyFilterToAll}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)]"
                    >
                      {isId
                        ? 'Terapkan Filter ke Semua Halaman'
                        : 'Apply Filter to All Pages'}
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Paper Size & Margin */}
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-4">
              <div className="space-y-1.5">
                <span className="block text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
                  {isId ? 'Ukuran Kertas' : 'Page Size'}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as ScanPageSizeKey)}
                  className="w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2.5 py-2 text-xs font-semibold text-[var(--ink-primary)]"
                >
                  <option value="a4">A4 (Auto)</option>
                  <option value="letter">Letter (Auto)</option>
                  <option value="fit">{isId ? 'Sesuai Gambar' : 'Fit Image'}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
                  Margin
                </span>
                <select
                  value={margin}
                  onChange={(e) => setMargin(e.target.value as ScanPageMarginKey)}
                  className="w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2.5 py-2 text-xs font-semibold text-[var(--ink-primary)]"
                >
                  <option value="none">{isId ? 'Tanpa Margin' : 'None'}</option>
                  <option value="small">{isId ? 'Tipis' : 'Small'}</option>
                  <option value="normal">{isId ? 'Normal' : 'Normal'}</option>
                </select>
              </div>
            </div>

            {/* Export Button */}
            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                disabled={isBuilding || pages.length === 0}
                onClick={() => void handleBuildPdf()}
                className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-50"
              >
                <DownloadIcon className="h-4 w-4" />
                <span>
                  {isBuilding
                    ? isId
                      ? 'Menyusun PDF Scan...'
                      : 'Building Scanned PDF...'
                    : isId
                      ? `Unduh PDF (${pages.length} Halaman)`
                      : `Download PDF (${pages.length} ${pages.length === 1 ? 'Page' : 'Pages'})`}
                </span>
              </button>

              {resultBlob && (
                <p className="font-data m-0 text-center text-[11px] text-[var(--ink-muted)] tabular-nums">
                  {resultBlob.filename} · {formatBytes(resultBlob.blob.size)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {resultBlob && (
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
