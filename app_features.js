/**
 * GPU & Build Analyzer Pro — Feature Module
 *  1. Monitor resolution (pixels) + Max FPS / Hz choice boxes (affect all gaming math)
 *  2. Per-game FPS simulator: configurable relevant games, pure-GPU vs with-CPU, Xeon warnings,
 *     optional calibration with your own measured FPS
 *  3. "Sugestões de Mudança" tab: DDR4 vs DDR5 platform planner (RAM price is the main constraint)
 *  4. Black Friday multi-generation tab (2060 → 3060 → 4060 → 5060, CPUs) with expected promo range
 *
 * Loaded after app.js — uses its globals (DB, STATE, fmtBRL, fmtBRLShort, Chart, ...).
 */

// ============================================================================
// 0. PREFERENCES (localStorage)
// ============================================================================
const PREFS_KEY = 'gpuAnalyzerPrefs_v2';

function saveUserPrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      monitorRes: STATE.monitorRes,
      monitorMaxFps: STATE.monitorMaxFps,
      dlssMode: STATE.dlssMode,
      comparisonScaleMode: STATE.comparisonScaleMode,
      wGaming: STATE.wGaming, wAI: STATE.wAI, wSoft: STATE.wSoft,
      games: STATE.games,
      bfRanges: STATE.bfRanges,
      upg: STATE.upg
    }));
  } catch (_) { /* storage unavailable */ }
}

function loadUserPrefs() {
  STATE.monitorRes = '1440p';
  STATE.monitorMaxFps = 144;
  STATE.dlssMode = 'perceived';
  STATE.games = JSON.parse(JSON.stringify(DEFAULT_GAMES));
  STATE.bfRanges = {};
  STATE.upg = { cpu: {}, mobo: {}, reuseRam: true };
  STATE.focusGameId = 'cyberpunk';
  STATE.showGameEditor = false;
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (p) {
      if (p.monitorRes && MONITOR_RES[p.monitorRes]) STATE.monitorRes = p.monitorRes;
      if (p.monitorMaxFps) STATE.monitorMaxFps = p.monitorMaxFps;
      if (p.dlssMode && ['perceived', 'sr', 'native', 'max_fg'].includes(p.dlssMode)) STATE.dlssMode = p.dlssMode;
      if (p.comparisonScaleMode && ['relative', 'absolute'].includes(p.comparisonScaleMode)) STATE.comparisonScaleMode = p.comparisonScaleMode;
      if (typeof p.wGaming === 'number') { STATE.wGaming = p.wGaming; STATE.wAI = p.wAI; STATE.wSoft = p.wSoft; }
      if (Array.isArray(p.games) && p.games.length) STATE.games = p.games;
      if (p.bfRanges) STATE.bfRanges = p.bfRanges;
      if (p.upg) {
        STATE.upg = Object.assign({ cpu: {}, mobo: {}, reuseRam: true }, p.upg);
        if (!STATE.upg.mobo) STATE.upg.mobo = {};
        if (!STATE.upg.cpu) STATE.upg.cpu = {};
      }
    }
  } catch (_) { /* ignore corrupt prefs */ }

  // Reflect into DOM
  const elMon = document.getElementById('global-select-monitor');
  if (elMon) elMon.value = STATE.monitorRes;
  const elFpsInput = document.getElementById('global-input-maxfps');
  if (elFpsInput) elFpsInput.value = STATE.monitorMaxFps;
  const preset = document.getElementById('global-select-maxfps');
  if (preset && [...preset.options].some(o => +o.value === +STATE.monitorMaxFps)) preset.value = String(STATE.monitorMaxFps);
  const gDlss = document.getElementById('global-select-dlss-mode');
  if (gDlss) gDlss.value = STATE.dlssMode;
  const sDlss = document.getElementById('sim-select-upscale');
  if (sDlss) sDlss.value = STATE.dlssMode;
  [['gaming', STATE.wGaming], ['ai', STATE.wAI], ['soft', STATE.wSoft]].forEach(([k, v]) => {
    const sl = document.getElementById(`slider-w-${k}`);
    if (sl) sl.value = v;
    const nm = document.getElementById(`num-w-${k}`);
    if (nm) nm.value = v;
  });
}

function onGlobalDlssModeChange(val) {
  STATE.dlssMode = val || 'perceived';
  const sDlss = document.getElementById('sim-select-upscale');
  if (sDlss && sDlss.value !== STATE.dlssMode) sDlss.value = STATE.dlssMode;
  saveUserPrefs();
  enrichGPUsWithContextualMetrics();
  if (typeof updateTopContextSummary === 'function') updateTopContextSummary();
  renderActiveTab();
}

function onSimDlssModeChange(val) {
  STATE.dlssMode = val || 'perceived';
  const gDlss = document.getElementById('global-select-dlss-mode');
  if (gDlss && gDlss.value !== STATE.dlssMode) gDlss.value = STATE.dlssMode;
  saveUserPrefs();
  enrichGPUsWithContextualMetrics();
  renderSimulator();
}

// ============================================================================
// 1. MONITOR RESOLUTION & MAX FPS
// ============================================================================
const MONITOR_RES = {
  '768p':    { w: 1366, h: 768,  label: '1366×768' },
  '900p':    { w: 1600, h: 900,  label: '1600×900' },
  '1080p':   { w: 1920, h: 1080, label: '1920×1080' },
  'uw1080p': { w: 2560, h: 1080, label: '2560×1080 UW' },
  '1440p':   { w: 2560, h: 1440, label: '2560×1440' },
  'uw1440p': { w: 3440, h: 1440, label: '3440×1440 UW' },
  '4k':      { w: 3840, h: 2160, label: '3840×2160' }
};
const REF_PIXELS = 2560 * 1440; // all game reference FPS are at 1440p

function getMonitorPixels() {
  const r = MONITOR_RES[STATE.monitorRes] || MONITOR_RES['1440p'];
  return r.w * r.h;
}

function getMonitorLabel() {
  const r = MONITOR_RES[STATE.monitorRes] || MONITOR_RES['1440p'];
  const hz = STATE.monitorMaxFps >= 999 ? 'sem teto' : `${STATE.monitorMaxFps} Hz`;
  return `${r.label} @ ${hz}`;
}

function onMonitorMaxFPSPresetChange(val) {
  document.getElementById('global-input-maxfps').value = val;
  onMonitorOrMaxFPSChange();
}

function onMonitorOrMaxFPSChange() {
  STATE.monitorRes = document.getElementById('global-select-monitor').value;
  const typed = parseInt(document.getElementById('global-input-maxfps').value);
  STATE.monitorMaxFps = isNaN(typed) ? 144 : Math.max(30, Math.min(999, typed));
  const preset = document.getElementById('global-select-maxfps');
  if ([...preset.options].some(o => +o.value === STATE.monitorMaxFps)) preset.value = String(STATE.monitorMaxFps);
  saveUserPrefs();
  enrichGPUsWithContextualMetrics();
  if (typeof updateTopContextSummary === 'function') updateTopContextSummary();
  renderActiveTab();
}

// ============================================================================
// 2. GAMES, CPU GAMING INDEX & FPS MODEL
// ============================================================================
// fps1440: reference avg FPS on an RTX 5060 at 1440p native High/Ultra with no CPU limit.
// cpuFps:  CPU-bound ceiling with a Ryzen 7 9800X3D (index 100) — scaled down for weaker CPUs.
// vramReq: VRAM (GB) needed at 1440p before stutter/texture penalties kick in.
// All are editable estimates (aggregated from public reviews) — not live measurements.
const DEFAULT_GAMES = [
  { id: 'cyberpunk',  title: 'Cyberpunk 2077 (RT Ultra)',                 fps1440: 48,  cpuFps: 160, vramReq: 10, relevant: true },
  { id: 'wukong',     title: 'Black Myth: Wukong (High)',                  fps1440: 54,  cpuFps: 170, vramReq: 10, relevant: true },
  { id: 'alanwake2',  title: 'Alan Wake 2 (Ultra)',                        fps1440: 50,  cpuFps: 170, vramReq: 10, relevant: false },
  { id: 'rdr2',       title: 'Red Dead Redemption 2 (Ultra)',              fps1440: 88,  cpuFps: 190, vramReq: 8,  relevant: true },
  { id: 'minecraft',  title: 'Minecraft Java + Distant Horizons + Shaders', fps1440: 95,  cpuFps: 200, vramReq: 8,  relevant: true },
  { id: 'cs2',        title: 'Counter-Strike 2 (Competitivo)',             fps1440: 260, cpuFps: 600, vramReq: 4,  relevant: true },
  { id: 'valorant',   title: 'Valorant (Competitivo)',                     fps1440: 330, cpuFps: 750, vramReq: 4,  relevant: false },
  { id: 'fortnite',   title: 'Fortnite (DX12 Alto, sem RT)',               fps1440: 110, cpuFps: 300, vramReq: 6,  relevant: false },
  { id: 'warzone',    title: 'CoD Warzone (Alto)',                         fps1440: 115, cpuFps: 240, vramReq: 8,  relevant: false },
  { id: 'bg3',        title: "Baldur's Gate 3 (Ultra — Ato 3)",            fps1440: 80,  cpuFps: 130, vramReq: 8,  relevant: false },
  { id: 'msfs2024',   title: 'Microsoft Flight Simulator 2024 (Alto)',     fps1440: 45,  cpuFps: 90,  vramReq: 10, relevant: false },
  { id: 'forza5',     title: 'Forza Horizon 5 (Extremo)',                  fps1440: 105, cpuFps: 260, vramReq: 8,  relevant: false },
  { id: 'hogwarts',   title: 'Hogwarts Legacy (Ultra)',                    fps1440: 60,  cpuFps: 140, vramReq: 10, relevant: false },
  { id: 'starfield',  title: 'Starfield (Alto)',                           fps1440: 50,  cpuFps: 110, vramReq: 10, relevant: false }
];

// Relative gaming performance of CPUs in CPU-bound scenarios (Ryzen 7 9800X3D = 100).
// Rough aggregate of public 1080p CPU-bound reviews — treat as ±10% estimates.
const CPU_GAMING_INDEX = {
  'ryzen-7-9850x3d': 102, 'ryzen-7-9800x3d': 100, 'ryzen-9-9950x3d2': 100, 'ryzen-9-9950x3d': 99, 'ryzen-9-9900x3d': 93,
  'ryzen-7-7800x3d': 89, 'ryzen-9-7950x3d': 88, 'ryzen-9-7900x3d': 84, 'ryzen-5-7600x3d': 82,
  'ryzen-9-9950x': 83, 'ryzen-9-9900x': 81, 'ryzen-7-9700x': 80, 'ryzen-5-9600x': 78,
  'ryzen-9-7950x': 79, 'ryzen-9-7900x': 77, 'ryzen-9-7900': 75, 'ryzen-7-7700x': 76, 'ryzen-7-7700': 75,
  'ryzen-5-7600x': 73, 'ryzen-5-7600': 71, 'ryzen-5-7500f': 70, 'ryzen-5-7500': 70, 'ryzen-5-7400f': 67,
  'ryzen-7-8700f': 66, 'ryzen-7-8700g': 66, 'ryzen-5-8600g': 62, 'ryzen-5-8400f': 60, 'ryzen-5-8500g': 55,
  'ryzen-7-5800x3d': 74, 'ryzen-7-5700x3d': 71, 'ryzen-5-5500x3d': 66,
  'ryzen-9-5950x': 62, 'ryzen-9-5900xt': 62, 'ryzen-9-5900x': 61, 'ryzen-7-5800xt': 61, 'ryzen-7-5800x': 60,
  'ryzen-7-5700x': 58, 'ryzen-7-5700': 54, 'ryzen-7-5700g': 52, 'ryzen-5-5600x': 57, 'ryzen-5-5600xt': 57,
  'ryzen-5-5600': 56, 'ryzen-5-5600t': 55, 'ryzen-5-5600gt': 51, 'ryzen-5-5600g': 50, 'ryzen-5-5600ge': 47, 'ryzen-5-5500': 49,
  'core-i9-14900ks': 86, 'core-i9-14900k': 85, 'core-i9-14900kf': 85, 'core-i9-14900': 80, 'core-i9-14900f': 80,
  'core-i9-13900ks': 85, 'core-i9-13900k': 83, 'core-i9-13900kf': 83, 'core-i9-13900': 78,
  'core-i7-14700k': 82, 'core-i7-14700kf': 82, 'core-i7-14700': 77, 'core-i7-14700f': 77,
  'core-i7-13700k': 79, 'core-i7-13700kf': 79, 'core-i7-13700': 74, 'core-i7-13700f': 74,
  'core-i5-14600k': 77, 'core-i5-14600kf': 77, 'core-i5-14600': 71, 'core-i5-13600k': 76, 'core-i5-13600kf': 76,
  'core-i5-14400': 66, 'core-i5-14400f': 66, 'core-i5-14400t': 58, 'core-i5-13400': 64, 'core-i5-13400f': 64,
  'core-i9-12900ks': 76, 'core-i9-12900k': 74, 'core-i9-12900kf': 74, 'core-i9-12900': 71, 'core-i9-12900f': 71,
  'core-i7-12700k': 71, 'core-i7-12700kf': 71, 'core-i7-12700': 68, 'core-i7-12700f': 68,
  'core-i5-12600k': 68, 'core-i5-12600kf': 68, 'core-i5-12400': 61, 'core-i5-12400f': 61,
  'core-i3-14100': 56, 'core-i3-14100f': 56, 'core-i3-12100': 54, 'core-i3-12100f': 54, 'core-i3-12100t': 48,
  'core-ultra-9-285k': 84, 'core-ultra-9-285': 80, 'core-ultra-7-270k-plus': 83, 'core-ultra-7-265k': 80, 'core-ultra-7-265kf': 80,
  'core-ultra-5-250k-plus': 76, 'core-ultra-5-250kf-plus': 76, 'core-ultra-5-245k': 73, 'core-ultra-5-245kf': 73,
  'core-ultra-5-225': 66, 'core-ultra-5-225f': 66,
  // Broadwell-EP 14C @ 2.4–3.3 GHz, high memory latency — very uncertain (see Xeon warning)
  'xeon-e5-2680-v4': 36
};

// Cards that only use 8 (or 4) PCIe lanes — relevant on PCIe 3.0 platforms like X99
const PCIE_X8_GPUS = new Set([
  'rtx-5060', 'rtx-5060-ti-8gb', 'rtx-5060-ti-16gb', 'rtx-5050', 'rtx-4060', 'rtx-4060-ti-8gb', 'rtx-3050-8gb', 'rtx-3050-6gb',
  'rx-7600', 'rx-7600-xt', 'rx-7650-gre', 'rx-9060-xt-8gb', 'rx-9060-xt-16gb', 'rx-6600', 'rx-6600-xt', 'arc-b580', 'arc-b570'
]);
const PCIE_X4_GPUS = new Set(['rx-6500-xt-4gb', 'rx-6500-xt-8gb', 'rx-6400', 'arc-a380']);

// Scraper infers AM4 for some AM5 Ryzens (e.g. 7500F, 9850X3D) — fix on the client
function getCpuSocket(cpu) {
  if (!cpu) return '';
  if (/^ryzen-\d-(7|8|9)\d{3}/.test(cpu.slug)) return 'AM5';
  return cpu.socket;
}

function isLegacyArchitecture(cpu) {
  if (!cpu) return false;
  return !!(cpu.is_xeon || /xeon|core 2|phenom|fx-/i.test(cpu.name || '') || (cpu.benchmark && cpu.benchmark < 2500));
}
const isXeonLike = isLegacyArchitecture;

function getCpuGamingIndex(cpu) {
  if (!cpu) return 70;
  if (CPU_GAMING_INDEX[cpu.slug]) return CPU_GAMING_INDEX[cpu.slug];
  if (isLegacyArchitecture(cpu)) return 36;
  if (/threadripper/i.test(cpu.slug)) return 62;
  const b = cpu.benchmark || 3000;
  return Math.max(40, Math.min(80, Math.round(30 + b / 250)));
}

function getSimCpu() {
  const sel = document.getElementById('sim-select-cpu');
  const slug = (sel && sel.value) || (STATE.build && STATE.build.cpu && STATE.build.cpu.slug) || (DB.cpus[0] ? DB.cpus[0].slug : '');
  return DB.cpus.find(c => c.slug === slug) || DB.cpus[0];
}

// ============================================================================
// 2B. DLSS 4, MULTI-FRAME GENERATION (MFG 3x/4x) & PERCEIVED GAMING MODEL
// ============================================================================
function getGpuTechProfile(gpu) {
  const s = (gpu && gpu.slug ? gpu.slug : '').toLowerCase();
  const n = (gpu && gpu.name ? gpu.name : '').toLowerCase();

  if (/rtx-50/.test(s) || /rtx 50/.test(n)) {
    return {
      gen: 'rtx50',
      isBlackwell: true,
      badge: 'DLSS 4 + MFG 4×',
      shortBadge: 'MFG 4×',
      color: 'emerald',
      srGain: 1.42,          // DLSS 4 Transformer Quality upscaling + Ray Reconstruction
      qualityFactor: 1.04,   // Transformer model visual clarity bonus vs TAA/FSR
      fgMaxMult: 4,          // Supports 2x, 3x, and 4x Multi-Frame Generation + Reflex 2
      vramFgOverhead: 0.85   // Optical flow + multi-frame buffer VRAM overhead at 1440p (GB)
    };
  }
  if (/rtx-40/.test(s) || /rtx 40/.test(n)) {
    return {
      gen: 'rtx40',
      isAda: true,
      badge: 'DLSS 4 + FG 2×',
      shortBadge: 'FG 2×',
      color: 'sky',
      srGain: 1.40,
      qualityFactor: 1.03,
      fgMaxMult: 2,          // Single Frame Generation (2x) only
      vramFgOverhead: 0.65
    };
  }
  if (/rtx-(20|30)/.test(s) || /rtx (20|30)/.test(n)) {
    return {
      gen: 'rtx30',
      isAmpere: /rtx-30/.test(s) || /rtx 30/.test(n),
      badge: 'DLSS Super Resolução',
      shortBadge: 'DLSS SR',
      color: 'indigo',
      srGain: 1.36,
      qualityFactor: 1.02,
      fgMaxMult: 1,          // No hardware Optical Flow FG (only community FSR3 FG in select titles)
      vramFgOverhead: 0
    };
  }
  if (/rx-90/.test(s) || /rx 90/.test(n)) {
    return {
      gen: 'rx9000',
      badge: 'FSR 4 + FG 2×',
      shortBadge: 'FSR4 FG 2×',
      color: 'amber',
      srGain: 1.35,
      qualityFactor: 0.99,
      fgMaxMult: 2,
      vramFgOverhead: 0.55
    };
  }
  if (/rx-(6|7)/.test(s) || /rx (6|7)/.test(n)) {
    return {
      gen: 'rx7000',
      badge: 'FSR 3 + FG 2×',
      shortBadge: 'FSR3 FG 2×',
      color: 'orange',
      srGain: 1.30,
      qualityFactor: 0.94,
      fgMaxMult: 2,
      vramFgOverhead: 0.50
    };
  }
  if (/arc-b/.test(s) || /arc b/.test(n)) {
    return {
      gen: 'arc_b',
      badge: 'XeSS 2 + FG 2×',
      shortBadge: 'XeSS2 FG 2×',
      color: 'cyan',
      srGain: 1.33,
      qualityFactor: 0.98,
      fgMaxMult: 2,
      vramFgOverhead: 0.55
    };
  }
  return {
    gen: 'legacy',
    badge: 'FSR 1/2 (s/ FG)',
    shortBadge: 'Sem FG',
    color: 'slate',
    srGain: 1.22,
    qualityFactor: 0.90,
    fgMaxMult: 1,
    vramFgOverhead: 0
  };
}

function isCompetitiveEsportsGame(game) {
  if (!game) return false;
  return /^(cs2|valorant|warzone|fortnite)$/i.test(game.id || '') || /competitivo|cs2|valorant/i.test(game.title || '');
}

// Pure-GPU Base Rendered FPS (before Frame Generation interpolation) at the selected monitor resolution
function estimateGpuBaseFps(gpu, game, useSR = false, extraVramGB = 0) {
  const px = getMonitorPixels();
  const tech = getGpuTechProfile(gpu);
  const ratio = (gpu.gaming_score || 1500) / 3138.0;          // RTX 5060 = reference
  const resMult = Math.pow(REF_PIXELS / px, 0.8);             // FPS scales sub-linearly with pixels
  const upMult = useSR ? tech.srGain : 1.0;
  // Upscaling renders at lower internal res (less base VRAM), while FG adds buffer overhead
  const vramNeeded = ((game.vramReq || 8) * Math.pow(px / REF_PIXELS, 0.35) * (useSR ? 0.88 : 1.0)) + extraVramGB;
  let vramPenalty = 1.0;
  if ((gpu.vram_gb || 8) < vramNeeded - 2) vramPenalty = 0.62;
  else if ((gpu.vram_gb || 8) < vramNeeded) vramPenalty = 0.80;

  let pciePenalty = 1.0;
  const activeCpu = (typeof getSimCpu === 'function') ? getSimCpu() : STATE.refPC?.cpu;
  const activeMobo = STATE.refPC?.mobo || STATE.build?.mobo;
  if (typeof isPlatformPCIe3 === 'function' && isPlatformPCIe3(activeCpu, activeMobo)) {
    const isX4 = typeof PCIE_X4_GPUS !== 'undefined' && PCIE_X4_GPUS.has(gpu.slug);
    const isX8 = typeof PCIE_X8_GPUS !== 'undefined' && PCIE_X8_GPUS.has(gpu.slug);
    if (isX4) pciePenalty = (gpu.vram_gb || 8) < vramNeeded ? 0.72 : 0.88;
    else if (isX8) pciePenalty = (gpu.vram_gb || 8) < vramNeeded ? 0.86 : 0.96;
  }
  return Math.max(1, game.fps1440 * ratio * resMult * upMult * vramPenalty * pciePenalty);
}

// Backwards-compatible wrapper used by calibration & legacy callers
function estimateGpuFps(gpu, game, upscale = false) {
  const mode = typeof upscale === 'string' ? upscale : (upscale ? (STATE.dlssMode || 'perceived') : 'native');
  if (mode === 'native') return estimateGpuBaseFps(gpu, game, false, 0);
  if (mode === 'sr') return estimateGpuBaseFps(gpu, game, true, 0);
  const full = computeDlssMfgMetrics(gpu, null, game, mode);
  return mode === 'max_fg' ? full.displayedPure : full.perceivedPure;
}

function estimateCpuCap(cpu, game) {
  let baseCap = Math.max(1, (game.cpuFps || 200) * getCpuGamingIndex(cpu) / 100);
  // Apply 0.78 RT-BVH overhead penalty to CPU cap on ray-tracing titles (Argon Item 11)
  const isRt = game && ((game.title && game.title.includes('(RT')) || game.id === 'cyberpunk' || game.rt);
  if (isRt) {
    baseCap *= 0.78;
  }
  return baseCap;
}

// Combine GPU-limited and CPU-limited FPS with resolution & workload aware dynamic k (Argon Item 11)
function combineFps(gpuFps, cpuCap) {
  if (gpuFps <= 0) return 0;
  if (cpuCap <= 0) return 0;
  // Dynamic k: When gpuFps is significantly lower than cpuCap (e.g. 4K native or heavy GPU bottleneck),
  // increase k to 6 so slower CPU doesn't artificially drag down GPU-bound framerates.
  const k = (gpuFps < 0.70 * cpuCap) ? 6 : 4;
  return 1 / Math.pow(Math.pow(1 / gpuFps, k) + Math.pow(1 / cpuCap, k), 1 / k);
}

function getMyCurrentGpu() {
  if (STATE.build && STATE.build.gpu && STATE.build.gpu.slug) {
    const found = DB.gpus.find(g => g.slug === STATE.build.gpu.slug);
    if (found) return found;
  }
  return DB.gpus.find(g => g.slug === 'rx-580-8gb-ref') || DB.gpus[0];
}

function getMyCurrentCpu() {
  if (STATE.build && STATE.build.cpu && STATE.build.cpu.slug) {
    const found = DB.cpus.find(c => c.slug === STATE.build.cpu.slug);
    if (found) return found;
  }
  return DB.cpus[0];
}

// Optional calibration: if user typed the FPS they actually measure on their current PC,
// scale predictions for that game by measured / predicted (clamped 0.5–1.6).
function getCalibration(game) {
  if (!game.measured || game.measured <= 0 || !DB.gpus.length) return 1;
  const predicted = combineFps(estimateGpuBaseFps(getMyCurrentGpu(), game, false, 0), estimateCpuCap(getMyCurrentCpu(), game));
  return Math.max(0.5, Math.min(1.6, game.measured / Math.max(1, predicted)));
}

// Core DLSS 4 + FG 2x / MFG 3x-4x + Perceived Performance & Input Latency model
function computeDlssMfgMetrics(gpu, cpu, game, modeOverride = null) {
  const dlssMode = modeOverride || STATE.dlssMode || 'perceived';
  const tech = getGpuTechProfile(gpu);
  const cal = getCalibration(game);
  const cpuCap = cpu ? estimateCpuCap(cpu, game) * cal : 9999;
  const esports = isCompetitiveEsportsGame(game);

  // 1. Native Raster
  const nativePure = estimateGpuBaseFps(gpu, game, false, 0) * cal;
  const nativeWithCpu = combineFps(nativePure, cpuCap);

  // 2. Super Resolution (DLSS 4 SR / FSR 4 / XeSS Quality) without Frame Gen
  const srPure = estimateGpuBaseFps(gpu, game, true, 0) * cal;
  const srWithCpu = combineFps(srPure, cpuCap);

  // 3. Frame Generation / Multi-Frame Generation (MFG 2x / 3x / 4x)
  // Note: FG/MFG is not used in competitive esports (CS2/Valorant) due to input lag.
  const canUseFG = !esports && tech.fgMaxMult > 1 && (dlssMode === 'perceived' || dlssMode === 'max_fg');
  let activeFgMult = 1;
  let netFgFactor = 1.0;

  if (canUseFG) {
    const baseAfterFgVramPure = estimateGpuBaseFps(gpu, game, true, tech.vramFgOverhead) * cal;
    const baseAfterFgVramCpu = combineFps(baseAfterFgVramPure, cpuCap);
    const targetHz = STATE.monitorMaxFps >= 999 ? 240 : STATE.monitorMaxFps;

    if (tech.fgMaxMult >= 4) {
      // RTX 50 Series Blackwell: supports 2x, 3x, 4x MFG
      if (dlssMode === 'max_fg') {
        activeFgMult = 4;
      } else {
        // Pick lowest MFG factor (2x, 3x, or 4x) that saturates the monitor or maximizes smoothness
        if (baseAfterFgVramCpu * 1.74 >= targetHz) activeFgMult = 2;
        else if (baseAfterFgVramCpu * 2.42 >= targetHz) activeFgMult = 3;
        else activeFgMult = 4;
      }
    } else {
      activeFgMult = 2;
    }

    // Account for ~13-18% base frame optical-flow/tensor overhead before multiplying
    netFgFactor = activeFgMult === 4 ? 3.05 : activeFgMult === 3 ? 2.40 : 1.74;
  }

  const baseForFgPure = canUseFG ? (estimateGpuBaseFps(gpu, game, true, tech.vramFgOverhead) * cal) : (dlssMode === 'native' ? nativePure : srPure);
  const baseForFgCpu = combineFps(baseForFgPure, cpuCap);

  // Crucial: Frame Generation interpolates on the GPU AFTER the CPU draw-call submission, bypassing CPU limits!
  const displayedPure = canUseFG ? (baseForFgPure * netFgFactor) : baseForFgPure;
  const displayedWithCpu = canUseFG ? (baseForFgCpu * netFgFactor) : baseForFgCpu;

  // 4. Perceived Performance (Balances visual smoothness vs input latency from base rendered FPS + upscaler quality)
  const calcPerceived = (baseFps, dispFps) => {
    if (dlssMode === 'native') return nativePure === dispFps ? baseFps : baseFps;
    if (dlssMode === 'sr' || !canUseFG) return baseFps * tech.qualityFactor;
    const extraFrames = Math.max(0, dispFps - baseFps);
    // Latency discount & utility weight (Argon Item 2: dampen to max 0.25 for 2x FG and 0.15 for 4x MFG)
    let fgUtilityWeight = 0.25;
    if (baseFps < 36) fgUtilityWeight = 0.08;
    else if (baseFps < 48) fgUtilityWeight = 0.16;
    else if (baseFps < 60) fgUtilityWeight = 0.22;
    if (activeFgMult === 3) fgUtilityWeight *= 0.75;
    if (activeFgMult === 4) fgUtilityWeight = 0.15;
    return (baseFps + extraFrames * fgUtilityWeight) * tech.qualityFactor;
  };

  const perceivedPure = calcPerceived(baseForFgPure, displayedPure);
  const perceivedWithCpu = calcPerceived(baseForFgCpu, displayedWithCpu);

  // Estimate end-to-end PC latency in ms (with NVIDIA Reflex / Anti-Lag)
  const latencyMs = Math.round((1000 / Math.max(15, baseForFgCpu)) * (canUseFG ? 1.32 : 1.05));

  // Choose primary metric based on active mode
  let primaryPure = nativePure, primaryWithCpu = nativeWithCpu;
  if (dlssMode === 'sr') {
    primaryPure = srPure;
    primaryWithCpu = srWithCpu;
  } else if (dlssMode === 'perceived') {
    primaryPure = perceivedPure;
    primaryWithCpu = perceivedWithCpu;
  } else if (dlssMode === 'max_fg') {
    primaryPure = displayedPure;
    primaryWithCpu = displayedWithCpu;
  }

  return {
    pure: Math.round(primaryPure),
    withCpu: Math.round(primaryWithCpu),
    nativePure: Math.round(nativePure),
    nativeWithCpu: Math.round(nativeWithCpu),
    baseRenderFps: Math.round(baseForFgCpu),
    displayedPure: Math.round(displayedPure),
    displayedWithCpu: Math.round(displayedWithCpu),
    perceivedPure: Math.round(perceivedPure),
    perceivedWithCpu: Math.round(perceivedWithCpu),
    activeFgMult,
    canUseFG,
    latencyMs,
    tech,
    cpuCap: Math.round(cpuCap),
    cpuLossPct: Math.max(0, Math.round((1 - baseForFgCpu / Math.max(1, baseForFgPure)) * 100)),
    calibrated: cal !== 1
  };
}

