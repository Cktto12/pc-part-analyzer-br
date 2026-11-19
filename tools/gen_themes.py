"""Uso: python tools/gen_themes.py styles/themes.css

Gera styles/themes.css: tokens dos temas claro (A) e escuro (C) +
remapeamento das classes Tailwind de cor fixa para os tokens."""
import sys

import os, re

out_path = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USED = set()
for fn in ("index.html", "app.js", "app_features.js", "laptop_mode.js"):
    with open(os.path.join(ROOT, fn), encoding="utf-8") as fh:
        USED.update(re.findall(r"[A-Za-z0-9:/_.\[\]#-]+", fh.read()))
# Classes montadas por template no JS (ex.: `text-${rel.color}-400`) não
# aparecem literalmente no código: inclui os tons de texto de todas as cores.
_FAMS = ("sky emerald amber rose purple violet indigo cyan teal orange red green "
         "yellow pink fuchsia lime blue").split()
for _f in _FAMS:
    for _shade in ("300", "400"):
        USED.add(f"text-{_f}-{_shade}")

DARK = {  # Tema C - Black Friday vibrante
    "--ui-font-sans": "'Outfit', -apple-system, 'Segoe UI', Roboto, sans-serif",
    "--ui-bg-canvas": "#0c0c0c",
    "--ui-bg-surface": "#161616",
    "--ui-bg-surface-glass": "rgba(22, 22, 22, 0.94)",
    "--ui-bg-elevated": "#1f1f1f",
    "--ui-bg-inset": "#1a1a1a",
    "--ui-bg-sunken": "#111111",
    "--ui-bg-popover": "#1c1c1c",
    "--ui-bg-subtle": "rgba(255, 255, 255, 0.04)",
    "--ui-bg-hover": "rgba(255, 255, 255, 0.07)",
    "--ui-bg-hover-strong": "#2a2a2a",
    "--ui-border": "rgba(255, 255, 255, 0.09)",
    "--ui-border-strong": "rgba(255, 255, 255, 0.18)",
    "--ui-text-primary": "#fafafa",
    "--ui-text-secondary": "#d6d6d6",
    "--ui-text-muted": "#a3a3a3",
    "--ui-text-faint": "#7a7a7a",
    "--ui-brand": "#ffcc00",
    "--ui-brand-hover": "#ffd93d",
    "--ui-brand-ink": "#1a1400",
    "--ui-brand-soft": "rgba(255, 204, 0, 0.14)",
    "--ui-brand-border": "rgba(255, 204, 0, 0.42)",
    "--ui-good": "#22c55e",
    "--ui-good-text": "#4ade80",
    "--ui-good-soft": "rgba(34, 197, 94, 0.14)",
    "--ui-good-border": "rgba(34, 197, 94, 0.4)",
    "--ui-warn": "#ff9f1c",
    "--ui-warn-text": "#ffb347",
    "--ui-warn-soft": "rgba(255, 159, 28, 0.14)",
    "--ui-warn-border": "rgba(255, 159, 28, 0.4)",
    "--ui-bad": "#ff4d2e",
    "--ui-bad-text": "#ff7a5c",
    "--ui-bad-soft": "rgba(255, 77, 46, 0.14)",
    "--ui-bad-border": "rgba(255, 77, 46, 0.42)",
    "--ui-compare-a": "#38bdf8",
    "--ui-compare-a-text": "#7dd3fc",
    "--ui-compare-a-soft": "rgba(56, 189, 248, 0.15)",
    "--ui-compare-a-border": "rgba(56, 189, 248, 0.4)",
    "--ui-compare-b": "#c084fc",
    "--ui-compare-b-text": "#d8b4fe",
    "--ui-compare-b-soft": "rgba(192, 132, 252, 0.15)",
    "--ui-compare-b-border": "rgba(192, 132, 252, 0.4)",
    "--ui-compare-ref": "#a3a3a3",
    "--ui-shadow-sm": "0 2px 10px -2px rgba(0, 0, 0, 0.5)",
    "--ui-shadow-md": "0 8px 24px -4px rgba(0, 0, 0, 0.55)",
    "--ui-shadow-lg": "0 16px 40px -8px rgba(0, 0, 0, 0.7)",
    "--ui-chart-grid": "rgba(255, 255, 255, 0.08)",
    "--ui-chart-tooltip": "rgba(20, 20, 20, 0.97)",
    "color-scheme": "dark",
}

