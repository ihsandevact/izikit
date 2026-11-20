// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompressPdfTool from '@/tools/pdf/compress/CompressPdfTool';

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

describe('CompressPdfTool upload and mode controls', () => {
  afterEach(() => {
    cleanup();
    runWorkerTaskMock.mockReset();
  });

  it('accepts a valid PDF, inspects page count, and reveals DPI/quality controls in Strong mode', async () => {
    runWorkerTaskMock.mockResolvedValueOnce({
      pageCount: 6,
      firstPageWidth: 595,
      firstPageHeight: 842,
    });

    const { container } = render(<CompressPdfTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    const pdfFile = makeBrowserFile(PDF_HEADER_BYTES, 'scan-arsip.pdf', 'application/pdf');
    fireEvent.change(input, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByText('scan-arsip.pdf')).toBeTruthy();
      expect(screen.getByText(/6 halaman/i)).toBeTruthy();
    });

    // Initially in lossless mode: DPI control is hidden
    expect(screen.queryByLabelText(/Ketajaman gambar \(DPI\)/i)).toBeNull();

    // Switch to Strong Compression mode: DPI & JPEG quality controls appear with honest warning
    const strongRadio = screen.getByLabelText(/Kompresi Kuat/i);
    fireEvent.click(strongRadio);

    expect(screen.getByLabelText(/Ketajaman gambar \(DPI\)/i)).toBeTruthy();
    expect(screen.getByLabelText(/Kualitas gambar JPEG/i)).toBeTruthy();
    expect(screen.getByText(/teks tidak lagi bisa di-copy/i)).toBeTruthy();
  });

  it('shows an accessible ErrorAlert when an invalid non-PDF file is selected', async () => {
    const { container } = render(<CompressPdfTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const badFile = makeBrowserFile(
      new TextEncoder().encode('hello world'),
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
