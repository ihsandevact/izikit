import { useId, useMemo, useState } from 'react';
import { TOOLS, type ToolCategory } from '@/config/tools';
import { getDictionary, getLocalizedPath, type Locale } from '@/i18n';
import { SearchIcon, ToolGlyph } from '@/components/shared/icons';

interface ToolDirectoryProps {
  locale: Locale;
}

type CategoryFilter = 'all' | ToolCategory;

export default function ToolDirectory({ locale }: ToolDirectoryProps) {
  const dict = getDictionary(locale);
  const searchInputId = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const normalizedQuery = query.trim().toLowerCase();

  const filteredTools = useMemo(() => {
    return TOOLS.filter((tool) => {
      if (category !== 'all' && tool.category !== category) {
        return false;
      }
      if (!normalizedQuery) return true;

      const meta = dict.tools[tool.id as keyof typeof dict.tools];
      const haystack = [
        meta.name,
        meta.shortDescription,
        meta.categoryLabel,
        ...tool.acceptedExtensions,
        ...tool.keywords[locale],
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [category, dict, locale, normalizedQuery]);

  const liveTools = filteredTools.filter((t) => t.status === 'live');
  const upcomingTools = filteredTools.filter((t) => t.status === 'coming-soon');

  const filterTabs: Array<{ value: CategoryFilter; label: string }> = [
    { value: 'all', label: dict.home.filterAll },
    { value: 'pdf', label: dict.home.filterPdf },
    { value: 'image', label: dict.home.filterImage },
  ];

  const resetFilters = () => {
    setQuery('');
    setCategory('all');
  };

  return (
    <div className="space-y-8">
      {/* Search + Category Filter Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 sm:p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <label htmlFor={searchInputId} className="sr-only">
            {dict.home.searchLabel}
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--ink-muted)]"
          >
            <SearchIcon className="h-4 w-4" />
          </span>
          <input
            id={searchInputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={dict.home.searchPlaceholder}
            className="h-11 w-full rounded-lg border border-[var(--border-control)] bg-[var(--bg-paper)] pr-12 pl-10 text-sm text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={dict.home.clearSearch}
              className="absolute top-0 right-0 inline-flex h-11 min-w-11 items-center justify-center rounded-r-lg text-xs font-semibold text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
            >
              ×
            </button>
          )}
        </div>

        <div
          role="tablist"
          aria-label={dict.home.searchLabel}
          className="flex flex-wrap items-center gap-1.5"
        >
          {filterTabs.map((tab) => {
            const active = category === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(tab.value)}
                className={`inline-flex min-h-11 items-center rounded-lg border px-3.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)] font-semibold text-[var(--accent-ink)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-paper)] text-[var(--ink-muted)] hover:border-[var(--border-control)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Empty Search Result State */}
      {liveTools.length === 0 && upcomingTools.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-10 text-center">
          <h2 className="font-display m-0 text-lg font-semibold text-[var(--ink-primary)]">
            {dict.home.emptySearchTitle}
          </h2>
          <p className="mx-auto mt-2 mb-4 max-w-md text-sm text-[var(--ink-muted)]">
            {dict.home.emptySearchBody}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="btn-secondary inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium"
          >
            {dict.home.resetFilters}
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Active Live Tools */}
          {liveTools.length > 0 && (
            <section aria-labelledby="active-tools-heading" className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="active-tools-heading"
                  className="font-display m-0 text-xl font-bold text-[var(--ink-primary)]"
                >
                  {dict.home.activeSectionTitle}
                </h2>
                <p className="m-0 text-sm text-[var(--ink-muted)]">
                  {dict.home.activeSectionHint}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {liveTools.map((tool) => {
                  const meta = dict.tools[tool.id as keyof typeof dict.tools];
                  const href = getLocalizedPath(`/${tool.slug}`, locale);

                  return (
                    <a
                      key={tool.id}
                      href={href}
                      className="group flex flex-col justify-between gap-5 rounded-xl border border-[var(--border-control)] bg-[var(--bg-card)] p-5 text-[var(--ink-primary)] no-underline transition-colors hover:border-[var(--accent)]"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] text-[var(--accent)]">
                            <ToolGlyph icon={tool.icon} className="h-5 w-5" />
                          </span>
                          <span className="font-data rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-paper)] px-2 py-1 text-xs font-medium text-[var(--ink-muted)]">
                            {meta.categoryLabel}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <h3 className="font-display m-0 text-xl font-bold text-[var(--ink-primary)] group-hover:text-[var(--accent)]">
                            {meta.name}
                          </h3>
                          <p className="m-0 text-sm leading-relaxed text-[var(--ink-muted)]">
                            {meta.shortDescription}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3.5">
                        <span className="font-data text-xs text-[var(--ink-muted)]">
                          {tool.acceptedExtensions.join(' ')}
                        </span>
                        <span className="text-sm font-semibold text-[var(--accent)] underline-offset-4 group-hover:underline">
                          {dict.home.openToolCta}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          {/* Upcoming Phase 1 Queue (Ledger List - distinct rhythm from active cards) */}
          {upcomingTools.length > 0 && (
            <section aria-labelledby="upcoming-tools-heading" className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="upcoming-tools-heading"
                  className="font-display m-0 text-lg font-semibold text-[var(--ink-primary)]"
                >
                  {dict.home.upcomingSectionTitle}
                </h2>
                <p className="m-0 text-sm text-[var(--ink-muted)]">
                  {dict.home.upcomingSectionHint}
                </p>
              </div>

              <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]">
                {upcomingTools.map((tool) => {
                  const meta = dict.tools[tool.id as keyof typeof dict.tools];

                  return (
                    <article
                      key={tool.id}
                      className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-recess)] text-[var(--ink-muted)]">
                          <ToolGlyph icon={tool.icon} className="h-4 w-4" />
                        </span>
                        <div>
                          <h3 className="m-0 text-sm font-semibold text-[var(--ink-primary)]">
                            {meta.name}
                          </h3>
                          <p className="m-0 mt-0.5 text-sm text-[var(--ink-muted)]">
                            {meta.shortDescription}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:shrink-0">
                        <span className="font-data text-xs text-[var(--ink-muted)]">
                          {meta.categoryLabel}
                        </span>
                        <span className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-2.5 py-1 text-xs font-medium text-[var(--ink-muted)]">
                          {dict.home.comingSoonBadge}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