function estimateFps(gpu, cpu, game, opts = {}) {
  const modeOverride = opts.dlssMode || (typeof opts.upscale === 'string' ? opts.upscale : null);
  return computeDlssMfgMetrics(gpu, cpu, game, modeOverride);
}

function getRelevantGames() {
  const rel = (STATE.games || []).filter(g => g.relevant);
  return rel.length ? rel : (STATE.games || DEFAULT_GAMES);
}

// Gaming score used in Duelo, Custo-Benefício & Upgrade Planner:
// Respects monitor resolution, VRAM needs, Hz cap (when applicable), AND the selected DLSS 4 / MFG Perceived Mode!
// When uncapped=true, measures the pure hardware capability without clamping to monitor Hz.
function getEffectiveGamingScore(gpu, uncapped = false) {
  const games = getRelevantGames();
  if (!games.length || !STATE.monitorRes) return gpu.gaming_score || 1500;
  const cap = uncapped ? Infinity : (STATE.monitorMaxFps >= 999 ? Infinity : STATE.monitorMaxFps);
  const mode = STATE.dlssMode || 'perceived';
  let refSum = 0, effSum = 0;
  games.forEach(gm => {
    // Baseline reference: RTX 5060 native 1440p FPS
    const ref5060 = gm.fps1440;
    const m = computeDlssMfgMetrics(gpu, null, gm, mode);
    // Soft logarithmic dampening above monitor cap when uncapped=false (Argon Item 2)
    let eff = m.pure;
    if (!uncapped && isFinite(cap)) {
      eff = (m.pure <= cap) ? m.pure : (cap + Math.sqrt(m.pure - cap) * 3);
    }
    refSum += ref5060;
    effSum += eff;
  });
  return Math.round(3138.0 * (effSum / Math.max(1, refSum)));
}

// ============================================================================
// 3. SIMULATOR TAB (overrides app.js renderSimulator)
// ============================================================================
function onSimCpuChange(slug) {
  STATE.simCpuSlug = slug;
  renderSimulator();
}

function toggleRelevantGame(id) {
  const g = STATE.games.find(x => x.id === id);
  if (g) g.relevant = !g.relevant;
  saveUserPrefs();
  enrichGPUsWithContextualMetrics();
  renderSimulator();
}

function toggleAllRelevantGames(val) {
  const allOn = STATE.games.every(g => g.relevant);
  STATE.games.forEach(g => g.relevant = allOn ? false : val);
  saveUserPrefs();
  enrichGPUsWithContextualMetrics();
  renderSimulator();
}

function toggleGameEditor() {
  STATE.showGameEditor = !STATE.showGameEditor;
  renderSimulator();
}

function updateGameField(id, field, value) {
  const g = STATE.games.find(x => x.id === id);
  if (!g) return;
  if (field === 'title') g.title = value;
  else g[field] = parseFloat(value) || 0;
  saveUserPrefs();
  enrichGPUsWithContextualMetrics();
  renderSimulatorResultsOnly();
}

function addCustomGame() {
  const id = 'custom-' + Date.now();
  STATE.games.push({ id, title: 'Meu Jogo', fps1440: 80, cpuFps: 200, vramReq: 8, relevant: true });
  STATE.focusGameId = id;
  STATE.showGameEditor = true;
  saveUserPrefs();
  renderSimulator();
}

function removeGame(id) {
  STATE.games = STATE.games.filter(g => g.id !== id);
  saveUserPrefs();
  renderSimulator();
}

function resetGamesToDefault() {
  STATE.games = JSON.parse(JSON.stringify(DEFAULT_GAMES));
  saveUserPrefs();
  renderSimulator();
}

function getCpuArchitectureAdviceHTML(cpu, gpuA, gpuB) {
  const parts = [];
  if (!cpu) return '';
  const cpuIndex = getCpuGamingIndex(cpu);
  const isBudgetOrLegacy = cpuIndex <= 45 || isLegacyArchitecture(cpu);

  if (isBudgetOrLegacy) {
    parts.push(`
      <div class="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/50 text-xs text-amber-100 space-y-1.5">
        <div class="font-bold text-amber-300">💡 Análise de Arquitetura do Processador (${cpu.name})</div>
        <ul class="list-disc pl-5 space-y-0.5 text-[11px]">
          <li>Este processador possui índice de jogos estimado em ${cpuIndex}/100 frente aos modelos topo de linha de alta frequência (como 7800X3D/9800X3D). Em 1080p competitivo com placas muito rápidas, o clock single-core dita o teto de quadros.</li>
          <li>Em <strong>1440p ou 4K</strong>, ou com tecnologias de upscaling ativo (<strong>DLSS / FSR</strong>), a exigência migra para a GPU, diminuindo a sensibilidade ao processador.</li>
          <li>Dica de calibração: você pode preencher o campo <strong>Meu FPS Medido</strong> na tabela abaixo para calibrar com precisão os ganhos no seu hardware real.</li>
        </ul>
      </div>`);
  }
  if (getCpuSocket(cpu) === 'LGA2011-3' || (cpu.benchmark && cpu.benchmark < 2500)) {
    const narrow = [gpuA, gpuB].filter(g => g && (PCIE_X8_GPUS.has(g.slug) || PCIE_X4_GPUS.has(g.slug)));
    if (narrow.length) {
      parts.push(`
        <div class="p-3 rounded-xl bg-sky-950/40 border border-sky-500/40 text-[11px] text-sky-100 mt-2">
          <strong>🔌 Interface PCIe das Placas:</strong> ${narrow.map(g => `<strong>${g.name}</strong> (${PCIE_X4_GPUS.has(g.slug) ? 'x4' : 'x8'})`).join(', ')}
          utilizam barramento elétrico reduzido (x4/x8). Em sistemas com PCIe 3.0 isso limita a largura de banda e pode impactar fluidez quando a VRAM transborda. Em placas x16 completas (RTX 5070, 9070 XT), o barramento opera folgado.
        </div>`);
    }
  }
  return parts.join('');
}
const getXeonWarningHTML = getCpuArchitectureAdviceHTML;

function fpsBarRow(label, colorText, colorBar, fps, maxFps, bold, monitorCap) {
  const over = monitorCap < 999 && fps > monitorCap;
  return `
    <div class="flex items-center gap-2">
      <span class="w-28 truncate ${colorText}" title="${label}">${label}</span>
      <div class="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden relative">
        <div class="h-full ${colorBar} rounded-full" style="width:${Math.min(100, (fps / maxFps) * 100)}%"></div>
        ${monitorCap < 999 ? `<div class="absolute top-0 h-full w-px bg-white/70" style="left:${Math.min(100, (monitorCap / maxFps) * 100)}%"></div>` : ''}
      </div>
      <span class="w-20 text-right ${bold ? 'font-bold text-white' : 'text-slate-300'}">${fps} FPS${over ? '<span class="text-[9px] text-slate-500">*</span>' : ''}</span>
    </div>`;
}

function renderSimulator() {
  if (!DB.gpus.length) return;
  // Legacy renderer still fills the AI and Engineering columns
  try { renderSimulatorLegacy(); } catch (e) { console.warn('legacy sim', e); }
  renderSimulatorControls();
  renderSimulatorResultsOnly();
}

function renderSimulatorControls() {
  // Focus game selector
  const focusSel = document.getElementById('sim-select-focus-game');
  if (!STATE.games.find(g => g.id === STATE.focusGameId)) STATE.focusGameId = (STATE.games[0] || {}).id;
  focusSel.innerHTML = STATE.games.map(g => `<option value="${g.id}" ${g.id === STATE.focusGameId ? 'selected' : ''}>${g.title}</option>`).join('');
  focusSel.onchange = () => { STATE.focusGameId = focusSel.value; renderSimulatorResultsOnly(); };

  // Relevant game chips + editor
  const chips = STATE.games.map(g => `
    <button onclick="toggleRelevantGame('${g.id}')" class="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition cursor-pointer ${g.relevant ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-slate-900 text-slate-500 border-slate-700 hover:text-slate-300'}">
      ${g.relevant ? '✓ ' : ''}${g.title}${g.measured ? ' 📏' : ''}
    </button>`).join('');

  const editor = !STATE.showGameEditor ? '' : `
    <div class="w-full mt-2 p-3 rounded-lg bg-slate-950/80 border border-slate-800 overflow-x-auto">
      <p class="text-[10px] text-slate-400 mb-2">
        <strong>FPS ref.</strong> = média numa RTX 5060 em 1440p nativo sem limite de CPU •
        <strong>Teto CPU</strong> = FPS máximo com Ryzen 7 9800X3D (escala pelo índice do seu CPU) •
        <strong>Meu FPS medido</strong> = o que você vê hoje no seu setup atual na resolução selecionada (opcional, calibra o jogo).
      </p>
      <table class="w-full text-[11px]">
        <thead><tr class="text-slate-400 font-mono text-[10px] uppercase">
          <th class="text-left py-1">Jogo</th><th>FPS ref. (5060 1440p)</th><th>Teto CPU (9800X3D)</th><th>VRAM 1440p (GB)</th><th>Meu FPS medido</th><th></th>
        </tr></thead>
        <tbody>
          ${STATE.games.map(g => `
            <tr class="border-t border-slate-800/70">
              <td class="py-1 pr-2"><input value="${g.title.replace(/"/g, '&quot;')}" oninput="updateGameField('${g.id}','title',this.value)" class="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white" /></td>
              <td class="px-1"><input type="number" value="${g.fps1440}" oninput="updateGameField('${g.id}','fps1440',this.value)" class="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-emerald-300 text-center" /></td>
              <td class="px-1"><input type="number" value="${g.cpuFps}" oninput="updateGameField('${g.id}','cpuFps',this.value)" class="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-amber-300 text-center" /></td>
              <td class="px-1"><input type="number" value="${g.vramReq}" oninput="updateGameField('${g.id}','vramReq',this.value)" class="w-14 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-purple-300 text-center" /></td>
              <td class="px-1"><input type="number" value="${g.measured || ''}" placeholder="—" oninput="updateGameField('${g.id}','measured',this.value)" class="w-16 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 font-mono text-sky-300 text-center" /></td>
              <td class="px-1 text-right"><button onclick="removeGame('${g.id}')" class="text-rose-400 hover:text-rose-300 cursor-pointer" title="Remover">✕</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="flex gap-3 mt-2">
        <button onclick="addCustomGame()" class="px-2.5 py-1 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[11px] font-semibold cursor-pointer">+ Adicionar jogo</button>
        <button onclick="resetGamesToDefault()" class="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px] cursor-pointer">Restaurar padrão</button>
      </div>
    </div>`;

  document.getElementById('sim-relevant-games-chips').innerHTML = `
    ${chips}
    <button onclick="toggleGameEditor()" class="px-2.5 py-1 rounded-full text-[11px] font-bold border border-sky-500/50 text-sky-300 bg-sky-500/10 cursor-pointer">⚙️ ${STATE.showGameEditor ? 'Fechar editor' : 'Editar / adicionar jogos'}</button>
    ${editor}`;
}

function toggleXeonDetails() {
  STATE.showXeonDetails = !STATE.showXeonDetails;
  renderSimulatorResultsOnly();
}

function renderSimulatorResultsOnly() {
  const gpuA = DB.gpus.find(g => g.slug === document.getElementById('sim-select-gpu-a').value) || DB.gpus[0];
  const gpuB = DB.gpus.find(g => g.slug === document.getElementById('sim-select-gpu-b').value) || DB.gpus[1];
  const cpu = getSimCpu();
  const mode = document.getElementById('sim-select-cpu-mode').value || 'both';
  const dlssMode = (document.getElementById('sim-select-upscale') || {}).value || STATE.dlssMode || 'perceived';
  const cap = STATE.monitorMaxFps >= 999 ? 999 : STATE.monitorMaxFps;
  const opts = { dlssMode };

  document.getElementById('sim-focus-res-label').textContent = getMonitorLabel();

  // Sleek, compact Architecture & DLSS Notice Bar
  const xeonWarn = getCpuArchitectureAdviceHTML(cpu, gpuA, gpuB);
  const adviceBanner = document.getElementById('sim-cpu-advice-banner') || document.getElementById('sim-xeon-warning-banner');
  if (adviceBanner) adviceBanner.innerHTML = `
    <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-[10px] font-bold">CONFIG ATIVA</span>
        <span class="text-white font-medium">${cpu.name} • Monitor ${getMonitorLabel()} (${cap} Hz)</span>
        <span class="text-slate-400 hidden sm:inline">• Modo: ${dlssMode === 'perceived' ? 'Realista (DLSS 4 + Latência)' : dlssMode}</span>
      </div>
      <button onclick="toggleXeonDetails()" id="btn-toggle-xeon-details" class="text-xs text-sky-400 hover:text-sky-300 underline cursor-pointer">
        ${STATE.showXeonDetails ? 'Ocultar Detalhes Técnicos ▲' : 'Ver Detalhes do Processador & DLSS 4 ▼'}
      </button>
    </div>
    <div id="sim-xeon-details-box" class="${STATE.showXeonDetails ? '' : 'hidden'} mt-2 space-y-2">
      ${xeonWarn}
      <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300">
        ✨ <strong>DLSS 4 + Multi-Frame Generation (MFG 3×/4×):</strong> A série <strong>RTX 50 (Blackwell)</strong> gera até 4× quadros via Transformer diretamente na GPU após a fila de renderização do processador, aliviando o teto de FPS da CPU para preencher monitores de alta taxa de atualização.
      </div>
    </div>`;

  document.getElementById('sim-cpu-factor-badge').textContent = `CPU: índice ${getCpuGamingIndex(cpu)}/100`;

  // Focus game card
  const focus = STATE.games.find(g => g.id === STATE.focusGameId) || STATE.games[0];
  if (focus) {
    const a = estimateFps(gpuA, cpu, focus, opts);
    const b = estimateFps(gpuB, cpu, focus, opts);
    const row = (gpu, r, color) => {
      const shown = mode === 'pure' ? r.pure : r.withCpu;
      const limitedBy = r.cpuCap < r.nativePure ? `<span class="text-amber-300">Gargalo Base CPU (−${r.cpuLossPct}%)</span>` : `<span class="text-emerald-300">Limitado pela GPU</span>`;
      const visible = Math.min(shown, cap);
      const fgBadge = r.canUseFG
        ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-[9px]">${r.tech.badge} (${r.activeFgMult}× ativo)</span>`
        : `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[9px]">${r.tech.badge}</span>`;
      const latColor = r.latencyMs <= 24 ? 'text-emerald-400' : r.latencyMs <= 38 ? 'text-amber-300' : 'text-rose-400';
      return `
        <div class="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
          <div class="flex flex-wrap justify-between items-center gap-1">
            <div class="flex items-center gap-1.5">
              <span class="font-bold ${color} text-xs">${gpu.name}</span>
              ${fgBadge}
            </div>
            ${mode !== 'pure' ? `<span class="text-[10px]">${limitedBy}</span>` : ''}
          </div>
          <div class="grid grid-cols-4 gap-1.5 text-center">
            <div title="FPS real renderizado antes da geração de quadros (define a resposta do mouse)">
              <span class="block text-[9px] uppercase text-slate-500 font-mono">Base Real</span>
              <span class="font-mono font-bold text-slate-200 text-sm">${r.baseRenderFps}</span>
            </div>
            <div title="FPS total enviado para a tela incluindo quadros gerados por FG / MFG">
              <span class="block text-[9px] uppercase text-slate-500 font-mono">Tela c/ FG</span>
              <span class="font-mono font-extrabold text-emerald-400 text-sm">${r.displayedWithCpu}</span>
            </div>
            <div title="Desempenho Percebido (pondera fluidez visual vs latência de entrada e nitidez DLSS 4)">
              <span class="block text-[9px] uppercase text-amber-400 font-mono">Percebido</span>
              <span class="font-mono font-extrabold text-amber-300 text-base">${r.perceivedWithCpu}</span>
            </div>
            <div title="FPS efetivo aproveitado dentro do limite Hz do seu monitor e latência estimada c/ Reflex">
              <span class="block text-[9px] uppercase text-sky-400 font-mono">Monitor / Lat.</span>
              <span class="font-mono font-extrabold text-sky-300 text-sm">${visible} <span class="text-[10px] ${latColor}">(${r.latencyMs}ms)</span></span>
            </div>
          </div>
        </div>`;
    };
    document.getElementById('sim-focus-game-card').innerHTML = `
      <div class="space-y-2">
        ${row(gpuA, a, 'text-sky-300')}
        ${row(gpuB, b, 'text-emerald-300')}
        <p class="text-[10px] text-slate-500">Teto de CPU (quadros reais) neste jogo com ${cpu.name}: ~${a.cpuCap} FPS${a.calibrated ? ' • 📏 calibrado com seu FPS medido' : ''}. Quadros extras via FG/MFG passam acima desse teto.</p>
      </div>`;
  }

  // Averages across relevant games
  const games = getRelevantGames();
  const avg = (gpu, key) => Math.round(games.reduce((s, g) => s + estimateFps(gpu, cpu, g, opts)[key], 0) / Math.max(1, games.length));
  const avgVisible = (gpu, key) => Math.round(games.reduce((s, g) => s + Math.min(cap, estimateFps(gpu, cpu, g, opts)[key]), 0) / Math.max(1, games.length));
  const aPure = avg(gpuA, 'pure'), aCpu = avg(gpuA, 'withCpu'), bPure = avg(gpuB, 'pure'), bCpu = avg(gpuB, 'withCpu');
  const aDisp = avg(gpuA, 'displayedWithCpu'), bDisp = avg(gpuB, 'displayedWithCpu');
  const lossA = Math.round((1 - aCpu / Math.max(1, aPure)) * 100);
  const techA = getGpuTechProfile(gpuA), techB = getGpuTechProfile(gpuB);

  // 1. VERSUS / RTINGS HEAD-TO-HEAD HERO CARDS
  const heroEl = document.getElementById('sim-versus-hero-cards');
  if (heroEl) {
    const gameGain = bCpu > 0 ? Math.round((aCpu / bCpu - 1) * 100) : 0;
    const aiA = typeof getEffectiveAIScore === 'function' ? getEffectiveAIScore(gpuA) : (gpuA.llm_14b_tok_s || 30);
    const aiB = typeof getEffectiveAIScore === 'function' ? getEffectiveAIScore(gpuB) : (gpuB.llm_14b_tok_s || 20);
    const aiGain = aiB > 0 ? Math.round((aiA / aiB - 1) * 100) : 0;
    const trainA = typeof getEffectiveEngineeringScore === 'function' ? getEffectiveEngineeringScore(gpuA) : 3000;
    const trainB = typeof getEffectiveEngineeringScore === 'function' ? getEffectiveEngineeringScore(gpuB) : 2000;
    const trainGain = trainB > 0 ? Math.round((trainA / trainB - 1) * 100) : 0;

    const speedometerSvg = `<svg class="w-5 h-5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M2 12h2M16 12a4 4 0 1 1-8 0M14 10l3-3M4 18a10 10 0 0 1 16 0"/></svg>`;
    const robotSvg = `<svg class="w-5 h-5 text-purple-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01M9 11V9a3 3 0 0 1 6 0v2"/></svg>`;
    const circuitSvg = `<svg class="w-5 h-5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>`;

    heroEl.innerHTML = `
      <!-- Scorecard 1: Games -->
      <div class="glass-elevated rounded-2xl p-4 border border-emerald-500/30 flex flex-col justify-between shadow-sm">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            ${speedometerSvg}
            <span class="text-xs font-mono uppercase text-emerald-400 font-bold">Desempenho em Jogos</span>
          </div>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">${aCpu >= bCpu ? gpuA.name : gpuB.name} +rápida</span>
        </div>
        <div class="mt-3 flex items-baseline gap-2">
          <span class="text-3xl font-mono font-black ${gameGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${gameGain >= 0 ? '+' : ''}${gameGain}%</span>
          <span class="text-xs text-slate-300 font-mono">(${aCpu} FPS vs ${bCpu} FPS médios)</span>
        </div>
        <div class="h-2 w-full bg-slate-950 rounded-full relative overflow-hidden border border-slate-800 my-2">
          <div class="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600/80 z-20" title="100% Referência Base"></div>
          <div class="h-full rounded-full ${gameGain >= 0 ? 'bg-gradient-to-r from-sky-400 to-emerald-400' : 'bg-rose-400'}" style="width: ${gameGain >= 0 ? Math.min(100, 50 + Math.min(50, gameGain * 0.7)).toFixed(1) : Math.max(10, 50 * Math.max(0.2, 1 + gameGain / 100)).toFixed(1)}%;"></div>
        </div>
        <div class="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
          <span class="text-sky-300 truncate">${gpuA.name}: ${aCpu} FPS</span>
          <span class="text-slate-500">vs</span>
          <span class="text-emerald-300 truncate">${gpuB.name}: ${bCpu} FPS</span>
        </div>
      </div>

      <!-- Scorecard 2: Running AI -->
      <div class="glass-elevated rounded-2xl p-4 border border-slate-800 flex flex-col justify-between shadow-sm">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            ${robotSvg}
            <span class="text-xs font-mono uppercase text-sky-400 font-bold">Executar IA (Inferência)</span>
          </div>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-bold">${gpuA.vram_gb >= gpuB.vram_gb ? gpuA.name : gpuB.name} +capacidade</span>
        </div>
        <div class="mt-3 flex items-baseline gap-2">
          <span class="text-3xl font-mono font-black ${aiGain >= 0 ? 'text-sky-400' : 'text-rose-400'}">${aiGain >= 0 ? '+' : ''}${aiGain}%</span>
          <span class="text-xs text-slate-300 font-mono">(14B: ${gpuA.llm_14b_tok_s} vs ${gpuB.llm_14b_tok_s} tok/s)</span>
        </div>
        <div class="h-2 w-full bg-slate-950 rounded-full relative overflow-hidden border border-slate-800 my-2">
          <div class="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600/80 z-20" title="100% Referência Base"></div>
          <div class="h-full rounded-full ${aiGain >= 0 ? 'bg-gradient-to-r from-sky-500 to-emerald-400' : 'bg-rose-400'}" style="width: ${aiGain >= 0 ? Math.min(100, 50 + Math.min(50, aiGain * 0.7)).toFixed(1) : Math.max(10, 50 * Math.max(0.2, 1 + aiGain / 100)).toFixed(1)}%;"></div>
        </div>
        <div class="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
          <span class="text-sky-300 truncate">${gpuA.name}: ${gpuA.vram_gb}GB</span>
          <span class="text-slate-500">vs</span>
          <span class="text-emerald-300 truncate">${gpuB.name}: ${gpuB.vram_gb}GB</span>
        </div>
      </div>

      <!-- Scorecard 3: AI Training -->
      <div class="glass-elevated rounded-2xl p-4 border border-amber-500/30 flex flex-col justify-between shadow-sm">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            ${circuitSvg}
            <span class="text-xs font-mono uppercase text-amber-400 font-bold">AI Training & Engenharia</span>
          </div>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">${trainGain >= 0 ? gpuA.name : gpuB.name} +rápida</span>
        </div>
        <div class="mt-3 flex items-baseline gap-2">
          <span class="text-3xl font-mono font-black ${trainGain >= 0 ? 'text-amber-400' : 'text-rose-400'}">${trainGain >= 0 ? '+' : ''}${trainGain}%</span>
          <span class="text-xs text-slate-300 font-mono">(Throughput CUDA / FP16)</span>
        </div>
        <div class="h-2 w-full bg-slate-950 rounded-full relative overflow-hidden border border-slate-800 my-2">
          <div class="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600/80 z-20" title="100% Referência Base"></div>
          <div class="h-full rounded-full ${trainGain >= 0 ? 'bg-gradient-to-r from-amber-400 to-emerald-400' : 'bg-rose-400'}" style="width: ${trainGain >= 0 ? Math.min(100, 50 + Math.min(50, trainGain * 0.7)).toFixed(1) : Math.max(10, 50 * Math.max(0.2, 1 + trainGain / 100)).toFixed(1)}%;"></div>
        </div>
        <div class="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
          <span class="text-sky-300 truncate">${gpuA.name}: ${trainA} pts</span>
          <span class="text-slate-500">vs</span>
          <span class="text-emerald-300 truncate">${gpuB.name}: ${trainB} pts</span>
        </div>
      </div>
    `;
  }

  document.getElementById('sim-average-fps-summary').innerHTML = `
    <div><span class="text-slate-400">Média (${games.length} jogos) •</span> <strong class="text-sky-300">${gpuA.name} (${techA.shortBadge})</strong>:
      <span class="font-mono text-white">${aPure}</span> pura → <span class="font-mono text-amber-300">${aCpu}</span> c/ CPU
      (<span class="font-mono text-emerald-300">${aDisp} FPS na tela c/ FG</span> • <span class="font-mono text-sky-300">${avgVisible(gpuA, mode === 'pure' ? 'pure' : 'withCpu')}</span> úteis no monitor)</div>
    <div><strong class="text-emerald-300">${gpuB.name} (${techB.shortBadge})</strong>:
      <span class="font-mono text-white">${bPure}</span> → <span class="font-mono text-amber-300">${bCpu}</span> (<span class="font-mono text-emerald-300">${bDisp} c/ FG</span>)</div>
    <div class="w-full text-[11px] ${lossA >= 15 ? 'text-amber-300' : 'text-slate-400'}">
      Ganho no modo selecionado (${dlssMode === 'perceived' ? 'Percebido DLSS 4 + MFG' : dlssMode === 'max_fg' ? 'FPS Bruto c/ MFG' : dlssMode === 'sr' ? 'Upscaling SR' : 'Nativo'}):
      <strong>${bCpu > 0 ? (aCpu >= bCpu ? '+' : '') + Math.round((aCpu / bCpu - 1) * 100) : '--'}%</strong> com CPU
      (vs ${bPure > 0 ? (aPure >= bPure ? '+' : '') + Math.round((aPure / bPure - 1) * 100) : '--'}% sem gargalo de CPU).
    </div>`;

  // Per-game bars with clean speedometer icon and %
  const speedometerSvgSmall = `<svg class="w-3.5 h-3.5 text-emerald-400 inline-block mr-1 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M2 12h2M16 12a4 4 0 1 1-8 0M14 10l3-3M4 18a10 10 0 0 1 16 0"/></svg>`;
  document.getElementById('sim-games-list').innerHTML = games.map(gm => {
    const a = estimateFps(gpuA, cpu, gm, opts);
    const b = estimateFps(gpuB, cpu, gm, opts);
    const maxF = Math.max(a.pure, b.pure, a.displayedWithCpu, b.displayedWithCpu, cap < 999 ? cap : 0, 60) * 1.05;
    const gainKey = mode === 'pure' ? 'pure' : 'withCpu';
    const gain = Math.round((a[gainKey] / Math.max(1, b[gainKey]) - 1) * 100);
    const rows = [];
    if (mode !== 'cpu') {
      rows.push(fpsBarRow(`${gpuA.name} (pura)`, 'text-sky-300', 'bg-sky-400', a.pure, maxF, true, cap));
      rows.push(fpsBarRow(`${gpuB.name} (pura)`, 'text-emerald-300', 'bg-emerald-500', b.pure, maxF, false, cap));
    }
    if (mode !== 'pure') {
      rows.push(fpsBarRow(`${gpuA.name} + CPU`, 'text-sky-200', 'bg-amber-400', a.withCpu, maxF, true, cap));
      rows.push(fpsBarRow(`${gpuB.name} + CPU`, 'text-emerald-200', 'bg-amber-600', b.withCpu, maxF, false, cap));
    }
    const fgNote = (a.canUseFG || b.canUseFG)
      ? `<div class="text-[10px] text-emerald-300/90 font-mono">✨ Na tela c/ FG/MFG: ${gpuA.name} ${a.displayedWithCpu} FPS (${a.activeFgMult}×, ~${a.latencyMs}ms) vs ${gpuB.name} ${b.displayedWithCpu} FPS (${b.activeFgMult}×, ~${b.latencyMs}ms)</div>`
      : '';
    return `
      <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
        <div class="flex justify-between items-center text-xs font-semibold text-white">
          <span class="flex items-center gap-1">${speedometerSvgSmall} ${gm.title}${a.calibrated ? ' <span class="text-[10px] text-sky-400">📏</span>' : ''}</span>
          <span class="font-mono ${gain >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold">${gain >= 0 ? '+' : ''}${gain}%</span>
        </div>
        <div class="space-y-1 text-[11px] font-mono">${rows.join('')}</div>
        ${fgNote}
        ${mode !== 'pure' && a.cpuCap < a.nativePure ? `<div class="text-[10px] text-amber-300/90">CPU limita quadros reais a ~${a.cpuCap} FPS (FG/MFG multiplica acima disso)</div>` : ''}
      </div>`;
  }).join('') + (cap < 999 ? `<p class="text-[10px] text-slate-500">Linha branca = limite do monitor (${cap} Hz).</p>` : '');
}

