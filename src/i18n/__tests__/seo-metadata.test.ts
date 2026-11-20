import { describe, expect, it } from 'vitest';
import { getLiveTools } from '@/config/tools';
import { getDictionary, getSeoUrls, type Locale } from '@/i18n';

const LOCALES: Locale[] = ['id', 'en'];

describe('SEO metadata & content depth', () => {
  it('generates clean canonical and hreflang URLs without double or trailing subpath slashes', () => {
    const idHome = getSeoUrls('/', 'id');
    expect(idHome.canonical).toBe('https://izikit.app/');
    expect(idHome.alternates.id).toBe('https://izikit.app/');
    expect(idHome.alternates.en).toBe('https://izikit.app/en');
    expect(idHome.alternates.xDefault).toBe('https://izikit.app/');

    const enTool = getSeoUrls('/merge-pdf', 'en');
    expect(enTool.canonical).toBe('https://izikit.app/en/merge-pdf');
    expect(enTool.alternates.id).toBe('https://izikit.app/merge-pdf');
    expect(enTool.alternates.en).toBe('https://izikit.app/en/merge-pdf');
    expect(enTool.alternates.xDefault).toBe('https://izikit.app/merge-pdf');
  });

  for (const locale of LOCALES) {
    describe(`locale: ${locale}`, () => {
      const dict = getDictionary(locale);
      const liveTools = getLiveTools();

      it('has well-sized home & about SEO metadata and home FAQs', () => {
        expect(dict.home.seoTitle.length).toBeGreaterThanOrEqual(25);
        expect(dict.home.seoTitle.length).toBeLessThanOrEqual(62);
        expect(dict.home.seoDescription.length).toBeGreaterThanOrEqual(110);
        expect(dict.home.seoDescription.length).toBeLessThanOrEqual(190);
        expect(dict.home.faqs.length).toBeGreaterThanOrEqual(3);

        expect(dict.about.seoTitle.length).toBeLessThanOrEqual(62);
        expect(dict.about.seoDescription.length).toBeGreaterThanOrEqual(100);
        expect(dict.about.seoDescription.length).toBeLessThanOrEqual(170);
      });

      it('has optimized seoTitle, seoDescription, howToSteps, and faqs for every live tool', () => {
        for (const tool of liveTools) {
          const meta = dict.tools[tool.id as keyof typeof dict.tools];
          expect(meta, `Missing dictionary entry for ${tool.id}`).toBeDefined();

          expect(
            meta.seoTitle.length,
            `${locale}.${tool.id}.seoTitle too long (${meta.seoTitle.length}): "${meta.seoTitle}"`,
          ).toBeLessThanOrEqual(62);

          expect(
            meta.seoDescription.length,
            `${locale}.${tool.id}.seoDescription out of range (${meta.seoDescription.length})`,
          ).toBeGreaterThanOrEqual(100);
          expect(
            meta.seoDescription.length,
            `${locale}.${tool.id}.seoDescription too long (${meta.seoDescription.length})`,
          ).toBeLessThanOrEqual(170);

          expect(
            meta.howToSteps.length,
            `${locale}.${tool.id}.howToSteps should have at least 3 steps`,
          ).toBeGreaterThanOrEqual(3);

          expect(
            meta.faqs.length,
            `${locale}.${tool.id}.faqs should have at least 3 Q&A items`,
          ).toBeGreaterThanOrEqual(3);

          for (const faq of meta.faqs) {
            expect(faq.q.trim().length).toBeGreaterThan(10);
            expect(faq.a.trim().length).toBeGreaterThan(20);
          }
        }
      });
    });
  }
});
