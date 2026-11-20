import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  TOOLS,
  TOOL_GROUPS,
  type ToolDefinition,
  type ToolGroup,
} from '@/config/tools';
import { getDictionary, getLocalizedPath, type Locale } from '@/i18n';
import { SearchIcon, ShieldLocalIcon, ToolGlyph } from '@/components/shared/icons';

interface ToolDirectoryProps {
  locale: Locale;
  mode?: 'launcher' | 'catalog';
}

type GroupFilter = 'all' | ToolGroup;

const DEFAULT_RECENT_IDS = ['remove-bg', 'compress-pdf'] as const;
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
  const normalizedQuery = query.trim().toLowerCase();
  const allToolsHref = getLocalizedPath('/tools', locale);

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
      const meta = dict.tools[tool.id as keyof typeof dict.tools];
      const groupMeta = dict.home.groups[tool.group];
      const haystack = [
        meta.name,
        meta.shortDescription,
        meta.categoryLabel,
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
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (gridLauncherTools.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % gridLauncherTools.length);
        }
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
    };
    for (const tool of liveTools) {
      counts[tool.group] += 1;
    }
    return counts;
  }, [liveTools]);

  const resetFilters = () => {
    setQuery('');
    setActiveGroup('all');
  };

  // =========================================================================
  // MODE 1: HOMEPAGE SEARCH-FIRST WORKBENCH ("/" and "/en")
  // Straight-to-the-point search + recent dock + 2-column popular bento grid
  // =========================================================================
  if (mode === 'launcher') {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pt-2 sm:space-y-7 sm:pt-4">
        {/* Compact Direct Header */}
        <div className="space-y-3 text-center">
          <p className="m-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1 text-[11px] font-semibold text-[var(--success)] sm:text-xs">
            <ShieldLocalIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{dict.site.privacyNote}</span>
          </p>

          <h1 className="font-display m-0 text-[clamp(1.65rem,4.3vw,2.75rem)] leading-[1.12] font-extrabold tracking-tight text-[var(--ink-primary)]">
            {dict.home.heroPromptStrong}
          </h1>
          <p className="m-0 text-sm text-[var(--ink-muted)] sm:text-base">
            {dict.home.heroPromptMuted}
          </p>
        </div>

        {/* Standalone Prominent Search Bar */}
        <div className="space-y-3">
          <div className="relative flex items-center rounded-xl border-2 border-[var(--border-control)] bg-[var(--bg-card)] px-4 shadow-xs transition-colors focus-within:border-[var(--accent)]">
            <label htmlFor={searchInputId} className="sr-only">
              {dict.home.searchLabel}
            </label>
            <SearchIcon className="h-5 w-5 shrink-0 text-[var(--accent)]" />
            <input
              id={searchInputId}
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleLauncherKeyDown}
              placeholder={dict.home.searchPlaceholder}
              className="h-13 w-full border-0 bg-transparent px-3.5 text-sm text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none sm:h-14 sm:text-base"
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

          {/* Horizontal Recent Tools Dock (when idle and recentTools exist) */}
          {!normalizedQuery && recentTools.length > 0 && (
            <div className="flex flex-col items-start gap-2 px-0.5 sm:flex-row sm:items-center">
              <span className="font-data shrink-0 text-[10px] font-semibold tracking-wider text-[var(--ink-muted)] uppercase sm:text-[11px]">
                {dict.home.recentHeading}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {recentTools.map((tool) => {
                  const meta = dict.tools[tool.id as keyof typeof dict.tools];
                  const href = getLocalizedPath(`/${tool.slug}`, locale);
                  return (
                    <a
                      key={`recent-chip-${tool.id}`}
                      href={href}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)] no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      <ToolGlyph icon={tool.icon} className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                      <span>{meta.name}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 2-Column Bento Quick-Launch Grid (Populer or Live Search Results) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-xs bg-[var(--accent)]" aria-hidden="true" />
              <h2 className="font-data m-0 text-xs font-bold tracking-wider text-[var(--ink-muted)] uppercase">
                {normalizedQuery
                  ? `${gridLauncherTools.length} HASIL PENCARIAN`
                  : dict.home.popularHeading}
              </h2>
            </div>

            <a
              href={allToolsHref}
              className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] no-underline hover:underline"
            >
              <span>{dict.home.catalogTitle} ({liveTools.length})</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>

          {gridLauncherTools.length === 0 ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-10 text-center">
              <p className="m-0 text-sm font-bold text-[var(--ink-primary)]">
                {dict.home.emptySearchTitle}
              </p>
              <p className="m-0 mt-1 mb-4 text-xs text-[var(--ink-muted)]">
                {dict.home.emptySearchBody}
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="btn-secondary inline-flex min-h-9 items-center rounded-lg px-3.5 text-xs font-semibold"
              >
                {dict.home.resetFilters}
              </button>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {gridLauncherTools.map((tool, idx) => {
                const isSelected = idx === selectedIndex;
                const meta = dict.tools[tool.id as keyof typeof dict.tools];
                const href = getLocalizedPath(`/${tool.slug}`, locale);

                return (
                  <a
                    key={`bento-${tool.id}`}
                    href={href}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`group flex items-start gap-3.5 rounded-xl border p-3.5 text-[var(--ink-primary)] no-underline transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--bg-card)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-control)]'
                    }`}
                  >
                    <span
                      className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        isSelected
                          ? 'border-transparent bg-[var(--accent-pill)] text-[var(--accent-pill-ink)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-recess)] text-[var(--ink-primary)]'
                      }`}
                    >
                      <ToolGlyph icon={tool.icon} className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="text-sm font-bold leading-snug text-[var(--ink-primary)] group-hover:text-[var(--accent)]">
                          {meta.name}
                        </span>
                        <span className="font-data shrink-0 rounded bg-[var(--bg-recess)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                          {tool.formatLabel}
                        </span>
                      </div>
                      <p className="m-0 line-clamp-2 text-xs leading-relaxed text-[var(--ink-muted)]">
                        {meta.shortDescription}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Category Bar + Keyboard Hints */}
        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center">
            {TOOL_GROUPS.map((grp) => (
              <a
                key={grp}
                href={`${allToolsHref}?group=${grp}`}
                className="flex min-h-10 items-center justify-between gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] sm:inline-flex"
              >
                <span className="truncate">{dict.home.groups[grp].title}</span>
                <span className="font-data shrink-0 rounded bg-[var(--bg-recess)] px-1.5 py-0.5 text-[11px] text-[var(--ink-muted)]">
                  {groupCounts[grp]}
                </span>
              </a>
            ))}
          </div>

          <div className="hidden items-center justify-between text-[11px] text-[var(--ink-muted)] sm:flex">
            <div className="flex items-center gap-3">
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
      </div>
    );
  }

  // =========================================================================
  // MODE 2: DEDICATED ALL TOOLS PAGE ("/tools" and "/en/tools")
  // Split-Sidebar Catalog on Desktop + Tactile Tabs on Mobile/Tablet
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
        className={`flex min-h-10 items-center justify-between gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2 text-left text-xs transition-colors lg:w-full ${
          active
            ? 'border-[var(--accent)] bg-[var(--accent-tint)] font-bold text-[var(--accent)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-card)] font-medium text-[var(--ink-primary)] hover:border-[var(--border-control)] hover:bg-[var(--bg-recess)]'
        }`}
      >
        <span className="truncate">{label}</span>
        <span
          className={`font-data rounded px-1.5 py-0.5 text-[11px] ${
            active
              ? 'bg-[var(--accent)] font-bold text-[var(--accent-ink)]'
              : 'bg-[var(--bg-recess)] text-[var(--ink-muted)]'
          }`}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <section aria-labelledby="all-tools-heading" className="space-y-7 sm:space-y-8">
      {/* Top Directory Header + Search */}
      <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-6 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <h1
              id="all-tools-heading"
              className="font-display m-0 text-[clamp(1.75rem,3.8vw,2.4rem)] leading-tight font-extrabold text-[var(--ink-primary)]"
            >
              {dict.home.catalogTitle}
            </h1>
            <span className="font-data rounded-md border border-[var(--border-subtle)] bg-[var(--bg-recess)] px-2.5 py-0.5 text-xs font-bold text-[var(--accent)]">
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
            className="h-11 w-full rounded-xl border border-[var(--border-control)] bg-[var(--bg-card)] pr-10 pl-10 text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent)] sm:text-sm"
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
      <div className="grid gap-6 lg:grid-cols-[252px_1fr] lg:items-start lg:gap-7">
        <aside className="min-w-0 space-y-2 lg:sticky lg:top-20">
          <div
            role="tablist"
            aria-label={dict.home.searchLabel}
            className="no-scrollbar -mx-4 flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 lg:flex-col"
          >
            {renderCategoryButton('all', dict.home.filterAll, liveTools.length)}
            {TOOL_GROUPS.map((grp) =>
              renderCategoryButton(grp, dict.home.groups[grp].title, groupCounts[grp]),
            )}
          </div>
        </aside>

        <div>
          {catalogTools.length === 0 ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-6 py-10 text-center">
              <h2 className="font-display m-0 text-lg font-bold text-[var(--ink-primary)]">
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
            <div className="space-y-9">
              {TOOL_GROUPS.map((grp) => {
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
                    className="space-y-3.5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                      <h2
                        id={`heading-${grp}`}
                        className="font-display m-0 text-base font-extrabold text-[var(--ink-primary)] sm:text-lg"
                      >
                        {groupMeta.title}
                      </h2>
                      <p className="m-0 text-xs text-[var(--ink-muted)]">{groupMeta.hint}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {toolsInGroup.map((tool) => {
                        const meta = dict.tools[tool.id as keyof typeof dict.tools];
                        const href = getLocalizedPath(`/${tool.slug}`, locale);

                        return (
                          <a
                            key={tool.id}
                            href={href}
                            className="group flex items-start gap-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 text-[var(--ink-primary)] no-underline transition-colors hover:border-[var(--accent)]"
                          >
                            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-recess)] text-[var(--ink-primary)] transition-colors group-hover:border-transparent group-hover:bg-[var(--accent-pill)] group-hover:text-[var(--accent-pill-ink)]">
                              <ToolGlyph icon={tool.icon} className="h-4 w-4" />
                            </span>

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                <h3 className="font-display m-0 text-sm font-bold leading-snug text-[var(--ink-primary)] group-hover:text-[var(--accent)] sm:text-[15px]">
                                  {meta.name}
                                </h3>
                                <span className="font-data shrink-0 rounded bg-[var(--bg-recess)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                                  {tool.formatLabel}
                                </span>
                              </div>

                              <p className="m-0 line-clamp-2 text-xs leading-relaxed text-[var(--ink-muted)] sm:text-[13px]">
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
        </div>
      </div>
    </section>
  );
}
