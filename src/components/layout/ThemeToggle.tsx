import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@/components/shared/icons';

interface ThemeToggleProps {
  labelToDark: string;
  labelToLight: string;
}

const STORAGE_KEY = 'izikit-theme';

export default function ThemeToggle({ labelToDark, labelToLight }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    setMounted(true);
  }, []);

  const handleToggle = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle('dark', nextDark);
    try {
      localStorage.setItem(STORAGE_KEY, nextDark ? 'dark' : 'light');
    } catch {
      // Ignore storage access errors in strict private browsing modes
    }
  };

  const label = isDark ? labelToLight : labelToDark;

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--ink-muted)] transition-colors hover:border-[var(--border-control)] hover:bg-[var(--bg-recess)] hover:text-[var(--ink-primary)]"
    >
      {mounted && isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
    </button>
  );
}
