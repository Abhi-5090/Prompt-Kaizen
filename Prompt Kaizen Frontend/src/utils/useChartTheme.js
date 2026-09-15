import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';

/**
 * Resolved colour values for charts.
 *
 * Recharts takes colours as props (`stroke`, `fill`, `contentStyle`), not as
 * class names, so it cannot use the Tailwind tokens the rest of the UI is
 * built from. Left hardcoded, every axis, gridline and tooltip stays
 * light-themed — white gridlines vanish on a dark canvas and the tooltip
 * renders dark-on-dark.
 *
 * This reads the CSS custom properties back off the document, so charts stay
 * in step with the tokens automatically rather than duplicating their values.
 */
function readToken(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  // Tokens are stored as space-separated RGB channels for Tailwind's
  // <alpha-value> support, so they need assembling into a usable colour.
  return raw ? `rgb(${raw.split(/\s+/).join(' ')})` : fallback;
}

export function useChartTheme() {
  const { resolved } = useTheme();
  const [palette, setPalette] = useState(() => build());

  function build() {
    return {
      brand:      readToken('brand', '#F15D23'),
      brandSoft:  readToken('brand-hover', '#F15D49'),
      axis:       readToken('ink-muted', '#6c757d'),
      grid:       readToken('border', '#dee2e6'),
      text:       readToken('ink', '#212529'),
      surface:    readToken('surface-raised', '#ffffff'),
      positive:   readToken('positive', '#228b57'),
      danger:     readToken('danger', '#c82d2d'),
      // Ready-made props for Recharts' tooltip, which needs inline styles.
      tooltip: {
        contentStyle: {
          background: readToken('surface-raised', '#ffffff'),
          border: `1px solid ${readToken('border', '#dee2e6')}`,
          borderRadius: 12,
          color: readToken('ink', '#212529'),
          boxShadow: '0 10px 30px -12px rgb(0 0 0 / 0.25)',
        },
        labelStyle: { color: readToken('ink', '#212529'), fontWeight: 600 },
        itemStyle: { color: readToken('ink-soft', '#495057') },
      },
    };
  }

  // Re-read after the theme attribute has been applied to <html>. The extra
  // frame matters: reading synchronously during the same render returns the
  // OLD values, because the attribute change has not been committed yet.
  useEffect(() => {
    const id = requestAnimationFrame(() => setPalette(build()));
    return () => cancelAnimationFrame(id);
  }, [resolved]);

  return palette;
}
