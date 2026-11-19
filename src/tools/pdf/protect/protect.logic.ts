import { PDFDocument } from '@cantoo/pdf-lib';
import {
  ProtectPdfError,
  validateProtectOptions,
  validateUnlockOptions,
  type ProtectPdfOptions,
  type UnlockPdfOptions,
} from './plan';

export * from './plan';

export interface ProtectPdfInspectInfo {
  isEncrypted: boolean;
  pageCount: number | null;
}

export interface ProtectProgressInfo {
  percent: number;
}

export interface ProtectPdfResult {
  bytes: Uint8Array;
  pageCount: number;
}

function isEncryptionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /encrypt|password|decrypt|auth/i.test(message);
}

export async function inspectProtectPdf(bytes: Uint8Array): Promise<ProtectPdfInspectInfo> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const pageCount = doc.getPageCount();
    if (pageCount < 1) {
      throw new ProtectPdfError('CORRUPT', 'PDF document contains zero pages.');
    }
    return {
      isEncrypted: doc.isEncrypted,
      pageCount,
    };
  } catch (err) {
    if (err instanceof ProtectPdfError) {
      throw err;
    }
    if (isEncryptionError(err)) {
      return {
        isEncrypted: true,
        pageCount: null,
      };
    }
    throw new ProtectPdfError(
      'CORRUPT',
      err instanceof Error ? err.message : 'PDF document appears damaged or unreadable.',
    );
  }
}

export async function protectPdfDocument(
  bytes: Uint8Array,
  options: ProtectPdfOptions,
  onProgress?: (info: ProtectProgressInfo) => void,
): Promise<ProtectPdfResult> {
  validateProtectOptions(options);
  onProgress?.({ percent: 15 });

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const pageCount = doc.getPageCount();
    if (pageCount < 1) {
      throw new ProtectPdfError('CORRUPT', 'PDF document contains zero pages.');
    }
    if (doc.isEncrypted) {
      throw new ProtectPdfError(
        'ALREADY_ENCRYPTED',
        'PDF is already encrypted. Unlock it first before applying a new password.',
      );
    }
  } catch (err) {
    if (err instanceof ProtectPdfError) {
      throw err;
    }
    if (isEncryptionError(err)) {
      throw new ProtectPdfError(
        'ALREADY_ENCRYPTED',
        'PDF is already password-protected. Unlock it first before setting a new password.',
      );
    }
    throw new ProtectPdfError(
      'CORRUPT',
      err instanceof Error ? err.message : 'PDF document appears damaged or unreadable.',
    );
  }

  onProgress?.({ percent: 50 });

  const ownerPassword = options.ownerPassword?.trim() || options.userPassword;
  doc.encrypt({
    userPassword: options.userPassword,
    ownerPassword,
    algorithm: 'AES-256',
    permissions: {
      printing: options.allowPrinting ? 'highResolution' : false,
      copying: options.allowCopying,
      modifying: options.allowModifying,
      annotating: options.allowModifying,
      fillingForms: options.allowModifying,
      documentAssembly: options.allowModifying,
      contentAccessibility: true,
    },
  });

  const outBytes = await doc.save({ useObjectStreams: true });
  onProgress?.({ percent: 100 });

  return {
    bytes: outBytes,
    pageCount: doc.getPageCount(),
  };
}

export async function unlockPdfDocument(
  bytes: Uint8Array,
  options: UnlockPdfOptions,
  onProgress?: (info: ProtectProgressInfo) => void,
): Promise<ProtectPdfResult> {
  validateUnlockOptions(options);
  onProgress?.({ percent: 15 });

  const inspected = await inspectProtectPdf(bytes);
  if (!inspected.isEncrypted) {
    throw new ProtectPdfError('NOT_ENCRYPTED', 'This PDF document is not encrypted.');
  }

  onProgress?.({ percent: 30 });

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, {
      password: options.password,
      updateMetadata: false,
    });
    const pageCount = doc.getPageCount();
    if (pageCount < 1) {
      throw new ProtectPdfError('CORRUPT', 'PDF document contains zero pages.');
    }
  } catch (err) {
    if (err instanceof ProtectPdfError) {
      throw err;
    }
    if (isEncryptionError(err)) {
      throw new ProtectPdfError(
        'WRONG_PASSWORD',
        'Incorrect password. Check your password and try again.',
      );
    }
    throw new ProtectPdfError(
      'CORRUPT',
      err instanceof Error ? err.message : 'PDF document appears damaged or unreadable.',
    );
  }

  onProgress?.({ percent: 65 });

  // Copy all decrypted pages into a fresh document so no Encrypt trailer or security context persists.
  const outDoc = await PDFDocument.create();
  const pageCount = doc.getPageCount();
  const indices = Array.from({ length: pageCount }, (_, i) => i);
  const copiedPages = await outDoc.copyPages(doc, indices);
  for (const page of copiedPages) {
    outDoc.addPage(page);
  }

  const title = doc.getTitle();
  const author = doc.getAuthor();
  const subject = doc.getSubject();
  if (title) outDoc.setTitle(title);
  if (author) outDoc.setAuthor(author);
  if (subject) outDoc.setSubject(subject);

  const outBytes = await outDoc.save({ useObjectStreams: true });
  onProgress?.({ percent: 100 });

  return {
    bytes: outBytes,
    pageCount,
  };
}
