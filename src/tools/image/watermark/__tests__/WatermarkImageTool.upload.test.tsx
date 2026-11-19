// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WatermarkImageTool from '@/tools/image/watermark/WatermarkImageTool';

const PNG_HEADER_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

const JPEG_HEADER_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

function makeBrowserFile(bytes: Uint8Array, name: string, type: string): File {
  const file = new File([bytes], name, { type });
  if (typeof file.slice(0, 1).arrayBuffer !== 'function') {
    Object.defineProperty(Blob.prototype, 'arrayBuffer', {
      configurable: true,
      value() {
        return new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      },
    });
  }
  return file;
}

describe('WatermarkImageTool upload and mode controls', () => {
  beforeEach(() => {
    let urlCounter = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:test-wm-${++urlCounter}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('accepts a batch of images and switches between Text and Logo watermark modes', async () => {
    const { container } = render(<WatermarkImageTool locale="id" />);
    const mainInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(mainInput).not.toBeNull();

    const img1 = makeBrowserFile(JPEG_HEADER_BYTES, 'katalog-1.jpg', 'image/jpeg');
    const img2 = makeBrowserFile(PNG_HEADER_BYTES, 'katalog-2.png', 'image/png');
    fireEvent.change(mainInput, { target: { files: [img1, img2] } });

    await waitFor(() => {
      expect(screen.getByText('katalog-1.jpg')).toBeTruthy();
      expect(screen.getByText('katalog-2.png')).toBeTruthy();
    });

    const submitBtn = screen.getByRole('button', {
      name: /Beri Watermark 2 gambar/i,
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    // Switch to Logo mode without a logo uploaded yet -> submit disabled
    fireEvent.click(screen.getByRole('button', { name: /Logo \/ Gambar/i }));
    expect(submitBtn.disabled).toBe(true);

    // Upload a valid PNG logo -> submit becomes enabled
    const logoInput = container.querySelector(
      'input[type="file"][data-role="logo-input"]',
    ) as HTMLInputElement;
    expect(logoInput).not.toBeNull();

    const logoFile = makeBrowserFile(PNG_HEADER_BYTES, 'brand-logo.png', 'image/png');
    fireEvent.change(logoInput, { target: { files: [logoFile] } });

    await waitFor(() => {
      expect(screen.getByText('brand-logo.png')).toBeTruthy();
      expect(submitBtn.disabled).toBe(false);
    });
  });

  it('shows an accessible ErrorAlert when a non-image file is uploaded', async () => {
    const { container } = render(<WatermarkImageTool locale="id" />);
    const mainInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    const badFile = makeBrowserFile(
      new TextEncoder().encode('plain text'),
      'catatan.txt',
      'text/plain',
    );
    fireEvent.change(mainInput, { target: { files: [badFile] } });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('catatan.txt');
    });
  });
});
