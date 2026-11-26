// ============================================================================
// SMARTPHONE_MODE.JS — Deep Smartphone Mode for PC & Tech Analyzer
// Mirrors laptop_mode.js architecture with mobile SoC, Camera, AMOLED/Hz,
// Battery/SOT, On-Device AI (NPU TOPS), Storage & OS Update Longevity models.
// ============================================================================

const SP_CATEGORY_ORDER = ['flagship', 'upper_mid', 'midrange', 'entry'];
const SP_CATEGORY_LABELS = {
  flagship: 'Flagships (Topo de Linha)',
  upper_mid: 'Intermediários Premium',
  midrange: 'Intermediários & Custo-Benefício',
  entry: 'Entrada & Básicos'
};
const SP_CATEGORY_SHORT = {
  flagship: 'Flagship',
  upper_mid: 'Inter. Pro',
  midrange: 'Intermediário',
  entry: 'Entrada'
};

const _spCharts = {};
let _spCbSortCol = 'my_cb';
let _spCbSortDir = 'desc';
let _spCbChartMetric = 'benefit';
let _spActiveDuelPreset = 'custom';

function _escSpHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _destroySpChartSafe(key) {
  if (_spCharts[key] && typeof _spCharts[key].destroy === 'function') {
    try { _spCharts[key].destroy(); } catch (_) {}
    delete _spCharts[key];
  }
}

function _spThemeColors() {
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
    brand: val('--ui-brand', '#ffcc00'),
    good: val('--ui-good-text', '#34d399'),
    warn: val('--ui-warn-text', '#fbbf24'),
    bad: val('--ui-bad-text', '#f87171'),
    text: isLight ? '#0f172a' : '#e2e8f0',
    muted: isLight ? '#475569' : '#94a3b8',
    grid: isLight ? 'rgba(15, 23, 42, 0.10)' : 'rgba(148, 163, 184, 0.14)'
  };
}

function _fmtSpCap(gb) {
  const n = Number(gb || 0);
  if (n >= 1024) return (n % 1024 === 0 ? `${n / 1024} TB` : `${(n / 1024).toFixed(1)} TB`);
  return `${n} GB`;
}

function _ensureSpState() {
  if (typeof STATE === 'undefined') return {};
  if (!STATE.smartphoneDuelBaseSlug) STATE.smartphoneDuelBaseSlug = '';
  if (!STATE.smartphoneDuelCandSlug) STATE.smartphoneDuelCandSlug = '';
  if (!STATE.smartphoneCbRelBaseSlug) STATE.smartphoneCbRelBaseSlug = '';
  if (!STATE.simSmartphoneASlug) STATE.simSmartphoneASlug = '';
  if (!STATE.simSmartphoneBSlug) STATE.simSmartphoneBSlug = '';
  if (STATE.simSmartphoneQuality == null) STATE.simSmartphoneQuality = 3;
  if (!STATE.simSmartphoneThermalMode) STATE.simSmartphoneThermalMode = 'sustained';
  if (!STATE.simSmartphoneUsageMode) STATE.simSmartphoneUsageMode = 'mixed';
  if (!STATE.smartphoneBuilder) {
    STATE.smartphoneBuilder = {
      slug: '',
      price: 0,
      chargerPreset: 'none',
      chargerPrice: 0,
      chargerOwned: false,
      accessoryPreset: 'case_glass',
      accessoryPrice: 90,
      accessoryOwned: false,
      twsPreset: 'none',
      twsPrice: 0,
      twsOwned: false,
      refSlug: ''
    };
  }
  return STATE;
}

function getSmartphonePool() {
  const list = (typeof DB !== 'undefined' && Array.isArray(DB.smartphones)) ? DB.smartphones : [];
  return list.filter(s => s && s.slug && Number(s.price_brl || 0) > 250);
}

function findSmartphoneBySlug(slug) {
  const list = (typeof DB !== 'undefined' && Array.isArray(DB.smartphones)) ? DB.smartphones : [];
  return list.find(s => s.slug === slug) || null;
}

