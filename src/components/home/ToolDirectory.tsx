import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  TOOLS,
  TOOL_GROUPS,
  TOOL_GROUP_STYLES,
  type ToolDefinition,
  type ToolGroup,
} from '@/config/tools';
import { getDictionary, getLocalizedPath, type Locale } from '@/i18n';
import {
  CategorySwatch,
  SearchIcon,
  ShieldLocalIcon,
  ToolIconBadge,
} from '@/components/shared/icons';

interface ToolDirectoryProps {
  locale: Locale;
  mode?: 'launcher' | 'catalog';
}

type GroupFilter = 'all' | ToolGroup;

const DEFAULT_RECENT_IDS = ['split-pdf', 'compress-image', 'merge-pdf'] as const;
const POPULAR_LAUNCHER_IDS = [
  'merge-pdf',
  'compress-pdf',
  'remove-bg',
  'compress-image',
  'word-to-pdf',
  'edit-pdf',
] as const;

export default function ToolDirectory({ locale, mode = 'launcher' }: ToolDirectoryProps) {
  const dict = getDictionary(locale);
  const searchInputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<GroupFilter>('all');
  const [recentIds, setRecentIds] = useState<string[]>([...DEFAULT_RECENT_IDS]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const liveTools = useMemo(() => TOOLS.filter((t) => t.status === 'live'), []);
  const upcomingTools = useMemo(() => TOOLS.filter((t) => t.status === 'coming-soon'), []);
  const normalizedQuery = query.trim().toLowerCase();
  const allToolsHref = getLocalizedPath('/tools', locale);
  const roadmapHref = getLocalizedPath('/roadmap', locale);

  // Load recent tools from localStorage + optional ?group= query param on catalog page
  useEffect(() => {
    try {
      const raw = localStorage.getItem('izikit-recent-tools');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((slug): slug is string =>
            liveTools.some((t) => t.slug === slug || t.id === slug),
          );
          if (valid.length > 0) {
            setRecentIds(valid.slice(0, 3));
          }
        }
      }
    } catch {
      // Keep defaults
    }

    if (mode === 'catalog') {
      try {
        const params = new URLSearchParams(window.location.search);
        const grp = params.get('group');
        if (grp && (TOOL_GROUPS as readonly string[]).includes(grp)) {
          setActiveGroup(grp as ToolGroup);
        }
      } catch {
        // Ignore
      }
    }
  }, [liveTools, mode]);

  // Global keyboard shortcut "/" or Cmd/Ctrl+K to focus the search input
  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }

      if (!isInputFocused && event.key === '/') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  const matchesSearch = useMemo(() => {
    return (tool: ToolDefinition, q: string) => {
      if (!q) return true;
      const meta =
        tool.status === 'live'
          ? dict.tools[tool.id as keyof typeof dict.tools]
          : dict.upcomingTools[tool.id as keyof typeof dict.upcomingTools];
      const groupMeta = dict.home.groups[tool.group];
      const haystack = [
        meta?.name ?? tool.id,
        meta?.shortDescription ?? '',
        groupMeta.title,
        tool.formatLabel,
        ...tool.acceptedExtensions,
        ...tool.keywords[locale],
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    };
  }, [dict, locale]);

  const recentTools = useMemo(() => {
    return recentIds
      .map((id) => liveTools.find((t) => t.id === id || t.slug === id))
      .filter((t): t is ToolDefinition => Boolean(t));
  }, [liveTools, recentIds]);

  const gridLauncherTools = useMemo(() => {
    if (normalizedQuery) {
      return liveTools.filter((t) => matchesSearch(t, normalizedQuery));
    }
    return POPULAR_LAUNCHER_IDS.map((id) => liveTools.find((t) => t.id === id)).filter(
      (t): t is ToolDefinition => Boolean(t),
    );
  }, [liveTools, matchesSearch, normalizedQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [normalizedQuery]);

  const handleLauncherKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (gridLauncherTools.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % gridLauncherTools.length);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (gridLauncherTools.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + gridLauncherTools.length) % gridLauncherTools.length);
      }
    } else if (event.key === 'Enter') {
      const activeTool = gridLauncherTools[selectedIndex];
      if (activeTool) {
        event.preventDefault();
        window.location.href = getLocalizedPath(`/${activeTool.slug}`, locale);
      }
    } else if (event.key === 'Escape') {
      if (query) {
        event.preventDefault();
        setQuery('');
      }
    }
  };

  // Filtered tools for dedicated /tools catalog page
  const catalogTools = useMemo(() => {
    return liveTools.filter((tool) => {
      if (activeGroup !== 'all' && tool.group !== activeGroup) {
        return false;
      }
      return matchesSearch(tool, normalizedQuery);
    });
  }, [activeGroup, liveTools, matchesSearch, normalizedQuery]);

  const groupCounts = useMemo(() => {
    const counts: Record<ToolGroup, number> = {
      'pdf-organize': 0,
      'pdf-edit-security': 0,
      'image-optimize': 0,
      'image-studio': 0,
      'daily-utilities': 0,
    };
    for (const tool of liveTools) {
      counts[tool.group] += 1;
    }
    return counts;
  }, [liveTools]);

  const liveGroups = useMemo(
    () => TOOL_GROUPS.filter((grp) => groupCounts[grp] > 0),
    [groupCounts],
  );

  const resetFilters = () => {
    setQuery('');
    setActiveGroup('all');
  };

  // =========================================================================
  // MODE 1: HOMEPAGE SEARCH-FIRST WORKBENCH ("/" and "/en")
  // Hero with yellow highlight + focus-glow search + 3-col vertical popular grid
  // + category cards with count inside colored badge
  // =========================================================================
  if (mode === 'launcher') {
    return (
      <div className="space-y-10 sm:space-y-12">
        {/* Hero Header + Prominent Search */}
        <div className="mx-auto max-w-4xl space-y-7 sm:space-y-8">
          <div className="flex flex-col items-center text-center">
            <p className="m-0 inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--ink-primary)] sm:text-xs">
              <ShieldLocalIcon className="h-3.5 w-3.5 shrink-0 text-[var(--hl)]" />
              <span>{dict.site.privacyNote}</span>
            </p>

            <h1 className="font-display m-0 mt-5 max-w-[20ch] text-[clamp(2rem,6vw,3.25rem)] leading-[1.08] font-extrabold tracking-tight text-balance text-[var(--ink-primary)] sm:mt-6 lg:max-w-none">
              {dict.home.heroPromptPrefix}
              <span className="text-[var(--hl)]">{dict.home.heroPromptHighlight}</span>
              {dict.home.heroPromptSuffix}
            </h1>

            <p className="m-0 mt-4 max-w-xl text-sm leading-relaxed text-pretty text-[var(--ink-muted)] sm:mt-5 sm:text-base">
              {dict.home.heroPromptMuted}
            </p>
          </div>

          <div className="mx-auto max-w-2xl space-y-4">
            <div className="relative flex items-center rounded-2xl border border-[var(--border-control)] bg-[var(--bg-card)] px-4 shadow-sm transition-all focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-glow)]">
              <label htmlFor={searchInputId} className="sr-only">
                {dict.home.searchLabel}
              </label>
              <SearchIcon className="h-5 w-5 shrink-0 text-[var(--ink-muted)]" />
              <input
                id={searchInputId}
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleLauncherKeyDown}
                placeholder={dict.home.searchPlaceholder}
                className="h-14 w-full border-0 bg-transparent px-3.5 text-sm text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none sm:h-[60px] sm:text-base"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={dict.home.clearSearch}
                  className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg text-sm font-bold text-[var(--ink-muted)] hover:bg-[var(--bg-recess)] hover:text-[var(--ink-primary)]"
                >
                  ×
                </button>
              ) : (
                <div className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
                  <span className="kbd-cap">/</span>
                </div>
              )}
            </div>

            {/* Recent Tools Dock */}
            {!normalizedQuery && recentTools.length > 0 && (
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-2.5">
                <span className="font-data shrink-0 text-[10px] font-semibold tracking-wider text-[var(--ink-muted)] uppercase">
                  {dict.home.recentHeading}
                </span>
                <div className="no-scrollbar -mx-4 flex max-w-[calc(100%+2rem)] flex-nowrap items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:max-w-none sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
                  {recentTools.map((tool) => {
                    const meta = dict.tools[tool.id as keyof typeof dict.tools];
                    const href = getLocalizedPath(`/${tool.slug}`, locale);
                    return (
                      <a
                        key={`recent-chip-${tool.id}`}
                        href={href}
                        className="inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)] no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--link)]"
                      >
                        <ToolIconBadge icon={tool.icon} group={tool.group} size="sm" />
                        <span>{meta.name}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3-Column Vertical Popular Grid (or Live Search Results) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[var(--hl)]" aria-hidden="true" />
              <h2 className="font-data m-0 text-[11px] font-bold tracking-wider text-[var(--ink-muted)] uppercase">
                {normalizedQuery
                  ? `${gridLauncherTools.length} ${locale === 'id' ? 'HASIL PENCARIAN' : 'SEARCH RESULTS'}`
                  : dict.home.popularHeading}
              </h2>
            </div>

            <a
              href={allToolsHref}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--link)] no-underline transition-colors hover:underline"
            >
              <span>
                {dict.home.catalogTitle} ({liveTools.length})
              </span>
              <span aria-hidden="true">→</span>
            </a>
          </div>

          {gridLauncherTools.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-12 text-center">
              <p className="m-0 text-sm font-bold text-[var(--ink-primary)]">
                {dict.home.emptySearchTitle}
              </p>
              <p className="m-0 mt-1 mb-4 text-xs text-[var(--ink-muted)]">
                {dict.home.emptySearchBody}
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="btn-secondary inline-flex min-h-10 items-center rounded-lg px-4 text-xs font-semibold"
              >
                {dict.home.resetFilters}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
              {gridLauncherTools.map((tool, idx) => {
                const isSelected = idx === selectedIndex;
                const meta = dict.tools[tool.id as keyof typeof dict.tools];
                const href = getLocalizedPath(`/${tool.slug}`, locale);

                return (
                  <a
                    key={`bento-${tool.id}`}
                    href={href}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onFocus={() => setSelectedIndex(idx)}
                    className={`group flex flex-col gap-4 rounded-2xl border p-5 text-[var(--ink-primary)] no-underline transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-tint)] shadow-[0_0_0_1px_var(--accent-glow)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-control)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <ToolIconBadge icon={tool.icon} group={tool.group} size="md" />
                      <span className="font-data shrink-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                        {tool.formatLabel}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="font-display m-0 text-[15px] leading-snug font-extrabold text-[var(--ink-primary)] group-hover:text-[var(--link)]">
                        {meta.name}
                      </h3>
                      <p className="m-0 line-clamp-3 text-xs leading-relaxed text-[var(--ink-muted)] sm:text-[13px]">
                        {meta.shortDescription}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </section>

        {/* Category Cards with Tool Count Inside Colored Box/Circle */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-[2px] bg-[var(--accent)]" aria-hidden="true" />
            <h2 className="font-data m-0 text-[11px] font-bold tracking-wider text-[var(--ink-muted)] uppercase">
              {dict.home.categoriesHeading}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {liveGroups.map((grp) => {
              const grpStyle = TOOL_GROUP_STYLES[grp];
              const isCircle = grpStyle.shape === 'circle';
              return (
                <a
                  key={grp}
                  href={`${allToolsHref}?group=${grp}`}
                  className="group flex min-h-16 items-center gap-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3.5 text-[var(--ink-primary)] no-underline transition-colors hover:border-[var(--accent)]"
                >
                  <span
                    className={`font-data inline-flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold ${
                      isCircle ? 'rounded-full' : 'rounded-xl'
                    }`}
                    style={{ backgroundColor: grpStyle.bgVar, color: grpStyle.inkColor }}
                  >
                    {groupCounts[grp]}
                  </span>
                  <span className="font-display text-xs leading-snug font-bold text-[var(--ink-primary)] group-hover:text-[var(--link)] sm:text-[13px]">
                    {dict.home.groups[grp].title}
                  </span>
                </a>
              );
            })}
          </div>
        </section>

        {/* Keyboard Hints Footer Bar */}
        <div className="hidden items-center justify-between border-t border-[var(--border-subtle)] pt-4 text-[11px] text-[var(--ink-muted)] sm:flex">
          <div className="flex items-center gap-3.5">
            <span className="inline-flex items-center gap-1">
              <kbd className="kbd-cap">↑</kbd>
              <kbd className="kbd-cap">↓</kbd>
              <span>{dict.home.keyNavigate}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="kbd-cap">↵</kbd>
              <span>{dict.home.keyOpen}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="kbd-cap">esc</kbd>
              <span>{dict.home.keyClear}</span>
            </span>
          </div>
          <span className="font-data">{dict.home.launcherFooterRight}</span>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MODE 2: DEDICATED ALL TOOLS PAGE ("/tools" and "/en/tools")
  // Clean Split-Sidebar Catalog on Desktop + Horizontal Scrollable Rail on Mobile
  // =========================================================================
  const renderCategoryButton = (group: GroupFilter, label: string, count: number) => {
    const active = activeGroup === group;
    return (
      <button
        key={`cat-${group}`}
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => setActiveGroup(group)}
        className={`flex min-h-10 shrink-0 snap-start items-center justify-between gap-2.5 whitespace-nowrap rounded-xl border px-3 py-2 text-left text-xs transition-colors lg:w-full lg:whitespace-normal ${
          active
            ? 'border-[var(--accent)] bg-[var(--accent-tint)] font-bold text-[var(--ink-primary)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-card)] font-medium text-[var(--ink-muted)] hover:border-[var(--border-control)] hover:bg-[var(--bg-recess)] hover:text-[var(--ink-primary)] lg:border-transparent lg:bg-transparent'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {group === 'all' ? (
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="h-3.5 w-3.5 shrink-0 text-[var(--link)]"
              aria-hidden="true"
            >
              <circle cx="4.5" cy="4.5" r="2.2" fill="var(--logo-circle)" />
              <rect x="9" y="2.3" width="4.4" height="4.4" rx="1.2" fill="var(--logo-tr)" />
              <rect x="2.3" y="9" width="4.4" height="4.4" rx="1.2" fill="var(--logo-bl)" />
              <rect x="9" y="9" width="4.4" height="4.4" rx="1.2" fill="var(--logo-br)" />
            </svg>
          ) : (
            <CategorySwatch group={group} size="sm" />
          )}
          <span className="truncate lg:line-clamp-2 lg:whitespace-normal">{label}</span>
        </span>
        <span
          className={`font-data shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
            active
              ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
              : 'bg-[var(--bg-recess)] text-[var(--ink-muted)]'
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <section aria-labelledby="all-tools-heading" className="space-y-8 sm:space-y-10">
      {/* Top Directory Header + Search */}
      <div className="flex flex-col gap-5 border-b border-[var(--border-subtle)] pb-7 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1
              id="all-tools-heading"
              className="font-display m-0 text-[clamp(1.85rem,4vw,2.6rem)] leading-tight font-extrabold text-[var(--ink-primary)]"
            >
              {dict.home.catalogTitle}
            </h1>
            <span className="font-data rounded-md border border-[var(--border-subtle)] bg-[var(--hl-tint)] px-2.5 py-1 text-[11px] font-bold text-[var(--hl)]">
              {liveTools.length} TOOLS
            </span>
          </div>
          <p className="m-0 max-w-xl text-sm leading-relaxed text-[var(--ink-muted)]">
            {dict.home.catalogSubtitle}
          </p>
        </div>

        <div className="relative w-full md:max-w-xs">
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
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={dict.home.catalogSearchPlaceholder}
            className="h-11 w-full rounded-xl border border-[var(--border-control)] bg-[var(--bg-card)] pr-10 pl-10 text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] transition-all focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-glow)] focus:outline-none sm:text-sm"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={dict.home.clearSearch}
              className="absolute top-0 right-1 inline-flex h-11 min-w-10 items-center justify-center text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
            >
              ×
            </button>
          ) : (
            <span
              aria-hidden="true"
              className="kbd-cap pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
            >
              /
            </span>
          )}
        </div>
      </div>

      {/* Split Layout: Left Category Sidebar on Desktop + Horizontal Scroll Rail on Mobile */}
      <div className="grid gap-7 lg:grid-cols-[248px_1fr] lg:items-start lg:gap-10">
        <aside className="relative min-w-0 lg:sticky lg:top-20">
          <div
            role="tablist"
            aria-label={dict.home.searchLabel}
            className="no-scrollbar -mx-4 flex snap-x scroll-px-4 flex-nowrap gap-2 overflow-x-auto px-4 pr-10 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pr-0 sm:pb-0 lg:flex-col lg:gap-1 lg:rounded-2xl lg:border lg:border-[var(--border-subtle)] lg:bg-[var(--bg-card)] lg:p-2"
          >
            {renderCategoryButton('all', dict.home.filterAll, liveTools.length)}
            {liveGroups.map((grp) =>
              renderCategoryButton(grp, dict.home.groups[grp].title, groupCounts[grp]),
            )}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -right-4 w-10 bg-gradient-to-l from-[var(--bg-paper)] to-transparent sm:hidden"
          />
        </aside>

        <div className="min-w-0 space-y-10">
          {catalogTools.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-12 text-center">
              <h2 className="font-display m-0 text-lg font-extrabold text-[var(--ink-primary)]">
                {dict.home.emptySearchTitle}
              </h2>
              <p className="mx-auto mt-2 mb-4 max-w-md text-sm text-[var(--ink-muted)]">
                {dict.home.emptySearchBody}
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="btn-secondary inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-semibold"
              >
                {dict.home.resetFilters}
              </button>
            </div>
          ) : (
            <>
              {catalogTools.length > 0 && (
                <div className="space-y-10">
                  {liveGroups.map((grp) => {
                    const toolsInGroup = catalogTools.filter((t) => t.group === grp);
                    if (toolsInGroup.length === 0) return null;

                    const groupMeta = dict.home.groups[grp];
                    const sectionAnchor =
                      grp === 'pdf-organize'
                        ? 'pdf-tools'
                        : grp === 'image-optimize'
                          ? 'image-tools'
                          : `group-${grp}`;

                    return (
                      <section
                        key={grp}
                        id={sectionAnchor}
                        aria-labelledby={`heading-${grp}`}
                        className="space-y-4"
                      >
                        <div className="flex flex-col gap-1.5 border-b border-[var(--border-subtle)] pb-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                          <div className="flex items-center gap-2.5">
                            <CategorySwatch group={grp} size="sm" />
                            <h2
                              id={`heading-${grp}`}
                              className="font-display m-0 text-base font-extrabold text-[var(--ink-primary)] sm:text-lg"
                            >
                              {groupMeta.title}
                            </h2>
                          </div>
                          <p className="m-0 text-xs text-[var(--ink-muted)] sm:max-w-xs sm:text-right">
                            {groupMeta.hint}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:gap-4">
                          {toolsInGroup.map((tool) => {
                            const meta = dict.tools[tool.id as keyof typeof dict.tools];
                            const href = getLocalizedPath(`/${tool.slug}`, locale);

                            return (
                              <a
                                key={tool.id}
                                href={href}
                                className="group flex h-full items-start gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 text-[var(--ink-primary)] no-underline transition-colors hover:border-[var(--accent)] sm:p-5"
                              >
                                <ToolIconBadge
                                  icon={tool.icon}
                                  group={tool.group}
                                  size="md"
                                  className="mt-0.5"
                                />

                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <h3 className="font-display m-0 text-sm leading-snug font-extrabold text-[var(--ink-primary)] group-hover:text-[var(--link)] sm:text-[15px]">
                                      {meta.name}
                                    </h3>
                                    <span className="font-data shrink-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                                      {tool.formatLabel}
                                    </span>
                                  </div>

                                  <p className="m-0 line-clamp-3 text-xs leading-relaxed text-[var(--ink-muted)] sm:text-[13px]">
                                    {meta.shortDescription}
                                  </p>
                                </div>
                              </a>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}

              {/* Compact Link Banner to Dedicated Roadmap ("Segera Hadir") Page */}
              {upcomingTools.length > 0 && !normalizedQuery && (
                <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-dashed border-[var(--border-control)] bg-[var(--bg-card)]/70 p-4 sm:flex-row sm:items-center sm:p-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--hl)]"
                      />
                      <span className="font-display text-sm font-extrabold text-[var(--ink-primary)]">
                        {dict.home.upcomingSectionTitle}
                      </span>
                      <span className="font-data rounded-md bg-[var(--hl-tint)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--hl)]">
                        {upcomingTools.length} {dict.home.comingSoonBadge}
                      </span>
                    </div>
                    <p className="m-0 text-xs text-[var(--ink-muted)]">
                      {dict.home.upcomingSectionHint}
                    </p>
                  </div>

                  <a
                    href={roadmapHref}
                    className="btn-secondary inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold no-underline"
                  >
                    <span>{dict.home.upcomingBannerCta}</span>
                    <span aria-hidden="true">→</span>
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
