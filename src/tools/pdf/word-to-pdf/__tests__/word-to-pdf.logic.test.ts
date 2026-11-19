import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from 'pdf-lib';
import {
  normalizeWordTextForPdf,
  parseDocxArchive,
  WordToPdfError,
  type WordToPdfOptions,
} from '@/tools/pdf/word-to-pdf/docx-parser';
import { convertDocxToPdf } from '@/tools/pdf/word-to-pdf/word-to-pdf.logic';

// Minimal valid 1x1 PNG
const TINY_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function buildSampleDocx(options?: {
  extraParagraphCount?: number;
  withImage?: boolean;
}): Promise<Uint8Array> {
  const zip = new JSZip();

  const extraParas = Array.from({ length: options?.extraParagraphCount ?? 0 }, (_, idx) => {
    return `<w:p><w:r><w:t>Paragraf tambahan nomor ${idx + 1} untuk menguji pembagian halaman otomatis pada dokumen panjang.</w:t></w:r></w:p>`;
  }).join('');

  const imageParagraph = options?.withImage
    ? `<w:p><w:r><w:drawing><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rIdImg1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></w:drawing></w:r></w:p>`
    : '';

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr>
      <w:r><w:t>Laporan Keuangan 2026</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t xml:space="preserve">Ringkasan eksekutif dengan </w:t></w:r>
      <w:r><w:rPr><w:b/></w:rPr><w:t>teks tebal</w:t></w:r>
      <w:r><w:t xml:space="preserve"> dan </w:t></w:r>
      <w:r><w:rPr><w:i/></w:rPr><w:t>cetak miring</w:t></w:r>
      <w:r><w:t>.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Butir daftar pertama</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Butir daftar kedua</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Kategori</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Nilai</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Operasional</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Rp 15.000.000</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    ${imageParagraph}
    ${extraParas}
  </w:body>
</w:document>`;

  zip.file('word/document.xml', documentXml);

  if (options?.withImage) {
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`,
    );
    zip.file('word/media/image1.png', TINY_PNG_BYTES);
  }

  return zip.generateAsync({ type: 'uint8array' });
}

function extractAllPdfTextStrings(doc: PDFDocument): string[] {
  const texts: string[] = [];
  const decoder = new TextDecoder('latin1');

  for (let p = 0; p < doc.getPageCount(); p += 1) {
    const page = doc.getPage(p);
    const contents = page.node.lookup(PDFName.of('Contents'));
    const streams: PDFRawStream[] = [];
    if (contents instanceof PDFRawStream) {
      streams.push(contents);
    } else if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i += 1) {
        const entry = doc.context.lookup(contents.get(i));
        if (entry instanceof PDFRawStream) streams.push(entry);
      }
    }

    const combined = streams
      .map((s) => decoder.decode(decodePDFRawStream(s).decode()))
      .join('\n');

    const hexRegex = /<([0-9A-Fa-f]+)>\s*Tj/g;
    let match: RegExpExecArray | null;
    while ((match = hexRegex.exec(combined)) !== null) {
      const hex = match[1];
      let text = '';
      for (let i = 0; i < hex.length; i += 2) {
        text += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
      }
      texts.push(text);
    }
  }
  return texts;
}

function makeDefaultOptions(overrides: Partial<WordToPdfOptions> = {}): WordToPdfOptions {
  return {
    paperSize: 'a4',
    marginPreset: 'normal',
    fontFamily: 'sans',
    lineSpacing: 1.35,
    includePageNumbers: true,
    ...overrides,
  };
}

describe('docx-parser and word-to-pdf.logic', () => {
  it('normalizes Word smart typography and strips unsupported non-WinAnsi characters safely', () => {
    const normalized = normalizeWordTextForPdf('“Kutipan” — bagian\u00A01 … 🚀');
    expect(normalized).toContain('"Kutipan"');
    expect(normalized).not.toContain('🚀');
  });

  it('parses headings, styled runs, lists, tables, and embedded images from a real .docx archive', async () => {
    const docxBytes = await buildSampleDocx({ withImage: true });
    const parsed = await parseDocxArchive(docxBytes);

    expect(parsed.summary.headingCount).toBe(1);
    expect(parsed.summary.tableCount).toBe(1);
    expect(parsed.summary.listItemCount).toBe(2);
    expect(parsed.summary.imageCount).toBe(1);
    expect(parsed.summary.wordCount).toBeGreaterThan(10);

    const heading = parsed.blocks.find((b) => b.type === 'heading');
    expect(heading?.type === 'heading' && heading.text).toBe('Laporan Keuangan 2026');

    const table = parsed.blocks.find((b) => b.type === 'table');
    expect(table?.type === 'table' && table.rows).toHaveLength(2);
  });

  it('rejects corrupt or non-OpenXML ZIP archives with WordToPdfError(INVALID_DOCX)', async () => {
    const emptyZip = new JSZip();
    emptyZip.file('hello.txt', 'not a word doc');
    const badBytes = await emptyZip.generateAsync({ type: 'uint8array' });

    await expect(parseDocxArchive(badBytes)).rejects.toThrowError(WordToPdfError);
    await expect(parseDocxArchive(badBytes)).rejects.toMatchObject({ code: 'INVALID_DOCX' });
  });

  it('converts a .docx with headings, bold/italic text, lists, tables, and images into a vector PDF', async () => {
    const docxBytes = await buildSampleDocx({ withImage: true });
    const percents: number[] = [];

    const result = await convertDocxToPdf(
      docxBytes,
      makeDefaultOptions({ paperSize: 'a4', fontFamily: 'serif', includePageNumbers: true }),
      (p) => percents.push(p.percent),
    );

    expect(result.pageCount).toBe(1);
    expect(percents.at(-1)).toBe(100);

    const pdfDoc = await PDFDocument.load(result.bytes);
    expect(pdfDoc.getPageCount()).toBe(1);
    const size = pdfDoc.getPage(0).getSize();
    expect(size.width).toBeCloseTo(595.28, 1);
    expect(size.height).toBeCloseTo(841.89, 1);

    const joinedText = extractAllPdfTextStrings(pdfDoc).join(' ');
    expect(joinedText).toContain('Laporan Keuangan 2026');
    expect(joinedText).toContain('teks tebal');
    expect(joinedText).toContain('Butir daftar pertama');
    expect(joinedText).toContain('Operasional');
    expect(joinedText).toContain('Rp 15.000.000');
  });

  it('automatically paginates long .docx documents across multiple Letter-size pages', async () => {
    const longDocxBytes = await buildSampleDocx({ extraParagraphCount: 55 });

    const result = await convertDocxToPdf(
      longDocxBytes,
      makeDefaultOptions({ paperSize: 'letter', marginPreset: 'wide', fontFamily: 'sans' }),
    );

    expect(result.pageCount).toBeGreaterThanOrEqual(2);
    const pdfDoc = await PDFDocument.load(result.bytes);
    expect(pdfDoc.getPageCount()).toBe(result.pageCount);
    expect(pdfDoc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });
});