// ============================================================================
// 4. SUGESTÕES DE MUDANÇA — DDR4 vs DDR5 PLATFORM PLANNER
// ============================================================================
// ============================================================================
// 4. PLATFORM UPGRADE PLANNER (AM4 vs LGA1700 vs AM5 vs LGA1851 vs DDR4/DDR5)
// ============================================================================
const PLATFORMS = [
  { id: 'keep_pc',   label: 'Manter Meu Setup Atual',            socket: 'CURRENT', mem: 'CURRENT', keep: true,
    note: 'Custo mínimo: mantém seu processador e placa-mãe configurados no "Meu PC", investindo apenas em RAM necessária ou GPU.' },
  { id: 'am4',       label: 'AMD AM4 (Ryzen 5000) + DDR4',       socket: 'AM4',       mem: 'DDR4',
    note: 'Plataforma madura com excelente custo-benefício que reaproveita memórias DDR4 e conta com 5700X / 5700X3D.' },
  { id: 'lga1700d4', label: 'Intel LGA1700 Custo-Benefício + DDR4', socket: 'LGA1700',   mem: 'DDR4',
    note: 'Intel 12ª/13ª/14ª geração reaproveitando pentes DDR4 (Core i3-12100F, i5-12400F até i7-14700KF).' },
  { id: 'am5',       label: 'AMD AM5 (Ryzen 7000/9000) + DDR5',  socket: 'AM5',       mem: 'DDR5',
    note: 'Maior longevidade com suporte contínuo de novos processadores pela AMD até 2027+ e cache 3D V-Cache.' },
  { id: 'lga1700d5', label: 'Intel LGA1700 Intermediário + DDR5', socket: 'LGA1700',   mem: 'DDR5',
    note: 'Intel 12ª/13ª/14ª geração com memória DDR5 de alta velocidade (Core i5 12600K/13600K/14600K).' },
  { id: 'lga1700d5_high', label: 'Intel LGA1700 Alta Performance + DDR5', socket: 'LGA1700', mem: 'DDR5', highTier: true,
    note: 'Core i7 14700K / i9 14900K com placas B760/Z790 com dissipador reforçado para evitar thermal throttling.' },
  { id: 'lga1851',   label: 'Intel LGA1851 (Core Ultra Série 2) + DDR5', socket: 'LGA1851', mem: 'DDR5',
    note: 'Nova arquitetura Arrow Lake (Core Ultra 5 245K / Ultra 7 265K / Ultra 9 285K) com alta eficiência térmica e NPU dedicada.' }
];

function getRamPriceStats(type) {
  const list = DB.rams.filter(r => r.memory_type === type && r.capacity_gb >= 8 && r.price_brl > 0);
  if (!list.length) return { list: [], median: 0 };
  const perGB = list.map(r => r.price_brl / r.capacity_gb).sort((a, b) => a - b);
  const median = perGB[Math.floor(perGB.length / 2)];
  // Drop glitches (e.g. a 4GB stick listed at R$ 2.456)
  return { list: list.filter(r => r.price_brl / r.capacity_gb <= median * 2.5), median };
}

function getRamOverride(type) {
  const el = document.getElementById(type === 'DDR4' ? 'upg-override-ddr4' : 'upg-override-ddr5');
  const v = el ? parseFloat(el.value) : NaN;
  return isNaN(v) || v <= 0 ? null : v;
}

// Cheapest way to buy `neededGB` of a memory type (1, 2 or 4 identical items)
function cheapestRamFor(type, neededGB) {
  if (neededGB <= 0) return { cost: 0, desc: 'Nenhuma RAM extra necessária', perGB: 0 };
  const override = getRamOverride(type);
  const sym = STATE.market?.monetary?.currency_symbol || 'R$';
  if (override) return { cost: override * neededGB, desc: `${neededGB} GB ${type} @ ${sym} ${override}/GB (manual)`, perGB: override };
  const { list } = getRamPriceStats(type);
  let best = null;
  list.forEach(r => {
    if (r.capacity_gb > neededGB || neededGB % r.capacity_gb !== 0) return;
    const n = neededGB / r.capacity_gb;
    if (n > 4) return;
    const cost = r.price_brl * n;
    if (!best || cost < best.cost) best = { cost, desc: `${n > 1 ? n + '× ' : ''}${r.name}`, perGB: cost / neededGB, slug: r.slug, url: r.offer_url, item: r };
  });
  if (!best && list.length) {
    const minPer = Math.min(...list.map(r => r.price_brl / r.capacity_gb));
    best = { cost: minPer * neededGB, desc: `~${neededGB} GB ${type} (estimado pelo menor ${sym}/GB)`, perGB: minPer };
  }
  return best || { cost: 0, desc: 'Sem dados de RAM', perGB: 0 };
}

function getPlatformCpuCandidates(p) {
  if (p.keep) {
    const cur = (STATE.refPC && STATE.refPC.cpu && STATE.refPC.cpu.name) ? STATE.refPC.cpu : ((STATE.build && STATE.build.cpu) || {});
    if (cur.name) {
      return [{
        slug: cur.slug || 'current-cpu',
        name: cur.name,
        price_brl: 0,
        benchmark: cur.benchmark || 5500,
        tdp_w: cur.tdp || 65,
        socket: cur.socket || 'AM4'
      }];
    }
    return (DB.cpus || []).slice(0, 3);
  }
  let cands = (DB.cpus || []).filter(c => getCpuSocket(c) === p.socket && c.price_brl > 0 && !/threadripper/i.test(c.slug));
  if (p.id === 'lga1700d5_high') {
    const high = cands.filter(c => /14900|13900|14700|13700|12900/i.test(c.slug) || /i9|i7/i.test(c.name));
    if (high.length) cands = high;
  }
  return cands;
}

function getDefaultPlatformCpu(p, cands) {
  if (p.keep) return cands[0];
  if (p.id === 'lga1700d5_high') {
    return cands.find(c => /14700k|13700k|14900k/i.test(c.slug)) || cands[0];
  }
  // Value pick: gaming index^3.5 / price (favours strong-but-affordable chips)
  let best = cands[0], bestV = -1;
  cands.forEach(c => {
    const v = Math.pow(getCpuGamingIndex(c), 3.5) / Math.max(1, c.price_brl);
    if (v > bestV) { bestV = v; best = c; }
  });
  return best;
}

function onUpgCpuChange(platformId, slug) {
  if (!STATE.upg) STATE.upg = {};
  if (!STATE.upg.cpu) STATE.upg.cpu = {};
  STATE.upg.cpu[platformId] = slug;
  saveUserPrefs();
  renderUpgradeSuggestions();
}

function onUpgMoboChange(platformId, slug) {
  if (!STATE.upg) STATE.upg = {};
  if (!STATE.upg.mobo) STATE.upg.mobo = {};
  STATE.upg.mobo[platformId] = slug;
  saveUserPrefs();
  renderUpgradeSuggestions();
}

function onUpgReuseRamChange(val) {
  if (!STATE.upg) STATE.upg = {};
  STATE.upg.reuseRam = val;
  saveUserPrefs();
  renderUpgradeSuggestions();
}

function computePlatformPlan(p, targetGB, budget) {
  const cands = getPlatformCpuCandidates(p);
  if (!cands.length) return null;

  const refRam = (STATE.refPC && STATE.refPC.ram && STATE.refPC.ram.memory_type) ? STATE.refPC.ram : ((STATE.build && STATE.build.ram) || {});
  const refMobo = (STATE.refPC && STATE.refPC.mobo && STATE.refPC.mobo.name) ? STATE.refPC.mobo : ((STATE.build && STATE.build.mobo) || {});

  const memType = p.keep ? (refRam.memory_type || 'DDR4') : p.mem;
  const moboCands = p.keep
    ? [(refMobo.name ? refMobo : { slug: 'current-mobo', name: 'Placa-Mãe Atual', price_brl: 0, socket: cands[0].socket || 'AM4', memory_type: memType })]
    : (DB.motherboards || []).filter(m => m.socket === p.socket && m.memory_type === p.mem && m.price_brl > 0).sort((a, b) => a.price_brl - b.price_brl);

  let mobo = null, moboCost = 0;
  if (p.keep) {
    mobo = moboCands[0];
    moboCost = 0;
  } else {
    const savedMoboSlug = STATE.upg?.mobo?.[p.id];
    if (savedMoboSlug) {
      mobo = moboCands.find(m => m.slug === savedMoboSlug);
    }
    if (!mobo) {
      if (p.highTier) {
        mobo = moboCands.find(m => /z790|b760m-p|b760m-k/i.test(m.slug) || /z790/i.test(m.name)) || moboCands[moboCands.length - 1] || moboCands[0];
      } else {
        mobo = moboCands[0];
      }
    }
    if (!mobo) return null;
    moboCost = mobo.price_brl;
  }

  const currentRam = refRam.capacity_gb || 16;
  const userRamType = refRam.memory_type || 'DDR4';
  const canReuse = memType === userRamType && (p.keep || (STATE.upg && STATE.upg.reuseRam));
  const neededGB = Math.max(0, targetGB - (canReuse ? currentRam : 0));
  const ram = cheapestRamFor(memType, neededGB);

  // Joint Combinatorial Optimizer across CPU candidates and GPUs (Argon Drop-in)
  const userLockedCpu = STATE.upg?.cpu?.[p.id];
  let bestPair = null;

  const candidateCpus = userLockedCpu
    ? [cands.find(c => c.slug === userLockedCpu) || getDefaultPlatformCpu(p, cands)]
    : cands;

  candidateCpus.forEach(candCpu => {
    const cCost = p.keep ? 0 : candCpu.price_brl;
    const pCost = cCost + moboCost + ram.cost;
    const remGpuBudget = budget - pCost;
    const bestGpuForCpu = DB.gpus
      .filter(g => g.slug !== 'rx-580-8gb-ref' && g.price_brl <= remGpuBudget)
      .sort((a, b) => (b._compositeScore || 0) - (a._compositeScore || 0))[0] || null;

    if (!bestGpuForCpu) {
      if (!bestPair) {
        bestPair = { cpu: candCpu, cpuCost: cCost, platformCost: pCost, gpuBudget: remGpuBudget, gpu: null, avgFps: 0, avgPure: 0, finalScore: 0 };
      }
      return;
    }

    const games = getRelevantGames();
    const cap = STATE.monitorMaxFps >= 999 ? Infinity : STATE.monitorMaxFps;
    let aFps = 0, aPure = 0;
    games.forEach(gm => {
      const r = estimateFps(bestGpuForCpu, candCpu, gm);
      aFps += Math.min(cap, r.withCpu);
      aPure += Math.min(cap, r.pure);
    });
    aFps = Math.round(aFps / games.length);
    aPure = Math.round(aPure / games.length);
    const tot = Math.max(1, STATE.wGaming + STATE.wAI + STATE.wSoft);
    let cpuRatio = aFps / Math.max(1, aPure);

    // VRM thermal throttling penalty (0.85) if motherboard VRM is underpowered for candCpu (Argon Item 4)
    if (typeof checkCpuMoboCompatibility === 'function') {
      const vrmCheck = checkCpuMoboCompatibility(candCpu, mobo);
      if (vrmCheck && vrmCheck.status === 'warning') {
        cpuRatio *= 0.85;
      }
    }

    const sub = (typeof getSubScoreExtremes === 'function') ? getSubScoreExtremes() : { maxGaming: 14411, maxAI: 21507, maxSoft: 28000 };
    const pairScore = Math.round(
      (STATE.wGaming / tot) * ((getEffectiveGamingScore(bestGpuForCpu, true) * cpuRatio) / sub.maxGaming) * 10000 +
      (STATE.wAI / tot) * (getEffectiveAIScore(bestGpuForCpu) / sub.maxAI) * 10000 +
      (STATE.wSoft / tot) * (getEffectiveEngineeringScore(bestGpuForCpu) / sub.maxSoft) * 10000
    );

    if (!bestPair || pairScore > bestPair.finalScore) {
      bestPair = { cpu: candCpu, cpuCost: cCost, platformCost: pCost, gpuBudget: remGpuBudget, gpu: bestGpuForCpu, avgFps: aFps, avgPure: aPure, finalScore: pairScore };
    }
  });

  if (!bestPair) {
    const fallbackCpu = candidateCpus[0];
    const cCost = p.keep ? 0 : fallbackCpu.price_brl;
    bestPair = { cpu: fallbackCpu, cpuCost: cCost, platformCost: cCost + moboCost + ram.cost, gpuBudget: budget - (cCost + moboCost + ram.cost), gpu: null, avgFps: 0, avgPure: 0, finalScore: 0 };
  }

  const cpu = bestPair.cpu;
  const cpuCost = bestPair.cpuCost;
  const platformCost = bestPair.platformCost;
  const gpuBudget = bestPair.gpuBudget;
  const gpu = bestPair.gpu;
  const avgFps = bestPair.avgFps;
  const avgPure = bestPair.avgPure;
  const finalScore = bestPair.finalScore;

  // Check VRM Compatibility against the actual winning CPU, not cands[0] (Argon Item 4)
  const comp = (typeof checkCpuMoboCompatibility === 'function')
    ? checkCpuMoboCompatibility(cpu, mobo)
    : { status: 'ok', flag: '✓', label: 'Compatível', message: 'Socket compatível.' };

  return { p, cpu, cands, cpuCost, mobo, moboCost, moboCands, comp, memType, ram, neededGB, canReuse, platformCost, gpuBudget, gpu, avgFps, avgPure, finalScore };
}

function applyPlatformToBuild(platformId) {
  const targetGB = parseInt(document.getElementById('upg-select-ram-cap').value) || 32;
  const budget = parseFloat(document.getElementById('upg-budget').value) || 7000;
  const p = PLATFORMS.find(x => x.id === platformId);
  const plan = computePlatformPlan(p, targetGB, budget);
  if (!plan) return;
  const c = plan.cpu;
  STATE.build.cpu = { slug: c.slug, name: c.name, tdp: c.tdp_w, price: c.price_brl, owned: !!p.keep, benchmark: c.benchmark, socket: (typeof getCpuSocket === 'function' ? getCpuSocket(c) : (c.socket || p.socket)) };
  const m = plan.mobo;
  STATE.build.mobo = { slug: m.slug, name: m.name, tdp: m.tdp_w || 35, price: m.price_brl, owned: !!p.keep, socket: m.socket || p.socket, memory_type: m.memory_type || plan.memType };
  STATE.build.ram = {
    slug: plan.ram.slug || STATE.build.ram.slug,
    name: plan.neededGB > 0 ? `${targetGB} GB ${plan.memType} (${plan.canReuse ? 'reaproveita ' + ((STATE.build.ram && STATE.build.ram.capacity_gb) || 16) + 'GB + ' : ''}${plan.ram.desc})` : STATE.build.ram.name,
    tdp: targetGB > 32 ? 15 : 10, price: Math.round(plan.ram.cost), owned: plan.neededGB === 0,
    capacity_gb: targetGB, memory_type: plan.memType
  };
  if (plan.gpu) STATE.build.gpu = { slug: plan.gpu.slug, name: `${plan.gpu.name} (${plan.gpu.vram_gb}GB)`, tdp: plan.gpu.tdp_w, price: plan.gpu.price_brl, owned: false };
  if (typeof saveUserBuildPrefs === 'function') saveUserBuildPrefs();
  const simCpuSel = document.getElementById('sim-select-cpu');
  if (simCpuSel) simCpuSel.value = c.slug;
  switchTab('builder');
}

function renderUpgradeSuggestions() {
  if (!DB.gpus.length) return;
  const targetGB = parseInt(document.getElementById('upg-select-ram-cap').value) || 32;
  const mode = document.getElementById('upg-select-mode').value;
  const budget = parseFloat(document.getElementById('upg-budget').value) || 7000;

  const plans = PLATFORMS
    .filter(p => mode === 'ALL' || p.mem === mode || (p.keep && (mode === 'ALL' || (STATE.build.ram?.memory_type || 'DDR4') === mode)))
    .map(p => computePlatformPlan(p, targetGB, budget))
    .filter(Boolean);
  const bestScore = Math.max(...plans.map(pl => pl.finalScore), 1);

  const refCpu = (STATE.refPC && STATE.refPC.cpu && STATE.refPC.cpu.name) ? STATE.refPC.cpu : ((STATE.build && STATE.build.cpu) || {});
  const curUserRam = (STATE.refPC && STATE.refPC.ram && STATE.refPC.ram.memory_type) ? STATE.refPC.ram : ((STATE.build && STATE.build.ram) || {});
  const curUserRamCap = curUserRam.capacity_gb || 16;
  const curUserRamType = curUserRam.memory_type || 'DDR4';

  document.getElementById('upg-cards-grid').innerHTML = `
    <div class="md:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-3 text-xs text-slate-300 bg-slate-900/70 border border-slate-800 rounded-lg px-3 py-2">
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input type="checkbox" ${(STATE.upg && STATE.upg.reuseRam) ? 'checked' : ''} onchange="onUpgReuseRamChange(this.checked)" class="accent-emerald-500 cursor-pointer" />
        Reaproveitar meus ${curUserRamCap} GB ${curUserRamType} nas plataformas compatíveis (${curUserRamType})
      </label>
      <span class="text-slate-500">•</span>
      <span>Orçamento ${fmtBRLShort(budget)} = plataforma + melhor GPU que cabe no que sobra (ranqueada pelo seu perfil ${STATE.wGaming}/${STATE.wAI}/${STATE.wSoft}%) • FPS em ${getMonitorLabel()}</span>
    </div>
    ${plans.map(pl => {
      const isBest = pl.finalScore === bestScore && pl.gpu;
      const memColor = pl.memType === 'DDR5' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      const cpuOptions = pl.cands
        .sort((a, b) => a.price_brl - b.price_brl)
        .map(c => `<option value="${c.slug}" ${c.slug === pl.cpu.slug ? 'selected' : ''}>${c.name} (idx ${getCpuGamingIndex(c)}) — ${pl.p.keep ? 'já tem' : fmtBRLShort(c.price_brl)}</option>`).join('');
      const moboOptions = (pl.moboCands || [])
        .map(m => `<option value="${m.slug}" ${m.slug === pl.mobo.slug ? 'selected' : ''}>${m.name} — ${pl.p.keep ? 'já tem' : fmtBRLShort(m.price_brl)}</option>`).join('');
      const hasVrmAlert = pl.comp && pl.comp.flag === '!';

      return `
      <div class="rounded-xl p-4 border ${isBest ? 'border-emerald-400 bg-emerald-950/30 shadow-lg shadow-emerald-500/10' : (hasVrmAlert ? 'border-amber-500/50 bg-slate-900/90' : 'border-slate-800 bg-slate-900/80')} flex flex-col gap-2.5 text-xs">
        <div class="flex items-center justify-between gap-2">
          <span class="font-extrabold text-white text-sm">${pl.p.label}</span>
          <span class="px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${memColor}">${pl.memType}</span>
        </div>
        ${isBest ? '<span class="text-[10px] font-mono font-bold text-emerald-300">🏆 MELHOR RESULTADO PARA SEU PERFIL</span>' : ''}
        
        <!-- CPU Selector -->
        <div>
          <label class="text-[10px] font-mono text-slate-400 block mb-0.5">Processador:</label>
          <select ${pl.p.keep ? 'disabled' : ''} onchange="onUpgCpuChange('${pl.p.id}', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-white">${cpuOptions}</select>
        </div>

        <!-- Motherboard Selector & Compatibility Flag -->
        <div>
          <div class="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-0.5">
            <span>Placa-Mãe:</span>
            ${hasVrmAlert ? `<span class="px-1.5 py-0.2 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px]">⚠️ [!] Atenção VRM</span>` : ''}
          </div>
          <select ${pl.p.keep ? 'disabled' : ''} onchange="onUpgMoboChange('${pl.p.id}', this.value)" class="w-full bg-slate-950 border ${hasVrmAlert ? 'border-amber-500/60' : 'border-slate-700'} rounded px-2 py-1 text-[11px] text-white">
            ${moboOptions}
          </select>
        </div>

        <!-- VRM / Compatibility Warning Alert Box -->
        ${hasVrmAlert ? `
          <div class="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-[11px] flex items-start gap-2 leading-snug">
            <span class="font-bold font-mono text-amber-400 shrink-0 text-xs">⚠️ [!]</span>
            <div>
              <strong class="block text-amber-300 font-semibold">${pl.comp.label}</strong>
              <span class="text-amber-100/90 text-[10.5px]">${pl.comp.message}</span>
            </div>
          </div>
        ` : ''}

        <div class="space-y-1 font-mono text-[11px] pt-1 border-t border-slate-800">
          <div class="flex justify-between"><span class="text-slate-400">CPU</span><span>${pl.p.keep ? `${formatMoneyShort(0)} (já tem)` : fmtBRLShort(pl.cpuCost)}</span></div>
          <div class="flex justify-between gap-2"><span class="text-slate-400 shrink-0">Placa-mãe</span><span class="truncate text-right" title="${pl.mobo.name}">${pl.p.keep ? `${formatMoneyShort(0)} (já tem)` : `${fmtBRLShort(pl.moboCost)} <span class="text-slate-500">${pl.mobo.name}</span>`}</span></div>
          <div class="flex justify-between gap-2"><span class="text-slate-400 shrink-0">RAM +${pl.neededGB}GB</span><span class="truncate text-right ${pl.memType === 'DDR5' ? 'text-sky-300' : 'text-emerald-300'}" title="${pl.ram.desc}">${fmtBRLShort(pl.ram.cost)}</span></div>
          <div class="text-[10px] text-slate-500 truncate" title="${pl.ram.desc}">${pl.ram.desc}${pl.canReuse ? ' (+ seus ' + curUserRamCap + 'GB)' : ''}</div>
          <div class="flex justify-between border-t border-slate-800 pt-1 font-bold"><span class="text-slate-300">Total plataforma</span><span class="text-white">${fmtBRLShort(pl.platformCost)}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">Sobra p/ GPU</span><span class="${pl.gpuBudget > 0 ? 'text-amber-300' : 'text-rose-400'} font-bold">${fmtBRLShort(pl.gpuBudget)}</span></div>
        </div>

        <div class="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
          ${pl.gpu ? `
            <div class="text-[10px] text-slate-400 uppercase font-mono">GPU sugerida com a sobra</div>
            <div class="font-bold text-white">${pl.gpu.name} <span class="text-purple-300">${pl.gpu.vram_gb}GB</span> — ${fmtBRLShort(pl.gpu.price_brl)}</div>
            <div class="grid grid-cols-3 gap-1 mt-1 text-center font-mono">
              <div><span class="block text-[9px] text-slate-500">FPS c/ CPU</span><span class="font-bold text-amber-300">${pl.avgFps}</span></div>
              <div><span class="block text-[9px] text-slate-500">14B tok/s</span><span class="font-bold text-purple-300">${pl.gpu.llm_14b_tok_s}</span></div>
              <div><span class="block text-[9px] text-slate-500">Score</span><span class="font-bold text-white">${Math.round((pl.finalScore / bestScore) * 100)}</span></div>
            </div>
            ${pl.avgPure - pl.avgFps > 5 ? `<div class="text-[10px] text-amber-300 mt-1">CPU segura ~${pl.avgPure - pl.avgFps} FPS médios dessa GPU</div>` : ''}
          ` : '<div class="text-rose-300 text-[11px]">Orçamento não cobre nenhuma GPU após a plataforma.</div>'}
        </div>
        <p class="text-[10px] text-slate-400 leading-snug">${pl.p.note}</p>
        <button onclick="applyPlatformToBuild('${pl.p.id}')" class="mt-auto px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-300 border border-sky-500/40 text-[11px] font-bold cursor-pointer">Aplicar na Minha Build →</button>
      </div>`;
    }).join('')}`;

  // RAM price table: DDR4 vs DDR5 by capacity
  const caps = [16, 32, 64];
  const rows = caps.map(cap => {
    const d4 = cheapestRamFor('DDR4', cap);
    const d5 = cheapestRamFor('DDR5', cap);
    const diff = d5.cost - d4.cost;
    const pct = d4.cost > 0 ? Math.round((diff / d4.cost) * 100) : 0;
    return `
      <div class="grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${cap === targetGB ? 'bg-purple-500/10 border border-purple-500/40' : 'bg-slate-950/60 border border-slate-800'}">
        <span class="col-span-2 font-mono font-bold text-white">${cap} GB</span>
        <span class="col-span-4 font-mono text-emerald-300" title="${d4.desc}">DDR4 ${fmtBRLShort(d4.cost)} <span class="text-[10px] text-slate-500">(${fmtBRLShort(d4.perGB)}/GB)</span></span>
        <span class="col-span-4 font-mono text-sky-300" title="${d5.desc}">DDR5 ${fmtBRLShort(d5.cost)} <span class="text-[10px] text-slate-500">(${fmtBRLShort(d5.perGB)}/GB)</span></span>
        <span class="col-span-2 text-right font-mono font-bold ${diff > 0 ? 'text-rose-300' : 'text-emerald-300'}">${diff >= 0 ? '+' : ''}${pct}%</span>
      </div>`;
  }).join('');
  document.getElementById('upg-ram-deals-table').innerHTML = `
    <div class="grid grid-cols-12 gap-2 text-[10px] font-mono uppercase text-slate-500 px-2"><span class="col-span-2">Capac.</span><span class="col-span-4">DDR4 mais barata</span><span class="col-span-4">DDR5 mais barata</span><span class="col-span-2 text-right">Ágio DDR5</span></div>
    ${rows}
    <p class="text-[10px] text-slate-500 mt-1">Glitches de preço (${STATE.market?.monetary?.currency_symbol || 'R$'}/GB &gt; 2,5× a mediana) são ignorados. Use os campos manuais para cotações de usados/ECC.</p>`;

  // Verdict
  const d4t = cheapestRamFor('DDR4', targetGB), d5t = cheapestRamFor('DDR5', targetGB);
  const premium = d5t.cost - d4t.cost;
  const best = plans.find(pl => pl.finalScore === bestScore);
  const bestD4 = plans.filter(pl => pl.memType === 'DDR4').sort((a, b) => b.finalScore - a.finalScore)[0];
  const bestD5 = plans.filter(pl => pl.memType === 'DDR5').sort((a, b) => b.finalScore - a.finalScore)[0];
  const moboEstimate = formatMoneyShort(Math.round(700 * (STATE.market?.monetary?.exchange_rate_vs_brl || 1.0)));
  document.getElementById('upg-recommendation-verdict').innerHTML = `
    <span class="text-[10px] font-mono uppercase text-purple-400 font-bold">💡 Veredito de Plataforma: Placa-Mãe & RAM (${targetGB} GB, orçamento ${fmtBRLShort(budget)})</span>
    <p class="text-slate-200">Hoje, ${targetGB} GB de <strong class="text-sky-300">DDR5</strong> custam <strong>${fmtBRLShort(premium)} a mais</strong> que ${targetGB} GB de <strong class="text-emerald-300">DDR4</strong>
      ${d4t.cost > 0 ? `(+${Math.round((premium / d4t.cost) * 100)}%)` : ''}. Além da RAM, a transição para plataformas modernas exige uma <strong class="text-amber-300">nova placa-mãe</strong> (${bestD5 ? fmtBRLShort(bestD5.moboCost) : `${moboEstimate}+`}), pesando no bolso e reduzindo a verba restante para a GPU.</p>
    ${bestD4 && bestD5 ? `<p class="text-slate-300">Melhor DDR4: <strong>${bestD4.p.label}</strong> → ${bestD4.gpu ? bestD4.gpu.name : 'sem GPU'} (~${bestD4.avgFps} FPS).<br/>
      Melhor DDR5: <strong>${bestD5.p.label}</strong> → ${bestD5.gpu ? bestD5.gpu.name : 'sem GPU'} (~${bestD5.avgFps} FPS).</p>` : ''}
    ${best ? `<div class="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-100">
      <strong>Recomendação para seu perfil:</strong> ${best.p.label} com ${best.cpu.name}${best.gpu ? ` + ${best.gpu.name}` : ''}.
      ${best.memType === 'DDR4' ? 'Com a placa-mãe e RAM caras no ecossistema DDR5, manter-se no DDR4 libera orçamento para uma GPU muito mais potente — gerando salto imediato em IA e FPS.' : 'Mesmo pagando o investimento da nova placa-mãe e DDR5, a plataforma moderna rende mais no seu perfil e viabiliza upgrades futuros de CPU.'}
    </div>` : ''}
    ${refCpu && refCpu.name ? `<p class="text-[11px] text-slate-400">Seu PC de Referência configurado atualmente: <strong>${refCpu.name}</strong> (${curUserRamCap}GB ${curUserRamType}). Você pode customizar suas peças a qualquer momento na aba <strong>Configurações do Sistema</strong>.</p>` : ''}`;
}

