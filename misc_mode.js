// ============================================================================
// MISC_MODE.JS — Miscellaneous Deals & Custom Product Monitor
// Default built-ins: Air Fryer (R$/L) & Children's Diapers (R$/fralda)
// + Verified Brazilian Diaper/Promo Telegram Groups & Custom Live Search
// ============================================================================

const MISC_STORAGE_KEY = 'pc_analyzer_misc_config_v1';

const DEFAULT_MISC_CFG = {
  categories: [
    {
      id: 'air_fryer',
      name: 'Air Fryer',
      icon: '🍟',
      builtin: true,
      queries: ['air fryer', 'fritadeira'],
      keywords: ['air fryer', 'airfryer', 'fritadeira']
    },
    {
      id: 'diapers',
      name: 'Fraldas Infantis',
      icon: '👶',
      builtin: true,
      queries: ['fralda', 'pampers', 'huggies'],
      keywords: ['fralda', 'pampers', 'huggies', 'babysec', 'pom pom', 'mamypoko', 'cremer']
    }
  ],
  telegram_groups: [
    { id: 'ofertasdospequenos', name: 'Ofertas Dos Pequenos', focus: 'diapers', desc: 'Especialista em Fraldas (Pampers, Huggies, Babysec) e itens infantis', enabled: true },
    { id: 'babyofertas', name: 'Baby Ofertas', focus: 'diapers', desc: 'Promoções diárias de fraldas, lenços umedecidos e enxoval', enabled: true },
    { id: 'promobebe', name: 'PromoBebê & Fraldas', focus: 'diapers', desc: 'Alertas de pacotes mega/hiper de fraldas e R$/unidade', enabled: true },
    { id: 'pechinchou', name: 'Pechinchou', focus: 'both', desc: 'Air Fryers, eletroportáteis, fraldas e cupons Shopee/Amazon/ML', enabled: true },
    { id: 'nerdofertas', name: 'Nerd Ofertas', focus: 'both', desc: 'Casa inteligente, Air Fryers e descontos gerais BR', enabled: true },
    { id: 'pelandobr', name: 'Pelando BR', focus: 'both', desc: 'Curadoria comunitária de fraldas, cozinha e achados', enabled: true },
    { id: 'escolhasegura', name: 'EscolhaSegura', focus: 'air_fryer', desc: 'Reviews e alertas de Air Fryer, TVs e eletrodomésticos', enabled: true }
  ]
};

let _miscConfig = null;
let _miscActiveCatId = 'air_fryer';
let _miscDiaperSize = 'ALL';
let _miscDiaperStyle = 'ALL';
let _miscAirType = 'ALL'; // 'ALL' | 'cesto' | 'oven'
let _miscLiveSearchState = { loading: false, query: '', zoom_items: [], telegram_deals: [], error: '', usedFallback: false };
let _miscServerSyncLoaded = false;

function _escMiscHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _slugifyMisc(txt) {
  return String(txt || 'item')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'custom';
}

function loadMiscConfigState() {
  if (_miscConfig) return _miscConfig;
  try {
    const raw = localStorage.getItem(MISC_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.telegram_groups)) {
        _miscConfig = parsed;
      }
    }
  } catch (_) {}
  if (!_miscConfig) {
    _miscConfig = JSON.parse(JSON.stringify(DEFAULT_MISC_CFG));
  }
  return _miscConfig;
}

async function syncMiscConfigFromServer() {
  if (_miscServerSyncLoaded) return;
  _miscServerSyncLoaded = true;
  if (typeof SERVER_ONLINE !== 'undefined' && !SERVER_ONLINE) return;
  try {
    const res = await fetch('/api/misc/config');
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.ok && data.config && Array.isArray(data.config.categories)) {
      const cur = loadMiscConfigState();
      // Merge server categories & groups preserving any extra local custom items
      const seenCat = new Set(cur.categories.map(c => c.id));
      data.config.categories.forEach(c => {
        if (!seenCat.has(c.id)) cur.categories.push(c);
      });
      const seenGrp = new Set(cur.telegram_groups.map(g => g.id.toLowerCase()));
      (data.config.telegram_groups || []).forEach(g => {
        if (!seenGrp.has(String(g.id).toLowerCase())) cur.telegram_groups.push(g);
      });
      localStorage.setItem(MISC_STORAGE_KEY, JSON.stringify(cur));
      if (typeof STATE !== 'undefined' && STATE.activeTab === 'misc') renderMiscTab();
    }
  } catch (_) {}
}

