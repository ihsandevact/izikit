import { degrees, PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib';
import {
  ACCENT_THEMES,
  computeInvoiceTotals,
  formatMoney,
  numberToWordsEn,
  numberToWordsId,
  sanitizePdfText,
  type EmbeddedImageAsset,
  type InvoiceData,
} from './invoice.logic';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 46;
const CONTENT_WIDTH = A4_WIDTH - MARGIN_X * 2;
const FOOTER_GUARD_Y = 72;

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const cleaned = sanitizePdfText(text);
  const paragraphs = cleaned.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

async function embedAsset(doc: PDFDocument, asset: EmbeddedImageAsset | null) {
  if (!asset?.dataUrl) return null;
  try {
    const bytes = dataUrlToBytes(asset.dataUrl);
    return asset.mime === 'image/jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

export async function buildInvoicePdfBytes(
  data: InvoiceData,
  locale: 'id' | 'en',
): Promise<Uint8Array> {
  const isId = locale === 'id';
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const theme = ACCENT_THEMES[data.accent] ?? ACCENT_THEMES.emerald;
  const accentColor = rgb(theme.rgb[0], theme.rgb[1], theme.rgb[2]);
  const tintColor = rgb(theme.tintRgb[0], theme.tintRgb[1], theme.tintRgb[2]);
  const inkPrimary = rgb(17 / 255, 19 / 255, 21 / 255);
  const inkMuted = rgb(90 / 255, 96 / 255, 106 / 255);
  const borderColor = rgb(224 / 255, 228 / 255, 232 / 255);
  const zebraColor = rgb(249 / 255, 250 / 255, 251 / 255);

  const logoImg = await embedAsset(doc, data.logo);
  const sigImg = await embedAsset(doc, data.signature);

  const totals = computeInvoiceTotals(data);
  const isReceipt = data.docType === 'receipt';

  const pages: PDFPage[] = [];
  const createPage = (): PDFPage => {
    const p = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    // Top accent bar
    p.drawRectangle({
      x: 0,
      y: A4_HEIGHT - 8,
      width: A4_WIDTH,
      height: 8,
      color: accentColor,
    });
    pages.push(p);
    return p;
  };

  let page = createPage();
  let y = A4_HEIGHT - 42;

  // --- HEADER: Logo + Sender on left, Doc Title + Meta on right ---
  const leftStartY = y;
  let leftY = leftStartY;

  if (logoImg) {
    const maxLogoW = 110;
    const maxLogoH = 44;
    const ratio = logoImg.width / Math.max(1, logoImg.height);
    let drawW = maxLogoW;
    let drawH = drawW / ratio;
    if (drawH > maxLogoH) {
      drawH = maxLogoH;
      drawW = drawH * ratio;
    }
    page.drawImage(logoImg, {
      x: MARGIN_X,
      y: leftY - drawH,
      width: drawW,
      height: drawH,
    });
    leftY -= drawH + 10;
  }

  const senderName = sanitizePdfText(data.senderName.trim() || (isId ? 'Nama Usaha Anda' : 'Your Business Name'));
  page.drawText(senderName, {
    x: MARGIN_X,
    y: leftY - 13,
    size: 13,
    font: fontBold,
    color: inkPrimary,
  });
  leftY -= 18;

  if (data.senderDetails.trim()) {
    const senderLines = wrapText(data.senderDetails, fontRegular, 9, 250);
    for (const line of senderLines) {
      if (line) {
        page.drawText(line, { x: MARGIN_X, y: leftY - 9, size: 9, font: fontRegular, color: inkMuted });
      }
      leftY -= 12.5;
    }
  }

  // Right header block
  const docTitle = isReceipt
    ? isId
      ? 'KUITANSI'
      : 'RECEIPT'
    : 'INVOICE';
  const titleW = fontBold.widthOfTextAtSize(docTitle, 22);
  page.drawText(docTitle, {
    x: A4_WIDTH - MARGIN_X - titleW,
    y: leftStartY - 18,
    size: 22,
    font: fontBold,
    color: accentColor,
  });

  let rightY = leftStartY - 36;
  const metaRows: Array<[string, string]> = [
    [isId ? 'Nomor' : 'Number', sanitizePdfText(data.docNumber || '-')],
    [isId ? 'Tanggal' : 'Issue Date', sanitizePdfText(data.issueDate || '-')],
  ];
  if (!isReceipt && data.dueDate.trim()) {
    metaRows.push([isId ? 'Jatuh Tempo' : 'Due Date', sanitizePdfText(data.dueDate)]);
  }

  for (const [label, value] of metaRows) {
    const valW = fontBold.widthOfTextAtSize(value, 9.5);
    const lblText = `${label}: `;
    const lblW = fontRegular.widthOfTextAtSize(lblText, 9.5);
    page.drawText(lblText, {
      x: A4_WIDTH - MARGIN_X - valW - lblW,
      y: rightY,
      size: 9.5,
      font: fontRegular,
      color: inkMuted,
    });
    page.drawText(value, {
      x: A4_WIDTH - MARGIN_X - valW,
      y: rightY,
      size: 9.5,
      font: fontBold,
      color: inkPrimary,
    });
    rightY -= 14;
  }

  // Optional status stamp
  if (data.statusStamp !== 'none') {
    const stampLabel =
      data.statusStamp === 'paid'
        ? isId
          ? 'LUNAS'
          : 'PAID'
        : data.statusStamp === 'dp'
          ? isId
            ? 'DP / SEBAGIAN'
            : 'PARTIAL PAID'
          : isId
            ? 'BELUM LUNAS'
            : 'UNPAID';
    const stampColor =
      data.statusStamp === 'paid'
        ? rgb(4 / 255, 120 / 255, 87 / 255)
        : data.statusStamp === 'dp'
          ? rgb(180 / 255, 83 / 255, 9 / 255)
          : rgb(185 / 255, 28 / 255, 28 / 255);
    const sw = fontBold.widthOfTextAtSize(stampLabel, 11) + 18;
    const sx = A4_WIDTH - MARGIN_X - sw;
    const sy = rightY - 12;
    page.drawRectangle({
      x: sx,
      y: sy,
      width: sw,
      height: 20,
      borderColor: stampColor,
      borderWidth: 1.4,
      rotate: degrees(-3),
    });
    page.drawText(stampLabel, {
      x: sx + 9,
      y: sy + 6,
      size: 11,
      font: fontBold,
      color: stampColor,
      rotate: degrees(-3),
    });
    rightY -= 26;
  }

  y = Math.min(leftY, rightY) - 16;

  // Divider line
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: A4_WIDTH - MARGIN_X, y },
    thickness: 0.75,
    color: borderColor,
  });
  y -= 18;

  // --- CLIENT / RECEIPT BLOCK ---
  const clientHeader = isReceipt
    ? isId
      ? 'SUDAH TERIMA DARI'
      : 'RECEIVED FROM'
    : isId
      ? 'DITAGIHKAN KEPADA'
      : 'BILL TO';
  page.drawText(clientHeader, {
    x: MARGIN_X,
    y,
    size: 8.5,
    font: fontBold,
    color: accentColor,
  });
  y -= 14;

  const clientName = sanitizePdfText(data.clientName.trim() || (isId ? 'Nama Klien / Pelanggan' : 'Client Name'));
  page.drawText(clientName, {
    x: MARGIN_X,
    y,
    size: 11.5,
    font: fontBold,
    color: inkPrimary,
  });
  y -= 14;

  if (data.clientDetails.trim()) {
    const clientLines = wrapText(data.clientDetails, fontRegular, 9, 320);
    for (const line of clientLines) {
      if (line) {
        page.drawText(line, { x: MARGIN_X, y, size: 9, font: fontRegular, color: inkMuted });
      }
      y -= 12.5;
    }
  }

  // Receipt "Terbilang" & Purpose highlight box
  if (isReceipt) {
    y -= 6;
    const wordsText = isId
      ? numberToWordsId(totals.grandTotal, data.currency)
      : numberToWordsEn(totals.grandTotal, data.currency);
    const wrappedWords = wrapText(wordsText, fontBold, 10, CONTENT_WIDTH - 24);
    const purposeLines = data.receiptPurpose.trim()
      ? wrapText(data.receiptPurpose, fontRegular, 9.5, CONTENT_WIDTH - 24)
      : [];

    const boxH =
      26 +
      wrappedWords.length * 14 +
      (purposeLines.length > 0 ? 18 + purposeLines.length * 13 : 0);

    page.drawRectangle({
      x: MARGIN_X,
      y: y - boxH,
      width: CONTENT_WIDTH,
      height: boxH,
      color: tintColor,
      borderColor: accentColor,
      borderWidth: 0.75,
    });

    let boxY = y - 16;
    page.drawText(isId ? 'UANG SEJUMLAH (TERBILANG)' : 'AMOUNT IN WORDS', {
      x: MARGIN_X + 12,
      y: boxY,
      size: 8,
      font: fontBold,
      color: accentColor,
    });
    boxY -= 14;
    for (const line of wrappedWords) {
      page.drawText(line, { x: MARGIN_X + 12, y: boxY, size: 10, font: fontBold, color: inkPrimary });
      boxY -= 14;
    }
    if (purposeLines.length > 0) {
      boxY -= 4;
      page.drawText(isId ? 'UNTUK PEMBAYARAN' : 'FOR PAYMENT OF', {
        x: MARGIN_X + 12,
        y: boxY,
        size: 8,
        font: fontBold,
        color: accentColor,
      });
      boxY -= 13;
      for (const line of purposeLines) {
        page.drawText(line, { x: MARGIN_X + 12, y: boxY, size: 9.5, font: fontRegular, color: inkPrimary });
        boxY -= 13;
      }
    }

    y -= boxH + 16;
  } else {
    y -= 10;
  }

  // --- ITEM TABLE ---
  const colDescX = MARGIN_X + 8;
  const colDescW = 248;
  const colQtyRight = MARGIN_X + 312;
  const colPriceRight = MARGIN_X + 408;
  const colTotalRight = A4_WIDTH - MARGIN_X - 8;

  const drawTableHeader = (targetPage: PDFPage, startY: number): number => {
    const barH = 24;
    targetPage.drawRectangle({
      x: MARGIN_X,
      y: startY - barH,
      width: CONTENT_WIDTH,
      height: barH,
      color: accentColor,
    });
    const textY = startY - 15.5;
    const white = rgb(1, 1, 1);

    targetPage.drawText(isId ? 'DESKRIPSI ITEM' : 'DESCRIPTION', {
      x: colDescX,
      y: textY,
      size: 8.5,
      font: fontBold,
      color: white,
    });
    const qtyLbl = isId ? 'QTY' : 'QTY';
    targetPage.drawText(qtyLbl, {
      x: colQtyRight - fontBold.widthOfTextAtSize(qtyLbl, 8.5),
      y: textY,
      size: 8.5,
      font: fontBold,
      color: white,
    });
    const priceLbl = isId ? 'HARGA SATUAN' : 'UNIT PRICE';
    targetPage.drawText(priceLbl, {
      x: colPriceRight - fontBold.widthOfTextAtSize(priceLbl, 8.5),
      y: textY,
      size: 8.5,
      font: fontBold,
      color: white,
    });
    const totLbl = isId ? 'SUBTOTAL' : 'AMOUNT';
    targetPage.drawText(totLbl, {
      x: colTotalRight - fontBold.widthOfTextAtSize(totLbl, 8.5),
      y: textY,
      size: 8.5,
      font: fontBold,
      color: white,
    });
    return startY - barH;
  };

  y = drawTableHeader(page, y);

  for (let idx = 0; idx < data.items.length; idx += 1) {
    const item = data.items[idx];
    const descLines = wrapText(
      item.description.trim() || (isId ? `Item ${idx + 1}` : `Item ${idx + 1}`),
      fontRegular,
      9.5,
      colDescW,
    );
    const rowH = Math.max(24, descLines.length * 13 + 10);

    if (y - rowH < FOOTER_GUARD_Y) {
      page = createPage();
      y = A4_HEIGHT - 48;
      y = drawTableHeader(page, y);
    }

    if (idx % 2 === 1) {
      page.drawRectangle({
        x: MARGIN_X,
        y: y - rowH,
        width: CONTENT_WIDTH,
        height: rowH,
        color: zebraColor,
      });
    }

    let textY = y - 15;
    for (const dl of descLines) {
      page.drawText(dl, { x: colDescX, y: textY, size: 9.5, font: fontRegular, color: inkPrimary });
      textY -= 13;
    }

    const qtyStr = String(item.quantity);
    const priceStr = sanitizePdfText(formatMoney(item.unitPrice, data.currency));
    const lineTotalStr = sanitizePdfText(
      formatMoney(item.quantity * item.unitPrice, data.currency),
    );

    const numY = y - 15;
    page.drawText(qtyStr, {
      x: colQtyRight - fontRegular.widthOfTextAtSize(qtyStr, 9.5),
      y: numY,
      size: 9.5,
      font: fontRegular,
      color: inkPrimary,
    });
    page.drawText(priceStr, {
      x: colPriceRight - fontRegular.widthOfTextAtSize(priceStr, 9.5),
      y: numY,
      size: 9.5,
      font: fontRegular,
      color: inkPrimary,
    });
    page.drawText(lineTotalStr, {
      x: colTotalRight - fontBold.widthOfTextAtSize(lineTotalStr, 9.5),
      y: numY,
      size: 9.5,
      font: fontBold,
      color: inkPrimary,
    });

    y -= rowH;
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: A4_WIDTH - MARGIN_X, y },
      thickness: 0.5,
      color: borderColor,
    });
  }

  // --- SUMMARY + PAYMENT INFO + SIGNATURE BLOCK ---
  const summaryBlockNeeded = 190;
  if (y - summaryBlockNeeded < FOOTER_GUARD_Y) {
    page = createPage();
    y = A4_HEIGHT - 56;
  } else {
    y -= 18;
  }

  const summaryStartY = y;

  // Left: Payment Info & Notes
  let infoY = summaryStartY;
  if (data.paymentInfo.trim()) {
    page.drawText(isId ? 'INFO PEMBAYARAN' : 'PAYMENT DETAILS', {
      x: MARGIN_X,
      y: infoY,
      size: 8.5,
      font: fontBold,
      color: accentColor,
    });
    infoY -= 13;
    for (const line of wrapText(data.paymentInfo, fontRegular, 9, 250)) {
      if (line) {
        page.drawText(line, { x: MARGIN_X, y: infoY, size: 9, font: fontRegular, color: inkPrimary });
      }
      infoY -= 12.5;
    }
    infoY -= 8;
  }

  if (data.notes.trim()) {
    page.drawText(isId ? 'CATATAN' : 'NOTES', {
      x: MARGIN_X,
      y: infoY,
      size: 8.5,
      font: fontBold,
      color: accentColor,
    });
    infoY -= 13;
    for (const line of wrapText(data.notes, fontRegular, 8.8, 250)) {
      if (line) {
        page.drawText(line, { x: MARGIN_X, y: infoY, size: 8.8, font: fontRegular, color: inkMuted });
      }
      infoY -= 12;
    }
  }

  // Right: Totals Table
  let totY = summaryStartY;
  const totLeftX = A4_WIDTH - MARGIN_X - 210;
  const totRightX = A4_WIDTH - MARGIN_X;

  const drawTotalRow = (label: string, val: string, bold = false, highlight = false) => {
    const f = bold ? fontBold : fontRegular;
    const sz = highlight ? 11 : 9.5;
    if (highlight) {
      page.drawRectangle({
        x: totLeftX - 8,
        y: totY - 7,
        width: 218,
        height: 24,
        color: tintColor,
      });
    }
    page.drawText(label, {
      x: totLeftX,
      y: totY,
      size: sz,
      font: f,
      color: highlight ? accentColor : inkMuted,
    });
    const vw = f.widthOfTextAtSize(val, sz);
    page.drawText(val, {
      x: totRightX - vw,
      y: totY,
      size: sz,
      font: f,
      color: highlight ? accentColor : inkPrimary,
    });
    totY -= highlight ? 26 : 16;
  };

  drawTotalRow('Subtotal', sanitizePdfText(formatMoney(totals.subtotal, data.currency)));
  if (totals.discountAmount > 0) {
    const discLbl =
      data.discountType === 'percent'
        ? `${isId ? 'Diskon' : 'Discount'} (${data.discountValue}%)`
        : isId
          ? 'Diskon'
          : 'Discount';
    drawTotalRow(discLbl, `- ${sanitizePdfText(formatMoney(totals.discountAmount, data.currency))}`);
  }
  if (data.taxRate > 0) {
    drawTotalRow(
      `${isId ? 'Pajak / PPN' : 'Tax'} (${data.taxRate}%)`,
      sanitizePdfText(formatMoney(totals.taxAmount, data.currency)),
    );
  }
  drawTotalRow(
    isReceipt ? (isId ? 'TOTAL DITERIMA' : 'TOTAL PAID') : isId ? 'TOTAL TAGIHAN' : 'TOTAL DUE',
    sanitizePdfText(formatMoney(totals.grandTotal, data.currency)),
    true,
    true,
  );
  if (!isReceipt && totals.amountPaid > 0) {
    drawTotalRow(
      isId ? 'Uang Muka / Dibayar' : 'Amount Paid',
      `- ${sanitizePdfText(formatMoney(totals.amountPaid, data.currency))}`,
    );
    drawTotalRow(
      isId ? 'Sisa Tagihan' : 'Balance Due',
      sanitizePdfText(formatMoney(totals.balanceDue, data.currency)),
      true,
    );
  }

  // Signature block on bottom-right
  const sigTopY = Math.min(infoY, totY) - 18;
  if (sigImg || data.signerName.trim()) {
    let sy = sigTopY;
    if (sy - 80 < 40) {
      page = createPage();
      sy = A4_HEIGHT - 80;
    }
    const sigCenterX = A4_WIDTH - MARGIN_X - 85;
    if (sigImg) {
      const maxSigW = 130;
      const maxSigH = 52;
      const ratio = sigImg.width / Math.max(1, sigImg.height);
      let sw = maxSigW;
      let sh = sw / ratio;
      if (sh > maxSigH) {
        sh = maxSigH;
        sw = sh * ratio;
      }
      page.drawImage(sigImg, {
        x: sigCenterX - sw / 2,
        y: sy - sh,
        width: sw,
        height: sh,
      });
      sy -= sh + 6;
    } else {
      sy -= 34;
    }

    page.drawLine({
      start: { x: sigCenterX - 75, y: sy },
      end: { x: sigCenterX + 75, y: sy },
      thickness: 0.75,
      color: borderColor,
    });
    sy -= 13;

    if (data.signerName.trim()) {
      const sName = sanitizePdfText(data.signerName.trim());
      const nw = fontBold.widthOfTextAtSize(sName, 9.5);
      page.drawText(sName, {
        x: sigCenterX - nw / 2,
        y: sy,
        size: 9.5,
        font: fontBold,
        color: inkPrimary,
      });
      sy -= 12;
    }
    if (data.signerRole.trim()) {
      const sRole = sanitizePdfText(data.signerRole.trim());
      const rw = fontRegular.widthOfTextAtSize(sRole, 8.5);
      page.drawText(sRole, {
        x: sigCenterX - rw / 2,
        y: sy,
        size: 8.5,
        font: fontRegular,
        color: inkMuted,
      });
    }
  }

  // Footer with page numbers (if multi-page)
  const totalPages = pages.length;
  pages.forEach((p, idx) => {
    if (totalPages > 1) {
      const pageLabel = `${isId ? 'Halaman' : 'Page'} ${idx + 1} / ${totalPages}`;
      const lw = fontRegular.widthOfTextAtSize(pageLabel, 8.5);
      p.drawText(pageLabel, {
        x: A4_WIDTH - MARGIN_X - lw,
        y: 26,
        size: 8.5,
        font: fontRegular,
        color: inkMuted,
      });
    }
  });

  return doc.save();
}
