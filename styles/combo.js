/* ==========================================================================
   GCA Combo — lista de opções própria para todos os <select> do site
   - Abre sempre logo abaixo do campo (nunca em posição aleatória)
   - Campo de busca para filtrar as opções (acentos e maiúsculas ignorados)
   - O <select> original continua no DOM como fonte da verdade: o código
     existente segue lendo .value, trocando as <option> e recebendo 'change'.
   ========================================================================== */
(function () {
  'use strict';

  const SEARCH_MIN_OPTIONS = 7; // abaixo disso, a busca não aparece
  const PANEL_MIN_HEIGHT = 180;
  const PANEL_MAX_HEIGHT = 380;

  let openCombo = null;

  const normalize = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();

  // ---- Mantém o botão sincronizado quando o JS muda o valor por código ----
  function patchValueSetter(proto, prop) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || !desc.set) return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(v) {
        desc.set.call(this, v);
        if (this._gcaCombo) this._gcaCombo.syncLabel();
      }
    });
  }
  patchValueSetter(HTMLSelectElement.prototype, 'value');
  patchValueSetter(HTMLSelectElement.prototype, 'selectedIndex');

  // ---- Painel único reaproveitado por todos os campos ----
  const panel = document.createElement('div');
  panel.className = 'gca-combo-panel';
  panel.setAttribute('role', 'dialog');
  panel.hidden = true;
  panel.innerHTML =
    '<div class="gca-combo-search-wrap">' +
    '<svg class="gca-combo-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"/></svg>' +
    '<input type="text" class="gca-combo-search" placeholder="Digite para filtrar…" autocomplete="off" spellcheck="false" aria-label="Filtrar opções" />' +
    '</div>' +
    '<ul class="gca-combo-list" role="listbox"></ul>' +
    '<div class="gca-combo-empty" hidden>Nenhuma opção encontrada</div>';
  const searchWrap = panel.querySelector('.gca-combo-search-wrap');
  const searchInput = panel.querySelector('.gca-combo-search');
  const list = panel.querySelector('.gca-combo-list');
  const emptyMsg = panel.querySelector('.gca-combo-empty');

  class Combo {
    constructor(select) {
      this.select = select;
      select._gcaCombo = this;

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = (select.className || '') + ' gca-combo-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      if (select.title) trigger.title = select.title;
      const aria = select.getAttribute('aria-label');
      if (aria) trigger.setAttribute('aria-label', aria);
      trigger.innerHTML =
        '<span class="gca-combo-label"></span>' +
        '<svg class="gca-combo-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.25" d="M6 9l6 6 6-6"/></svg>';
      this.trigger = trigger;
      this.labelEl = trigger.querySelector('.gca-combo-label');

      select.classList.add('gca-combo-native');
      select.tabIndex = -1;
      select.setAttribute('aria-hidden', 'true');
      select.insertAdjacentElement('afterend', trigger);

      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (openCombo === this) close();
        else this.open();
      });
      trigger.addEventListener('keydown', (e) => {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
          this.open();
        }
      });

      // Opções trocadas pelo JS (innerHTML) ou campo desabilitado
      this.observer = new MutationObserver(() => {
        this.syncLabel();
        if (openCombo === this) this.renderOptions(searchInput.value);
      });
      this.observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class', 'style'] });
      select.addEventListener('change', () => this.syncLabel());

      this.syncLabel();
    }

    syncLabel() {
      const s = this.select;
      const opt = s.options[s.selectedIndex];
      this.labelEl.textContent = opt ? opt.textContent.trim() : '';
      this.trigger.disabled = s.disabled;
      // Acompanha classes de layout que o código troque no select
      const base = (s.className || '').replace(/\bgca-combo-native\b/g, '').trim();
      this.trigger.className = base + ' gca-combo-trigger' + (openCombo === this ? ' is-open' : '');
      // Some junto se o select for escondido
      const hidden = s.classList.contains('hidden') || s.style.display === 'none';
      this.trigger.style.display = hidden ? 'none' : '';
    }

    open() {
      if (this.select.disabled) return;
      if (openCombo && openCombo !== this) close();
      openCombo = this;
      this.trigger.classList.add('is-open');
      this.trigger.setAttribute('aria-expanded', 'true');

      const many = this.select.options.length >= SEARCH_MIN_OPTIONS;
      searchWrap.hidden = !many;
      searchInput.value = '';
      this.renderOptions('');

      panel.hidden = false;
      position();
      if (many) searchInput.focus({ preventScroll: true });
      else panel.focus({ preventScroll: true });
      const sel = list.querySelector('.is-selected');
      if (sel) {
        this.setActive(sel);
        sel.scrollIntoView({ block: 'center' });
      }
    }

    renderOptions(query) {
      const q = normalize(query).trim();
      const terms = q ? q.split(/\s+/) : [];
      const s = this.select;
      list.innerHTML = '';
      let shown = 0;
      let lastGroup = null;
      Array.from(s.options).forEach((opt, idx) => {
        if (opt.hidden) return;
        const text = opt.textContent.trim();
        // Preço fica fora da busca: "rtx 50" não deve achar "RTX 2080 — R$ 7.850"
        const hay = normalize(text.replace(/R\$\s?[\d.,]+/g, ' ') + ' ' + opt.value);
        if (terms.length && !terms.every((t) => hay.includes(t))) return;
        const group = opt.parentElement && opt.parentElement.tagName === 'OPTGROUP' ? opt.parentElement : null;
        if (group && group !== lastGroup) {
          const gl = document.createElement('li');
          gl.className = 'gca-combo-group';
          gl.textContent = group.label;
          list.appendChild(gl);
        }
        lastGroup = group;
        const li = document.createElement('li');
        li.className = 'gca-combo-option';
        li.setAttribute('role', 'option');
        li.dataset.index = String(idx);
        li.textContent = text || '—';
        if (idx === s.selectedIndex) {
          li.classList.add('is-selected');
          li.setAttribute('aria-selected', 'true');
        }
        if (opt.disabled || (group && group.disabled)) li.classList.add('is-disabled');
        list.appendChild(li);
        shown++;
      });
      emptyMsg.hidden = shown > 0;
      const first = list.querySelector('.gca-combo-option:not(.is-disabled)');
      if (q && first) this.setActive(first);
    }

    setActive(li) {
      list.querySelectorAll('.is-active').forEach((x) => x.classList.remove('is-active'));
      if (li) {
        li.classList.add('is-active');
        li.scrollIntoView({ block: 'nearest' });
      }
    }

    choose(li) {
      if (!li || li.classList.contains('is-disabled')) return;
      const idx = Number(li.dataset.index);
      const s = this.select;
      const changed = s.selectedIndex !== idx;
      s.selectedIndex = idx;
      close();
      this.trigger.focus({ preventScroll: true });
      if (changed) {
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  function position() {
    if (!openCombo) return;
    const r = openCombo.trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    // No celular, a barra inferior fixa não pode cobrir o fim da lista
    const nav = document.querySelector('.ui-bottom-nav');
    const navH = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().height : 0;
    const vh = window.innerHeight - navH;
    const margin = 8;
    const width = Math.min(Math.max(r.width, 260), vw - margin * 2);
    const left = Math.min(Math.max(r.left, margin), vw - width - margin);
    const top = r.bottom + 6;
    // Sempre para baixo; a altura se adapta ao espaço disponível
    const space = vh - top - margin;
    const maxH = Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, space));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.width = width + 'px';
    panel.style.maxHeight = maxH + 'px';
    // Sem espaço suficiente embaixo: rola a página para o painel caber
    if (space < PANEL_MIN_HEIGHT) {
      window.scrollBy({ top: PANEL_MIN_HEIGHT - space + margin, behavior: 'smooth' });
    }
  }

  function close() {
    if (!openCombo) return;
    const c = openCombo;
    openCombo = null;
    panel.hidden = true;
    c.trigger.classList.remove('is-open');
    c.trigger.setAttribute('aria-expanded', 'false');
  }

  // ---- Eventos do painel ----
  searchInput.addEventListener('input', () => {
    if (openCombo) openCombo.renderOptions(searchInput.value);
  });
  panel.tabIndex = -1;
  panel.addEventListener('keydown', (e) => {
    if (!openCombo) return;
    const items = Array.from(list.querySelectorAll('.gca-combo-option:not(.is-disabled)'));
    const cur = list.querySelector('.is-active');
    let i = items.indexOf(cur);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openCombo.setActive(items[Math.min(items.length - 1, i + 1)] || items[0]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openCombo.setActive(items[Math.max(0, i - 1)] || items[0]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openCombo.choose(cur || items[0]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      const c = openCombo;
      close();
      if (e.key === 'Escape') c.trigger.focus({ preventScroll: true });
    }
  });
  list.addEventListener('mousedown', (e) => e.preventDefault()); // mantém o foco na busca
  list.addEventListener('click', (e) => {
    const li = e.target.closest('.gca-combo-option');
    if (li && openCombo) openCombo.choose(li);
  });
  list.addEventListener('mousemove', (e) => {
    const li = e.target.closest('.gca-combo-option:not(.is-disabled)');
    if (li && openCombo && !li.classList.contains('is-active')) {
      list.querySelectorAll('.is-active').forEach((x) => x.classList.remove('is-active'));
      li.classList.add('is-active');
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (!openCombo) return;
    if (panel.contains(e.target) || openCombo.trigger.contains(e.target)) return;
    close();
  });
  window.addEventListener('resize', position);
  document.addEventListener('scroll', (e) => {
    if (!openCombo) return;
    if (panel.contains(e.target)) return;
    // Fecha se o campo saiu da tela; senão acompanha
    const r = openCombo.trigger.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) close();
    else position();
  }, true);

  // ---- Aplica em todos os selects, inclusive os criados depois ----
  function enhance(root) {
    const sels = root.tagName === 'SELECT' ? [root] : root.querySelectorAll ? root.querySelectorAll('select') : [];
    sels.forEach((s) => {
      if (s._gcaCombo || s.multiple || s.size > 1 || s.dataset.native === 'true') return;
      new Combo(s);
    });
  }

  function init() {
    document.body.appendChild(panel);
    enhance(document.body);
    new MutationObserver((muts) => {
      muts.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1 && n !== panel && !panel.contains(n)) enhance(n);
        });
        m.removedNodes.forEach((n) => {
          if (openCombo && n.nodeType === 1 && (n === openCombo.select || n.contains(openCombo.select))) close();
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.GCA_COMBO = { enhance, close };
})();