LIGHT = {  # Tema A - Clara e moderna
    "--ui-font-sans": "'Plus Jakarta Sans', -apple-system, 'Segoe UI', Roboto, sans-serif",
    "--ui-bg-canvas": "#f4f5fa",
    "--ui-bg-surface": "#ffffff",
    "--ui-bg-surface-glass": "rgba(255, 255, 255, 0.94)",
    "--ui-bg-elevated": "#f1f3f9",
    "--ui-bg-inset": "#f6f7fb",
    "--ui-bg-sunken": "#eef0f6",
    "--ui-bg-popover": "#ffffff",
    "--ui-bg-subtle": "rgba(20, 22, 43, 0.03)",
    "--ui-bg-hover": "rgba(20, 22, 43, 0.05)",
    "--ui-bg-hover-strong": "#e4e7f0",
    "--ui-border": "#e4e7ef",
    "--ui-border-strong": "#cfd4e2",
    "--ui-text-primary": "#14162b",
    "--ui-text-secondary": "#3b4060",
    "--ui-text-muted": "#525773",
    "--ui-text-faint": "#71768f",
    "--ui-brand": "#5b5bf0",
    "--ui-brand-hover": "#4646d6",
    "--ui-brand-ink": "#ffffff",
    "--ui-brand-soft": "rgba(91, 91, 240, 0.1)",
    "--ui-brand-border": "rgba(91, 91, 240, 0.35)",
    "--ui-good": "#10a35f",
    "--ui-good-text": "#0b7a43",
    "--ui-good-soft": "#e3f7ec",
    "--ui-good-border": "rgba(16, 163, 95, 0.35)",
    "--ui-warn": "#d97706",
    "--ui-warn-text": "#b45309",
    "--ui-warn-soft": "#fdf1dc",
    "--ui-warn-border": "rgba(217, 119, 6, 0.35)",
    "--ui-bad": "#e5484d",
    "--ui-bad-text": "#c4232a",
    "--ui-bad-soft": "#fde8e8",
    "--ui-bad-border": "rgba(229, 72, 77, 0.35)",
    "--ui-compare-a": "#0284c7",
    "--ui-compare-a-text": "#0369a1",
    "--ui-compare-a-soft": "rgba(2, 132, 199, 0.1)",
    "--ui-compare-a-border": "rgba(2, 132, 199, 0.35)",
    "--ui-compare-b": "#7c3aed",
    "--ui-compare-b-text": "#6d28d9",
    "--ui-compare-b-soft": "rgba(124, 58, 237, 0.1)",
    "--ui-compare-b-border": "rgba(124, 58, 237, 0.35)",
    "--ui-compare-ref": "#868ba5",
    "--ui-shadow-sm": "0 1px 3px rgba(20, 22, 43, 0.06), 0 1px 2px rgba(20, 22, 43, 0.04)",
    "--ui-shadow-md": "0 6px 18px -6px rgba(20, 22, 43, 0.12)",
    "--ui-shadow-lg": "0 16px 40px -12px rgba(20, 22, 43, 0.2)",
    "--ui-chart-grid": "rgba(20, 22, 43, 0.08)",
    "--ui-chart-tooltip": "rgba(255, 255, 255, 0.98)",
    "color-scheme": "light",
}

# Tailwind v3: tons 50 / 600 / 700 de cada família colorida usada no site
PALETTE = {
    "sky": ("#f0f9ff", "#0284c7", "#0369a1"), "emerald": ("#ecfdf5", "#059669", "#047857"),
    "amber": ("#fffbeb", "#d97706", "#b45309"), "rose": ("#fff1f2", "#e11d48", "#be123c"),
    "purple": ("#faf5ff", "#9333ea", "#7e22ce"), "violet": ("#f5f3ff", "#7c3aed", "#6d28d9"),
    "indigo": ("#eef2ff", "#4f46e5", "#4338ca"), "cyan": ("#ecfeff", "#0891b2", "#0e7490"),
    "teal": ("#f0fdfa", "#0d9488", "#0f766e"), "orange": ("#fff7ed", "#ea580c", "#c2410c"),
    "red": ("#fef2f2", "#dc2626", "#b91c1c"), "green": ("#f0fdf4", "#16a34a", "#15803d"),
    "yellow": ("#fefce8", "#ca8a04", "#a16207"), "pink": ("#fdf2f8", "#db2777", "#be185d"),
    "fuchsia": ("#fdf4ff", "#c026d3", "#a21caf"), "lime": ("#f7fee7", "#65a30d", "#4d7c0f"),
    "blue": ("#eff6ff", "#2563eb", "#1d4ed8"),
}

