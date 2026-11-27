export type ToolCategory = 'pdf' | 'image' | 'utility';
export type ToolGroup =
  | 'pdf-organize'
  | 'pdf-edit-security'
  | 'image-optimize'
  | 'image-studio'
  | 'daily-utilities';
export type ToolBadge = 'new' | 'ai' | 'popular';
export type ToolStatus = 'live' | 'coming-soon';
export type ToolIconKey =
  | 'merge-pdf'
  | 'split-pdf'
  | 'rotate-pdf'
  | 'image-to-pdf'
  | 'watermark-pdf'
  | 'compress-pdf'
  | 'protect-pdf'
  | 'edit-pdf'
  | 'word-to-pdf'
  | 'compress-image'
  | 'resize-image'
  | 'convert-image'
  | 'watermark-image'
  | 'collage-image'
  | 'remove-bg'
  | 'pdf-to-image'
  | 'blur-redact-image'
  | 'strip-exif'
  | 'heic-to-jpg'
  | 'passport-photo-grid'
  | 'signature-to-png'
  | 'svg-favicon-generator'
  | 'extract-pdf-images'
  | 'qr-code-generator'
  | 'data-converter'
  | 'compare-pdf'
  | 'ocr-text'
  | 'media-trim-gif'
  | 'invoice-generator'
  | 'pdf-to-text'
  | 'screenshot-mockup'
  | 'image-color-palette'
  | 'fill-pdf-form'
  | 'flatten-clean-pdf'
  | 'pdf-scanner'
  | 'text-diff'
  | 'markdown-to-pdf'
  | 'password-generator'
  | 'audio-tools'
  | 'crop-pdf'
  | 'redact-pdf'
  | 'pdf-reader'
  | 'excel-csv-to-pdf'
  | 'txt-to-pdf'
  | 'zip-to-pdf'
  | 'html-to-pdf';

export interface ToolDefinition {
  id: string;
  slug: string;
  category: ToolCategory;
  group: ToolGroup;
  badge?: ToolBadge;
  formatLabel: string;
  status: ToolStatus;
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  icon: ToolIconKey;
  acceptedExtensions: string[];
  relatedToolIds?: readonly string[];
  keywords: {
    id: string[];
    en: string[];
  };
}

export const TOOL_GROUPS: readonly ToolGroup[] = [
  'pdf-organize',
  'pdf-edit-security',
  'image-optimize',
  'image-studio',
  'daily-utilities',
] as const;

export interface ToolGroupStyle {
  bgVar: string;
  inkColor: string;
  shape: 'square' | 'circle';
}

export const TOOL_GROUP_STYLES: Record<ToolGroup, ToolGroupStyle> = {
  'pdf-organize': {
    bgVar: 'var(--cat-pdf-organize)',
    inkColor: '#FFFFFF',
    shape: 'square',
  },
  'pdf-edit-security': {
    bgVar: 'var(--cat-pdf-edit)',
    inkColor: '#FFFFFF',
    shape: 'square',
  },
  'image-optimize': {
    bgVar: 'var(--cat-image-optimize)',
    inkColor: '#FFFFFF',
    shape: 'square',
  },
  'image-studio': {
    bgVar: 'var(--cat-image-studio)',
    inkColor: 'var(--cat-image-studio-ink)',
    shape: 'circle',
  },
  'daily-utilities': {
    bgVar: 'var(--cat-daily-utilities)',
    inkColor: '#FFFFFF',
    shape: 'square',
  },
};