async function _persistMiscConfig() {
  const cfg = loadMiscConfigState();
  try { localStorage.setItem(MISC_STORAGE_KEY, JSON.stringify(cfg)); } catch (_) {}
  try {
    await fetch('/api/misc/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
  } catch (_) {}
}

function selectMiscCategory(catId) {
  _miscActiveCatId = catId;
  _miscDiaperSize = 'ALL';
  _miscDiaperStyle = 'ALL';
  _miscAirType = 'ALL';
  _miscLiveSearchState = { loading: false, query: '', zoom_items: [], telegram_deals: [], error: '', usedFallback: false };
  renderMiscTab();
}

function setMiscSubFilter(kind, val) {
  if (kind === 'diaper_size') _miscDiaperSize = val;
  else if (kind === 'diaper_style') _miscDiaperStyle = val;
  else if (kind === 'air_type') _miscAirType = val;
  renderMiscTab();
}

async function saveCustomMiscCategory() {
  const input = document.getElementById('misc-custom-query');
  const name = (input ? input.value : '').trim();
  if (!name || name.length < 2) {
    if (typeof showToast === 'function') showToast('Digite o nome do produto ou categoria (ex: Cafeteira, Creatina).', 'info');
    return;
  }
  const cfg = loadMiscConfigState();
  const id = _slugifyMisc(name);
  const exists = cfg.categories.find(c => c.id === id || c.name.toLowerCase() === name.toLowerCase());
  if (!exists) {
    cfg.categories.push({
      id,
      name,
      icon: '📦',
      builtin: false,
      queries: [name],
      keywords: name.toLowerCase().split(/\s+/).filter(w => w.length >= 3)
    });
    await _persistMiscConfig();
  }
  _miscActiveCatId = exists ? exists.id : id;
  renderMiscTab();
  searchMiscLiveNow(name);
}

async function removeCustomMiscCategory(catId) {
  const cfg = loadMiscConfigState();
  cfg.categories = cfg.categories.filter(c => c.builtin || c.id !== catId);
  if (_miscActiveCatId === catId) _miscActiveCatId = cfg.categories[0]?.id || 'air_fryer';
  await _persistMiscConfig();
  renderMiscTab();
}

async function toggleMiscTelegramGroup(grpId) {
  const cfg = loadMiscConfigState();
  const grp = cfg.telegram_groups.find(g => g.id.toLowerCase() === String(grpId).toLowerCase());
  if (!grp) return;
  grp.enabled = !grp.enabled;
  await _persistMiscConfig();
  renderMiscTab();
}

async function addCustomMiscTelegramGroup() {
  const inp = document.getElementById('misc-new-group-input');
  const focSel = document.getElementById('misc-new-group-focus');
  const raw = (inp ? inp.value : '').trim();
  const handle = raw.replace(/^https?:\/\/(t\.me|telegram\.me)\/(s\/)?/i, '').replace(/^@/, '').split(/[/?#]/)[0].trim();
  if (!handle || !/^[a-zA-Z0-9_]{4,32}$/.test(handle)) {
    if (typeof showToast === 'function') showToast('Informe um @canal válido do Telegram (ex: @promodefraldas).', 'info');
    return;
  }
  const cfg = loadMiscConfigState();
  if (!cfg.telegram_groups.some(g => g.id.toLowerCase() === handle.toLowerCase())) {
    cfg.telegram_groups.unshift({
      id: handle,
      name: `@${handle}`,
      focus: (focSel && focSel.value) || 'both',
      desc: 'Grupo/canal adicionado manualmente pelo usuário',
      enabled: true
    });
    await _persistMiscConfig();
  }
  if (inp) inp.value = '';
  renderMiscTab();
}

async function searchMiscLiveNow(explicitQuery = null) {
  const cfg = loadMiscConfigState();
  const cat = cfg.categories.find(c => c.id === _miscActiveCatId);
  const qInput = document.getElementById('misc-custom-query');
  const q = (explicitQuery != null ? explicitQuery : (qInput ? qInput.value.trim() : '')) || (cat ? (cat.queries?.[0] || cat.name) : '');
  if (!q) return;

  _miscLiveSearchState = { loading: true, query: q, zoom_items: [], telegram_deals: [], error: '', usedFallback: false };
  renderMiscTab();

  const enabledCh = cfg.telegram_groups.filter(g => g.enabled !== false).map(g => g.id).join(',');
  const canBackend = (typeof SERVER_ONLINE === 'undefined') || SERVER_ONLINE || location.hostname === '192.168.20.10' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (canBackend) {
    try {
      const url = `/api/misc/search?q=${encodeURIComponent(q)}&cat=${encodeURIComponent(_miscActiveCatId)}&channels=${encodeURIComponent(enabledCh)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          _miscLiveSearchState = {
            loading: false,
            query: q,
            zoom_items: data.zoom_items || [],
            telegram_deals: data.telegram_deals || [],
            error: '',
            usedFallback: false
          };
          renderMiscTab();
          return;
        }
      }
    } catch (_) {}
  }

  // Static fallback (GitHub Pages or offline backend): filter local misc_deals + expose instant store search links
  _miscLiveSearchState = {
    loading: false,
    query: q,
    zoom_items: [],
    telegram_deals: [],
    error: '',
    usedFallback: true
  };
  renderMiscTab();
}

function _getMiscDealsFromPromoCache() {
  const fromPromo = (typeof PROMO_STATE !== 'undefined' && PROMO_STATE.lastData && Array.isArray(PROMO_STATE.lastData.misc_deals))
    ? PROMO_STATE.lastData.misc_deals : null;
  if (fromPromo && fromPromo.length) return fromPromo;
  return (typeof DB !== 'undefined' && DB.live_promos && Array.isArray(DB.live_promos.misc_deals))
    ? DB.live_promos.misc_deals : [];
}

function _renderMiscCategoryFiltersHTML(catId) {
  if (catId === 'diapers') {
    const sizes = ['ALL', 'RN', 'P', 'M', 'G', 'XG', 'XXG', 'XXXG'];
    return `
      <div class="ui-filter-bar">
        <div class="ui-filter-row">
          <div class="ui-filter-group">
            <span class="ui-label mr-1">Tamanho:</span>
            ${sizes.map(sz => `<button type="button" onclick="setMiscSubFilter('diaper_size','${sz}')" class="ui-chip ${_miscDiaperSize === sz ? 'is-active' : ''}">${sz === 'ALL' ? 'Todos' : sz}</button>`).join('')}
          </div>
          <div class="ui-filter-group ml-0 sm:ml-3">
            <span class="ui-label mr-1">Modelo:</span>
            <button type="button" onclick="setMiscSubFilter('diaper_style','ALL')" class="ui-chip ${_miscDiaperStyle === 'ALL' ? 'is-active' : ''}">Todos</button>
            <button type="button" onclick="setMiscSubFilter('diaper_style','pants')" class="ui-chip ${_miscDiaperStyle === 'pants' ? 'is-active' : ''}">Pants (Calça)</button>
            <button type="button" onclick="setMiscSubFilter('diaper_style','fita')" class="ui-chip ${_miscDiaperStyle === 'fita' ? 'is-active' : ''}">Fita Tradicional</button>
          </div>
        </div>
      </div>
    `;
  }
  if (catId === 'air_fryer') {
    return `
      <div class="ui-filter-bar">
        <div class="ui-filter-row">
          <div class="ui-filter-group">
            <span class="ui-label mr-1">Formato:</span>
            <button type="button" onclick="setMiscSubFilter('air_type','ALL')" class="ui-chip ${_miscAirType === 'ALL' ? 'is-active' : ''}">Todas</button>
            <button type="button" onclick="setMiscSubFilter('air_type','cesto')" class="ui-chip ${_miscAirType === 'cesto' ? 'is-active' : ''}">Cesto Tradicional</button>
            <button type="button" onclick="setMiscSubFilter('air_type','oven')" class="ui-chip ${_miscAirType === 'oven' ? 'is-active' : ''}">Oven / Forno 10L+</button>
          </div>
        </div>
      </div>
    `;
  }
  return '';
}

function renderMiscTab() {
  syncMiscConfigFromServer();
  const cfg = loadMiscConfigState();
  const cat = cfg.categories.find(c => c.id === _miscActiveCatId) || cfg.categories[0];
  if (cat) _miscActiveCatId = cat.id;

  // 1. Category Bar
  const catBar = document.getElementById('misc-categories-bar');
  if (catBar) {
    catBar.innerHTML = cfg.categories.map(c => `
      <div class="inline-flex items-center gap-1">
        <button type="button" onclick="selectMiscCategory('${_escMiscHtml(c.id)}')" class="ui-chip ${c.id === _miscActiveCatId ? 'is-active' : ''}">
          ${_escMiscHtml(c.icon || '📦')} ${_escMiscHtml(c.name)}
        </button>
        ${!c.builtin ? `<button type="button" onclick="removeCustomMiscCategory('${_escMiscHtml(c.id)}')" class="text-xs text-slate-400 hover:text-rose-400 px-1" title="Remover categoria">✕</button>` : ''}
      </div>
    `).join('');
  }

  // 2. Domain Filters
  const filtersEl = document.getElementById('misc-subfilters-wrap');
  if (filtersEl) filtersEl.innerHTML = _renderMiscCategoryFiltersHTML(_miscActiveCatId);

  // 3. Telegram Diaper & Misc Groups Panel
  const grpEl = document.getElementById('misc-telegram-groups-list');
  if (grpEl) {
    const focusBadge = f => f === 'diapers'
      ? '<span class="ui-badge ui-badge--b">Fraldas & Bebê</span>'
      : (f === 'air_fryer' ? '<span class="ui-badge ui-badge--a">Casa / Tech</span>' : '<span class="ui-badge">Misto (Fraldas + Casa)</span>');
    grpEl.innerHTML = cfg.telegram_groups.map(g => {
      const enabled = g.enabled !== false;
      return `
        <div class="p-3 rounded-xl bg-slate-950 border ${enabled ? 'border-slate-700' : 'border-slate-800/60'} flex flex-col justify-between gap-2" style="${enabled ? '' : 'opacity:0.6;'}">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-xs font-bold text-white">@${_escMiscHtml(g.id)}</span>
                ${focusBadge(g.focus)}
              </div>
              <p class="text-xs text-slate-400 mt-1">${_escMiscHtml(g.desc || g.name)}</p>
            </div>
            <button type="button" onclick="toggleMiscTelegramGroup('${_escMiscHtml(g.id)}')" class="ui-btn ui-btn--sm shrink-0">${enabled ? 'Ativo' : 'Pausado'}</button>
          </div>
          <div class="flex items-center justify-between pt-1.5 border-t border-slate-800/70 text-xs">
            <a href="https://t.me/s/${_escMiscHtml(g.id)}" target="_blank" rel="noopener noreferrer" class="text-sky-300 hover:underline">Abrir feed t.me/s/${_escMiscHtml(g.id)} ↗</a>
            <button type="button" onclick="searchMiscLiveNow()" class="text-slate-300 hover:text-white underline">Buscar agora</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // 4. Resolve items (either live search results OR saved catalog + promos)
  const qCustom = (document.getElementById('misc-custom-query')?.value || '').trim();
  const activeQuery = _miscLiveSearchState.query || qCustom;
  const searchBanner = document.getElementById('misc-search-status-banner');
  if (searchBanner) {
    if (_miscLiveSearchState.loading) {
      searchBanner.innerHTML = `<div class="p-3 rounded-xl bg-sky-950/40 border border-sky-500/40 text-xs text-sky-200">🔎 Buscando "${_escMiscHtml(_miscLiveSearchState.query)}" ao vivo no Zoom BR e nos canais do Telegram...</div>`;
    } else if (_miscLiveSearchState.usedFallback && _miscLiveSearchState.query) {
      const qEnc = encodeURIComponent(_miscLiveSearchState.query);
      searchBanner.innerHTML = `
        <div class="p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
          <span>Modo estático (sem backend Python ativo para busca ad-hoc): pesquise <strong>${_escMiscHtml(_miscLiveSearchState.query)}</strong> direto nos sites BR:</span>
          <div class="flex flex-wrap gap-2">
            <a href="https://www.zoom.com.br/search?q=${qEnc}" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn--sm">Zoom BR ↗</a>
            <a href="https://www.amazon.com.br/s?k=${qEnc}" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn--sm">Amazon BR ↗</a>
            <a href="https://lista.mercadolivre.com.br/${qEnc}" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn--sm">Mercado Livre ↗</a>
          </div>
        </div>
      `;
    } else if (_miscLiveSearchState.query) {
      searchBanner.innerHTML = `<div class="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/35 text-xs text-emerald-200 flex items-center justify-between gap-2"><span>✓ Resultados ao vivo para "<strong>${_escMiscHtml(_miscLiveSearchState.query)}</strong>": ${_miscLiveSearchState.zoom_items.length} no Zoom BR • ${_miscLiveSearchState.telegram_deals.length} no Telegram</span><button type="button" onclick="selectMiscCategory('${_escMiscHtml(_miscActiveCatId)}')" class="ui-btn ui-btn--sm">Limpar Busca</button></div>`;
    } else {
      searchBanner.innerHTML = '';
    }
  }

  // Catalog grid
  const rawCatList = (typeof DB !== 'undefined' && DB.misc_catalog && Array.isArray(DB.misc_catalog[_miscActiveCatId]))
    ? DB.misc_catalog[_miscActiveCatId] : [];
  let catalogItems = (_miscLiveSearchState.zoom_items && _miscLiveSearchState.zoom_items.length)
    ? _miscLiveSearchState.zoom_items
    : rawCatList.slice();

  if (qCustom && !_miscLiveSearchState.zoom_items.length) {
    const ql = qCustom.toLowerCase();
    catalogItems = catalogItems.filter(it => `${it.name} ${(it.specs && it.specs.summary) || ''}`.toLowerCase().includes(ql));
  }
  if (_miscActiveCatId === 'diapers') {
    catalogItems = catalogItems.filter(it => {
      const sp = it.specs || {};
      if (_miscDiaperSize !== 'ALL' && sp.size !== _miscDiaperSize) return false;
      if (_miscDiaperStyle === 'pants' && !sp.is_pants) return false;
      if (_miscDiaperStyle === 'fita' && sp.is_pants) return false;
      return true;
    }).sort((a, b) => Number((a.specs && a.specs.price_per_unit) || 999) - Number((b.specs && b.specs.price_per_unit) || 999));
  } else if (_miscActiveCatId === 'air_fryer') {
    catalogItems = catalogItems.filter(it => {
      const sp = it.specs || {};
      if (_miscAirType === 'oven' && !sp.is_oven) return false;
      if (_miscAirType === 'cesto' && sp.is_oven) return false;
      return true;
    }).sort((a, b) => Number(a.price_brl || 0) - Number(b.price_brl || 0));
  }

  const catGrid = document.getElementById('misc-catalog-grid');
  if (catGrid) {
    if (!catalogItems.length) {
      const qEnc = encodeURIComponent(activeQuery || (cat ? cat.name : 'ofertas'));
      catGrid.innerHTML = `
        <div class="col-span-full p-5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-3">
          <span>Nenhum item salvo ainda para "${_escMiscHtml(cat ? cat.name : _miscActiveCatId)}". Clique em <strong>🔎 Buscar Agora</strong> para consultar Zoom BR e Telegram ao vivo.</span>
          <a href="https://www.zoom.com.br/search?q=${qEnc}" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn--sm">Pesquisar no Zoom ↗</a>
        </div>
      `;
    } else {
      catGrid.innerHTML = catalogItems.slice(0, 24).map(it => {
        const sp = it.specs || {};
        const ppu = sp.price_per_unit;
        const ppl = sp.price_per_liter;
        const unitHighlight = ppu
          ? `<span class="ui-badge ui-badge--good ui-mono">R$ ${Number(ppu).toFixed(2)}/fralda</span>`
          : (ppl ? `<span class="ui-badge ui-badge--a ui-mono">R$ ${Math.round(ppl)}/L</span>` : '');
        const lowAirWarn = (_miscActiveCatId === 'air_fryer' && Number(it.price_brl || 0) < 150)
          ? '<span class="text-xs text-amber-300 block">⚠️ Preço baixo: pode ser parcela ou acessório</span>' : '';
        return `
          <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-sky-500/40 transition flex flex-col justify-between gap-2.5">
            <div class="flex items-start gap-3">
              ${it.image_url ? `<img src="${_escMiscHtml(it.image_url)}" alt="" class="w-12 h-12 rounded-lg object-contain bg-slate-900 border border-slate-800 p-0.5 shrink-0" loading="lazy" onerror="this.classList.add('hidden')">` : ''}
              <div class="min-w-0 flex-1 space-y-1">
                <div class="text-xs sm:text-sm font-bold text-white line-clamp-2" title="${_escMiscHtml(it.name)}">${_escMiscHtml(it.name)}</div>
                <div class="text-xs text-slate-400 ui-mono">${_escMiscHtml(sp.summary || it.brand || '')}</div>
              </div>
            </div>
            <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-base font-black ui-mono text-white">${fmtBRL(it.price_brl)}</span>
                  ${unitHighlight}
                </div>
                ${lowAirWarn}
              </div>
              ${it.offer_url ? `<a href="${_escMiscHtml(it.offer_url)}" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn--sm shrink-0">Zoom ↗</a>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Telegram Misc Promos Grid
  const rawDeals = _getMiscDealsFromPromoCache();
  let deals = (_miscLiveSearchState.telegram_deals && _miscLiveSearchState.telegram_deals.length)
    ? _miscLiveSearchState.telegram_deals
    : rawDeals.filter(d => {
        if (d.misc_category === _miscActiveCatId) return true;
        if (cat && !cat.builtin) {
          const hay = `${d.title || ''} ${d.raw_text || ''}`.toLowerCase();
          return (cat.keywords || []).some(kw => kw && hay.includes(String(kw).toLowerCase()));
        }
        return false;
      });

  if (_miscActiveCatId === 'diapers') {
    deals = deals.filter(d => {
      const sp = d.misc_specs || {};
      if (_miscDiaperSize !== 'ALL' && sp.size !== _miscDiaperSize) return false;
      if (_miscDiaperStyle === 'pants' && !sp.is_pants) return false;
      if (_miscDiaperStyle === 'fita' && sp.is_pants) return false;
      return true;
    }).sort((a, b) => Number((a.misc_specs && a.misc_specs.price_per_unit) || 999) - Number((b.misc_specs && b.misc_specs.price_per_unit) || 999));
  }

  const promosEl = document.getElementById('misc-promos-grid');
  if (promosEl) {
    if (!deals.length) {
      promosEl.innerHTML = '<div class="col-span-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">Sem ofertas recentes do Telegram para este filtro. Clique em <strong>🔎 Buscar Agora</strong> acima ou cheque os feeds diretos dos grupos de fraldas/casa ao lado.</div>';
    } else {
      promosEl.innerHTML = deals.slice(0, 24).map(d => {
        const sp = d.misc_specs || {};
        const ppu = sp.price_per_unit ? `<span class="ui-badge ui-badge--good ui-mono">R$ ${Number(sp.price_per_unit).toFixed(2)}/fralda</span>` : '';
        const link = d.url || d.post_url || '#';
        return `
          <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 transition flex flex-col justify-between gap-2.5">
            <div class="space-y-1.5">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <span class="ui-badge ui-badge--a">${_escMiscHtml(d.channel_name || ('@' + (d.channel || 'telegram')))}</span>
                <span class="text-xs ui-mono text-slate-400">${Math.round(Number(d.age_hours || 1))}h • ${_escMiscHtml(d.store || 'Loja BR')}</span>
              </div>
              <div class="text-xs sm:text-sm font-bold text-white line-clamp-2" title="${_escMiscHtml(d.title)}">${_escMiscHtml(d.title)}</div>
              ${sp.summary ? `<div class="text-xs ui-mono text-slate-300">${_escMiscHtml(sp.summary)}</div>` : ''}
              ${d.coupon_code ? `<div class="text-xs ui-mono text-amber-300">🎟️ Cupom: <strong>${_escMiscHtml(d.coupon_code)}</strong></div>` : ''}
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-slate-800/80 gap-2">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-base font-black ui-mono text-emerald-400">${fmtBRL(d.price_brl)}</span>
                ${ppu}
              </div>
              <a href="${_escMiscHtml(link)}" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn--sm ui-btn--primary shrink-0">Pegar ↗</a>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

window.selectMiscCategory = selectMiscCategory;
window.setMiscSubFilter = setMiscSubFilter;
window.saveCustomMiscCategory = saveCustomMiscCategory;
window.removeCustomMiscCategory = removeCustomMiscCategory;
window.toggleMiscTelegramGroup = toggleMiscTelegramGroup;
window.addCustomMiscTelegramGroup = addCustomMiscTelegramGroup;
window.searchMiscLiveNow = searchMiscLiveNow;
window.renderMiscTab = renderMiscTab;
