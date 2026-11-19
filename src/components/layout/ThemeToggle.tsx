import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@/components/shared/icons';

interface ThemeToggleProps {
  labelToDark: string;
  labelToLight: string;
}

const STORAGE_KEY = 'izikit-theme';

export default function ThemeToggle({ labelToDark, labelToLight }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(false);
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
      className="btn-secondary inline-flex h-11 w-11 items-center justify-center rounded-lg"
    >
      {mounted && isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}
