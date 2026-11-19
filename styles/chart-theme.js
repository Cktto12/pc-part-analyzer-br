/* ==========================================================================
   GCA Chart.js Theme — Tema único para todos os gráficos (Fase 0)
   Carregado logo após chart.umd.min.js.
   ========================================================================== */
(function () {
  function readCssVar(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function buildPalette() {
    return {
      brand: readCssVar('--ui-brand', '#38bdf8'),
      good: readCssVar('--ui-good', '#10b981'),
      warn: readCssVar('--ui-warn', '#f59e0b'),
      bad: readCssVar('--ui-bad', '#ef4444'),
      compareA: readCssVar('--ui-compare-a', '#38bdf8'),
      compareAFill: 'rgba(56, 189, 248, 0.18)',
      compareB: readCssVar('--ui-compare-b', '#a78bfa'),
      compareBFill: 'rgba(167, 139, 250, 0.18)',
      ref: readCssVar('--ui-compare-ref', '#94a3b8'),
      textPrimary: readCssVar('--ui-text-primary', '#f1f5f9'),
      textSecondary: readCssVar('--ui-text-secondary', '#cbd5e1'),
      textMuted: readCssVar('--ui-text-muted', '#94a3b8'),
      grid: readCssVar('--ui-chart-grid', 'rgba(148, 163, 184, 0.12)'),
      gridStrong: readCssVar('--ui-border-strong', 'rgba(148, 163, 184, 0.22)'),
      tooltipBg: readCssVar('--ui-chart-tooltip', 'rgba(11, 18, 32, 0.96)'),
      tooltipBorder: readCssVar('--ui-border-strong', 'rgba(148, 163, 184, 0.28)'),
      fontSans: readCssVar('--ui-font-sans', "'Plus Jakarta Sans', sans-serif"),
      fontMono: readCssVar('--ui-font-sans', "'Plus Jakarta Sans', sans-serif")
    };
  }

  function applyChartTheme() {
    if (typeof window.Chart === 'undefined') return;
    const C = window.Chart;
    const P = buildPalette();
    if (window.GCA_CHART_THEME) window.GCA_CHART_THEME.palette = P;

    // Defaults globais de tipografia e cor
    C.defaults.color = P.textSecondary;
    C.defaults.borderColor = P.grid;
    C.defaults.font.family = P.fontSans;
    C.defaults.font.size = 12;
    C.defaults.font.weight = 500;

    // Tooltip unificado
    const tt = C.defaults.plugins.tooltip;
    tt.backgroundColor = P.tooltipBg;
    tt.borderColor = P.tooltipBorder;
    tt.borderWidth = 1;
    tt.cornerRadius = 10;
    tt.padding = 12;
    tt.titleColor = P.textPrimary;
    tt.titleFont = { family: P.fontSans, size: 13, weight: '700' };
    tt.bodyColor = P.textSecondary;
    tt.bodyFont = { family: P.fontSans, size: 12, weight: '500' };
    tt.footerColor = P.textMuted;
    tt.boxPadding = 5;
    tt.usePointStyle = true;

    // Legenda unificada
    const lg = C.defaults.plugins.legend;
    lg.labels.color = P.textSecondary;
    lg.labels.usePointStyle = true;
    lg.labels.pointStyle = 'circle';
    lg.labels.boxWidth = 8;
    lg.labels.boxHeight = 8;
    lg.labels.padding = 14;
    lg.labels.font = { family: P.fontSans, size: 12, weight: '600' };

    // Elementos de linha e ponto mais limpos
    if (C.defaults.elements) {
      if (C.defaults.elements.line) {
        C.defaults.elements.line.borderWidth = 2;
        C.defaults.elements.line.tension = 0.25;
      }
      if (C.defaults.elements.point) {
        C.defaults.elements.point.hoverRadius = 6;
        C.defaults.elements.point.hoverBorderWidth = 2;
      }
    }

    // Plugin leve para harmonizar opções locais antigas (ex.: fontes < 12px em escalas)
    function styleScales(chart) {
        const P = (window.GCA_CHART_THEME && window.GCA_CHART_THEME.palette) || buildPalette();
        const opts = chart.options || {};
        const scales = opts.scales || {};
        Object.keys(scales).forEach((key) => {
          const sc = scales[key];
          if (!sc) return;
          if (sc.grid) sc.grid.color = P.grid;
          if (sc.angleLines) sc.angleLines.color = P.gridStrong;
          if (sc.pointLabels) {
            const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
            const targetSize = isNarrow ? 10 : Math.max(12, (sc.pointLabels.font && sc.pointLabels.font.size) || 12);
            sc.pointLabels.color = P.textSecondary;
            sc.pointLabels.padding = isNarrow ? 4 : 8;
            sc.pointLabels.font = Object.assign({}, sc.pointLabels.font, {
              family: P.fontSans,
              size: targetSize,
              weight: '600'
            });
          }
          if (sc.ticks && sc.ticks.display !== false) {
            sc.ticks.color = P.textMuted;
            sc.ticks.font = Object.assign({}, sc.ticks.font, {
              family: P.fontMono,
              size: Math.max(11, (sc.ticks.font && sc.ticks.font.size) || 12)
            });
          }
        });
        const pl = opts.plugins || {};
        if (pl.tooltip) {
          pl.tooltip.backgroundColor = P.tooltipBg;
          pl.tooltip.borderColor = P.tooltipBorder;
          pl.tooltip.titleColor = P.textPrimary;
          pl.tooltip.bodyColor = P.textSecondary;
        }
        if (pl.legend && pl.legend.labels) pl.legend.labels.color = P.textSecondary;
    }

    const gcaThemePlugin = {
      id: 'gcaChartTheme',
      beforeInit: styleScales,
      beforeUpdate: styleScales
    };

    try {
      C.register(gcaThemePlugin);
    } catch (_) {
      // Já registrado
    }

    // API pública reutilizável nas Fases 2–6 (ex.: sparklines da tabela CB)
    window.GCA_CHART_THEME = {
      palette: P,
      refresh() {
        applyChartTheme();
        const inst = C.instances ? Object.values(C.instances) : [];
        inst.forEach((ch) => { try { ch.update('none'); } catch (_) {} });
      },
      getColors: buildPalette,
      sparklineOptions() {
        return {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          events: [],
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          },
          scales: {
            x: { display: false },
            y: { display: false }
          },
          elements: {
            point: { radius: 0 },
            line: { borderWidth: 1.75, tension: 0.3 }
          }
        };
      }
    };
  }

  applyChartTheme();
})();
