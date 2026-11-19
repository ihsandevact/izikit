# DESIGN.md: izikit

## Design Read

Reading this as: local-first document and image utility workbench for Indonesian and global daily users, in a warm archival paper-and-ink stationery workbench style, dial ENERGY 2 / RHYTHM 2 / MOTION 1.

## Dials

- **ENERGY 2 (Balanced):** Warm, tactile, and immediately usable without flashy neon effects or sterile grey defaults.
- **RHYTHM 2 (Consistent with deliberate breaks):** Homepage pairs a direct workbench header and live tool filter with prominent active tool cards, followed by a quiet upcoming Fase 1 index and a transparent local-processing breakdown. Tool pages place the active workbench above the fold as the single focal point, followed by quiet usage notes.
- **MOTION 1 (Functional feedback only):** Crisp hover, active press, and progress bar transitions only. No endless pulses, floating loops, or decorative entrance choreography. Honors `prefers-reduced-motion: reduce`.

## Palette (WCAG AA Verified via contrast-check.py)

Active palette stays within 2 core surface/ink neutrals plus 1 deliberate accent (vermilion ink stamp) and semantic status tones:

### Light Mode (Archival Paper & Sumi Ink)
- Canvas background (`--bg-paper`): `#F7F4EE`
- Sheet surface (`--bg-card`): `#FFFFFF`
- Recessed dropzone (`--bg-recess`): `#EFEAE0`
- Primary ink (`--ink-primary`): `#181615` (16.43:1 on paper)
- Secondary ink (`--ink-muted`): `#57524B` (7.05:1 on paper, 6.45:1 on recess)
- Structural hairline (`--border-subtle`): `#D8D1C4`
- Control boundary (`--border-control`): `#857D71` (3.70:1 on paper, WCAG 1.4.11 pass)
- Primary accent (`--accent`): `#B93815` (5.77:1 with `#FFFFFF`, 5.26:1 on paper)
- Success ink (`--success`): `#1F6B48` (5.88:1 on paper)
- Error ink (`--danger`): `#B42318` (5.63:1 on paper)

### Dark Mode (Drafting Table Slate & Warm Ivory)
- Canvas background (`--bg-paper`): `#141311`
- Sheet surface (`--bg-card`): `#1D1B18`
- Recessed dropzone (`--bg-recess`): `#26231F`
- Primary ink (`--ink-primary`): `#F4F0E8` (16.34:1 on slate)
- Secondary ink (`--ink-muted`): `#B6AEA2` (8.46:1 on slate, 7.12:1 on recess)
- Structural hairline (`--border-subtle`): `#34302B`
- Control boundary (`--border-control`): `#827A70` (4.06:1 on card, WCAG 1.4.11 pass)
- Primary accent (`--accent`): `#EB7A53` (6.58:1 with `#141311`, 6.09:1 on card)
- Success ink (`--success`): `#62C395` (7.99:1 on card)
- Error ink (`--danger`): `#F07167` (6.36:1 on card)

## Typography (Self-Hosted Offline-Ready)

- **Fraunces** (Display & wordmark): Gives izikit an unmistakable archival stationery voice instead of generic tech sans.
- **Plus Jakarta Sans** (UI & body): Designed for high legibility across Indonesian and English prose at all sizes.
- **IBM Plex Mono** (Data figures only): Used strictly with `tabular-nums` for file sizes, page counts, dimensions, and byte savings.

## Identity Motif & One-Line Reasons (R-31)

- **Color:** Warm archival paper and vermilion stamp ink directly evoke handling physical documents and proofs on a desk, separating izikit from blue-purple SaaS templates.
- **Layout:** Each tool page puts the Dropzone/Workbench immediately at top-of-page so returning users finish in seconds, while SEO documentation stays cleanly below the workspace.
- **Elevation & Radius:** Flat sheets with crisp 1px rules and a tight radius scale (`4px` tags, `8px` controls, `12px` workbench cards); subtle 2px tactile press offset on primary actions replaces soft floating shadows.
- **Icons:** Custom geometric inline SVGs depicting folded sheets, document stacks, and crop/compress frames keep iconography tied directly to document and image manipulation.
- **Logo (R-23 placeholder note):** Uses a typographic Fraunces `izikit` wordmark paired with a simple folded-sheet SVG mark until a final custom brand asset is supplied.
