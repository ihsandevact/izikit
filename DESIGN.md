# DESIGN.md: izikit

## Design Read

Reading this as: scalable local-first multi-tool utility platform (PDF, documents, images, and everyday digital utilities) for Indonesian and global users, in a **Clean Daylight Command Launcher & Categorized Utility Catalog** style (ATM from `toowl.my.id`), dial ENERGY 2 / RHYTHM 3 / MOTION 1.

## Dials

- **ENERGY 2 (Airy & Tactile):** Warm alabaster daylight canvas (`#F7F7F5`), pure white rounded-2xl cards (`#FFFFFF`), soft recessed icon wells (`#F0F0EC`), and a fresh Mint-Emerald active pill highlight (`#6EE7B7` with deep forest ink `#052E16`).
- **RHYTHM 3 (Two-Zone Multi-Tool Architecture):**
  - **Zone 1 (Above the Fold):** Centered two-tone conversational prompt (*"Mau bereskan apa hari ini?"*) over an interactive **Spotlight Command Launcher Card** featuring live search (`/`), *Terakhir Dipakai* (`localStorage` recent tools), *Populer* tools, and keyboard navigation (`↑↓` select, `↵` open, `esc` clear), followed by quick category pills.
  - **Zone 2 (Full Catalog `#semua-tools`):** Scalable multi-category directory (*"Semua tools ¹⁵"*) organized into task-oriented sub-groups (`05`, `04`, `03`, `03`) with 3-column cards showing icon, title, status badge (`BARU` / `AI LOKAL`), diagonal launch arrow `↗`, 2-line description, and monospace format spec.
- **MOTION 1 (Functional Feedback Only):** Snappy 120ms hover/focus transitions and deterministic progress bars. Honors `prefers-reduced-motion: reduce`.

## Palette (WCAG AA Verified)

### Light Mode (Warm Alabaster & Mint-Emerald)
- Canvas background (`--bg-paper` / `--bg-canvas`): `#F7F7F5`
- Card surface (`--bg-card`): `#FFFFFF`
- Recessed well (`--bg-recess`): `#F0F0EC`
- Primary ink (`--ink-primary`): `#111315` (18.7:1 on card, 17.5:1 on canvas)
- Secondary ink (`--ink-muted`): `#5A606A` (6.25:1 on card, 5.84:1 on canvas)
- Structural hairline (`--border-subtle`): `#E5E5E0`
- Control boundary (`--border-control`): `#8C929E` (3.12:1 on card, WCAG 1.4.11 pass)
- Primary text/action accent (`--accent`): `#047857` (5.48:1 with `#FFFFFF`, 5.12:1 on canvas)
- Active pill highlight (`--accent-pill`): `#6EE7B7` paired with `--accent-pill-ink`: `#052E16` (11.4:1 contrast)
- Active launcher row (`--accent-row-bg`): `#F2FBF7` with border `--accent-row-border`: `#A7F3D0`
- Error ink (`--danger`): `#B91C1C` (6.40:1 on card)

### Dark Mode (Carbon Slate & Mint-Emerald)
- Canvas background (`--bg-paper` / `--bg-canvas`): `#0D0F12`
- Card surface (`--bg-card`): `#14171C`
- Recessed well (`--bg-recess`): `#1C2027`
- Primary ink (`--ink-primary`): `#F3F4F6` (15.7:1 on card)
- Secondary ink (`--ink-muted`): `#9CA3AF` (6.80:1 on card)
- Structural hairline (`--border-subtle`): `#242932`
- Control boundary (`--border-control`): `#5E6675` (3.18:1 on card)
- Primary accent (`--accent`): `#34D399` (8.65:1 on card, 10.2:1 with `#052E16`)
- Active pill highlight (`--accent-pill`): `#34D399` paired with `--accent-pill-ink`: `#052E16`
- Active launcher row (`--accent-row-bg`): `#11221C` with border `--accent-row-border`: `#1F4D3B`
- Error ink (`--danger`): `#F87171` (6.15:1 on card)

## Typography (Self-Hosted Offline-Ready)

- **Plus Jakarta Sans** (Display, wordmark & UI): Tight negative tracking (`-0.03em`) at bold/extrabold weights (700/800) for the conversational hero and section headings; clean 400/500/600 weights for descriptions and controls.
- **IBM Plex Mono** (Counts, keyboard shortcuts & format tags): Used with `tabular-nums` for tool counts (`15`, `05`, `04`), keyboard keycaps (`↑`, `↓`, `↵`, `esc`, `/`), and file format labels (`PDF`, `DOCX → PDF`, `JPG / PNG / WEBP`).
