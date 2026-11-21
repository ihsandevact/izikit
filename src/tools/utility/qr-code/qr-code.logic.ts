import { encodeQrMatrix, type QrEccLevel, type QrMatrix } from './qr-encoder';

export type QrPresetMode = 'url' | 'whatsapp' | 'wifi' | 'vcard' | 'text';
export type QrModuleStyle = 'square' | 'rounded';

export interface WifiPayloadInput {
  ssid: string;
  password: string;
  encryption: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
}

export interface WhatsAppPayloadInput {
  phone: string;
  message: string;
}

export interface VCardPayloadInput {
  firstName: string;
  lastName: string;
  organization: string;
  phone: string;
  email: string;
  website: string;
}

export interface QrRenderOptions {
  fgColor: string;
  bgColor: string;
  margin: number;
  moduleStyle: QrModuleStyle;
  logoDataUrl?: string | null;
  logoScale?: number; // 0.14 to 0.28
}

function escapeWifiField(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

export function normalizeWhatsAppPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('08')) {
    return `62${digits.slice(1)}`;
  }
  return digits;
}

export function buildWhatsAppPayload(input: WhatsAppPayloadInput): string {
  const phone = normalizeWhatsAppPhone(input.phone);
  if (!phone) return '';
  const msg = input.message.trim();
  if (!msg) return `https://wa.me/${phone}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

export function buildWifiPayload(input: WifiPayloadInput): string {
  const ssid = input.ssid.trim();
  if (!ssid) return '';
  const enc = input.encryption;
  const pass = enc === 'nopass' ? '' : escapeWifiField(input.password);
  const hidden = input.hidden ? 'H:true;' : '';
  return `WIFI:T:${enc};S:${escapeWifiField(ssid)};P:${pass};${hidden};`;
}

export function buildVCardPayload(input: VCardPayloadInput): string {
  const fn = [input.firstName.trim(), input.lastName.trim()].filter(Boolean).join(' ');
  if (!fn && !input.phone.trim() && !input.email.trim()) return '';

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${input.lastName.trim()};${input.firstName.trim()};;;`,
    `FN:${fn || input.organization.trim()}`,
  ];
  if (input.organization.trim()) lines.push(`ORG:${input.organization.trim()}`);
  if (input.phone.trim()) lines.push(`TEL;TYPE=CELL:${input.phone.trim()}`);
  if (input.email.trim()) lines.push(`EMAIL:${input.email.trim()}`);
  if (input.website.trim()) lines.push(`URL:${input.website.trim()}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

function parseHexColor(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getContrastRatio(fgHex: string, bgHex: string): number {
  const fg = parseHexColor(fgHex);
  const bg = parseHexColor(bgHex);
  if (!fg || !bg) return 21;
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderQrSvg(matrix: QrMatrix, options: QrRenderOptions): string {
  const margin = Math.max(0, Math.min(8, Math.round(options.margin)));
  const total = matrix.size + margin * 2;
  const fg = escapeXmlAttr(options.fgColor);
  const bg = escapeXmlAttr(options.bgColor);
  const isRounded = options.moduleStyle === 'rounded';

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="${isRounded ? 'geometricPrecision' : 'crispEdges'}" role="img" aria-label="QR Code">`,
    `<rect width="${total}" height="${total}" fill="${bg}" />`,
  ];

  if (isRounded) {
    parts.push(`<g fill="${fg}">`);
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) {
        if (matrix.modules[y][x]) {
          parts.push(
            `<rect x="${x + margin}" y="${y + margin}" width="1" height="1" rx="0.28" ry="0.28" />`,
          );
        }
      }
    }
    parts.push('</g>');
  } else {
    const pathSegments: string[] = [];
    for (let y = 0; y < matrix.size; y++) {
      let x = 0;
      while (x < matrix.size) {
        if (matrix.modules[y][x]) {
          const start = x;
          while (x < matrix.size && matrix.modules[y][x]) x++;
          const runLen = x - start;
          pathSegments.push(`M${start + margin},${y + margin}h${runLen}v1h-${runLen}z`);
        } else {
          x++;
        }
      }
    }
    parts.push(`<path d="${pathSegments.join('')}" fill="${fg}" />`);
  }

  if (options.logoDataUrl) {
    const scale = Math.max(0.14, Math.min(0.28, options.logoScale ?? 0.2));
    const logoSize = matrix.size * scale;
    const pad = Math.max(0.6, logoSize * 0.14);
    const boxSize = logoSize + pad * 2;
    const boxPos = (total - boxSize) / 2;
    const imgPos = (total - logoSize) / 2;
    const radius = boxSize * 0.18;
    parts.push(
      `<rect x="${boxPos.toFixed(2)}" y="${boxPos.toFixed(2)}" width="${boxSize.toFixed(2)}" height="${boxSize.toFixed(2)}" rx="${radius.toFixed(2)}" fill="${bg}" />`,
    );
    parts.push(
      `<image href="${escapeXmlAttr(options.logoDataUrl)}" x="${imgPos.toFixed(2)}" y="${imgPos.toFixed(2)}" width="${logoSize.toFixed(2)}" height="${logoSize.toFixed(2)}" preserveAspectRatio="xMidYMid meet" />`,
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

export async function renderQrPngBlob(
  matrix: QrMatrix,
  options: QrRenderOptions,
  pixelSize: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');

  const margin = Math.max(0, Math.min(8, Math.round(options.margin)));
  const total = matrix.size + margin * 2;
  const cell = pixelSize / total;

  ctx.fillStyle = options.bgColor;
  ctx.fillRect(0, 0, pixelSize, pixelSize);

  ctx.fillStyle = options.fgColor;
  const isRounded = options.moduleStyle === 'rounded';
  const radius = cell * 0.28;

  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.modules[y][x]) continue;
      const px = (x + margin) * cell;
      const py = (y + margin) * cell;
      if (isRounded) {
        ctx.beginPath();
        ctx.roundRect(px, py, cell, cell, radius);
        ctx.fill();
      } else {
        // Ceil slightly to avoid subpixel seams
        ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(cell), Math.ceil(cell));
      }
    }
  }

  if (options.logoDataUrl) {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gagal memuat gambar logo.'));
      el.src = options.logoDataUrl!;
    });

    const scale = Math.max(0.14, Math.min(0.28, options.logoScale ?? 0.2));
    const logoPx = matrix.size * cell * scale;
    const padPx = Math.max(6, logoPx * 0.14);
    const boxPx = logoPx + padPx * 2;
    const boxXY = (pixelSize - boxPx) / 2;
    const imgXY = (pixelSize - logoPx) / 2;

    ctx.fillStyle = options.bgColor;
    ctx.beginPath();
    ctx.roundRect(boxXY, boxXY, boxPx, boxPx, boxPx * 0.18);
    ctx.fill();

    // Contain aspect ratio inside logoPx x logoPx
    const ratio = Math.min(logoPx / img.naturalWidth, logoPx / img.naturalHeight);
    const drawW = img.naturalWidth * ratio;
    const drawH = img.naturalHeight * ratio;
    const drawX = imgXY + (logoPx - drawW) / 2;
    const drawY = imgXY + (logoPx - drawH) / 2;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Gagal mengekspor PNG.'));
      else resolve(blob);
    }, 'image/png');
  });
}

export { encodeQrMatrix, type QrEccLevel, type QrMatrix };
