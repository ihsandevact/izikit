export type ProtectPdfMode = 'protect' | 'unlock';

export type ProtectPdfErrorCode =
  | 'CORRUPT'
  | 'ALREADY_ENCRYPTED'
  | 'NOT_ENCRYPTED'
  | 'WRONG_PASSWORD'
  | 'EMPTY_PASSWORD'
  | 'PASSWORD_MISMATCH'
  | 'INVALID_OPTIONS';

export class ProtectPdfError extends Error {
  readonly code: ProtectPdfErrorCode;

  constructor(code: ProtectPdfErrorCode, message: string) {
    super(message);
    this.name = 'ProtectPdfError';
    this.code = code;
  }
}

export interface ProtectPdfOptions {
  userPassword: string;
  confirmPassword: string;
  ownerPassword?: string;
  allowPrinting: boolean;
  allowCopying: boolean;
  allowModifying: boolean;
}

export interface UnlockPdfOptions {
  password: string;
}

const MAX_PASSWORD_LENGTH = 127;

export function validateProtectOptions(options: ProtectPdfOptions): void {
  if (!options.userPassword) {
    throw new ProtectPdfError('EMPTY_PASSWORD', 'Enter a password to protect this PDF.');
  }
  if (options.userPassword.length > MAX_PASSWORD_LENGTH) {
    throw new ProtectPdfError(
      'INVALID_OPTIONS',
      `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }
  if (options.userPassword !== options.confirmPassword) {
    throw new ProtectPdfError('PASSWORD_MISMATCH', 'Passwords do not match.');
  }
  if (options.ownerPassword && options.ownerPassword.length > MAX_PASSWORD_LENGTH) {
    throw new ProtectPdfError(
      'INVALID_OPTIONS',
      `Owner password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }
}

export function validateUnlockOptions(options: UnlockPdfOptions): void {
  if (options.password.length > MAX_PASSWORD_LENGTH) {
    throw new ProtectPdfError(
      'INVALID_OPTIONS',
      `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }
}
