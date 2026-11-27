import { useEffect, useMemo, useRef, useState } from 'react';
import { getDictionary, type Locale } from '@/i18n';
import { createClientId } from '@/lib/id';
import { downloadBlob } from '@/lib/download';
import { validateImageFiles } from '@/lib/file-validation';
import ErrorAlert from '@/components/shared/ErrorAlert';
import SupportCard from '@/components/shared/SupportCard';
import { DownloadIcon, TrashIcon } from '@/components/shared/icons';
import SignaturePadModal, { type SignatureResult } from '@/tools/pdf/edit/SignaturePadModal';
import {
  ACCENT_THEMES,
  buildInvoiceFilename,
  computeInvoiceTotals,
  CURRENCY_META,
  formatMoney,
  incrementDocNumber,
  numberToWordsEn,
  numberToWordsId,
  type AccentThemeKey,
  type CurrencyCode,
  type DiscountType,
  type DocumentType,
  type EmbeddedImageAsset,
  type InvoiceData,
  type PaymentStatusKey,
} from './invoice.logic';
import { buildInvoicePdfBytes } from './invoice-pdf';

interface InvoiceGeneratorToolProps {
  locale: Locale;
}

const PROFILE_STORAGE_KEY = 'izikit-invoice-profile-v1';

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function createInitialInvoice(locale: Locale): InvoiceData {
  const isId = locale === 'id';
  const year = new Date().getFullYear();
  return {
    docType: 'invoice',
    docNumber: `INV-${year}-001`,
    issueDate: todayIso(),
    dueDate: addDaysIso(14),
    currency: isId ? 'IDR' : 'USD',
    accent: 'emerald',
    statusStamp: 'none',
    senderName: isId ? 'Studio Kreatif Nusantara' : 'Nusantara Creative Studio',
    senderDetails: isId
      ? 'Jl. Merdeka No. 10, Bandung\nhello@studio.id · 0812-3456-7890'
      : '120 Market Street, Suite 400\nhello@studio.co · +1 (555) 234-5678',
    clientName: isId ? 'PT Maju Bersama' : 'Acme Innovations Ltd.',
    clientDetails: isId ? 'Jl. Sudirman Kav. 21, Jakarta Selatan' : '450 Tech Park Ave, Austin, TX',
    receiptPurpose: isId
      ? 'Pembayaran proyek desain & pengembangan website'
      : 'Payment for website design and frontend development',
    items: [
      {
        id: 'item-1',
        description: isId ? 'Desain UI/UX Halaman Utama' : 'UI/UX Landing Page Design',
        quantity: 1,
        unitPrice: isId ? 2_500_000 : 850,
      },
      {
        id: 'item-2',
        description: isId ? 'Implementasi Frontend Responsif' : 'Responsive Frontend Implementation',
        quantity: 1,
        unitPrice: isId ? 3_500_000 : 1200,
      },
    ],
    discountType: 'percent',
    discountValue: 0,
    taxRate: isId ? 11 : 0,
    amountPaid: 0,
    paymentInfo: isId
      ? 'Bank BCA 1234567890\na.n. Studio Kreatif Nusantara'
      : 'Bank Wire / ACH: Routing 021000021\nAccount: 1234567890 (Nusantara Creative)',
    notes: isId
      ? 'Mohon cantumkan nomor invoice pada berita transfer. Terima kasih.'
      : 'Please include the invoice number in your payment reference. Thank you.',
    signerName: isId ? 'Budi Santoso' : 'Alex Rivera',
    signerRole: isId ? 'Pemilik Usaha' : 'Managing Director',
    logo: null,
    signature: null,
  };
}

