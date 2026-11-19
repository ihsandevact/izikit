import { useState } from 'react';
import { getActiveSupportChannels } from '@/config/site';
import { getLocalizedPath, type Locale } from '@/i18n';

interface SupportCardProps {
  locale: Locale;
  heading: string;
  body: string;
  aboutCta: string;
  dismissLabel: string;
}

export default function SupportCard({
  locale,
  heading,
  body,
  aboutCta,
  dismissLabel,
}: SupportCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const activeChannels = getActiveSupportChannels();
  const aboutSupportHref = `${getLocalizedPath('/about', locale)}#support`;

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
          {activeChannels.length > 0 ? (
            activeChannels.map((channel) => (
              <a
                key={channel.id}
                href={channel.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-sm font-medium no-underline"
              >
                {channel.label}
              </a>
            ))
          ) : (
            <a
              href={aboutSupportHref}
              className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-sm font-medium no-underline"
            >
              {aboutCta}
            </a>
          )}

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
