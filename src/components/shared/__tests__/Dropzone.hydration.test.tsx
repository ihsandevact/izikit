// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import Dropzone from '@/components/shared/Dropzone';

describe('Dropzone pre-hydration file recovery', () => {
  afterEach(() => {
    cleanup();
  });

  it('recovers files already present on the file input before React hydration completes', async () => {
    const onFilesSelected = vi.fn();

    // Render Dropzone, then simulate a pre-hydrated DOM where input.files was already set
    // by intercepting HTMLInputElement.prototype.files on mount
    const preHydrationFile = new File([new Uint8Array([1, 2, 3])], 'early-upload.png', {
      type: 'image/png',
    });

    const originalFilesDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
    let consumed = false;
    Object.defineProperty(HTMLInputElement.prototype, 'files', {
      configurable: true,
      get() {
        if (this.type === 'file' && !consumed) {
          consumed = true;
          return [preHydrationFile] as unknown as FileList;
        }
        return [] as unknown as FileList;
      },
    });

    try {
      render(
        <Dropzone
          accept="image/png"
          idleLabel="Drop here"
          activeLabel="Release"
          buttonLabel="Select"
          formatsHint="PNG"
          onFilesSelected={onFilesSelected}
        />,
      );

      await waitFor(() => {
        expect(onFilesSelected).toHaveBeenCalledTimes(1);
      });
      expect(onFilesSelected).toHaveBeenCalledWith([preHydrationFile]);
    } finally {
      if (originalFilesDesc) {
        Object.defineProperty(HTMLInputElement.prototype, 'files', originalFilesDesc);
      }
    }
  });
});