ALPHAS = ["", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55", "60", "65", "70",
          "75", "80", "85", "90", "95"]


def esc(cls):
    return cls.replace(":", "\\:").replace("/", "\\/").replace(".", "\\.")


def variants(base):
    """Seletores para a classe base, suas variantes de opacidade e hover."""
    sels = []
    for a in ALPHAS:
        c = base + (f"/{a}" if a else "")
        if c in USED:
            sels.append(f".{esc(c)}")
        if "hover:" + c in USED:
            sels.append(f".{esc('hover:' + c)}:hover")
    return sels


def rule(scope, selectors, decl):
    if not selectors:
        return ""
    joined = ",\n".join(f"{scope} {s}" for s in selectors)
    return f"{joined} {{ {decl} }}\n"


def tokens(selector, values):
    body = "\n".join(f"  {k}: {v};" for k, v in values.items())
    return f"{selector} {{\n{body}\n}}\n"


css = []
css.append("/* ==========================================================================\n"
           "   GCA Temas — modo claro (A · Clara e moderna) e modo escuro (C · Black Friday)\n"
           "   ARQUIVO GERADO: tokens por tema + remapeamento das classes Tailwind de cor\n"
           "   fixa (slate/white e tons claros de cor) para os tokens do tema ativo.\n"
           "   ========================================================================== */\n\n")
css.append(tokens(':root,\n:root[data-theme="dark"]', DARK))
css.append(tokens(':root[data-theme="light"]', LIGHT))
css.append("""
/* Fonte do tema em todo o site; números alinhados sem fonte de código */
:root { --ui-font-mono: var(--ui-font-sans); }
html[data-theme] body {
  background-color: var(--ui-bg-canvas);
  color: var(--ui-text-primary);
  font-family: var(--ui-font-sans);
}
/* Troca de tema instantânea (sem elementos presos no meio da transição) */
html.ui-theme-switching *,
html.ui-theme-switching *::before,
html.ui-theme-switching *::after { transition: none !important; }
html[data-theme] .font-mono,
html[data-theme] .ui-mono,
html[data-theme] .font-sans,
html[data-theme] code,
html[data-theme] kbd {
  font-family: var(--ui-font-sans);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.005em;
}
html[data-theme] input,
html[data-theme] select,
html[data-theme] textarea,
html[data-theme] button { font-family: inherit; }
html[data-theme] select option { background: var(--ui-bg-surface); color: var(--ui-text-primary); }

/* Cards legados */
html[data-theme] .glass-card {
  background: var(--ui-bg-surface-glass);
  border-color: var(--ui-border);
  box-shadow: var(--ui-shadow-sm);
}
html[data-theme] .glass-elevated {
  background: var(--ui-bg-inset);
  border-color: var(--ui-border);
}
html[data-theme] :focus-visible { outline-color: var(--ui-brand); }
html[data-theme] input[type="range"] { accent-color: var(--ui-brand); }

/* Selo do logo na cor da marca */
html[data-theme] .bg-gradient-to-br.from-sky-400.to-indigo-600 {
  background: var(--ui-brand);
  color: var(--ui-brand-ink);
  box-shadow: none;
}

/* Seletor de tema no topo */
.ui-theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 2.125rem;
  padding: 0 0.75rem;
  border-radius: var(--ui-radius-pill);
  border: 1px solid var(--ui-border-strong);
  background: var(--ui-bg-subtle);
  color: var(--ui-text-secondary);
  font-size: var(--ui-text-label);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--ui-transition), color var(--ui-transition), border-color var(--ui-transition);
}
.ui-theme-toggle:hover { background: var(--ui-bg-hover); color: var(--ui-text-primary); border-color: var(--ui-brand-border); }
.ui-theme-toggle svg { width: 1rem; height: 1rem; flex-shrink: 0; }
.ui-theme-toggle .ui-theme-icon-sun { display: none; }
:root[data-theme="dark"] .ui-theme-toggle .ui-theme-icon-sun { display: block; }
:root[data-theme="dark"] .ui-theme-toggle .ui-theme-icon-moon { display: none; }
@media (max-width: 640px) { .ui-theme-toggle .ui-theme-label { display: none; } .ui-theme-toggle { padding: 0 0.5rem; } }

""")