// ============================================================================
// 5. BLACK FRIDAY — MULTI-GENERATION SEASONALITY & EXPECTED PROMO RANGE
// ============================================================================
const BF_FAMILIES = {
  gpu_cross_tiers: {
    kind: 'gpu',
    label: 'Crossover de Gerações (3080 vs 4070 vs 5060 Ti vs 5070)',
    slugs: ['rtx-3080-10gb', 'rtx-3080-12gb', 'rtx-3070-ti', 'rtx-4070', 'rtx-5060', 'rtx-5060-ti-8gb', 'rtx-5060-ti-16gb', 'rtx-5070', 'rx-7800-xt', 'rx-9070']
  },
  gpu_60: {
    kind: 'gpu',
    label: 'Série xx60 (2060 → 3060 → 4060 → 5060 / Ti)',
    slugs: ['rtx-2060-6gb', 'rtx-2060-super', 'rtx-3060-8gb', 'rtx-3060-12gb', 'rtx-3060-ti', 'rtx-4060', 'rtx-4060-ti-8gb', 'rtx-5060', 'rtx-5060-ti-8gb', 'rtx-5060-ti-16gb']
  },
  gpu_70: {
    kind: 'gpu',
    label: 'Série xx70 (2070 → 3070 → 4070 → 5070 / RX 9070)',
    slugs: ['rtx-2070', 'rtx-3070', 'rtx-3070-ti', 'rtx-4070', 'rtx-4070-ti', 'rtx-5070', 'rtx-5070-ti', 'rx-9070', 'rx-9070-xt']
  },
  gpu_80: {
    kind: 'gpu',
    label: 'Série xx80 High-End (3080 → 4080 → 5080 / RX 6800/7800 XT)',
    slugs: ['rtx-3080-10gb', 'rtx-3080-12gb', 'rtx-3080-ti', 'rtx-4080', 'rtx-4080-super', 'rtx-5080', 'rx-6800-xt', 'rx-7800-xt', 'rx-7900-gre']
  },
  gpu_amd: {
    kind: 'gpu',
    label: 'Radeon Série xx60/xx70/xx80 (RX 580 → 6600 → 7600 → 7800 XT → 9070 XT)',
    slugs: ['rx-580-8gb-ref', 'rx-6600', 'rx-6600-xt', 'rx-6700-xt', 'rx-6750-xt', 'rx-7600', 'rx-7600-xt', 'rx-9060-xt-8gb', 'rx-9060-xt-16gb', 'rx-7800-xt', 'rx-9070-xt']
  },
  cpu_mid: {
    kind: 'cpu',
    label: 'CPUs Intermediários (Ryzen 5 5500/5600/7600/9600X / Core i5)',
    slugs: ['ryzen-5-5500', 'ryzen-5-5600', 'ryzen-5-5600x', 'ryzen-5-7500f', 'ryzen-5-7600', 'ryzen-5-7600x', 'ryzen-5-9600x', 'core-i5-12400f', 'core-i5-13400f', 'core-i5-14400f', 'core-ultra-5-225f']
  },
  cpu_high: {
    kind: 'cpu',
    label: 'CPUs High-End & X3D (5700X3D → 7800X3D → 9800X3D / Core i7/i9)',
    slugs: ['ryzen-7-5700x', 'ryzen-7-5700x3d', 'ryzen-7-5800x3d', 'ryzen-7-7700', 'ryzen-7-7800x3d', 'ryzen-7-9700x', 'ryzen-7-9800x3d', 'core-i5-14600kf', 'core-i7-14700kf', 'core-ultra-5-245kf']
  },
  cpu_budget_upgrades: {
    kind: 'cpu',
    label: 'Processadores de Entrada & Upgrades (i3 vs R5 vs 5700X3D)',
    slugs: ['core-i3-12100f', 'core-i3-14100f', 'ryzen-5-5500', 'ryzen-5-5600', 'core-i5-12400f', 'ryzen-7-5700x', 'ryzen-7-5700x3d', 'xeon-e5-2680-v4']
  },
  cpu_xeon_budget: {
    kind: 'cpu',
    label: 'Processadores de Entrada & Upgrades (i3 vs R5 vs 5700X3D)',
    slugs: ['core-i3-12100f', 'core-i3-14100f', 'ryzen-5-5500', 'ryzen-5-5600', 'core-i5-12400f', 'ryzen-7-5700x', 'ryzen-7-5700x3d', 'xeon-e5-2680-v4']
  }
};
const BF_COLORS = ['#38bdf8', '#10b981', '#a855f7', '#f59e0b', '#f43f5e', '#22d3ee', '#84cc16', '#e879f9', '#fb923c', '#94a3b8', '#06b6d4', '#e11d48'];
let chartBF = null;
let chartBFTarget = null;

function bfToday() { return (DB.updated_at || new Date().toISOString()).slice(0, 10); }

function priceInRange(hist, from, to) {
  return hist.filter(h => h.date >= from && h.date <= to).map(h => h.price);
}
// Trimmed mean drops the top 20% scalped/out-of-stock spikes and bottom 5% glitches (Argon Drop-in)
const mean = a => {
  if (!a || !a.length) return null;
  if (a.length < 5) return a.reduce((s, x) => s + x, 0) / a.length;
  const sorted = [...a].sort((x, y) => x - y);
  const lo = Math.floor(sorted.length * 0.05);
  const hi = Math.ceil(sorted.length * 0.80);
  const slice = sorted.slice(lo, Math.max(lo + 1, hi));
  return slice.reduce((s, x) => s + x, 0) / slice.length;
};
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
window.shiftDate = shiftDate;

function bfAnalyzeItem(item, kind) {
  const hist = [...(item.history || [])].sort((a, b) => a.date.localeCompare(b.date));
  const today = bfToday();
  const curYear = parseInt(today.slice(0, 4));
  const years = {};
  for (let y = curYear - 3; y <= curYear; y++) {
    const pre = priceInRange(hist, `${y}-09-15`, `${y}-10-31`);
    const bf = priceInRange(hist, `${y}-11-01`, `${y}-12-02`);
    const post = priceInRange(hist, `${y}-12-03`, `${y + 1}-03-31`);
    if (!pre.length && !bf.length) continue;
    const preAvg = mean(pre);
    const bfMin = bf.length ? Math.min(...bf) : null;
    const postMin = post.length ? Math.min(...post) : null;
    const inProgress = today < `${y}-12-02` && today >= `${y}-09-15`;
    years[y] = {
      preAvg, bfMin, bfAvg: mean(bf), postMin,
      discount: preAvg && bfMin && !inProgress ? Math.max(0, 1 - bfMin / preAvg) : null,
      postLower: postMin && bfMin ? postMin < bfMin * 0.98 : null,
      inProgress
    };
  }
  const prices = hist.map(h => h.price);
  const allMin = prices.length ? Math.min(...prices) : item.price_brl;
  const last45 = priceInRange(hist, shiftDate(today, -45), today);
  const yearAgo = priceInRange(hist, shiftDate(today, -380), shiftDate(today, -350));
  
  // Measure pre-BF inflation strictly against THIS year's post-July baseline (Jul 15 - Sep 30), NOT 2025!
  const sep = priceInRange(hist, `${curYear}-07-15`, `${curYear}-09-30`);
  const baselinePre = sep.length ? mean(sep) : null;

  // Effective current price accounts for active verified coupons
  let effectiveCurrent = item.price_brl;
  if (item.coupon && typeof item.coupon === 'string') {
    const mOff = item.coupon.match(/(?:R\$|\$|€|£)?\s*([0-9]{2,4})\s*OFF/i);
    if (mOff) effectiveCurrent = Math.max(10, item.price_brl - parseFloat(mOff[1]));
  }

  // Use contextual composite score if GPU, else gaming index
  const perf = kind === 'gpu'
    ? (typeof getContextualCompositeScore === 'function' ? getContextualCompositeScore(item) : (item.gaming_score || 1))
    : getCpuGamingIndex(item) * 100;

  return {
    item, kind, hist, years, allMin,
    current: item.price_brl,
    effectiveCurrent,
    recentAvg: mean(last45) || item.price_brl,
    yoyPct: yearAgo.length ? ((effectiveCurrent / mean(yearAgo)) - 1) * 100 : null,
    preBfInflationPct: baselinePre ? ((effectiveCurrent / baselinePre) - 1) * 100 : null,
    vsAllMinPct: allMin > 0 ? ((effectiveCurrent / allMin) - 1) * 100 : 0,
    perf,
    brlPerPerf: effectiveCurrent / Math.max(1, item.gaming_score || perf) * 1000,
    brlPerContextualPerf: effectiveCurrent / Math.max(1, perf) * 1000,
    firstDate: hist.length ? hist[0].date : null
  };
}

function bfExpectedRange(st, familyMedianDisc) {
  const curYear = parseInt(bfToday().slice(0, 4));
  const last = st.years[curYear - 1];
  const thisY = st.years[curYear];
  const disc = Math.max(0.06, (last && last.discount != null) ? last.discount : (familyMedianDisc || 0.09));

  // Current market anchor: combine current price and recent 45-day average so recent price hikes are acknowledged
  const currentAnchor = (st.current && st.recentAvg) 
    ? (st.current * 0.55 + st.recentAvg * 0.45) 
    : (st.current || st.recentAvg || 1000);

  // If there was an artificial pre-BF spike (>8% inflation between baseline and recent), haircut only the spike
  let base = currentAnchor;
  if (st.preBfInflationPct != null && st.preBfInflationPct > 8) {
    const spikeExcess = Math.min(0.12, (st.preBfInflationPct - 6) / 100);
    base = currentAnchor * (1 - spikeExcess);
  }

  // Blend with preAvg if present, preserving current market realism
  if (thisY && thisY.preAvg) {
    base = Math.max(base * 0.90, Math.min(base, (thisY.preAvg * 0.35 + base * 0.65)));
  }

  // Realistic BF discount bounds: realistic deals are typically 8% to 15% off current realistic market price
  let low = Math.round(base * (1 - Math.min(0.20, disc * 1.20)));
  const mid = Math.round(base * (1 - disc));
  const high = Math.round(base * (1 - disc * 0.50));

  // Floor safeguard: don't floor to an unrealistic 2-year old all-time low (e.g. R$ 1.800) if current market is R$ 2.750.
  const realisticFloor = Math.round(Math.max(base * 0.80, (st.allMin ? Math.min(st.allMin * 1.15, base * 0.85) : base * 0.82)));
  low = Math.max(low, realisticFloor);

  return { low, mid, high: Math.max(mid, high), disc, base: Math.round(base), ownData: !!(last && last.discount != null) };
}

let BF_CACHE = { fam: null, stats: [], familyMedianDisc: 0.1 };
STATE.bfShowSummary = false;
STATE.bfVisibleSlugs = null;

function toggleBFSummary() {
  STATE.bfShowSummary = !STATE.bfShowSummary;
  const el = document.getElementById('bf-multiyear-summary');
  const btn = document.getElementById('bf-btn-toggle-summary');
  if (el) {
    if (STATE.bfShowSummary) {
      el.classList.remove('hidden');
      if (btn) btn.textContent = 'Ocultar Resumo ▲';
    } else {
      el.classList.add('hidden');
      if (btn) btn.textContent = 'Estatísticas Multi-Anos ▼';
    }
  }
}

function toggleBFModel(slug) {
  if (!STATE.bfVisibleSlugs) {
    const famKey = document.getElementById('bf-select-family').value;
    const fam = BF_FAMILIES[famKey];
    STATE.bfVisibleSlugs = new Set(fam.slugs);
  }
  if (STATE.bfVisibleSlugs.has(slug)) {
    if (STATE.bfVisibleSlugs.size > 1) STATE.bfVisibleSlugs.delete(slug);
  } else {
    STATE.bfVisibleSlugs.add(slug);
  }
  renderBlackFridayTab();
}

function renderBlackFridayTab() {
  if (!DB.gpus.length) return;
  const famKey = document.getElementById('bf-select-family').value;
  const fam = BF_FAMILIES[famKey];
  const pool = fam.kind === 'gpu' ? DB.gpus : DB.cpus;
  const items = fam.slugs.map(s => pool.find(x => x.slug === s)).filter(Boolean);
  const stats = items.map(it => bfAnalyzeItem(it, fam.kind));
  const curYear = parseInt(bfToday().slice(0, 4));
  const discs = stats.map(s => s.years[curYear - 1] && s.years[curYear - 1].discount).filter(d => d != null);
  const familyMedianDisc = median(discs) || 0.10;
  stats.forEach(s => s.range = bfExpectedRange(s, familyMedianDisc));

  const famChanged = BF_CACHE.fam !== famKey;
  if (famChanged) STATE.bfVisibleSlugs = null;
  BF_CACHE = { fam: famKey, stats, familyMedianDisc };

  // Model filter chips for chart
  const chipsEl = document.getElementById('bf-model-filter-chips');
  if (chipsEl) {
    chipsEl.innerHTML = `
      <span class="text-[10px] font-mono text-slate-400 mr-1 uppercase">Modelos no Gráfico:</span>
      ${stats.map(s => {
        const active = !STATE.bfVisibleSlugs || STATE.bfVisibleSlugs.has(s.item.slug);
        return `<button onclick="toggleBFModel('${s.item.slug}')" class="px-2.5 py-0.5 rounded-full text-[11px] font-mono transition cursor-pointer border ${active ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold' : 'bg-slate-900/60 text-slate-500 border-slate-800'}">${s.item.name}</button>`;
      }).join('')}
      <button onclick="STATE.bfVisibleSlugs = null; renderBlackFridayTab();" class="text-[10px] text-sky-400 hover:underline ml-1">Exibir Todos</button>
    `;
  }

  // Multi-year summary (configurable/hidden by default to avoid clutter)
  const sumEl = document.getElementById('bf-multiyear-summary');
  if (sumEl) {
    if (!STATE.bfShowSummary) sumEl.classList.add('hidden');
    else sumEl.classList.remove('hidden');
  }
  const firstDates = stats.map(s => s.firstDate).filter(Boolean).sort();
  const postLowerCount = stats.filter(s => s.years[curYear - 1] && s.years[curYear - 1].postLower).length;
  const withPost = stats.filter(s => s.years[curYear - 1] && s.years[curYear - 1].postLower != null).length;
  const inflated = stats.filter(s => s.preBfInflationPct != null && s.preBfInflationPct > 6);
  const yoys = stats.map(s => s.yoyPct).filter(v => v != null);
  const bestValue = [...stats].sort((a, b) => (a.brlPerContextualPerf || a.brlPerPerf) - (b.brlPerContextualPerf || b.brlPerPerf))[0];
  document.getElementById('bf-multiyear-summary').innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
      <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[10px] font-mono uppercase text-slate-400 block">Desconto mediano BF ${curYear - 1}</span>
        <span class="text-xl font-mono font-extrabold text-amber-300">${Math.round(familyMedianDisc * 100)}%</span>
        <span class="block text-[10px] text-slate-500">mín. de Nov vs média Set–Out (${discs.length} modelos)</span>
      </div>
      <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[10px] font-mono uppercase text-slate-400 block">Ficou mais barato DEPOIS da BF?</span>
        <span class="text-xl font-mono font-extrabold ${postLowerCount > withPost / 2 ? 'text-sky-300' : 'text-emerald-300'}">${postLowerCount}/${withPost}</span>
        <span class="block text-[10px] text-slate-500">modelos com preço menor entre Dez–Mar</span>
      </div>
      <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[10px] font-mono uppercase text-slate-400 block">Variação em 12 meses (mediana)</span>
        <span class="text-xl font-mono font-extrabold ${(median(yoys) || 0) > 0 ? 'text-rose-300' : 'text-emerald-300'}">${yoys.length ? ((median(yoys) > 0 ? '+' : '') + Math.round(median(yoys)) + '%') : '--'}</span>
        <span class="block text-[10px] text-slate-500">hoje vs mesma época de ${curYear - 1}</span>
      </div>
      <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <span class="text-[10px] font-mono uppercase text-slate-400 block">Alerta "metade do dobro"</span>
        <span class="text-xl font-mono font-extrabold ${inflated.length ? 'text-rose-300' : 'text-emerald-300'}">${inflated.length}</span>
        <span class="block text-[10px] text-slate-500 truncate" title="${inflated.map(s => s.item.name).join(', ')}">${inflated.length ? 'subiram >6% desde Set: ' + inflated.map(s => s.item.name).join(', ') : 'nenhum modelo inflado pré-BF'}</span>
      </div>
      <div class="p-3 rounded-xl bg-slate-900/80 border border-emerald-500/30">
        <span class="text-[10px] font-mono uppercase text-slate-400 block">Melhor custo por desempenho hoje</span>
        <span class="text-sm font-extrabold text-emerald-300">${bestValue ? bestValue.item.name : '--'}</span>
        <span class="block text-[10px] text-slate-500">${bestValue ? fmtBRLShort(bestValue.brlPerContextualPerf || bestValue.brlPerPerf) + ' por 1000 pts' : ''}</span>
      </div>
    </div>
    <p class="text-[10px] text-slate-500 mt-2">📅 Histórico disponível na Database: desde ${firstDates[0] || '--'} (≈ ${firstDates[0] ? Math.round((new Date(bfToday()) - new Date(firstDates[0])) / 86400000) : 0} dias).</p>`;

  // Target item selector
  const sel = document.getElementById('bf-target-item');
  const prevVal = sel.value;
  sel.innerHTML = stats.map(s => `<option value="${s.item.slug}">${s.item.name} — hoje ${fmtBRLShort(s.current)}</option>`).join('');
  if (!famChanged && stats.some(s => s.item.slug === prevVal)) sel.value = prevVal;
  else {
    const def = stats.find(s => ['rtx-5060', 'rtx-5070', 'rx-9060-xt-16gb', 'ryzen-5-7600', 'ryzen-7-7800x3d'].includes(s.item.slug)) || stats[0];
    if (def) sel.value = def.item.slug;
    onBFTargetItemChange(true);
  }

  // Table
  const yPrev = curYear - 1;
  document.getElementById('bf-table-body').innerHTML = stats.map(s => {
    const py = s.years[yPrev] || {};
    const r = s.range;
    let diag, diagColor;
    // 1. Check EOL Scarcity / Severe Price Spike FIRST (Argon Drop-in)
    if (s.yoyPct != null && s.yoyPct > 15 && s.effectiveCurrent > s.allMin * 1.25) {
      diag = `Encarecendo (+${Math.round(s.yoyPct)}% a/a) — estoque saindo?`;
      diagColor = 'amber';
    }
    // 2. Check Pre-BF Inflation SECOND
    else if (s.preBfInflationPct != null && s.preBfInflationPct > 6 && s.effectiveCurrent > r.high) {
      diag = `Inflado +${Math.round(s.preBfInflationPct)}% vs Pré-BF`;
      diagColor = 'rose';
    }
    // 3. Declare "Já em preço de BF" if inside the expected promo range
    else if (s.effectiveCurrent <= r.high) {
      diag = s.effectiveCurrent <= r.low ? 'Pechincha / Abaixo do Piso BF' : 'Já em preço de BF';
      diagColor = 'emerald';
    }
    else if (py.postLower) {
      diag = 'Caiu mais depois da BF passada';
      diagColor = 'sky';
    } else {
      diag = `Aguarde cair ~${fmtBRLShort(s.effectiveCurrent - r.high)}`;
      diagColor = 'sky';
    }
    return `
      <tr class="hover:bg-slate-800/50 cursor-pointer" onclick="document.getElementById('bf-target-item').value='${s.item.slug}'; onBFTargetItemChange();">
        <td class="py-2.5 px-3">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-white">${s.item.name}</span>
            ${s.item.vram_gb ? `<span class="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-mono">${s.item.vram_gb} GB</span>` : ''}
            ${s.item.coupon ? `<button onclick="event.stopPropagation(); typeof copyCouponAndOpen === 'function' ? copyCouponAndOpen('${s.item.coupon}', '${s.item.offer_url}') : navigator.clipboard.writeText('${s.item.coupon}')" class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono hover:bg-amber-500/40 transition cursor-pointer" title="Copiar cupom">🎟️ ${s.item.coupon}</button>` : ''}
          </div>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5">${s.kind === 'gpu' ? `${s.item.vram_gb}GB • score ${Math.round(s.perf)}` : `índice jogo ${getCpuGamingIndex(s.item)}`} • ${fmtBRLShort(s.brlPerContextualPerf || s.brlPerPerf)}/1000 pts</div>
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-bold text-white">${fmtBRLShort(s.current)}</td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-300">${py.preAvg ? fmtBRLShort(py.preAvg) : '<span class="text-slate-600">sem dado</span>'}</td>
        <td class="py-2.5 px-3 text-right font-mono text-amber-300">${py.bfMin ? fmtBRLShort(py.bfMin) : '<span class="text-slate-600">—</span>'}</td>
        <td class="py-2.5 px-3 text-right font-mono text-emerald-300">${fmtBRLShort(s.allMin)}</td>
        <td class="py-2.5 px-3 text-center font-mono">${py.discount != null ? `<span class="text-amber-300 font-bold">−${Math.round(py.discount * 100)}%</span>` : `<span class="text-slate-500" title="Produto sem BF anterior — usa mediana da família">~${Math.round(BF_CACHE.familyMedianDisc * 100)}%*</span>`}</td>
        <td class="py-2.5 px-3 text-right font-mono"><span class="text-emerald-300 font-bold">${fmtBRLShort(r.low)}</span> – <span class="text-sky-300">${fmtBRLShort(r.high)}</span></td>
        <td class="py-2.5 px-3 text-center"><span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-${diagColor}-500/15 text-${diagColor}-300 border border-${diagColor}-500/30">${diag}</span></td>
      </tr>`;
  }).join('');

  renderBFChart(stats, yPrev);
}

function renderBFChart(stats, yPrev) {
  const ctx = document.getElementById('chart-bf-generations').getContext('2d');
  if (chartBF) chartBF.destroy();
  const mode = (document.getElementById('bf-chart-mode') || {}).value || 'index';
  const horizon = (document.getElementById('bf-chart-horizon') || {}).value || 'all';

  // Filter stats based on visible model chips
  const chartStats = stats.filter(s => !STATE.bfVisibleSlugs || STATE.bfVisibleSlugs.has(s.item.slug));

  // Weekly sampling keeps the chart readable over ~600 days
  const dateSet = new Set();
  chartStats.forEach(s => s.hist.forEach(h => dateSet.add(h.date)));
  let allDates = [...dateSet].sort();

  if (horizon === '180d' && allDates.length > 0) {
    const latestDate = new Date(allDates[allDates.length - 1]);
    const cutoff = new Date(latestDate);
    cutoff.setDate(cutoff.getDate() - 180);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    allDates = allDates.filter(d => d >= cutoffStr);
  } else if (horizon === 'bf_window') {
    allDates = allDates.filter(d => {
      const m = d.slice(5, 7);
      return m === '11' || m === '12';
    });
  }

  const dates = allDates.filter((d, i) => i % 3 === 0 || i === allDates.length - 1);

  const datasets = chartStats.filter(s => s.hist.length).map((s, i) => {
    const map = Object.fromEntries(s.hist.map(h => [h.date, h.price]));
    const ref = (s.years[yPrev] && s.years[yPrev].preAvg) || s.recentAvg || s.current;
    let last = null;
    const data = dates.map(d => {
      const known = allDates.filter(x => x <= d).reverse().find(x => map[x] != null);
      if (known && known >= s.hist[0].date) last = map[known];
      if (d < s.hist[0].date) return null;
      if (last == null) return null;
      return mode === 'index' ? +(last / ref * 100).toFixed(1) : last;
    });
    return { label: s.item.name, data, borderColor: BF_COLORS[i % BF_COLORS.length], borderWidth: 2, pointRadius: 0, tension: 0.2, spanGaps: true };
  });

  // Shade Black Friday windows (Nov 1 – Dec 2)
  const bfShade = {
    id: 'bfShade',
    beforeDatasetsDraw(chart) {
      const { ctx: c, chartArea, scales: { x } } = chart;
      if (!chartArea) return;
      const years = [...new Set(dates.map(d => d.slice(0, 4)))];
      c.save();
      years.forEach(y => {
        const i0 = dates.findIndex(d => d >= `${y}-11-01`);
        let i1 = dates.findIndex(d => d > `${y}-12-02`);
        if (i0 === -1) return;
        if (i1 === -1) i1 = dates.length - 1;
        const x0 = x.getPixelForValue(i0), x1 = x.getPixelForValue(i1);
        c.fillStyle = 'rgba(245, 158, 11, 0.10)';
        c.fillRect(x0, chartArea.top, Math.max(2, x1 - x0), chartArea.bottom - chartArea.top);
        c.fillStyle = 'rgba(245, 158, 11, 0.8)';
        c.font = '10px JetBrains Mono, monospace';
        c.fillText(`BF ${y}`, x0 + 3, chartArea.top + 11);
      });
      c.restore();
    }
  };

  chartBF = new Chart(ctx, {
    type: 'line',
    data: { labels: dates.map(d => d.slice(2).replace(/-/g, '/')), datasets },
    plugins: [bfShade],
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${mode === 'index' ? c.parsed.y + '%' : fmtBRL(c.parsed.y)}` } }
      },
      scales: {
        x: { ticks: { color: '#64748b', maxTicksLimit: 12 }, grid: { color: 'rgba(51,65,85,0.25)' } },
        y: { ticks: { color: '#94a3b8', callback: v => mode === 'index' ? v + '%' : fmtBRLShort(v) }, grid: { color: 'rgba(51,65,85,0.3)' } }
      }
    }
  });
}

function renderBFTargetChart(st, uMin, uMax, testPrice) {
  const canvas = document.getElementById('chart-bf-target-history');
  if (!canvas || !st) return;

  const titleEl = document.getElementById('bf-target-chart-title');
  if (titleEl) titleEl.textContent = `${st.item.name} — Curva Diária`;
  const subEl = document.getElementById('bf-target-chart-subtitle');
  if (subEl) subEl.textContent = `Piso histórico: ${fmtBRLShort(st.allMin)} • Teto definido: ${fmtBRLShort(uMax)}`;
  const badgeMin = document.getElementById('bf-target-badge-min');
  if (badgeMin) badgeMin.textContent = `Mín: ${fmtBRLShort(st.allMin)}`;
  const badgeToday = document.getElementById('bf-target-badge-today');
  if (badgeToday) badgeToday.textContent = `Hoje: ${fmtBRLShort(st.current)}`;

  const gapEl = document.getElementById('bf-target-stat-gap');
  if (gapEl) {
    if (st.current <= uMax) {
      gapEl.innerHTML = `<span class="text-emerald-400 font-bold">✅ Já abaixo do seu teto (economiza ${fmtBRLShort(uMax - st.current)})</span>`;
    } else {
      gapEl.innerHTML = `<span class="text-amber-400">Faltam ${fmtBRLShort(st.current - uMax)} para o seu teto</span>`;
    }
  }

  const ctx = canvas.getContext('2d');
  if (chartBFTarget) chartBFTarget.destroy();

  if (!st.hist || !st.hist.length) return;

  const step = Math.max(1, Math.floor(st.hist.length / 50));
  const sampled = st.hist.filter((_, i) => i % step === 0 || i === st.hist.length - 1);
  const labels = sampled.map(h => h.date.slice(2).replace(/-/g, '/'));
  const prices = sampled.map(h => h.price);

  const minLine = sampled.map(() => uMin);
  const maxLine = sampled.map(() => uMax);

  const currSym = STATE.market?.monetary?.currency_symbol || 'R$';
  const datasets = [
    {
      label: `Preço Real (${currSym})`,
      data: prices,
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.08)',
      borderWidth: 2.5,
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.2,
      fill: true
    },
    {
      label: `Meta Mín (${fmtBRLShort(uMin)})`,
      data: minLine,
      borderColor: '#10b981',
      borderWidth: 1.5,
      borderDash: [5, 4],
      pointRadius: 0,
      fill: false
    },
    {
      label: `Teto Aceitável (${fmtBRLShort(uMax)})`,
      data: maxLine,
      borderColor: '#38bdf8',
      borderWidth: 1.5,
      borderDash: [5, 4],
      pointRadius: 0,
      fill: false
    }
  ];

  if (testPrice && testPrice > 0) {
    datasets.push({
      label: `Cupom Teste (${fmtBRLShort(testPrice)})`,
      data: sampled.map(() => testPrice),
      borderColor: '#a855f7',
      borderWidth: 1.5,
      borderDash: [3, 3],
      pointRadius: 0,
      fill: false
    });
  }

  chartBFTarget = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${fmtBRL(c.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } },
          grid: { color: 'rgba(51, 65, 85, 0.2)' }
        },
        y: {
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            callback: (v) => fmtBRLShort(v)
          },
          grid: { color: 'rgba(51, 65, 85, 0.25)' }
        }
      }
    }
  });
}

