export type RotationAngle = 0 | 90 | 180 | 270;
export type RotateReorderErrorCode = 'EMPTY_PLAN' | 'OUT_OF_RANGE' | 'ENCRYPTED' | 'CORRUPT';

export class RotateReorderError extends Error {
  readonly code: RotateReorderErrorCode;

  constructor(code: RotateReorderErrorCode, message: string) {
    super(message);
    this.name = 'RotateReorderError';
    this.code = code;
  }
}

export interface PdfPageMetadata {
  pageIndex: number;
  width: number;
  height: number;
  initialRotation: RotationAngle;
}

export interface PagePlanItem {
  sourcePageIndex: number;
  deltaRotation: number;
}

export function normalizeRotation(angleDegrees: number): RotationAngle {
  const snapped = Math.round(angleDegrees / 90) * 90;
  const mod = ((snapped % 360) + 360) % 360;
  return mod as RotationAngle;
}