# ---- Neutros (slate/white) -> tokens, valem para os dois temas ----
neutral_bg = {
    "bg-slate-950": "var(--ui-bg-sunken)",
    "bg-slate-900": "var(--ui-bg-inset)",
    "bg-slate-800": "var(--ui-bg-elevated)",
    "bg-slate-700": "var(--ui-bg-hover-strong)",
    "bg-slate-600": "var(--ui-border-strong)",
    "bg-slate-500": "var(--ui-text-faint)",
    "bg-slate-400": "var(--ui-text-faint)",
}
neutral_text = {
    "text-white": "var(--ui-text-primary)",
    "text-slate-50": "var(--ui-text-primary)",
    "text-slate-100": "var(--ui-text-primary)",
    "text-slate-200": "var(--ui-text-primary)",
    "text-slate-300": "var(--ui-text-secondary)",
    "text-slate-400": "var(--ui-text-muted)",
    "text-slate-500": "var(--ui-text-faint)",
    "text-slate-600": "var(--ui-text-faint)",
}
neutral_border = {
    "border-slate-900": "var(--ui-border)",
    "border-slate-800": "var(--ui-border)",
    "border-slate-700": "var(--ui-border-strong)",
    "border-slate-600": "var(--ui-border-strong)",
    "border-slate-500": "var(--ui-border-strong)",
}
css.append("/* Neutros Tailwind -> tokens do tema */\n")
for cls, val in neutral_bg.items():
    css.append(rule("html[data-theme]", variants(cls), f"background-color: {val};"))
for cls, val in neutral_text.items():
    css.append(rule("html[data-theme]", variants(cls), f"color: {val};"))
for cls, val in neutral_border.items():
    css.append(rule("html[data-theme]", variants(cls), f"border-color: {val};"))
css.append(rule("html[data-theme]", [".ring-slate-500\\/40"], "--tw-ring-color: var(--ui-border-strong);"))

# Texto branco sobre botões coloridos sólidos continua branco
solid_bgs = []
for fam in PALETTE:
    for shade in ("400", "500", "600"):
        if f"bg-{fam}-{shade}" in USED:
            solid_bgs.append(f".bg-{fam}-{shade}.text-white")
css.append(rule("html[data-theme]", solid_bgs, "color: #ffffff;"))

# ---- Modo claro: tons claros de cor (feitos para fundo escuro) ficam escuros ----
css.append("\n/* Modo claro: contraste dos textos coloridos e fundos tingidos */\n")
light = ':root[data-theme="light"]'
for fam, (c50, c600, c700) in PALETTE.items():
    sels700 = []
    for shade in ("100", "200", "300", "400"):
        sels700 += variants(f"text-{fam}-{shade}")
    css.append(rule(light, sels700, f"color: {c700};"))
    css.append(rule(light, variants(f"text-{fam}-500"), f"color: {c600};"))
    sels_bg = []
    for shade in ("900", "950"):
        sels_bg += variants(f"bg-{fam}-{shade}")
    css.append(rule(light, sels_bg, f"background-color: {c50};"))
    css.append(rule(light, variants(f"border-{fam}-900"), f"border-color: {c50};"))

# Texto escuro de botões sólidos (text-slate-950) segue escuro no claro; no
# escuro C os botões amarelos usam a tinta da marca.
css.append(f"{light} .bg-white {{ background-color: #ffffff; }}\n")

with open(out_path, "w", encoding="utf-8", newline="\n") as f:
    f.write("".join(css))
print("ok", sum(len(x) for x in css))
