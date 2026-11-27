import { PDFDocument } from 'pdf-lib';
import {
  detectConvertibleImageMimeFromBytes,
  hasPdfMagicBytes,
} from '@/lib/file-validation';

export type CpnsExpectedFormat = 'jpg' | 'pdf';
export type CpnsDetectedFormat = 'JPG' | 'PNG' | 'WEBP' | 'HEIC' | 'AVIF' | 'PDF' | 'UNKNOWN';

export interface CpnsFixAction {
  label: string;
  href: string;
}

export interface CpnsDocSlot {
  id: string;
  title: string;
  subtitle: string;
  expectedFormat: CpnsExpectedFormat;
  defaultMaxKb: number;
  allowedKbChoices: readonly number[];
  quickTools: readonly CpnsFixAction[];
}

export interface CpnsCheckResult {
  status: 'pass' | 'fail';
  fileName: string;
  fileSizeBytes: number;
  maxKbUsed: number;
  detectedFormat: CpnsDetectedFormat;
  pageCount?: number;
  issues: string[];
  fixes: CpnsFixAction[];
}

export const CPNS_DOC_SLOTS: readonly CpnsDocSlot[] = [
  {
    id: 'pasfoto',
    title: 'Pasfoto latar merah atau biru',
    subtitle: 'Wajib format JPG/JPEG, latar merah atau biru sesuai instansi, umumnya maks. 200 KB.',
    expectedFormat: 'jpg',
    defaultMaxKb: 200,
    allowedKbChoices: [200, 300, 500],
    quickTools: [
      { label: 'Ganti latar merah/biru', href: '/remove-bg' },
      { label: 'Kompres < 200 KB', href: '/compress-image?preset=200kb' },
    ],
  },
  {
    id: 'ktp',
    title: 'Scan atau foto KTP asli',
    subtitle: 'Format JPG/JPEG jelas dan terbaca, umumnya maks. 200 KB (atau 500 KB).',
    expectedFormat: 'jpg',
    defaultMaxKb: 200,
    allowedKbChoices: [200, 500],
    quickTools: [
      { label: 'HEIC ke JPG', href: '/heic-to-jpg' },
      { label: 'Kompres < 200 KB', href: '/compress-image?preset=200kb' },
    ],
  },
  {
    id: 'swafoto',
    title: 'Swafoto pendaftaran',
    subtitle: 'Format JPG/JPEG, wajah terlihat jelas, umumnya maks. 200 KB.',
    expectedFormat: 'jpg',
    defaultMaxKb: 200,
    allowedKbChoices: [200, 300, 500],
    quickTools: [{ label: 'Kompres < 200 KB', href: '/compress-image?preset=200kb' }],
  },
  {
    id: 'surat-lamaran',
    title: 'Surat lamaran dan pernyataan',
    subtitle: 'Format PDF tidak terkunci, sudah bertanda tangan, umumnya maks. 1000 KB (1 MB).',
    expectedFormat: 'pdf',
    defaultMaxKb: 1000,
    allowedKbChoices: [500, 800, 1000],
    quickTools: [
      { label: 'Word ke PDF', href: '/word-to-pdf' },
      { label: 'Tanda tangan PDF', href: '/edit-pdf' },
    ],
  },
  {
    id: 'ijazah',
    title: 'Scan ijazah asli',
    subtitle: 'Format PDF bersih dan tidak miring, umumnya maks. 800 KB hingga 1000 KB.',
    expectedFormat: 'pdf',
    defaultMaxKb: 1000,
    allowedKbChoices: [500, 800, 1000],
    quickTools: [
      { label: 'Scan ke PDF', href: '/pdf-scanner' },
      { label: 'Kompres < 1 MB', href: '/compress-pdf?preset=1mb' },
    ],
  },
  {
    id: 'transkrip',
    title: 'Scan transkrip nilai',
    subtitle: 'Format PDF (gabungkan semua halaman jika lebih dari 1 lembar), maks. 1000 KB.',
    expectedFormat: 'pdf',
    defaultMaxKb: 1000,
    allowedKbChoices: [500, 800, 1000],
    quickTools: [
      { label: 'Gabung PDF', href: '/merge-pdf' },
      { label: 'Kompres < 1 MB', href: '/compress-pdf?preset=1mb' },
    ],
  },
  {
    id: 'dokumen-lain',
    title: 'Dokumen pendukung (STR, akreditasi, atau sertifikat)',
    subtitle: 'Format PDF siap unggah, umumnya maks. 800 KB hingga 1000 KB.',
    expectedFormat: 'pdf',
    defaultMaxKb: 1000,
    allowedKbChoices: [500, 800, 1000],
    quickTools: [
      { label: 'Gabung PDF', href: '/merge-pdf' },
      { label: 'Flatten PDF', href: '/flatten-clean-pdf' },
    ],
  },
] as const;