function onBFTargetItemChange(silent) {
  const slug = document.getElementById('bf-target-item').value;
  const st = BF_CACHE.stats.find(s => s.item.slug === slug);
  if (!st) return;
  if (!STATE.bfRanges) STATE.bfRanges = {};
  const saved = STATE.bfRanges[slug];
  const uMin = saved ? saved.min : st.range.low;
  const uMax = saved ? saved.max : st.range.high;
  document.getElementById('bf-input-min').value = uMin;
  document.getElementById('bf-input-max').value = uMax;
  document.getElementById('bf-input-test-price').value = Math.round(st.current);
  const couponInput = document.getElementById('bf-input-coupon');
  if (couponInput) couponInput.value = '';

  // Render Target Info Pill (VRAM badge, RAM, Arch, Today's Price)
  const pillEl = document.getElementById('bf-target-info-pill');
  if (pillEl) {
    if (st.kind === 'gpu') {
      const g = st.item;
      pillEl.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-sky-300 font-mono text-[11px] font-bold border border-sky-500/30">
          <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
          ${g.vram_gb} GB ${g.memory_type || 'GDDR6'} (${g.bandwidth_gbs || 288} GB/s)
        </span>
        <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">${g.arch || 'GPU'}</span>
        <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] font-mono font-bold">Hoje: ${fmtBRL(st.current)}</span>
      `;
    } else {
      pillEl.innerHTML = `
        <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">${st.item.socket || 'Processador'}</span>
        <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] font-mono font-bold">Hoje: ${fmtBRL(st.current)}</span>
      `;
    }
  }

  // Check if Promo Radar has an active coupon / flash deal for this target item
  const ctnActive = document.getElementById('bf-active-coupons-container');
  if (ctnActive) {
    const allMatchingDeals = (PROMO_STATE.lastData && Array.isArray(PROMO_STATE.lastData.matched_deals)) 
      ? PROMO_STATE.lastData.matched_deals.filter(d => d.matched_slug === slug) 
      : [];
    const activeDeals = allMatchingDeals.filter(d => {
      const pId = d.post_id || '';
      const pIdLower = pId.toLowerCase();
      const buyUrl = d.buy_url || '';
      const dealsMap = (PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.deals) || {};
      const dStat = dealsMap[pId] || dealsMap[pIdLower] || (buyUrl ? dealsMap[buyUrl] : null);
      const cCode = (d.coupon_code || '').trim().toUpperCase();
      const couponsMap = (PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.coupons) || {};
      const cStat = cCode ? couponsMap[cCode] : null;
      if (d.is_expired || (dStat && (dStat.status === 'expired' || dStat.status === 'out_of_stock'))) return false;
      if (d.is_coupon_expired || (cStat && cStat.status === 'expired')) return false;
      return true;
    });
    const best = activeDeals.length > 0 ? activeDeals[0] : null;

    if (best) {
      const rawCode = (best.coupon_code || '').trim();
      const rawInfo = (best.coupon_info || '').trim();
      let hasRealCoupon = false;
      let cleanCoup = '';

      if (rawCode && /[A-Z]/i.test(rawCode) && !/^(HTTPS?|WWW|COM|BR|OFERTA|PROMO|LINK|NULL|UNDEFINED|OFERTAFLASH)$/i.test(rawCode)) {
        cleanCoup = rawCode.replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase();
        if (cleanCoup.length >= 3) hasRealCoupon = true;
      } else if (rawInfo && !/^(oferta|link|site|preço|preco|cash|sem|pix)/i.test(rawInfo)) {
        const mOff = rawInfo.match(/(?:R\$|\$|€|£)?\s*([0-9]{2,4})\s*OFF/i);
        if (mOff) {
          cleanCoup = `R$ ${mOff[1]} OFF`;
          hasRealCoupon = true;
        } else {
          const m = rawInfo.match(/\b([A-Z0-9_\-]{4,22})\b/);
          if (m && /[A-Z]/i.test(m[1]) && !/^(HTTPS?|WWW|COM|BR|OFERTA|PROMO|LINK|NULL|OFERTAFLASH|RESGATE|CUPOM|DESCONTO)$/i.test(m[1])) {
            cleanCoup = m[1].toUpperCase();
            hasRealCoupon = true;
          }
        }
      }

      if (cleanCoup && /^[0-9]+$/.test(cleanCoup)) {
        cleanCoup = `R$ ${cleanCoup} OFF`;
        hasRealCoupon = true;
      }

      const pId = best.post_id || '';
      const dealsMap = (PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.deals) || {};
      const dealStatus = dealsMap[pId] || dealsMap[pId.toLowerCase()] || (best.buy_url ? dealsMap[best.buy_url] : null);
      const couponStatus = (cleanCoup && PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.coupons && PROMO_STATE.couponStatus.coupons[cleanCoup]) || null;
      const isExpired = best.is_expired || (dealStatus && (dealStatus.status === 'expired' || dealStatus.status === 'out_of_stock')) || (couponStatus && couponStatus.status === 'expired');
      const isWorking = !isExpired && ((dealStatus && dealStatus.status === 'active') || (couponStatus && couponStatus.status === 'active'));
      const buyUrl = best.buy_url || best.post_url || '#';

      let freshBadge = '';
      if (isExpired) {
        freshBadge = `<span class="px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-300 border border-rose-500/50 font-mono text-[10px] font-bold" title="${(dealStatus && dealStatus.reason) || 'Oferta encerrada'}">❌ OFERTA ENCERRADA NA LOJA</span>`;
      } else if (isWorking) {
        freshBadge = '<span class="px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-500/50 font-mono text-[10px] font-bold">✅ CONFIRMADO ATIVO NA LOJA</span>';
      } else if (best.age_hours <= 2) {
        freshBadge = `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-[10px] font-bold">🟢 Fresco (${best.age_hours}h atrás)</span>`;
      } else if (best.age_hours <= 8) {
        freshBadge = `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[10px] font-bold">🟡 Moderado (${best.age_hours}h atrás)</span>`;
      } else {
        freshBadge = `<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono text-[10px] font-bold">🔴 Risco de Expirado (${best.age_hours}h atrás)</span>`;
      }

      let titleHtml = '';
      if (hasRealCoupon) {
        titleHtml = `
          <span class="font-mono text-amber-300 font-bold">🎟️ Cupom Detectado:</span>
          <span class="text-white font-mono font-bold ${isExpired ? 'line-through text-slate-400' : ''}">${cleanCoup}</span>
          <span class="text-emerald-400 font-mono font-bold">(${fmtBRL(best.price_brl)})</span>
        `;
      } else {
        titleHtml = `
          <span class="font-mono text-emerald-400 font-bold">⚡ Oferta Direta (Sem Cupom):</span>
          <span class="text-white font-mono font-bold">${fmtBRL(best.price_brl)}</span>
          <span class="text-slate-400 font-mono text-[10px]">(Preço à vista no link)</span>
        `;
      }

      ctnActive.className = `p-3 rounded-lg ${isExpired ? 'bg-rose-950/30 border border-rose-500/40' : 'bg-amber-500/10 border border-amber-500/30'} flex flex-col gap-2 text-xs`;
      ctnActive.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-1.5">
          <div class="flex items-center gap-1.5 flex-wrap">
            ${titleHtml}
            ${freshBadge}
          </div>
          <div class="flex items-center gap-1 flex-wrap">
            <button onclick="testDealCouponNow('${best.post_id}', '${buyUrl}', '${cleanCoup}', ${best.price_brl})" class="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 transition font-bold text-[11px] cursor-pointer flex items-center gap-1" title="Testa se o link e o cupom continuam ativos na loja automaticamente">
              <span>🧪 Testar</span>
            </button>
            ${hasRealCoupon ? `
              <button onclick="copyCouponAndOpen('${cleanCoup}', '${buyUrl}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-bold text-[11px] cursor-pointer" title="Copia o cupom e abre a loja">
                📋 Copiar Cupom
              </button>
            ` : ''}
            <a href="${buyUrl}" target="_blank" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-bold text-[11px] cursor-pointer flex items-center gap-1" title="Abrir link da oferta na loja">
              ↗ Abrir Loja
            </a>
            <button onclick="applyActiveCouponToBF(${best.price_brl}, '${escape(cleanCoup)}')" class="px-2 py-1 rounded bg-amber-400 text-slate-950 text-[11px] font-bold hover:bg-amber-300 transition cursor-pointer" title="Aplica este preço no simulador de Black Friday">
              ⚡ Simular Preço
            </button>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 font-mono">
          <span>Canal: @${best.channel_id} • há ${best.age_hours}h • Loja: ${best.store_name || 'E-commerce'} • Modelo: ${(best.title || '').slice(0, 55)}</span>
          <div class="flex items-center gap-1">
            <span class="text-slate-400 text-[10px]">Funcionou no carrinho?</span>
            <button onclick="setCouponUserStatus('${cleanCoup || best.post_id}', 'working')" class="px-1.5 py-0.5 rounded ${isWorking ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 hover:bg-emerald-500/30 text-emerald-300'} text-[10px] cursor-pointer" title="Marcar como confirmado ativo">👍 Sim</button>
            <button onclick="setCouponUserStatus('${cleanCoup || best.post_id}', 'expired')" class="px-1.5 py-0.5 rounded ${isExpired ? 'bg-rose-500 text-white font-bold' : 'bg-slate-800 hover:bg-rose-500/30 text-rose-300'} text-[10px] cursor-pointer" title="Marcar como expirado">👎 Expirou</button>
            ${(isWorking || isExpired) ? `<button onclick="setCouponUserStatus('${cleanCoup || best.post_id}', null)" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] cursor-pointer" title="Limpar avaliação">↺ Limpar</button>` : ''}
          </div>
        </div>
      `;
    } else {
      const latestExpired = allMatchingDeals.length > 0 ? allMatchingDeals[0] : null;
      if (latestExpired) {
        ctnActive.className = 'p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 flex flex-col gap-1 text-xs';
        ctnActive.innerHTML = `
          <div class="flex items-center justify-between gap-1.5 flex-wrap">
            <span class="font-mono text-rose-300 font-bold">❌ Nenhuma promoção ativa no momento</span>
            <span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono text-[10px]">Última oferta de ${fmtBRL(latestExpired.price_brl)} encerrada</span>
          </div>
          <div class="text-[11px] text-slate-400 font-mono">Preço mantido no catálogo oficial: ${fmtBRL(st.current)}. Simule cupons abaixo.</div>
        `;
      } else {
        ctnActive.className = 'hidden';
        ctnActive.innerHTML = '';
      }
    }
  }

  recalcBFCoupon(true);
}

// Global coupon user status tracking (saved in localStorage)
function getCouponUserStatus(couponCode) {
  if (!couponCode) return null;
  const clean = couponCode.toUpperCase().trim();
  try {
    const map = JSON.parse(localStorage.getItem('gpu_coupon_statuses') || '{}');
    return map[clean] || null;
  } catch (e) {
    return null;
  }
}

function setCouponUserStatus(couponCode, status) {
  if (!couponCode) return;
  const clean = couponCode.toUpperCase().trim();
  try {
    const map = JSON.parse(localStorage.getItem('gpu_coupon_statuses') || '{}');
    if (status === null) {
      delete map[clean];
    } else {
      map[clean] = { status: status, at: Date.now() };
    }
    localStorage.setItem('gpu_coupon_statuses', JSON.stringify(map));
  } catch (e) {}

  const label = status === 'working' ? '✓ Confirmado como FUNCIONANDO!' : (status === 'expired' ? '✗ Marcado como EXPIRADO.' : 'Avaliação redefinida.');
  if (typeof showDealToastNotification === 'function') {
    showDealToastNotification({
      title: `Cupom ${clean}`,
      head_text: `${label} Seu feedback afeta o simulador e os alertas locais.`,
      buy_url: '#'
    });
  }

  // Refresh current view
  const targetSel = document.getElementById('bf-target-item');
  if (targetSel && typeof onBFTargetChange === 'function') {
    onBFTargetChange();
  }
  if (typeof renderPromoRadarDrawer === 'function') {
    renderPromoRadarDrawer();
  }
}

function copyCouponAndOpen(couponCode, buyUrl) {
  if (!couponCode) return;
  const clean = couponCode.trim();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(clean).catch(() => {});
  }
  if (typeof showDealToastNotification === 'function') {
    showDealToastNotification({
      title: `📋 Cupom "${clean}" Copiado!`,
      head_text: `Código copiado para o seu Ctrl+V! Cole no campo de cupom no carrinho da loja para validar o desconto.`,
      buy_url: buyUrl || '#'
    });
  }
  if (buyUrl && buyUrl !== '#') {
    window.open(buyUrl, '_blank');
  }
}

function applyActiveCouponToBF(dealPrice, coup) {
  const inpPrice = document.getElementById('bf-input-test-price');
  const inpCoup = document.getElementById('bf-input-coupon');
  if (inpPrice) inpPrice.value = Math.round(dealPrice);
  const unescaped = unescape(coup || '').trim();
  if (inpCoup) {
    inpCoup.value = (unescaped && !/^(OFERTAFLASH|OFERTA FLASH|NULL|UNDEFINED)$/i.test(unescaped)) ? unescaped : '';
  }
  recalcBFCoupon();
}

function recalcBFCoupon(skipSave) {
  const slug = (document.getElementById('bf-target-item') || {}).value;
  const st = BF_CACHE.stats.find(s => s.item.slug === slug);
  if (!st) return;

  const basePrice = parseFloat(document.getElementById('bf-input-test-price').value) || st.current;
  const coupRaw = ((document.getElementById('bf-input-coupon') || {}).value || '').trim();
  const summaryEl = document.getElementById('bf-coupon-calc-summary');

  let discount = 0;
  let coupLabel = '';
  let cleanCoup = coupRaw.replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase();
  const userStatus = getCouponUserStatus(cleanCoup);
  const isMarkedExpired = userStatus && userStatus.status === 'expired';

  if (coupRaw && !/^(OFERTAFLASH|OFERTA FLASH)$/i.test(coupRaw)) {
    if (coupRaw.includes('%')) {
      const pct = parseFloat(coupRaw.replace(/[^0-9.]/g, '')) || 0;
      if (pct > 0 && pct <= 60) {
        discount = basePrice * (pct / 100);
        coupLabel = `${pct}% OFF (-${fmtBRL(discount)})`;
      }
    } else {
      const val = parseFloat(coupRaw.replace(/[^0-9.]/g, '')) || 0;
      if (val > 0 && val < basePrice * 0.70) {
        discount = val;
        coupLabel = `-${fmtBRL(discount)} OFF`;
      }
    }
  }

  const finalPrice = Math.max(50, Math.round(basePrice - discount));

  if (summaryEl) {
    if (discount > 0) {
      summaryEl.classList.remove('hidden');
      summaryEl.innerHTML = `
        <div class="flex items-center justify-between">
          <span><strong>Dedução Aplicada:</strong> ${fmtBRL(basePrice)} com cupom ${coupLabel} = 
          <span class="text-white font-black underline text-xs">${fmtBRL(finalPrice)}</span>!</span>
          ${isMarkedExpired ? '<span class="px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-300 font-bold text-[10px]">⚠️ MARCADO EXPIRADO</span>' : ''}
        </div>
        ${isMarkedExpired ? '<div class="text-rose-300 text-[10px] mt-1">⚠️ Você ou o sistema marcaram este cupom como EXPIRADO. A loja pode recusar o desconto no carrinho real.</div>' : ''}
      `;
    } else if (coupRaw && !/^(OFERTAFLASH|OFERTA FLASH)$/i.test(coupRaw)) {
      summaryEl.classList.remove('hidden');
      summaryEl.innerHTML = `
        <div class="flex items-center justify-between text-xs text-slate-300">
          <span>🎟️ Cupom <strong>${cleanCoup}</strong> inserido. O preço anunciado de <strong>${fmtBRL(basePrice)}</strong> já é o valor final com este cupom na loja.</span>
          ${isMarkedExpired ? '<span class="px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-300 font-bold text-[10px]">⚠️ MARCADO EXPIRADO</span>' : ''}
        </div>
      `;
    } else {
      summaryEl.classList.add('hidden');
      summaryEl.innerHTML = '';
    }
  }

  updateBFPromoEvaluator(skipSave, finalPrice);
}

function updateBFPromoEvaluator(skipSave, overrideTestPrice) {
  const slug = document.getElementById('bf-target-item').value;
  const st = BF_CACHE.stats.find(s => s.item.slug === slug);
  if (!st) return;
  const uMin = parseFloat(document.getElementById('bf-input-min').value) || st.range.low;
  const uMax = parseFloat(document.getElementById('bf-input-max').value) || st.range.high;
  const test = overrideTestPrice !== undefined ? overrideTestPrice : (parseFloat(document.getElementById('bf-input-test-price').value) || st.current);
  if (skipSave !== true) {
    STATE.bfRanges[slug] = { min: uMin, max: uMax };
    saveUserPrefs();
  }

  renderBFTargetChart(st, uMin, uMax, test);

  const r = st.range;
  let verdict, color;
  if (test <= Math.min(r.low, uMin)) { verdict = '🟢 COMPRE AGORA — abaixo da faixa esperada e do seu mínimo. Raro de ver.'; color = 'emerald'; }
  else if (test <= uMin) { verdict = '🟢 ÓTIMO — abaixo do seu preço esperado mínimo.'; color = 'emerald'; }
  else if (test <= r.mid) { verdict = '🔵 BOM — dentro da faixa típica de BF (metade mais barata).'; color = 'sky'; }
  else if (test <= uMax) { verdict = '🟡 ACEITÁVEL — dentro do seu teto, mas é possível achar mais barato na BF.'; color = 'amber'; }
  else { verdict = '🔴 ESPERE — acima do seu teto. Não é promoção real para este produto.'; color = 'rose'; }

  const lo = Math.min(st.allMin, uMin, r.low, test) * 0.95;
  const hi = Math.max(st.current, uMax, r.high, test, st.recentAvg) * 1.05;
  const pos = v => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const py = st.years[parseInt(bfToday().slice(0, 4)) - 1] || {};

  document.getElementById('bf-test-verdict').innerHTML = `
    <div class="p-2.5 rounded-lg bg-${color}-950/50 border border-${color}-500/50 text-${color}-100 font-semibold">${verdict}</div>
    <div class="relative h-12 mt-3">
      <div class="absolute top-4 left-0 right-0 h-2 rounded-full bg-slate-800"></div>
      <div class="absolute top-4 h-2 rounded-full bg-emerald-500/50" style="left:${pos(r.low)}%; width:${Math.max(1, pos(r.high) - pos(r.low))}%" title="Faixa esperada BF"></div>
      <div class="absolute top-3 h-4 border-x-2 border-sky-400" style="left:${pos(uMin)}%; width:${Math.max(0.5, pos(uMax) - pos(uMin))}%" title="Sua faixa"></div>
      <div class="absolute top-0 -translate-x-1/2 text-[9px] font-mono text-white" style="left:${pos(test)}%">▼ teste</div>
      <div class="absolute top-7 -translate-x-1/2 text-[9px] font-mono text-emerald-400" style="left:${pos(st.allMin)}%">mín</div>
      <div class="absolute top-7 -translate-x-1/2 text-[9px] font-mono text-slate-400" style="left:${pos(st.current)}%">hoje</div>
    </div>
    <div class="grid grid-cols-2 gap-1.5 text-[11px] font-mono mt-1">
      <span class="text-slate-400">Faixa esperada BF:</span><span class="text-right text-emerald-300">${fmtBRLShort(r.low)} – ${fmtBRLShort(r.high)}</span>
      <span class="text-slate-400">Base (média pré-BF):</span><span class="text-right">${fmtBRLShort(r.base)}</span>
      <span class="text-slate-400">Desconto usado:</span><span class="text-right">${Math.round(r.disc * 100)}% ${r.ownData ? '(BF passada deste modelo)' : '(mediana da família)'}</span>
      <span class="text-slate-400">Piso BF passada:</span><span class="text-right text-amber-300">${py.bfMin ? fmtBRLShort(py.bfMin) : '—'}</span>
      <span class="text-slate-400">Menor preço histórico:</span><span class="text-right text-emerald-300">${fmtBRLShort(st.allMin)}</span>
      <span class="text-slate-400">Teste vs mínimo:</span><span class="text-right ${test <= st.allMin ? 'text-emerald-300' : 'text-slate-200'}">${test <= st.allMin ? 'NOVO MÍNIMO' : '+' + Math.round((test / st.allMin - 1) * 100) + '%'}</span>
    </div>
    <p class="text-[10px] text-slate-500 mt-1.5">Sua faixa (contorno azul) fica salva por produto. Barra verde = faixa estatística esperada.</p>`;
}

// ============================================================================
// 6. CLIENT-SIDE FLASH PROMO & COUPON RADAR (100% PROCESSED IN USER BROWSER)
// ============================================================================
const PROMO_CACHE_KEY = 'gpuAnalyzerPromoCache_v1';
function getPromoCacheKey() {
  const reg = (window.STATE?.market?.region_id || 'br').toLowerCase();
  return `gpuAnalyzerPromoCache_${reg}_v1`;
}

const CLIENT_PROMO_CHANNELS = [
  { id: 'ofertasadrenaline', name: 'Ofertas Adrenaline' },
  { id: 'peperaiohardware',  name: 'Peperaio Hardware' },
  { id: 'iskandarsouza',     name: 'Iskandar Souza' },
  { id: 'benchpromos',       name: 'BenchPromos' },
  { id: 'kabumofertas',      name: 'KaBuM Ofertas' },
  { id: 'nerdofertas',       name: 'Nerd Ofertas' },
  { id: 'ofertastechbr',     name: 'Ofertas Tech BR' }
];

const CLIENT_PROMO_QUERIES = ['', 'RTX', '5060', '5070', '4060', '7600', 'RX ', 'Ryzen', 'DDR4', 'DDR5', 'expirou', 'acabou', 'esgotou'];

function getClientPromoChannels() {
  if (window.STATE?.market?.promotion_sources?.channels?.length) {
    return window.STATE.market.promotion_sources.channels;
  }
  return CLIENT_PROMO_CHANNELS;
}

function getClientPromoQueries() {
  if (window.STATE?.market?.promotion_sources?.search_keywords?.length) {
    return window.STATE.market.promotion_sources.search_keywords;
  }
  return CLIENT_PROMO_QUERIES;
}

const CLIENT_EXCLUDE_SYSTEM_RE = /\b(notebook|laptop|macbook|computador\s*completo|pc\s*completo|all\s*in\s*one|console|playstation|ps5|xbox|monitor|tv\s|smart\s*tv|cadeira|teclado|mouse|headset|smartphone|celular|iphone|galaxy\s*s)\b/i;

const CLIENT_GPU_RULES = [
  ['rtx-5090',         /\b(?:rtx|geforce)?\s*5090\b/i],
  ['rtx-5080',         /\b(?:rtx|geforce)?\s*5080\b/i],
  ['rtx-5070-ti',      /\b(?:rtx|geforce)?\s*5070\s*ti\b/i],
  ['rtx-5070',         /\b(?:rtx|geforce)?\s*5070(?!\s*ti)\b/i],
  ['rtx-5060-ti-16gb', /\b(?:rtx|geforce)?\s*5060\s*ti\b.*?\b16\s*gb\b|\b16\s*gb\b.*?\b(?:rtx|geforce)?\s*5060\s*ti\b/i],
  ['rtx-5060-ti-8gb',  /\b(?:rtx|geforce)?\s*5060\s*ti\b(?!.*?\b16\s*gb\b)/i],
  ['rtx-5060',         /\b(?:rtx|geforce)?\s*5060(?!\s*ti)\b/i],
  ['rtx-5050',         /\b(?:rtx|geforce)?\s*5050\b/i],
  ['rtx-4080-super',   /\b(?:rtx|geforce)?\s*4080\s*super\b/i],
  ['rtx-4080',         /\b(?:rtx|geforce)?\s*4080(?!\s*super)\b/i],
  ['rtx-4070-ti',      /\b(?:rtx|geforce)?\s*4070\s*ti\b/i],
  ['rtx-4070',         /\b(?:rtx|geforce)?\s*4070(?!\s*ti)\b/i],
  ['rtx-4060-ti-8gb',  /\b(?:rtx|geforce)?\s*4060\s*ti\b/i],
  ['rtx-4060',         /\b(?:rtx|geforce)?\s*4060(?!\s*ti)\b/i],
  ['rtx-3080-ti',      /\brtx\s*3080\s*ti\b/i],
  ['rtx-3080-12gb',    /\brtx\s*3080\b.*?\b12\s*gb\b/i],
  ['rtx-3080-10gb',    /\brtx\s*3080(?!\s*ti)\b/i],
  ['rtx-3070-ti',      /\brtx\s*3070\s*ti\b/i],
  ['rtx-3070',         /\brtx\s*3070(?!\s*ti)\b/i],
  ['rtx-3060-ti',      /\brtx\s*3060\s*ti\b/i],
  ['rtx-3060-12gb',    /\brtx\s*3060(?!\s*ti)\b.*?\b12\s*gb\b|\b12\s*gb\b.*?\brtx\s*3060(?!\s*ti)\b/i],
  ['rtx-3060-8gb',     /\brtx\s*3060(?!\s*ti)\b.*?\b8\s*gb\b/i],
  ['rtx-3060-12gb',    /\brtx\s*3060(?!\s*ti)\b/i],
  ['rtx-3050-8gb',     /\brtx\s*3050\b.*?\b8\s*gb\b/i],
  ['rtx-3050-6gb',     /\brtx\s*3050\b/i],
  ['rtx-2060-super',   /\brtx\s*2060\s*super\b/i],
  ['rtx-2060-12gb',    /\brtx\s*2060\b.*?\b12\s*gb\b/i],
  ['rtx-2060-6gb',     /\brtx\s*2060(?!\s*super)\b/i],
  ['rx-9070-xt',       /\brx\s*9070\s*xt\b/i],
  ['rx-9070-gre',      /\brx\s*9070\s*gre\b/i],
  ['rx-9070',          /\brx\s*9070(?!\s*xt|\s*gre)\b/i],
  ['rx-9060-xt-16gb',  /\brx\s*9060\s*xt\b.*?\b16\s*gb\b|\b16\s*gb\b.*?\brx\s*9060\s*xt\b/i],
  ['rx-9060-xt-8gb',   /\brx\s*9060\s*xt\b/i],
  ['rx-7900-xtx',      /\brx\s*7900\s*xtx\b/i],
  ['rx-7900-gre',      /\brx\s*7900\s*gre\b/i],
  ['rx-7800-xt',       /\brx\s*7800\s*xt\b/i],
  ['rx-7700-xt',       /\brx\s*7700\s*xt\b/i],
  ['rx-7600-xt',       /\brx\s*7600\s*xt\b/i],
  ['rx-7650-gre',      /\brx\s*7650\s*gre\b/i],
  ['rx-7600',          /\brx\s*7600(?!\s*xt)\b/i],
  ['rx-6750-xt',       /\brx\s*6750\s*xt\b/i],
  ['rx-6700-xt',       /\brx\s*6700\s*xt\b/i],
  ['rx-6600-xt',       /\brx\s*6600\s*xt\b/i],
  ['rx-6600',          /\brx\s*6600(?!\s*xt)\b/i],
  ['arc-b580',         /\barc\s*b580\b/i],
  ['arc-b570',         /\barc\s*b570\b/i]
];

const CLIENT_CPU_RULES = [
  ['ryzen-7-9800x3d',  /\bryzen\s*7\s*9800x3d\b|\b9800x3d\b/i],
  ['ryzen-7-7800x3d',  /\bryzen\s*7\s*7800x3d\b|\b7800x3d\b/i],
  ['ryzen-7-5700x3d',  /\bryzen\s*7\s*5700x3d\b|\b5700x3d\b/i],
  ['ryzen-5-5500x3d',  /\b5500x3d\b/i],
  ['ryzen-7-9700x',    /\bryzen\s*7\s*9700x\b|\b9700x\b/i],
  ['ryzen-5-9600x',    /\bryzen\s*5\s*9600x\b|\b9600x\b/i],
  ['ryzen-7-7700x',    /\bryzen\s*7\s*7700x\b/i],
  ['ryzen-7-7700',     /\bryzen\s*7\s*7700(?!\s*x)\b/i],
  ['ryzen-5-7600x',    /\bryzen\s*5\s*7600x\b/i],
  ['ryzen-5-7600',     /\bryzen\s*5\s*7600(?!\s*x)\b/i],
  ['ryzen-7-5700x',    /\bryzen\s*7\s*5700x(?!3d)\b/i],
  ['ryzen-7-5700',     /\bryzen\s*7\s*5700(?!\s*x|\s*g)\b/i],
  ['ryzen-5-5600x',    /\bryzen\s*5\s*5600x(?!t)\b/i],
  ['ryzen-5-5600gt',   /\bryzen\s*5\s*5600gt\b/i],
  ['ryzen-5-5600g',    /\bryzen\s*5\s*5600g(?!t|e)\b/i],
  ['ryzen-5-5600',     /\bryzen\s*5\s*5600(?!\s*x|\s*g)\b/i],
  ['ryzen-5-5500',     /\bryzen\s*5\s*5500(?!x3d)\b/i],
  ['core-i5-14600kf',  /\bi5[\s-]*14600kf\b/i],
  ['core-i5-14400f',   /\bi5[\s-]*14400f\b/i],
  ['core-i5-13400f',   /\bi5[\s-]*13400f\b/i],
  ['core-i5-12400f',   /\bi5[\s-]*12400f\b/i]
];

const CLIENT_RAM_RULES = [
  ['ddr5-32gb-6000',   /\bddr5\b.*?\b(32\s*gb|2\s*x\s*16\s*gb)\b.*?\b6000\b|\b(32\s*gb|2\s*x\s*16\s*gb)\b.*?\bddr5\b.*?\b6000\b/i],
  ['ddr5-32gb-5600',   /\bddr5\b.*?\b(32\s*gb|2\s*x\s*16\s*gb)\b(?!.*?\b6000\b)/i],
  ['ddr5-16gb-6000',   /\bddr5\b.*?\b(16\s*gb|2\s*x\s*8\s*gb)\b.*?\b6000\b|\b(16\s*gb|2\s*x\s*8\s*gb)\b.*?\bddr5\b.*?\b6000\b/i],
  ['ddr5-16gb-5600',   /\bddr5\b.*?\b(16\s*gb|2\s*x\s*8\s*gb)\b(?!.*?\b6000\b)/i],
  ['ddr4-32gb-3200',   /\bddr4\b.*?\b(32\s*gb|2\s*x\s*16\s*gb)\b/i],
  ['ddr4-16gb-3200',   /\bddr4\b.*?\b(16\s*gb|2\s*x\s*8\s*gb)\b/i],
  ['ddr4-8gb-3200',    /\bddr4\b.*?\b8\s*gb\b(?!\s*x\s*2)/i]
];

function parsePriceClient(rawStr) {
  let s = (rawStr || '').trim();
  const decSep = window.STATE?.market?.monetary?.decimal_separator || ',';
  if (decSep === ',') {
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    else if (s.includes('.')) {
      const parts = s.split('.');
      if (parts[parts.length - 1].length === 3) s = s.replace(/\./g, '');
    }
  } else {
    // US / UK style: 1,299.99
    s = s.replace(/,/g, '');
  }
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}
const parseBRLClient = parsePriceClient;

function extractPriceAndCouponClient(lines) {
  const fullText = lines.join('\n');
  let couponCode = null;
  let couponInfo = null;
  let detectedDiscountBRL = 0;
  let detectedDiscountPct = 0;
  const candidates = [];

  const mCode = fullText.match(/(?:cupom|c[oó]digo|promo code|coupon)\s*(?:de\s*desconto)?\s*[:\-]?\s*\b([A-Z0-9]{4,18})\b/i);
  if (mCode) {
    const w = mCode[1].toUpperCase();
    const stop = new Set(['PARA', 'ESTA', 'ESSA', 'HOJE', 'AQUI', 'MAIS', 'PELO', 'SITE', 'LOJA', 'SHOPEE', 'KABUM', 'MAGALU', 'MERCADO', 'AMAZON', 'NEWEGG', 'BESTBUY', 'HTTPS', 'HTTP', 'WWW', 'COM', 'BR']);
    if (!stop.has(w)) couponCode = w;
  }

  // Detect explicit discount amounts or percentages
  for (const line of lines) {
    const mDisc = line.match(/(?:cupom\s*de|desconto\s*de|menos|abatimento|off\s*de|save)\s*R?\$?\s*([0-9]{2,4})/i) ||
                  line.match(/(?:R\$|\$|€|£)\s*([0-9]{2,4})\s*(?:off|de\s*desconto|discount)/i);
    if (mDisc) {
      const dVal = parseFloat(mDisc[1]);
      if (dVal >= 10 && dVal <= 3000) detectedDiscountBRL = Math.max(detectedDiscountBRL, dVal);
    }
    const mPct = line.match(/\b([1-9][0-9]?)\s*%\s*(?:off|de\s*desconto|discount)/i);
    if (mPct) {
      const pVal = parseFloat(mPct[1]);
      if (pVal >= 3 && pVal <= 40) detectedDiscountPct = Math.max(detectedDiscountPct, pVal);
    }
  }

  const customPriceRegex = window.STATE?.market?.monetary?.price_regex;
  const priceRe = customPriceRegex
    ? new RegExp(customPriceRegex, 'gi')
    : /R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]{3,5}(?:,[0-9]{1,2})?)/gi;
  const minValidPrice = window.STATE?.market?.monetary?.min_valid_hardware_price || 80;
  const maxValidPrice = window.STATE?.market?.monetary?.max_valid_hardware_price || 45000;
  const cashKeywords = window.STATE?.market?.promotion_sources?.cash_intent_keywords || ['por r$', 'valor', '💵', 'pix', 'à vista', 'a vista', '🔥', '$', '€', '£', 'lowest', 'deal'];

  for (const line of lines) {
    const low = line.toLowerCase();
    if (!couponInfo && ['cupom', '🎟', '🏷', 'resgate', 'moedas', 'coupon', 'code:'].some(k => low.includes(k))) {
      const cleaned = line.replace(/https?:\/\/\S+/g, '').replace(/^[\s\-•🎟️🏷️💵🔥*]+|[\s\-•🎟️🏷️💵🔥*]+$/g, '');
      if (cleaned.length >= 4) couponInfo = cleaned;
    }
    let m;
    priceRe.lastIndex = 0;
    while ((m = priceRe.exec(line)) !== null) {
      const val = parsePriceClient(m[1]);
      if (val < minValidPrice || val > maxValidPrice) continue;
      const start = m.index;
      const end = start + m[0].length;
      const before = line.slice(Math.max(0, start - 22), start).toLowerCase();
      const after = line.slice(end, Math.min(line.length, end + 22)).toLowerCase();
      if (/\b(off|desconto|discount)\b/.test(after) || /\b(cupom\s*de|desconto\s*de|resgate|abatimento|save)\b/.test(before)) {
        if (!detectedDiscountBRL || val > detectedDiscountBRL) detectedDiscountBRL = Math.max(detectedDiscountBRL, val);
        continue;
      }
      if (/\d+\s*x\s*(?:de\s*)?$/.test(before)) continue;
      let prio = 1;
      if (cashKeywords.some(k => low.includes(k))) prio = 3;
      else if (low.includes('parcelado') || low.includes('12x') || low.includes('10x')) prio = 0;
      candidates.push([prio, val]);
    }
  }
  if (!candidates.length) return { price: null, rawPrice: null, discountApplied: 0, couponCode, couponInfo };
  const maxPrio = Math.max(...candidates.map(c => c[0]));
  const bestVals = candidates.filter(c => c[0] === maxPrio).map(c => c[1]);
  const basePrice = Math.min(...bestVals);

  // Double-Discount Guard: If post has final price indicators, do NOT subtract coupon a second time (Argon Item 12)
  const hasFinalPriceIndicator = lines.some(line =>
    /\b(por|sai\s*por|fica\s*por|pagando|preço|preco|valor|à\s*vista|a\s*vista|pix)\b/i.test(line)
  );

  let finalPrice = basePrice;
  let discountApplied = 0;
  if (!hasFinalPriceIndicator) {
    if (detectedDiscountBRL > 0 && detectedDiscountBRL < basePrice * 0.45) {
      finalPrice = basePrice - detectedDiscountBRL;
      discountApplied = detectedDiscountBRL;
    } else if (detectedDiscountPct > 0) {
      discountApplied = Math.round(basePrice * (detectedDiscountPct / 100));
      finalPrice = basePrice - discountApplied;
    }
  }

  return {
    price: Math.round(finalPrice * 100) / 100,
    rawPrice: Math.round(basePrice * 100) / 100,
    discountApplied,
    couponCode,
    couponInfo
  };
}

function matchCatalogItemClient(headText) {
  const hasComp = /\b(placa\s*de\s*v[íi]deo|gpu|rtx|geforce|radeon|ryzen|core\s*i[3579]|ddr[45]|mem[óo]ria\s*ram)\b/i.test(headText);
  if (!hasComp && CLIENT_EXCLUDE_SYSTEM_RE.test(headText)) return null;
  for (const [slug, re] of CLIENT_GPU_RULES) {
    if (re.test(headText)) {
      const gpu = (DB.gpus || []).find(g => g.slug === slug);
      if (gpu) return { kind: 'gpu', item: gpu };
    }
  }
  for (const [slug, re] of CLIENT_CPU_RULES) {
    if (re.test(headText)) {
      const cpu = (DB.cpus || []).find(c => c.slug === slug);
      if (cpu) return { kind: 'cpu', item: cpu };
    }
  }
  for (const [slug, re] of CLIENT_RAM_RULES) {
    if (re.test(headText)) {
      const ram = (DB.rams || []).find(r => r.slug === slug);
      if (ram) return { kind: 'ram', item: ram };
    }
  }
  return null;
}

// Parse raw Telegram HTML directly inside the user's browser using native DOMParser
function parseTelegramHTMLInBrowser(rawHtml, chId, chName) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');
  const nodes = doc.querySelectorAll('.tgme_widget_message');
  const results = [];

  nodes.forEach(node => {
    const postId = node.getAttribute('data-post');
    const txtEl = node.querySelector('.tgme_widget_message_text');
    if (!postId || !txtEl) return;

    const links = [...txtEl.querySelectorAll('a[href^="http"]')]
      .map(a => a.getAttribute('href'))
      .filter(h => !['t.me/', 'bit.ly/canal', 'whatsapp.com', 'instagram.com', 'youtube.com'].some(x => h.toLowerCase().includes(x)));

    const clone = txtEl.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    const lines = (clone.textContent || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && l !== '⠀');
    if (!lines.length) return;

    const timeEl = node.querySelector('time[datetime]');
    const isoDt = timeEl ? timeEl.getAttribute('datetime') : '';

    const titleCand = lines.slice(0, 4).find(
      ln => ln.replace(/[^a-zA-Z0-9]/g, '').length >= 6 && !/^(baixa|baixou|parcelado|cupom|oferta|promo|#)/i.test(ln.replace(/^[ ⭐️🔥🚨⚡]+/, ''))
    );
    const title = (titleCand || lines[0]).replace(/^[ ⭐️🔥🚨⚡🏹]+/, '').slice(0, 160);
    const { price, rawPrice, discountApplied, couponCode, couponInfo } = extractPriceAndCouponClient(lines);
    if (!price) return;

    results.push({
      post_id: postId,
      channel_id: chId,
      channel_name: chName,
      post_url: `https://t.me/${postId}`,
      timestamp: isoDt,
      title,
      head_text: lines.slice(0, 3).join(' ').slice(0, 260),
      price_brl: price,
      raw_price_brl: rawPrice,
      discount_applied: discountApplied,
      coupon_code: couponCode,
      coupon_info: couponInfo,
      buy_url: links.length ? links[links.length - 1] : `https://t.me/${postId}`,
      coupon_url: links.length > 1 ? links[0] : null
    });
  });
  return results;
}

