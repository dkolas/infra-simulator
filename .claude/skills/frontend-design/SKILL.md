---
name: frontend-design
description: Design direction and UI code standards for this project's frontend. Applies whenever UI is created or changed - components, pages, layouts, styles, CSS, HTML, or client-side interaction code. Use when the user asks to build, style, restyle, or polish any screen or component, or when a task touches frontend files.
user-invocable: false
---

# Frontend design

Two jobs, always together: make deliberate visual choices, and write UI code that survives the next iteration. This is a proof of concept, so prefer platform primitives and a small component set over a design-system dependency, and keep decisions reversible.

## Before writing UI code

1. Read **Project direction** below. If it is filled in, use those tokens. If it is still TODO, propose a direction using [design-direction.md](design-direction.md), confirm it, and record it there before building the first screen.
2. Look at existing components for conventions: naming, file layout, styling approach, state handling. Match them.
3. List every state the UI must handle: loading, empty, error, partial, success. Design all of them, not only the happy path.

## Design rules

- Commit to one direction and spend boldness in one place: typography, color, or layout. Everything else stays quiet.
- Encode meaning, do not decorate. A border, divider, color, or weight change should tell the user something.
- Typography: choose typefaces for this product, at most two families. Body line length 45 to 80 characters. Build hierarchy with size and weight, not all-caps labels or a single accented word.
- Color: 4 to 6 named tokens with roles (surface, text, muted, accent, danger, success). Text meets WCAG AA contrast: 4.5:1 for body, 3:1 for large text and UI borders.
- Spacing: one scale (4px base or the framework's equivalent). No ad-hoc pixel values.
- Motion only in response to user action (open, expand, confirm), 150 to 300ms, and honors `prefers-reduced-motion`.
- Avoid the generic default clusters listed in [design-direction.md](design-direction.md).

## UI code rules

- Semantic HTML first: `button` for actions, `a` for navigation, headings in order, real lists, labelled form controls. Add ARIA only when no native element fits.
- Keyboard: every interactive element is focusable, shows a visible focus ring, and responds to Enter, Space, and Escape as users expect.
- Tokens live in CSS custom properties or the framework's theme. Components reference tokens, never raw hex values or magic numbers.
- Components have one responsibility. Props are the API. Keep state next to where it is used; lift it only when it is actually shared.
- Keep data fetching and state logic separate from presentation when doing so stays simple. Do not add a layer for a component with no logic.
- Responsive by default: fluid layouts, relative units, no fixed widths wider than the viewport. Check at roughly 400px and 1280px. The page body never scrolls horizontally.
- Do not add a dependency for something CSS or the platform already does.
- Every async or interactive component renders loading, empty, and error states explicitly.
- Images have alt text. Icons that carry meaning have accessible labels. Decorative icons are hidden from assistive technology.

## Project direction

Old-school sci-fi terminal. Decided 2026-09-13 from docs/concept.md. This direction deliberately sits near the "dark neon" default cluster; what keeps it intentional is restraint: one phosphor color, no glow, no gradients, color only for state.

- **Product feel:** a 1980s mission-control console. Dense, calm, readable at a glance. Retro is the frame, the data is the hero. No jokes in the copy.
- **Typefaces:** one monospace family for everything, IBM Plex Mono with a system monospace fallback. Display text is the same face at a larger size, not a heavier weight. Uppercase only for short panel titles.
- **Color tokens:**
  - `--bg` #0a0e0a (near-black with a green cast)
  - `--surface` #101810 (panel fill)
  - `--line` #1f3a24 (borders, gridlines)
  - `--text` #5cff8a (phosphor green, primary)
  - `--muted` #2f8a4d (secondary text, idle state)
  - `--warn` #ffb000 (amber: degraded, cold-starting, interactive focus)
  - `--danger` #ff4d4d (dead, error)
  All text tokens meet WCAG AA on `--bg` and `--surface`.
- **Spacing scale:** 4px base. Panel padding 12px, gaps 8px, section gaps 16px.
- **Layout principle:** a fixed grid of boxed panels with 1px `--line` borders. Square corners, no shadows. Schematic top, controls beside it, charts below. Component configuration opens in a drawer on click. At most one subtle scanline overlay, toggleable, off by default.
- **Defining constraint:** monochrome phosphor green everywhere. Any other color means state: amber is degraded or warming, red is failed. If a color appears without a state behind it, remove it.

## Before finishing UI work

Run through [ui-checklist.md](ui-checklist.md). Fix what fails before reporting the work as done.
