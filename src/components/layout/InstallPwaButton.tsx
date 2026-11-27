import { useEffect, useState } from 'react';
import type { Locale } from '@/i18n';
import { resolvePwaInstallMode, type PwaInstallMode } from '@/lib/pwa-install.logic';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __izikitDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

interface InstallPwaButtonProps {
  locale: Locale;
  label: string;
  variant?: 'header' | 'drawer';
}

function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone =
    'standalone' in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return standaloneMedia || iosStandalone;
}

export default function InstallPwaButton({
  locale,
  label,
  variant = 'header',
}: InstallPwaButtonProps) {
  const isId = locale === 'id';
  const [mode, setMode] = useState<PwaInstallMode>('hidden');
  const [iosModalOpen, setIosModalOpen] = useState(false);

  useEffect(() => {
    const syncMode = () => {
      setMode(
        resolvePwaInstallMode({
          isStandalone: isRunningStandalone(),
          hasDeferredPrompt: Boolean(window.__izikitDeferredPrompt),
          userAgent: window.navigator.userAgent,
          maxTouchPoints: window.navigator.maxTouchPoints ?? 0,
        }),
      );
    };

    syncMode();

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      window.__izikitDeferredPrompt = event as BeforeInstallPromptEvent;
      syncMode();
    };

    const handlePromptReady = () => syncMode();

    const handleInstalled = () => {
      window.__izikitDeferredPrompt = null;
      setIosModalOpen(false);
      setMode('hidden');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('izikit:pwa-prompt-ready', handlePromptReady);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('izikit:pwa-prompt-ready', handlePromptReady);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!iosModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIosModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [iosModalOpen]);

  if (mode === 'hidden') return null;

  const handleClick = async () => {
    if (mode === 'ios-guide') {
      setIosModalOpen(true);
      return;
    }

    const promptEvent = window.__izikitDeferredPrompt;
    if (!promptEvent) {
      setMode('hidden');
      return;
    }

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        window.__izikitDeferredPrompt = null;
        setMode('hidden');
      }
    } catch {
      // Ignore dismissed or interrupted install prompt
    }
  };

  const buttonClass =
    variant === 'drawer'
      ? 'flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-pill)] px-3.5 text-xs font-bold text-[var(--accent-pill-ink)] transition-opacity hover:opacity-90'
      : 'hidden min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--link)] sm:inline-flex';

  return (
    <>
      <button type="button" onClick={() => void handleClick()} className={buttonClass}>
        <svg viewBox="0 0 18 18" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
          <path
            d="M9 2.75v8m0 0l-3-3m3 3l3-3M3.25 12.25v1.5A1.5 1.5 0 0 0 4.75 15.25h8.5a1.5 1.5 0 0 0 1.5-1.5v-1.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{label}</span>
      </button>

      {iosModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          onClick={() => setIosModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="ios-install-title"
              className="font-display m-0 text-base font-extrabold text-[var(--ink-primary)]"
            >
              {isId ? 'Pasang izikit di iPhone / iPad' : 'Install izikit on iPhone / iPad'}
            </h2>
            <ol className="m-0 mt-3 space-y-2.5 pl-5 text-sm leading-relaxed text-[var(--ink-muted)]">
              <li>
                {isId
                  ? 'Ketuk tombol Share (ikon kotak panah atas) di bilah bawah Safari.'
                  : 'Tap the Share button (square with upward arrow) in Safari.'}
              </li>
              <li>
                {isId
                  ? 'Gulir ke bawah, pilih Tambah ke Layar Utama, lalu ketuk Tambah.'
                  : 'Scroll down, choose Add to Home Screen, then tap Add.'}
              </li>
            </ol>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setIosModalOpen(false)}
                className="btn-primary inline-flex min-h-11 items-center rounded-xl px-4 text-xs font-bold"
              >
                {isId ? 'Mengerti' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