function shortSmartphoneName(sp) {
  if (!sp || !sp.name) return '--';
  let s = String(sp.name)
    .replace(/^Smartphone\s+/i, '')
    .replace(/^Celular\s+/i, '')
    .replace(/\bTela\s+[\d.,]+"?\b/gi, '')
    .replace(/\bDual\s*Chip\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > 42) s = s.slice(0, 40) + '…';
  return s;
}

// ============================================================================
// SECTION A: CONTEXTUAL SCORING ENGINE (PERFORMANCE, CAMERA, AI, BATTERY)
// ============================================================================
function _computeSmartphonePerfRaw(sp) {
  const antutu = Number(sp.soc_antutu || 450000);
  const gpu = Number(sp.soc_gpu_score || 1500);
  const single = Number(sp.soc_single_score || 55);
  const multi = Number(sp.soc_multi_score || 3200);
  const hz = Number(sp.screen_hz || 60);
  const sust = Number(sp.soc_sustained_pct || 72) / 100;
  const hzFactor = hz >= 120 ? 1.07 : (hz >= 90 ? 1.03 : 0.96);
  const raw = (antutu * 0.0020 + gpu * 0.68 + multi * 0.25 + single * 22) * (0.76 + 0.24 * sust) * hzFactor;
  return Math.max(800, Math.round(raw));
}

function _computeSmartphoneCameraMediaRaw(sp) {
  const cam = Number(sp.camera_score || 55);
  const disp = Number(sp.display_score || 60);
  const oisBonus = sp.cam_ois ? 650 : 0;
  const zoomBonus = Number(sp.cam_zoom_optical || 0) >= 3 ? 620 : (Number(sp.cam_zoom_optical || 0) > 1 ? 300 : 0);
  const oledBonus = sp.is_ltpo ? 520 : (sp.is_oled ? 300 : 0);
  const nitsBonus = Math.min(600, Number(sp.brightness_nits || 900) * 0.22);
  const vidStr = String(sp.cam_video_max || '').toLowerCase();
  const vidBonus = vidStr.includes('8k') ? 450 : (vidStr.includes('4k 60') ? 320 : (vidStr.includes('4k') ? 150 : 0));
  return Math.max(800, Math.round(cam * 55 + disp * 26 + oisBonus + zoomBonus + oledBonus + nitsBonus + vidBonus));
}

function _computeSmartphoneAiMemoryRaw(sp) {
  const npu = Number(sp.soc_npu_tops || 8);
  const ram = Number(sp.ram_gb || 6);
  const storage = Number(sp.storage_gb || 128);
  const ufsStr = String(sp.storage_type || '').toUpperCase();
  const ufsMult = (ufsStr.includes('4.0') || ufsStr.includes('NVME')) ? 1.18 : (ufsStr.includes('3.1') ? 1.08 : 1.0);
  const ramFactor = ram >= 12 ? 1.24 : (ram >= 8 ? 1.08 : 0.85);
  const storBonus = Math.min(900, Math.sqrt(storage) * 32);
  const isFlagshipAi = (sp.brand === 'Apple' && /15\s*Pro|16|17/i.test(sp.name)) ||
    (sp.brand === 'Samsung' && /\bS2[3456]\b/i.test(sp.name)) || npu >= 35;
  const aiBonus = isFlagshipAi ? 650 : 0;
  return Math.max(600, Math.round((npu * 78 + ram * 260 + storBonus + aiBonus) * ufsMult * ramFactor));
}

function _computeSmartphoneBatteryLongevityRaw(sp) {
  const batScore = Number(sp.battery_score || 60);
  const mah = Number(sp.battery_mah || 4500);
  const chg = Number(sp.charge_w || 25);
  const sot = Number(sp.battery_hours_sot || 6.5);
  const conn = Number(sp.connectivity_score || 65);
  const updates = Number(sp.os_updates_years || 3);
  const ipStr = String(sp.ip_rating || '');
  const ipBonus = /IP68/i.test(ipStr) ? 550 : (/IP67/i.test(ipStr) ? 380 : (/IP5/i.test(ipStr) ? 140 : 0));
  const fiveGBonus = sp.has_5g ? 350 : 0;
  const nfcBonus = sp.has_nfc ? 260 : 0;
  return Math.max(800, Math.round(
    batScore * 45 + sot * 320 + Math.min(120, chg) * 14 + (mah - 3000) * 0.28 +
    conn * 18 + updates * 340 + ipBonus + fiveGBonus + nfcBonus
  ));
}

function getSmartphoneCatalogExtremes() {
  const pool = getSmartphonePool();
  if (!pool.length) {
    return { maxPerf: 10000, maxCamMedia: 9500, maxAi: 8500, maxBatLong: 9500, maxComposite: 9800, maxPrice: 12000 };
  }
  return {
    maxPerf: Math.max(1000, ...pool.map(_computeSmartphonePerfRaw)),
    maxCamMedia: Math.max(1000, ...pool.map(_computeSmartphoneCameraMediaRaw)),
    maxAi: Math.max(1000, ...pool.map(_computeSmartphoneAiMemoryRaw)),
    maxBatLong: Math.max(1000, ...pool.map(_computeSmartphoneBatteryLongevityRaw)),
    maxComposite: Math.max(2000, ...pool.map(s => Number(s._compositeScore || 5000))),
    maxPrice: Math.max(2000, ...pool.map(s => Number(s.price_brl || 0)))
  };
}

function enrichSmartphonesWithContextualMetrics() {
  const pool = getSmartphonePool();
  if (!pool.length) return;
  const st = _ensureSpState();

  const wPerf = st.wGaming != null ? Number(st.wGaming) : 30;
  const wCam = st.wWorkstation != null ? Number(st.wWorkstation) : 35;
  const wAi = st.wAI != null ? Number(st.wAI) : 20;
  const wBat = st.wSoft != null ? Number(st.wSoft) : 15;
  const totW = Math.max(1, wPerf + wCam + wAi + wBat);

  const maxPerf = Math.max(1000, ...pool.map(_computeSmartphonePerfRaw));
  const maxCam = Math.max(1000, ...pool.map(_computeSmartphoneCameraMediaRaw));
  const maxAi = Math.max(1000, ...pool.map(_computeSmartphoneAiMemoryRaw));
  const maxBat = Math.max(1000, ...pool.map(_computeSmartphoneBatteryLongevityRaw));

  pool.forEach(sp => {
    const pRaw = _computeSmartphonePerfRaw(sp);
    const cRaw = _computeSmartphoneCameraMediaRaw(sp);
    const aRaw = _computeSmartphoneAiMemoryRaw(sp);
    const bRaw = _computeSmartphoneBatteryLongevityRaw(sp);

    sp._perfEff = pRaw;
    sp._cameraEff = cRaw;
    sp._aiEff = aRaw;
    sp._batLongEff = bRaw;

    const nPerf = (pRaw / maxPerf) * 10000;
    const nCam = (cRaw / maxCam) * 10000;
    const nAi = (aRaw / maxAi) * 10000;
    const nBat = (bRaw / maxBat) * 10000;

    sp._compositeScore = Math.round(
      (wPerf / totW) * nPerf + (wCam / totW) * nCam + (wAi / totW) * nAi + (wBat / totW) * nBat
    );
    sp._overallVersusScore = Math.max(5, Math.min(100, Math.round(sp._compositeScore / 100)));

    const curPrice = Number(sp.price_brl || 1500);
    const ps = sp.price_stats || {};
    sp._targetPrice = Number(ps.target_price || ps.min_90d || Math.round(curPrice * 0.88));
    sp._valueRatio = sp._compositeScore / Math.max(400, curPrice);
  });

  // Pareto efficiency cost-benefit normalization (mirrors desktop & laptop ranking)
  const paretoPenalties = {};
  pool.forEach(a => {
    let dominatedByBetter = 0;
    const ap = Number(a.price_brl || 99999);
    const ac = Number(a._compositeScore || 0);
    pool.forEach(b => {
      if (a.slug === b.slug) return;
      const bp = Number(b.price_brl || 99999);
      const bc = Number(b._compositeScore || 0);
      if (bp <= ap * 1.03 && bc > ac * 1.08) dominatedByBetter++;
    });
    paretoPenalties[a.slug] = Math.max(0.68, 1 - Math.min(0.28, dominatedByBetter * 0.045));
  });

  const maxVR = Math.max(0.1, ...pool.map(s => s._valueRatio * (paretoPenalties[s.slug] || 1)));
  pool.forEach(s => {
    const rawRatio = s._valueRatio * (paretoPenalties[s.slug] || 1);
    const cb = Math.round((rawRatio / maxVR) * 100);
    s._myCBScore = Math.max(10, Math.min(100, cb));
  });
}

function evaluateSmartphoneRelationalUpgrade(baseSp, candSp, basePriceArg = null, candPriceArg = null) {
  const bPrice = basePriceArg > 0 ? basePriceArg : Number(baseSp.price_brl || 1);
  const cPrice = candPriceArg > 0 ? candPriceArg : Number(candSp.price_brl || 1);

  const bComp = Number(baseSp._compositeScore || 1);
  const cComp = Number(candSp._compositeScore || 1);
  const perfGainPct = ((cComp - bComp) / Math.max(1, bComp)) * 100;
  const socGainPct = ((Number(candSp._perfEff || 1) - Number(baseSp._perfEff || 1)) / Math.max(1, baseSp._perfEff || 1)) * 100;
  const camGainPct = ((Number(candSp._cameraEff || 1) - Number(baseSp._cameraEff || 1)) / Math.max(1, baseSp._cameraEff || 1)) * 100;
  const aiGainPct = ((Number(candSp._aiEff || 1) - Number(baseSp._aiEff || 1)) / Math.max(1, baseSp._aiEff || 1)) * 100;
  const batGainPct = ((Number(candSp._batLongEff || 1) - Number(baseSp._batLongEff || 1)) / Math.max(1, baseSp._batLongEff || 1)) * 100;

  const actualDelta = cPrice - bPrice;
  const fairMaxDelta = Math.round(bPrice * (perfGainPct / 100) * 1.05);
  const fairMaxCandPrice = Math.max(300, Math.round(bPrice + fairMaxDelta));

  let tier = 'Confronto Equilibrado';
  let color = 'sky';
  let summary = '';

  const cShort = shortSmartphoneName(candSp);
  const bShort = shortSmartphoneName(baseSp);

  if (actualDelta <= 0 && perfGainPct >= -3) {
    tier = 'Vitória Clara em Valor';
    color = 'emerald';
    summary = `${cShort} custa menos (${fmtBRLShort(cPrice)} vs ${fmtBRLShort(bPrice)}) entregando ${perfGainPct >= 0 ? '+' : ''}${perfGainPct.toFixed(0)}% de conjunto geral, com destaque em ${camGainPct > socGainPct ? 'Câmera & Tela' : 'SoC & Jogos'}.`;
  } else if (perfGainPct >= 14 && actualDelta <= fairMaxDelta * 1.08) {
    tier = 'Upgrade Justo e Recomendado';
    color = 'emerald';
    summary = `Pagar +${fmtBRLShort(actualDelta)} traz +${perfGainPct.toFixed(0)}% no índice geral (${socGainPct >= 0 ? '+' : ''}${Math.round(socGainPct)}% SoC, ${camGainPct >= 0 ? '+' : ''}${Math.round(camGainPct)}% Câmera/Tela). Dentro do teto justo.`;
  } else if (perfGainPct > 4 && actualDelta <= fairMaxDelta * 1.35) {
    tier = 'Margem Estreita';
    color = 'amber';
    summary = `${cShort} é superior em ${perfGainPct.toFixed(0)}%, porém cobra ${fmtBRLShort(Math.max(0, actualDelta - fairMaxDelta))} acima do valor proporcional. Aguarde cupom em promoções para fechar melhor negócio.`;
  } else if (perfGainPct < -5 && actualDelta > 0) {
    tier = 'Custo Alto por Conjunto Menor';
    color = 'rose';
    summary = `${bShort} já supera ou empata nos seus pesos atuais custando ${fmtBRLShort(Math.abs(actualDelta))} a menos.`;
  } else if (Math.abs(perfGainPct) <= 6) {
    tier = 'Empate Técnico';
    color = actualDelta <= 150 ? 'sky' : 'amber';
    summary = `Diferença técnica abaixo de 6% entre ${bShort} e ${cShort}. Escolha pelo ecossistema (${baseSp.os} vs ${candSp.os}), tamanho de tela e promoções do dia.`;
  } else {
    tier = 'Ágio Elevado';
    color = 'rose';
    summary = `A diferença de preço (+${fmtBRLShort(actualDelta)}) supera o salto real de hardware (+${perfGainPct.toFixed(0)}%). Só faz sentido se algum recurso exclusivo (ex: Zoom óptico ${candSp.cam_zoom_optical}x ou iOS/S-Pen) for essencial.`;
  }

  return {
    actualDelta,
    fairMaxDelta,
    fairMaxCandPrice,
    perfGainPct,
    socGainPct,
    camGainPct,
    aiGainPct,
    batGainPct,
    tier,
    color,
    summary
  };
}

// ============================================================================
// SECTION B: GROUPED SELECTORS & PRESETS
// ============================================================================
function _buildGroupedSmartphoneOptionsHTML(pool, selectedSlug) {
  const byCat = {};
  SP_CATEGORY_ORDER.forEach(c => { byCat[c] = []; });
  pool.forEach(s => {
    const cat = SP_CATEGORY_ORDER.includes(s.category) ? s.category : 'midrange';
    byCat[cat].push(s);
  });
  let html = '';
  SP_CATEGORY_ORDER.forEach(cat => {
    const items = (byCat[cat] || []).slice().sort((a, b) => Number(a.price_brl || 0) - Number(b.price_brl || 0));
    if (!items.length) return;
    html += `<optgroup label="${_escSpHtml(SP_CATEGORY_LABELS[cat] || cat)}">`;
    items.forEach(s => {
      const sel = s.slug === selectedSlug ? 'selected' : '';
      html += `<option value="${_escSpHtml(s.slug)}" ${sel}>${_escSpHtml(shortSmartphoneName(s))} (${_fmtSpCap(s.storage_gb)}/${s.ram_gb}GB) — ${fmtBRLShort(s.price_brl)}</option>`;
    });
    html += `</optgroup>`;
  });
  return html;
}

function populateSmartphoneSelectors() {
  const pool = getSmartphonePool();
  if (!pool.length) return;
  const st = _ensureSpState();
  enrichSmartphonesWithContextualMetrics();

  const sortedByScore = pool.slice().sort((a, b) => Number(b._compositeScore || 0) - Number(a._compositeScore || 0));
  const sortedByCb = pool.slice().sort((a, b) => Number(b._myCBScore || 0) - Number(a._myCBScore || 0));

  const valid = new Set(pool.map(s => s.slug));
  const pickDef = (cur, idx) => (cur && valid.has(cur)) ? cur : (sortedByCb[idx] || sortedByScore[idx] || pool[0]).slug;

  if (!st.smartphoneDuelBaseSlug || !valid.has(st.smartphoneDuelBaseSlug)) {
    // Prefer a well-known midrange default vs flagship or top CB
    const mid = pool.find(s => /a55|a56|a57|poco\s*x[67]|moto\s*edge/i.test(s.name)) || sortedByCb[1] || pool[0];
    st.smartphoneDuelBaseSlug = mid.slug;
  }
  if (!st.smartphoneDuelCandSlug || !valid.has(st.smartphoneDuelCandSlug) || st.smartphoneDuelCandSlug === st.smartphoneDuelBaseSlug) {
    const top = pool.find(s => /s26|s25|s24|iphone\s*1[567]|poco\s*f/i.test(s.name) && s.slug !== st.smartphoneDuelBaseSlug) || sortedByScore[0];
    st.smartphoneDuelCandSlug = top.slug;
  }
  if (!st.smartphoneCbRelBaseSlug || !valid.has(st.smartphoneCbRelBaseSlug)) {
    st.smartphoneCbRelBaseSlug = (st.smartphoneBuilder && st.smartphoneBuilder.refSlug && valid.has(st.smartphoneBuilder.refSlug))
      ? st.smartphoneBuilder.refSlug : st.smartphoneDuelBaseSlug;
  }
  if (!st.simSmartphoneASlug || !valid.has(st.simSmartphoneASlug)) {
    st.simSmartphoneASlug = st.smartphoneDuelCandSlug;
  }
  if (!st.simSmartphoneBSlug || !valid.has(st.simSmartphoneBSlug)) {
    st.simSmartphoneBSlug = st.smartphoneDuelBaseSlug;
  }

  const baseSel = document.getElementById('smartphone-duel-select-base');
  const candSel = document.getElementById('smartphone-duel-select-cand');
  const cbRelSel = document.getElementById('smartphone-cb-filter-base-rel');
  const simASel = document.getElementById('sim-select-phone-a');
  const simBSel = document.getElementById('sim-select-phone-b');

  if (baseSel) baseSel.innerHTML = _buildGroupedSmartphoneOptionsHTML(pool, st.smartphoneDuelBaseSlug);
  if (candSel) candSel.innerHTML = _buildGroupedSmartphoneOptionsHTML(pool, st.smartphoneDuelCandSlug);
  if (simASel) simASel.innerHTML = _buildGroupedSmartphoneOptionsHTML(pool, st.simSmartphoneASlug);
  if (simBSel) simBSel.innerHTML = _buildGroupedSmartphoneOptionsHTML(pool, st.simSmartphoneBSlug);
  if (cbRelSel) {
    cbRelSel.innerHTML = pool.slice().sort((a, b) => Number(a.price_brl) - Number(b.price_brl)).map(s =>
      `<option value="${_escSpHtml(s.slug)}" ${s.slug === st.smartphoneCbRelBaseSlug ? 'selected' : ''}>Base: ${_escSpHtml(shortSmartphoneName(s))} (${fmtBRLShort(s.price_brl)})</option>`
    ).join('');
  }

  syncSmartphoneDuelPriceInputs();
}

function syncSmartphoneDuelPriceInputs() {
  const st = _ensureSpState();
  const baseSp = findSmartphoneBySlug(st.smartphoneDuelBaseSlug);
  const candSp = findSmartphoneBySlug(st.smartphoneDuelCandSlug);
  const bIn = document.getElementById('smartphone-duel-price-base');
  const cIn = document.getElementById('smartphone-duel-price-cand');
  if (baseSp && bIn) bIn.value = Math.round(Number(baseSp.price_brl || 0));
  if (candSp && cIn) cIn.value = Math.round(Number(candSp.price_brl || 0));
}

function onSmartphoneDuelSelectionChange() {
  const st = _ensureSpState();
  const bSel = document.getElementById('smartphone-duel-select-base');
  const cSel = document.getElementById('smartphone-duel-select-cand');
  if (bSel && bSel.value) st.smartphoneDuelBaseSlug = bSel.value;
  if (cSel && cSel.value) st.smartphoneDuelCandSlug = cSel.value;
  _spActiveDuelPreset = 'custom';
  syncSmartphoneDuelPriceInputs();
  renderSmartphoneDuelAnalysis();
}

function swapSmartphoneDuelPair() {
  const st = _ensureSpState();
  const tmp = st.smartphoneDuelBaseSlug;
  st.smartphoneDuelBaseSlug = st.smartphoneDuelCandSlug;
  st.smartphoneDuelCandSlug = tmp;
  populateSmartphoneSelectors();
  renderSmartphoneDuelAnalysis();
}

function resetSmartphoneDuelPricesToLive() {
  syncSmartphoneDuelPriceInputs();
  renderSmartphoneDuelAnalysis();
}

function applySmartphoneDuelPreset(presetId) {
  const pool = getSmartphonePool();
  if (pool.length < 2) return;
  const st = _ensureSpState();
  enrichSmartphonesWithContextualMetrics();
  _spActiveDuelPreset = presetId;

  const findMatch = (rx, fbList) => pool.find(s => rx.test(s.name)) || fbList[0];
  const byScore = pool.slice().sort((a, b) => Number(b._compositeScore || 0) - Number(a._compositeScore || 0));
  const byCb = pool.slice().sort((a, b) => Number(b._myCBScore || 0) - Number(a._myCBScore || 0));

  if (presetId === 'samsung_vs_apple') {
    const gal = findMatch(/galaxy\s*s2[654]/i, pool.filter(s => s.brand === 'Samsung')) || byScore[0];
    const iph = findMatch(/iphone\s*1[567]/i, pool.filter(s => s.brand === 'Apple')) || byScore[1];
    st.smartphoneDuelBaseSlug = gal.slug;
    st.smartphoneDuelCandSlug = iph.slug;
  } else if (presetId === 'mid_cb') {
    const a5 = findMatch(/galaxy\s*a5[567]/i, byCb) || byCb[0];
    const poco = findMatch(/poco\s*x[67]|redmi\s*note/i, byCb.filter(s => s.slug !== a5.slug)) || byCb[1];
    st.smartphoneDuelBaseSlug = a5.slug;
    st.smartphoneDuelCandSlug = poco.slug;
  } else if (presetId === 'gamer_vs_cam') {
    const cam = pool.slice().sort((a, b) => Number(b.camera_score || 0) - Number(a.camera_score || 0))[0];
    const gam = pool.filter(s => s.slug !== cam.slug).sort((a, b) => Number(b.soc_antutu || 0) - Number(a.soc_antutu || 0))[0];
    st.smartphoneDuelBaseSlug = gam.slug;
    st.smartphoneDuelCandSlug = cam.slug;
  } else if (presetId === 'my_phone') {
    const refSlug = st.smartphoneBuilder && st.smartphoneBuilder.refSlug;
    const base = findSmartphoneBySlug(refSlug) || byCb[2] || pool[0];
    const cand = byCb.find(s => s.slug !== base.slug && Number(s._compositeScore || 0) >= Number(base._compositeScore || 0)) || byScore[0];
    st.smartphoneDuelBaseSlug = base.slug;
    st.smartphoneDuelCandSlug = cand.slug;
  }
  populateSmartphoneSelectors();
  renderSmartphoneDuelAnalysis();
}

function sendSmartphoneToDuel(slug, slot = 'cand') {
  const st = _ensureSpState();
  if (slot === 'base') st.smartphoneDuelBaseSlug = slug;
  else st.smartphoneDuelCandSlug = slug;
  if (typeof setMainContext === 'function') setMainContext('smartphone', false);
  populateSmartphoneSelectors();
  if (typeof switchTab === 'function') switchTab('versus');
}

function sendSmartphoneToSimulator(slug, slot = 'a') {
  const st = _ensureSpState();
  if (slot === 'b') st.simSmartphoneBSlug = slug;
  else st.simSmartphoneASlug = slug;
  if (typeof setMainContext === 'function') setMainContext('smartphone', false);
  populateSmartphoneSelectors();
  if (typeof switchTab === 'function') switchTab('sim');
}

function openSmartphonePromoForSlug(slug) {
  const sp = findSmartphoneBySlug(slug);
  if (typeof switchTab === 'function') switchTab('bf-promos');
  setTimeout(() => {
    const search = document.getElementById('promos-filter-search');
    if (search && sp) {
      search.value = shortSmartphoneName(sp).split(' ').slice(0, 3).join(' ');
      search.dispatchEvent(new Event('input'));
    }
  }, 80);
}

// ============================================================================
// SECTION C: SMARTPHONE DUEL RENDERER
// ============================================================================
function _renderSmartphoneDuelPresetsBar() {
  const el = document.getElementById('smartphone-duel-presets');
  if (!el) return;
  const presets = [
    { id: 'mid_cb', label: '🔥 Reis do C/B 5G' },
    { id: 'samsung_vs_apple', label: '📱 Galaxy S vs iPhone' },
    { id: 'gamer_vs_cam', label: '🎮 Gamer vs Câmera' },
    { id: 'my_phone', label: '📌 Meu Celular vs Upgrade' }
  ];
  el.innerHTML = presets.map(p =>
    `<button type="button" onclick="applySmartphoneDuelPreset('${p.id}')" class="ui-chip ${_spActiveDuelPreset === p.id ? 'is-active' : ''}">${p.label}</button>`
  ).join('');
}

function _renderSmartphonePickerMeta(sp, role) {
  const ps = sp.price_stats || {};
  const badgeEl = document.getElementById(`smartphone-${role === 'base' ? 'base' : 'cand'}-status-badge`);
  if (badgeEl) {
    const st = ps.status || 'Estável';
    const cls = /Hist|Abaixo/i.test(st) ? 'ui-badge ui-badge--good' : (/Justo/i.test(st) ? 'ui-badge ui-badge--a' : 'ui-badge');
    badgeEl.innerHTML = `<span class="${cls}">${_escSpHtml(st)} • ${_escSpHtml(sp.store_name || 'Zoom BR')}</span>`;
  }
  const thumb = document.getElementById(`smartphone-${role === 'base' ? 'base' : 'cand'}-thumb`);
  if (thumb) {
    if (sp.image_url) {
      thumb.src = sp.image_url;
      thumb.alt = shortSmartphoneName(sp);
      thumb.classList.remove('hidden');
    } else {
      thumb.classList.add('hidden');
    }
  }
  const tgtEl = document.getElementById(`smartphone-duel-target-${role}`);
  if (tgtEl) tgtEl.textContent = fmtBRLShort(sp._targetPrice || ps.target_price || sp.price_brl * 0.88);
  const histEl = document.getElementById(`smartphone-duel-hist-${role}`);
  if (histEl) histEl.textContent = fmtBRLShort(ps.min_all_time || ps.min_90d || sp.price_brl);

  const specsEl = document.getElementById(`smartphone-duel-specs-${role}`);
  if (specsEl) {
    specsEl.innerHTML = `
      <span>🧠 ${_escSpHtml(sp.soc_name || 'SoC')}</span>
      <span>💾 ${sp.ram_gb}GB / ${_fmtSpCap(sp.storage_gb)}</span>
      <span>📺 ${sp.screen_inches}" ${sp.screen_hz}Hz ${sp.is_oled ? 'OLED' : 'IPS'}</span>
      <span>📷 ${sp.cam_main_mp}MP${sp.cam_ois ? ' OIS' : ''}</span>
      <span>🔋 ${sp.battery_mah}mAh (${sp.charge_w}W)</span>
    `;
  }
}

function renderSmartphoneDuelAnalysis() {
  const pool = getSmartphonePool();
  if (!pool.length) return;
  const st = _ensureSpState();
  enrichSmartphonesWithContextualMetrics();
  _renderSmartphoneDuelPresetsBar();

  let baseSp = findSmartphoneBySlug(st.smartphoneDuelBaseSlug) || pool[0];
  let candSp = findSmartphoneBySlug(st.smartphoneDuelCandSlug) || pool[Math.min(1, pool.length - 1)];
  st.smartphoneDuelBaseSlug = baseSp.slug;
  st.smartphoneDuelCandSlug = candSp.slug;

  const baseIn = parseFloat(document.getElementById('smartphone-duel-price-base')?.value || '0');
  const candIn = parseFloat(document.getElementById('smartphone-duel-price-cand')?.value || '0');
  const basePrice = baseIn > 0 ? baseIn : Number(baseSp.price_brl || 0);
  const candPrice = candIn > 0 ? candIn : Number(candSp.price_brl || 0);

  _renderSmartphonePickerMeta(baseSp, 'base');
  _renderSmartphonePickerMeta(candSp, 'cand');

  // Sync scale mode segmented buttons
  const isAbs = st.comparisonScaleMode === 'absolute';
  const relBtn = document.getElementById('btn-smartphone-scale-rel-duel');
  const absBtn = document.getElementById('btn-smartphone-scale-abs-duel');
  if (relBtn) relBtn.classList.toggle('is-active', !isAbs);
  if (absBtn) absBtn.classList.toggle('is-active', isAbs);

  const rel = evaluateSmartphoneRelationalUpgrade(baseSp, candSp, basePrice, candPrice);
  const ex = getSmartphoneCatalogExtremes();
  const colors = _spThemeColors();

  // 1. Verdict Box (Veredito Primeiro)
  const verdictEl = document.getElementById('smartphone-duel-verdict-box');
  if (verdictEl) {
    const isGood = rel.color === 'emerald' || rel.color === 'sky';
    const isWarn = rel.color === 'amber';
    const tone = isGood ? 'good' : (isWarn ? 'warn' : 'bad');
    const badgeLabel = rel.color === 'emerald' ? 'Vale muito' : (isGood ? 'Vale a pena' : (isWarn ? 'Aguarde' : 'Não compensa'));
    const dSign = rel.actualDelta >= 0 ? '+' : '';
    const pSign = rel.perfGainPct >= 0 ? '+' : '';
    const dPct = Math.round((rel.actualDelta / Math.max(1, basePrice)) * 100);
    const bShort = _escSpHtml(shortSmartphoneName(baseSp));
    const cShort = _escSpHtml(shortSmartphoneName(candSp));
    const headline = isGood
      ? (rel.actualDelta <= 0 && rel.perfGainPct >= 0
          ? `Vitória clara: ${cShort} entrega ${pSign}${rel.perfGainPct.toFixed(0)}% de conjunto custando menos.`
          : `Vale pagar ${dSign}${fmtBRLShort(rel.actualDelta)} pelo ${cShort} (${pSign}${rel.perfGainPct.toFixed(0)}% no índice geral).`)
      : (isWarn
          ? `Aguarde queda: ${cShort} custa ${fmtBRLShort(Math.max(0, rel.actualDelta - rel.fairMaxDelta))} acima do teto justo.`
          : `Não compensa pagar ${dSign}${fmtBRLShort(rel.actualDelta)} por apenas ${pSign}${rel.perfGainPct.toFixed(0)}% de ganho geral.`);

    verdictEl.className = `ui-verdict ui-verdict--${tone} space-y-4`;
    verdictEl.innerHTML = `
      <div class="ui-verdict-grid">
        <div class="space-y-2 max-w-3xl">
          <div class="flex flex-wrap items-center gap-2">
            <span class="ui-badge ui-badge--${tone} font-bold uppercase">${badgeLabel}</span>
            <span class="ui-badge">${_escSpHtml(rel.tier)}</span>
          </div>
          <h3 class="ui-verdict-headline">${headline}</h3>
        </div>
        <div class="ui-verdict-numbers">
          <div class="ui-verdict-stat">
            <span class="ui-verdict-stat-label">Diferença de preço</span>
            <span class="ui-verdict-stat-value">${dSign}${fmtBRLShort(rel.actualDelta)}</span>
            <span class="ui-verdict-stat-sub">${dSign}${dPct}% vs ${bShort}</span>
          </div>
          <div class="ui-verdict-stat">
            <span class="ui-verdict-stat-label">Teto justo (B)</span>
            <span class="ui-verdict-stat-value" style="color: ${colors.good};">${fmtBRLShort(rel.fairMaxCandPrice)}</span>
            <span class="ui-verdict-stat-sub">Até ${rel.fairMaxDelta >= 0 ? '+' : ''}${fmtBRLShort(rel.fairMaxDelta)}</span>
          </div>
        </div>
      </div>
      <details class="ui-details">
        <summary>Ver detalhes da análise técnica</summary>
        <div class="ui-details-body"><p class="text-slate-200 leading-relaxed">${_escSpHtml(rel.summary)}</p></div>
      </details>
    `;
  }

  // 2. Ratings + Bars + Radar
  const ratingsEl = document.getElementById('smartphone-duel-versus-ratings');
  if (ratingsEl) {
    const bWin = baseSp._overallVersusScore > candSp._overallVersusScore;
    const cWin = candSp._overallVersusScore > baseSp._overallVersusScore;
    ratingsEl.innerHTML = `
      <div class="ui-score-card ui-score-card--a">
        <div class="flex items-center justify-between gap-2">
          <span class="ui-badge ui-badge--a">A · Base ${bWin ? '★' : ''}</span>
          <span class="text-xs ui-mono text-slate-400">C/B ${baseSp._myCBScore}/100</span>
        </div>
        <span class="text-sm font-bold text-white truncate block mt-1">${_escSpHtml(shortSmartphoneName(baseSp))}</span>
        <div class="flex items-baseline gap-1.5 pt-1">
          <span class="text-2xl ui-mono font-black" style="color: ${colors.cmpAText};">${baseSp._overallVersusScore}</span>
          <span class="text-xs text-slate-400">/ 100 Score geral</span>
        </div>
      </div>
      <div class="ui-score-card ui-score-card--b">
        <div class="flex items-center justify-between gap-2">
          <span class="ui-badge ui-badge--b">B · Candidato ${cWin ? '★' : ''}</span>
          <span class="text-xs ui-mono text-slate-400">C/B ${candSp._myCBScore}/100</span>
        </div>
        <span class="text-sm font-bold text-white truncate block mt-1">${_escSpHtml(shortSmartphoneName(candSp))}</span>
        <div class="flex items-baseline gap-1.5 pt-1">
          <span class="text-2xl ui-mono font-black" style="color: ${colors.cmpBText};">${candSp._overallVersusScore}</span>
          <span class="text-xs text-slate-400">/ 100 Score geral</span>
        </div>
      </div>
    `;
  }

  const barsEl = document.getElementById('smartphone-duel-versus-bars');
  if (barsEl && typeof renderComparisonBarHTML === 'function') {
    const bN = shortSmartphoneName(baseSp);
    const cN = shortSmartphoneName(candSp);
    const iconCpu = '<svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>';
    const iconCam = '<svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>';
    const iconAi = '<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>';
    const iconBat = '<svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
    barsEl.innerHTML = [
      renderComparisonBarHTML({ title: 'Índice Geral Contextual', iconSvg: iconCpu, baseVal: baseSp._compositeScore, candVal: candSp._compositeScore, baseLabel: `${baseSp._overallVersusScore}/100`, candLabel: `${candSp._overallVersusScore}/100`, diffPct: rel.perfGainPct, maxVal: ex.maxComposite, baseName: bN, candName: cN }),
      renderComparisonBarHTML({ title: 'SoC, AnTuTu & Jogos (GPU + Hz)', iconSvg: iconCpu, baseVal: baseSp._perfEff, candVal: candSp._perfEff, baseLabel: `${(baseSp.soc_antutu/1e6).toFixed(2)}M • ${baseSp.screen_hz}Hz`, candLabel: `${(candSp.soc_antutu/1e6).toFixed(2)}M • ${candSp.screen_hz}Hz`, diffPct: rel.socGainPct, maxVal: ex.maxPerf, baseName: bN, candName: cN }),
      renderComparisonBarHTML({ title: 'Câmeras (OIS/Zoom) & Tela OLED', iconSvg: iconCam, baseVal: baseSp._cameraEff, candVal: candSp._cameraEff, baseLabel: `${baseSp.cam_main_mp}MP • ${baseSp.brightness_nits} nits`, candLabel: `${candSp.cam_main_mp}MP • ${candSp.brightness_nits} nits`, diffPct: rel.camGainPct, maxVal: ex.maxCamMedia, baseName: bN, candName: cN }),
      renderComparisonBarHTML({ title: 'IA On-Device (NPU), RAM & UFS', iconSvg: iconAi, baseVal: baseSp._aiEff, candVal: candSp._aiEff, baseLabel: `${baseSp.soc_npu_tops} TOPS • ${baseSp.ram_gb}GB`, candLabel: `${candSp.soc_npu_tops} TOPS • ${candSp.ram_gb}GB`, diffPct: rel.aiGainPct, maxVal: ex.maxAi, baseName: bN, candName: cN }),
      renderComparisonBarHTML({ title: 'Bateria (SOT), Carga & Updates OS', iconSvg: iconBat, baseVal: baseSp._batLongEff, candVal: candSp._batLongEff, baseLabel: `${baseSp.battery_hours_sot}h SOT • ${baseSp.os_updates_years}a OS`, candLabel: `${candSp.battery_hours_sot}h SOT • ${candSp.os_updates_years}a OS`, diffPct: rel.batGainPct, maxVal: ex.maxBatLong, baseName: bN, candName: cN })
    ].join('');
  }

  // 6-Axis Radar Chart
  const radarCanvas = document.getElementById('chart-smartphone-duel-radar');
  if (radarCanvas && typeof Chart !== 'undefined') {
    _destroySpChartSafe('duelRadar');
    const getAxisVec = s => [
      Math.min(100, Math.round((s._perfEff / ex.maxPerf) * 100)),
      Math.min(100, Number(s.camera_score || 60)),
      Math.min(100, Number(s.display_score || 60)),
      Math.min(100, Number(s.battery_score || 60)),
      Math.min(100, Math.round((s._aiEff / ex.maxAi) * 100)),
      Math.min(100, Number(s.longevity_score || 60))
    ];
    _spCharts.duelRadar = new Chart(radarCanvas, {
      type: 'radar',
      data: {
        labels: ['SoC & Jogos', 'Câmeras', 'Tela AMOLED/Hz', 'Bateria & Carga', 'IA / RAM / UFS', 'Updates & IP'],
        datasets: [
          {
            label: shortSmartphoneName(baseSp),
            data: getAxisVec(baseSp),
            borderColor: colors.cmpA,
            backgroundColor: colors.cmpAFill,
            borderWidth: 2,
            pointRadius: 3
          },
          {
            label: shortSmartphoneName(candSp),
            data: getAxisVec(candSp),
            borderColor: colors.cmpB,
            backgroundColor: colors.cmpBFill,
            borderWidth: 2,
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { stepSize: 25, backdropColor: 'transparent', color: colors.muted, font: { size: 9 } },
            pointLabels: { color: colors.text, font: { size: 11, weight: 'bold' } },
            grid: { color: colors.grid },
            angleLines: { color: colors.grid }
          }
        }
      }
    });
  }
  const legEl = document.getElementById('smartphone-duel-radar-legend');
  if (legEl) {
    legEl.innerHTML = `
      <span class="flex items-center gap-1.5 text-white font-semibold"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background: ${colors.cmpA};"></span> ${_escSpHtml(shortSmartphoneName(baseSp))}</span>
      <span class="flex items-center gap-1.5 text-white font-semibold"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background: ${colors.cmpB};"></span> ${_escSpHtml(shortSmartphoneName(candSp))}</span>
    `;
  }

  // Why A / Why B & Thermometer
  const whysA = [];
  const whysB = [];
  const pushDiff = (label, aVal, bVal, fmt) => {
    if (aVal > bVal * 1.07) whysA.push(`<strong>${label}:</strong> ${fmt(aVal)} vs ${fmt(bVal)}`);
    else if (bVal > aVal * 1.07) whysB.push(`<strong>${label}:</strong> ${fmt(bVal)} vs ${fmt(aVal)}`);
  };
  if (basePrice < candPrice * 0.94) whysA.push(`<strong>Economia direta:</strong> ${fmtBRLShort(candPrice - basePrice)} mais barato hoje.`);
  if (candPrice < basePrice * 0.94) whysB.push(`<strong>Economia direta:</strong> ${fmtBRLShort(basePrice - candPrice)} mais barato hoje.`);
  pushDiff('Desempenho SoC (AnTuTu)', baseSp.soc_antutu, candSp.soc_antutu, v => `${(v/1e6).toFixed(2)}M pts`);
  pushDiff('Câmera principal & conjunto', baseSp.camera_score, candSp.camera_score, v => `${v}/100`);
  pushDiff('Bateria (SOT real)', baseSp.battery_hours_sot, candSp.battery_hours_sot, v => `${v}h de tela`);
  pushDiff('Velocidade de carga', baseSp.charge_w, candSp.charge_w, v => `${v}W`);
  pushDiff('Atualizações de sistema', baseSp.os_updates_years, candSp.os_updates_years, v => `${v} anos de OS`);
  if (baseSp.cam_zoom_optical > candSp.cam_zoom_optical) whysA.push(`<strong>Zoom Óptico ${baseSp.cam_zoom_optical}x</strong> dedicado.`);
  if (candSp.cam_zoom_optical > baseSp.cam_zoom_optical) whysB.push(`<strong>Zoom Óptico ${candSp.cam_zoom_optical}x</strong> dedicado.`);

  const whyAEl = document.getElementById('smartphone-duel-why-a');
  if (whyAEl) {
    whyAEl.innerHTML = `<div class="flex items-center justify-between border-b border-slate-800 pb-2"><span class="text-sm font-bold text-white">Por que escolher ${_escSpHtml(shortSmartphoneName(baseSp))}?</span><span class="ui-badge ui-badge--a">A · Base</span></div><ul class="space-y-1.5 text-sm text-slate-300">${(whysA.length ? whysA : ['Conjunto equilibrado na sua faixa atual — compare histórico de preço abaixo.']).map(x => `<li class="flex items-start gap-2"><span style="color:${colors.cmpA};">•</span><span>${x}</span></li>`).join('')}</ul>`;
  }
  const whyBEl = document.getElementById('smartphone-duel-why-b');
  if (whyBEl) {
    whyBEl.innerHTML = `<div class="flex items-center justify-between border-b border-slate-800 pb-2"><span class="text-sm font-bold text-white">Por que escolher ${_escSpHtml(shortSmartphoneName(candSp))}?</span><span class="ui-badge ui-badge--b">B · Candidato</span></div><ul class="space-y-1.5 text-sm text-slate-300">${(whysB.length ? whysB : ['Conjunto equivalente ao Base A — decida por promoções e preferências.']).map(x => `<li class="flex items-start gap-2"><span style="color:${colors.cmpB};">•</span><span>${x}</span></li>`).join('')}</ul>`;
  }

  // Thermometer & Scenarios
  const mSub = document.getElementById('smartphone-duel-thermometer-subtitle');
  if (mSub) mSub.textContent = `Teto Justo p/ B: ${fmtBRLShort(rel.fairMaxCandPrice)} (+${fmtBRLShort(rel.fairMaxDelta)})`;
  const mVal = document.getElementById('smartphone-marker-delta-val');
  if (mVal) mVal.textContent = `${rel.actualDelta >= 0 ? '+' : ''}${fmtBRLShort(rel.actualDelta)}`;
  const marker = document.getElementById('smartphone-thermometer-marker');
  if (marker) {
    let pct = 50;
    const fMax = Math.max(250, rel.fairMaxDelta);
    if (rel.actualDelta <= fMax * 0.5) pct = 12;
    else if (rel.actualDelta <= fMax * 1.05) pct = 37;
    else if (rel.actualDelta <= fMax * 1.4) pct = 63;
    else pct = 88;
    marker.style.left = `${pct}%`;
  }
  const scenEl = document.getElementById('smartphone-duel-scenarios-grid');
  if (scenEl) {
    const promoB = Math.round((candSp._targetPrice || candPrice * 0.85));
    const dToday = rel.actualDelta;
    const dPromo = promoB - basePrice;
    scenEl.innerHTML = `
      <div class="p-3 rounded-lg bg-slate-900 border border-slate-800"><span class="text-xs text-slate-400 block">Cenário Hoje (À Vista)</span><span class="text-sm font-bold text-white block mt-0.5">${fmtBRLShort(candPrice)}</span><span class="text-xs ui-mono text-slate-300">Delta: ${dToday >= 0 ? '+' : ''}${fmtBRLShort(dToday)}</span></div>
      <div class="p-3 rounded-lg bg-slate-900 border border-slate-800"><span class="text-xs text-slate-400 block">Se B atingir Alvo (${fmtBRLShort(promoB)})</span><span class="text-sm font-bold text-emerald-400 block mt-0.5">${dPromo <= 0 ? 'B fica mais barato!' : 'Delta +' + fmtBRLShort(dPromo)}</span><span class="text-xs ui-mono text-slate-400">Economia vs hoje: ${fmtBRLShort(Math.max(0, candPrice - promoB))}</span></div>
      <div class="p-3 rounded-lg bg-slate-900 border border-slate-800"><span class="text-xs text-slate-400 block">Custo por Ano de Suporte OS</span><span class="text-sm font-bold text-sky-300 block mt-0.5">${fmtBRLShort(candPrice / Math.max(1, candSp.os_updates_years || 3))}/ano</span><span class="text-xs ui-mono text-slate-400">Base A: ${fmtBRLShort(basePrice / Math.max(1, baseSp.os_updates_years || 3))}/ano</span></div>
    `;
  }

  // Full 6-Category Spec Sheet
  const sheetEl = document.getElementById('smartphone-duel-spec-sheet');
  if (sheetEl) {
    const bNameS = _escSpHtml(shortSmartphoneName(baseSp));
    const cNameS = _escSpHtml(shortSmartphoneName(candSp));
    const boolStr = v => v ? '✓ Sim' : '✗ Não';
    const sections = [
      {
        title: '1. Processamento, IA & Memória',
        rows: [
          ['Chipset (SoC)', `${baseSp.soc_name} (${baseSp.soc_nm}nm)`, `${candSp.soc_name} (${candSp.soc_nm}nm)`],
          ['AnTuTu v10 Estimado', `${(baseSp.soc_antutu || 0).toLocaleString('pt-BR')} pts`, `${(candSp.soc_antutu || 0).toLocaleString('pt-BR')} pts`],
          ['Estabilidade Térmica (Sustained)', `${baseSp.soc_sustained_pct || 72}%`, `${candSp.soc_sustained_pct || 72}%`],
          ['IA On-Device (NPU TOPS)', `${baseSp.soc_npu_tops || 8} TOPS`, `${candSp.soc_npu_tops || 8} TOPS`],
          ['Memória RAM / Armazenamento', `${baseSp.ram_gb} GB / ${_fmtSpCap(baseSp.storage_gb)} (${baseSp.storage_type || 'UFS'})`, `${candSp.ram_gb} GB / ${_fmtSpCap(candSp.storage_gb)} (${candSp.storage_type || 'UFS'})`],
          ['Slot MicroSD', boolStr(baseSp.has_microsd), boolStr(candSp.has_microsd)]
        ]
      },
      {
        title: '2. Tela & Experiência Visual',
        rows: [
          ['Tamanho & Painel', `${baseSp.screen_inches}" ${baseSp.screen_type || ''}`, `${candSp.screen_inches}" ${candSp.screen_type || ''}`],
          ['Taxa de Atualização & LTPO', `${baseSp.screen_hz} Hz ${baseSp.is_ltpo ? '(LTPO 1-120Hz)' : ''}`, `${candSp.screen_hz} Hz ${candSp.is_ltpo ? '(LTPO 1-120Hz)' : ''}`],
          ['Resolução & Brilho Pico', `${baseSp.screen_res || 'FHD+'} • ${baseSp.brightness_nits} nits`, `${candSp.screen_res || 'FHD+'} • ${candSp.brightness_nits} nits`]
        ]
      },
      {
        title: '3. Câmeras, Estabilização & Vídeo',
        rows: [
          ['Sensor Principal', `${baseSp.cam_main_mp} MP ${baseSp.cam_ois ? '(OIS Óptica)' : '(Sem OIS)'}`, `${candSp.cam_main_mp} MP ${candSp.cam_ois ? '(OIS Óptica)' : '(Sem OIS)'}`],
          ['Ultrawide / Frontal', `${baseSp.cam_ultrawide_mp || '--'} MP / ${baseSp.cam_front_mp || '--'} MP`, `${candSp.cam_ultrawide_mp || '--'} MP / ${candSp.cam_front_mp || '--'} MP`],
          ['Zoom Óptico / Vídeo Máx', `${baseSp.cam_zoom_optical ? baseSp.cam_zoom_optical + 'x' : 'Digital'} • ${baseSp.cam_video_max || '4K'}`, `${candSp.cam_zoom_optical ? candSp.cam_zoom_optical + 'x' : 'Digital'} • ${candSp.cam_video_max || '4K'}`]
        ]
      },
      {
        title: '4. Bateria, Recarga, Conectividade & Updates',
        rows: [
          ['Capacidade & Autonomia (SOT)', `${baseSp.battery_mah} mAh (~${baseSp.battery_hours_sot}h tela)`, `${candSp.battery_mah} mAh (~${candSp.battery_hours_sot}h tela)`],
          ['Carregamento Fio / Wireless', `${baseSp.charge_w}W (~${baseSp.charge_0_100_min}m 0-100%) / ${baseSp.wireless_charge_w || 0}W`, `${candSp.charge_w}W (~${candSp.charge_0_100_min}m 0-100%) / ${candSp.wireless_charge_w || 0}W`],
          ['5G / NFC / eSIM', `${boolStr(baseSp.has_5g)} / ${boolStr(baseSp.has_nfc)} / ${boolStr(baseSp.has_esim)}`, `${boolStr(candSp.has_5g)} / ${boolStr(candSp.has_nfc)} / ${boolStr(candSp.has_esim)}`],
          ['Proteção IP & Updates OS', `${baseSp.ip_rating || 'Básica'} • ${baseSp.os_updates_years || 3} anos OS (${baseSp.os})`, `${candSp.ip_rating || 'Básica'} • ${candSp.os_updates_years || 3} anos OS (${candSp.os})`]
        ]
      }
    ];
    sheetEl.innerHTML = sections.map(sec => `
      <div class="rounded-xl bg-slate-950/70 border border-slate-800 overflow-hidden">
        <div class="px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs font-bold text-slate-200 uppercase tracking-wider">${sec.title}</div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-slate-800/80 text-slate-400">
                <th class="text-left py-2 px-3 w-1/3">Especificação</th>
                <th class="text-left py-2 px-3 w-1/3" style="color:${colors.cmpAText};">A · ${bNameS}</th>
                <th class="text-left py-2 px-3 w-1/3" style="color:${colors.cmpBText};">B · ${cNameS}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60">
              ${sec.rows.map(r => `<tr><td class="py-2 px-3 text-slate-400 font-medium">${r[0]}</td><td class="py-2 px-3 text-slate-100 ui-mono">${_escSpHtml(r[1])}</td><td class="py-2 px-3 text-slate-100 ui-mono">${_escSpHtml(r[2])}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('');
  }

  // Price History Chart
  const histCanvas = document.getElementById('chart-smartphone-duel-history');
  if (histCanvas && typeof Chart !== 'undefined') {
    _destroySpChartSafe('duelHistory');
    const histA = Array.isArray(baseSp.history) ? baseSp.history : [];
    const histB = Array.isArray(candSp.history) ? candSp.history : [];
    const dateSet = Array.from(new Set([...histA.map(h => h.date), ...histB.map(h => h.date)])).sort();
    const mapA = Object.fromEntries(histA.map(h => [h.date, h.price]));
    const mapB = Object.fromEntries(histB.map(h => [h.date, h.price]));
    const labels = dateSet.length ? dateSet : ['Hoje'];
    const dataA = labels.map(d => mapA[d] ?? (dateSet.length ? null : basePrice));
    const dataB = labels.map(d => mapB[d] ?? (dateSet.length ? null : candPrice));
    const multiYear = labels.length > 1 && labels[0].length >= 4 && labels[labels.length - 1].length >= 4 && labels[0].slice(0, 4) !== labels[labels.length - 1].slice(0, 4);
    const fmtDateLbl = d => (d && d.length >= 10)
      ? (multiYear ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : `${d.slice(8, 10)}/${d.slice(5, 7)}`)
      : (d || '');
    const ptRadius = labels.length > 90 ? 0 : 2;
    _spCharts.duelHistory = new Chart(histCanvas, {
      type: 'line',
      data: {
        labels: labels.map(fmtDateLbl),
        datasets: [
          { label: shortSmartphoneName(baseSp), data: dataA, borderColor: colors.cmpA, backgroundColor: colors.cmpAFill, tension: 0.25, spanGaps: true, pointRadius: ptRadius, pointHoverRadius: 4 },
          { label: shortSmartphoneName(candSp), data: dataB, borderColor: colors.cmpB, backgroundColor: colors.cmpBFill, tension: 0.25, spanGaps: true, pointRadius: ptRadius, pointHoverRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: colors.text, boxWidth: 10, font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: colors.muted, maxTicksLimit: 9 }, grid: { color: colors.grid } },
          y: { ticks: { color: colors.muted, callback: v => fmtBRLShort(v) }, grid: { color: colors.grid } }
        }
      }
    });
  }

  // Alternatives List + System Insight
  const altEl = document.getElementById('smartphone-duel-alternatives-list');
  if (altEl) {
    const midPrice = (basePrice + candPrice) / 2;
    const alts = pool
      .filter(s => s.slug !== baseSp.slug && s.slug !== candSp.slug)
      .map(s => ({ sp: s, dist: Math.abs(Number(s.price_brl) - midPrice) }))
      .sort((a, b) => (b.sp._myCBScore * 30 - a.dist * 0.01) - (a.sp._myCBScore * 30 - b.dist * 0.01))
      .slice(0, 4);
    altEl.innerHTML = alts.map(({ sp }) => `
      <div class="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/40 transition">
        <div class="min-w-0">
          <div class="text-xs font-bold text-white truncate">${_escSpHtml(shortSmartphoneName(sp))}</div>
          <div class="text-xs text-slate-400 ui-mono">${_escSpHtml(sp.soc_name)} • ${sp.ram_gb}GB/${_fmtSpCap(sp.storage_gb)} • C/B ${sp._myCBScore}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-xs ui-mono font-bold text-emerald-400">${fmtBRLShort(sp.price_brl)}</span>
          <button type="button" onclick="sendSmartphoneToDuel('${_escSpHtml(sp.slug)}', 'cand')" class="ui-btn ui-btn--sm">Comparar B</button>
        </div>
      </div>
    `).join('') || '<div class="text-xs text-slate-400">Sem alternativas próximas carregadas.</div>';
  }
  const insEl = document.getElementById('smartphone-duel-system-insight');
  if (insEl) {
    insEl.innerHTML = `Comparando <strong>${_escSpHtml(baseSp.soc_name)}</strong> (${baseSp.soc_nm}nm) vs <strong>${_escSpHtml(candSp.soc_name)}</strong> (${candSp.soc_nm}nm). Em smartphones, chips de 3–4nm sustentam maior eficiência energética e menor aquecimento em 5G e gravação 4K60.`;
  }
}

// ============================================================================
// SECTION D: SMARTPHONE COST-BENEFIT TABLE & SCATTER
// ============================================================================
function setSmartphoneCBSort(col) {
  if (_spCbSortCol === col) _spCbSortDir = (_spCbSortDir === 'desc' ? 'asc' : 'desc');
  else {
    _spCbSortCol = col;
    _spCbSortDir = (col === 'price' || col === 'name') ? 'asc' : 'desc';
  }
  renderSmartphoneCBTable();
}

function setSmartphoneCBChartMetric(metric) {
  _spCbChartMetric = metric === 'benchmark' ? 'benchmark' : 'benefit';
  const bBtn = document.getElementById('smartphone-cb-chart-btn-benefit');
  const pBtn = document.getElementById('smartphone-cb-chart-btn-benchmark');
  if (bBtn) bBtn.classList.toggle('is-active', _spCbChartMetric === 'benefit');
  if (pBtn) pBtn.classList.toggle('is-active', _spCbChartMetric === 'benchmark');
  const titleEl = document.getElementById('smartphone-cb-chart-title');
  if (titleEl) {
    const _spSym = (typeof STATE !== 'undefined' && STATE.market?.monetary?.currency_symbol) || 'R$';
    titleEl.textContent = _spCbChartMetric === 'benchmark'
      ? `Mapa de Eficiência de Smartphones: Preço (${_spSym}) vs Índice Contextual (0–100)`
      : `Mapa de Eficiência de Smartphones: Preço (${_spSym}) vs Custo-Benefício (0–100)`;
  }
  renderSmartphoneCBTable();
}

function renderSmartphoneCBTable() {
  const pool = getSmartphonePool();
  const tbody = document.getElementById('smartphone-cb-table-body');
  if (!tbody) return;
  if (!pool.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-6 text-slate-400">Nenhum smartphone encontrado na base. Atualize os dados nas Configurações.</td></tr>';
    return;
  }
  const st = _ensureSpState();
  enrichSmartphonesWithContextualMetrics();

  const pillEl = document.getElementById('smartphone-cb-intensity-pill');
  if (pillEl) {
    pillEl.textContent = `Pesos: SoC ${st.wGaming ?? 30}% • Câm ${st.wWorkstation ?? 35}% • IA ${st.wAI ?? 20}% • Bat ${st.wSoft ?? 15}%`;
  }

  const q = (document.getElementById('smartphone-cb-search')?.value || '').trim().toLowerCase();
  const fCat = document.getElementById('smartphone-cb-filter-category')?.value || 'ALL';
  const fBrand = document.getElementById('smartphone-cb-filter-brand')?.value || 'ALL';
  const fRam = parseInt(document.getElementById('smartphone-cb-filter-ram')?.value || '0', 10) || 0;
  const fExtra = document.getElementById('smartphone-cb-filter-extra')?.value || 'ALL';
  const relSlug = document.getElementById('smartphone-cb-filter-base-rel')?.value || st.smartphoneCbRelBaseSlug;
  if (relSlug) st.smartphoneCbRelBaseSlug = relSlug;
  const relBase = findSmartphoneBySlug(relSlug) || pool[0];

  let rows = pool.filter(s => {
    if (q) {
      const hay = `${s.name} ${s.brand} ${s.soc_name} ${s.os}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (fCat !== 'ALL' && s.category !== fCat) return false;
    if (fBrand !== 'ALL' && String(s.brand || '').toLowerCase() !== fBrand.toLowerCase()) return false;
    if (fRam > 0 && Number(s.ram_gb || 0) < fRam) return false;
    if (fExtra === '5G_NFC' && (!s.has_5g || !s.has_nfc)) return false;
    if (fExtra === 'OLED' && !s.is_oled) return false;
    if (fExtra === 'IP68' && !/IP6[78]/i.test(String(s.ip_rating || ''))) return false;
    return true;
  });

  // Sort
  rows.sort((a, b) => {
    let va = 0, vb = 0;
    if (_spCbSortCol === 'name') return _spCbSortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    if (_spCbSortCol === 'price') { va = a.price_brl; vb = b.price_brl; }
    else if (_spCbSortCol === 'target') { va = a._targetPrice; vb = b._targetPrice; }
    else if (_spCbSortCol === 'ram') { va = (a.ram_gb * 1000 + a.storage_gb); vb = (b.ram_gb * 1000 + b.storage_gb); }
    else if (_spCbSortCol === 'screen') { va = (a.camera_score + a.display_score); vb = (b.camera_score + b.display_score); }
    else if (_spCbSortCol === 'score') { va = a._compositeScore; vb = b._compositeScore; }
    else { va = a._myCBScore; vb = b._myCBScore; }
    return _spCbSortDir === 'asc' ? va - vb : vb - va;
  });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-6 text-slate-400">Nenhum smartphone corresponde aos filtros selecionados.</td></tr>';
  } else {
    tbody.innerHTML = rows.map((s, idx) => {
      const ps = s.price_stats || {};
      const tgt = Number(s._targetPrice || ps.target_price || s.price_brl * 0.88);
      const spark = typeof renderPriceSparklineSVG === 'function' ? renderPriceSparklineSVG(s, s.price_brl, tgt) : '';
      const relGain = relBase ? (((s._compositeScore - relBase._compositeScore) / Math.max(1, relBase._compositeScore)) * 100) : 0;
      const relStr = s.slug === relBase?.slug ? '<span class="ui-badge ui-badge--a">Base</span>'
        : `<span class="ui-mono font-bold ${relGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${relGain >= 0 ? '+' : ''}${Math.round(relGain)}%</span>`;
      const catTag = SP_CATEGORY_SHORT[s.category] || s.category;
      const cbTone = s._myCBScore >= 75 ? 'text-emerald-400' : (s._myCBScore >= 52 ? 'text-sky-300' : 'text-amber-300');
      return `
        <tr>
          <td class="ui-mono text-xs text-slate-400">${idx + 1}</td>
          <td>
            <div class="flex items-center gap-2.5">
              ${s.image_url ? `<img src="${_escSpHtml(s.image_url)}" alt="" class="w-9 h-9 rounded-lg object-contain bg-slate-950 border border-slate-800 p-0.5 shrink-0" loading="lazy" onerror="this.classList.add('hidden')">` : ''}
              <div class="min-w-0">
                <div class="font-bold text-slate-100 text-xs sm:text-sm truncate max-w-[230px]" title="${_escSpHtml(s.name)}">${_escSpHtml(shortSmartphoneName(s))}</div>
                <div class="text-xs text-slate-400 ui-mono">${_escSpHtml(s.soc_name)} • ${catTag}${s.has_5g ? ' • 5G' : ''}</div>
                ${typeof renderCatalogLivePromoBadges === 'function' ? renderCatalogLivePromoBadges(s, true) : ''}
              </div>
            </div>
          </td>
          <td class="text-center ui-mono text-xs">
            <span class="font-bold text-slate-100">${s.ram_gb}GB / ${_fmtSpCap(s.storage_gb)}</span>
            <span class="block text-slate-400">${_escSpHtml(s.storage_type || 'UFS')}</span>
          </td>
          <td class="text-center text-xs ui-mono">
            <span class="text-sky-300">${s.screen_inches}" ${s.screen_hz}Hz ${s.is_oled ? 'OLED' : 'IPS'}</span>
            <span class="block text-slate-400">📷 ${s.cam_main_mp}MP${s.cam_ois ? ' OIS' : ''} • 🔋${s.battery_hours_sot}h</span>
          </td>
          <td class="text-right ui-mono">
            <span class="font-bold text-white text-xs sm:text-sm">${fmtBRLShort(s.price_brl)}</span>
            <span class="block text-xs text-slate-400">${_escSpHtml(ps.status || s.store_name || 'Zoom')}</span>
          </td>
          <td class="text-right ui-mono text-xs text-emerald-300">${fmtBRLShort(tgt)}</td>
          <td class="text-center">${spark}</td>
          <td class="text-center">
            <span class="ui-mono font-black text-sm ${cbTone}">${s._myCBScore}</span>
            <span class="block text-xs text-slate-400 ui-mono">Score ${s._overallVersusScore}</span>
          </td>
          <td class="text-right text-xs">${relStr}</td>
          <td class="text-center">
            <div class="flex items-center justify-center gap-1">
              <button type="button" onclick="sendSmartphoneToDuel('${_escSpHtml(s.slug)}','cand')" class="ui-btn ui-btn--sm" title="Comparar no Duelo">VS</button>
              <button type="button" onclick="sendSmartphoneToSimulator('${_escSpHtml(s.slug)}','a')" class="ui-btn ui-btn--sm" title="Simular jogos/IA/bateria">Sim</button>
              ${s.offer_url ? `<a href="${_escSpHtml(s.offer_url)}" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn--sm" title="Ver oferta no Zoom">↗</a>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Scatter Chart
  const scCanvas = document.getElementById('chart-smartphone-cb-scatter');
  if (scCanvas && typeof Chart !== 'undefined') {
    _destroySpChartSafe('cbScatter');
    const colors = _spThemeColors();
    const pts = rows.map(s => ({
      x: Number(s.price_brl || 0),
      y: _spCbChartMetric === 'benchmark' ? Number(s._overallVersusScore || 50) : Number(s._myCBScore || 50),
      sp: s
    }));
    _spCharts.cbScatter = new Chart(scCanvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Smartphones',
          data: pts,
          backgroundColor: pts.map(p => p.sp.category === 'flagship' ? colors.cmpB : (p.sp.category === 'midrange' ? colors.good : colors.cmpA)),
          pointRadius: 6,
          pointHoverRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_, els) => {
          if (els && els.length) {
            const pt = pts[els[0].index];
            if (pt && pt.sp) sendSmartphoneToDuel(pt.sp.slug, 'cand');
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const p = ctx.raw;
                return `${shortSmartphoneName(p.sp)} — ${fmtBRLShort(p.x)} (${_spCbChartMetric === 'benchmark' ? 'Score' : 'C/B'} ${p.y}/100)`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: colors.muted, callback: v => fmtBRLShort(v) }, grid: { color: colors.grid } },
          y: { min: 0, max: 105, ticks: { color: colors.muted }, grid: { color: colors.grid } }
        }
      }
    });
  }
}

