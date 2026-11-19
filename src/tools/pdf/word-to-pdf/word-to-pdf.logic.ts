import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib';
import {
  parseDocxArchive,
  type DocxSummary,
  type DocxTextRun,
  type WordFontFamily,
  type WordMarginPreset,
  type WordPaperSize,
  type WordTextAlign,
  type WordToPdfOptions,
} from './docx-parser';

export * from './docx-parser';

export interface WordToPdfProgressInfo {
  percent: number;
}

export interface WordToPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  summary: DocxSummary;
}

interface FontQuartet {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

function getPaperDimensions(paperSize: WordPaperSize): { width: number; height: number } {
  if (paperSize === 'letter') {
    return { width: 612, height: 792 };
  }
  return { width: 595.28, height: 841.89 };
}

function getMarginPt(preset: WordMarginPreset): number {
  if (preset === 'narrow') return 42;
  if (preset === 'wide') return 84;
  return 64;
}

async function embedFontQuartet(doc: PDFDocument, family: WordFontFamily): Promise<FontQuartet> {
  if (family === 'serif') {
    return {
      regular: await doc.embedFont(StandardFonts.TimesRoman),
      bold: await doc.embedFont(StandardFonts.TimesRomanBold),
      italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
      boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
    };
  }
  if (family === 'mono') {
    return {
      regular: await doc.embedFont(StandardFonts.Courier),
      bold: await doc.embedFont(StandardFonts.CourierBold),
      italic: await doc.embedFont(StandardFonts.CourierOblique),
      boldItalic: await doc.embedFont(StandardFonts.CourierBoldOblique),
    };
  }
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
}

function pickRunFont(fonts: FontQuartet, run: { bold: boolean; italic: boolean }): PDFFont {
  if (run.bold && run.italic) return fonts.boldItalic;
  if (run.bold) return fonts.bold;
  if (run.italic) return fonts.italic;
  return fonts.regular;
}

interface StyledWordToken {
  text: string;
  font: PDFFont;
  width: number;
}

function wrapRunsIntoLines(
  runs: readonly DocxTextRun[],
  fonts: FontQuartet,
  fontSize: number,
  maxWidth: number,
): StyledWordToken[][] {
  const lines: StyledWordToken[][] = [];
  let currentLine: StyledWordToken[] = [];
  let currentWidth = 0;

  for (const run of runs) {
    const font = pickRunFont(fonts, run);
    const segments = run.text.split('\n');

    for (let sIdx = 0; sIdx < segments.length; sIdx += 1) {
      if (sIdx > 0) {
        lines.push(currentLine);
        currentLine = [];
        currentWidth = 0;
      }

      const words = segments[sIdx].split(/(\s+)/).filter((part) => part.length > 0);
      for (const word of words) {
        const isSpace = /^\s+$/.test(word);
        if (isSpace && currentLine.length === 0) {
          continue;
        }
        const tokenText = isSpace ? ' ' : word;
        const tokenWidth = font.widthOfTextAtSize(tokenText, fontSize);

        if (!isSpace && currentWidth + tokenWidth > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = [];
          currentWidth = 0;
        }

        currentLine.push({ text: tokenText, font, width: tokenWidth });
        currentWidth += tokenWidth;
      }
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  return lines;
}

function wrapPlainTextLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function inspectDocxSummary(bytes: Uint8Array): Promise<DocxSummary> {
  const parsed = await parseDocxArchive(bytes);
  return parsed.summary;
}

export async function convertDocxToPdf(
  bytes: Uint8Array,
  options: WordToPdfOptions,
  onProgress?: (info: WordToPdfProgressInfo) => void,
): Promise<WordToPdfResult> {
  onProgress?.({ percent: 10 });
  const parsed = await parseDocxArchive(bytes);

  const pdfDoc = await PDFDocument.create();
  const fonts = await embedFontQuartet(pdfDoc, options.fontFamily);
  const { width: pageWidth, height: pageHeight } = getPaperDimensions(options.paperSize);
  const margin = getMarginPt(options.marginPreset);
  const contentWidth = Math.max(120, pageWidth - margin * 2);
  const bottomLimit = margin + (options.includePageNumbers ? 24 : 8);

  const inkColor = rgb(0.094, 0.086, 0.082);
  const mutedColor = rgb(0.34, 0.32, 0.29);
  const borderColor = rgb(0.75, 0.72, 0.67);
  const headerFillColor = rgb(0.95, 0.93, 0.9);

  let currentPage: PDFPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  const startNewPage = () => {
    currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    cursorY = pageHeight - margin;
  };

  const ensureVerticalSpace = (neededPt: number) => {
    if (cursorY - neededPt < bottomLimit) {
      startNewPage();
    }
  };

  const drawStyledLines = (
    lines: StyledWordToken[][],
    fontSize: number,
    lineHeight: number,
    align: WordTextAlign,
    indentLeft = 0,
  ) => {
    for (const line of lines) {
      ensureVerticalSpace(lineHeight);
      cursorY -= fontSize;

      const trimmedTokens =
        line.length > 0 && line[line.length - 1].text === ' ' ? line.slice(0, -1) : line;
      // Merge consecutive tokens sharing the same font into a single drawText call
      const mergedSpans: StyledWordToken[] = [];
      for (const tok of trimmedTokens) {
        const last = mergedSpans[mergedSpans.length - 1];
        if (last && last.font === tok.font) {
          const combinedText = last.text + tok.text;
          last.text = combinedText;
          last.width = last.font.widthOfTextAtSize(combinedText, fontSize);
        } else {
          mergedSpans.push({ ...tok });
        }
      }

      const lineWidth = mergedSpans.reduce((sum, span) => sum + span.width, 0);

      let x = margin + indentLeft;
      const available = Math.max(40, contentWidth - indentLeft);
      if (align === 'center') {
        x = margin + indentLeft + Math.max(0, (available - lineWidth) / 2);
      } else if (align === 'right') {
        x = margin + indentLeft + Math.max(0, available - lineWidth);
      }

      for (const span of mergedSpans) {
        currentPage.drawText(span.text, {
          x,
          y: cursorY,
          size: fontSize,
          font: span.font,
          color: inkColor,
        });
        x += span.width;
      }

      cursorY -= lineHeight - fontSize;
    }
  };

  const totalBlocks = Math.max(1, parsed.blocks.length);

  for (let bIdx = 0; bIdx < parsed.blocks.length; bIdx += 1) {
    const block = parsed.blocks[bIdx];
    onProgress?.({
      percent: 15 + Math.round((bIdx / totalBlocks) * 75),
    });

    if (block.type === 'page-break') {
      startNewPage();
      continue;
    }

    if (block.type === 'heading') {
      const fontSize = block.level === 1 ? 20 : block.level === 2 ? 15.5 : 13;
      const lineHeight = fontSize * Math.max(1.2, options.lineSpacing);
      cursorY -= block.level === 1 ? 8 : 5;
      const boldRuns = block.runs.map((r) => ({ ...r, bold: true }));
      const lines = wrapRunsIntoLines(boldRuns, fonts, fontSize, contentWidth);
      drawStyledLines(lines, fontSize, lineHeight, block.align);
      cursorY -= 6;
      continue;
    }

    if (block.type === 'paragraph') {
      const fontSize = 11;
      const lineHeight = fontSize * options.lineSpacing;
      const lines = wrapRunsIntoLines(block.runs, fonts, fontSize, contentWidth);
      drawStyledLines(lines, fontSize, lineHeight, block.align);
      cursorY -= 5;
      continue;
    }

    if (block.type === 'list-item') {
      const fontSize = 11;
      const lineHeight = fontSize * options.lineSpacing;
      const indent = 18 + block.level * 14;
      const marker = block.ordered ? `${block.index}.` : '-';
      const lines = wrapRunsIntoLines(
        block.runs,
        fonts,
        fontSize,
        Math.max(60, contentWidth - indent),
      );

      ensureVerticalSpace(lineHeight);
      currentPage.drawText(marker, {
        x: margin + indent - 12,
        y: cursorY - fontSize,
        size: fontSize,
        font: fonts.bold,
        color: inkColor,
      });
      drawStyledLines(lines, fontSize, lineHeight, 'left', indent);
      cursorY -= 3;
      continue;
    }

    if (block.type === 'table') {
      const colCount = Math.max(
        1,
        block.rows.reduce((max, r) => Math.max(max, r.cells.length), 1),
      );
      const colWidth = contentWidth / colCount;
      const cellFontSize = 10;
      const cellLineHeight = 13;
      const cellPadX = 6;
      const cellPadY = 5;

      cursorY -= 4;

      for (let rIdx = 0; rIdx < block.rows.length; rIdx += 1) {
        const row = block.rows[rIdx];
        const isHeaderRow = rIdx === 0;
        const wrappedCells = Array.from({ length: colCount }, (_, cIdx) => {
          const cell = row.cells[cIdx];
          const font = cell?.bold || isHeaderRow ? fonts.bold : fonts.regular;
          const lines = wrapPlainTextLines(
            cell?.text ?? '',
            font,
            cellFontSize,
            Math.max(24, colWidth - cellPadX * 2),
          );
          return { lines, font };
        });

        const maxLines = wrappedCells.reduce((m, c) => Math.max(m, c.lines.length), 1);
        const rowHeight = maxLines * cellLineHeight + cellPadY * 2;

        ensureVerticalSpace(rowHeight + 4);
        const rowTopY = cursorY;
        const rowBottomY = rowTopY - rowHeight;

        for (let cIdx = 0; cIdx < colCount; cIdx += 1) {
          const cellX = margin + cIdx * colWidth;
          currentPage.drawRectangle({
            x: cellX,
            y: rowBottomY,
            width: colWidth,
            height: rowHeight,
            color: isHeaderRow ? headerFillColor : undefined,
            borderColor,
            borderWidth: 0.75,
          });

          const { lines, font } = wrappedCells[cIdx];
          for (let lIdx = 0; lIdx < lines.length; lIdx += 1) {
            const textY = rowTopY - cellPadY - cellFontSize - lIdx * cellLineHeight;
            if (lines[lIdx]) {
              currentPage.drawText(lines[lIdx], {
                x: cellX + cellPadX,
                y: textY,
                size: cellFontSize,
                font,
                color: inkColor,
              });
            }
          }
        }

        cursorY = rowBottomY;
      }

      cursorY -= 8;
      continue;
    }

    if (block.type === 'image') {
      try {
        const embedded =
          block.mime === 'image/png'
            ? await pdfDoc.embedPng(block.bytes)
            : await pdfDoc.embedJpg(block.bytes);
        const maxImgW = Math.min(contentWidth, 380);
        const maxImgH = 260;
        const scale = Math.min(
          1,
          maxImgW / Math.max(1, embedded.width),
          maxImgH / Math.max(1, embedded.height),
        );
        const drawW = embedded.width * scale;
        const drawH = embedded.height * scale;

        ensureVerticalSpace(drawH + 10);
        cursorY -= drawH;
        currentPage.drawImage(embedded, {
          x: margin + (contentWidth - drawW) / 2,
          y: cursorY,
          width: drawW,
          height: drawH,
        });
        cursorY -= 8;
      } catch {
        // Skip unreadable embedded image without failing document conversion
      }
    }
  }

  const totalPages = pdfDoc.getPageCount();
  if (options.includePageNumbers && totalPages > 0) {
    for (let i = 0; i < totalPages; i += 1) {
      const page = pdfDoc.getPage(i);
      const label = `${i + 1} / ${totalPages}`;
      const labelW = fonts.regular.widthOfTextAtSize(label, 9.5);
      page.drawText(label, {
        x: (pageWidth - labelW) / 2,
        y: Math.max(18, margin * 0.45),
        size: 9.5,
        font: fonts.regular,
        color: mutedColor,
      });
    }
  }

  const outBytes = await pdfDoc.save({ useObjectStreams: true });
  onProgress?.({ percent: 100 });

  return {
    bytes: outBytes,
    pageCount: totalPages,
    summary: parsed.summary,
  };
}
