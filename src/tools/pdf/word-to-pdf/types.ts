export type WordPaperSize = 'a4' | 'letter';
export type WordMarginPreset = 'normal' | 'narrow' | 'wide';
export type WordFontFamily = 'sans' | 'serif' | 'mono';

export interface WordToPdfOptions {
  paperSize: WordPaperSize;
  marginPreset: WordMarginPreset;
  fontFamily: WordFontFamily;
  lineSpacing: number;
  includePageNumbers: boolean;
}

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