// ============================================================================
// SECTION E: OBJECTIVE PICKER & CHARGER/ACCESSORY ECOSYSTEM KIT
// ============================================================================
const SP_CHARGER_PRESETS = {
  none: { label: 'Usar carregador incluído / já tenho', price: 0, w: 0 },
  gan33: { label: 'Carregador GaN 33W USB-C PD (Original / Baseus)', price: 110, w: 33 },
  gan65: { label: 'Carregador GaN 67W Dual USB-C (Turbo rápido)', price: 185, w: 67 },
  mag15: { label: 'Base Sem Fio MagSafe / Qi2 15W', price: 160, w: 15 }
};
const SP_ACCESSORY_PRESETS = {
  none: { label: 'Sem capa / película', price: 0 },
  case_glass: { label: 'Capa Anti-Impacto + Película Vidro 3D', price: 90 },
  magsafe_kit: { label: 'Capa MagSafe + Película Safira + PowerBank 10000mAh', price: 240 }
};
const SP_TWS_PRESETS = {
  none: { label: 'Sem fone TWS', price: 0 },
  budget_tws: { label: 'Fone Bluetooth ANC Custo-Benefício (QCY/Redmi)', price: 180 },
  flagship_tws: { label: 'Fone Flagship ANC (Galaxy Buds / AirPods)', price: 690 }
};

