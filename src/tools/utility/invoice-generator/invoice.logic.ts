export type DocumentType = 'invoice' | 'receipt';
export type CurrencyCode = 'IDR' | 'USD' | 'SGD' | 'EUR' | 'MYR';
export type DiscountType = 'percent' | 'fixed';
export type AccentThemeKey = 'emerald' | 'slate' | 'navy';
export type PaymentStatusKey = 'none' | 'paid' | 'unpaid' | 'dp';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface EmbeddedImageAsset {
  dataUrl: string;
  mime: 'image/png' | 'image/jpeg';
  aspectRatio: number;
}

export interface InvoiceData {
  docType: DocumentType;
  docNumber: string;
  issueDate: string;
  dueDate: string;
  currency: CurrencyCode;
  accent: AccentThemeKey;
  statusStamp: PaymentStatusKey;
  senderName: string;
  senderDetails: string;
  clientName: string;
  clientDetails: string;
  receiptPurpose: string;
  items: InvoiceLineItem[];
  discountType: DiscountType;
  discountValue: number;
  taxRate: number;
  amountPaid: number;
  paymentInfo: string;
  notes: string;
  signerName: string;
  signerRole: string;
  logo: EmbeddedImageAsset | null;
  signature: EmbeddedImageAsset | null;
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
}

export const CURRENCY_META: Record<
  CurrencyCode,
  {
    code: CurrencyCode;
    symbol: string;
    decimals: number;
    locale: string;
    wordUnitId: string;
    wordUnitEn: string;
  }
> = {
  IDR: {
    code: 'IDR',
    symbol: 'Rp',
    decimals: 0,
    locale: 'id-ID',
    wordUnitId: 'Rupiah',
    wordUnitEn: 'Indonesian Rupiah',
  },
  USD: {
    code: 'USD',
    symbol: '$',
    decimals: 2,
    locale: 'en-US',
    wordUnitId: 'Dolar AS',
    wordUnitEn: 'US Dollars',
  },
  SGD: {
    code: 'SGD',
    symbol: 'S$',
    decimals: 2,
    locale: 'en-SG',
    wordUnitId: 'Dolar Singapura',
    wordUnitEn: 'Singapore Dollars',
  },
  EUR: {
    code: 'EUR',
    symbol: 'EUR',
    decimals: 2,
    locale: 'en-IE',
    wordUnitId: 'Euro',
    wordUnitEn: 'Euros',
  },
  MYR: {
    code: 'MYR',
    symbol: 'RM',
    decimals: 2,
    locale: 'en-MY',
    wordUnitId: 'Ringgit',
    wordUnitEn: 'Malaysian Ringgit',
  },
};

export const ACCENT_THEMES: Record<
  AccentThemeKey,
  { hex: string; tintHex: string; rgb: [number, number, number]; tintRgb: [number, number, number] }
> = {
  emerald: {
    hex: '#047857',
    tintHex: '#ECFDF5',
    rgb: [4 / 255, 120 / 255, 87 / 255],
    tintRgb: [236 / 255, 253 / 255, 245 / 255],
  },
  slate: {
    hex: '#1E293B',
    tintHex: '#F1F5F9',
    rgb: [30 / 255, 41 / 255, 59 / 255],
    tintRgb: [241 / 255, 245 / 255, 249 / 255],
  },
  navy: {
    hex: '#1D4ED8',
    tintHex: '#EFF6FF',
    rgb: [29 / 255, 78 / 255, 216 / 255],
    tintRgb: [239 / 255, 246 / 255, 255 / 255],
  },
};

export function roundCurrency(value: number, currency: CurrencyCode): number {
  if (!Number.isFinite(value)) return 0;
  const decimals = CURRENCY_META[currency].decimals;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function computeInvoiceTotals(data: Pick<
  InvoiceData,
  'items' | 'discountType' | 'discountValue' | 'taxRate' | 'amountPaid' | 'currency'
>): InvoiceTotals {
  const { currency } = data;
  const rawSubtotal = data.items.reduce((sum, item) => {
    const qty = Math.max(0, Number.isFinite(item.quantity) ? item.quantity : 0);
    const price = Math.max(0, Number.isFinite(item.unitPrice) ? item.unitPrice : 0);
    return sum + roundCurrency(qty * price, currency);
  }, 0);
  const subtotal = roundCurrency(rawSubtotal, currency);

  const rawDiscountVal = Math.max(0, Number.isFinite(data.discountValue) ? data.discountValue : 0);
  const computedDiscount =
    data.discountType === 'percent'
      ? roundCurrency((subtotal * Math.min(100, rawDiscountVal)) / 100, currency)
      : roundCurrency(rawDiscountVal, currency);
  const discountAmount = Math.min(subtotal, computedDiscount);

  const taxableBase = roundCurrency(Math.max(0, subtotal - discountAmount), currency);
  const safeTaxRate = Math.max(0, Math.min(100, Number.isFinite(data.taxRate) ? data.taxRate : 0));
  const taxAmount = roundCurrency((taxableBase * safeTaxRate) / 100, currency);

  const grandTotal = roundCurrency(taxableBase + taxAmount, currency);
  const safePaid = Math.max(0, Number.isFinite(data.amountPaid) ? data.amountPaid : 0);
  const amountPaid = Math.min(grandTotal, roundCurrency(safePaid, currency));
  const balanceDue = roundCurrency(Math.max(0, grandTotal - amountPaid), currency);

  return {
    subtotal,
    discountAmount,
    taxableBase,
    taxAmount,
    grandTotal,
    amountPaid,
    balanceDue,
  };
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const meta = CURRENCY_META[currency];
  const rounded = roundCurrency(amount, currency);
  const formatted = new Intl.NumberFormat(meta.locale, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  }).format(rounded);
  return `${meta.symbol} ${formatted}`;
}

