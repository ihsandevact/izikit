export type ToolCategory = 'pdf' | 'image';
export type ToolGroup =
  | 'pdf-organize'
  | 'pdf-edit-security'
  | 'image-optimize'
  | 'image-studio';
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
  | 'remove-bg';

export interface ToolDefinition {
  id: string;
  slug: string;
  category: ToolCategory;
  group: ToolGroup;
  badge?: ToolBadge;
  formatLabel: string;
  status: ToolStatus;
  phase: 1 | 2 | 3 | 4;
  icon: ToolIconKey;
  acceptedExtensions: string[];
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
] as const;

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
    formatLabel: 'JPG ⇄ PNG ⇄ WEBP',
    status: 'live',
    phase: 1,
    icon: 'convert-image',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    keywords: {
      id: ['konversi gambar', 'ubah format gambar', 'png ke jpg', 'webp'],
      en: ['convert image', 'png to jpg', 'jpg to webp', 'format'],
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
    keywords: {
      id: ['kolase foto', 'grid gambar', 'gabung foto', 'collage maker'],
      en: ['photo collage', 'image grid', 'combine photos', 'collage maker'],
    },
  },
] as const;

export function getLiveTools(): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.status === 'live');
}
