interface ProgressBannerProps {
  title: string;
  detail: string;
  percent: number;
  cancelLabel: string;
  onCancel?: () => void;
}

export default function ProgressBanner({
  title,
  detail,
  percent,
  cancelLabel,
  onCancel,
}: ProgressBannerProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-[var(--border-control)] bg-[var(--bg-recess)] p-4"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="m-0 text-sm font-semibold text-[var(--ink-primary)]">{title}</p>
          <p className="m-0 text-xs text-[var(--ink-muted)]">{detail}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-data text-sm font-semibold text-[var(--ink-primary)]">
            {clamped}%
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={title}
        className="h-2.5 w-full overflow-hidden rounded-sm bg-[var(--border-subtle)]"
      >
        <div
          className="h-full bg-[var(--accent)] transition-[width] duration-150 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
