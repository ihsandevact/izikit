import { describe, expect, it } from 'vitest';
import { encodePngFramesToIco } from '@/tools/image/svg-favicon/ico-encoder';
import {
  buildFaviconHtmlSnippet,
  buildWebManifestJson,
  normalizeSvgDimensions,
} from '@/tools/image/svg-favicon/favicon-generator.logic';

describe('ico-encoder & favicon-generator.logic', () => {
  it('encodes multi-size PNG frames into a valid binary ICO container', () => {
    const fakePng16 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const fakePng32 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 5, 6, 7, 8, 9, 10]);

    const ico = encodePngFramesToIco([
      { size: 16, pngBytes: fakePng16 },
      { size: 32, pngBytes: fakePng32 },
    ]);

    const view = new DataView(ico.buffer);
    expect(view.getUint16(0, true)).toBe(0); // reserved
    expect(view.getUint16(2, true)).toBe(1); // type ICO
    expect(view.getUint16(4, true)).toBe(2); // 2 frames

    // Frame 0 directory entry (starts at byte 6)
    expect(view.getUint8(6)).toBe(16);
    expect(view.getUint8(7)).toBe(16);
    expect(view.getUint32(14, true)).toBe(fakePng16.length);
    const offset0 = view.getUint32(18, true);
    expect(offset0).toBe(6 + 2 * 16);

    // Frame 1 directory entry (starts at byte 22)
    expect(view.getUint8(22)).toBe(32);
    expect(view.getUint32(30, true)).toBe(fakePng32.length);
    const offset1 = view.getUint32(34, true);
    expect(offset1).toBe(offset0 + fakePng16.length);

    // Verify payload bytes match
    expect(Array.from(ico.slice(offset0, offset0 + fakePng16.length))).toEqual(Array.from(fakePng16));
    expect(Array.from(ico.slice(offset1, offset1 + fakePng32.length))).toEqual(Array.from(fakePng32));
  });

  it('injects numeric width and height into viewBox-only SVGs', () => {
    const normalized = normalizeSvgDimensions('<svg viewBox="0 0 64 32"><rect width="64" height="32"/></svg>', 512);
    expect(normalized).toContain('width="512"');
    expect(normalized).toContain('height="256"');
    expect(() => normalizeSvgDimensions('<div>not svg</div>')).toThrow();
  });

  it('generates valid site.webmanifest JSON and HTML link snippet', () => {
    const manifest = JSON.parse(buildWebManifestJson('izikit', '#0B1020', '#0B1020'));
    expect(manifest.name).toBe('izikit');
    expect(manifest.icons).toHaveLength(2);

    const html = buildFaviconHtmlSnippet('#0B1020');
    expect(html).toContain('/favicon.ico');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('#0B1020');
  });
});
