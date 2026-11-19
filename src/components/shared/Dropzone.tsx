import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from 'react';
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
  onFilesSelected: (files: File[]) => void | Promise<void>;
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

  const handleContainerClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = event.target as HTMLElement | null;
    // Avoid double-opening when clicking the native <label> or <input> directly
    if (target?.closest('label, input, button, a')) {
      return;
    }
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const handleInputClick = (event: MouseEvent<HTMLInputElement>) => {
    // Clear previous selection before opening picker so picking the same file again fires onChange
    event.currentTarget.value = '';
  };

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const inputEl = event.currentTarget;
    const fileList = inputEl.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    try {
      await onFilesSelected(multiple ? files : files.slice(0, 1));
    } finally {
      inputEl.value = '';
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (disabled) return;
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length > 0) {
      await onFilesSelected(multiple ? dropped : dropped.slice(0, 1));
    }
  };

  if (compact) {
    return (
      <div
        onClick={handleContainerClick}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        } ${
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
          onClick={handleInputClick}
          onChange={handleInputChange}
          className="peer sr-only"
        />
        <p className="m-0 text-sm text-[var(--ink-muted)]">
          {isDragging ? activeLabel : formatsHint}
        </p>
        <label
          htmlFor={inputId}
          aria-disabled={disabled || undefined}
          className={`btn-secondary inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)] ${
            disabled ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          <UploadTrayIcon className="h-4 w-4" />
          <span>{buttonLabel}</span>
        </label>
      </div>
    );
  }

  return (
    <div
      onClick={handleContainerClick}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-xl border-2 border-dashed px-5 py-10 text-center transition-colors sm:px-8 sm:py-12 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-[var(--accent)]'
      } ${
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
        onClick={handleInputClick}
        onChange={handleInputChange}
        className="peer sr-only"
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

        <label
          htmlFor={inputId}
          aria-disabled={disabled || undefined}
          className={`btn-primary inline-flex min-h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)] ${
            disabled ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          <UploadTrayIcon className="h-4 w-4" />
          <span>{buttonLabel}</span>
        </label>
      </div>
    </div>
  );
}