function pickSmartphoneForObjective(obj) {
  const pool = getSmartphonePool();
  if (!pool.length) return;
  const st = _ensureSpState();
  enrichSmartphonesWithContextualMetrics();

  let chosen = pool[0];
  if (obj === 'camera') {
    chosen = pool.slice().sort((a, b) => Number(b.camera_score || 0) - Number(a.camera_score || 0))[0];
  } else if (obj === 'gaming') {
    chosen = pool.slice().sort((a, b) => Number(b._perfEff || 0) - Number(a._perfEff || 0))[0];
  } else if (obj === 'battery') {
    chosen = pool.slice().sort((a, b) => (Number(b.battery_hours_sot || 0) * 10 + Number(b.battery_score || 0)) - (Number(a.battery_hours_sot || 0) * 10 + Number(a.battery_score || 0)))[0];
  } else if (obj === 'ai') {
    chosen = pool.slice().sort((a, b) => Number(b._aiEff || 0) - Number(a._aiEff || 0))[0];
  } else {
    chosen = pool.slice().sort((a, b) => Number(b._myCBScore || 0) - Number(a._myCBScore || 0))[0];
  }
  st.smartphoneBuilder.slug = chosen.slug;
  st.smartphoneBuilder.price = Math.round(Number(chosen.price_brl || 0));
  if (chosen.brand === 'Apple' && chosen.charge_w <= 30) {
    st.smartphoneBuilder.chargerPreset = 'gan33';
    st.smartphoneBuilder.chargerPrice = SP_CHARGER_PRESETS.gan33.price;
  }
  renderSmartphoneBuilder();
}

