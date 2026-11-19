import type { SVGProps } from 'react';
import type { ToolIconKey } from '@/config/tools';

type IconProps = SVGProps<SVGSVGElement>;

export function BrandMarkIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6 3.5h11l5 5V23a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 5 23V5A1.5 1.5 0 0 1 6.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M17 3.5V8.5H22" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="8.5" y="13.2" width="10" height="2.4" rx="0.8" fill="var(--accent)" />
      <rect x="8.5" y="17.8" width="6.8" height="2.2" rx="0.8" fill="currentColor" />
    </svg>
  );
}

export function ToolGlyph({ icon, className = 'h-5 w-5' }: { icon: ToolIconKey; className?: string }) {
  switch (icon) {
    case 'merge-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3" y="4" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M11 7h7.5A1.5 1.5 0 0 1 20 8.5v10a1.5 1.5 0 0 1-1.5 1.5H11a1.5 1.5 0 0 1-1.5-1.5V17"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path d="M13 13.5h4.5M15.25 11.25v4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case 'compress-image':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M4.5 16.5l4.2-4.2 3 3 2.8-2.8 5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <circle cx="9" cy="9" r="1.4" fill="currentColor" />
        </svg>
      );
    case 'split-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3" y="4" width="7.5" height="16" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
          <rect x="13.5" y="4" width="7.5" height="16" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M12 2.5v19" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2.5" />
        </svg>
      );
    case 'rotate-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L20 9.4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 4.5v5h-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'image-to-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M6 3.5h8.5L19 8v12.5H6V3.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M8.5 16.5l2.5-2.8 2 2 1.8-1.8 1.7 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case 'resize-image':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M10 14l5-5m0 0h-3.5m3.5 0v3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'convert-image':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M4.5 9h14l-3-3m4 9h-14l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'watermark-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M6 3.5h8.5L19 8v12.5H6V3.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M8.5 14.5l7-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M11 18h5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'compress-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M6 3.5h8.5L19 8v12.5H6V3.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M12.5 9.5v4.5m0 0l-2-2m2 2l2-2M9.5 17.5h6" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'watermark-image':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M7.5 15.5l9-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="15.5" cy="14.5" r="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case 'collage-image':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
          <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
          <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
          <rect x="13" y="13" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      );
    case 'protect-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="5" y="10.5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M8.5 10.5V7.5a3.5 3.5 0 1 1 7 0v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="12" cy="15.2" r="1.3" fill="currentColor" />
        </svg>
      );
    case 'edit-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M5 19.5h4.2l9.8-9.8a1.8 1.8 0 0 0 0-2.55l-1.65-1.65a1.8 1.8 0 0 0-2.55 0L5 15.3v4.2Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M12.8 7.5l4.2 4.2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case 'remove-bg':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" strokeDasharray="3 2.5" />
          <circle cx="12" cy="10.2" r="2.6" stroke="currentColor" strokeWidth="1.75" />
          <path d="M7.5 18.2c.8-2.3 2.4-3.5 4.5-3.5s3.7 1.2 4.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case 'word-to-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M6 3.5h8.5L19 8v12.5H6V3.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M8.5 11.5l1.4 5 1.6-3.6 1.6 3.6 1.4-5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function ShieldLocalIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 2.5L4 4.8v4.7c0 3.7 2.5 6.8 6 8 3.5-1.2 6-4.3 6-8V4.8L10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M7.3 10.2l1.8 1.8 3.7-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UploadTrayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 15.5V4.5m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 14.5v3.5A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M10 3.5v9m0 0l-3.5-3.5M10 12.5l3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 15.5h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M8 12.5V3.5m0 0L4.5 7M8 3.5L11.5 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M8 3.5v9m0 0L4.5 9M8 12.5L11.5 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path d="M3 4.5h10M6.2 4.5V3.3c0-.44.36-.8.8-.8h2c.44 0 .8.36.8.8v1.2M4.5 4.5l.6 8.3c.05.68.62 1.2 1.3 1.2h3.2c.68 0 1.25-.52 1.3-1.2l.6-8.3" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M13.2 13.2L17 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <circle cx="5.5" cy="4" r="1.1" fill="currentColor" />
      <circle cx="10.5" cy="4" r="1.1" fill="currentColor" />
      <circle cx="5.5" cy="8" r="1.1" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.1" fill="currentColor" />
      <circle cx="5.5" cy="12" r="1.1" fill="currentColor" />
      <circle cx="10.5" cy="12" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M16.2 12.6A6.5 6.5 0 0 1 7.4 3.8a6.5 6.5 0 1 0 8.8 8.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
