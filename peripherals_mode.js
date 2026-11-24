// ============================================================================
// PERIPHERALS_MODE.JS — Dedicated Mouse, Keyboard & Headset Analyzer Tab
// Live Zoom BR specs, CB scoring, Quick Duel A vs B (4-axis Radar + History),
// and live Telegram peripheral promo cards.
// ============================================================================

let _periphKindFilter = 'all'; // 'all' | 'mouse' | 'keyboard' | 'headset'
let _periphOnlyWireless = false;
let _periphOnlyGamer = false;
let _periphDuelASlug = '';
let _periphDuelBSlug = '';
const _periphCharts = {};

function _escPerHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _destroyPerChartSafe(key) {
  if (_periphCharts[key] && typeof _periphCharts[key].destroy === 'function') {
    try { _periphCharts[key].destroy(); } catch (_) {}
    delete _periphCharts[key];
  }
}

function _periphThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  const val = (k, fb) => (cs.getPropertyValue(k) || '').trim() || fb;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    cmpA: val('--ui-compare-a', '#38bdf8'),
    cmpAText: val('--ui-compare-a-text', '#7dd3fc'),
    cmpAFill: isLight ? 'rgba(2, 132, 199, 0.22)' : 'rgba(56, 189, 248, 0.22)',
    cmpB: val('--ui-compare-b', '#a855f7'),
    cmpBText: val('--ui-compare-b-text', '#d8b4fe'),
    cmpBFill: isLight ? 'rgba(124, 58, 237, 0.20)' : 'rgba(168, 85, 247, 0.22)',
    text: isLight ? '#0f172a' : '#e2e8f0',
    muted: isLight ? '#475569' : '#94a3b8',
    grid: isLight ? 'rgba(15, 23, 42, 0.10)' : 'rgba(148, 163, 184, 0.14)'
  };
}

function getPeripheralsPool() {
  const list = (typeof DB !== 'undefined' && Array.isArray(DB.peripherals)) ? DB.peripherals : [];
  return list.filter(p => p && p.slug && Number(p.price_brl || 0) > 25);
}

function shortPeripherName(p) {
  if (!p || !p.name) return '--';
  let s = String(p.name)
    .replace(/^Mouse\s+(Gamer\s+)?(Sem\s+Fio\s+)?/i, '')
    .replace(/^Teclado\s+(Gamer\s+)?(Mecânico\s+)?/i, '')
    .replace(/^Headset\s+(Gamer\s+)?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) s = p.name;
  return s.length > 44 ? s.slice(0, 42) + '…' : s;
}

function setPeripheralsKindFilter(kind) {
  _periphKindFilter = ['mouse', 'keyboard', 'headset'].includes(kind) ? kind : 'all';
  document.querySelectorAll('#peripherals-kind-chips .ui-chip').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.kind === _periphKindFilter);
  });
  _ensurePeriphDuelPairForFilter();
  renderPeripheralsTab();
}

function togglePeripheralsFeatureFilter(flag) {
  if (flag === 'wireless') {
    _periphOnlyWireless = !_periphOnlyWireless;
    const el = document.getElementById('periph-chip-wireless');
    if (el) el.classList.toggle('is-active', _periphOnlyWireless);
  } else if (flag === 'gamer') {
    _periphOnlyGamer = !_periphOnlyGamer;
    const el = document.getElementById('periph-chip-gamer');
    if (el) el.classList.toggle('is-active', _periphOnlyGamer);
  }
  renderPeripheralsTab();
}

