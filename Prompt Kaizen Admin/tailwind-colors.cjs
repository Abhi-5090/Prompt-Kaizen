/**
 * Shared Tailwind colour mapping, generated from .design/tokens.css.
 *
 * Every entry resolves to a CSS variable, so a single `data-theme` change on
 * <html> re-themes the whole app with no class churn. The `<alpha-value>`
 * placeholder keeps Tailwind's opacity modifiers working (`bg-surface/70`).
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  // Text
  ink: {
    DEFAULT: token('ink'),
    soft:    token('ink-soft'),
    muted:   token('ink-muted'),
    faint:   token('ink-faint'),
  },
  // Surfaces
  canvas:  token('canvas'),
  surface: {
    DEFAULT: token('surface'),
    raised:  token('surface-raised'),
    sunken:  token('surface-sunken'),
  },
  // Borders (also usable as bg for dividers)
  line: {
    DEFAULT: token('border'),
    strong:  token('border-strong'),
  },
  // Brand
  brand: {
    DEFAULT: token('brand'),
    hover:   token('brand-hover'),
    fg:      token('brand-fg'),
    text:    token('brand-text'),
    // Decorative only — never put small text on this.
    vivid:   token('brand-vivid'),
  },
  // Inverted panel
  panel: {
    DEFAULT: token('panel'),
    fg:      token('panel-fg'),
    soft:    token('panel-fg-soft'),
  },
  // Feedback
  positive: token('positive'),
  warning:  token('warning'),
  danger:   token('danger'),
};
