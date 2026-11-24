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

let _periphCBCtxKind = 'all';
let _periphCBCtxWireless = false;
let _periphCBCtxGamer = false;
let _periphKitMouse = '';
let _periphKitKeyboard = '';
let _periphKitHeadset = '';
let _periphSimDiscountPct = 12;
let _periphSimCouponBrl = 40;

function _ensureMainPeriphDuelPair(pool, kindScope = 'all') {
  const src = (kindScope === 'all' ? pool : pool.filter(p => p.kind === kindScope));
  const cand = src.length >= 2 ? src : pool;
  if (!cand.length) return [null, null];
  let itemA = cand.find(p => p.slug === _periphDuelASlug) || pool.find(p => p.slug === _periphDuelASlug);
  let itemB = cand.find(p => p.slug === _periphDuelBSlug) || pool.find(p => p.slug === _periphDuelBSlug);
  const sorted = cand.slice().sort((x, y) => Number(y.cb_score || 0) - Number(x.cb_score || 0));
  if (!itemA) itemA = sorted[0];
  if (!itemB || itemB.slug === itemA.slug) itemB = sorted.find(x => x.slug !== itemA.slug) || sorted[0];
  _periphDuelASlug = itemA.slug;
  _periphDuelBSlug = itemB.slug;
  return [itemA, itemB];
}

function setPeriphMainDuelKind(kind) {
  _periphKindFilter = ['mouse', 'keyboard', 'headset'].includes(kind) ? kind : 'all';
  _periphDuelASlug = '';
  _periphDuelBSlug = '';
  renderPeripheralsDuelAnalysis();
}

function onPeriphMainDuelChange() {
  const a = document.getElementById('periph-main-duel-a')?.value;
  const b = document.getElementById('periph-main-duel-b')?.value;
  if (a) _periphDuelASlug = a;
  if (b) _periphDuelBSlug = b;
  renderPeripheralsDuelAnalysis();
}

function swapPeriphMainDuel() {
  const tmp = _periphDuelASlug;
  _periphDuelASlug = _periphDuelBSlug;
  _periphDuelBSlug = tmp;
  renderPeripheralsDuelAnalysis();
}

function setPeriphMainDuelItem(slug, slot = 'b') {
  if (slot === 'a') _periphDuelASlug = slug;
  else _periphDuelBSlug = slug;
  if (typeof switchTab === 'function') switchTab('versus');
  else renderPeripheralsDuelAnalysis();
}