const ID_WORDS = [
  '',
  'Satu',
  'Dua',
  'Tiga',
  'Empat',
  'Lima',
  'Enam',
  'Tujuh',
  'Delapan',
  'Sembilan',
  'Sepuluh',
  'Sebelas',
];

function terbilangIntId(n: number): string {
  if (n === 0) return '';
  if (n < 12) return ID_WORDS[n];
  if (n < 20) return `${ID_WORDS[n - 10]} Belas`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const rem = n % 10;
    return rem ? `${ID_WORDS[tens]} Puluh ${terbilangIntId(rem)}` : `${ID_WORDS[tens]} Puluh`;
  }
  if (n < 200) {
    const rem = n - 100;
    return rem ? `Seratus ${terbilangIntId(rem)}` : 'Seratus';
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rem = n % 100;
    return rem
      ? `${ID_WORDS[hundreds]} Ratus ${terbilangIntId(rem)}`
      : `${ID_WORDS[hundreds]} Ratus`;
  }
  if (n < 2000) {
    const rem = n - 1000;
    return rem ? `Seribu ${terbilangIntId(rem)}` : 'Seribu';
  }
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rem = n % 1000;
    return rem
      ? `${terbilangIntId(thousands)} Ribu ${terbilangIntId(rem)}`
      : `${terbilangIntId(thousands)} Ribu`;
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rem = n % 1_000_000;
    return rem
      ? `${terbilangIntId(millions)} Juta ${terbilangIntId(rem)}`
      : `${terbilangIntId(millions)} Juta`;
  }
  if (n < 1_000_000_000_000) {
    const billions = Math.floor(n / 1_000_000_000);
    const rem = n % 1_000_000_000;
    return rem
      ? `${terbilangIntId(billions)} Miliar ${terbilangIntId(rem)}`
      : `${terbilangIntId(billions)} Miliar`;
  }
  const trillions = Math.floor(n / 1_000_000_000_000);
  const rem = n % 1_000_000_000_000;
  return rem
    ? `${terbilangIntId(trillions)} Triliun ${terbilangIntId(rem)}`
    : `${terbilangIntId(trillions)} Triliun`;
}

export function numberToWordsId(amount: number, currency: CurrencyCode): string {
  const safe = Math.max(0, Math.floor(roundCurrency(amount, currency)));
  const unit = CURRENCY_META[currency].wordUnitId;
  if (safe === 0) return `Nol ${unit}`;
  return `${terbilangIntId(safe).replace(/\s+/g, ' ').trim()} ${unit}`;
}

const EN_ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function spellIntEn(n: number): string {
  if (n === 0) return '';
  if (n < 20) return EN_ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    return r ? `${EN_TENS[t]} ${EN_ONES[r]}` : EN_TENS[t];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return r ? `${EN_ONES[h]} Hundred ${spellIntEn(r)}` : `${EN_ONES[h]} Hundred`;
  }
  if (n < 1_000_000) {
    const k = Math.floor(n / 1000);
    const r = n % 1000;
    return r ? `${spellIntEn(k)} Thousand ${spellIntEn(r)}` : `${spellIntEn(k)} Thousand`;
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000);
    const r = n % 1_000_000;
    return r ? `${spellIntEn(m)} Million ${spellIntEn(r)}` : `${spellIntEn(m)} Million`;
  }
  const b = Math.floor(n / 1_000_000_000);
  const r = n % 1_000_000_000;
  return r ? `${spellIntEn(b)} Billion ${spellIntEn(r)}` : `${spellIntEn(b)} Billion`;
}

export function numberToWordsEn(amount: number, currency: CurrencyCode): string {
  const rounded = Math.max(0, roundCurrency(amount, currency));
  const whole = Math.floor(rounded);
  const cents = Math.round((rounded - whole) * 100);
  const unit = CURRENCY_META[currency].wordUnitEn;

  const wholeText = whole === 0 ? 'Zero' : spellIntEn(whole).replace(/\s+/g, ' ').trim();
  if (CURRENCY_META[currency].decimals > 0 && cents > 0) {
    return `${wholeText} ${unit} and ${cents}/100`;
  }
  return `${wholeText} ${unit}`;
}

/**
 * Sanitizes arbitrary user text into safe WinAnsi (Latin-1) characters so pdf-lib
 * StandardFonts never throw on emoji or exotic Unicode punctuation.
 */
export function sanitizePdfText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '*')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g, '');
}

export function incrementDocNumber(docNumber: string): string {
  const match = docNumber.match(/^(.*?)(\d+)$/);
  if (!match) return `${docNumber}-2`;
  const prefix = match[1];
  const digits = match[2];
  const next = String(Number(digits) + 1).padStart(digits.length, '0');
  return `${prefix}${next}`;
}

export function buildInvoiceFilename(
  docType: DocumentType,
  docNumber: string,
  locale: 'id' | 'en',
): string {
  const prefix = docType === 'receipt' ? (locale === 'id' ? 'kuitansi' : 'receipt') : 'invoice';
  const cleanNum =
    docNumber
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'draft';
  return `${prefix}-${cleanNum}.pdf`;
}