async function fileToEmbeddedAsset(file: File): Promise<EmbeddedImageAsset> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = url;
    });

    const aspectRatio = (img.naturalWidth || 1) / Math.max(1, img.naturalHeight || 1);

    if (file.type === 'image/jpeg' || file.type === 'image/png') {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
        reader.readAsDataURL(file);
      });
      return {
        dataUrl,
        mime: file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
        aspectRatio,
      };
    }

    // Convert WebP or other raster format to PNG for pdf-lib compatibility
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 300;
    canvas.height = img.naturalHeight || 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      mime: 'image/png',
      aspectRatio,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function InvoiceGeneratorTool({ locale }: InvoiceGeneratorToolProps) {
  const dict = getDictionary(locale);
  const isId = locale === 'id';
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [data, setData] = useState<InvoiceData>(() => createInitialInvoice(locale));
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [hasExported, setHasExported] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load saved business profile on mount if present
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<InvoiceData>;
      setData((prev) => ({
        ...prev,
        senderName: saved.senderName ?? prev.senderName,
        senderDetails: saved.senderDetails ?? prev.senderDetails,
        paymentInfo: saved.paymentInfo ?? prev.paymentInfo,
        signerName: saved.signerName ?? prev.signerName,
        signerRole: saved.signerRole ?? prev.signerRole,
        currency: saved.currency ?? prev.currency,
        accent: saved.accent ?? prev.accent,
        logo: saved.logo ?? prev.logo,
      }));
    } catch {
      // Ignore malformed localStorage
    }
  }, []);

  const totals = useMemo(() => computeInvoiceTotals(data), [data]);
  const accentStyle = ACCENT_THEMES[data.accent];
  const amountInWords = useMemo(
    () =>
      isId
        ? numberToWordsId(totals.grandTotal, data.currency)
        : numberToWordsEn(totals.grandTotal, data.currency),
    [data.currency, isId, totals.grandTotal],
  );

  const handleDocTypeChange = (nextType: DocumentType) => {
    setData((prev) => {
      const year = new Date().getFullYear();
      let nextNum = prev.docNumber;
      if (nextType === 'receipt' && /^INV-/i.test(prev.docNumber)) {
        nextNum = prev.docNumber.replace(/^INV-/i, isId ? 'KWT-' : 'RCT-');
      } else if (nextType === 'invoice' && /^(KWT|RCT)-/i.test(prev.docNumber)) {
        nextNum = prev.docNumber.replace(/^(KWT|RCT)-/i, 'INV-');
      } else if (!prev.docNumber.trim()) {
        nextNum = nextType === 'receipt' ? `KWT-${year}-001` : `INV-${year}-001`;
      }
      return {
        ...prev,
        docType: nextType,
        docNumber: nextNum,
        statusStamp: nextType === 'receipt' ? 'paid' : prev.statusStamp,
      };
    });
  };

  const handleLogoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    const { accepted, errors } = await validateImageFiles(Array.from(files).slice(0, 1), {
      tooLarge: isId ? 'Ukuran logo terlalu besar:' : 'Logo file too large:',
      notImage: isId ? 'Logo harus berupa PNG, JPG, atau WebP:' : 'Logo must be PNG, JPG, or WebP:',
      generic: isId ? 'Gagal membaca file logo:' : 'Failed to read logo file:',
    });
    if (errors.length > 0) {
      setErrorMsg(errors[0]);
      return;
    }
    if (accepted.length === 0) return;
    try {
      const asset = await fileToEmbeddedAsset(accepted[0].file);
      setData((prev) => ({ ...prev, logo: asset }));
    } catch {
      setErrorMsg(isId ? 'Gagal memuat gambar logo.' : 'Failed to load logo image.');
    }
  };

  const handleSignatureConfirm = (sig: SignatureResult) => {
    setData((prev) => ({
      ...prev,
      signature: {
        dataUrl: sig.imageDataUrl,
        mime: sig.imageMime,
        aspectRatio: sig.aspectRatio,
      },
    }));
    setSigModalOpen(false);
  };

  const handleAddItem = () => {
    setData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { id: createClientId(), description: '', quantity: 1, unitPrice: 0 },
      ],
    }));
  };

  const handleUpdateItem = (
    id: string,
    patch: Partial<{ description: string; quantity: number; unitPrice: number }>,
  ) => {
    setData((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };

  const handleRemoveItem = (id: string) => {
    setData((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((item) => item.id !== id) : prev.items,
    }));
  };

  const handleSaveProfile = () => {
    try {
      const profile = {
        senderName: data.senderName,
        senderDetails: data.senderDetails,
        paymentInfo: data.paymentInfo,
        signerName: data.signerName,
        signerRole: data.signerRole,
        currency: data.currency,
        accent: data.accent,
        logo: data.logo,
      };
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 1800);
    } catch {
      setErrorMsg(
        isId
          ? 'Gagal menyimpan profil di browser (mungkin ukuran logo terlalu besar untuk localStorage).'
          : 'Could not save profile locally (logo image may exceed localStorage quota).',
      );
    }
  };

  const handleDownloadPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setErrorMsg(null);
    try {
      const pdfBytes = await buildInvoicePdfBytes(data, locale);
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      downloadBlob(blob, buildInvoiceFilename(data.docType, data.docNumber, locale));
      setHasExported(true);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isId
            ? 'Gagal membuat file PDF. Periksa kembali isian dokumen.'
            : 'Failed to generate PDF file. Please review your entries.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] outline-none focus:border-[var(--accent)] sm:text-[13px]';
  const labelClass = 'mb-1 block text-[11px] font-semibold text-[var(--ink-muted)]';

  const stampLabel =
    data.statusStamp === 'paid'
      ? isId
        ? 'LUNAS'
        : 'PAID'
      : data.statusStamp === 'dp'
        ? isId
          ? 'DP / SEBAGIAN'
          : 'PARTIAL PAID'
        : data.statusStamp === 'unpaid'
          ? isId
            ? 'BELUM LUNAS'
            : 'UNPAID'
          : null;

  return (
    <div className="space-y-5">
      {errorMsg && (
        <ErrorAlert
          messages={[errorMsg]}
          dismissLabel={dict.shared.dismissError}
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)]/60 p-3">
        {/* Document Type Switch */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0.5">
            <button
              type="button"
              onClick={() => handleDocTypeChange('invoice')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                data.docType === 'invoice'
                  ? 'bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {isId ? 'Invoice / Tagihan' : 'Invoice'}
            </button>
            <button
              type="button"
              onClick={() => handleDocTypeChange('receipt')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                data.docType === 'receipt'
                  ? 'bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {isId ? 'Kuitansi' : 'Receipt'}
            </button>
          </div>

          {/* Mobile Edit / Preview toggle */}
          <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-0.5 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileTab('edit')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                mobileTab === 'edit'
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                  : 'text-[var(--ink-muted)]'
              }`}
            >
              {isId ? 'Edit Data' : 'Edit'}
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('preview')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                mobileTab === 'preview'
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                  : 'text-[var(--ink-muted)]'
              }`}
            >
              {isId ? 'Pratinjau A4' : 'Preview A4'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveProfile}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:border-[var(--accent)]"
          >
            {savedNotice
              ? isId
                ? 'Profil Tersimpan!'
                : 'Profile Saved!'
              : isId
                ? 'Simpan Profil Usaha'
                : 'Save Business Profile'}
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => void handleDownloadPdf()}
            className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold disabled:opacity-50"
          >
            <DownloadIcon className="h-4 w-4" />
            <span>
              {isExporting
                ? isId
                  ? 'Membuat PDF...'
                  : 'Building PDF...'
                : isId
                  ? 'Unduh PDF'
                  : 'Download PDF'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT: Form Editor */}
        <div
          className={`space-y-5 lg:col-span-6 ${mobileTab === 'preview' ? 'hidden lg:block' : ''}`}
        >
          {/* Section 1: Document Info, Currency, Theme, Logo */}
          <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)]/40 p-4">
            <h2 className="font-display m-0 text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
              {isId ? '1. Info Dokumen & Tampilan' : '1. Document Info & Style'}
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{isId ? 'Nomor Dokumen' : 'Document Number'}</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={data.docNumber}
                    onChange={(e) => setData((d) => ({ ...d, docNumber: e.target.value }))}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    title={isId ? 'Naikkan nomor (+1)' : 'Increment number (+1)'}
                    onClick={() =>
                      setData((d) => ({ ...d, docNumber: incrementDocNumber(d.docNumber) }))
                    }
                    className="font-data shrink-0 rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2 text-xs font-bold text-[var(--ink-primary)] hover:border-[var(--accent)]"
                  >
                    +1
                  </button>
                </div>
              </div>

              <div>
                <label className={labelClass}>{isId ? 'Mata Uang' : 'Currency'}</label>
                <select
                  value={data.currency}
                  onChange={(e) =>
                    setData((d) => ({ ...d, currency: e.target.value as CurrencyCode }))
                  }
                  className={inputClass}
                >
                  {(Object.keys(CURRENCY_META) as CurrencyCode[]).map((code) => (
                    <option key={code} value={code}>
                      {code} ({CURRENCY_META[code].symbol})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>{isId ? 'Tanggal Terbit' : 'Issue Date'}</label>
                <input
                  type="date"
                  value={data.issueDate}
                  onChange={(e) => setData((d) => ({ ...d, issueDate: e.target.value }))}
                  className={inputClass}
                />
              </div>

              {data.docType === 'invoice' ? (
                <div>
                  <label className={labelClass}>{isId ? 'Jatuh Tempo' : 'Due Date'}</label>
                  <input
                    type="date"
                    value={data.dueDate}
                    onChange={(e) => setData((d) => ({ ...d, dueDate: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              ) : (
                <div>
                  <label className={labelClass}>{isId ? 'Stempel Status' : 'Status Stamp'}</label>
                  <select
                    value={data.statusStamp}
                    onChange={(e) =>
                      setData((d) => ({ ...d, statusStamp: e.target.value as PaymentStatusKey }))
                    }
                    className={inputClass}
                  >
                    <option value="paid">{isId ? 'LUNAS' : 'PAID'}</option>
                    <option value="dp">{isId ? 'DP / SEBAGIAN' : 'PARTIAL PAID'}</option>
                    <option value="none">{isId ? 'Tanpa Stempel' : 'No Stamp'}</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {/* Accent Swatches */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
                  {isId ? 'Warna:' : 'Theme:'}
                </span>
                {(Object.keys(ACCENT_THEMES) as AccentThemeKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={key}
                    onClick={() => setData((d) => ({ ...d, accent: key }))}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      data.accent === key
                        ? 'scale-110 border-[var(--ink-primary)]'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: ACCENT_THEMES[key].hex }}
                  />
                ))}
              </div>

              {/* Status stamp for Invoice */}
              {data.docType === 'invoice' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
                    {isId ? 'Stempel:' : 'Stamp:'}
                  </span>
                  <select
                    value={data.statusStamp}
                    onChange={(e) =>
                      setData((d) => ({ ...d, statusStamp: e.target.value as PaymentStatusKey }))
                    }
                    className="rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--ink-primary)]"
                  >
                    <option value="none">{isId ? 'Tanpa' : 'None'}</option>
                    <option value="unpaid">{isId ? 'BELUM LUNAS' : 'UNPAID'}</option>
                    <option value="dp">{isId ? 'DP / SEBAGIAN' : 'PARTIAL'}</option>
                    <option value="paid">{isId ? 'LUNAS' : 'PAID'}</option>
                  </select>
                </div>
              )}

              {/* Logo upload */}
              <div className="flex items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void handleLogoUpload(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)]"
                >
                  {data.logo
                    ? isId
                      ? 'Ganti Logo'
                      : 'Change Logo'
                    : isId
                      ? '+ Unggah Logo'
                      : '+ Upload Logo'}
                </button>
                {data.logo && (
                  <button
                    type="button"
                    onClick={() => setData((d) => ({ ...d, logo: null }))}
                    className="text-xs font-semibold text-[var(--danger)] hover:underline"
                  >
                    {isId ? 'Hapus' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Sender & Client */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)]/40 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <h2 className="font-display m-0 text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
                {isId ? '2. Pengirim (Usaha Anda)' : '2. From (Your Business)'}
              </h2>
              <input
                type="text"
                value={data.senderName}
                onChange={(e) => setData((d) => ({ ...d, senderName: e.target.value }))}
                placeholder={isId ? 'Nama usaha / freelancer' : 'Business / freelancer name'}
                className={inputClass}
              />
              <textarea
                rows={3}
                value={data.senderDetails}
                onChange={(e) => setData((d) => ({ ...d, senderDetails: e.target.value }))}
                placeholder={isId ? 'Alamat, email, telepon, NPWP...' : 'Address, email, phone...'}
                className={inputClass}
              />
            </div>

            <div className="space-y-2">
              <h2 className="font-display m-0 text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
                {data.docType === 'receipt'
                  ? isId
                    ? '3. Sudah Terima Dari'
                    : '3. Received From'
                  : isId
                    ? '3. Ditagihkan Kepada'
                    : '3. Bill To (Client)'}
              </h2>
              <input
                type="text"
                value={data.clientName}
                onChange={(e) => setData((d) => ({ ...d, clientName: e.target.value }))}
                placeholder={isId ? 'Nama klien / perusahaan' : 'Client / company name'}
                className={inputClass}
              />
              <textarea
                rows={3}
                value={data.clientDetails}
                onChange={(e) => setData((d) => ({ ...d, clientDetails: e.target.value }))}
                placeholder={isId ? 'Alamat atau kontak klien...' : 'Client address or contact...'}
                className={inputClass}
              />
            </div>

            {data.docType === 'receipt' && (
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  {isId ? 'Untuk Pembayaran (Keterangan Kuitansi)' : 'For Payment Of'}
                </label>
                <input
                  type="text"
                  value={data.receiptPurpose}
                  onChange={(e) => setData((d) => ({ ...d, receiptPurpose: e.target.value }))}
                  className={inputClass}
                />
              </div>
            )}
          </div>

          {/* Section 3: Line Items */}
          <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)]/40 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display m-0 text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
                {isId ? '4. Rincian Item / Jasa' : '4. Line Items'}
              </h2>
              <button
                type="button"
                onClick={handleAddItem}
                className="rounded-lg border border-[var(--accent)] bg-[var(--accent-pill)] px-2.5 py-1 text-xs font-bold text-[var(--accent-pill-ink)]"
              >
                + {isId ? 'Tambah Baris' : 'Add Item'}
              </button>
            </div>

            <div className="space-y-2.5">
              {data.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 items-end gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5"
                >
                  <div className="col-span-12 sm:col-span-6">
                    <label className={labelClass}>
                      {isId ? `Deskripsi #${idx + 1}` : `Description #${idx + 1}`}
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        handleUpdateItem(item.id, { description: e.target.value })
                      }
                      placeholder={isId ? 'Nama produk / jasa' : 'Product or service'}
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className={labelClass}>Qty</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.quantity}
                      onChange={(e) =>
                        handleUpdateItem(item.id, { quantity: Number(e.target.value) || 0 })
                      }
                      className={`${inputClass} font-data tabular-nums`}
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label className={labelClass}>{isId ? 'Harga Satuan' : 'Unit Price'}</label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) =>
                        handleUpdateItem(item.id, { unitPrice: Number(e.target.value) || 0 })
                      }
                      className={`${inputClass} font-data tabular-nums`}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end sm:col-span-1">
                    <button
                      type="button"
                      disabled={data.items.length <= 1}
                      aria-label={isId ? 'Hapus baris' : 'Remove item'}
                      onClick={() => handleRemoveItem(item.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--ink-muted)] hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-30"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Discount, Tax, DP, Payment Info & Signature */}
          <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-recess)]/40 p-4">
            <h2 className="font-display m-0 text-xs font-bold tracking-wide text-[var(--ink-primary)] uppercase">
              {isId ? '5. Diskon, Pajak, Pembayaran & Tanda Tangan' : '5. Tax, Discount, Payment & Signature'}
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>{isId ? 'Diskon' : 'Discount'}</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={data.discountValue}
                    onChange={(e) =>
                      setData((d) => ({ ...d, discountValue: Number(e.target.value) || 0 }))
                    }
                    className={`${inputClass} font-data tabular-nums`}
                  />
                  <select
                    value={data.discountType}
                    onChange={(e) =>
                      setData((d) => ({ ...d, discountType: e.target.value as DiscountType }))
                    }
                    className="rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-2 text-xs font-semibold text-[var(--ink-primary)]"
                  >
                    <option value="percent">%</option>
                    <option value="fixed">{CURRENCY_META[data.currency].symbol}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>{isId ? 'Pajak / PPN (%)' : 'Tax Rate (%)'}</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={data.taxRate}
                    onChange={(e) =>
                      setData((d) => ({ ...d, taxRate: Number(e.target.value) || 0 }))
                    }
                    className={`${inputClass} font-data tabular-nums`}
                  />
                  <button
                    type="button"
                    onClick={() => setData((d) => ({ ...d, taxRate: d.taxRate === 11 ? 0 : 11 }))}
                    className="font-data shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 text-[11px] font-bold text-[var(--ink-muted)] hover:border-[var(--accent)]"
                  >
                    11%
                  </button>
                </div>
              </div>

              {data.docType === 'invoice' && (
                <div>
                  <label className={labelClass}>
                    {isId ? 'Uang Muka / DP' : 'Amount Paid / Deposit'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={data.amountPaid}
                    onChange={(e) =>
                      setData((d) => ({ ...d, amountPaid: Number(e.target.value) || 0 }))
                    }
                    className={`${inputClass} font-data tabular-nums`}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>
                  {isId ? 'Info Rekening / Pembayaran' : 'Payment Details'}
                </label>
                <textarea
                  rows={2}
                  value={data.paymentInfo}
                  onChange={(e) => setData((d) => ({ ...d, paymentInfo: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{isId ? 'Catatan' : 'Notes'}</label>
                <textarea
                  rows={2}
                  value={data.notes}
                  onChange={(e) => setData((d) => ({ ...d, notes: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>{isId ? 'Nama Penandatangan' : 'Signer Name'}</label>
                <input
                  type="text"
                  value={data.signerName}
                  onChange={(e) => setData((d) => ({ ...d, signerName: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{isId ? 'Jabatan' : 'Role / Title'}</label>
                <input
                  type="text"
                  value={data.signerRole}
                  onChange={(e) => setData((d) => ({ ...d, signerRole: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setSigModalOpen(true)}
                  className="rounded-lg border border-[var(--border-control)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--accent)]"
                >
                  {data.signature
                    ? isId
                      ? 'Ubah Tanda Tangan'
                      : 'Change Signature'
                    : isId
                      ? '+ Tambah Tanda Tangan'
                      : '+ Add Signature'}
                </button>
                {data.signature && (
                  <button
                    type="button"
                    onClick={() => setData((d) => ({ ...d, signature: null }))}
                    className="text-left text-[11px] font-semibold text-[var(--danger)] hover:underline"
                  >
                    {isId ? 'Hapus tanda tangan' : 'Remove signature'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Live A4 Paper Preview */}
        <div
          className={`lg:col-span-6 ${mobileTab === 'edit' ? 'hidden lg:block' : ''}`}
        >
          <div className="sticky top-6 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-white text-[#111315] shadow-md">
            {/* Accent top stripe */}
            <div className="h-2 w-full" style={{ backgroundColor: accentStyle.hex }} />

            <div className="space-y-5 p-5 sm:p-7">
              {/* Paper Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div className="max-w-[58%] space-y-1.5">
                  {data.logo && (
                    <img
                      src={data.logo.dataUrl}
                      alt="Logo"
                      className="mb-2 max-h-11 max-w-[130px] object-contain"
                    />
                  )}
                  <div className="text-sm font-extrabold text-slate-900">
                    {data.senderName || (isId ? 'Nama Usaha Anda' : 'Your Business Name')}
                  </div>
                  {data.senderDetails && (
                    <p className="m-0 whitespace-pre-line text-[11px] leading-relaxed text-slate-500">
                      {data.senderDetails}
                    </p>
                  )}
                </div>

                <div className="space-y-1 text-right">
                  <div
                    className="text-xl font-extrabold tracking-tight"
                    style={{ color: accentStyle.hex }}
                  >
                    {data.docType === 'receipt'
                      ? isId
                        ? 'KUITANSI'
                        : 'RECEIPT'
                      : 'INVOICE'}
                  </div>
                  <div className="font-data space-y-0.5 text-[11px] text-slate-600 tabular-nums">
                    <div>
                      {isId ? 'Nomor:' : 'No:'}{' '}
                      <strong className="text-slate-900">{data.docNumber || '-'}</strong>
                    </div>
                    <div>
                      {isId ? 'Tanggal:' : 'Date:'}{' '}
                      <strong className="text-slate-900">{data.issueDate || '-'}</strong>
                    </div>
                    {data.docType === 'invoice' && data.dueDate && (
                      <div>
                        {isId ? 'Jatuh Tempo:' : 'Due:'}{' '}
                        <strong className="text-slate-900">{data.dueDate}</strong>
                      </div>
                    )}
                  </div>
                  {stampLabel && (
                    <div className="pt-1">
                      <span
                        className={`inline-block -rotate-2 rounded border-2 px-2 py-0.5 text-[10px] font-extrabold tracking-wider ${
                          data.statusStamp === 'paid'
                            ? 'border-emerald-700 text-emerald-700'
                            : data.statusStamp === 'dp'
                              ? 'border-amber-700 text-amber-700'
                              : 'border-red-700 text-red-700'
                        }`}
                      >
                        {stampLabel}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Client Info */}
              <div className="space-y-1">
                <div
                  className="text-[10px] font-bold tracking-wider uppercase"
                  style={{ color: accentStyle.hex }}
                >
                  {data.docType === 'receipt'
                    ? isId
                      ? 'Sudah Terima Dari'
                      : 'Received From'
                    : isId
                      ? 'Ditagihkan Kepada'
                      : 'Bill To'}
                </div>
                <div className="text-xs font-bold text-slate-900">
                  {data.clientName || (isId ? 'Nama Klien' : 'Client Name')}
                </div>
                {data.clientDetails && (
                  <p className="m-0 whitespace-pre-line text-[11px] text-slate-500">
                    {data.clientDetails}
                  </p>
                )}
              </div>

              {/* Receipt Terbilang Box */}
              {data.docType === 'receipt' && (
                <div
                  className="space-y-2 rounded-xl border p-3 text-xs"
                  style={{
                    backgroundColor: accentStyle.tintHex,
                    borderColor: accentStyle.hex,
                  }}
                >
                  <div>
                    <div
                      className="text-[10px] font-bold tracking-wider uppercase"
                      style={{ color: accentStyle.hex }}
                    >
                      {isId ? 'Uang Sejumlah (Terbilang)' : 'Amount in Words'}
                    </div>
                    <div className="font-bold text-slate-900 italic">{amountInWords}</div>
                  </div>
                  {data.receiptPurpose && (
                    <div>
                      <div
                        className="text-[10px] font-bold tracking-wider uppercase"
                        style={{ color: accentStyle.hex }}
                      >
                        {isId ? 'Untuk Pembayaran' : 'For Payment Of'}
                      </div>
                      <div className="text-slate-800">{data.receiptPurpose}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr style={{ backgroundColor: accentStyle.hex }} className="text-white">
                      <th className="px-2.5 py-2 text-left font-bold">
                        {isId ? 'Deskripsi' : 'Description'}
                      </th>
                      <th className="px-2 py-2 text-right font-bold">Qty</th>
                      <th className="px-2 py-2 text-right font-bold">
                        {isId ? 'Harga' : 'Price'}
                      </th>
                      <th className="px-2.5 py-2 text-right font-bold">
                        {isId ? 'Subtotal' : 'Amount'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item, idx) => (
                      <tr
                        key={item.id}
                        className={`border-b border-slate-200 ${idx % 2 === 1 ? 'bg-slate-50' : ''}`}
                      >
                        <td className="px-2.5 py-2 text-slate-800">
                          {item.description || `Item ${idx + 1}`}
                        </td>
                        <td className="font-data px-2 py-2 text-right text-slate-700 tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="font-data px-2 py-2 text-right text-slate-700 tabular-nums">
                          {formatMoney(item.unitPrice, data.currency)}
                        </td>
                        <td className="font-data px-2.5 py-2 text-right font-bold text-slate-900 tabular-nums">
                          {formatMoney(item.quantity * item.unitPrice, data.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary & Payment Info */}
              <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
                <div className="space-y-2.5 text-[11px]">
                  {data.paymentInfo && (
                    <div>
                      <div
                        className="text-[10px] font-bold tracking-wider uppercase"
                        style={{ color: accentStyle.hex }}
                      >
                        {isId ? 'Info Pembayaran' : 'Payment Details'}
                      </div>
                      <p className="m-0 whitespace-pre-line text-slate-700">{data.paymentInfo}</p>
                    </div>
                  )}
                  {data.notes && (
                    <div>
                      <div
                        className="text-[10px] font-bold tracking-wider uppercase"
                        style={{ color: accentStyle.hex }}
                      >
                        {isId ? 'Catatan' : 'Notes'}
                      </div>
                      <p className="m-0 whitespace-pre-line text-slate-500">{data.notes}</p>
                    </div>
                  )}
                </div>

                <div className="font-data space-y-1.5 text-[11px] tabular-nums">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="text-slate-900">
                      {formatMoney(totals.subtotal, data.currency)}
                    </span>
                  </div>
                  {totals.discountAmount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>
                        {isId ? 'Diskon' : 'Discount'}
                        {data.discountType === 'percent' ? ` (${data.discountValue}%)` : ''}
                      </span>
                      <span className="text-rose-700">
                        - {formatMoney(totals.discountAmount, data.currency)}
                      </span>
                    </div>
                  )}
                  {data.taxRate > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>
                        {isId ? 'PPN / Pajak' : 'Tax'} ({data.taxRate}%)
                      </span>
                      <span className="text-slate-900">
                        {formatMoney(totals.taxAmount, data.currency)}
                      </span>
                    </div>
                  )}
                  <div
                    className="flex justify-between rounded-lg px-2.5 py-2 text-xs font-extrabold"
                    style={{
                      backgroundColor: accentStyle.tintHex,
                      color: accentStyle.hex,
                    }}
                  >
                    <span>
                      {data.docType === 'receipt'
                        ? isId
                          ? 'TOTAL DITERIMA'
                          : 'TOTAL PAID'
                        : isId
                          ? 'TOTAL TAGIHAN'
                          : 'TOTAL DUE'}
                    </span>
                    <span>{formatMoney(totals.grandTotal, data.currency)}</span>
                  </div>
                  {data.docType === 'invoice' && totals.amountPaid > 0 && (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>{isId ? 'Uang Muka / Dibayar' : 'Amount Paid'}</span>
                        <span>- {formatMoney(totals.amountPaid, data.currency)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900">
                        <span>{isId ? 'Sisa Tagihan' : 'Balance Due'}</span>
                        <span>{formatMoney(totals.balanceDue, data.currency)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Signature Preview */}
              {(data.signature || data.signerName) && (
                <div className="flex justify-end pt-3">
                  <div className="w-44 text-center">
                    {data.signature ? (
                      <img
                        src={data.signature.dataUrl}
                        alt="Signature"
                        className="mx-auto mb-1 max-h-14 max-w-[140px] object-contain"
                      />
                    ) : (
                      <div className="h-10" />
                    )}
                    <div className="border-t border-slate-300 pt-1 text-xs font-bold text-slate-900">
                      {data.signerName}
                    </div>
                    {data.signerRole && (
                      <div className="text-[10px] text-slate-500">{data.signerRole}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reusable Signature Pad Modal */}
      <SignaturePadModal
        open={sigModalOpen}
        onClose={() => setSigModalOpen(false)}
        onConfirm={handleSignatureConfirm}
        invalidImageError={
          isId
            ? 'Gunakan gambar tanda tangan berformat PNG, JPG, atau WebP.'
            : 'Please use a valid PNG, JPG, or WebP signature image.'
        }
        copy={{
          title: isId ? 'Tambah Tanda Tangan' : 'Add Signature',
          tabDraw: isId ? 'Gambar Langsung' : 'Draw',
          tabUpload: isId ? 'Unggah Gambar' : 'Upload Image',
          drawHint: isId
            ? 'Goreskan tanda tangan kamu dengan mouse atau jari di area bawah.'
            : 'Draw your signature with a mouse or finger below.',
          inkColorLabel: isId ? 'Warna tinta' : 'Ink color',
          clearPad: isId ? 'Bersihkan' : 'Clear',
          insertSignature: isId ? 'Pasang Tanda Tangan' : 'Insert Signature',
          uploadButton: isId ? 'Pilih Gambar Tanda Tangan' : 'Choose Signature Image',
          uploadHint: isId
            ? 'Disarankan PNG transparan agar rapi di atas kertas dokumen.'
            : 'Transparent PNG is recommended for a clean look on the document.',
          emptyPadError: isId
            ? 'Silakan gambar tanda tangan terlebih dahulu.'
            : 'Please draw your signature first.',
          closeModal: isId ? 'Tutup' : 'Close',
        }}
      />

      {hasExported && (
        <SupportCard
          locale={locale}
          heading={dict.shared.supportHeading}
          body={dict.shared.supportBody}
          aboutCta={dict.shared.supportAboutCta}
          dismissLabel={dict.shared.supportDismiss}
        />
      )}
    </div>
  );
}
