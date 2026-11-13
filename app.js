/**
 * GPU & Build Analyzer Pro — Frontend Engine
 * Integrates live hardware database, 180-day price history & Target Price,
 * Contextual Custo-Benefício (Gaming / AI with Hefty VRAM weight / Software),
 * Relational Upgrade Calculator (e.g. RTX 5070 vs RTX 5060),
 * Editable PC Builder with Power (Watts) Consistency, and FPS/LLM/Software Simulator.
 */

let DB = {
  gpus: [],
  cpus: [],
  rams: [],
  motherboards: [],
  psus: []
};
window.DB = DB;

// User Context Weights
let STATE = {
  activeTab: 'versus',
  wGaming: 25,
  wAI: 45,
  wSoft: 30,
  vramHeft: 1.6, // 1.0 = Light (8B), 1.6 = Medium/Heavy (14B + AI Training + Eth), 2.3 = Extreme (14B-32B + Heavy CUDA)
  duelBaseSlug: 'rtx-5060',
  duelCandSlug: 'rtx-5070',
  cbSortBy: 'my_cb',
  cbSortAsc: false,
  cbRelBaseSlug: 'rtx-5060',
  comparisonScaleMode: 'relative', // 'relative' (vs Placa Base) ou 'absolute' (0 a 100% do Topo RTX 5090)
  cbChartMetric: 'benefit', // 'benefit' = Preço vs Custo-Benefício (Índice), 'benchmark' = Preço vs Raw Score
  cbColumns: {
    vram: true,
    target: true,
    trend: false,       // Default hidden to keep table clean
    hb_cb: false,       // Default hidden to keep table clean
    rel_verdict: true,
    actions: true
  },
  monitorRes: '2560x1440',
  monitorMaxFps: 144,
  bfRanges: {},

  // Multi-Source Database State
  activeSource: 'hardware_barato',

  // Regional Market & Monetary Configuration
  market: {
    region_id: 'br',
    region_name: 'Brasil',
    country_code: 'BR',
    flag_emoji: '🇧🇷',
    monetary: {
      currency_code: 'BRL',
      currency_symbol: 'R$',
      symbol_position: 'prefix',
      locale: 'pt-BR',
      decimal_separator: ',',
      thousands_separator: '.',
      decimal_digits: 2,
      price_regex: "R\\$\\s*([0-9]{1,3}(?:\\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]{3,5}(?:,[0-9]{1,2})?)",
      min_valid_hardware_price: 80,
      max_valid_hardware_price: 45000,
      vram_step_bonus_factor: 240
    },
    promotion_sources: { enabled: true, channels: [] },
    stores: []
  },
  availableRegions: [],

  // 1. User Reference PC (Meu PC de Referência - configured in Tab 7 / Configurações)
  refPC: {
    cpu: { slug: 'ryzen-5-5600', name: 'AMD Ryzen 5 5600 (6C/12T)', tdp: 65, price: 650, owned: true, benchmark: 6500, socket: 'AM4' },
    gpu: { slug: 'rtx-3060-12gb', name: 'RTX 3060 12GB', tdp: 170, price: 2199.99, owned: true },
    mobo: { slug: 'b550m', name: 'Placa-Mãe B550M (AM4)', tdp: 35, price: 480, owned: true, socket: 'AM4', memory_type: 'DDR4' },
    ram: { slug: 'ddr4-16gb-3200', name: '16 GB DDR4 3200 MT/s', tdp: 10, price: 240, owned: true, capacity_gb: 16, memory_type: 'DDR4' },
    storage: { name: 'SSD NVMe M.2 1TB', tdp: 10, price: 380, owned: true },
    cooling: { name: 'Cooler CPU + Fans', tdp: 15, price: 120, owned: true },
    psu: { slug: 'fonte-600w', name: 'Fonte 600W 80 Plus Bronze', watts: 600, price: 320, owned: true }
  },

  // 2. Target Shopping Build (Objetivo de Compra & Montagem - manipulated in Tab 3)
  build: {
    cpu: { slug: 'ryzen-5-5600', name: 'AMD Ryzen 5 5600 (6C/12T)', tdp: 65, price: 650, owned: true, benchmark: 6500, socket: 'AM4' },
    gpu: { slug: 'rtx-3060-12gb', name: 'RTX 3060 12GB', tdp: 170, price: 2199.99, owned: true },
    mobo: { slug: 'b550m', name: 'Placa-Mãe B550M (AM4)', tdp: 35, price: 480, owned: true, socket: 'AM4', memory_type: 'DDR4' },
    ram: { slug: 'ddr4-16gb-3200', name: '16 GB DDR4 3200 MT/s', tdp: 10, price: 240, owned: true, capacity_gb: 16, memory_type: 'DDR4' },
    storage: { name: 'SSD NVMe M.2 1TB', tdp: 10, price: 380, owned: true },
    cooling: { name: 'Cooler CPU + Fans', tdp: 15, price: 120, owned: true },
    psu: { slug: 'fonte-600w', name: 'Fonte 600W 80 Plus Bronze', watts: 600, price: 320, owned: true }
  }
};

function saveUserRefPrefs() {
  try {
    localStorage.setItem('user_reference_pc', JSON.stringify(STATE.refPC));
  } catch (e) {}
}

function loadUserRefPrefs() {
  try {
    const saved = localStorage.getItem('user_reference_pc') || localStorage.getItem('user_pc_setup');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        if (parsed.cpu) STATE.refPC.cpu = Object.assign({}, STATE.refPC.cpu, parsed.cpu);
        if (parsed.gpu) STATE.refPC.gpu = Object.assign({}, STATE.refPC.gpu, parsed.gpu);
        if (parsed.mobo) STATE.refPC.mobo = Object.assign({}, STATE.refPC.mobo, parsed.mobo);
        if (parsed.ram) STATE.refPC.ram = Object.assign({}, STATE.refPC.ram, parsed.ram);
        if (parsed.storage) STATE.refPC.storage = Object.assign({}, STATE.refPC.storage, parsed.storage);
        if (parsed.cooling) STATE.refPC.cooling = Object.assign({}, STATE.refPC.cooling, parsed.cooling);
        if (parsed.psu) STATE.refPC.psu = Object.assign({}, STATE.refPC.psu, parsed.psu);
      }
    }
  } catch (e) {}
}
loadUserRefPrefs();

function saveUserBuildPrefs() {
  try {
    localStorage.setItem('user_target_build', JSON.stringify(STATE.build));
  } catch (e) {}
}

function loadUserBuildPrefs() {
  try {
    const saved = localStorage.getItem('user_target_build') || localStorage.getItem('user_pc_build');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        if (parsed.cpu) STATE.build.cpu = Object.assign({}, STATE.build.cpu, parsed.cpu);
        if (parsed.gpu) STATE.build.gpu = Object.assign({}, STATE.build.gpu, parsed.gpu);
        if (parsed.mobo) STATE.build.mobo = Object.assign({}, STATE.build.mobo, parsed.mobo);
        if (parsed.ram) STATE.build.ram = Object.assign({}, STATE.build.ram, parsed.ram);
        if (parsed.storage) STATE.build.storage = Object.assign({}, STATE.build.storage, parsed.storage);
        if (parsed.cooling) STATE.build.cooling = Object.assign({}, STATE.build.cooling, parsed.cooling);
        if (parsed.psu) STATE.build.psu = Object.assign({}, STATE.build.psu, parsed.psu);
      }
    }
  } catch (e) {}
}
loadUserBuildPrefs();

function copyRefPCToTargetBuild() {
  STATE.build = JSON.parse(JSON.stringify(STATE.refPC));
  saveUserBuildPrefs();
  renderPCBuilder();
  if (typeof showToast === 'function') {
    showToast('Configuração do Meu PC de Referência copiada para Objetivo de Compra!');
  }
}
window.copyRefPCToTargetBuild = copyRefPCToTargetBuild;

function clearTargetBuild() {
  STATE.build = {
    cpu: { slug: '', name: '', tdp: 0, price: 0, owned: false, benchmark: 0, socket: '' },
    gpu: { slug: '', name: '', tdp: 0, price: 0, owned: false },
    mobo: { slug: '', name: '', tdp: 0, price: 0, owned: false, socket: '', memory_type: '' },
    ram: { slug: '', name: '', tdp: 0, price: 0, owned: false, capacity_gb: 0, memory_type: 'DDR4' },
    storage: { name: '', tdp: 0, price: 0, owned: false },
    cooling: { name: '', tdp: 0, price: 0, owned: false },
    psu: { slug: '', name: '', watts: 0, price: 0, owned: false }
  };
  saveUserBuildPrefs();
  renderPCBuilder();
  if (typeof showToast === 'function') {
    showToast('Objetivo de Compra limpo! Pronto para planejar do zero.');
  }
}
window.clearTargetBuild = clearTargetBuild;

function getFilteredMoboAndRamOptions(selectedCpuSlug, currentMoboSlug, currentRamSlug) {
  const db = window.DB || DB;
  const cpus = db.cpus || [];
  const mobos = db.motherboards || [];
  const rams = db.rams || [];

  const cpu = cpus.find(c => c.slug === selectedCpuSlug) || null;
  const cpuSocket = cpu ? ((cpu.socket || (typeof getCpuSocket === 'function' ? getCpuSocket(cpu) : '')).toUpperCase().trim()) : '';

  let filteredMobos = mobos;
  if (cpuSocket) {
    const matches = mobos.filter(m => (m.socket || '').toUpperCase().trim() === cpuSocket);
    if (matches.length > 0) {
      filteredMobos = matches;
    }
  }

  const activeMobo = filteredMobos.find(m => m.slug === currentMoboSlug) || null;

  let targetRamType = '';
  if (cpuSocket === 'AM4' || cpuSocket === 'LGA2011-3') {
    targetRamType = 'DDR4';
  } else if (cpuSocket === 'AM5' || cpuSocket === 'LGA1851') {
    targetRamType = 'DDR5';
  } else if (cpuSocket === 'LGA1700') {
    if (activeMobo && activeMobo.memory_type) {
      targetRamType = activeMobo.memory_type.toUpperCase();
    }
  }

  let filteredRams = rams;
  if (targetRamType) {
    const memMatches = rams.filter(r => (r.memory_type || '').toUpperCase() === targetRamType);
    if (memMatches.length > 0) {
      filteredRams = memMatches;
    }
  }

  return {
    cpu,
    cpuSocket,
    filteredMobos,
    targetRamType,
    filteredRams,
    activeMobo
  };
}
window.getFilteredMoboAndRamOptions = getFilteredMoboAndRamOptions;

// 1. Sub-score extremes (Decoupled from maxComp to prevent circular recursion)
function getSubScoreExtremes() {
  if (!window.DB || !DB.gpus || DB.gpus.length === 0) {
    return { topGpu: null, maxGaming: 14411, maxAI: 21507, maxSoft: 28000, maxPrice: 30450, max14bToks: 175 };
  }
  const topGpu = DB.gpus.reduce((best, g) => ((g.gaming_score || 0) > (best.gaming_score || 0) ? g : best), DB.gpus[0]);
  const maxGaming = Math.max(...DB.gpus.map(g => (typeof getEffectiveGamingScore === 'function' ? getEffectiveGamingScore(g, true) : (g.gaming_score || 0))));
  const maxAI = Math.max(...DB.gpus.map(g => getEffectiveAIScore(g)));
  const maxSoft = Math.max(...DB.gpus.map(g => getEffectiveEngineeringScore(g)));
  const maxPrice = Math.max(...DB.gpus.map(g => (g.price_brl || 0)));
  const max14bToks = Math.max(...DB.gpus.map(g => (g.llm_14b_tok_s || 5)));

  return {
    topGpu,
    maxGaming: Math.max(1000, maxGaming),
    maxAI: Math.max(1000, maxAI),
    maxSoft: Math.max(1000, maxSoft),
    maxPrice: Math.max(5000, maxPrice),
    max14bToks: Math.max(50, max14bToks)
  };
}
window.getSubScoreExtremes = getSubScoreExtremes;

function getCatalogExtremes() {
  const sub = getSubScoreExtremes();
  const maxComp = (!window.DB || !DB.gpus || !DB.gpus.length)
    ? 10000
    : Math.max(...DB.gpus.map(g => getContextualCompositeScore(g)));
  return Object.assign({}, sub, { maxComp: Math.max(1000, maxComp) });
}
window.getCatalogExtremes = getCatalogExtremes;

function checkCpuMoboCompatibility(cpu, mobo) {
  if (!cpu || !cpu.name || !mobo || !mobo.name) {
    return {
      status: 'empty',
      flag: '—',
      label: 'Componente Ausente',
      badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700',
      message: 'Selecione CPU e Placa-mãe para verificar compatibilidade de socket e VRM.'
    };
  }

  const cpuSocket = (typeof getCpuSocket === 'function' ? getCpuSocket(cpu) : (cpu.socket || '')).toUpperCase().trim();
  const moboSocket = (mobo.socket || '').toUpperCase().trim();

  // 1. Socket Compatibility Check
  if (cpuSocket && moboSocket && cpuSocket !== moboSocket && !((cpuSocket === 'AM4' && moboSocket === 'AM4') || (cpuSocket === 'AM5' && moboSocket === 'AM5'))) {
    return {
      status: 'error',
      flag: '!',
      label: 'INCOMPATIBILIDADE DE SOCKET',
      badgeClass: 'bg-rose-500/20 text-rose-300 border border-rose-500/50',
      message: `O processador ${cpu.name} usa socket ${cpuSocket}, mas a placa-mãe ${mobo.name} é ${moboSocket}. Não são compatíveis fisicamente!`
    };
  }

  // 2. VRM & Motherboard Tier Check (flag '!' alert)
  const cpuSlug = (cpu.slug || '').toLowerCase();
  const cpuName = (cpu.name || '').toLowerCase();
  const moboSlug = (mobo.slug || '').toLowerCase();
  const moboName = (mobo.name || '').toLowerCase();
  const tdp = cpu.tdp_w || cpu.tdp || 65;

  const isFlagshipIntel = /14900|13900|14700|13700|12900/.test(cpuSlug) || /i9|i7/i.test(cpuName);
  const isHighTdpIntel = isFlagshipIntel || tdp >= 125 || /core ultra 7|core ultra 9/i.test(cpuName);
  const isEntryIntelMobo = /h610|h510|h410|h810|b760m-k|b760m-e\b/i.test(moboSlug) || /h610|h510|h810/i.test(moboName);

  const isFlagshipAmd = /7950|7900|9950|9900|5950|5900/.test(cpuSlug) || /ryzen 9/i.test(cpuName);
  const isHighTdpAmd = isFlagshipAmd || tdp >= 105 || /7800x3d|9800x3d|7700x|9700x|5800x/i.test(cpuSlug);
  const isEntryAmdMobo = /a620|a520|a320|b840|b450m-hdv/i.test(moboSlug) || /a620|a520|a320|b840/i.test(moboName);

  if ((isHighTdpIntel && isEntryIntelMobo) || (isHighTdpAmd && isEntryAmdMobo)) {
    const isAmd = isHighTdpAmd && isEntryAmdMobo;
    const recTier = isAmd ? 'B650/X670/B850/X870 (AMD) com dissipador robusto nos VRMs' : 'B760/Z790 (Intel LGA1700) ou B860/Z890 (LGA1851) com dissipadores';
    return {
      status: 'warning',
      flag: '!',
      label: 'ALERTA DE VRM & THERMAL THROTTLING',
      badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/50',
      message: `O processador ${cpu.name} (consumo elevado em boost, TDP ${tdp}W+) causará superaquecimento severo nas fases de alimentação da placa de entrada ${mobo.name} (circuito VRM básico sem dissipação robusta), gerando estrangulamento térmico (thermal throttling) e perda de clock. Recomenda-se placa ${recTier}.`
    };
  }

  const isMidHighIntel = /14600|13600|12600/.test(cpuSlug);
  if (isMidHighIntel && isEntryIntelMobo) {
    return {
      status: 'caution',
      flag: '!',
      label: 'AVISO DE VRM',
      badgeClass: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
      message: `O ${cpu.name} atinge até 180W em turbo boost. Uma placa de entrada básica sem dissipador pode limitar o desempenho sustentado em jogos pesados e renderização. Recomenda-se placa B760 com dissipador nos VRMs.`
    };
  }

  return {
    status: 'ok',
    flag: '✓',
    label: 'COMPATÍVEL & VRM ADEQUADO',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
    message: `Socket ${cpuSocket || moboSocket} compatível e dimensionamento de VRM adequado para operação estável.`
  };
}
window.checkCpuMoboCompatibility = checkCpuMoboCompatibility;

function setComparisonScaleMode(mode) {
  STATE.comparisonScaleMode = mode === 'absolute' ? 'absolute' : 'relative';
  if (typeof saveUserPrefs === 'function') saveUserPrefs();
  syncComparisonScaleControls();
  renderActiveTab();
}

function toggleComparisonScaleMode(isAbsolute) {
  setComparisonScaleMode(isAbsolute ? 'absolute' : 'relative');
}

function syncComparisonScaleControls() {
  const isAbs = STATE.comparisonScaleMode === 'absolute';

  // Duel segmented buttons
  const btnRelDuel = document.getElementById('btn-scale-rel-duel');
  const btnAbsDuel = document.getElementById('btn-scale-abs-duel');
  if (btnRelDuel && btnAbsDuel) {
    if (isAbs) {
      btnRelDuel.className = 'px-2.5 py-1 rounded font-bold transition cursor-pointer text-slate-400 hover:text-slate-200';
      btnAbsDuel.className = 'px-2.5 py-1 rounded font-bold transition cursor-pointer bg-amber-400 text-slate-950 shadow-sm';
    } else {
      btnRelDuel.className = 'px-2.5 py-1 rounded font-bold transition cursor-pointer bg-sky-400 text-slate-950 shadow-sm';
      btnAbsDuel.className = 'px-2.5 py-1 rounded font-bold transition cursor-pointer text-slate-400 hover:text-slate-200';
    }
  }

  // Cost-Benefit Table segmented buttons
  const btnRelCB = document.getElementById('btn-scale-rel-cb');
  const btnAbsCB = document.getElementById('btn-scale-abs-cb');
  if (btnRelCB && btnAbsCB) {
    if (isAbs) {
      btnRelCB.className = 'px-2.5 py-1 rounded font-semibold transition cursor-pointer text-slate-400 hover:text-slate-200';
      btnAbsCB.className = 'px-2.5 py-1 rounded font-semibold transition cursor-pointer bg-amber-400 text-slate-950 shadow-sm';
    } else {
      btnRelCB.className = 'px-2.5 py-1 rounded font-semibold transition cursor-pointer bg-sky-400 text-slate-950 shadow-sm';
      btnAbsCB.className = 'px-2.5 py-1 rounded font-semibold transition cursor-pointer text-slate-400 hover:text-slate-200';
    }
  }

  // Config tab buttons
  const btnRelCfg = document.getElementById('btn-scale-rel-cfg');
  const btnAbsCfg = document.getElementById('btn-scale-abs-cfg');
  if (btnRelCfg && btnAbsCfg) {
    if (isAbs) {
      btnRelCfg.className = 'px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer text-slate-400 hover:text-slate-200';
      btnAbsCfg.className = 'px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer bg-amber-400 text-slate-950 shadow-sm';
    } else {
      btnRelCfg.className = 'px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer bg-sky-400 text-slate-950 shadow-sm';
      btnAbsCfg.className = 'px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer text-slate-400 hover:text-slate-200';
    }
  }

  // Fallback for checkboxes & labels
  const chkDuel = document.getElementById('chk-duel-scale-absolute');
  const chkCB = document.getElementById('chk-cb-scale-absolute');
  const lblDuel = document.getElementById('lbl-duel-scale-mode');
  const lblCB = document.getElementById('lbl-cb-scale-mode');
  const lblRadar = document.getElementById('lbl-radar-scale-mode');

  if (chkDuel) chkDuel.checked = isAbs;
  if (chkCB) chkCB.checked = isAbs;

  const text = isAbs ? 'Escala Absoluta (vs Topo RTX 5090)' : 'Escala Relativa (vs Placa Base)';
  if (lblDuel) lblDuel.textContent = text;
  if (lblCB) lblCB.textContent = text;
  if (lblRadar) lblRadar.textContent = isAbs ? 'Escala Absoluta (0 a 100% do Topo do Hardware)' : 'Escala Relativa (vs Placa Base)';
}

let chartDuelHistory = null;
let chartCBScatter = null;
let chartDuelRadar = null;