function buildPromoPayloadClient(rawPosts, channelsScanned, maxAgeHours) {
  backupOriginalHBPrices();
  const byPost = new Map();
  rawPosts.forEach(p => byPost.set(p.post_id, p));

  // Initialize client coupon status registry from memory, DB.live_promos, and localStorage
  if (!PROMO_STATE.couponStatus) {
    PROMO_STATE.couponStatus = { coupons: {}, deals: {} };
  }
  if (!PROMO_STATE.couponStatus.coupons) PROMO_STATE.couponStatus.coupons = {};
  if (!PROMO_STATE.couponStatus.deals) PROMO_STATE.couponStatus.deals = {};

  // 1. Seed from authoritative backend/DB live_promos status
  if (typeof DB !== 'undefined' && DB && DB.live_promos && DB.live_promos.coupon_status) {
    const cs = DB.live_promos.coupon_status;
    if (cs.coupons) Object.assign(PROMO_STATE.couponStatus.coupons, cs.coupons);
    if (cs.deals) Object.assign(PROMO_STATE.couponStatus.deals, cs.deals);
  }

  // 2. Overlay any client-side tests from localStorage, BUT NEVER let a stale local 'active' status overwrite a server 'expired'/'out_of_stock' status!
  try {
    const local = JSON.parse(localStorage.getItem('gpuAnalyzerCouponStatus_v1') || '{}');
    if (local.coupons) {
      Object.keys(local.coupons).forEach(k => {
        const cur = PROMO_STATE.couponStatus.coupons[k];
        if (!cur || cur.status !== 'expired') {
          PROMO_STATE.couponStatus.coupons[k] = local.coupons[k];
        }
      });
    }
    if (local.deals) {
      Object.keys(local.deals).forEach(k => {
        const cur = PROMO_STATE.couponStatus.deals[k];
        if (!cur || cur.status !== 'expired') {
          PROMO_STATE.couponStatus.deals[k] = local.deals[k];
        }
      });
    }
  } catch (_) {}

  const clientExpiryRegexes = [
    /\b([A-Z0-9]{4,22})\s+(?:expirou|acabou|esgotou|encerrou|morreu|invalido|inválido|finalizou)\b/i,
    /(?:cupom|c[oó]digo)\s+([A-Z0-9]{4,22})\s+(?:expirou|acabou|esgotou|encerrou|invalido|inválido)\b/i,
    /(?:expirou|acabou|esgotou|encerrou|finalizou)\s+(?:o\s+)?(?:cupom\s+)?[:\-]?\s*\b([A-Z0-9]{4,22})\b/i,
    /o\s+cupom\s+([A-Z0-9]{4,22})\s+expirou/i
  ];
  const clientStopWords = new Set(['PARA', 'ESTA', 'ESSA', 'HOJE', 'AQUI', 'MAIS', 'PELO', 'SITE', 'LOJA', 'SHOPEE', 'KABUM', 'MAGALU', 'MERCADO', 'AMAZON', 'PROMO', 'OFERTA', 'LINK', 'DISPONIVEL', 'DISPONÍVEL', 'VALOR', 'PRECO', 'PREÇO', 'ESTOQUE', 'PRODUTO', 'AINDA', 'LIVRE', 'AGORA', 'TUDO', 'NAQUELE', 'KKKKKKK', 'CUPOMO', 'BLUSINHAS', 'RESGATE', 'SUBSTITUEM', 'APARECER', 'IFP43VOM', 'HTTPS', 'HTTP', 'WWW', 'COM', 'BR']);

  // Scan all incoming posts for real-time expiry announcements
  rawPosts.forEach(p => {
    const txt = ((p.title || '') + ' ' + (p.head_text || '') + ' ' + (p.raw_text || '')).toLowerCase();
    if (/acabou|expir|esgot|encerr|finaliz|invalido|inválido/.test(txt)) {
      clientExpiryRegexes.forEach(re => {
        const m = txt.match(re);
        if (m && m[1]) {
          const c = m[1].toUpperCase();
          if (!clientStopWords.has(c) && c.length >= 4) {
            PROMO_STATE.couponStatus.coupons[c] = {
              status: 'expired',
              reason: `Canal @${p.channel_id || 'radar'} avisou: '${txt.slice(0, 70)}...'`,
              updated_at: new Date().toLocaleTimeString('pt-BR')
            };
          }
        }
      });
      if (/^\s*\[?(?:esgotou|acabou|encerrado|expirado)\]?/i.test(p.title || '')) {
        PROMO_STATE.couponStatus.deals[p.post_id] = {
          status: 'out_of_stock',
          reason: 'Post editado para Esgotado/Acabou'
        };
      }
    }
  });

  try {
    localStorage.setItem('gpuAnalyzerCouponStatus_v1', JSON.stringify(PROMO_STATE.couponStatus));
  } catch (_) {}

  const nowMs = Date.now();
  const matchedDeals = [];
  const allPromos = [];
  const bestBySlug = {};

  byPost.forEach(orig => {
    const item = Object.assign({}, orig);
    let ageHours = 999;
    if (item.timestamp) {
      const t = Date.parse(item.timestamp);
      if (!isNaN(t)) ageHours = Math.max(0, (nowMs - t) / 3600000);
    }
    item.age_hours = Math.round(ageHours * 10) / 10;
    if (item.age_hours > maxAgeHours) return;

    const m = matchCatalogItemClient(item.head_text);
    if (m && m.item) {
      const hbPrice = m.item._hbPrice || m.item.price_brl || 0;
      if (hbPrice > 0 && (item.price_brl < hbPrice * 0.48 || item.price_brl > hbPrice * 1.25)) return;
      item.matched_kind = m.kind;
      item.matched_slug = m.item.slug;
      item.matched_name = m.item.name;
      item.hb_price_brl = hbPrice;
      item.savings_vs_hb_brl = Math.round((hbPrice - item.price_brl) * 100) / 100;

      const couponCode = (item.coupon_code || '').toUpperCase();
      const pId = item.post_id || '';
      const pIdLower = pId.toLowerCase();
      const buyUrl = item.buy_url || '';
      const dealsMap = (PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.deals) || {};
      const couponsMap = (PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.coupons) || {};

      const cStatus = couponCode ? couponsMap[couponCode] : null;
      const dStatus = dealsMap[pId] || dealsMap[pIdLower] || (buyUrl ? dealsMap[buyUrl] : null);

      if (dStatus && (dStatus.status === 'expired' || dStatus.status === 'out_of_stock')) {
        item.is_expired = true;
        item.deal_status = dStatus.status;
        item.deal_status_reason = dStatus.reason;
      } else if (item.age_hours > 8 && item.savings_vs_hb_brl > 250 && (!dStatus || dStatus.status !== 'active')) {
        // Unverified old flash post (>8h ago claiming > R$ 250 off) is considered expired by default
        item.is_expired = true;
        item.deal_status = 'expired';
        item.deal_status_reason = `Oferta relâmpago antiga (${item.age_hours}h atrás) pendente de validação`;
      } else {
        item.is_expired = false;
        item.deal_status = 'active';
      }

      if (cStatus && cStatus.status === 'expired') {
        item.is_coupon_expired = true;
        item.coupon_status = 'expired';
        item.coupon_status_reason = cStatus.reason;
        // REWIRE PRICING: Revoke expired coupon discount!
        if (item.raw_price_brl && item.raw_price_brl > item.price_brl) {
          item.price_brl = item.raw_price_brl;
          item.coupon_discount_revoked = true;
        } else if (item.discount_applied > 0) {
          item.price_brl = Math.round((item.price_brl + item.discount_applied) * 100) / 100;
          item.coupon_discount_revoked = true;
        }
        if (hbPrice > 0) {
          item.savings_vs_hb_brl = Math.round((hbPrice - item.price_brl) * 100) / 100;
        }
      } else {
        item.is_coupon_expired = false;
        item.coupon_status = couponCode ? 'active' : 'none';
      }

      matchedDeals.push(item);

      const slug = m.item.slug;
      // CRITICAL: ONLY ACTIVE, NON-EXPIRED DEALS CAN BE BEST BY SLUG!
      if (!item.is_expired && item.deal_status === 'active' && !item.is_coupon_expired) {
        if (!bestBySlug[slug] || item.price_brl < bestBySlug[slug].price_brl) {
          bestBySlug[slug] = item;
        }
      }
    }
    allPromos.push(item);
  });

  matchedDeals.sort((a, b) => (
    (a.is_expired ? 1 : 0) - (b.is_expired ? 1 : 0) ||
    (a.is_coupon_expired ? 1 : 0) - (b.is_coupon_expired ? 1 : 0) ||
    ((a.age_hours > 24) - (b.age_hours > 24)) ||
    (b.savings_vs_hb_brl - a.savings_vs_hb_brl) ||
    (a.price_brl - b.price_brl)
  ));
  allPromos.sort((a, b) => a.age_hours - b.age_hours);

  return {
    ok: true,
    scanned_at: new Date().toLocaleTimeString('pt-BR'),
    channels_scanned: channelsScanned,
    matched_count: matchedDeals.length,
    matched_deals: matchedDeals.slice(0, 80),
    best_by_slug: bestBySlug,
    recent_feed: allPromos.slice(0, 60),
    coupon_status: PROMO_STATE.couponStatus
  };
}

let PROMO_STATE = {
  open: false,
  configMenuOpen: false,
  applyFlash: true,
  autoRefreshTimer: null,
  countdownTimer: null,
  nextSyncAt: 0,
  autoSyncEnabled: false,
  autoSyncMins: 3,
  rawPosts: [],
  channelsScanned: [],
  lastData: null,
  notifyEnabled: true,
  trigCB: true,
  notifyMinCB: 92,
  trigBF: true,
  bfMode: 'user_or_low', // 'user_or_low' | 'bf_mid' | 'bf_high' | 'all_min'
  trigHB: true,
  hbMode: 'brl_or_pct',  // 'brl_or_pct' | 'brl_only' | 'pct_only' | 'brl_and_pct'
  hbMinBrl: 150,
  hbMinPct: 8,
  notifyLogic: 'OR',     // 'OR' | 'AND'
  notifyKind: 'all',     // 'all' | 'gpu' | 'cpu_gpu'
  notifyWinToast: true,
  notifyWinPopup: false,
  notifyWebToast: true,
  notifySound: true,
  notifyPhone: false,
  phoneService: 'ntfy', // 'ntfy' | 'whatsapp' | 'email'
  ntfyTopic: 'meu_alerta_gpu_cecatto',
  ntfyRing: false,
  ntfyPriority: 'default',
  waNumber: '',
  waApikey: '',
  emailHost: '',
  emailPort: 587,
  emailUser: '',
  emailPass: '',
  emailRecipient: '',
  notifiedKeys: new Set()
};

const NOTIFIED_STORAGE_KEY = 'gpuAnalyzerNotifiedDeals_v2';

function loadPersistedNotifiedKeys() {
  try {
    const local = JSON.parse(localStorage.getItem(NOTIFIED_STORAGE_KEY) || '[]');
    if (Array.isArray(local)) local.forEach(k => PROMO_STATE.notifiedKeys.add(k));

    const sess = JSON.parse(sessionStorage.getItem('gpuAnalyzerNotifiedDeals_v1') || '[]');
    if (Array.isArray(sess)) sess.forEach(k => PROMO_STATE.notifiedKeys.add(k));
  } catch (_) {}
}

function persistNotifiedKeys() {
  try {
    const list = [...PROMO_STATE.notifiedKeys].slice(-400);
    localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(list));
    sessionStorage.setItem('gpuAnalyzerNotifiedDeals_v1', JSON.stringify(list.slice(-100)));
  } catch (_) {}
}

async function syncNotifiedHistoryFromServer() {
  try {
    const res = await fetch('data/notified_history.json?t=' + Date.now());
    if (res.ok) {
      const hist = await res.json();
      if (hist && typeof hist === 'object') {
        Object.keys(hist).forEach(k => PROMO_STATE.notifiedKeys.add(k));
        persistNotifiedKeys();
      }
    }
  } catch (_) {}
}

async function syncCouponStatusFromServer() {
  try {
    let statusObj = null;
    try {
      const res = await fetch('/api/coupon-status?t=' + Date.now());
      if (res.ok) {
        const d = await res.json();
        statusObj = d.status || d;
      }
    } catch (_) {}
    if (!statusObj) {
      try {
        const resStatic = await fetch('data/coupon_status.json?t=' + Date.now());
        if (resStatic.ok) statusObj = await resStatic.json();
      } catch (_) {}
    }
    if (statusObj && typeof statusObj === 'object') {
      if (!PROMO_STATE.couponStatus) PROMO_STATE.couponStatus = { coupons: {}, deals: {} };
      if (!PROMO_STATE.couponStatus.coupons) PROMO_STATE.couponStatus.coupons = {};
      if (!PROMO_STATE.couponStatus.deals) PROMO_STATE.couponStatus.deals = {};
      if (statusObj.coupons) Object.assign(PROMO_STATE.couponStatus.coupons, statusObj.coupons);
      if (statusObj.deals) Object.assign(PROMO_STATE.couponStatus.deals, statusObj.deals);
      try {
        localStorage.setItem('gpuAnalyzerCouponStatus_v1', JSON.stringify(PROMO_STATE.couponStatus));
      } catch (_) {}
    }
  } catch (_) {}
}

try {
  loadPersistedNotifiedKeys();
  syncNotifiedHistoryFromServer();
  syncCouponStatusFromServer();
  const savedCfg = JSON.parse(localStorage.getItem('gpuAnalyzerPromoSettings_v1') || 'null');
  if (savedCfg && typeof savedCfg === 'object') {
    [
      'autoSyncEnabled', 'notifyEnabled', 'trigCB', 'trigBF', 'trigHB',
      'notifyWinToast', 'notifyWinPopup', 'notifyWebToast', 'notifySound', 'notifyPhone', 'ntfyRing'
    ].forEach(k => {
      if (typeof savedCfg[k] === 'boolean') PROMO_STATE[k] = savedCfg[k];
    });
    ['autoSyncMins', 'notifyMinCB', 'hbMinBrl', 'hbMinPct', 'emailPort'].forEach(k => {
      if (typeof savedCfg[k] === 'number' && !isNaN(savedCfg[k])) PROMO_STATE[k] = savedCfg[k];
    });
    ['bfMode', 'hbMode', 'notifyLogic', 'notifyKind', 'phoneService', 'ntfyTopic', 'ntfyPriority', 'waNumber', 'waApikey', 'emailHost', 'emailUser', 'emailPass', 'emailRecipient'].forEach(k => {
      if (typeof savedCfg[k] === 'string' && savedCfg[k] !== undefined) PROMO_STATE[k] = savedCfg[k];
    });
  }
} catch (_) {}

function togglePromoNotifyConfigMenu() {
  PROMO_STATE.configMenuOpen = !PROMO_STATE.configMenuOpen;
  const menu = document.getElementById('promo-notify-config-menu');
  const btn = document.getElementById('btn-toggle-notify-config');
  if (menu) menu.classList.toggle('hidden', !PROMO_STATE.configMenuOpen);
  if (btn) btn.textContent = PROMO_STATE.configMenuOpen ? '⚙️ Fechar Menu de Gatilhos ▴' : '⚙️ Configurar Gatilhos & Canais ▾';
}

function onPhoneServiceChange(val) {
  PROMO_STATE.phoneService = val || 'ntfy';
  ['ntfy', 'whatsapp', 'email'].forEach(s => {
    const p = document.getElementById(`phone-panel-${s}`);
    if (p) p.classList.toggle('hidden', s !== PROMO_STATE.phoneService);
  });
  savePromoSettingsToStorage();
  updateNotificationPermissionLabel();
}

function generateRandomNtfyTopic() {
  const words = ['gpu', 'promo', 'radar', 'pechincha', 'rtx', 'deal', 'brasil'];
  const rnd = Math.random().toString(36).slice(2, 8);
  const topic = `alerta_${words[Math.floor(Math.random() * words.length)]}_${rnd}`;
  const inp = document.getElementById('input-phone-ntfy-topic');
  if (inp) {
    inp.value = topic;
    PROMO_STATE.ntfyTopic = topic;
    savePromoSettingsToStorage();
  }
}

function savePromoSettingsToStorage() {
  try {
    localStorage.setItem('gpuAnalyzerPromoSettings_v1', JSON.stringify({
      autoSyncEnabled: PROMO_STATE.autoSyncEnabled,
      autoSyncMins: PROMO_STATE.autoSyncMins,
      notifyEnabled: PROMO_STATE.notifyEnabled,
      trigCB: PROMO_STATE.trigCB,
      notifyMinCB: PROMO_STATE.notifyMinCB,
      trigBF: PROMO_STATE.trigBF,
      bfMode: PROMO_STATE.bfMode,
      trigHB: PROMO_STATE.trigHB,
      hbMode: PROMO_STATE.hbMode,
      hbMinBrl: PROMO_STATE.hbMinBrl,
      hbMinPct: PROMO_STATE.hbMinPct,
      notifyLogic: PROMO_STATE.notifyLogic,
      notifyKind: PROMO_STATE.notifyKind,
      notifyWinToast: PROMO_STATE.notifyWinToast,
      notifyWinPopup: PROMO_STATE.notifyWinPopup,
      notifyWebToast: PROMO_STATE.notifyWebToast,
      notifySound: PROMO_STATE.notifySound,
      notifyPhone: PROMO_STATE.notifyPhone,
      phoneService: PROMO_STATE.phoneService,
      ntfyTopic: PROMO_STATE.ntfyTopic,
      ntfyRing: PROMO_STATE.ntfyRing,
      ntfyPriority: PROMO_STATE.ntfyPriority,
      waNumber: PROMO_STATE.waNumber,
      waApikey: PROMO_STATE.waApikey,
      emailHost: PROMO_STATE.emailHost,
      emailPort: PROMO_STATE.emailPort,
      emailUser: PROMO_STATE.emailUser,
      emailPass: PROMO_STATE.emailPass,
      emailRecipient: PROMO_STATE.emailRecipient
    }));
  } catch (_) {}

  // Sync to Python server background monitor so alerts fire even when browser is closed!
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    fetch('/api/alert-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notifyEnabled: PROMO_STATE.notifyEnabled,
        intervalMins: PROMO_STATE.autoSyncMins || 10,
        notifyWinToast: PROMO_STATE.notifyWinToast,
        notifyPhone: PROMO_STATE.notifyPhone,
        phoneService: PROMO_STATE.phoneService || 'ntfy',
        ntfyTopic: PROMO_STATE.ntfyTopic || 'meu_alerta_gpu_cecatto',
        ntfyRing: PROMO_STATE.ntfyRing,
        ntfyPriority: PROMO_STATE.ntfyPriority,
        trigCB: PROMO_STATE.trigCB,
        notifyMinCB: PROMO_STATE.notifyMinCB,
        trigBF: PROMO_STATE.trigBF,
        bfMode: PROMO_STATE.bfMode,
        trigHB: PROMO_STATE.trigHB,
        hbMinBrl: PROMO_STATE.hbMinBrl,
        hbMinPct: PROMO_STATE.hbMinPct,
        notifyLogic: PROMO_STATE.notifyLogic,
        custom_targets: [
          { slug: 'rtx-5060', name: 'RTX 5060', max_price: 2300 },
          { slug: 'rtx-5070', name: 'RTX 5070', max_price: 3800 },
          { slug: 'rtx-4060', name: 'RTX 4060', max_price: 1850 }
        ]
      })
    }).catch(() => {});
  }
}

async function testBackgroundAlertNow() {
  const statusEl = document.getElementById('phone-test-status');
  if (statusEl) {
    statusEl.textContent = 'Enviando teste de alerta em segundo plano para Windows e Celular...';
    statusEl.className = 'text-[11px] text-amber-300 font-mono';
  }
  try {
    const res = await fetch('/api/test-background-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notifyEnabled: true,
        notifyWinToast: true,
        notifyPhone: true,
        ntfyTopic: PROMO_STATE.ntfyTopic || 'meu_alerta_gpu_cecatto',
        phoneService: PROMO_STATE.phoneService || 'ntfy'
      })
    });
    const data = await res.json();
    if (data.ok) {
      if (statusEl) {
        statusEl.textContent = '✓ Alerta em segundo plano disparado com sucesso (Windows + Celular)!';
        statusEl.className = 'text-[11px] text-emerald-400 font-mono font-bold';
      }
      playDealAlertChime();
    } else {
      if (statusEl) {
        statusEl.textContent = `Erro ao disparar: ${data.error || 'Falha'}`;
        statusEl.className = 'text-[11px] text-rose-400 font-mono';
      }
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = `Erro de conexão: ${err.message}`;
      statusEl.className = 'text-[11px] text-rose-400 font-mono';
    }
  }
}

