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
  psus: [],
  laptops: []
};
window.DB = DB;

// User Context Weights & Context Separation (GPU vs CPU vs Notebook)
let STATE = {
  context: 'gpu', // 'gpu' | 'cpu' | 'laptop'
  activeTab: 'versus',
  wGaming: 30,
  wWorkstation: 35,
  wAI: 20,
  wSoft: 15,
  workstationProfile: {
    rendering: 40,   // Blender / V-Ray / Cinebench 3D
    editing: 30,     // Video Premiere / DaVinci Resolve
    compilation: 30  // Code / Compiling / Dev / Docker
  },
  workloadIntensity: {
    gaming: 3,       // 1=Leve, 2=Moderado, 3=Pesado, 4=Muito Pesado, 5=Extremo
    workstation: 3,
    localAI: 3,
    aiTraining: 3
  },
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
  // CPU Duel & Cost-Benefit State
  cpuDuelBaseSlug: 'ryzen-5-5600',
  cpuDuelCandSlug: 'ryzen-7-7800x3d',
  cpuCbSortBy: 'my_cb',
  cpuCbSortAsc: false,
  cpuCbRelBaseSlug: 'ryzen-5-5600',
  cpuCbPlatformMode: 'isolated', // 'isolated' (só CPU) | 'bundle' (CPU + Mobo + RAM se mismatch)
  cpuCbFilterSocket: 'ALL',
  cpuCbFilterBrand: 'ALL',
  // Laptop Duel & Full-System State
  laptopDuelBaseSlug: '',
  laptopDuelCandSlug: '',
  laptopCbSortBy: 'my_cb',
  laptopCbSortAsc: false,
  laptopCbRelBaseSlug: '',
  laptopCbChartMetric: 'benefit',
  laptopBuilder: {
    slug: '',
    price: 0,
    extraRamGb: 0,
    extraRamPrice: 0,
    extraRamOwned: false,
    extraSsdGb: 0,
    extraSsdPrice: 0,
    extraSsdOwned: false,
    accessoryName: 'Suporte / Cooling Pad + Hub USB-C',
    accessoryPrice: 220,
    accessoryOwned: false
  },
  refLaptop: { slug: '', name: '', price: 0 },
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
window.STATE = STATE;

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
    return { topGpu: null, maxGaming: 14411, maxWS: 25000, maxAI: 21507, maxSoft: 28000, maxPrice: 30450, max14bToks: 175 };
  }
  const topGpu = DB.gpus.reduce((best, g) => ((g.gaming_score || 0) > (best.gaming_score || 0) ? g : best), DB.gpus[0]);
  const maxGaming = Math.max(...DB.gpus.map(g => (typeof getEffectiveGamingScore === 'function' ? getEffectiveGamingScore(g, true) : (g.gaming_score || 0))));
  const maxWS = Math.max(1000, ...DB.gpus.map(g => (typeof getEffectiveWorkstationScore === 'function' ? getEffectiveWorkstationScore(g) : 1000)));
  const maxAI = Math.max(...DB.gpus.map(g => getEffectiveAIScore(g)));
  const maxSoft = Math.max(...DB.gpus.map(g => getEffectiveEngineeringScore(g)));
  const maxPrice = Math.max(...DB.gpus.map(g => (g.price_brl || 0)));
  const max14bToks = Math.max(...DB.gpus.map(g => (g.llm_14b_tok_s || 5)));

  return {
    topGpu,
    maxGaming: Math.max(1000, maxGaming),
    maxWS: Math.max(1000, maxWS),
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

// 3.5. GPU Workstation Score: 3D Render (Blender OptiX/CUDA), Video Editing (NVENC), and Code/Dev
function getEffectiveWorkstationScore(gpu) {
  const vram = gpu.vram_gb || 8;
  const bw = gpu.bandwidth_gbs || 256;
  const fp16 = gpu.fp16_tflops || 20;
  const bench = gpu.gaming_score || 1500;
  const isNvidia = gpu.brand === 'NVIDIA';
  const arch = (gpu.arch || '').toLowerCase();

  // Modern RTX GPUs feature accelerated OptiX rendering and dual AV1 encoders
  const isModernRTX = isNvidia && /blackwell|ada|ampere/i.test(arch);
  const optixMult = isModernRTX ? 1.35 : (isNvidia ? 1.18 : 0.82);
  const dualNvenc = isModernRTX && (vram >= 12);
  const editingMult = dualNvenc ? 1.25 : (isNvidia ? 1.10 : 0.90);

  const ws = STATE.workstationProfile || { rendering: 40, editing: 30, compilation: 30 };
  const totalWs = Math.max(1, (ws.rendering || 40) + (ws.editing || 30) + (ws.compilation || 30));

  // Sub-pillar 1: 3D Rendering (Blender, Cinebench GPU, V-Ray, Octane)
  const renderComp = ((bench * 0.45) + (fp16 * 22) + (vram * 90)) * optixMult;
  // Sub-pillar 2: Video Editing (Premiere, Resolve timeline scrubbing, 4K/8K timeline cache)
  const editComp = ((bench * 0.35) + (bw * 2.5) + (vram * 140)) * editingMult;
  // Sub-pillar 3: Code / Dev / Virtualization / Compute
  const devComp = (bench * 0.40) + (bw * 2.2) + (fp16 * 18) + (vram * 100);

  const rawWs = ((ws.rendering || 40) * renderComp + (ws.editing || 30) * editComp + (ws.compilation || 30) * devComp) / totalWs;
  return Math.max(200, Math.round(rawWs));
}
window.getEffectiveWorkstationScore = getEffectiveWorkstationScore;

// 4. Scale-Normalized Composite Score (Incorporates Gaming, Workstation, AI and Simulation - 4 Pillars)
function getContextualCompositeScore(gpu, customWeights = null) {
  const sub = getSubScoreExtremes();
  const wg = customWeights ? customWeights.wGaming : (STATE.wGaming !== undefined ? STATE.wGaming : 30);
  const wws = customWeights ? customWeights.wWorkstation : (STATE.wWorkstation !== undefined ? STATE.wWorkstation : 35);
  const wa = customWeights ? customWeights.wAI : (STATE.wAI !== undefined ? STATE.wAI : 20);
  const ws = customWeights ? customWeights.wSoft : (STATE.wSoft !== undefined ? STATE.wSoft : 15);
  const totalW = Math.max(1, wg + wws + wa + ws);

  const gNorm = wg / totalW;
  const wsNorm = wws / totalW;
  const aNorm = wa / totalW;
  const sNorm = ws / totalW;

  // Each pillar is normalized to a 0-10,000 scale against the catalog leader
  const gamingRaw = (typeof getEffectiveGamingScore === 'function') ? getEffectiveGamingScore(gpu, true) : (gpu.gaming_score || 1500);
  const gamingScaled = (gamingRaw / sub.maxGaming) * 10000;
  const wsScaled = (getEffectiveWorkstationScore(gpu) / (sub.maxWS || 10000)) * 10000;
  const aiScaled = (getEffectiveAIScore(gpu) / sub.maxAI) * 10000;
  const engScaled = (getEffectiveEngineeringScore(gpu) / sub.maxSoft) * 10000;

  return Math.round(gNorm * gamingScaled + wsNorm * wsScaled + aNorm * aiScaled + sNorm * engScaled);
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

// ============================================================================
// CPU SCORING, WORKSTATION SUB-PROFILES, AND PLATFORM MIGRATION COST ENGINE
// ============================================================================

// 1. CPU Specs & Architecture Extractor (Cores, Threads, P/E-cores, SMT/HT, Cache, Node, Benchmarks)
function getCpuSpecs(cpu) {
  if (!cpu) return {
    cores: 6, threads: 12, pCores: 6, eCores: 0, socket: 'AM4', ddr: 'DDR4', brand: 'AMD', tdp: 65, isX3D: false,
    archName: 'Zen 3', smtType: 'AMD SMT 2-Way (2T/C)', smtGainPct: 28, l3CacheMB: 32, nodeNm: 'TSMC 7nm',
    multiBench: 5675, singleBench: 84, speedupRatio: '9.8', scorePerCore: 946, scorePerWatt: '87.3'
  };
  const name = cpu.name || '';
  const slug = (cpu.slug || '').toLowerCase();

  let cores = 6;
  let threads = 12;
  let pCores = 6;
  let eCores = 0;
  let archName = 'Zen 3';
  let smtType = 'AMD SMT 2-Way (2T/C)';
  let smtGainPct = 28;
  let l3CacheMB = 32;
  let nodeNm = 'TSMC 7nm';
  let singleBench = 84;

  const isX3D = /x3d/i.test(slug) || /x3d/i.test(name);

  // Intel Arrow Lake Core Ultra 200 (LGA1851, No Hyper-Threading on P-Cores)
  if (/285k|285\b/i.test(slug)) {
    cores = 24; threads = 24; pCores = 8; eCores = 16;
    archName = 'Lion Cove + Skymont (Arrow Lake)';
    smtType = 'Nativo 1T/C (Sem Hyper-Threading)';
    smtGainPct = 0; l3CacheMB = 36; nodeNm = 'TSMC 3nm N3B'; singleBench = 144;
  } else if (/265k|265\b/i.test(slug)) {
    cores = 20; threads = 20; pCores = 8; eCores = 12;
    archName = 'Lion Cove + Skymont (Arrow Lake)';
    smtType = 'Nativo 1T/C (Sem Hyper-Threading)';
    smtGainPct = 0; l3CacheMB = 30; nodeNm = 'TSMC 3nm N3B'; singleBench = 142;
  } else if (/245k|245\b|250k/i.test(slug)) {
    cores = 14; threads = 14; pCores = 6; eCores = 8;
    archName = 'Lion Cove + Skymont (Arrow Lake)';
    smtType = 'Nativo 1T/C (Sem Hyper-Threading)';
    smtGainPct = 0; l3CacheMB = 24; nodeNm = 'TSMC 3nm N3B'; singleBench = 138;
  } else if (/225/i.test(slug)) {
    cores = 10; threads = 10; pCores = 6; eCores = 4;
    archName = 'Lion Cove + Skymont (Arrow Lake)';
    smtType = 'Nativo 1T/C (Sem Hyper-Threading)';
    smtGainPct = 0; l3CacheMB = 20; nodeNm = 'TSMC 3nm N3B'; singleBench = 130;
  }
  // Intel 13th / 14th Gen Raptor Lake (LGA1700, P-Cores c/ HT + E-Cores 1T)
  else if (/14900|13900/i.test(slug)) {
    cores = 24; threads = 32; pCores = 8; eCores = 16;
    archName = 'Raptor Cove + Gracemont (Intel Hybrid)';
    smtType = 'Intel HT nos P-Cores (16T) + E-Cores (16T)';
    smtGainPct = 25; l3CacheMB = 36; nodeNm = 'Intel 7 (10nm)'; singleBench = 140;
  } else if (/14700/i.test(slug)) {
    cores = 20; threads = 28; pCores = 8; eCores = 12;
    archName = 'Raptor Cove + Gracemont (Intel Hybrid)';
    smtType = 'Intel HT nos P-Cores (16T) + E-Cores (12T)';
    smtGainPct = 25; l3CacheMB = 33; nodeNm = 'Intel 7 (10nm)'; singleBench = 136;
  } else if (/13700|12900/i.test(slug)) {
    cores = 16; threads = 24; pCores = 8; eCores = 8;
    archName = 'Raptor/Golden Cove + Gracemont';
    smtType = 'Intel HT nos P-Cores (16T) + E-Cores (8T)';
    smtGainPct = 25; l3CacheMB = 30; nodeNm = 'Intel 7 (10nm)'; singleBench = 132;
  } else if (/14600|13600/i.test(slug)) {
    cores = 14; threads = 20; pCores = 6; eCores = 8;
    archName = 'Raptor Cove + Gracemont (Intel Hybrid)';
    smtType = 'Intel HT nos P-Cores (12T) + E-Cores (8T)';
    smtGainPct = 26; l3CacheMB = 24; nodeNm = 'Intel 7 (10nm)'; singleBench = 132;
  } else if (/12700/i.test(slug)) {
    cores = 12; threads = 20; pCores = 8; eCores = 4;
    archName = 'Golden Cove + Gracemont (Intel Hybrid)';
    smtType = 'Intel HT nos P-Cores (16T) + E-Cores (4T)';
    smtGainPct = 26; l3CacheMB = 25; nodeNm = 'Intel 7 (10nm)'; singleBench = 124;
  } else if (/12600/i.test(slug)) {
    cores = 10; threads = 16; pCores = 6; eCores = 4;
    archName = 'Golden Cove + Gracemont (Intel Hybrid)';
    smtType = 'Intel HT nos P-Cores (12T) + E-Cores (4T)';
    smtGainPct = 26; l3CacheMB = 20; nodeNm = 'Intel 7 (10nm)'; singleBench = 120;
  } else if (/14400|13400/i.test(slug)) {
    cores = 10; threads = 16; pCores = 6; eCores = 4;
    archName = 'Raptor/Alder Cove + Gracemont';
    smtType = 'Intel HT nos P-Cores (12T) + E-Cores (4T)';
    smtGainPct = 25; l3CacheMB = 20; nodeNm = 'Intel 7 (10nm)'; singleBench = 112;
  } else if (/12400/i.test(slug)) {
    cores = 6; threads = 12; pCores = 6; eCores = 0;
    archName = 'Golden Cove (Intel Pure Performance)';
    smtType = 'Intel Hyper-Threading (2T/C)';
    smtGainPct = 28; l3CacheMB = 18; nodeNm = 'Intel 7 (10nm)'; singleBench = 104;
  } else if (/12100|14100/i.test(slug)) {
    cores = 4; threads = 8; pCores = 4; eCores = 0;
    archName = 'Golden Cove (Intel Pure Performance)';
    smtType = 'Intel Hyper-Threading (2T/C)';
    smtGainPct = 28; l3CacheMB = 12; nodeNm = 'Intel 7 (10nm)'; singleBench = 98;
  }
  // AMD Threadripper HEDT
  else if (/threadripper/i.test(slug)) {
    if (/7995|5995|7980/i.test(slug)) { cores = 64; threads = 128; }
    else if (/7970|3970/i.test(slug)) { cores = 32; threads = 64; }
    else if (/7960|7965|3960/i.test(slug)) { cores = 24; threads = 48; }
    else { cores = 32; threads = 64; }
    pCores = cores; eCores = 0;
    archName = 'Zen HEDT Multi-Die';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 32; l3CacheMB = 128; nodeNm = 'TSMC 5nm/7nm'; singleBench = 125;
  }
  // AMD Ryzen 9000 Zen 5
  else if (/9950/i.test(slug)) {
    cores = 16; threads = 32; pCores = 16; eCores = 0;
    archName = isX3D ? 'Zen 5 + 3D V-Cache (Dual CCD)' : 'Zen 5 (Dual CCD 2x8C)';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 30; l3CacheMB = isX3D ? 128 : 64; nodeNm = 'TSMC 4nm N4P'; singleBench = 142;
  } else if (/9900/i.test(slug)) {
    cores = 12; threads = 24; pCores = 12; eCores = 0;
    archName = isX3D ? 'Zen 5 + 3D V-Cache (Dual CCD)' : 'Zen 5 (Dual CCD 2x6C)';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 30; l3CacheMB = isX3D ? 128 : 64; nodeNm = 'TSMC 4nm N4P'; singleBench = 140;
  } else if (/9800x3d|9850x3d/i.test(slug)) {
    cores = 8; threads = 16; pCores = 8; eCores = 0;
    archName = 'Zen 5 + 2nd Gen 3D V-Cache';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = 96; nodeNm = 'TSMC 4nm N4P'; singleBench = 138;
  } else if (/9700/i.test(slug)) {
    cores = 8; threads = 16; pCores = 8; eCores = 0;
    archName = 'Zen 5 (Single CCD)';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = 32; nodeNm = 'TSMC 4nm N4P'; singleBench = 136;
  } else if (/9600/i.test(slug)) {
    cores = 6; threads = 12; pCores = 6; eCores = 0;
    archName = 'Zen 5 (Single CCD)';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = 32; nodeNm = 'TSMC 4nm N4P'; singleBench = 134;
  }
  // AMD Ryzen 7000 Zen 4
  else if (/7950/i.test(slug)) {
    cores = 16; threads = 32; pCores = 16; eCores = 0;
    archName = isX3D ? 'Zen 4 + 3D V-Cache (Dual CCD)' : 'Zen 4 (Dual CCD 2x8C)';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 30; l3CacheMB = isX3D ? 128 : 64; nodeNm = 'TSMC 5nm'; singleBench = 128;
  } else if (/7900/i.test(slug)) {
    cores = 12; threads = 24; pCores = 12; eCores = 0;
    archName = isX3D ? 'Zen 4 + 3D V-Cache (Dual CCD)' : 'Zen 4 (Dual CCD 2x6C)';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 30; l3CacheMB = isX3D ? 128 : 64; nodeNm = 'TSMC 5nm'; singleBench = 126;
  } else if (/7800x3d/i.test(slug)) {
    cores = 8; threads = 16; pCores = 8; eCores = 0;
    archName = 'Zen 4 + 3D V-Cache';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = 96; nodeNm = 'TSMC 5nm'; singleBench = 114;
  } else if (/7700|8700/i.test(slug)) {
    cores = 8; threads = 16; pCores = 8; eCores = 0;
    archName = 'Zen 4 (Single CCD)';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = 32; nodeNm = 'TSMC 5nm'; singleBench = 118;
  } else if (/7600x3d/i.test(slug)) {
    cores = 6; threads = 12; pCores = 6; eCores = 0;
    archName = 'Zen 4 + 3D V-Cache';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = 96; nodeNm = 'TSMC 5nm'; singleBench = 110;
  } else if (/7600|7500|7400|8600|8500|8400/i.test(slug)) {
    cores = 6; threads = 12; pCores = 6; eCores = 0;
    archName = 'Zen 4 (Single CCD)';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = /7600|7500/i.test(slug) ? 32 : 16; nodeNm = 'TSMC 5nm/4nm'; singleBench = 112;
  }
  // AMD Ryzen 5000 Zen 3
  else if (/5950/i.test(slug)) {
    cores = 16; threads = 32; pCores = 16; eCores = 0;
    archName = 'Zen 3 (Dual CCD 2x8C)';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = 64; nodeNm = 'TSMC 7nm'; singleBench = 92;
  } else if (/5900/i.test(slug)) {
    cores = 12; threads = 24; pCores = 12; eCores = 0;
    archName = 'Zen 3 (Dual CCD 2x6C)';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = 64; nodeNm = 'TSMC 7nm'; singleBench = 90;
  } else if (/5800x3d|5700x3d/i.test(slug)) {
    cores = 8; threads = 16; pCores = 8; eCores = 0;
    archName = 'Zen 3 + 3D V-Cache';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = 96; nodeNm = 'TSMC 7nm'; singleBench = 82;
  } else if (/5800|5700/i.test(slug)) {
    cores = 8; threads = 16; pCores = 8; eCores = 0;
    archName = 'Zen 3 (Single CCD)';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = /5700x\b|5800x\b/i.test(slug) ? 32 : 16; nodeNm = 'TSMC 7nm'; singleBench = 88;
  } else if (/5600|5500/i.test(slug)) {
    cores = 6; threads = 12; pCores = 6; eCores = 0;
    archName = 'Zen 3';
    smtType = 'AMD SMT 2-Way (2T/C)';
    smtGainPct = 28; l3CacheMB = /5600x\b|ryzen-5-5600\b/i.test(slug) ? 32 : 16; nodeNm = 'TSMC 7nm'; singleBench = 84;
  } else if (/xeon|2680/i.test(slug)) {
    cores = 14; threads = 28; pCores = 14; eCores = 0;
    archName = 'Broadwell-EP (LGA2011-3)';
    smtType = 'Intel Hyper-Threading (2T/C)';
    smtGainPct = 25; l3CacheMB = 35; nodeNm = 'Intel 14nm'; singleBench = 38;
  }

  // Socket
  let socket = cpu.socket || 'AM4';
  if (!cpu.socket) {
    if (/7\d00|9\d00|8\d00/i.test(slug)) socket = 'AM5';
    else if (/5\d00|4\d00|3\d00/i.test(slug)) socket = 'AM4';
    else if (/12\d00|13\d00|14\d00/i.test(slug)) socket = 'LGA1700';
    else if (/2\d\dk/i.test(slug)) socket = 'LGA1851';
    else if (/xeon|2680/i.test(slug)) socket = 'LGA2011-3';
    else if (/threadripper/i.test(slug)) socket = 'sTR5';
  }

  const ddr = cpu.ddr || (socket === 'AM5' || socket === 'LGA1851' || socket === 'sTR5' ? 'DDR5' : (socket === 'LGA1700' ? 'DDR4/DDR5' : 'DDR4'));
  const brand = (/ryzen|amd|threadripper/i.test(name) || /ryzen|amd|threadripper/i.test(slug)) ? 'AMD' : 'Intel';
  const tdp = cpu.tdp_w || (cores >= 16 ? 170 : (cores >= 8 ? 105 : 65));
  const multiBench = cpu.benchmark || (cores * 900);
  const speedupRatio = (multiBench / Math.max(1, singleBench * 45)).toFixed(1);
  const scorePerCore = Math.round(multiBench / Math.max(1, cores));
  const scorePerWatt = (multiBench / Math.max(1, tdp)).toFixed(1);

  return {
    cores, threads, pCores, eCores, socket, ddr, brand, tdp, isX3D,
    archName, smtType, smtGainPct, l3CacheMB, nodeNm,
    multiBench, singleBench, speedupRatio, scorePerCore, scorePerWatt
  };
}
window.getCpuSpecs = getCpuSpecs;

// 2. CPU Gaming Score (Scaled 0-100)
function getCpuGamingScore(cpu) {
  if (!cpu) return 50;
  if (typeof getCpuGamingIndex === 'function') {
    const idx = getCpuGamingIndex(cpu);
    if (idx && !isNaN(idx)) return Math.max(20, Math.min(105, Math.round(idx)));
  }
  const s = cpu._specs || getCpuSpecs(cpu);
  let baseScore = 50;
  if (s.isX3D) baseScore = 90;
  else if (s.socket === 'AM5') baseScore = 78;
  else if (s.socket === 'LGA1700') baseScore = 72;
  else if (s.socket === 'AM4') baseScore = 56;
  else if (s.socket === 'LGA2011-3') baseScore = 32;
  return baseScore;
}
window.getCpuGamingScore = getCpuGamingScore;

// 3. CPU Workstation Score: Evaluates 3D Render (Cinebench/Blender), Video Editing, and Code Compilation
function getCpuWorkstationScore(cpu) {
  if (!cpu) return 50;
  const s = cpu._specs || getCpuSpecs(cpu);
  const bench = cpu.benchmark || (s.cores * 900);
  // Catalog leader is Ryzen 9 9950X (~16,856 Cinebench multi pts)
  const multiNorm = Math.min(100, (bench / 16856) * 100);

  const ws = STATE.workstationProfile || { rendering: 40, editing: 30, compilation: 30 };
  const totalWs = Math.max(1, (ws.rendering || 40) + (ws.editing || 30) + (ws.compilation || 30));

  // Pillar A: 3D Rendering (Blender Cycles, Cinebench Multi, V-Ray, Octane CPU fallback)
  const renderScore = multiNorm;

  // Pillar B: Video Editing (Premiere, DaVinci Resolve scrubbing/playback - Intel non-F gets QuickSync boost)
  const singleNorm = getCpuGamingScore(cpu) * 0.95;
  const isIntelNonF = s.brand === 'Intel' && !/f\b/i.test(cpu.slug);
  const editingScore = (multiNorm * 0.50 + singleNorm * 0.50) * (isIntelNonF ? 1.15 : 1.0);

  // Pillar C: Code Compilation & Dev (C++, Rust, Docker build, Webpack, Virtualization)
  const isDdr5 = (s.ddr || '').includes('DDR5');
  const compScore = (multiNorm * 0.70 + singleNorm * 0.30) * (isDdr5 ? 1.06 : 1.0) * (s.isX3D ? 1.06 : 1.0);

  const finalScore = ((ws.rendering || 40) * renderScore + (ws.editing || 30) * editingScore + (ws.compilation || 30) * compScore) / totalWs;
  return Math.min(100, Math.max(15, Math.round(finalScore)));
}
window.getCpuWorkstationScore = getCpuWorkstationScore;

// 4. CPU AI Score: AVX-512 vector acceleration (Zen 4/5), INT8 quantization, and llama.cpp
function getCpuAIScore(cpu) {
  if (!cpu) return 50;
  const s = cpu._specs || getCpuSpecs(cpu);
  const bench = cpu.benchmark || (s.cores * 900);
  const multiNorm = Math.min(100, (bench / 16856) * 100);

  // Zen 4 / Zen 5 have hardware AVX-512 execution for ~35% token/s speedup in llama.cpp
  const hasAVX512 = s.socket === 'AM5' || /9\d00|7\d00|8\d00/i.test(cpu.slug);
  const hasNPU = /ultra/i.test(cpu.name) || /ultra/i.test(cpu.slug);

  const aiScore = (multiNorm * 0.60 + getCpuGamingScore(cpu) * 0.40) * (hasAVX512 ? 1.30 : (hasNPU ? 1.15 : 1.0));
  return Math.min(100, Math.max(15, Math.round(aiScore)));
}
window.getCpuAIScore = getCpuAIScore;

// 5. Contextual Composite CPU Score (Normalized 0-10,000 for strict parity)
function getCpuContextualCompositeScore(cpu, customWeights = null) {
  if (!cpu) return 5000;
  const wg = customWeights ? customWeights.wGaming : (STATE.wGaming !== undefined ? STATE.wGaming : 30);
  const wws = customWeights ? customWeights.wWorkstation : (STATE.wWorkstation !== undefined ? STATE.wWorkstation : 35);
  const wa = customWeights ? customWeights.wAI : (STATE.wAI !== undefined ? STATE.wAI : 20);
  const ws = customWeights ? customWeights.wSoft : (STATE.wSoft !== undefined ? STATE.wSoft : 15);
  const totalW = Math.max(1, wg + wws + wa + ws);

  const s = cpu._specs || getCpuSpecs(cpu);
  const game = getCpuGamingScore(cpu);
  const work = getCpuWorkstationScore(cpu);
  const ai = getCpuAIScore(cpu);

  // Soft/Engineering on CPU is aligned with Workstation and multi-threaded throughput
  const rawComposite = (wg * game + wws * work + wa * ai + ws * work) / totalW;

  // Responsiveness Factor: IPC & Clock Frequency weight
  // Ancient Broadwell/Haswell cores at ~2.5 GHz feel sluggish in daily use and compilation responsiveness.
  // Modern baseline single-core IPC benchmark is ~82 (Ryzen 5 5600 / i5-12400F).
  const singleIPC = s.singleBench || 60;
  const ipcFreqMultiplier = Math.pow(Math.max(0.40, singleIPC / 82), 0.65);

  // Platform Risk / Obsolescence: Ancient server chips (LGA2011-3 / X99) have high failure rates, 
  // high idle consumption, DDR3/early DDR4 speeds, and lack modern PCIe 4.0/5.0 lanes.
  const isLegacyServer = (s.socket === 'LGA2011-3' || /xeon|2680|2670|2690/i.test(cpu.slug) || /xeon/i.test(cpu.name));
  const platformMultiplier = isLegacyServer ? 0.72 : 1.0;

  const adjustedScore = rawComposite * ipcFreqMultiplier * platformMultiplier;
  return Math.round(adjustedScore * 100);
}
window.getCpuContextualCompositeScore = getCpuContextualCompositeScore;

// Helper to look up typical catalog prices for Motherboards and RAM by socket & standard
function getTypicalMoboPrice(socket) {
  const match = (DB.motherboards || []).find(m => (m.socket || '').toUpperCase() === (socket || '').toUpperCase() && m.price_brl > 0);
  if (match) return match.price_brl;
  const baseBrl = socket === 'AM5' ? 750 : (socket === 'LGA1851' ? 890 : (socket === 'LGA1700' ? 720 : 480));
  const rate = DB.exchange_rate || 1.0;
  return Math.round(baseBrl * rate);
}

function getTypicalRamPrice(ddrType) {
  const match = (DB.rams || []).find(r => (r.memory_type || r.ddr || '').toUpperCase().includes(ddrType) && r.price_brl > 0);
  if (match) return match.price_brl;
  const baseBrl = ddrType === 'DDR5' ? 580 : 240;
  const rate = DB.exchange_rate || 1.0;
  return Math.round(baseBrl * rate);
}

// 6. Platform Migration Cost Calculator (Socket + DDR4/DDR5 + Cooler TDP)
function getCpuPlatformMigrationCost(candCpu, baseCpu) {
  if (!candCpu || !baseCpu) return { needsMobo: false, moboCost: 0, moboName: '', needsRam: false, ramCost: 0, ramName: '', needsCooler: false, coolerCost: 0, coolerName: '', totalCost: 0, isSamePlatform: true };

  const cSpecs = candCpu._specs || getCpuSpecs(candCpu);
  const bSpecs = baseCpu._specs || getCpuSpecs(baseCpu);

  const needsMobo = (cSpecs.socket || '').toUpperCase() !== (bSpecs.socket || '').toUpperCase();
  const candNeedsDdr5 = (cSpecs.ddr || '').toUpperCase().includes('DDR5') && !(cSpecs.ddr || '').toUpperCase().includes('DDR4');
  const baseHasDdr5 = (bSpecs.ddr || '').toUpperCase().includes('DDR5');
  const needsRam = candNeedsDdr5 && !baseHasDdr5;

  const candTdp = cSpecs.tdp || 65;
  const baseTdp = bSpecs.tdp || 65;
  const needsCooler = candTdp >= 105 && baseTdp < 95;

  let moboCost = 0;
  let moboName = '';
  if (needsMobo) {
    const sock = (cSpecs.socket || '').toUpperCase();
    moboCost = getTypicalMoboPrice(sock);
    moboName = sock === 'AM5' ? 'Placa-Mãe B650M (AM5)' : (sock === 'LGA1851' ? 'Placa-Mãe B860 (LGA1851)' : (sock === 'LGA1700' ? 'Placa-Mãe B760 (LGA1700)' : 'Placa-Mãe B550M (AM4)'));
  }

  let ramCost = 0;
  let ramName = '';
  if (needsRam) {
    ramCost = getTypicalRamPrice('DDR5');
    ramName = 'Kit 32GB (2x16GB) DDR5 6000MT/s';
  }

  let coolerCost = 0;
  let coolerName = '';
  if (needsCooler) {
    const rate = DB.exchange_rate || 1.0;
    coolerCost = Math.round(180 * rate);
    coolerName = 'Air Cooler Dual Tower / Water Cooler 240mm (TDP 105W+)';
  }

  const totalCost = moboCost + ramCost + coolerCost;

  return {
    needsMobo,
    moboCost,
    moboName,
    needsRam,
    ramCost,
    ramName,
    needsCooler,
    coolerCost,
    coolerName,
    totalCost,
    isSamePlatform: !needsMobo && !needsRam && !needsCooler
  };
}
window.getCpuPlatformMigrationCost = getCpuPlatformMigrationCost;

// 7. Contextual CPU Enrichment (Scores, Platform Mode, Pareto Dominance, and CB Ratios)
STATE.excludeXeons = true;
function toggleExcludeXeons(checked) {
  STATE.excludeXeons = !!checked;
  enrichCPUsWithContextualMetrics();
  renderCpuCBTable();
}
window.toggleExcludeXeons = toggleExcludeXeons;

function enrichCPUsWithContextualMetrics() {
  if (!DB.cpus || !DB.cpus.length) return;

  // Step 1: Compute composite score for all CPUs
  DB.cpus.forEach(c => {
    c._specs = getCpuSpecs(c);
    c._gamingScore = getCpuGamingScore(c);
    c._workstationScore = getCpuWorkstationScore(c);
    c._aiScore = getCpuAIScore(c);
    c._compositeScore = getCpuContextualCompositeScore(c);

    // Platform mode adjustment: if bundle mode, calculate migration cost relative to base CPU
    let effPrice = c.price_brl || 99999;
    if (STATE.cpuCbPlatformMode === 'bundle') {
      const baseCpu = (DB.cpus || []).find(b => b.slug === (STATE.cpuCbRelBaseSlug || STATE.cpuDuelBaseSlug)) || STATE.refPC.cpu;
      if (baseCpu) {
        const mig = getCpuPlatformMigrationCost(c, baseCpu);
        effPrice += mig.totalCost;
      }
    }
    c._effectiveUpgradePrice = effPrice;
  });

  // Step 2: Pareto dominance and CB score
  let maxRawRatio = 0;
  DB.cpus.forEach(c => {
    const s = c._specs || getCpuSpecs(c);
    const isLegacyServer = (s.socket === 'LGA2011-3' || /xeon|2680|2670|2690/i.test(c.slug) || /xeon/i.test(c.name));
    const price = c._effectiveUpgradePrice || c.price_brl || 99999;
    let paretoPenalty = 1.0;
    let dominatedBy = null;

    DB.cpus.forEach(other => {
      if (other.slug === c.slug) return;
      const otherPrice = other._effectiveUpgradePrice || other.price_brl || 99999;
      if (otherPrice <= price * 1.03 && other._compositeScore > c._compositeScore * 1.08) {
        const ratio = c._compositeScore / Math.max(1, other._compositeScore);
        if (ratio < paretoPenalty) {
          paretoPenalty = ratio;
          dominatedBy = other.name;
        }
      }
    });

    c._dominatedBy = dominatedBy;
    c._paretoPenalty = paretoPenalty;

    // Amortize platform investment overhead (~R$ 250-350) so sub-R$ 150 legacy parts don't distort CB index to infinity
    const amortizedPrice = price + (isLegacyServer ? 350 : 250);
    const rawRatio = (c._compositeScore / amortizedPrice) * Math.pow(paretoPenalty, 0.85);
    c._rawCBRatio = rawRatio;
    if (rawRatio > maxRawRatio) maxRawRatio = rawRatio;
  });

  DB.cpus.forEach(c => {
    c._myCBScore = maxRawRatio > 0 ? Math.min(100, Math.max(15, Math.round((c._rawCBRatio / maxRawRatio) * 100))) : 50;
  });
}
window.enrichCPUsWithContextualMetrics = enrichCPUsWithContextualMetrics;

// 8. Relational CPU Upgrade Evaluator (Strict Linear Parity + Migration Overhead)
function evaluateCpuRelationalUpgrade(baseCpu, candCpu, basePrice, candPrice) {
  const baseComp = getCpuContextualCompositeScore(baseCpu);
  const candComp = getCpuContextualCompositeScore(candCpu);
  const perfRatio = candComp / Math.max(1, baseComp);
  const perfGainPct = (perfRatio - 1) * 100;

  const baseGame = getCpuGamingScore(baseCpu);
  const candGame = getCpuGamingScore(candCpu);
  const gamingGainPct = ((candGame / Math.max(1, baseGame)) - 1) * 100;

  const baseWS = getCpuWorkstationScore(baseCpu);
  const candWS = getCpuWorkstationScore(candCpu);
  const wsGainPct = ((candWS / Math.max(1, baseWS)) - 1) * 100;

  const baseAI = getCpuAIScore(baseCpu);
  const candAI = getCpuAIScore(candCpu);
  const aiGainPct = ((candAI / Math.max(1, baseAI)) - 1) * 100;

  const migration = getCpuPlatformMigrationCost(candCpu, baseCpu);
  const actualCpuDelta = candPrice - basePrice;
  const actualTotalDelta = actualCpuDelta + migration.totalCost;

  // Linear Fair Parity: How much more is it fair to pay for +X% contextual performance?
  const linearParityDelta = basePrice * (perfRatio - 1);
  const fairMaxDelta = Math.round(Math.max(0, linearParityDelta));
  const stealDelta = Math.round(fairMaxDelta * 0.72);
  const stretchMaxDelta = Math.round(fairMaxDelta * 1.25);

  let verdictType = 'fair';
  let badgeColor = 'sky';
  let badgeLabel = 'UPGRADE JUSTO';
  let headline = '';
  let summary = '';

  const netDiff = actualTotalDelta - fairMaxDelta;

  if (candComp <= baseComp) {
    verdictType = 'inferior';
    badgeColor = 'rose';
    badgeLabel = 'SEM GANHO REAL';
    headline = 'Desempenho Similar ou Inferior à Base';
    summary = `O ${candCpu.name} entrega desempenho similar ou inferior ao ${baseCpu.name} para o seu perfil. Não justifica o investimento.`;
  } else if (actualTotalDelta <= stealDelta) {
    verdictType = 'steal';
    badgeColor = 'emerald';
    badgeLabel = 'PECHINCHA / EXCELENTE';
    headline = 'Excelente Oportunidade de Upgrade';
    summary = `O salto de +${perfGainPct.toFixed(1)}% no desempenho contextual custa apenas ${fmtBRLShort(actualTotalDelta)} adicionais (abaixo do teto justo de ${fmtBRLShort(fairMaxDelta)}). ${migration.totalCost > 0 ? `Mesmo incluindo os ${fmtBRLShort(migration.totalCost)} de migração de plataforma, continua compensando muito!` : 'Aproveitamento 100% da sua placa-mãe e memórias!'}`;
  } else if (actualTotalDelta <= fairMaxDelta) {
    verdictType = 'fair';
    badgeColor = 'sky';
    badgeLabel = 'COMPENSA (PARIDADE JUSTA)';
    headline = 'Upgrade Equilibrado Dentro da Paridade';
    summary = `O custo adicional de ${fmtBRLShort(actualTotalDelta)} está estritamente alinhado com o ganho de +${perfGainPct.toFixed(1)}% (+${gamingGainPct.toFixed(0)}% Jogos, +${wsGainPct.toFixed(0)}% Workstation).`;
  } else if (actualTotalDelta <= stretchMaxDelta) {
    verdictType = 'enthusiast';
    badgeColor = 'amber';
    badgeLabel = 'ÁGIO DE ENTUSIASTA';
    headline = 'Preço com Ágio Acima do Ganho Proporcional';
    summary = `Está custando ${fmtBRLShort(netDiff)} acima da paridade linear (+${fmtBRLShort(fairMaxDelta)}). Só compensa se você precisar do desempenho imediatamente para trabalho ou taxas extremas de quadros em jogos competitivos.`;
  } else {
    verdictType = 'overpriced';
    badgeColor = 'rose';
    badgeLabel = 'NÃO COMPENSA NO MOMENTO';
    headline = 'Custo Desproporcional ao Ganho';
    summary = `O custo total de ${fmtBRLShort(actualTotalDelta)} está ${fmtBRLShort(netDiff)} acima do valor justo. ${migration.totalCost > 0 ? `O custo de migração de plataforma (${fmtBRLShort(migration.totalCost)}) pesa muito.` : ''} Recomendamos aguardar promoções ou considerar alternativas no mesmo socket.`;
  }

  return {
    baseComp,
    candComp,
    perfRatio,
    perfGainPct,
    gamingGainPct,
    wsGainPct,
    aiGainPct,
    migration,
    actualCpuDelta,
    actualTotalDelta,
    linearParityDelta,
    fairMaxDelta,
    stealDelta,
    stretchMaxDelta,
    verdictType,
    badgeColor,
    badgeLabel,
    headline,
    summary
  };
}
window.evaluateCpuRelationalUpgrade = evaluateCpuRelationalUpgrade;

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

  ['versus', 'cb', 'builder', 'upgrades', 'bf', 'bf-promos', 'sim', 'config'].forEach(id => {
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
  if (tabId === 'bf-promos' && typeof startBFLivePolling === 'function') {
    startBFLivePolling();
  } else if (tabId !== 'bf-promos' && typeof stopBFLivePolling === 'function') {
    stopBFLivePolling();
  }
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
  const ws = STATE.wWorkstation !== undefined ? STATE.wWorkstation : 35;
  const wi = STATE.workloadIntensity || { gaming: 3, workstation: 3, localAI: 3, aiTraining: 3 };
  const intSuffix = STATE.context === 'laptop'
    ? ` • Carga: J${wi.gaming || 3}/W${wi.workstation || 3}/IA${wi.localAI || 3}/Tr${wi.aiTraining || 3}`
    : '';
  el.textContent = `${STATE.monitorRes || '1440p'} @ ${STATE.monitorMaxFps || 144}Hz • Jogos ${STATE.wGaming}% • WS ${ws}% • IA ${STATE.wAI}%${intSuffix}`;
}

function syncLaptopContextViews() {
  const isLap = STATE.context === 'laptop';
  const togglePair = (deskId, lapId) => {
    const d = document.getElementById(deskId);
    const l = document.getElementById(lapId);
    if (d) d.classList.toggle('hidden', isLap);
    if (l) l.classList.toggle('hidden', !isLap);
  };
  togglePair('builder-desktop-view', 'builder-laptop-view');
  togglePair('upgrades-desktop-view', 'upgrades-laptop-view');
  togglePair('sim-desktop-view', 'sim-laptop-view');
  togglePair('cfg-ref-desktop-section', 'cfg-ref-laptop-section');

  // In Live Promos tab, isolate filter pills for Laptop Mode vs Desktop Mode
  const pills = document.querySelectorAll('#bf-cards-filter-pills button[data-bf-filter]');
  pills.forEach(btn => {
    const k = btn.getAttribute('data-bf-filter');
    if (k === 'gpu' || k === 'cpu' || k === 'ram') {
      btn.classList.toggle('hidden', isLap);
    } else if (k === 'laptop') {
      btn.classList.toggle('hidden', !isLap);
    }
  });
}
window.syncLaptopContextViews = syncLaptopContextViews;

// Re-render only the currently visible tab
function renderActiveTab() {
  const t = STATE.activeTab;
  const ctx = STATE.context;
  syncLaptopContextViews();
  try {
    if (t === 'versus') {
      const gpuView = document.getElementById('versus-gpu-view');
      const cpuView = document.getElementById('versus-cpu-view');
      const lapView = document.getElementById('versus-laptop-view');
      if (ctx === 'laptop') {
        if (gpuView) gpuView.classList.add('hidden');
        if (cpuView) cpuView.classList.add('hidden');
        if (lapView) lapView.classList.remove('hidden');
        if (typeof renderLaptopDuelAnalysis === 'function') renderLaptopDuelAnalysis();
      } else if (ctx === 'cpu') {
        if (gpuView) gpuView.classList.add('hidden');
        if (lapView) lapView.classList.add('hidden');
        if (cpuView) cpuView.classList.remove('hidden');
        if (typeof renderCpuDuelAnalysis === 'function') renderCpuDuelAnalysis();
      } else {
        if (cpuView) cpuView.classList.add('hidden');
        if (lapView) lapView.classList.add('hidden');
        if (gpuView) gpuView.classList.remove('hidden');
        renderDuelAnalysis();
      }
    }
    if (t === 'cb') {
      const gpuView = document.getElementById('cb-gpu-view');
      const cpuView = document.getElementById('cb-cpu-view');
      const lapView = document.getElementById('cb-laptop-view');
      if (ctx === 'laptop') {
        if (gpuView) gpuView.classList.add('hidden');
        if (cpuView) cpuView.classList.add('hidden');
        if (lapView) lapView.classList.remove('hidden');
        if (typeof renderLaptopCBTable === 'function') renderLaptopCBTable();
      } else if (ctx === 'cpu') {
        if (gpuView) gpuView.classList.add('hidden');
        if (lapView) lapView.classList.add('hidden');
        if (cpuView) cpuView.classList.remove('hidden');
        if (typeof renderCpuCBTable === 'function') renderCpuCBTable();
      } else {
        if (cpuView) cpuView.classList.add('hidden');
        if (lapView) lapView.classList.add('hidden');
        if (gpuView) gpuView.classList.remove('hidden');
        renderCBTable();
      }
    }
    if (t === 'builder') {
      if (ctx === 'laptop' && typeof renderLaptopBuilder === 'function') renderLaptopBuilder();
      else renderPCBuilder();
    }
    if (t === 'upgrades') {
      if (ctx === 'laptop' && typeof renderLaptopUpgrades === 'function') renderLaptopUpgrades();
      else renderUpgradeSuggestions();
    }
    if (t === 'bf') renderBlackFridayTab();
    if (t === 'bf-promos' && typeof renderBFPromosCardsTab === 'function') renderBFPromosCardsTab();
    if (t === 'sim') {
      if (ctx === 'laptop' && typeof renderLaptopSimulator === 'function') renderLaptopSimulator();
      else renderSimulator();
    }
    if (t === 'config') {
      renderConfigTab();
      if (ctx === 'laptop' && typeof renderConfigLaptopSection === 'function') renderConfigLaptopSection();
    }
  } catch (e) {
    console.error('Render error on tab', t, e);
  }
}

// Global Context Toggle: GPU vs CPU vs Notebook
function setMainContext(ctx) {
  STATE.context = (ctx === 'cpu') ? 'cpu' : (ctx === 'laptop' ? 'laptop' : 'gpu');
  try {
    localStorage.setItem('gca_context', STATE.context);
  } catch (_) {}

  // Update header toggle button visual state
  const btnGpu = document.getElementById('btn-ctx-gpu');
  const btnCpu = document.getElementById('btn-ctx-cpu');
  const btnLap = document.getElementById('btn-ctx-laptop');
  const idleCls = "px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200";
  if (btnGpu && btnCpu) {
    btnGpu.className = STATE.context === 'gpu' ? "px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer bg-sky-500 text-slate-950 shadow-sm" : idleCls;
    btnCpu.className = STATE.context === 'cpu' ? "px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer bg-emerald-500 text-slate-950 shadow-sm" : idleCls;
    if (btnLap) {
      btnLap.className = STATE.context === 'laptop' ? "px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer bg-purple-500 text-white shadow-sm" : idleCls;
    }
  }

  const brandSub = document.getElementById('header-brand-sub');
  if (brandSub) {
    brandSub.textContent = STATE.context === 'laptop'
      ? 'Notebook & Full-System Analyzer'
      : 'GPU & CPU Analyzer';
  }

  // Update sidebar titles (same tabs, context-adapted titles)
  const tVersus = document.getElementById('sidebar-tab-title-versus');
  const tCb = document.getElementById('sidebar-tab-title-cb');
  const tBuilder = document.getElementById('sidebar-tab-title-builder');
  const tUpgrades = document.getElementById('sidebar-tab-title-upgrades');
  const tBf = document.getElementById('sidebar-tab-title-bf');

  if (STATE.context === 'laptop') {
    if (tVersus) tVersus.textContent = 'Duelo de Notebooks';
    if (tCb) tCb.textContent = 'Custo-Benefício Notebooks';
    if (tBuilder) tBuilder.textContent = 'Objetivo de Compra';
    if (tUpgrades) tUpgrades.textContent = 'Upgrades (RAM / SSD)';
    if (tBf) tBf.textContent = 'Black Friday Notebooks';
  } else if (STATE.context === 'cpu') {
    if (tVersus) tVersus.textContent = 'Duelo de CPUs';
    if (tCb) tCb.textContent = 'Custo-Benefício CPUs';
    if (tBuilder) tBuilder.textContent = 'Setup & Plataforma';
    if (tUpgrades) tUpgrades.textContent = 'Upgrades CPU & RAM';
    if (tBf) tBf.textContent = 'Black Friday CPUs';
  } else {
    if (tVersus) tVersus.textContent = 'Duelo de GPUs';
    if (tCb) tCb.textContent = 'Custo-Benefício GPUs';
    if (tBuilder) tBuilder.textContent = 'Objetivo de Compra';
    if (tUpgrades) tUpgrades.textContent = 'Upgrades de Plataforma';
    if (tBf) tBf.textContent = 'Black Friday GPUs';
  }

  const sym = STATE.market?.monetary?.currency_symbol || 'R$';
  const regName = STATE.market?.region_name || 'Brasil';
  const statusEl = document.getElementById('header-status');
  if (statusEl && DB && DB.gpus) {
    const countStr = STATE.context === 'laptop'
      ? `${(DB.laptops || []).length} Notebooks monitorados`
      : STATE.context === 'cpu'
        ? `${(DB.cpus || []).length} CPUs monitoradas`
        : `${(DB.gpus || []).length} GPUs monitoradas`;
    statusEl.textContent = `Mercado: ${regName} (${sym}) • Sincronizado às ${DB.updated_at || 'hoje'} • ${countStr}`;
  }

  if (typeof updateBFFamilySelectorOptions === 'function') {
    updateBFFamilySelectorOptions();
  }

  renderActiveTab();
}
window.setMainContext = setMainContext;

// Set Workload Preset (Supports 4 weights + VRAM Heft)
function setWorkloadPreset(g, ws, a, s, heft) {
  if (heft) {
    STATE.vramHeft = heft;
    const vramSel = document.getElementById('select-vram-heft');
    if (vramSel) vramSel.value = heft;
  }
  applyWeights({ gaming: g, workstation: ws, ai: a, soft: s });
}
window.setWorkloadPreset = setWorkloadPreset;

// Apply weights (always normalized to sum 100%) and sync sliders + number boxes
function applyWeights(w) {
  const gIn = (w.gaming !== undefined) ? w.gaming : STATE.wGaming;
  const wsIn = (w.workstation !== undefined) ? w.workstation : (STATE.wWorkstation || 35);
  const aIn = (w.ai !== undefined) ? w.ai : STATE.wAI;
  const sIn = (w.soft !== undefined) ? w.soft : STATE.wSoft;

  const total = Math.max(1, gIn + wsIn + aIn + sIn);
  let g = Math.round((gIn / total) * 100);
  let ws = Math.round((wsIn / total) * 100);
  let a = Math.round((aIn / total) * 100);
  let s = 100 - g - ws - a;

  if (s < 0) {
    if (a + s >= 0) { a += s; s = 0; }
    else if (ws + a + s >= 0) { ws += (a + s); a = 0; s = 0; }
    else { g = 100; ws = 0; a = 0; s = 0; }
  }

  STATE.wGaming = g;
  STATE.wWorkstation = ws;
  STATE.wAI = a;
  STATE.wSoft = s;

  const vramSelect = document.getElementById('select-vram-heft');
  if (vramSelect) STATE.vramHeft = vramSelect.value;

  [['gaming', g], ['workstation', ws], ['ai', a], ['soft', s]].forEach(([k, v]) => {
    const sld = document.getElementById(`slider-w-${k}`);
    if (sld) sld.value = v;
    const num = document.getElementById(`num-w-${k}`);
    if (num && document.activeElement !== num) num.value = v;
  });

  enrichGPUsWithContextualMetrics();
  if (typeof enrichCPUsWithContextualMetrics === 'function') enrichCPUsWithContextualMetrics();
  if (typeof enrichLaptopsWithContextualMetrics === 'function') enrichLaptopsWithContextualMetrics();
  updateTopContextSummary();
  renderActiveTab();
}
window.applyWeights = applyWeights;

// Typing an exact percentage: locked, remainder split proportionally among others
function onWeightNumberInput(key, rawVal) {
  let v = parseInt(rawVal, 10);
  if (isNaN(v)) return;
  v = Math.max(0, Math.min(100, v));

  const cur = {
    gaming: STATE.wGaming,
    workstation: STATE.wWorkstation !== undefined ? STATE.wWorkstation : 35,
    ai: STATE.wAI,
    soft: STATE.wSoft
  };

  const others = Object.keys(cur).filter(k => k !== key);
  const othersSum = others.reduce((acc, k) => acc + (cur[k] || 0), 0);
  const rest = 100 - v;
  const next = { [key]: v };

  if (othersSum <= 0) {
    const part = Math.floor(rest / others.length);
    others.forEach((k, idx) => {
      next[k] = idx === others.length - 1 ? (rest - part * (others.length - 1)) : part;
    });
  } else {
    let accumulated = 0;
    others.forEach((k, idx) => {
      if (idx === others.length - 1) {
        next[k] = Math.max(0, rest - accumulated);
      } else {
        const val = Math.round(rest * (cur[k] / othersSum));
        next[k] = val;
        accumulated += val;
      }
    });
  }

  applyWeights(next);
}
window.onWeightNumberInput = onWeightNumberInput;

// Moving a slider behaves the same way as typing in its box
function onWeightSliderInput(evt) {
  const el = evt && evt.target ? evt.target : document.activeElement;
  if (el && el.id && el.id.startsWith('slider-w-')) {
    return onWeightNumberInput(el.id.replace('slider-w-', ''), el.value);
  }
  // VRAM heft select or unknown source: recompute
  applyWeights({ gaming: STATE.wGaming, workstation: STATE.wWorkstation, ai: STATE.wAI, soft: STATE.wSoft });
}
window.onWeightSliderInput = onWeightSliderInput;

// 5-Step Workload Intensity Engine (1 = Light -> 5 = Extreme)
const WORKLOAD_INTENSITY_LEVELS = {
  1: { label: 'Leve', cls: 'bg-slate-800 text-slate-200 border-slate-600' },
  2: { label: 'Moderado', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  3: { label: 'Pesado', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  4: { label: 'Muito Pesado', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  5: { label: 'Extremo', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' }
};

const WORKLOAD_INTENSITY_DESCS = {
  gaming: {
    1: 'Indies, LoL, Valorant 1080p — iGPU / entrada atende',
    2: 'E-sports 144Hz & AAA Médio 1080p — RTX 3050/4050 sobra',
    3: 'AAA Alto/Ultra 1080p–1440p — RTX 4050/4060 ideal',
    4: 'AAA Ultra + Ray Tracing 1440p — RTX 4060 105W+ / 4070',
    5: 'AAA RT Máximo / 1440p–4K — exige GPU Full-TGP topo'
  },
  workstation: {
    1: 'Office, navegação, Figma, código leve (8–16GB basta)',
    2: 'Dev Full-Stack, Docker, edição leve (16GB, i5-H / M2–M4)',
    3: 'Compilação grande, 4K, Blender médio (16–32GB, H/HX)',
    4: 'Render 3D pesado, VMs, 4K multicam (24–32GB, HX / M4 Pro)',
    5: 'Estúdio 3D / CAD complexo contínuo (32GB+ & CPU/GPU topo)'
  },
  localAI: {
    1: 'Modelos 3B–7B Q4 / Copilot / NPU (4–6GB GPU ok)',
    2: 'LLMs 8B Q4 fluidos no Ollama/LM Studio (6–8GB VRAM / 16GB Unif.)',
    3: 'LLMs 8B–14B Q4 com contexto longo & RAG (8GB+ / 16–24GB Unif.)',
    4: 'LLMs 14B–32B Q4, SDXL / Flux (10–12GB+ / 24GB Unif.)',
    5: 'LLMs 32B+ Q4/Q6 & multi-modelos (Máx. VRAM / 24GB+ Unified)'
  },
  aiTraining: {
    1: 'Experimentos PyTorch / notebooks acadêmicos pequenos',
    2: 'Fine-tuning leve / QLoRA 7B ocasional (RTX 6–8GB / MLX)',
    3: 'LoRA/QLoRA frequente & visão computacional (CUDA 8GB+ 85W+)',
    4: 'Treinamento CUDA FP16 contínuo, batches maiores (RTX 100W+, 24GB+ RAM)',
    5: 'Treinamento pesado local — exige CUDA TFLOPS/TGP máximos + 32GB RAM'
  }
};

function _clampIntensityLevel(v) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return 3;
  return Math.max(1, Math.min(5, n));
}

function syncWorkloadIntensityUI() {
  if (!STATE.workloadIntensity) {
    STATE.workloadIntensity = { gaming: 3, workstation: 3, localAI: 3, aiTraining: 3 };
  }
  ['gaming', 'workstation', 'localAI', 'aiTraining'].forEach(key => {
    const lvl = _clampIntensityLevel(STATE.workloadIntensity[key]);
    STATE.workloadIntensity[key] = lvl;
    const sld = document.getElementById(`slider-int-${key}`);
    if (sld) sld.value = String(lvl);
    const meta = WORKLOAD_INTENSITY_LEVELS[lvl] || WORKLOAD_INTENSITY_LEVELS[3];
    const badge = document.getElementById(`badge-int-${key}`);
    if (badge) {
      badge.textContent = `${lvl}/5 • ${meta.label}`;
      badge.className = `px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold ${meta.cls}`;
    }
    const desc = document.getElementById(`desc-int-${key}`);
    if (desc && WORKLOAD_INTENSITY_DESCS[key]) {
      desc.textContent = WORKLOAD_INTENSITY_DESCS[key][lvl] || '';
    }
  });
}
window.syncWorkloadIntensityUI = syncWorkloadIntensityUI;

function _commitWorkloadIntensityUpdate() {
  syncWorkloadIntensityUI();
  try {
    localStorage.setItem('gca_workload_intensity', JSON.stringify(STATE.workloadIntensity));
  } catch (_) {}
  if (typeof saveUserPrefs === 'function') saveUserPrefs();
  if (typeof enrichLaptopsWithContextualMetrics === 'function') enrichLaptopsWithContextualMetrics();
  updateTopContextSummary();
  renderActiveTab();
}

function onWorkloadIntensityChange(key, rawVal) {
  if (!STATE.workloadIntensity) {
    STATE.workloadIntensity = { gaming: 3, workstation: 3, localAI: 3, aiTraining: 3 };
  }
  if (!['gaming', 'workstation', 'localAI', 'aiTraining'].includes(key)) return;
  STATE.workloadIntensity[key] = _clampIntensityLevel(rawVal);
  _commitWorkloadIntensityUpdate();
}
window.onWorkloadIntensityChange = onWorkloadIntensityChange;

function setWorkloadIntensityPreset(g, ws, localAi, aiTrain) {
  STATE.workloadIntensity = {
    gaming: _clampIntensityLevel(g),
    workstation: _clampIntensityLevel(ws),
    localAI: _clampIntensityLevel(localAi),
    aiTraining: _clampIntensityLevel(aiTrain)
  };
  _commitWorkloadIntensityUpdate();
}
window.setWorkloadIntensityPreset = setWorkloadIntensityPreset;

// Workstation Sub-Profile Config Handler with Proportional Auto-Balancing to 100%
function onWorkstationProfileInput(key, rawVal) {
  let v = parseInt(rawVal, 10);
  if (isNaN(v)) return;
  v = Math.max(0, Math.min(100, v));

  if (!STATE.workstationProfile) {
    STATE.workstationProfile = { rendering: 40, editing: 30, compilation: 30 };
  }

  const cur = {
    rendering: STATE.workstationProfile.rendering || 33,
    editing: STATE.workstationProfile.editing || 33,
    compilation: STATE.workstationProfile.compilation || 34
  };

  const keys = ['rendering', 'editing', 'compilation'];
  const others = keys.filter(k => k !== key);
  const othersSum = (cur[others[0]] || 0) + (cur[others[1]] || 0);
  const rest = 100 - v;

  const next = {};
  next[key] = v;

  if (othersSum === 0) {
    next[others[0]] = Math.floor(rest / 2);
    next[others[1]] = Math.max(0, rest - next[others[0]]);
  } else {
    const val0 = Math.round(rest * (cur[others[0]] / othersSum));
    next[others[0]] = val0;
    next[others[1]] = Math.max(0, rest - val0);
  }

  STATE.workstationProfile = next;

  // Sync inputs
  keys.forEach(k => {
    const sld = document.getElementById(`slider-ws-${k}`);
    if (sld) sld.value = next[k];
    const num = document.getElementById(`num-ws-${k}`);
    if (num && document.activeElement !== num) num.value = next[k];
  });

  const sumEl = document.getElementById('ws-profile-sum-indicator');
  if (sumEl) sumEl.textContent = 'Auto-Balance: 100%';

  try {
    localStorage.setItem('gca_ws_profile', JSON.stringify(STATE.workstationProfile));
  } catch (_) {}

  enrichGPUsWithContextualMetrics();
  if (typeof enrichCPUsWithContextualMetrics === 'function') enrichCPUsWithContextualMetrics();
  if (typeof enrichLaptopsWithContextualMetrics === 'function') enrichLaptopsWithContextualMetrics();
  renderActiveTab();
}
window.onWorkstationProfileInput = onWorkstationProfileInput;

function setWorkstationPreset(preset) {
  let profile = { rendering: 34, editing: 33, compilation: 33 };
  if (preset === 'render') profile = { rendering: 70, editing: 15, compilation: 15 };
  else if (preset === 'editing') profile = { rendering: 15, editing: 70, compilation: 15 };
  else if (preset === 'compilation') profile = { rendering: 15, editing: 15, compilation: 70 };
  else if (preset === 'balanced') profile = { rendering: 34, editing: 33, compilation: 33 };

  STATE.workstationProfile = profile;
  ['rendering', 'editing', 'compilation'].forEach(k => {
    const sld = document.getElementById(`slider-ws-${k}`);
    if (sld) sld.value = profile[k];
    const num = document.getElementById(`num-ws-${k}`);
    if (num) num.value = profile[k];
  });

  const sumEl = document.getElementById('ws-profile-sum-indicator');
  if (sumEl) sumEl.textContent = 'Auto-Balance: 100%';

  try {
    localStorage.setItem('gca_ws_profile', JSON.stringify(STATE.workstationProfile));
  } catch (_) {}

  enrichGPUsWithContextualMetrics();
  if (typeof enrichCPUsWithContextualMetrics === 'function') enrichCPUsWithContextualMetrics();
  if (typeof enrichLaptopsWithContextualMetrics === 'function') enrichLaptopsWithContextualMetrics();
  renderActiveTab();
}
window.setWorkstationPreset = setWorkstationPreset;

// Backwards-compatible aliases
function onWorkloadSlidersChange(evt) { onWeightSliderInput(evt); }
function onWorkloadChange() { onWeightSliderInput(); }

// Populate GPU, CPU & Laptop Dropdowns
function populateSelectors() {
  if (typeof populateLaptopSelectors === 'function') populateLaptopSelectors();
  const sortedGPUs = [...(DB.gpus || [])].sort((a, b) => a.name.localeCompare(b.name));
  const baseSel = document.getElementById('duel-select-base');
  const candSel = document.getElementById('duel-select-cand');
  const cbRelSel = document.getElementById('cb-filter-base-rel');
  const simASel = document.getElementById('sim-select-gpu-a');
  const simBSel = document.getElementById('sim-select-gpu-b');

  if (baseSel && candSel && sortedGPUs.length) {
    const optionsHTML = sortedGPUs.map(g =>
      `<option value="${g.slug}">${g.name} (${g.vram_gb}GB ${g.memory_type}) — ${fmtBRL(g.price_brl)}</option>`
    ).join('');

    baseSel.innerHTML = optionsHTML;
    candSel.innerHTML = optionsHTML;
    if (cbRelSel) {
      cbRelSel.innerHTML = sortedGPUs.map(g =>
        `<option value="${g.slug}">Base Relacional: ${g.name} (${fmtBRLShort(g.price_brl)})</option>`
      ).join('');
    }
    if (simASel) simASel.innerHTML = optionsHTML;
    if (simBSel) simBSel.innerHTML = optionsHTML;

    baseSel.value = STATE.duelBaseSlug;
    candSel.value = STATE.duelCandSlug;
    if (cbRelSel) cbRelSel.value = STATE.cbRelBaseSlug;
    if (simASel) simASel.value = STATE.duelCandSlug;
    if (simBSel) simBSel.value = 'rx-580-8gb-ref';
    syncDuelPriceInputsFromSelection();
  }

  // Populate CPU Selectors
  const cpuBaseSel = document.getElementById('cpu-duel-select-base');
  const cpuCandSel = document.getElementById('cpu-duel-select-cand');
  const cpuCbRelSel = document.getElementById('cpu-cb-filter-base-rel');
  const sortedCPUs = [...(DB.cpus || [])].sort((a, b) => a.name.localeCompare(b.name));

  if (cpuBaseSel && cpuCandSel && sortedCPUs.length) {
    const cpuOptionsHTML = sortedCPUs.map(c =>
      `<option value="${c.slug}">${c.name} (${c.socket || 'CPU'}, ${c.tdp_w || 65}W) — ${fmtBRL(c.price_brl)}</option>`
    ).join('');

    cpuBaseSel.innerHTML = cpuOptionsHTML;
    cpuCandSel.innerHTML = cpuOptionsHTML;
    if (cpuCbRelSel) {
      cpuCbRelSel.innerHTML = sortedCPUs.map(c =>
        `<option value="${c.slug}">Base: ${c.name} (${fmtBRLShort(c.price_brl)})</option>`
      ).join('');
      if (STATE.cpuCbRelBaseSlug) cpuCbRelSel.value = STATE.cpuCbRelBaseSlug;
    }

    if (STATE.cpuDuelBaseSlug) cpuBaseSel.value = STATE.cpuDuelBaseSlug;
    if (STATE.cpuDuelCandSlug) cpuCandSel.value = STATE.cpuDuelCandSlug;

    if (typeof syncCpuDuelPriceInputsFromSelection === 'function') {
      syncCpuDuelPriceInputsFromSelection();
    }
  }

  // CPU selectors for the Simulator: Setup A (CPU A) and Setup B (CPU B)
  const simCpuASel = document.getElementById('sim-select-cpu-a');
  const simCpuBSel = document.getElementById('sim-select-cpu-b');
  const simCpuSel = document.getElementById('sim-select-cpu');
  if (DB.cpus && DB.cpus.length) {
    const defaultASlug = STATE.simCpuASlug || STATE.build?.cpu?.slug || 'ryzen-5-5600';
    const defaultBSlug = STATE.simCpuBSlug || 'ryzen-7-7800x3d';
    const cpusSorted = [...DB.cpus].sort((a, b) => a.name.localeCompare(b.name));
    const cpusHTML = cpusSorted.map(c => `<option value="${c.slug}">${c.name}${c.price_brl ? ' — ' + fmtBRLShort(c.price_brl) : ''}</option>`).join('');

    if (simCpuASel) {
      simCpuASel.innerHTML = cpusHTML;
      simCpuASel.value = (DB.cpus.some(c => c.slug === defaultASlug) ? defaultASlug : DB.cpus[0].slug);
    }
    if (simCpuBSel) {
      simCpuBSel.innerHTML = cpusHTML;
      simCpuBSel.value = (DB.cpus.some(c => c.slug === defaultBSlug) ? defaultBSlug : (DB.cpus[1] || DB.cpus[0]).slug);
    }
    if (simCpuSel) {
      simCpuSel.innerHTML = cpusHTML;
      simCpuSel.value = defaultASlug;
    }
  }
}

function swapSimulatorSetups() {
  const gpuASel = document.getElementById('sim-select-gpu-a');
  const gpuBSel = document.getElementById('sim-select-gpu-b');
  const cpuASel = document.getElementById('sim-select-cpu-a');
  const cpuBSel = document.getElementById('sim-select-cpu-b');
  if (gpuASel && gpuBSel) {
    const tmpGpu = gpuASel.value;
    gpuASel.value = gpuBSel.value;
    gpuBSel.value = tmpGpu;
  }
  if (cpuASel && cpuBSel) {
    const tmpCpu = cpuASel.value;
    cpuASel.value = cpuBSel.value;
    cpuBSel.value = tmpCpu;
    STATE.simCpuASlug = cpuASel.value;
    STATE.simCpuBSlug = cpuBSel.value;
  }
  if (typeof renderSimulator === 'function') {
    renderSimulator();
  }
}
window.swapSimulatorSetups = swapSimulatorSetups;

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
// CPU DUEL RELATIONAL ENGINE & RENDERERS
// ============================================================================

function syncCpuDuelPriceInputsFromSelection() {
  const baseCpu = (DB.cpus || []).find(c => c.slug === STATE.cpuDuelBaseSlug) || (DB.cpus || [])[0];
  const candCpu = (DB.cpus || []).find(c => c.slug === STATE.cpuDuelCandSlug) || (DB.cpus || [])[1];
  const pBase = document.getElementById('cpu-duel-price-base');
  const pCand = document.getElementById('cpu-duel-price-cand');
  if (baseCpu && pBase) pBase.value = baseCpu.price_brl;
  if (candCpu && pCand) pCand.value = candCpu.price_brl;
}
window.syncCpuDuelPriceInputsFromSelection = syncCpuDuelPriceInputsFromSelection;

function resetCpuDuelPricesToLive() {
  syncCpuDuelPriceInputsFromSelection();
  renderCpuDuelAnalysis();
}
window.resetCpuDuelPricesToLive = resetCpuDuelPricesToLive;

function setCpuDuelPair(candSlug, baseSlug) {
  STATE.cpuDuelCandSlug = candSlug;
  STATE.cpuDuelBaseSlug = baseSlug;
  const baseSel = document.getElementById('cpu-duel-select-base');
  const candSel = document.getElementById('cpu-duel-select-cand');
  if (baseSel) baseSel.value = baseSlug;
  if (candSel) candSel.value = candSlug;
  syncCpuDuelPriceInputsFromSelection();
  setMainContext('cpu');
  switchTab('versus');
  renderCpuDuelAnalysis();
}
window.setCpuDuelPair = setCpuDuelPair;

function onCpuDuelSelectionChange() {
  const baseSel = document.getElementById('cpu-duel-select-base');
  const candSel = document.getElementById('cpu-duel-select-cand');
  if (baseSel) STATE.cpuDuelBaseSlug = baseSel.value;
  if (candSel) STATE.cpuDuelCandSlug = candSel.value;
  syncCpuDuelPriceInputsFromSelection();
  renderCpuDuelAnalysis();
}
window.onCpuDuelSelectionChange = onCpuDuelSelectionChange;

function sendCpuToDuel(slug) {
  STATE.cpuDuelCandSlug = slug;
  setMainContext('cpu');
  switchTab('versus');
  const candSel = document.getElementById('cpu-duel-select-cand');
  if (candSel) candSel.value = slug;
  syncCpuDuelPriceInputsFromSelection();
  renderCpuDuelAnalysis();
}
window.sendCpuToDuel = sendCpuToDuel;

let chartCpuDuelRadar = null;
function renderCpuDuelRadarChart(baseCpu, candCpu) {
  const canvas = document.getElementById('chart-cpu-duel-radar');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartCpuDuelRadar) {
    chartCpuDuelRadar.destroy();
    chartCpuDuelRadar = null;
  }

  const bSpecs = baseCpu._specs || getCpuSpecs(baseCpu);
  const cSpecs = candCpu._specs || getCpuSpecs(candCpu);

  const bGame = getCpuGamingScore(baseCpu);
  const cGame = getCpuGamingScore(candCpu);
  const bWS = getCpuWorkstationScore(baseCpu);
  const cWS = getCpuWorkstationScore(candCpu);
  const bSingle = Math.min(100, Math.round(bGame * 0.95));
  const cSingle = Math.min(100, Math.round(cGame * 0.95));
  const bAI = getCpuAIScore(baseCpu);
  const cAI = getCpuAIScore(candCpu);
  const bEff = Math.max(30, Math.min(100, Math.round(100 - (bSpecs.tdp / 220) * 50)));
  const cEff = Math.max(30, Math.min(100, Math.round(100 - (cSpecs.tdp / 220) * 50)));
  const bCB = baseCpu._myCBScore || 70;
  const cCB = candCpu._myCBScore || 70;

  chartCpuDuelRadar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Jogos', 'Workstation', 'Single-Core', 'Compilação/IA', 'Eficiência Térmica', 'Custo-Benefício'],
      datasets: [
        {
          label: baseCpu.name,
          data: [bGame, bWS, bSingle, bAI, bEff, bCB],
          backgroundColor: 'rgba(16, 185, 129, 0.25)',
          borderColor: '#10b981',
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#fff',
          borderWidth: 2
        },
        {
          label: candCpu.name,
          data: [cGame, cWS, cSingle, cAI, cEff, cCB],
          backgroundColor: 'rgba(56, 189, 248, 0.25)',
          borderColor: '#38bdf8',
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#fff',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 20 },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
          pointLabels: {
            color: '#cbd5e1',
            font: { size: 10, family: 'Inter, sans-serif', weight: '600' }
          }
        }
      }
    }
  });

  const legendEl = document.getElementById('cpu-duel-radar-legend');
  if (legendEl) {
    legendEl.innerHTML = `
      <span class="inline-flex items-center gap-1.5 text-emerald-400 font-bold"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>${baseCpu.name}</span>
      <span class="inline-flex items-center gap-1.5 text-sky-400 font-bold"><span class="w-2.5 h-2.5 rounded-full bg-sky-400"></span>${candCpu.name}</span>
    `;
  }
}

let chartCpuDuelHistory = null;
function renderCpuDuelHistoryChart(baseCpu, candCpu) {
  const canvas = document.getElementById('chart-cpu-duel-history');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartCpuDuelHistory) {
    chartCpuDuelHistory.destroy();
    chartCpuDuelHistory = null;
  }

  const bHist = baseCpu.history || [];
  const cHist = candCpu.history || [];
  const dateSet = new Set();
  bHist.forEach(h => dateSet.add(h.date));
  cHist.forEach(h => dateSet.add(h.date));

  if (dateSet.size === 0) {
    const today = new Date().toISOString().slice(0, 10);
    dateSet.add(today);
  }

  const sortedDates = Array.from(dateSet).sort();
  const dates = sortedDates.slice(-60);

  const bMap = {};
  bHist.forEach(h => { bMap[h.date] = h.price; });
  const cMap = {};
  cHist.forEach(h => { cMap[h.date] = h.price; });

  let lastB = baseCpu.price_brl;
  let lastC = candCpu.price_brl;
  const bData = dates.map(d => {
    if (bMap[d] !== undefined) lastB = bMap[d];
    return lastB;
  });
  const cData = dates.map(d => {
    if (cMap[d] !== undefined) lastC = cMap[d];
    return lastC;
  });

  chartCpuDuelHistory = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: baseCpu.name,
          data: bData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: false,
          tension: 0.2,
          pointRadius: 2
        },
        {
          label: candCpu.name,
          data: cData,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.1)',
          fill: false,
          tension: 0.2,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11, family: 'monospace' } } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtBRL(c.raw)}` } }
      },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.03)' } },
        y: { ticks: { color: '#64748b', callback: (v) => fmtBRLShort(v) }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

function renderCpuDuelAlternatives(baseCpu, candCpu) {
  const listEl = document.getElementById('cpu-duel-alternatives-list');
  const insightEl = document.getElementById('cpu-duel-platform-insight');
  if (!listEl) return;

  const bSpecs = baseCpu._specs || getCpuSpecs(baseCpu);

  const sameSocket = (DB.cpus || [])
    .filter(c => c.slug !== baseCpu.slug && c.slug !== candCpu.slug && (c._specs?.socket === bSpecs.socket || c.socket === bSpecs.socket))
    .sort((a, b) => (b._myCBScore || 0) - (a._myCBScore || 0))
    .slice(0, 3);

  const topWS = (DB.cpus || [])
    .filter(c => c.slug !== baseCpu.slug && c.slug !== candCpu.slug)
    .sort((a, b) => (b._workstationScore || 0) - (a._workstationScore || 0))
    .slice(0, 2);

  const alts = [...sameSocket];
  topWS.forEach(w => {
    if (!alts.some(a => a.slug === w.slug)) alts.push(w);
  });

  listEl.innerHTML = alts.slice(0, 4).map(a => {
    const s = a._specs || getCpuSpecs(a);
    return `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition">
        <div class="space-y-0.5">
          <div class="flex items-center gap-2">
            <span class="font-bold text-white text-xs">${a.name}</span>
            <span class="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">${s.socket}</span>
          </div>
          <div class="text-[11px] text-slate-400 font-mono">
            ${s.cores}C/${s.threads}T • Jogos: <span class="text-emerald-400 font-bold">${a._gamingScore || getCpuGamingScore(a)}</span> • WS: <span class="text-amber-400 font-bold">${a._workstationScore || getCpuWorkstationScore(a)}</span> • CB: <span class="text-purple-300 font-bold">${a._myCBScore || 70}/100</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono font-bold text-white text-xs">${fmtBRL(a.price_brl)}</span>
          <button onclick="setCpuDuelPair('${a.slug}', '${baseCpu.slug}')" class="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-[10px] font-bold cursor-pointer">Comparar ⚔️</button>
        </div>
      </div>
    `;
  }).join('');

  if (insightEl) {
    if (bSpecs.socket === 'AM4') {
      insightEl.innerHTML = `💡 <strong>Dica de Plataforma AM4:</strong> Para extrair máximo FPS sem custo de placa-mãe e RAM DDR5, o <strong>Ryzen 7 5700X3D</strong> é a escolha definitiva no AM4. Para renderização pesada ou longevidade, o salto para AM5 com <strong>Ryzen 5 7600</strong> ou <strong>7800X3D</strong> abre o caminho para DDR5 e suporte até 2027+.`;
    } else if (bSpecs.socket === 'LGA1700') {
      insightEl.innerHTML = `💡 <strong>Dica de Plataforma LGA1700:</strong> O <strong>Core i5 14600KF</strong> é um dos melhores equilíbrios entre jogos e tarefas de workstation com seus 14 núcleos (6P+8E) e alta taxa de IPC.`;
    } else {
      insightEl.innerHTML = `💡 <strong>Dica de Plataforma AM5:</strong> O ecossistema AM5 aceita upgrades diretos de 6 até 16 núcleos (ex: 7600 → 7800X3D ou 9950X) mantendo a mesma placa-mãe B650M e memórias DDR5.`;
    }
  }
}

// 8.5. Multi-Core Performance & Architecture Deep-Dive Renderer
function renderCpuArchitectureComparison(baseCpu, candCpu) {
  const container = document.getElementById('cpu-duel-cores-architecture-box');
  if (!container) return;

  const b = baseCpu._specs || getCpuSpecs(baseCpu);
  const c = candCpu._specs || getCpuSpecs(candCpu);

  const multiGain = Math.round(((c.multiBench / Math.max(1, b.multiBench)) - 1) * 100);
  const singleGain = Math.round(((c.singleBench / Math.max(1, b.singleBench)) - 1) * 100);
  const coreGain = Math.round(((c.cores / Math.max(1, b.cores)) - 1) * 100);
  const threadGain = Math.round(((c.threads / Math.max(1, b.threads)) - 1) * 100);
  const effGain = Math.round(((parseFloat(c.scorePerWatt) / Math.max(0.1, parseFloat(b.scorePerWatt))) - 1) * 100);

  const renderChipTopology = (cpu, s, isBase) => {
    const color = isBase ? 'emerald' : 'sky';
    const border = isBase ? 'border-emerald-500/40' : 'border-sky-500/40';
    const bgBadge = isBase ? 'bg-emerald-500/20 text-emerald-300' : 'bg-sky-500/20 text-sky-300';
    const hybridBadge = s.eCores > 0
      ? `<span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-[10px] font-bold">Híbrido: ${s.pCores}P + ${s.eCores}E</span>`
      : `<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold">${s.cores} Núcleos Uniformes</span>`;

    return `
      <div class="rounded-xl p-4 bg-slate-900/90 border ${border} space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <span class="text-[10px] font-mono uppercase text-${color}-400 font-bold block">${isBase ? 'CPU BASE (REFERÊNCIA)' : 'CPU CANDIDATO (UPGRADE)'}</span>
            <h4 class="text-sm font-bold text-white">${cpu.name}</h4>
          </div>
          <div class="text-right">
            <span class="px-2 py-0.5 rounded ${bgBadge} font-mono text-[11px] font-bold">${s.socket} • ${s.ddr}</span>
            <span class="block text-[10px] text-slate-400 font-mono mt-0.5">${s.nodeNm}</span>
          </div>
        </div>

        <!-- Big Core & Thread Count -->
        <div class="grid grid-cols-2 gap-2 text-center">
          <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span class="block text-[10px] uppercase font-mono text-slate-400">Núcleos Físicos</span>
            <span class="text-xl font-mono font-black text-white">${s.cores} Cores</span>
            <div class="mt-1">${hybridBadge}</div>
          </div>
          <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <span class="block text-[10px] uppercase font-mono text-slate-400">Threads Lógicas</span>
            <span class="text-xl font-mono font-black text-${color}-400">${s.threads} Threads</span>
            <span class="block text-[10px] font-mono text-slate-400 mt-1">${(s.threads / s.cores).toFixed(1)}T / Núcleo</span>
          </div>
        </div>

        <!-- SMT / Hyper-Threading Details -->
        <div class="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-slate-400 text-[11px] font-medium">Topologia / Microarquitetura:</span>
            <span class="font-mono font-bold text-slate-200 text-[11px]">${s.archName}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-400 text-[11px] font-medium">Tecnologia Multithread:</span>
            <span class="font-mono font-bold text-slate-200 text-[11px]">${s.smtType}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-400 text-[11px] font-medium">Ganho de Vazão SMT/HT:</span>
            <span class="font-mono font-bold text-emerald-400 text-[11px]">${s.smtGainPct > 0 ? '+' + s.smtGainPct + '% vazão paralela' : 'Nativo 1:1 (Zero Contenção)'}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-400 text-[11px] font-medium">Subsistema Cache L3:</span>
            <span class="font-mono font-bold ${s.isX3D ? 'text-purple-300' : 'text-slate-200'} text-[11px]">${s.l3CacheMB} MB ${s.isX3D ? '🔥 (3D V-Cache)' : ''}</span>
          </div>
        </div>
      </div>
    `;
  };

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-[10px] font-bold tracking-wider">ARQUITETURA & MULTI-CORE</span>
        <h3 class="text-base font-bold text-white">Topologia de Núcleos, Threads e Escalabilidade Multi-Core</h3>
      </div>
      <span class="text-xs text-slate-400 font-mono">Cores Físicos vs Threads • SMT / Hyper-Threading • Eficiência por Watt</span>
    </div>

    <!-- 1. Side-by-side Topology Comparison -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${renderChipTopology(baseCpu, b, true)}
      ${renderChipTopology(candCpu, c, false)}
    </div>

    <!-- 2. Multi-Core Benchmark & Speedup Indicators -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
      <!-- Card 1: Multi-Core Score -->
      <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
        <span class="text-[10px] uppercase font-mono text-slate-400 block">Cinebench Multi-Core</span>
        <span class="text-lg font-mono font-black text-white mt-0.5 block">${c.multiBench.toLocaleString()} pts</span>
        <span class="text-[11px] font-mono font-bold ${multiGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${multiGain >= 0 ? '+' : ''}${multiGain}% vs base</span>
      </div>

      <!-- Card 2: Single-Core IPC -->
      <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
        <span class="text-[10px] uppercase font-mono text-slate-400 block">Single-Core & IPC</span>
        <span class="text-lg font-mono font-black text-white mt-0.5 block">${c.singleBench} pts</span>
        <span class="text-[11px] font-mono font-bold ${singleGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${singleGain >= 0 ? '+' : ''}${singleGain}% vs base</span>
      </div>

      <!-- Card 3: Multi-Threading Speedup -->
      <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
        <span class="text-[10px] uppercase font-mono text-slate-400 block">Escalabilidade Paralela</span>
        <span class="text-lg font-mono font-black text-sky-300 mt-0.5 block">${c.speedupRatio}×</span>
        <span class="text-[10px] font-mono text-slate-400">vs ${b.speedupRatio}× na base</span>
      </div>

      <!-- Card 4: Score per Core -->
      <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-center">
        <span class="text-[10px] uppercase font-mono text-slate-400 block">Pontos por Núcleo</span>
        <span class="text-lg font-mono font-black text-amber-300 mt-0.5 block">${c.scorePerCore} pts/core</span>
        <span class="text-[10px] font-mono text-slate-400">Base: ${b.scorePerCore} pts/c</span>
      </div>

      <!-- Card 5: Efficiency per Watt -->
      <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-center col-span-2 sm:col-span-1">
        <span class="text-[10px] uppercase font-mono text-slate-400 block">Eficiência Multithread</span>
        <span class="text-lg font-mono font-black text-emerald-400 mt-0.5 block">${c.scorePerWatt} pts/W</span>
        <span class="text-[11px] font-mono font-bold ${effGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${effGain >= 0 ? '+' : ''}${effGain}% vs base</span>
      </div>
    </div>

    <!-- 3. Workstation Real-World Practical Impact -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
      <!-- 3D Render -->
      <div class="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
        <div class="flex items-center justify-between text-xs font-bold text-white">
          <span>🎨 Render 3D (Blender)</span>
          <span class="font-mono ${multiGain >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold">${multiGain >= 0 ? '-' + Math.round(multiGain / (1 + multiGain / 100)) + '% tempo' : '+tempo'}</span>
        </div>
        <p class="text-[11px] text-slate-400 leading-snug">
          Com <strong>${c.threads} threads</strong>, a renderização divide a imagem em mais tiles paralelos, reduzindo a fila de exportação.
        </p>
      </div>

      <!-- Code Compilation -->
      <div class="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
        <div class="flex items-center justify-between text-xs font-bold text-white">
          <span>⚙️ Compilação (Rust/C++)</span>
          <span class="font-mono text-sky-300 font-bold">${c.threads} workers (-j ${c.threads})</span>
        </div>
        <p class="text-[11px] text-slate-400 leading-snug">
          Compiladores modernos escalam linearmente com threads. Ganho de até <strong>${Math.round(threadGain)}%</strong> em builds limpos.
        </p>
      </div>

      <!-- Video Editing -->
      <div class="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
        <div class="flex items-center justify-between text-xs font-bold text-white">
          <span>🎬 Edição 4K (Premiere/DaVinci)</span>
          <span class="font-mono text-amber-300 font-bold">Timeline Fluida</span>
        </div>
        <p class="text-[11px] text-slate-400 leading-snug">
          Decodificação em tempo real de H.264/HEVC 10-bit e efeitos pesados sem perder quadros durante a pré-visualização.
        </p>
      </div>

      <!-- Frame Pacing & Background Tasks -->
      <div class="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
        <div class="flex items-center justify-between text-xs font-bold text-white">
          <span>🛡️ Frame Pacing & 1% Lows</span>
          <span class="font-mono text-purple-300 font-bold">Zero Stutter</span>
        </div>
        <p class="text-[11px] text-slate-400 leading-snug">
          Núcleos sobressalentes absorvem Discord, OBS e navegador sem disputar ciclos com o jogo em execução.
        </p>
      </div>
    </div>
  `;
}
window.renderCpuArchitectureComparison = renderCpuArchitectureComparison;

// 9. Main CPU Duel Renderer
function renderCpuDuelAnalysis() {
  enrichCPUsWithContextualMetrics();
  const baseCpu = (DB.cpus || []).find(c => c.slug === STATE.cpuDuelBaseSlug) || (DB.cpus || [])[0];
  const candCpu = (DB.cpus || []).find(c => c.slug === STATE.cpuDuelCandSlug) || (DB.cpus || [])[1];
  if (!baseCpu || !candCpu) return;

  const pBaseInp = document.getElementById('cpu-duel-price-base');
  const pCandInp = document.getElementById('cpu-duel-price-cand');
  const basePrice = (pBaseInp && parseFloat(pBaseInp.value)) || baseCpu.price_brl || 800;
  const candPrice = (pCandInp && parseFloat(pCandInp.value)) || candCpu.price_brl || 2000;

  // Badges & Target Prices
  const bBadge = document.getElementById('cpu-base-status-badge');
  const cBadge = document.getElementById('cpu-cand-status-badge');
  if (bBadge) bBadge.innerHTML = `<span class="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono">${baseCpu.store_name || 'loja'}</span>`;
  if (cBadge) cBadge.innerHTML = `<span class="bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded font-mono">${candCpu.store_name || 'loja'}</span>`;

  const bTarget = baseCpu.price_stats?.target_price || Math.round(baseCpu.price_brl * 0.90);
  const cTarget = candCpu.price_stats?.target_price || Math.round(candCpu.price_brl * 0.90);
  const targetBaseEl = document.getElementById('cpu-duel-target-base');
  const targetCandEl = document.getElementById('cpu-duel-target-cand');
  if (targetBaseEl) targetBaseEl.textContent = fmtBRL(bTarget);
  if (targetCandEl) targetCandEl.textContent = fmtBRL(cTarget);

  const bMin = baseCpu.price_stats?.min_90d || baseCpu.price_brl;
  const cMin = candCpu.price_stats?.min_90d || candCpu.price_brl;
  const histBaseEl = document.getElementById('cpu-duel-hist-base');
  const histCandEl = document.getElementById('cpu-duel-hist-cand');
  if (histBaseEl) histBaseEl.textContent = `${fmtBRLShort(bMin)} (mín)`;
  if (histCandEl) histCandEl.textContent = `${fmtBRLShort(cMin)} (mín)`;

  // Specs Summaries
  const bSpecs = baseCpu._specs || getCpuSpecs(baseCpu);
  const cSpecs = candCpu._specs || getCpuSpecs(candCpu);
  const specsBaseEl = document.getElementById('cpu-duel-specs-base');
  const specsCandEl = document.getElementById('cpu-duel-specs-cand');
  if (specsBaseEl) {
    specsBaseEl.innerHTML = `
      <span>⚡ <strong>${bSpecs.cores}C / ${bSpecs.threads}T</strong> (${bSpecs.socket} • ${bSpecs.ddr})</span>
      <span>🔥 TDP: <strong>${bSpecs.tdp}W</strong></span>
      <span>🎮 Jogos: <strong class="text-emerald-300">${baseCpu._gamingScore || getCpuGamingScore(baseCpu)} pts</strong></span>
      <span>💼 Workstation: <strong class="text-amber-300">${baseCpu._workstationScore || getCpuWorkstationScore(baseCpu)} pts</strong></span>
      <a href="${baseCpu.offer_url}" target="_blank" class="text-emerald-400 hover:underline font-semibold">Loja (${baseCpu.store_name || 'loja'}) ↗</a>
    `;
  }
  if (specsCandEl) {
    specsCandEl.innerHTML = `
      <span>⚡ <strong>${cSpecs.cores}C / ${cSpecs.threads}T</strong> (${cSpecs.socket} • ${cSpecs.ddr})</span>
      <span>🔥 TDP: <strong>${cSpecs.tdp}W</strong></span>
      <span>🎮 Jogos: <strong class="text-sky-300">${candCpu._gamingScore || getCpuGamingScore(candCpu)} pts</strong></span>
      <span>💼 Workstation: <strong class="text-amber-300">${candCpu._workstationScore || getCpuWorkstationScore(candCpu)} pts</strong></span>
      <a href="${candCpu.offer_url}" target="_blank" class="text-sky-400 hover:underline font-semibold">Loja (${candCpu.store_name || 'loja'}) ↗</a>
    `;
  }

  // Relational Migration and Upgrade Evaluation
  const rel = evaluateCpuRelationalUpgrade(baseCpu, candCpu, basePrice, candPrice);

  // Platform Migration Cost Box
  const platformBox = document.getElementById('cpu-duel-platform-box');
  if (platformBox) {
    if (rel.migration.isSamePlatform) {
      platformBox.className = "mt-5 p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-300 flex items-center justify-between";
      platformBox.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-lg">✅</div>
          <div>
            <span class="font-bold text-sm text-white block">Mesmo Socket (${bSpecs.socket}) & Plataforma 100% Compatível</span>
            <p class="text-[11px] text-slate-300 mt-0.5">Você não precisa trocar placa-mãe nem memórias RAM. Todo o investimento vai 100% para o salto de processamento!</p>
          </div>
        </div>
        <span class="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold text-xs">Custo Plataforma: ${fmtBRL(0)}</span>
      `;
    } else {
      platformBox.className = "mt-5 p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs text-slate-300 space-y-2";
      let partsHTML = [];
      if (rel.migration.needsMobo) {
        partsHTML.push(`<span class="px-2 py-1 rounded bg-slate-900 border border-amber-500/30 font-mono text-[11px] text-amber-300">🔲 Placa-Mãe ${cSpecs.socket}: +${fmtBRL(rel.migration.moboCost)}</span>`);
      }
      if (rel.migration.needsRam) {
        partsHTML.push(`<span class="px-2 py-1 rounded bg-slate-900 border border-amber-500/30 font-mono text-[11px] text-sky-300">💾 32GB DDR5: +${fmtBRL(rel.migration.ramCost)}</span>`);
      }
      if (rel.migration.needsCooler) {
        partsHTML.push(`<span class="px-2 py-1 rounded bg-slate-900 border border-amber-500/30 font-mono text-[11px] text-purple-300">❄️ Cooler 105W+: +${fmtBRL(rel.migration.coolerCost)}</span>`);
      }
      platformBox.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="text-amber-400 font-bold text-sm">📦 Requer Migração de Plataforma:</span>
            <span class="text-[11px] text-slate-400">Mudança de socket (${bSpecs.socket} → ${cSpecs.socket}) ou memórias</span>
          </div>
          <span class="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold text-xs">Total Plataforma: +${fmtBRL(rel.migration.totalCost)}</span>
        </div>
        <div class="flex flex-wrap items-center gap-2 pt-1">
          ${partsHTML.join('')}
        </div>
      `;
    }
  }

  // Multi-Core Performance & Architecture Deep-Dive Breakdown
  if (typeof renderCpuArchitectureComparison === 'function') {
    renderCpuArchitectureComparison(baseCpu, candCpu);
  }

  // Versus Ratings
  const bOverall = Math.round(baseCpu._compositeScore / 100);
  const cOverall = Math.round(candCpu._compositeScore / 100);
  const ratingsEl = document.getElementById('cpu-duel-versus-ratings');
  if (ratingsEl) {
    ratingsEl.innerHTML = `
      <div class="bg-slate-900/90 p-3 rounded-xl border border-emerald-500/30 text-center">
        <span class="text-[10px] font-mono uppercase text-emerald-400 font-bold">${baseCpu.name}</span>
        <div class="text-2xl font-black text-white mt-0.5 font-mono">${bOverall}<span class="text-xs text-slate-400">/100</span></div>
        <span class="text-[10px] text-slate-400">Desempenho Geral</span>
      </div>
      <div class="bg-slate-900/90 p-3 rounded-xl border border-sky-500/30 text-center">
        <span class="text-[10px] font-mono uppercase text-sky-400 font-bold">${candCpu.name}</span>
        <div class="text-2xl font-black text-white mt-0.5 font-mono">${cOverall}<span class="text-xs text-slate-400">/100</span></div>
        <span class="text-[10px] text-slate-400">Desempenho Geral</span>
      </div>
    `;
  }

  // Comparative Bars
  const bRawGame = baseCpu._gamingScore || getCpuGamingScore(baseCpu);
  const cRawGame = candCpu._gamingScore || getCpuGamingScore(candCpu);
  const bRawWS = baseCpu._workstationScore || getCpuWorkstationScore(baseCpu);
  const cRawWS = candCpu._workstationScore || getCpuWorkstationScore(candCpu);
  const bRawAI = baseCpu._aiScore || getCpuAIScore(baseCpu);
  const cRawAI = candCpu._aiScore || getCpuAIScore(candCpu);

  const CUBE_SVG = `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;
  const BRAIN_SVG = `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z"></path><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z"></path></svg>`;
  const BOLT_SVG = `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;

  const barsEl = document.getElementById('cpu-duel-versus-bars');
  if (barsEl) {
    barsEl.innerHTML = [
      renderComparisonBarHTML({
        title: 'Desempenho em Jogos (Gaming Index)',
        iconSvg: SPEEDOMETER_SVG,
        baseVal: bRawGame,
        candVal: cRawGame,
        baseLabel: `${bRawGame} pts`,
        candLabel: `${cRawGame} pts`,
        diffPct: rel.gamingGainPct,
        maxVal: 100,
        baseName: baseCpu.name,
        candName: candCpu.name
      }),
      renderComparisonBarHTML({
        title: 'Workstation / Cinebench / Blender Multi-Core',
        iconSvg: CUBE_SVG,
        baseVal: bRawWS,
        candVal: cRawWS,
        baseLabel: `${bRawWS} pts`,
        candLabel: `${cRawWS} pts`,
        diffPct: rel.wsGainPct,
        maxVal: 100,
        baseName: baseCpu.name,
        candName: candCpu.name
      }),
      renderComparisonBarHTML({
        title: 'IA Local & Compilação (AVX-512 / Cache)',
        iconSvg: BRAIN_SVG,
        baseVal: bRawAI,
        candVal: cRawAI,
        baseLabel: `${bRawAI} pts`,
        candLabel: `${cRawAI} pts`,
        diffPct: rel.aiGainPct,
        maxVal: 100,
        baseName: baseCpu.name,
        candName: candCpu.name
      }),
      renderComparisonBarHTML({
        title: 'Consumo & Térmica (TDP em Watts)',
        iconSvg: BOLT_SVG,
        baseVal: bSpecs.tdp,
        candVal: cSpecs.tdp,
        baseLabel: `${bSpecs.tdp}W`,
        candLabel: `${cSpecs.tdp}W`,
        diffPct: (((cSpecs.tdp / bSpecs.tdp) - 1) * 100),
        maxVal: 200,
        baseName: baseCpu.name,
        candName: candCpu.name
      })
    ].join('');
  }

  // Radar Chart
  renderCpuDuelRadarChart(baseCpu, candCpu);

  // Verdict Box
  const verdictBox = document.getElementById('cpu-duel-verdict-box');
  if (verdictBox) {
    const isGood = rel.verdictType === 'steal' || rel.verdictType === 'fair';
    const borderCls = isGood ? 'border-emerald-500/40 bg-emerald-950/20' : (rel.verdictType === 'enthusiast' ? 'border-amber-500/40 bg-amber-950/20' : 'border-rose-500/40 bg-rose-950/20');
    verdictBox.className = `mt-6 rounded-2xl p-5 border ${borderCls} transition-all`;
    verdictBox.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-1 rounded-full font-mono font-bold text-xs uppercase bg-${rel.badgeColor}-500/20 text-${rel.badgeColor}-300 border border-${rel.badgeColor}-500/40">${rel.badgeLabel}</span>
          <h3 class="text-base font-bold text-white">${rel.headline}</h3>
        </div>
        <div class="text-right">
          <span class="text-xs text-slate-400 block font-mono">Diferença Total (CPU + Plataforma):</span>
          <span class="text-sm font-mono font-bold text-white">${fmtBRL(rel.actualTotalDelta)}</span>
        </div>
      </div>
      <p class="text-xs text-slate-300 mt-3 leading-relaxed">
        ${rel.summary}
      </p>
      <div class="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 gap-2">
        <span>Teto Justo Linear: <strong class="text-sky-300">+${fmtBRL(rel.fairMaxDelta)}</strong></span>
        <span>Zona Pechincha: <strong class="text-emerald-300">≤ +${fmtBRL(rel.stealDelta)}</strong></span>
        <span>Custo Plataforma (Mobo/RAM): <strong class="text-amber-300">+${fmtBRL(rel.migration.totalCost)}</strong></span>
      </div>
    `;
  }

  // Thermometer Bar
  const marker = document.getElementById('cpu-thermometer-marker');
  const markerVal = document.getElementById('cpu-marker-delta-val');
  if (marker && markerVal) {
    markerVal.textContent = fmtBRL(rel.actualTotalDelta);
    let pct = 50;
    if (rel.fairMaxDelta > 0) {
      if (rel.actualTotalDelta <= rel.stealDelta) {
        pct = Math.max(5, Math.min(25, (rel.actualTotalDelta / Math.max(1, rel.stealDelta)) * 25));
      } else if (rel.actualTotalDelta <= rel.fairMaxDelta) {
        pct = 25 + ((rel.actualTotalDelta - rel.stealDelta) / Math.max(1, rel.fairMaxDelta - rel.stealDelta)) * 25;
      } else if (rel.actualTotalDelta <= rel.stretchMaxDelta) {
        pct = 50 + ((rel.actualTotalDelta - rel.fairMaxDelta) / Math.max(1, rel.stretchMaxDelta - rel.fairMaxDelta)) * 25;
      } else {
        pct = Math.min(95, 75 + ((rel.actualTotalDelta - rel.stretchMaxDelta) / Math.max(1, rel.stretchMaxDelta)) * 20);
      }
    }
    marker.style.left = `${pct}%`;
  }
  const subLbl = document.getElementById('cpu-duel-thermometer-subtitle');
  if (subLbl) subLbl.textContent = `Teto linear justo: +${fmtBRL(rel.fairMaxDelta)} | Hoje: +${fmtBRL(rel.actualTotalDelta)}`;

  // Scenarios Grid
  const scenGrid = document.getElementById('cpu-duel-scenarios-grid');
  if (scenGrid) {
    scenGrid.innerHTML = `
      <div class="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs">
        <span class="text-emerald-300 font-bold block">Pechincha / Excelente</span>
        <span class="font-mono text-white text-sm">≤ +${fmtBRL(rel.stealDelta)}</span>
        <p class="text-[10px] text-slate-400 mt-0.5">Ganho de performance a custo proporcionalmente menor que o da base.</p>
      </div>
      <div class="p-2.5 rounded-lg bg-sky-950/30 border border-sky-500/30 text-xs">
        <span class="text-sky-300 font-bold block">Paridade Justa Linear</span>
        <span class="font-mono text-white text-sm">≤ +${fmtBRL(rel.fairMaxDelta)}</span>
        <p class="text-[10px] text-slate-400 mt-0.5">Preço adicional estritamente correspondente a +${rel.perfGainPct.toFixed(1)}% de performance.</p>
      </div>
      <div class="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-xs">
        <span class="text-amber-300 font-bold block">Ágio de Entusiasta</span>
        <span class="font-mono text-white text-sm">≤ +${fmtBRL(rel.stretchMaxDelta)}</span>
        <p class="text-[10px] text-slate-400 mt-0.5">Ágio de até 25% aceitável se você necessita de pico de FPS imediatamente.</p>
      </div>
    `;
  }

  // Historical line chart & alternatives
  renderCpuDuelHistoryChart(baseCpu, candCpu);
  renderCpuDuelAlternatives(baseCpu, candCpu);
}
window.renderCpuDuelAnalysis = renderCpuDuelAnalysis;

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
// CPU COST-BENEFIT (CB) ENGINE, BUNDLE MODE & SCATTER CHART
// ============================================================================

