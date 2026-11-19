export type ToolCategory = 'pdf' | 'image';
export type ToolStatus = 'live' | 'coming-soon';
export type ToolIconKey =
  | 'merge-pdf'
  | 'split-pdf'
  | 'rotate-pdf'
  | 'image-to-pdf'
  | 'compress-image'
  | 'resize-image'
  | 'convert-image';

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
] as const;

export function getLiveTools(): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.status === 'live');
}

export function getUpcomingTools(): ToolDefinition[] {
  return TOOLS.filter((tool) => tool.status === 'coming-soon');
}

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.id === id);
}
