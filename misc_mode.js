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

function _canUseMiscBackend() {
  const localOk = typeof isLocalServerHost === 'function'
    ? isLocalServerHost()
    : (/^(localhost|127\.0\.0\.1|192\.168\.|10\.)$/.test(location.hostname) || location.hostname.startsWith('192.168.') || location.hostname.startsWith('10.'));
  return localOk && (typeof SERVER_ONLINE === 'undefined' || SERVER_ONLINE);
}

async function syncMiscConfigFromServer() {
  if (_miscServerSyncLoaded) return;
  _miscServerSyncLoaded = true;
  if (!_canUseMiscBackend()) return;
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
      if (typeof STATE !== 'undefined' && (STATE.activeTab === 'misc' || STATE.context === 'misc')) renderMiscTab();
    }
  } catch (_) {}
}

async function _persistMiscConfig() {
  const cfg = loadMiscConfigState();
  try { localStorage.setItem(MISC_STORAGE_KEY, JSON.stringify(cfg)); } catch (_) {}
  if (!_canUseMiscBackend()) return;
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
  if (_canUseMiscBackend()) {
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

const _miscCharts = {};
let _miscMainDuelCat = 'air_fryer';
let _miscMainDuelASlug = '';
let _miscMainDuelBSlug = '';
let _miscCBCtxCat = 'air_fryer';
let _miscCBCtxDiaperSize = 'ALL';
let _miscCBCtxDiaperStyle = 'ALL';
let _miscCBCtxAirType = 'ALL';
let _miscBuilderAirSlug = '';
let _miscBuilderDiaperSlug = '';
let _miscSimChangesPerDay = 6;
let _miscSimCouponBrl = 25;

function _destroyMiscChartSafe(key) {
  if (_miscCharts[key] && typeof _miscCharts[key].destroy === 'function') {
    try { _miscCharts[key].destroy(); } catch (_) {}
    delete _miscCharts[key];
  }
}

function getMiscCatalogPool(catId = null) {
  const map = (typeof DB !== 'undefined' && DB.misc_catalog && typeof DB.misc_catalog === 'object') ? DB.misc_catalog : {};
  const list = [];
  const cats = catId && catId !== 'all' ? [catId] : Object.keys(map);
  cats.forEach(cid => {
    (map[cid] || []).forEach(it => {
      if (it && it.slug && Number(it.price_brl || 0) > 5) {
        list.push({ ...it, category_id: it.category_id || cid });
      }
    });
  });
  return list;
}

function getMiscUnitValue(it) {
  const sp = (it && it.specs) || {};
  if ((it.category_id || '') === 'diapers' && Number(sp.price_per_unit || 0) > 0) {
    return { val: Number(sp.price_per_unit), label: `R$ ${Number(sp.price_per_unit).toFixed(2)}/fralda`, unit: 'fralda' };
  }
  if ((it.category_id || '') === 'air_fryer' && Number(sp.price_per_liter || 0) > 0) {
    return { val: Number(sp.price_per_liter), label: `R$ ${Math.round(sp.price_per_liter)}/L`, unit: 'L' };
  }
  return { val: Number((it && it.price_brl) || 0), label: '', unit: '' };
}

function _shortMiscName(it) {
  if (!it || !it.name) return '--';
  const s = String(it.name).replace(/\s+/g, ' ').trim();
  return s.length > 48 ? s.slice(0, 46) + '…' : s;
}

function setMiscMainDuelCat(cid) {
  _miscMainDuelCat = cid || 'air_fryer';
  _miscMainDuelASlug = '';
  _miscMainDuelBSlug = '';
  renderMiscDuelAnalysis();
}

function onMiscMainDuelChange() {
  const a = document.getElementById('misc-main-duel-a')?.value;
  const b = document.getElementById('misc-main-duel-b')?.value;
  if (a) _miscMainDuelASlug = a;
  if (b) _miscMainDuelBSlug = b;
  renderMiscDuelAnalysis();
}

function swapMiscMainDuel() {
  const tmp = _miscMainDuelASlug;
  _miscMainDuelASlug = _miscMainDuelBSlug;
  _miscMainDuelBSlug = tmp;
  renderMiscDuelAnalysis();
}

function setMiscMainDuelItem(slug, slot = 'b', catId = null) {
  if (catId) _miscMainDuelCat = catId;
  else {
    const found = getMiscCatalogPool().find(x => x.slug === slug);
    if (found && found.category_id) _miscMainDuelCat = found.category_id;
  }
  if (slot === 'a') _miscMainDuelASlug = slug;
  else _miscMainDuelBSlug = slug;
  if (typeof switchTab === 'function') switchTab('versus');
  else renderMiscDuelAnalysis();
}

function renderMiscDuelAnalysis() {
  const ctrlEl = document.getElementById('misc-main-duel-controls');
  const verdEl = document.getElementById('misc-main-duel-verdict');
  const specsEl = document.getElementById('misc-main-duel-specs');
  if (!ctrlEl || !verdEl) return;

  const pool = getMiscCatalogPool(_miscMainDuelCat);
  const allPool = pool.length ? pool : getMiscCatalogPool();
  if (!allPool.length) {
    ctrlEl.innerHTML = '<span class="text-xs text-slate-400">Catálogo de Diversos vazio.</span>';
    verdEl.innerHTML = '';
    if (specsEl) specsEl.innerHTML = '';
    return;
  }

  let itemA = allPool.find(x => x.slug === _miscMainDuelASlug) || allPool[0];
  let itemB = allPool.find(x => x.slug === _miscMainDuelBSlug && x.slug !== itemA.slug) || allPool[Math.min(1, allPool.length - 1)];
  _miscMainDuelASlug = itemA.slug;
  _miscMainDuelBSlug = itemB.slug;

  const opts = cur => allPool.map(it => {
    const u = getMiscUnitValue(it);
    return `<option value="${_escMiscHtml(it.slug)}" ${it.slug === cur ? 'selected' : ''}>${_escMiscHtml(_shortMiscName(it))} — ${fmtBRLShort(it.price_brl)}${u.label ? ` (${u.label})` : ''}</option>`;
  }).join('');

  ctrlEl.innerHTML = `
    <div class="flex flex-wrap items-center gap-1.5 mr-2">
      <button type="button" onclick="setMiscMainDuelCat('air_fryer')" class="ui-chip ${_miscMainDuelCat === 'air_fryer' ? 'is-active' : ''}">🍟 Air Fryer</button>
      <button type="button" onclick="setMiscMainDuelCat('diapers')" class="ui-chip ${_miscMainDuelCat === 'diapers' ? 'is-active' : ''}">👶 Fraldas</button>
    </div>
    <div class="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border" style="border-color:var(--ui-compare-a-border);">
      <span class="ui-badge ui-badge--a ui-mono">A</span>
      <select id="misc-main-duel-a" onchange="onMiscMainDuelChange()" class="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-white max-w-[210px]">${opts(itemA.slug)}</select>
    </div>
    <button type="button" onclick="swapMiscMainDuel()" class="ui-btn ui-btn--icon" title="Inverter A e B">⇄</button>
    <div class="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border" style="border-color:var(--ui-compare-b-border);">
      <span class="ui-badge ui-badge--b ui-mono">B</span>
      <select id="misc-main-duel-b" onchange="onMiscMainDuelChange()" class="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-white max-w-[210px]">${opts(itemB.slug)}</select>
    </div>
  `;

  const uA = getMiscUnitValue(itemA);
  const uB = getMiscUnitValue(itemB);
  const cbWin = Number(itemA.cb_score || 0) >= Number(itemB.cb_score || 0) ? itemA : itemB;
  const unitWin = (uA.val > 0 && uB.val > 0) ? (uA.val <= uB.val ? itemA : itemB) : cbWin;
  const psA = itemA.price_stats || {};
  const psB = itemB.price_stats || {};

  verdEl.innerHTML = `
    <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
      <span class="ui-label">Opção A</span>
      <div class="font-bold text-white text-sm truncate" title="${_escMiscHtml(itemA.name)}">${_escMiscHtml(_shortMiscName(itemA))}</div>
      <div class="text-xs ui-mono text-sky-300">${fmtBRL(itemA.price_brl)} ${uA.label ? `• ${uA.label}` : ''} • C/B ${Math.round(itemA.cb_score || 60)}</div>
      <div class="text-xs text-slate-400 ui-mono">Vs média 90d: ${psA.vs_avg_90d_pct > 0 ? '+' : ''}${psA.vs_avg_90d_pct ?? 0}%</div>
    </div>
    <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 flex flex-col justify-center">
      <span class="ui-label">Veredito Comparativo</span>
      <div class="text-sm font-black text-emerald-400">🏆 Melhor Economia: ${_escMiscHtml(_shortMiscName(unitWin))}</div>
      <div class="text-xs text-slate-300 ui-mono">Diferença pacote: ${fmtBRLShort(Math.abs(Number(itemA.price_brl || 0) - Number(itemB.price_brl || 0)))}</div>
      <div class="text-xs text-slate-400">Custo-Benefício geral: <strong class="text-slate-200">${_escMiscHtml(_shortMiscName(cbWin))} (${Math.round(cbWin.cb_score || 60)}/100)</strong></div>
    </div>
    <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
      <span class="ui-label">Opção B</span>
      <div class="font-bold text-white text-sm truncate" title="${_escMiscHtml(itemB.name)}">${_escMiscHtml(_shortMiscName(itemB))}</div>
      <div class="text-xs ui-mono text-purple-300">${fmtBRL(itemB.price_brl)} ${uB.label ? `• ${uB.label}` : ''} • C/B ${Math.round(itemB.cb_score || 60)}</div>
      <div class="text-xs text-slate-400 ui-mono">Vs média 90d: ${psB.vs_avg_90d_pct > 0 ? '+' : ''}${psB.vs_avg_90d_pct ?? 0}%</div>
    </div>
  `;

  const cs = getComputedStyle(document.documentElement);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const colors = {
    cmpA: (cs.getPropertyValue('--ui-compare-a') || '').trim() || '#38bdf8',
    cmpAText: (cs.getPropertyValue('--ui-compare-a-text') || '').trim() || '#7dd3fc',
    cmpAFill: isLight ? 'rgba(2, 132, 199, 0.22)' : 'rgba(56, 189, 248, 0.22)',
    cmpB: (cs.getPropertyValue('--ui-compare-b') || '').trim() || '#a855f7',
    cmpBText: (cs.getPropertyValue('--ui-compare-b-text') || '').trim() || '#d8b4fe',
    cmpBFill: isLight ? 'rgba(124, 58, 237, 0.20)' : 'rgba(168, 85, 247, 0.22)',
    text: isLight ? '#0f172a' : '#e2e8f0',
    muted: isLight ? '#475569' : '#94a3b8',
    grid: isLight ? 'rgba(15, 23, 42, 0.10)' : 'rgba(148, 163, 184, 0.14)'
  };

  const radarCanvas = document.getElementById('chart-misc-main-radar');
  if (radarCanvas && typeof Chart !== 'undefined') {
    _destroyMiscChartSafe('mainRadar');
    const _miscVec = it => {
      const sp = it.specs || {};
      const ps = it.price_stats || {};
      const discScore = Math.max(30, Math.min(98, 70 - Number(ps.vs_avg_90d_pct || 0) * 1.4));
      if (_miscMainDuelCat === 'diapers') {
        const ppu = Number(sp.price_per_unit || 1.1);
        const econ = Math.max(25, Math.min(98, (2.0 - Math.min(1.9, ppu)) * 65));
        const pack = Math.max(30, Math.min(98, ((sp.units || 60) / 180) * 90));
        return [Math.round(econ), Math.round(pack), Math.round(Number(it.overall_score || 65)), Math.round(discScore)];
      }
      const lit = Math.max(35, Math.min(98, ((sp.liters || 4) / 12) * 95));
      const pwr = Math.max(40, Math.min(98, ((sp.watts || 1500) / 2000) * 95));
      return [Math.round(lit), Math.round(pwr), Math.round(Number(it.overall_score || 65)), Math.round(discScore)];
    };
    const rLbls = _miscMainDuelCat === 'diapers'
      ? ['Economia R$/fralda', 'Volume Pacote', 'Qualidade Linha', 'Momento Preço']
      : ['Capacidade (L)', 'Potência (W)', 'Nota Geral', 'Momento Preço'];
    _miscCharts.mainRadar = new Chart(radarCanvas, {
      type: 'radar',
      data: {
        labels: rLbls,
        datasets: [
          { label: _shortMiscName(itemA), data: _miscVec(itemA), borderColor: colors.cmpA, backgroundColor: colors.cmpAFill, borderWidth: 2 },
          { label: _shortMiscName(itemB), data: _miscVec(itemB), borderColor: colors.cmpB, backgroundColor: colors.cmpBFill, borderWidth: 2 }
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

  const histCanvas = document.getElementById('chart-misc-main-history');
  if (histCanvas && typeof Chart !== 'undefined') {
    _destroyMiscChartSafe('mainHistory');
    const hA = Array.isArray(itemA.history) ? itemA.history : [];
    const hB = Array.isArray(itemB.history) ? itemB.history : [];
    const dates = Array.from(new Set([...hA.map(x => x.date), ...hB.map(x => x.date)])).sort();
    const mA = Object.fromEntries(hA.map(x => [x.date, x.price]));
    const mB = Object.fromEntries(hB.map(x => [x.date, x.price]));
    const lbls = dates.length ? dates : ['Hoje'];
    _miscCharts.mainHistory = new Chart(histCanvas, {
      type: 'line',
      data: {
        labels: lbls.map(d => d.slice(5) || d),
        datasets: [
          { label: _shortMiscName(itemA), data: lbls.map(d => mA[d] ?? itemA.price_brl), borderColor: colors.cmpA, backgroundColor: colors.cmpAFill, tension: 0.25, pointRadius: 2 },
          { label: _shortMiscName(itemB), data: lbls.map(d => mB[d] ?? itemB.price_brl), borderColor: colors.cmpB, backgroundColor: colors.cmpBFill, tension: 0.25, pointRadius: 2 }
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
    const spA = itemA.specs || {};
    const spB = itemB.specs || {};
    const domainRows = _miscMainDuelCat === 'diapers'
      ? [
          ['Tamanho', spA.size || '--', spB.size || '--'],
          ['Modelo', spA.style || '--', spB.style || '--'],
          ['Unidades no pacote', spA.units ? `${spA.units} unid.` : '--', spB.units ? `${spB.units} unid.` : '--'],
          ['Custo por fralda', uA.label || '--', uB.label || '--']
        ]
      : [
          ['Capacidade (L)', spA.liters ? `${spA.liters}L` : '--', spB.liters ? `${spB.liters}L` : '--'],
          ['Formato', spA.is_oven ? 'Oven / Forno' : 'Cesto', spB.is_oven ? 'Oven / Forno' : 'Cesto'],
          ['Painel / Potência', `${spA.is_digital ? 'Digital' : 'Mecânica'} • ${spA.watts || '--'}W`, `${spB.is_digital ? 'Digital' : 'Mecânica'} • ${spB.watts || '--'}W`],
          ['Custo por Litro', uA.label || '--', uB.label || '--']
        ];
    const rows = [
      ['Marca', itemA.brand || '--', itemB.brand || '--'],
      ['Preço Atual (Zoom BR)', fmtBRL(itemA.price_brl), fmtBRL(itemB.price_brl)],
      ['Média 90d / Mín. Histórico', `${fmtBRLShort(psA.avg_90d || itemA.price_brl)} / ${fmtBRLShort(psA.min_all_time || itemA.price_brl)}`, `${fmtBRLShort(psB.avg_90d || itemB.price_brl)} / ${fmtBRLShort(psB.min_all_time || itemB.price_brl)}`],
      ...domainRows,
      ['Score C/B', `${itemA.cb_score || '--'}/100`, `${itemB.cb_score || '--'}/100`]
    ];
    specsEl.innerHTML = `
      <table class="w-full text-xs">
        <thead>
          <tr class="border-b border-slate-800 text-slate-400">
            <th class="text-left py-1.5 px-2">Critério</th>
            <th class="text-left py-1.5 px-2" style="color:${colors.cmpAText};">A · ${_escMiscHtml(_shortMiscName(itemA))}</th>
            <th class="text-left py-1.5 px-2" style="color:${colors.cmpBText};">B · ${_escMiscHtml(_shortMiscName(itemB))}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/60">
          ${rows.map(r => `<tr><td class="py-1.5 px-2 text-slate-400">${_escMiscHtml(r[0])}</td><td class="py-1.5 px-2 text-slate-100 ui-mono">${_escMiscHtml(r[1])}</td><td class="py-1.5 px-2 text-slate-100 ui-mono">${_escMiscHtml(r[2])}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }
}

function setMiscCBCtxCat(cid) {
  _miscCBCtxCat = cid || 'air_fryer';
  _miscCBCtxDiaperSize = 'ALL';
  _miscCBCtxDiaperStyle = 'ALL';
  _miscCBCtxAirType = 'ALL';
  renderMiscCBView();
}

function setMiscCBCtxSub(kind, val) {
  if (kind === 'diaper_size') _miscCBCtxDiaperSize = val;
  if (kind === 'diaper_style') _miscCBCtxDiaperStyle = val;
  if (kind === 'air_type') _miscCBCtxAirType = val;
  renderMiscCBView();
}

function setMiscCBCtxSort(key) {
  const sel = document.getElementById('misc-cb-sort');
  if (sel) sel.value = key;
  renderMiscCBView();
}

function renderMiscCBView() {
  const filtersEl = document.getElementById('misc-cb-filters');
  const tbody = document.getElementById('misc-cb-table-body');
  if (!tbody) return;

  const cfg = loadMiscConfigState();
  if (filtersEl) {
    const cats = [{ id: 'all', name: 'Todos', icon: '📦' }, ...cfg.categories.filter(c => c.builtin || getMiscCatalogPool(c.id).length)];
    let subHtml = '';
    if (_miscCBCtxCat === 'diapers') {
      subHtml = `
        <div class="ui-filter-row mt-2">
          <div class="ui-filter-group">
            <span class="ui-label mr-1">Tam.:</span>
            ${['ALL', 'RN', 'P', 'M', 'G', 'XG', 'XXG', 'XXXG'].map(sz => `<button type="button" onclick="setMiscCBCtxSub('diaper_size','${sz}')" class="ui-chip ${_miscCBCtxDiaperSize === sz ? 'is-active' : ''}">${sz === 'ALL' ? 'Todos' : sz}</button>`).join('')}
          </div>
          <div class="ui-filter-group ml-0 sm:ml-3">
            <button type="button" onclick="setMiscCBCtxSub('diaper_style','ALL')" class="ui-chip ${_miscCBCtxDiaperStyle === 'ALL' ? 'is-active' : ''}">Todos</button>
            <button type="button" onclick="setMiscCBCtxSub('diaper_style','pants')" class="ui-chip ${_miscCBCtxDiaperStyle === 'pants' ? 'is-active' : ''}">Pants</button>
            <button type="button" onclick="setMiscCBCtxSub('diaper_style','fita')" class="ui-chip ${_miscCBCtxDiaperStyle === 'fita' ? 'is-active' : ''}">Fita</button>
          </div>
        </div>
      `;
    } else if (_miscCBCtxCat === 'air_fryer') {
      subHtml = `
        <div class="ui-filter-row mt-2">
          <div class="ui-filter-group">
            <span class="ui-label mr-1">Formato:</span>
            <button type="button" onclick="setMiscCBCtxSub('air_type','ALL')" class="ui-chip ${_miscCBCtxAirType === 'ALL' ? 'is-active' : ''}">Todas</button>
            <button type="button" onclick="setMiscCBCtxSub('air_type','cesto')" class="ui-chip ${_miscCBCtxAirType === 'cesto' ? 'is-active' : ''}">Cesto</button>
            <button type="button" onclick="setMiscCBCtxSub('air_type','oven')" class="ui-chip ${_miscCBCtxAirType === 'oven' ? 'is-active' : ''}">Oven 10L+</button>
          </div>
        </div>
      `;
    }
    filtersEl.innerHTML = `
      <div class="ui-filter-row">
        <div class="ui-filter-group">
          <span class="ui-label mr-1">Categoria:</span>
          ${cats.map(c => `<button type="button" onclick="setMiscCBCtxCat('${_escMiscHtml(c.id)}')" class="ui-chip ${_miscCBCtxCat === c.id ? 'is-active' : ''}">${_escMiscHtml(c.icon || '📦')} ${_escMiscHtml(c.name)}</button>`).join('')}
        </div>
      </div>
      ${subHtml}
    `;
  }

  let items = getMiscCatalogPool(_miscCBCtxCat);
  const q = (document.getElementById('misc-cb-search')?.value || '').trim().toLowerCase();
  const sortMode = document.getElementById('misc-cb-sort')?.value || 'cb';

  items = items.filter(it => {
    const sp = it.specs || {};
    if (it.category_id === 'diapers') {
      if (_miscCBCtxDiaperSize !== 'ALL' && sp.size !== _miscCBCtxDiaperSize) return false;
      if (_miscCBCtxDiaperStyle === 'pants' && !sp.is_pants) return false;
      if (_miscCBCtxDiaperStyle === 'fita' && sp.is_pants) return false;
    } else if (it.category_id === 'air_fryer') {
      if (_miscCBCtxAirType === 'cesto' && sp.is_oven) return false;
      if (_miscCBCtxAirType === 'oven' && !sp.is_oven) return false;
    }
    if (q) {
      const hay = `${it.name} ${it.brand || ''} ${sp.summary || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  items.sort((a, b) => {
    if (sortMode === 'price_asc') return Number(a.price_brl || 0) - Number(b.price_brl || 0);
    if (sortMode === 'price_desc') return Number(b.price_brl || 0) - Number(a.price_brl || 0);
    if (sortMode === 'unit_asc') return getMiscUnitValue(a).val - getMiscUnitValue(b).val;
    return Number(b.cb_score || 0) - Number(a.cb_score || 0);
  });

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-6 text-slate-400">Nenhum produto encontrado para este filtro.</td></tr>';
  } else {
    tbody.innerHTML = items.map((it, i) => {
      const ps = it.price_stats || {};
      const tgt = Number(ps.target_price || it.price_brl * 0.88);
      const u = getMiscUnitValue(it);
      const spark = typeof renderPriceSparklineSVG === 'function' ? renderPriceSparklineSVG(it, it.price_brl, tgt) : '';
      const cb = Math.round(it.cb_score || 65);
      const cbTone = cb >= 72 ? 'text-emerald-400' : (cb >= 52 ? 'text-sky-300' : 'text-amber-300');
      return `
        <tr>
          <td class="ui-mono text-xs text-slate-400">${i + 1}</td>
          <td>
            <div class="flex items-center gap-2.5">
              ${it.image_url ? `<img src="${_escMiscHtml(it.image_url)}" alt="" class="w-9 h-9 rounded-lg object-contain bg-slate-950 border border-slate-800 p-0.5 shrink-0" loading="lazy" onerror="this.classList.add('hidden')">` : ''}
              <div class="min-w-0">
                <div class="font-bold text-slate-100 text-xs sm:text-sm truncate max-w-[240px]" title="${_escMiscHtml(it.name)}">${_escMiscHtml(_shortMiscName(it))}</div>
                <div class="text-xs text-slate-400 ui-mono">${it.category_id === 'diapers' ? '👶 Fralda' : (it.category_id === 'air_fryer' ? '🍟 Air Fryer' : '📦 Diverso')} • ${_escMiscHtml(it.brand || '')}</div>
              </div>
            </div>
          </td>
          <td class="text-xs text-slate-300 ui-mono max-w-[240px]">
            ${u.label ? `<span class="ui-badge ui-badge--good mr-1">${_escMiscHtml(u.label)}</span>` : ''}
            <span>${_escMiscHtml((it.specs && it.specs.summary) || '--')}</span>
          </td>
          <td class="text-right ui-mono">
            <span class="font-bold text-white">${fmtBRLShort(it.price_brl)}</span>
            <span class="block text-xs text-slate-400">Alvo ${fmtBRLShort(tgt)}</span>
          </td>
          <td class="text-center">${spark}</td>
          <td class="text-center ui-mono">
            <span class="font-black text-sm ${cbTone}">${cb}</span>
            <span class="block text-xs text-slate-400">Média ${fmtBRLShort(ps.avg_90d || it.price_brl)}</span>
          </td>
          <td class="text-center">
            <div class="flex items-center justify-center gap-1">
              <button type="button" onclick="setMiscMainDuelItem('${_escMiscHtml(it.slug)}','a','${_escMiscHtml(it.category_id)}')" class="ui-btn ui-btn--sm" title="Definir como A no duelo">A</button>
              <button type="button" onclick="setMiscMainDuelItem('${_escMiscHtml(it.slug)}','b','${_escMiscHtml(it.category_id)}')" class="ui-btn ui-btn--sm" title="Definir como B no duelo">B</button>
              ${it.offer_url ? `<a href="${_escMiscHtml(it.offer_url)}" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn--sm" title="Ver no Zoom BR">↗</a>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  const scCanvas = document.getElementById('chart-misc-cb-scatter');
  if (scCanvas && typeof Chart !== 'undefined' && items.length) {
    _destroyMiscChartSafe('cbScatter');
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const txtClr = isLight ? '#0f172a' : '#e2e8f0';
    const mutClr = isLight ? '#475569' : '#94a3b8';
    const grdClr = isLight ? 'rgba(15, 23, 42, 0.10)' : 'rgba(148, 163, 184, 0.14)';
    const byCat = {
      air_fryer: { label: '🍟 Air Fryer', color: '#f59e0b', pts: [] },
      diapers: { label: '👶 Fraldas', color: '#10b981', pts: [] },
      custom: { label: '📦 Outros', color: '#38bdf8', pts: [] }
    };
    items.forEach(it => {
      const b = byCat[it.category_id] || byCat.custom;
      b.pts.push({ x: Number(it.price_brl || 0), y: Number(it.cb_score || 60), name: _shortMiscName(it) });
    });
    _miscCharts.cbScatter = new Chart(scCanvas, {
      type: 'scatter',
      data: {
        datasets: Object.values(byCat).filter(g => g.pts.length).map(g => ({
          label: g.label, data: g.pts, backgroundColor: g.color, pointRadius: 5, pointHoverRadius: 7
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: txtClr } },
          tooltip: { callbacks: { label: ctx => `${ctx.raw.name}: ${fmtBRLShort(ctx.raw.x)} • C/B ${Math.round(ctx.raw.y)}/100` } }
        },
        scales: {
          x: { title: { display: true, text: 'Preço Atual (R$)', color: mutClr }, ticks: { color: mutClr, callback: v => fmtBRLShort(v) }, grid: { color: grdClr } },
          y: { title: { display: true, text: 'Score Custo-Benefício (0-100)', color: mutClr }, ticks: { color: mutClr }, grid: { color: grdClr } }
        }
      }
    });
  }
}

function setMiscBuilderSlot(kind, slug) {
  if (kind === 'air_fryer') _miscBuilderAirSlug = slug;
  else if (kind === 'diapers') _miscBuilderDiaperSlug = slug;
  renderMiscBuilder();
}

function renderMiscBuilder() {
  const root = document.getElementById('builder-misc-view');
  if (!root) return;
  const afs = getMiscCatalogPool('air_fryer');
  const dps = getMiscCatalogPool('diapers');
  if (!_miscBuilderAirSlug && afs.length) _miscBuilderAirSlug = afs[0].slug;
  if (!_miscBuilderDiaperSlug && dps.length) _miscBuilderDiaperSlug = dps[0].slug;
  const selAf = afs.find(x => x.slug === _miscBuilderAirSlug) || afs[0];
  const selDp = dps.find(x => x.slug === _miscBuilderDiaperSlug) || dps[0];
  const total = (selAf ? Number(selAf.price_brl || 0) : 0) + (selDp ? Number(selDp.price_brl || 0) : 0);
  const cfg = loadMiscConfigState();
  const customCats = cfg.categories.filter(c => !c.builtin);

  root.innerHTML = `
    <div class="lg:col-span-8 ui-card space-y-4">
      <div class="pb-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span class="ui-label">Cesta Casa &amp; Bebê</span>
          <h2 class="ui-title-lg">Selecione sua Air Fryer, Pacote de Fraldas &amp; Item Personalizado</h2>
        </div>
        <button type="button" onclick="switchTab('misc')" class="ui-btn ui-btn--sm">Abrir Busca ao Vivo</button>
      </div>
      <div class="space-y-3">
        <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div class="flex justify-between text-xs"><span class="font-bold text-amber-300">🍟 Air Fryer</span><span class="ui-mono font-bold text-white">${selAf ? fmtBRL(selAf.price_brl) : '--'}</span></div>
          <select onchange="setMiscBuilderSlot('air_fryer', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-semibold">
            ${afs.map(x => `<option value="${_escMiscHtml(x.slug)}" ${selAf && selAf.slug === x.slug ? 'selected' : ''}>${_escMiscHtml(_shortMiscName(x))} — ${fmtBRLShort(x.price_brl)}</option>`).join('')}
          </select>
          ${selAf ? `<div class="text-xs text-slate-400 ui-mono">${_escMiscHtml((selAf.specs && selAf.specs.summary) || '')}</div>` : ''}
        </div>
        <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div class="flex justify-between text-xs"><span class="font-bold text-emerald-300">👶 Fraldas Infantis</span><span class="ui-mono font-bold text-white">${selDp ? fmtBRL(selDp.price_brl) : '--'}</span></div>
          <select onchange="setMiscBuilderSlot('diapers', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-semibold">
            ${dps.map(x => `<option value="${_escMiscHtml(x.slug)}" ${selDp && selDp.slug === x.slug ? 'selected' : ''}>${_escMiscHtml(_shortMiscName(x))} — ${fmtBRLShort(x.price_brl)} (${getMiscUnitValue(x).label})</option>`).join('')}
          </select>
          ${selDp ? `<div class="text-xs text-slate-400 ui-mono">${_escMiscHtml((selDp.specs && selDp.specs.summary) || '')}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="lg:col-span-4 space-y-4">
      <div class="ui-card space-y-3">
        <span class="ui-label">Resumo da Cesta</span>
        <div class="text-3xl font-black ui-mono text-white">${fmtBRL(total)}</div>
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
          <div class="flex justify-between"><span class="text-slate-400">Categorias Personalizadas:</span><strong class="ui-mono text-sky-300">${customCats.length}</strong></div>
          <div class="flex justify-between"><span class="text-slate-400">Grupos de Fraldas/Casa Ativos:</span><strong class="ui-mono text-emerald-400">${cfg.telegram_groups.filter(g => g.enabled !== false).length}</strong></div>
        </div>
        <button type="button" onclick="switchTab('bf-promos')" class="ui-btn ui-btn--primary w-full">Alertas de Air Fryer / Fraldas / Livre</button>
      </div>
    </div>
  `;
}

function renderMiscUpgrades() {
  const root = document.getElementById('upgrades-misc-view');
  if (!root) return;
  const cfg = loadMiscConfigState();
  root.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
      <div>
        <span class="ui-label">Guia de Compra + Grupos de Fraldas &amp; Casa</span>
        <h2 class="ui-title-lg">Valores de Referência (R$/L &amp; R$/fralda) e Grupos Monitorados</h2>
      </div>
      <button type="button" onclick="switchTab('misc')" class="ui-btn ui-btn--sm ui-btn--primary">Buscar Produto ao Vivo</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
        <div class="text-sm font-bold text-emerald-300">👶 Referência R$/fralda por Tamanho</div>
        <ul class="space-y-1 text-slate-300 ui-mono">
          <li>• RN / P: alvo bom R$ 0,65 – R$ 0,85/unid.</li>
          <li>• M / G: alvo bom R$ 0,80 – R$ 1,05/unid.</li>
          <li>• XG / XXG / Pants: alvo bom R$ 0,95 – R$ 1,35/unid.</li>
        </ul>
      </div>
      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
        <div class="text-sm font-bold text-amber-300">🍟 Referência Air Fryer (R$/Litro)</div>
        <ul class="space-y-1 text-slate-300 ui-mono">
          <li>• Cesto 4L–5.5L: ideal R$ 55 – R$ 85/L</li>
          <li>• Cesto 7L–8L: ideal R$ 55 – R$ 75/L</li>
          <li>• Oven / Forno 10L–12L: ideal R$ 45 – R$ 75/L</li>
        </ul>
      </div>
    </div>
    <div class="space-y-2">
      <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider">Grupos do Telegram onde Fraldas &amp; Casa aparecem</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        ${cfg.telegram_groups.map(g => `
          <div class="p-3 rounded-xl bg-slate-950 border ${g.enabled !== false ? 'border-slate-700' : 'border-slate-800/60'} flex items-center justify-between gap-2 text-xs">
            <div class="min-w-0">
              <div class="font-bold text-white truncate">@${_escMiscHtml(g.id)}</div>
              <div class="text-slate-400 truncate">${_escMiscHtml(g.name || '')}</div>
            </div>
            <button type="button" onclick="toggleMiscTelegramGroup('${_escMiscHtml(g.id)}'); renderMiscUpgrades();" class="ui-btn ui-btn--sm shrink-0">${g.enabled !== false ? 'Ativo' : 'Pausado'}</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function setMiscSimParam(kind, val) {
  if (kind === 'changes') _miscSimChangesPerDay = Math.max(1, Math.min(15, Number(val) || 6));
  if (kind === 'coupon') _miscSimCouponBrl = Math.max(0, Number(val) || 0);
  renderMiscSimulator();
}

function renderMiscSimulator() {
  const root = document.getElementById('sim-misc-view');
  if (!root) return;
  const dps = getMiscCatalogPool('diapers').filter(x => Number((x.specs || {}).price_per_unit || 0) > 0);
  const afs = getMiscCatalogPool('air_fryer');
  const sortedDp = dps.slice().sort((a, b) => Number(a.specs.price_per_unit) - Number(b.specs.price_per_unit));
  const bestDp = sortedDp[0];
  const midDp = sortedDp[Math.floor(sortedDp.length / 2)] || bestDp;
  const monthlyUnits = _miscSimChangesPerDay * 30;
  const bestMonth = bestDp ? monthlyUnits * Number(bestDp.specs.price_per_unit) : 0;
  const midMonth = midDp ? monthlyUnits * Number(midDp.specs.price_per_unit) : 0;
  const annualSaving = Math.max(0, (midMonth - bestMonth) * 12);
  const selAf = afs.find(x => x.slug === _miscBuilderAirSlug) || afs[0];
  const afWithCoupon = selAf ? Math.max(50, Number(selAf.price_brl || 0) - _miscSimCouponBrl) : 0;

  root.innerHTML = `
    <div class="ui-card space-y-4">
      <div class="pb-3 border-b border-slate-800">
        <span class="ui-label">Calculadora Real de Economia</span>
        <h2 class="ui-title-lg">Consumo Mensal de Fraldas &amp; Cupom Air Fryer</h2>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div class="text-sm font-bold text-emerald-300">👶 Simulador de Gasto com Fraldas</div>
          <div>
            <div class="flex justify-between text-xs mb-1"><span class="text-slate-300">Trocas por dia:</span><strong class="ui-mono text-white">${_miscSimChangesPerDay} trocas/dia (${monthlyUnits} fraldas/mês)</strong></div>
            <input type="range" min="2" max="12" step="1" value="${_miscSimChangesPerDay}" oninput="setMiscSimParam('changes', this.value)" class="w-full" />
          </div>
          ${bestDp ? `
            <div class="text-xs space-y-1 ui-mono">
              <div class="text-emerald-400">Melhor R$/fralda: ${_escMiscHtml(_shortMiscName(bestDp))} → ${fmtBRL(bestMonth)}/mês (R$ ${Number(bestDp.specs.price_per_unit).toFixed(2)}/unid.)</div>
              <div class="text-slate-400">Mediana do catálogo → ${fmtBRL(midMonth)}/mês (R$ ${Number(midDp.specs.price_per_unit).toFixed(2)}/unid.)</div>
              <div class="text-sky-300 font-bold pt-1">Economia estimada em 1 ano escolhendo o pacote certo: ${fmtBRL(annualSaving)}!</div>
            </div>
          ` : '<div class="text-xs text-slate-400">Aguardando pacotes com contagem de fraldas.</div>'}
        </div>
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div class="text-sm font-bold text-amber-300">🍟 Simulador de Cupom Air Fryer</div>
          <div>
            <div class="flex justify-between text-xs mb-1"><span class="text-slate-300">Cupom / Cashback aplicado (R$ OFF):</span><strong class="ui-mono text-amber-300">−${fmtBRLShort(_miscSimCouponBrl)}</strong></div>
            <input type="number" min="0" max="500" step="10" value="${_miscSimCouponBrl}" onchange="setMiscSimParam('coupon', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs ui-mono text-white" />
          </div>
          ${selAf ? `
            <div class="text-xs space-y-1 ui-mono">
              <div class="text-slate-300 font-semibold">${_escMiscHtml(_shortMiscName(selAf))}</div>
              <div>Hoje: ${fmtBRL(selAf.price_brl)} → Com cupom: <strong class="text-emerald-400">${fmtBRL(afWithCoupon)}</strong></div>
              ${(selAf.specs && selAf.specs.liters) ? `<div class="text-sky-300">Custo por Litro cai para R$ ${(afWithCoupon / Number(selAf.specs.liters)).toFixed(2)}/L</div>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderMiscConfigSection() {
  const el = document.getElementById('cfg-ref-misc-container');
  if (!el) return;
  const cfg = loadMiscConfigState();
  const afs = getMiscCatalogPool('air_fryer').length;
  const dps = getMiscCatalogPool('diapers').length;
  el.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800"><span class="text-slate-400 block">🍟 Air Fryers</span><strong class="text-lg ui-mono text-white">${afs}</strong></div>
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800"><span class="text-slate-400 block">👶 Fraldas</span><strong class="text-lg ui-mono text-white">${dps}</strong></div>
      <div class="p-3 rounded-xl bg-slate-950 border border-slate-800"><span class="text-slate-400 block">📢 Grupos Ativos</span><strong class="text-lg ui-mono text-emerald-400">${cfg.telegram_groups.filter(g => g.enabled !== false).length}</strong></div>
    </div>
    <p class="text-xs text-slate-400">Personalize alertas de Air Fryer, tamanho/preço por fralda (R$/unid.) ou qualquer item livre na aba <strong>Promoções → Filtros</strong>.</p>
  `;
}

window.getMiscCatalogPool = getMiscCatalogPool;
window.selectMiscCategory = selectMiscCategory;
window.setMiscSubFilter = setMiscSubFilter;
window.saveCustomMiscCategory = saveCustomMiscCategory;
window.removeCustomMiscCategory = removeCustomMiscCategory;
window.toggleMiscTelegramGroup = toggleMiscTelegramGroup;
window.addCustomMiscTelegramGroup = addCustomMiscTelegramGroup;
window.searchMiscLiveNow = searchMiscLiveNow;
window.renderMiscTab = renderMiscTab;
window.setMiscMainDuelCat = setMiscMainDuelCat;
window.onMiscMainDuelChange = onMiscMainDuelChange;
window.swapMiscMainDuel = swapMiscMainDuel;
window.setMiscMainDuelItem = setMiscMainDuelItem;
window.renderMiscDuelAnalysis = renderMiscDuelAnalysis;
window.setMiscCBCtxCat = setMiscCBCtxCat;
window.setMiscCBCtxSub = setMiscCBCtxSub;
window.setMiscCBCtxSort = setMiscCBCtxSort;
window.renderMiscCBView = renderMiscCBView;
window.setMiscBuilderSlot = setMiscBuilderSlot;
window.renderMiscBuilder = renderMiscBuilder;
window.renderMiscUpgrades = renderMiscUpgrades;
window.setMiscSimParam = setMiscSimParam;
window.renderMiscSimulator = renderMiscSimulator;
window.renderMiscConfigSection = renderMiscConfigSection;
