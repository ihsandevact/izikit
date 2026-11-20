import { describe, expect, it } from 'vitest';
import { getLiveTools } from '@/config/tools';
import { getDictionary, getSeoUrls } from '@/i18n';
import {
  buildAboutJsonLd,
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildHomeJsonLd,
  buildOrganizationSchema,
  buildToolPageJsonLd,
  buildToolsCatalogJsonLd,
} from '@/lib/seo-schema';

describe('seo-schema builders', () => {
  it('builds Organization schema with logo ImageObject', () => {
    const org = buildOrganizationSchema();
    expect(org['@type']).toBe('Organization');
    expect(org.name).toBe('izikit');
    expect(org.url).toBe('https://izikit.app/');
    expect(org.logo).toMatchObject({
      '@type': 'ImageObject',
      url: 'https://izikit.app/icon-512.png',
      width: 512,
      height: 512,
    });
  });

  it('builds sequential BreadcrumbList positions', () => {
    const bc = buildBreadcrumbSchema([
      { name: 'Beranda', url: 'https://izikit.app/' },
      { name: 'Semua tools', url: 'https://izikit.app/tools' },
      { name: 'Gabung PDF', url: 'https://izikit.app/merge-pdf' },
    ]);
    expect(bc['@type']).toBe('BreadcrumbList');
    const items = bc.itemListElement as Array<{ position: number; name: string; item: string }>;
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[2].item).toBe('https://izikit.app/merge-pdf');
  });

  it('builds FAQPage schema from Q&A items', () => {
    const faq = buildFaqSchema([
      { q: 'Gratis?', a: 'Ya, 100% gratis.' },
      { q: 'Aman?', a: 'Diproses lokal di browser.' },
    ]);
    expect(faq['@type']).toBe('FAQPage');
    const entities = faq.mainEntity as Array<{
      '@type': string;
      name: string;
      acceptedAnswer: { '@type': string; text: string };
    }>;
    expect(entities).toHaveLength(2);
    expect(entities[0]['@type']).toBe('Question');
    expect(entities[0].acceptedAnswer['@type']).toBe('Answer');
  });

  it('builds Home @graph with Organization, WebSite, ItemList, and FAQPage', () => {
    const dict = getDictionary('id');
    const seo = getSeoUrls('/', 'id');
    const liveTools = getLiveTools();
    const graph = buildHomeJsonLd('id', seo, dict, liveTools, dict.home.faqs);

    const types = graph.map((node) => node['@type']);
    expect(types).toEqual(['Organization', 'WebSite', 'ItemList', 'FAQPage']);

    const itemList = graph[2] as { numberOfItems: number; itemListElement: unknown[] };
    expect(itemList.numberOfItems).toBe(liveTools.length);
    expect(itemList.itemListElement).toHaveLength(liveTools.length);
  });

  it('builds Tools catalog @graph with CollectionPage and BreadcrumbList', () => {
    const dict = getDictionary('en');
    const seo = getSeoUrls('/tools', 'en');
    const liveTools = getLiveTools();
    const graph = buildToolsCatalogJsonLd('en', seo, dict, 'All Tools | izikit', liveTools);

    expect(graph.map((n) => n['@type'])).toEqual([
      'Organization',
      'CollectionPage',
      'BreadcrumbList',
    ]);
  });

  it('builds About @graph with AboutPage and BreadcrumbList', () => {
    const dict = getDictionary('id');
    const seo = getSeoUrls('/about', 'id');
    const graph = buildAboutJsonLd('id', seo, dict);

    expect(graph.map((n) => n['@type'])).toEqual(['Organization', 'AboutPage', 'BreadcrumbList']);
  });

  it('builds ToolPage @graph with free WebApplication and BreadcrumbList', () => {
    const dict = getDictionary('id');
    const seo = getSeoUrls('/merge-pdf', 'id');
    const graph = buildToolPageJsonLd('id', seo, dict, dict.tools['merge-pdf']);

    expect(graph.map((n) => n['@type'])).toEqual([
      'Organization',
      'WebApplication',
      'BreadcrumbList',
    ]);

    const app = graph[1] as {
      isAccessibleForFree: boolean;
      offers: { price: string };
      featureList: string[];
    };
    expect(app.isAccessibleForFree).toBe(true);
    expect(app.offers.price).toBe('0');
    expect(app.featureList.length).toBeGreaterThanOrEqual(3);
  });
});
