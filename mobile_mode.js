/* ============================================================================
 * GCA ANALYZER — MOBILE LAYER CONTROLLER
 * Enhances mobile navigation, card tables, and quick-sort controls on phones
 * without touching desktop (> 768px) logic or styling.
 * ============================================================================ */

(function () {
  'use strict';

  const TABLE_CONFIGS = [
    {
      tbodyId: 'cb-table-body',
      sortFnName: 'setCBSort',
      sortOptions: [
        { key: 'my_cb', label: 'Melhor C/B' },
        { key: 'price', label: 'Menor Preço' },
        { key: 'target', label: 'Preço Alvo' },
        { key: 'rank', label: 'Posição' }
      ]
    },
    {
      tbodyId: 'cpu-cb-table-body',
      sortFnName: 'setCpuCBSort',
      sortOptions: [
        { key: 'my_cb', label: 'Melhor C/B' },
        { key: 'price', label: 'Menor Preço' },
        { key: 'gaming', label: 'Jogos / WS' },
        { key: 'target', label: 'Preço Alvo' }
      ]
    },
    {
      tbodyId: 'laptop-cb-table-body',
      sortFnName: 'setLaptopCBSort',
      sortOptions: [
        { key: 'my_cb', label: 'Melhor C/B' },
        { key: 'price', label: 'Menor Preço' },
        { key: 'ram', label: 'RAM / SSD' },
        { key: 'target', label: 'Preço Alvo' }
      ]
    },
    {
      tbodyId: 'smartphone-cb-table-body',
      sortFnName: 'setSmartphoneCBSort',
      sortOptions: [
        { key: 'my_cb', label: 'Melhor C/B' },
        { key: 'price', label: 'Menor Preço' },
        { key: 'ram', label: 'RAM / Armaz.' },
        { key: 'target', label: 'Preço Alvo' }
      ]
    },
    {
      tbodyId: 'peripherals-table-body',
      sortFnName: null,
      sortOptions: []
    },
    {
      tbodyId: 'peripherals-cb-table-body',
      sortFnName: 'setPeriphCBCtxSort',
      sortOptions: [
        { key: 'cb', label: 'Melhor C/B' },
        { key: 'score', label: 'Maior Nota' },
        { key: 'price_asc', label: 'Menor Preço' },
        { key: 'price_desc', label: 'Maior Preço' }
      ]
    },
    {
      tbodyId: 'misc-cb-table-body',
      sortFnName: 'setMiscCBCtxSort',
      sortOptions: [
        { key: 'cb', label: 'Melhor C/B' },
        { key: 'unit_asc', label: 'Menor R$/Unid. ou R$/L' },
        { key: 'price_asc', label: 'Menor Preço' },
        { key: 'price_desc', label: 'Maior Preço' }
      ]
    },
    {
      tbodyId: 'bf-table-body',
      sortFnName: null,
      sortOptions: []
    }
  ];

  function isMobileViewport() {
    return window.innerWidth <= 768;
  }

  function ensureMobileConfigBottomNav() {
    const nav = document.getElementById('mobile-bottom-nav');
    if (!nav || document.getElementById('bnav-config')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'bnav-config';
    btn.className = 'ui-bottom-nav-btn';
    btn.setAttribute('aria-label', 'Configurações do Sistema');
    btn.innerHTML =
      '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>' +
      '</svg><span>Ajustes</span>';
    btn.addEventListener('click', function () {
      if (typeof window.switchTab === 'function') window.switchTab('config');
    });
    nav.appendChild(btn);
  }

  function syncMobileBottomNavState(tabId) {
    const resolved = tabId || (typeof STATE !== 'undefined' && STATE.activeTab) || '';
    const cfgBtn = document.getElementById('bnav-config');
    if (cfgBtn) cfgBtn.classList.toggle('is-active', resolved === 'config');
  }

  function observeConfigTabVisibility() {
    const cfgSec = document.getElementById('tab-config');
    if (!cfgSec || cfgSec.__gcaMobileCfgObs) return;
    cfgSec.__gcaMobileCfgObs = true;
    const obs = new MutationObserver(() => {
      syncMobileBottomNavState(cfgSec.classList.contains('hidden') ? '' : 'config');
    });
    obs.observe(cfgSec, { attributes: true, attributeFilter: ['class'] });
  }

  function classifyColumnRole(label, colIdx) {
    const low = String(label || '').trim().toLowerCase();
    if (low === '#' || (colIdx === 0 && low === '')) return 'rank';
    if (
      colIdx <= 1 &&
      (low.includes('placa') || low.includes('processador') || low.includes('notebook') || low.includes('smartphone') || low.includes('celular') || low.includes('periférico') || low.includes('produto') || low.includes('item') || low.includes('modelo'))
    ) {
      return 'name';
    }
    if (low.includes('relação') || low.includes('relacao') || low.includes('posição na faixa')) {
      return 'verdict';
    }
    if (low === 'ações' || low === 'acoes' || low === 'ação' || low === 'acao') {
      return 'actions';
    }
    return 'metric';
  }

  function annotateTableRows(tbody) {
    if (!tbody) return;
    const table = tbody.closest('table');
    if (!table) return;
    const ths = Array.from(table.querySelectorAll('thead tr th'));
    if (!ths.length) return;

    const headers = ths.map((th, idx) => {
      const label = (th.textContent || '').replace(/\s+/g, ' ').trim();
      return { label, role: classifyColumnRole(label, idx) };
    });

    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
      const tds = tr.querySelectorAll('td');
      tds.forEach((td, idx) => {
        if (td.hasAttribute('colspan')) return;
        const meta = headers[idx];
        if (!meta) return;
        if (td.getAttribute('data-label') !== meta.label) {
          td.setAttribute('data-label', meta.label);
        }
        if (td.getAttribute('data-col-role') !== meta.role) {
          td.setAttribute('data-col-role', meta.role);
        }
      });
    });
  }

  function buildToolbarForTable(cfg) {
    const tbody = document.getElementById(cfg.tbodyId);
    if (!tbody) return;
    const wrap = tbody.closest('.ui-table-wrap');
    if (!wrap || !wrap.parentElement) return;
    if (wrap.previousElementSibling && wrap.previousElementSibling.classList.contains('gca-mobile-cb-toolbar')) {
      return;
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'gca-mobile-cb-toolbar';
    toolbar.setAttribute('data-for-tbody', cfg.tbodyId);

    const sortStrip = document.createElement('div');
    sortStrip.className = 'gca-mobile-sort-strip';

    if (cfg.sortOptions.length && cfg.sortFnName) {
      cfg.sortOptions.forEach((opt, idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'gca-mobile-sort-btn' + (idx === 0 ? ' is-active' : '');
        b.textContent = opt.label;
        b.setAttribute('data-sort-key', opt.key);
        b.addEventListener('click', function () {
          sortStrip.querySelectorAll('.gca-mobile-sort-btn').forEach(x => x.classList.remove('is-active'));
          b.classList.add('is-active');
          const fn = window[cfg.sortFnName];
          if (typeof fn === 'function') fn(opt.key);
        });
        sortStrip.appendChild(b);
      });
    } else {
      const lbl = document.createElement('span');
      lbl.className = 'ui-label';
      lbl.textContent = 'Visualização Mobile';
      sortStrip.appendChild(lbl);
    }

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'gca-mobile-view-btn';
    const cardIcon =
      '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm0 9a2 2 0 012-2h12a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3z"></path></svg>';
    const tableIcon =
      '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18M9 4v16M15 4v16M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"></path></svg>';
    viewBtn.innerHTML = `${tableIcon}<span>Ver Tabela</span>`;
    viewBtn.setAttribute('aria-pressed', 'false');
    viewBtn.addEventListener('click', function () {
      const isRaw = wrap.classList.toggle('gca-mobile-raw-table');
      viewBtn.classList.toggle('is-raw', isRaw);
      viewBtn.setAttribute('aria-pressed', String(isRaw));
      viewBtn.innerHTML = isRaw ? `${cardIcon}<span>Ver Cards</span>` : `${tableIcon}<span>Ver Tabela</span>`;
    });

    toolbar.appendChild(sortStrip);
    toolbar.appendChild(viewBtn);
    wrap.parentElement.insertBefore(toolbar, wrap);
  }

  function observeAllTables() {
    TABLE_CONFIGS.forEach(cfg => {
      const tbody = document.getElementById(cfg.tbodyId);
      if (!tbody) return;
      buildToolbarForTable(cfg);
      annotateTableRows(tbody);

      if (tbody.__gcaMobileObserved) return;
      tbody.__gcaMobileObserved = true;
      const obs = new MutationObserver(() => {
        annotateTableRows(tbody);
      });
      obs.observe(tbody, { childList: true });
    });
  }

  function wrapNavigationHooks() {
    if (typeof window.switchTab === 'function' && !window.switchTab.__gcaMobileWrapped) {
      const origSwitchTab = window.switchTab;
      const wrapped = function (tabId) {
        const res = origSwitchTab.apply(this, arguments);
        syncMobileBottomNavState(tabId);
        if (isMobileViewport()) {
          try {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } catch (_) {
            window.scrollTo(0, 0);
          }
        }
        return res;
      };
      wrapped.__gcaMobileWrapped = true;
      window.switchTab = wrapped;
    }
  }

  function initMobileMode() {
    ensureMobileConfigBottomNav();
    wrapNavigationHooks();
    observeConfigTabVisibility();
    observeAllTables();
    if (typeof STATE !== 'undefined' && STATE.activeTab) {
      syncMobileBottomNavState(STATE.activeTab);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMode);
  } else {
    initMobileMode();
  }
  window.addEventListener('load', initMobileMode);
})();