function setCpuCBSort(key) {
  if (STATE.cpuCbSortBy === key) {
    STATE.cpuCbSortAsc = !STATE.cpuCbSortAsc;
  } else {
    STATE.cpuCbSortBy = key;
    STATE.cpuCbSortAsc = (key === 'price' || key === 'target' || key === 'name');
  }
  renderCpuCBTable();
}
window.setCpuCBSort = setCpuCBSort;

function setCpuPlatformMode(mode) {
  STATE.cpuCbPlatformMode = (mode === 'bundle') ? 'bundle' : 'isolated';
  const btnIso = document.getElementById('btn-cpu-mode-isolated');
  const btnBun = document.getElementById('btn-cpu-mode-bundle');
  if (btnIso && btnBun) {
    if (STATE.cpuCbPlatformMode === 'bundle') {
      btnBun.className = "px-2.5 py-1 rounded font-semibold transition cursor-pointer bg-emerald-500 text-slate-950 shadow-sm";
      btnIso.className = "px-2.5 py-1 rounded font-semibold transition cursor-pointer text-slate-400 hover:text-slate-200";
    } else {
      btnIso.className = "px-2.5 py-1 rounded font-semibold transition cursor-pointer bg-emerald-500 text-slate-950 shadow-sm";
      btnBun.className = "px-2.5 py-1 rounded font-semibold transition cursor-pointer text-slate-400 hover:text-slate-200";
    }
  }
  enrichCPUsWithContextualMetrics();
  renderCpuCBTable();
}
window.setCpuPlatformMode = setCpuPlatformMode;

