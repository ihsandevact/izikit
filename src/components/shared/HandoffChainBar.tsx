import { useState } from 'react';
import type { Locale } from '@/i18n';
import {
  appendHandoffParam,
  saveHandoffFiles,
  type HandoffMeta,
} from '@/lib/file-handoff';

export interface HandoffChainAction {
  label: string;
  href: string;
  emphasis?: boolean;
}

interface HandoffChainBarProps {
  locale: Locale;
  sourceRoute: string;
  getFiles: () => File[];
  actions: readonly HandoffChainAction[];
  originSource?: string | null;
  originMeta?: HandoffMeta;
  className?: string;
}

function localizeHref(href: string, locale: Locale): string {
  if (locale !== 'en') return href;
  if (href === '/cpns' || href.startsWith('/cpns?') || href.startsWith('/en/')) {
    return href;
  }
  return `/en${href.startsWith('/') ? href : `/${href}`}`;
}

export default function HandoffChainBar({
  locale,
  sourceRoute,
  getFiles,
  actions,
  originSource,
  originMeta,
  className = '',
}: HandoffChainBarProps) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const isId = locale === 'id';

  const cameFromCpns = originSource === '/cpns' || Boolean(originMeta?.sourceSlotId);
  const mergedActions: HandoffChainAction[] = [
    ...(cameFromCpns
      ? [
          {
            label: isId ? 'Cek ulang hasil ini di CPNS' : 'Recheck result in CPNS Checker',
            href: '/cpns',
            emphasis: true,
          },
        ]
      : []),
    ...actions,
  ];

  if (mergedActions.length === 0) return null;

  const handleAction = async (rawHref: string) => {
    if (pendingHref) return;
    const files = getFiles();
    if (files.length === 0) return;

    const localizedHref = localizeHref(rawHref, locale);
    setPendingHref(rawHref);
    try {
      const id = await saveHandoffFiles(files, sourceRoute, originMeta);
      const nextUrl = id ? appendHandoffParam(localizedHref, id) : localizedHref;
      window.location.assign(nextUrl);
    } catch {
      window.location.assign(localizedHref);
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3 ${className}`}
    >
      <span className="text-xs font-semibold text-[var(--ink-muted)]">
        {isId ? 'Lanjut proses tanpa upload ulang:' : 'Continue without re-uploading:'}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {mergedActions.map((action) => {
          const isBusy = pendingHref === action.href;
          return (
            <button
              key={action.href}
              type="button"
              disabled={Boolean(pendingHref)}
              onClick={() => void handleAction(action.href)}
              className={`inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-bold transition-colors disabled:opacity-60 ${
                action.emphasis
                  ? 'border border-[var(--accent)] bg-[var(--accent-pill)] text-[var(--accent-pill-ink)] hover:opacity-90'
                  : 'border border-[var(--border-control)] bg-[var(--bg-card)] text-[var(--ink-primary)] hover:border-[var(--accent)] hover:text-[var(--link)]'
              }`}
            >
              {isBusy ? (isId ? 'Menyiapkan file...' : 'Preparing file...') : action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
