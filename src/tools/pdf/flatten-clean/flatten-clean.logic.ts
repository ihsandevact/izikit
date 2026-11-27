import { PDFArray, PDFDocument, PDFName } from 'pdf-lib';
import { loadPdfDocumentOrThrow } from '../shared/pdf-loader';

export type FlattenMode = 'forms-and-metadata' | 'full-raster';

export class FlattenPdfError extends Error {
  readonly code: 'ENCRYPTED' | 'CORRUPT';
  constructor(code: 'ENCRYPTED' | 'CORRUPT', message: string) {
    super(message);
    this.name = 'FlattenPdfError';
    this.code = code;
  }
}

export interface PdfMetadataSummary {
  title: string;
  author: string;
  subject: string;
  creator: string;
  producer: string;
  keywords: string;
}

export interface PdfPrivacyInspection {
  pageCount: number;
  formFieldCount: number;
  annotationCount: number;
  hasXmpMetadata: boolean;
  metadata: PdfMetadataSummary;
  metadataFieldCount: number;
}

export interface FlattenOptions {
  flattenForms: boolean;
  stripMetadata: boolean;
  removeAnnotations: boolean;
}

export interface FlattenResult {
  bytes: Uint8Array;
  pageCount: number;
  flattenedFieldCount: number;
  removedAnnotationCount: number;
  scrubbedMetadataFields: number;
}

export interface RasterizedCleanPage {
  jpegBuffer: ArrayBuffer;
  widthPt: number;
  heightPt: number;
}

function countPageAnnotations(doc: PDFDocument): number {
  let count = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (annots) {
      count += annots.size();
    }
  }
  return count;
}

function readMetadataSummary(doc: PDFDocument): PdfMetadataSummary {
  return {
    title: doc.getTitle()?.trim() ?? '',
    author: doc.getAuthor()?.trim() ?? '',
    subject: doc.getSubject()?.trim() ?? '',
    creator: doc.getCreator()?.trim() ?? '',
    producer: doc.getProducer()?.trim() ?? '',
    keywords: doc.getKeywords()?.trim() ?? '',
  };
}

function countNonEmptyMetadata(meta: PdfMetadataSummary, hasXmp: boolean): number {
  let count = 0;
  if (meta.title) count += 1;
  if (meta.author) count += 1;
  if (meta.subject) count += 1;
  if (meta.creator) count += 1;
  if (meta.producer) count += 1;
  if (meta.keywords) count += 1;
  if (hasXmp) count += 1;
  return count;
}

/**
 * Inspects a PDF to report page count, AcroForm field count, annotations, and hidden metadata.
 */
export async function inspectPdfPrivacy(bytes: Uint8Array): Promise<PdfPrivacyInspection> {
  const doc = await loadPdfDocumentOrThrow(bytes, {
    requireNonEmpty: true,
    createError: (kind, msg) => new FlattenPdfError(kind, msg),
  });

  let formFieldCount = 0;
  try {
    formFieldCount = doc.getForm().getFields().length;
  } catch {
    formFieldCount = 0;
  }

  const annotationCount = countPageAnnotations(doc);
  const hasXmpMetadata = doc.catalog.has(PDFName.of('Metadata'));
  const metadata = readMetadataSummary(doc);
  const metadataFieldCount = countNonEmptyMetadata(metadata, hasXmpMetadata);

  return {
    pageCount: doc.getPageCount(),
    formFieldCount,
    annotationCount,
    hasXmpMetadata,
    metadata,
    metadataFieldCount,
  };
}

/**
 * Flattens interactive AcroForm fields, optionally removes annotations, and scrubs
 * document Info + XMP metadata while preserving crisp vector text.
 */
export async function flattenFormsAndScrubPdf(
  bytes: Uint8Array,
  options: FlattenOptions,
): Promise<FlattenResult> {
  const doc = await loadPdfDocumentOrThrow(bytes, {
    requireNonEmpty: true,
    createError: (kind, msg) => new FlattenPdfError(kind, msg),
  });

  let flattenedFieldCount = 0;
  if (options.flattenForms) {
    try {
      const form = doc.getForm();
      const fields = form.getFields();
      flattenedFieldCount = fields.length;
      if (flattenedFieldCount > 0) {
        form.flatten();
      }
    } catch {
      // PDF has no valid AcroForm dictionary; skip gracefully
    }
  }

  let removedAnnotationCount = 0;
  if (options.removeAnnotations) {
    for (const page of doc.getPages()) {
      const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
      if (annots && annots.size() > 0) {
        removedAnnotationCount += annots.size();
        page.node.delete(PDFName.of('Annots'));
      }
    }
  }

  let scrubbedMetadataFields = 0;
  if (options.stripMetadata) {
    const beforeHasXmp = doc.catalog.has(PDFName.of('Metadata'));
    const beforeMeta = readMetadataSummary(doc);
    scrubbedMetadataFields = countNonEmptyMetadata(beforeMeta, beforeHasXmp);

    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setCreator('');
    doc.setProducer('');
    doc.setKeywords([]);

    if (beforeHasXmp) {
      doc.catalog.delete(PDFName.of('Metadata'));
    }
    // Remove Info dictionary reference from trailer if present
    if (doc.context.trailerInfo.Info) {
      delete doc.context.trailerInfo.Info;
    }
  }

  const outBytes = await doc.save({ useObjectStreams: true });
  return {
    bytes: outBytes,
    pageCount: doc.getPageCount(),
    flattenedFieldCount,
    removedAnnotationCount,
    scrubbedMetadataFields,
  };
}

/**
 * Builds a brand-new, completely uneditable PDF from rasterized page JPEG images
 * with zero metadata, zero forms, and zero annotations.
 */
export async function buildRasterizedCleanPdf(
  pages: readonly RasterizedCleanPage[],
): Promise<Uint8Array> {
  const outDoc = await PDFDocument.create({ updateMetadata: false });
  if (outDoc.context.trailerInfo.Info) {
    delete outDoc.context.trailerInfo.Info;
  }

  for (const item of pages) {
    const jpg = await outDoc.embedJpg(new Uint8Array(item.jpegBuffer));
    const page = outDoc.addPage([item.widthPt, item.heightPt]);
    page.drawImage(jpg, {
      x: 0,
      y: 0,
      width: item.widthPt,
      height: item.heightPt,
    });
  }

  return outDoc.save({ useObjectStreams: true });
}

export function buildFlattenFilename(originalName: string, mode: FlattenMode): string {
  const base = originalName.replace(/\.pdf$/i, '').trim() || 'document';
  const suffix = mode === 'full-raster' ? 'flattened' : 'clean';
  return `${base}-${suffix}.pdf`;
}