// Reusable SVG Icons (Feather/Lucide style, crisp & lightweight)
const SPEEDOMETER_SVG = `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l3-3"/><path d="M3.34 17a10 10 0 1 1 17.32 0"/></svg>`;
const MONEY_SVG = `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
const ROBOT_SVG = `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16.01"/><line x1="16" y1="16" x2="16" y2="16.01"/></svg>`;
const CIRCUIT_SVG = `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>`;
const STAR_SVG = `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

const colorMap = {
  emerald: 'bg-emerald-950/50 border-emerald-500/60 text-emerald-200',
  sky:     'bg-sky-950/50 border-sky-500/60 text-sky-200',
  amber:   'bg-amber-950/50 border-amber-500/60 text-amber-200',
  rose:    'bg-rose-950/50 border-rose-500/60 text-rose-200'
};

const badgeMap = {
  emerald: 'bg-emerald-500 text-slate-950',
  sky:     'bg-sky-400 text-slate-950',
  amber:   'bg-amber-400 text-slate-950',
  rose:    'bg-rose-500 text-white'
};

// Render comparative dual-bars where:
// Absolute Mode: Maximum of track (100% width) is ALWAYS the best registered value in catalog (RTX 5090).
// Relative Mode: Base GPU is reference (100%), and Candidate GPU displays proportional difference (+XX% vs Base).
function renderComparisonBarHTML({
  title,
  iconSvg,
  baseVal,
  candVal,
  baseLabel,
  candLabel,
  diffPct,
  isPrice = false,
  maxVal = null,
  baseName = 'Base',
  candName = 'Candidata'
}) {
  const isAbs = STATE.comparisonScaleMode === 'absolute';
  const extremes = typeof getCatalogExtremes === 'function' ? getCatalogExtremes() : null;

  // Relative difference vs Base GPU
  const diff = diffPct != null ? diffPct : (baseVal > 0 ? ((candVal / baseVal) - 1) * 100 : 0);
  const sign = diff > 0 ? '+' : '';
  const diffText = `${sign}${Math.round(diff)}%`;
  const badgeColor = isPrice
    ? (diff <= 0 ? 'text-emerald-300' : 'text-amber-300')
    : (diff >= 0 ? 'text-emerald-300' : 'text-rose-300');

  let baseWidthPct = 50;
  let candWidthPct = 50;
  let baseRightLabel = '';
  let candRightLabel = '';

  if (isAbs) {
    // 1. MODO ABSOLUTO: O teto (100% da barra) é o registro máximo absoluto do catálogo (ex: RTX 5090)
    const ceiling = maxVal && maxVal > 0 ? maxVal : Math.max(baseVal, candVal, 1);
    baseWidthPct = Math.min(100, Math.max(3, (baseVal / ceiling) * 100));
    candWidthPct = Math.min(100, Math.max(3, (candVal / ceiling) * 100));

    baseRightLabel = `${baseWidthPct.toFixed(0)}% do Topo`;
    candRightLabel = `${candWidthPct.toFixed(0)}% do Topo (${diffText} vs Base)`;
  } else {
    // 2. MODO RELATIVO: Ancorado na placa base como referência direta (100% de si)
    const headToHeadMax = Math.max(baseVal, candVal, 1);
    baseWidthPct = Math.min(100, Math.max(4, (baseVal / headToHeadMax) * 100));
    candWidthPct = Math.min(100, Math.max(4, (candVal / headToHeadMax) * 100));

    baseRightLabel = '100% (Base)';
    candRightLabel = Math.abs(diff) < 0.5 ? '100% (Igual)' : `${diffText} vs Base`;
  }

  const baseBarColor = 'bg-emerald-500';
  const candBarColor = isPrice
    ? (diff <= 0 ? 'bg-emerald-400' : 'bg-amber-400')
    : (diff >= 0 ? 'bg-sky-400' : 'bg-rose-400');

  return `
    <div class="space-y-1.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-1.5 text-slate-300 font-medium">
          ${iconSvg}
          <span class="font-bold">${title}</span>
        </div>
        <div class="flex items-center gap-2 font-mono text-[11px]">
          <span class="text-emerald-400 font-semibold">${baseLabel != null ? baseLabel : baseVal}</span>
          <span class="text-slate-600">vs</span>
          <span class="font-bold ${badgeColor}">${candLabel != null ? candLabel : candVal} <span class="text-[10px] opacity-80">(${diffText})</span></span>
        </div>
      </div>

      <div class="space-y-1 pt-0.5">
        <!-- Barra 1: Placa Base -->
        <div class="flex items-center gap-2 text-[10px] font-mono">
          <span class="w-16 truncate text-slate-400 shrink-0 text-right" title="${baseName}">${baseName}</span>
          <div class="h-2 flex-1 bg-slate-900 rounded-full relative overflow-hidden border border-slate-800/80" title="${baseName}: ${baseLabel != null ? baseLabel : baseVal} (${baseWidthPct.toFixed(0)}%)">
            <div class="h-full rounded-full transition-all duration-300 ${baseBarColor}" style="width: ${baseWidthPct.toFixed(1)}%;"></div>
          </div>
          <span class="w-28 text-right text-emerald-400 font-bold shrink-0">${baseRightLabel}</span>
        </div>

        <!-- Barra 2: Candidata -->
        <div class="flex items-center gap-2 text-[10px] font-mono">
          <span class="w-16 truncate text-sky-300 font-bold shrink-0 text-right" title="${candName}">${candName}</span>
          <div class="h-2 flex-1 bg-slate-900 rounded-full relative overflow-hidden border border-slate-800/80" title="${candName}: ${candLabel != null ? candLabel : candVal} (${candWidthPct.toFixed(0)}%)">
            <div class="absolute top-0 bottom-0 w-0.5 bg-emerald-500/70 z-20 pointer-events-none" style="left: ${baseWidthPct.toFixed(1)}%;" title="Ponto da Placa Base (${baseName})"></div>
            <div class="h-full rounded-full transition-all duration-300 ${candBarColor}" style="width: ${candWidthPct.toFixed(1)}%;"></div>
          </div>
          <span class="w-28 text-right font-bold ${badgeColor} shrink-0">${candRightLabel}</span>
        </div>
      </div>
    </div>
  `;
}

// Format currency dynamically based on active market configuration
function formatMoney(val, opts = {}) {
  const sym = STATE.market?.monetary?.currency_symbol || 'R$';
  if (val === null || val === undefined || isNaN(val)) return `${sym} --`;
  const loc = STATE.market?.monetary?.locale || 'pt-BR';
  const curr = STATE.market?.monetary?.currency_code || 'BRL';
  const digits = opts.decimals !== undefined ? opts.decimals : (STATE.market?.monetary?.decimal_digits ?? 2);
  const pos = STATE.market?.monetary?.symbol_position || 'prefix';
  try {
    return Number(val).toLocaleString(loc, {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  } catch (_) {
    const formatted = Number(val).toFixed(digits);
    return pos === 'prefix' ? `${sym} ${formatted}` : `${formatted} ${sym}`;
  }
}

function formatMoneyShort(val) {
  const sym = STATE.market?.monetary?.currency_symbol || 'R$';
  if (val === null || val === undefined || isNaN(val)) return `${sym} --`;
  const loc = STATE.market?.monetary?.locale || 'pt-BR';
  const curr = STATE.market?.monetary?.currency_code || 'BRL';
  const pos = STATE.market?.monetary?.symbol_position || 'prefix';
  const sign = val < 0 ? '-' : '';
  const absVal = Math.round(Math.abs(val));
  try {
    return (val < 0 ? '-' : '') + absVal.toLocaleString(loc, {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  } catch (_) {
    const formatted = absVal.toLocaleString(loc);
    return pos === 'prefix' ? `${sign}${sym} ${formatted}` : `${sign}${formatted} ${sym}`;
  }
}

// Backward-compatible aliases for all views and features
const fmtBRL = formatMoney;
const fmtBRLShort = formatMoneyShort;
window.fmtBRL = formatMoney;
window.fmtBRLShort = formatMoneyShort;
window.formatMoney = formatMoney;
window.formatMoneyShort = formatMoneyShort;

// Helper to detect if user platform is PCIe 3.0 (Argon Item 7)
function isPlatformPCIe3(cpu, mobo) {
  const cName = (cpu?.name || cpu?.slug || '').toLowerCase();
  const mName = (mobo?.name || mobo?.slug || '').toLowerCase();
  const socket = (cpu?.socket || mobo?.socket || '').toUpperCase();
  if (socket.includes('2011') || socket.includes('1151') || socket.includes('1150') || socket.includes('1155')) return true;
  if (/x99|x79|a320|a520|b450|h310|h410|b360|b365|h510/.test(mName)) return true;
  if (/xeon|5500|4600g|5600g|5700g|3200g|3400g|i7-7|i7-6|i5-7|i5-6|i3-7|i3-6|i7-4|i5-4/.test(cName)) return true;
  return false;
}
window.isPlatformPCIe3 = isPlatformPCIe3;

// 2. Continuous Sigmoid VRAM Fit for Local AI Inference (No arbitrary step cliffs - Argon Drop-in)
function getEffectiveAIScore(gpu) {
  const vram = gpu.vram_gb || 8;
  const bw = gpu.bandwidth_gbs || 256;
  const tok8 = gpu.llm_8b_tok_s || 20;
  const tok14 = gpu.llm_14b_tok_s || 5;
  const tok32 = gpu.llm_32b_tok_s || 0;
  const fp16 = gpu.fp16_tflops || 20;
  const heft = parseFloat(STATE.vramHeft) || 1.6;
  const isNvidia = gpu.brand === 'NVIDIA';

  // Continuous logistic curve: 1 / (1 + e^(-k * (vram - threshold)))
  const sigmoid = (x, mid, k = 0.65) => 1 / (1 + Math.exp(-k * (x - mid)));

  let infPoints = 0;
  if (heft <= 1.1) {
    // 8B Q4 (~5.5GB) focus: smooth transition centered at 7.5GB
    const fitMult = 0.70 + 0.30 * sigmoid(vram, 7.5, 0.8);
    infPoints = ((tok8 * 35) + (tok14 * 18) + (bw * 1.4)) * fitMult;
  } else if (heft <= 1.8) {
    // 14B Q4 (~9.2GB + KV cache) focus: smooth transition centered at 11.5GB
    const fitMult = 0.65 + 0.45 * sigmoid(vram, 11.5, 0.65);
    infPoints = ((tok8 * 14) + (tok14 * 55) + (tok32 * 35) + (bw * 1.8) + (fp16 * 8)) * fitMult;
  } else {
    // 14B-32B Q4 (~19GB) focus: smooth transition centered at 15.5GB
    const fitMult = 0.55 + 0.60 * sigmoid(vram, 15.5, 0.50);
    infPoints = ((tok8 * 8) + (tok14 * 60) + (tok32 * 85) + (bw * 2.2) + (fp16 * 11)) * fitMult;
  }

  // Moderated ecosystem multiplier (avoids double-counting CUDA since tok_s already reflects backend speed)
  const ecoMult = isNvidia ? 1.10 : (gpu.brand === 'Intel' ? 0.94 : 0.90);
  return Math.max(250, Math.round(infPoints * ecoMult));
}
window.getEffectiveAIScore = getEffectiveAIScore;

// 3. Engineering / AI Training / OpenDSS Score with Continuous VRAM Scaling (Argon Drop-in)
function getEffectiveEngineeringScore(gpu) {
  const vram = gpu.vram_gb || 8;
  const bw = gpu.bandwidth_gbs || 256;
  const fp16 = gpu.fp16_tflops || 20;
  const bench = gpu.gaming_score || 1500;
  const heft = parseFloat(STATE.vramHeft) || 1.6;

  const isNvidia = gpu.brand === 'NVIDIA';
  const hasTensorCores = isNvidia && (gpu.arch && /Blackwell|Ada|Ampere|Turing/i.test(gpu.arch));
  const cudaEcoMult = isNvidia ? (hasTensorCores ? (heft >= 1.5 ? 1.32 : 1.22) : 1.10) : (gpu.brand === 'Intel' ? 0.88 : 0.76);

  // Smooth VRAM capacity scaling for batch-size & sparse solver headroom
  const vramScale = 0.75 + 0.40 * (1 / (1 + Math.exp(-0.55 * (vram - 11.5))));
  const rawEng = ((bench * 0.40) + (bw * 2.8) + (fp16 * 19) + (vram * 110)) * vramScale;
  return Math.max(200, Math.round(rawEng * cudaEcoMult));
}
window.getEffectiveEngineeringScore = getEffectiveEngineeringScore;

// 4. Scale-Normalized Composite Score (1% slider weight = exactly 1% influence - Argon Drop-in)
function getContextualCompositeScore(gpu, customWeights = null) {
  const sub = getSubScoreExtremes();
  const wg = customWeights ? customWeights.wGaming : STATE.wGaming;
  const wa = customWeights ? customWeights.wAI : STATE.wAI;
  const ws = customWeights ? customWeights.wSoft : STATE.wSoft;
  const totalW = Math.max(1, wg + wa + ws);

  const gNorm = wg / totalW;
  const aNorm = wa / totalW;
  const sNorm = ws / totalW;

  // Each pillar is normalized to a 0-10,000 scale against the catalog leader
  const gamingRaw = (typeof getEffectiveGamingScore === 'function') ? getEffectiveGamingScore(gpu, true) : (gpu.gaming_score || 1500);
  const gamingScaled = (gamingRaw / sub.maxGaming) * 10000;
  const aiScaled = (getEffectiveAIScore(gpu) / sub.maxAI) * 10000;
  const engScaled = (getEffectiveEngineeringScore(gpu) / sub.maxSoft) * 10000;

  return Math.round(gNorm * gamingScaled + aNorm * aiScaled + sNorm * engScaled);
}
window.getContextualCompositeScore = getContextualCompositeScore;

// 5. Linear Cost-Benefit + Forced PSU Upgrade Cost + Pareto Dominance Penalty (Argon Drop-in)
function getForcedPsuUpgradeCost(gpu) {
  if (!STATE.refPC || !STATE.refPC.psu || !STATE.refPC.psu.owned) return 0;
  const userPsuWatts = STATE.refPC.psu.watts || 600;
  const cpuTdp = (STATE.refPC.cpu && STATE.refPC.cpu.tdp) || 65;
  const restTdp = 60; // mobo + ram + ssd + fans
  const typicalLoad = (gpu.tdp_w || 150) + cpuTdp + restTdp;
  const peakTransient = Math.round(typicalLoad * 1.18);

  if (userPsuWatts >= peakTransient) return 0; // Current PSU handles it safely

  const recWatts = Math.ceil((typicalLoad * 1.35) / 50) * 50;
  const validPsus = (DB.psus || []).filter(p => p.watts >= recWatts && p.price_brl > 150);
  if (!validPsus.length) return 380; // Fallback estimate
  return Math.min(...validPsus.map(p => p.price_brl));
}
window.getForcedPsuUpgradeCost = getForcedPsuUpgradeCost;

function enrichGPUsWithContextualMetrics() {
  if (!DB.gpus || !DB.gpus.length) return;

  // Step 1: Compute Composite Score and Effective Price
  DB.gpus.forEach(g => {
    const comp = getContextualCompositeScore(g);
    g._compositeScore = Math.round(comp);
    g._effectiveAI = getEffectiveAIScore(g);
    g._psuUpgradeCost = getForcedPsuUpgradeCost(g);
    const basePrice = g._customPrice || g.price_brl || 99999;
    g._effectiveUpgradePrice = basePrice + g._psuUpgradeCost;
  });

  // Step 2: Detect Market-Dominated Cards (Pareto Frontier Check)
  let maxRawRatio = 0;
  DB.gpus.forEach(g => {
    const price = g._effectiveUpgradePrice || g.price_brl || 99999;
    let paretoPenalty = 1.0;
    let dominatedBy = null;

    // Is there another GPU that is cheaper (or within +3% price) AND significantly faster (>+8% composite score)?
    DB.gpus.forEach(other => {
      if (other.slug === g.slug || other.slug === 'rx-580-8gb-ref') return;
      const otherPrice = other._effectiveUpgradePrice || other._customPrice || other.price_brl || 99999;
      if (otherPrice <= price * 1.03 && other._compositeScore > g._compositeScore * 1.08 && (other.vram_gb || 8) >= (g.vram_gb || 8)) {
        const ratio = g._compositeScore / Math.max(1, other._compositeScore);
        if (ratio < paretoPenalty) {
          paretoPenalty = ratio;
          dominatedBy = other.name;
        }
      }
    });

    g._dominatedBy = dominatedBy;
    g._paretoPenalty = paretoPenalty;
    // Strictly linear price division (no 0.92 exponent bias) + Pareto penalty
    const rawRatio = (g._compositeScore / Math.max(1, price)) * Math.pow(paretoPenalty, 0.85);
    g._rawCBRatio = rawRatio;

    if (g.slug !== 'rx-580-8gb-ref' && rawRatio > maxRawRatio) {
      maxRawRatio = rawRatio;
    }
  });

  DB.gpus.forEach(g => {
    g._myCBScore = maxRawRatio > 0 ? Math.min(100, Math.round((g._rawCBRatio / maxRawRatio) * 100)) : 50;
  });
}
window.enrichGPUsWithContextualMetrics = enrichGPUsWithContextualMetrics;

// 6. Clean Relational Upgrade Evaluator (No triple-counted VRAM, strict linear parity - Argon Drop-in)
function evaluateRelationalUpgrade(baseGpu, candGpu, basePrice, candPrice) {
  const baseComp = getContextualCompositeScore(baseGpu);
  const candComp = getContextualCompositeScore(candGpu);
  const perfRatio = candComp / Math.max(1, baseComp);
  const perfGainPct = (perfRatio - 1) * 100;

  const gScore = g => (typeof getEffectiveGamingScore === 'function') ? getEffectiveGamingScore(g, true) : (g.gaming_score || 1);
  const gamingGainPct = ((gScore(candGpu) / Math.max(1, gScore(baseGpu))) - 1) * 100;
  const aiGainPct = ((getEffectiveAIScore(candGpu) / Math.max(1, getEffectiveAIScore(baseGpu))) - 1) * 100;
  const softGainPct = ((getEffectiveEngineeringScore(candGpu) / Math.max(1, getEffectiveEngineeringScore(baseGpu))) - 1) * 100;
  const vramDiff = (candGpu.vram_gb || 8) - (baseGpu.vram_gb || 8);

  const netPsuDelta = (candGpu._psuUpgradeCost || 0) - (baseGpu._psuUpgradeCost || 0);
  const actualDelta = (candPrice - basePrice) + netPsuDelta;

  // 1:1 Linear Parity is the true mathematical ceiling of a "Fair" upgrade
  const linearParityDelta = basePrice * (perfRatio - 1);
  const fairMaxDelta = Math.round(Math.max(0, linearParityDelta));
  const stealDelta = Math.round(fairMaxDelta * 0.72);       // Gain performance at <=72% of linear cost
  const stretchMaxDelta = Math.round(fairMaxDelta * 1.22);  // Max 22% enthusiast premium over linear parity

  let tier = 'bad';
  let label = 'CILADA / NÃO COMPENSA HOJE';
  let color = 'rose';
  let summary = '';

  if (perfGainPct <= 0) {
    // For a weaker card to be an "ECONOMIA REAL", the discount must be at least 1.25x the % performance lost
    const requiredSavings = Math.abs(linearParityDelta) * 1.25;
    if (actualDelta < 0 && Math.abs(actualDelta) >= requiredSavings && vramDiff >= 0) {
      tier = 'fair';
      label = 'ECONOMIA PROPORCIONAL';
      color = 'sky';
      summary = `A ${candGpu.name} entrega ${perfGainPct.toFixed(1)}% do desempenho relativo, mas economiza ${fmtBRLShort(Math.abs(actualDelta))} (desconto maior que a perda de performance).`;
    } else {
      tier = 'bad';
      label = 'DESEMPENHO MENOR';
      color = 'rose';
      summary = `A ${candGpu.name} tem desempenho contextual menor (${perfGainPct.toFixed(1)}%) para o seu perfil.`;
    }
  } else {
    const domWarn = candGpu._dominatedBy ? ` (Atenção: superada no mercado pela ${candGpu._dominatedBy} na mesma faixa!)` : '';
    if (actualDelta <= stealDelta && !candGpu._dominatedBy) {
      tier = 'steal';
      label = 'PECHINCHA (COMPRA RECOMENDADA)';
      color = 'emerald';
      const psuNote = netPsuDelta > 0 ? ` (inclui +${fmtBRLShort(netPsuDelta)} de fonte obrigatória)` : (netPsuDelta < 0 ? ` (economiza ${fmtBRLShort(Math.abs(netPsuDelta))} de fonte)` : '');
      const genNote = (candGpu.arch === 'Blackwell' && baseGpu.arch === 'Ampere') ? ' • Salto geracional (DLSS 4 MFG 4× vs Ampere puro).' : '';
      summary = `Diferença de ${fmtBRLShort(actualDelta)}${psuNote} para salto de +${perfGainPct.toFixed(1)}% no desempenho (+${gamingGainPct.toFixed(0)}% Jogos, +${aiGainPct.toFixed(0)}% IA). Eficiência superior à placa base!${genNote}`;
    } else if (actualDelta <= fairMaxDelta && !candGpu._dominatedBy) {
      tier = 'fair';
      label = 'PREÇO JUSTO (UPGRADE VÁLIDO)';
      color = 'sky';
      const psuNote = netPsuDelta > 0 ? ` (inclui +${fmtBRLShort(netPsuDelta)} de fonte obrigatória)` : (netPsuDelta < 0 ? ` (economiza ${fmtBRLShort(Math.abs(netPsuDelta))} de fonte)` : '');
      const genNote = (candGpu.arch === 'Blackwell' && baseGpu.arch === 'Ampere') ? ' • Arquitetura Blackwell com DLSS 4 MFG 4× e menor consumo térmico.' : '';
      summary = `Diferença de ${fmtBRLShort(actualDelta)}${psuNote} dentro da paridade justa de até +${fmtBRLShort(fairMaxDelta)} pelo ganho de +${perfGainPct.toFixed(1)}% (${vramDiff >= 0 ? '+' : ''}${vramDiff}GB VRAM).${genNote}`;
    } else if (actualDelta <= stretchMaxDelta) {
      tier = 'stretch';
      label = candGpu._dominatedBy ? `DOMINADA PELA ${candGpu._dominatedBy.toUpperCase()}` : 'PREÇO ESTICADO (AGUARDE)';
      color = 'amber';
      summary = `Preço atual está ${fmtBRLShort(actualDelta - fairMaxDelta)} acima da paridade linear (+${fmtBRLShort(fairMaxDelta)}).${domWarn}`;
    } else {
      tier = 'bad';
      label = 'DESPROPORCIONAL FRENTE À BASE';
      color = 'rose';
      summary = `Pagar ${fmtBRLShort(actualDelta)} a mais (+${((actualDelta / basePrice) * 100).toFixed(0)}% no preço) por +${perfGainPct.toFixed(1)}% de ganho é desproporcional. O teto justo é +${fmtBRLShort(fairMaxDelta)} (${candGpu.name} ≤ ${fmtBRLShort(basePrice + fairMaxDelta)}).${domWarn}`;
    }
  }

  const fairMaxCandPrice = Math.max(0, basePrice + fairMaxDelta - netPsuDelta);
  const stealCandPrice = Math.max(0, basePrice + stealDelta - netPsuDelta);

  return {
    perfRatio, perfGainPct, gamingGainPct, aiGainPct, softGainPct, vramDiff,
    actualDelta, stealDelta, fairMaxDelta, stretchMaxDelta,
    fairMaxCandPrice,
    stealCandPrice,
    tier, label, color, summary
  };
}
window.evaluateRelationalUpgrade = evaluateRelationalUpgrade;

// Status Badge HTML helper for price rising / target alerts
function getPriceStatusBadgeHTML(gpu) {
  const st = gpu.price_stats || {};
  const vsAvg = st.vs_avg_90d_pct || 0;
  if (st.status === 'great') {
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🟢 No Preço Alvo (${vsAvg > 0 ? '+' : ''}${vsAvg}% vs 90d)</span>`;
  } else if (st.status === 'normal') {
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">🔵 Preço Estável (${vsAvg > 0 ? '+' : ''}${vsAvg}% vs 90d)</span>`;
  } else if (st.status === 'rising') {
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">⚠️ Subiu +${vsAvg}% vs Média 90d</span>`;
  } else {
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">🚨 Alta Forte (+${vsAvg}% vs Média 90d)</span>`;
  }
}

// Switch Main Tabs
function switchTab(tabId) {
  STATE.activeTab = tabId;
  const tabTitles = {
    versus: 'Duelo Relacional',
    cb: 'Custo-Benefício & Preço Alvo',
    builder: 'Meu Setup & Consumo',
    upgrades: 'Upgrades de Plataforma',
    bf: 'Black Friday & Sazonalidade',
    sim: 'Simulador de Desempenho Real',
    config: 'Configurações do Sistema'
  };
  const activeTitleEl = document.getElementById('header-active-tab-title');
  if (activeTitleEl && tabTitles[tabId]) {
    activeTitleEl.textContent = tabTitles[tabId];
  }

  ['versus', 'cb', 'builder', 'upgrades', 'bf', 'sim', 'config'].forEach(id => {
    const sec = document.getElementById(`tab-${id}`);
    const btn = document.getElementById(`tab-btn-${id}`);
    if (!sec || !btn) return;
    if (id === tabId) {
      sec.classList.remove('hidden');
      btn.className = 'tab-btn w-full px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-3 bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-sm shadow-sky-500/10 transition-all text-left';
    } else {
      sec.classList.add('hidden');
      btn.className = 'tab-btn w-full px-4 py-3 rounded-xl text-xs font-medium flex items-center gap-3 text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent transition-all text-left';
    }
  });

  closeSidebar();
  renderActiveTab();
}

