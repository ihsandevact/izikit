// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WatermarkPdfTool from '@/tools/pdf/watermark/WatermarkPdfTool';

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

describe('WatermarkPdfTool upload and configuration flow', () => {
  afterEach(() => {
    cleanup();
    runWorkerTaskMock.mockReset();
  });

  it('accepts a valid PDF via file input, inspects page count, and shows live watermark controls', async () => {
    runWorkerTaskMock.mockResolvedValueOnce({ pageCount: 5 });

    const { container } = render(<WatermarkPdfTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    const pdfFile = makeBrowserFile(PDF_HEADER_BYTES, 'proposal.pdf', 'application/pdf');
    fireEvent.change(input, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByText('proposal.pdf')).toBeTruthy();
      expect(screen.getByText(/5 halaman/i)).toBeTruthy();
    });

    const applyButton = screen.getByRole('button', { name: /Terapkan ke PDF/i }) as HTMLButtonElement;
    expect(applyButton.disabled).toBe(false);
  });

  it('displays an accessible ErrorAlert when a non-PDF file is uploaded', async () => {
    const { container } = render(<WatermarkPdfTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    const badFile = makeBrowserFile(
      new TextEncoder().encode('not a pdf document'),
      'catatan.txt',
      'text/plain',
    );
    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('catatan.txt');
    });
  });

  it('prevents submission when both watermark and page numbers are disabled', async () => {
    runWorkerTaskMock.mockResolvedValueOnce({ pageCount: 3 });

    const { container } = render(<WatermarkPdfTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pdfFile = makeBrowserFile(PDF_HEADER_BYTES, 'laporan.pdf', 'application/pdf');
    fireEvent.change(input, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByText('laporan.pdf')).toBeTruthy();
    });

    const watermarkCheckbox = screen.getByLabelText(/Aktifkan watermark teks/i) as HTMLInputElement;
    expect(watermarkCheckbox.checked).toBe(true);
    fireEvent.click(watermarkCheckbox);

    const applyButton = screen.getByRole('button', { name: /Terapkan ke PDF/i }) as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);
  });
});
