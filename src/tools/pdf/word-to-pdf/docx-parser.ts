import JSZip from 'jszip';

export type WordPaperSize = 'a4' | 'letter';
export type WordMarginPreset = 'normal' | 'narrow' | 'wide';
export type WordFontFamily = 'sans' | 'serif' | 'mono';
export type WordTextAlign = 'left' | 'center' | 'right';

export type WordToPdfErrorCode = 'INVALID_DOCX' | 'EMPTY_DOCUMENT' | 'INVALID_OPTIONS';

export class WordToPdfError extends Error {
  readonly code: WordToPdfErrorCode;

  constructor(code: WordToPdfErrorCode, message: string) {
    super(message);
    this.name = 'WordToPdfError';
    this.code = code;
  }
}

export interface WordToPdfOptions {
  paperSize: WordPaperSize;
  marginPreset: WordMarginPreset;
  fontFamily: WordFontFamily;
  lineSpacing: number;
  includePageNumbers: boolean;
}

export interface DocxTextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface DocxHeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3;
  align: WordTextAlign;
  text: string;
  runs: DocxTextRun[];
}

export interface DocxParagraphBlock {
  type: 'paragraph';
  align: WordTextAlign;
  text: string;
  runs: DocxTextRun[];
}

export interface DocxListItemBlock {
  type: 'list-item';
  ordered: boolean;
  index: number;
  level: number;
  text: string;
  runs: DocxTextRun[];
}

export interface DocxTableCell {
  text: string;
  bold: boolean;
}

export interface DocxTableRow {
  cells: DocxTableCell[];
}

export interface DocxTableBlock {
  type: 'table';
  rows: DocxTableRow[];
}

export interface DocxImageBlock {
  type: 'image';
  mime: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
}

export interface DocxPageBreakBlock {
  type: 'page-break';
}

export type DocxBlock =
  | DocxHeadingBlock
  | DocxParagraphBlock
  | DocxListItemBlock
  | DocxTableBlock
  | DocxImageBlock
  | DocxPageBreakBlock;

export interface DocxPreviewItem {
  kind: 'heading' | 'paragraph' | 'list' | 'table' | 'image';
  text: string;
}

export interface DocxSummary {
  wordCount: number;
  paragraphCount: number;
  headingCount: number;
  listItemCount: number;
  tableCount: number;
  imageCount: number;
  previewItems: DocxPreviewItem[];
}

export interface ParsedDocxDocument {
  blocks: DocxBlock[];
  summary: DocxSummary;
}

export function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Normalizes Word typography (smart quotes, em/en dashes, NBSP, ellipsis) and
 * filters out glyphs outside standard PDF Latin-1 / WinAnsi encoding.
 */
export function normalizeWordTextForPdf(input: string): string {
  const replaced = input
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2002\u2003\u2009]/g, ' ')
    .replace(/[\u2022\u25CF\u25AA\u25E6]/g, '-');

  let clean = '';
  for (const ch of replaced) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (code === 0x09) {
      clean += '    ';
    } else if (code === 0x0a) {
      clean += '\n';
    } else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      clean += ch;
    }
  }
  return clean;
}

function parseAlignment(pPrXml: string): WordTextAlign {
  const match = /<w:jc\b[^>]*w:val="([^"]+)"/.exec(pPrXml);
  const val = match?.[1]?.toLowerCase();
  if (val === 'center') return 'center';
  if (val === 'right' || val === 'end') return 'right';
  return 'left';
}

function parseHeadingLevel(pPrXml: string): 1 | 2 | 3 | null {
  const match = /<w:pStyle\b[^>]*w:val="([^"]+)"/.exec(pPrXml);
  const style = match?.[1] ?? '';
  if (/^(Title|Heading1|1)$/i.test(style)) return 1;
  if (/^(Subtitle|Heading2|2)$/i.test(style)) return 2;
  if (/^(Heading[3-6]|[3-6])$/i.test(style)) return 3;
  return null;
}

function isEnabledToggleTag(rPrXml: string, tagName: string): boolean {
  const regex = new RegExp(`<w:${tagName}\\b([^>]*)\/?>`);
  const match = regex.exec(rPrXml);
  if (!match) return false;
  const attrs = match[1] ?? '';
  if (/w:val="(false|0|none)"/i.test(attrs)) return false;
  return true;
}