function renderPeripheralsDuelAnalysis() {
  const ctrlEl = document.getElementById('periph-main-duel-controls');
  const verdEl = document.getElementById('periph-main-duel-verdict');
  const specsEl = document.getElementById('periph-main-duel-specs');
  if (!ctrlEl || !verdEl) return;

  const pool = getPeripheralsPool();
  if (!pool.length) {
    ctrlEl.innerHTML = '<span class="text-xs text-slate-400">Catálogo de periféricos vazio.</span>';
    verdEl.innerHTML = '';
    if (specsEl) specsEl.innerHTML = '';
    return;
  }

  const scoped = _periphKindFilter === 'all' ? pool : pool.filter(p => p.kind === _periphKindFilter);
  const duelSrc = scoped.length >= 2 ? scoped : pool;
  const [itemA, itemB] = _ensureMainPeriphDuelPair(pool, _periphKindFilter);

  const buildOpts = cur => ['mouse', 'keyboard', 'headset'].map(k => {
    const grp = duelSrc.filter(p => p.kind === k);
    if (!grp.length) return '';
    const kLbl = k === 'mouse' ? 'Mouses' : (k === 'keyboard' ? 'Teclados' : 'Headsets');
    return `<optgroup label="${kLbl}">${grp.map(p => `<option value="${_escPerHtml(p.slug)}" ${p.slug === cur ? 'selected' : ''}>${_escPerHtml(shortPeripherName(p))} (${fmtBRLShort(p.price_brl)})</option>`).join('')}</optgroup>`;
  }).join('');

  ctrlEl.innerHTML = `
    <div class="flex flex-wrap items-center gap-1.5 mr-2">
      ${[
        { k: 'all', l: 'Todos' },
        { k: 'mouse', l: '🖱️ Mouse' },
        { k: 'keyboard', l: '⌨️ Teclado' },
        { k: 'headset', l: '🎧 Headset' }
      ].map(c => `<button type="button" onclick="setPeriphMainDuelKind('${c.k}')" class="ui-chip ${_periphKindFilter === c.k ? 'is-active' : ''}">${c.l}</button>`).join('')}
    </div>
    <div class="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border" style="border-color:var(--ui-compare-a-border);">
      <span class="ui-badge ui-badge--a ui-mono">A</span>
      <select id="periph-main-duel-a" onchange="onPeriphMainDuelChange()" class="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-white max-w-[200px]">${buildOpts(itemA.slug)}</select>
    </div>
    <button type="button" onclick="swapPeriphMainDuel()" class="ui-btn ui-btn--icon" title="Inverter A e B">⇄</button>
    <div class="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border" style="border-color:var(--ui-compare-b-border);">
      <span class="ui-badge ui-badge--b ui-mono">B</span>
      <select id="periph-main-duel-b" onchange="onPeriphMainDuelChange()" class="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-white max-w-[200px]">${buildOpts(itemB.slug)}</select>
    </div>
  `;

  const pA = Number(itemA.price_brl || 0);
  const pB = Number(itemB.price_brl || 0);
  const diffBrl = pA - pB;
  const cbDiff = Math.round((Number(itemA.cb_score || 0) - Number(itemB.cb_score || 0)) * 10) / 10;
  const scoreDiff = Math.round((Number(itemA.overall_score || 0) - Number(itemB.overall_score || 0)) * 10) / 10;
  const winnerCb = Number(itemA.cb_score || 0) >= Number(itemB.cb_score || 0) ? itemA : itemB;
  const winnerTech = Number(itemA.overall_score || 0) >= Number(itemB.overall_score || 0) ? itemA : itemB;

  verdEl.innerHTML = `
    <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
      <span class="ui-label">Modelo A</span>
      <div class="font-bold text-white text-sm truncate">${_escPerHtml(shortPeripherName(itemA))}</div>
      <div class="text-xs ui-mono text-sky-300">${fmtBRL(pA)} • Nota ${itemA.overall_score}/100 • C/B ${itemA.cb_score}</div>
      ${itemA.offer_url ? `<a href="${_escPerHtml(itemA.offer_url)}" target="_blank" rel="noopener noreferrer" class="text-xs text-sky-400 hover:underline inline-block pt-1">Ver no Zoom ↗</a>` : ''}
    </div>
    <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 flex flex-col justify-center">
      <span class="ui-label">Veredito do Duelo</span>
      <div class="text-sm font-black text-emerald-400">🏆 C/B: ${_escPerHtml(shortPeripherName(winnerCb))}</div>
      <div class="text-xs text-slate-300 ui-mono">Diferença: ${diffBrl >= 0 ? '+' : '−'}${fmtBRLShort(Math.abs(diffBrl))} (A vs B) • Nota técnica ${scoreDiff >= 0 ? '+' : ''}${scoreDiff} pts</div>
      <div class="text-xs text-slate-400">Melhor técnica: <strong class="text-slate-200">${_escPerHtml(shortPeripherName(winnerTech))}</strong></div>
    </div>
    <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
      <span class="ui-label">Modelo B</span>
      <div class="font-bold text-white text-sm truncate">${_escPerHtml(shortPeripherName(itemB))}</div>
      <div class="text-xs ui-mono text-purple-300">${fmtBRL(pB)} • Nota ${itemB.overall_score}/100 • C/B ${itemB.cb_score}</div>
      ${itemB.offer_url ? `<a href="${_escPerHtml(itemB.offer_url)}" target="_blank" rel="noopener noreferrer" class="text-xs text-purple-300 hover:underline inline-block pt-1">Ver no Zoom ↗</a>` : ''}
    </div>
  `;

  const colors = _periphThemeColors();
  const radarCanvas = document.getElementById('chart-periph-main-radar');
  if (radarCanvas && typeof Chart !== 'undefined') {
    _destroyPerChartSafe('mainDuelRadar');
    const _vec = it => [Number(it.perf_score || 60), Number(it.build_score || 60), Number(it.feature_score || 60), Number(it.cb_score || 60)];
    _periphCharts.mainDuelRadar = new Chart(radarCanvas, {
      type: 'radar',
      data: {
        labels: ['Desempenho', 'Construção', 'Recursos/Extras', 'Custo-Benefício'],
        datasets: [
          { label: shortPeripherName(itemA), data: _vec(itemA), borderColor: colors.cmpA, backgroundColor: colors.cmpAFill, borderWidth: 2 },
          { label: shortPeripherName(itemB), data: _vec(itemB), borderColor: colors.cmpB, backgroundColor: colors.cmpBFill, borderWidth: 2 }
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

  const histCanvas = document.getElementById('chart-periph-main-history');
  if (histCanvas && typeof Chart !== 'undefined') {
    _destroyPerChartSafe('mainDuelHistory');
    const hA = Array.isArray(itemA.history) ? itemA.history : [];
    const hB = Array.isArray(itemB.history) ? itemB.history : [];
    const dates = Array.from(new Set([...hA.map(x => x.date), ...hB.map(x => x.date)])).sort();
    const mA = Object.fromEntries(hA.map(x => [x.date, x.price]));
    const mB = Object.fromEntries(hB.map(x => [x.date, x.price]));
    const lbls = dates.length ? dates : ['Hoje'];
    _periphCharts.mainDuelHistory = new Chart(histCanvas, {
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
          x: { ticks: { color: colors.muted, maxTicksLimit: 8 }, grid: { color: colors.grid } },
          y: { ticks: { color: colors.muted, callback: v => fmtBRLShort(v) }, grid: { color: colors.grid } }
        }
      }
    });
  }

  if (specsEl) {
    const rows = [
      ['Marca', itemA.brand || '--', itemB.brand || '--'],
      ['Preço Atual (Zoom BR)', fmtBRL(itemA.price_brl), fmtBRL(itemB.price_brl)],
      ['Média 90d / Mín. 90d', `${fmtBRLShort((itemA.price_stats || {}).avg_90d || itemA.price_brl)} / ${fmtBRLShort((itemA.price_stats || {}).min_90d || itemA.price_brl)}`, `${fmtBRLShort((itemB.price_stats || {}).avg_90d || itemB.price_brl)} / ${fmtBRLShort((itemB.price_stats || {}).min_90d || itemB.price_brl)}`],
      ..._buildPeripheralSpecRows(itemA, itemB)
    ];
    specsEl.innerHTML = `
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

function setPeriphCBCtxKind(k) {
  _periphCBCtxKind = ['mouse', 'keyboard', 'headset'].includes(k) ? k : 'all';
  renderPeripheralsCBView();
}

function togglePeriphCBCtxFlag(flag) {
  if (flag === 'wireless') _periphCBCtxWireless = !_periphCBCtxWireless;
  if (flag === 'gamer') _periphCBCtxGamer = !_periphCBCtxGamer;
  renderPeripheralsCBView();
}

function setPeriphCBCtxSort(key) {
  const sel = document.getElementById('periph-cb-sort');
  if (sel) sel.value = key;
  renderPeripheralsCBView();
}

function renderPeripheralsCBView() {
  const filtersEl = document.getElementById('periph-cb-filters');
  const tbody = document.getElementById('peripherals-cb-table-body');
  if (!tbody) return;

  if (filtersEl) {
    filtersEl.innerHTML = `
      <div class="ui-filter-row">
        <div class="ui-filter-group">
          <span class="ui-label mr-1">Categoria:</span>
          ${[
            { k: 'all', l: 'Todos' },
            { k: 'mouse', l: '🖱️ Mouses' },
            { k: 'keyboard', l: '⌨️ Teclados' },
            { k: 'headset', l: '🎧 Headsets' }
          ].map(c => `<button type="button" onclick="setPeriphCBCtxKind('${c.k}')" class="ui-chip ${_periphCBCtxKind === c.k ? 'is-active' : ''}">${c.l}</button>`).join('')}
        </div>
        <div class="ui-filter-group ml-0 sm:ml-3">
          <span class="ui-label mr-1">Extras:</span>
          <button type="button" onclick="togglePeriphCBCtxFlag('wireless')" class="ui-chip ${_periphCBCtxWireless ? 'is-active' : ''}">Sem Fio</button>
          <button type="button" onclick="togglePeriphCBCtxFlag('gamer')" class="ui-chip ${_periphCBCtxGamer ? 'is-active' : ''}">Gamer</button>
        </div>
      </div>
    `;
  }

  const pool = getPeripheralsPool();
  const q = (document.getElementById('periph-cb-search')?.value || '').trim().toLowerCase();
  const sortMode = document.getElementById('periph-cb-sort')?.value || 'cb';

  let filtered = pool.filter(p => {
    if (_periphCBCtxKind !== 'all' && p.kind !== _periphCBCtxKind) return false;
    if (_periphCBCtxWireless && !p.is_wireless) return false;
    if (_periphCBCtxGamer && !p.is_gamer) return false;
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
                <div class="text-xs text-slate-400 ui-mono">${kindLbl} • ${_escPerHtml(p.brand || 'Marca')}${p.is_wireless ? ' • Sem fio' : ''}</div>
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
              <button type="button" onclick="setPeriphMainDuelItem('${_escPerHtml(p.slug)}','a')" class="ui-btn ui-btn--sm" title="Definir como A no duelo">A</button>
              <button type="button" onclick="setPeriphMainDuelItem('${_escPerHtml(p.slug)}','b')" class="ui-btn ui-btn--sm" title="Definir como B no duelo">B</button>
              ${p.offer_url ? `<a href="${_escPerHtml(p.offer_url)}" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn--sm" title="Ver no Zoom BR">↗</a>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  const scCanvas = document.getElementById('chart-periph-cb-scatter');
  if (scCanvas && typeof Chart !== 'undefined' && filtered.length) {
    _destroyPerChartSafe('cbScatter');
    const colors = _periphThemeColors();
    const byKind = {
      mouse: { label: '🖱️ Mouse', color: '#38bdf8', pts: [] },
      keyboard: { label: '⌨️ Teclado', color: '#a855f7', pts: [] },
      headset: { label: '🎧 Headset', color: '#10b981', pts: [] }
    };
    filtered.forEach(p => {
      const b = byKind[p.kind] || byKind.mouse;
      b.pts.push({ x: Number(p.price_brl || 0), y: Number(p.overall_score || 50), name: shortPeripherName(p), cb: p.cb_score });
    });
    _periphCharts.cbScatter = new Chart(scCanvas, {
      type: 'scatter',
      data: {
        datasets: Object.values(byKind).filter(g => g.pts.length).map(g => ({
          label: g.label,
          data: g.pts,
          backgroundColor: g.color,
          pointRadius: 5,
          pointHoverRadius: 7
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: colors.text } },
          tooltip: { callbacks: { label: ctx => `${ctx.raw.name}: ${fmtBRLShort(ctx.raw.x)} • Nota ${ctx.raw.y}/100 (C/B ${ctx.raw.cb})` } }
        },
        scales: {
          x: { title: { display: true, text: 'Preço Atual (R$)', color: colors.muted }, ticks: { color: colors.muted, callback: v => fmtBRLShort(v) }, grid: { color: colors.grid } },
          y: { title: { display: true, text: 'Nota Técnica (0-100)', color: colors.muted }, ticks: { color: colors.muted }, grid: { color: colors.grid } }
        }
      }
    });
  }
}

function applyPeriphKitPreset(mode) {
  const pool = getPeripheralsPool();
  const pick = (k) => {
    const grp = pool.filter(p => p.kind === k);
    if (!grp.length) return '';
    if (mode === 'wireless') {
      const wl = grp.filter(p => p.is_wireless).sort((a, b) => Number(b.cb_score || 0) - Number(a.cb_score || 0));
      return (wl[0] || grp[0]).slug;
    }
    if (mode === 'pro') {
      const pro = grp.slice().sort((a, b) => Number(b.overall_score || 0) - Number(a.overall_score || 0));
      return pro[0].slug;
    }
    const cb = grp.slice().sort((a, b) => Number(b.cb_score || 0) - Number(a.cb_score || 0));
    return cb[0].slug;
  };
  _periphKitMouse = pick('mouse');
  _periphKitKeyboard = pick('keyboard');
  _periphKitHeadset = pick('headset');
  renderPeripheralsBuilder();
}

function setPeriphBuilderSlot(kind, slug) {
  if (kind === 'mouse') _periphKitMouse = slug;
  else if (kind === 'keyboard') _periphKitKeyboard = slug;
  else if (kind === 'headset') _periphKitHeadset = slug;
  renderPeripheralsBuilder();
}

function renderPeripheralsBuilder() {
  const root = document.getElementById('builder-peripherals-view');
  if (!root) return;
  const pool = getPeripheralsPool();
  const mice = pool.filter(p => p.kind === 'mouse');
  const kbs = pool.filter(p => p.kind === 'keyboard');
  const hs = pool.filter(p => p.kind === 'headset');

  if (!_periphKitMouse && mice.length) _periphKitMouse = mice[0].slug;
  if (!_periphKitKeyboard && kbs.length) _periphKitKeyboard = kbs[0].slug;
  if (!_periphKitHeadset && hs.length) _periphKitHeadset = hs[0].slug;

  const selM = mice.find(p => p.slug === _periphKitMouse) || mice[0];
  const selK = kbs.find(p => p.slug === _periphKitKeyboard) || kbs[0];
  const selH = hs.find(p => p.slug === _periphKitHeadset) || hs[0];
  const picked = [selM, selK, selH].filter(Boolean);
  const totalBrl = picked.reduce((a, p) => a + Number(p.price_brl || 0), 0);
  const totalTgt = picked.reduce((a, p) => a + Number((p.price_stats || {}).target_price || p.price_brl * 0.88), 0);
  const wirelessCount = picked.filter(p => p.is_wireless).length;

  const slotCard = (kind, title, icon, list, cur) => `
    <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-bold text-slate-200">${icon} ${title}</span>
        ${cur ? `<span class="ui-mono text-xs font-bold text-emerald-400">${fmtBRL(cur.price_brl)}</span>` : ''}
      </div>
      <select onchange="setPeriphBuilderSlot('${kind}', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-semibold">
        ${list.map(p => `<option value="${_escPerHtml(p.slug)}" ${cur && cur.slug === p.slug ? 'selected' : ''}>${_escPerHtml(shortPeripherName(p))} — ${fmtBRLShort(p.price_brl)} (C/B ${p.cb_score})</option>`).join('')}
      </select>
      ${cur ? `<div class="flex items-center justify-between text-xs text-slate-400 ui-mono"><span>${_escPerHtml((cur.specs && cur.specs.summary) || cur.brand || '')}</span>${cur.offer_url ? `<a href="${_escPerHtml(cur.offer_url)}" target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">Zoom ↗</a>` : ''}</div>` : ''}
    </div>
  `;

  root.innerHTML = `
    <div class="lg:col-span-8 ui-card space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <span class="ui-label">Montagem de Kit Periféricos</span>
          <h2 class="ui-title-lg">Monte seu Combo: Mouse + Teclado + Headset</h2>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <button type="button" onclick="applyPeriphKitPreset('cb')" class="ui-chip">Melhor C/B</button>
          <button type="button" onclick="applyPeriphKitPreset('wireless')" class="ui-chip">100% Sem Fio</button>
          <button type="button" onclick="applyPeriphKitPreset('pro')" class="ui-chip">Top Desempenho</button>
        </div>
      </div>
      <div class="space-y-3">
        ${slotCard('mouse', 'Mouse', '🖱️', mice, selM)}
        ${slotCard('keyboard', 'Teclado', '⌨️', kbs, selK)}
        ${slotCard('headset', 'Headset', '🎧', hs, selH)}
      </div>
    </div>
    <div class="lg:col-span-4 space-y-4">
      <div class="ui-card space-y-3">
        <span class="ui-label">Resumo do Kit</span>
        <div class="text-3xl font-black ui-mono text-white">${fmtBRL(totalBrl)}</div>
        <div class="text-xs text-slate-400">Meta em promoções: <strong class="text-emerald-400 ui-mono">${fmtBRL(totalTgt)}</strong> (economia potencial de ${fmtBRLShort(Math.max(0, totalBrl - totalTgt))})</div>
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
          <div class="flex justify-between"><span class="text-slate-400">Itens Sem Fio:</span><span class="ui-mono font-bold text-sky-300">${wirelessCount}/${picked.length}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">Score Médio:</span><span class="ui-mono font-bold text-white">${picked.length ? Math.round(picked.reduce((a, p) => a + Number(p.overall_score || 0), 0) / picked.length) : 0}/100</span></div>
        </div>
        <button type="button" onclick="switchTab('cb')" class="ui-btn ui-btn--primary w-full">Explorar Ranking C/B Completo</button>
      </div>
    </div>
  `;
}

function renderPeripheralsUpgrades() {
  const root = document.getElementById('upgrades-peripherals-view');
  if (!root) return;
  const pool = getPeripheralsPool();
  const topMouse = pool.filter(p => p.kind === 'mouse').sort((a, b) => Number(b.cb_score || 0) - Number(a.cb_score || 0))[0];
  const topKb = pool.filter(p => p.kind === 'keyboard').sort((a, b) => Number(b.cb_score || 0) - Number(a.cb_score || 0))[0];
  const topHs = pool.filter(p => p.kind === 'headset').sort((a, b) => Number(b.cb_score || 0) - Number(a.cb_score || 0))[0];
  root.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
      <div>
        <span class="ui-label">Guia Técnico de Compra &amp; Upgrades</span>
        <h2 class="ui-title-lg">Quando vale trocar Mouse, Teclado ou Headset?</h2>
      </div>
      <button type="button" onclick="switchTab('bf-promos')" class="ui-btn ui-btn--sm ui-btn--primary">Configurar Alertas de Periféricos</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
        <div class="text-sm font-bold text-sky-300">🖱️ Mouses: Sensor &amp; Peso</div>
        <p class="text-slate-300 leading-relaxed">Sensores PAW3395 / HERO 25K–44K com &lt;65g e dongle 2.4GHz eliminam atraso e arrasto. Evite sensores genéricos acima de R$ 150.</p>
        ${topMouse ? `<div class="pt-2 border-t border-slate-800 text-emerald-300 ui-mono">Destaque: ${_escPerHtml(shortPeripherName(topMouse))} (${fmtBRLShort(topMouse.price_brl)})</div>` : ''}
      </div>
      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
        <div class="text-sm font-bold text-purple-300">⌨️ Teclados: Hall Effect &amp; Switches</div>
        <p class="text-slate-300 leading-relaxed">Switches Magnéticos (Rapid Trigger) dominam FPS competitivos; hot-swap 75%/TKL dá longevidade sem descartar o teclado por 1 tecla.</p>
        ${topKb ? `<div class="pt-2 border-t border-slate-800 text-emerald-300 ui-mono">Destaque: ${_escPerHtml(shortPeripherName(topKb))} (${fmtBRLShort(topKb.price_brl)})</div>` : ''}
      </div>
      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
        <div class="text-sm font-bold text-emerald-300">🎧 Headsets: Drivers &amp; Conexão</div>
        <p class="text-slate-300 leading-relaxed">Drivers 50–53mm, almofadas em tecido respirável e dongle 2.4GHz ou cabo USB com DAC dedicam áudio limpo e microfone nítido em calls.</p>
        ${topHs ? `<div class="pt-2 border-t border-slate-800 text-emerald-300 ui-mono">Destaque: ${_escPerHtml(shortPeripherName(topHs))} (${fmtBRLShort(topHs.price_brl)})</div>` : ''}
      </div>
    </div>
  `;
}

function setPeriphSimParam(kind, val) {
  if (kind === 'disc') _periphSimDiscountPct = Math.max(0, Math.min(60, Number(val) || 0));
  if (kind === 'coupon') _periphSimCouponBrl = Math.max(0, Number(val) || 0);
  renderPeripheralsSimulator();
}

function renderPeripheralsSimulator() {
  const root = document.getElementById('sim-peripherals-view');
  if (!root) return;
  const pool = getPeripheralsPool();
  const mice = pool.filter(p => p.kind === 'mouse');
  const kbs = pool.filter(p => p.kind === 'keyboard');
  const hs = pool.filter(p => p.kind === 'headset');
  const selM = mice.find(p => p.slug === _periphKitMouse) || mice[0];
  const selK = kbs.find(p => p.slug === _periphKitKeyboard) || kbs[0];
  const selH = hs.find(p => p.slug === _periphKitHeadset) || hs[0];
  const picked = [selM, selK, selH].filter(Boolean);
  const rawTotal = picked.reduce((a, p) => a + Number(p.price_brl || 0), 0);
  const afterDisc = Math.max(0, rawTotal * (1 - _periphSimDiscountPct / 100) - _periphSimCouponBrl);
  const saved = rawTotal - afterDisc;

  root.innerHTML = `
    <div class="ui-card space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <span class="ui-label">Simulador de Economia &amp; Meta</span>
          <h2 class="ui-title-lg">Quanto você economiza esperando Promo / Cupom no Kit?</h2>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div>
            <div class="flex justify-between text-xs mb-1"><span class="text-slate-300 font-semibold">Desconto esperado em oferta (%)</span><strong class="ui-mono text-sky-300">−${_periphSimDiscountPct}%</strong></div>
            <input type="range" min="0" max="45" step="1" value="${_periphSimDiscountPct}" oninput="setPeriphSimParam('disc', this.value)" class="w-full" />
          </div>
          <div>
            <div class="flex justify-between text-xs mb-1"><span class="text-slate-300 font-semibold">Cupom extra (R$ OFF)</span><strong class="ui-mono text-amber-300">−${fmtBRLShort(_periphSimCouponBrl)}</strong></div>
            <input type="number" min="0" max="1500" step="10" value="${_periphSimCouponBrl}" onchange="setPeriphSimParam('coupon', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs ui-mono text-white" />
          </div>
        </div>
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-center space-y-2">
          <div class="text-xs text-slate-400">Kit selecionado (${picked.length} itens): <span class="line-through ui-mono">${fmtBRL(rawTotal)}</span></div>
          <div class="text-3xl font-black ui-mono text-emerald-400">${fmtBRL(afterDisc)}</div>
          <div class="text-xs ui-mono text-sky-300">Economia total simulada: ${fmtBRL(saved)} (${rawTotal > 0 ? Math.round((saved / rawTotal) * 100) : 0}% abaixo de hoje)</div>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${picked.map(p => {
          const tgt = Number((p.price_stats || {}).target_price || p.price_brl * 0.88);
          const simP = Math.max(25, Number(p.price_brl || 0) * (1 - _periphSimDiscountPct / 100));
          return `
            <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
              <div class="font-bold text-white truncate">${_escPerHtml(shortPeripherName(p))}</div>
              <div class="ui-mono text-slate-400">Hoje: ${fmtBRLShort(p.price_brl)} • Alvo: ${fmtBRLShort(tgt)}</div>
              <div class="ui-mono text-emerald-400 font-bold">Simulado: ${fmtBRL(simP)} ${simP <= tgt ? '✓ No alvo' : ''}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderPeripheralsConfigSection() {
  const el = document.getElementById('cfg-ref-peripherals-container');
  if (!el) return;
  const pool = getPeripheralsPool();
  const m = pool.filter(p => p.kind === 'mouse').length;
  const k = pool.filter(p => p.kind === 'keyboard').length;
  const h = pool.filter(p => p.kind === 'headset').length;
  el.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800"><span class="text-slate-400 block">🖱️ Mouses</span><strong class="text-lg ui-mono text-white">${m}</strong></div>
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800"><span class="text-slate-400 block">⌨️ Teclados</span><strong class="text-lg ui-mono text-white">${k}</strong></div>
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800"><span class="text-slate-400 block">🎧 Headsets</span><strong class="text-lg ui-mono text-white">${h}</strong></div>
    </div>
    <p class="text-xs text-slate-400">Para escolher exatamente qual mouse, teclado ou headset dispara alerta no seu celular/PC, acesse <strong>Promoções → Filtros</strong>.</p>
  `;
}

window.getPeripheralsPool = getPeripheralsPool;
window.setPeripheralsKindFilter = setPeripheralsKindFilter;
window.togglePeripheralsFeatureFilter = togglePeripheralsFeatureFilter;
window.setPeripheralDuelItem = setPeripheralDuelItem;
window.swapPeripheralDuel = swapPeripheralDuel;
window.renderPeripheralsTab = renderPeripheralsTab;
window.setPeriphMainDuelKind = setPeriphMainDuelKind;
window.onPeriphMainDuelChange = onPeriphMainDuelChange;
window.swapPeriphMainDuel = swapPeriphMainDuel;
window.setPeriphMainDuelItem = setPeriphMainDuelItem;
window.renderPeripheralsDuelAnalysis = renderPeripheralsDuelAnalysis;
window.setPeriphCBCtxKind = setPeriphCBCtxKind;
window.togglePeriphCBCtxFlag = togglePeriphCBCtxFlag;
window.setPeriphCBCtxSort = setPeriphCBCtxSort;
window.renderPeripheralsCBView = renderPeripheralsCBView;
window.applyPeriphKitPreset = applyPeriphKitPreset;
window.setPeriphBuilderSlot = setPeriphBuilderSlot;
window.renderPeripheralsBuilder = renderPeripheralsBuilder;
window.renderPeripheralsUpgrades = renderPeripheralsUpgrades;
window.setPeriphSimParam = setPeriphSimParam;
window.renderPeripheralsSimulator = renderPeripheralsSimulator;
window.renderPeripheralsConfigSection = renderPeripheralsConfigSection;
