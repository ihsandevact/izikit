import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  buildInvoiceFilename,
  computeInvoiceTotals,
  formatMoney,
  incrementDocNumber,
  numberToWordsEn,
  numberToWordsId,
  sanitizePdfText,
  type InvoiceData,
} from '../invoice.logic';
import { buildInvoicePdfBytes } from '../invoice-pdf';

const BASE_INVOICE: InvoiceData = {
  docType: 'invoice',
  docNumber: 'INV-2026-001',
  issueDate: '2026-11-27',
  dueDate: '2026-12-11',
  currency: 'IDR',
  accent: 'emerald',
  statusStamp: 'unpaid',
  senderName: 'Studio Kreatif Nusantara',
  senderDetails: 'Jl. Merdeka No. 10, Bandung\nhello@nusantara.id',
  clientName: 'PT Maju Bersama',
  clientDetails: 'Jakarta Selatan',
  receiptPurpose: 'Pembayaran jasa desain antarmuka aplikasi',
  items: [
    { id: '1', description: 'Desain UI/UX Landing Page', quantity: 1, unitPrice: 2_500_000 },
    { id: '2', description: 'Integrasi Frontend', quantity: 2, unitPrice: 1_250_000 },
  ],
  discountType: 'percent',
  discountValue: 10,
  taxRate: 11,
  amountPaid: 1_500_000,
  paymentInfo: 'BCA 1234567890 a.n. Studio Kreatif Nusantara',
  notes: 'Terima kasih atas kerja samanya.',
  signerName: 'Budi Santoso',
  signerRole: 'Founder',
  logo: null,
  signature: null,
};

describe('invoice.logic & invoice-pdf', () => {
  it('computes subtotal, percent discount, PPN tax, DP, and balance due accurately', () => {
    const totals = computeInvoiceTotals(BASE_INVOICE);
    // Subtotal = 2.500.000 + 2.500.000 = 5.000.000
    // Discount 10% = 500.000 -> taxableBase = 4.500.000
    // Tax 11% = 495.000 -> grandTotal = 4.995.000
    // Paid = 1.500.000 -> balanceDue = 3.495.000
    expect(totals.subtotal).toBe(5_000_000);
    expect(totals.discountAmount).toBe(500_000);
    expect(totals.taxableBase).toBe(4_500_000);
    expect(totals.taxAmount).toBe(495_000);
    expect(totals.grandTotal).toBe(4_995_000);
    expect(totals.balanceDue).toBe(3_495_000);
  });

  it('converts Indonesian and English amounts into words (Terbilang)', () => {
    expect(numberToWordsId(0, 'IDR')).toBe('Nol Rupiah');
    expect(numberToWordsId(1_500_000, 'IDR')).toBe('Satu Juta Lima Ratus Ribu Rupiah');
    expect(numberToWordsId(1_111_000, 'IDR')).toBe(
      'Satu Juta Seratus Sebelas Ribu Rupiah',
    );
    expect(numberToWordsEn(1250.5, 'USD')).toBe(
      'One Thousand Two Hundred Fifty US Dollars and 50/100',
    );
  });

  it('sanitizes non-WinAnsi characters and formats filenames/numbers cleanly', () => {
    expect(sanitizePdfText('Halo — “dunia” 🚀')).toBe('Halo - "dunia" ');
    expect(incrementDocNumber('INV-2026-009')).toBe('INV-2026-010');
    expect(buildInvoiceFilename('receipt', 'KWT/2026/05', 'id')).toBe('kuitansi-KWT-2026-05.pdf');
    expect(formatMoney(1500000, 'IDR')).toContain('Rp');
  });

  it('generates valid A4 PDF bytes for Invoice, Receipt, and multi-page item lists', async () => {
    const invBytes = await buildInvoicePdfBytes(BASE_INVOICE, 'id');
    const invDoc = await PDFDocument.load(invBytes);
    expect(invDoc.getPageCount()).toBe(1);

    const receiptBytes = await buildInvoicePdfBytes(
      { ...BASE_INVOICE, docType: 'receipt', statusStamp: 'paid', notes: 'Terima kasih 🎉 — sukses!' },
      'id',
    );
    const receiptDoc = await PDFDocument.load(receiptBytes);
    expect(receiptDoc.getPageCount()).toBe(1);

    const manyItems = Array.from({ length: 28 }, (_, i) => ({
      id: String(i + 1),
      description: `Layanan Modul #${i + 1} — Implementasi & QA`,
      quantity: 1,
      unitPrice: 250_000,
    }));
    const multiBytes = await buildInvoicePdfBytes({ ...BASE_INVOICE, items: manyItems }, 'en');
    const multiDoc = await PDFDocument.load(multiBytes);
    expect(multiDoc.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
