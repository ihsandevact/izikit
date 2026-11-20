import { SITE_CONFIG } from '@/config/site';
import type { ToolDefinition } from '@/config/tools';
import { getLocalizedPath, type Dictionary, type Locale } from '@/i18n';

export interface SeoUrlSet {
  canonical: string;
  alternates: {
    id: string;
    en: string;
    xDefault: string;
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface FaqItem {
  readonly q: string;
  readonly a: string;
}

export interface ToolSeoInput {
  name: string;
  seoDescription: string;
  guideItems: readonly string[];
  faqs?: readonly FaqItem[];
}

const SITE_BASE = SITE_CONFIG.siteUrl.replace(/\/+$/, '');
const ORG_ID = `${SITE_BASE}/#organization`;
const WEBSITE_ID = `${SITE_BASE}/#website`;

export function buildOrganizationSchema(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_CONFIG.brandName,
    url: `${SITE_BASE}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_BASE}/icon-512.png`,
      width: 512,
      height: 512,
    },
  };
}

export function buildBreadcrumbSchema(items: readonly BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildFaqSchema(faqs: readonly FaqItem[]): Record<string, unknown> {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };
}

export function buildToolItemListSchema(
  locale: Locale,
  dict: Dictionary,
  liveTools: readonly ToolDefinition[],
  name: string,
): Record<string, unknown> {
  return {
    '@type': 'ItemList',
    name,
    numberOfItems: liveTools.length,
    itemListElement: liveTools.map((tool, idx) => {
      const meta = dict.tools[tool.id as keyof typeof dict.tools];
      const path = getLocalizedPath(`/${tool.slug}`, locale);
      return {
        '@type': 'ListItem',
        position: idx + 1,
        name: meta.name,
        url: `${SITE_BASE}${path}`,
      };
    }),
  };
}

export function buildHomeJsonLd(
  locale: Locale,
  seo: SeoUrlSet,
  dict: Dictionary,
  liveTools: readonly ToolDefinition[],
  faqs?: readonly FaqItem[],
): Record<string, unknown>[] {
  const graph: Record<string, unknown>[] = [
    buildOrganizationSchema(),
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: SITE_CONFIG.brandName,
      url: seo.canonical,
      inLanguage: dict.langTag,
      description: dict.home.seoDescription,
      publisher: { '@id': ORG_ID },
    },
    buildToolItemListSchema(locale, dict, liveTools, dict.home.catalogTitle),
  ];

  if (faqs && faqs.length > 0) {
    graph.push(buildFaqSchema(faqs));
  }

  return graph;
}

export function buildToolsCatalogJsonLd(
  locale: Locale,
  seo: SeoUrlSet,
  dict: Dictionary,
  pageTitle: string,
  liveTools: readonly ToolDefinition[],
): Record<string, unknown>[] {
  const homeUrl = `${SITE_BASE}${getLocalizedPath('/', locale)}`;
  const homeLabel = locale === 'id' ? 'Beranda' : 'Home';
  const itemList = buildToolItemListSchema(locale, dict, liveTools, dict.home.catalogTitle);

  return [
    buildOrganizationSchema(),
    {
      '@type': 'CollectionPage',
      name: pageTitle,
      url: seo.canonical,
      inLanguage: dict.langTag,
      description: dict.home.catalogSubtitle,
      isPartOf: { '@id': WEBSITE_ID },
      mainEntity: itemList,
    },
    buildBreadcrumbSchema([
      { name: homeLabel, url: homeUrl },
      { name: dict.nav.tools, url: seo.canonical },
    ]),
  ];
}

export function buildAboutJsonLd(
  locale: Locale,
  seo: SeoUrlSet,
  dict: Dictionary,
): Record<string, unknown>[] {
  const homeUrl = `${SITE_BASE}${getLocalizedPath('/', locale)}`;
  const homeLabel = locale === 'id' ? 'Beranda' : 'Home';

  return [
    buildOrganizationSchema(),
    {
      '@type': 'AboutPage',
      name: dict.about.seoTitle,
      url: seo.canonical,
      inLanguage: dict.langTag,
      description: dict.about.seoDescription,
      isPartOf: { '@id': WEBSITE_ID },
      mainEntity: { '@id': ORG_ID },
    },
    buildBreadcrumbSchema([
      { name: homeLabel, url: homeUrl },
      { name: dict.nav.about, url: seo.canonical },
    ]),
  ];
}

export function buildToolPageJsonLd(
  locale: Locale,
  seo: SeoUrlSet,
  dict: Dictionary,
  toolMeta: ToolSeoInput,
): Record<string, unknown>[] {
  const homeUrl = `${SITE_BASE}${getLocalizedPath('/', locale)}`;
  const toolsUrl = `${SITE_BASE}${getLocalizedPath('/tools', locale)}`;
  const homeLabel = locale === 'id' ? 'Beranda' : 'Home';

  const graph: Record<string, unknown>[] = [
    buildOrganizationSchema(),
    {
      '@type': 'WebApplication',
      name: `${toolMeta.name} — izikit`,
      url: seo.canonical,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript and WebAssembly',
      isAccessibleForFree: true,
      inLanguage: dict.langTag,
      description: toolMeta.seoDescription,
      featureList: [...toolMeta.guideItems],
      publisher: { '@id': ORG_ID },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    },
    buildBreadcrumbSchema([
      { name: homeLabel, url: homeUrl },
      { name: dict.nav.tools, url: toolsUrl },
      { name: toolMeta.name, url: seo.canonical },
    ]),
  ];

  return graph;
}
