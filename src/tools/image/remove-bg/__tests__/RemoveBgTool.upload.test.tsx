// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RemoveBgTool from '@/tools/image/remove-bg/RemoveBgTool';

const PNG_HEADER_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
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

describe('RemoveBgTool upload, engine selection, and backdrop options', () => {
  beforeEach(() => {
    let urlCounter = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => `blob:test-rbg-${++urlCounter}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('accepts an image upload, shows AI ONNX and Color Key engines, and provides Indonesian passport backdrop presets', async () => {
    const { container } = render(<RemoveBgTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    const file = makeBrowserFile(PNG_HEADER_BYTES, 'pasfoto.png', 'image/png');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('pasfoto.png')).toBeTruthy();
    });

    expect(screen.getByText(/Model AI Lokal \(ONNX \/ WASM\)/i)).toBeTruthy();
    expect(screen.getByText(/Warna Polos \/ Studio/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Merah Pasfoto/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Biru Pasfoto/i })).toBeTruthy();

    // Switch to Color Key mode -> tolerance slider appears
    fireEvent.click(screen.getByLabelText(/Warna Polos \/ Studio/i));
    expect(screen.getByLabelText(/Toleransi warna/i)).toBeTruthy();
  });

  it('shows an accessible ErrorAlert when an unsupported file is uploaded', async () => {
    const { container } = render(<RemoveBgTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const badFile = makeBrowserFile(
      new TextEncoder().encode('plain text'),
      'dokumen.txt',
      'text/plain',
    );
    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('dokumen.txt');
    });
  });
});
