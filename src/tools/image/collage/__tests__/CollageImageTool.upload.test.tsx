// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CollageImageTool from '@/tools/image/collage/CollageImageTool';

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

describe('CollageImageTool upload, validation, and reorder flow', () => {
  beforeEach(() => {
    let urlCounter = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:test-collage-${++urlCounter}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('requires at least 2 images, enables submission on 2+, and supports keyboard reorder buttons', async () => {
    const { container } = render(<CollageImageTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    const first = makeBrowserFile(JPEG_HEADER_BYTES, 'foto-a.jpg', 'image/jpeg');
    fireEvent.change(input, { target: { files: [first] } });

    await waitFor(() => {
      expect(screen.getByText('foto-a.jpg')).toBeTruthy();
    });

    const createBtn = screen.getByRole('button', { name: /Buat Kolase/i }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);

    // Add second image using compact dropzone input
    const addMoreInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const second = makeBrowserFile(PNG_HEADER_BYTES, 'foto-b.png', 'image/png');
    fireEvent.change(addMoreInput, { target: { files: [second] } });

    await waitFor(() => {
      expect(screen.getByText('foto-b.png')).toBeTruthy();
      expect(createBtn.disabled).toBe(false);
    });

    // Move first item down
    const moveDownBtn = screen.getByRole('button', { name: /Pindah ke bawah: foto-a\.jpg/i });
    fireEvent.click(moveDownBtn);

    const listItems = screen.getAllByRole('listitem');
    expect(listItems[0].textContent).toContain('foto-b.png');
    expect(listItems[1].textContent).toContain('foto-a.jpg');
  });

  it('shows an accessible ErrorAlert when an unsupported file is uploaded', async () => {
    const { container } = render(<CollageImageTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const badFile = makeBrowserFile(
      new TextEncoder().encode('not an image'),
      'readme.txt',
      'text/plain',
    );
    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('readme.txt');
    });
  });
});
