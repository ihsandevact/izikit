import type { SVGProps } from 'react';
import { TOOL_GROUP_STYLES, type ToolGroup, type ToolIconKey } from '@/config/tools';

type IconProps = SVGProps<SVGSVGElement>;

export function BrandMarkIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <circle cx="16.5" cy="16.5" r="12.5" fill="var(--logo-circle)" />
      <rect x="35" y="4" width="25" height="25" rx="7" fill="var(--logo-tr)" />
      <rect x="4" y="35" width="25" height="25" rx="7" fill="var(--logo-bl)" />
      <rect x="35" y="35" width="25" height="25" rx="7" fill="var(--logo-br)" />
    </svg>
  );
}

export function ToolIconBadge({
  icon,
  group,
  size = 'md',
  className = '',
}: {
  icon: ToolIconKey;
  group: ToolGroup;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const style = TOOL_GROUP_STYLES[group];
  const isCircle = style.shape === 'circle';
  const boxClass =
    size === 'sm'
      ? `h-5 w-5 ${isCircle ? 'rounded-full' : 'rounded-[5px]'}`
      : `h-10 w-10 ${isCircle ? 'rounded-full' : 'rounded-xl'}`;
  const glyphClass = size === 'sm' ? 'h-3 w-3' : 'h-[19px] w-[19px]';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${boxClass} ${className}`}
      style={{ backgroundColor: style.bgVar, color: style.inkColor }}
    >
      <ToolGlyph icon={icon} className={glyphClass} />
    </span>
  );
}

export function CategorySwatch({
  group,
  size = 'sm',
  className = '',
}: {
  group: ToolGroup;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const style = TOOL_GROUP_STYLES[group];
  const isCircle = style.shape === 'circle';
  const dim = size === 'xs' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  const radius = isCircle ? 'rounded-full' : 'rounded-[3px]';

  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 ${dim} ${radius} ${className}`}
      style={{ backgroundColor: style.bgVar }}
    />
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
    case 'pdf-to-image':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M4.5 16.5l4-4 3 3 3-3 5 4" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
          <path d="M15.5 7.5h2.5v2.5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'blur-redact-image':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <rect x="7" y="9" width="4" height="4" fill="currentColor" opacity="0.9" />
          <rect x="11" y="9" width="4" height="4" fill="currentColor" opacity="0.45" />
          <rect x="7" y="13" width="4" height="4" fill="currentColor" opacity="0.45" />
          <rect x="11" y="13" width="4" height="4" fill="currentColor" opacity="0.9" />
        </svg>
      );
    case 'strip-exif':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 3.5L5.5 6v5.2c0 4.2 2.8 7.6 6.5 9.3 3.7-1.7 6.5-5.1 6.5-9.3V6L12 3.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'heic-to-jpg':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="6" y="3" width="12" height="18" rx="2.2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M10 17.5h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M9 11l2-2 2 2 2-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'passport-photo-grid':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3.5" y="4" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.65" />
          <rect x="13" y="4" width="7.5" height="7.5" rx="1.2" stroke="currentColor" strokeWidth="1.65" />
          <rect x="3.5" y="13.5" width="7.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.65" />
          <rect x="13" y="13.5" width="7.5" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.65" />
        </svg>
      );
    case 'signature-to-png':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M4 16.5c2.2-3.5 4.2-6 5.4-6 1 0 .6 3.5 1.8 3.5 1.3 0 2.5-3 3.8-3 1 0 1.4 2 2.4 2 1 0 1.8-.8 2.6-1.8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 19.5h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'svg-favicon-generator':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 3.5l7.5 4.3v8.4L12 20.5l-7.5-4.3V7.8L12 3.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.65" />
        </svg>
      );
    case 'extract-pdf-images':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M5.5 4h8l5 5v11h-13V4Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M12 16.5v-5m0 0l-2 2m2-2l2 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'qr-code-generator':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.75" />
          <rect x="14" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.75" />
          <rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.75" />
          <path d="M14 14h2.5v2.5H14V14Zm3.5 3.5H20V20h-2.5v-2.5Zm0-3.5H20v2h-2.5V14ZM14 18h2v2h-2v-2Z" fill="currentColor" />
        </svg>
      );
    case 'data-converter':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M3.5 9.5h17M9.5 9.5v10M15 9.5v10" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'compare-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3" y="4.5" width="8" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
          <rect x="13" y="4.5" width="8" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M5.5 9h3M5.5 12.5h3M15.5 9h3M15.5 12.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'ocr-text':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8m8 0h2.5A1.5 1.5 0 0 1 20 5.5V8m0 8v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M8.5 9.5h7M12 9.5v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case 'media-trim-gif':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M10 9.5l5 2.5-5 2.5v-5Z" fill="currentColor" />
        </svg>
      );
    case 'invoice-generator':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M6 3.5h12v17l-2.2-1.5-2.3 1.5L11.2 19 9 20.5 6 18.5v-15Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M9 8h6M9 11.5h6M9 15h3.5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
        </svg>
      );
    case 'pdf-to-text':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M5.5 4h8l5 5v11h-13V4Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M8.5 11.5h7M8.5 15h5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
        </svg>
      );
    case 'screenshot-mockup':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="6.2" cy="6.8" r="0.8" fill="currentColor" />
          <circle cx="8.8" cy="6.8" r="0.8" fill="currentColor" />
        </svg>
      );
    case 'image-color-palette':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 3.5a8.5 8.5 0 1 0 0 17h1.4a2.2 2.2 0 0 0 1.6-3.7 1.8 1.8 0 0 1 1.3-3h1.2A3 3 0 0 0 20.5 11c0-4.2-3.8-7.5-8.5-7.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <circle cx="8.5" cy="10" r="1.1" fill="currentColor" />
          <circle cx="12" cy="8" r="1.1" fill="currentColor" />
          <circle cx="15.5" cy="10" r="1.1" fill="currentColor" />
        </svg>
      );
    case 'fill-pdf-form':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M7.5 9h9M7.5 13h5M14.5 15l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'flatten-clean-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M12 4L4.5 8 12 12l7.5-4L12 4Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M4.5 12.5L12 16.5l7.5-4M4.5 16.5L12 20.5l7.5-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'text-diff':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M5 7h6M8 4v6M5 17h6M14 7h5M14 12h5M14 17h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case 'markdown-to-pdf':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path d="M6.5 15V9l2.5 3 2.5-3v6M16.5 9v6m0 0l-2-2m2 2l2-2" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'password-generator':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="8.5" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M12 12h8.5m-2.5 0v2.5m-3-2.5v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case 'audio-tools':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M4.5 10.5v3M8 7.5v9M12 4.5v15M16 8v8M19.5 10.5v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}

export function CoffeeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3.5 7.5h10v5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4v-5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 9h1.25a2.25 2.25 0 0 1 0 4.5H13.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M6.5 2.5v2.5M9.5 2.5v2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
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
