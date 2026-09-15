import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'pk_theme';
const ThemeContext = createContext(null);

/**
 * Theme state: 'light' | 'dark' | 'system'.
 *
 * 'system' is the default and is a real third state, not a synonym for
 * whichever theme is currently active — someone on 'system' should follow
 * their OS when it changes at sunset, which is why the media query is watched
 * rather than read once at boot.
 *
 * The <html data-theme> attribute is set by an inline script in index.html
 * before first paint. This provider re-applies it on change; it must agree
 * with that script, so the resolution logic is duplicated there deliberately.
 */
function systemPrefersDark() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    // Private browsing or blocked site data — fall back rather than throw.
    return 'system';
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Follow the OS while on 'system'.
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);

    // Colour-transition only while switching, so the whole page does not
    // animate its colours on every unrelated re-render.
    root.setAttribute('data-theme-transition', '');
    const t = setTimeout(() => root.removeAttribute('data-theme-transition'), 220);

    // Keeps the mobile browser chrome (address bar) in step with the page.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', resolved === 'dark' ? '#101316' : '#fafafa');
    }
    return () => clearTimeout(t);
  }, [resolved]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* non-fatal */ }
  }, []);

  // Cycles light → dark → system, so the toggle can reach every state.
  const cycleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, cycleTheme, isDark: resolved === 'dark' }),
    [theme, resolved, setTheme, cycleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
