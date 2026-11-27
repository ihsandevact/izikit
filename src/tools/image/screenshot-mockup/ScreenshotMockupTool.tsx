import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { validateImageFiles } from '@/lib/file-validation';
import { downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import {
  ASPECT_RATIO_PRESETS,
  buildMockupFilename,
  computeMockupLayout,
  DEFAULT_MOCKUP_CONFIG,
  GRADIENT_PRESETS,
  type AspectRatioKey,
  type BackgroundType,
  type ExportFormatKey,
  type FrameStyleKey,
  type MockupConfig,
  type ShadowPresetKey,
} from './screenshot-mockup.logic';
import { drawMockupOnCanvas, renderMockupBlob } from './mockup-renderer';

interface ScreenshotMockupToolProps {
  locale: Locale;
}

const SOLID_SWATCHES = ['#FFFFFF', '#F3F4F6', '#E5E7EB', '#0F172A', '#1E293B', '#ECFDF5', '#EFF6FF', '#FEF3C7'];

const FRAME_OPTIONS: Array<{ key: FrameStyleKey; labelId: string; labelEn: string }> = [
  { key: 'macos-light', labelId: 'macOS Terang', labelEn: 'macOS Light' },
  { key: 'macos-dark', labelId: 'macOS Gelap', labelEn: 'macOS Dark' },
  { key: 'browser-light', labelId: 'Browser Terang', labelEn: 'Browser Light' },
  { key: 'browser-dark', labelId: 'Browser Gelap', labelEn: 'Browser Dark' },
  { key: 'glass', labelId: 'Kaca (Glass)', labelEn: 'Glass Rim' },
  { key: 'none', labelId: 'Tanpa Bingkai', labelEn: 'No Frame' },
];

const SHADOW_OPTIONS: Array<{ key: ShadowPresetKey; labelId: string; labelEn: string }> = [
  { key: 'none', labelId: 'Tanpa', labelEn: 'None' },
  { key: 'soft', labelId: 'Lembut', labelEn: 'Soft' },
  { key: 'elevated', labelId: 'Tinggi', labelEn: 'Elevated' },
  { key: 'dramatic', labelId: 'Dramatis', labelEn: 'Dramatic' },
];

export default function ScreenshotMockupTool({ locale }: ScreenshotMockupToolProps) {
  const dict = getDictionary(locale);
  const isId = locale === 'id';
  const paddingId = useId();
  const radiusId = useId();
  const titleId = useId();
  const solidColorId = useId();

  const [fileName, setFileName] = useState<string>('screenshot.png');
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [config, setConfig] = useState<MockupConfig>(DEFAULT_MOCKUP_CONFIG);

  const [errors, setErrors] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedImg, setCopiedImg] = useState(false);
  const [hasExported, setHasExported] = useState(false);

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

  const loadIncomingFile = useCallback(
    async (incoming: File[]) => {
      setErrors([]);
      const { accepted, errors: validationErrors } = await validateImageFiles(
        incoming.slice(0, 1),
        {
          tooLarge: isId ? 'Ukuran gambar melebihi batas 30 MB:' : 'Image exceeds 30 MB limit:',
          notImage: isId
            ? 'File bukan gambar JPG/PNG/WebP yang valid:'
            : 'File is not a valid JPG/PNG/WebP image:',
          generic: isId ? 'Gagal membaca file gambar:' : 'Failed to read image file:',
        },
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
        setFileName(chosen.name || 'screenshot.png');
        setHasExported(false);
      };
      img.onerror = () => {
        URL.revokeObjectURL(nextUrl);
        setErrors([
          isId
            ? 'Gambar tidak dapat didekode oleh browser. Coba file lain.'
            : 'The browser could not decode this image. Please try another file.',
        ]);
      };
      img.src = nextUrl;
    },
    [isId],
  );

  // Support direct Ctrl+V / Cmd+V clipboard screenshot paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const pastedFile = item.getAsFile();
          if (pastedFile) {
            e.preventDefault();
            const namedFile =
              pastedFile.name && pastedFile.name !== 'image.png'
                ? pastedFile
                : new File([pastedFile], 'clipboard-screenshot.png', {
                    type: pastedFile.type || 'image/png',
                  });
            void loadIncomingFile([namedFile]);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [loadIncomingFile]);

  const outputLayout = useMemo(() => {
    if (!imageEl) return null;
    return computeMockupLayout(
      imageEl.naturalWidth || imageEl.width,
      imageEl.naturalHeight || imageEl.height,
      config,
    );
  }, [config, imageEl]);

  // Live preview render
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !imageEl) return;
    drawMockupOnCanvas(canvas, imageEl, config, 1200);
  }, [config, imageEl]);

  const handleExport = async (format: ExportFormatKey) => {
    if (!imageEl || isExporting) return;
    setIsExporting(true);
    setErrors([]);
    try {
      const { blob } = await renderMockupBlob(imageEl, config, format);
      const outName = buildMockupFilename(fileName, config.aspectRatio, format);
      downloadBlob(blob, outName);
      setHasExported(true);
    } catch {
      setErrors([
        isId ? 'Gagal mengekspor gambar mockup.' : 'Failed to export mockup image.',
      ]);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyImage = async () => {
    if (!imageEl || isExporting) return;
    setErrors([]);
    if (
      typeof navigator === 'undefined' ||
      !navigator.clipboard?.write ||
      typeof ClipboardItem === 'undefined'
    ) {
      setErrors([
        isId
          ? 'Browser ini belum mendukung salin gambar ke clipboard. Gunakan tombol Unduh PNG.'
          : 'This browser does not support copying images to clipboard. Use Download PNG instead.',
      ]);
      return;
    }
    setIsExporting(true);
    try {
      const { blob } = await renderMockupBlob(imageEl, config, 'png');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopiedImg(true);
      setHasExported(true);
      window.setTimeout(() => setCopiedImg(false), 1800);
    } catch {
      setErrors([
        isId
          ? 'Gagal menyalin gambar ke clipboard. Gunakan tombol Unduh PNG.'
          : 'Failed to copy image to clipboard. Use Download PNG instead.',
      ]);
    } finally {
      setIsExporting(false);
    }
  };

  const hasChromeTitle =
    config.frameStyle === 'macos-light' ||
    config.frameStyle === 'macos-dark' ||
    config.frameStyle === 'browser-light' ||
    config.frameStyle === 'browser-dark';

  return (
    <div className="space-y-5">
      {errors.length > 0 && (
        <ErrorAlert
          messages={errors}
          dismissLabel={dict.shared.dismissError}
          onDismiss={() => setErrors([])}
        />
      )}

      {!imageEl ? (
        <div className="space-y-3">
          <Dropzone
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            multiple={false}
            idleLabel={
              isId
                ? 'Tarik & lepas screenshot di sini, atau klik untuk memilih'
                : 'Drag & drop your screenshot here, or click to browse'
            }
            activeLabel={
              isId ? 'Lepaskan gambar di sini...' : 'Drop your screenshot here...'
            }
            buttonLabel={isId ? 'Pilih Screenshot' : 'Choose Screenshot'}
            formatsHint={
              isId
                ? 'JPG, PNG, WebP (Maks. 30 MB) • Tips: tekan Ctrl+V / Cmd+V untuk tempel dari clipboard'
                : 'JPG, PNG, WebP (Max 30 MB) • Tip: press Ctrl+V / Cmd+V to paste from clipboard'
            }
            onFilesSelected={(files) => {
              void loadIncomingFile(files);
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Live Canvas Preview */}
          <div className="space-y-3 lg:col-span-7">
            <div
              className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-subtle)] p-4 sm:min-h-[420px]"
              style={{
                backgroundImage:
                  config.backgroundType === 'transparent'
                    ? 'repeating-conic-gradient(var(--bg-recess) 0% 25%, var(--bg-card) 0% 50%)'
                    : undefined,
                backgroundSize: config.backgroundType === 'transparent' ? '20px 20px' : undefined,
                backgroundColor:
                  config.backgroundType === 'transparent' ? undefined : 'var(--bg-recess)',
              }}
            >
              <canvas
                ref={previewCanvasRef}
                className="max-h-[520px] max-w-full rounded-lg shadow-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
              <span className="font-data tabular-nums">
                {outputLayout
                  ? `${outputLayout.canvasWidth} × ${outputLayout.canvasHeight} px`
                  : ''}
                {' · '}
                {fileName}
              </span>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)]">
                  <span>{isId ? 'Ganti Gambar' : 'Replace Image'}</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        void loadIncomingFile(Array.from(e.target.files));
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setConfig(DEFAULT_MOCKUP_CONFIG)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1.5 font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--ink-primary)]"
                >
                  {isId ? 'Reset Gaya' : 'Reset Style'}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="space-y-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-recess)]/50 p-4 lg:col-span-5">
            {/* Aspect Ratio */}
            <div className="space-y-2">
              <span className="block text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
                {isId ? 'Rasio Kanvas' : 'Canvas Aspect Ratio'}
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(ASPECT_RATIO_PRESETS) as AspectRatioKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, aspectRatio: key }))}
                    className={`font-data rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                      config.aspectRatio === key
                        ? 'border-[var(--accent)] bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)] hover:border-[var(--accent)]'
                    }`}
                  >
                    {ASPECT_RATIO_PRESETS[key].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Background Type & Presets */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
                  {isId ? 'Latar Belakang' : 'Background'}
                </span>
                <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0.5 text-[11px]">
                  {(
                    [
                      ['gradient', isId ? 'Gradasi' : 'Gradient'],
                      ['solid', isId ? 'Solid' : 'Solid'],
                      ['transparent', isId ? 'Transparan' : 'Transparent'],
                    ] as Array<[BackgroundType, string]>
                  ).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setConfig((c) => ({ ...c, backgroundType: type }))}
                      className={`rounded-md px-2 py-1 font-semibold transition-colors ${
                        config.backgroundType === type
                          ? 'bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                          : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {config.backgroundType === 'gradient' && (
                <div className="grid grid-cols-4 gap-2">
                  {GRADIENT_PRESETS.map((preset) => {
                    const bgCss = `linear-gradient(${preset.angleDeg}deg, ${preset.stops.join(', ')})`;
                    const active = config.gradientId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        title={isId ? preset.labelId : preset.labelEn}
                        aria-label={isId ? preset.labelId : preset.labelEn}
                        onClick={() => setConfig((c) => ({ ...c, gradientId: preset.id }))}
                        className={`h-9 rounded-lg border-2 transition-transform ${
                          active
                            ? 'scale-[1.03] border-[var(--ink-primary)] ring-2 ring-[var(--accent)]/40'
                            : 'border-white/40 hover:scale-[1.02]'
                        }`}
                        style={{ background: bgCss }}
                      />
                    );
                  })}
                </div>
              )}

              {config.backgroundType === 'solid' && (
                <div className="flex flex-wrap items-center gap-2">
                  {SOLID_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={hex}
                      onClick={() => setConfig((c) => ({ ...c, solidColor: hex }))}
                      className={`h-7 w-7 rounded-lg border-2 ${
                        config.solidColor.toLowerCase() === hex.toLowerCase()
                          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30'
                          : 'border-[var(--border-subtle)]'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  <label htmlFor={solidColorId} className="sr-only">
                    {isId ? 'Pilih warna latar kustom' : 'Pick custom background color'}
                  </label>
                  <input
                    id={solidColorId}
                    type="color"
                    value={config.solidColor}
                    onChange={(e) => setConfig((c) => ({ ...c, solidColor: e.target.value }))}
                    className="h-7 w-10 cursor-pointer rounded border border-[var(--border-subtle)] bg-transparent"
                  />
                </div>
              )}
            </div>

            {/* Frame Style */}
            <div className="space-y-2">
              <span className="block text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
                {isId ? 'Bingkai Jendela' : 'Window Frame'}
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {FRAME_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, frameStyle: opt.key }))}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      config.frameStyle === opt.key
                        ? 'border-[var(--accent)] bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)] hover:border-[var(--accent)]'
                    }`}
                  >
                    {isId ? opt.labelId : opt.labelEn}
                  </button>
                ))}
              </div>

              {hasChromeTitle && (
                <div className="pt-1">
                  <label
                    htmlFor={titleId}
                    className="mb-1 block text-[11px] font-medium text-[var(--ink-muted)]"
                  >
                    {isId ? 'Judul / URL di bar atas (opsional)' : 'Top bar title / URL (optional)'}
                  </label>
                  <input
                    id={titleId}
                    type="text"
                    value={config.frameTitle}
                    onChange={(e) => setConfig((c) => ({ ...c, frameTitle: e.target.value }))}
                    placeholder="izikit.app"
                    className="w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
              )}
            </div>

            {/* Sliders: Padding & Border Radius */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={paddingId} className="font-semibold text-[var(--ink-primary)]">
                    Padding
                  </label>
                  <span className="font-data text-[11px] text-[var(--ink-muted)] tabular-nums">
                    {config.padding}px
                  </span>
                </div>
                <input
                  id={paddingId}
                  type="range"
                  min={0}
                  max={160}
                  step={4}
                  value={config.padding}
                  onChange={(e) => setConfig((c) => ({ ...c, padding: Number(e.target.value) }))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor={radiusId} className="font-semibold text-[var(--ink-primary)]">
                    {isId ? 'Sudut' : 'Radius'}
                  </label>
                  <span className="font-data text-[11px] text-[var(--ink-muted)] tabular-nums">
                    {config.borderRadius}px
                  </span>
                </div>
                <input
                  id={radiusId}
                  type="range"
                  min={0}
                  max={36}
                  step={2}
                  value={config.borderRadius}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, borderRadius: Number(e.target.value) }))
                  }
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            </div>

            {/* Shadow & Scale */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="block text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
                  {isId ? 'Bayangan' : 'Shadow'}
                </span>
                <div className="grid grid-cols-2 gap-1">
                  {SHADOW_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setConfig((c) => ({ ...c, shadow: opt.key }))}
                      className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                        config.shadow === opt.key
                          ? 'border-[var(--accent)] bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)]'
                      }`}
                    >
                      {isId ? opt.labelId : opt.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
                  {isId ? 'Resolusi Ekspor' : 'Export Scale'}
                </span>
                <div className="grid grid-cols-2 gap-1">
                  {([1, 2] as const).map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => setConfig((c) => ({ ...c, exportScale: scale }))}
                      className={`font-data rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                        config.exportScale === scale
                          ? 'border-[var(--accent)] bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)]'
                      }`}
                    >
                      {scale}× {scale === 2 ? 'HD' : ''}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Export Buttons */}
            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => void handleExport('png')}
                  className="btn-primary inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold disabled:opacity-50"
                >
                  <DownloadIcon className="h-4 w-4" />
                  <span>{isId ? 'Unduh PNG' : 'Download PNG'}</span>
                </button>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => void handleExport('webp')}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-50"
                >
                  <DownloadIcon className="h-4 w-4" />
                  <span>{isId ? 'Unduh WebP' : 'Download WebP'}</span>
                </button>
              </div>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => void handleCopyImage()}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] py-2 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-50"
              >
                {copiedImg
                  ? isId
                    ? 'Gambar Tersalin ke Clipboard!'
                    : 'Image Copied to Clipboard!'
                  : isId
                    ? 'Salin Gambar ke Clipboard'
                    : 'Copy Image to Clipboard'}
              </button>
            </div>
          </div>
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
