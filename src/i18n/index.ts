import { idDictionary } from './id';
import { enDictionary } from './en';
import { SITE_CONFIG } from '@/config/site';

export type Locale = 'id' | 'en';
export type Dictionary = typeof idDictionary;

const dictionaries: Record<Locale, Dictionary> = {
  id: idDictionary,
  en: enDictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/**
 * Normalize a route path (always leading slash, no trailing slash except root).
 */
function normalizeRoute(route: string): string {
  const cleaned = route.replace(/^\/+|\/+$/g, '');
  return cleaned ? `/${cleaned}` : '/';
}

/**
 * Build localized path:
 * - id (default): "/", "/merge-pdf", "/about"
 * - en: "/en/", "/en/merge-pdf", "/en/about"
 */
export function getLocalizedPath(route: string, locale: Locale): string {
  const normalized = normalizeRoute(route);
  if (locale === 'id') {
    return normalized;
  }
  return normalized === '/' ? '/en' : `/en${normalized}`;
}

/**
 * Build canonical and hreflang alternate URLs for SEO.
 */
export function getSeoUrls(route: string, locale: Locale) {
  const base = SITE_CONFIG.siteUrl.replace(/\/+$/, '');
  const idPath = getLocalizedPath(route, 'id');
  const enPath = getLocalizedPath(route, 'en');
  const canonicalPath = locale === 'id' ? idPath : enPath;

  return {
    canonical: `${base}${canonicalPath}`,
    alternates: {
      id: `${base}${idPath}`,
      en: `${base}${enPath}`,
      xDefault: `${base}${idPath}`,
    },
  };
}