function syncPromoControlsFromState() {
  const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };

  setChk('chk-promo-autorefresh', PROMO_STATE.autoSyncEnabled);
  setVal('input-promo-sync-mins', PROMO_STATE.autoSyncMins);
  setChk('chk-notify-enabled', PROMO_STATE.notifyEnabled);
  setChk('chk-trig-cb', PROMO_STATE.trigCB);
  setVal('input-notify-min-cb', PROMO_STATE.notifyMinCB);
  setChk('chk-trig-bf', PROMO_STATE.trigBF);
  setVal('select-notify-bf-mode', PROMO_STATE.bfMode);
  setChk('chk-trig-hb', PROMO_STATE.trigHB);
  setVal('select-notify-hb-mode', PROMO_STATE.hbMode);
  setVal('input-notify-hb-brl', PROMO_STATE.hbMinBrl);
  setVal('input-notify-hb-pct', PROMO_STATE.hbMinPct);
  setVal('select-notify-logic', PROMO_STATE.notifyLogic);
  setVal('select-notify-kind', PROMO_STATE.notifyKind);
  setChk('chk-notify-win-toast', PROMO_STATE.notifyWinToast);
  setChk('chk-notify-win-popup', PROMO_STATE.notifyWinPopup);
  setChk('chk-notify-web-toast', PROMO_STATE.notifyWebToast);
  setChk('chk-notify-sound', PROMO_STATE.notifySound);
  setChk('chk-notify-phone', PROMO_STATE.notifyPhone);

  const rad = document.querySelector(`input[name="phone-service-choice"][value="${PROMO_STATE.phoneService}"]`);
  if (rad) rad.checked = true;
  ['ntfy', 'whatsapp', 'email'].forEach(s => {
    const p = document.getElementById(`phone-panel-${s}`);
    if (p) p.classList.toggle('hidden', s !== PROMO_STATE.phoneService);
  });

  setVal('input-phone-ntfy-topic', PROMO_STATE.ntfyTopic);
  setChk('chk-phone-ntfy-ring', PROMO_STATE.ntfyRing);
  setVal('select-phone-ntfy-priority', PROMO_STATE.ntfyPriority);
  setVal('input-phone-wa-number', PROMO_STATE.waNumber);
  setVal('input-phone-wa-apikey', PROMO_STATE.waApikey);
  setVal('input-phone-email-host', PROMO_STATE.emailHost);
  setVal('input-phone-email-port', PROMO_STATE.emailPort);
  setVal('input-phone-email-user', PROMO_STATE.emailUser);
  setVal('input-phone-email-pass', PROMO_STATE.emailPass);
  setVal('input-phone-email-recipient', PROMO_STATE.emailRecipient);

  updateNotificationPermissionLabel();
  if (PROMO_STATE.autoSyncEnabled) {
    schedulePromoAutoSyncTimer();
  }
}

window.addEventListener('DOMContentLoaded', syncPromoControlsFromState);

function onUpdatePromoNotificationSettings() {
  const getChk = (id, def) => { const el = document.getElementById(id); return el ? el.checked : def; };
  const getVal = (id, def) => { const el = document.getElementById(id); return el ? el.value : def; };

  PROMO_STATE.notifyEnabled = getChk('chk-notify-enabled', true);
  PROMO_STATE.trigCB = getChk('chk-trig-cb', true);
  PROMO_STATE.notifyMinCB = Math.max(50, Math.min(100, parseInt(getVal('input-notify-min-cb', '92'), 10) || 92));
  PROMO_STATE.trigBF = getChk('chk-trig-bf', true);
  PROMO_STATE.bfMode = getVal('select-notify-bf-mode', 'user_or_low');
  PROMO_STATE.trigHB = getChk('chk-trig-hb', true);
  PROMO_STATE.hbMode = getVal('select-notify-hb-mode', 'brl_or_pct');
  PROMO_STATE.hbMinBrl = Math.max(10, parseFloat(getVal('input-notify-hb-brl', '150')) || 150);
  PROMO_STATE.hbMinPct = Math.max(1, parseFloat(getVal('input-notify-hb-pct', '8')) || 8);
  PROMO_STATE.notifyLogic = getVal('select-notify-logic', 'OR');
  PROMO_STATE.notifyKind = getVal('select-notify-kind', 'all');
  PROMO_STATE.notifyWinToast = getChk('chk-notify-win-toast', true);
  PROMO_STATE.notifyWinPopup = getChk('chk-notify-win-popup', false);
  PROMO_STATE.notifyWebToast = getChk('chk-notify-web-toast', true);
  PROMO_STATE.notifySound = getChk('chk-notify-sound', true);
  PROMO_STATE.notifyPhone = getChk('chk-notify-phone', false);

  const rad = document.querySelector('input[name="phone-service-choice"]:checked');
  if (rad) PROMO_STATE.phoneService = rad.value;
  PROMO_STATE.ntfyTopic = getVal('input-phone-ntfy-topic', 'meu_alerta_gpu_cecatto').trim();
  PROMO_STATE.ntfyRing = getChk('chk-phone-ntfy-ring', false);
  PROMO_STATE.ntfyPriority = getVal('select-phone-ntfy-priority', 'default');
  PROMO_STATE.waNumber = getVal('input-phone-wa-number', '').trim();
  PROMO_STATE.waApikey = getVal('input-phone-wa-apikey', '').trim();
  PROMO_STATE.emailHost = getVal('input-phone-email-host', '').trim();
  PROMO_STATE.emailPort = parseInt(getVal('input-phone-email-port', '587'), 10) || 587;
  PROMO_STATE.emailUser = getVal('input-phone-email-user', '').trim();
  PROMO_STATE.emailPass = getVal('input-phone-email-pass', '').trim();
  PROMO_STATE.emailRecipient = getVal('input-phone-email-recipient', '').trim();

  savePromoSettingsToStorage();
  updateNotificationPermissionLabel();
  if (PROMO_STATE.lastData) {
    evaluateDealsForAlerts();
    renderPromoRadarPanel();
  }
}

function updateNotificationPermissionLabel() {
  const el = document.getElementById('notify-perm-status');
  const sumEl = document.getElementById('notify-active-rules-summary');

  if (sumEl) {
    const parts = [];
    if (PROMO_STATE.trigCB) parts.push(`🏆 CB ≥ ${PROMO_STATE.notifyMinCB}`);
    if (PROMO_STATE.trigBF) {
      const bfLabels = {
        user_or_low: '🏷️ Meta/Piso BF',
        bf_mid: '🏷️ Média BF',
        bf_high: '🏷️ Teto BF',
        all_min: '🏷️ Mín. Histórico'
      };
      parts.push(bfLabels[PROMO_STATE.bfMode] || '🏷️ Meta BF');
    }
    if (PROMO_STATE.trigHB) {
      const sym = STATE.market?.monetary?.currency_symbol || 'R$';
      if (PROMO_STATE.hbMode === 'brl_only') parts.push(`📉 −${sym} ${PROMO_STATE.hbMinBrl} vs Database`);
      else if (PROMO_STATE.hbMode === 'pct_only') parts.push(`📉 −${PROMO_STATE.hbMinPct}% vs Database`);
      else if (PROMO_STATE.hbMode === 'brl_and_pct') parts.push(`📉 −${sym} ${PROMO_STATE.hbMinBrl} E −${PROMO_STATE.hbMinPct}% vs Database`);
      else parts.push(`📉 −${sym} ${PROMO_STATE.hbMinBrl} / −${PROMO_STATE.hbMinPct}% vs Database`);
    }
    const joiner = PROMO_STATE.notifyLogic === 'AND' ? ' E ' : ' OU ';
    sumEl.textContent = parts.length ? `Gatilhos: ${parts.join(joiner)}` : 'Nenhum gatilho marcado';
  }

  if (!el) return;
  if (!PROMO_STATE.notifyEnabled) {
    el.textContent = '🔕 Notificações pausadas';
    return;
  }
  const modes = [];
  if (PROMO_STATE.notifyWinToast) modes.push('🪟 Windows Toast');
  if (PROMO_STATE.notifyWinPopup) modes.push('💬 Pop-up Janela');
  if (PROMO_STATE.notifyWebToast) modes.push('🖥️ Card Tela');
  if (PROMO_STATE.notifyPhone) {
    const ringText = PROMO_STATE.ntfyRing ? ' (Alarme/DND)' : '';
    const svcMap = {
      ntfy: `📱 Celular (ntfy${ringText})`,
      whatsapp: '📱 Celular (WhatsApp)',
      email: '📱 Celular (E-mail)'
    };
    modes.push(svcMap[PROMO_STATE.phoneService] || '📱 Celular');
  }
  if (PROMO_STATE.notifySound) modes.push('🔊 Som');
  el.textContent = modes.length ? modes.join(' + ') : '⚠️ Nenhum canal selecionado';
}

function playDealAlertChime() {
  if (!PROMO_STATE.notifySound) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    // Two-note pleasant alert chime (E5 -> B5)
    [[659.25, 0, 0.14], [987.77, 0.15, 0.28]].forEach(([freq, start, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    });
  } catch (_) {}
}

function evaluateDealsForAlerts() {
  if (!PROMO_STATE.lastData || !Array.isArray(PROMO_STATE.lastData.matched_deals)) return [];
  const minCB = PROMO_STATE.notifyMinCB || 92;

  // Compute maximum composite/price ratio with default/current weights to also evaluate non-active flash deals
  let maxGpuRawRatio = 0;
  (DB.gpus || []).forEach(g => {
    if (g.slug !== 'rx-580-8gb-ref' && (g._rawCBRatio || 0) > maxGpuRawRatio) {
      maxGpuRawRatio = g._rawCBRatio;
    }
  });

  const qualifying = [];
  PROMO_STATE.lastData.matched_deals.forEach(d => {
    let cbScore = null;
    let hitCB = false;
    let hitBF = false;
    let hitHB = false;
    const reasons = [];

    // 1. Evaluate CB & BF for GPUs / CPUs
    const catalogItem = d.matched_kind === 'gpu'
      ? (DB.gpus || []).find(g => g.slug === d.matched_slug)
      : d.matched_kind === 'cpu'
        ? (DB.cpus || []).find(c => c.slug === d.matched_slug)
        : null;

    if (d.matched_kind === 'gpu' && catalogItem) {
      const comp = getContextualCompositeScore(catalogItem);
      const pPenalty = (catalogItem._dominatedBy && catalogItem._paretoPenalty) ? Math.pow(catalogItem._paretoPenalty, 0.85) : 1.0;
      const rawAtDealPrice = (comp / Math.max(1, d.price_brl + (catalogItem._psuUpgradeCost || 0))) * pPenalty;
      cbScore = maxGpuRawRatio > 0
        ? Math.min(100, Math.round((rawAtDealPrice / maxGpuRawRatio) * 100))
        : (catalogItem._myCBScore || null);

      if (cbScore !== null && cbScore >= minCB) {
        hitCB = true;
        reasons.push(`🏆 CB ${cbScore}/100`);
      }
    }

    // 2. Evaluate Black Friday Expected Price & Historical Low
    if (catalogItem && (d.matched_kind === 'gpu' || d.matched_kind === 'cpu')) {
      const st = bfAnalyzeItem(catalogItem, d.matched_kind);
      const exp = bfExpectedRange(st, 0.10);
      const userSaved = (STATE.bfRanges && STATE.bfRanges[d.matched_slug]) || null;
      const userMin = userSaved ? userSaved.min : exp.low;
      const userMax = userSaved ? userSaved.max : exp.high;

      const mode = PROMO_STATE.bfMode || 'user_or_low';
      if (d.price_brl <= st.allMin * 1.01) {
        hitBF = true;
        reasons.push(`🔥 Mín. Histórico (${fmtBRLShort(st.allMin)})`);
      } else if (mode === 'user_or_low' && d.price_brl <= Math.max(exp.low, userMin)) {
        hitBF = true;
        reasons.push(`🏷️ Meta Pechincha BF (≤ ${fmtBRLShort(Math.max(exp.low, userMin))})`);
      } else if (mode === 'bf_mid' && d.price_brl <= exp.mid) {
        hitBF = true;
        reasons.push(`🏷️ Média Esperada BF (≤ ${fmtBRLShort(exp.mid)})`);
      } else if (mode === 'bf_high' && d.price_brl <= Math.max(exp.high, userMax)) {
        hitBF = true;
        reasons.push(`🏷️ Dentro da Faixa BF (≤ ${fmtBRLShort(Math.max(exp.high, userMax))})`);
      }
    }

    // 3. Evaluate Comparison vs Database
    const pctVsHB = d.hb_price_brl > 0 ? ((d.hb_price_brl - d.price_brl) / d.hb_price_brl) * 100 : 0;
    const minBrl = PROMO_STATE.hbMinBrl || 150;
    const minPct = PROMO_STATE.hbMinPct || 8;
    const passBrl = d.savings_vs_hb_brl >= minBrl;
    const passPct = pctVsHB >= minPct;

    if (PROMO_STATE.hbMode === 'brl_only') hitHB = passBrl;
    else if (PROMO_STATE.hbMode === 'pct_only') hitHB = passPct;
    else if (PROMO_STATE.hbMode === 'brl_and_pct') hitHB = passBrl && passPct;
    else hitHB = passBrl || passPct;

    if (hitHB && d.savings_vs_hb_brl > 0) {
      reasons.push(`📉 −${fmtBRLShort(d.savings_vs_hb_brl)} (−${Math.round(pctVsHB)}%) vs Database`);
    }

    d.cb_score = cbScore;
    d.is_high_cb = hitCB;
    d.is_pechincha = hitBF || hitHB;
    d.alert_reasons = reasons;

    // Filter by item category
    if (PROMO_STATE.notifyKind === 'gpu' && d.matched_kind !== 'gpu') return;
    if (PROMO_STATE.notifyKind === 'cpu_gpu' && d.matched_kind !== 'gpu' && d.matched_kind !== 'cpu') return;

    // Combine active triggers with OR / AND logic
    const activeResults = [];
    if (PROMO_STATE.trigCB) activeResults.push(hitCB);
    if (PROMO_STATE.trigBF) activeResults.push(hitBF);
    if (PROMO_STATE.trigHB) activeResults.push(hitHB);

    if (!activeResults.length) return;
    const qualifies = PROMO_STATE.notifyLogic === 'AND'
      ? activeResults.every(Boolean)
      : activeResults.some(Boolean);

    if (qualifies) {
      qualifying.push(d);
    }
  });

  return qualifying;
}

function showDealToastNotification(deal) {
  if (!PROMO_STATE.notifyWebToast) return;
  const container = document.getElementById('promo-toast-container');
  if (!container) return;

  const toastId = 'toast-' + Math.random().toString(36).slice(2, 9);
  const couponBadge = (deal.coupon_code || deal.coupon_info)
    ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[10px]">🎟️ ${deal.coupon_code || deal.coupon_info}</span>`
    : '';
  const reasonsHtml = (deal.alert_reasons || []).map(r =>
    `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold text-[10px]">${r}</span>`
  ).join(' ');

  const div = document.createElement('div');
  div.id = toastId;
  div.className = 'pointer-events-auto rounded-2xl bg-slate-950/95 border-2 border-amber-400/80 shadow-2xl shadow-amber-500/20 p-3.5 text-xs space-y-2 transition-all duration-300';
  div.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-mono font-extrabold text-[10px]">🔔 ALERTA DE OFERTA</span>
        ${reasonsHtml}
      </div>
      <button onclick="document.getElementById('${toastId}')?.remove()" class="text-slate-400 hover:text-white font-bold px-1 cursor-pointer">✕</button>
    </div>
    <div class="flex items-baseline justify-between gap-2">
      <span class="font-extrabold text-white text-sm">${deal.matched_name}</span>
      <div class="flex items-center gap-1.5">
        ${deal.hb_price_brl > deal.price_brl ? `<span class="text-[11px] font-mono text-slate-500 line-through">${fmtBRLShort(deal.hb_price_brl)}</span>` : ''}
        <span class="font-mono font-extrabold text-base text-emerald-400">${fmtBRL(deal.price_brl)}</span>
      </div>
    </div>
    <div class="text-[11px] text-slate-300 line-clamp-2">${deal.title}</div>
    <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
      <div class="flex items-center gap-1.5">
        ${couponBadge}
        <span class="text-[10px] font-mono text-slate-400">@${deal.channel_id}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <button onclick="sendPromoToDuelOrBF('${deal.matched_kind}', '${deal.matched_slug}', ${deal.price_brl}); document.getElementById('${toastId}')?.remove();" class="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-300 font-bold text-[11px] cursor-pointer">
          ${deal.matched_kind === 'gpu' ? 'Ver Duelo' : 'Ver BF'}
        </button>
        <a href="${deal.buy_url}" target="_blank" class="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px]">
          Ir p/ Oferta ↗
        </a>
      </div>
    </div>
  `;

  container.prepend(div);
  while (container.children.length > 3) {
    container.lastElementChild.remove();
  }
  setTimeout(() => {
    const el = document.getElementById(toastId);
    if (el) el.remove();
  }, 18000);
}

function fireWindowsNativeNotification(deal) {
  const reasons = (deal.alert_reasons || []).join(' • ');
  const couponTxt = (deal.coupon_code || deal.coupon_info) ? ` | Cupom: ${deal.coupon_code || deal.coupon_info}` : '';
  const title = `🔥 ${deal.matched_name} por ${fmtBRL(deal.price_brl)}`;
  const line1 = `${reasons}${couponTxt}`;
  const line2 = `Canal @${deal.channel_id} — Clique para abrir oferta`;
  const url = deal.buy_url && deal.buy_url.startsWith('http') ? deal.buy_url : (deal.post_url || '');

  // 1. Trigger real Windows 10/11 OS Toast / Popup via server.py
  if (PROMO_STATE.notifyWinToast || PROMO_STATE.notifyWinPopup) {
    fetch('/api/win-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        line1,
        line2,
        url,
        popup_box: !!PROMO_STATE.notifyWinPopup
      })
    }).catch(() => {});
  }

  // 2. Also fire Browser Notification if running on a secondary device that granted browser permission
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        body: `${line1}\n${line2}`,
        tag: `deal-${deal.matched_slug}`
      });
      n.onclick = () => {
        window.focus();
        if (url) window.open(url, '_blank');
        n.close();
      };
    } catch (_) {}
  }

  // 3. Fire Phone Alert (Push with alarm ringtone, WhatsApp message, or Email)
  if (PROMO_STATE.notifyPhone) {
    firePhoneNotification(deal);
  }
}

function firePhoneNotification(deal) {
  const reasons = (deal.alert_reasons || []).join(' • ');
  const couponTxt = (deal.coupon_code || deal.coupon_info) ? `\n🎟️ Cupom Necessário: ${deal.coupon_code || deal.coupon_info}` : '';
  const couponTag = (deal.coupon_code || deal.coupon_info) ? ` (c/ Cupom: ${deal.coupon_code || deal.coupon_info})` : '';
  const hbDiffTxt = deal.hb_price_brl > deal.price_brl ? `\n📉 Economia vs Ref: -${fmtBRL(deal.savings_vs_hb_brl)} (Ref: ${fmtBRL(deal.hb_price_brl)})` : '';
  const title = `🔥 ${deal.matched_name} por ${fmtBRL(deal.price_brl)}${couponTag}`;
  const message = `${reasons}${couponTxt}${hbDiffTxt}\n📢 Canal: @${deal.channel_id}\n${deal.title}`;
  const url = deal.buy_url && deal.buy_url.startsWith('http') ? deal.buy_url : (deal.post_url || '');

  const postId = deal.post_id || `${deal.channel_id}_${deal.matched_slug}_${Math.round(deal.price_brl)}`;

  const payload = {
    channel: PROMO_STATE.phoneService || 'ntfy',
    title,
    message,
    url,
    post_id: postId
  };

  if (PROMO_STATE.phoneService === 'ntfy') {
    payload.topic = PROMO_STATE.ntfyTopic || 'meu_alerta_gpu_cecatto';
    payload.priority = PROMO_STATE.ntfyPriority || 'default';
    payload.ring = !!PROMO_STATE.ntfyRing;
  } else if (PROMO_STATE.phoneService === 'whatsapp') {
    payload.phone = PROMO_STATE.waNumber || '';
    payload.apikey = PROMO_STATE.waApikey || '';
  } else if (PROMO_STATE.phoneService === 'email') {
    payload.smtp = {
      host: PROMO_STATE.emailHost || '',
      port: PROMO_STATE.emailPort || 587,
      user: PROMO_STATE.emailUser || '',
      password: PROMO_STATE.emailPass || '',
      recipient: PROMO_STATE.emailRecipient || ''
    };
  }

  fetch('/api/phone-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => {
    if (!r.ok) throw new Error('API não disponível no servidor estático');
    return r.json();
  }).then(res => {
    if (res && res.skipped) {
      console.log('[Phone Alert] Oferta já notificada anteriormente, duplicata evitada:', postId);
    }
  }).catch(async () => {
    // Client-side fallback for GitHub Pages (zero backend needed)
    if (payload.channel === 'ntfy' && payload.topic) {
      try {
        await fetch('https://ntfy.sh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: payload.topic,
            title: payload.title,
            message: payload.message,
            tags: ['bell', 'moneybag'],
            priority: payload.priority === 'urgent' ? 5 : 3,
            click: payload.url
          })
        });
      } catch (_) {}
    } else if (payload.channel === 'whatsapp' && payload.phone && payload.apikey) {
      try {
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(payload.phone)}&text=${encodeURIComponent(payload.message)}&apikey=${encodeURIComponent(payload.apikey)}`;
        await fetch(url, { mode: 'no-cors' });
      } catch (_) {}
    }
  });
}

