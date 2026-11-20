// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditPdfTool from '@/tools/pdf/edit/EditPdfTool';

const runWorkerTaskMock = vi.fn();

vi.mock('@/lib/worker-client', () => ({
  runWorkerTask: (...args: unknown[]) => runWorkerTaskMock(...args),
}));

vi.mock('@/tools/pdf/edit/page-renderer', () => ({
  renderSinglePdfPagePreview: vi.fn().mockResolvedValue({
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    widthPt: 595,
    heightPt: 842,
  }),
  flattenRedactedPdfPages: vi.fn().mockResolvedValue([]),
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

describe('EditPdfTool upload and annotation workflow', () => {
  afterEach(() => {
    cleanup();
    runWorkerTaskMock.mockReset();
  });

  it('uploads a PDF, allows adding a text annotation, enables Save, and supports Undo', async () => {
    runWorkerTaskMock.mockResolvedValueOnce({
      pageCount: 2,
      pageSizes: [
        { width: 595, height: 842 },
        { width: 595, height: 842 },
      ],
    });

    const { container } = render(<EditPdfTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pdfFile = makeBrowserFile(PDF_HEADER_BYTES, 'surat.pdf', 'application/pdf');
    fireEvent.change(input, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByText('surat.pdf')).toBeTruthy();
      expect(screen.getByText(/Halaman 1 \/ 2/i)).toBeTruthy();
    });

    const saveBtn = screen.getByRole('button', {
      name: /^Simpan PDF$/i,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    // Switch to Add Text tool and insert a quick text box
    fireEvent.click(screen.getByRole('button', { name: /^Teks$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tambah teks di tengah halaman/i }));

    await waitFor(() => {
      expect(saveBtn.disabled).toBe(false);
    });

    // Undo removes the annotation and disables Save again
    fireEvent.click(screen.getByRole('button', { name: /Urungkan \(Undo\)/i }));
    expect(saveBtn.disabled).toBe(true);
  });

  it('displays an accessible ErrorAlert when an invalid non-PDF file is uploaded', async () => {
    const { container } = render(<EditPdfTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = makeBrowserFile(
      new TextEncoder().encode('not a pdf'),
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