function extractRunsFromParagraph(pXml: string): {
  runs: DocxTextRun[];
  embeddedRIds: string[];
  hasPageBreak: boolean;
} {
  const runs: DocxTextRun[] = [];
  const embeddedRIds: string[] = [];
  let hasPageBreak = /<w:br\b[^>]*w:type="page"/.test(pXml) || /<w:lastRenderedPageBreak\b/.test(pXml);

  const blipRegex = /<a:blip\b[^>]*r:embed="([^"]+)"/g;
  let blipMatch: RegExpExecArray | null;
  while ((blipMatch = blipRegex.exec(pXml)) !== null) {
    embeddedRIds.push(blipMatch[1]);
  }

  const runRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let runMatch: RegExpExecArray | null;
  while ((runMatch = runRegex.exec(pXml)) !== null) {
    const rBody = runMatch[1];
    if (/<w:br\b[^>]*w:type="page"/.test(rBody)) {
      hasPageBreak = true;
    }

    const rPrMatch = /<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/.exec(rBody);
    const rPr = rPrMatch?.[1] ?? '';
    const bold = isEnabledToggleTag(rPr, 'b');
    const italic = isEnabledToggleTag(rPr, 'i');
    const underline = isEnabledToggleTag(rPr, 'u');

    const pieces: string[] = [];
    const tokenRegex = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b(?![^>]*w:type="page")[^>]*\/?>/g;
    let tok: RegExpExecArray | null;
    while ((tok = tokenRegex.exec(rBody)) !== null) {
      if (tok[0].startsWith('<w:tab')) {
        pieces.push('    ');
      } else if (tok[0].startsWith('<w:br')) {
        pieces.push('\n');
      } else if (tok[1] !== undefined) {
        pieces.push(normalizeWordTextForPdf(decodeXmlEntities(tok[1])));
      }
    }

    const combined = pieces.join('');
    if (combined.length > 0) {
      runs.push({ text: combined, bold, italic, underline });
    }
  }

  return { runs, embeddedRIds, hasPageBreak };
}

function parseRelationships(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const relRegex = /<Relationship\b([^>]*)\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = relRegex.exec(relsXml)) !== null) {
    const attrs = match[1];
    const idMatch = /\bId="([^"]+)"/.exec(attrs);
    const targetMatch = /\bTarget="([^"]+)"/.exec(attrs);
    if (idMatch && targetMatch) {
      map.set(idMatch[1], targetMatch[1]);
    }
  }
  return map;
}

