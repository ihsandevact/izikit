import { useId, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { UploadTrayIcon } from './icons';

interface DropzoneProps {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  compact?: boolean;
  idleLabel: string;
  activeLabel: string;
  buttonLabel: string;
  formatsHint: string;
  onFilesSelected: (files: File[]) => void;
}

export default function Dropzone({
  accept,
  multiple = true,
  disabled = false,
  compact = false,
  idleLabel,
  activeLabel,
  buttonLabel,
  formatsHint,
  onFilesSelected,
}: DropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (fileList && fileList.length > 0) {
      onFilesSelected(Array.from(fileList));
    }
    // Reset value so picking the exact same file again still triggers onChange
    event.target.value = '';
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (disabled) return;
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length > 0) {
      onFilesSelected(multiple ? dropped : dropped.slice(0, 1));
    }
  };

  if (compact) {
    return (
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors ${
          isDragging
            ? 'border-[var(--accent)] bg-[var(--accent-tint)]'
            : 'border-[var(--border-control)] bg-[var(--bg-recess)]'
        }`}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={handleInputChange}
          className="sr-only"
        />
        <p className="m-0 text-sm text-[var(--ink-muted)]">
          {isDragging ? activeLabel : formatsHint}
        </p>
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          className="btn-secondary inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium"
        >
          <UploadTrayIcon className="h-4 w-4" />
          <span>{buttonLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-xl border-2 border-dashed px-5 py-10 text-center transition-colors sm:px-8 sm:py-12 ${
        isDragging
          ? 'border-[var(--accent)] bg-[var(--accent-tint)]'
          : 'border-[var(--border-control)] bg-[var(--bg-recess)]'
      }`}
    >
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleInputChange}
        className="sr-only"
      />

      <div className="mx-auto flex max-w-md flex-col items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-primary)]">
          <UploadTrayIcon className="h-6 w-6" />
        </div>

        <div className="space-y-1.5">
          <p className="m-0 text-base font-semibold text-[var(--ink-primary)]">
            {isDragging ? activeLabel : idleLabel}
          </p>
          <p className="m-0 text-sm text-[var(--ink-muted)]">{formatsHint}</p>
        </div>

        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          className="btn-primary inline-flex min-h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold"
        >
          <UploadTrayIcon className="h-4 w-4" />
          <span>{buttonLabel}</span>
        </button>
      </div>
    </div>
  );
}