function toggleSidebar() {
  const sb = document.getElementById('app-sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  if (!sb) return;
  const isClosed = sb.classList.contains('-translate-x-full');
  if (isClosed) {
    sb.classList.remove('-translate-x-full');
    if (bd) bd.classList.remove('hidden');
  } else {
    sb.classList.add('-translate-x-full');
    if (bd) bd.classList.add('hidden');
  }
}

function closeSidebar() {
  const sb = document.getElementById('app-sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  if (sb) sb.classList.add('-translate-x-full');
  if (bd) bd.classList.add('hidden');
}

function toggleContextSettings() {
  switchTab('config');
  setTimeout(() => {
    const target = document.getElementById('cfg-section-display-workloads');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('ring-2', 'ring-sky-400');
      setTimeout(() => target.classList.remove('ring-2', 'ring-sky-400'), 1500);
    }
  }, 80);
}

function updateTopContextSummary() {
  const el = document.getElementById('top-context-summary');
  if (!el) return;
  el.textContent = `${STATE.monitorRes || '1440p'} @ ${STATE.monitorMaxFps || 144}Hz • IA ${STATE.wAI || 45}%`;
}

// Re-render only the currently visible tab
function renderActiveTab() {
  const t = STATE.activeTab;
  try {
    if (t === 'versus') renderDuelAnalysis();
    if (t === 'cb') renderCBTable();
    if (t === 'builder') renderPCBuilder();
    if (t === 'upgrades') renderUpgradeSuggestions();
    if (t === 'bf') renderBlackFridayTab();
    if (t === 'sim') renderSimulator();
    if (t === 'config') renderConfigTab();
  } catch (e) {
    console.error('Render error on tab', t, e);
  }
}

// Set Workload Preset
function setWorkloadPreset(g, a, s, heft) {
  STATE.vramHeft = heft;
  document.getElementById('select-vram-heft').value = heft;
  applyWeights({ gaming: g, ai: a, soft: s });
}

// Apply weights (always normalized to sum 100%) and sync sliders + number boxes
function applyWeights(w) {
  const total = Math.max(1, w.gaming + w.ai + w.soft);
  let g = Math.round((w.gaming / total) * 100);
  let a = Math.round((w.ai / total) * 100);
  let s = 100 - g - a;
  if (s < 0) { a += s; s = 0; }
  STATE.wGaming = g;
  STATE.wAI = a;
  STATE.wSoft = s;
  STATE.vramHeft = document.getElementById('select-vram-heft').value;
  [['gaming', g], ['ai', a], ['soft', s]].forEach(([k, v]) => {
    document.getElementById(`slider-w-${k}`).value = v;
    const num = document.getElementById(`num-w-${k}`);
    if (document.activeElement !== num) num.value = v;
  });
  enrichGPUsWithContextualMetrics();
  updateTopContextSummary();
  renderActiveTab();
}

// Typing an exact percentage: that value is locked, the remainder is split among
// the other two weights proportionally to their current values.
function onWeightNumberInput(key, rawVal) {
  let v = parseInt(rawVal);
  if (isNaN(v)) return;
  v = Math.max(0, Math.min(100, v));
  const cur = { gaming: STATE.wGaming, ai: STATE.wAI, soft: STATE.wSoft };
  const others = Object.keys(cur).filter(k => k !== key);
  const othersSum = cur[others[0]] + cur[others[1]];
  const rest = 100 - v;
  const next = { [key]: v };
  if (othersSum <= 0) {
    next[others[0]] = Math.round(rest / 2);
    next[others[1]] = rest - next[others[0]];
  } else {
    next[others[0]] = Math.round(rest * (cur[others[0]] / othersSum));
    next[others[1]] = rest - next[others[0]];
  }
  applyWeights(next);
}

// Moving a slider behaves the same way as typing in its box
function onWeightSliderInput(evt) {
  const el = evt && evt.target ? evt.target : document.activeElement;
  if (el && el.id && el.id.startsWith('slider-w-')) {
    return onWeightNumberInput(el.id.replace('slider-w-', ''), el.value);
  }
  // VRAM heft select or unknown source: just recompute
  applyWeights({ gaming: STATE.wGaming, ai: STATE.wAI, soft: STATE.wSoft });
}

// Backwards-compatible aliases
function onWorkloadSlidersChange(evt) { onWeightSliderInput(evt); }
function onWorkloadChange() { onWeightSliderInput(); }

// Populate GPU Dropdowns
function populateSelectors() {
  const sortedGPUs = [...DB.gpus].sort((a, b) => a.name.localeCompare(b.name));
  const baseSel = document.getElementById('duel-select-base');
  const candSel = document.getElementById('duel-select-cand');
  const cbRelSel = document.getElementById('cb-filter-base-rel');
  const simASel = document.getElementById('sim-select-gpu-a');
  const simBSel = document.getElementById('sim-select-gpu-b');

  const optionsHTML = sortedGPUs.map(g =>
    `<option value="${g.slug}">${g.name} (${g.vram_gb}GB ${g.memory_type}) — ${fmtBRL(g.price_brl)}</option>`
  ).join('');

  baseSel.innerHTML = optionsHTML;
  candSel.innerHTML = optionsHTML;
  cbRelSel.innerHTML = sortedGPUs.map(g =>
    `<option value="${g.slug}">Base Relacional: ${g.name} (${fmtBRLShort(g.price_brl)})</option>`
  ).join('');
  simASel.innerHTML = optionsHTML;
  simBSel.innerHTML = optionsHTML;

  baseSel.value = STATE.duelBaseSlug;
  candSel.value = STATE.duelCandSlug;
  cbRelSel.value = STATE.cbRelBaseSlug;
  simASel.value = STATE.duelCandSlug;
  simBSel.value = 'rx-580-8gb-ref';

  // CPU selector for the FPS simulator (user's configured CPU selected by default)
  const simCpuSel = document.getElementById('sim-select-cpu');
  if (simCpuSel && DB.cpus) {
    const configuredSlug = STATE.build.cpu.slug;
    const cpusSorted = [...DB.cpus].sort((a, b) => (a.slug === configuredSlug ? -1 : (b.slug === configuredSlug ? 1 : a.name.localeCompare(b.name))));
    simCpuSel.innerHTML = cpusSorted.map(c => `<option value="${c.slug}">${c.name}${c.price_brl ? ' — ' + fmtBRLShort(c.price_brl) : ''}</option>`).join('');
    simCpuSel.value = configuredSlug || (DB.cpus[0] ? DB.cpus[0].slug : '');
  }

  syncDuelPriceInputsFromSelection();
}

function setDuelPair(candSlug, baseSlug) {
  STATE.duelCandSlug = candSlug;
  STATE.duelBaseSlug = baseSlug;
  document.getElementById('duel-select-cand').value = candSlug;
  document.getElementById('duel-select-base').value = baseSlug;
  syncDuelPriceInputsFromSelection();
  switchTab('versus');
}

function onDuelSelectionChange() {
  STATE.duelBaseSlug = document.getElementById('duel-select-base').value;
  STATE.duelCandSlug = document.getElementById('duel-select-cand').value;
  syncDuelPriceInputsFromSelection();
  renderDuelAnalysis();
}

function syncDuelPriceInputsFromSelection() {
  const baseGpu = DB.gpus.find(g => g.slug === STATE.duelBaseSlug) || DB.gpus[0];
  const candGpu = DB.gpus.find(g => g.slug === STATE.duelCandSlug) || DB.gpus[1];
  if (baseGpu) document.getElementById('duel-price-base').value = baseGpu.price_brl;
  if (candGpu) document.getElementById('duel-price-cand').value = candGpu.price_brl;
}

function resetDuelPricesToLive() {
  syncDuelPriceInputsFromSelection();
  renderDuelAnalysis();
}

// ============================================================================
// RENDER TAB 1: DUELO RELACIONAL (5070 vs 5060 etc.)
// ============================================================================
function renderDuelAnalysis() {
  const baseGpu = DB.gpus.find(g => g.slug === STATE.duelBaseSlug);
  const candGpu = DB.gpus.find(g => g.slug === STATE.duelCandSlug);
  if (!baseGpu || !candGpu) return;

  const basePrice = parseFloat(document.getElementById('duel-price-base').value) || baseGpu.price_brl;
  const candPrice = parseFloat(document.getElementById('duel-price-cand').value) || candGpu.price_brl;

  // Update metadata badges & target prices
  document.getElementById('base-status-badge').innerHTML = getPriceStatusBadgeHTML(baseGpu);
  document.getElementById('cand-status-badge').innerHTML = getPriceStatusBadgeHTML(candGpu);

  document.getElementById('duel-target-base').textContent = fmtBRL(baseGpu.price_stats.target_price);
  document.getElementById('duel-target-cand').textContent = fmtBRL(candGpu.price_stats.target_price);

  document.getElementById('duel-hist-base').textContent = `${fmtBRLShort(baseGpu.price_stats.min_90d)} / ${fmtBRLShort(baseGpu.price_stats.avg_90d)}`;
  document.getElementById('duel-hist-cand').textContent = `${fmtBRLShort(candGpu.price_stats.min_90d)} / ${fmtBRLShort(candGpu.price_stats.avg_90d)}`;

  //Specs summaries
  const baseTech = typeof getGpuTechProfile === 'function' ? getGpuTechProfile(baseGpu).badge : '';
  const candTech = typeof getGpuTechProfile === 'function' ? getGpuTechProfile(candGpu).badge : '';
  const baseEffGaming = typeof getEffectiveGamingScore === 'function' ? getEffectiveGamingScore(baseGpu) : baseGpu.gaming_score;
  const candEffGaming = typeof getEffectiveGamingScore === 'function' ? getEffectiveGamingScore(candGpu) : candGpu.gaming_score;
  document.getElementById('duel-specs-base').innerHTML = `
    <span>🧠 <strong>${baseGpu.vram_gb}GB</strong> ${baseGpu.memory_type} (${baseGpu.bandwidth_gbs} GB/s)</span>
    ${baseTech ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px]">✨ ${baseTech}</span>` : ''}
    <span>🤖 Inf. 14B: <strong class="text-purple-300">${baseGpu.llm_14b_tok_s} tok/s</strong> (8B: ${baseGpu.llm_8b_tok_s})</span>
    <span>⚡ Treinamento: <strong class="text-amber-300">${getEffectiveEngineeringScore(baseGpu)}</strong></span>
    <span>🎮 Jogos Efetivo: <strong class="text-emerald-300">${baseEffGaming}</strong> <span class="text-slate-500">(Raster: ${baseGpu.gaming_score})</span></span>
    <a href="${baseGpu.offer_url}" target="_blank" class="text-emerald-400 hover:underline font-semibold">Loja (${baseGpu.store_name}) ↗</a>
  `;
  document.getElementById('duel-specs-cand').innerHTML = `
    <span>🧠 <strong>${candGpu.vram_gb}GB</strong> ${candGpu.memory_type} (${candGpu.bandwidth_gbs} GB/s)</span>
    ${candTech ? `<span class="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono text-[10px]">✨ ${candTech}</span>` : ''}
    <span>🤖 Inf. 14B: <strong class="text-purple-300">${candGpu.llm_14b_tok_s} tok/s</strong> (8B: ${candGpu.llm_8b_tok_s})</span>
    <span>⚡ Treinamento: <strong class="text-amber-300">${getEffectiveEngineeringScore(candGpu)}</strong></span>
    <span>🎮 Jogos Efetivo: <strong class="text-emerald-300">${candEffGaming}</strong> <span class="text-slate-500">(Raster: ${candGpu.gaming_score})</span></span>
    <a href="${candGpu.offer_url}" target="_blank" class="text-sky-400 hover:underline font-semibold">Loja (${candGpu.store_name}) ↗</a>
  `;

  // Evaluate relational compensation
  const rel = evaluateRelationalUpgrade(baseGpu, candGpu, basePrice, candPrice);

  // ============================================================================
  // VERSUS-STYLE HEAD-TO-HEAD RATINGS & HEXAGONAL RADAR CHART
  // ============================================================================
  const bRawGame = baseGpu.gaming_score || 1500;
  const cRawGame = candGpu.gaming_score || 1500;
  const extremes = getCatalogExtremes();
  const isAbs = STATE.comparisonScaleMode === 'absolute';
  syncComparisonScaleControls();

  // Radar Axes (0-100) scaled against catalog absolute records so RTX 5090 is 100 and no premature saturation
  const bScoreGame = Math.min(100, Math.max(5, Math.round((bRawGame / extremes.maxGaming) * 100)));
  const cScoreGame = Math.min(100, Math.max(5, Math.round((cRawGame / extremes.maxGaming) * 100)));

  const getTechScore = (g) => {
    const p = typeof getGpuTechProfile === 'function' ? getGpuTechProfile(g) : {};
    const arch = (g.arch || '').toLowerCase();
    const slug = (g.slug || '').toLowerCase();
    const brand = (g.brand || '').toUpperCase();
    const isNvidia = brand === 'NVIDIA';
    const isAmd = brand === 'AMD';
    const isIntel = brand === 'INTEL';

    // 1. Blackwell (RTX 50 series): 4th Gen RT Cores, DLSS 4 Transformer, Multi-Frame Gen 4x, Ray Reconstruction, SER
    if (p.isBlackwell || p.gen === 'rtx50' || arch.includes('blackwell') || slug.includes('50')) {
      if (slug.includes('5090')) return 100;
      if (slug.includes('5080')) return 98;
      if (slug.includes('5070-ti') || slug.includes('5070ti')) return 97;
      if (slug.includes('5070')) return 96;
      if (slug.includes('5060-ti') || slug.includes('5060ti')) return 94;
      return 93; // RTX 5060
    }

    // 2. Ada Lovelace (RTX 40 series): 3rd Gen RT Cores, DLSS 3.5, Frame Gen 2x, Ray Reconstruction, SER
    if (p.isAda || p.gen === 'rtx40' || arch.includes('ada') || slug.includes('40')) {
      if (slug.includes('4090')) return 96;
      if (slug.includes('4080')) return 93;
      if (slug.includes('4070')) return 89;
      if (slug.includes('4060-ti') || slug.includes('4060ti')) return 86;
      return 84; // RTX 4060
    }

    // 3. Ampere (RTX 30 series): 2nd Gen RT Cores, DLSS 2/3.7 Super Resolution
    if (isNvidia && (p.isAmpere || p.gen === 'rtx30' || arch.includes('ampere') || slug.includes('30'))) {
      if (slug.includes('3080') || slug.includes('3090')) return 78;
      if (slug.includes('3070')) return 73;
      return 68; // RTX 3060 / 3050
    }

    // 4. Turing (RTX 20 series): 1st Gen RT Cores, DLSS 2
    if (isNvidia && (slug.includes('rtx-20') || slug.includes('2080') || slug.includes('2070') || slug.includes('2060'))) {
      return 56;
    }

    // 5. AMD RDNA 4: 3rd Gen AMD RT, FSR 4 AI upscaling
    if (isAmd && (p.gen === 'rdna4' || arch.includes('rdna 4') || slug.includes('8800') || slug.includes('8600') || slug.includes('8700'))) {
      return 82;
    }

    // 6. AMD RDNA 3: 2nd Gen AMD RT, FSR 3.1 Frame Gen
    if (isAmd && (p.gen === 'rdna3' || arch.includes('rdna 3') || slug.includes('7900') || slug.includes('7800') || slug.includes('7700') || slug.includes('7600'))) {
      if (slug.includes('7900')) return 72;
      return 64; // RX 7600
    }

    // 7. AMD RDNA 2 (RX 6000 series): Basic RT
    if (isAmd && (slug.includes('6900') || slug.includes('6800') || slug.includes('6700') || slug.includes('6600') || slug.includes('6500'))) {
      return 42;
    }

    // 8. Intel Battlemage / Alchemist: XeSS AI upscaling, dedicated RT hardware
    if (isIntel) {
      if (arch.includes('battlemage') || slug.includes('b580') || slug.includes('b570')) return 76;
      return 60; // Arc A770/A750
    }

    // 9. Legacy / No RT hardware (Polaris RX 580, GTX 1660/1060/Pascal)
    return 12;
  };
  const bScoreTech = getTechScore(baseGpu);
  const cScoreTech = getTechScore(candGpu);

  // AI Score scaled against #1 in catalog (RTX 5090 = 173.6 tok/s 14B + 32GB VRAM)
    // AI Score scaled against #1 in catalog (Respects user's vramHeft and continuous sigmoid model - Argon Item 2)
  const bScoreAI = Math.min(100, Math.max(5, Math.round((getEffectiveAIScore(baseGpu) / extremes.maxAI) * 100)));
  const cScoreAI = Math.min(100, Math.max(5, Math.round((getEffectiveAIScore(candGpu) / extremes.maxAI) * 100)));

  // AI Training & Simulation scaled against #1 in catalog (RTX 5090 = ~28,000 pts)
  const bTrainRaw = getEffectiveEngineeringScore(baseGpu);
  const cTrainRaw = getEffectiveEngineeringScore(candGpu);
  const bScoreTrain = Math.min(100, Math.max(5, Math.round((bTrainRaw / extremes.maxSoft) * 100)));
  const cScoreTrain = Math.min(100, Math.max(5, Math.round((cTrainRaw / extremes.maxSoft) * 100)));

  // Eficiência Energética (FPS / Watt)
  const maxEff = Math.max(...DB.gpus.map(g => (g.gaming_score || 1000) / Math.max(120, g.tdp_w || 150)));
  const bScoreEff = Math.min(100, Math.max(15, Math.round(((bRawGame / Math.max(120, baseGpu.tdp_w)) / maxEff) * 100)));
  const cScoreEff = Math.min(100, Math.max(15, Math.round(((cRawGame / Math.max(120, candGpu.tdp_w)) / maxEff) * 100)));

  // Custo-Benefício do Modelo (0 a 100)
  const bScoreCB = Math.min(100, Math.max(15, baseGpu._myCBScore || 70));
  const cScoreCB = Math.min(100, Math.max(15, candGpu._myCBScore || 70));

  // Desempenho Geral directly derived from getContextualCompositeScore (Strictly reflects user's wGaming/wAI/wSoft sliders - Argon Item 2)
  const bOverallPerf = Math.min(100, Math.max(5, Math.round((getContextualCompositeScore(baseGpu) / extremes.maxComp) * 100)));
  const cOverallPerf = Math.min(100, Math.max(5, Math.round((getContextualCompositeScore(candGpu) / extremes.maxComp) * 100)));

  const bAvgRadar = Math.round((bScoreGame + bScoreTech + bScoreAI + bScoreTrain + bScoreEff + bScoreCB) / 6);
  const cAvgRadar = Math.round((cScoreGame + cScoreTech + cScoreAI + cScoreTrain + cScoreEff + cScoreCB) / 6);

  // Render Score Hero Cards (Versus-Style)
  const versusRatingsEl = document.getElementById('duel-versus-ratings');
  if (versusRatingsEl) {
    const candWinsPerf = cOverallPerf > bOverallPerf;

    versusRatingsEl.innerHTML = `
      <div class="bg-slate-900/90 rounded-xl p-3.5 border border-emerald-500/40 space-y-1 relative overflow-hidden shadow-sm">
        <div class="flex items-center justify-between text-xs">
          <span class="font-mono text-emerald-400 font-bold uppercase tracking-wider">PLACA BASE</span>
          <span class="text-[10px] font-mono text-slate-400 font-semibold">${fmtBRL(basePrice)}</span>
        </div>
        <div class="text-sm font-extrabold text-white truncate" title="${baseGpu.name}">${baseGpu.name}</div>
        <div class="flex items-baseline gap-2 pt-1">
          <span class="text-2xl font-mono font-black text-emerald-400">${bScoreCB}</span>
          <span class="text-[11px] font-mono text-slate-400">/ 100 Custo-Benefício</span>
        </div>
        <div class="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
          <span>Desempenho Geral:</span>
          <strong class="text-slate-200">${bOverallPerf} pts</strong>
        </div>
      </div>

      <div class="bg-slate-900/90 rounded-xl p-3.5 border border-sky-500/40 space-y-1 relative overflow-hidden shadow-sm">
        <div class="flex items-center justify-between text-xs">
          <span class="font-mono text-sky-400 font-bold uppercase tracking-wider">CANDIDATA UPGRADE</span>
          <span class="text-[10px] font-mono text-slate-400 font-semibold">${fmtBRL(candPrice)}</span>
        </div>
        <div class="text-sm font-extrabold text-white truncate" title="${candGpu.name}">${candGpu.name}</div>
        <div class="flex items-baseline gap-2 pt-1">
          <span class="text-2xl font-mono font-black text-sky-400">${cScoreCB}</span>
          <span class="text-[11px] font-mono text-slate-400">/ 100 Custo-Benefício</span>
        </div>
        <div class="text-[11px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
          <span>Desempenho Geral:</span>
          <strong class="${candWinsPerf ? 'text-sky-300 font-bold' : 'text-slate-200'}">${cOverallPerf} pts</strong>
        </div>
      </div>
    `;
  }

  // Render Comparative Bars in Duel Block
  const versusBarsEl = document.getElementById('duel-versus-bars');
  if (versusBarsEl) {
    const rawGamingGainPct = bRawGame > 0 ? (((cRawGame / bRawGame) - 1) * 100) : 0;
    versusBarsEl.innerHTML = [
      renderComparisonBarHTML({
        title: 'Desempenho em Jogos (Raster / Benchmark)',
        iconSvg: SPEEDOMETER_SVG,
        baseVal: bRawGame,
        candVal: cRawGame,
        baseLabel: `${bRawGame} pts`,
        candLabel: `${cRawGame} pts`,
        diffPct: rawGamingGainPct,
        maxVal: extremes.maxGaming,
        baseName: baseGpu.name,
        candName: candGpu.name
      }),
      renderComparisonBarHTML({
        title: 'Inferência de IA (LLMs Locais / tok/s 14B)',
        iconSvg: ROBOT_SVG,
        baseVal: baseGpu.llm_14b_tok_s || 5,
        candVal: candGpu.llm_14b_tok_s || 5,
        baseLabel: `${baseGpu.llm_14b_tok_s || 5} tok/s`,
        candLabel: `${candGpu.llm_14b_tok_s || 5} tok/s`,
        diffPct: rel.aiGainPct,
        maxVal: extremes.max14bToks,
        baseName: baseGpu.name,
        candName: candGpu.name
      }),
      renderComparisonBarHTML({
        title: 'AI Training & Engenharia',
        iconSvg: CIRCUIT_SVG,
        baseVal: bTrainRaw,
        candVal: cTrainRaw,
        baseLabel: `${bTrainRaw} pts`,
        candLabel: `${cTrainRaw} pts`,
        diffPct: rel.softGainPct,
        maxVal: extremes.maxSoft,
        baseName: baseGpu.name,
        candName: candGpu.name
      }),
      renderComparisonBarHTML({
        title: 'Investimento / Preço Hoje',
        iconSvg: MONEY_SVG,
        baseVal: basePrice,
        candVal: candPrice,
        baseLabel: fmtBRLShort(basePrice),
        candLabel: fmtBRLShort(candPrice),
        diffPct: ((candPrice / Math.max(1, basePrice)) - 1) * 100,
        isPrice: true,
        maxVal: extremes.maxPrice,
        baseName: baseGpu.name,
        candName: candGpu.name
      }),
      renderComparisonBarHTML({
        title: 'Índice de Custo-Benefício',
        iconSvg: STAR_SVG,
        baseVal: bScoreCB,
        candVal: cScoreCB,
        baseLabel: `${bScoreCB}/100`,
        candLabel: `${cScoreCB}/100`,
        diffPct: ((cScoreCB / Math.max(1, bScoreCB)) - 1) * 100,
        maxVal: 100,
        baseName: baseGpu.name,
        candName: candGpu.name
      })
    ].join('');
  }

  // Render Hexagonal Radar Chart
  const radarCanvas = document.getElementById('chart-duel-radar');
  if (radarCanvas) {
    const radarCtx = radarCanvas.getContext('2d');
    if (chartDuelRadar) chartDuelRadar.destroy();

    const radarDataB = [bScoreGame, bScoreTech, bScoreAI, bScoreTrain, bScoreEff, bScoreCB];
    const radarDataC = [cScoreGame, cScoreTech, cScoreAI, cScoreTrain, cScoreEff, cScoreCB];
    const bAvgRadar = Math.round((bScoreGame + bScoreTech + bScoreAI + bScoreTrain + bScoreEff + bScoreCB) / 6);
    const cAvgRadar = Math.round((cScoreGame + cScoreTech + cScoreAI + cScoreTrain + cScoreEff + cScoreCB) / 6);

    const topGpu = (DB.gpus || []).find(g => (g.slug || '').includes('5090')) || (DB.gpus || []).find(g => (g.slug || '').includes('4090')) || null;
    let topScoreEff = 50;
    let topScoreCB = 26;
    if (topGpu) {
      topScoreEff = Math.min(100, Math.max(15, Math.round((((topGpu.gaming_score || 14411) / Math.max(120, topGpu.tdp_w || 575)) / maxEff) * 100)));
      topScoreCB = Math.min(100, Math.max(15, topGpu._myCBScore || 26));
    }

    const datasets = [
      {
        label: `${baseGpu.name} (${bAvgRadar}/100)`,
        data: radarDataB,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.22)',
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#ffffff',
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: '#10b981',
        borderWidth: 2,
        pointRadius: 3
      },
      {
        label: `${candGpu.name} (${cAvgRadar}/100)`,
        data: radarDataC,
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56, 189, 248, 0.25)',
        pointBackgroundColor: '#38bdf8',
        pointBorderColor: '#ffffff',
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: '#38bdf8',
        borderWidth: 2,
        pointRadius: 3
      }
    ];

    if (isAbs && topGpu) {
      const topData = [100, 100, 100, 100, topScoreEff, topScoreCB];
      const topAvg = Math.round((100 + 100 + 100 + 100 + topScoreEff + topScoreCB) / 6);
      datasets.push({
        label: `${topGpu.name} (Topo 100 Absoluto Ref - ${topAvg}/100)`,
        data: topData,
        borderColor: '#a855f7',
        borderDash: [5, 4],
        backgroundColor: 'rgba(168, 85, 247, 0.08)',
        pointBackgroundColor: '#a855f7',
        pointBorderColor: '#ffffff',
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: '#a855f7',
        borderWidth: 2,
        pointRadius: 3
      });
    }

    chartDuelRadar = new Chart(radarCtx, {
      type: 'radar',
      data: {
        labels: ['Jogos (FPS)', 'Ray Tracing / Tech', 'Inferência IA', 'Treinamento & Redes', 'Eficiência (W)', 'Custo-Benefício'],
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: 'rgba(51, 65, 85, 0.5)' },
            grid: { color: 'rgba(51, 65, 85, 0.4)' },
            pointLabels: {
              color: '#cbd5e1',
              font: { size: 10, weight: 'bold' }
            },
            ticks: {
              display: false,
              min: 0,
              max: 100
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: ${c.parsed.r}/100 pts`
            }
          }
        }
      }
    });

    const radarLegendEl = document.getElementById('duel-radar-legend');
    if (radarLegendEl) {
      const topLegend = (isAbs && topGpu) ? `
        <div class="flex items-center gap-1.5 border-l border-slate-700/80 pl-2">
          <span class="w-3 h-3 rounded-full bg-purple-400 inline-block shadow-sm"></span>
          <span class="text-purple-300 font-bold">${topGpu.name}</span>
          <span class="text-slate-400 text-[10px]">(Topo 100 Ref)</span>
        </div>
      ` : '';

      radarLegendEl.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-emerald-400 inline-block shadow-sm"></span>
          <span class="text-white font-bold">${baseGpu.name}</span>
          <span class="text-slate-400">(${bAvgRadar}/100)</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-sky-400 inline-block shadow-sm"></span>
          <span class="text-white font-bold">${candGpu.name}</span>
          <span class="text-slate-400">(${cAvgRadar}/100)</span>
        </div>
        ${topLegend}
      `;
    }
  }

  const vBox = document.getElementById('duel-verdict-box');
  vBox.className = `mt-6 rounded-2xl p-5 border transition-all ${colorMap[rel.color]}`;
  vBox.innerHTML = `
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div class="space-y-1.5 max-w-4xl">
        <div class="flex flex-wrap items-center gap-2.5">
          <span class="px-3 py-1 rounded-lg text-xs font-mono font-black uppercase ${badgeMap[rel.color]}">${rel.label}</span>
          <span class="text-sm font-mono font-bold text-white">
            Diferença Atual: <span class="underline">${rel.actualDelta >= 0 ? '+' : ''}${fmtBRL(rel.actualDelta)}</span>
            (${((rel.actualDelta / Math.max(1, basePrice)) * 100).toFixed(0)}% mais cara que a ${baseGpu.name})
          </span>
        </div>
        <h3 class="text-lg font-extrabold text-white pt-1">${rel.summary}</h3>
        <p class="text-xs opacity-90 leading-relaxed">
          Para o seu perfil (<strong>${STATE.wGaming}% Jogos / ${STATE.wAI}% Inferência IA Local / ${STATE.wSoft}% AI Training, Eth & OpenDSS</strong> • monitor ${typeof getMonitorLabel === 'function' ? getMonitorLabel() : ''}),
          a <strong>${candGpu.name}</strong> entrega <strong>${rel.perfGainPct >= 0 ? '+' : ''}${rel.perfGainPct.toFixed(1)}% de ganho ponderado real</strong>:
          Inferência IA Local (tok/s & KV-Cache): <strong>${rel.aiGainPct >= 0 ? '+' : ''}${rel.aiGainPct.toFixed(0)}%</strong> (${candGpu.llm_14b_tok_s} vs ${baseGpu.llm_14b_tok_s} tok/s em 14B) •
          AI Training / Eth Frames / OpenDSS: <strong>${rel.softGainPct >= 0 ? '+' : ''}${rel.softGainPct.toFixed(0)}%</strong> •
          Jogos (FPS): <strong>${rel.gamingGainPct >= 0 ? '+' : ''}${rel.gamingGainPct.toFixed(0)}%</strong>.
        </p>
      </div>
      <div class="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 text-right">
        <div>
          <span class="text-[10px] font-mono uppercase text-emerald-400 block">Teto p/ Ser "Pechincha"</span>
          <span class="text-sm font-mono font-bold text-white">Até +${fmtBRLShort(rel.stealDelta)} <span class="text-slate-400">(${candGpu.name} ≤ ${fmtBRLShort(rel.stealCandPrice)})</span></span>
        </div>
        <div class="border-t border-slate-800 pt-1.5">
          <span class="text-[10px] font-mono uppercase text-sky-400 block">Teto Máximo Justo (Vale a Pena)</span>
          <span class="text-sm font-mono font-bold text-white">Até +${fmtBRLShort(rel.fairMaxDelta)} <span class="text-slate-400">(${candGpu.name} ≤ ${fmtBRLShort(rel.fairMaxCandPrice)})</span></span>
        </div>
      </div>
    </div>
  `;

  // Update Thermometer Labels & Marker Position (Reflects true shelf price ceiling accounting for forced PSU upgrade)
  const stretchShelfPrice = Math.max(0, basePrice + rel.stretchMaxDelta - ((candGpu._psuUpgradeCost || 0) - (baseGpu._psuUpgradeCost || 0)));
  document.getElementById('zone-lbl-1').textContent = `Até +${fmtBRLShort(rel.stealDelta)} (${candGpu.name} ≤ ${fmtBRLShort(rel.stealCandPrice)})`;
  document.getElementById('zone-lbl-2').textContent = `Até +${fmtBRLShort(rel.fairMaxDelta)} (${candGpu.name} ≤ ${fmtBRLShort(rel.fairMaxCandPrice)})`;
  document.getElementById('zone-lbl-3').textContent = `Até +${fmtBRLShort(rel.stretchMaxDelta)} (${candGpu.name} ≤ ${fmtBRLShort(stretchShelfPrice)})`;
  document.getElementById('zone-lbl-4').textContent = `Acima de +${fmtBRLShort(rel.stretchMaxDelta)} (Não Compensa)`;

  document.getElementById('duel-thermometer-subtitle').textContent =
    `Se ${baseGpu.name} custa ${fmtBRLShort(basePrice)}, veja as faixas de preço para a ${candGpu.name}:`;

  // Calculate marker percentage across the 4 equal-width visual zones
  let markerPct = 5;
  const d = rel.actualDelta;
  if (d <= 0) {
    markerPct = 3;
  } else if (d <= rel.stealDelta) {
    markerPct = (d / Math.max(1, rel.stealDelta)) * 25;
  } else if (d <= rel.fairMaxDelta) {
    markerPct = 25 + ((d - rel.stealDelta) / Math.max(1, rel.fairMaxDelta - rel.stealDelta)) * 25;
  } else if (d <= rel.stretchMaxDelta) {
    markerPct = 50 + ((d - rel.fairMaxDelta) / Math.max(1, rel.stretchMaxDelta - rel.fairMaxDelta)) * 25;
  } else {
    const extra = (d - rel.stretchMaxDelta) / Math.max(500, rel.fairMaxDelta * 0.8);
    markerPct = Math.min(97, 75 + extra * 22);
  }

  document.getElementById('thermometer-marker').style.left = `${markerPct}%`;
  document.getElementById('marker-delta-val').textContent = `${d >= 0 ? '+' : ''}${fmtBRLShort(d)}`;

  // Render 3 Time-Context Scenarios: (1) Preço de Hoje, (2) Ambas no Preço Alvo, (3) 5070 em Promoção (Mín 90d) vs 5060 Hoje
  const relTarget = evaluateRelationalUpgrade(baseGpu, candGpu, baseGpu.price_stats.target_price, candGpu.price_stats.target_price);
  const relPromoCand = evaluateRelationalUpgrade(baseGpu, candGpu, basePrice, candGpu.price_stats.min_90d);

  document.getElementById('duel-scenarios-grid').innerHTML = `
    <div class="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
      <span class="text-[10px] font-mono uppercase text-slate-400 block">Cenário 1: Preços de Hoje nas Lojas</span>
      <div class="text-xs font-bold text-white mt-1">${candGpu.name} (${fmtBRLShort(candPrice)}) vs ${baseGpu.name} (${fmtBRLShort(basePrice)})</div>
      <div class="mt-1.5 flex items-center justify-between">
        <span class="font-mono text-xs text-slate-300">Diferença: <strong>+${fmtBRLShort(rel.actualDelta)}</strong></span>
        <span class="text-[11px] font-mono font-bold text-${rel.color}-400">${rel.label}</span>
      </div>
    </div>
    <div class="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
      <span class="text-[10px] font-mono uppercase text-sky-400 block">Cenário 2: Ambas no Preço Alvo (Histórico)</span>
      <div class="text-xs font-bold text-white mt-1">${candGpu.name} (${fmtBRLShort(candGpu.price_stats.target_price)}) vs ${baseGpu.name} (${fmtBRLShort(baseGpu.price_stats.target_price)})</div>
      <div class="mt-1.5 flex items-center justify-between">
        <span class="font-mono text-xs text-slate-300">Diferença: <strong>+${fmtBRLShort(relTarget.actualDelta)}</strong></span>
        <span class="text-[11px] font-mono font-bold text-${relTarget.color}-400">${relTarget.label}</span>
      </div>
    </div>
    <div class="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
      <span class="text-[10px] font-mono uppercase text-emerald-400 block">Cenário 3: ${candGpu.name} na Menor Promo 90d</span>
      <div class="text-xs font-bold text-white mt-1">${candGpu.name} (${fmtBRLShort(candGpu.price_stats.min_90d)}) vs ${baseGpu.name} Hoje (${fmtBRLShort(basePrice)})</div>
      <div class="mt-1.5 flex items-center justify-between">
        <span class="font-mono text-xs text-slate-300">Diferença: <strong>+${fmtBRLShort(relPromoCand.actualDelta)}</strong></span>
        <span class="text-[11px] font-mono font-bold text-${relPromoCand.color}-400">${relPromoCand.label}</span>
      </div>
    </div>
  `;

  // Render 180-Day Price History Chart
  renderDuelHistoryChart(baseGpu, candGpu);

  // Render Smart Alternatives between/around Base and Candidate
  renderDuelAlternatives(baseGpu, candGpu, basePrice, candPrice);
}

function renderDuelHistoryChart(baseGpu, candGpu) {
  const ctx = document.getElementById('chart-duel-history').getContext('2d');
  if (chartDuelHistory) chartDuelHistory.destroy();

  // Merge dates from both histories (chronological order)
  const dateSet = new Set();
  (baseGpu.history || []).forEach(h => dateSet.add(h.date));
  (candGpu.history || []).forEach(h => dateSet.add(h.date));
  const dates = Array.from(dateSet).sort();

  const baseMap = Object.fromEntries((baseGpu.history || []).map(h => [h.date, h.price]));
  const candMap = Object.fromEntries((candGpu.history || []).map(h => [h.date, h.price]));

  // Fill forward missing dates for smooth lines
  let lastB = baseGpu.price_brl;
  let lastC = candGpu.price_brl;
  const baseSeries = dates.map(d => { if (baseMap[d]) lastB = baseMap[d]; return lastB; });
  const candSeries = dates.map(d => { if (candMap[d]) lastC = candMap[d]; return lastC; });
  const targetCandSeries = dates.map(() => candGpu.price_stats.target_price);

  chartDuelHistory = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => d.slice(5)), // MM-DD
      datasets: [
        {
          label: `${candGpu.name} (Preço Mín Diário)`,
          data: candSeries,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
          fill: false
        },
        {
          label: `Preço Alvo ${candGpu.name} (${fmtBRLShort(candGpu.price_stats.target_price)})`,
          data: targetCandSeries,
          borderColor: '#a855f7',
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        },
        {
          label: `${baseGpu.name} (Preço Mín Diário)`,
          data: baseSeries,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.25,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#cbd5e1', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: ${fmtBRL(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 10 }, grid: { color: 'rgba(51,65,85,0.25)' } },
        y: {
          ticks: {
            color: '#94a3b8',
            callback: v => formatMoneyShort(v)
          },
          grid: { color: 'rgba(51,65,85,0.3)' }
        }
      }
    }
  });
}

function renderDuelAlternatives(baseGpu, candGpu, basePrice, candPrice) {
  const minP = Math.min(basePrice, candPrice) * 0.75;
  const maxP = Math.max(basePrice, candPrice) * 1.20;

  const candidates = DB.gpus
    .filter(g => g.slug !== baseGpu.slug && g.slug !== candGpu.slug && g.slug !== 'rx-580-8gb-ref')
    .filter(g => g.price_brl >= minP && g.price_brl <= maxP)
    .sort((a, b) => b._myCBScore - a._myCBScore)
    .slice(0, 4);

  const listEl = document.getElementById('duel-alternatives-list');
  listEl.innerHTML = candidates.map(g => {
    const relVsBase = evaluateRelationalUpgrade(baseGpu, g, basePrice, g.price_brl);
    return `
      <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-sky-500/40 transition flex items-center justify-between gap-2">
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-white text-xs">${g.name}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/20 text-purple-300">${g.vram_gb}GB</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300">Seu CB: ${g._myCBScore}/100</span>
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5">
            Hoje: <strong class="text-slate-200 font-mono">${fmtBRL(g.price_brl)}</strong> (Alvo: ${fmtBRLShort(g.price_stats.target_price)}) •
            vs ${baseGpu.name}: <span class="text-${relVsBase.color}-400 font-semibold">${relVsBase.perfGainPct >= 0 ? '+' : ''}${relVsBase.perfGainPct.toFixed(0)}% perf por ${relVsBase.actualDelta >= 0 ? '+' : ''}${fmtBRLShort(relVsBase.actualDelta)}</span>
          </div>
        </div>
        <button onclick="setDuelPair('${g.slug}', '${baseGpu.slug}')" class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-sky-300 border border-slate-700 transition shrink-0 cursor-pointer">
          Comparar
        </button>
      </div>
    `;
  }).join('');

  // Explain why VRAM, Local Inference, and CUDA matter for AI Training, Ethernet Frame processing & OpenDSS
  const insightEl = document.getElementById('duel-ram-ai-insight');
  insightEl.innerHTML = `
    <span class="font-mono uppercase text-[10px] text-purple-400 font-bold block mb-1">💡 Cálculo de Inferência Local + AI Training / Ethernet / OpenDSS (${candGpu.name} vs ${baseGpu.name})</span>
    <ul class="space-y-1 text-[11px] list-disc pl-4">
      <li><strong>Inferência Local no Cálculo:</strong> A <strong>${candGpu.name}</strong> (${candGpu.vram_gb}GB, ${candGpu.bandwidth_gbs} GB/s) roda modelos <strong>14B Q4 + KV-Cache</strong> direto na VRAM a <strong>~${candGpu.llm_14b_tok_s} tok/s</strong>, enquanto a <strong>${baseGpu.name}</strong> (${baseGpu.vram_gb}GB, ${baseGpu.bandwidth_gbs} GB/s) faz <strong>~${baseGpu.llm_14b_tok_s} tok/s</strong> ${baseGpu.vram_gb <= 8 ? '(sofre gargalo severo de PCIe por offload na RAM DDR4)' : ''}.</li>
      <li><strong>AI Training, Eth Frames & OpenDSS:</strong> Co-simulação simultânea (ex: cena 3D Omniverse + agente LLM local + buffer GPU de pacotes Ethernet via CuPy/RAPIDS + matrizes esparsas do OpenDSS) exige <strong>CUDA/Tensor nativo</strong> e pelo menos <strong>12GB–16GB de VRAM</strong> para não estourar a memória de vídeo.</li>
    </ul>
  `;
}

// ============================================================================
// RENDER TAB 2: CUSTO-BENEFÍCIO CONTEXTUAL & PREÇO ALVO (ALL GPUS)
// ============================================================================
function setCBSort(col) {
  if (STATE.cbSortBy === col) {
    STATE.cbSortAsc = !STATE.cbSortAsc;
  } else {
    STATE.cbSortBy = col;
    STATE.cbSortAsc = (col === 'price' || col === 'target' || col === 'name');
  }
  renderCBTable();
}

function setCBChartMetric(metric) {
  STATE.cbChartMetric = metric;
  const btnBenefit = document.getElementById('cb-chart-btn-benefit');
  const btnBench = document.getElementById('cb-chart-btn-benchmark');
  const title = document.getElementById('cb-chart-title');
  if (metric === 'benefit') {
    if (btnBenefit) btnBenefit.className = 'px-2.5 py-1 rounded text-xs font-semibold transition bg-sky-500/20 text-sky-300 border border-sky-500/30';
    if (btnBench) btnBench.className = 'px-2.5 py-1 rounded text-xs font-medium transition text-slate-400 hover:text-slate-200';
    const sym = STATE.market?.monetary?.currency_symbol || 'R$';
    if (title) title.textContent = `Mapa de Eficiência: Preço Atual (${sym}) vs Custo-Benefício (Índice 0–100)`;
  } else {
    if (btnBenefit) btnBenefit.className = 'px-2.5 py-1 rounded text-xs font-medium transition text-slate-400 hover:text-slate-200';
    if (btnBench) btnBench.className = 'px-2.5 py-1 rounded text-xs font-semibold transition bg-sky-500/20 text-sky-300 border border-sky-500/30';
    const sym = STATE.market?.monetary?.currency_symbol || 'R$';
    if (title) title.textContent = `Mapa de Eficiência: Preço Atual (${sym}) vs Desempenho Bruto (Score Contextual)`;
  }
  renderCBTable();
}

function toggleCBColMenu() {
  const menu = document.getElementById('cb-col-menu');
  if (menu) menu.classList.toggle('hidden');
}

function toggleCBCol(colName, isChecked) {
  if (!STATE.cbColumns) STATE.cbColumns = {};
  STATE.cbColumns[colName] = isChecked;
  applyCBColVisibility();
  renderCBTable();
}

function applyCBColVisibility() {
  const cols = STATE.cbColumns || { target: true, trend: false, hb_cb: false, rel_verdict: true, actions: true };
  const thMap = {
    target: 'th-target',
    trend: 'th-trend',
    hb_cb: 'th-hb_cb',
    rel_verdict: 'th-rel-verdict',
    actions: 'th-actions'
  };
  Object.keys(thMap).forEach(key => {
    const el = document.getElementById(thMap[key]);
    if (el) {
      if (cols[key]) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });

  Object.keys(cols).forEach(key => {
    const chk = document.getElementById(`cb-chk-${key}`);
    if (chk) chk.checked = !!cols[key];
  });
}

function renderCBTable() {
  enrichGPUsWithContextualMetrics();
  applyCBColVisibility();
  syncComparisonScaleControls();
  const search = (document.getElementById('cb-search').value || '').toLowerCase().trim();
  const brand = document.getElementById('cb-filter-brand').value;
  const minVram = parseInt(document.getElementById('cb-filter-vram').value) || 0;
  STATE.cbRelBaseSlug = document.getElementById('cb-filter-base-rel').value || 'rtx-5060';

  const baseGpu = DB.gpus.find(g => g.slug === STATE.cbRelBaseSlug) || DB.gpus[0];
  const isAbs = STATE.comparisonScaleMode === 'absolute';
  const extremes = getCatalogExtremes();

  const thVerdict = document.getElementById('th-rel-verdict');
  if (thVerdict) {
    thVerdict.textContent = isAbs ? 'Escala Absoluta (vs Topo)' : `Relação vs ${baseGpu.name}`;
  }

  // Pre-calculate catalog-wide max relative deltas so no card caps out early in relative mode
  const basePrice = (baseGpu && baseGpu.price_brl) ? baseGpu.price_brl : 2000;
  const baseComp = typeof getContextualCompositeScore === 'function' ? getContextualCompositeScore(baseGpu) : (baseGpu.gaming_score || 1000);
  let maxRelPerf = 100;
  let maxRelPrice = 1000;
  DB.gpus.forEach(og => {
    const ogComp = typeof getContextualCompositeScore === 'function' ? getContextualCompositeScore(og) : (og.gaming_score || 1000);
    const pGain = ((ogComp / Math.max(1, baseComp)) - 1) * 100;
    if (pGain > maxRelPerf) maxRelPerf = pGain;
    const pDelta = og.price_brl - basePrice;
    if (pDelta > maxRelPrice) maxRelPrice = pDelta;
  });
  maxRelPerf = Math.max(120, maxRelPerf * 1.05);
  maxRelPrice = Math.max(1500, maxRelPrice * 1.05);

  let rows = DB.gpus.filter(g => {
    if (search && !g.name.toLowerCase().includes(search) && !g.slug.toLowerCase().includes(search)) return false;
    if (brand !== 'ALL' && g.brand !== brand) return false;
    if (g.vram_gb < minVram) return false;
    return true;
  });

  rows.sort((a, b) => {
    let va, vb;
    switch (STATE.cbSortBy) {
      case 'name': va = a.name; vb = b.name; return STATE.cbSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      case 'vram': va = a.vram_gb * 1000 + a.bandwidth_gbs; vb = b.vram_gb * 1000 + b.bandwidth_gbs; break;
      case 'price': va = a.price_brl; vb = b.price_brl; break;
      case 'target': va = a.price_stats.target_price; vb = b.price_stats.target_price; break;
      case 'trend': va = a.price_stats.vs_avg_90d_pct; vb = b.price_stats.vs_avg_90d_pct; break;
      case 'hb_cb': va = a.hb_cb_score || 0; vb = b.hb_cb_score || 0; break;
      case 'my_cb':
      default: va = a._myCBScore; vb = b._myCBScore; break;
    }
    return STATE.cbSortAsc ? (va - vb) : (vb - va);
  });

  const cols = STATE.cbColumns || { target: true, trend: false, hb_cb: false, rel_verdict: true, actions: true };
  const tbody = document.getElementById('cb-table-body');
  tbody.innerHTML = rows.map((g, idx) => {
    const rel = g.slug === baseGpu.slug
      ? { label: 'PLACA BASE', color: 'slate', actualDelta: 0, perfGainPct: 0, fairMaxDelta: 0, tier: 'base' }
      : evaluateRelationalUpgrade(baseGpu, g, baseGpu.price_brl, g.price_brl);

    const diffCB = g._myCBScore - (g.hb_cb_score || 0);
    const diffCBHtml = diffCB > 0
      ? `<span class="text-[10px] text-emerald-400 font-mono">(+${diffCB} c/ IA)</span>`
      : (diffCB < 0 ? `<span class="text-[10px] text-rose-400 font-mono">(${diffCB} c/ IA)</span>` : '');

    const dotClass = g.vram_gb >= 24 ? 'bg-amber-400 ring-2 ring-amber-500/40' :
                     g.vram_gb >= 16 ? 'bg-purple-400 ring-2 ring-purple-500/40' :
                     g.vram_gb >= 12 ? 'bg-sky-400 ring-2 ring-sky-500/40' :
                     g.vram_gb >= 8  ? 'bg-emerald-400 ring-2 ring-emerald-500/40' :
                                       'bg-slate-400 ring-2 ring-slate-500/40';

    const vramCloudBadge = `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-800/90 text-slate-200 border border-slate-700/80 shadow-sm ml-2">
      <span class="w-2 h-2 rounded-full ${dotClass}"></span>
      ${g.vram_gb} GB ${g.memory_type}
      <span class="text-slate-400 font-normal text-[10px]">(${g.bandwidth_gbs} GB/s)</span>
    </span>`;

    const techBadge = typeof getGpuTechProfile === 'function' ? `<span class="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono text-[10px]">✨ ${getGpuTechProfile(g).badge}</span>` : '';
    const flashBadge = g._flashPromo ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-[10px]" title="${g._flashPromo.title}">⚡ FLASH −${fmtBRLShort(g._flashPromo.savings_vs_hb_brl)} vs Catálogo (${g._flashPromo.age_hours}h)</span>` : '';
    const couponBadge = g.coupon
      ? `<button onclick="typeof copyCouponAndOpen === 'function' ? copyCouponAndOpen('${g.coupon}', '${g.offer_url}') : navigator.clipboard.writeText('${g.coupon}')" class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[10px] hover:bg-amber-500/40 transition cursor-pointer" title="Clique para copiar cupom e abrir a loja">🎟️ Cupom: ${g.coupon} 📋</button>`
      : '';

    const gComp = typeof getContextualCompositeScore === 'function' ? getContextualCompositeScore(g) : (g.gaming_score || 1000);

    let verdictCellHTML = '';
    if (isAbs) {
      // 1. MODO ABSOLUTO: 100% = Topo do Catálogo (RTX 5090)
      const absPerfPct = Math.min(100, Math.max(3, (gComp / extremes.maxComp) * 100));
      const absPricePct = Math.min(100, Math.max(3, (g.price_brl / extremes.maxPrice) * 100));
      const isBaseCard = g.slug === baseGpu.slug;

      verdictCellHTML = `
        <div class="space-y-1.5 w-56 ml-auto font-mono text-right">
          <div class="flex items-center justify-between gap-1 text-[10px]">
            <span class="px-2 py-0.5 rounded font-black uppercase tracking-tight ${isBaseCard ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : (badgeMap[rel.color] || 'bg-slate-800 text-slate-300')}">
              ${isBaseCard ? 'PLACA BASE' : (rel.tier === 'steal' ? 'PECHINCHA' : (rel.tier === 'fair' ? (rel.perfGainPct < 0 ? 'ECONOMIA' : 'PREÇO JUSTO') : (rel.tier === 'stretch' ? 'PREÇO ESTICADO' : 'NÃO COMPENSA')))}
            </span>
            <span class="text-[9px] text-slate-400 font-mono">Topo: ${extremes.topGpu ? extremes.topGpu.name : 'RTX 5090'}</span>
          </div>

          <!-- Bar 1: Desempenho Absoluto (vs Topo) -->
          <div class="flex items-center gap-1.5">
            <span class="text-sky-400 shrink-0" title="Desempenho Absoluto">${SPEEDOMETER_SVG}</span>
            <div class="h-2 flex-1 bg-slate-950 rounded-full relative overflow-hidden border border-slate-800" title="Desempenho Absoluto: ${absPerfPct.toFixed(0)}% do Topo (${extremes.topGpu ? extremes.topGpu.name : 'RTX 5090'})">
              <div class="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300" style="width: ${absPerfPct.toFixed(1)}%;"></div>
            </div>
            <span class="text-[9px] font-mono text-slate-400 w-7 text-right shrink-0">${absPerfPct.toFixed(0)}%</span>
          </div>

          <!-- Bar 2: Preço Absoluto (vs Teto) -->
          <div class="flex items-center gap-1.5">
            <span class="text-emerald-400 shrink-0 font-bold font-mono text-xs" title="Preço Absoluto">${MONEY_SVG}</span>
            <div class="h-2 flex-1 bg-slate-950 rounded-full relative overflow-hidden border border-slate-800" title="Preço: ${absPricePct.toFixed(0)}% do Teto (${fmtBRLShort(extremes.maxPrice)})">
              <div class="h-full rounded-full ${absPricePct < 25 ? 'bg-emerald-400' : (absPricePct < 50 ? 'bg-sky-400' : (absPricePct < 75 ? 'bg-amber-400' : 'bg-rose-400'))} transition-all duration-300" style="width: ${absPricePct.toFixed(1)}%;"></div>
            </div>
            <span class="text-[9px] font-mono text-slate-400 w-7 text-right shrink-0">${absPricePct.toFixed(0)}%</span>
          </div>

          <div class="flex items-center justify-between text-[10px] text-slate-300 font-mono pt-0.5">
            <span class="font-bold ${isBaseCard ? 'text-emerald-400' : (rel.perfGainPct >= 0 ? 'text-sky-300' : 'text-rose-400')}">
              ${isBaseCard ? '100% Base' : `${rel.perfGainPct >= 0 ? '+' : ''}${rel.perfGainPct.toFixed(0)}% vs Base`}
            </span>
            <span class="font-bold ${absPricePct < 30 ? 'text-emerald-300' : 'text-slate-300'}">
              ${isBaseCard ? fmtBRLShort(g.price_brl) : `${rel.actualDelta >= 0 ? '+' : ''}${fmtBRLShort(rel.actualDelta)}`}
            </span>
          </div>
        </div>
      `;
    } else {
      // 2. MODO RELATIVO: Referência na placa base (50% no centro, nunca corta cedo)
      if (g.slug === baseGpu.slug) {
        verdictCellHTML = `
          <div class="flex flex-col items-end gap-1 font-mono">
            <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold">100% BASE</span>
            <span class="text-[10px] text-slate-500">Referência</span>
          </div>
        `;
      } else {
        let perfWidth = 50;
        if (rel.perfGainPct >= 0) {
          perfWidth = 50 + Math.min(50, (rel.perfGainPct / maxRelPerf) * 50);
        } else {
          perfWidth = Math.max(5, 50 - (Math.abs(rel.perfGainPct) / 100) * 45);
        }

        let priceWidth = 50;
        if (rel.actualDelta >= 0) {
          priceWidth = 50 + Math.min(50, (rel.actualDelta / maxRelPrice) * 50);
        } else {
          priceWidth = Math.max(5, 50 - (Math.abs(rel.actualDelta) / Math.max(1, basePrice)) * 45);
        }

        verdictCellHTML = `
          <div class="space-y-1.5 w-56 ml-auto font-mono text-right">
            <div class="flex items-center justify-between gap-1 text-[10px]">
              <span class="px-2 py-0.5 rounded font-black uppercase tracking-tight ${badgeMap[rel.color] || 'bg-slate-800 text-slate-300'}">
                ${rel.tier === 'steal' ? 'PECHINCHA' : (rel.tier === 'fair' ? (rel.perfGainPct < 0 ? 'ECONOMIA' : 'PREÇO JUSTO') : (rel.tier === 'stretch' ? 'PREÇO ESTICADO' : 'NÃO COMPENSA'))}
              </span>
              <span class="text-[9px] text-slate-400 font-mono">(Justo ≤ +${fmtBRLShort(rel.fairMaxDelta)})</span>
            </div>

            <!-- Bar 1: Desempenho Relativo -->
            <div class="flex items-center gap-1.5">
              <span class="text-sky-400 shrink-0" title="Desempenho Relativo">${SPEEDOMETER_SVG}</span>
              <div class="h-2 flex-1 bg-slate-950 rounded-full relative overflow-hidden border border-slate-800" title="Desempenho: ${rel.perfGainPct >= 0 ? '+' : ''}${rel.perfGainPct.toFixed(0)}% vs ${baseGpu.name}">
                <div class="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600/80 z-20" title="100% Base"></div>
                <div class="h-full rounded-full ${rel.perfGainPct >= 0 ? 'bg-gradient-to-r from-sky-400 to-emerald-400' : 'bg-rose-400'} transition-all duration-300" style="width: ${perfWidth.toFixed(1)}%;"></div>
              </div>
            </div>

            <!-- Bar 2: Preço Relativo -->
            <div class="flex items-center gap-1.5">
              <span class="text-emerald-400 shrink-0 font-bold font-mono text-xs" title="Diferença de Preço">${MONEY_SVG}</span>
              <div class="h-2 flex-1 bg-slate-950 rounded-full relative overflow-hidden border border-slate-800" title="Preço: ${rel.actualDelta >= 0 ? '+' : ''}${fmtBRLShort(rel.actualDelta)} vs ${baseGpu.name}">
                <div class="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600/80 z-20" title="Preço Base"></div>
                <div class="h-full rounded-full ${rel.actualDelta <= 0 ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : (rel.actualDelta <= rel.fairMaxDelta ? 'bg-sky-400' : 'bg-amber-400')} transition-all duration-300" style="width: ${priceWidth.toFixed(1)}%;"></div>
              </div>
            </div>

            <div class="flex items-center justify-between text-[10px] text-slate-300 font-mono pt-0.5">
              <span class="font-bold ${rel.perfGainPct >= 0 ? 'text-sky-300' : 'text-rose-400'}">
                ${rel.perfGainPct >= 0 ? '+' : ''}${rel.perfGainPct.toFixed(0)}% perf
              </span>
              <span class="font-bold ${rel.actualDelta <= rel.fairMaxDelta ? 'text-emerald-300' : 'text-amber-300'}">
                ${rel.actualDelta >= 0 ? '+' : ''}${fmtBRLShort(rel.actualDelta)}
              </span>
            </div>
          </div>
        `;
      }
    }

    return `
      <tr class="hover:bg-slate-800/50 transition">
        <td class="py-3 px-3 font-mono text-slate-400">${idx + 1}</td>
        <td class="py-3 px-3">
          <div class="font-bold text-white text-sm flex flex-wrap items-center">
            <span>${g.name}</span>
            ${vramCloudBadge}
          </div>
          ${(techBadge || flashBadge || couponBadge) ? `<div class="flex flex-wrap items-center gap-1.5 mt-1.5">${techBadge} ${flashBadge} ${couponBadge}</div>` : ''}
          <div class="text-[11px] text-slate-400 font-mono mt-1">
            ${g.brand} ${g.arch} • TDP ${g.tdp_w}W • Jogos Efetivo: <span class="text-emerald-300 font-bold">${typeof getEffectiveGamingScore === 'function' ? getEffectiveGamingScore(g) : g.gaming_score}</span> | IA: <span class="text-purple-300">${g._effectiveAI}</span> (~${g.llm_14b_tok_s} tok/s 14B)
          </div>
        </td>
        <td class="py-3 px-3 text-right font-mono">
          <span class="font-bold ${g._flashPromo ? 'text-emerald-400' : 'text-white'} text-sm block">${fmtBRL(g.price_brl)}</span>
          ${g._flashPromo ? `<span class="text-[10px] text-slate-500 line-through block">Base: ${fmtBRLShort(g._hbPrice)}</span>` : ''}
          <a href="${g.offer_url}" target="_blank" class="text-[10px] text-sky-400 hover:underline">${g.store_name} ↗</a>
        </td>
        <td class="py-3 px-3 text-right font-mono ${cols.target ? '' : 'hidden'}">
          <span class="font-bold text-emerald-300 text-xs block">${fmtBRL(g.price_stats.target_price)}</span>
          <span class="text-[10px] text-sky-400 font-medium block">BF: ${fmtBRLShort(g.price_stats.min_90d * 0.95)} ~ ${fmtBRLShort(g.price_stats.target_price)}</span>
          <span class="text-[9px] text-slate-500">Mín 90d: ${fmtBRLShort(g.price_stats.min_90d)}</span>
        </td>
        <td class="py-3 px-3 text-center ${cols.trend ? '' : 'hidden'}">
          ${getPriceStatusBadgeHTML(g)}
        </td>
        <td class="py-3 px-3 text-center">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700">
            <span class="font-mono font-extrabold text-sm ${g._myCBScore >= 80 ? 'text-emerald-400' : (g._myCBScore >= 65 ? 'text-sky-400' : 'text-amber-400')}">${g._myCBScore}/100</span>
            ${diffCBHtml}
          </div>
        </td>
        <td class="py-3 px-3 text-center font-mono text-slate-400 ${cols.hb_cb ? '' : 'hidden'}">
          ${g.hb_cb_score || '--'}/100
        </td>
        <td class="py-3 px-3 text-right font-mono ${cols.rel_verdict ? '' : 'hidden'}">
          ${verdictCellHTML}
        </td>
        <td class="py-3 px-3 text-center ${cols.actions ? '' : 'hidden'}">
          <div class="flex items-center justify-center gap-1">
            <button onclick="setDuelPair('${g.slug}', '${baseGpu.slug}')" class="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-300 text-[11px] font-semibold transition cursor-pointer" title="Analisar no Duelo Relacional">
              Duelo
            </button>
            <button onclick="selectGPUForBuild('${g.slug}')" class="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 text-[11px] font-semibold transition cursor-pointer" title="Usar esta GPU no Meu PC">
              Usar no PC
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderCBScatterChart(rows);
}

function renderCBScatterChart(rows) {
  const ctx = document.getElementById('chart-cb-scatter').getContext('2d');
  if (chartCBScatter) chartCBScatter.destroy();

  const metric = STATE.cbChartMetric || 'benefit';
  const filtered = rows.filter(g => g.price_brl <= 15000 && g.slug !== 'rx-580-8gb-ref');
  const points = filtered.map(g => ({
    x: g.price_brl,
    y: metric === 'benefit' ? g._myCBScore : g._compositeScore,
    name: g.name,
    vram: g.vram_gb,
    slug: g.slug,
    cb: g._myCBScore,
    rawScore: g._compositeScore
  }));

  chartCBScatter = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: metric === 'benefit' ? 'GPUs (Preço vs Custo-Benefício)' : 'GPUs (Preço vs Performance Bruta)',
        data: points,
        backgroundColor: points.map(p => p.cb >= 80 ? '#10b981' : (p.cb >= 65 ? '#38bdf8' : (p.vram >= 16 ? '#a855f7' : '#94a3b8'))),
        pointRadius: 6,
        pointHoverRadius: 9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (e, elements) => {
        if (elements.length > 0) {
          const idx = elements[0].index;
          const pt = points[idx];
          if (pt) setDuelPair(pt.slug, STATE.cbRelBaseSlug);
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => {
              const r = c.raw;
              return `${r.name} (${r.vram}GB) — ${fmtBRL(r.x)} | ${metric === 'benefit' ? `Custo-Benefício: ${r.cb}/100 (Score Bruto: ${r.rawScore})` : `Score Bruto: ${r.rawScore} (CB: ${r.cb}/100)`}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: `Preço Atual (${STATE.market?.monetary?.currency_symbol || 'R$'})`, color: '#94a3b8' },
          ticks: { color: '#94a3b8', callback: v => formatMoneyShort(v) },
          grid: { color: 'rgba(51,65,85,0.3)' }
        },
        y: {
          title: {
            display: true,
            text: metric === 'benefit' ? 'Índice de Custo-Benefício (0–100, Maior = Mais Vantajoso)' : 'Score Contextual Bruto (Jogos + IA + Engenharia)',
            color: '#94a3b8'
          },
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(51,65,85,0.3)' }
        }
      }
    }
  });
}

