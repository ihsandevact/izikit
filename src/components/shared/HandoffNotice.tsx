import type { Locale } from '@/i18n';

interface HandoffNoticeProps {
  sourceRoute: string | null;
  locale: Locale;
  onDismiss: () => void;
}

export default function HandoffNotice({
  sourceRoute,
  locale,
  onDismiss,
}: HandoffNoticeProps) {
  if (!sourceRoute) return null;

  const isCpns = sourceRoute === '/cpns';
  const isId = locale === 'id';

  const message = isCpns
    ? isId
      ? 'File dibawa otomatis dari Cek Berkas CPNS dan siap diproses.'
      : 'File loaded automatically from CPNS Checker and ready to process.'
    : isId
      ? 'File dibawa otomatis dari alat sebelumnya dan siap diproses.'
      : 'File loaded automatically from the previous tool and ready to process.';

  const backLabel = isCpns
    ? isId
      ? 'Kembali ke Cek CPNS'
      : 'Back to CPNS Checker'
    : isId
      ? 'Kembali'
      : 'Back';

  const dismissLabel = isId ? 'Tutup' : 'Dismiss';

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--accent-row-border)] bg-[var(--accent-row-bg)] px-4 py-2.5 text-xs text-[var(--ink-primary)]"
    >
      <p className="m-0 font-semibold">{message}</p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={sourceRoute}
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--accent-row-border)] bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--link)] no-underline transition-colors hover:border-[var(--accent)]"
        >
          {backLabel}
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}
