import { describe, expect, it } from 'vitest';
import {
  buildVCardPayload,
  buildWhatsAppPayload,
  buildWifiPayload,
  encodeQrMatrix,
  getContrastRatio,
  normalizeWhatsAppPhone,
  renderQrSvg,
} from '../qr-code.logic';

describe('qr-code.logic', () => {
  it('encodes short text into QR version 1 (21x21) with valid finder patterns', () => {
    const matrix = encodeQrMatrix('https://izikit.web.id', 'L');
    expect(matrix.version).toBeGreaterThanOrEqual(1);
    expect(matrix.size).toBe(matrix.version * 4 + 17);
    expect(matrix.modules).toHaveLength(matrix.size);

    // Top-left 7x7 finder outer border is dark, 5x5 inner ring is light, 3x3 center is dark
    expect(matrix.modules[0][0]).toBe(true);
    expect(matrix.modules[1][1]).toBe(false);
    expect(matrix.modules[3][3]).toBe(true);

    // Top-right finder center
    expect(matrix.modules[3][matrix.size - 4]).toBe(true);
    // Bottom-left finder center
    expect(matrix.modules[matrix.size - 4][3]).toBe(true);
    // Fixed dark module at (8, size - 8)
    expect(matrix.modules[matrix.size - 8][8]).toBe(true);
  });

  it('encodes long vCard payloads into version >= 7 with version info bits', () => {
    const longVcard = buildVCardPayload({
      firstName: 'Budi',
      lastName: 'Santoso',
      organization: 'PT Teknologi Nusantara Digital Indonesia',
      phone: '+6281234567890',
      email: 'budi.santoso@teknologinusantara.co.id',
      website: 'https://izikit.web.id/contact/budi-santoso-profile-card',
    });
    const matrix = encodeQrMatrix(longVcard, 'H');
    expect(matrix.version).toBeGreaterThanOrEqual(7);
    expect(matrix.size).toBe(matrix.version * 4 + 17);
  });

  it('normalizes Indonesian 08 phone numbers for WhatsApp payload', () => {
    expect(normalizeWhatsAppPhone('0812-3456-7890')).toBe('6281234567890');
    expect(normalizeWhatsAppPhone('+62 812 3456 7890')).toBe('6281234567890');
    expect(
      buildWhatsAppPayload({
        phone: '08123456789',
        message: 'Halo izikit!',
      }),
    ).toBe('https://wa.me/628123456789?text=Halo%20izikit!');
  });

  it('escapes special characters in WiFi payload', () => {
    const wifi = buildWifiPayload({
      ssid: 'Kopi;Kita:2026',
      password: 'pass\\word"1',
      encryption: 'WPA',
      hidden: true,
    });
    expect(wifi).toBe('WIFI:T:WPA;S:Kopi\\;Kita\\:2026;P:pass\\\\word\\"1;H:true;;');
  });

  it('renders crisp SVG with foreground, background, and optional logo', () => {
    const matrix = encodeQrMatrix('izikit', 'M');
    const svg = renderQrSvg(matrix, {
      fgColor: '#0B1020',
      bgColor: '#FFFFFF',
      margin: 4,
      moduleStyle: 'square',
      logoDataUrl: 'data:image/png;base64,AAAA',
      logoScale: 0.2,
    });
    expect(svg).toContain('<svg');
    expect(svg).toContain('fill="#0B1020"');
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).toContain('<image href="data:image/png;base64,AAAA"');
  });

  it('computes contrast ratio accurately', () => {
    expect(getContrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(getContrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 1);
  });
});