// ============================================================================
// TAB 3: MEU PC, CONSUMO DE ENERGIA (WATTS) & O QUE FALTA
// ============================================================================
function selectGPUForBuild(slug) {
  const g = DB.gpus.find(x => x.slug === slug);
  if (!g) return;
  STATE.build.gpu = {
    slug: g.slug,
    name: `${g.name} (${g.vram_gb}GB)`,
    tdp: g.tdp_w,
    price: g.price_brl,
    owned: false
  };
  switchTab('builder');
}

async function detectMyLocalPC(applyToRef = false) {
  const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
  if (isStatic) {
    if (typeof showToast === 'function') showToast('Modo Nuvem GitHub: Edite e personalize os componentes da sua máquina nos seletores.');
    return;
  }
  const banner = document.getElementById(applyToRef ? 'cfg-ref-parts-container' : 'detected-pc-summary');
  const summaryEl = document.getElementById('detected-pc-summary');
  if (summaryEl) summaryEl.textContent = 'Consultando hardware local via API Windows (CIM/WMI)...';

  try {
    const res = await fetch('/api/my-pc');
    const info = await res.json();
    if (info && info.cpu_name) {
      if (summaryEl) {
        summaryEl.innerHTML = `
          <strong>Processador Detectado:</strong> ${info.cpu_name} (${info.cpu_cores}C/${info.cpu_threads}T) •
          <strong>Placa-Mãe:</strong> ${info.mobo_vendor} ${info.mobo_model} •
          <strong>Memória RAM:</strong> ${info.ram_gb} GB (${info.ram_speed} MT/s) •
          <strong>GPU Detectada:</strong> ${info.gpu_name}
        `;
      }

      const ramType = (info.ram_speed || 2400) >= 4400 ? 'DDR5' : 'DDR4';
      const matchedCpu = (DB.cpus || []).find(c => c.name && info.cpu_name && (info.cpu_name.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(info.cpu_name.toLowerCase())));
      const matchedGpu = (DB.gpus || []).find(g => g.name && info.gpu_name && (info.gpu_name.toLowerCase().includes(g.name.toLowerCase()) || g.name.toLowerCase().includes(info.gpu_name.toLowerCase())));

      const detectedObj = {
        cpu: {
          slug: matchedCpu ? matchedCpu.slug : 'detected-cpu',
          name: `${info.cpu_name} (${info.cpu_cores}C/${info.cpu_threads}T)`,
          tdp: matchedCpu ? matchedCpu.tdp_w : 95,
          price: matchedCpu ? matchedCpu.price_brl : 450,
          owned: true,
          benchmark: matchedCpu ? matchedCpu.benchmark : (info.cpu_cores >= 8 ? 6000 : 3500),
          socket: matchedCpu ? matchedCpu.socket : 'Detectado'
        },
        mobo: {
          slug: 'detected-mobo',
          name: `${info.mobo_vendor} ${info.mobo_model}`,
          tdp: 35,
          price: 350,
          owned: true,
          socket: matchedCpu ? matchedCpu.socket : 'Detectado',
          memory_type: ramType
        },
        ram: {
          slug: `detected-${info.ram_gb}gb`,
          name: `${info.ram_gb} GB ${ramType} ${info.ram_speed || 3200} MT/s`,
          tdp: 10,
          price: 240,
          owned: true,
          capacity_gb: info.ram_gb || 16,
          memory_type: ramType
        },
        gpu: matchedGpu ? {
          slug: matchedGpu.slug,
          name: matchedGpu.name,
          tdp: matchedGpu.tdp_w,
          price: matchedGpu.price_brl,
          owned: true
        } : {
          slug: 'detected-gpu',
          name: info.gpu_name || 'GPU Integrada',
          tdp: 75,
          price: 0,
          owned: true
        }
      };

      if (applyToRef === true) {
        STATE.refPC.cpu = detectedObj.cpu;
        STATE.refPC.mobo = detectedObj.mobo;
        STATE.refPC.ram = detectedObj.ram;
        STATE.refPC.gpu = detectedObj.gpu;
        saveUserRefPrefs();
        renderConfigTab();
        if (typeof showToast === 'function') showToast('Hardware local aplicado ao seu PC de Referência!');
      } else if (applyToRef === false) {
        STATE.build.cpu = detectedObj.cpu;
        STATE.build.mobo = detectedObj.mobo;
        STATE.build.ram = detectedObj.ram;
        STATE.build.gpu = detectedObj.gpu;
        saveUserBuildPrefs();
        renderPCBuilder();
        if (typeof showToast === 'function') showToast('Hardware local copiado para Objetivo de Compra!');
      }
      // if applyToRef === null, only the banner summary is updated without mutating stored setup
    }
  } catch (e) {
    if (summaryEl) summaryEl.textContent = 'Não foi possível consultar automaticamente; edite os campos manualmente abaixo.';
  }
}

