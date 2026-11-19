// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProtectPdfTool from '@/tools/pdf/protect/ProtectPdfTool';

const runWorkerTaskMock = vi.fn();

vi.mock('@/lib/worker-client', () => ({
  runWorkerTask: (...args: unknown[]) => runWorkerTaskMock(...args),
}));

const PDF_HEADER_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3,
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

describe('ProtectPdfTool upload, auto-detection, and password validation', () => {
  afterEach(() => {
    cleanup();
    runWorkerTaskMock.mockReset();
  });

  it('auto-selects Protect mode for an unprotected PDF and validates password confirmation', async () => {
    runWorkerTaskMock.mockResolvedValueOnce({ isEncrypted: false, pageCount: 4 });

    const { container } = render(<ProtectPdfTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pdfFile = makeBrowserFile(PDF_HEADER_BYTES, 'kontrak.pdf', 'application/pdf');
    fireEvent.change(input, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByText('kontrak.pdf')).toBeTruthy();
      expect(screen.getByText(/PDF Tanpa Sandi/i)).toBeTruthy();
    });

    const protectBtn = screen.getByRole('button', {
      name: /Kunci PDF \(AES-256\)/i,
    }) as HTMLButtonElement;
    expect(protectBtn.disabled).toBe(true);

    const passInput = screen.getByLabelText(/Kata sandi buka dokumen/i);
    const confirmInput = screen.getByLabelText(/Ulangi kata sandi/i);

    fireEvent.change(passInput, { target: { value: 'rahasia123' } });
    fireEvent.change(confirmInput, { target: { value: 'berbeda' } });
    expect(protectBtn.disabled).toBe(true);

    fireEvent.change(confirmInput, { target: { value: 'rahasia123' } });
    expect(protectBtn.disabled).toBe(false);
  });

  it('auto-selects Unlock mode when inspecting an encrypted PDF', async () => {
    runWorkerTaskMock.mockResolvedValueOnce({ isEncrypted: true, pageCount: null });

    const { container } = render(<ProtectPdfTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const lockedFile = makeBrowserFile(PDF_HEADER_BYTES, 'slip-gaji.pdf', 'application/pdf');
    fireEvent.change(input, { target: { files: [lockedFile] } });

    await waitFor(() => {
      expect(screen.getByText(/PDF Terkunci/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /Buka Sandi PDF/i })).toBeTruthy();
    });
  });

  it('displays an accessible ErrorAlert when an invalid non-PDF file is uploaded', async () => {
    const { container } = render(<ProtectPdfTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = makeBrowserFile(
      new TextEncoder().encode('plain text'),
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
