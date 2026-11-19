// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WordToPdfTool from '@/tools/pdf/word-to-pdf/WordToPdfTool';

const runWorkerTaskMock = vi.fn();

vi.mock('@/lib/worker-client', () => ({
  runWorkerTask: (...args: unknown[]) => runWorkerTaskMock(...args),
}));

const ZIP_HEADER_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

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

describe('WordToPdfTool upload, document inspection, and layout options', () => {
  afterEach(() => {
    cleanup();
    runWorkerTaskMock.mockReset();
  });

  it('accepts a valid .docx file, displays detected structure counts, and shows PDF layout controls', async () => {
    runWorkerTaskMock.mockResolvedValueOnce({
      wordCount: 340,
      paragraphCount: 12,
      headingCount: 3,
      listItemCount: 5,
      tableCount: 2,
      imageCount: 1,
      previewItems: [
        { kind: 'heading', text: 'Bab 1 Pendahuluan' },
        { kind: 'paragraph', text: 'Latar belakang proyek...' },
      ],
    });

    const { container } = render(<WordToPdfTool locale="id" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    const docxFile = makeBrowserFile(
      ZIP_HEADER_BYTES,
      'proposal-2026.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    fireEvent.change(input, { target: { files: [docxFile] } });

    await waitFor(() => {
      expect(screen.getByText('proposal-2026.docx')).toBeTruthy();
      expect(screen.getByText(/340 kata/i)).toBeTruthy();
      expect(screen.getByText('Bab 1 Pendahuluan')).toBeTruthy();
    });

    const convertBtn = screen.getByRole('button', { name: /Konversi ke PDF/i }) as HTMLButtonElement;
    expect(convertBtn.disabled).toBe(false);
    expect(screen.getByLabelText(/Ukuran kertas/i)).toBeTruthy();
    expect(screen.getByLabelText(/Gaya huruf/i)).toBeTruthy();
  });

  it('displays an accessible ErrorAlert when a non-.docx file is uploaded', async () => {
    const { container } = render(<WordToPdfTool locale="id" />);
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
