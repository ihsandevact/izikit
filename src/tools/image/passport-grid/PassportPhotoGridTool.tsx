import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes } from '@/lib/format';
import { validateImageFiles } from '@/lib/file-validation';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import {
  buildPassportSheetFilename,
  computePassportSheetLayout,
  type PassportPhotoSizeKey,
  type PrintPaperSizeKey,
} from './passport-grid.logic';
import {
  drawPassportSheetOnCanvas,
  renderPassportSheetJpegBlob,
  renderPassportSheetPdfBlob,
} from './sheet-renderer';

interface PassportPhotoGridToolProps {
  locale: Locale;
}

export default function PassportPhotoGridTool({ locale }: PassportPhotoGridToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.passportPhotoGrid;

  const photoSizeId = useId();
  const paperSizeId = useId();
  const copiesId = useId();
  const gapId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [photoSize, setPhotoSize] = useState<PassportPhotoSizeKey>('3x4');
  const [paperSize, setPaperSize] = useState<PrintPaperSizeKey>('4r');
  const [copies, setCopies] = useState<number | null>(null);
  const [gapMm, setGapMm] = useState(3);
  const [showCropMarks, setShowCropMarks] = useState(true);
  const [showBorder, setShowBorder] = useState(true);

  const [isExporting, setIsExporting] = useState(false);
  const [hasExported, setHasExported] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  imageUrlRef.current = imageUrl;

  useEffect(() => {
    return () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
    };
  }, []);

  const layout = useMemo(
    () =>
      computePassportSheetLayout({
        paper: paperSize,
        photo: photoSize,
        copies: copies ?? undefined,
        gapMm,
      }),
    [copies, gapMm, paperSize, photoSize],
  );

  // Re-render live sheet preview
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !imageEl) return;

    const maxPreviewSide = 900;
    const scale = Math.min(
      1,
      maxPreviewSide / Math.max(layout.paperWidthPx, layout.paperHeightPx),
    );
    const previewW = Math.max(1, Math.round(layout.paperWidthPx * scale));
    const previewH = Math.max(1, Math.round(layout.paperHeightPx * scale));

    drawPassportSheetOnCanvas(
      canvas,
      imageEl,
      layout,
      { showCropMarks, showBorder },
      previewW,
      previewH,
    );
  }, [imageEl, layout, showBorder, showCropMarks]);

  const handleFilesSelected = async (incoming: File[]) => {
    setErrors([]);
    const { accepted, errors: validationErrors } = await validateImageFiles(
      incoming.slice(0, 1),
      copy.errors,
    );
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (accepted.length === 0) return;

    const chosen = accepted[0].file;
    const nextUrl = URL.createObjectURL(chosen);
    const img = new Image();

    img.onload = () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }
      setImageUrl(nextUrl);
      setImageEl(img);
      setFile(chosen);
      setHasExported(false);
    };
    img.onerror = () => {
      URL.revokeObjectURL(nextUrl);
      setErrors([copy.errors.generic]);
    };
    img.src = nextUrl;
  };

  const resetAll = () => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
    }
    setImageUrl(null);
    setImageEl(null);
    setFile(null);
    setHasExported(false);
    setErrors([]);
  };

  const handleExport = async (kind: 'jpg' | 'pdf') => {
    if (!file || !imageEl) return;
    setIsExporting(true);
    setErrors([]);

    try {
      const options = { showCropMarks, showBorder };
      const blob =
        kind === 'jpg'
          ? await renderPassportSheetJpegBlob(imageEl, layout, options)
          : await renderPassportSheetPdfBlob(imageEl, layout, options);
      const filename = buildPassportSheetFilename(file.name, photoSize, paperSize, kind);
      downloadBlob(blob, filename);
      setHasExported(true);
    } catch {
      setErrors([copy.errors.generic]);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {!file || !imageEl ? (
        <Dropzone
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple={false}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleFilesSelected}
        />
      ) : (
        <div className="space-y-5">
          {/* File Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5 sm:p-4">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 truncate text-sm font-bold text-[var(--ink-primary)]">
                {file.name}
              </p>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {imageEl.naturalWidth}×{imageEl.naturalHeight} · {formatBytes(file.size)} ·{' '}
                {layout.copies}× ({photoSize} cm) · {paperSize.toUpperCase()} 300 DPI
              </p>
            </div>
            <button
              type="button"
              onClick={resetAll}
              className="btn-secondary inline-flex min-h-10 items-center rounded-lg px-3.5 text-xs font-semibold"
            >
              {copy.changeFile}
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
            {/* Settings Panel */}
            <fieldset
              disabled={isExporting}
              className="m-0 space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4"
            >
              <legend className="px-1 text-sm font-semibold text-[var(--ink-primary)]">
                {copy.settingsHeading}
              </legend>

              <div className="space-y-1.5">
                <label htmlFor={photoSizeId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.photoSizeLabel}
                </label>
                <select
                  id={photoSizeId}
                  value={photoSize}
                  onChange={(e) => {
                    setPhotoSize(e.target.value as PassportPhotoSizeKey);
                    setCopies(null);
                  }}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value="2x3">2 × 3 cm (20 × 30 mm)</option>
                  <option value="3x4">3 × 4 cm (30 × 40 mm)</option>
                  <option value="4x6">4 × 6 cm (40 × 60 mm)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={paperSizeId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.paperSizeLabel}
                </label>
                <select
                  id={paperSizeId}
                  value={paperSize}
                  onChange={(e) => {
                    setPaperSize(e.target.value as PrintPaperSizeKey);
                    setCopies(null);
                  }}
                  className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                >
                  <option value="4r">4R (10,2 × 15,2 cm)</option>
                  <option value="a4">A4 (21 × 29,7 cm)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <label htmlFor={copiesId} className="font-medium text-[var(--ink-primary)]">
                    {copy.copiesLabel}
                  </label>
                  <span className="font-data font-semibold text-[var(--accent)]">
                    {layout.copies} / {layout.maxCopies}
                  </span>
                </div>
                <input
                  id={copiesId}
                  type="range"
                  min={1}
                  max={layout.maxCopies}
                  step={1}
                  value={layout.copies}
                  onChange={(e) => setCopies(Number(e.target.value))}
                  className="izikit-range h-10 w-full"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <label htmlFor={gapId} className="font-medium text-[var(--ink-primary)]">
                    {copy.gapLabel}
                  </label>
                  <span className="font-data font-semibold text-[var(--accent)]">{gapMm} mm</span>
                </div>
                <input
                  id={gapId}
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={gapMm}
                  onChange={(e) => setGapMm(Number(e.target.value))}
                  className="izikit-range h-10 w-full"
                />
              </div>

              <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                <label className="flex min-h-9 items-center gap-2.5 text-xs font-medium text-[var(--ink-primary)]">
                  <input
                    type="checkbox"
                    checked={showCropMarks}
                    onChange={(e) => setShowCropMarks(e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span>{copy.cropMarksLabel}</span>
                </label>

                <label className="flex min-h-9 items-center gap-2.5 text-xs font-medium text-[var(--ink-primary)]">
                  <input
                    type="checkbox"
                    checked={showBorder}
                    onChange={(e) => setShowBorder(e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span>{copy.borderLabel}</span>
                </label>
              </div>

              <div className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
                <button
                  type="button"
                  onClick={() => handleExport('jpg')}
                  disabled={isExporting}
                  className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
                >
                  <DownloadIcon className="h-4 w-4" />
                  <span>{copy.downloadJpg}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  disabled={isExporting}
                  className="btn-secondary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
                >
                  <DownloadIcon className="h-4 w-4" />
                  <span>{copy.downloadPdf}</span>
                </button>
              </div>
            </fieldset>

            {/* Live Sheet Preview */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
                <span className="font-semibold text-[var(--ink-primary)]">{copy.previewHeading}</span>
                <span className="font-data">
                  {layout.paperWidthPx}×{layout.paperHeightPx} px · {layout.cols}×{layout.rows}
                </span>
              </div>
              <div className="flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-4 sm:p-6">
                <canvas
                  ref={previewCanvasRef}
                  className="max-h-[68vh] max-w-full rounded border border-slate-300 bg-white shadow-md"
                />
              </div>
            </div>
          </div>

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
      )}
    </div>
  );
}
