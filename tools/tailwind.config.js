// Gera styles/tailwind.css (substitui o Tailwind via CDN).
// Rodar a partir da raiz do repositório:
//   npx tailwindcss@3.4.17 -c tools/tailwind.config.js -i tools/tailwind.input.css -o styles/tailwind.css --minify
const COLORS = 'sky|emerald|amber|rose|purple|violet|indigo|cyan|teal|orange|red|green|yellow|pink|fuchsia|lime|blue|slate';

module.exports = {
  darkMode: 'class',
  content: ['./index.html', './app.js', './app_features.js', './laptop_mode.js', './styles/combo.js'],
  // Classes montadas por template no JS (ex.: `text-${rel.color}-400`)
  safelist: [{ pattern: new RegExp(`^text-(${COLORS})-(300|400)$`) }],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--ui-font-sans)'],
        mono: ['var(--ui-font-sans)'],
      },
      colors: {
        bgMain: '#090d16',
        bgCard: '#111827',
        bgElevated: '#1e293b',
        accentBlue: '#38bdf8',
        accentEmerald: '#10b981',
        accentPurple: '#a855f7',
        accentAmber: '#f59e0b',
        accentRose: '#f43f5e',
      },
    },
  },
};