export const TOOLS: readonly ToolDefinition[] = [
  {
    id: 'merge-pdf',
    slug: 'merge-pdf',
    category: 'pdf',
    group: 'pdf-organize',
    badge: 'popular',
    formatLabel: 'PDF',
    status: 'live',
    phase: 1,
    icon: 'merge-pdf',
    acceptedExtensions: ['.pdf'],
    relatedToolIds: ['compress-pdf', 'rotate-reorder-pdf', 'protect-pdf'],
    keywords: {
      id: ['gabung pdf', 'satukan pdf', 'merge pdf', 'dokumen', 'kombinasi pdf'],
      en: ['merge pdf', 'combine pdf', 'join pdf', 'documents'],
    },
  },
  {
    id: 'split-pdf',
    slug: 'split-pdf',
    category: 'pdf',
    group: 'pdf-organize',
    formatLabel: 'PDF',
    status: 'live',
    phase: 1,
    icon: 'split-pdf',
    acceptedExtensions: ['.pdf'],
    relatedToolIds: ['merge-pdf', 'rotate-reorder-pdf', 'compress-pdf'],
    keywords: {
      id: ['pisah pdf', 'potong halaman pdf', 'split pdf', 'ekstrak halaman'],
      en: ['split pdf', 'extract pages', 'cut pdf'],
    },
  },
  {
    id: 'rotate-reorder-pdf',
    slug: 'rotate-reorder-pdf',
    category: 'pdf',
    group: 'pdf-organize',
    formatLabel: 'PDF',
    status: 'live',
    phase: 1,
    icon: 'rotate-pdf',
    acceptedExtensions: ['.pdf'],
    relatedToolIds: ['merge-pdf', 'split-pdf', 'compress-pdf'],
    keywords: {
      id: ['putar pdf', 'urutkan halaman pdf', 'rotate pdf', 'reorder'],
      en: ['rotate pdf', 'reorder pages', 'organize pdf'],
    },
  },
  {
    id: 'word-to-pdf',
    slug: 'word-to-pdf',
    category: 'pdf',
    group: 'pdf-organize',
    badge: 'new',
    formatLabel: 'DOCX → PDF',
    status: 'live',
    phase: 4,
    icon: 'word-to-pdf',
    acceptedExtensions: ['.docx'],
    relatedToolIds: ['merge-pdf', 'compress-pdf', 'edit-pdf'],
    keywords: {
      id: ['word ke pdf', 'docx ke pdf', 'ubah word jadi pdf', 'dokumen word'],
      en: ['word to pdf', 'docx to pdf', 'convert docx to pdf', 'microsoft word'],
    },
  },
  {
    id: 'image-to-pdf',
    slug: 'image-to-pdf',
    category: 'pdf',
    group: 'pdf-organize',
    formatLabel: 'JPG / PNG / WEBP → PDF',
    status: 'live',
    phase: 1,
    icon: 'image-to-pdf',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['pdf-to-image', 'compress-pdf', 'compress-image'],
    keywords: {
      id: ['gambar ke pdf', 'foto ke pdf', 'jpg ke pdf', 'image to pdf'],
      en: ['image to pdf', 'jpg to pdf', 'photos to pdf'],
    },
  },
  {
    id: 'compress-pdf',
    slug: 'compress-pdf',
    category: 'pdf',
    group: 'pdf-edit-security',
    badge: 'popular',
    formatLabel: 'PDF',
    status: 'live',
    phase: 2,
    icon: 'compress-pdf',
    acceptedExtensions: ['.pdf'],
    relatedToolIds: ['merge-pdf', 'protect-pdf', 'watermark-pdf'],
    keywords: {
      id: ['kompres pdf', 'kecilkan ukuran pdf', 'resize pdf', 'a4', 'scan pdf'],
      en: ['compress pdf', 'shrink pdf', 'reduce pdf size', 'resize pdf', 'a4'],
    },
  },
  {
    id: 'edit-pdf',
    slug: 'edit-pdf',
    category: 'pdf',
    group: 'pdf-edit-security',
    badge: 'new',
    formatLabel: 'PDF',
    status: 'live',
    phase: 3,
    icon: 'edit-pdf',
    acceptedExtensions: ['.pdf'],
    relatedToolIds: ['protect-pdf', 'watermark-pdf', 'compress-pdf'],
    keywords: {
      id: ['edit pdf', 'tanda tangan pdf', 'sign pdf', 'anotasi', 'stabilo', 'redact pdf'],
      en: ['edit pdf', 'sign pdf', 'signature', 'annotate pdf', 'highlight', 'redact pdf'],
    },
  },
  {
    id: 'protect-pdf',
    slug: 'protect-pdf',
    category: 'pdf',
    group: 'pdf-edit-security',
    formatLabel: 'PDF · AES-256',
    status: 'live',
    phase: 2,
    icon: 'protect-pdf',
    acceptedExtensions: ['.pdf'],
    relatedToolIds: ['edit-pdf', 'watermark-pdf', 'compress-pdf'],
    keywords: {
      id: ['kunci pdf', 'password pdf', 'buka pdf', 'unlock pdf', 'protect pdf', 'sandi'],
      en: ['protect pdf', 'lock pdf', 'unlock pdf', 'password pdf', 'encrypt pdf', 'decrypt'],
    },
  },
  {
    id: 'watermark-pdf',
    slug: 'watermark-pdf',
    category: 'pdf',
    group: 'pdf-edit-security',
    formatLabel: 'PDF',
    status: 'live',
    phase: 2,
    icon: 'watermark-pdf',
    acceptedExtensions: ['.pdf'],
    relatedToolIds: ['protect-pdf', 'compress-pdf', 'edit-pdf'],
    keywords: {
      id: ['watermark pdf', 'nomor halaman pdf', 'stempel pdf', 'draft', 'confidential'],
      en: ['watermark pdf', 'page numbers pdf', 'stamp pdf', 'draft', 'confidential'],
    },
  },
  {
    id: 'compress-image',
    slug: 'compress-image',
    category: 'image',
    group: 'image-optimize',
    badge: 'popular',
    formatLabel: 'JPG / PNG / WEBP',
    status: 'live',
    phase: 1,
    icon: 'compress-image',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['resize-crop-image', 'convert-image', 'image-to-pdf'],
    keywords: {
      id: ['kompres gambar', 'kecilkan ukuran foto', 'compress image', 'jpg', 'png', 'webp'],
      en: ['compress image', 'shrink photo', 'optimize image', 'jpg', 'png', 'webp'],
    },
  },
  {
    id: 'resize-crop-image',
    slug: 'resize-crop-image',
    category: 'image',
    group: 'image-optimize',
    formatLabel: 'JPG / PNG / WEBP',
    status: 'live',
    phase: 1,
    icon: 'resize-image',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['compress-image', 'convert-image', 'remove-bg'],
    keywords: {
      id: ['ubah ukuran gambar', 'potong foto', 'resize', 'crop'],
      en: ['resize image', 'crop image', 'dimensions', 'flip'],
    },
  },
  {
    id: 'convert-image',
    slug: 'convert-image',
    category: 'image',
    group: 'image-optimize',
    formatLabel: 'JPG ⇄ PNG ⇄ WEBP ⇄ AVIF',
    status: 'live',
    phase: 1,
    icon: 'convert-image',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif'],
    relatedToolIds: ['heic-to-jpg', 'compress-image', 'resize-crop-image'],
    keywords: {
      id: ['konversi gambar', 'ubah format gambar', 'png ke jpg', 'webp', 'avif', 'avif ke jpg', 'jpg ke avif'],
      en: ['convert image', 'png to jpg', 'jpg to webp', 'avif', 'avif to jpg', 'jpg to avif', 'format'],
    },
  },
  {
    id: 'remove-bg',
    slug: 'remove-bg',
    category: 'image',
    group: 'image-studio',
    badge: 'ai',
    formatLabel: 'JPG / PNG / WEBP',
    status: 'live',
    phase: 3,
    icon: 'remove-bg',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['resize-crop-image', 'compress-image', 'collage-image'],
    keywords: {
      id: ['hapus background', 'remove bg', 'pasfoto merah biru', 'latar transparan', 'ai lokal'],
      en: ['remove background', 'remove bg', 'transparent background', 'cutout photo', 'id photo'],
    },
  },
  {
    id: 'watermark-image',
    slug: 'watermark-image',
    category: 'image',
    group: 'image-studio',
    formatLabel: 'JPG / PNG / WEBP',
    status: 'live',
    phase: 2,
    icon: 'watermark-image',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['compress-image', 'resize-crop-image', 'collage-image'],
    keywords: {
      id: ['watermark gambar', 'watermark foto', 'tempel logo foto', 'teks di gambar'],
      en: ['watermark image', 'add logo to photo', 'text on image', 'stamp photo'],
    },
  },
  {
    id: 'collage-image',
    slug: 'collage-image',
    category: 'image',
    group: 'image-studio',
    formatLabel: 'JPG / PNG / WEBP',
    status: 'live',
    phase: 2,
    icon: 'collage-image',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['compress-image', 'watermark-image', 'image-to-pdf'],
    keywords: {
      id: ['kolase foto', 'grid gambar', 'gabung foto', 'collage maker'],
      en: ['photo collage', 'image grid', 'combine photos', 'collage maker'],
    },
  },

  // =========================================================================
  // UPCOMING TOOLS (Fase 5 – Fase 8) — Rendered in "Segera Hadir" on /tools
  // =========================================================================
  {
    id: 'pdf-to-image',
    slug: 'pdf-to-image',
    category: 'pdf',
    group: 'pdf-organize',
    badge: 'new',
    formatLabel: 'PDF → JPG / PNG / WEBP',
    status: 'live',
    phase: 5,
    icon: 'pdf-to-image',
    acceptedExtensions: ['.pdf'],
    relatedToolIds: ['image-to-pdf', 'split-pdf', 'compress-image'],
    keywords: {
      id: ['pdf ke gambar', 'pdf ke jpg', 'pdf ke png', 'pdf to image', 'ekspor halaman pdf'],
      en: ['pdf to image', 'pdf to jpg', 'pdf to png', 'export pdf pages'],
    },
  },
  {
    id: 'blur-redact-image',
    slug: 'blur-redact-image',
    category: 'image',
    group: 'image-studio',
    badge: 'new',
    formatLabel: 'JPG / PNG / WEBP',
    status: 'live',
    phase: 5,
    icon: 'blur-redact-image',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['remove-bg', 'compress-image', 'watermark-image'],
    keywords: {
      id: ['sensor foto', 'blur ktp', 'blur wajah', 'plat nomor', 'pixelate', 'redact foto', 'mozaik'],
      en: ['blur image', 'censor photo', 'pixelate face', 'redact sensitive data', 'mosaic'],
    },
  },
  {
    id: 'strip-exif',
    slug: 'strip-exif',
    category: 'image',
    group: 'image-optimize',
    badge: 'new',
    formatLabel: 'JPG / PNG / WEBP',
    status: 'live',
    phase: 5,
    icon: 'strip-exif',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['blur-redact-image', 'compress-image', 'convert-image'],
    keywords: {
      id: ['hapus exif', 'hapus metadata foto', 'hapus gps foto', 'privasi foto', 'bersihkan exif'],
      en: ['strip exif', 'remove photo metadata', 'remove gps', 'exif cleaner', 'privacy photo'],
    },
  },
  {
    id: 'heic-to-jpg',
    slug: 'heic-to-jpg',
    category: 'image',
    group: 'image-optimize',
    badge: 'new',
    formatLabel: 'HEIC → JPG / PNG / WEBP',
    status: 'live',
    phase: 5,
    icon: 'heic-to-jpg',
    acceptedExtensions: ['.heic', '.heif'],
    relatedToolIds: ['convert-image', 'compress-image', 'strip-exif'],
    keywords: {
      id: ['heic ke jpg', 'foto iphone ke jpg', 'konversi heic', 'heic to png', 'heif ke jpg'],
      en: ['heic to jpg', 'iphone photo converter', 'heic to png', 'heif to jpg'],
    },
  },
  {
    id: 'passport-photo-grid',
    slug: 'passport-photo-grid',
    category: 'image',
    group: 'image-studio',
    badge: 'new',
    formatLabel: '4R / A4 · 300 DPI',
    status: 'live',
    phase: 6,
    icon: 'passport-photo-grid',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['remove-bg', 'resize-crop-image', 'compress-image'],
    keywords: {
      id: ['cetak pasfoto', 'grid pasfoto', 'pasfoto 3x4', 'pasfoto 4x6', 'pasfoto 2x3', 'kertas 4r', 'a4'],
      en: ['passport photo sheet', 'id photo print', '4r photo grid', '3x4 4x6', 'a4 sheet'],
    },
  },
  {
    id: 'signature-to-png',
    slug: 'signature-to-png',
    category: 'image',
    group: 'image-studio',
    badge: 'new',
    formatLabel: 'PNG TRANSPARAN',
    status: 'live',
    phase: 6,
    icon: 'signature-to-png',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['edit-pdf', 'remove-bg', 'watermark-image'],
    keywords: {
      id: ['tanda tangan png', 'tanda tangan transparan', 'hapus background tanda tangan', 'ttd digital'],
      en: ['transparent signature', 'signature to png', 'digital signature', 'remove paper background'],
    },
  },
  {
    id: 'svg-favicon-generator',
    slug: 'svg-favicon-generator',
    category: 'image',
    group: 'image-studio',
    badge: 'new',
    formatLabel: 'SVG / PNG → ICO + ZIP',
    status: 'live',
    phase: 6,
    icon: 'svg-favicon-generator',
    acceptedExtensions: ['.svg', '.png', '.webp'],
    relatedToolIds: ['convert-image', 'compress-image', 'resize-crop-image'],
    keywords: {
      id: ['svg ke png', 'favicon generator', 'buat favicon ico', 'ikon aplikasi', 'apple touch icon'],
      en: ['svg to png', 'favicon generator', 'ico generator', 'app icons', 'pwa icons'],
    },
  },
  {
    id: 'extract-pdf-images',
    slug: 'extract-pdf-images',
    category: 'pdf',
    group: 'pdf-organize',
    badge: 'new',
    formatLabel: 'PDF → ZIP GAMBAR',
    status: 'live',
    phase: 6,
    icon: 'extract-pdf-images',
    acceptedExtensions: ['.pdf'],
    relatedToolIds: ['pdf-to-image', 'compress-image', 'split-pdf'],
    keywords: {
      id: ['ekstrak gambar pdf', 'ambil foto dari pdf', 'extract images pdf', 'simpan foto pdf'],
      en: ['extract images from pdf', 'save pdf images', 'pdf image extractor', 'pull photos pdf'],
    },
  },
  {
    id: 'qr-code-generator',
    slug: 'qr-code-generator',
    category: 'utility',
    group: 'daily-utilities',
    badge: 'new',
    formatLabel: 'SVG / PNG',
    status: 'live',
    phase: 7,
    icon: 'qr-code-generator',
    acceptedExtensions: [],
    relatedToolIds: ['svg-favicon-generator', 'data-converter', 'watermark-image'],
    keywords: {
      id: ['qr code generator', 'buat qr code', 'qr whatsapp', 'qr wifi', 'qr logo', 'vcard'],
      en: ['qr code generator', 'custom qr code', 'wifi qr', 'vcard qr', 'whatsapp qr'],
    },
  },
  {
    id: 'data-converter',
    slug: 'data-converter',
    category: 'utility',
    group: 'daily-utilities',
    badge: 'new',
    formatLabel: 'CSV ⇄ XLSX ⇄ JSON',
    status: 'live',
    phase: 7,
    icon: 'data-converter',
    acceptedExtensions: ['.csv', '.xlsx', '.json'],
    relatedToolIds: ['qr-code-generator', 'word-to-pdf', 'compare-pdf'],
    keywords: {
      id: ['csv ke excel', 'excel ke csv', 'xlsx ke csv', 'json formatter', 'konversi data'],
      en: ['csv to excel', 'xlsx converter', 'json formatter', 'json validator', 'data utility'],
    },
  },
  {
    id: 'compare-pdf',
    slug: 'compare-pdf',
    category: 'pdf',
    group: 'pdf-edit-security',
    badge: 'new',
    formatLabel: 'PDF DIFF',
    status: 'live',
    phase: 7,
    icon: 'compare-pdf',
    acceptedExtensions: ['.pdf'],
    relatedToolIds: ['edit-pdf', 'merge-pdf', 'split-pdf'],
    keywords: {
      id: ['bandingkan pdf', 'pdf diff', 'cek perbedaan pdf', 'revisi kontrak'],
      en: ['compare pdf', 'pdf diff', 'visual pdf diff', 'check document changes'],
    },
  },
  {
    id: 'ocr-text',
    slug: 'ocr-text',
    category: 'pdf',
    group: 'pdf-organize',
    formatLabel: 'PDF / IMG → TEKS',
    status: 'coming-soon',
    phase: 8,
    icon: 'ocr-text',
    acceptedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.webp'],
    keywords: {
      id: ['ocr pdf', 'ocr gambar', 'scan ke teks', 'ekstrak teks foto'],
      en: ['ocr pdf', 'image to text', 'scan to text', 'tesseract'],
    },
  },
  {
    id: 'media-trim-gif',
    slug: 'media-trim-gif',
    category: 'utility',
    group: 'daily-utilities',
    formatLabel: 'MP4 → GIF / TRIM',
    status: 'coming-soon',
    phase: 8,
    icon: 'media-trim-gif',
    acceptedExtensions: ['.mp4', '.webm', '.mp3', '.wav'],
    keywords: {
      id: ['mp4 ke gif', 'potong video', 'potong audio', 'kompres video ringan'],
      en: ['mp4 to gif', 'trim video', 'trim audio', 'lightweight media'],
    },
  },
  {
    id: 'invoice-generator',
    slug: 'invoice-generator',
    category: 'utility',
    group: 'daily-utilities',
    badge: 'new',
    formatLabel: 'PDF INVOICE',
    status: 'live',
    phase: 9,
    icon: 'invoice-generator',
    acceptedExtensions: [],
    relatedToolIds: ['signature-to-png', 'edit-pdf', 'protect-pdf'],
    keywords: {
      id: ['buat invoice', 'kuitansi pdf', 'tagihan umkm', 'invoice generator gratis'],
      en: ['invoice generator', 'receipt maker', 'pdf invoice', 'billing template'],
    },
  },
  {
    id: 'pdf-to-text',
    slug: 'pdf-to-text',
    category: 'pdf',
    group: 'pdf-organize',
    formatLabel: 'PDF → TXT / DOCX',
    status: 'coming-soon',
    phase: 9,
    icon: 'pdf-to-text',
    acceptedExtensions: ['.pdf'],
    keywords: {
      id: ['pdf ke word', 'pdf ke teks', 'ekstrak teks pdf', 'pdf to txt', 'pdf to docx'],
      en: ['pdf to text', 'pdf to word', 'extract text from pdf', 'pdf to docx'],
    },
  },
  {
    id: 'screenshot-mockup',
    slug: 'screenshot-mockup',
    category: 'image',
    group: 'image-studio',
    badge: 'new',
    formatLabel: 'PNG / WEBP',
    status: 'live',
    phase: 9,
    icon: 'screenshot-mockup',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['blur-redact-image', 'resize-crop-image', 'compress-image'],
    keywords: {
      id: ['mockup screenshot', 'bingkai screenshot', 'background gradasi', 'foto presentasi'],
      en: ['screenshot mockup', 'pretty screenshot', 'gradient frame', 'social media mockup'],
    },
  },
  {
    id: 'image-color-palette',
    slug: 'image-color-palette',
    category: 'image',
    group: 'image-studio',
    formatLabel: 'HEX / RGB / HSL',
    status: 'coming-soon',
    phase: 9,
    icon: 'image-color-palette',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    keywords: {
      id: ['color picker', 'ekstrak warna gambar', 'palet warna', 'cek kontras wcag', 'kode hex'],
      en: ['color picker', 'extract color palette', 'eyedropper', 'hex rgb hsl', 'wcag contrast'],
    },
  },
  {
    id: 'fill-pdf-form',
    slug: 'fill-pdf-form',
    category: 'pdf',
    group: 'pdf-edit-security',
    formatLabel: 'PDF FORM',
    status: 'coming-soon',
    phase: 10,
    icon: 'fill-pdf-form',
    acceptedExtensions: ['.pdf'],
    keywords: {
      id: ['isi formulir pdf', 'form pdf', 'acroform', 'formulir lamaran pdf'],
      en: ['fill pdf form', 'pdf form filler', 'interactive pdf form', 'acroform'],
    },
  },
  {
    id: 'flatten-clean-pdf',
    slug: 'flatten-clean-pdf',
    category: 'pdf',
    group: 'pdf-edit-security',
    badge: 'new',
    formatLabel: 'PDF PRIVASI',
    status: 'live',
    phase: 10,
    icon: 'flatten-clean-pdf',
    acceptedExtensions: ['.pdf'],
    relatedToolIds: ['protect-pdf', 'edit-pdf', 'compress-pdf'],
    keywords: {
      id: ['flatten pdf', 'hapus metadata pdf', 'kunci anotasi pdf', 'bersihkan pdf'],
      en: ['flatten pdf', 'strip pdf metadata', 'remove pdf author', 'lock annotations'],
    },
  },
  {
    id: 'pdf-scanner',
    slug: 'pdf-scanner',
    category: 'pdf',
    group: 'pdf-organize',
    badge: 'new',
    formatLabel: 'SCAN → PDF',
    status: 'live',
    phase: 10,
    icon: 'pdf-scanner',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    relatedToolIds: ['image-to-pdf', 'compress-pdf', 'flatten-clean-pdf'],
    keywords: {
      id: ['scan pdf', 'pdf scanner', 'foto ke pdf scan', 'scan dokumen hp', 'scan hitam putih'],
      en: ['pdf scanner', 'scan documents to pdf', 'mobile scanner', 'photo scan to pdf'],
    },
  },
  {
    id: 'text-diff',
    slug: 'text-diff',
    category: 'utility',
    group: 'daily-utilities',
    badge: 'new',
    formatLabel: 'TEXT DIFF',
    status: 'live',
    phase: 10,
    icon: 'text-diff',
    acceptedExtensions: ['.txt', '.md', '.json'],
    relatedToolIds: ['compare-pdf', 'data-converter', 'word-to-pdf'],
    keywords: {
      id: ['bandingkan teks', 'text diff', 'cek perbedaan teks', 'compare text'],
      en: ['text diff', 'compare text', 'diff checker', 'side by side diff'],
    },
  },
  {
    id: 'markdown-to-pdf',
    slug: 'markdown-to-pdf',
    category: 'utility',
    group: 'daily-utilities',
    formatLabel: 'MD → PDF / HTML',
    status: 'coming-soon',
    phase: 10,
    icon: 'markdown-to-pdf',
    acceptedExtensions: ['.md', '.markdown', '.txt'],
    keywords: {
      id: ['markdown ke pdf', 'md ke pdf', 'preview markdown', 'markdown ke html'],
      en: ['markdown to pdf', 'md to pdf', 'markdown preview', 'markdown to html'],
    },
  },
  {
    id: 'password-generator',
    slug: 'password-generator',
    category: 'utility',
    group: 'daily-utilities',
    formatLabel: 'CRYPTO LOKAL',
    status: 'coming-soon',
    phase: 11,
    icon: 'password-generator',
    acceptedExtensions: [],
    keywords: {
      id: ['generator password', 'buat sandi kuat', 'passphrase', 'cek kekuatan password'],
      en: ['password generator', 'strong password', 'passphrase generator', 'password strength'],
    },
  },
  {
    id: 'audio-tools',
    slug: 'audio-tools',
    category: 'utility',
    group: 'daily-utilities',
    formatLabel: 'MP3 / WAV',
    status: 'coming-soon',
    phase: 11,
    icon: 'audio-tools',
    acceptedExtensions: ['.mp3', '.wav', '.ogg', '.m4a'],
    keywords: {
      id: ['potong audio', 'gabung audio', 'rekam suara', 'konversi wav mp3'],
      en: ['trim audio', 'merge audio', 'voice recorder', 'audio cutter'],
    },
  },
  {
    id: 'crop-pdf',
    slug: 'crop-pdf',
    category: 'pdf',
    group: 'pdf-edit-security',
    formatLabel: 'CROP PDF',
    status: 'coming-soon',
    phase: 10,
    icon: 'crop-pdf',
    acceptedExtensions: ['.pdf'],
    keywords: {
      id: ['crop pdf', 'potong margin pdf', 'pangkas halaman pdf'],
      en: ['crop pdf', 'trim pdf margins', 'pdf cropper'],
    },
  },
  {
    id: 'redact-pdf',
    slug: 'redact-pdf',
    category: 'pdf',
    group: 'pdf-edit-security',
    formatLabel: 'REDACT PDF',
    status: 'coming-soon',
    phase: 10,
    icon: 'redact-pdf',
    acceptedExtensions: ['.pdf'],
    keywords: {
      id: ['redact pdf', 'sensor pdf', 'hitamkan teks sensitif pdf', 'hapus data rahasia pdf'],
      en: ['redact pdf', 'black out pdf text', 'remove sensitive info pdf'],
    },
  },
  {
    id: 'pdf-reader',
    slug: 'pdf-reader',
    category: 'pdf',
    group: 'pdf-organize',
    formatLabel: 'PDF VIEWER',
    status: 'coming-soon',
    phase: 10,
    icon: 'pdf-reader',
    acceptedExtensions: ['.pdf'],
    keywords: {
      id: ['baca pdf', 'pdf reader', 'penampil pdf online', 'cetak pdf'],
      en: ['pdf reader', 'pdf viewer', 'open pdf in browser', 'print pdf'],
    },
  },
  {
    id: 'excel-csv-to-pdf',
    slug: 'excel-csv-to-pdf',
    category: 'pdf',
    group: 'pdf-organize',
    formatLabel: 'XLSX / CSV → PDF',
    status: 'coming-soon',
    phase: 12,
    icon: 'excel-csv-to-pdf',
    acceptedExtensions: ['.xlsx', '.csv'],
    keywords: {
      id: ['excel ke pdf', 'csv ke pdf', 'xlsx ke pdf', 'tabel ke pdf'],
      en: ['excel to pdf', 'csv to pdf', 'xlsx to pdf', 'spreadsheet to pdf'],
    },
  },
  {
    id: 'txt-to-pdf',
    slug: 'txt-to-pdf',
    category: 'pdf',
    group: 'pdf-organize',
    formatLabel: 'TXT → PDF',
    status: 'coming-soon',
    phase: 12,
    icon: 'txt-to-pdf',
    acceptedExtensions: ['.txt', '.log'],
    keywords: {
      id: ['txt ke pdf', 'teks ke pdf', 'ubah catatan ke pdf'],
      en: ['txt to pdf', 'text to pdf', 'plain text to pdf'],
    },
  },
  {
    id: 'zip-to-pdf',
    slug: 'zip-to-pdf',
    category: 'pdf',
    group: 'pdf-organize',
    formatLabel: 'ZIP → PDF',
    status: 'coming-soon',
    phase: 12,
    icon: 'zip-to-pdf',
    acceptedExtensions: ['.zip'],
    keywords: {
      id: ['zip ke pdf', 'ekstrak zip ke pdf', 'gabung isi zip jadi pdf'],
      en: ['zip to pdf', 'convert zip to pdf', 'archive to pdf'],
    },
  },
  {
    id: 'html-to-pdf',
    slug: 'html-to-pdf',
    category: 'pdf',
    group: 'pdf-organize',
    formatLabel: 'HTML → PDF',
    status: 'coming-soon',
    phase: 12,
    icon: 'html-to-pdf',
    acceptedExtensions: ['.html', '.htm'],
    keywords: {
      id: ['html ke pdf', 'kode html ke pdf', 'halaman web ke pdf'],
      en: ['html to pdf', 'convert html to pdf', 'webpage html to pdf'],
    },
  },
] as const;

export function getLiveTools(): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.status === 'live');
}

export function getUpcomingTools(): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.status === 'coming-soon');
}

export function getRelatedLiveTools(toolId: string, limit = 3): ToolDefinition[] {
  const live = getLiveTools();
  const current = live.find((t) => t.id === toolId);
  if (!current) return live.slice(0, limit);

  const picked: ToolDefinition[] = [];
  const seen = new Set<string>([current.id]);

  if (current.relatedToolIds) {
    for (const relId of current.relatedToolIds) {
      if (picked.length >= limit) break;
      const match = live.find((t) => t.id === relId && !seen.has(t.id));
      if (match) {
        picked.push(match);
        seen.add(match.id);
      }
    }
  }

  for (const candidate of live) {
    if (picked.length >= limit) break;
    if (candidate.group === current.group && !seen.has(candidate.id)) {
      picked.push(candidate);
      seen.add(candidate.id);
    }
  }

  for (const candidate of live) {
    if (picked.length >= limit) break;
    if (candidate.category === current.category && !seen.has(candidate.id)) {
      picked.push(candidate);
      seen.add(candidate.id);
    }
  }

  return picked;
}