function renderPCBuilder() {
  const container = document.getElementById('builder-parts-container');
  const db = window.DB || DB;
  if (!container || !db || !db.gpus || db.gpus.length === 0) return;

  const curGpu = STATE.build.gpu || {};
  const curCpu = STATE.build.cpu || {};
  const curMobo = STATE.build.mobo || {};
  const curRam = STATE.build.ram || {};
  const curPsu = STATE.build.psu || {};
  const curStorage = STATE.build.storage || {};
  const curCooling = STATE.build.cooling || {};

  const { filteredMobos, targetRamType, filteredRams } = getFilteredMoboAndRamOptions(curCpu.slug, curMobo.slug, curRam.slug);

  const gpuOptions = `<option value="" ${!curGpu.slug ? 'selected' : ''}>-- (Nenhum / Sem GPU Dedicada) --</option>` + (db.gpus || []).map(g =>
    `<option value="${g.slug}" ${curGpu.slug === g.slug ? 'selected' : ''}>${g.name} (${g.vram_gb}GB) — ${fmtBRL(g.price_brl)} [${g.tdp_w}W]</option>`
  ).join('');

  const cpuOptions = `<option value="" ${!curCpu.slug ? 'selected' : ''}>-- (Nenhum / Sem Processador) --</option>` + (db.cpus || []).map(c =>
    `<option value="${c.slug}" ${curCpu.slug === c.slug ? 'selected' : ''}>${c.name} (${c.socket}) — ${fmtBRL(c.price_brl)} [${c.tdp_w}W]</option>`
  ).join('');

  const moboOptions = `<option value="" ${!curMobo.slug ? 'selected' : ''}>-- (Nenhum / Sem Placa-Mãe) --</option>` + filteredMobos.map(m =>
    `<option value="${m.slug}" ${curMobo.slug === m.slug ? 'selected' : ''}>${m.name} (${m.socket}/${m.memory_type}) — ${fmtBRL(m.price_brl)}</option>`
  ).join('');

  const ramOptions = `<option value="" ${!curRam.slug ? 'selected' : ''}>-- (Nenhum / Sem Memória RAM) --</option>` + filteredRams.slice(0, 50).map(r =>
    `<option value="${r.slug}" ${curRam.slug === r.slug ? 'selected' : ''}>${r.name} — ${fmtBRL(r.price_brl)}</option>`
  ).join('');

  const psuOptions = `<option value="" ${!curPsu.slug ? 'selected' : ''}>-- (Nenhum / Sem Fonte) --</option>` + (db.psus || []).slice(0, 60).map(p =>
    `<option value="${p.slug}" ${curPsu.slug === p.slug ? 'selected' : ''}>${p.name} (${p.watts}W) — ${fmtBRL(p.price_brl)}</option>`
  ).join('');

  container.innerHTML = `
    <!-- GPU ROW -->
    <div class="p-3.5 rounded-xl bg-slate-900/80 border border-sky-500/40 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
      <div class="md:col-span-2">
        <span class="text-[10px] font-mono uppercase text-sky-400 font-bold block">Placa de Vídeo (GPU)</span>
        <span class="text-xs text-slate-300 font-semibold">Peça Principal</span>
      </div>
      <div class="md:col-span-5">
        <select onchange="onBuilderCatalogPick('gpu', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white mb-1">${gpuOptions}</select>
        <input type="text" value="${curGpu.name || ''}" oninput="updateBuildField('gpu', 'name', this.value)" class="w-full bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300" placeholder="Nome customizado da GPU" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">TDP / Consumo (W)</label>
        <input type="number" value="${curGpu.tdp || 0}" oninput="updateBuildField('gpu', 'tdp', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-400" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (<span class="currency-sym">${STATE.market?.monetary?.currency_symbol || 'R$'}</span>)</label>
        <input type="number" value="${curGpu.price || 0}" oninput="updateBuildField('gpu', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${curGpu.owned ? 'checked' : ''} onchange="updateBuildField('gpu', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
      </div>
    </div>

    <!-- CPU ROW -->
    <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
      <div class="md:col-span-2">
        <span class="text-[10px] font-mono uppercase text-slate-400 font-bold block">Processador (CPU)</span>
        <span class="text-xs text-slate-300 font-semibold">Cérebro / Socket</span>
      </div>
      <div class="md:col-span-5">
        <select onchange="onBuilderCatalogPick('cpu', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white mb-1">${cpuOptions}</select>
        <input type="text" value="${curCpu.name || ''}" oninput="updateBuildField('cpu', 'name', this.value)" class="w-full bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">TDP / Consumo (W)</label>
        <input type="number" value="${curCpu.tdp || 0}" oninput="updateBuildField('cpu', 'tdp', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-400" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (<span class="currency-sym">${STATE.market?.monetary?.currency_symbol || 'R$'}</span>)</label>
        <input type="number" value="${curCpu.price || 0}" oninput="updateBuildField('cpu', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${curCpu.owned ? 'checked' : ''} onchange="updateBuildField('cpu', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
      </div>
    </div>

    <!-- MOTHERBOARD ROW -->
    <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
      <div class="md:col-span-2">
        <span class="text-[10px] font-mono uppercase text-slate-400 font-bold block">Placa-Mãe</span>
        <span class="text-xs text-slate-300 font-semibold">Chipset / VRM</span>
      </div>
      <div class="md:col-span-5">
        <select onchange="onBuilderCatalogPick('mobo', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white mb-1">${moboOptions}</select>
        <input type="text" value="${curMobo.name || ''}" oninput="updateBuildField('mobo', 'name', this.value)" class="w-full bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Consumo (W)</label>
        <input type="number" value="${curMobo.tdp || 0}" oninput="updateBuildField('mobo', 'tdp', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-400" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (<span class="currency-sym">${STATE.market?.monetary?.currency_symbol || 'R$'}</span>)</label>
        <input type="number" value="${curMobo.price || 0}" oninput="updateBuildField('mobo', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${curMobo.owned ? 'checked' : ''} onchange="updateBuildField('mobo', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
      </div>
    </div>

    <!-- RAM ROW -->
    <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
      <div class="md:col-span-2">
        <span class="text-[10px] font-mono uppercase text-purple-400 font-bold block">Memória RAM</span>
        <span class="text-xs text-slate-300 font-semibold">Crítico p/ IA & Multitarefa</span>
      </div>
      <div class="md:col-span-5">
        <select onchange="onBuilderCatalogPick('ram', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white mb-1">${ramOptions}</select>
        <input type="text" value="${curRam.name || ''}" oninput="updateBuildField('ram', 'name', this.value)" class="w-full bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Consumo (W)</label>
        <input type="number" value="${curRam.tdp || 0}" oninput="updateBuildField('ram', 'tdp', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-400" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (<span class="currency-sym">${STATE.market?.monetary?.currency_symbol || 'R$'}</span>)</label>
        <input type="number" value="${curRam.price || 0}" oninput="updateBuildField('ram', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${curRam.owned ? 'checked' : ''} onchange="updateBuildField('ram', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
      </div>
    </div>

    <!-- PSU ROW -->
    <div class="p-3.5 rounded-xl bg-slate-900/80 border border-amber-500/40 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
      <div class="md:col-span-2">
        <span class="text-[10px] font-mono uppercase text-amber-400 font-bold block">Fonte (PSU)</span>
        <span class="text-xs text-slate-300 font-semibold">Potência Total (W)</span>
      </div>
      <div class="md:col-span-5">
        <select onchange="onBuilderCatalogPick('psu', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white mb-1">${psuOptions}</select>
        <input type="text" value="${curPsu.name || ''}" oninput="updateBuildField('psu', 'name', this.value)" class="w-full bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-amber-300 block">Potência Fonte (W)</label>
        <input type="number" value="${curPsu.watts || 0}" oninput="updateBuildField('psu', 'watts', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-amber-500/50 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-300" step="50" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (<span class="currency-sym">${STATE.market?.monetary?.currency_symbol || 'R$'}</span>)</label>
        <input type="number" value="${curPsu.price || 0}" oninput="updateBuildField('psu', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${curPsu.owned ? 'checked' : ''} onchange="updateBuildField('psu', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
      </div>
    </div>

    <!-- STORAGE & COOLING ROW -->
    <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
      <div class="md:col-span-2">
        <span class="text-[10px] font-mono uppercase text-slate-400 font-bold block">SSD, Cooler & Fans</span>
        <span class="text-xs text-slate-300 font-semibold">Restante do Setup</span>
      </div>
      <div class="md:col-span-5">
        <input type="text" value="${curStorage.name || ''}" oninput="updateBuildField('storage', 'name', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Consumo (W)</label>
        <input type="number" value="${(curStorage.tdp || 0) + (curCooling.tdp || 0)}" oninput="updateBuildField('storage', 'tdp', parseFloat(this.value)||0); if (STATE.build.cooling) STATE.build.cooling.tdp=0;" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-400" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (<span class="currency-sym">${STATE.market?.monetary?.currency_symbol || 'R$'}</span>)</label>
        <input type="number" value="${curStorage.price || 0}" oninput="updateBuildField('storage', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${curStorage.owned ? 'checked' : ''} onchange="updateBuildField('storage', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
      </div>
    </div>
  `;

  updateBuilderPowerAndDiagnostics();
}

