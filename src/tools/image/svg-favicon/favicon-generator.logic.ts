export interface FaviconAssetSpec {
  id: string;
  filename: string;
  size: number;
  includeInIco: boolean;
  purpose: string;
}

export const FAVICON_ASSET_SPECS: readonly FaviconAssetSpec[] = [
  { id: 'png-16', filename: 'favicon-16x16.png', size: 16, includeInIco: true, purpose: 'Browser tab (16px)' },
  { id: 'png-32', filename: 'favicon-32x32.png', size: 32, includeInIco: true, purpose: 'Browser tab HD (32px)' },
  { id: 'png-48', filename: 'favicon-48x48.png', size: 48, includeInIco: true, purpose: 'Windows / Search (48px)' },
  { id: 'apple-180', filename: 'apple-touch-icon.png', size: 180, includeInIco: false, purpose: 'iOS Home Screen (180px)' },
  { id: 'pwa-192', filename: 'icon-192.png', size: 192, includeInIco: false, purpose: 'Android / PWA (192px)' },
  { id: 'pwa-512', filename: 'icon-512.png', size: 512, includeInIco: false, purpose: 'PWA Splash (512px)' },
] as const;

/**
 * Ensures an SVG markup string has explicit numeric width and height attributes
 * so all browsers (including Firefox & Safari) can draw it onto an HTMLCanvasElement.
 */
export function normalizeSvgDimensions(svgText: string, fallbackSize = 512): string {
  const trimmed = svgText.trim();
  const svgTagMatch = trimmed.match(/<svg\b[^>]*>/i);
  if (!svgTagMatch) {
    throw new Error('Invalid SVG markup: missing <svg> root element.');
  }

  const openTag = svgTagMatch[0];
  const hasWidth = /\bwidth\s*=\s*["'][^"']+["']/i.test(openTag);
  const hasHeight = /\bheight\s*=\s*["'][^"']+["']/i.test(openTag);
  if (hasWidth && hasHeight) {
    return trimmed;
  }

  let width = fallbackSize;
  let height = fallbackSize;
  const viewBoxMatch = openTag.match(/\bviewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (viewBoxMatch) {
    const vbW = Number(viewBoxMatch[1]);
    const vbH = Number(viewBoxMatch[2]);
    if (Number.isFinite(vbW) && Number.isFinite(vbH) && vbW > 0 && vbH > 0) {
      const scale = fallbackSize / Math.max(vbW, vbH);
      width = Math.max(1, Math.round(vbW * scale));
      height = Math.max(1, Math.round(vbH * scale));
    }
  }

  const attrsToAdd = `${hasWidth ? '' : ` width="${width}"`}${hasHeight ? '' : ` height="${height}"`}`;
  const updatedTag = openTag.replace(/>$/, `${attrsToAdd}>`);
  return trimmed.replace(openTag, updatedTag);
}

export function buildWebManifestJson(
  appName: string,
  themeColor: string,
  backgroundColor: string,
): string {
  const safeName = appName.trim() || 'My Web App';
  return JSON.stringify(
    {
      name: safeName,
      short_name: safeName,
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      theme_color: themeColor,
      background_color: backgroundColor,
      display: 'standalone',
    },
    null,
    2,
  );
}

export function buildFaviconHtmlSnippet(themeColor: string): string {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/site.webmanifest">',
    `<meta name="theme-color" content="${themeColor}">`,
  ].join('\n');
}
