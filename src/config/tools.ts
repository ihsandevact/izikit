export type ToolCategory = 'pdf' | 'image';
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
  status: ToolStatus;
  phase: 1 | 2 | 3 | 4;
  icon: ToolIconKey;
  acceptedExtensions: string[];
  keywords: {
    id: string[];
    en: string[];
  };
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    id: 'merge-pdf',
    slug: 'merge-pdf',
    category: 'pdf',
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
    id: 'compress-image',
    slug: 'compress-image',
    category: 'image',
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
    id: 'split-pdf',
    slug: 'split-pdf',
    category: 'pdf',
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
    id: 'image-to-pdf',
    slug: 'image-to-pdf',
    category: 'pdf',
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
    id: 'watermark-pdf',
    slug: 'watermark-pdf',
    category: 'pdf',
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
    id: 'compress-pdf',
    slug: 'compress-pdf',
    category: 'pdf',
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
    id: 'protect-pdf',
    slug: 'protect-pdf',
    category: 'pdf',
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
    id: 'edit-pdf',
    slug: 'edit-pdf',
    category: 'pdf',
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
    id: 'word-to-pdf',
    slug: 'word-to-pdf',
    category: 'pdf',
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
    id: 'resize-crop-image',
    slug: 'resize-crop-image',
    category: 'image',
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
    id: 'watermark-image',
    slug: 'watermark-image',
    category: 'image',
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
    status: 'live',
    phase: 2,
    icon: 'collage-image',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    keywords: {
      id: ['kolase foto', 'grid gambar', 'gabung foto', 'collage maker'],
      en: ['photo collage', 'image grid', 'combine photos', 'collage maker'],
    },
  },
  {
    id: 'remove-bg',
    slug: 'remove-bg',
    category: 'image',
    status: 'live',
    phase: 3,
    icon: 'remove-bg',
    acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    keywords: {
      id: ['hapus background', 'remove bg', 'pasfoto merah biru', 'latar transparan', 'ai lokal'],
      en: ['remove background', 'remove bg', 'transparent background', 'cutout photo', 'id photo'],
    },
  },
] as const;

export function getLiveTools(): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.status === 'live');
}