function onSmartphoneBuilderSelect(slug) {
  const st = _ensureSpState();
  const sp = findSmartphoneBySlug(slug);
  if (!sp) return;
  st.smartphoneBuilder.slug = slug;
  st.smartphoneBuilder.price = Math.round(Number(sp.price_brl || 0));
  renderSmartphoneBuilder();
}

function updateSmartphoneBuilderField(field, val) {
  const st = _ensureSpState();
  const b = st.smartphoneBuilder;
  if (field === 'chargerPreset') {
    b.chargerPreset = val;
    b.chargerPrice = (SP_CHARGER_PRESETS[val] || SP_CHARGER_PRESETS.none).price;
  } else if (field === 'accessoryPreset') {
    b.accessoryPreset = val;
    b.accessoryPrice = (SP_ACCESSORY_PRESETS[val] || SP_ACCESSORY_PRESETS.none).price;
  } else if (field === 'twsPreset') {
    b.twsPreset = val;
    b.twsPrice = (SP_TWS_PRESETS[val] || SP_TWS_PRESETS.none).price;
  } else if (['price', 'chargerPrice', 'accessoryPrice', 'twsPrice'].includes(field)) {
    b[field] = Math.max(0, parseFloat(val) || 0);
  } else if (['chargerOwned', 'accessoryOwned', 'twsOwned'].includes(field)) {
    b[field] = !!val;
  }
  renderSmartphoneBuilder();
}

