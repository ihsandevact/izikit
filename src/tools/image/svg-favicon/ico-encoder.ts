export interface IcoPngFrame {
  size: number;
  pngBytes: Uint8Array;
}

/**
 * Encodes one or more PNG frames (e.g. 16x16, 32x32, 48x48) into a standard binary ICO container.
 * Uses the modern PNG-in-ICO format supported by all desktop browsers, Windows, macOS, and Linux.
 */
export function encodePngFramesToIco(frames: readonly IcoPngFrame[]): Uint8Array {
  if (frames.length === 0) {
    throw new Error('At least one PNG frame is required to build an ICO file.');
  }

  const headerSize = 6;
  const dirEntrySize = 16;
  const dataStartOffset = headerSize + frames.length * dirEntrySize;
  const totalBytes = frames.reduce((sum, frame) => sum + frame.pngBytes.length, dataStartOffset);

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  // ICONDIR header
  view.setUint16(0, 0, true); // Reserved
  view.setUint16(2, 1, true); // Type: 1 = ICO
  view.setUint16(4, frames.length, true); // Image count

  let currentOffset = dataStartOffset;
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const dirPos = headerSize + i * dirEntrySize;
    const dimByte = frame.size >= 256 ? 0 : frame.size;

    view.setUint8(dirPos + 0, dimByte); // Width
    view.setUint8(dirPos + 1, dimByte); // Height
    view.setUint8(dirPos + 2, 0); // Color palette
    view.setUint8(dirPos + 3, 0); // Reserved
    view.setUint16(dirPos + 4, 1, true); // Color planes
    view.setUint16(dirPos + 6, 32, true); // Bits per pixel
    view.setUint32(dirPos + 8, frame.pngBytes.length, true); // Image payload size
    view.setUint32(dirPos + 12, currentOffset, true); // Offset from start of file

    out.set(frame.pngBytes, currentOffset);
    currentOffset += frame.pngBytes.length;
  }

  return out;
}
