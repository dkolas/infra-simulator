# UI checklist

Run before reporting UI work as done. Fix failures rather than listing them.

## Visual

- [ ] Uses the project tokens. No raw hex, no one-off spacing or font sizes.
- [ ] Hierarchy is readable at a glance: one primary action per view, clear headings.
- [ ] Consistent with neighboring screens and components.
- [ ] Looks correct at about 400px and about 1280px. Body does not scroll horizontally.
- [ ] Does not match one of the generic default clusters in design-direction.md.

## States

- [ ] Loading, empty, error, and success states all exist and look intentional.
- [ ] Long text, long lists, and missing data do not break the layout.

## Accessibility

- [ ] Semantic elements used. Headings are in order. Form controls have labels.
- [ ] Every interactive element is reachable and operable with the keyboard, with a visible focus ring.
- [ ] Text contrast meets WCAG AA. Color is never the only carrier of meaning.
- [ ] Images have alt text. Meaningful icons have labels. Decorative ones are aria-hidden.
- [ ] Motion respects prefers-reduced-motion.

## Code

- [ ] Component has one responsibility and a small, typed prop surface.
- [ ] State lives as close to its use as possible.
- [ ] No new dependency for something the platform or existing code already provides.
- [ ] No dead code, commented-out blocks, or leftover debug output.
- [ ] Renders without console errors or warnings.
