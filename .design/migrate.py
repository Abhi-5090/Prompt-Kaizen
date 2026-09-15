#!/usr/bin/env python3
"""
One-pass migration from the legacy flame/cream scales to semantic tokens.

Order matters: longer/more specific patterns are applied before shorter ones
so `border-flame-100` is not first mangled by a `flame-1` rule. Every mapping
is keyed on the ROLE the old class played, which is why this cannot be a
mechanical find/replace on the colour value alone — `flame-900` was primary
text in `text-flame-900` and a dark panel in `bg-flame-900`, and those two go
opposite ways in dark mode.
"""
import re, sys, pathlib

MAPPINGS = [
    # --- Inverted dark panels (must stay dark in both themes) -------------
    (r'\bbg-flame-900\b',     'bg-panel'),
    (r'\bbg-flame-950\b',     'bg-panel'),
    (r'\bbg-flame-800\b',     'bg-panel'),
    (r'\bborder-flame-900\b', 'border-panel'),
    (r'\bborder-flame-800\b', 'border-panel'),
    (r'\bhover:bg-flame-900\b','hover:bg-panel'),
    (r'\bhover:border-flame-900\b','hover:border-panel'),

    # --- Text on those panels --------------------------------------------
    (r'\btext-cream-100\b',   'text-panel-fg'),
    (r'\btext-cream-50\b',    'text-panel-fg'),
    (r'\btext-cream-200\b',   'text-panel-soft'),
    (r'\btext-cream-300\b',   'text-panel-soft'),
    (r'\bhover:text-cream-100\b', 'hover:text-panel-fg'),

    # --- Body text --------------------------------------------------------
    (r'\btext-flame-900\b',   'text-ink'),
    (r'\btext-flame-800\b',   'text-ink'),
    (r'\btext-flame-700\b',   'text-ink-soft'),
    (r'\btext-cream-700\b',   'text-ink-muted'),
    (r'\btext-cream-800\b',   'text-ink-soft'),
    (r'\btext-cream-900\b',   'text-ink-soft'),
    (r'\btext-flame-300\b',   'text-ink-faint'),
    (r'\btext-cream-600\b',   'text-ink-faint'),
    (r'\bhover:text-flame-900\b', 'hover:text-ink'),
    (r'\bhover:text-flame-700\b', 'hover:text-ink-soft'),

    # --- Brand as text / accent ------------------------------------------
    (r'\btext-flame-500\b',   'text-brand-text'),
    (r'\btext-flame-400\b',   'text-brand-text'),
    (r'\btext-flame-600\b',   'text-brand-text'),
    (r'\bhover:text-flame-500\b', 'hover:text-brand-text'),
    (r'\bhover:text-flame-400\b', 'hover:text-brand-text'),

    # --- Brand as fill ----------------------------------------------------
    (r'\bbg-flame-500\b',     'bg-brand'),
    (r'\bbg-flame-600\b',     'bg-brand-hover'),
    (r'\bbg-flame-400\b',     'bg-brand-hover'),
    (r'\bhover:bg-flame-500\b','hover:bg-brand'),
    (r'\bhover:bg-flame-600\b','hover:bg-brand-hover'),
    (r'\bborder-flame-500\b', 'border-brand'),
    (r'\bborder-flame-400\b', 'border-brand'),
    (r'\bhover:border-flame-500\b','hover:border-brand'),
    (r'\bring-flame-300\b',   'ring-brand'),
    (r'\bring-flame-500\b',   'ring-brand'),
    (r'\bfocus:ring-flame-300\b','focus:ring-brand'),
    (r'\bfocus:border-flame-500\b','focus:border-brand'),

    # --- Borders ----------------------------------------------------------
    (r'\bborder-flame-50\b',  'border-line'),
    (r'\bborder-flame-100\b', 'border-line'),
    (r'\bborder-flame-200\b', 'border-line'),
    (r'\bborder-flame-300\b', 'border-line-strong'),
    (r'\bborder-cream-200\b', 'border-line'),
    (r'\bborder-cream-300\b', 'border-line'),
    (r'\bborder-cream-400\b', 'border-line'),
    (r'\bborder-cream-500\b', 'border-line'),
    (r'\bborder-cream-100\b', 'border-line'),
    (r'\bhover:border-flame-300\b','hover:border-line-strong'),
    (r'\bdivide-flame-100\b', 'divide-line'),
    (r'\bdivide-cream-200\b', 'divide-line'),

    # --- Surfaces ---------------------------------------------------------
    (r'\bbg-white\b',         'bg-surface'),
    (r'\bbg-cream-50\b',      'bg-surface'),
    (r'\bbg-cream-100\b',     'bg-surface-sunken'),
    (r'\bbg-cream-200\b',     'bg-surface-sunken'),
    (r'\bbg-cream-300\b',     'bg-surface-sunken'),
    (r'\bbg-flame-50\b',      'bg-surface-sunken'),
    (r'\bbg-flame-100\b',     'bg-surface-sunken'),
    (r'\bhover:bg-cream-50\b','hover:bg-surface-sunken'),
    (r'\bhover:bg-cream-100\b','hover:bg-surface-sunken'),
    (r'\bhover:bg-cream-200\b','hover:bg-surface-sunken'),

    # --- Text that sits on a brand fill -----------------------------------
    # `text-white` on a brand button is correct in both themes, so it maps to
    # the token rather than being left as a literal.
    (r'\btext-white\b',       'text-brand-fg'),
    (r'\bbg-white\/(\d+)\b',  r'bg-surface/\1'),
]

def migrate(path):
    src = original = path.read_text()
    for pattern, repl in MAPPINGS:
        src = re.sub(pattern, repl, src)
    if src != original:
        path.write_text(src)
        return sum(1 for p, _ in MAPPINGS if re.search(p, original))
    return 0

if __name__ == '__main__':
    roots = sys.argv[1:]
    total_files = 0
    for root in roots:
        for path in pathlib.Path(root).rglob('*'):
            if path.suffix in ('.jsx', '.js', '.css') and path.is_file():
                if migrate(path):
                    total_files += 1
                    print(f'  {path}')
    print(f'\n{total_files} files migrated')
