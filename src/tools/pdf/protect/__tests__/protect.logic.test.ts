import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import {
  ProtectPdfError,
  validateProtectOptions,
  validateUnlockOptions,
  type ProtectPdfOptions,
} from '@/tools/pdf/protect/plan';
import {
  inspectProtectPdf,
  protectPdfDocument,
  unlockPdfDocument,
} from '@/tools/pdf/protect/protect.logic';

async function createPlainPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([595, 842]);
  p1.drawText('Secret Report Page 1', { x: 40, y: 760, size: 16, font });
  const p2 = doc.addPage([612, 792]);
  p2.drawText('Secret Report Page 2', { x: 40, y: 710, size: 16, font });
  return doc.save();
}

function makeProtectOptions(overrides: Partial<ProtectPdfOptions> = {}): ProtectPdfOptions {
  return {
    userPassword: 'secret-pass-2026',
    confirmPassword: 'secret-pass-2026',
    ownerPassword: '',
    allowPrinting: true,
    allowCopying: false,
    allowModifying: false,
    ...overrides,
  };
}

describe('protect-pdf plan helpers', () => {
  it('validates user password presence, confirmation match, and max length', () => {
    expect(() => validateProtectOptions(makeProtectOptions())).not.toThrow();

    expect(() =>
      validateProtectOptions(makeProtectOptions({ userPassword: '', confirmPassword: '' })),
    ).toThrowError(expect.objectContaining({ code: 'EMPTY_PASSWORD' }));

    expect(() =>
      validateProtectOptions(
        makeProtectOptions({ userPassword: 'abc', confirmPassword: 'xyz' }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'PASSWORD_MISMATCH' }));

    expect(() =>
      validateProtectOptions(
        makeProtectOptions({
          userPassword: 'a'.repeat(130),
          confirmPassword: 'a'.repeat(130),
        }),
      ),
    ).toThrowError(ProtectPdfError);
  });

  it('validates unlock options allowing empty password only for owner-locked PDFs when permitted', () => {
    expect(() => validateUnlockOptions({ password: 'correct-password' })).not.toThrow();
    expect(() => validateUnlockOptions({ password: '' })).not.toThrow();
    expect(() => validateUnlockOptions({ password: 'a'.repeat(130) })).toThrowError(
      expect.objectContaining({ code: 'INVALID_OPTIONS' }),
    );
  });
});

describe('protect.logic AES-256 encrypt & decrypt round-trip', () => {
  it('inspects plain PDFs as unencrypted and rejects corrupt PDFs', async () => {
    const plain = await createPlainPdf();
    await expect(inspectProtectPdf(plain)).resolves.toEqual({
      isEncrypted: false,
      pageCount: 2,
    });

    const corrupt = new TextEncoder().encode('%PDF-1.7 broken body');
    await expect(inspectProtectPdf(corrupt)).rejects.toMatchObject({ code: 'CORRUPT' });
  });

  it('encrypts a PDF with AES-256, detects encryption on inspect, rejects wrong password, and unlocks cleanly with right password', async () => {
    const plain = await createPlainPdf();
    const protectPercents: number[] = [];

    const protectedResult = await protectPdfDocument(
      plain,
      makeProtectOptions({
        userPassword: 'izikit-secret-99',
        confirmPassword: 'izikit-secret-99',
        allowPrinting: true,
        allowCopying: false,
        allowModifying: false,
      }),
      (info) => protectPercents.push(info.percent),
    );

    expect(protectedResult.pageCount).toBe(2);
    expect(protectPercents.at(-1)).toBe(100);

    // Encrypted output must be detected as encrypted and reject re-encryption
    await expect(inspectProtectPdf(protectedResult.bytes)).resolves.toEqual({
      isEncrypted: true,
      pageCount: null,
    });

    await expect(
      protectPdfDocument(protectedResult.bytes, makeProtectOptions()),
    ).rejects.toMatchObject({ code: 'ALREADY_ENCRYPTED' });

    // Wrong password must fail cleanly with WRONG_PASSWORD
    await expect(
      unlockPdfDocument(protectedResult.bytes, { password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });

    // Correct password unlocks to a clean unencrypted PDF preserving exact pages & sizes
    const unlockPercents: number[] = [];
    const unlockedResult = await unlockPdfDocument(
      protectedResult.bytes,
      { password: 'izikit-secret-99' },
      (info) => unlockPercents.push(info.percent),
    );

    expect(unlockedResult.pageCount).toBe(2);
    expect(unlockPercents.at(-1)).toBe(100);

    await expect(inspectProtectPdf(unlockedResult.bytes)).resolves.toEqual({
      isEncrypted: false,
      pageCount: 2,
    });

    const reloaded = await PDFDocument.load(unlockedResult.bytes);
    expect(reloaded.isEncrypted).toBe(false);
    expect(reloaded.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    expect(reloaded.getPage(1).getSize()).toEqual({ width: 612, height: 792 });
  });

  it('reports NOT_ENCRYPTED when attempting to unlock an already unlocked PDF', async () => {
    const plain = await createPlainPdf();
    await expect(unlockPdfDocument(plain, { password: '' })).rejects.toMatchObject({
      code: 'NOT_ENCRYPTED',
    });
  });
});