function onBuilderCatalogPick(partKey, slug) {
  if (!STATE.build) STATE.build = {};
  if (!STATE.build[partKey]) STATE.build[partKey] = {};

  if (!slug) {
    if (partKey === 'gpu') STATE.build.gpu = { slug: '', name: '', tdp: 0, price: 0, owned: false };
    else if (partKey === 'cpu') STATE.build.cpu = { slug: '', name: '', tdp: 0, price: 0, owned: false, benchmark: 0, socket: '' };
    else if (partKey === 'mobo') STATE.build.mobo = { slug: '', name: '', tdp: 0, price: 0, owned: false, socket: '', memory_type: '' };
    else if (partKey === 'ram') STATE.build.ram = { slug: '', name: '', tdp: 0, price: 0, owned: false, capacity_gb: 0, memory_type: 'DDR4' };
    else if (partKey === 'psu') STATE.build.psu = { slug: '', name: '', watts: 0, price: 0, owned: false };
    saveUserBuildPrefs();
    renderPCBuilder();
    return;
  }

  if (partKey === 'gpu') {
    const g = DB.gpus.find(x => x.slug === slug);
    if (g) STATE.build.gpu = { slug: g.slug, name: `${g.name} (${g.vram_gb}GB)`, tdp: g.tdp_w, price: g.price_brl, owned: STATE.build.gpu ? STATE.build.gpu.owned : true };
  } else if (partKey === 'cpu') {
    const c = DB.cpus.find(x => x.slug === slug);
    if (c) {
      STATE.build.cpu = { slug: c.slug, name: c.name, tdp: c.tdp_w, price: c.price_brl, owned: STATE.build.cpu ? STATE.build.cpu.owned : true, benchmark: c.benchmark, socket: c.socket };
      const simCpuSel = document.getElementById('sim-select-cpu');
      if (simCpuSel) simCpuSel.value = c.slug;

      // Reconcile Mobo if socket changed
      const cpuSock = (c.socket || '').toUpperCase().trim();
      const curMoboSock = ((STATE.build.mobo && STATE.build.mobo.socket) || '').toUpperCase().trim();
      const mobos = DB.motherboards || [];
      const compatibleMobos = mobos.filter(m => (m.socket || '').toUpperCase().trim() === cpuSock);
      if (cpuSock && curMoboSock && curMoboSock !== cpuSock && compatibleMobos.length > 0) {
        const defaultMobo = compatibleMobos[0];
        STATE.build.mobo = { slug: defaultMobo.slug, name: defaultMobo.name, tdp: defaultMobo.tdp_w || 35, price: defaultMobo.price_brl, owned: false, socket: defaultMobo.socket, memory_type: defaultMobo.memory_type };
      }

      // Reconcile RAM if memory standard changed (DDR4 vs DDR5)
      let targetMem = '';
      if (cpuSock === 'AM4' || cpuSock === 'LGA2011-3') targetMem = 'DDR4';
      else if (cpuSock === 'AM5' || cpuSock === 'LGA1851') targetMem = 'DDR5';
      else if (cpuSock === 'LGA1700' && STATE.build.mobo?.memory_type) targetMem = STATE.build.mobo.memory_type.toUpperCase();

      if (targetMem && STATE.build.ram?.memory_type && STATE.build.ram.memory_type.toUpperCase() !== targetMem) {
        const compatibleRams = (DB.rams || []).filter(r => (r.memory_type || '').toUpperCase() === targetMem);
        if (compatibleRams.length > 0) {
          const defaultRam = compatibleRams[0];
          STATE.build.ram = { slug: defaultRam.slug, name: defaultRam.name, tdp: defaultRam.tdp_w || 10, price: defaultRam.price_brl, owned: false, capacity_gb: defaultRam.capacity_gb || 16, memory_type: defaultRam.memory_type || targetMem };
        }
      }
    }
  } else if (partKey === 'mobo') {
    const m = DB.motherboards.find(x => x.slug === slug);
    if (m) {
      STATE.build.mobo = { slug: m.slug, name: m.name, tdp: m.tdp_w, price: m.price_brl, owned: STATE.build.mobo ? STATE.build.mobo.owned : true, socket: m.socket, memory_type: m.memory_type };
      if (m.memory_type && STATE.build.ram?.memory_type && STATE.build.ram.memory_type.toUpperCase() !== m.memory_type.toUpperCase()) {
        const compatibleRams = (DB.rams || []).filter(r => (r.memory_type || '').toUpperCase() === m.memory_type.toUpperCase());
        if (compatibleRams.length > 0) {
          const defaultRam = compatibleRams[0];
          STATE.build.ram = { slug: defaultRam.slug, name: defaultRam.name, tdp: defaultRam.tdp_w || 10, price: defaultRam.price_brl, owned: false, capacity_gb: defaultRam.capacity_gb || 16, memory_type: defaultRam.memory_type || m.memory_type };
        }
      }
    }
  } else if (partKey === 'ram') {
    const r = DB.rams.find(x => x.slug === slug);
    if (r) STATE.build.ram = { slug: r.slug, name: r.name, tdp: r.tdp_w, price: r.price_brl, owned: STATE.build.ram ? STATE.build.ram.owned : true, capacity_gb: r.capacity_gb, memory_type: r.memory_type };
  } else if (partKey === 'psu') {
    const p = DB.psus.find(x => x.slug === slug);
    if (p) STATE.build.psu = { slug: p.slug, name: p.name, watts: p.watts, price: p.price_brl, owned: STATE.build.psu ? STATE.build.psu.owned : true };
  }
  saveUserBuildPrefs();
  renderPCBuilder();
}

function updateBuildField(partKey, field, value) {
  if (!STATE.build[partKey]) STATE.build[partKey] = {};
  STATE.build[partKey][field] = value;
  saveUserBuildPrefs();
  updateBuilderPowerAndDiagnostics();
}

