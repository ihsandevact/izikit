import fs from 'node:fs';
import path from 'node:path';

const swPath = path.resolve('dist/sw.js');

if (fs.existsSync(swPath)) {
  const content = fs.readFileSync(swPath, 'utf8');
  const patchMarker = '/* izikit-legacy-cache-purge */';
  if (!content.includes(patchMarker)) {
    const patch = `\n${patchMarker}\nself.addEventListener('activate', (event) => {\n  event.waitUntil(\n    caches.keys().then((keys) => {\n      const stale = keys.filter((k) => k.startsWith('workbox-precache') || k.startsWith('izikit-pages'));\n      return Promise.all(stale.map((k) => caches.delete(k)));\n    })\n  );\n});\n`;
    fs.writeFileSync(swPath, content + patch, 'utf8');
  }
}
