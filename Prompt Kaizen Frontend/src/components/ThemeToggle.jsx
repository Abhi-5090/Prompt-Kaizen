import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';

const OPTIONS = [
  { value: 'light',  label: 'Light',  Icon: Sun },
  { value: 'dark',   label: 'Dark',   Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * Three-state theme control.
 *
 * A two-state switch cannot express "follow my system", which is the default
 * and the state most people should stay in — so all three are exposed rather
 * than hidden behind a long-press or a settings page.
 *
 * `compact` renders a single cycling button for the mobile bar, where a
 * segmented control does not fit.
 */
export default function ThemeToggle({ compact = false }) {
  const { theme, setTheme, cycleTheme, resolved } = useTheme();

  if (compact) {
    const current = OPTIONS.find((o) => o.value === theme) || OPTIONS[2];
    return (
      <button
        type="button"
        onClick={cycleTheme}
        className="btn-ghost p-2"
        // The visible icon shows the SETTING; the label announces both the
        // setting and what it currently resolves to, which a screen-reader
        // user cannot infer from the icon.
        aria-label={`Theme: ${current.label}${theme === 'system' ? ` (currently ${resolved})` : ''}. Activate to change.`}
        title={`Theme: ${current.label}`}
      >
        <current.Icon className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-sunken p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            title={label}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
              active
                ? 'bg-surface text-ink shadow-ring'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
