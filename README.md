# izikit

**100% free, local-first PDF & image utility kit that runs entirely inside your browser — no login, no daily limits, and zero server uploads.**

Live site: [https://izikit.app](https://izikit.app) · English version: [https://izikit.app/en](https://izikit.app/en)

---

## Why izikit?

- **Zero Server Uploads**: Every PDF and image operation runs locally on your device via Web Workers and WebAssembly. You can verify this anytime in browser DevTools (`F12` → Network tab).
- **No Account & No Watermarks**: Use all tools immediately without signing up, hitting daily quotas, or getting forced watermarks.
- **Offline-Ready PWA**: Installable Progressive Web App with offline caching for static assets and WASM runtimes.
- **Bilingual (ID / EN)**: Built-in Indonesian (default `/`) and English (`/en`) routes with localized SEO metadata and structured data.

---

## Available Tools (19 Live)

### PDF Documents (10)
| Tool | Route | Description |
| :--- | :--- | :--- |
| **Merge PDF** | `/merge-pdf` | Combine multiple PDFs in custom order |
| **Split PDF** | `/split-pdf` | Extract specific page ranges or split every page into individual PDFs / ZIP |
| **Rotate & Reorder PDF** | `/rotate-reorder-pdf` | Preview thumbnails, rotate 90°/180°, delete, and rearrange pages |
| **Word (.docx) to PDF** | `/word-to-pdf` | Convert `.docx` documents into selectable vector PDFs |
| **Image to PDF** | `/image-to-pdf` | Turn JPG, PNG, and WebP photos into a clean PDF (A4, Letter, or Fit) |
| **PDF to Image** | `/pdf-to-image` | Export PDF pages to crisp JPG, PNG, or WebP up to 300 DPI |
| **Compress & Resize PDF** | `/compress-pdf` | Lossless structure optimization or strong scan compression + A4/Letter resize |
| **Edit & Sign PDF** | `/edit-pdf` | Add text, highlights, drawn/PNG signatures, and permanent redaction blocks |
| **Protect & Unlock PDF** | `/protect-pdf` | Encrypt PDFs with AES-256 passwords or remove passwords from your own files |
| **Watermark & Page Numbers PDF** | `/watermark-pdf` | Add diagonal/tiled text watermarks and automatic page numbering |

### Images & Photos (9)
| Tool | Route | Description |
| :--- | :--- | :--- |
| **Compress Image** | `/compress-image` | Batch shrink JPG, PNG, and WebP sizes with before/after comparison |
| **Resize & Crop Image** | `/resize-crop-image` | Crop to 1:1, 4:3, 3:2, 16:9 presets, rotate, flip, and resize pixels |
| **Convert Image Format** | `/convert-image` | Batch convert between JPG, PNG, WebP, and AVIF |
| **HEIC (iPhone) to JPG** | `/heic-to-jpg` | Batch decode iPhone `.heic`/`.heif` photos to JPG, PNG, WebP, or AVIF |
| **Strip EXIF & Metadata** | `/strip-exif` | Losslessly remove GPS coordinates, camera info, XMP, and IPTC metadata |
| **Remove Image Background** | `/remove-bg` | Local AI (ONNX/WASM) or color-key background removal + ID photo red/blue backdrops |
| **Blur & Redact Photo** | `/blur-redact-image` | Permanently hide sensitive details with solid bars, mosaic pixelation, or blur |
| **Watermark Image** | `/watermark-image` | Batch stamp copyright text or transparent PNG logos onto photos |
| **Photo Collage & Grid** | `/collage-image` | Combine multiple photos into custom grid layouts (1:1, 4:5, 16:9, A4) |

---

## Tech Stack

- **Framework**: [Astro 5](https://astro.build/) (Static Site Generation) + [React 19](https://react.dev/) islands
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) + `@fontsource/plus-jakarta-sans` & `@fontsource/jetbrains-mono`
- **Client-Side Processing**:
  - PDF: `pdf-lib`, `@cantoo/pdf-lib` (AES-256), `pdfjs-dist`
  - Image & AI: `@imgly/background-removal` (ONNX/WASM), `@jsquash/avif`, `heic-to`, `upng-js`, `jszip`
- **PWA & SEO**: `@vite-pwa/astro`, `@astrojs/sitemap`, JSON-LD `@graph` (`Organization`, `WebSite`, `WebApplication`, `BreadcrumbList`, `FAQPage`)
- **Testing**: [Vitest](https://vitest.dev/) + Testing Library + `astro check`

---

## Local Development

### Prerequisites
- Node.js 20+
- [pnpm](https://pnpm.io/)

### Setup & Commands

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run unit & component tests
pnpm test

# Run Astro & TypeScript typechecking
pnpm check

# Build static production output + Service Worker
pnpm build

# Preview production build locally
pnpm preview
```

### Optional Environment Variables

| Variable | Description |
| :--- | :--- |
| `PUBLIC_GOOGLE_SITE_VERIFICATION` | Optional Google Search Console HTML meta verification code |

---

## Project Structure

```text
src/
├── components/
│   ├── home/       # Interactive search-first tool launcher & catalog
│   ├── layout/     # Header, Footer, ThemeToggle
│   ├── pages/      # Page shells (Home, AllTools, About, ToolPageLayout)
│   └── shared/     # Dropzone, ToolShell, ProgressBanner, SupportCard, icons
├── config/         # Site metadata (site.ts) & tool registry (tools.ts)
├── i18n/           # Indonesian (id.ts) & English (en.ts) dictionaries + SEO helpers
├── layouts/        # BaseLayout.astro (meta tags, OG, hreflang, JSON-LD, SW lifecycle)
├── lib/            # Shared utilities, validation, and JSON-LD schema builders
├── pages/          # Astro routes (ID at /, EN at /en, plus 404.astro)
└── tools/          # Self-contained PDF & image tools (logic, Web Workers, UI, tests)
```

---

## Support

izikit is free to use without ads or account walls. If it helps your daily work, you can support domain renewal and ongoing maintenance via [Trakteer](https://trakteer.id/ihsan97/tip).
