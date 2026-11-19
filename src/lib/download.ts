export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

export interface ZipEntry {
  filename: string;
  blob: Blob;
}

/**
 * Lazy-loads JSZip only when the user exports a batch archive,
 * keeping initial tool load lightweight.
 */
export async function downloadAsZip(entries: ZipEntry[], zipFilename: string): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const usedNames = new Map<string, number>();

  for (const entry of entries) {
    let name = entry.filename;
    const seen = usedNames.get(name.toLowerCase()) ?? 0;
    if (seen > 0) {
      const dotIndex = name.lastIndexOf('.');
      if (dotIndex > 0) {
        name = `${name.slice(0, dotIndex)}-${seen + 1}${name.slice(dotIndex)}`;
      } else {
        name = `${name}-${seen + 1}`;
      }
    }
    usedNames.set(entry.filename.toLowerCase(), seen + 1);
    zip.file(name, entry.blob);
  }

  const archiveBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE', // Images/PDFs are already compressed; STORE is instant and saves CPU
  });

  downloadBlob(archiveBlob, zipFilename);
}
