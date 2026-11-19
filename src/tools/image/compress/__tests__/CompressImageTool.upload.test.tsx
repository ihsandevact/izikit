// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompressImageTool from '@/tools/image/compress/CompressImageTool';

const PNG_HEADER_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

const JPEG_HEADER_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

function makeBrowserFile(bytes: Uint8Array, name: string, type: string): File {
  const file = new File([bytes], name, { type });
  // Ensure arrayBuffer works reliably in jsdom File/Blob slices
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

describe('CompressImageTool upload flow', () => {
  beforeEach(() => {
    let urlCounter = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:test-${++urlCounter}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('accepts a PNG selected via file input even when crypto.randomUUID is undefined', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i += 1) arr[i] = (i + 1) & 0xff;
        return arr;
      },
    });

    const { container } = render(<CompressImageTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    const pngFile = makeBrowserFile(PNG_HEADER_BYTES, 'screenshot.png', 'image/png');
    fireEvent.change(input, { target: { files: [pngFile] } });

    await waitFor(() => {
      expect(screen.getByText('screenshot.png')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /Kompres 1 gambar/i })).toBeTruthy();
  });

  it('accepts a JPEG dropped onto the dropzone area', async () => {
    render(<CompressImageTool locale="id" />);
    const dropzoneText = screen.getByText(/Tarik dan lepas file ke sini/i);
    const dropzoneContainer = dropzoneText.closest('div[class*="border-dashed"]') as HTMLElement;
    expect(dropzoneContainer).not.toBeNull();

    const jpgFile = makeBrowserFile(JPEG_HEADER_BYTES, 'liburan.jpg', 'image/jpeg');
    fireEvent.drop(dropzoneContainer, {
      dataTransfer: {
        files: [jpgFile],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('liburan.jpg')).toBeTruthy();
    });
  });

  it('displays a visible ErrorAlert when an unsupported non-image file is uploaded', async () => {
    const { container } = render(<CompressImageTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const badFile = makeBrowserFile(
      new TextEncoder().encode('plain text not an image'),
      'catatan.txt',
      'text/plain',
    );
    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('catatan.txt');
    });
  });
});
