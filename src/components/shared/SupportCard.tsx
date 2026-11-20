import { useState } from 'react';
import { SITE_CONFIG } from '@/config/site';
import type { Locale } from '@/i18n';
import { CoffeeIcon } from './icons';

interface SupportCardProps {
  locale: Locale;
  heading: string;
  body: string;
  aboutCta: string;
  dismissLabel: string;
}

export default function SupportCard({ heading, body, aboutCta, dismissLabel }: SupportCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <aside
      aria-label={heading}
      className="mt-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="m-0 text-sm font-semibold text-[var(--ink-primary)]">{heading}</p>
          <p className="m-0 max-w-xl text-sm leading-relaxed text-[var(--ink-muted)]">{body}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={SITE_CONFIG.supportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex min-h-11 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold no-underline"
          >
            <CoffeeIcon className="h-4 w-4 shrink-0 text-[var(--hl)]" />
            <span>{aboutCta}</span>
          </a>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </aside>
  );
}
