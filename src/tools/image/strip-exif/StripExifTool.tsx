import { useEffect, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { formatBytes } from '@/lib/format';
import {
  mimeToExtension,
  validateImageFiles,
  type SupportedImageMime,
} from '@/lib/file-validation';
import { downloadAsZip, downloadBlob } from '@/lib/download';
import Dropzone from '@/components/shared/Dropzone';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon, TrashIcon } from '@/components/shared/icons';
import {
  buildCleanMetadataFilename,
  hasAnyDetectedMetadata,
  inspectWebpMetadata,
  processJpegMetadata,
  processPngMetadata,
  type DetectedMetadata,
} from './exif-strip.logic';

interface StripExifQueueItem {
  id: string;
  file: File;
  mime: SupportedImageMime;
  previewUrl: string;
  metadata: DetectedMetadata;
  cleanedBlob?: Blob;
  outputFilename?: string;
}

interface StripExifToolProps {
  locale: Locale;
}

async function stripWebpViaCanvas(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize 2D canvas context.');
    ctx.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('Failed to encode clean WebP.'));
          else resolve(blob);
        },
        'image/webp',
        0.95,
      );
    });
  } finally {
    bitmap.close();
  }
}

export default function StripExifTool({ locale }: StripExifToolProps) {
  const dict = getDictionary(locale);
  const copy = dict.stripExif;

  const [items, setItems] = useState<StripExifQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const itemsRef = useRef<StripExifQueueItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const handleFilesSelected = async (incoming: File[]) => {
    setErrors([]);
    const { accepted, errors: validationErrors } = await validateImageFiles(incoming, copy.errors);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
    }
    if (accepted.length === 0) return;

    const inspected: StripExifQueueItem[] = await Promise.all(
      accepted.map(async ({ id, file, mime }) => {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let metadata: DetectedMetadata;

        if (mime === 'image/jpeg') {
          metadata = processJpegMetadata(bytes).metadata;
        } else if (mime === 'image/png') {
          metadata = processPngMetadata(bytes).metadata;
        } else {
          metadata = inspectWebpMetadata(bytes);
        }

        return {
          id,
          file,
          mime,
          previewUrl: URL.createObjectURL(file),
          metadata,
        };
      }),
    );

    setItems((prev) => [...prev, ...inspected]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const resetAll = () => {
    for (const item of items) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setItems([]);
    setErrors([]);
  };

  const handleCleanAll = async () => {
    if (items.length === 0) return;
    setIsProcessing(true);
    setErrors([]);

    try {
      const cleanedItems = await Promise.all(
        items.map(async (item) => {
          const outputFilename = buildCleanMetadataFilename(item.file.name, item.mime);
          if (item.mime === 'image/jpeg') {
            const bytes = new Uint8Array(await item.file.arrayBuffer());
            const { bytes: cleanBytes } = processJpegMetadata(bytes);
            const safeBuffer = cleanBytes.slice().buffer;
            return {
              ...item,
              cleanedBlob: new Blob([safeBuffer], { type: 'image/jpeg' }),
              outputFilename,
            };
          }
          if (item.mime === 'image/png') {
            const bytes = new Uint8Array(await item.file.arrayBuffer());
            const { bytes: cleanBytes } = processPngMetadata(bytes);
            const safeBuffer = cleanBytes.slice().buffer;
            return {
              ...item,
              cleanedBlob: new Blob([safeBuffer], { type: 'image/png' }),
              outputFilename,
            };
          }
          const cleanWebp = await stripWebpViaCanvas(item.file);
          return {
            ...item,
            cleanedBlob: cleanWebp,
            outputFilename,
          };
        }),
      );
      setItems(cleanedItems);
    } catch {
      setErrors([copy.errors.generic]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadZip = async () => {
    const done = items.filter((item) => item.cleanedBlob && item.outputFilename);
    if (done.length === 0) return;
    setIsZipping(true);
    try {
      await downloadAsZip(
        done.map((item) => ({
          filename: item.outputFilename!,
          blob: item.cleanedBlob!,
        })),
        'izikit-clean-photos.zip',
      );
    } finally {
      setIsZipping(false);
    }
  };

  const handleDownloadAllSingle = () => {
    const done = items.filter((item) => item.cleanedBlob && item.outputFilename);
    done.forEach((item, idx) => {
      window.setTimeout(() => {
        downloadBlob(item.cleanedBlob!, item.outputFilename!);
      }, idx * 140);
    });
  };

  const doneItems = items.filter((item) => item.cleanedBlob);

  return (
    <div className="space-y-5">
      <ErrorAlert
        messages={errors}
        dismissLabel={dict.shared.dismissError}
        onDismiss={() => setErrors([])}
      />

      {items.length === 0 ? (
        <Dropzone
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple
          disabled={isProcessing}
          idleLabel={dict.shared.dropzoneIdle}
          activeLabel={dict.shared.dropzoneActive}
          buttonLabel={dict.shared.dropzoneSelectButton}
          formatsHint={copy.formatsHint}
          onFilesSelected={handleFilesSelected}
        />
      ) : (
        <div className="space-y-5">
          <Dropzone
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            compact
            disabled={isProcessing}
            idleLabel={dict.shared.dropzoneIdle}
            activeLabel={dict.shared.dropzoneActive}
            buttonLabel={dict.shared.dropzoneAddMore}
            formatsHint={copy.formatsHint}
            onFilesSelected={handleFilesSelected}
          />

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-4">
            <div className="space-y-0.5">
              <p className="m-0 text-sm font-semibold text-[var(--ink-primary)]">
                {items.length} {copy.photosUnit}
              </p>
              <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.losslessNote}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetAll}
                disabled={isProcessing}
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium"
              >
                {dict.shared.clearAll}
              </button>
              <button
                type="button"
                onClick={handleCleanAll}
                disabled={isProcessing}
                className="btn-primary inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold"
              >
                {isProcessing ? copy.processingButton : `${copy.cleanButton} (${items.length})`}
              </button>
            </div>
          </div>

          {doneItems.length > 0 && !isProcessing && (
            <div className="rounded-xl border border-[var(--success)] bg-[var(--success-tint)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="m-0 text-base font-semibold text-[var(--ink-primary)]">
                  {copy.resultReadyTitle} ({doneItems.length})
                </h3>

                <div className="flex flex-wrap items-center gap-2">
                  {doneItems.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={handleDownloadZip}
                        disabled={isZipping}
                        className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
                      >
                        <DownloadIcon className="h-4 w-4" />
                        <span>{isZipping ? dict.shared.buildingZip : copy.downloadZip}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadAllSingle}
                        className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
                      >
                        <DownloadIcon className="h-4 w-4" />
                        <span>{copy.downloadAllSingle}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          downloadBlob(doneItems[0].cleanedBlob!, doneItems[0].outputFilename!)
                        }
                        className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold"
                      >
                        <DownloadIcon className="h-4 w-4" />
                        <span>{copy.downloadSingle}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadZip}
                        disabled={isZipping}
                        className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
                      >
                        <DownloadIcon className="h-4 w-4" />
                        <span>{isZipping ? dict.shared.buildingZip : copy.downloadZipSingle}</span>
                      </button>
                    </>
                  )}
                </div>
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

          {/* File Inspection & Result List */}
          <ul className="m-0 list-none space-y-2.5 p-0">
            {items.map((item) => {
              const hasMeta = hasAnyDetectedMetadata(item.metadata);
              const cameraLabel = [item.metadata.make, item.metadata.model]
                .filter(Boolean)
                .join(' ');
              const savedBytes = item.cleanedBlob
                ? Math.max(0, item.file.size - item.cleanedBlob.size)
                : 0;

              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-paper)] p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      width={56}
                      height={56}
                      className="h-14 w-14 shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] object-cover"
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="m-0 truncate text-sm font-semibold text-[var(--ink-primary)]">
                        {item.outputFilename || item.file.name}
                      </p>
                      <p className="font-data m-0 text-xs text-[var(--ink-muted)]">
                        {mimeToExtension(item.mime).toUpperCase()} · {formatBytes(item.file.size)}
                        {item.cleanedBlob
                          ? ` → ${formatBytes(item.cleanedBlob.size)}${
                              savedBytes > 0 ? ` (-${formatBytes(savedBytes)})` : ''
                            }`
                          : ''}
                      </p>

                      {/* Metadata badges */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {item.cleanedBlob ? (
                          <span className="font-data rounded bg-[var(--success-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--success)]">
                            {copy.badgeCleaned}
                          </span>
                        ) : hasMeta ? (
                          <>
                            {item.metadata.hasGps && (
                              <span className="font-data rounded bg-[var(--danger-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--danger)]">
                                {copy.badgeGps}
                              </span>
                            )}
                            {item.metadata.hasExif && (
                              <span className="font-data rounded bg-[var(--hl-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--hl)]">
                                EXIF
                              </span>
                            )}
                            {item.metadata.hasXmp && (
                              <span className="font-data rounded bg-[var(--hl-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--hl)]">
                                XMP
                              </span>
                            )}
                            {item.metadata.hasIptc && (
                              <span className="font-data rounded bg-[var(--hl-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--hl)]">
                                IPTC
                              </span>
                            )}
                            {cameraLabel && (
                              <span className="font-data rounded border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-2 py-0.5 text-[10px] text-[var(--ink-muted)]">
                                {cameraLabel}
                              </span>
                            )}
                            {item.metadata.dateTime && (
                              <span className="font-data rounded border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-2 py-0.5 text-[10px] text-[var(--ink-muted)]">
                                {item.metadata.dateTime}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="font-data rounded border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-2 py-0.5 text-[10px] text-[var(--ink-muted)]">
                            {copy.badgeAlreadyClean}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {item.cleanedBlob && item.outputFilename && (
                      <button
                        type="button"
                        onClick={() => downloadBlob(item.cleanedBlob!, item.outputFilename!)}
                        className="btn-secondary inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold"
                      >
                        <DownloadIcon className="h-4 w-4" />
                        <span>{copy.downloadSingle}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={isProcessing}
                      aria-label={`${dict.shared.removeFile}: ${item.file.name}`}
                      title={dict.shared.removeFile}
                      className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--danger)]"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