function updateBuilderPowerAndDiagnostics() {
  const b = STATE.build || {};
  const gpu = b.gpu || {};
  const cpu = b.cpu || {};
  const mobo = b.mobo || {};
  const ram = b.ram || {};
  const storage = b.storage || {};
  const cooling = b.cooling || {};
  const psu = b.psu || {};

  const typicalLoad = Math.round((gpu.tdp || 0) + (cpu.tdp || 0) + (mobo.tdp || 0) + (ram.tdp || 0) + (storage.tdp || 0) + (cooling.tdp || 0));
  // Modern GPUs have 15-25% transient power spikes; recommended PSU should keep typical load around ~70-75%
  const peakTransient = Math.round(typicalLoad * 1.18);
  const recommendedPSU = Math.ceil((typicalLoad * 1.35) / 50) * 50;

  const psuWatts = psu.watts || 500;
  const loadPct = Math.round((typicalLoad / Math.max(1, psuWatts)) * 100);

  const typEl = document.getElementById('pwr-typical-val');
  const peakEl = document.getElementById('pwr-peak-val');
  const recEl = document.getElementById('pwr-rec-val');
  const psuEl = document.getElementById('pwr-psu-watts');
  const loadEl = document.getElementById('pwr-load-pct');

  if (typEl) typEl.textContent = `${typicalLoad}W`;
  if (peakEl) peakEl.textContent = `${peakTransient}W`;
  if (recEl) recEl.textContent = `${recommendedPSU}W`;
  if (psuEl) psuEl.textContent = `${psuWatts}W`;
  if (loadEl) loadEl.textContent = `${loadPct}%`;

  const bar = document.getElementById('pwr-load-bar');
  const pill = document.getElementById('power-status-pill');
  const advice = document.getElementById('pwr-advice-text');

  if (bar) bar.style.width = `${Math.min(100, loadPct)}%`;
  if (pill && advice && bar) {
    if (psuWatts >= recommendedPSU) {
      bar.className = 'h-full rounded-full transition-all duration-300 bg-emerald-500';
      pill.className = 'text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
      pill.textContent = '✅ FOLGA SEGURA';
      advice.innerHTML = `Sua fonte de <strong>${psuWatts}W</strong> opera com <strong>${loadPct}% de carga típica</strong> (${typicalLoad}W), suportando com folga picos transientes de até ${peakTransient}W.`;
    } else if (psuWatts >= peakTransient) {
      bar.className = 'h-full rounded-full transition-all duration-300 bg-amber-500';
      pill.className = 'text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40';
      pill.textContent = '⚠️ NO LIMITE';
      advice.innerHTML = `Sua fonte de <strong>${psuWatts}W</strong> aguenta os ${typicalLoad}W, mas fica apertada para picos transientes (${peakTransient}W). Recomendamos uma fonte de <strong>${recommendedPSU}W</strong>.`;
    } else {
      bar.className = 'h-full rounded-full transition-all duration-300 bg-rose-600';
      pill.className = 'text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40';
      pill.textContent = '🚨 FONTE INSUFICIENTE';
      advice.innerHTML = `<strong>Perigo de desligamento:</strong> O consumo de pico (${peakTransient}W) supera sua fonte de ${psuWatts}W! Troque por uma fonte de pelo menos <strong>${recommendedPSU}W</strong>.`;
    }
  }

  // Builder Socket & VRM Compatibility Banner
  const compatEl = document.getElementById('builder-compat-banner');
  if (compatEl) {
    const comp = checkCpuMoboCompatibility(cpu, mobo);
    compatEl.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-xs font-mono font-bold px-2.5 py-1 rounded-lg ${comp.badgeClass}">[${comp.flag}] ${comp.label}</span>
        <span class="text-xs text-slate-300 leading-snug">${comp.message}</span>
      </div>
    `;
  }

  // Recommend top 3 PSUs from Database that meet recommendedPSU
  if (DB && DB.psus) {
    const recPsus = DB.psus
      .filter(p => p.watts >= recommendedPSU && p.price_brl > 150)
      .sort((a, b) => a.price_brl - b.price_brl)
      .slice(0, 3);

    const recPsuEl = document.getElementById('pwr-recommended-psus');
    if (recPsuEl) {
      recPsuEl.innerHTML = recPsus.map(p => `
        <div class="flex items-center justify-between bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
          <div>
            <span class="text-xs font-bold text-white block">${p.name}</span>
            <span class="text-[10px] font-mono text-amber-300">${p.watts}W • ${p.efficiency || '80 Plus Bronze'}</span>
          </div>
          <div class="text-right">
            <span class="text-xs font-mono font-bold text-emerald-400 block">${fmtBRL(p.price_brl)}</span>
            ${p.offer_url ? `<a href="${p.offer_url}" target="_blank" class="text-[10px] text-sky-400 hover:underline">Ver Oferta ↗</a>` : ''}
          </div>
        </div>
      `).join('');
    }
  }

  // Calculate Missing Parts & Budget
  const partsList = [
    { key: 'gpu', label: 'Placa de Vídeo', item: b.gpu },
    { key: 'cpu', label: 'Processador', item: b.cpu },
    { key: 'mobo', label: 'Placa-Mãe', item: b.mobo },
    { key: 'ram', label: 'Memória RAM', item: b.ram },
    { key: 'psu', label: 'Fonte (PSU)', item: b.psu },
    { key: 'storage', label: 'SSD & Refrigeração', item: b.storage }
  ];

  let toBuyTotal = 0;
  let ownedTotal = 0;
  const missingHTML = [];

  partsList.forEach(p => {
    if (p.item.owned) {
      ownedTotal += (p.item.price || 0);
      missingHTML.push(`
        <div class="flex items-center justify-between py-1.5 px-2.5 rounded bg-slate-900/50 border border-slate-800/70 opacity-75">
          <span>✅ <strong>${p.label}:</strong> ${p.item.name}</span>
          <span class="font-mono text-[11px] text-emerald-400">Já Possui</span>
        </div>
      `);
    } else {
      toBuyTotal += (p.item.price || 0);
      missingHTML.push(`
        <div class="flex items-center justify-between py-1.5 px-2.5 rounded bg-sky-950/30 border border-sky-500/30">
          <span>🛒 <strong>Falta Comprar (${p.label}):</strong> ${p.item.name}</span>
          <span class="font-mono font-bold text-white">${fmtBRL(p.item.price)}</span>
        </div>
      `);
    }
  });

  document.getElementById('builder-missing-list').innerHTML = missingHTML.join('');
  document.getElementById('builder-total-to-buy').textContent = fmtBRL(toBuyTotal);
  document.getElementById('builder-owned-summary').textContent = `Valor estimado das peças que já possui: ${fmtBRL(ownedTotal)}`;

  // Compatibility & Bottleneck Diagnostics (Dynamic, based on user's configured PC)
  const diags = [];
  const gpuObj = DB.gpus.find(g => g.slug === b.gpu.slug) || DB.gpus[0];
  const cpuBench = b.cpu.benchmark || 4000;
  const gpuScore = gpuObj ? (gpuObj.gaming_score || 3000) : 3000;
  const isHeavyGpu = gpuScore >= 4500;
  const isMidGpu = gpuScore >= 3200;

  if (cpuBench < 3000 && isMidGpu) {
    const estLimit = isHeavyGpu ? '20% a 30%' : '10% a 18%';
    diags.push(`
      <div class="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200">
        <strong>⚠️ Análise de Gargalo do Processador (${b.cpu.name || 'CPU Atual'}):</strong>
        Em resolução 1080p com alta taxa de quadros, este processador pode limitar o potencial máximo da <strong>${gpuObj.name}</strong> em aproximadamente ${estLimit}.
        Em resoluções mais altas (<strong>1440p / 4K</strong>) ou em tarefas focadas em <strong>IA / Renderização</strong>, a demanda passa a ser quase 100% da GPU, reduzindo o impacto da CPU.
      </div>
    `);
  }

  const ramCapacity = b.ram.capacity_gb || 16;
  if (ramCapacity <= 16 && (STATE.wAI >= 25 || STATE.wSoft >= 20)) {
    diags.push(`
      <div class="p-3 rounded-xl bg-sky-950/40 border border-sky-500/40 text-xs text-sky-200">
        <strong>🧠 Avaliação de Capacidade de Memória (${ramCapacity} GB RAM):</strong>
        Para cargas de <strong>IA Local (LLMs 14B+)</strong>, multitarefa intensa e softwares de engenharia/produtividade, ${ramCapacity} GB podem ficar próximos do limite.
        Um upgrade para <strong>32 GB ou mais</strong> oferece maior margem para buffers e execução paralela sem recorrer à memória virtual no disco.
      </div>
    `);
  }

  document.getElementById('builder-diagnostics-box').innerHTML = diags.join('');
}

// ============================================================================
// TAB 4: SIMULADOR DE FPS, IA (LLMs / DIFFUSION) & SOFTWARES
// ============================================================================
function renderSimulatorLegacy() {
  const slugA = document.getElementById('sim-select-gpu-a').value || STATE.build.gpu.slug;
  const slugB = document.getElementById('sim-select-gpu-b').value || STATE.duelBaseSlug;
  const res = ({ '768p': '1080p', '900p': '1080p', '1080p': '1080p', 'uw1080p': '1440p', '1440p': '1440p', 'uw1440p': '4k', '4k': '4k' })[STATE.monitorRes] || '1440p';
  const upscale = document.getElementById('sim-select-upscale').value || 'native';

  const gpuA = DB.gpus.find(g => g.slug === slugA) || DB.gpus[0];
  const gpuB = DB.gpus.find(g => g.slug === slugB) || DB.gpus[1];
  if (!gpuA || !gpuB) return;

  // CPU bottleneck factor from current build
  const cpuBench = STATE.build.cpu.benchmark || 3000;
  const cpuFactor1080 = cpuBench < 3000 ? 0.82 : (cpuBench < 5000 ? 0.93 : 1.0);
  const cpuFactor = res === '1080p' ? cpuFactor1080 : (res === '1440p' ? Math.min(1.0, cpuFactor1080 + 0.10) : 1.0);

  document.getElementById('sim-cpu-factor-badge').textContent =
    cpuFactor < 0.98 ? `CPU Atual (${Math.round(cpuFactor * 100)}% em ${res})` : `Sem Gargalo CPU (${res})`;

  const resMult = res === '1080p' ? 1.32 : (res === '1440p' ? 1.0 : 0.56);
  const upMult = upscale === 'upscale' ? 1.36 : 1.0;

  // 1. Games FPS List (calibrated against RTX 5060 = 3138 benchmark & RTX 5070 = 5077 benchmark)
  const games = [
    { title: 'Cyberpunk 2077 (Ray Tracing / Ultra)', base5060_1440p: 48, vramReq: 10 },
    { title: 'Black Myth: Wukong (High / Global Illum.)', base5060_1440p: 54, vramReq: 10 },
    { title: 'Alan Wake 2 (Ultra)', base5060_1440p: 50, vramReq: 10 },
    { title: 'GTA V Enhanced / Red Dead Redemption 2 (Ultra)', base5060_1440p: 88, vramReq: 8 },
    { title: 'Minecraft Java + Distant Horizons + Shaders', base5060_1440p: 95, vramReq: 8 },
    { title: 'Counter-Strike 2 / Valorant (Competitivo)', base5060_1440p: 260, vramReq: 4 }
  ];

  function calcFPS(gpu, game) {
    const ratio = (gpu.gaming_score || 1500) / 3138.0;
    let vramPenalty = 1.0;
    if ((res === '1440p' || res === '4k') && gpu.vram_gb < game.vramReq) {
      vramPenalty = 0.80; // 8GB VRAM stutter/texture penalty in 1440p/4K heavy games
    }
    return Math.round(game.base5060_1440p * ratio * resMult * upMult * cpuFactor * vramPenalty);
  }

  document.getElementById('sim-games-list').innerHTML = games.map(gm => {
    const fpsA = calcFPS(gpuA, gm);
    const fpsB = calcFPS(gpuB, gm);
    const maxFps = Math.max(fpsA, fpsB, 120);
    return `
      <div class="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5">
        <div class="flex justify-between text-xs font-semibold text-white">
          <span>${gm.title}</span>
          <span class="font-mono text-emerald-400">+${Math.round(((fpsA / Math.max(1, fpsB)) - 1) * 100)}%</span>
        </div>
        <div class="space-y-1 text-[11px] font-mono">
          <div class="flex items-center gap-2">
            <span class="w-24 truncate text-sky-300">${gpuA.name}:</span>
            <div class="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
              <div class="h-full bg-sky-400 rounded-full" style="width:${Math.min(100, (fpsA / maxFps) * 100)}%"></div>
            </div>
            <span class="w-16 text-right font-bold text-white">${fpsA} FPS</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-24 truncate text-emerald-300">${gpuB.name}:</span>
            <div class="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full" style="width:${Math.min(100, (fpsB / maxFps) * 100)}%"></div>
            </div>
            <span class="w-16 text-right text-slate-300">${fpsB} FPS</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 2. AI & Local LLMs List (Running AI)
  const robotSvg = `<svg class="w-3.5 h-3.5 text-purple-400 inline-block mr-1 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01M9 11V9a3 3 0 0 1 6 0v2"/></svg>`;
  const aiWorkloads = [
    {
      title: 'Llama 3.1 / Qwen 2.5 (8B Q4 — 5.5 GB VRAM)',
      desc: 'Chat e assistente de código local',
      valA: `${gpuA.llm_8b_tok_s} tok/s`,
      valB: `${gpuB.llm_8b_tok_s} tok/s`,
      pctA: Math.min(100, (gpuA.llm_8b_tok_s / 140) * 100),
      pctB: Math.min(100, (gpuB.llm_8b_tok_s / 140) * 100),
      gain: Math.round(((gpuA.llm_8b_tok_s / Math.max(1, gpuB.llm_8b_tok_s)) - 1) * 100),
      note: gpuA.vram_gb >= 8 ? '100% na VRAM em ambas' : 'Requer 6GB+ VRAM'
    },
    {
      title: 'Qwen 2.5 Coder / DeepSeek-R1 (14B Q4 — 9.2 GB VRAM)',
      desc: 'Limiar crítico entre 8GB vs 12GB/16GB',
      valA: `${gpuA.llm_14b_tok_s} tok/s`,
      valB: `${gpuB.llm_14b_tok_s} tok/s`,
      pctA: Math.min(100, (gpuA.llm_14b_tok_s / 90) * 100),
      pctB: Math.min(100, (gpuB.llm_14b_tok_s / 90) * 100),
      gain: Math.round(((gpuA.llm_14b_tok_s / Math.max(1, gpuB.llm_14b_tok_s)) - 1) * 100),
      note: (gpuB.vram_gb <= 8 && gpuA.vram_gb >= 12)
        ? `🚨 ${gpuB.name} (8GB) cai para offload lento na RAM! ${gpuA.name} até ${(gpuA.llm_14b_tok_s / Math.max(1, gpuB.llm_14b_tok_s)).toFixed(1)}x mais rápida`
        : `Banda: ${gpuA.bandwidth_gbs} vs ${gpuB.bandwidth_gbs} GB/s`
    },
    {
      title: 'Modelos 32B Q4 & Geração de Imagem (Flux.1 / ComfyUI)',
      desc: 'Geração pesada e modelos grandes',
      valA: gpuA.vram_gb >= 16 ? 'Roda Nativo' : (gpuA.vram_gb >= 12 ? 'Roda Flux / 14B' : 'Offload RAM'),
      valB: gpuB.vram_gb >= 16 ? 'Roda Nativo' : (gpuB.vram_gb >= 12 ? 'Roda Flux / 14B' : 'Offload RAM'),
      pctA: Math.min(100, (getEffectiveAIScore(gpuA) / 6000) * 100),
      pctB: Math.min(100, (getEffectiveAIScore(gpuB) / 6000) * 100),
      gain: Math.round(((getEffectiveAIScore(gpuA) / Math.max(1, getEffectiveAIScore(gpuB))) - 1) * 100),
      note: `VRAM: ${gpuA.vram_gb}GB vs ${gpuB.vram_gb}GB`
    }
  ];

  document.getElementById('sim-ai-list').innerHTML = aiWorkloads.map(w => `
    <div class="p-3 rounded-xl bg-slate-900/80 border border-purple-500/25 space-y-1.5">
      <div class="flex items-center justify-between text-xs font-semibold text-white">
        <span class="flex items-center gap-1">${robotSvg} ${w.title}</span>
        <span class="font-mono text-purple-300 font-bold">${w.gain >= 0 ? '+' : ''}${w.gain}%</span>
      </div>
      <div class="text-[11px] text-slate-400">${w.desc}</div>
      <div class="space-y-1 text-[11px] font-mono pt-1">
        <div class="flex items-center gap-2">
          <span class="w-24 truncate text-sky-300">${gpuA.name}:</span>
          <div class="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
            <div class="h-full bg-purple-400 rounded-full" style="width:${w.pctA}%"></div>
          </div>
          <span class="w-28 text-right font-bold text-white">${w.valA}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-24 truncate text-emerald-300">${gpuB.name}:</span>
          <div class="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
            <div class="h-full bg-emerald-500 rounded-full" style="width:${w.pctB}%"></div>
          </div>
          <span class="w-28 text-right text-slate-300">${w.valB}</span>
        </div>
      </div>
      <div class="text-[10px] text-purple-300/90 pt-0.5">${w.note}</div>
    </div>
  `).join('');

  // 3. AI Training, Ethernet Frame / Packet Processing & OpenDSS Power Co-Simulation
  const circuitSvg = `<svg class="w-3.5 h-3.5 text-amber-400 inline-block mr-1 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>`;
  const engWorkloads = [
    {
      title: 'AI Training 3D & Simulação Física (Omniverse / CUDA / PhysX)',
      desc: 'Treinamento de redes, física acelerada e IA acoplada na VRAM',
      scoreA: Math.round(getEffectiveEngineeringScore(gpuA) * (gpuA.vram_gb >= 12 ? 1.15 : 0.72)),
      scoreB: Math.round(getEffectiveEngineeringScore(gpuB) * (gpuB.vram_gb >= 12 ? 1.15 : 0.72)),
      unit: ' pts (RT/CUDA)',
      note: gpuA.brand === 'NVIDIA' && gpuA.vram_gb >= 12
        ? `✅ ${gpuA.name} suporta Omniverse RTX + IA simultânea sem esgotar VRAM`
        : `⚠️ Omniverse e AI Training com IA acoplada exigem GPU NVIDIA RTX com 12GB+ VRAM`
    },
    {
      title: 'Processamento de Frames Ethernet / PCAP (CUDA / RAPIDS cuDF)',
      desc: 'Inspeção profunda de pacotes e ring-buffer GPU para detecção de anomalias',
      scoreA: Math.round((gpuA.bandwidth_gbs * 12.5 + gpuA.fp16_tflops * 45) * (gpuA.brand === 'NVIDIA' ? 1.35 : 0.75)),
      scoreB: Math.round((gpuB.bandwidth_gbs * 12.5 + gpuB.fp16_tflops * 45) * (gpuB.brand === 'NVIDIA' ? 1.35 : 0.75)),
      unit: ' Mpps (Score)',
      note: `Largura de banda: ${gpuA.bandwidth_gbs} vs ${gpuB.bandwidth_gbs} GB/s + CuPy/RAPIDS`
    },
    {
      title: 'OpenDSS + Co-Simulação de Redes Elétricas (Monte Carlo / CuPy)',
      desc: 'Execução massiva QSTS, matrizes esparsas cuSPARSE e PINNs',
      scoreA: Math.round((getEffectiveEngineeringScore(gpuA) * 0.90) + (gpuA.fp16_tflops * 22)),
      scoreB: Math.round((getEffectiveEngineeringScore(gpuB) * 0.90) + (gpuB.fp16_tflops * 22)),
      unit: ' cenários/min',
      note: `Com múltiplos núcleos no seu processador (${STATE.build.cpu.name}), execute processos paralelos alimentando tensores na GPU`
    }
  ];

  document.getElementById('sim-soft-list').innerHTML = engWorkloads.map(sf => {
    const sA = sf.scoreA;
    const sB = sf.scoreB;
    const maxS = Math.max(sA, sB, 5000);
    const gain = Math.round(((sA / Math.max(1, sB)) - 1) * 100);
    return `
      <div class="p-3 rounded-xl bg-slate-900/80 border border-amber-500/25 space-y-1.5">
        <div class="flex items-center justify-between text-xs font-semibold text-white">
          <span class="flex items-center gap-1">${circuitSvg} ${sf.title}</span>
          <span class="font-mono text-amber-400 font-bold">${gain >= 0 ? '+' : ''}${gain}%</span>
        </div>
        <div class="text-[11px] text-slate-400">${sf.desc}</div>
        <div class="space-y-1 text-[11px] font-mono pt-1">
          <div class="flex items-center gap-2">
            <span class="w-24 truncate text-sky-300">${gpuA.name}:</span>
            <div class="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
              <div class="h-full bg-amber-400 rounded-full" style="width:${Math.min(100, (sA / maxS) * 100)}%"></div>
            </div>
            <span class="w-28 text-right font-bold text-white">${sA}${sf.unit}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-24 truncate text-emerald-300">${gpuB.name}:</span>
            <div class="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full" style="width:${Math.min(100, (sB / maxS) * 100)}%"></div>
            </div>
            <span class="w-28 text-right text-slate-300">${sB}${sf.unit}</span>
          </div>
        </div>
        <div class="text-[10px] text-amber-300/90 pt-0.5">${sf.note}</div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// PLUGGABLE MULTI-SOURCE DATABASE MANAGEMENT
// ============================================================================
async function initDatabaseSources() {
  const sel = document.getElementById('select-db-source');
  const sidebarName = document.getElementById('sidebar-db-source-name');
  try {
    const res = await fetch('/api/sources');
    if (res.ok) {
      const data = await res.json();
      if (data && data.sources && sel) {
        sel.innerHTML = data.sources.map(s => `
          <option value="${s.id}" ${s.id === data.active_source ? 'selected' : ''}>
            ${s.name.replace(' (Hardware Barato / Web)', '')}
          </option>
        `).join('');
        STATE.activeSource = data.active_source;
        const activeObj = data.sources.find(s => s.id === data.active_source);
        if (sidebarName && activeObj) {
          sidebarName.textContent = activeObj.name;
        }
      }
    }
  } catch (_) {
    if (sidebarName) sidebarName.textContent = 'Database Nuvem';
  }
}

async function changeDatabaseSource(sourceId) {
  const status = document.getElementById('header-status');
  if (status) status.textContent = `Alternando base de dados para: ${sourceId}...`;
  STATE.activeSource = sourceId;

  try {
    const res = await fetch('/api/sources/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sourceId })
    });
    if (res.ok) {
      const data = await res.json();
      const sidebarName = document.getElementById('sidebar-db-source-name');
      if (sidebarName && data.source_name) sidebarName.textContent = data.source_name;
    }
  } catch (_) {}

  await loadHardwareDatabase();
}

// ============================================================================
// MARKET & REGIONAL CONFIGURATION (MONETARY, CHANNELS, STORES)
// ============================================================================
const FALLBACK_AVAILABLE_REGIONS = [
  { region_id: 'br', region_name: 'Brasil', currency_code: 'BRL', currency_symbol: 'R$', flag_emoji: '🇧🇷' },
  { region_id: 'mx', region_name: 'México', currency_code: 'MXN', currency_symbol: '$', flag_emoji: '🇲🇽' }
];

const STATIC_REGIONAL_DEFAULTS = {
  br: {
    region_id: 'br',
    region_name: 'Brasil',
    country_code: 'BR',
    flag_emoji: '🇧🇷',
    monetary: {
      currency_code: 'BRL',
      currency_symbol: 'R$',
      symbol_position: 'prefix',
      locale: 'pt-BR',
      decimal_separator: ',',
      thousands_separator: '.',
      decimal_digits: 2,
      price_regex: "R\\$\\s*([0-9]{1,3}(?:\\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]{3,5}(?:,[0-9]{1,2})?)",
      min_valid_hardware_price: 80,
      max_valid_hardware_price: 45000,
      vram_step_bonus_factor: 240,
      default_alert_min_savings: 150,
      default_budget_ceiling: 7000,
      exchange_rate_vs_brl: 1.0
    }
  },
  mx: {
    region_id: 'mx',
    region_name: 'México',
    country_code: 'MX',
    flag_emoji: '🇲🇽',
    monetary: {
      currency_code: 'MXN',
      currency_symbol: '$',
      symbol_position: 'prefix',
      locale: 'es-MX',
      decimal_separator: '.',
      thousands_separator: ',',
      decimal_digits: 0,
      price_regex: "(?:MX\\$|MXN|\\$)\\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]{1,2})?|[0-9]{4,6}(?:\\.[0-9]{1,2})?)",
      min_valid_hardware_price: 450,
      max_valid_hardware_price: 95000,
      vram_step_bonus_factor: 850,
      default_alert_min_savings: 600,
      default_budget_ceiling: 25000,
      exchange_rate_vs_brl: 3.48
    }
  }
};

async function initMarketConfig() {
  STATE.availableRegions = FALLBACK_AVAILABLE_REGIONS;
  const rawSaved = (localStorage.getItem('selected_market_region') || 'br').toLowerCase().trim();
  const savedReg = (rawSaved === 'mx') ? 'mx' : 'br';

  let loaded = false;
  // 1. Try server endpoint if backend is active
  try {
    await fetch('/api/market-config/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region_id: savedReg })
    }).catch(() => {});

    const res = await fetch('/api/market-config?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      if (data && data.config) {
        STATE.market = data.config;
        loaded = true;
      }
      if (data && data.available_regions && data.available_regions.length) {
        STATE.availableRegions = data.available_regions.filter(r => r.region_id === 'br' || r.region_id === 'mx');
      }
    }
  } catch (_) {}

  // 2. Static / GitHub Pages fallback: fetch static config/regions/<savedReg>.json
  if (!loaded) {
    try {
      const res = await fetch(`config/regions/${savedReg}.json?t=` + Date.now());
      if (res.ok) {
        STATE.market = await res.json();
        loaded = true;
      }
    } catch (_) {}
  }

  // 3. Absolute fallback: use STATIC_REGIONAL_DEFAULTS
  if (!loaded || !STATE.market || STATE.market.region_id !== savedReg) {
    STATE.market = JSON.parse(JSON.stringify(STATIC_REGIONAL_DEFAULTS[savedReg] || STATIC_REGIONAL_DEFAULTS.br));
  }

  renderMarketRegionSelectors();
  updateAllCurrencyLabels();
}

function updateAllCurrencyLabels() {
  const sym = STATE.market?.monetary?.currency_symbol || 'R$';
  const code = STATE.market?.monetary?.currency_code || 'BRL';

  document.querySelectorAll('.currency-sym').forEach(el => {
    el.textContent = sym;
  });

  const optAbs = document.getElementById('bf-opt-abs-price');
  if (optAbs) optAbs.textContent = `Preço absoluto (${sym})`;

  const minSavEl = document.getElementById('notify-dyn-minsav');
  if (minSavEl) {
    minSavEl.textContent = STATE.market?.monetary?.default_alert_min_savings || 150;
  }

  const inputHbBrl = document.getElementById('input-notify-hb-brl');
  if (inputHbBrl && STATE.market?.monetary?.default_alert_min_savings) {
    inputHbBrl.value = STATE.market.monetary.default_alert_min_savings;
  }

  const inputUpgBudget = document.getElementById('upg-budget');
  if (inputUpgBudget && STATE.market?.monetary?.default_budget_ceiling) {
    inputUpgBudget.value = STATE.market.monetary.default_budget_ceiling;
  }
}

function renderMarketRegionSelectors() {
  const selTop = document.getElementById('select-market-region');
  const selSidebar = document.getElementById('select-market-region-sidebar');
  const selConfig = document.getElementById('cfg-select-market-region');
  if (!STATE.availableRegions || !STATE.availableRegions.length) {
    STATE.availableRegions = FALLBACK_AVAILABLE_REGIONS;
  }

  const currentId = (STATE.market?.region_id || localStorage.getItem('selected_market_region') || 'br').toLowerCase();
  const optionsHTML = STATE.availableRegions.map(r => `
    <option value="${r.region_id}" ${r.region_id === currentId ? 'selected' : ''}>
      ${r.flag_emoji || '🌐'} ${r.region_name} (${r.currency_code} - ${r.currency_symbol})
    </option>
  `).join('');

  if (selTop) selTop.innerHTML = optionsHTML;
  if (selSidebar) selSidebar.innerHTML = optionsHTML;
  if (selConfig) {
    selConfig.innerHTML = optionsHTML;
    selConfig.value = currentId;
  }

  // Update Tab 7 Monetary Preview
  const symEl = document.getElementById('cfg-money-sym');
  if (symEl) symEl.textContent = STATE.market?.monetary?.currency_symbol || (currentId === 'mx' ? '$' : 'R$');
  const codeEl = document.getElementById('cfg-money-code');
  if (codeEl) codeEl.textContent = STATE.market?.monetary?.currency_code || (currentId === 'mx' ? 'MXN' : 'BRL');
  const locEl = document.getElementById('cfg-money-locale');
  if (locEl) locEl.textContent = STATE.market?.monetary?.locale || (currentId === 'mx' ? 'es-MX' : 'pt-BR');
}

async function changeMarketRegion(regionId) {
  if (!regionId) return;
  regionId = regionId.toLowerCase().trim();
  if (regionId !== 'br' && regionId !== 'mx') regionId = 'br';

  const status = document.getElementById('header-status');
  if (status) status.textContent = `Alternando mercado e moeda para ${regionId.toUpperCase()}...`;

  try { localStorage.setItem('selected_market_region', regionId); } catch (_) {}

  let serverUpdated = false;
  // 1. Try server API if backend exists
  try {
    const res = await fetch('/api/market-config/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region_id: regionId })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.config) {
        STATE.market = data.config;
        serverUpdated = true;
      }
      if (data && data.available_regions && data.available_regions.length) {
        STATE.availableRegions = data.available_regions.filter(r => r.region_id === 'br' || r.region_id === 'mx');
      }
    }
  } catch (_) {}

  // 2. Static / GitHub Pages fallback: load config/regions/<regionId>.json
  if (!serverUpdated) {
    try {
      const res = await fetch(`config/regions/${regionId}.json?t=` + Date.now());
      if (res.ok) {
        STATE.market = await res.json();
      } else {
        throw new Error('fetch error');
      }
    } catch (_) {
      STATE.market = JSON.parse(JSON.stringify(STATIC_REGIONAL_DEFAULTS[regionId] || STATIC_REGIONAL_DEFAULTS.br));
    }
  }

  // 1. Re-render regional dropdowns and monetary preview in Tab 7
  renderMarketRegionSelectors();
  updateAllCurrencyLabels();

  // 2. Reload hardware database with regional currency conversion
  await loadHardwareDatabase();

  // 3. Reset promo radar cache and trigger new scan for this country
  if (typeof PROMO_STATE !== 'undefined') {
    PROMO_STATE.rawPosts = [];
    PROMO_STATE.lastData = null;
    PROMO_STATE.channelsScanned = [];
    if (typeof scanLivePromos === 'function') {
      scanLivePromos(true).catch(e => console.warn('Promo scan error on region change:', e));
    }
  }

  // 4. Force re-render of active tab (Duelo, CB, Builder, Upgrades, BF, Sim, Config)
  renderActiveTab();
  if (typeof renderBlackFridayTab === 'function') renderBlackFridayTab();
  if (typeof renderUpgradeSuggestions === 'function') renderUpgradeSuggestions();
  if (typeof renderSimulator === 'function') renderSimulator();

  const sym = STATE.market?.monetary?.currency_symbol || (regionId === 'mx' ? '$' : 'R$');
  const code = STATE.market?.monetary?.currency_code || (regionId === 'mx' ? 'MXN' : 'BRL');
  const regName = STATE.market?.region_name || (regionId === 'mx' ? 'México' : 'Brasil');

  if (typeof showToast === 'function') {
    showToast(`Região e moeda configuradas para ${regName} (${code} - ${sym})`);
  }
  if (status) status.textContent = `Região ativa: ${regName} (${code} - ${sym})`;
}

function ensureDatabaseConvertedToActiveMarket(dbObj) {
  if (!dbObj) return;
  const targetReg = (STATE.market?.region_id || localStorage.getItem('selected_market_region') || 'br').toLowerCase();
  const rate = parseFloat(STATE.market?.monetary?.exchange_rate_vs_brl || (targetReg === 'mx' ? 3.48 : 1.0));
  const decimals = rate < 1 ? 100 : 1;
  const roundCurr = v => Math.round(v * rate * decimals) / decimals;

  // Has this database ALREADY been localized/converted for the target region?
  const alreadyLocalized = (dbObj.region_id === targetReg && (dbObj.exchange_rate === rate || targetReg === 'mx'));

  if (!alreadyLocalized) {
    // If we loaded the base Brazilian database but target is Mexico (or another country):
    if (targetReg !== 'br') {
      const convItem = (it) => {
        if (it.price_brl) it.price_brl = roundCurr(it.price_brl);
        if (it.regular_price_brl) it.regular_price_brl = roundCurr(it.regular_price_brl);
        if (it.installment_price_brl) it.installment_price_brl = roundCurr(it.installment_price_brl);
        if (it.custom_price) it.custom_price = roundCurr(it.custom_price);
        if (Array.isArray(it.history)) {
          it.history.forEach(h => { if (h.price) h.price = roundCurr(h.price); });
        }
        if (it.price_stats) {
          ['target_price', 'min_all_time', 'min_90d', 'avg_30d', 'avg_90d', 'median_180d', 'vs_target_brl'].forEach(k => {
            if (it.price_stats[k] != null) it.price_stats[k] = roundCurr(it.price_stats[k]);
          });
        }
      };
      (dbObj.gpus || []).forEach(convItem);
      (dbObj.cpus || []).forEach(convItem);
      (dbObj.motherboards || []).forEach(convItem);
      (dbObj.rams || []).forEach(convItem);
      (dbObj.psus || []).forEach(convItem);
    }
  }

  // Scrub Mexican stores and links if target is mx
  if (targetReg === 'mx') {
    const scrubMxItem = it => {
      it.coupon = null;
      it.coupon_label = null;
      const q = encodeURIComponent(it.name || it.slug || '');
      if (!it.store_name || /kabum|pichau|terabyte|magalu|shopee|loja|@|peperaio|adrenaline|iskandar|benchpromos/i.test(it.store_name)) {
        it.store_name = 'Cyberpuerta';
      }
      if (!it.offer_url || /\.br\b|t\.me\/|hardwarebarato/i.test(it.offer_url)) {
        it.offer_url = `https://www.cyberpuerta.mx/index.php?cl=search&searchparam=${q}`;
      }
      it.href = it.offer_url;
    };
    ['gpus', 'cpus', 'motherboards', 'rams', 'psus'].forEach(grp => (dbObj[grp] || []).forEach(scrubMxItem));
  }

  // Wipe Brazilian live promos if not viewing Brazil
  if (targetReg !== 'br' && dbObj.live_promos && dbObj.live_promos.region_id !== targetReg) {
    dbObj.live_promos = null;
  }

  dbObj.region_id = targetReg;
  dbObj.exchange_rate = rate;
  dbObj.currency_code = STATE.market?.monetary?.currency_code || (targetReg === 'mx' ? 'MXN' : 'BRL');
  dbObj.currency_symbol = STATE.market?.monetary?.currency_symbol || (targetReg === 'mx' ? '$' : 'R$');
}

