import { useEffect, useId, useRef, useState } from 'react';
import { validateImageFiles } from '@/lib/file-validation';

export interface SignatureResult {
  imageDataUrl: string;
  imageMime: 'image/png' | 'image/jpeg';
  aspectRatio: number;
  label: string;
}

interface SignaturePadModalProps {
  open: boolean;
  copy: {
    title: string;
    tabDraw: string;
    tabUpload: string;
    drawHint: string;
    inkColorLabel: string;
    clearPad: string;
    insertSignature: string;
    uploadButton: string;
    uploadHint: string;
    emptyPadError: string;
    closeModal: string;
  };
  invalidImageError: string;
  onClose: () => void;
  onConfirm: (result: SignatureResult) => void;
}

const INK_COLORS = ['#181615', '#1F4E79', '#B93815'] as const;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

function measureImageDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 300, height: img.naturalHeight || 120 });
    img.onerror = () => reject(new Error('Could not decode uploaded image'));
    img.src = dataUrl;
  });
}

async function convertWebpToPngDataUrl(file: File): Promise<string> {
  const rawUrl = URL.createObjectURL(file);
  try {
    const dims = await measureImageDataUrl(rawUrl);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('WebP decode failed'));
      img.src = rawUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(rawUrl);
  }
}

export default function SignaturePadModal({
  open,
  copy,
  invalidImageError,
  onClose,
  onConfirm,
}: SignaturePadModalProps) {
  const uploadInputId = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const [tab, setTab] = useState<'draw' | 'upload'>('draw');
  const [inkColor, setInkColor] = useState<string>('#181615');
  const [hasStroke, setHasStroke] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, open]);

  if (!open) return null;

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    setError(null);
    setHasStroke(true);

    const pt = getCanvasPoint(e);
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const pt = getCanvasPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasStroke(false);
    setError(null);
  };

  const confirmDrawnSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) {
      setError(copy.emptyPadError);
      return;
    }
    const imageDataUrl = canvas.toDataURL('image/png');
    onConfirm({
      imageDataUrl,
      imageMime: 'image/png',
      aspectRatio: canvas.width / canvas.height,
      label: copy.tabDraw,
    });
    clearCanvas();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    e.target.value = '';
    if (!selected) return;

    setError(null);
    try {
      const { accepted, errors: validationErrors } = await validateImageFiles([selected], {
        tooLarge: invalidImageError,
        notImage: invalidImageError,
        generic: invalidImageError,
      });
      if (validationErrors.length > 0 || accepted.length === 0) {
        setError(invalidImageError);
        return;
      }

      const { file, mime } = accepted[0];
      let imageDataUrl: string;
      let finalMime: 'image/png' | 'image/jpeg';

      if (mime === 'image/webp') {
        imageDataUrl = await convertWebpToPngDataUrl(file);
        finalMime = 'image/png';
      } else {
        imageDataUrl = await blobToDataUrl(file);
        finalMime = mime === 'image/png' ? 'image/png' : 'image/jpeg';
      }

      const dims = await measureImageDataUrl(imageDataUrl);
      onConfirm({
        imageDataUrl,
        imageMime: finalMime,
        aspectRatio: Math.max(0.25, Math.min(6, dims.width / Math.max(1, dims.height))),
        label: file.name,
      });
    } catch {
      setError(invalidImageError);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-[var(--border-control)] bg-[var(--bg-card)] p-5 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display m-0 text-lg font-bold text-[var(--ink-primary)]">
            {copy.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-3.5 text-xs font-medium"
          >
            {copy.closeModal}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            aria-pressed={tab === 'draw'}
            onClick={() => {
              setTab('draw');
              setError(null);
            }}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border text-sm font-medium ${
              tab === 'draw'
                ? 'border-[var(--accent)] bg-[var(--accent-tint)] font-semibold text-[var(--ink-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-paper)] text-[var(--ink-muted)]'
            }`}
          >
            {copy.tabDraw}
          </button>
          <button
            type="button"
            aria-pressed={tab === 'upload'}
            onClick={() => {
              setTab('upload');
              setError(null);
            }}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border text-sm font-medium ${
              tab === 'upload'
                ? 'border-[var(--accent)] bg-[var(--accent-tint)] font-semibold text-[var(--ink-primary)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-paper)] text-[var(--ink-muted)]'
            }`}
          >
            {copy.tabUpload}
          </button>
        </div>

        {error && (
          <p role="alert" className="m-0 rounded-lg bg-[var(--danger)]/10 px-3 py-2 text-xs font-medium text-[var(--danger)]">
            {error}
          </p>
        )}

        {tab === 'draw' ? (
          <div className="space-y-3">
            <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.drawHint}</p>

            <div className="overflow-hidden rounded-lg border border-dashed border-[var(--border-control)] bg-white">
              <canvas
                ref={canvasRef}
                width={520}
                height={190}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="block h-44 w-full touch-none cursor-crosshair"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--ink-muted)]">
                  {copy.inkColorLabel}:
                </span>
                {INK_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`${copy.inkColorLabel}: ${hex}`}
                    aria-pressed={inkColor === hex}
                    onClick={() => setInkColor(hex)}
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border bg-[var(--bg-paper)] ${
                      inkColor === hex
                        ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40'
                        : 'border-[var(--border-control)]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-5 w-5 rounded-full border border-[var(--border-control)]"
                      style={{ backgroundColor: hex }}
                    />
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-xs font-medium"
                >
                  {copy.clearPad}
                </button>
                <button
                  type="button"
                  onClick={confirmDrawnSignature}
                  className="btn-primary inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-semibold"
                >
                  {copy.insertSignature}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-dashed border-[var(--border-control)] bg-[var(--bg-paper)] p-6 text-center">
            <p className="m-0 text-xs text-[var(--ink-muted)]">{copy.uploadHint}</p>
            <input
              id={uploadInputId}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={handleImageUpload}
              className="sr-only"
            />
            <label
              htmlFor={uploadInputId}
              className="btn-primary inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-5 text-sm font-semibold"
            >
              {copy.uploadButton}
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