export function detectFileFormatFromBytes(bytes: Uint8Array): CpnsDetectedFormat {
  if (hasPdfMagicBytes(bytes)) return 'PDF';
  const imgMime = detectConvertibleImageMimeFromBytes(bytes);
  if (imgMime === 'image/jpeg') return 'JPG';
  if (imgMime === 'image/png') return 'PNG';
  if (imgMime === 'image/webp') return 'WEBP';
  if (imgMime === 'image/heic') return 'HEIC';
  if (imgMime === 'image/avif') return 'AVIF';
  return 'UNKNOWN';
}

function dedupeFixes(fixes: CpnsFixAction[]): CpnsFixAction[] {
  const seen = new Set<string>();
  return fixes.filter((f) => {
    if (seen.has(f.href)) return false;
    seen.add(f.href);
    return true;
  });
}

/**
 * Validates a CPNS/SSCASN document buffer against real magic bytes, size cap,
 * and PDF structural integrity (detecting password-protected or corrupt PDFs).
 */
export async function validateCpnsBuffer(
  slot: CpnsDocSlot,
  input: { name: string; size: number; bytes: Uint8Array },
  maxKbOverride?: number,
): Promise<CpnsCheckResult> {
  const maxKbUsed = maxKbOverride ?? slot.defaultMaxKb;
  const maxBytes = maxKbUsed * 1024;
  const detectedFormat = detectFileFormatFromBytes(input.bytes);
  const issues: string[] = [];
  const fixes: CpnsFixAction[] = [];
  let pageCount: number | undefined;

  if (slot.expectedFormat === 'jpg') {
    if (detectedFormat !== 'JPG') {
      if (detectedFormat === 'HEIC') {
        issues.push('File ini berformat HEIC dari iPhone, sedangkan portal SSCASN hanya menerima JPG/JPEG.');
        fixes.push({ label: 'Ubah HEIC ke JPG', href: '/heic-to-jpg' });
      } else if (detectedFormat === 'PNG' || detectedFormat === 'WEBP' || detectedFormat === 'AVIF') {
        issues.push(`File berformat ${detectedFormat}, padahal syarat berkas ini wajib JPG/JPEG.`);
        fixes.push({ label: 'Konversi ke JPG', href: '/convert-image' });
      } else if (detectedFormat === 'PDF') {
        issues.push('File berformat PDF, padahal syarat berkas ini wajib foto JPG/JPEG.');
        fixes.push({ label: 'PDF ke JPG', href: '/pdf-to-image' });
      } else {
        issues.push('Format file tidak dikenali sebagai gambar JPG/JPEG yang valid.');
      }
    }

    if (input.size > maxBytes) {
      const actualKb = Math.ceil(input.size / 1024);
      issues.push(`Ukuran file ${actualKb} KB melebihi batas maksimal ${maxKbUsed} KB.`);
      const preset = maxKbUsed <= 200 ? '200kb' : '500kb';
      fixes.push({
        label: `Kompres ke < ${maxKbUsed <= 200 ? '200 KB' : '500 KB'} JPG`,
        href: `/compress-image?preset=${preset}`,
      });
    }
  } else {
    if (detectedFormat !== 'PDF') {
      if (detectedFormat === 'JPG' || detectedFormat === 'PNG' || detectedFormat === 'WEBP') {
        issues.push(`File masih berupa gambar (${detectedFormat}), padahal syaratnya wajib PDF.`);
        fixes.push({ label: 'Ubah Foto ke PDF', href: '/image-to-pdf' });
      } else if (detectedFormat === 'HEIC') {
        issues.push('File masih berformat HEIC. Ubah dulu ke JPG, lalu gabungkan ke PDF.');
        fixes.push({ label: 'Ubah HEIC ke JPG', href: '/heic-to-jpg' });
      } else {
        issues.push('File bukan dokumen PDF yang valid.');
      }
    } else {
      try {
        const doc = await PDFDocument.load(input.bytes, { updateMetadata: false });
        pageCount = doc.getPageCount();
        if (pageCount < 1) {
          issues.push('PDF kosong (0 halaman).');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/encrypt/i.test(msg)) {
          issues.push('PDF ini terkunci kata sandi, padahal portal SSCASN menolak PDF terenkripsi.');
          fixes.push({ label: 'Buka sandi PDF', href: '/protect-pdf' });
        } else {
          issues.push('Struktur PDF rusak atau tidak terbaca standar.');
          fixes.push({ label: 'Scan Ulang ke PDF', href: '/pdf-scanner' });
        }
      }
    }

    if (input.size > maxBytes) {
      const actualKb = Math.ceil(input.size / 1024);
      issues.push(`Ukuran file ${actualKb} KB melebihi batas maksimal ${maxKbUsed} KB.`);
      const preset = maxKbUsed <= 500 ? '500kb' : maxKbUsed <= 800 ? '800kb' : '1mb';
      fixes.push({
        label: `Kompres PDF ke < ${maxKbUsed >= 1000 ? '1 MB' : `${maxKbUsed} KB`}`,
        href: `/compress-pdf?preset=${preset}`,
      });
    }
  }

  return {
    status: issues.length === 0 ? 'pass' : 'fail',
    fileName: input.name,
    fileSizeBytes: input.size,
    maxKbUsed,
    detectedFormat,
    pageCount,
    issues,
    fixes: dedupeFixes(fixes),
  };
}
