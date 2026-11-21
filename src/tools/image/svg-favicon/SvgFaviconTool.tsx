import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes } from '@/lib/format';
import { SITE_CONFIG } from '@/config/site';
import { downloadAsZip, downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon } from '@/components/shared/icons';
import {
  buildFaviconHtmlSnippet,
  buildWebManifestJson,
  FAVICON_ASSET_SPECS,
  normalizeSvgDimensions,
} from './favicon-generator.logic';
import { encodePngFramesToIco, type IcoPngFrame } from './ico-encoder';

interface GeneratedAsset {
  id: string;
  filename: string;
  size: number;
  purpose: string;
  blob: Blob;
  previewUrl: string;
}

interface SvgFaviconToolProps {
  locale: Locale;
}

function renderIconToPngBlob(
  image: HTMLImageElement,
  size: number,
  paddingPercent: number,
  bgMode: 'transparent' | 'solid',
  bgColor: string,
  radiusPercent: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('Could not initialize 2D canvas context.'));
  }

  if (bgMode === 'solid') {
    const r = Math.round((size * radiusPercent) / 100);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.clip();
  }

  const pad = Math.round((size * paddingPercent) / 100);
  const avail = Math.max(1, size - pad * 2);
  const srcW = Math.max(1, image.naturalWidth || size);
  const srcH = Math.max(1, image.naturalHeight || size);
  const scale = Math.min(avail / srcW, avail / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const dx = (size - drawW) / 2;
  const dy = (size - drawH) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, dx, dy, drawW, drawH);

  if (bgMode === 'solid') {
    ctx.restore();
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) reject(new Error('Failed to encode PNG icon.'));
        else resolve(blob);
      },
      'image/png',
    );
  });
}