async function loadHardwareDatabase() {
  const status = document.getElementById('header-status');
  const targetReg = (STATE.market?.region_id || localStorage.getItem('selected_market_region') || 'br').toLowerCase();
  try {
    let res = null;
    const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    if (!isStatic) {
      try {
        res = await fetch(`/api/hardware?region=${encodeURIComponent(targetReg)}&t=` + Date.now());
        if (!res.ok) res = null;
      } catch (_) {
        res = null;
      }
    }
    if (!res) {
      const dbFile = (targetReg === 'mx') ? 'data/hardware_db_mx.json' : 'data/hardware_db.json';
      try {
        res = await fetch(dbFile + '?t=' + Date.now());
        if (!res.ok && targetReg !== 'br') {
          res = await fetch('data/hardware_db.json?t=' + Date.now());
        }
      } catch (_) {
        res = await fetch('data/hardware_db.json?t=' + Date.now());
      }
    }
    DB = await res.json();
    ensureDatabaseConvertedToActiveMarket(DB);

    if (typeof backupOriginalHBPrices === 'function') {
      backupOriginalHBPrices(true);
    }

    window.DB = DB;
    const sym = STATE.market?.monetary?.currency_symbol || (targetReg === 'mx' ? '$' : 'R$');
    const regName = STATE.market?.region_name || (targetReg === 'mx' ? 'México' : 'Brasil');
    if (status) {
      status.textContent = `Mercado: ${regName} (${sym}) • Sincronizado às ${DB.updated_at || 'hoje'} • ${DB.gpus.length} GPUs monitoradas`;
    }
    enrichGPUsWithContextualMetrics();
    updateTopContextSummary();
    populateSelectors();
    updateAllCurrencyLabels();
    renderActiveTab();
    renderPCBuilder();
  } catch (e) {
    if (status) status.textContent = 'Erro ao carregar dados da base selecionada.';
  }
}

// Refresh Live Data from Selected Database Source via Backend API
async function refreshDatabase() {
  const btn = document.getElementById('btn-refresh-db') || document.getElementById('btn-refresh-hb');
  const icon = document.getElementById('icon-refresh');
  const status = document.getElementById('header-status');
  const targetReg = (STATE.market?.region_id || localStorage.getItem('selected_market_region') || 'br').toLowerCase();
  if (btn) btn.disabled = true;
  if (icon) icon.classList.add('animate-spin');
  if (status) status.textContent = 'Sincronizando catálogo e preços ao vivo da Database...';

  try {
    let data = null;
    const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    if (!isStatic) {
      try {
        const res = await fetch('/api/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_id: STATE.activeSource, region_id: targetReg })
        });
        if (res.ok) data = await res.json();
      } catch (_) {}
    }
    if (!data || !data.ok) {
      const dbFile = (targetReg === 'mx') ? 'data/hardware_db_mx.json' : 'data/hardware_db.json';
      let res;
      try {
        res = await fetch(dbFile + '?t=' + Date.now());
        if (!res.ok && targetReg !== 'br') {
          res = await fetch('data/hardware_db.json?t=' + Date.now());
        }
      } catch (_) {
        res = await fetch('data/hardware_db.json?t=' + Date.now());
      }
      if (res && res.ok) {
        const db = await res.json();
        data = { ok: true, db, from_static: true };
      }
    }
    if (data && data.ok && data.db) {
      DB = data.db;
      ensureDatabaseConvertedToActiveMarket(DB);
      window.DB = DB;
      if (typeof backupOriginalHBPrices === 'function') backupOriginalHBPrices(true);
      enrichGPUsWithContextualMetrics();
      updateTopContextSummary();
      populateSelectors();
      updateAllCurrencyLabels();
      renderActiveTab();
      renderPCBuilder();
      const sourceLabel = DB.source_name || (targetReg === 'mx' ? 'Cyberpuerta & DDTech MX' : 'Hardware Barato');
      if (status) {
        status.textContent = `Atualizado com sucesso da ${sourceLabel} em ${DB.updated_at || 'agora'} (${DB.gpus.length} GPUs monitoradas)`;
      }
    }
  } catch (e) {
    if (status) status.textContent = 'Erro ao sincronizar ao vivo. Utilizando snapshot local.';
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.classList.remove('animate-spin');
  }
}
const refreshHardwareBarato = refreshDatabase;

// ============================================================================
// CONFIGURATION TAB & SYSTEM PREFERENCES (Meu PC, Database, Scale, Region)
// ============================================================================
function renderConfigRefCompatBanner() {
  const el = document.getElementById('cfg-ref-compat-banner');
  if (!el) return;
  const comp = checkCpuMoboCompatibility(STATE.refPC.cpu, STATE.refPC.mobo);
  el.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-xs font-mono font-bold px-2.5 py-1 rounded-lg ${comp.badgeClass}">[${comp.flag}] ${comp.label}</span>
      <span class="text-xs text-slate-300 leading-snug">${comp.message}</span>
    </div>
  `;
}

function renderConfigTab() {
  const db = window.DB || DB;
  if (!db || !db.gpus || db.gpus.length === 0) return;

  const curCpu = STATE.refPC.cpu || {};
  const curMobo = STATE.refPC.mobo || {};
  const curRam = STATE.refPC.ram || {};
  const curGpu = STATE.refPC.gpu || {};
  const curPsu = STATE.refPC.psu || {};
  const curStorage = STATE.refPC.storage || {};

  const { filteredMobos, targetRamType, filteredRams } = getFilteredMoboAndRamOptions(curCpu.slug, curMobo.slug, curRam.slug);

  // 1. Populate CPU options
  const cpuSel = document.getElementById('cfg-ref-cpu-select');
  if (cpuSel && db.cpus) {
    cpuSel.innerHTML = `
      <option value="" ${!curCpu.slug ? 'selected' : ''}>-- (Nenhum / Sem Processador) --</option>
      ${db.cpus.map(c => `<option value="${c.slug}" ${curCpu.slug === c.slug ? 'selected' : ''}>${c.name} (${c.socket}) — ${fmtBRL(c.price_brl)} [${c.tdp_w}W]</option>`).join('')}
    `;
    const cpuNameInput = document.getElementById('cfg-ref-cpu-name');
    const cpuTdpInput = document.getElementById('cfg-ref-cpu-tdp');
    if (cpuNameInput) cpuNameInput.value = curCpu.name || '';
    if (cpuTdpInput) cpuTdpInput.value = curCpu.tdp || '';
  }

  // 2. Populate GPU options
  const gpuSel = document.getElementById('cfg-ref-gpu-select');
  if (gpuSel && db.gpus) {
    gpuSel.innerHTML = `
      <option value="" ${!curGpu.slug ? 'selected' : ''}>-- (Nenhum / Sem GPU Dedicada) --</option>
      ${db.gpus.map(g => `<option value="${g.slug}" ${curGpu.slug === g.slug ? 'selected' : ''}>${g.name} (${g.vram_gb}GB) — ${fmtBRL(g.price_brl)} [${g.tdp_w}W]</option>`).join('')}
    `;
    const gpuNameInput = document.getElementById('cfg-ref-gpu-name');
    const gpuTdpInput = document.getElementById('cfg-ref-gpu-tdp');
    if (gpuNameInput) gpuNameInput.value = curGpu.name || '';
    if (gpuTdpInput) gpuTdpInput.value = curGpu.tdp || '';
  }

  // 3. Populate Mobo options (filtered to CPU socket!)
  const moboSel = document.getElementById('cfg-ref-mobo-select');
  if (moboSel) {
    moboSel.innerHTML = `
      <option value="" ${!curMobo.slug ? 'selected' : ''}>-- (Nenhum / Sem Placa-Mãe) --</option>
      ${filteredMobos.map(m => `<option value="${m.slug}" ${curMobo.slug === m.slug ? 'selected' : ''}>${m.name} (${m.socket}/${m.memory_type}) — ${fmtBRL(m.price_brl)}</option>`).join('')}
    `;
    const moboNameInput = document.getElementById('cfg-ref-mobo-name');
    const moboSocketInput = document.getElementById('cfg-ref-mobo-socket');
    if (moboNameInput) moboNameInput.value = curMobo.name || '';
    if (moboSocketInput) moboSocketInput.value = curMobo.socket || '';
  }

  // 4. Populate RAM options (filtered to standard!)
  const ramSel = document.getElementById('cfg-ref-ram-select');
  if (ramSel) {
    ramSel.innerHTML = `
      <option value="" ${!curRam.slug ? 'selected' : ''}>-- (Nenhum / Sem Memória RAM) --</option>
      ${filteredRams.slice(0, 50).map(r => `<option value="${r.slug}" ${curRam.slug === r.slug ? 'selected' : ''}>${r.name} — ${fmtBRL(r.price_brl)}</option>`).join('')}
    `;
    const ramCapInput = document.getElementById('cfg-ref-ram-cap');
    const ramTypeSel = document.getElementById('cfg-ref-ram-type');
    if (ramCapInput) ramCapInput.value = curRam.capacity_gb || '';
    if (ramTypeSel) ramTypeSel.value = curRam.memory_type || targetRamType || 'DDR4';
  }

  // 5. Populate PSU options
  const psuSel = document.getElementById('cfg-ref-psu-select');
  if (psuSel && db.psus) {
    psuSel.innerHTML = `
      <option value="" ${!curPsu.slug ? 'selected' : ''}>-- (Nenhum / Sem Fonte) --</option>
      ${db.psus.slice(0, 60).map(p => `<option value="${p.slug}" ${curPsu.slug === p.slug ? 'selected' : ''}>${p.name} (${p.watts}W) — ${fmtBRL(p.price_brl)}</option>`).join('')}
    `;
    const psuNameInput = document.getElementById('cfg-ref-psu-name');
    const psuWattsInput = document.getElementById('cfg-ref-psu-watts');
    if (psuNameInput) psuNameInput.value = curPsu.name || '';
    if (psuWattsInput) psuWattsInput.value = curPsu.watts || '';
  }

  // 6. Storage
  const storageNameInput = document.getElementById('cfg-ref-storage-name');
  if (storageNameInput) {
    storageNameInput.value = curStorage.name || '';
  }

  // 7. Live Compatibility Banner in Config
  renderConfigRefCompatBanner();

  // 8. DB stats & Source selector
  const dbSourceSel = document.getElementById('cfg-select-db-source');
  if (dbSourceSel) {
    dbSourceSel.value = STATE.activeSource || 'hardware_barato';
  }
  const statGpus = document.getElementById('cfg-stat-gpus');
  const statCpus = document.getElementById('cfg-stat-cpus');
  const statMobos = document.getElementById('cfg-stat-mobos');
  if (statGpus) statGpus.textContent = (db.gpus || []).length;
  if (statCpus) statCpus.textContent = (db.cpus || []).length;
  if (statMobos) statMobos.textContent = (db.motherboards || []).length;

  // 9. Sync Scale buttons
  syncComparisonScaleControls();

  // 10. Sync Market UI
  if (typeof updateMarketConfigUI === 'function') updateMarketConfigUI();
}

function onCfgPartSelect(part, slug) {
  if (!STATE.refPC) STATE.refPC = {};
  if (!slug) {
    if (part === 'cpu') STATE.refPC.cpu = { slug: '', name: '', tdp: 0, price: 0, owned: false, benchmark: 0, socket: '' };
    else if (part === 'gpu') STATE.refPC.gpu = { slug: '', name: '', tdp: 0, price: 0, owned: false };
    else if (part === 'mobo') STATE.refPC.mobo = { slug: '', name: '', tdp: 0, price: 0, owned: false, socket: '', memory_type: '' };
    else if (part === 'ram') STATE.refPC.ram = { slug: '', name: '', tdp: 0, price: 0, owned: false, capacity_gb: 0, memory_type: 'DDR4' };
    else if (part === 'psu') STATE.refPC.psu = { slug: '', name: '', watts: 0, price: 0, owned: false };
  } else {
    if (part === 'cpu') {
      const c = DB.cpus.find(x => x.slug === slug);
      if (c) {
        STATE.refPC.cpu = { slug: c.slug, name: c.name, tdp: c.tdp_w, price: c.price_brl, owned: true, benchmark: c.benchmark, socket: c.socket };
        const simCpuSel = document.getElementById('sim-select-cpu');
        if (simCpuSel) simCpuSel.value = c.slug;

        // Auto-reconcile mobo
        const cpuSock = (c.socket || '').toUpperCase().trim();
        const curMoboSock = ((STATE.refPC.mobo && STATE.refPC.mobo.socket) || '').toUpperCase().trim();
        const mobos = DB.motherboards || [];
        const compatibleMobos = mobos.filter(m => (m.socket || '').toUpperCase().trim() === cpuSock);
        if (cpuSock && curMoboSock && curMoboSock !== cpuSock && compatibleMobos.length > 0) {
          const defaultMobo = compatibleMobos[0];
          STATE.refPC.mobo = { slug: defaultMobo.slug, name: defaultMobo.name, tdp: defaultMobo.tdp_w || 35, price: defaultMobo.price_brl, owned: true, socket: defaultMobo.socket, memory_type: defaultMobo.memory_type };
        }

        // Auto-reconcile RAM (DDR4 vs DDR5)
        let targetMem = '';
        if (cpuSock === 'AM4' || cpuSock === 'LGA2011-3') targetMem = 'DDR4';
        else if (cpuSock === 'AM5' || cpuSock === 'LGA1851') targetMem = 'DDR5';
        else if (cpuSock === 'LGA1700' && STATE.refPC.mobo?.memory_type) targetMem = STATE.refPC.mobo.memory_type.toUpperCase();

        if (targetMem && STATE.refPC.ram?.memory_type && STATE.refPC.ram.memory_type.toUpperCase() !== targetMem) {
          const compatibleRams = (DB.rams || []).filter(r => (r.memory_type || '').toUpperCase() === targetMem);
          if (compatibleRams.length > 0) {
            const defaultRam = compatibleRams[0];
            STATE.refPC.ram = { slug: defaultRam.slug, name: defaultRam.name, tdp: defaultRam.tdp_w || 10, price: defaultRam.price_brl, owned: true, capacity_gb: defaultRam.capacity_gb || 16, memory_type: defaultRam.memory_type || targetMem };
          }
        }
      }
    } else if (part === 'gpu') {
      const g = DB.gpus.find(x => x.slug === slug);
      if (g) STATE.refPC.gpu = { slug: g.slug, name: `${g.name} (${g.vram_gb}GB)`, tdp: g.tdp_w, price: g.price_brl, owned: true };
    } else if (part === 'mobo') {
      const m = DB.motherboards.find(x => x.slug === slug);
      if (m) {
        STATE.refPC.mobo = { slug: m.slug, name: m.name, tdp: m.tdp_w, price: m.price_brl, owned: true, socket: m.socket, memory_type: m.memory_type };
        if (m.memory_type && STATE.refPC.ram?.memory_type && STATE.refPC.ram.memory_type.toUpperCase() !== m.memory_type.toUpperCase()) {
          const compatibleRams = (DB.rams || []).filter(r => (r.memory_type || '').toUpperCase() === m.memory_type.toUpperCase());
          if (compatibleRams.length > 0) {
            const defaultRam = compatibleRams[0];
            STATE.refPC.ram = { slug: defaultRam.slug, name: defaultRam.name, tdp: defaultRam.tdp_w || 10, price: defaultRam.price_brl, owned: true, capacity_gb: defaultRam.capacity_gb || 16, memory_type: defaultRam.memory_type || m.memory_type };
          }
        }
      }
    } else if (part === 'ram') {
      const r = DB.rams.find(x => x.slug === slug);
      if (r) STATE.refPC.ram = { slug: r.slug, name: r.name, tdp: r.tdp_w, price: r.price_brl, owned: true, capacity_gb: r.capacity_gb, memory_type: r.memory_type };
    } else if (part === 'psu') {
      const p = DB.psus.find(x => x.slug === slug);
      if (p) STATE.refPC.psu = { slug: p.slug, name: p.name, watts: p.watts, price: p.price_brl, owned: true };
    }
  }
  saveUserRefPrefs();
  renderConfigTab();
}

function onCfgCustomInput(part, field, value) {
  if (!STATE.refPC[part]) STATE.refPC[part] = {};
  STATE.refPC[part][field] = value;
  saveUserRefPrefs();
  if (part === 'cpu' || part === 'mobo') {
    renderConfigRefCompatBanner();
  }
}

function clearUserReferencePC() {
  STATE.refPC.cpu = { slug: '', name: '', tdp: 0, price: 0, owned: false, benchmark: 0, socket: '' };
  STATE.refPC.gpu = { slug: '', name: '', tdp: 0, price: 0, owned: false };
  STATE.refPC.mobo = { slug: '', name: '', tdp: 0, price: 0, owned: false, socket: '', memory_type: '' };
  STATE.refPC.ram = { slug: '', name: '', tdp: 0, price: 0, owned: false, capacity_gb: 0, memory_type: 'DDR4' };
  STATE.refPC.psu = { slug: '', name: '', watts: 0, price: 0, owned: false };
  STATE.refPC.storage = { name: '', tdp: 0, price: 0, owned: false };
  STATE.refPC.cooling = { name: '', tdp: 0, price: 0, owned: false };
  saveUserRefPrefs();
  renderConfigTab();
  if (typeof showToast === 'function') showToast('Meu PC de Referência limpo (todas as caixas vazias).');
}

function saveUserReferencePC() {
  saveUserRefPrefs();
  if (typeof saveUserPrefs === 'function') saveUserPrefs();
  const activeTitleEl = document.getElementById('header-active-tab-title');
  const oldTitle = activeTitleEl ? activeTitleEl.textContent : '';
  if (activeTitleEl) activeTitleEl.textContent = '✅ Configurações Salvas com Sucesso!';
  if (typeof showToast === 'function') showToast('Configurações do Sistema e PC de Referência salvos com sucesso!');
  setTimeout(() => {
    if (activeTitleEl && activeTitleEl.textContent.includes('Configurações Salvas')) {
      activeTitleEl.textContent = oldTitle || 'Configurações do Sistema';
    }
  }, 2500);
}

// Initial Boot
async function initApp() {
  if (typeof loadUserPrefs === 'function') loadUserPrefs();
  loadUserRefPrefs();
  loadUserBuildPrefs();
  initDatabaseSources();
  await initMarketConfig();

  try {
    await loadHardwareDatabase();

    renderDuelAnalysis();
    renderPCBuilder();
    detectMyLocalPC(null);
    if (typeof scanLivePromos === 'function') scanLivePromos(false);

    document.addEventListener('click', (e) => {
      const menu = document.getElementById('cb-col-menu');
      const wrapper = document.getElementById('cb-col-menu-wrapper');
      if (menu && !menu.classList.contains('hidden') && wrapper && !wrapper.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });
  } catch (e) {
    console.error('Failed to boot app:', e);
    document.getElementById('header-status').textContent = 'Erro ao carregar dados. Execute iniciar_app.bat para iniciar o servidor.';
  }
}

window.addEventListener('DOMContentLoaded', initApp);
