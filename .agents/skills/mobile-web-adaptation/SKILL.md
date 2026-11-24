---
name: mobile-web-adaptation
description: "Mobile-first web UI adaptation skill combining responsive touch UX, theme-token isolation, bottom navigation, bottom-sheet pickers, and data-table-to-card transformations without altering desktop/PC layouts."
---

# Mobile Web Adaptation

Use this skill when adapting a desktop-heavy web analyzer or dashboard to phones (`<= 768px`) without disturbing the PC experience (`> 768px`).

## Core Isolation Rules

1. **Strict Breakpoint Scoping**: Wrap all mobile layout overrides in `@media (max-width: 768px)` and explicitly hide mobile-only toolbars/controls above `768px` (`@media (min-width: 769px)`).
2. **Preserve Desktop Behavior**: Never mutate desktop JS computation logic, desktop DOM structure, or desktop CSS grids/tables.
3. **Theme Token Parity**: Always style mobile surfaces, borders, text, and active states via CSS custom properties (`var(--ui-bg-surface)`, `var(--ui-border)`, `var(--ui-text-primary)`, `var(--ui-brand)`) so Light and Dark modes stay consistent.

## Mobile UX Patterns

- **Thumb-First Bottom Navigation (`<= 5` items)**: Use vector SVG icons with concise 1-word labels, `min-height: 48px` targets, and `env(safe-area-inset-bottom)` clearance. Add bottom padding to main content so nothing is hidden behind the fixed bar.
- **Touch Targets & Input Zoom Prevention**: Keep clickable controls `>= 42–44px` tall with `>= 8px` spacing (`gap-2`), and enforce `font-size: 16px` on mobile `<input>` / `<select>` elements so iOS Safari does not auto-zoom on focus.
- **Data Tables to Mobile Cards**: On screens `<= 768px`, transform wide `.ui-table` comparison tables into vertical stacked cards by hiding `<thead>`, flexing `<tr>` into rounded cards, promoting rank + item title into a header row, arranging key metrics 2-up (`calc(50% - 0.5rem)`) with `td[data-label]::before`, and placing full-width verdicts + action buttons along the bottom — always offering a `Cards / Tabela` toggle for power users.
- **Bottom-Sheet Selectors & Swipeable Filter Strips**: Position long searchable dropdowns (`.gca-combo-panel`) as bottom sheets within thumb reach (`max-height: 62vh`) and keep filter chip rows horizontally scrollable without triggering body overflow.
- **Zero Horizontal Overflow**: Verify `document.documentElement.scrollWidth <= window.innerWidth` across `375px–430px` viewports.