export default function SvgFaviconTool({ locale }: SvgFaviconToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.svgFavicon;

  const appNameId = useId();
  const padId = useId();
  const radiusId = useId();
  const bgColorId = useId();

  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const [appName, setAppName] = useState('My App');
  const [paddingPercent, setPaddingPercent] = useState(8);
  const [bgMode, setBgMode] = useState<'transparent' | 'solid'>('transparent');
  const [bgColor, setBgColor] = useState('#0B1020');
  const [radiusPercent, setRadiusPercent] = useState(20);

  const [assets, setAssets] = useState<GeneratedAsset[]>([]);
  const [icoBlob, setIcoBlob] = useState<Blob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const sourceUrlRef = useRef<string | null>(null);
  sourceUrlRef.current = sourceUrl;
  const assetsRef = useRef<GeneratedAsset[]>([]);
  assetsRef.current = assets;

  const revokeAssets = (list: readonly GeneratedAsset[]) => {
    for (const item of list) {
      URL.revokeObjectURL(item.previewUrl);
    }
  };

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      revokeAssets(assetsRef.current);
    };
  }, []);

  const htmlSnippet = useMemo(
    () => buildFaviconHtmlSnippet(bgMode === 'solid' ? bgColor : '#0B1020'),
    [bgColor, bgMode],
  );

  // Auto-generate favicon pack whenever source image or settings change
  useEffect(() => {
    if (!imageEl) return;
    let cancelled = false;

    const run = async () => {
      setIsGenerating(true);
      try {
        const nextAssets: GeneratedAsset[] = [];
        const icoFrames: IcoPngFrame[] = [];

        for (const spec of FAVICON_ASSET_SPECS) {
          const blob = await renderIconToPngBlob(
            imageEl,
            spec.size,
            paddingPercent,
            bgMode,
            bgColor,
            radiusPercent,
          );
          if (cancelled) return;

          if (spec.includeInIco) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            icoFrames.push({ size: spec.size, pngBytes: bytes });
          }

          nextAssets.push({
            id: spec.id,
            filename: spec.filename,
            size: spec.size,
            purpose: spec.purpose,
            blob,
            previewUrl: URL.createObjectURL(blob),
          });
        }

        const icoBytes = encodePngFramesToIco(icoFrames);
        const nextIcoBlob = new Blob([icoBytes.slice().buffer], { type: 'image/x-icon' });

        if (cancelled) {
          revokeAssets(nextAssets);
          return;
        }

        revokeAssets(assetsRef.current);
        setAssets(nextAssets);
        setIcoBlob(nextIcoBlob);
      } catch {
        if (!cancelled) {
          setErrors([copy.errors.generic]);
        }
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [bgColor, bgMode, copy.errors.generic, imageEl, paddingPercent, radiusPercent]);

  const handleFilesSelected = async (incoming: File[]) => {
    setErrors([]);
    const file = incoming[0];
    if (!file) return;

    if (file.size > SITE_CONFIG.limits.imageSoftMaxBytes) {
      setErrors([`${copy.errors.tooLarge} ${file.name} (${formatBytes(file.size)})`]);
      return;
    }

    const lower = file.name.toLowerCase();
    const isSvg = file.type === 'image/svg+xml' || lower.endsWith('.svg');
    const isRaster =
      file.type === 'image/png' ||
      file.type === 'image/webp' ||
      lower.endsWith('.png') ||
      lower.endsWith('.webp');

    if (!isSvg && !isRaster) {
      setErrors([`${copy.errors.notSupported} ${file.name}`]);
      return;
    }

    try {
      let blobUrl: string;
      if (isSvg) {
        const rawText = await file.text();
        const normalized = normalizeSvgDimensions(rawText, 512);
        const svgBlob = new Blob([normalized], { type: 'image/svg+xml;charset=utf-8' });
        blobUrl = URL.createObjectURL(svgBlob);
      } else {
        blobUrl = URL.createObjectURL(file);
      }

      const img = new Image();
      img.onload = () => {
        if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
        setSourceUrl(blobUrl);
        setImageEl(img);
        setSourceFile(file);
        const stem = file.name.replace(/\.[^/.]+$/, '').trim();
        if (stem) setAppName(stem);
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        setErrors([copy.errors.generic]);
      };
      img.src = blobUrl;
    } catch {
      setErrors([copy.errors.generic]);
    }
  };

  const resetAll = () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    revokeAssets(assetsRef.current);
    setSourceUrl(null);
    setImageEl(null);
    setSourceFile(null);
    setAssets([]);
    setIcoBlob(null);
    setErrors([]);
  };

  const handleDownloadZip = async () => {
    if (assets.length === 0 || !icoBlob) return;
    setIsZipping(true);
    try {
      const themeHex = bgMode === 'solid' ? bgColor : '#0B1020';
      const manifestBlob = new Blob([buildWebManifestJson(appName, themeHex, themeHex)], {
        type: 'application/manifest+json',
      });
      const files = [
        { filename: 'favicon.ico', blob: icoBlob },
        ...assets.map((a) => ({ filename: a.filename, blob: a.blob })),
        { filename: 'site.webmanifest', blob: manifestBlob },
      ];
      await downloadAsZip(files, 'izikit-favicon-pack.zip');
    } finally {
      setIsZipping(false);
    }
  };

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(htmlSnippet);
      setCopiedSnippet(true);
      window.setTimeout(() => setCopiedSnippet(false), 1800);
    } catch {
      // Ignore clipboard failures in restricted contexts
    }
  };

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {!sourceFile || !imageEl ? (
        <Dropzone
          accept="image/svg+xml,image/png,image/webp,.svg,.png,.webp"
          multiple={false}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleFilesSelected}
        />
      ) : (
        <div className="space-y-5">
          {/* Source bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5 sm:p-4">
            <div className="min-w-0 space-y-0.5">
              <p className="m-0 truncate text-sm font-bold text-[var(--ink-primary)]">
                {sourceFile.name}
              </p>
              <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                {formatBytes(sourceFile.size)} · {assets.length + (icoBlob ? 2 : 0)} {copy.filesUnit}
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

          {/* Settings + Download Pack */}
          <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor={appNameId} className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.appNameLabel}
                </label>
                <input
                  id={appNameId}
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 text-sm text-[var(--ink-primary)]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <label htmlFor={padId} className="font-medium text-[var(--ink-primary)]">
                    {copy.paddingLabel}
                  </label>
                  <span className="font-data font-semibold text-[var(--accent)]">
                    {paddingPercent}%
                  </span>
                </div>
                <input
                  id={padId}
                  type="range"
                  min={0}
                  max={25}
                  step={1}
                  value={paddingPercent}
                  onChange={(e) => setPaddingPercent(Number(e.target.value))}
                  className="izikit-range h-10 w-full"
                />
              </div>

              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-[var(--ink-primary)]">
                  {copy.backgroundLabel}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={bgMode === 'transparent'}
                    onClick={() => setBgMode('transparent')}
                    className={`min-h-10 flex-1 rounded-lg border px-2.5 text-xs font-semibold ${
                      bgMode === 'transparent'
                        ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)]'
                    }`}
                  >
                    {copy.bgTransparent}
                  </button>
                  <button
                    type="button"
                    aria-pressed={bgMode === 'solid'}
                    onClick={() => setBgMode('solid')}
                    className={`min-h-10 flex-1 rounded-lg border px-2.5 text-xs font-semibold ${
                      bgMode === 'solid'
                        ? 'border-[var(--accent)] bg-[var(--accent-tint)] text-[var(--ink-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)]'
                    }`}
                  >
                    {copy.bgSolid}
                  </button>
                </div>
              </div>
            </div>

            {bgMode === 'solid' && (
              <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <label htmlFor={bgColorId} className="text-sm font-medium text-[var(--ink-primary)]">
                    {copy.bgColorLabel}
                  </label>
                  <input
                    id={bgColorId}
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-[var(--border-control)] bg-transparent p-0.5"
                  />
                  <span className="font-data text-xs text-[var(--ink-muted)]">
                    {bgColor.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <label htmlFor={radiusId} className="font-medium text-[var(--ink-primary)]">
                      {copy.radiusLabel}
                    </label>
                    <span className="font-data font-semibold text-[var(--accent)]">
                      {radiusPercent}%
                    </span>
                  </div>
                  <input
                    id={radiusId}
                    type="range"
                    min={0}
                    max={50}
                    step={2}
                    value={radiusPercent}
                    onChange={(e) => setRadiusPercent(Number(e.target.value))}
                    className="izikit-range h-9 w-full"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-4">
              {icoBlob && (
                <button
                  type="button"
                  onClick={() => downloadBlob(icoBlob, 'favicon.ico')}
                  className="btn-secondary inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold"
                >
                  <DownloadIcon className="h-4 w-4" />
                  <span>{copy.downloadIco}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={isGenerating || isZipping || assets.length === 0}
                className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold sm:w-auto"
              >
                <DownloadIcon className="h-4 w-4" />
                <span>{isZipping ? dict.shared.buildingZip : copy.downloadZip}</span>
              </button>
            </div>
          </div>

          {/* Icon Preview Grid */}
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="bg-checkerboard flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] p-1.5">
                    <img
                      src={asset.previewUrl}
                      alt={asset.filename}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-data m-0 truncate text-xs font-bold text-[var(--ink-primary)]">
                      {asset.filename}
                    </p>
                    <p className="m-0 text-[11px] text-[var(--ink-muted)]">
                      {asset.size}×{asset.size} px · {formatBytes(asset.blob.size)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadBlob(asset.blob, asset.filename)}
                  className="btn-secondary inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold"
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                  <span>{copy.downloadSingle}</span>
                </button>
              </li>
            ))}
          </ul>

          {/* HTML Snippet */}
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 text-sm font-bold text-[var(--ink-primary)]">
                {copy.htmlSnippetHeading}
              </h3>
              <button
                type="button"
                onClick={handleCopySnippet}
                className="btn-secondary inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-semibold"
              >
                {copiedSnippet ? copy.copiedButton : copy.copyButton}
              </button>
            </div>
            <pre className="font-data m-0 overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-3 text-xs leading-relaxed text-[var(--ink-primary)]">
              <code>{htmlSnippet}</code>
            </pre>
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