function detectEmbeddedImageMime(path: string, bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

export async function parseDocxArchive(bytes: Uint8Array): Promise<ParsedDocxDocument> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new WordToPdfError('INVALID_DOCX', 'File is not a valid .docx ZIP archive.');
  }

  const docEntry = zip.file('word/document.xml');
  if (!docEntry) {
    throw new WordToPdfError('INVALID_DOCX', 'Archive is missing word/document.xml.');
  }

  const documentXml = await docEntry.async('string');
  const relsEntry = zip.file('word/_rels/document.xml.rels');
  const relsMap = relsEntry ? parseRelationships(await relsEntry.async('string')) : new Map<string, string>();

  const bodyMatch = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(documentXml);
  const bodyXml = bodyMatch ? bodyMatch[1] : documentXml;

  const blocks: DocxBlock[] = [];
  const previewItems: DocxPreviewItem[] = [];

  let wordCount = 0;
  let paragraphCount = 0;
  let headingCount = 0;
  let listItemCount = 0;
  let tableCount = 0;
  let imageCount = 0;

  const listCounters = new Map<string, number>();

  // Match top-level <w:tbl> or <w:p> inside <w:body>
  const topBlockRegex = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = topBlockRegex.exec(bodyXml)) !== null) {
    const token = blockMatch[0];

    if (token.startsWith('<w:tbl')) {
      const rows: DocxTableRow[] = [];
      const rowRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
      let trMatch: RegExpExecArray | null;
      while ((trMatch = rowRegex.exec(token)) !== null) {
        const trXml = trMatch[1];
        const cells: DocxTableCell[] = [];
        const tcRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
        let tcMatch: RegExpExecArray | null;
        while ((tcMatch = tcRegex.exec(trXml)) !== null) {
          const tcXml = tcMatch[1];
          const cellParas: string[] = [];
          let anyBold = false;
          const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
          let pMatch: RegExpExecArray | null;
          while ((pMatch = pRegex.exec(tcXml)) !== null) {
            const { runs } = extractRunsFromParagraph(pMatch[1]);
            if (runs.some((r) => r.bold)) anyBold = true;
            const line = runs.map((r) => r.text).join('').trim();
            if (line) cellParas.push(line);
          }
          const cellText = cellParas.join(' ');
          if (cellText) {
            wordCount += cellText.split(/\s+/).filter(Boolean).length;
          }
          cells.push({ text: cellText, bold: anyBold });
        }
        if (cells.length > 0) {
          rows.push({ cells });
        }
      }

      if (rows.length > 0) {
        tableCount += 1;
        blocks.push({ type: 'table', rows });
        if (previewItems.length < 18) {
          const firstRowPreview = rows[0].cells.map((c) => c.text).join(' | ');
          previewItems.push({
            kind: 'table',
            text: `${rows.length}×${rows[0].cells.length}: ${firstRowPreview}`,
          });
        }
      }
      continue;
    }

    // Paragraph <w:p>
    const pPrMatch = /<w:pPr\b[^>]*>([\s\S]*?)<\/w:pPr>/.exec(token);
    const pPr = pPrMatch?.[1] ?? '';
    const align = parseAlignment(pPr);
    const headingLevel = parseHeadingLevel(pPr);
    const numIdMatch = /<w:numId\b[^>]*w:val="([^"]+)"/.exec(pPr);
    const ilvlMatch = /<w:ilvl\b[^>]*w:val="([^"]+)"/.exec(pPr);

    const { runs, embeddedRIds, hasPageBreak } = extractRunsFromParagraph(token);
    const fullText = runs.map((r) => r.text).join('').trim();

    if (fullText) {
      wordCount += fullText.split(/\s+/).filter(Boolean).length;

      if (headingLevel !== null) {
        headingCount += 1;
        blocks.push({
          type: 'heading',
          level: headingLevel,
          align,
          text: fullText,
          runs,
        });
        if (previewItems.length < 18) {
          previewItems.push({ kind: 'heading', text: fullText });
        }
      } else if (numIdMatch) {
        listItemCount += 1;
        const numId = numIdMatch[1];
        const level = Number.parseInt(ilvlMatch?.[1] ?? '0', 10) || 0;
        const key = `${numId}:${level}`;
        const nextIdx = (listCounters.get(key) ?? 0) + 1;
        listCounters.set(key, nextIdx);
        const ordered = Number.parseInt(numId, 10) % 2 === 0;
        blocks.push({
          type: 'list-item',
          ordered,
          index: nextIdx,
          level: Math.min(3, Math.max(0, level)),
          text: fullText,
          runs,
        });
        if (previewItems.length < 18) {
          previewItems.push({ kind: 'list', text: fullText });
        }
      } else {
        paragraphCount += 1;
        blocks.push({
          type: 'paragraph',
          align,
          text: fullText,
          runs,
        });
        if (previewItems.length < 18) {
          previewItems.push({ kind: 'paragraph', text: fullText });
        }
      }
    }

    for (const rId of embeddedRIds) {
      const target = relsMap.get(rId);
      if (!target) continue;
      const normalizedPath = target.startsWith('word/')
        ? target
        : `word/${target.replace(/^\/+/, '')}`;
      const mediaFile = zip.file(normalizedPath);
      if (!mediaFile) continue;
      const imgBytes = await mediaFile.async('uint8array');
      const mime = detectEmbeddedImageMime(normalizedPath, imgBytes);
      if (mime) {
        imageCount += 1;
        blocks.push({ type: 'image', mime, bytes: imgBytes });
        if (previewItems.length < 18) {
          previewItems.push({ kind: 'image', text: normalizedPath.split('/').pop() ?? 'image' });
        }
      }
    }

    if (hasPageBreak) {
      blocks.push({ type: 'page-break' });
    }
  }

  return {
    blocks,
    summary: {
      wordCount,
      paragraphCount,
      headingCount,
      listItemCount,
      tableCount,
      imageCount,
      previewItems,
    },
  };
}