function renderSmartphoneBuilder() {
  const pool = getSmartphonePool();
  const partsEl = document.getElementById('smartphone-builder-parts-container');
  const pwrEl = document.getElementById('smartphone-builder-power-card');
  const sumEl = document.getElementById('smartphone-builder-summary-card');
  if (!partsEl || !pool.length) return;

  const st = _ensureSpState();
  enrichSmartphonesWithContextualMetrics();
  const b = st.smartphoneBuilder;
  let sp = findSmartphoneBySlug(b.slug);
  if (!sp) {
    sp = pool.slice().sort((a, b2) => Number(b2._myCBScore || 0) - Number(a._myCBScore || 0))[0];
    b.slug = sp.slug;
    b.price = Math.round(Number(sp.price_brl || 0));
  }
  const phonePrice = b.price > 0 ? b.price : Number(sp.price_brl || 0);

  partsEl.innerHTML = `
    <div class="p-4 rounded-xl bg-slate-900/85 border border-sky-500/35 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-mono uppercase text-sky-300 font-bold">1. Smartphone Principal</span>
        <span class="text-xs font-mono text-slate-400">${SP_CATEGORY_SHORT[sp.category] || sp.category} • C/B ${sp._myCBScore}/100</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
        <div class="sm:col-span-9">
          <select onchange="onSmartphoneBuilderSelect(this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white">
            ${_buildGroupedSmartphoneOptionsHTML(pool, sp.slug)}
          </select>
        </div>
        <div class="sm:col-span-3 flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5">
          <span class="text-xs font-mono text-slate-400">R$</span>
          <input type="number" value="${Math.round(phonePrice)}" step="50" onchange="updateSmartphoneBuilderField('price', this.value)" class="w-full bg-transparent text-xs font-mono font-bold text-emerald-300 focus:outline-none">
        </div>
      </div>
      <div class="flex flex-wrap gap-2 text-xs font-mono text-slate-300 pt-1">
        <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">🧠 ${_escSpHtml(sp.soc_name)}</span>
        <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-sky-300">💾 ${sp.ram_gb}GB / ${_fmtSpCap(sp.storage_gb)}</span>
        <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-purple-300">📷 ${sp.cam_main_mp}MP${sp.cam_ois ? ' OIS' : ''}</span>
        <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-300">🔋 ${sp.battery_mah}mAh (${sp.charge_w}W)</span>
      </div>
    </div>

    ${[
      { key: 'charger', title: '2. Carregador GaN / Indução (Apple & Samsung frequentemente vendem sem fonte potente)', presets: SP_CHARGER_PRESETS, pVal: b.chargerPreset, price: b.chargerPrice, owned: b.chargerOwned, priceField: 'chargerPrice', ownedField: 'chargerOwned', presetField: 'chargerPreset' },
      { key: 'acc', title: '3. Proteção Física (Capa + Película / PowerBank)', presets: SP_ACCESSORY_PRESETS, pVal: b.accessoryPreset, price: b.accessoryPrice, owned: b.accessoryOwned, priceField: 'accessoryPrice', ownedField: 'accessoryOwned', presetField: 'accessoryPreset' },
      { key: 'tws', title: '4. Ecossistema de Áudio (Fone Bluetooth ANC — maioria dos modelos atuais não tem P2)', presets: SP_TWS_PRESETS, pVal: b.twsPreset, price: b.twsPrice, owned: b.twsOwned, priceField: 'twsPrice', ownedField: 'twsOwned', presetField: 'twsPreset' }
    ].map(row => `
      <div class="p-4 rounded-xl bg-slate-900/85 border border-slate-800 space-y-2.5">
        <span class="text-xs font-bold text-slate-200 block">${row.title}</span>
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div class="sm:col-span-6">
            <select onchange="updateSmartphoneBuilderField('${row.presetField}', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white">
              ${Object.entries(row.presets).map(([k, v]) => `<option value="${k}" ${row.pVal === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
          </div>
          <div class="sm:col-span-3 flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span class="text-xs font-mono text-slate-400">R$</span>
            <input type="number" value="${Math.round(row.price || 0)}" step="20" onchange="updateSmartphoneBuilderField('${row.priceField}', this.value)" class="w-full bg-transparent text-xs font-mono text-white focus:outline-none">
          </div>
          <label class="sm:col-span-3 flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" ${row.owned ? 'checked' : ''} onchange="updateSmartphoneBuilderField('${row.ownedField}', this.checked)" class="accent-sky-400">
            <span>Já possuo</span>
          </label>
        </div>
      </div>
    `).join('')}
  `;

  if (pwrEl) {
    const chgNote = (sp.brand === 'Apple' || /galaxy\s*s/i.test(sp.name))
      ? '⚠️ Caixa normalmente não inclui adaptador completo na tomada ou limita em 15–25W.'
      : `✓ Suporta até ${sp.charge_w}W (~${sp.charge_0_100_min} min de 0 a 100%).`;
    pwrEl.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <h3 class="ui-title-md">Bateria, Recarga & Conectividade</h3>
        <span class="ui-badge ui-badge--a">${sp.battery_mah} mAh</span>
      </div>
      <div class="space-y-2 text-xs">
        <div class="flex justify-between"><span class="text-slate-400">Tempo de tela (SOT misto):</span><span class="ui-mono font-bold text-emerald-400">~${sp.battery_hours_sot} horas</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Potência máx. suportada:</span><span class="ui-mono text-white">${sp.charge_w}W fio / ${sp.wireless_charge_w || 0}W ind.</span></div>
        <div class="flex justify-between"><span class="text-slate-400">5G / NFC / eSIM / IP:</span><span class="ui-mono text-sky-300">${sp.has_5g ? '5G' : '4G'} • ${sp.has_nfc ? 'NFC' : 'Sem NFC'} • ${sp.ip_rating || 'IP54'}</span></div>
        <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 leading-relaxed">${chgNote}</div>
      </div>
    `;
  }

  if (sumEl) {
    const chgCost = b.chargerOwned ? 0 : Number(b.chargerPrice || 0);
    const accCost = b.accessoryOwned ? 0 : Number(b.accessoryPrice || 0);
    const twsCost = b.twsOwned ? 0 : Number(b.twsPrice || 0);
    const totalKit = phonePrice + chgCost + accCost + twsCost;
    sumEl.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <h3 class="ui-title-md">Resumo do Kit Completo</h3>
        <span class="ui-badge ui-badge--good">${sp.os_updates_years || 3}a updates</span>
      </div>
      <div class="space-y-1.5 text-xs">
        <div class="flex justify-between"><span class="text-slate-400">${_escSpHtml(shortSmartphoneName(sp))}:</span><span class="ui-mono text-white">${fmtBRLShort(phonePrice)}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Carregador / Base:</span><span class="ui-mono text-slate-200">${fmtBRLShort(chgCost)}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Proteção (Capa/Película):</span><span class="ui-mono text-slate-200">${fmtBRLShort(accCost)}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Áudio TWS:</span><span class="ui-mono text-slate-200">${fmtBRLShort(twsCost)}</span></div>
        <div class="flex justify-between pt-2 border-t border-slate-800 text-sm font-bold"><span class="text-white">Total a Desembolsar:</span><span class="ui-mono text-emerald-400">${fmtBRLShort(totalKit)}</span></div>
        <div class="text-xs text-slate-400 ui-mono pt-1">Custo diluído em ${sp.os_updates_years || 3} anos: ${fmtBRLShort(totalKit / Math.max(1, sp.os_updates_years || 3))}/ano</div>
      </div>
      <div class="flex flex-wrap gap-2 pt-2">
        <button type="button" onclick="sendSmartphoneToDuel('${_escSpHtml(sp.slug)}','cand')" class="ui-btn ui-btn--sm flex-1">Enviar p/ Duelo</button>
        <button type="button" onclick="sendSmartphoneToSimulator('${_escSpHtml(sp.slug)}','a')" class="ui-btn ui-btn--sm flex-1">Abrir Simulador</button>
      </div>
    `;
  }
}

// ============================================================================
// SECTION F: LONGEVITY, STORAGE (128 vs 256 vs 512) & OS UPDATES MATRIX
// ============================================================================
function renderSmartphoneUpgrades() {
  const grid = document.getElementById('sp-upg-cards-grid');
  const costTbl = document.getElementById('sp-upg-costs-table');
  const verdEl = document.getElementById('sp-upg-verdict');
  const pool = getSmartphonePool();
  if (!grid || !pool.length) return;

  enrichSmartphonesWithContextualMetrics();
  const targetStor = parseInt(document.getElementById('sp-upg-storage-cap')?.value || '256', 10) || 256;
  const minUpd = parseInt(document.getElementById('sp-upg-min-updates')?.value || '4', 10) || 4;
  const strat = document.getElementById('sp-upg-strategy')?.value || 'ALL';
  const budget = parseFloat(document.getElementById('sp-upg-budget')?.value || '4500') || 4500;

  let filtered = pool.filter(s => Number(s.price_brl || 0) <= budget);
  if (strat === 'LONG_OS') filtered = filtered.filter(s => Number(s.os_updates_years || 0) >= 5);
  else if (strat === 'MICROSD') filtered = filtered.filter(s => s.has_microsd);
  else if (strat === 'AI_READY') filtered = filtered.filter(s => Number(s.ram_gb || 0) >= 12 || Number(s.soc_npu_tops || 0) >= 35);

  const ranked = (filtered.length ? filtered : pool)
    .map(sp => {
      const meetsStor = Number(sp.storage_gb || 128) >= targetStor || sp.has_microsd;
      const meetsUpd = Number(sp.os_updates_years || 3) >= minUpd;
      const storPenalty = meetsStor ? 0 : 12;
      const updPenalty = meetsUpd ? 0 : 14;
      const longScore = Math.max(10, Math.round(sp._myCBScore * 0.55 + sp.longevity_score * 0.45 - storPenalty - updPenalty));
      const costPerYear = Number(sp.price_brl || 0) / Math.max(1, Number(sp.os_updates_years || 3));
      return { sp, meetsStor, meetsUpd, longScore, costPerYear };
    })
    .sort((a, b) => b.longScore - a.longScore);

  const top4 = ranked.slice(0, 4);
  grid.innerHTML = top4.map(({ sp, meetsStor, meetsUpd, longScore, costPerYear }, i) => `
    <div class="p-4 rounded-xl bg-slate-950 border ${i === 0 ? 'border-emerald-500/50' : 'border-slate-800'} space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <span class="ui-badge ${i === 0 ? 'ui-badge--good' : 'ui-badge--a'}">#${i + 1} Longevidade ${longScore}/100</span>
        <span class="ui-mono text-xs text-slate-400">${fmtBRLShort(costPerYear)}/ano</span>
      </div>
      <div class="text-sm font-bold text-white truncate" title="${_escSpHtml(sp.name)}">${_escSpHtml(shortSmartphoneName(sp))}</div>
      <div class="text-xs ui-mono text-slate-300 space-y-1">
        <div>Armazenamento: <span class="${meetsStor ? 'text-emerald-400' : 'text-amber-300'}">${_fmtSpCap(sp.storage_gb)} (${sp.storage_type || 'UFS'})</span>${sp.has_microsd ? ' + MicroSD' : ' (fixo)'}</div>
        <div>RAM / NPU IA: <span class="text-sky-300">${sp.ram_gb}GB</span> • ${sp.soc_npu_tops || 8} TOPS</div>
        <div>Suporte OS: <span class="${meetsUpd ? 'text-emerald-400' : 'text-rose-400'}">${sp.os_updates_years || 3} anos</span> (até ~${2026 + Number(sp.os_updates_years || 3)})</div>
      </div>
      <div class="flex items-center justify-between pt-2 border-t border-slate-800/80">
        <span class="text-sm font-black ui-mono text-white">${fmtBRLShort(sp.price_brl)}</span>
        <button type="button" onclick="sendSmartphoneToDuel('${_escSpHtml(sp.slug)}','cand')" class="ui-btn ui-btn--sm">Comparar</button>
      </div>
    </div>
  `).join('');

  if (costTbl) {
    const byStor = { 128: [], 256: [], 512: [] };
    pool.forEach(s => {
      if (s.storage_gb <= 128) byStor[128].push(s.price_brl);
      else if (s.storage_gb <= 256) byStor[256].push(s.price_brl);
      else byStor[512].push(s.price_brl);
    });
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const minP = arr => arr.length ? Math.min(...arr) : 0;
    costTbl.innerHTML = [128, 256, 512].map(cap => `
      <div class="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
        <div>
          <span class="font-bold text-white">${_fmtSpCap(cap)} Armazenamento</span>
          <span class="block text-slate-400">${byStor[cap].length} modelos na base BR ${cap === 128 ? '• Enche rápido com 4K/WhatsApp' : (cap === 256 ? '• Ponto ideal 2026–2030' : '• Folga total p/ vídeo ProRes/RAW e IA offline')}</span>
        </div>
        <div class="text-right ui-mono">
          <span class="text-emerald-400 font-bold block">A partir de ${fmtBRLShort(minP(byStor[cap]))}</span>
          <span class="text-slate-400">Média ${fmtBRLShort(avg(byStor[cap]))}</span>
        </div>
      </div>
    `).join('');
  }

  if (verdEl && top4[0]) {
    const best = top4[0].sp;
    verdEl.innerHTML = `
      <div class="ui-badge ui-badge--good">Recomendação de Longevidade</div>
      <div class="text-sm font-bold text-white">${_escSpHtml(shortSmartphoneName(best))} entrega o menor risco de obsolescência até ${2026 + Number(best.os_updates_years || 3)}.</div>
      <p class="text-slate-300 leading-relaxed">Como celulares modernos dificilmente aceitam MicroSD e nunca expandem RAM, priorize pelo menos <strong>${targetStor}GB</strong> e <strong>8–12GB RAM</strong> caso pretenda manter o aparelho por ${minUpd}+ anos sem engasgos de sistema ou falta de espaço.</p>
    `;
  }
}

// ============================================================================
// SECTION G: REAL-WORLD SMARTPHONE SIMULATOR (GAMES + THERMALS + CAMERA/AI + SOT)
// ============================================================================
const SP_SIM_GAMES = [
  { id: 'genshin', name: 'Genshin Impact (Natlan)', weightGpu: 1.05, cpuCapBase: 92, tag: 'Mundo Aberto / GPU' },
  { id: 'warzone', name: 'Call of Duty: Warzone Mobile', weightGpu: 1.25, cpuCapBase: 86, tag: 'Ultra Pesado / Térmica' },
  { id: 'hsr', name: 'Honkai: Star Rail', weightGpu: 1.00, cpuCapBase: 96, tag: 'Shaders / Batalha' },
  { id: 'pubg', name: 'PUBG Mobile (90/120Hz)', weightGpu: 0.72, cpuCapBase: 118, tag: 'Competitivo Hz Alto' },
  { id: 'wuwa', name: 'Wuthering Waves / Fortnite', weightGpu: 1.15, cpuCapBase: 88, tag: 'Unreal Engine Mobile' }
];
const SP_SIM_PRESETS = [
  { idx: 0, label: 'M. Baixo (Eco)', gpuScale: 1.48, desc: 'Resolução reduzida e 30–60fps priorizando máxima economia de bateria e temperatura baixa.' },
  { idx: 1, label: 'Baixo', gpuScale: 1.25, desc: 'Texturas leves com fluidez estável para sessões longas sem thermal throttling forte.' },
  { idx: 2, label: 'Médio', gpuScale: 1.00, desc: 'Equilíbrio padrão das fabricantes entre nitidez, temperatura e autonomia de tela.' },
  { idx: 3, label: 'Alto', gpuScale: 0.78, desc: 'Qualidade nativa alta sem downscale — exige bom SoC e refrigeração câmara de vapor.' },
  { idx: 4, label: 'Ultra Mobile + Efeitos', gpuScale: 0.58, desc: 'Máxima qualidade, sombras globais e Ray Tracing mobile — estressa GPU, throttling e consumo.' }
];

function setSmartphoneSimQuality(val) {
  const st = _ensureSpState();
  st.simSmartphoneQuality = Math.max(0, Math.min(4, parseInt(val, 10) || 0));
  if (typeof saveUserPrefs === 'function') saveUserPrefs();
  renderSmartphoneSimulator();
}

function swapSimulatorSmartphones() {
  const st = _ensureSpState();
  const tmp = st.simSmartphoneASlug;
  st.simSmartphoneASlug = st.simSmartphoneBSlug;
  st.simSmartphoneBSlug = tmp;
  populateSmartphoneSelectors();
  renderSmartphoneSimulator();
}

function _simulateSmartphoneMetrics(sp, qIdx, thermalMode, usageMode) {
  const preset = SP_SIM_PRESETS[qIdx] || SP_SIM_PRESETS[3];
  const sustFactor = thermalMode === 'sustained'
    ? (0.72 + 0.28 * (Number(sp.soc_sustained_pct || 72) / 100))
    : 1.0;
  const gpuPower = Number(sp.soc_gpu_score || 1600) * sustFactor;
  const cpuPower = Number(sp.soc_single_score || 55) * sustFactor;
  const maxHz = Number(sp.screen_hz || 60);

  const games = SP_SIM_GAMES.map(g => {
    const rawGpuFps = (gpuPower / 62) * (preset.gpuScale / g.weightGpu);
    const cpuCeiling = Math.round(g.cpuCapBase * (cpuPower / 88));
    const uncapped = Math.min(rawGpuFps, cpuCeiling);
    const screenCapped = Math.max(18, Math.min(maxHz, Math.round(uncapped)));
    const cpuLimited = cpuCeiling < rawGpuFps * 0.94;
    const hzLimited = uncapped > maxHz;
    return {
      ...g,
      fps: screenCapped,
      cpuCeiling,
      rawGpuFps: Math.round(rawGpuFps),
      cpuLimited,
      hzLimited,
      throttleDropPct: thermalMode === 'sustained' ? Math.round((1 - (Number(sp.soc_sustained_pct || 72) / 100)) * 65) : 0
    };
  });

  const avgFps = Math.round(games.reduce((a, b) => a + b.fps, 0) / games.length);
  const sotMult = usageMode === 'heavy_5g' ? (0.74 * (sp.is_ltpo ? 1.06 : 0.97)) : 1.0;
  const simSotHours = +(Number(sp.battery_hours_sot || 6.5) * sotMult).toFixed(1);
  const aiTokS = Math.max(3, Math.round(Number(sp.soc_npu_tops || 8) * (Number(sp.ram_gb || 6) >= 12 ? 0.95 : 0.65)));
  const capCut4kMult = +((Number(sp.soc_multi_score || 3200) / 5500) * (sp.brand === 'Apple' ? 1.18 : 1.0)).toFixed(2);
  const overallPerf = Math.min(100, Math.round((avgFps / 120) * 45 + (Number(sp.camera_score || 60)) * 0.30 + Math.min(100, simSotHours * 9.5) * 0.25));

  return { sp, games, avgFps, maxHz, simSotHours, aiTokS, capCut4kMult, overallPerf, preset };
}

function renderSmartphoneSimulator() {
  const pool = getSmartphonePool();
  if (!pool.length) return;
  const st = _ensureSpState();
  enrichSmartphonesWithContextualMetrics();

  const compareOn = st.simCompareEnabled !== false;
  if (typeof syncSimCompareUI === 'function') syncSimCompareUI();

  const aSel = document.getElementById('sim-select-phone-a');
  const bSel = document.getElementById('sim-select-phone-b');
  if (aSel && aSel.value) st.simSmartphoneASlug = aSel.value;
  if (bSel && bSel.value) st.simSmartphoneBSlug = bSel.value;
  const spA = findSmartphoneBySlug(st.simSmartphoneASlug) || pool[0];
  const spB = findSmartphoneBySlug(st.simSmartphoneBSlug) || pool[Math.min(1, pool.length - 1)];

  const qIdx = Math.max(0, Math.min(4, parseInt(st.simSmartphoneQuality ?? 3, 10) || 0));
  const thermalMode = document.getElementById('sim-phone-thermal-mode')?.value || st.simSmartphoneThermalMode || 'sustained';
  const usageMode = document.getElementById('sim-phone-usage-mode')?.value || st.simSmartphoneUsageMode || 'mixed';
  st.simSmartphoneThermalMode = thermalMode;
  st.simSmartphoneUsageMode = usageMode;

  const preset = SP_SIM_PRESETS[qIdx] || SP_SIM_PRESETS[3];
  const slider = document.getElementById('sim-phone-preset-slider');
  if (slider) slider.value = String(qIdx);
  const badge = document.getElementById('sim-phone-preset-active-badge');
  if (badge) badge.textContent = preset.label;
  const desc = document.getElementById('sim-phone-preset-desc');
  if (desc) desc.textContent = preset.desc;
  const resPill = document.getElementById('sim-phone-res-live-pill');
  if (resPill) resPill.textContent = `${spA.screen_res || 'FHD+'} • Teto ${spA.screen_hz}Hz`;
  document.querySelectorAll('#sim-phone-preset-step-labels .sim-preset-step-btn').forEach(btn => {
    btn.classList.toggle('is-active', Number(btn.dataset.preset) === qIdx);
  });

  const simA = _simulateSmartphoneMetrics(spA, qIdx, thermalMode, usageMode);
  const simB = compareOn ? _simulateSmartphoneMetrics(spB, qIdx, thermalMode, usageMode) : null;
  const colors = _spThemeColors();

  // Status banner
  const banner = document.getElementById('sim-phone-status-banner');
  if (banner) {
    banner.innerHTML = `<div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2"><span><strong>${_escSpHtml(shortSmartphoneName(spA))}</strong>: ${_escSpHtml(spA.soc_name)} (${spA.soc_sustained_pct}% sustentado) • Teto tela ${spA.screen_hz}Hz</span><span class="ui-mono text-sky-300">${thermalMode === 'sustained' ? '🔥 Com throttling após 30-45 min' : '⚡ Desempenho pico imediato'} • ${usageMode === 'heavy_5g' ? '📶 5G + Brilho 100%' : '🏠 Wi-Fi Misto'}</span></div>`;
  }

  // Hero cards
  const heroEl = document.getElementById('sim-phone-hero-cards');
  if (heroEl) {
    heroEl.innerHTML = [
      { title: 'FPS Médio Mobile', aVal: `${simA.avgFps} fps`, bVal: simB ? `${simB.avgFps} fps` : null, sub: `Preset ${preset.label} (teto ${spA.screen_hz}Hz)` },
      { title: 'Autonomia Real (SOT)', aVal: `${simA.simSotHours}h tela`, bVal: simB ? `${simB.simSotHours}h tela` : null, sub: `${spA.battery_mah}mAh • Carga ${spA.charge_w}W` },
      { title: 'Câmera & Vídeo 4K60', aVal: `${spA.camera_score}/100`, bVal: simB ? `${spB.camera_score}/100` : null, sub: `${spA.cam_main_mp}MP • ${spA.cam_video_max || '4K'}` },
      { title: 'IA On-Device & RAM', aVal: `${simA.aiTokS} t/s (Gemini/LLM)`, bVal: simB ? `${simB.aiTokS} t/s` : null, sub: `${spA.soc_npu_tops} TOPS • ${spA.ram_gb}GB RAM` }
    ].map(c => `
      <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
        <span class="ui-label block">${c.title}</span>
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-lg font-black ui-mono" style="color:${colors.cmpAText};">${c.aVal}</span>
          ${c.bVal ? `<span class="text-sm font-bold ui-mono" style="color:${colors.cmpBText};">vs ${c.bVal}</span>` : ''}
        </div>
        <span class="text-xs text-slate-400 block truncate">${c.sub}</span>
      </div>
    `).join('');
  }

  // Sim Radar
  const radarCanvas = document.getElementById('chart-sim-phone-radar');
  if (radarCanvas && typeof Chart !== 'undefined') {
    _destroySpChartSafe('simRadar');
    const mkVec = sm => [
      Math.min(100, Math.round((sm.avgFps / 120) * 100)),
      Math.min(100, Number(sm.sp.camera_score || 60)),
      Math.min(100, Number(sm.sp.display_score || 60)),
      Math.min(100, Math.round(sm.simSotHours * 10)),
      Math.min(100, Math.round((sm.sp.soc_sustained_pct || 72))),
      Math.min(100, Math.round(Number(sm.sp.soc_npu_tops || 10) * 1.6))
    ];
    const datasets = [{
      label: shortSmartphoneName(spA),
      data: mkVec(simA),
      borderColor: colors.cmpA,
      backgroundColor: colors.cmpAFill,
      borderWidth: 2
    }];
    if (simB) {
      datasets.push({
        label: shortSmartphoneName(spB),
        data: mkVec(simB),
        borderColor: colors.cmpB,
        backgroundColor: colors.cmpBFill,
        borderWidth: 2
      });
    }
    _spCharts.simRadar = new Chart(radarCanvas, {
      type: 'radar',
      data: { labels: ['Jogos FPS', 'Câmeras', 'Tela AMOLED', 'Bateria SOT', 'Estabilidade Térmica', 'IA On-Device'], datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: 'transparent', color: colors.muted }, pointLabels: { color: colors.text, font: { size: 11 } }, grid: { color: colors.grid }, angleLines: { color: colors.grid } }
        },
        plugins: { legend: { labels: { color: colors.text } } }
      }
    });
  }

  const breakEl = document.getElementById('sim-phone-radar-metrics-breakdown');
  if (breakEl) {
    const rows = [
      ['Jogos Mobile Médio', `${simA.avgFps} fps`, simB ? `${simB.avgFps} fps` : null],
      ['Autonomia Real (SOT)', `${simA.simSotHours}h`, simB ? `${simB.simSotHours}h` : null],
      ['Carga 0→100%', `~${spA.charge_0_100_min} min (${spA.charge_w}W)`, simB ? `~${spB.charge_0_100_min} min (${spB.charge_w}W)` : null],
      ['Estabilidade Térmica', `${spA.soc_sustained_pct}%`, simB ? `${spB.soc_sustained_pct}%` : null],
      ['Edição Vídeo 4K / CapCut', `${simA.capCut4kMult}x tempo real`, simB ? `${simB.capCut4kMult}x tempo real` : null],
      ['Updates OS Garantidos', `${spA.os_updates_years} anos`, simB ? `${spB.os_updates_years} anos` : null]
    ];
    breakEl.innerHTML = rows.map(([k, va, vb]) => `
      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800/80">
        <span class="text-slate-400">${k}</span>
        <div class="flex items-center gap-3">
          <span class="font-bold" style="color:${colors.cmpAText};">${va}</span>
          ${vb ? `<span class="text-slate-500">vs</span><span class="font-bold" style="color:${colors.cmpBText};">${vb}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  // Hardware & Thermal / Camera Panel
  const hwEl = document.getElementById('sim-phone-hardware-panel');
  if (hwEl) {
    hwEl.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div>
          <span class="ui-label">Diagnóstico Térmico & Câmera</span>
          <h3 class="ui-title-md">Teto da CPU Mobile, Throttling e Conjunto Óptico</h3>
        </div>
        <span class="ui-badge ui-badge--a">${_escSpHtml(spA.soc_name)} (${spA.soc_nm}nm)</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div class="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <span class="text-slate-400 block">Gargalo de CPU vs Qualidade</span>
          <span class="font-bold text-white block">Teto single-core: ~${simA.games[3].cpuCeiling} fps em PUBG</span>
          <span class="text-slate-400">Reduzir qualidade gráfica NÃO ultrapassa o teto de CPU nem os ${spA.screen_hz}Hz da tela.</span>
        </div>
        <div class="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <span class="text-slate-400 block">Câmara de Vapor / Throttling</span>
          <span class="font-bold ${spA.soc_sustained_pct >= 78 ? 'text-emerald-400' : 'text-amber-300'} block">${spA.soc_sustained_pct}% sustentado após 40 min</span>
          <span class="text-slate-400">${spA.soc_sustained_pct >= 78 ? 'Boa dissipação térmica contínua.' : 'Queda moderada de clock em jogos pesados sem cooler externo.'}</span>
        </div>
        <div class="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <span class="text-slate-400 block">Brilho Solar & Proteção</span>
          <span class="font-bold text-sky-300 block">${spA.brightness_nits} nits • ${spA.ip_rating || 'IP54'}</span>
          <span class="text-slate-400">${spA.brightness_nits >= 1600 ? 'Excelente visibilidade sob sol forte.' : 'Adequado em sombra e ambientes internos.'}</span>
        </div>
      </div>
    `;
  }

  // 3 Columns
  const gList = document.getElementById('sim-phone-games-list');
  if (gList) {
    gList.innerHTML = simA.games.map((ga, idx) => {
      const gb = simB ? simB.games[idx] : null;
      return `
        <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
          <div class="flex items-center justify-between gap-2 text-xs">
            <span class="font-bold text-white truncate">${ga.name}</span>
            <span class="ui-mono font-black" style="color:${colors.cmpAText};">${ga.fps} fps${gb ? ` <span class="text-slate-400">vs</span> <span style="color:${colors.cmpBText};">${gb.fps}</span>` : ''}</span>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-400 ui-mono">
            <span>${ga.tag}</span>
            <span>${ga.cpuLimited ? '🔒 Teto CPU' : (ga.hzLimited ? `📱 Teto ${simA.maxHz}Hz` : 'GPU Limitado')}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  const aiList = document.getElementById('sim-phone-ai-list');
  if (aiList) {
    aiList.innerHTML = `
      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
        <div class="flex justify-between"><span class="text-slate-300 font-bold">LLMs Compactas (3B Q4 Local)</span><span class="ui-mono text-emerald-400 font-bold">${simA.aiTokS} tok/s</span></div>
        <div class="text-slate-400">${spA.ram_gb >= 12 ? 'Roda modelos locais / Gemini Nano com folga na RAM.' : (spA.ram_gb >= 8 ? 'Adequado para recursos NPU nativos (resumo, áudio).' : 'RAM limita modelos locais; depende de nuvem.')}</div>
      </div>
      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
        <div class="flex justify-between"><span class="text-slate-300 font-bold">Edição 4K60 HDR / CapCut</span><span class="ui-mono text-sky-300 font-bold">${simA.capCut4kMult}x real</span></div>
        <div class="text-slate-400">Exportação rápida de Reels/Shorts com estabilização ${spA.cam_ois ? 'OIS óptica' : 'EIS eletrônica'}.</div>
      </div>
      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
        <div class="flex justify-between"><span class="text-slate-300 font-bold">Zoom & Fotos Noturnas</span><span class="ui-mono text-purple-300 font-bold">${spA.cam_zoom_optical ? spA.cam_zoom_optical + 'x Óptico' : 'Crop 2x'} • ${spA.cam_main_mp}MP</span></div>
        <div class="text-slate-400">Vídeo máx.: ${_escSpHtml(spA.cam_video_max || '4K')} • Frontal ${spA.cam_front_mp}MP</div>
      </div>
    `;
  }

  const sList = document.getElementById('sim-phone-soft-list');
  if (sList) {
    sList.innerHTML = `
      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
        <div class="flex justify-between"><span class="text-slate-300 font-bold">Autonomia Estimada (SOT)</span><span class="ui-mono text-emerald-400 font-bold">${simA.simSotHours} horas</span></div>
        <div class="text-slate-400">${simA.simSotHours >= 7.5 ? 'Agüenta o dia inteiro fora da tomada mesmo com uso intenso.' : 'Recomenda carga rápida no fim da tarde em uso pesado.'}</div>
      </div>
      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
        <div class="flex justify-between"><span class="text-slate-300 font-bold">Tempo de Recarga (0 → 100%)</span><span class="ui-mono text-amber-300 font-bold">~${spA.charge_0_100_min} min (${spA.charge_w}W)</span></div>
        <div class="text-slate-400">0→50% em aproximadamente ${Math.max(12, Math.round(spA.charge_0_100_min * 0.42))} min.</div>
      </div>
      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
        <div class="flex justify-between"><span class="text-slate-300 font-bold">Garantia de Updates OS</span><span class="ui-mono text-sky-300 font-bold">${spA.os_updates_years} anos (~${2026 + spA.os_updates_years})</span></div>
        <div class="text-slate-400">Sistema atual: ${_escSpHtml(spA.os)} • NFC ${spA.has_nfc ? '✓' : '✗'} • eSIM ${spA.has_esim ? '✓' : '✗'}</div>
      </div>
    `;
  }
}

// ============================================================================
// SECTION H: CONFIG REFERENCE SMARTPHONE SECTION
// ============================================================================
function onCfgSmartphoneSelect(slug) {
  const st = _ensureSpState();
  st.smartphoneBuilder.refSlug = slug;
  st.smartphoneCbRelBaseSlug = slug;
  if (typeof saveUserPrefs === 'function') saveUserPrefs();
  renderConfigSmartphoneSection();
}

function renderConfigSmartphoneSection() {
  const container = document.getElementById('cfg-ref-smartphone-container');
  const pool = getSmartphonePool();
  if (!container) return;
  if (!pool.length) {
    container.innerHTML = '<div class="text-xs text-slate-400">Nenhum smartphone carregado na base atual.</div>';
    return;
  }
  const st = _ensureSpState();
  enrichSmartphonesWithContextualMetrics();
  const refSlug = st.smartphoneBuilder.refSlug || st.smartphoneCbRelBaseSlug || pool[0].slug;
  const sp = findSmartphoneBySlug(refSlug) || pool[0];
  st.smartphoneBuilder.refSlug = sp.slug;

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
      <div class="md:col-span-7 space-y-2">
        <label for="cfg-ref-smartphone-select" class="ui-label block">Seu Smartphone Atual (Referência para Comparativos)</label>
        <select id="cfg-ref-smartphone-select" onchange="onCfgSmartphoneSelect(this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white">
          ${_buildGroupedSmartphoneOptionsHTML(pool, sp.slug)}
        </select>
      </div>
      <div class="md:col-span-5 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
        <div class="flex justify-between"><span class="text-slate-400">SoC / Memória:</span><span class="ui-mono text-white">${_escSpHtml(sp.soc_name)} • ${sp.ram_gb}GB/${_fmtSpCap(sp.storage_gb)}</span></div>
        <div class="flex justify-between"><span class="text-slate-400">Score Contextual:</span><span class="ui-mono font-bold text-sky-300">${sp._overallVersusScore}/100 (C/B ${sp._myCBScore})</span></div>
      </div>
    </div>
  `;
}

// Expose globals
window.getSmartphonePool = getSmartphonePool;
window.findSmartphoneBySlug = findSmartphoneBySlug;
window.shortSmartphoneName = shortSmartphoneName;
window.enrichSmartphonesWithContextualMetrics = enrichSmartphonesWithContextualMetrics;
window.evaluateSmartphoneRelationalUpgrade = evaluateSmartphoneRelationalUpgrade;
window.populateSmartphoneSelectors = populateSmartphoneSelectors;
window.onSmartphoneDuelSelectionChange = onSmartphoneDuelSelectionChange;
window.swapSmartphoneDuelPair = swapSmartphoneDuelPair;
window.resetSmartphoneDuelPricesToLive = resetSmartphoneDuelPricesToLive;
window.applySmartphoneDuelPreset = applySmartphoneDuelPreset;
window.renderSmartphoneDuelAnalysis = renderSmartphoneDuelAnalysis;
window.setSmartphoneCBSort = setSmartphoneCBSort;
window.setSmartphoneCBChartMetric = setSmartphoneCBChartMetric;
window.renderSmartphoneCBTable = renderSmartphoneCBTable;
window.sendSmartphoneToDuel = sendSmartphoneToDuel;
window.sendSmartphoneToSimulator = sendSmartphoneToSimulator;
window.openSmartphonePromoForSlug = openSmartphonePromoForSlug;
window.pickSmartphoneForObjective = pickSmartphoneForObjective;
window.onSmartphoneBuilderSelect = onSmartphoneBuilderSelect;
window.updateSmartphoneBuilderField = updateSmartphoneBuilderField;
window.renderSmartphoneBuilder = renderSmartphoneBuilder;
window.renderSmartphoneUpgrades = renderSmartphoneUpgrades;
window.setSmartphoneSimQuality = setSmartphoneSimQuality;
window.swapSimulatorSmartphones = swapSimulatorSmartphones;
window.renderSmartphoneSimulator = renderSmartphoneSimulator;
window.renderConfigSmartphoneSection = renderConfigSmartphoneSection;
window.onCfgSmartphoneSelect = onCfgSmartphoneSelect;