async function testPhoneAlertNow() {
  const statusEl = document.getElementById('phone-test-status');
  if (statusEl) statusEl.textContent = 'Enviando teste para o celular...';

  const sampleDeal = {
    matched_kind: 'gpu',
    matched_slug: 'rtx-5060',
    matched_name: 'RTX 5060 8GB (Teste Celular)',
    price_brl: 1849,
    hb_price_brl: 2159,
    savings_vs_hb_brl: 310,
    alert_reasons: ['🏆 CB 95/100', '🔥 PECHINCHA', '−R$ 310 vs Database'],
    coupon_code: 'PC10',
    channel_id: 'ofertasadrenaline',
    title: 'Placa de Vídeo GeForce RTX 5060 com cupom de desconto nos grupos!',
    buy_url: 'https://t.me/s/ofertasadrenaline'
  };

  const prevSetting = PROMO_STATE.notifyPhone;
  PROMO_STATE.notifyPhone = true;

  try {
    const payload = {
      channel: PROMO_STATE.phoneService || 'ntfy',
      title: `🔥 [TESTE] ${sampleDeal.matched_name} por ${fmtBRL(sampleDeal.price_brl)} (c/ Cupom: PC10)`,
      message: `🔔 Teste de disparo no celular bem-sucedido!\n\n🏆 CB 95/100 • PECHINCHA\n🎟️ Cupom Necessário: PC10\n📉 Economia: -R$ 310,00 vs Catálogo\n📢 Canal: @ofertasadrenaline\n\nRecebida como notificação comum (respeitando o modo Não Perturbe e volume padrão).`,
      url: 'https://t.me/s/ofertasadrenaline',
      force: true
    };

    if (PROMO_STATE.phoneService === 'ntfy') {
      payload.topic = PROMO_STATE.ntfyTopic || 'meu_alerta_gpu_cecatto';
      payload.priority = PROMO_STATE.ntfyPriority || 'default';
      payload.ring = !!PROMO_STATE.ntfyRing;
    } else if (PROMO_STATE.phoneService === 'whatsapp') {
      payload.phone = PROMO_STATE.waNumber || '';
      payload.apikey = PROMO_STATE.waApikey || '';
    } else if (PROMO_STATE.phoneService === 'email') {
      payload.smtp = {
        host: PROMO_STATE.emailHost || '',
        port: PROMO_STATE.emailPort || 587,
        user: PROMO_STATE.emailUser || '',
        password: PROMO_STATE.emailPass || '',
        recipient: PROMO_STATE.emailRecipient || ''
      };
    }

    let ok = false;
    let modeText = PROMO_STATE.phoneService.toUpperCase();

    try {
      const r = await fetch('/api/phone-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (r.ok) {
        const res = await r.json();
        ok = res.ok;
      }
    } catch (_) {}

    // If local server is not running (e.g. running on GitHub Pages), send directly from browser
    if (!ok && payload.channel === 'ntfy' && payload.topic) {
      try {
        await fetch('https://ntfy.sh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: payload.topic,
            title: payload.title,
            message: payload.message,
            tags: ['bell', 'moneybag'],
            priority: payload.priority === 'urgent' ? 5 : 3,
            click: payload.url
          })
        });
        ok = true;
        modeText = 'NTFY (Push Celular)';
      } catch (err) {
        console.warn('ntfy direct error:', err);
      }
    } else if (!ok && payload.channel === 'whatsapp' && payload.phone && payload.apikey) {
      try {
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(payload.phone)}&text=${encodeURIComponent(payload.message)}&apikey=${encodeURIComponent(payload.apikey)}`;
        await fetch(url, { mode: 'no-cors' });
        ok = true;
        modeText = 'WHATSAPP (Direto via CallMeBot)';
      } catch (_) {}
    }

    if (ok) {
      if (statusEl) statusEl.textContent = `✅ Enviado com sucesso via ${modeText}! Verifique seu celular.`;
      const chkPhone = document.getElementById('chk-notify-phone');
      if (chkPhone) chkPhone.checked = true;
      PROMO_STATE.notifyPhone = true;
      savePromoSettingsToStorage();
      updateNotificationPermissionLabel();
    } else {
      if (statusEl) statusEl.textContent = `❌ Falha ao enviar para o celular. Verifique as configurações.`;
      PROMO_STATE.notifyPhone = prevSetting;
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = `❌ Erro no disparo: ${err.message}`;
    PROMO_STATE.notifyPhone = prevSetting;
  }
}

function checkAndFireDealNotifications(forceTest = false) {
  const qualifying = evaluateDealsForAlerts();
  updateNotificationPermissionLabel();
  if (!PROMO_STATE.notifyEnabled && !forceTest) return;

  const newAlerts = qualifying.filter(d => {
    const postId = d.post_id || `${d.channel_id}_${d.matched_slug}_${Math.round(d.price_brl)}`;
    const priceKey = `${d.matched_slug}:${Math.round(d.price_brl)}`;
    if (!forceTest) {
      if (PROMO_STATE.notifiedKeys.has(postId) || PROMO_STATE.notifiedKeys.has(priceKey)) {
        return false;
      }
    }
    PROMO_STATE.notifiedKeys.add(postId);
    PROMO_STATE.notifiedKeys.add(priceKey);
    return true;
  });

  persistNotifiedKeys();

  if (newAlerts.length > 0) {
    playDealAlertChime();
    newAlerts.slice(0, 3).forEach(deal => {
      showDealToastNotification(deal);
      fireWindowsNativeNotification(deal);
    });
    if (document.hidden) {
      document.title = `🔥 (${newAlerts.length}) PECHINCHA! | Build & GPU Analyzer Pro`;
    }
  } else if (forceTest) {
    // If user clicked "Testar Alerta" and no new unnotified deal existed, show the best qualifying deal or a demo alert
    const sample = qualifying[0] || {
      matched_kind: 'gpu',
      matched_slug: 'rtx-5060',
      matched_name: 'GeForce RTX 5060 8GB (Teste)',
      price_brl: 1849,
      hb_price_brl: 2159,
      savings_vs_hb_brl: 310,
      cb_score: 95,
      is_high_cb: true,
      is_pechincha: true,
      alert_reasons: [`🏆 CB 95/100`, `🔥 −R$ 310 vs Database`],
      coupon_code: 'PC10',
      channel_id: 'ofertasadrenaline',
      title: 'Teste de Notificação: Placa de Vídeo RTX 5060 com cupom relâmpago nos grupos!',
      buy_url: 'https://t.me/s/ofertasadrenaline'
    };
    playDealAlertChime();
    showDealToastNotification(sample);
    fireWindowsNativeNotification(sample);
  }
}

window.addEventListener('focus', () => {
  if (document.title.startsWith('🔥')) {
    document.title = 'GPU & Build Analyzer Pro — Duelo Relacional, IA, Engenharia & Custo-Benefício';
  }
});

async function requestAndTestPromoNotification() {
  const permLbl = document.getElementById('notify-perm-status');
  if (permLbl) permLbl.textContent = 'Enviando notificação no Windows e tela...';

  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (_) {}
    }
  }
  updateNotificationPermissionLabel();
  checkAndFireDealNotifications(true);

  setTimeout(() => {
    if (permLbl) {
      const isGranted = 'Notification' in window && Notification.permission === 'granted';
      permLbl.textContent = isGranted 
        ? '✅ Alerta enviado (Windows Toast + Som + Navegador Autorizado)' 
        : '🔔 Alerta enviado (Toast Windows / Balão + Som acionados)';
    }
  }, 600);
}

function togglePromoRadarPanel() {
  PROMO_STATE.open = !PROMO_STATE.open;
  const panel = document.getElementById('promo-radar-panel');
  if (panel) panel.classList.toggle('hidden', !PROMO_STATE.open);
  if (PROMO_STATE.open && !PROMO_STATE.lastData) {
    scanLivePromos(false);
  }
}

function backupOriginalHBPrices(force = false) {
  ['gpus', 'cpus', 'rams'].forEach(group => {
    (DB[group] || []).forEach(it => {
      if (force || it._hbPrice === undefined) {
        it._hbPrice = it.price_brl;
        it._hbCoupon = it.coupon || null;
        it._hbStore = it.store_name || 'loja';
        it._hbUrl = it.offer_url || '';
      }
    });
  });
}
window.backupOriginalHBPrices = backupOriginalHBPrices;

function getActiveRegionId() {
  return (window.STATE?.market?.region_id || 'br').toLowerCase();
}

function applyFlashPromosToCatalog() {
  if (!DB.gpus || !DB.gpus.length) return;
  backupOriginalHBPrices();

  const activeReg = getActiveRegionId();
  const lastDataReg = (PROMO_STATE.lastData && PROMO_STATE.lastData.region_id)
    ? PROMO_STATE.lastData.region_id.toLowerCase()
    : activeReg;

  // STRICT ISOLATION: Never apply deals if lastData.region_id does not match activeReg!
  const bestMap = (lastDataReg === activeReg && PROMO_STATE.lastData && PROMO_STATE.lastData.best_by_slug) || {};
  let appliedCount = 0;

  const brChannels = new Set(['ofertasadrenaline', 'peperaiohardware', 'iskandarsouza', 'benchpromos', 'kabumofertas', 'nerdofertas', 'ofertastechbr']);

  ['gpus', 'cpus', 'rams'].forEach(group => {
    (DB[group] || []).forEach(it => {
      const promo = bestMap[it.slug];
      const promoRegion = (promo && promo.region_id ? promo.region_id : lastDataReg).toLowerCase();
      const isBrLeak = activeReg !== 'br' && promo && (
        brChannels.has((promo.channel_id || '').toLowerCase()) ||
        /\.br\b|t\.me\/(?:peperaio|ofertasadrenaline|iskandar|kabum|benchpromos|nerdofertas|ofertastechbr)/i.test(promo.buy_url || promo.post_url || '')
      );

      if (
        PROMO_STATE.applyFlash &&
        promo &&
        promoRegion === activeReg &&
        !isBrLeak &&
        !promo.is_expired &&
        promo.deal_status === 'active' &&
        !promo.is_coupon_expired &&
        promo.price_brl < it._hbPrice
      ) {
        it.price_brl = promo.price_brl;
        it.coupon = promo.coupon_code || promo.coupon_info || (activeReg === 'mx' ? 'OFERTA MX' : 'PROMO GRUPO');
        it.store_name = promo.store_name || `@${promo.channel_id}`;
        it.offer_url = promo.buy_url || promo.post_url;
        it._flashPromo = promo;
        appliedCount++;
      } else {
        it.price_brl = it._hbPrice;
        it.coupon = it._hbCoupon;
        it.store_name = it._hbStore;
        it.offer_url = it._hbUrl;
        it._flashPromo = null;
      }
    });
  });

  const badge = document.getElementById('promo-radar-badge');
  if (badge) {
    const totalDeals = (lastDataReg === activeReg && PROMO_STATE.lastData && PROMO_STATE.lastData.matched_count) || 0;
    badge.textContent = appliedCount > 0 ? `${appliedCount} abaixo do Catálogo` : `${totalDeals} ofertas`;
  }

  enrichGPUsWithContextualMetrics();
  populateSelectors();
  renderActiveTab();
}

function onToggleApplyFlashPromos(checked) {
  PROMO_STATE.applyFlash = checked;
  applyFlashPromosToCatalog();
}

function updateAutoSyncCountdownLabel() {
  const lbl = document.getElementById('promo-autosync-countdown');
  if (!lbl) return;
  if (!PROMO_STATE.autoSyncEnabled || !PROMO_STATE.nextSyncAt) {
    lbl.textContent = '';
    return;
  }
  const remSec = Math.max(0, Math.round((PROMO_STATE.nextSyncAt - Date.now()) / 1000));
  const m = Math.floor(remSec / 60);
  const s = remSec % 60;
  lbl.textContent = m > 0 ? `(${m}m ${String(s).padStart(2, '0')}s)` : `(${s}s)`;
}

function schedulePromoAutoSyncTimer() {
  if (PROMO_STATE.autoRefreshTimer) {
    clearInterval(PROMO_STATE.autoRefreshTimer);
    PROMO_STATE.autoRefreshTimer = null;
  }
  if (PROMO_STATE.countdownTimer) {
    clearInterval(PROMO_STATE.countdownTimer);
    PROMO_STATE.countdownTimer = null;
  }
  const lbl = document.getElementById('promo-autosync-countdown');
  if (!PROMO_STATE.autoSyncEnabled) {
    if (lbl) lbl.textContent = '';
    return;
  }
  const intervalMs = Math.max(30000, Math.round((PROMO_STATE.autoSyncMins || 3) * 60000));
  PROMO_STATE.nextSyncAt = Date.now() + intervalMs;
  updateAutoSyncCountdownLabel();

  PROMO_STATE.autoRefreshTimer = setInterval(() => {
    PROMO_STATE.nextSyncAt = Date.now() + intervalMs;
    scanLivePromos(true);
  }, intervalMs);

  PROMO_STATE.countdownTimer = setInterval(updateAutoSyncCountdownLabel, 1000);
}

function onTogglePromoAutoRefresh() {
  const chk = document.getElementById('chk-promo-autorefresh');
  const inp = document.getElementById('input-promo-sync-mins');
  PROMO_STATE.autoSyncEnabled = !!(chk && chk.checked);
  if (inp) {
    const val = parseFloat(inp.value);
    if (!isNaN(val) && val >= 0.5) PROMO_STATE.autoSyncMins = Math.min(120, val);
  }
  savePromoSettingsToStorage();
  schedulePromoAutoSyncTimer();
}

function onChangePromoSyncInterval() {
  const inp = document.getElementById('input-promo-sync-mins');
  if (inp) {
    const val = parseFloat(inp.value);
    PROMO_STATE.autoSyncMins = (!isNaN(val) && val >= 0.5) ? Math.min(120, val) : 3;
    inp.value = PROMO_STATE.autoSyncMins;
  }
  savePromoSettingsToStorage();
  if (PROMO_STATE.autoSyncEnabled) {
    schedulePromoAutoSyncTimer();
  }
}

function sendPromoToDuelOrBF(kind, slug, price) {
  if (kind === 'gpu') {
    STATE.duelCandSlug = slug;
    document.getElementById('duel-select-cand').value = slug;
    syncDuelPriceInputsFromSelection();
    document.getElementById('duel-price-cand').value = price;
    switchTab('versus');
  } else {
    switchTab('bf');
    const sel = document.getElementById('bf-target-item');
    if (sel) {
      sel.value = slug;
      onBFTargetItemChange();
      document.getElementById('bf-input-test-price').value = price;
      updateBFPromoEvaluator(true);
    }
  }
}

async function scanLivePromos(force = false) {
  const statusEl = document.getElementById('promo-radar-status');
  const btn = document.getElementById('btn-scan-promos-now');
  const maxAge = parseFloat((document.getElementById('select-promo-max-age') || {}).value || '24');
  const extraQ = ((document.getElementById('input-promo-query') || {}).value || '').trim();
  const extraCh = ((document.getElementById('input-promo-channels') || {}).value || '').trim();
  const activeRegId = getActiveRegionId();

  // MEXICO PIPELINE: Fetch strictly from /api/promos?region=mx (Promodescuentos + Cyberpuerta + DDTech)
  if (activeRegId === 'mx') {
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = 'Buscando ofertas y cupones en México (Promodescuentos / Cyberpuerta / DDTech)...';
    try {
      let prData = null;
      try {
        const apiRes = await fetch(`/api/promos?max_age=${maxAge}&region=mx&market=mx` + (force ? '&force=1' : ''));
        if (apiRes.ok) prData = await apiRes.json();
      } catch (_) {}

      if (!prData || !Array.isArray(prData.matched_deals)) {
        try {
          const prRes = await fetch(`data/promos_cache_mx.json?t=` + Date.now());
          if (prRes.ok) prData = await prRes.json();
        } catch (_) {}
      }

      if (!prData || typeof prData !== 'object') {
        prData = { ok: true, region_id: 'mx', scanned_at: new Date().toLocaleTimeString(), channels_scanned: [], matched_count: 0, matched_deals: [], best_by_slug: {}, recent_feed: [] };
      }
      prData.region_id = 'mx';
      PROMO_STATE.rawPosts = [];
      PROMO_STATE.lastData = prData;
      PROMO_STATE.channelsScanned = prData.channels_scanned || [];
      applyFlashPromosToCatalog();
      checkAndFireDealNotifications(false);
      renderPromoRadarPanel();
      if (statusEl) {
        statusEl.textContent = `Radar México ($ MXN): Sincronizado às ${prData.scanned_at || 'agora'} • ${prData.matched_deals.length} ofertas en tiendas MX`;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
    return;
  }

  // Always refresh notified history and coupon status ledger before evaluating deals
  await Promise.all([
    syncNotifiedHistoryFromServer(),
    syncCouponStatusFromServer()
  ]);

  // If only changing the time-window filter and we already have rawPosts in memory or localStorage (<15 min old),
  // re-filter 100% locally in the browser with ZERO network requests!
  if (!force && !extraQ && !extraCh) {
    if (!PROMO_STATE.rawPosts.length) {
      const activeRegId = (window.STATE?.market?.region_id || 'br').toLowerCase();
      // 1. Check if DB has embedded live_promos matching the active region
      if (activeRegId === 'br' && typeof DB !== 'undefined' && DB && DB.live_promos && Array.isArray(DB.live_promos.matched_deals) && DB.live_promos.matched_deals.length > 0) {
        PROMO_STATE.lastData = DB.live_promos;
        PROMO_STATE.channelsScanned = DB.live_promos.channels_scanned || [];
        applyFlashPromosToCatalog();
        checkAndFireDealNotifications(false);
        renderPromoRadarPanel();
        if (statusEl) {
          statusEl.textContent = `Nuvem GitHub: Sincronizado às ${DB.live_promos.scanned_at} • ${DB.live_promos.matched_count} ofertas ativas`;
        }
        return;
      }

      // 2. Check localStorage cache
      try {
        const cached = JSON.parse(localStorage.getItem(getPromoCacheKey()) || 'null');
        if (cached && cached.ts && (Date.now() - cached.ts < 15 * 60 * 1000) && Array.isArray(cached.rawPosts)) {
          PROMO_STATE.rawPosts = cached.rawPosts;
          PROMO_STATE.channelsScanned = cached.channelsScanned || [];
        }
      } catch (_) {}
    }
    if (PROMO_STATE.rawPosts.length) {
      PROMO_STATE.lastData = buildPromoPayloadClient(PROMO_STATE.rawPosts, PROMO_STATE.channelsScanned, maxAge);
      applyFlashPromosToCatalog();
      checkAndFireDealNotifications(false);
      renderPromoRadarPanel();
      if (statusEl) {
        statusEl.textContent = `Processado no seu navegador (cache local) • ${PROMO_STATE.channelsScanned.length} canais`;
      }
      return;
    }
  }

  if (statusEl) statusEl.textContent = 'Processando ofertas no seu navegador (client-side)...';
  if (btn) btn.disabled = true;

  try {
    const channels = [...getClientPromoChannels()];
    if (extraCh) {
      extraCh.split(',').forEach(raw => {
        const id = raw.trim().replace(/^@/, '').split('/').pop();
        if (id && !channels.some(c => c.id.toLowerCase() === id.toLowerCase())) {
          channels.push({ id, name: `@${id}` });
        }
      });
    }
    const queries = [...getClientPromoQueries()];
    if (extraQ && !queries.includes(extraQ)) queries.push(extraQ);

    const tasks = [];
    channels.forEach(ch => {
      queries.forEach(q => {
        tasks.push(
          fetch(`/api/tg-raw?ch=${encodeURIComponent(ch.id)}&q=${encodeURIComponent(q)}`)
            .then(r => (r.ok ? r.text() : ''))
            .then(htmlStr => (htmlStr ? parseTelegramHTMLInBrowser(htmlStr, ch.id, ch.name) : []))
            .catch(() => [])
        );
      });
    });

    const nested = await Promise.all(tasks);
    const allRaw = nested.flat();

    if (allRaw.length === 0) {
      try {
        const regId = (window.STATE?.market?.region_id || 'br').toLowerCase();
        let prData = null;
        try {
          const apiRes = await fetch(`/api/promos?max_age=${maxAge}&region=${encodeURIComponent(regId)}&market=${encodeURIComponent(regId)}` + (force ? '&force=1' : ''));
          if (apiRes.ok) prData = await apiRes.json();
        } catch (_) {}

        if (!prData || !Array.isArray(prData.matched_deals) || prData.matched_deals.length === 0) {
          const cacheUrl = regId === 'br' ? 'data/promos_cache.json' : `data/promos_cache_${regId}.json`;
          const prRes = await fetch(cacheUrl + '?t=' + Date.now());
          if (prRes.ok) prData = await prRes.json();
        }

        if ((!prData || !Array.isArray(prData.matched_deals) || prData.matched_deals.length === 0) && regId === 'br') {
          const prRes = await fetch('data/promos_cache.json?t=' + Date.now());
          if (prRes.ok) prData = await prRes.json();
        }

        if (prData && Array.isArray(prData.matched_deals) && prData.matched_deals.length > 0) {
          PROMO_STATE.lastData = prData;
          PROMO_STATE.channelsScanned = prData.channels_scanned || [];
          applyFlashPromosToCatalog();
          checkAndFireDealNotifications(false);
          renderPromoRadarPanel();
          if (statusEl) {
            const sym = window.STATE?.market?.monetary?.currency_symbol || 'R$';
            const regName = window.STATE?.market?.region_name || 'Região';
            statusEl.textContent = `Promoções ${regName} (${sym}): Sincronizado às ${prData.scanned_at || 'recente'} • ${prData.matched_deals.length} ofertas ativas`;
          }
          return;
        }
      } catch (_) {}
    }

    PROMO_STATE.rawPosts = allRaw;
    PROMO_STATE.channelsScanned = channels.map(c => c.id);

    try {
      localStorage.setItem(getPromoCacheKey(), JSON.stringify({
        ts: Date.now(),
        channelsScanned: PROMO_STATE.channelsScanned,
        rawPosts: allRaw.slice(0, 350)
      }));
    } catch (_) {}

    const data = buildPromoPayloadClient(allRaw, PROMO_STATE.channelsScanned, maxAge);
    PROMO_STATE.lastData = data;
    applyFlashPromosToCatalog();
    checkAndFireDealNotifications(false);
    renderPromoRadarPanel();
    if (statusEl) {
      statusEl.textContent = `Processado no seu navegador às ${data.scanned_at} • ${data.channels_scanned.length} canais`;
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Erro ao buscar páginas brutas de promoção.';
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderPromoRadarPanel() {
  const data = PROMO_STATE.lastData;
  if (!data) return;

  const matchedEl = document.getElementById('promo-matched-list');
  const feedEl = document.getElementById('promo-general-feed');
  const sumEl = document.getElementById('promo-matched-summary');
  const sitewiseEl = document.getElementById('sitewise-validator-text');

  const deals = data.matched_deals || [];
  const cheaperCount = deals.filter(d => d.savings_vs_hb_brl > 0).length;
  const hotCount = deals.filter(d => d.is_high_cb || d.is_pechincha).length;
  if (sumEl) {
    sumEl.textContent = `${deals.length} ofertas (${cheaperCount} abaixo do Catálogo • ${hotCount} 🔔 alertas CB/Pechincha)`;
  }
  if (sitewiseEl) {
    const cCount = Object.keys((PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.coupons) || {}).length;
    const timeStr = data.last_sitewise_test_at || data.scanned_at || '';
    sitewiseEl.textContent = `Validador Sitewise 24/7 Ativo: ${cCount} cupons/links validados continuamente${timeStr ? ` (${timeStr})` : ''}`;
  }

  if (matchedEl) {
    matchedEl.innerHTML = deals.length === 0
      ? '<div class="text-xs text-slate-400 p-3">Nenhuma oferta mapeada na janela selecionada. Aumente para 48h ou 96h.</div>'
      : deals.map(d => {
          const isCheaper = d.savings_vs_hb_brl > 0;
          const isHot = d.is_high_cb || d.is_pechincha;
          const isCouponExpired = d.is_coupon_expired || d.coupon_status === 'expired';
          const isOutOfStock = d.is_expired || d.deal_status === 'out_of_stock';
          const rawCoup = d.coupon_code || d.coupon_info;
          let couponBadge = '';
          if (rawCoup) {
            const cleanCoup = (d.coupon_code || rawCoup).replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase() || rawCoup;
            const uStat = typeof getCouponUserStatus === 'function' ? getCouponUserStatus(cleanCoup) : null;
            const isExp = isCouponExpired || (uStat && uStat.status === 'expired');
            const isWrk = !isCouponExpired && (d.coupon_status === 'active' || (uStat && uStat.status === 'working'));
            let freshTag = '';
            if (isExp) {
              freshTag = '<span class="text-rose-400 font-bold ml-1">❌ Expirado</span>';
            } else if (isWrk) {
              freshTag = '<span class="text-emerald-300 font-bold ml-1">✅ Ativo</span>';
            } else if (d.age_hours <= 2) {
              freshTag = '<span class="text-emerald-400 ml-1">🟢 Fresco</span>';
            } else if (d.age_hours > 8) {
              freshTag = '<span class="text-rose-400 ml-1">🔴 Risco</span>';
            }

            couponBadge = `
              <button onclick="copyCouponAndOpen('${cleanCoup}', '${d.buy_url || d.post_url}')" class="px-1.5 py-0.5 rounded ${isExp ? 'bg-rose-500/20 text-rose-300 line-through border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'} font-mono text-[10px] cursor-pointer inline-flex items-center gap-1" title="Clique para copiar cupom e testar na loja">
                🎟️ ${cleanCoup} 📋 ${freshTag}
              </button>
            `;
          } else if (!isOutOfStock) {
            couponBadge = `<span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-semibold" title="${d.deal_status_reason || 'Oferta direta no link sem cupom'}">⚡ Oferta Direta (Sem Cupom)</span>`;
          }
          const cbBadge = d.cb_score != null
            ? `<span class="px-1.5 py-0.5 rounded ${d.is_high_cb ? 'bg-purple-500/30 text-purple-200 border border-purple-400/50 font-extrabold' : 'bg-slate-800 text-slate-300'} font-mono text-[10px]">${d.is_high_cb ? '🏆 ' : ''}CB ${d.cb_score}/100</span>`
            : '';
          const pechBadge = d.is_pechincha
            ? `<span class="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-200 border border-rose-400/50 font-mono font-extrabold text-[10px]">🔥 PECHINCHA</span>`
            : '';
          const statusBadge = isOutOfStock
            ? `<span class="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-300 border border-rose-500/40 font-mono text-[10px] font-bold">⚠️ Esgotado</span>`
            : (isCouponExpired && d.coupon_discount_revoked
              ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 border border-amber-500/40 font-mono text-[10px] font-semibold">Preço Sem Cupom</span>`
              : '');
          const safeId = (d.post_id || '').replace(/[^a-zA-Z0-9]/g, '_');
          const cleanCoupCode = (d.coupon_code || '').replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase();
          const isTestedActive = !isOutOfStock && !isCouponExpired && (d.coupon_status === 'active' || d.deal_status === 'active');
          const testBtnClass = isTestedActive
            ? 'px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 font-semibold text-[11px] cursor-pointer inline-flex items-center gap-1'
            : 'px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-sky-400 border border-slate-700 font-semibold text-[11px] cursor-pointer inline-flex items-center gap-1';
          const testBtnLabel = isTestedActive ? '✅ Testado' : '🧪 Testar';
          return `
            <div class="p-3 rounded-xl bg-slate-950/80 border ${isOutOfStock ? 'border-rose-900/60 opacity-75' : isHot ? 'border-amber-400/60 shadow-md shadow-amber-500/10' : isCheaper ? 'border-emerald-500/40' : 'border-slate-800'} flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-bold text-[10px]">${d.matched_name}</span>
                  <span class="font-mono font-extrabold text-sm ${isOutOfStock ? 'text-slate-400 line-through' : isCheaper ? 'text-emerald-400' : 'text-white'}">
                    ${d.coupon_discount_revoked && d.raw_price_brl ? `<span class="line-through text-slate-500 text-xs mr-1">${fmtBRL(d.raw_price_brl - (d.discount_applied||0))}</span>` : ''}
                    ${fmtBRL(d.price_brl)}
                  </span>
                  ${isCheaper && !isOutOfStock
                    ? `<span class="text-[10px] font-mono text-emerald-300 font-bold">(−${fmtBRLShort(d.savings_vs_hb_brl)} vs Ref ${fmtBRLShort(d.hb_price_brl)})</span>`
                    : `<span class="text-[10px] font-mono text-slate-500">(Ref: ${fmtBRLShort(d.hb_price_brl)})</span>`}
                  ${cbBadge}
                  ${pechBadge}
                  ${statusBadge}
                  ${couponBadge}
                </div>
                <div class="text-[11px] text-slate-300 truncate max-w-xl" title="${d.title}">${d.title}</div>
                <div class="text-[10px] font-mono text-slate-500">
                  Canal: <a href="${d.post_url}" target="_blank" class="text-sky-400 hover:underline">@${d.channel_id} ↗</a> • há ${d.age_hours}h
                  ${d.coupon_url ? ` • <a href="${d.coupon_url}" target="_blank" class="text-amber-300 hover:underline">Resgatar Cupom ↗</a>` : ''}
                  ${d.coupon_status_reason ? ` • <span class="text-amber-400/90">${d.coupon_status_reason}</span>` : ''}
                  ${d.deal_status_reason ? ` • <span class="text-rose-400/90">${d.deal_status_reason}</span>` : ''}
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button id="btn-test-${safeId}" onclick="testDealCouponNow('${d.post_id}', '${d.buy_url}', '${cleanCoupCode}', ${d.price_brl})" class="${testBtnClass}" title="Testar se o cupom e link continuam ativos na loja">
                  ${testBtnLabel}
                </button>
                <button onclick="sendPromoToDuelOrBF('${d.matched_kind}', '${d.matched_slug}', ${d.price_brl})" class="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-300 font-semibold text-[11px] cursor-pointer">
                  ${d.matched_kind === 'gpu' ? 'Duelo' : 'Testar BF'}
                </button>
                <a href="${d.buy_url}" target="_blank" class="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px]">
                  Oferta ↗
                </a>
              </div>
            </div>`;
        }).join('');
  }

  if (feedEl) {
    const feed = data.recent_feed || [];
    feedEl.innerHTML = feed.map(f => `
      <div class="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-xs flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="font-mono font-bold text-emerald-400">${fmtBRL(f.price_brl)}</span>
            ${f.coupon_code ? `<span class="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[9px]">🎟️ ${f.coupon_code}</span>` : ''}
            <span class="text-[10px] font-mono text-slate-500">@${f.channel_id} • ${f.age_hours}h</span>
          </div>
          <div class="text-[11px] text-slate-300 truncate" title="${f.title}">${f.title}</div>
        </div>
        <a href="${f.buy_url}" target="_blank" class="px-2 py-1 rounded bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-sky-300 text-[10px] font-semibold shrink-0">Abrir ↗</a>
      </div>
    `).join('');
  }
}

async function testDealCouponNow(postId, buyUrl, couponCode, expectedPrice) {
  const safeId = (postId || '').replace(/[^a-zA-Z0-9]/g, '_');
  const btn = document.getElementById(`btn-test-${safeId}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin">⏳</span> Testando...`;
  }

  try {
    const q = new URLSearchParams({
      url: buyUrl || '',
      code: couponCode || '',
      price: expectedPrice || '',
      post_id: postId || ''
    });
    const resp = await fetch(`/api/test-coupon?${q.toString()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const res = data.result || {};

    if (!PROMO_STATE.couponStatus) PROMO_STATE.couponStatus = { coupons: {}, deals: {} };
    if (!PROMO_STATE.couponStatus.coupons) PROMO_STATE.couponStatus.coupons = {};
    if (!PROMO_STATE.couponStatus.deals) PROMO_STATE.couponStatus.deals = {};

    if (res.status === 'expired' || res.status === 'out_of_stock') {
      if (couponCode) {
        PROMO_STATE.couponStatus.coupons[couponCode.toUpperCase()] = {
          status: 'expired',
          reason: res.reason,
          updated_at: new Date().toLocaleTimeString('pt-BR')
        };
      }
      if (postId) {
        PROMO_STATE.couponStatus.deals[postId] = {
          status: res.status,
          reason: res.reason,
          updated_at: new Date().toLocaleTimeString('pt-BR')
        };
        PROMO_STATE.couponStatus.deals[postId.toLowerCase()] = PROMO_STATE.couponStatus.deals[postId];
      }
      if (buyUrl) {
        PROMO_STATE.couponStatus.deals[buyUrl] = {
          status: res.status,
          reason: res.reason,
          updated_at: new Date().toLocaleTimeString('pt-BR')
        };
      }
      localStorage.setItem('gpuAnalyzerCouponStatus_v1', JSON.stringify(PROMO_STATE.couponStatus));
      fetch('/api/mark-coupon-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coupon_code: couponCode || null,
          post_id: postId || null,
          url: buyUrl || null,
          status: res.status,
          reason: res.reason
        })
      }).catch(() => {});

      if (btn) {
        btn.disabled = false;
        btn.className = "px-2 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold text-[11px]";
        btn.innerHTML = `❌ Expirado`;
        btn.title = res.reason;
      }

      if (PROMO_STATE.lastData && Array.isArray(PROMO_STATE.lastData.matched_deals)) {
        PROMO_STATE.lastData.matched_deals.forEach(d => {
          if (d.post_id === postId) {
            d.is_expired = true;
            d.deal_status = res.status;
            d.deal_status_reason = res.reason;
          }
        });
      }

      if (PROMO_STATE.rawPosts && PROMO_STATE.rawPosts.length) {
        PROMO_STATE.lastData = buildPromoPayloadClient(PROMO_STATE.rawPosts, PROMO_STATE.channelsScanned, 48);
      }
      applyFlashPromosToCatalog();
      renderPromoRadarPanel();
      if (typeof onBFTargetItemChange === 'function') onBFTargetItemChange(true);

      if (typeof showWebToastNotification === 'function') {
        showWebToastNotification(
          `❌ Oferta Encerrada`,
          `${res.reason}`
        );
      }
    } else {
      if (couponCode) {
        PROMO_STATE.couponStatus.coupons[couponCode.toUpperCase()] = {
          status: 'active',
          reason: res.reason,
          updated_at: new Date().toLocaleTimeString('pt-BR')
        };
      }
      if (postId) {
        PROMO_STATE.couponStatus.deals[postId] = {
          status: 'active',
          reason: res.reason,
          updated_at: new Date().toLocaleTimeString('pt-BR')
        };
        PROMO_STATE.couponStatus.deals[postId.toLowerCase()] = PROMO_STATE.couponStatus.deals[postId];
      }
      if (buyUrl) {
        PROMO_STATE.couponStatus.deals[buyUrl] = {
          status: 'active',
          reason: res.reason,
          updated_at: new Date().toLocaleTimeString('pt-BR')
        };
      }
      localStorage.setItem('gpuAnalyzerCouponStatus_v1', JSON.stringify(PROMO_STATE.couponStatus));
      if (btn) {
        btn.disabled = false;
        btn.className = "px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold text-[11px]";
        btn.innerHTML = `✅ Ativo`;
      }
      if (typeof onBFTargetItemChange === 'function') onBFTargetItemChange(true);
      if (typeof showWebToastNotification === 'function') {
        showWebToastNotification(`✅ Oferta Ativa!`, `${res.reason}`);
      }
    }
    if (typeof onBFTargetItemChange === 'function') onBFTargetItemChange(true);
  } catch (err) {
    console.warn('Erro ao testar cupom:', err);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `🧪 Testar`;
    }
  }
}

async function testAllRadarCoupons() {
  const btn = document.getElementById('btn-test-all-coupons');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin">⏳</span> Testando Cupons...`;
  }

  const deals = (PROMO_STATE.lastData && PROMO_STATE.lastData.matched_deals) || [];
  const toTest = deals.slice(0, 10);
  let tested = 0;
  let expiredCount = 0;

  for (const d of toTest) {
    try {
      const q = new URLSearchParams({
        url: d.buy_url || '',
        code: d.coupon_code || '',
        price: d.price_brl || '',
        post_id: d.post_id || ''
      });
      const resp = await fetch(`/api/test-coupon?${q.toString()}`);
      if (resp.ok) {
        const data = await resp.json();
        const res = data.result || {};
        if (res.status === 'expired' || res.status === 'out_of_stock') {
          expiredCount++;
          if (d.coupon_code) {
            PROMO_STATE.couponStatus.coupons[d.coupon_code.toUpperCase()] = {
              status: 'expired',
              reason: res.reason,
              updated_at: new Date().toLocaleTimeString('pt-BR')
            };
          }
          if (d.post_id) {
            PROMO_STATE.couponStatus.deals[d.post_id] = {
              status: res.status,
              reason: res.reason,
              updated_at: new Date().toLocaleTimeString('pt-BR')
            };
            PROMO_STATE.couponStatus.deals[d.post_id.toLowerCase()] = PROMO_STATE.couponStatus.deals[d.post_id];
          }
          if (d.buy_url) {
            PROMO_STATE.couponStatus.deals[d.buy_url] = {
              status: res.status,
              reason: res.reason,
              updated_at: new Date().toLocaleTimeString('pt-BR')
            };
          }
        }
      }
    } catch (_) {}
    tested++;
  }

  localStorage.setItem('gpuAnalyzerCouponStatus_v1', JSON.stringify(PROMO_STATE.couponStatus));
  if (PROMO_STATE.rawPosts && PROMO_STATE.rawPosts.length) {
    PROMO_STATE.lastData = buildPromoPayloadClient(PROMO_STATE.rawPosts, PROMO_STATE.channelsScanned, 48);
  }
  applyFlashPromosToCatalog();
  renderPromoRadarPanel();

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<span>🧪 Testar Cupons & Links</span>`;
  }

  if (typeof showWebToastNotification === 'function') {
    showWebToastNotification(
      `🧪 Teste Concluído (${tested} ofertas)`,
      expiredCount > 0
        ? `${expiredCount} ofertas/cupons expirados foram reconfigurados para liberar novos preços!`
        : `Todas as ofertas testadas continuam válidas e ativas nas lojas.`
    );
  }
}