function setPeripheralDuelItem(slug, slot = 'b') {
  if (slot === 'a') _periphDuelASlug = slug;
  else _periphDuelBSlug = slug;
  renderPeripheralsTab();
  const duelCard = document.getElementById('peripherals-duel-card');
  if (duelCard) duelCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function swapPeripheralDuel() {
  const tmp = _periphDuelASlug;
  _periphDuelASlug = _periphDuelBSlug;
  _periphDuelBSlug = tmp;
  renderPeripheralsTab();
}

function _ensurePeriphDuelPairForFilter() {
  const pool = getPeripheralsPool();
  if (!pool.length) return;
  const scoped = _periphKindFilter === 'all' ? pool : pool.filter(p => p.kind === _periphKindFilter);
  const src = scoped.length >= 2 ? scoped : pool;
  const aValid = src.some(p => p.slug === _periphDuelASlug);
  const bValid = src.some(p => p.slug === _periphDuelBSlug && p.slug !== _periphDuelASlug);
  if (!aValid || !bValid) {
    const sorted = src.slice().sort((x, y) => Number(y.cb_score || 0) - Number(x.cb_score || 0));
    _periphDuelASlug = sorted[0].slug;
    _periphDuelBSlug = (sorted[1] || sorted[0]).slug;
  }
}

function _buildPeripheralSpecRows(a, b) {
  const sa = a.specs || {};
  const sb = b.specs || {};
  const yn = v => v ? '✓ Sim' : '✗ Não';
  if (a.kind === 'mouse' && b.kind === 'mouse') {
    return [
      ['Sensor / Tier', sa.sensor_tier || '--', sb.sensor_tier || '--'],
      ['DPI Máximo', `${(sa.dpi_max || 0).toLocaleString('pt-BR')} DPI`, `${(sb.dpi_max || 0).toLocaleString('pt-BR')} DPI`],
      ['Peso', `${sa.weight_g || '--'} g`, `${sb.weight_g || '--'} g`],
      ['Polling Rate', `${sa.polling_hz || 1000} Hz`, `${sb.polling_hz || 1000} Hz`],
      ['Conexão', sa.connection || (a.is_wireless ? 'Sem fio' : 'Cabo'), sb.connection || (b.is_wireless ? 'Sem fio' : 'Cabo')]
    ];
  }
  if (a.kind === 'keyboard' && b.kind === 'keyboard') {
    return [
      ['Switch / Acionamento', sa.switch_type || '--', sb.switch_type || '--'],
      ['Formato', sa.form_factor || '--', sb.form_factor || '--'],
      ['Layout', sa.layout || '--', sb.layout || '--'],
      ['Hot-Swap / RGB', `${yn(sa.hot_swap)} / ${yn(sa.rgb)}`, `${yn(sb.hot_swap)} / ${yn(sb.rgb)}`],
      ['Conexão', sa.connection || '--', sb.connection || '--']
    ];
  }
  if (a.kind === 'headset' && b.kind === 'headset') {
    return [
      ['Driver Acústico', `${sa.driver_mm || 40} mm`, `${sb.driver_mm || 40} mm`],
      ['Cancelamento ANC', yn(sa.has_anc), yn(sb.has_anc)],
      ['Surround 7.1 / Espacial', yn(sa.has_surround), yn(sb.has_surround)],
      ['Microfone', sa.mic_type || '--', sb.mic_type || '--'],
      ['Conexão', sa.connection || '--', sb.connection || '--']
    ];
  }
  // Cross-kind comparison fallback
  return [
    ['Categoria', a.kind.toUpperCase(), b.kind.toUpperCase()],
    ['Sem Fio / Conexão', sa.connection || yn(a.is_wireless), sb.connection || yn(b.is_wireless)],
    ['Resumo Técnico', sa.summary || '--', sb.summary || '--'],
    ['Score Geral / C/B', `${a.overall_score}/100 (C/B ${a.cb_score})`, `${b.overall_score}/100 (C/B ${b.cb_score})`]
  ];
}

function renderPeripheralsTab() {
  const pool = getPeripheralsPool();
  const tbody = document.getElementById('peripherals-table-body');
  if (!tbody) return;

  const q = (document.getElementById('peripherals-search')?.value || '').trim().toLowerCase();
  const sortMode = document.getElementById('peripherals-sort')?.value || 'cb';

  let filtered = pool.filter(p => {
    if (_periphKindFilter !== 'all' && p.kind !== _periphKindFilter) return false;
    if (_periphOnlyWireless && !p.is_wireless) return false;
    if (_periphOnlyGamer && !p.is_gamer) return false;
    if (q) {
      const hay = `${p.name} ${p.brand} ${(p.specs && p.specs.summary) || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sortMode === 'price_asc') return Number(a.price_brl || 0) - Number(b.price_brl || 0);
    if (sortMode === 'price_desc') return Number(b.price_brl || 0) - Number(a.price_brl || 0);
    if (sortMode === 'score') return Number(b.overall_score || 0) - Number(a.overall_score || 0);
    return Number(b.cb_score || 0) - Number(a.cb_score || 0);
  });

  // Live peripheral deals from PROMO_STATE or DB.live_promos
  const promoSrc = (typeof PROMO_STATE !== 'undefined' && PROMO_STATE.lastData && Array.isArray(PROMO_STATE.lastData.peripheral_deals))
    ? PROMO_STATE.lastData.peripheral_deals
    : ((typeof DB !== 'undefined' && DB.live_promos && Array.isArray(DB.live_promos.peripheral_deals)) ? DB.live_promos.peripheral_deals : []);

  const scopedDeals = promoSrc.filter(d => {
    if (_periphKindFilter !== 'all' && d.peripheral_kind !== _periphKindFilter) return false;
    if (q && !(String(d.title || '').toLowerCase().includes(q) || String(d.raw_text || '').toLowerCase().includes(q))) return false;
    return true;
  });

  // KPIs
  const kpiEl = document.getElementById('peripherals-kpis');
  if (kpiEl) {
    const mCount = pool.filter(p => p.kind === 'mouse').length;
    const kCount = pool.filter(p => p.kind === 'keyboard').length;
    const hCount = pool.filter(p => p.kind === 'headset').length;
    const topCb = filtered[0];
    const avgPrice = filtered.length ? (filtered.reduce((acc, p) => acc + Number(p.price_brl || 0), 0) / filtered.length) : 0;
    kpiEl.innerHTML = `
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
        <span class="ui-label block">Catálogo Zoom BR</span>
        <span class="text-lg font-black ui-mono text-white">${filtered.length} itens</span>
        <span class="text-xs text-slate-400 block">${mCount} mouses • ${kCount} teclados • ${hCount} headsets</span>
      </div>
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
        <span class="ui-label block">Líder Custo-Benefício</span>
        <span class="text-sm font-bold text-emerald-400 truncate block">${topCb ? _escPerHtml(shortPeripherName(topCb)) : '--'}</span>
        <span class="text-xs text-slate-400 ui-mono block">${topCb ? `${fmtBRLShort(topCb.price_brl)} • C/B ${topCb.cb_score}/100` : '--'}</span>
      </div>
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
        <span class="ui-label block">Preço Médio (Recorte)</span>
        <span class="text-lg font-black ui-mono text-sky-300">${filtered.length ? fmtBRLShort(avgPrice) : '--'}</span>
        <span class="text-xs text-slate-400 block">${_periphOnlyWireless ? 'Filtro: Sem fio' : 'Com e sem fio'}</span>
      </div>
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800">
        <span class="ui-label block">Ofertas Telegram Hoje</span>
        <span class="text-lg font-black ui-mono text-amber-300">${scopedDeals.length} promos</span>
        <span class="text-xs text-slate-400 block">Radar 24–48h BR ao vivo</span>
      </div>
    `;
  }

  // Quick Duel A vs B
  _ensurePeriphDuelPairForFilter();
  const selA = document.getElementById('periph-duel-a');
  const selB = document.getElementById('periph-duel-b');
  const duelSrc = (filtered.length >= 2 ? filtered : pool);
  if (selA && selB && duelSrc.length) {
    const buildOpts = cur => ['mouse', 'keyboard', 'headset'].map(k => {
      const grp = duelSrc.filter(p => p.kind === k);
      if (!grp.length) return '';
      const kLbl = k === 'mouse' ? 'Mouses' : (k === 'keyboard' ? 'Teclados' : 'Headsets');
      return `<optgroup label="${kLbl}">${grp.map(p => `<option value="${_escPerHtml(p.slug)}" ${p.slug === cur ? 'selected' : ''}>${_escPerHtml(shortPeripherName(p))} (${fmtBRLShort(p.price_brl)})</option>`).join('')}</optgroup>`;
    }).join('');
    selA.innerHTML = buildOpts(_periphDuelASlug);
    selB.innerHTML = buildOpts(_periphDuelBSlug);

    const itemA = pool.find(p => p.slug === _periphDuelASlug) || duelSrc[0];
    const itemB = pool.find(p => p.slug === _periphDuelBSlug) || duelSrc[Math.min(1, duelSrc.length - 1)];
    if (itemA && itemB) {
      const colors = _periphThemeColors();
      const radarCanvas = document.getElementById('chart-periph-duel-radar');
      if (radarCanvas && typeof Chart !== 'undefined') {
        _destroyPerChartSafe('duelRadar');
        const _spVec = item => [Number(item.perf_score || 60), Number(item.build_score || 60), Number(item.feature_score || 60), Number(item.cb_score || 60)];
        _periphCharts.duelRadar = new Chart(radarCanvas, {
          type: 'radar',
          data: {
            labels: ['Desempenho', 'Construção', 'Recursos/Extras', 'Custo-Benefício'],
            datasets: [
              { label: shortPeripherName(itemA), data: _spVec(itemA), borderColor: colors.cmpA, backgroundColor: colors.cmpAFill, borderWidth: 2 },
              { label: shortPeripherName(itemB), data: _spVec(itemB), borderColor: colors.cmpB, backgroundColor: colors.cmpBFill, borderWidth: 2 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent', color: colors.muted }, pointLabels: { color: colors.text, font: { size: 11 } }, grid: { color: colors.grid }, angleLines: { color: colors.grid } } },
            plugins: { legend: { labels: { color: colors.text, boxWidth: 10 } } }
          }
        });
      }

      const histCanvas = document.getElementById('chart-periph-duel-history');
      if (histCanvas && typeof Chart !== 'undefined') {
        _destroyPerChartSafe('duelHistory');
        const hA = Array.isArray(itemA.history) ? itemA.history : [];
        const hB = Array.isArray(itemB.history) ? itemB.history : [];
        const dates = Array.from(new Set([...hA.map(x => x.date), ...hB.map(x => x.date)])).sort();
        const mA = Object.fromEntries(hA.map(x => [x.date, x.price]));
        const mB = Object.fromEntries(hB.map(x => [x.date, x.price]));
        const lbls = dates.length ? dates : ['Hoje'];
        _periphCharts.duelHistory = new Chart(histCanvas, {
          type: 'line',
          data: {
            labels: lbls.map(d => d.slice(5) || d),
            datasets: [
              { label: shortPeripherName(itemA), data: lbls.map(d => mA[d] ?? itemA.price_brl), borderColor: colors.cmpA, backgroundColor: colors.cmpAFill, tension: 0.25, pointRadius: 2 },
              { label: shortPeripherName(itemB), data: lbls.map(d => mB[d] ?? itemB.price_brl), borderColor: colors.cmpB, backgroundColor: colors.cmpBFill, tension: 0.25, pointRadius: 2 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: colors.text, boxWidth: 10 } } },
            scales: {
              x: { ticks: { color: colors.muted, maxTicksLimit: 7 }, grid: { color: colors.grid } },
              y: { ticks: { color: colors.muted, callback: v => fmtBRLShort(v) }, grid: { color: colors.grid } }
            }
          }
        });
      }

      const verdEl = document.getElementById('periph-duel-verdict');
      if (verdEl) {
        const winA = itemA.cb_score >= itemB.cb_score;
        const winner = winA ? itemA : itemB;
        const diffP = Math.abs(Number(itemA.price_brl || 0) - Number(itemB.price_brl || 0));
        verdEl.innerHTML = `
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="ui-badge ${winA ? 'ui-badge--a' : 'ui-badge--b'}">Melhor C/B: ${_escPerHtml(shortPeripherName(winner))} (${winner.cb_score}/100)</span>
            <span class="text-xs ui-mono text-slate-300">Diferença de preço: ${fmtBRLShort(diffP)}</span>
          </div>
          <p class="text-xs text-slate-300 mt-1.5">
            <strong>A (${_escPerHtml(shortPeripherName(itemA))}):</strong> Score ${itemA.overall_score}/100 • ${fmtBRLShort(itemA.price_brl)} vs
            <strong>B (${_escPerHtml(shortPeripherName(itemB))}):</strong> Score ${itemB.overall_score}/100 • ${fmtBRLShort(itemB.price_brl)}.
          </p>
        `;
      }

      const specEl = document.getElementById('periph-duel-specs');
      if (specEl) {
        const rows = _buildPeripheralSpecRows(itemA, itemB);
        specEl.innerHTML = `
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-slate-800 text-slate-400">
                <th class="text-left py-1.5 px-2">Spec</th>
                <th class="text-left py-1.5 px-2" style="color:${colors.cmpAText};">A · ${_escPerHtml(shortPeripherName(itemA))}</th>
                <th class="text-left py-1.5 px-2" style="color:${colors.cmpBText};">B · ${_escPerHtml(shortPeripherName(itemB))}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60">
              ${rows.map(r => `<tr><td class="py-1.5 px-2 text-slate-400">${_escPerHtml(r[0])}</td><td class="py-1.5 px-2 text-slate-100 ui-mono">${_escPerHtml(r[1])}</td><td class="py-1.5 px-2 text-slate-100 ui-mono">${_escPerHtml(r[2])}</td></tr>`).join('')}
            </tbody>
          </table>
        `;
      }
    }
  }

  // Ranking Table
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400">Nenhum periférico encontrado neste filtro.</td></tr>';
  } else {
    tbody.innerHTML = filtered.map((p, i) => {
      const ps = p.price_stats || {};
      const tgt = Number(ps.target_price || p.price_brl * 0.88);
      const spark = typeof renderPriceSparklineSVG === 'function' ? renderPriceSparklineSVG(p, p.price_brl, tgt) : '';
      const kindLbl = p.kind === 'mouse' ? '🖱️ Mouse' : (p.kind === 'keyboard' ? '⌨️ Teclado' : '🎧 Headset');
      const cbTone = p.cb_score >= 72 ? 'text-emerald-400' : (p.cb_score >= 52 ? 'text-sky-300' : 'text-amber-300');
      return `
        <tr>
          <td class="ui-mono text-xs text-slate-400">${i + 1}</td>
          <td>
            <div class="flex items-center gap-2.5">
              ${p.image_url ? `<img src="${_escPerHtml(p.image_url)}" alt="" class="w-9 h-9 rounded-lg object-contain bg-slate-950 border border-slate-800 p-0.5 shrink-0" loading="lazy" onerror="this.classList.add('hidden')">` : ''}
              <div class="min-w-0">
                <div class="font-bold text-slate-100 text-xs sm:text-sm truncate max-w-[240px]" title="${_escPerHtml(p.name)}">${_escPerHtml(shortPeripherName(p))}</div>
                <div class="text-xs text-slate-400 ui-mono">${kindLbl} • ${_escPerHtml(p.brand || 'Marca')}${p.is_wireless ? ' • Sem fio' : ''}${p.is_gamer ? ' • Gamer' : ''}</div>
              </div>
            </div>
          </td>
          <td class="text-xs text-slate-300 ui-mono max-w-[240px]">${_escPerHtml((p.specs && p.specs.summary) || '--')}</td>
          <td class="text-right ui-mono">
            <span class="font-bold text-white">${fmtBRLShort(p.price_brl)}</span>
            <span class="block text-xs text-slate-400">Alvo ${fmtBRLShort(tgt)}</span>
          </td>
          <td class="text-center">${spark}</td>
          <td class="text-center ui-mono">
            <span class="font-black text-sm ${cbTone}">${p.cb_score}</span>
            <span class="block text-xs text-slate-400">Nota ${p.overall_score}/100</span>
          </td>
          <td class="text-center">
            <div class="flex items-center justify-center gap-1">
              <button type="button" onclick="setPeripheralDuelItem('${_escPerHtml(p.slug)}','a')" class="ui-btn ui-btn--sm" title="Definir como A no duelo">A</button>
              <button type="button" onclick="setPeripheralDuelItem('${_escPerHtml(p.slug)}','b')" class="ui-btn ui-btn--sm" title="Definir como B no duelo">B</button>
              ${p.offer_url ? `<a href="${_escPerHtml(p.offer_url)}" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn--sm" title="Ver no Zoom BR">↗</a>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Telegram Promos Grid
  const promosGrid = document.getElementById('peripherals-promos-grid');
  if (promosGrid) {
    if (!scopedDeals.length) {
      promosGrid.innerHTML = '<div class="col-span-full text-xs text-slate-400 p-4 rounded-xl bg-slate-950 border border-slate-800">Nenhuma promoção recente de periférico neste filtro. Atualize o Radar de Promoções ou remova filtros.</div>';
    } else {
      promosGrid.innerHTML = scopedDeals.slice(0, 18).map(d => {
        const kBadge = d.peripheral_kind === 'mouse' ? '🖱️ Mouse' : (d.peripheral_kind === 'keyboard' ? '⌨️ Teclado' : '🎧 Headset');
        const link = d.url || d.post_url || '#';
        return `
          <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-sky-500/40 transition flex flex-col justify-between gap-2.5">
            <div class="space-y-1.5">
              <div class="flex items-center justify-between gap-2">
                <span class="ui-badge ui-badge--a">${kBadge}</span>
                <span class="text-xs ui-mono text-slate-400">${_escPerHtml(d.channel_name || d.channel || 'Telegram')} • ${Math.round(Number(d.age_hours || 1))}h</span>
              </div>
              <div class="text-xs sm:text-sm font-bold text-white line-clamp-2" title="${_escPerHtml(d.title)}">${_escPerHtml(d.title)}</div>
              ${d.coupon_code ? `<div class="text-xs ui-mono text-amber-300">🎟️ Cupom: <strong>${_escPerHtml(d.coupon_code)}</strong></div>` : ''}
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <div>
                <span class="text-base font-black ui-mono text-emerald-400">${fmtBRL(d.price_brl)}</span>
                <span class="text-xs text-slate-400 block">${_escPerHtml(d.store || 'Loja BR')}</span>
              </div>
              <a href="${_escPerHtml(link)}" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn--sm ui-btn--primary">Ver Oferta ↗</a>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

window.getPeripheralsPool = getPeripheralsPool;
window.setPeripheralsKindFilter = setPeripheralsKindFilter;
window.togglePeripheralsFeatureFilter = togglePeripheralsFeatureFilter;
window.setPeripheralDuelItem = setPeripheralDuelItem;
window.swapPeripheralDuel = swapPeripheralDuel;
window.renderPeripheralsTab = renderPeripheralsTab;