let chartCpuCBScatter = null;
function renderCpuCBScatterChart(cpus) {
  const canvas = document.getElementById('chart-cpu-cb-scatter');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartCpuCBScatter) {
    chartCpuCBScatter.destroy();
    chartCpuCBScatter = null;
  }

  const amdPoints = [];
  const intelPoints = [];

  cpus.forEach(c => {
    const pt = {
      x: c._effectiveUpgradePrice || c.price_brl || 0,
      y: c._myCBScore || 70,
      cpu: c
    };
    if (c._specs?.brand === 'AMD') amdPoints.push(pt);
    else intelPoints.push(pt);
  });

  chartCpuCBScatter = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'AMD Ryzen',
          data: amdPoints,
          backgroundColor: '#10b981',
          borderColor: '#059669',
          pointRadius: 6,
          pointHoverRadius: 9
        },
        {
          label: 'Intel Core / Xeon',
          data: intelPoints,
          backgroundColor: '#38bdf8',
          borderColor: '#0284c7',
          pointRadius: 6,
          pointHoverRadius: 9
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (e, elements) => {
        if (!elements.length) return;
        const el = elements[0];
        const pt = el.element.$context.raw;
        if (pt && pt.cpu) {
          sendCpuToDuel(pt.cpu.slug);
        }
      },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11, family: 'monospace' } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pt = ctx.raw;
              const c = pt.cpu;
              return `${c.name}: ${fmtBRL(pt.x)} | Custo-Benefício: ${c._myCBScore}/100`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: `Preço (${STATE.market?.monetary?.currency_symbol || 'R$'})`, color: '#64748b' },
          ticks: { color: '#94a3b8', callback: v => fmtBRLShort(v) },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        y: {
          min: 10,
          max: 105,
          title: { display: true, text: 'Nota de Custo-Benefício (0–100)', color: '#64748b' },
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

function renderCpuCBTable() {
  enrichCPUsWithContextualMetrics();

  const searchInp = document.getElementById('cpu-cb-search');
  const socketSel = document.getElementById('cpu-cb-filter-socket');
  const brandSel = document.getElementById('cpu-cb-filter-brand');
  const baseRelSel = document.getElementById('cpu-cb-filter-base-rel');

  const search = (searchInp?.value || '').toLowerCase().trim();
  const socketFilter = socketSel?.value || 'ALL';
  const brandFilter = brandSel?.value || 'ALL';
  STATE.cpuCbRelBaseSlug = baseRelSel?.value || STATE.cpuCbRelBaseSlug || 'ryzen-5-5600';

  const baseCpu = (DB.cpus || []).find(c => c.slug === STATE.cpuCbRelBaseSlug) || (DB.cpus || [])[0];
  const isBundle = STATE.cpuCbPlatformMode === 'bundle';

  let rows = [...(DB.cpus || [])];

  // Filters
  if (search) {
    rows = rows.filter(c => (c.name || '').toLowerCase().includes(search) || (c.socket || '').toLowerCase().includes(search) || (c.slug || '').toLowerCase().includes(search));
  }
  if (socketFilter !== 'ALL') {
    rows = rows.filter(c => (c._specs?.socket || c.socket || '').toUpperCase() === socketFilter.toUpperCase());
  }
  if (brandFilter !== 'ALL') {
    rows = rows.filter(c => (c._specs?.brand || '').toUpperCase() === brandFilter.toUpperCase());
  }

  // Exclude Xeons / ancient server chips if checkbox is checked
  const xeonChk = document.getElementById('cpu-cb-exclude-xeon');
  const excludeXeon = xeonChk ? xeonChk.checked : (STATE.excludeXeons !== false);
  STATE.excludeXeons = excludeXeon;
  if (excludeXeon) {
    rows = rows.filter(c => {
      const s = c._specs || getCpuSpecs(c);
      const isXeon = (s.socket === 'LGA2011-3' || /xeon|2680|2670|2690/i.test(c.slug) || /xeon/i.test(c.name));
      return !isXeon;
    });
  }

  // Sorting
  const sortBy = STATE.cpuCbSortBy || 'my_cb';
  const asc = STATE.cpuCbSortAsc;

  rows.sort((a, b) => {
    let va, vb;
    if (sortBy === 'name') { va = a.name; vb = b.name; return asc ? va.localeCompare(vb) : vb.localeCompare(va); }
    else if (sortBy === 'cores') { va = a._specs?.cores || 6; vb = b._specs?.cores || 6; }
    else if (sortBy === 'gaming') { va = a._gamingScore || 50; vb = b._gamingScore || 50; }
    else if (sortBy === 'workstation') { va = a._workstationScore || 50; vb = b._workstationScore || 50; }
    else if (sortBy === 'price') { va = a._effectiveUpgradePrice || a.price_brl; vb = b._effectiveUpgradePrice || b.price_brl; }
    else if (sortBy === 'target') { va = a.price_stats?.target_price || a.price_brl; vb = b.price_stats?.target_price || b.price_brl; }
    else { va = a._myCBScore || 50; vb = b._myCBScore || 50; }

    return asc ? (va - vb) : (vb - va);
  });

  const tbody = document.getElementById('cpu-cb-table-body');
  if (tbody) {
    tbody.innerHTML = rows.map((c, idx) => {
      const s = c._specs || getCpuSpecs(c);
      const isBase = baseCpu && c.slug === baseCpu.slug;
      const targetPrice = c.price_stats?.target_price || Math.round(c.price_brl * 0.90);
      const priceVal = isBundle ? c._effectiveUpgradePrice : c.price_brl;

      let relLabel = '<span class="text-slate-500">— (Base)</span>';
      if (!isBase && baseCpu) {
        const perfGain = (((c._compositeScore / Math.max(1, baseCpu._compositeScore)) - 1) * 100);
        const pDelta = priceVal - (isBundle ? baseCpu._effectiveUpgradePrice : baseCpu.price_brl);
        const pDeltaFormatted = (pDelta >= 0 ? '+' : '') + fmtBRLShort(pDelta);
        const perfFormatted = (perfGain >= 0 ? '+' : '') + perfGain.toFixed(0) + '%';
        const relColor = perfGain > 0 && pDelta <= 0 ? 'text-emerald-400 font-bold' : (perfGain > 0 ? 'text-sky-300' : 'text-slate-400');
        relLabel = `<span class="${relColor}">${perfFormatted} / ${pDeltaFormatted}</span>`;
      }

      const cb = c._myCBScore || 70;
      let cbBarColor = 'bg-slate-500';
      if (cb >= 85) cbBarColor = 'bg-emerald-500';
      else if (cb >= 70) cbBarColor = 'bg-sky-400';
      else if (cb >= 50) cbBarColor = 'bg-amber-400';
      else cbBarColor = 'bg-rose-500';

      const bundleNote = (isBundle && c._effectiveUpgradePrice > c.price_brl)
        ? `<span class="block text-[9px] font-mono text-amber-400 mt-0.5" title="Inclui migração de placa-mãe/RAM">+${fmtBRLShort(c._effectiveUpgradePrice - c.price_brl)} kit</span>`
        : '';

      return `
        <tr class="hover:bg-slate-800/40 transition ${isBase ? 'bg-emerald-950/20' : ''}">
          <td class="py-2.5 px-3 font-mono text-slate-500 text-xs">${idx + 1}</td>
          <td class="py-2.5 px-3">
            <div class="flex items-center gap-2">
              <span class="font-bold text-white text-xs">${c.name}</span>
              ${isBase ? '<span class="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[9px] font-bold">BASE</span>' : ''}
              <span class="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[9px]">${s.socket}</span>
              <span class="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono text-[9px]">${s.ddr}</span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono mt-0.5">
              Score: <strong class="text-white">${Math.round(c._compositeScore / 100)}</strong> • Loja: ${c.store_name || 'loja'}
            </div>
          </td>
          <td class="py-2.5 px-2 text-center font-mono text-slate-300">${s.cores}C / ${s.threads}T</td>
          <td class="py-2.5 px-2 text-right font-mono font-bold text-emerald-400">${c._gamingScore || getCpuGamingScore(c)}</td>
          <td class="py-2.5 px-2 text-right font-mono font-bold text-amber-400">${c._workstationScore || getCpuWorkstationScore(c)}</td>
          <td class="py-2.5 px-2 text-center font-mono text-slate-400">${s.tdp}W</td>
          <td class="py-2.5 px-3 text-right">
            <span class="font-mono font-bold text-white">${fmtBRL(priceVal)}</span>
            ${bundleNote}
          </td>
          <td class="py-2.5 px-3 text-right font-mono text-sky-300">${fmtBRL(targetPrice)}</td>
          <td class="py-2.5 px-3 text-center">
            <div class="flex items-center justify-center gap-2">
              <div class="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full rounded-full ${cbBarColor}" style="width: ${cb}%;"></div>
              </div>
              <span class="font-mono font-bold text-xs ${cb >= 80 ? 'text-emerald-300' : 'text-slate-300'}">${cb}</span>
            </div>
          </td>
          <td class="py-2.5 px-3 text-right font-mono text-xs">${relLabel}</td>
          <td class="py-2.5 px-3 text-center">
            <button onclick="sendCpuToDuel('${c.slug}')" class="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition cursor-pointer">
              Duelo ⚔️
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderCpuCBScatterChart(rows);
}
window.renderCpuCBTable = renderCpuCBTable;

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
    PROMO_STATE.couponStatus = { coupons: {}, deals: {} };
    PROMO_STATE.notifiedKeys = new Set();
    const ctnActive = document.getElementById('bf-active-coupons-container');
    if (ctnActive) {
      ctnActive.innerHTML = '';
      ctnActive.className = 'hidden';
    }
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
      (dbObj.laptops || []).forEach(convItem);
    }
  }

  // Scrub Mexican stores and links if target is mx
  if (targetReg === 'mx') {
    const scrubMxItem = it => {
      it.coupon = null;
      it.coupon_label = null;
      it._hbCoupon = null;
      it._flashPromo = null;
      const q = encodeURIComponent(it.name || it.slug || '');
      if (!it.store_name || /kabum|pichau|terabyte|magalu|shopee|loja|@|peperaio|adrenaline|iskandar|benchpromos/i.test(it.store_name)) {
        it.store_name = 'Cyberpuerta';
      }
      if (!it.offer_url || /\.br\b|t\.me\/|hardwarebarato/i.test(it.offer_url)) {
        it.offer_url = `https://www.cyberpuerta.mx/index.php?cl=search&searchparam=${q}`;
      }
      it.href = it.offer_url;
    };
    ['gpus', 'cpus', 'motherboards', 'rams', 'psus', 'laptops'].forEach(grp => (dbObj[grp] || []).forEach(scrubMxItem));
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
        res = await fetch(dbFile + '?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok && targetReg !== 'br') {
          res = await fetch('data/hardware_db.json?t=' + Date.now(), { cache: 'no-store' });
        }
      } catch (_) {
        try {
          const rawUrl = (targetReg === 'mx')
            ? 'https://raw.githubusercontent.com/Cktto12/pc-part-analyzer-br/main/data/hardware_db_mx.json?t=' + Date.now()
            : 'https://raw.githubusercontent.com/Cktto12/pc-part-analyzer-br/main/data/hardware_db.json?t=' + Date.now();
          res = await fetch(rawUrl, { cache: 'no-store' });
        } catch (__) {
          res = await fetch('data/hardware_db.json?t=' + Date.now(), { cache: 'no-store' });
        }
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
      status.textContent = `Mercado: ${regName} (${sym}) • Sincronizado às ${DB.updated_at || 'hoje'} • ${DB.gpus.length} GPUs • ${(DB.laptops || []).length} Notebooks`;
    }
    enrichGPUsWithContextualMetrics();
    if (typeof enrichCPUsWithContextualMetrics === 'function') enrichCPUsWithContextualMetrics();
    if (typeof enrichLaptopsWithContextualMetrics === 'function') enrichLaptopsWithContextualMetrics();
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
        res = await fetch(dbFile + '?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok && targetReg !== 'br') {
          res = await fetch('data/hardware_db.json?t=' + Date.now(), { cache: 'no-store' });
        }
      } catch (_) {
        try {
          const rawUrl = (targetReg === 'mx')
            ? 'https://raw.githubusercontent.com/Cktto12/pc-part-analyzer-br/main/data/hardware_db_mx.json?t=' + Date.now()
            : 'https://raw.githubusercontent.com/Cktto12/pc-part-analyzer-br/main/data/hardware_db.json?t=' + Date.now();
          res = await fetch(rawUrl, { cache: 'no-store' });
        } catch (__) {
          res = await fetch('data/hardware_db.json?t=' + Date.now(), { cache: 'no-store' });
        }
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
      if (typeof enrichCPUsWithContextualMetrics === 'function') enrichCPUsWithContextualMetrics();
      if (typeof enrichLaptopsWithContextualMetrics === 'function') enrichLaptopsWithContextualMetrics();
      updateTopContextSummary();
      populateSelectors();
      updateAllCurrencyLabels();
      renderActiveTab();
      renderPCBuilder();
      const sourceLabel = DB.source_name || (targetReg === 'mx' ? 'Cyberpuerta & DDTech MX' : 'Hardware Barato');
      if (status) {
        status.textContent = `Atualizado com sucesso da ${sourceLabel} em ${DB.updated_at || 'agora'} (${DB.gpus.length} GPUs • ${(DB.laptops || []).length} Notebooks)`;
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

  // 8.5. Sync Workload Weights & Workstation Sub-Profile sliders
  [['gaming', STATE.wGaming], ['workstation', STATE.wWorkstation || 35], ['ai', STATE.wAI], ['soft', STATE.wSoft]].forEach(([k, v]) => {
    const sld = document.getElementById(`slider-w-${k}`);
    if (sld) sld.value = v;
    const num = document.getElementById(`num-w-${k}`);
    if (num && document.activeElement !== num) num.value = v;
  });

  const ws = STATE.workstationProfile || { rendering: 40, editing: 30, compilation: 30 };
  [['rendering', ws.rendering || 40], ['editing', ws.editing || 30], ['compilation', ws.compilation || 30]].forEach(([k, v]) => {
    const sld = document.getElementById(`slider-ws-${k}`);
    if (sld) sld.value = v;
    const num = document.getElementById(`num-ws-${k}`);
    if (num && document.activeElement !== num) num.value = v;
  });

  if (typeof syncWorkloadIntensityUI === 'function') syncWorkloadIntensityUI();

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
  try {
    const rawInt = localStorage.getItem('gca_workload_intensity');
    if (rawInt) {
      const parsedInt = JSON.parse(rawInt);
      if (parsedInt && typeof parsedInt === 'object') {
        if (!STATE.workloadIntensity) STATE.workloadIntensity = { gaming: 3, workstation: 3, localAI: 3, aiTraining: 3 };
        ['gaming', 'workstation', 'localAI', 'aiTraining'].forEach(k => {
          if (parsedInt[k] !== undefined) STATE.workloadIntensity[k] = _clampIntensityLevel(parsedInt[k]);
        });
      }
    }
  } catch (_) {}
  syncWorkloadIntensityUI();
  initDatabaseSources();
  await initMarketConfig();
  if (typeof updateBackgroundMonitorUI === 'function') updateBackgroundMonitorUI();

  try {
    await loadHardwareDatabase();

    const urlCtx = new URLSearchParams(window.location.search).get('mode');
    const savedCtx = urlCtx || localStorage.getItem('gca_context') || STATE.context || 'gpu';
    setMainContext(savedCtx);
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
