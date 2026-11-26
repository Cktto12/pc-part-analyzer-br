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
      simGraphics: STATE.simGraphics,
      comparisonScaleMode: STATE.comparisonScaleMode,
      simCompareEnabled: STATE.simCompareEnabled !== false,
      simGpuASlug: STATE.simGpuASlug || '',
      simGpuBSlug: STATE.simGpuBSlug || '',
      simCpuASlug: STATE.simCpuASlug || '',
      simCpuBSlug: STATE.simCpuBSlug || '',
      simLaptopASlug: STATE.simLaptopASlug || '',
      simLaptopBSlug: STATE.simLaptopBSlug || '',
      wGaming: STATE.wGaming, wWorkstation: STATE.wWorkstation, wAI: STATE.wAI, wSoft: STATE.wSoft,
      workloadIntensity: STATE.workloadIntensity,
      techWeights: STATE.techWeights,
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
  STATE.simGraphics = { preset: 3, dlss: false, fsr: false, mfg: false, mfgMult: 'auto' };
  STATE.simCompareEnabled = true;
  STATE.games = JSON.parse(JSON.stringify(DEFAULT_GAMES));
  STATE.bfRanges = {};
  STATE.upg = { cpu: {}, mobo: {}, reuseRam: true };
  STATE.focusGameId = 'cyberpunk';
  STATE.showGameEditor = false;
  STATE.workloadIntensity = { gaming: 3, workstation: 3, localAI: 3, aiTraining: 3 };
  STATE.techWeights = { dlss5: 35, fsr: 25, rayTracing: 30, pathTracing: 15 };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (p) {
      if (p.monitorRes && MONITOR_RES[p.monitorRes]) STATE.monitorRes = p.monitorRes;
      if (p.monitorMaxFps) STATE.monitorMaxFps = p.monitorMaxFps;
      if (p.dlssMode && ['perceived', 'sr', 'native', 'max_fg'].includes(p.dlssMode)) STATE.dlssMode = p.dlssMode;
      if (p.simGraphics && typeof p.simGraphics === 'object') {
        const pr = parseInt(p.simGraphics.preset, 10);
        const mult = p.simGraphics.mfgMult;
        STATE.simGraphics = {
          preset: isNaN(pr) ? 3 : Math.max(0, Math.min(4, pr)),
          dlss: !!p.simGraphics.dlss,
          fsr: !!p.simGraphics.fsr,
          mfg: !!p.simGraphics.mfg,
          mfgMult: (mult === 'auto' || mult === 2 || mult === 3 || mult === 4 || mult === '2' || mult === '3' || mult === '4')
            ? (mult === 'auto' ? 'auto' : parseInt(mult, 10))
            : 'auto'
        };
      }
      if (p.comparisonScaleMode && ['relative', 'absolute'].includes(p.comparisonScaleMode)) STATE.comparisonScaleMode = p.comparisonScaleMode;
      if (typeof p.simCompareEnabled === 'boolean') STATE.simCompareEnabled = p.simCompareEnabled;
      if (typeof p.simGpuASlug === 'string' && p.simGpuASlug) STATE.simGpuASlug = p.simGpuASlug;
      if (typeof p.simGpuBSlug === 'string' && p.simGpuBSlug) STATE.simGpuBSlug = p.simGpuBSlug;
      if (typeof p.simCpuASlug === 'string' && p.simCpuASlug) STATE.simCpuASlug = p.simCpuASlug;
      if (typeof p.simCpuBSlug === 'string' && p.simCpuBSlug) STATE.simCpuBSlug = p.simCpuBSlug;
      if (typeof p.simLaptopASlug === 'string' && p.simLaptopASlug) STATE.simLaptopASlug = p.simLaptopASlug;
      if (typeof p.simLaptopBSlug === 'string' && p.simLaptopBSlug) STATE.simLaptopBSlug = p.simLaptopBSlug;
      if (typeof p.wGaming === 'number') {
        STATE.wGaming = p.wGaming;
        if (typeof p.wWorkstation === 'number') STATE.wWorkstation = p.wWorkstation;
        STATE.wAI = p.wAI;
        STATE.wSoft = p.wSoft;
      }
      if (p.workloadIntensity && typeof p.workloadIntensity === 'object') {
        ['gaming', 'workstation', 'localAI', 'aiTraining'].forEach(k => {
          const v = parseInt(p.workloadIntensity[k], 10);
          if (!isNaN(v)) STATE.workloadIntensity[k] = Math.max(1, Math.min(5, v));
        });
      }
      if (p.techWeights && typeof p.techWeights === 'object') {
        ['dlss5', 'fsr', 'rayTracing', 'pathTracing'].forEach(k => {
          const v = parseInt(p.techWeights[k], 10);
          if (!isNaN(v)) STATE.techWeights[k] = Math.max(0, Math.min(100, v));
        });
      }
      if (Array.isArray(p.games) && p.games.length) STATE.games = p.games;
      if (p.bfRanges) STATE.bfRanges = p.bfRanges;
      if (p.upg) {
        STATE.upg = Object.assign({ cpu: {}, mobo: {}, reuseRam: true }, p.upg);
        if (!STATE.upg.mobo) STATE.upg.mobo = {};
        if (!STATE.upg.cpu) STATE.upg.cpu = {};
      }
    }
    const rawInt = localStorage.getItem('gca_workload_intensity');
    if (rawInt) {
      const wi = JSON.parse(rawInt);
      if (wi && typeof wi === 'object') {
        ['gaming', 'workstation', 'localAI', 'aiTraining'].forEach(k => {
          const v = parseInt(wi[k], 10);
          if (!isNaN(v)) STATE.workloadIntensity[k] = Math.max(1, Math.min(5, v));
        });
      }
    }
    const rawTech = localStorage.getItem('gca_tech_weights');
    if (rawTech) {
      const tw = JSON.parse(rawTech);
      if (tw && typeof tw === 'object') {
        ['dlss5', 'fsr', 'rayTracing', 'pathTracing'].forEach(k => {
          const v = parseInt(tw[k], 10);
          if (!isNaN(v)) STATE.techWeights[k] = Math.max(0, Math.min(100, v));
        });
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
  [['gaming', STATE.wGaming], ['workstation', STATE.wWorkstation !== undefined ? STATE.wWorkstation : 35], ['ai', STATE.wAI], ['soft', STATE.wSoft]].forEach(([k, v]) => {
    const sl = document.getElementById(`slider-w-${k}`);
    if (sl) sl.value = v;
    const nm = document.getElementById(`num-w-${k}`);
    if (nm) nm.value = v;
  });
  if (typeof syncWorkloadIntensityUI === 'function') syncWorkloadIntensityUI();
  if (typeof syncTechWeightsUI === 'function') syncTechWeightsUI();
  if (typeof syncSimCompareUI === 'function') syncSimCompareUI();
  if (typeof syncSimGraphicsUI === 'function') syncSimGraphicsUI();
}

function getSimGraphicsState() {
  if (!STATE.simGraphics || typeof STATE.simGraphics !== 'object') {
    STATE.simGraphics = { preset: 3, dlss: false, fsr: false, mfg: false, mfgMult: 'auto' };
  }
  const p = parseInt(STATE.simGraphics.preset, 10);
  STATE.simGraphics.preset = isNaN(p) ? 3 : Math.max(0, Math.min(4, p));
  return STATE.simGraphics;
}
window.getSimGraphicsState = getSimGraphicsState;

function syncSimGraphicsUI() {
  const sg = getSimGraphicsState();
  const presetMeta = (typeof SIM_QUALITY_PRESETS !== 'undefined' && SIM_QUALITY_PRESETS[sg.preset])
    ? SIM_QUALITY_PRESETS[sg.preset]
    : { label: 'Alto', shortLabel: 'Alto', desc: 'Qualidade alta padrão.' };

  ['sim', 'sim-laptop'].forEach(prefix => {
    const slider = document.getElementById(`${prefix}-preset-slider`);
    if (slider) {
      slider.value = String(sg.preset);
      slider.setAttribute('aria-valuetext', presetMeta.label);
    }
    const badge = document.getElementById(`${prefix}-preset-active-badge`);
    if (badge) {
      badge.textContent = presetMeta.label;
      badge.className = `ui-badge ui-mono ${sg.preset === 4 ? 'ui-badge--warn' : 'ui-badge--brand'}`;
    }
    const descEl = document.getElementById(`${prefix}-preset-desc`);
    if (descEl) descEl.textContent = presetMeta.desc;

    const stepsWrap = document.getElementById(`${prefix}-preset-step-labels`);
    if (stepsWrap) {
      stepsWrap.querySelectorAll('[data-preset]').forEach(btn => {
        const active = parseInt(btn.getAttribute('data-preset'), 10) === sg.preset;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    [['dlss', sg.dlss], ['fsr', sg.fsr], ['mfg', sg.mfg]].forEach(([k, active]) => {
      const btn = document.getElementById(`${prefix}-toggle-${k}`);
      if (btn) {
        btn.classList.toggle('is-active', !!active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    });

    const mfgWrap = document.getElementById(`${prefix}-mfg-mult-wrap`);
    if (mfgWrap) {
      mfgWrap.classList.toggle('hidden', !sg.mfg);
      mfgWrap.querySelectorAll('[data-mfg-mult]').forEach(btn => {
        const val = btn.getAttribute('data-mfg-mult');
        const active = String(sg.mfgMult || 'auto') === String(val);
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
  });

  const sDlss = document.getElementById('sim-select-upscale');
  if (sDlss) {
    sDlss.value = sg.mfg ? 'max_fg' : ((sg.dlss || sg.fsr) ? 'sr' : 'native');
  }
}
window.syncSimGraphicsUI = syncSimGraphicsUI;

function _rerenderActiveSimulator() {
  if (STATE.context === 'laptop' && typeof renderLaptopSimulator === 'function') {
    renderLaptopSimulator();
  } else if (typeof renderSimulator === 'function') {
    renderSimulator();
  }
}

function setSimQualityPreset(val) {
  const sg = getSimGraphicsState();
  const num = parseInt(val, 10);
  sg.preset = isNaN(num) ? 3 : Math.max(0, Math.min(4, num));
  saveUserPrefs();
  syncSimGraphicsUI();
  _rerenderActiveSimulator();
}
window.setSimQualityPreset = setSimQualityPreset;

function toggleSimTech(key) {
  if (!['dlss', 'fsr', 'mfg'].includes(key)) return;
  const sg = getSimGraphicsState();
  sg[key] = !sg[key];
  saveUserPrefs();
  syncSimGraphicsUI();
  _rerenderActiveSimulator();
}
window.toggleSimTech = toggleSimTech;

function setSimMfgMult(val) {
  const sg = getSimGraphicsState();
  sg.mfgMult = val === 'auto' ? 'auto' : Math.max(2, Math.min(4, parseInt(val, 10) || 4));
  saveUserPrefs();
  syncSimGraphicsUI();
  _rerenderActiveSimulator();
}
window.setSimMfgMult = setSimMfgMult;

function onGlobalDlssModeChange(val) {
  STATE.dlssMode = val || 'perceived';
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
  if (typeof renderSimulator === 'function') renderSimulator();
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
  'ryzen-7-7800x3d': 89, 'ryzen-9-7950x3d': 88, 'ryzen-7-7700x3d': 86, 'ryzen-9-7900x3d': 84, 'ryzen-5-7600x3d': 82,
  'ryzen-9-9950x': 83, 'ryzen-9-9900x': 81, 'ryzen-7-9700x': 80, 'ryzen-5-9600x': 78,
  'ryzen-9-7950x': 79, 'ryzen-9-7900x': 77, 'ryzen-9-7900': 75, 'ryzen-7-7700x': 76, 'ryzen-7-7700': 75,
  'ryzen-5-7600x': 73, 'ryzen-5-7600': 71, 'ryzen-5-7500f': 70, 'ryzen-5-7500': 70, 'ryzen-5-7400f': 67,
  'ryzen-7-8700f': 66, 'ryzen-7-8700g': 66, 'ryzen-5-8600g': 62, 'ryzen-5-8400f': 60, 'ryzen-5-8500g': 55,
  'ryzen-7-5800x3d': 74, 'ryzen-7-5700x3d': 71, 'ryzen-5-5500x3d': 66,
  'ryzen-9-5950x': 62, 'ryzen-9-5900xt': 62, 'ryzen-9-5900x': 61, 'ryzen-7-5800xt': 61, 'ryzen-7-5800x': 60,
  'ryzen-7-5700x': 58, 'ryzen-7-5700': 54, 'ryzen-7-5700g': 52, 'ryzen-5-5600x': 57, 'ryzen-5-5600xt': 57,
  'ryzen-5-5600': 56, 'ryzen-5-5600t': 55, 'ryzen-5-5600gt': 51, 'ryzen-5-5600g': 50, 'ryzen-5-5500gt': 50, 'ryzen-5-5600ge': 47, 'ryzen-5-5500': 49, 'ryzen-3-3200g': 33,
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
  'threadripper-7960x': 71, 'threadripper-7970x': 71, 'threadripper-7980x': 70, 'threadripper-pro-7965wx': 70, 'threadripper-7995wx': 69,
  'threadripper-pro-5995wx': 60, 'threadripper-pro-5975wx': 60,
  'threadripper-3960x': 52, 'threadripper-3970x': 52, 'threadripper-3990x': 51, 'threadripper-3995wx': 51,
  // Broadwell-EP 14C @ 2.4–3.3 GHz, high memory latency — very uncertain (see Xeon warning)
  'xeon-e5-2680-v4': 36
};

// Graphics Quality Presets (Very Low -> Ultra + Path Tracing) & Per-Game Hardware Profiles
const SIM_QUALITY_PRESETS = [
  {
    index: 0, id: 'very_low', label: 'Muito Baixo', shortLabel: 'M. Baixo',
    gpuRasterMult: 1.88, vramMult: 0.52, cpuCapMult: 1.08, rtMode: 'off',
    desc: 'Texturas, sombras e pós-processamento mínimos (sem RT) — maximiza GPU para revelar o teto real da CPU.'
  },
  {
    index: 1, id: 'low', label: 'Baixo', shortLabel: 'Baixo',
    gpuRasterMult: 1.52, vramMult: 0.66, cpuCapMult: 1.04, rtMode: 'off',
    desc: 'Qualidade leve e competitiva (sem Ray Tracing) — prioriza fluidez acima de fidelidade.'
  },
  {
    index: 2, id: 'medium', label: 'Médio', shortLabel: 'Médio',
    gpuRasterMult: 1.24, vramMult: 0.80, cpuCapMult: 1.00, rtMode: 'off',
    desc: 'Equilíbrio sólido entre nitidez e taxa de quadros sem carga de Ray Tracing.'
  },
  {
    index: 3, id: 'high', label: 'Alto', shortLabel: 'Alto',
    gpuRasterMult: 1.00, vramMult: 1.00, cpuCapMult: 1.00, rtMode: 'light',
    desc: 'Qualidade alta (referência calibrada; ativa RT padrão nos títulos preparados para Ray Tracing).'
  },
  {
    index: 4, id: 'ultra', label: 'Ultra (+ Path Tracing)', shortLabel: 'Ultra + PT',
    gpuRasterMult: 0.82, vramMult: 1.22, cpuCapMult: 0.94, rtMode: 'ultra_pt',
    desc: 'Fidelidade máxima: ativa Path Tracing completo nos jogos compatíveis e Ray Tracing Ultra + carga extra de VRAM e BVH na CPU.'
  }
];
window.SIM_QUALITY_PRESETS = SIM_QUALITY_PRESETS;

const GAME_SIM_PROFILES = {
  cyberpunk: { supportsPT: true,  supportsRT: true,  esports: false, supportsFG: true,  presetSens: 0.92, ptCost: 0.36, rtCost: 0.68, vramPtExtra: 3.2, vramRtExtra: 1.6, rtCpuMult: 0.82, ptCpuMult: 0.72, baselineHasLightRT: true },
  wukong:    { supportsPT: true,  supportsRT: true,  esports: false, supportsFG: true,  presetSens: 0.95, ptCost: 0.40, rtCost: 0.72, vramPtExtra: 2.8, vramRtExtra: 1.4, rtCpuMult: 0.85, ptCpuMult: 0.75 },
  alanwake2: { supportsPT: true,  supportsRT: true,  esports: false, supportsFG: true,  presetSens: 0.90, ptCost: 0.38, rtCost: 0.70, vramPtExtra: 3.0, vramRtExtra: 1.5, rtCpuMult: 0.84, ptCpuMult: 0.74 },
  minecraft: { supportsPT: true,  supportsRT: true,  esports: false, supportsFG: true,  presetSens: 0.88, ptCost: 0.44, rtCost: 0.76, vramPtExtra: 2.4, vramRtExtra: 1.2, rtCpuMult: 0.86, ptCpuMult: 0.76 },
  hogwarts:  { supportsPT: false, supportsRT: true,  esports: false, supportsFG: true,  presetSens: 0.85, ptCost: 1.00, rtCost: 0.68, vramPtExtra: 0,   vramRtExtra: 2.2, rtCpuMult: 0.80, ptCpuMult: 0.80 },
  forza5:    { supportsPT: false, supportsRT: true,  esports: false, supportsFG: true,  presetSens: 0.78, ptCost: 1.00, rtCost: 0.84, vramPtExtra: 0,   vramRtExtra: 1.0, rtCpuMult: 0.90, ptCpuMult: 0.90 },
  fortnite:  { supportsPT: false, supportsRT: true,  esports: true,  supportsFG: true,  presetSens: 1.15, ptCost: 1.00, rtCost: 0.66, vramPtExtra: 0,   vramRtExtra: 1.6, rtCpuMult: 0.82, ptCpuMult: 0.82 },
  rdr2:      { supportsPT: false, supportsRT: false, esports: false, supportsFG: true,  presetSens: 0.82, ptCost: 1.00, rtCost: 1.00, vramPtExtra: 0,   vramRtExtra: 0,   rtCpuMult: 1.00, ptCpuMult: 1.00 },
  bg3:       { supportsPT: false, supportsRT: false, esports: false, supportsFG: true,  presetSens: 0.60, ptCost: 1.00, rtCost: 1.00, vramPtExtra: 0,   vramRtExtra: 0,   rtCpuMult: 1.00, ptCpuMult: 1.00 },
  msfs2024:  { supportsPT: false, supportsRT: true,  esports: false, supportsFG: true,  presetSens: 0.65, ptCost: 1.00, rtCost: 0.88, vramPtExtra: 0,   vramRtExtra: 1.5, rtCpuMult: 0.90, ptCpuMult: 0.90 },
  starfield: { supportsPT: false, supportsRT: false, esports: false, supportsFG: true,  presetSens: 0.72, ptCost: 1.00, rtCost: 1.00, vramPtExtra: 0,   vramRtExtra: 0,   rtCpuMult: 1.00, ptCpuMult: 1.00 },
  warzone:   { supportsPT: false, supportsRT: false, esports: true,  supportsFG: true,  presetSens: 0.82, ptCost: 1.00, rtCost: 1.00, vramPtExtra: 0,   vramRtExtra: 0,   rtCpuMult: 1.00, ptCpuMult: 1.00 },
  cs2:       { supportsPT: false, supportsRT: false, esports: true,  supportsFG: false, presetSens: 0.70, ptCost: 1.00, rtCost: 1.00, vramPtExtra: 0,   vramRtExtra: 0,   rtCpuMult: 1.00, ptCpuMult: 1.00 },
  valorant:  { supportsPT: false, supportsRT: false, esports: true,  supportsFG: false, presetSens: 0.55, ptCost: 1.00, rtCost: 1.00, vramPtExtra: 0,   vramRtExtra: 0,   rtCpuMult: 1.00, ptCpuMult: 1.00 }
};
window.GAME_SIM_PROFILES = GAME_SIM_PROFILES;

function getGameSimProfile(game) {
  if (!game) return { supportsPT: false, supportsRT: false, esports: false, supportsFG: true, presetSens: 0.82, ptCost: 1.0, rtCost: 1.0, vramPtExtra: 0, vramRtExtra: 0, rtCpuMult: 1.0, ptCpuMult: 1.0 };
  if (game.id && GAME_SIM_PROFILES[game.id]) return GAME_SIM_PROFILES[game.id];
  const t = String(game.title || '').toLowerCase();
  if (/cyberpunk/.test(t)) return GAME_SIM_PROFILES.cyberpunk;
  if (/wukong/.test(t)) return GAME_SIM_PROFILES.wukong;
  if (/alan wake/.test(t)) return GAME_SIM_PROFILES.alanwake2;
  if (/minecraft/.test(t)) return GAME_SIM_PROFILES.minecraft;
  if (/cs2|counter-strike|valorant/.test(t)) return GAME_SIM_PROFILES.cs2;
  return {
    supportsPT: !!game.pt,
    supportsRT: !!(game.rt || /\brt\b|ray tracing/i.test(game.title || '')),
    esports: isCompetitiveEsportsGame(game),
    supportsFG: !(/cs2|valorant/i.test(game.id || '') || /counter-strike|valorant/i.test(game.title || '')),
    presetSens: 0.82,
    ptCost: 0.42,
    rtCost: 0.74,
    vramPtExtra: 2.8,
    vramRtExtra: 1.4,
    rtCpuMult: 0.86,
    ptCpuMult: 0.76
  };
}
window.getGameSimProfile = getGameSimProfile;

function getSimGameDisplayTitle(game) {
  if (!game) return '';
  const raw = String(game.title || '');
  if (!game.id || !GAME_SIM_PROFILES[game.id]) return raw;
  return raw
    .replace(/\s*\(RT Ultra\)/i, '')
    .replace(/\s*\((High|Ultra|Alto|Extremo)\)/i, '')
    .replace(/\s*\(DX12 Alto, sem RT\)/i, '')
    .replace(/\s*\(Ultra — (Ato \d+)\)/i, ' ($1)')
    .trim();
}
window.getSimGameDisplayTitle = getSimGameDisplayTitle;

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
  if (/threadripper/i.test(cpu.slug)) {
    if (/79\d{2}/.test(cpu.slug || '')) return 70;
    if (/59\d{2}/.test(cpu.slug || '')) return 60;
    return 52;
  }
  const b = cpu.benchmark || 3000;
  const scf = cpu.single_core_factor ? Math.max(0.60, Math.min(1.30, Number(cpu.single_core_factor))) : null;
  if (scf) return Math.max(28, Math.min(88, Math.round(scf * 66 + (b / 600))));
  return Math.max(36, Math.min(82, Math.round(30 + b / 250)));
}

function getSimCpu(setupKey = 'a') {
  if (setupKey === 'b') {
    const selB = document.getElementById('sim-select-cpu-b');
    const slugB = (selB && selB.value) || STATE.simCpuBSlug || 'ryzen-7-7800x3d';
    return (DB.cpus || []).find(c => c.slug === slugB) || (DB.cpus || [])[1] || (DB.cpus || [])[0];
  }
  const selA = document.getElementById('sim-select-cpu-a') || document.getElementById('sim-select-cpu');
  const slugA = (selA && selA.value) || STATE.simCpuASlug || (STATE.build && STATE.build.cpu && STATE.build.cpu.slug) || 'ryzen-5-5600';
  return (DB.cpus || []).find(c => c.slug === slugA) || (DB.cpus || [])[0];
}

// ============================================================================
// 2B. HARDWARE CAPABILITIES (RT / PT / DLSS / FSR / MFG), PRESETS & CPU CEILING
// ============================================================================
function getGpuHardwareCapabilities(gpu) {
  const s = String(gpu && gpu.slug || '').toLowerCase();
  const n = String(gpu && gpu.name || '').toLowerCase();
  const arch = String(gpu && gpu.arch || '').toLowerCase();
  const brand = String(gpu && gpu.brand || gpu && gpu.gpu_brand || '').toUpperCase();
  const vram = Number(gpu && (gpu.vram_gb ?? gpu.gpu_vram_gb) || 8);

  const isApple = brand === 'APPLE' || !!(gpu && gpu.is_apple_unified) || /apple m\d/i.test(n);
  const isIntegrated = /integrated|igpu|radeon \d+0m|vega \d|iris/i.test(arch + ' ' + n) && !gpu.gpu_is_dedicated;
  const isGtx = /\bgtx[\s-]/i.test(s + ' ' + n);

  // Detect true GPU family from model name/slug first (handles DB entries labeled arch="Modern" accurately)
  let archFamily = 'legacy';
  if (isApple) archFamily = 'apple';
  else if (isGtx) archFamily = 'gtx';
  else if (/rtx[\s-]*50/.test(s) || /rtx\s*50/.test(n) || arch.includes('blackwell')) archFamily = 'blackwell';
  else if (/rtx[\s-]*40/.test(s) || /rtx\s*40/.test(n) || arch.includes('ada')) archFamily = 'ada';
  else if (/rtx[\s-]*30/.test(s) || /rtx\s*30/.test(n) || arch.includes('ampere')) archFamily = 'ampere';
  else if (/rtx[\s-]*20/.test(s) || /rtx\s*20/.test(n) || arch.includes('turing')) archFamily = 'turing_rtx';
  else if (/rx[\s-]*90/.test(s) || /rx\s*90/.test(n) || arch.includes('rdna 4')) archFamily = 'rdna4';
  else if (/rx[\s-]*7\d{3}/.test(s) || /rx\s*7\d{3}/.test(n) || arch.includes('rdna 3')) archFamily = 'rdna3';
  else if (/rx[\s-]*6\d{3}/.test(s) || /rx\s*6\d{3}/.test(n) || arch.includes('rdna 2')) archFamily = 'rdna2';
  else if (/rx[\s-]*(5\d{3}|580|570|590)/.test(s) || /rx\s*(5\d{3}|580|570|590)/.test(n) || arch.includes('polaris') || arch.includes('rdna 1')) archFamily = 'rdna1_polaris';
  else if (/arc[\s-]*b/.test(s) || /arc\s*b/.test(n) || arch.includes('battlemage')) archFamily = 'battlemage';
  else if (/arc[\s-]*a/.test(s) || /arc\s*a/.test(n) || arch.includes('alchemist')) archFamily = 'alchemist';
  else if (isIntegrated) archFamily = 'igpu';

  const isLowEntryRdna2 = archFamily === 'rdna2' && (/6500|6400/.test(s + ' ' + n));
  const isRtx5050 = /5050/.test(s + ' ' + n);
  const isRx9050 = /9050/.test(s + ' ' + n);
  const appleHasHwRt = isApple && /m[3-9]/i.test(n);

  const hasDLSS = archFamily === 'blackwell' || archFamily === 'ada' || archFamily === 'ampere' || archFamily === 'turing_rtx';
  let dlssLabel = '';
  let dlssSrGain = 1.0;
  if (archFamily === 'blackwell') {
    dlssLabel = isRtx5050 ? 'DLSS 4 SR (5050)' : 'DLSS 4 Transformer';
    dlssSrGain = isRtx5050 ? 1.35 : 1.42;
  } else if (archFamily === 'ada') {
    dlssLabel = 'DLSS 4 SR (Ada)';
    dlssSrGain = 1.40;
  } else if (archFamily === 'ampere') {
    dlssLabel = 'DLSS Super Res.';
    dlssSrGain = 1.36;
  } else if (archFamily === 'turing_rtx') {
    dlssLabel = 'DLSS 2/3 SR';
    dlssSrGain = 1.32;
  }

  let fsrLabel = 'FSR 3.1';
  let fsrSrGain = 1.28;
  if (archFamily === 'rdna4') {
    fsrLabel = isRx9050 ? 'FSR 4 (entrada)' : 'FSR 4 IA';
    fsrSrGain = isRx9050 ? 1.31 : 1.38;
  } else if (archFamily === 'rdna3') {
    fsrLabel = 'FSR 3.1';
    fsrSrGain = 1.31;
  } else if (archFamily === 'rdna2') {
    fsrLabel = isLowEntryRdna2 ? 'FSR 2' : 'FSR 3';
    fsrSrGain = isLowEntryRdna2 ? 1.22 : 1.28;
  } else if (archFamily === 'battlemage') {
    fsrLabel = 'XeSS 2 / FSR 3';
    fsrSrGain = 1.33;
  } else if (archFamily === 'alchemist') {
    fsrLabel = 'XeSS / FSR 3';
    fsrSrGain = 1.26;
  } else if (archFamily === 'apple') {
    fsrLabel = 'MetalFX / FSR';
    fsrSrGain = 1.28;
  } else if (archFamily === 'rdna1_polaris' || archFamily === 'gtx' || archFamily === 'igpu') {
    fsrLabel = 'FSR 2/3 (Qual.)';
    fsrSrGain = 1.23;
  }

  const hasNativeFG = (archFamily === 'blackwell' || archFamily === 'ada');
  const hasFsrFg = (archFamily === 'rdna4' || archFamily === 'rdna3' || (archFamily === 'rdna2' && !isLowEntryRdna2) || archFamily === 'battlemage');
  const canFsrFgWithFsr = (archFamily === 'ampere' || archFamily === 'turing_rtx');
  const maxFgMult = archFamily === 'blackwell' ? 4 : ((hasNativeFG || hasFsrFg) ? 2 : 1);
  const vramFgOverhead = archFamily === 'blackwell' ? 0.85 : (archFamily === 'ada' ? 0.65 : ((hasFsrFg || canFsrFgWithFsr) ? 0.50 : 0));

  const hasHwRT = !isLowEntryRdna2 && (
    archFamily === 'blackwell' || archFamily === 'ada' || archFamily === 'ampere' ||
    archFamily === 'turing_rtx' || archFamily === 'rdna4' || archFamily === 'rdna3' ||
    archFamily === 'rdna2' || archFamily === 'battlemage' || archFamily === 'alchemist' ||
    appleHasHwRt
  );

  // Relative RT and Path Tracing silicon efficiency (1.00 = modern Ada/RDNA4 upper-mid baseline; scaled with GPU raster score)
  const rtArchMultMap = {
    blackwell: isRtx5050 ? 0.90 : 1.12,
    ada: 1.05,
    rdna4: isRx9050 ? 0.72 : 0.96,
    ampere: 0.86,
    battlemage: 0.82,
    turing_rtx: 0.72,
    rdna3: 0.68,
    apple: appleHasHwRt ? 0.65 : 0.28,
    rdna2: isLowEntryRdna2 ? 0.25 : 0.56,
    alchemist: 0.52,
    gtx: 0.24,
    rdna1_polaris: 0.22,
    igpu: 0.20,
    legacy: 0.22
  };
  const ptArchMultMap = {
    blackwell: isRtx5050 ? 0.82 : 1.16,
    ada: 1.04,
    rdna4: isRx9050 ? 0.48 : 0.78,
    ampere: 0.70,
    battlemage: 0.56,
    turing_rtx: 0.48,
    rdna3: 0.42,
    apple: appleHasHwRt ? 0.42 : 0.14,
    rdna2: isLowEntryRdna2 ? 0.14 : 0.32,
    alchemist: 0.26,
    gtx: 0.12,
    rdna1_polaris: 0.12,
    igpu: 0.10,
    legacy: 0.12
  };

  return {
    archFamily,
    vram,
    isBlackwell: archFamily === 'blackwell',
    isAda: archFamily === 'ada',
    isRdna4: archFamily === 'rdna4',
    hasDLSS,
    dlssLabel,
    dlssSrGain,
    hasFSR: true,
    fsrLabel,
    fsrSrGain,
    hasNativeFG,
    hasFsrFg,
    canFsrFgWithFsr,
    maxFgMult,
    vramFgOverhead,
    hasHwRT,
    rtArchMult: rtArchMultMap[archFamily] ?? 0.30,
    ptArchMult: ptArchMultMap[archFamily] ?? 0.14,
    qualityFactor: archFamily === 'blackwell' ? 1.04 : (archFamily === 'ada' ? 1.03 : (archFamily === 'ampere' || archFamily === 'turing_rtx' ? 1.02 : (archFamily === 'rdna4' ? 0.99 : (archFamily === 'battlemage' ? 0.98 : (archFamily === 'rdna3' || archFamily === 'rdna2' ? 0.94 : 0.90)))))
  };
}
window.getGpuHardwareCapabilities = getGpuHardwareCapabilities;

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
      srGain: 1.42,
      qualityFactor: 1.04,
      fgMaxMult: 4,
      vramFgOverhead: 0.85
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
      fgMaxMult: 2,
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
      fgMaxMult: 1,
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
function estimateGpuBaseFps(gpu, game, useSR = false, extraVramGB = 0, pairedCpu = undefined) {
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
  const activeCpu = pairedCpu !== undefined ? pairedCpu : ((typeof getSimCpu === 'function') ? getSimCpu() : STATE.refPC?.cpu);
  const activeMobo = STATE.refPC?.mobo || STATE.build?.mobo;
  if (activeCpu && typeof isPlatformPCIe3 === 'function' && isPlatformPCIe3(activeCpu, activeMobo)) {
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

function estimateCpuCap(cpu, game, presetIndex = 3) {
  let baseCap = Math.max(1, (game.cpuFps || 200) * getCpuGamingIndex(cpu) / 100);
  const prof = getGameSimProfile(game);
  const preset = SIM_QUALITY_PRESETS[Math.max(0, Math.min(4, parseInt(presetIndex, 10) || 0))] || SIM_QUALITY_PRESETS[3];
  baseCap *= preset.cpuCapMult;
  if (preset.rtMode === 'ultra_pt' && prof.supportsPT) {
    baseCap *= prof.ptCpuMult;
  } else if (preset.rtMode === 'ultra_pt' && prof.supportsRT) {
    baseCap *= prof.rtCpuMult;
  } else if (preset.rtMode === 'light' && prof.supportsRT) {
    baseCap *= (1 - (1 - prof.rtCpuMult) * 0.45);
  }
  return Math.max(10, baseCap);
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
  const predicted = combineFps(estimateGpuBaseFps(getMyCurrentGpu(), game, false, 0), estimateCpuCap(getMyCurrentCpu(), game, 3));
  return Math.max(0.5, Math.min(1.6, game.measured / Math.max(1, predicted)));
}

// Simulator-specific preset + DLSS/FSR/MFG + strict CPU ceiling engine
function computeSimulatorPresetMetrics(gpu, cpu, game, simGraphics) {
  const sg = simGraphics || { preset: 3, dlss: false, fsr: false, mfg: false, mfgMult: 'auto' };
  const pIdx = Math.max(0, Math.min(4, parseInt(sg.preset, 10) || 0));
  const preset = SIM_QUALITY_PRESETS[pIdx] || SIM_QUALITY_PRESETS[3];
  const prof = getGameSimProfile(game);
  const cap = getGpuHardwareCapabilities(gpu);
  const tech = getGpuTechProfile(gpu);
  const cal = getCalibration(game);
  const px = getMonitorPixels();
  const targetHz = STATE.monitorMaxFps >= 999 ? 240 : STATE.monitorMaxFps;

  // 1. CPU ceiling strictly enforced regardless of how low graphics settings go
  const cpuCapRaw = cpu ? (estimateCpuCap(cpu, game, pIdx) * cal) : 9999;
  const cpuCapInt = cpu ? Math.max(10, Math.round(cpuCapRaw)) : 9999;

  // 2. Active Upscaling resolution (no fake double-stacking DLSS + FSR on the same GPU)
  const useDlss = !!(sg.dlss && cap.hasDLSS);
  const useFsr = !useDlss && !!(sg.fsr && cap.hasFSR);
  const usingUpscaler = useDlss || useFsr;
  const dlssUnsupported = !!(sg.dlss && !cap.hasDLSS && !useFsr);
  let srMult = useDlss ? cap.dlssSrGain : (useFsr ? cap.fsrSrGain : 1.0);
  const activeUpscalerLabel = useDlss ? cap.dlssLabel : (useFsr ? cap.fsrLabel : 'Nativo');

  // 3. Preset Raster + Ray Tracing / Path Tracing GPU workload
  const presetRasterFactor = 1 + ((preset.gpuRasterMult - 1) * prof.presetSens);
  let rtPtFactor = 1.0;
  let extraRtVram = 0;
  let ptActive = false;
  let rtActive = false;

  if (preset.rtMode === 'ultra_pt' && prof.supportsPT) {
    ptActive = true;
    rtActive = true;
    rtPtFactor = prof.ptCost * cap.ptArchMult;
    extraRtVram = prof.vramPtExtra;
    // Ray Reconstruction / Transformer DLSS gives extra PT efficiency on RTX 40/50
    if (useDlss && (cap.isBlackwell || cap.isAda)) srMult *= 1.05;
  } else if (preset.rtMode === 'ultra_pt' && prof.supportsRT) {
    rtActive = true;
    rtPtFactor = prof.rtCost * cap.rtArchMult;
    extraRtVram = prof.vramRtExtra;
  } else if (preset.rtMode === 'light' && prof.supportsRT) {
    rtActive = true;
    rtPtFactor = prof.baselineHasLightRT
      ? Math.max(0.55, Math.min(1.12, 0.72 + 0.28 * cap.rtArchMult))
      : Math.max(0.70, Math.min(1.06, 0.84 + 0.16 * cap.rtArchMult));
  } else if (preset.rtMode === 'off' && prof.baselineHasLightRT) {
    // Baseline cyberpunk fps1440 assumes Light RT; turning RT off at Med/Low/M.Baixo recovers RT overhead
    rtPtFactor = 1.12;
  }

  // Resolution scaling: Path Tracing scales slightly steeper with pixels than pure raster
  const resExp = ptActive ? 0.86 : 0.80;
  const resMult = Math.pow(REF_PIXELS / px, resExp);
  const ratio = (gpu.gaming_score || 1500) / 3138.0;

  // 4. Frame Generation / MFG availability
  const wantFg = !!sg.mfg;
  const fgAllowedByGame = prof.supportsFG !== false;
  let gpuMaxFg = cap.maxFgMult;
  let fgTechLabel = cap.isBlackwell ? 'DLSS 4 MFG' : (cap.isAda ? 'DLSS FG 2×' : (cap.hasFsrFg ? (cap.archFamily === 'battlemage' ? 'XeSS 2 FG 2×' : 'FSR FG 2×') : 'Sem FG'));
  if (gpuMaxFg <= 1 && cap.canFsrFgWithFsr && sg.fsr) {
    gpuMaxFg = 2;
    fgTechLabel = 'FSR 3 FG 2×';
  }
  const canUseFG = wantFg && fgAllowedByGame && gpuMaxFg > 1;
  const extraFgVram = canUseFG ? (cap.vramFgOverhead || 0.5) : 0;

  const evalPureGpu = (includeFgOverhead) => {
    const vramBase = (game.vramReq || 8) * preset.vramMult * Math.pow(px / REF_PIXELS, 0.35) * (usingUpscaler ? 0.88 : 1.0);
    const vramNeeded = vramBase + extraRtVram + (includeFgOverhead ? extraFgVram : 0);
    const diff = (gpu.vram_gb || 8) - vramNeeded;
    let vramPenalty = 1.0;
    if (diff < -3.5) vramPenalty = 0.50;
    else if (diff < -1.8) vramPenalty = 0.64;
    else if (diff < -0.2) vramPenalty = 0.80;
    if (ptActive && (gpu.vram_gb || 8) <= 8) vramPenalty *= 0.86;

    let pciePenalty = 1.0;
    const activeMobo = STATE.refPC?.mobo || STATE.build?.mobo;
    if (cpu && typeof isPlatformPCIe3 === 'function' && isPlatformPCIe3(cpu, activeMobo)) {
      const isX4 = typeof PCIE_X4_GPUS !== 'undefined' && PCIE_X4_GPUS.has(gpu.slug);
      const isX8 = typeof PCIE_X8_GPUS !== 'undefined' && PCIE_X8_GPUS.has(gpu.slug);
      if (isX4) pciePenalty = diff < 0 ? 0.72 : 0.88;
      else if (isX8) pciePenalty = diff < 0 ? 0.86 : 0.96;
    }

    const fgOverheadMult = includeFgOverhead
      ? ((gpu.vram_gb || 8) <= 8 && vramNeeded >= 7.5 ? 0.91 : 0.95)
      : 1.0;

    const raw = game.fps1440 * ratio * resMult * presetRasterFactor * rtPtFactor * srMult * vramPenalty * pciePenalty * fgOverheadMult * cal;
    return { fps: Math.max(1, raw), vramNeeded, vramShort: diff < -0.2 };
  };

  const preFgEval = evalPureGpu(false);
  const postFgEval = canUseFG ? evalPureGpu(true) : preFgEval;
  const gpuPureRaw = postFgEval.fps;

  // Strict CPU lock on real rendered FPS (independent of how low the graphics preset or upscaler goes)
  const combinedBase = cpu ? combineFps(gpuPureRaw, cpuCapRaw) : gpuPureRaw;
  const realBaseFps = cpu ? Math.min(cpuCapInt, Math.max(1, Math.round(combinedBase))) : Math.max(1, Math.round(gpuPureRaw));
  const gpuPureInt = Math.max(1, Math.round(gpuPureRaw));
  const isCpuLocked = !!(cpu && (gpuPureRaw >= cpuCapRaw * 0.96 || realBaseFps >= cpuCapInt));

  // Resolve active MFG multiplier
  let activeFgMult = 1;
  let netFgFactor = 1.0;
  if (canUseFG) {
    if (gpuMaxFg >= 4) {
      if (sg.mfgMult === 2 || sg.mfgMult === 3 || sg.mfgMult === 4) {
        activeFgMult = sg.mfgMult;
      } else {
        if (realBaseFps * 1.74 >= targetHz) activeFgMult = 2;
        else if (realBaseFps * 2.40 >= targetHz) activeFgMult = 3;
        else activeFgMult = 4;
      }
    } else {
      activeFgMult = 2;
    }
    netFgFactor = activeFgMult === 4 ? 3.05 : activeFgMult === 3 ? 2.40 : 1.74;
  }

  const displayedPure = canUseFG ? Math.max(gpuPureInt, Math.round(gpuPureRaw * netFgFactor)) : gpuPureInt;
  const displayedWithCpu = canUseFG ? Math.max(realBaseFps, Math.round(realBaseFps * netFgFactor)) : realBaseFps;

  // When MFG is OFF, withCpu IS realBaseFps (strictly <= cpuCapInt).
  // When MFG is ON, withCpu shows interpolated display FPS while baseRenderFps remains strictly <= cpuCapInt!
  const primaryPure = canUseFG ? displayedPure : gpuPureInt;
  const primaryWithCpu = canUseFG ? displayedWithCpu : realBaseFps;

  const latencyMs = Math.round((1000 / Math.max(12, realBaseFps)) * (canUseFG ? (activeFgMult >= 3 ? 1.38 : 1.28) : 1.05));

  const techNotes = [];
  if (isCpuLocked) techNotes.push(`🔒 Travado no teto da CPU (~${cpuCapInt} FPS)`);
  if (ptActive && !cap.hasHwRT) techNotes.push('⚠️ Sem HW Ray Tracing — PT inviável');
  if (dlssUnsupported) techNotes.push('⚠️ DLSS exclusivo NVIDIA RTX');
  if (postFgEval.vramShort) techNotes.push(`⚠️ VRAM apertada (${gpu.vram_gb || 8}GB / ~${postFgEval.vramNeeded.toFixed(1)}GB)`);
  if (wantFg && !fgAllowedByGame) techNotes.push('Competitivo: FG desligado (input lag)');
  else if (wantFg && !canUseFG && fgAllowedByGame) {
    techNotes.push(cap.canFsrFgWithFsr ? '⚠️ Ative FSR p/ FSR 3 FG 2×' : '⚠️ GPU sem suporte a FG/MFG');
  } else if (canUseFG && realBaseFps < 35) {
    techNotes.push(`⚠️ Base < 35 FPS c/ ${activeFgMult}× FG (${latencyMs}ms)`);
  }

  const cpuLossPct = Math.max(0, Math.round((1 - realBaseFps / Math.max(1, gpuPureInt)) * 100));
  const cpuIdlePct = Math.max(0, Math.round((1 - gpuPureRaw / Math.max(1, cpuCapRaw)) * 100));
  const bottleneckType = isCpuLocked || realBaseFps < gpuPureInt * 0.94
    ? 'cpu'
    : (gpuPureRaw < cpuCapRaw * 0.72 ? 'gpu' : 'balanced');
  const bottleneckLabel = isCpuLocked
    ? `🔒 Travado na CPU (teto ~${cpuCapInt} FPS${cpuLossPct > 0 ? ', -' + cpuLossPct + '%' : ''})`
    : (bottleneckType === 'cpu'
        ? `🔴 Gargalo CPU (-${cpuLossPct}%)`
        : (bottleneckType === 'gpu'
            ? `🟡 Limitado pela GPU (CPU ${cpuIdlePct}% livre)`
            : '🟢 Setup Equilibrado'));

  return {
    pure: primaryPure,
    withCpu: primaryWithCpu,
    basePureFps: gpuPureInt,
    baseRenderFps: realBaseFps,
    nativePure: gpuPureInt,
    nativeWithCpu: realBaseFps,
    displayedPure,
    displayedWithCpu,
    perceivedPure: displayedPure,
    perceivedWithCpu: displayedWithCpu,
    activeFgMult,
    canUseFG,
    wantFg,
    fgTechLabel,
    latencyMs,
    tech: {
      ...tech,
      badge: canUseFG
        ? `${activeUpscalerLabel !== 'Nativo' ? activeUpscalerLabel + ' + ' : ''}${fgTechLabel}${activeFgMult > 2 ? ' ' + activeFgMult + '×' : ''}`
        : activeUpscalerLabel
    },
    cap,
    preset,
    ptActive,
    rtActive,
    useDlss,
    useFsr,
    dlssUnsupported,
    activeUpscalerLabel,
    vramNeeded: +postFgEval.vramNeeded.toFixed(1),
    vramShort: postFgEval.vramShort,
    isCpuLocked,
    cpuCap: cpuCapInt,
    cpuLossPct,
    cpuIdlePct,
    bottleneckType,
    bottleneckLabel,
    techNotes,
    calibrated: cal !== 1
  };
}

// Core DLSS 4 + FG 2x / MFG 3x-4x + Perceived Performance & Input Latency model
function computeDlssMfgMetrics(gpu, cpu, game, modeOrOpts = null) {
  if (modeOrOpts && typeof modeOrOpts === 'object' && modeOrOpts.simGraphics) {
    return computeSimulatorPresetMetrics(gpu, cpu, game, modeOrOpts.simGraphics);
  }
  const dlssMode = (typeof modeOrOpts === 'string' && modeOrOpts) || STATE.dlssMode || 'perceived';
  const tech = getGpuTechProfile(gpu);
  const cal = getCalibration(game);
  const cpuCap = cpu ? estimateCpuCap(cpu, game, 3) * cal : 9999;
  const esports = isCompetitiveEsportsGame(game);

  // 1. Native Raster
  const nativePure = estimateGpuBaseFps(gpu, game, false, 0, cpu) * cal;
  const nativeWithCpu = combineFps(nativePure, cpuCap);

  // 2. Super Resolution (DLSS 4 SR / FSR 4 / XeSS Quality) without Frame Gen
  const srPure = estimateGpuBaseFps(gpu, game, true, 0, cpu) * cal;
  const srWithCpu = combineFps(srPure, cpuCap);

  // 3. Frame Generation / Multi-Frame Generation (MFG 2x / 3x / 4x)
  const canUseFG = !esports && tech.fgMaxMult > 1 && (dlssMode === 'perceived' || dlssMode === 'max_fg');
  let activeFgMult = 1;
  let netFgFactor = 1.0;

  if (canUseFG) {
    const baseAfterFgVramPure = estimateGpuBaseFps(gpu, game, true, tech.vramFgOverhead, cpu) * cal;
    const baseAfterFgVramCpu = combineFps(baseAfterFgVramPure, cpuCap);
    const targetHz = STATE.monitorMaxFps >= 999 ? 240 : STATE.monitorMaxFps;

    if (tech.fgMaxMult >= 4) {
      if (dlssMode === 'max_fg') {
        activeFgMult = 4;
      } else {
        if (baseAfterFgVramCpu * 1.74 >= targetHz) activeFgMult = 2;
        else if (baseAfterFgVramCpu * 2.42 >= targetHz) activeFgMult = 3;
        else activeFgMult = 4;
      }
    } else {
      activeFgMult = 2;
    }

    netFgFactor = activeFgMult === 4 ? 3.05 : activeFgMult === 3 ? 2.40 : 1.74;
  }

  const baseForFgPure = canUseFG ? (estimateGpuBaseFps(gpu, game, true, tech.vramFgOverhead, cpu) * cal) : (dlssMode === 'native' ? nativePure : srPure);
  const baseForFgCpu = Math.min(cpuCap, combineFps(baseForFgPure, cpuCap));

  const displayedPure = canUseFG ? (baseForFgPure * netFgFactor) : baseForFgPure;
  const displayedWithCpu = canUseFG ? (baseForFgCpu * netFgFactor) : baseForFgCpu;

  const calcPerceived = (baseFps, dispFps) => {
    if (dlssMode === 'native') return baseFps;
    if (dlssMode === 'sr' || !canUseFG) return baseFps * tech.qualityFactor;
    const extraFrames = Math.max(0, dispFps - baseFps);
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

  const latencyMs = Math.round((1000 / Math.max(15, baseForFgCpu)) * (canUseFG ? 1.32 : 1.05));

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
    basePureFps: Math.round(baseForFgPure),
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
    cpuIdlePct: Math.max(0, Math.round((1 - baseForFgPure / Math.max(1, cpuCap)) * 100)),
    bottleneckType: (baseForFgCpu < baseForFgPure * 0.95)
      ? 'cpu'
      : (baseForFgPure < cpuCap * 0.70 ? 'gpu' : 'balanced'),
    bottleneckLabel: (baseForFgCpu < baseForFgPure * 0.95)
      ? `🔴 Gargalo CPU (-${Math.round((1 - baseForFgCpu / Math.max(1, baseForFgPure)) * 100)}%)`
      : (baseForFgPure < cpuCap * 0.70
          ? `🟡 Gargalo GPU (CPU ${Math.round((1 - baseForFgPure / Math.max(1, cpuCap)) * 100)}% ociosa)`
          : `🟢 Setup Equilibrado`),
    calibrated: cal !== 1
  };
}

function estimateFps(gpu, cpu, game, opts = {}) {
  if (opts && opts.simGraphics) return computeDlssMfgMetrics(gpu, cpu, game, opts);
  const modeOverride = opts.dlssMode || (typeof opts.upscale === 'string' ? opts.upscale : null);
  return computeDlssMfgMetrics(gpu, cpu, game, modeOverride);
}

function getRelevantGames() {
  const rel = (STATE.games || []).filter(g => g.relevant);
  return rel.length ? rel : (STATE.games || DEFAULT_GAMES);
}

function getActivePairedCpu() {
  const ref = STATE.refPC && STATE.refPC.cpu;
  if (!ref || (!ref.slug && !ref.name)) return null;
  if (ref.slug && window.DB && Array.isArray(DB.cpus)) {
    const found = DB.cpus.find(c => c.slug === ref.slug);
    if (found) return found;
  }
  return ref;
}
window.getActivePairedCpu = getActivePairedCpu;

function evaluateGpuTechAndCpuProfile(gpu, pairedCpuOverride = undefined) {
  if (!gpu) {
    return {
      dlss5Eff: 0, fsrEff: 0, rtEff: 0, ptEff: 0,
      cpuFactor: 1, cpuLossPct: 0, cpuBottleneckSeverity: 'none',
      combinedGamingMult: 1, techComposite100: 50,
      warnings: [], badgesHtml: ''
    };
  }

  const slug = String(gpu.slug || '').toLowerCase();
  const arch = String(gpu.arch || '').toLowerCase();
  const brand = String(gpu.brand || '').toUpperCase();
  const vram = Number(gpu.vram_gb || 8);
  const rawGame = Number(gpu.gaming_score || 1500);

  const tw = (typeof STATE !== 'undefined' && STATE.techWeights)
    ? STATE.techWeights
    : { dlss5: 35, fsr: 25, rayTracing: 30, pathTracing: 15 };
  const wDlss = Math.max(0, Math.min(1, (Number(tw.dlss5) || 0) / 100));
  const wFsr = Math.max(0, Math.min(1, (Number(tw.fsr) || 0) / 100));
  const wRt = Math.max(0, Math.min(1, (Number(tw.rayTracing) || 0) / 100));
  const wPt = Math.max(0, Math.min(1, (Number(tw.pathTracing) || 0) / 100));

  const res = (typeof STATE !== 'undefined' && STATE.monitorRes) || '1440p';
  const is4kOrUwQhd = res === '4k' || res === 'uw1440p';
  const is1440Plus = is4kOrUwQhd || res === '1440p';

  const isNvidia = brand === 'NVIDIA';
  const isAmd = brand === 'AMD';
  const isIntel = brand === 'INTEL';
  const isBlackwell = isNvidia && (/^rtx-50/.test(slug) || arch.includes('blackwell'));
  const isAda = isNvidia && (/^rtx-40/.test(slug) || arch.includes('ada'));
  const isAmpere = isNvidia && (/^rtx-30/.test(slug) || arch.includes('ampere'));
  const isTuring = isNvidia && (/^rtx-20/.test(slug) || arch.includes('turing'));
  const isRdna4 = isAmd && (/^rx-90/.test(slug) || arch.includes('rdna 4'));
  const isRdna3 = isAmd && (/^rx-7/.test(slug) || arch.includes('rdna 3'));
  const isRdna2 = isAmd && (/^rx-6/.test(slug) || arch.includes('rdna 2'));
  const isBattlemage = isIntel && (/arc-b/.test(slug) || arch.includes('battlemage'));

  // 1. DLSS 5 Exclusivity (Blackwell RTX 50) + hardware capability weighting
  let dlss5Eff = 0;
  let dlss5Status = 'unsupported'; // 'full' | 'partial' | 'struggle' | 'dlss4' | 'unsupported'
  if (isBlackwell) {
    if (slug === 'rtx-5050') {
      dlss5Eff = is4kOrUwQhd ? 0.18 : 0.26;
      dlss5Status = 'struggle';
    } else if (slug === 'rtx-5060') {
      dlss5Eff = is4kOrUwQhd ? 0.44 : (is1440Plus ? 0.54 : 0.64);
      dlss5Status = (wPt >= 0.40 || is4kOrUwQhd) ? 'struggle' : 'partial';
    } else if (slug === 'rtx-5060-ti-8gb') {
      dlss5Eff = is4kOrUwQhd ? 0.50 : 0.64;
      dlss5Status = (wPt >= 0.45 || is4kOrUwQhd) ? 'struggle' : 'partial';
    } else if (slug === 'rtx-5060-ti-16gb') {
      dlss5Eff = 0.85;
      dlss5Status = 'full';
    } else if (slug === 'rtx-5070') {
      dlss5Eff = 0.93;
      dlss5Status = 'full';
    } else if (slug === 'rtx-5070-ti') {
      dlss5Eff = 0.98;
      dlss5Status = 'full';
    } else {
      dlss5Eff = 1.00;
      dlss5Status = 'full';
    }
  } else if (isAda) {
    dlss5Eff = vram >= 12 ? 0.24 : 0.14;
    dlss5Status = 'dlss4';
  } else if (isAmpere || isTuring) {
    dlss5Eff = 0.08;
    dlss5Status = 'unsupported';
  }

  let dlssMult = 1.0;
  if (wDlss > 0) {
    if (isBlackwell) {
      if (dlss5Status === 'struggle' && slug === 'rtx-5050') {
        // Entry 5050 suffers under DLSS 5 frame-gen overhead & 8GB saturation
        dlssMult = 1.0 - (0.09 * wDlss);
      } else if (dlss5Status === 'partial' || dlss5Status === 'struggle') {
        dlssMult = 1.0 + (0.09 * wDlss * (dlss5Eff / 0.65));
      } else {
        dlssMult = 1.0 + (0.30 * wDlss * dlss5Eff);
      }
    } else if (isAda) {
      dlssMult = 1.0 + (0.07 * wDlss * (vram >= 12 ? 1.0 : 0.55));
    } else if (isAmpere || isTuring) {
      dlssMult = 1.0 + (0.02 * wDlss);
    } else {
      // Non-NVIDIA GPU lacks proprietary DLSS 5; slight competitive gap unless user also uses FSR
      const fsrCover = Math.min(1, wFsr / Math.max(0.15, wDlss));
      dlssMult = 1.0 - (0.07 * wDlss * (1 - 0.6 * fsrCover));
    }
  }

  // 2. AMD FSR (FSR 3.1 / FSR 4 & Frame Gen)
  let fsrEff = 0.35;
  let fsrStruggle = false;
  if (isRdna4) {
    if (slug === 'rx-9050-8gb') {
      fsrEff = 0.34;
      fsrStruggle = true;
    } else if (slug === 'rx-9060-xt-8gb') {
      fsrEff = 0.62;
    } else if (slug === 'rx-9060-xt-16gb') {
      fsrEff = 0.88;
    } else if (slug === 'rx-9070-gre') {
      fsrEff = 0.92;
    } else {
      fsrEff = 1.00;
    }
  } else if (isRdna3) {
    fsrEff = slug.includes('7900') ? 0.84 : (slug.includes('7800') || slug.includes('7700') ? 0.78 : (vram >= 16 ? 0.72 : 0.55));
  } else if (isRdna2) {
    if (slug.includes('6500') || slug.includes('6400')) {
      fsrEff = 0.14;
      fsrStruggle = true;
    } else {
      fsrEff = vram >= 12 ? 0.68 : 0.48;
    }
  } else if (isAmd) {
    fsrEff = 0.25;
  } else if (isBattlemage) {
    fsrEff = 0.56;
  } else if (isNvidia) {
    fsrEff = (isBlackwell || isAda) ? (vram >= 12 ? 0.52 : 0.40) : 0.36;
  }

  let fsrMult = 1.0;
  if (wFsr > 0) {
    if (fsrStruggle) {
      fsrMult = 1.0 - (0.06 * wFsr);
    } else if (isAmd) {
      fsrMult = 1.0 + (0.27 * wFsr * fsrEff);
    } else {
      fsrMult = 1.0 + (0.11 * wFsr * fsrEff);
    }
  }

  // 3. Ray Tracing (Hardware RT Cores + VRAM Headroom)
  let rtEff = 0.05;
  if (isBlackwell) {
    if (slug.includes('5090') || slug.includes('5080') || slug.includes('5070-ti')) rtEff = 1.00;
    else if (slug === 'rtx-5070') rtEff = 0.95;
    else if (slug === 'rtx-5060-ti-16gb') rtEff = 0.86;
    else if (slug === 'rtx-5060-ti-8gb') rtEff = 0.70;
    else if (slug === 'rtx-5060') rtEff = 0.64;
    else rtEff = 0.35; // rtx-5050
  } else if (isAda) {
    if (slug.includes('4090') || slug.includes('4080')) rtEff = 0.95;
    else if (slug.includes('4070')) rtEff = 0.85;
    else if (slug.includes('4060-ti')) rtEff = 0.64;
    else rtEff = 0.52;
  } else if (isRdna4) {
    if (slug.includes('9070-xt') || slug === 'rx-9070') rtEff = 0.85;
    else if (slug === 'rx-9070-gre') rtEff = 0.78;
    else if (slug === 'rx-9060-xt-16gb') rtEff = 0.70;
    else if (slug === 'rx-9060-xt-8gb') rtEff = 0.54;
    else rtEff = 0.28; // rx-9050-8gb
  } else if (isAmpere) {
    if (slug.includes('3090') || slug.includes('3080')) rtEff = 0.76;
    else if (slug.includes('3070')) rtEff = 0.60;
    else if (slug === 'rtx-3060-ti') rtEff = 0.54;
    else if (slug === 'rtx-3060-12gb') rtEff = 0.50;
    else rtEff = 0.30;
  } else if (isBattlemage) {
    rtEff = slug.includes('b580') ? 0.64 : 0.54;
  } else if (isRdna3) {
    rtEff = slug.includes('7900') ? 0.60 : (vram >= 12 ? 0.46 : 0.30);
  } else if (isTuring) {
    rtEff = slug.includes('2080') ? 0.58 : (vram >= 8 ? 0.42 : 0.30);
  } else if (isRdna2) {
    rtEff = (slug.includes('6500') || slug.includes('6400')) ? 0.05 : (vram >= 12 ? 0.36 : 0.20);
  } else if (isIntel) {
    rtEff = 0.20;
  }

  if (rtEff > 0.15) {
    if (res === '4k' && vram < 12) rtEff *= 0.74;
    else if (is1440Plus && vram < 10) rtEff *= 0.84;
  }
  const rtAtFull = Math.max(0.28, 0.44 + 0.64 * rtEff);
  const rtMult = (1 - wRt) + wRt * rtAtFull;

  // 4. Path Tracing (Full RT + AI Ray Reconstruction + >=12GB VRAM)
  const vramPtFactor = vram >= 16 ? (is4kOrUwQhd ? 0.96 : 1.0)
    : (vram >= 12 ? (res === '4k' ? 0.76 : 0.90)
      : (vram >= 10 ? 0.60
        : (vram >= 8 ? 0.36 : 0.14)));
  const aiDenoise = isBlackwell ? (slug === 'rtx-5050' ? 0.45 : 1.0)
    : (isAda ? 0.94
      : (isRdna4 ? (slug === 'rx-9050-8gb' ? 0.35 : 0.74)
        : (isAmpere ? 0.68
          : (isRdna3 ? 0.48 : (isBattlemage ? 0.55 : 0.25)))));
  const perfHeadroom = Math.min(1.0, Math.pow(Math.max(400, rawGame) / 4800, 0.55));
  const ptEff = Math.max(0.03, Math.min(1.0, (rtEff * 0.55 + aiDenoise * 0.45) * vramPtFactor * perfHeadroom * 1.15));
  const ptAtFull = Math.max(0.22, 0.30 + 0.82 * ptEff);
  const ptMult = (1 - wPt) + wPt * ptAtFull;

  // 5. Paired CPU Bottleneck Calculus
  const pairedCpu = pairedCpuOverride !== undefined ? pairedCpuOverride : getActivePairedCpu();
  let cpuFactor = 1.0;
  let cpuLossPct = 0;
  let cpuBottleneckSeverity = 'none';
  let pcieNote = false;
  let pairedCpuName = '';

  if (pairedCpu && (pairedCpu.slug || pairedCpu.name)) {
    pairedCpuName = pairedCpu.name || pairedCpu.slug;
    const cpuIndex = typeof getCpuGamingIndex === 'function' ? getCpuGamingIndex(pairedCpu) : 70;
    const resCpuSens = res === '4k' ? 0.76 : (res === 'uw1440p' ? 0.90 : (res === '1440p' ? 1.00 : 1.18));
    const upscPressure = 1 + (0.16 * wDlss * dlss5Eff) + (0.14 * wFsr * fsrEff);
    const gpuDemandIdx = 40 * Math.pow(Math.max(300, rawGame) / 3138.0, 0.54) * resCpuSens * Math.min(1.22, upscPressure);
    const rtCpuLoad = 1 - Math.min(0.26, (0.14 * wRt) + (0.16 * wPt));
    const effCpuCap = Math.max(18, cpuIndex * rtCpuLoad);

    const k = 5;
    const combined = 1 / Math.pow(Math.pow(1 / Math.max(1, gpuDemandIdx), k) + Math.pow(1 / effCpuCap, k), 1 / k);
    const effRatio = combined / Math.max(1, gpuDemandIdx);
    // Natural variance floor at 0.93 so genuinely balanced pairings don't get docked
    cpuFactor = effRatio >= 0.93 ? 1.0 : Math.max(0.45, effRatio / 0.93);

    const mobo = (STATE.refPC && STATE.refPC.mobo) || null;
    if (typeof isPlatformPCIe3 === 'function' && isPlatformPCIe3(pairedCpu, mobo)) {
      const isX4 = typeof PCIE_X4_GPUS !== 'undefined' && PCIE_X4_GPUS.has(slug);
      const isX8 = typeof PCIE_X8_GPUS !== 'undefined' && PCIE_X8_GPUS.has(slug);
      if (isX4) {
        cpuFactor *= 0.84;
        pcieNote = true;
      } else if (isX8) {
        cpuFactor *= (vram <= 8 ? 0.92 : 0.96);
        pcieNote = true;
      }
    }

    cpuLossPct = Math.max(0, Math.round((1 - cpuFactor) * 100));
    if (cpuLossPct >= 20) cpuBottleneckSeverity = 'severe';
    else if (cpuLossPct >= 9) cpuBottleneckSeverity = 'moderate';
  }

  const shortCpu = pairedCpuName
    .replace(/AMD\s+Ryzen\s+/i, 'R')
    .replace(/Intel\s+Core\s+/i, '')
    .replace(/\([^)]*\)/g, '')
    .trim();

  // Actionable warnings & status pills
  const warnings = [];
  const pills = [];

  if (wDlss >= 0.30) {
    if (isBlackwell && slug === 'rtx-5050') {
      const msg = 'RTX 5050 sofre c/ DLSS 5 (chip fraco / 8GB)';
      warnings.push(msg);
      pills.push(`<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono text-xs" title="${msg}">⚠️ Sofre c/ DLSS 5</span>`);
    } else if (isBlackwell && dlss5Status === 'struggle') {
      const msg = `${gpu.name} limitada em DLSS 5 pelos 8GB VRAM nesta carga`;
      warnings.push(msg);
      pills.push(`<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs" title="${msg}">⚠️ DLSS 5 apertado (8GB)</span>`);
    } else if (isBlackwell && dlss5Eff >= 0.85 && wDlss >= 0.55) {
      pills.push(`<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-xs" title="Hardware pronto para DLSS 5 + MFG">✅ DLSS 5 Pleno</span>`);
    } else if (!isBlackwell && wDlss >= 0.55 && !(isAmd && wFsr >= 0.45)) {
      const msg = isAda ? 'Série 40: só DLSS 4 (sem DLSS 5)' : 'Sem suporte exclusivo DLSS 5';
      warnings.push(msg);
      pills.push(`<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono text-xs">${msg}</span>`);
    }
  }

  if (wFsr >= 0.35 && fsrStruggle) {
    const msg = 'Sofre em FSR 3/4 c/ Frame Gen (VRAM/largura de banda)';
    warnings.push(msg);
    pills.push(`<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs">⚠️ FSR limitado</span>`);
  } else if (wFsr >= 0.55 && isRdna4 && fsrEff >= 0.85) {
    pills.push(`<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-xs">✅ FSR 4 IA</span>`);
  }

  if (wPt >= 0.30 && ptEff < 0.38) {
    const msg = `Sofre em Path Tracing (${vram}GB VRAM / RT limitado)`;
    warnings.push(msg);
    pills.push(`<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono text-xs" title="${msg}">⚠️ Path Tracing fraco</span>`);
  } else if (wRt >= 0.45 && rtEff < 0.36) {
    const msg = `Ray Tracing pesado p/ esta arquitetura`;
    warnings.push(msg);
    pills.push(`<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs" title="${msg}">⚠️ RT pesado</span>`);
  }

  if (cpuBottleneckSeverity === 'severe') {
    const msg = `Gargalo severo de CPU c/ ${pairedCpuName} (-${cpuLossPct}% fps efetivo${pcieNote ? ' incl. PCIe 3.0' : ''})`;
    warnings.push(msg);
    pills.push(`<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono text-xs" title="${msg}">🔴 Gargalo CPU c/ ${shortCpu} (−${cpuLossPct}%)</span>`);
  } else if (cpuBottleneckSeverity === 'moderate') {
    const msg = `CPU ${pairedCpuName} limita parcialmente esta GPU (-${cpuLossPct}% fps efetivo)`;
    warnings.push(msg);
    pills.push(`<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs" title="${msg}">⚠️ CPU limita (−${cpuLossPct}% c/ ${shortCpu})</span>`);
  }

  // Tech composite (0–100) for radar chart
  const activeWeightSum = wDlss + wFsr + wRt + wPt;
  let techComposite100 = 50;
  if (activeWeightSum > 0.05) {
    const weightedEff = (
      (wDlss * (isBlackwell ? dlss5Eff : Math.max(dlss5Eff, isAmd ? wFsr * fsrEff * 0.45 : dlss5Eff))) +
      (wFsr * fsrEff) +
      (wRt * rtEff) +
      (wPt * ptEff)
    ) / activeWeightSum;
    techComposite100 = Math.round(weightedEff * 100);
  } else {
    techComposite100 = Math.round(Math.min(100, (rtEff * 0.4 + Math.max(dlss5Eff, fsrEff) * 0.6) * 100));
  }

  const rawCombined = dlssMult * fsrMult * rtMult * ptMult * cpuFactor;
  const combinedGamingMult = Math.max(0.28, Math.min(1.80, rawCombined));

  return {
    dlss5Eff, fsrEff, rtEff, ptEff,
    dlss5Status,
    dlssMult, fsrMult, rtMult, ptMult,
    cpuFactor, cpuLossPct, cpuBottleneckSeverity, pairedCpuName: shortCpu,
    combinedGamingMult,
    techComposite100,
    warnings,
    badgesHtml: pills.join(' ')
  };
}
window.evaluateGpuTechAndCpuProfile = evaluateGpuTechAndCpuProfile;

// Gaming score used in Duelo, Custo-Benefício & Upgrade Planner:
// Respects monitor resolution, VRAM needs, Hz cap (when applicable), selected DLSS 5 / FSR / RT / PT sliders,
// AND the active paired CPU bottleneck calculus!
// When uncapped=true, measures hardware capability without clamping to monitor Hz.
function getEffectiveGamingScore(gpu, uncapped = false) {
  const games = getRelevantGames();
  const evalTech = evaluateGpuTechAndCpuProfile(gpu);
  if (!games.length || !STATE.monitorRes) {
    return Math.max(150, Math.round((gpu.gaming_score || 1500) * evalTech.combinedGamingMult));
  }
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
  const baseSimScore = 3138.0 * (effSum / Math.max(1, refSum));
  return Math.max(150, Math.round(baseSimScore * evalTech.combinedGamingMult));
}

// ============================================================================
// 3. SIMULATOR TAB (overrides app.js renderSimulator)
// ============================================================================
function syncSimCompareUI() {
  const compareOn = STATE.simCompareEnabled !== false;
  const setToggleState = (id, active) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('is-active', !!active);
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
  };
  setToggleState('btn-sim-mode-single', !compareOn);
  setToggleState('btn-sim-mode-compare', compareOn);
  setToggleState('btn-sim-laptop-mode-single', !compareOn);
  setToggleState('btn-sim-laptop-mode-compare', compareOn);
  setToggleState('btn-sim-phone-mode-single', !compareOn);
  setToggleState('btn-sim-phone-mode-compare', compareOn);

  ['sim-setup-b-group', 'btn-sim-swap', 'sim-laptop-b-group', 'btn-sim-laptop-swap', 'sim-phone-b-group', 'btn-sim-phone-swap'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !compareOn);
  });

  const setupABadge = document.getElementById('sim-setup-a-badge');
  if (setupABadge) setupABadge.textContent = compareOn ? 'Setup A' : 'Setup';

  const lapABadge = document.getElementById('sim-laptop-a-badge');
  if (lapABadge) lapABadge.textContent = compareOn ? 'Notebook A' : 'Notebook';

  const phoneABadge = document.getElementById('sim-phone-a-badge');
  if (phoneABadge) phoneABadge.textContent = compareOn ? 'Celular A' : 'Celular';

  const radarTitle = document.getElementById('sim-radar-title');
  if (radarTitle) radarTitle.textContent = compareOn ? 'Comparativo Multidimensional: Setup A vs Setup B' : 'Perfil Multidimensional do Setup';

  const lapRadarTitle = document.getElementById('sim-laptop-radar-title');
  if (lapRadarTitle) lapRadarTitle.textContent = compareOn ? 'Notebook A vs Notebook B — 6 Dimensões Reais' : 'Perfil Full-System — 6 Dimensões Reais';

  const phoneRadarTitle = document.getElementById('sim-phone-radar-title');
  if (phoneRadarTitle) phoneRadarTitle.textContent = compareOn ? 'Celular A vs Celular B — 6 Dimensões Reais' : 'Perfil Mobile — 6 Dimensões Reais';
}

function setSimCompareEnabled(enabled) {
  STATE.simCompareEnabled = !!enabled;
  saveUserPrefs();
  syncSimCompareUI();
  if (STATE.context === 'laptop' && typeof renderLaptopSimulator === 'function') {
    renderLaptopSimulator();
  } else if (STATE.context === 'smartphone' && typeof renderSmartphoneSimulator === 'function') {
    renderSmartphoneSimulator();
  } else if (typeof renderSimulator === 'function') {
    renderSimulator();
  }
}
window.syncSimCompareUI = syncSimCompareUI;
window.setSimCompareEnabled = setSimCompareEnabled;

function onSimGpuChange(slug, setupKey = 'a') {
  if (setupKey === 'b') {
    STATE.simGpuBSlug = slug;
  } else {
    STATE.simGpuASlug = slug;
  }
  saveUserPrefs();
  renderSimulator();
}
window.onSimGpuChange = onSimGpuChange;

function onSimCpuChange(slug, setupKey = 'a') {
  if (setupKey === 'b') {
    STATE.simCpuBSlug = slug;
  } else {
    STATE.simCpuASlug = slug;
    STATE.simCpuSlug = slug;
    const legacySel = document.getElementById('sim-select-cpu');
    if (legacySel) legacySel.value = slug;
  }
  saveUserPrefs();
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
        <ul class="list-disc pl-5 space-y-0.5 text-xs">
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
        <div class="p-3 rounded-xl bg-sky-950/40 border border-sky-500/40 text-xs text-sky-100 mt-2">
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
      <span class="w-20 text-right ${bold ? 'font-bold text-white' : 'text-slate-300'}">${fps} FPS${over ? '<span class="text-xs text-slate-500">*</span>' : ''}</span>
    </div>`;
}

function renderSimulator() {
  if (!DB.gpus.length) return;
  syncSimCompareUI();
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
    <button onclick="toggleRelevantGame('${g.id}')" class="px-2.5 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${g.relevant ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-slate-900 text-slate-500 border-slate-700 hover:text-slate-300'}">
      ${g.relevant ? '✓ ' : ''}${g.title}${g.measured ? ' 📏' : ''}
    </button>`).join('');

  const editor = !STATE.showGameEditor ? '' : `
    <div class="w-full mt-2 p-3 rounded-lg bg-slate-950/80 border border-slate-800 overflow-x-auto">
      <p class="text-xs text-slate-400 mb-2">
        <strong>FPS ref.</strong> = média numa RTX 5060 em 1440p nativo sem limite de CPU •
        <strong>Teto CPU</strong> = FPS máximo com Ryzen 7 9800X3D (escala pelo índice do seu CPU) •
        <strong>Meu FPS medido</strong> = o que você vê hoje no seu setup atual na resolução selecionada (opcional, calibra o jogo).
      </p>
      <table class="w-full text-xs">
        <thead><tr class="text-slate-400 font-mono text-xs uppercase">
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
        <button onclick="addCustomGame()" class="px-2.5 py-1 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-xs font-semibold cursor-pointer">+ Adicionar jogo</button>
        <button onclick="resetGamesToDefault()" class="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 text-xs cursor-pointer">Restaurar padrão</button>
      </div>
    </div>`;

  document.getElementById('sim-relevant-games-chips').innerHTML = `
    ${chips}
    <button onclick="toggleGameEditor()" class="px-2.5 py-1 rounded-full text-xs font-bold border border-sky-500/50 text-sky-300 bg-sky-500/10 cursor-pointer">⚙️ ${STATE.showGameEditor ? 'Fechar editor' : 'Editar / adicionar jogos'}</button>
    ${editor}`;
}

function toggleXeonDetails() {
  STATE.showXeonDetails = !STATE.showXeonDetails;
  renderSimulatorResultsOnly();
}

// 3.5. DEDICATED WORKSTATION & PRODUTIVIDADE COMPARISON (Setup A vs Setup B)
function renderSimulatorWorkstationComparison(gpuA, cpuA, gpuB, cpuB, compareOn = STATE.simCompareEnabled !== false) {
  const panel = document.getElementById('sim-workstation-panel');
  if (!panel) return;

  const safeGpuB = gpuB || gpuA;
  const safeCpuB = cpuB || cpuA;
  const sA = cpuA._specs || (typeof getCpuSpecs === 'function' ? getCpuSpecs(cpuA) : { cores: 6, threads: 12, multiBench: 5675, tdp: 65, ddr: 'DDR4' });
  const sB = safeCpuB._specs || (typeof getCpuSpecs === 'function' ? getCpuSpecs(safeCpuB) : { cores: 8, threads: 16, multiBench: 7980, tdp: 120, ddr: 'DDR5' });

  // 1. 3D Rendering (Blender Cycles Classroom - time in seconds, lower is better)
  const optixA = gpuA.brand === 'NVIDIA' ? 16 : 8;
  const optixB = safeGpuB.brand === 'NVIDIA' ? 16 : 8;
  const renderPwrA = (gpuA.fp16_tflops * optixA) + (sA.multiBench * 0.8);
  const renderPwrB = (safeGpuB.fp16_tflops * optixB) + (sB.multiBench * 0.8);
  const blenderSecA = Math.round(Math.max(6, 52000 / Math.max(100, renderPwrA)));
  const blenderSecB = Math.round(Math.max(6, 52000 / Math.max(100, renderPwrB)));
  const blenderGain = Math.round(((blenderSecB / Math.max(1, blenderSecA)) - 1) * 100);

  // 2. 4K Video Editing & Export (Premiere Pro / DaVinci Resolve - 10 min 4K timeline in seconds, lower is better)
  const isDualEncA = /rtx-50|4070|4080|4090/i.test(gpuA.slug);
  const isDualEncB = /rtx-50|4070|4080|4090/i.test(safeGpuB.slug);
  const encPwrA = isDualEncA ? 120 : (gpuA.brand === 'NVIDIA' ? 80 : 65);
  const encPwrB = isDualEncB ? 120 : (safeGpuB.brand === 'NVIDIA' ? 80 : 65);
  const vidPwrA = (gpuA.bandwidth_gbs * 0.15) + encPwrA + (sA.multiBench * 0.02);
  const vidPwrB = (safeGpuB.bandwidth_gbs * 0.15) + encPwrB + (sB.multiBench * 0.02);
  const exportSecA = Math.round(Math.max(20, 20000 / Math.max(50, vidPwrA)));
  const exportSecB = Math.round(Math.max(20, 20000 / Math.max(50, vidPwrB)));
  const exportGain = Math.round(((exportSecB / Math.max(1, exportSecA)) - 1) * 100);

  // 3. Code Compilation & Development (Rust / C++ / Docker - throughput in kLOC/s & clean build time in seconds)
  const klocA = Math.round((sA.threads * 4.5) + (sA.multiBench / 170));
  const klocB = Math.round((sB.threads * 4.5) + (sB.multiBench / 170));
  const buildSecA = Math.round(Math.max(8, 2500 / Math.max(1, klocA)));
  const buildSecB = Math.round(Math.max(8, 2500 / Math.max(1, klocB)));
  const buildGain = Math.round(((klocA / Math.max(1, klocB)) - 1) * 100);

  // 4. Hybrid AI & Technical Simulation (OpenDSS Monte Carlo / Matrizes Elétricas & 14B Q4 offload)
  const tokA = gpuA.llm_14b_tok_s || 30;
  const tokB = safeGpuB.llm_14b_tok_s || 20;
  const scnMinA = Math.round((gpuA.fp16_tflops * 18) + (sA.multiBench * 0.25));
  const scnMinB = Math.round((safeGpuB.fp16_tflops * 18) + (sB.multiBench * 0.25));
  const scnGain = Math.round(((scnMinA / Math.max(1, scnMinB)) - 1) * 100);

  panel.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-xs font-bold tracking-wider">WORKSTATION & PRODUTIVIDADE</span>
        <h3 class="text-base font-bold text-white">${compareOn ? 'Comparativo de Produtividade: Setup A vs Setup B' : 'Desempenho em Produtividade & Workstation'}</h3>
      </div>
      <div class="flex items-center gap-2 text-xs font-mono">
        ${compareOn
          ? `<span class="text-sky-300">Setup A (${gpuA.name} + ${cpuA.name})</span>
             <span class="text-slate-500">vs</span>
             <span class="text-emerald-300">Setup B (${safeGpuB.name} + ${safeCpuB.name})</span>`
          : `<span class="text-sky-300 font-semibold">${gpuA.name} + ${cpuA.name}</span>`}
      </div>
    </div>

    <!-- 4 Workstation Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
      <!-- 1. 3D Rendering (Blender Cycles) -->
      <div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-white flex items-center gap-1.5">
            <span>🎨 Render 3D (Blender)</span>
          </span>
          ${compareOn
            ? `<span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${blenderGain >= 0 ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'}">
                 ${blenderGain >= 0 ? 'Setup A ' + blenderGain + '% +rápido' : 'Setup B +' + Math.abs(blenderGain) + '% +rápido'}
               </span>`
            : `<span class="px-2 py-0.5 rounded font-mono text-xs font-bold bg-sky-500/20 text-sky-300">${gpuA.brand === 'NVIDIA' ? 'OptiX' : 'HIP'}</span>`}
        </div>
        <p class="text-xs text-slate-400">Cycles Classroom 1080p c/ OptiX/HIP + CPU Tile Assist:</p>
        <div class="space-y-1.5 pt-1 font-mono text-xs">
          <div class="flex justify-between items-center">
            <span class="text-sky-300 truncate">${compareOn ? 'Setup A:' : 'Setup:'}</span>
            <span class="font-bold text-white">${blenderSecA}s <span class="text-xs text-slate-400">(${gpuA.brand === 'NVIDIA' ? 'OptiX' : 'HIP'})</span></span>
          </div>
          ${compareOn ? `
          <div class="flex justify-between items-center">
            <span class="text-emerald-300 truncate">Setup B:</span>
            <span class="font-bold text-white">${blenderSecB}s <span class="text-xs text-slate-400">(${safeGpuB.brand === 'NVIDIA' ? 'OptiX' : 'HIP'})</span></span>
          </div>` : ''}
        </div>
        <div class="pt-1 text-xs text-slate-400 border-t border-slate-800/80">
          ${compareOn
            ? `Cinebench Multi: <strong>${sA.multiBench} pts</strong> (A) vs <strong>${sB.multiBench} pts</strong> (B)`
            : `Cinebench Multi: <strong>${sA.multiBench} pts</strong>`}
        </div>
      </div>

      <!-- 2. 4K Video Editing (Premiere / Resolve) -->
      <div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-white flex items-center gap-1.5">
            <span>🎬 Edição & Export 4K</span>
          </span>
          ${compareOn
            ? `<span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${exportGain >= 0 ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'}">
                 ${exportGain >= 0 ? 'Setup A ' + exportGain + '% +rápido' : 'Setup B +' + Math.abs(exportGain) + '% +rápido'}
               </span>`
            : `<span class="px-2 py-0.5 rounded font-mono text-xs font-bold bg-sky-500/20 text-sky-300">${isDualEncA ? 'Dual NVENC' : 'Single Enc'}</span>`}
        </div>
        <p class="text-xs text-slate-400">Exportação de timeline 10 min 4K H.264/HEVC/ProRes:</p>
        <div class="space-y-1.5 pt-1 font-mono text-xs">
          <div class="flex justify-between items-center">
            <span class="text-sky-300 truncate">${compareOn ? 'Setup A:' : 'Setup:'}</span>
            <span class="font-bold text-white">${exportSecA}s <span class="text-xs text-slate-400">(${isDualEncA ? 'Dual NVENC' : 'Single Enc'})</span></span>
          </div>
          ${compareOn ? `
          <div class="flex justify-between items-center">
            <span class="text-emerald-300 truncate">Setup B:</span>
            <span class="font-bold text-white">${exportSecB}s <span class="text-xs text-slate-400">(${isDualEncB ? 'Dual NVENC' : 'Single Enc'})</span></span>
          </div>` : ''}
        </div>
        <div class="pt-1 text-xs text-slate-400 border-t border-slate-800/80">
          ${compareOn
            ? `Timeline Fluida: ${sA.cores}C/${sA.threads}T (A) vs ${sB.cores}C/${sB.threads}T (B)`
            : `Timeline Fluida: ${sA.cores}C/${sA.threads}T`}
        </div>
      </div>

      <!-- 3. Code Compilation (Rust / C++ / Docker) -->
      <div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-white flex items-center gap-1.5">
            <span>⚙️ Compilação & Dev</span>
          </span>
          ${compareOn
            ? `<span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${buildGain >= 0 ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'}">
                 ${buildGain >= 0 ? 'Setup A +' + buildGain + '%' : 'Setup B +' + Math.abs(buildGain) + '%'}
               </span>`
            : `<span class="px-2 py-0.5 rounded font-mono text-xs font-bold bg-sky-500/20 text-sky-300">-j ${sA.threads}</span>`}
        </div>
        <p class="text-xs text-slate-400">Vazão do compilador Rust/C++ em linhas de código:</p>
        <div class="space-y-1.5 pt-1 font-mono text-xs">
          <div class="flex justify-between items-center">
            <span class="text-sky-300 truncate">${compareOn ? 'Setup A:' : 'Setup:'}</span>
            <span class="font-bold text-white">${klocA} kLOC/s <span class="text-xs text-slate-400">(build: ${buildSecA}s)</span></span>
          </div>
          ${compareOn ? `
          <div class="flex justify-between items-center">
            <span class="text-emerald-300 truncate">Setup B:</span>
            <span class="font-bold text-white">${klocB} kLOC/s <span class="text-xs text-slate-400">(build: ${buildSecB}s)</span></span>
          </div>` : ''}
        </div>
        <div class="pt-1 text-xs text-slate-400 border-t border-slate-800/80">
          ${compareOn
            ? `Workers paralelos: <strong>-j ${sA.threads}</strong> (A) vs <strong>-j ${sB.threads}</strong> (B)`
            : `Workers paralelos: <strong>-j ${sA.threads}</strong>`}
        </div>
      </div>

      <!-- 4. Hybrid AI & Simulation (OpenDSS / Monte Carlo) -->
      <div class="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-white flex items-center gap-1.5">
            <span>⚡ Simulação Técnica & IA</span>
          </span>
          ${compareOn
            ? `<span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${scnGain >= 0 ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'}">
                 ${scnGain >= 0 ? 'Setup A +' + scnGain + '%' : 'Setup B +' + Math.abs(scnGain) + '%'}
               </span>`
            : `<span class="px-2 py-0.5 rounded font-mono text-xs font-bold bg-sky-500/20 text-sky-300">${gpuA.vram_gb}GB + ${sA.ddr}</span>`}
        </div>
        <p class="text-xs text-slate-400">Matrizes esparsas OpenDSS / Monte Carlo & 14B Q4:</p>
        <div class="space-y-1.5 pt-1 font-mono text-xs">
          <div class="flex justify-between items-center">
            <span class="text-sky-300 truncate">${compareOn ? 'Setup A:' : 'Setup:'}</span>
            <span class="font-bold text-white">${scnMinA} c/min <span class="text-xs text-slate-400">(${tokA} tok/s)</span></span>
          </div>
          ${compareOn ? `
          <div class="flex justify-between items-center">
            <span class="text-emerald-300 truncate">Setup B:</span>
            <span class="font-bold text-white">${scnMinB} c/min <span class="text-xs text-slate-400">(${tokB} tok/s)</span></span>
          </div>` : ''}
        </div>
        <div class="pt-1 text-xs text-slate-400 border-t border-slate-800/80">
          ${compareOn
            ? `VRAM + Memória: ${gpuA.vram_gb}GB + ${sA.ddr} vs ${safeGpuB.vram_gb}GB + ${sB.ddr}`
            : `VRAM + Memória: ${gpuA.vram_gb}GB + ${sA.ddr}`}
        </div>
      </div>
    </div>
  `;
}
window.renderSimulatorWorkstationComparison = renderSimulatorWorkstationComparison;

// Global radar chart instance for Simulator Tab
let chartSimRadar = null;

// Bidirectional Setup Synergy & Bottleneck Assessment
function calcSetupSynergyScore(gpu, cpu, opts = {}) {
  const games = getRelevantGames();
  if (!games.length) return { synergy: 95, lossPct: 0, wastePct: 0, status: '🟢 Equilibrado' };
  let pureSum = 0, cpuCapSum = 0, withCpuSum = 0;
  games.forEach(g => {
    const m = estimateFps(gpu, cpu, g, opts);
    pureSum += (m.basePureFps !== undefined ? m.basePureFps : m.pure);
    cpuCapSum += m.cpuCap;
    withCpuSum += (m.baseRenderFps !== undefined ? m.baseRenderFps : m.withCpu);
  });
  const avgPure = pureSum / games.length;
  const avgCap = cpuCapSum / games.length;
  const avgWithCpu = withCpuSum / games.length;

  // 1. CPU bottleneck on GPU (CPU is too weak for GPU)
  const lossPct = Math.max(0, Math.round((1 - avgWithCpu / Math.max(1, avgPure)) * 100));

  // 2. GPU bottleneck on CPU (GPU is too weak for CPU, CPU capacity is wasted)
  const wastePct = Math.max(0, Math.round((1 - avgPure / Math.max(1, avgCap)) * 100));

  let synergy = 100;
  let status = '🟢 Setup Equilibrado';
  if (lossPct >= 5) {
    synergy -= lossPct * 1.2;
    status = `🔴 Gargalo CPU (-${lossPct}%)`;
  } else if (wastePct >= 25) {
    synergy -= (wastePct - 20) * 0.75;
    status = `🟡 Gargalo GPU (CPU ${wastePct}% ociosa)`;
  }

  const finalSynergy = Math.max(20, Math.min(100, Math.round(synergy)));
  return { synergy: finalSynergy, lossPct, wastePct, status };
}
window.calcSetupSynergyScore = calcSetupSynergyScore;

function _radarPctRef(values, pct = 0.95, minFloor = 1) {
  const arr = (values || []).map(Number).filter(v => isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!arr.length) return minFloor;
  const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((arr.length - 1) * pct)));
  return Math.max(minFloor, arr[idx]);
}

function computeRadarMetrics(gpuA, cpuA, gpuB, cpuB, mode, opts = {}, compareOn = STATE.simCompareEnabled !== false) {
  const safeGpuB = gpuB || gpuA;
  const safeCpuB = cpuB || cpuA;
  const sA = cpuA._specs || (typeof getCpuSpecs === 'function' ? getCpuSpecs(cpuA) : { cores: 6, threads: 12, multiBench: 5675, singleBench: 80, tdp: 65, ddr: 'DDR4', socket: 'AM4' });
  const sB = safeCpuB._specs || (typeof getCpuSpecs === 'function' ? getCpuSpecs(safeCpuB) : { cores: 8, threads: 16, multiBench: 7980, singleBench: 95, tdp: 120, ddr: 'DDR5', socket: 'AM5' });

  let labels = [];
  let rawA = [];
  let rawB = [];
  let units = [];
  let refCeilings = null;

  if (mode === 'gpu' || mode === 'pure') {
    // Mode: Apenas GPU
    labels = [
      'Raster Puro 1440p',
      'Ray Tracing & MFG',
      'VRAM & Largura Banda',
      'Render 3D GPU',
      'Vídeo & Encoders',
      'IA Local GPU'
    ];
    const gScoreA = gpuA.gaming_score || 1500;
    const gScoreB = safeGpuB.gaming_score || 1500;

    const techA = getGpuTechProfile(gpuA);
    const techB = getGpuTechProfile(safeGpuB);
    const rtA = (gpuA.fp16_tflops || 15) * (techA.qualityFactor || 1) * (techA.maxFgMult || 1);
    const rtB = (safeGpuB.fp16_tflops || 15) * (techB.qualityFactor || 1) * (techB.maxFgMult || 1);

    const vramA = (gpuA.vram_gb * 10) + ((gpuA.bandwidth_gbs || 300) / 20);
    const vramB = (safeGpuB.vram_gb * 10) + ((safeGpuB.bandwidth_gbs || 300) / 20);

    const r3dA = (gpuA.fp16_tflops || 15) * (gpuA.brand === 'NVIDIA' ? 16 : 8);
    const r3dB = (safeGpuB.fp16_tflops || 15) * (safeGpuB.brand === 'NVIDIA' ? 16 : 8);

    const isDualA = /rtx-50|4070|4080|4090/i.test(gpuA.slug);
    const isDualB = /rtx-50|4070|4080|4090/i.test(safeGpuB.slug);
    const encA = (isDualA ? 100 : (gpuA.brand === 'NVIDIA' ? 75 : 60)) + ((gpuA.bandwidth_gbs || 300) / 40);
    const encB = (isDualB ? 100 : (safeGpuB.brand === 'NVIDIA' ? 75 : 60)) + ((safeGpuB.bandwidth_gbs || 300) / 40);

    const aiA = (gpuA.llm_14b_tok_s || 25) * 2 + (gpuA.vram_gb >= 16 ? 40 : (gpuA.vram_gb >= 12 ? 25 : 10));
    const aiB = (safeGpuB.llm_14b_tok_s || 25) * 2 + (safeGpuB.vram_gb >= 16 ? 40 : (safeGpuB.vram_gb >= 12 ? 25 : 10));

    rawA = [gScoreA, Math.round(rtA), Math.round(vramA), Math.round(r3dA), Math.round(encA), Math.round(aiA)];
    rawB = [gScoreB, Math.round(rtB), Math.round(vramB), Math.round(r3dB), Math.round(encB), Math.round(aiB)];
    units = ['pts', 'pts', 'GB/s', 'pts', 'pts', 'tok/s'];

    if (!compareOn) {
      const gpus = (window.DB && Array.isArray(DB.gpus) && DB.gpus.length) ? DB.gpus : [gpuA];
      refCeilings = [
        _radarPctRef(gpus.map(g => g.gaming_score || 1500), 0.95, 5000),
        _radarPctRef(gpus.map(g => { const t = getGpuTechProfile(g); return (g.fp16_tflops || 15) * (t.qualityFactor || 1) * (t.maxFgMult || 1); }), 0.95, 250),
        _radarPctRef(gpus.map(g => ((g.vram_gb || 8) * 10) + ((g.bandwidth_gbs || 300) / 20)), 0.95, 200),
        _radarPctRef(gpus.map(g => (g.fp16_tflops || 15) * (g.brand === 'NVIDIA' ? 16 : 8)), 0.95, 1400),
        _radarPctRef(gpus.map(g => (/rtx-50|4070|4080|4090/i.test(g.slug) ? 100 : (g.brand === 'NVIDIA' ? 75 : 60)) + ((g.bandwidth_gbs || 300) / 40)), 0.95, 120),
        _radarPctRef(gpus.map(g => (g.llm_14b_tok_s || 25) * 2 + (g.vram_gb >= 16 ? 40 : (g.vram_gb >= 12 ? 25 : 10))), 0.95, 180)
      ];
    }
  } else if (mode === 'cpu') {
    // Mode: Apenas CPU
    labels = [
      'Single-Core (IPC)',
      'Multi-Core (Render)',
      'Compilação & Dev',
      'Teto Jogos (FPS)',
      'Plataforma & PCIe',
      'Eficiência Térmica'
    ];
    const ipcA = sA.singleBench || 70;
    const ipcB = sB.singleBench || 70;

    const multiA = sA.multiBench || 5000;
    const multiB = sB.multiBench || 5000;

    const devA = Math.round((sA.threads * 4.5) + (sA.multiBench / 170));
    const devB = Math.round((sB.threads * 4.5) + (sB.multiBench / 170));

    const gCeilA = getCpuGamingIndex(cpuA);
    const gCeilB = getCpuGamingIndex(safeCpuB);

    const isLga2011A = (sA.socket === 'LGA2011-3');
    const isLga2011B = (sB.socket === 'LGA2011-3');
    const platA = isLga2011A ? 35 : (sA.ddr === 'DDR5' ? 95 : 70);
    const platB = isLga2011B ? 35 : (sB.ddr === 'DDR5' ? 95 : 70);

    const effA = Math.round((multiA / Math.max(45, sA.tdp || 65)) * 10);
    const effB = Math.round((multiB / Math.max(45, sB.tdp || 65)) * 10);

    rawA = [ipcA, multiA, devA, gCeilA, platA, effA];
    rawB = [ipcB, multiB, devB, gCeilB, platB, effB];
    units = ['pts', 'pts', 'kLOC/s', '/100', 'pts', 'pts/W'];

    if (!compareOn) {
      const cpusAll = (window.DB && Array.isArray(DB.cpus) ? DB.cpus : [cpuA]).filter(c => !/threadripper/i.test(c.slug));
      const cpus = cpusAll.length ? cpusAll : [cpuA];
      const specsList = cpus.map(c => c._specs || (typeof getCpuSpecs === 'function' ? getCpuSpecs(c) : { threads: 12, multiBench: 5000, singleBench: 80, tdp: 65 }));
      refCeilings = [
        _radarPctRef(specsList.map(s => s.singleBench || 70), 0.95, 130),
        _radarPctRef(specsList.map(s => s.multiBench || 5000), 0.95, 10000),
        _radarPctRef(specsList.map(s => Math.round(((s.threads || 12) * 4.5) + ((s.multiBench || 5000) / 170))), 0.95, 160),
        100,
        100,
        _radarPctRef(specsList.map(s => Math.round(((s.multiBench || 5000) / Math.max(45, s.tdp || 65)) * 10)), 0.95, 1200)
      ];
    }
  } else {
    // Mode: both (GPU + CPU Setup Completo)
    const sgRadar = getSimGraphicsState();
    const prShort = (SIM_QUALITY_PRESETS[sgRadar.preset] || SIM_QUALITY_PRESETS[3]).shortLabel;
    const monShort = (MONITOR_RES[STATE.monitorRes] || MONITOR_RES['1440p']).label.replace('2560×1440', '1440p').replace('1920×1080', '1080p').replace('3840×2160', '4K');
    labels = [
      `Jogos ${monShort} (${prShort})`,
      'Workstation 3D',
      'Edição Vídeo & AV1',
      'Compilação & Dev',
      'IA & Inferência LLM',
      'Equilíbrio & Sinergia'
    ];
    const games = getRelevantGames();
    const fpsA = Math.round(games.reduce((s, g) => s + estimateFps(gpuA, cpuA, g, opts).withCpu, 0) / Math.max(1, games.length));
    const fpsB = compareOn ? Math.round(games.reduce((s, g) => s + estimateFps(safeGpuB, safeCpuB, g, opts).withCpu, 0) / Math.max(1, games.length)) : fpsA;

    const rOptA = gpuA.brand === 'NVIDIA' ? 16 : 8;
    const rOptB = safeGpuB.brand === 'NVIDIA' ? 16 : 8;
    const ws3dA = Math.round((gpuA.fp16_tflops * rOptA) + (sA.multiBench * 0.8));
    const ws3dB = Math.round((safeGpuB.fp16_tflops * rOptB) + (sB.multiBench * 0.8));

    const isDualA = /rtx-50|4070|4080|4090/i.test(gpuA.slug);
    const isDualB = /rtx-50|4070|4080|4090/i.test(safeGpuB.slug);
    const encPwrA = isDualA ? 120 : (gpuA.brand === 'NVIDIA' ? 80 : 65);
    const encPwrB = isDualB ? 120 : (safeGpuB.brand === 'NVIDIA' ? 80 : 65);
    const vidA = Math.round((gpuA.bandwidth_gbs * 0.15) + encPwrA + (sA.multiBench * 0.02));
    const vidB = Math.round((safeGpuB.bandwidth_gbs * 0.15) + encPwrB + (sB.multiBench * 0.02));

    const devA = Math.round((sA.threads * 4.5) + (sA.multiBench / 170));
    const devB = Math.round((sB.threads * 4.5) + (sB.multiBench / 170));

    const aiA = Math.round((gpuA.fp16_tflops * 18) + (sA.multiBench * 0.25) + (gpuA.vram_gb * 15));
    const aiB = Math.round((safeGpuB.fp16_tflops * 18) + (sB.multiBench * 0.25) + (safeGpuB.vram_gb * 15));

    const synObjA = calcSetupSynergyScore(gpuA, cpuA, opts);
    const synObjB = compareOn ? calcSetupSynergyScore(safeGpuB, safeCpuB, opts) : synObjA;

    rawA = [fpsA, ws3dA, vidA, devA, aiA, synObjA.synergy];
    rawB = [fpsB, ws3dB, vidB, devB, aiB, synObjB.synergy];
    units = ['FPS', 'pts', 'pts', 'kLOC/s', 'pts', '%'];

    if (!compareOn) {
      const gpusAll = (window.DB && Array.isArray(DB.gpus) && DB.gpus.length) ? DB.gpus : [gpuA];
      const gpusSorted = gpusAll.slice().sort((a, b) => (a.gaming_score || 0) - (b.gaming_score || 0));
      const refGpu = gpusSorted[Math.min(gpusSorted.length - 1, Math.floor((gpusSorted.length - 1) * 0.95))] || gpuA;

      const cpusNonTr = (window.DB && Array.isArray(DB.cpus) ? DB.cpus : [cpuA]).filter(c => !/threadripper/i.test(c.slug));
      const cpusPool = cpusNonTr.length ? cpusNonTr : [cpuA];
      const cpusSorted = cpusPool.slice().sort((a, b) => (a.benchmark || 0) - (b.benchmark || 0));
      const refCpu = cpusSorted[Math.min(cpusSorted.length - 1, Math.floor((cpusSorted.length - 1) * 0.95))] || cpuA;
      const specsList = cpusPool.map(c => c._specs || (typeof getCpuSpecs === 'function' ? getCpuSpecs(c) : { threads: 12, multiBench: 5000 }));

      const refFps = Math.max(120, Math.round(games.reduce((s, g) => s + estimateFps(refGpu, refCpu, g, opts).withCpu, 0) / Math.max(1, games.length)));
      const p95GpuWs = _radarPctRef(gpusAll.map(g => (g.fp16_tflops || 15) * (g.brand === 'NVIDIA' ? 16 : 8)), 0.95, 1400);
      const p95CpuMulti = _radarPctRef(specsList.map(s => s.multiBench || 5000), 0.95, 10000);
      const p95GpuVid = _radarPctRef(gpusAll.map(g => ((g.bandwidth_gbs || 300) * 0.15) + (/rtx-50|4070|4080|4090/i.test(g.slug) ? 120 : (g.brand === 'NVIDIA' ? 80 : 65))), 0.95, 220);
      const p95CpuDev = _radarPctRef(specsList.map(s => Math.round(((s.threads || 12) * 4.5) + ((s.multiBench || 5000) / 170))), 0.95, 160);
      const p95GpuAi = _radarPctRef(gpusAll.map(g => ((g.fp16_tflops || 15) * 18) + ((g.vram_gb || 8) * 15)), 0.95, 1800);

      refCeilings = [
        refFps,
        Math.round(p95GpuWs + p95CpuMulti * 0.8),
        Math.round(p95GpuVid + p95CpuMulti * 0.02),
        p95CpuDev,
        Math.round(p95GpuAi + p95CpuMulti * 0.25),
        100
      ];
    }
  }

  const valsA = [];
  const valsB = [];
  for (let i = 0; i < 6; i++) {
    const a = rawA[i], b = rawB[i];
    if (!compareOn && refCeilings) {
      const scaled = Math.min(100, Math.round(Math.max(12, (a / Math.max(1, refCeilings[i])) * 100)));
      valsA.push(scaled);
      valsB.push(scaled);
    } else {
      const maxVal = Math.max(a, b, 1);
      valsA.push(Math.round(Math.max(15, (a / maxVal) * 100)));
      valsB.push(Math.round(Math.max(15, (b / maxVal) * 100)));
    }
  }

  return { labels, valsA, valsB, rawA, rawB, units };
}
window.computeRadarMetrics = computeRadarMetrics;

function renderSimulatorRadarChart(gpuA, cpuA, gpuB, cpuB, mode, opts = {}, compareOn = STATE.simCompareEnabled !== false) {
  const canvas = document.getElementById('chart-sim-radar');
  if (!canvas) return;

  const safeGpuB = gpuB || gpuA;
  const safeCpuB = cpuB || cpuA;
  const data = computeRadarMetrics(gpuA, cpuA, safeGpuB, safeCpuB, mode, opts, compareOn);
  const badgeEl = document.getElementById('sim-radar-winner-badge');
  const breakdownEl = document.getElementById('sim-radar-metrics-breakdown');

  if (!compareOn) {
    const avgRadarA = Math.round(data.valsA.reduce((s, v) => s + v, 0) / 6);
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/50 font-mono text-xs font-bold">📊 Índice Geral do Setup: ${avgRadarA}/100</span>`;
    }
    if (breakdownEl) {
      breakdownEl.innerHTML = data.labels.map((lbl, i) => `
        <div class="p-2 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
            <span class="text-slate-300 font-semibold text-xs">${lbl}</span>
          </div>
          <div class="flex items-center gap-2 ui-mono text-xs">
            <span class="font-bold" style="color:var(--ui-compare-a-text);">${data.rawA[i]} <span class="text-xs text-slate-500">${data.units[i]}</span></span>
            <span class="ui-badge ui-badge--a ui-mono">${data.valsA[i]}/100</span>
          </div>
        </div>`).join('');
    }
  } else {
    // Count wins
    let winsA = 0, winsB = 0;
    for (let i = 0; i < 6; i++) {
      if (data.rawA[i] > data.rawB[i]) winsA++;
      else if (data.rawB[i] > data.rawA[i]) winsB++;
    }

    if (badgeEl) {
      if (winsA > winsB) {
        badgeEl.innerHTML = `<span class="px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/50 font-mono text-xs font-bold">🏆 Setup A lidera em ${winsA}/6 capacidades</span>`;
      } else if (winsB > winsA) {
        badgeEl.innerHTML = `<span class="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-mono text-xs font-bold">🏆 Setup B lidera em ${winsB}/6 capacidades</span>`;
      } else {
        badgeEl.innerHTML = `<span class="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 font-mono text-xs font-bold">⚖️ Empate Técnico (${winsA} vs ${winsB})</span>`;
      }
    }

    if (breakdownEl) {
      breakdownEl.innerHTML = data.labels.map((lbl, i) => {
        const aWins = data.rawA[i] >= data.rawB[i];
        const bWins = data.rawB[i] >= data.rawA[i];
        const diffPct = data.rawB[i] > 0 ? Math.round(((data.rawA[i] / data.rawB[i]) - 1) * 100) : 0;
        return `
          <div class="p-2 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full ${aWins && !bWins ? 'bg-sky-400' : (bWins && !aWins ? 'bg-emerald-400' : 'bg-slate-500')}"></span>
              <span class="text-slate-300 font-semibold text-xs">${lbl}</span>
            </div>
            <div class="flex items-center gap-2 ui-mono text-xs">
              <span class="${aWins ? 'font-bold' : 'text-slate-400'}" style="${aWins ? 'color:var(--ui-compare-a-text);' : ''}">${data.rawA[i]} <span class="text-xs text-slate-500">${data.units[i]}</span></span>
              <span class="text-slate-600">vs</span>
              <span class="${bWins ? 'font-bold' : 'text-slate-400'}" style="${bWins ? 'color:var(--ui-compare-b-text);' : ''}">${data.rawB[i]} <span class="text-xs text-slate-500">${data.units[i]}</span></span>
              <span class="ui-badge ${diffPct >= 0 ? 'ui-badge--a' : 'ui-badge--b'} ui-mono">
                ${diffPct >= 0 ? '+A ' + diffPct + '%' : '+B ' + Math.abs(diffPct) + '%'}
              </span>
            </div>
          </div>`;
      }).join('');
    }
  }

  const ctx = canvas.getContext('2d');
  if (chartSimRadar) chartSimRadar.destroy();

  const datasets = [
    {
      label: compareOn ? `Setup A (${gpuA.name} + ${cpuA.name})` : `${gpuA.name} + ${cpuA.name}`,
      data: data.valsA,
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56, 189, 248, 0.22)',
      borderWidth: 2,
      pointBackgroundColor: '#38bdf8',
      pointBorderColor: '#fff',
      pointHoverRadius: 5,
      pointRadius: 3
    }
  ];
  if (compareOn) {
    datasets.push({
      label: `Setup B (${safeGpuB.name} + ${safeCpuB.name})`,
      data: data.valsB,
      borderColor: '#a78bfa',
      backgroundColor: 'rgba(167, 139, 250, 0.22)',
      borderWidth: 2,
      pointBackgroundColor: '#a78bfa',
      pointBorderColor: '#fff',
      pointHoverRadius: 5,
      pointRadius: 3
    });
  }

  chartSimRadar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: data.labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          angleLines: { color: 'rgba(51, 65, 85, 0.45)' },
          grid: { color: 'rgba(51, 65, 85, 0.35)' },
          pointLabels: {
            color: '#94a3b8',
            font: { size: 12, family: gcaFontFamily(), weight: 'bold' }
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#cbd5e1',
            font: { size: 12, family: gcaFontFamily() },
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: (c) => compareOn ? `${c.dataset.label}: ${c.raw}% (Relativo)` : `${c.dataset.label}: ${c.raw}/100 (Ref. Catálogo)`
          }
        }
      }
    }
  });
}
window.renderSimulatorRadarChart = renderSimulatorRadarChart;

function _describeSimTechForSetup(gpu, sg) {
  const cap = getGpuHardwareCapabilities(gpu);
  const useDlss = !!(sg.dlss && cap.hasDLSS);
  const useFsr = !useDlss && !!(sg.fsr && cap.hasFSR);
  const parts = [];
  if (sg.dlss && !cap.hasDLSS && !useFsr) parts.push('⚠️ Sem DLSS (Nativo)');
  else if (useDlss && sg.fsr) parts.push(`${cap.dlssLabel} (prioritário s/ FSR)`);
  else if (useDlss) parts.push(cap.dlssLabel);
  else if (useFsr) parts.push(cap.fsrLabel);
  else parts.push('Nativo');

  if (sg.mfg) {
    if (cap.maxFgMult >= 4) parts.push(`MFG ${sg.mfgMult === 'auto' ? 'Auto 2–4×' : sg.mfgMult + '×'}`);
    else if (cap.hasNativeFG) parts.push('DLSS FG 2×');
    else if (cap.hasFsrFg) parts.push('FSR FG 2×');
    else if (cap.canFsrFgWithFsr && sg.fsr) parts.push('FSR 3 FG 2×');
    else parts.push(cap.canFsrFgWithFsr ? '⚠️ Ative FSR p/ FG' : '⚠️ Sem FG/MFG');
  }
  return {
    text: parts.join(' + '),
    dlssWarn: !!(sg.dlss && !cap.hasDLSS),
    mfgWarn: !!(sg.mfg && !(cap.maxFgMult > 1 || (cap.canFsrFgWithFsr && sg.fsr)))
  };
}

function renderSimulatorResultsOnly() {
  const compareOn = STATE.simCompareEnabled !== false;
  const selGpuAVal = (document.getElementById('sim-select-gpu-a') || {}).value || '';
  const selGpuBVal = (document.getElementById('sim-select-gpu-b') || {}).value || '';
  if (selGpuAVal) STATE.simGpuASlug = selGpuAVal;
  if (selGpuBVal) STATE.simGpuBSlug = selGpuBVal;
  const gpuA = DB.gpus.find(g => g.slug === selGpuAVal) || DB.gpus[0];
  const gpuB = DB.gpus.find(g => g.slug === selGpuBVal) || DB.gpus[1] || gpuA;
  const cpuA = getSimCpu('a');
  const cpuB = compareOn ? getSimCpu('b') : cpuA;
  const safeGpuB = gpuB || gpuA;
  const safeCpuB = cpuB || cpuA;
  const mode = (document.getElementById('sim-select-cpu-mode') || {}).value || 'both';
  const sg = getSimGraphicsState();
  const presetMeta = SIM_QUALITY_PRESETS[sg.preset] || SIM_QUALITY_PRESETS[3];
  const cap = STATE.monitorMaxFps >= 999 ? 999 : STATE.monitorMaxFps;
  const opts = { simGraphics: sg };

  syncSimGraphicsUI();
  const resPill = document.getElementById('sim-res-live-pill');
  if (resPill) resPill.textContent = getMonitorLabel();

  const descA = _describeSimTechForSetup(gpuA, sg);
  const descB = compareOn ? _describeSimTechForSetup(safeGpuB, sg) : descA;
  const compatEl = document.getElementById('sim-tech-compat-summary');
  if (compatEl) {
    compatEl.innerHTML = compareOn
      ? `<span class="text-sky-300 font-semibold">A:</span> ${descA.text} <span class="text-slate-600 mx-1">•</span> <span class="text-emerald-300 font-semibold">B:</span> ${descB.text}`
      : `<span class="text-sky-300 font-semibold">${gpuA.name}:</span> ${descA.text} <span class="text-slate-500">• Base real limitada na CPU</span>`;
  }
  const btnDlss = document.getElementById('sim-toggle-dlss');
  if (btnDlss) btnDlss.classList.toggle('is-warn', descA.dlssWarn && (!compareOn || descB.dlssWarn));
  const btnMfg = document.getElementById('sim-toggle-mfg');
  if (btnMfg) btnMfg.classList.toggle('is-warn', descA.mfgWarn && (!compareOn || descB.mfgWarn));

  const dlssModeLabel = `${presetMeta.label} • ${sg.dlss || sg.fsr || sg.mfg ? [sg.dlss ? 'DLSS' : '', sg.fsr ? 'FSR' : '', sg.mfg ? 'MFG' : ''].filter(Boolean).join('+') : 'Nativo'}`;

  const focusResEl = document.getElementById('sim-focus-res-label');
  if (focusResEl) focusResEl.textContent = `${getMonitorLabel()} • ${presetMeta.shortLabel}`;

  // Sleek, compact Architecture, Preset & CPU Lock Notice Bar
  const xeonWarnA = getCpuArchitectureAdviceHTML(cpuA, gpuA, compareOn ? safeGpuB : null);
  const xeonWarnB = compareOn ? getCpuArchitectureAdviceHTML(safeCpuB, safeGpuB, gpuA) : '';
  const adviceBanner = document.getElementById('sim-cpu-advice-banner') || document.getElementById('sim-xeon-warning-banner');
  if (adviceBanner) adviceBanner.innerHTML = `
    <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div class="flex flex-wrap items-center gap-2">
        <span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-xs font-bold">${compareOn ? 'SETUP A:' : 'SETUP:'} ${gpuA.name} + ${cpuA.name}</span>
        ${compareOn ? `<span class="text-slate-500">|</span><span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold">SETUP B: ${safeGpuB.name} + ${safeCpuB.name}</span>` : ''}
        <span class="text-slate-400 hidden sm:inline">• ${getMonitorLabel()} • ${dlssModeLabel}</span>
      </div>
      <button onclick="toggleXeonDetails()" id="btn-toggle-xeon-details" class="text-xs text-sky-400 hover:text-sky-300 underline cursor-pointer">
        ${STATE.showXeonDetails ? 'Ocultar Detalhes Técnicos ▲' : (compareOn ? 'Ver Detalhes CPU / PT / MFG ▼' : 'Ver Detalhes CPU / PT / MFG ▼')}
      </button>
    </div>
    <div id="sim-xeon-details-box" class="${STATE.showXeonDetails ? '' : 'hidden'} mt-2 space-y-2">
      ${xeonWarnA}
      ${compareOn && xeonWarnB !== xeonWarnA ? xeonWarnB : ''}
      <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-1">
        <div>🔒 <strong>Teto rígido de CPU:</strong> mesmo reduzindo o preset até <em>Muito Baixo</em> ou ativando <em>DLSS/FSR</em>, o FPS real renderizado nunca ultrapassa o máximo que a CPU consegue enviar (ex.: <strong>${cpuA.name}</strong> índice ${getCpuGamingIndex(cpuA)}/100).</div>
        <div>✨ <strong>Ultra (+ Path Tracing) &amp; MFG:</strong> no preset Ultra, jogos compatíveis (Cyberpunk 2077, Alan Wake 2, Black Myth: Wukong, Minecraft PT) ativam Path Tracing completo e BVH extra na CPU. <strong>DLSS 4 MFG (3×/4×)</strong> funciona nas RTX 50; RTX 40 e RX 6000–9000 ficam em <strong>FG 2×</strong>.</div>
      </div>
    </div>`;

  const badgeEl = document.getElementById('sim-cpu-factor-badge');
  if (badgeEl) {
    badgeEl.textContent = compareOn
      ? `A: ${getCpuGamingIndex(cpuA)}/100 • B: ${getCpuGamingIndex(safeCpuB)}/100`
      : `CPU: ${getCpuGamingIndex(cpuA)}/100`;
  }

  // Focus game card
  const focus = STATE.games.find(g => g.id === STATE.focusGameId) || STATE.games[0];
  if (focus) {
    const a = estimateFps(gpuA, cpuA, focus, opts);
    const b = compareOn ? estimateFps(safeGpuB, safeCpuB, focus, opts) : a;
    const row = (gpu, cpu, r, color, setupLabel) => {
      const shown = (mode === 'pure' || mode === 'gpu') ? r.pure : r.withCpu;
      const limitedBy = `<span class="${r.bottleneckType === 'cpu' ? 'text-amber-300' : (r.bottleneckType === 'gpu' ? 'text-sky-300' : 'text-emerald-300')}">${r.bottleneckLabel}</span>`;
      const visible = Math.min(shown, cap);
      const fgBadge = r.canUseFG
        ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-xs">${r.tech.badge} (${r.activeFgMult}×)</span>`
        : `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs">${r.tech.badge}</span>`;
      const ptBadge = r.ptActive
        ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs">Path Tracing</span>`
        : (r.rtActive ? `<span class="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-mono text-xs">RT</span>` : '');
      const latColor = r.latencyMs <= 24 ? 'text-emerald-400' : r.latencyMs <= 38 ? 'text-amber-300' : 'text-rose-400';
      return `
        <div class="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1.5">
          <div class="flex flex-wrap justify-between items-center gap-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-slate-800 ${color}">${setupLabel}</span>
              <span class="font-bold text-white text-xs">${gpu.name} + ${cpu.name}</span>
              ${ptBadge}
              ${fgBadge}
            </div>
            ${mode !== 'pure' && mode !== 'gpu' ? `<span class="text-xs">${limitedBy}</span>` : ''}
          </div>
          <div class="grid grid-cols-4 gap-1.5 text-center">
            <div title="Potência bruta da GPU sem gargalo de CPU neste preset">
              <span class="block text-xs uppercase text-slate-500 font-mono">GPU Pura</span>
              <span class="font-mono font-bold text-slate-200 text-sm">${r.basePureFps}</span>
            </div>
            <div title="FPS real renderizado travado no teto máximo da CPU (define fluidez física e resposta)">
              <span class="block text-xs uppercase text-amber-400 font-mono">Real c/ CPU</span>
              <span class="font-mono font-extrabold ${r.isCpuLocked ? 'text-amber-300' : 'text-white'} text-base">${r.isCpuLocked ? '🔒 ' : ''}${r.baseRenderFps}</span>
            </div>
            <div title="FPS exibido na tela incluindo interpolação MFG/FG">
              <span class="block text-xs uppercase text-slate-500 font-mono">${r.canUseFG ? `Tela ${r.activeFgMult}×` : 'MFG / FG'}</span>
              <span class="font-mono font-extrabold ${r.canUseFG ? 'text-emerald-400' : 'text-slate-500'} text-sm">${r.canUseFG ? r.displayedWithCpu : 'Off'}</span>
            </div>
            <div title="FPS útil aproveitado até o Hz do monitor e latência estimada">
              <span class="block text-xs uppercase text-sky-400 font-mono">Monitor / Lat.</span>
              <span class="font-mono font-extrabold text-sky-300 text-sm">${visible} <span class="text-xs ${latColor}">(${r.latencyMs}ms)</span></span>
            </div>
          </div>
          ${r.techNotes && r.techNotes.length ? `<div class="text-xs text-slate-300 ui-mono pt-1 border-t border-slate-800/70">${r.techNotes.join(' • ')}</div>` : ''}
        </div>`;
    };
    document.getElementById('sim-focus-game-card').innerHTML = compareOn
      ? `<div class="space-y-2">
           ${row(gpuA, cpuA, a, 'text-sky-300', 'Setup A')}
           ${row(safeGpuB, safeCpuB, b, 'text-emerald-300', 'Setup B')}
           <p class="text-xs text-slate-500">Teto real da CPU: ${cpuA.name} (~${a.cpuCap} FPS) vs ${safeCpuB.name} (~${b.cpuCap} FPS). Reduzir o preset ou ligar DLSS/FSR não ultrapassa o teto real da CPU.</p>
         </div>`
      : `<div class="space-y-2">
           ${row(gpuA, cpuA, a, 'text-sky-300', 'Setup')}
           <p class="text-xs text-slate-500">Teto real da CPU: ${cpuA.name} (~${a.cpuCap} FPS). Reduzir o preset ou ligar DLSS/FSR não ultrapassa o teto real da CPU.</p>
         </div>`;
  }

  // Averages across relevant games
  const games = getRelevantGames();
  const resA = games.map(g => estimateFps(gpuA, cpuA, g, opts));
  const resB = compareOn ? games.map(g => estimateFps(safeGpuB, safeCpuB, g, opts)) : resA;
  const meanOf = (arr, key) => Math.round(arr.reduce((s, r) => s + (r[key] || 0), 0) / Math.max(1, arr.length));
  const meanVisOf = (arr, key) => Math.round(arr.reduce((s, r) => s + Math.min(cap, r[key] || 0), 0) / Math.max(1, arr.length));

  const aPure = meanOf(resA, 'pure'), aCpu = meanOf(resA, 'withCpu');
  const bPure = meanOf(resB, 'pure'), bCpu = meanOf(resB, 'withCpu');
  const aBasePure = meanOf(resA, 'basePureFps'), aBaseCpu = meanOf(resA, 'baseRenderFps');
  const bBasePure = meanOf(resB, 'basePureFps'), bBaseCpu = meanOf(resB, 'baseRenderFps');
  const aDisp = meanOf(resA, 'displayedWithCpu'), bDisp = meanOf(resB, 'displayedWithCpu');
  const aFgActiveAny = resA.some(r => r.canUseFG);
  const bFgActiveAny = resB.some(r => r.canUseFG);
  const aLockedCount = resA.filter(r => r.isCpuLocked).length;
  const bLockedCount = resB.filter(r => r.isCpuLocked).length;
  const lossA = Math.max(0, Math.round((1 - aBaseCpu / Math.max(1, aBasePure)) * 100));
  const lossB = compareOn ? Math.max(0, Math.round((1 - bBaseCpu / Math.max(1, bBasePure)) * 100)) : lossA;

  // 1. HERO KPI CARDS (4 Cards: Jogos, Workstation, IA Local, Equilíbrio)
  const heroEl = document.getElementById('sim-versus-hero-cards');
  if (heroEl) {
    const heroGainA = (mode === 'pure' || mode === 'gpu') ? aPure : aCpu;
    const heroGainB = (mode === 'pure' || mode === 'gpu') ? bPure : bCpu;
    const gameGain = heroGainB > 0 ? Math.round((heroGainA / heroGainB - 1) * 100) : 0;
    const aiA = typeof getEffectiveAIScore === 'function' ? getEffectiveAIScore(gpuA) : (gpuA.llm_14b_tok_s || 30);
    const aiB = typeof getEffectiveAIScore === 'function' ? getEffectiveAIScore(safeGpuB) : (safeGpuB.llm_14b_tok_s || 20);
    const aiGain = aiB > 0 ? Math.round((aiA / aiB - 1) * 100) : 0;

    // Combined Workstation Score
    const sA = cpuA._specs || (typeof getCpuSpecs === 'function' ? getCpuSpecs(cpuA) : { cores: 6, threads: 12, multiBench: 5675 });
    const sB = safeCpuB._specs || (typeof getCpuSpecs === 'function' ? getCpuSpecs(safeCpuB) : { cores: 8, threads: 16, multiBench: 7980 });
    const wsA = Math.round((gpuA.fp16_tflops * (gpuA.brand === 'NVIDIA' ? 15 : 8)) + (sA.multiBench * 0.5));
    const wsB = Math.round((safeGpuB.fp16_tflops * (safeGpuB.brand === 'NVIDIA' ? 15 : 8)) + (sB.multiBench * 0.5));
    const wsGain = wsB > 0 ? Math.round((wsA / wsB - 1) * 100) : 0;

    const synObjA = calcSetupSynergyScore(gpuA, cpuA, opts);
    const synObjB = compareOn ? calcSetupSynergyScore(safeGpuB, safeCpuB, opts) : synObjA;
    const synA = synObjA.synergy;
    const synB = synObjB.synergy;

    if (!compareOn) {
      const avgVisA = meanVisOf(resA, (mode === 'pure' || mode === 'gpu') ? 'pure' : 'withCpu');
      const singleBadge = (cls, text) => `<span class="ui-badge ${cls} ui-mono">${text}</span>`;
      const showValA = heroGainA;
      heroEl.innerHTML = `
        <!-- Card 1: Jogos FPS -->
        <div class="ui-kpi justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="ui-kpi-label">Jogos (${presetMeta.shortLabel})</span>
            ${aLockedCount > 0 && mode !== 'pure' && mode !== 'gpu'
              ? `<span class="sim-cpu-lock-pill">🔒 Travado CPU (${aLockedCount}/${games.length})</span>`
              : singleBadge('ui-badge--a', `${avgVisA} úteis (${cap < 999 ? cap + 'Hz' : 'Livre'})`)}
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="ui-kpi-value ${showValA >= 90 ? 'ui-kpi-value--good' : showValA >= 60 ? 'ui-kpi-value--warn' : 'ui-kpi-value--bad'}">${showValA} FPS</span>
            <span class="text-xs ui-mono text-slate-300">GPU: ${aBasePure} • Real: ${aBaseCpu}${aFgActiveAny ? ` • Tela FG: ${aDisp}` : ''}</span>
          </div>
          <div class="mt-2 pt-2 border-t border-slate-800/80 text-xs ui-mono truncate" style="color:var(--ui-compare-a-text);" title="${gpuA.name} + ${cpuA.name}">
            ${gpuA.name} + ${cpuA.name}
          </div>
        </div>

        <!-- Card 2: Workstation -->
        <div class="ui-kpi justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="ui-kpi-label">Workstation</span>
            ${singleBadge('ui-badge--a', `${sA.cores}C/${sA.threads}T`)}
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="ui-kpi-value">${wsA} pts</span>
            <span class="text-xs text-slate-400">Render + Edição + Dev</span>
          </div>
          <div class="mt-2 pt-2 border-t border-slate-800/80 text-xs ui-mono truncate" style="color:var(--ui-compare-a-text);">
            Cinebench Multi: ${sA.multiBench} pts
          </div>
        </div>

        <!-- Card 3: IA Local -->
        <div class="ui-kpi justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="ui-kpi-label">IA Local (14B)</span>
            ${singleBadge('ui-badge--a', `${gpuA.vram_gb} GB VRAM`)}
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="ui-kpi-value">${gpuA.llm_14b_tok_s} tok/s</span>
            <span class="text-xs ui-mono text-slate-300">8B: ${gpuA.llm_8b_tok_s} tok/s</span>
          </div>
          <div class="mt-2 pt-2 border-t border-slate-800/80 text-xs ui-mono truncate" style="color:var(--ui-compare-a-text);">
            Banda: ${gpuA.bandwidth_gbs} GB/s • ${gpuA.vram_gb >= 12 ? '14B na VRAM' : 'Offload RAM em 14B'}
          </div>
        </div>

        <!-- Card 4: Equilíbrio & Sinergia -->
        <div class="ui-kpi justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="ui-kpi-label">Equilíbrio</span>
            ${singleBadge('ui-badge--a', lossA > 0 ? `-${lossA}% CPU` : 'Sem gargalo')}
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="ui-kpi-value ${synA >= 85 ? 'ui-kpi-value--good' : synA >= 70 ? 'ui-kpi-value--warn' : 'ui-kpi-value--bad'}">${synA}%</span>
            <span class="text-xs ui-mono text-slate-300">Sinergia GPU + CPU</span>
          </div>
          <div class="mt-2 pt-2 border-t border-slate-800/80 text-xs ui-mono truncate" style="color:var(--ui-compare-a-text);" title="${synObjA.status}">
            ${synObjA.status}
          </div>
        </div>
      `;
    } else {
      const fmtGainVal = g => `${g >= 0 ? '+' : ''}${g}%`;
      const gainClass = g => g > 0 ? 'ui-kpi-value--good' : g < 0 ? 'ui-kpi-value--bad' : '';
      const winBadge = (aWins, label) => `<span class="ui-badge ${aWins ? 'ui-badge--a' : 'ui-badge--b'} ui-mono">${aWins ? 'Setup A' : 'Setup B'} ${label}</span>`;

      heroEl.innerHTML = `
        <!-- Card 1: Jogos FPS -->
        <div class="ui-kpi justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="ui-kpi-label">Jogos (${presetMeta.shortLabel})</span>
            ${winBadge(heroGainA >= heroGainB, '+rápido')}
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="ui-kpi-value ${gainClass(gameGain)}">${fmtGainVal(gameGain)}</span>
            <span class="text-xs ui-mono text-slate-300">${heroGainA} vs ${heroGainB} FPS</span>
          </div>
          <div class="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs ui-mono">
            <span style="color:var(--ui-compare-a-text);" class="truncate">A: ${aLockedCount > 0 && mode !== 'pure' && mode !== 'gpu' ? '🔒' : ''}${aBaseCpu}${aFgActiveAny ? ` (${aDisp} FG)` : ' FPS'}</span>
            <span style="color:var(--ui-compare-b-text);" class="truncate">B: ${bLockedCount > 0 && mode !== 'pure' && mode !== 'gpu' ? '🔒' : ''}${bBaseCpu}${bFgActiveAny ? ` (${bDisp} FG)` : ' FPS'}</span>
          </div>
        </div>

        <!-- Card 2: Workstation -->
        <div class="ui-kpi justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="ui-kpi-label">Workstation</span>
            ${winBadge(wsGain >= 0, '+produtivo')}
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="ui-kpi-value ${gainClass(wsGain)}">${fmtGainVal(wsGain)}</span>
            <span class="text-xs text-slate-400">Render + Edição + Dev</span>
          </div>
          <div class="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs ui-mono">
            <span style="color:var(--ui-compare-a-text);" class="truncate">A: ${wsA} pts</span>
            <span style="color:var(--ui-compare-b-text);" class="truncate">B: ${wsB} pts</span>
          </div>
        </div>

        <!-- Card 3: IA Local -->
        <div class="ui-kpi justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="ui-kpi-label">IA Local (14B)</span>
            ${winBadge(gpuA.vram_gb >= safeGpuB.vram_gb, '+VRAM')}
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="ui-kpi-value ${gainClass(aiGain)}">${fmtGainVal(aiGain)}</span>
            <span class="text-xs ui-mono text-slate-300">${gpuA.llm_14b_tok_s} vs ${safeGpuB.llm_14b_tok_s} tok/s</span>
          </div>
          <div class="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs ui-mono">
            <span style="color:var(--ui-compare-a-text);" class="truncate">A: ${gpuA.vram_gb} GB VRAM</span>
            <span style="color:var(--ui-compare-b-text);" class="truncate">B: ${safeGpuB.vram_gb} GB VRAM</span>
          </div>
        </div>

        <!-- Card 4: Equilíbrio & Sinergia -->
        <div class="ui-kpi justify-between">
          <div class="flex items-center justify-between gap-2">
            <span class="ui-kpi-label">Equilíbrio</span>
            ${winBadge(synA >= synB, '+harmônico')}
          </div>
          <div class="flex items-baseline gap-2 mt-1">
            <span class="ui-kpi-value ${synA >= 85 ? 'ui-kpi-value--good' : synA >= 70 ? 'ui-kpi-value--warn' : 'ui-kpi-value--bad'}">${synA}%</span>
            <span class="text-xs ui-mono text-slate-300">vs ${synB}% em B</span>
          </div>
          <div class="mt-2 pt-2 border-t border-slate-800/80 flex flex-col gap-0.5 text-xs ui-mono">
            <span style="color:var(--ui-compare-a-text);" class="truncate" title="Setup A: ${synObjA.status}">A: ${synObjA.status}</span>
            <span style="color:var(--ui-compare-b-text);" class="truncate" title="Setup B: ${synObjB.status}">B: ${synObjB.status}</span>
          </div>
        </div>
      `;
    }
  }

  // Render Workstation Panel
  renderSimulatorWorkstationComparison(gpuA, cpuA, safeGpuB, safeCpuB, compareOn);

  // Render Hexagon / Radar Chart
  renderSimulatorRadarChart(gpuA, cpuA, safeGpuB, safeCpuB, mode, opts, compareOn);

  const avgVisA = meanVisOf(resA, (mode === 'pure' || mode === 'gpu') ? 'pure' : 'withCpu');
  document.getElementById('sim-average-fps-summary').innerHTML = compareOn
    ? `<div><span class="text-slate-400">Média (${games.length} jogos) •</span> <strong class="text-sky-300">Setup A: ${gpuA.name} + ${cpuA.name}</strong>:
        <span class="font-mono text-white">${aBasePure}</span> pura → <span class="font-mono text-amber-300">${aBaseCpu}</span> real c/ CPU
        (${aFgActiveAny ? `<span class="font-mono text-emerald-300">${aDisp} c/ FG</span> • ` : ''}<span class="font-mono text-sky-300">${avgVisA}</span> úteis no monitor)</div>
      <div><strong class="text-emerald-300">Setup B: ${safeGpuB.name} + ${safeCpuB.name}</strong>:
        <span class="font-mono text-white">${bBasePure}</span> → <span class="font-mono text-amber-300">${bBaseCpu}</span>${bFgActiveAny ? ` (<span class="font-mono text-emerald-300">${bDisp} c/ FG</span>)` : ''}</div>
      <div class="w-full text-xs ${lossA >= 15 || lossB >= 15 ? 'text-amber-300' : 'text-slate-400'}">
        Comparativo (${dlssModeLabel}):
        <strong>${bBaseCpu > 0 ? (aBaseCpu >= bBaseCpu ? '+' : '') + Math.round((aBaseCpu / bBaseCpu - 1) * 100) : '--'}%</strong> em FPS real c/ CPU
        (vs ${bBasePure > 0 ? (aBasePure >= bBasePure ? '+' : '') + Math.round((aBasePure / bBasePure - 1) * 100) : '--'}% GPU pura).
      </div>`
    : `<div><span class="text-slate-400">Média (${games.length} jogos) •</span> <strong class="text-sky-300">${gpuA.name} + ${cpuA.name}</strong>:
        <span class="font-mono text-white">${aBasePure}</span> pura → <span class="font-mono text-amber-300">${aBaseCpu}</span> real c/ CPU
        (${aFgActiveAny ? `<span class="font-mono text-emerald-300">${aDisp} c/ FG</span> • ` : ''}<span class="font-mono text-sky-300">${avgVisA}</span> úteis no monitor)</div>
      <div class="w-full text-xs ${lossA >= 15 ? 'text-amber-300' : 'text-slate-400'}">
        Impacto do processador (${dlssModeLabel}):
        <strong>${lossA > 0 ? '-' + lossA + '%' : '0% (sem gargalo)'}</strong>.
      </div>`;

  // Per-game bars with clean speedometer icon, preset/PT tag, strict CPU lock indicator, and FG row
  const speedometerSvgSmall = `<svg class="w-3.5 h-3.5 text-emerald-400 inline-block mr-1 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M2 12h2M16 12a4 4 0 1 1-8 0M14 10l3-3M4 18a10 10 0 0 1 16 0"/></svg>`;
  document.getElementById('sim-games-list').innerHTML = games.map((gm, idx) => {
    const a = resA[idx];
    const b = resB[idx] || a;
    const maxF = compareOn
      ? Math.max(a.basePureFps, b.basePureFps, a.displayedWithCpu, b.displayedWithCpu, cap < 999 ? cap : 0, 60) * 1.05
      : Math.max(a.basePureFps, a.displayedWithCpu, cap < 999 ? cap : 0, 60) * 1.05;
    const gainKey = (mode === 'pure' || mode === 'gpu') ? 'pure' : 'withCpu';
    const gain = Math.round((a[gainKey] / Math.max(1, b[gainKey]) - 1) * 100);
    const fpsShow = a[gainKey];
    const rightCls = compareOn
      ? (gain >= 0 ? 'text-emerald-400' : 'text-rose-400')
      : (a.baseRenderFps >= 90 ? 'text-emerald-400' : a.baseRenderFps >= 60 ? 'text-sky-400' : a.baseRenderFps >= 45 ? 'text-amber-300' : 'text-rose-400');
    const rightTxt = compareOn
      ? `${gain >= 0 ? '+' : ''}${gain}%`
      : (a.canUseFG && mode !== 'pure' && mode !== 'gpu' ? `${a.baseRenderFps} → ${a.displayedWithCpu} FPS` : `${fpsShow} FPS`);

    const rows = [];
    if (mode !== 'cpu') {
      rows.push(fpsBarRow(compareOn ? `A: ${gpuA.name} (pura)` : `${gpuA.name} (GPU pura)`, 'text-sky-300', 'bg-sky-400', a.basePureFps, maxF, false, cap));
      if (compareOn) rows.push(fpsBarRow(`B: ${safeGpuB.name} (pura)`, 'text-emerald-300', 'bg-emerald-500', b.basePureFps, maxF, false, cap));
    }
    if (mode !== 'pure' && mode !== 'gpu') {
      rows.push(fpsBarRow(compareOn ? `A: Real c/ ${cpuA.name}` : `Real c/ ${cpuA.name}`, 'text-sky-200', 'bg-amber-400', a.baseRenderFps, maxF, true, cap));
      if (compareOn) rows.push(fpsBarRow(`B: Real c/ ${safeCpuB.name}`, 'text-emerald-200', 'bg-amber-600', b.baseRenderFps, maxF, false, cap));
    }
    if (a.canUseFG) {
      rows.push(fpsBarRow(compareOn ? `A: Tela (${a.activeFgMult}× FG)` : `Tela (${a.activeFgMult}× FG)`, 'text-emerald-300', 'bg-emerald-400', a.displayedWithCpu, maxF, false, cap));
    }
    if (compareOn && b.canUseFG) {
      rows.push(fpsBarRow(`B: Tela (${b.activeFgMult}× FG)`, 'text-purple-300', 'bg-purple-400', b.displayedWithCpu, maxF, false, cap));
    }

    const modeTag = a.ptActive
      ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs ui-mono">✨ Path Tracing</span>`
      : (a.rtActive ? `<span class="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-xs ui-mono">${presetMeta.shortLabel} + RT</span>` : `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-xs ui-mono">${presetMeta.shortLabel}</span>`);

    const lockPillA = (mode !== 'pure' && mode !== 'gpu' && a.isCpuLocked)
      ? `<span class="sim-cpu-lock-pill" title="FPS real travado no máximo da CPU (~${a.cpuCap} FPS)">🔒 ${compareOn ? 'A ' : ''}Travado CPU (${a.cpuCap})</span>` : '';
    const lockPillB = (compareOn && mode !== 'pure' && mode !== 'gpu' && b.isCpuLocked)
      ? `<span class="sim-cpu-lock-pill" title="FPS real de B travado no máximo da CPU (~${b.cpuCap} FPS)">🔒 B Travado CPU (${b.cpuCap})</span>` : '';

    const warnNotes = [];
    if (a.dlssUnsupported || (compareOn && b.dlssUnsupported)) {
      const who = [a.dlssUnsupported ? 'A' : '', compareOn && b.dlssUnsupported ? 'B' : ''].filter(Boolean).join('/');
      warnNotes.push(`⚠️ DLSS indisponível em ${who}`);
    }
    if (a.ptActive && !a.cap.hasHwRT) warnNotes.push('⚠️ A sem HW RT (PT inviável)');
    if (compareOn && b.ptActive && !b.cap.hasHwRT) warnNotes.push('⚠️ B sem HW RT (PT inviável)');
    if (a.vramShort) warnNotes.push(`⚠️ A VRAM apertada (${gpuA.vram_gb}GB/${a.vramNeeded}GB)`);
    if (compareOn && b.vramShort) warnNotes.push(`⚠️ B VRAM apertada (${safeGpuB.vram_gb}GB/${b.vramNeeded}GB)`);

    const fgNote = (a.canUseFG || (compareOn && b.canUseFG))
      ? `<div class="text-xs text-emerald-300/90 font-mono">✨ ${compareOn
          ? `Tela MFG: A ${a.displayedWithCpu} FPS (${a.activeFgMult}×, ~${a.latencyMs}ms) vs B ${b.displayedWithCpu} FPS (${b.activeFgMult}×, ~${b.latencyMs}ms)`
          : `Tela MFG: ${a.displayedWithCpu} FPS (${a.activeFgMult}× sobre ${a.baseRenderFps} reais, ~${a.latencyMs}ms)`}</div>`
      : '';

    const bottleneckFooter = compareOn
      ? (mode !== 'pure' && mode !== 'gpu' && (a.bottleneckType !== 'balanced' || b.bottleneckType !== 'balanced' || warnNotes.length) ? `
          <div class="text-xs text-slate-300 flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80 font-mono">
            ${lockPillA}${lockPillB}
            ${!a.isCpuLocked ? `<span title="${a.bottleneckLabel}">A: <strong class="${a.bottleneckType === 'cpu' ? 'text-amber-300' : (a.bottleneckType === 'gpu' ? 'text-sky-300' : 'text-emerald-300')}">${a.bottleneckLabel}</strong></span>` : ''}
            ${!b.isCpuLocked ? `<span class="text-slate-600">|</span><span title="${b.bottleneckLabel}">B: <strong class="${b.bottleneckType === 'cpu' ? 'text-amber-300' : (b.bottleneckType === 'gpu' ? 'text-sky-300' : 'text-emerald-300')}">${b.bottleneckLabel}</strong></span>` : ''}
            ${warnNotes.length ? `<span class="text-amber-300">${warnNotes.join(' • ')}</span>` : ''}
          </div>` : '')
      : (mode !== 'pure' && mode !== 'gpu' && (a.bottleneckType !== 'balanced' || warnNotes.length) ? `
          <div class="text-xs text-slate-300 flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80 font-mono">
            ${lockPillA || `<strong class="${a.bottleneckType === 'cpu' ? 'text-amber-300' : (a.bottleneckType === 'gpu' ? 'text-sky-300' : 'text-emerald-300')}">${a.bottleneckLabel}</strong>`}
            ${warnNotes.length ? `<span class="text-amber-300">${warnNotes.join(' • ')}</span>` : ''}
          </div>` : (warnNotes.length ? `<div class="text-xs text-amber-300 pt-1 border-t border-slate-800/80 font-mono">${warnNotes.join(' • ')}</div>` : ''));

    return `
      <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
        <div class="flex flex-wrap justify-between items-center gap-1.5 text-xs font-semibold text-white">
          <span class="flex flex-wrap items-center gap-1.5 min-w-0">${speedometerSvgSmall} <span class="truncate">${getSimGameDisplayTitle(gm)}</span>${a.calibrated ? ' <span class="text-xs text-sky-400">📏</span>' : ''} ${modeTag}</span>
          <span class="font-mono ${rightCls} font-bold shrink-0">${rightTxt}</span>
        </div>
        <div class="space-y-1 text-xs font-mono">${rows.join('')}</div>
        ${fgNote}
        ${bottleneckFooter}
      </div>`;
  }).join('') + (cap < 999 ? `<p class="text-xs text-slate-500">Linha branca = limite do monitor (${cap} Hz).</p>` : '');
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
          <span class="px-2 py-0.5 rounded border text-xs font-mono font-bold ${memColor}">${pl.memType}</span>
        </div>
        ${isBest ? '<span class="text-xs font-mono font-bold text-emerald-300">🏆 MELHOR RESULTADO PARA SEU PERFIL</span>' : ''}
        
        <!-- CPU Selector -->
        <div>
          <label class="text-xs font-mono text-slate-400 block mb-0.5">Processador:</label>
          <select ${pl.p.keep ? 'disabled' : ''} onchange="onUpgCpuChange('${pl.p.id}', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white">${cpuOptions}</select>
        </div>

        <!-- Motherboard Selector & Compatibility Flag -->
        <div>
          <div class="flex items-center justify-between text-xs font-mono text-slate-400 mb-0.5">
            <span>Placa-Mãe:</span>
            ${hasVrmAlert ? `<span class="px-1.5 py-0.2 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs">⚠️ [!] Atenção VRM</span>` : ''}
          </div>
          <select ${pl.p.keep ? 'disabled' : ''} onchange="onUpgMoboChange('${pl.p.id}', this.value)" class="w-full bg-slate-950 border ${hasVrmAlert ? 'border-amber-500/60' : 'border-slate-700'} rounded px-2 py-1 text-xs text-white">
            ${moboOptions}
          </select>
        </div>

        <!-- VRM / Compatibility Warning Alert Box -->
        ${hasVrmAlert ? `
          <div class="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2 leading-snug">
            <span class="font-bold font-mono text-amber-400 shrink-0 text-xs">⚠️ [!]</span>
            <div>
              <strong class="block text-amber-300 font-semibold">${pl.comp.label}</strong>
              <span class="text-amber-100/90 text-[10.5px]">${pl.comp.message}</span>
            </div>
          </div>
        ` : ''}

        <div class="space-y-1 font-mono text-xs pt-1 border-t border-slate-800">
          <div class="flex justify-between"><span class="text-slate-400">CPU</span><span>${pl.p.keep ? `${formatMoneyShort(0)} (já tem)` : fmtBRLShort(pl.cpuCost)}</span></div>
          <div class="flex justify-between gap-2"><span class="text-slate-400 shrink-0">Placa-mãe</span><span class="truncate text-right" title="${pl.mobo.name}">${pl.p.keep ? `${formatMoneyShort(0)} (já tem)` : `${fmtBRLShort(pl.moboCost)} <span class="text-slate-500">${pl.mobo.name}</span>`}</span></div>
          <div class="flex justify-between gap-2"><span class="text-slate-400 shrink-0">RAM +${pl.neededGB}GB</span><span class="truncate text-right ${pl.memType === 'DDR5' ? 'text-sky-300' : 'text-emerald-300'}" title="${pl.ram.desc}">${fmtBRLShort(pl.ram.cost)}</span></div>
          <div class="text-xs text-slate-500 truncate" title="${pl.ram.desc}">${pl.ram.desc}${pl.canReuse ? ' (+ seus ' + curUserRamCap + 'GB)' : ''}</div>
          <div class="flex justify-between border-t border-slate-800 pt-1 font-bold"><span class="text-slate-300">Total plataforma</span><span class="text-white">${fmtBRLShort(pl.platformCost)}</span></div>
          <div class="flex justify-between"><span class="text-slate-400">Sobra p/ GPU</span><span class="${pl.gpuBudget > 0 ? 'text-amber-300' : 'text-rose-400'} font-bold">${fmtBRLShort(pl.gpuBudget)}</span></div>
        </div>

        <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
          ${pl.gpu ? `
            <div class="ui-label">GPU sugerida com a sobra</div>
            <div class="font-bold text-sm text-white">${pl.gpu.name} <span class="ui-badge ui-mono ml-1">${pl.gpu.vram_gb} GB</span></div>
            <div class="text-xs ui-mono text-emerald-300 font-bold">${fmtBRLShort(pl.gpu.price_brl)}</div>
            <div class="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-slate-800/80 text-center ui-mono">
              <div><span class="block text-xs text-slate-400">FPS</span><span class="font-extrabold text-base text-white">${pl.avgFps}</span></div>
              <div><span class="block text-xs text-slate-400">14B tok/s</span><span class="font-extrabold text-base text-sky-300">${pl.gpu.llm_14b_tok_s}</span></div>
              <div><span class="block text-xs text-slate-400">Score</span><span class="font-extrabold text-base text-emerald-300">${Math.round((pl.finalScore / bestScore) * 100)}</span></div>
            </div>
            ${pl.avgPure - pl.avgFps > 5 ? `<div class="text-xs text-amber-300">CPU segura ~${pl.avgPure - pl.avgFps} FPS médios dessa GPU</div>` : ''}
          ` : '<div class="text-rose-300 text-xs">Orçamento não cobre nenhuma GPU após a plataforma.</div>'}
        </div>
        <button type="button" onclick="applyPlatformToBuild('${pl.p.id}')" class="mt-auto ui-btn ${pl.finalScore === bestScore ? 'ui-btn--primary' : ''} ui-btn--sm w-full">Aplicar na Montagem →</button>
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
      <tr class="${cap === targetGB ? 'bg-sky-500/10' : ''}">
        <td class="ui-mono font-bold text-white">${cap} GB</td>
        <td class="ui-mono text-emerald-300" title="${d4.desc}">${fmtBRLShort(d4.cost)} <span class="text-xs text-slate-400">(${fmtBRLShort(d4.perGB)}/GB)</span></td>
        <td class="ui-mono text-sky-300" title="${d5.desc}">${fmtBRLShort(d5.cost)} <span class="text-xs text-slate-400">(${fmtBRLShort(d5.perGB)}/GB)</span></td>
        <td class="text-right ui-mono font-bold ${diff > 0 ? 'text-rose-300' : 'text-emerald-300'}">${diff >= 0 ? '+' : ''}${pct}%</td>
      </tr>`;
  }).join('');
  document.getElementById('upg-ram-deals-table').innerHTML = `
    <div class="ui-table-wrap">
      <table class="ui-table">
        <thead>
          <tr>
            <th>Capac.</th>
            <th>DDR4 mais barata</th>
            <th>DDR5 mais barata</th>
            <th class="text-right">Ágio DDR5</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // Verdict: numbers & recommendation first, explanation collapsed
  const d4t = cheapestRamFor('DDR4', targetGB), d5t = cheapestRamFor('DDR5', targetGB);
  const premium = d5t.cost - d4t.cost;
  const premPct = d4t.cost > 0 ? Math.round((premium / d4t.cost) * 100) : 0;
  const best = plans.find(pl => pl.finalScore === bestScore);
  const bestD4 = plans.filter(pl => pl.memType === 'DDR4').sort((a, b) => b.finalScore - a.finalScore)[0];
  const bestD5 = plans.filter(pl => pl.memType === 'DDR5').sort((a, b) => b.finalScore - a.finalScore)[0];
  const moboEstimate = formatMoneyShort(Math.round(700 * (STATE.market?.monetary?.exchange_rate_vs_brl || 1.0)));
  document.getElementById('upg-recommendation-verdict').innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <span class="ui-label">Veredito de Plataforma</span>
      <span class="ui-badge ui-badge--brand ui-mono">${targetGB} GB • ${fmtBRLShort(budget)}</span>
    </div>

    ${best ? `
      <div class="ui-card ui-card--compact ui-card--good space-y-1">
        <span class="ui-badge ui-badge--good">Melhor escolha no seu orçamento</span>
        <div class="text-base font-extrabold text-white mt-1">${best.p.label}</div>
        <div class="text-xs ui-mono text-emerald-300">${best.cpu.name}${best.gpu ? ` + ${best.gpu.name} (${best.avgFps} FPS)` : ''}</div>
      </div>
    ` : ''}

    <div class="grid grid-cols-2 gap-2.5">
      <div class="ui-kpi !p-3">
        <span class="ui-kpi-label">Ágio DDR5 (${targetGB}GB)</span>
        <span class="text-xl ui-mono font-extrabold ${premium > 0 ? 'text-rose-300' : 'text-emerald-300'}">${premium >= 0 ? '+' : ''}${fmtBRLShort(premium)}</span>
        <span class="text-xs ui-mono text-slate-400">${premPct >= 0 ? '+' : ''}${premPct}% vs DDR4</span>
      </div>
      <div class="ui-kpi !p-3">
        <span class="ui-kpi-label">DDR4 vs DDR5 (FPS)</span>
        <span class="text-xl ui-mono font-extrabold text-white">${bestD4 ? bestD4.avgFps : '—'} <span class="text-slate-500 text-sm">vs</span> ${bestD5 ? bestD5.avgFps : '—'}</span>
        <span class="text-xs text-slate-400 truncate">${bestD4 && bestD4.gpu ? bestD4.gpu.name : '—'} / ${bestD5 && bestD5.gpu ? bestD5.gpu.name : '—'}</span>
      </div>
    </div>

    <details class="ui-details">
      <summary class="ui-details-summary">Ver detalhes da recomendação</summary>
      <div class="ui-details-body space-y-2 text-xs text-slate-300">
        <p>Além da diferença na RAM, migrar para DDR5 exige nova placa-mãe (${bestD5 ? fmtBRLShort(bestD5.moboCost) : `${moboEstimate}+`}), reduzindo a verba disponível para a GPU.</p>
        ${best ? `<p>${best.memType === 'DDR4' ? 'Manter-se no DDR4 libera orçamento para uma GPU mais forte, gerando salto imediato em IA e FPS.' : 'Mesmo pagando o investimento da plataforma DDR5, ela entrega mais desempenho no seu perfil e viabiliza upgrades futuros de CPU.'}</p>` : ''}
        ${refCpu && refCpu.name ? `<p class="text-slate-400">PC de Referência atual: <strong>${refCpu.name}</strong> (${curUserRamCap}GB ${curUserRamType}).</p>` : ''}
      </div>
    </details>`;
}

// ============================================================================
// 5. BLACK FRIDAY — MULTI-GENERATION SEASONALITY & EXPECTED PROMO RANGE
// ============================================================================
const BF_FAMILIES = {
  // --- GPU FAMILIES ---
  gpu_cross_tiers: {
    kind: 'gpu',
    label: '⚡ Crossover de Gerações (3080 vs 4070 vs 5060 Ti vs 5070)',
    slugs: ['rtx-3080-10gb', 'rtx-3080-12gb', 'rtx-3070-ti', 'rtx-4070', 'rtx-5060', 'rtx-5060-ti-8gb', 'rtx-5060-ti-16gb', 'rtx-5070', 'rx-7800-xt', 'rx-9070']
  },
  gpu_60: {
    kind: 'gpu',
    label: '🎮 Série xx60 (2060 → 3060 → 4060 → 5060 / Ti)',
    slugs: ['rtx-2060-6gb', 'rtx-2060-super', 'rtx-3060-8gb', 'rtx-3060-12gb', 'rtx-3060-ti', 'rtx-4060', 'rtx-4060-ti-8gb', 'rtx-5060', 'rtx-5060-ti-8gb', 'rtx-5060-ti-16gb']
  },
  gpu_70: {
    kind: 'gpu',
    label: '🚀 Série xx70 (2070 → 3070 → 4070 → 5070 / RX 9070)',
    slugs: ['rtx-2070', 'rtx-3070', 'rtx-3070-ti', 'rtx-4070', 'rtx-4070-ti', 'rtx-5070', 'rtx-5070-ti', 'rx-9070', 'rx-9070-xt']
  },
  gpu_80: {
    kind: 'gpu',
    label: '👑 Série xx80 High-End (3080 → 4080 → 5080 / RX 6800/7800 XT)',
    slugs: ['rtx-3080-10gb', 'rtx-3080-12gb', 'rtx-3080-ti', 'rtx-4080', 'rtx-4080-super', 'rtx-5080', 'rx-6800-xt', 'rx-7800-xt', 'rx-7900-gre']
  },
  gpu_amd: {
    kind: 'gpu',
    label: '🔴 Radeon Série xx60/xx70/xx80 (RX 580 → 6600 → 7600 → 7800 XT → 9070 XT)',
    slugs: ['rx-580-8gb-ref', 'rx-6600', 'rx-6600-xt', 'rx-6700-xt', 'rx-6750-xt', 'rx-7600', 'rx-7600-xt', 'rx-9060-xt-8gb', 'rx-9060-xt-16gb', 'rx-7800-xt', 'rx-9070-xt']
  },
  gpu_budget: {
    kind: 'gpu',
    label: '🏷️ GPUs de Entrada (< R$ 1.500: RX 580, GTX 1650, RX 6600, RTX 3050)',
    slugs: ['rx-580-8gb-ref', 'gtx-1650', 'rx-6600', 'rtx-3050-8gb', 'rtx-2060-6gb']
  },

  // --- CPU FAMILIES (Granular ranges for CPUs) ---
  cpu_budget: {
    kind: 'cpu',
    label: '🏷️ CPUs Entrada & Budget (< R$ 700: i3-12100F, R5 4500, R5 5500)',
    slugs: ['core-i3-12100f', 'core-i3-14100f', 'ryzen-5-4500', 'ryzen-5-5500', 'ryzen-5-3600']
  },
  cpu_mid_am4: {
    kind: 'cpu',
    label: '⚡ CPUs Intermediários AM4 & LGA1700 (R$ 700 - R$ 1.200: R5 5600, i5-12400F, i5-13400F, i5-14400F)',
    slugs: ['ryzen-5-5600', 'ryzen-5-5600x', 'core-i5-12400f', 'core-i5-13400f', 'core-i5-14400f', 'ryzen-7-5700x']
  },
  cpu_mid_am5: {
    kind: 'cpu',
    label: '🚀 CPUs Intermediários AM5 & Core Ultra (R$ 1.200 - R$ 1.800: R5 7600, 7600X, 9600X, Ultra 5 225F)',
    slugs: ['ryzen-5-7500f', 'ryzen-5-7600', 'ryzen-5-7600x', 'ryzen-5-9600x', 'core-ultra-5-225f', 'core-ultra-5-245kf']
  },
  cpu_high_x3d: {
    kind: 'cpu',
    label: '👑 CPUs High-End & Gaming X3D (R$ 1.800 - R$ 3.000: 5700X3D, 7800X3D, 9800X3D, i5-14600KF, i7-14700KF)',
    slugs: ['ryzen-7-5700x3d', 'ryzen-7-5800x3d', 'ryzen-7-7700', 'ryzen-7-7800x3d', 'ryzen-7-9700x', 'ryzen-7-9800x3d', 'core-i5-14600kf', 'core-i7-14700kf']
  },
  cpu_workstation: {
    kind: 'cpu',
    label: '🏢 CPUs Workstation & Multi-Core (> R$ 3.000: R9 7950X, R9 9950X, i9-14900K, Threadripper)',
    slugs: ['ryzen-9-7900x', 'ryzen-9-7950x', 'ryzen-9-9950x', 'core-i9-14900k', 'core-ultra-9-285k', 'threadripper-7960x']
  },
  cpu_xeon: {
    kind: 'cpu',
    label: '⚙️ CPUs Legados / Xeon X99 (E5-2680 v4 vs i3 vs R5 5500)',
    slugs: ['xeon-e5-2680-v4', 'core-i3-12100f', 'ryzen-5-5500', 'ryzen-5-5600']
  },

  // --- LAPTOP FAMILIES (DYNAMIC ZOOM CATALOG) ---
  laptop_gaming_pro: {
    kind: 'laptop',
    label: '👑 Notebooks Gamer / Creator RTX 4060 / 4070 / 5060+',
    filterFn: l => l.category === 'gaming_pro'
  },
  laptop_gaming: {
    kind: 'laptop',
    label: '🎮 Notebooks Gamer Entrada & Mid (RTX 2050 / 3050 / 4050)',
    filterFn: l => l.category === 'gaming'
  },
  laptop_macbook: {
    kind: 'laptop',
    label: '🍎 Apple MacBook (Air & Pro M2 / M3 / M4 / M5)',
    filterFn: l => l.category === 'macbook'
  },
  laptop_ultrabook: {
    kind: 'laptop',
    label: '💼 Ultrabooks, Dev & Produtividade (Core Ultra / Ryzen 7 / 16GB+)',
    filterFn: l => l.category === 'ultrabook'
  },
  laptop_budget: {
    kind: 'laptop',
    label: '🏷️ Notebooks Custo-Benefício & Estudo',
    filterFn: l => l.category === 'budget'
  },

  // --- SMARTPHONE FAMILIES (DYNAMIC ZOOM CATALOG) ---
  phone_flagship: {
    kind: 'smartphone',
    label: '📱 Smartphones Flagship & Inter. Pro (Galaxy S26/S25/S24, iPhone, Poco F)',
    maxItems: 14,
    filterFn: s => s.category === 'flagship' || s.category === 'upper_mid'
  },
  phone_galaxy_s26: {
    kind: 'smartphone',
    label: '🚀 Samsung Galaxy S26 Lineup (S26 / S26+ / S26 Ultra / S26 FE)',
    maxItems: 12,
    filterFn: s => /galaxy\s*s26\b/i.test(s.name || '')
  },
  phone_galaxy_s24: {
    kind: 'smartphone',
    label: '🔥 Samsung Galaxy S24 Lineup (S24 / S24+ / S24 Ultra / S24 FE)',
    maxItems: 12,
    filterFn: s => /galaxy\s*s24\b/i.test(s.name || '')
  },
  phone_galaxy_s25: {
    kind: 'smartphone',
    label: '⚡ Samsung Galaxy S25 Lineup (S25 / S25+ / S25 Ultra / Edge / FE)',
    maxItems: 12,
    filterFn: s => /galaxy\s*s25\b/i.test(s.name || '')
  },
  phone_iphone: {
    kind: 'smartphone',
    label: '🍎 Apple iPhone Lineup (iPhone 13–17 Pro Max)',
    maxItems: 12,
    filterFn: s => s.brand === 'Apple' || /iphone/i.test(s.name || '')
  },
  phone_midrange: {
    kind: 'smartphone',
    label: '🔥 Smartphones Intermediários & Entrada 5G (Galaxy A, Redmi Note, Poco X)',
    maxItems: 12,
    filterFn: s => s.category === 'midrange' || s.category === 'entry'
  },

  // --- PERIPHERALS FAMILIES ---
  periph_mouse: {
    kind: 'peripherals',
    label: '🖱️ Mouses Gamer & Sem Fio',
    filterFn: p => p.kind === 'mouse'
  },
  periph_keyboard: {
    kind: 'peripherals',
    label: '⌨️ Teclados Mecânicos, Magnéticos & Hall Effect',
    filterFn: p => p.kind === 'keyboard'
  },
  periph_headset: {
    kind: 'peripherals',
    label: '🎧 Headsets Gamer & Estúdio (2.4GHz / P2 / USB)',
    filterFn: p => p.kind === 'headset'
  },

  // --- MISC FAMILIES (AIR FRYER & FRALDAS) ---
  misc_air_fryer: {
    kind: 'misc',
    label: '🍟 Air Fryers — Cesto & Oven',
    filterFn: m => m.category_id === 'air_fryer'
  },
  misc_diapers: {
    kind: 'misc',
    label: '👶 Fraldas Infantis (Pampers, Huggies, Pom Pom, Babysec)',
    filterFn: m => m.category_id === 'diapers'
  },
  misc_all: {
    kind: 'misc',
    label: '📦 Todos os Produtos Diversos Monitorados',
    filterFn: () => true
  },

  // --- CUSTOM MODEL SELECTION ---
  custom: {
    kind: 'custom',
    label: '🛠️ Personalizado (Escolha Livre de Modelos)',
    slugs: []
  }
};
const BF_COLORS = ['#38bdf8', '#10b981', '#a855f7', '#f59e0b', '#f43f5e', '#22d3ee', '#84cc16', '#e879f9', '#fb923c', '#94a3b8', '#06b6d4', '#e11d48'];
let chartBF = null;
let chartBFTarget = null;

// Calculate exact Black Friday date for any calendar year (4th Friday of November)
function getExactBlackFridayDate(year) {
  let fridays = [];
  for (let d = 1; d <= 30; d++) {
    const dt = new Date(year, 10, d); // month 10 is November
    if (dt.getDay() === 5) fridays.push(d);
  }
  const day = fridays[3] || 27; // 4th Friday
  return `${year}-11-${String(day).padStart(2, '0')}`;
}
window.getExactBlackFridayDate = getExactBlackFridayDate;

function _getBFPoolForContext(ctx) {
  if (ctx === 'laptop') return DB.laptops || [];
  if (ctx === 'smartphone') return DB.smartphones || [];
  if (ctx === 'peripherals' || ctx === 'peripheral') return DB.peripherals || [];
  if (ctx === 'misc' || ctx === 'air_fryer' || ctx === 'diapers') {
    if (typeof getMiscCatalogPool === 'function') {
      return getMiscCatalogPool((ctx === 'air_fryer' || ctx === 'diapers') ? ctx : null);
    }
    const mc = (DB && DB.misc_catalog && typeof DB.misc_catalog === 'object') ? DB.misc_catalog : {};
    return Object.entries(mc).flatMap(([cid, arr]) => (arr || []).map(x => ({ ...x, category_id: x.category_id || cid })));
  }
  if (ctx === 'cpu') return DB.cpus || [];
  return DB.gpus || [];
}

function _getBFDefaultFamKey(ctx) {
  if (ctx === 'laptop') return 'laptop_gaming_pro';
  if (ctx === 'smartphone') return 'phone_flagship';
  if (ctx === 'peripherals') return 'periph_mouse';
  if (ctx === 'misc') return 'misc_air_fryer';
  if (ctx === 'cpu') return 'cpu_mid_am4';
  return 'gpu_cross_tiers';
}

// Dynamically populate #bf-select-family strictly according to active context
function updateBFFamilySelectorOptions() {
  const sel = document.getElementById('bf-select-family');
  if (!sel) return;
  const ctx = (typeof STATE !== 'undefined' && STATE.context) || 'gpu';
  const allowedKeys = Object.keys(BF_FAMILIES).filter(k => {
    if (k === 'custom') return true;
    if (ctx === 'laptop') return k.startsWith('laptop_');
    if (ctx === 'smartphone') return k.startsWith('phone_');
    if (ctx === 'peripherals') return k.startsWith('periph_');
    if (ctx === 'misc') return k.startsWith('misc_');
    if (ctx === 'cpu') return k.startsWith('cpu_');
    return k.startsWith('gpu_');
  });

  const curVal = sel.value;
  sel.innerHTML = allowedKeys.map(k => {
    const f = BF_FAMILIES[k];
    return `<option value="${k}">${f.label}</option>`;
  }).join('');

  if (allowedKeys.includes(curVal)) {
    sel.value = curVal;
  } else {
    sel.value = _getBFDefaultFamKey(ctx);
  }
}
window.updateBFFamilySelectorOptions = updateBFFamilySelectorOptions;

// Custom Model Selection Drawer Handlers
STATE.bfCustomSlugs = new Set();
function toggleBFCustomModelsDrawer() {
  const drawer = document.getElementById('bf-custom-models-drawer');
  if (!drawer) return;
  drawer.classList.toggle('hidden');
  if (!drawer.classList.contains('hidden')) {
    renderBFCustomModelsCheckboxes();
  }
}
window.toggleBFCustomModelsDrawer = toggleBFCustomModelsDrawer;

function renderBFCustomModelsCheckboxes() {
  const container = document.getElementById('bf-custom-models-checkboxes');
  if (!container) return;
  const ctx = (typeof STATE !== 'undefined' && STATE.context) || 'gpu';
  const pool = _getBFPoolForContext(ctx);

  if (!STATE.bfCustomSlugs || STATE.bfCustomSlugs.size === 0 || !pool.some(x => STATE.bfCustomSlugs.has(x.slug))) {
    const famKey = document.getElementById('bf-select-family').value;
    const defKey = _getBFDefaultFamKey(ctx);
    const fam = BF_FAMILIES[famKey] || BF_FAMILIES[defKey];
    const seed = fam.filterFn
      ? pool.filter(fam.filterFn).slice(0, 8).map(x => x.slug)
      : (fam.slugs && fam.slugs.length ? fam.slugs : pool.slice(0, 8).map(x => x.slug));
    STATE.bfCustomSlugs = new Set(seed);
  }

  const _cSym = (typeof STATE !== 'undefined' && STATE.market?.monetary?.currency_symbol) || 'R$';
  container.innerHTML = pool.map(item => {
    const checked = STATE.bfCustomSlugs.has(item.slug);
    const sub = ctx === 'laptop'
      ? `${item.ram_gb}G / ${item.gpu_vram_gb}G`
      : (ctx === 'smartphone'
        ? `${item.ram_gb}G / ${item.storage_gb}G`
        : (ctx === 'peripherals'
          ? (item.kind || item.brand || 'Perif.')
          : (ctx === 'misc'
            ? ((item.specs && (item.specs.price_per_unit ? `${_cSym}${Number(item.specs.price_per_unit).toFixed(2)}/u` : (item.specs.price_per_liter ? `${_cSym}${Math.round(item.specs.price_per_liter)}/L` : item.category_id))) || 'Misc')
            : (ctx === 'cpu' ? (item.socket || 'CPU') : `${item.vram_gb || 8}GB`))));
    return `
      <label class="flex items-center gap-1.5 p-1.5 rounded-lg bg-slate-950/70 border ${checked ? 'border-sky-500/50 text-sky-200' : 'border-slate-800 text-slate-400'} text-xs font-mono cursor-pointer hover:border-slate-700 transition">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="onBFCustomModelToggle('${item.slug}', this.checked)" class="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0">
        <span class="truncate" title="${item.name}">${item.name}</span>
        <span class="text-xs text-slate-500 shrink-0">(${sub})</span>
      </label>
    `;
  }).join('');
}
window.renderBFCustomModelsCheckboxes = renderBFCustomModelsCheckboxes;

function onBFCustomModelToggle(slug, checked) {
  if (!STATE.bfCustomSlugs) STATE.bfCustomSlugs = new Set();
  if (checked) {
    STATE.bfCustomSlugs.add(slug);
  } else {
    if (STATE.bfCustomSlugs.size > 1) {
      STATE.bfCustomSlugs.delete(slug);
    }
  }
  const ctx = (typeof STATE !== 'undefined' && STATE.context) || 'gpu';
  const famSel = document.getElementById('bf-select-family');
  if (famSel) famSel.value = 'custom';
  BF_FAMILIES.custom.slugs = [...STATE.bfCustomSlugs];
  BF_FAMILIES.custom.kind = ctx;
  renderBlackFridayTab();
}
window.onBFCustomModelToggle = onBFCustomModelToggle;

function selectAllBFModels(enable) {
  const ctx = (typeof STATE !== 'undefined' && STATE.context) || 'gpu';
  const pool = _getBFPoolForContext(ctx);
  if (enable) {
    STATE.bfCustomSlugs = new Set(pool.slice(0, 15).map(x => x.slug));
  } else {
    STATE.bfCustomSlugs = new Set(pool.slice(0, 2).map(x => x.slug));
  }
  const famSel = document.getElementById('bf-select-family');
  if (famSel) famSel.value = 'custom';
  BF_FAMILIES.custom.slugs = [...STATE.bfCustomSlugs];
  BF_FAMILIES.custom.kind = ctx;
  renderBFCustomModelsCheckboxes();
  renderBlackFridayTab();
}
window.selectAllBFModels = selectAllBFModels;

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

  // Use contextual composite score if GPU or Laptop, normalized domain score for Smartphone/Peripherals/Misc, else CPU gaming index
  const perf = kind === 'laptop'
    ? (typeof getLaptopContextualCompositeScore === 'function' ? getLaptopContextualCompositeScore(item) : ((item.gaming_score || 1000) * 2))
    : (kind === 'gpu'
        ? (typeof getContextualCompositeScore === 'function' ? getContextualCompositeScore(item) : (item.gaming_score || 1))
        : (['smartphone', 'peripherals', 'peripheral', 'misc', 'air_fryer', 'diapers'].includes(kind)
            ? Math.max(500, Number(item.overall_score || item.cb_score || item.perf_score || 65) * 100)
            : getCpuGamingIndex(item) * 100));

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
  if (!DB.gpus.length && !DB.cpus.length && !(DB.laptops || []).length && !(DB.smartphones || []).length && !(DB.peripherals || []).length) return;
  const ctx = (typeof STATE !== 'undefined' && STATE.context) || 'gpu';
  const famKey = document.getElementById('bf-select-family').value;
  const defKey = _getBFDefaultFamKey(ctx);
  const fam = BF_FAMILIES[famKey] || BF_FAMILIES[defKey];
  const activeKind = (fam.kind === 'custom') ? ctx : fam.kind;
  const pool = _getBFPoolForContext(activeKind);

  let items = [];
  if (famKey === 'custom' && STATE.bfCustomSlugs && STATE.bfCustomSlugs.size > 0) {
    items = [...STATE.bfCustomSlugs].map(s => pool.find(x => x.slug === s)).filter(Boolean);
  } else if (fam.filterFn) {
    items = pool.filter(fam.filterFn).slice(0, fam.maxItems || 10);
  } else {
    const slugsToUse = (fam.slugs && fam.slugs.length) ? fam.slugs : pool.slice(0, 8).map(x => x.slug);
    items = slugsToUse.map(s => pool.find(x => x.slug === s)).filter(Boolean);
  }
  const stats = items.map(it => bfAnalyzeItem(it, activeKind));
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
      <span class="ui-label mr-1">Modelos no Gráfico:</span>
      ${stats.map(s => {
        const active = !STATE.bfVisibleSlugs || STATE.bfVisibleSlugs.has(s.item.slug);
        return `<button type="button" onclick="toggleBFModel('${s.item.slug}')" class="ui-chip ${active ? 'is-active' : ''}">${s.item.name}</button>`;
      }).join('')}
      <button type="button" onclick="STATE.bfVisibleSlugs = null; renderBlackFridayTab();" class="ui-btn ui-btn--sm ui-btn--ghost ml-1">Exibir Todos</button>
    `;
  }

  // Multi-year summary (configurable/hidden by default to avoid clutter)
  const sumEl = document.getElementById('bf-multiyear-summary');
  if (sumEl) {
    if (!STATE.bfShowSummary) sumEl.classList.add('hidden');
    else sumEl.classList.remove('hidden');
  }
  const firstDates = stats.map(s => s.firstDate).filter(Boolean).sort();
  const postLowerModels = stats.filter(s => s.years[curYear - 1] && s.years[curYear - 1].postLower);
  const postLowerCount = postLowerModels.length;
  const withPost = stats.filter(s => s.years[curYear - 1] && s.years[curYear - 1].postLower != null).length;
  const inflated = stats.filter(s => s.preBfInflationPct != null && s.preBfInflationPct > 6);
  const yoys = stats.map(s => s.yoyPct).filter(v => v != null);
  const bestValue = [...stats].sort((a, b) => (a.brlPerContextualPerf || a.brlPerPerf) - (b.brlPerContextualPerf || b.brlPerPerf))[0];
  document.getElementById('bf-multiyear-summary').innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <div class="ui-kpi">
        <span class="ui-kpi-label">Desconto mediano BF ${curYear - 1}</span>
        <span class="ui-kpi-value ui-kpi-value--warn">${Math.round(familyMedianDisc * 100)}%</span>
        <span class="ui-kpi-sub">mín. de Nov vs média Set–Out (${discs.length} modelos)</span>
      </div>
      <div class="ui-kpi">
        <span class="ui-kpi-label">Caiu depois da BF?</span>
        <span class="ui-kpi-value ${postLowerCount > withPost / 2 ? 'ui-kpi-value--brand' : 'ui-kpi-value--good'}">${postLowerCount}/${withPost}</span>
        <span class="ui-kpi-sub">modelos mais baratos entre Dez–Mar</span>
        ${postLowerModels.length ? `
          <div class="mt-1.5 flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-0.5">
            ${postLowerModels.map(s => {
              const py = s.years[curYear - 1] || {};
              const dropPct = py.bfMin && py.postMin ? Math.round((1 - py.postMin / py.bfMin) * 100) : 0;
              return `<span class="ui-badge ui-badge--brand ui-mono" title="Piso BF: ${fmtBRLShort(py.bfMin)} → Menor Pós-BF: ${fmtBRLShort(py.postMin)}">${s.item.name}${dropPct > 0 ? ` −${dropPct}%` : ''}</span>`;
            }).join('')}
          </div>
        ` : ''}
      </div>
      <div class="ui-kpi">
        <span class="ui-kpi-label">Variação em 12 meses</span>
        <span class="ui-kpi-value ${(median(yoys) || 0) > 0 ? 'ui-kpi-value--bad' : 'ui-kpi-value--good'}">${yoys.length ? ((median(yoys) > 0 ? '+' : '') + Math.round(median(yoys)) + '%') : '--'}</span>
        <span class="ui-kpi-sub">hoje vs mesma época de ${curYear - 1}</span>
      </div>
      <div class="ui-kpi">
        <span class="ui-kpi-label">Alerta "metade do dobro"</span>
        <span class="ui-kpi-value ${inflated.length ? 'ui-kpi-value--bad' : 'ui-kpi-value--good'}">${inflated.length}</span>
        <span class="ui-kpi-sub truncate" title="${inflated.map(s => s.item.name).join(', ')}">${inflated.length ? 'subiram >6%: ' + inflated.map(s => s.item.name).join(', ') : 'nenhum modelo inflado pré-BF'}</span>
      </div>
      <div class="ui-kpi">
        <span class="ui-kpi-label">Melhor custo-desempenho</span>
        <span class="text-base font-bold text-emerald-300 leading-snug">${bestValue ? bestValue.item.name : '--'}</span>
        <span class="ui-kpi-sub">${bestValue ? fmtBRLShort(bestValue.brlPerContextualPerf || bestValue.brlPerPerf) + ' por 1000 pts' : ''}</span>
      </div>
    </div>
    <p class="text-xs text-slate-400 mt-2">Histórico disponível: desde ${firstDates[0] || '--'} (≈ ${firstDates[0] ? Math.round((new Date(bfToday()) - new Date(firstDates[0])) / 86400000) : 0} dias).</p>`;

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

  // Table with inline visual BF range mini-gauge
  const yPrev = curYear - 1;
  document.getElementById('bf-table-body').innerHTML = stats.map(s => {
    const py = s.years[yPrev] || {};
    const r = s.range;
    let diag, badgeTone, dotColor;
    if (s.yoyPct != null && s.yoyPct > 15 && s.effectiveCurrent > s.allMin * 1.25) {
      diag = `Encarecendo (+${Math.round(s.yoyPct)}% a/a)`;
      badgeTone = 'warn';
      dotColor = 'var(--ui-warn)';
    } else if (s.preBfInflationPct != null && s.preBfInflationPct > 6 && s.effectiveCurrent > r.high) {
      diag = `Inflado +${Math.round(s.preBfInflationPct)}%`;
      badgeTone = 'bad';
      dotColor = 'var(--ui-bad)';
    } else if (s.effectiveCurrent <= r.high) {
      diag = s.effectiveCurrent <= r.low ? 'Abaixo do piso BF' : 'Já em preço de BF';
      badgeTone = 'good';
      dotColor = 'var(--ui-good)';
    } else if (s.effectiveCurrent <= r.high * 1.07) {
      diag = `Perto (+${fmtBRLShort(s.effectiveCurrent - r.high)})`;
      badgeTone = 'warn';
      dotColor = 'var(--ui-warn)';
    } else if (py.postLower) {
      diag = 'Caiu pós-BF';
      badgeTone = 'warn';
      dotColor = 'var(--ui-warn)';
    } else {
      diag = `Aguarde −${fmtBRLShort(s.effectiveCurrent - r.high)}`;
      badgeTone = 'bad';
      dotColor = 'var(--ui-bad)';
    }

    // Mini-gauge geometry
    const mLo = Math.min(s.allMin || r.low, r.low, s.effectiveCurrent) * 0.94;
    const mHi = Math.max(s.effectiveCurrent, r.high, py.preAvg || r.high) * 1.06;
    const mPos = v => Math.max(2, Math.min(98, ((v - mLo) / Math.max(1, mHi - mLo)) * 100));
    const rLeft = mPos(r.low);
    const rWidth = Math.max(8, mPos(r.high) - rLeft);
    const curPos = mPos(s.effectiveCurrent);

    return `
      <tr class="cursor-pointer" onclick="document.getElementById('bf-target-item').value='${s.item.slug}'; onBFTargetItemChange();">
        <td>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-white">${s.item.name}</span>
            ${s.kind === 'laptop'
              ? `<span class="ui-badge ui-mono">${s.item.ram_gb}GB / ${s.item.storage_gb >= 1024 ? (s.item.storage_gb / 1024) + 'TB' : s.item.storage_gb + 'GB'}</span>`
              : (s.item.vram_gb ? `<span class="ui-badge ui-mono">${s.item.vram_gb} GB</span>` : '')}
            ${s.item.coupon ? `<button type="button" onclick="event.stopPropagation(); typeof copyCouponAndOpen === 'function' ? copyCouponAndOpen('${s.item.coupon}', '${s.item.offer_url}') : navigator.clipboard.writeText('${s.item.coupon}')" class="ui-badge ui-badge--warn ui-mono cursor-pointer" title="Copiar cupom">🎟️ ${s.item.coupon}</button>` : ''}
          </div>
          <div class="text-xs text-slate-400 ui-mono mt-0.5">${
            s.kind === 'laptop'
              ? `${s.item.cpu_name} • ${s.item.gpu_name} • ${fmtBRLShort(s.brlPerContextualPerf || s.brlPerPerf)}/1000 pts`
              : (s.kind === 'gpu'
                ? `Score ${Math.round(s.perf)} • ${fmtBRLShort(s.brlPerContextualPerf || s.brlPerPerf)}/1000 pts`
                : (s.kind === 'smartphone'
                  ? `${s.item.soc_name || 'SoC'} • ${s.item.ram_gb || 8}G/${s.item.storage_gb || 128}G`
                  : ((s.kind === 'peripherals' || s.kind === 'misc' || s.kind === 'air_fryer' || s.kind === 'diapers')
                    ? `${(s.item.specs && s.item.specs.summary) || s.item.brand || '--'} • C/B ${Math.round(s.item.cb_score || 60)}/100`
                    : `Índice ${getCpuGamingIndex(s.item)} • ${fmtBRLShort(s.brlPerContextualPerf || s.brlPerPerf)}/1000 pts`)))
          }</div>
        </td>
        <td class="text-right ui-mono font-bold text-white whitespace-nowrap">${fmtBRLShort(s.current)}</td>
        <td>
          <div class="ui-bf-mini-gauge mx-auto" title="Hoje: ${fmtBRLShort(s.effectiveCurrent)} | Faixa esperada BF: ${fmtBRLShort(r.low)} – ${fmtBRLShort(r.high)}">
            <div class="ui-bf-mini-track">
              <div class="ui-bf-mini-range" style="left:${rLeft}%; width:${rWidth}%"></div>
              <div class="ui-bf-mini-dot" style="left:${curPos}%; background:${dotColor}"></div>
            </div>
          </div>
        </td>
        <td class="text-right ui-mono whitespace-nowrap"><span class="text-emerald-300 font-bold">${fmtBRLShort(r.low)}</span> – <span class="text-slate-300">${fmtBRLShort(r.high)}</span></td>
        <td class="text-right ui-mono text-emerald-300 whitespace-nowrap">${fmtBRLShort(s.allMin)}</td>
        <td class="text-right ui-mono text-slate-300 hidden 2xl:table-cell whitespace-nowrap">${py.preAvg ? fmtBRLShort(py.preAvg) : '<span class="text-slate-600">—</span>'}</td>
        <td class="text-right ui-mono text-amber-300 hidden 2xl:table-cell whitespace-nowrap">${py.bfMin ? fmtBRLShort(py.bfMin) : '<span class="text-slate-600">—</span>'}</td>
        <td class="text-center ui-mono hidden md:table-cell whitespace-nowrap">${py.discount != null ? `<span class="text-amber-300 font-bold">−${Math.round(py.discount * 100)}%</span>` : `<span class="text-slate-400" title="Produto sem BF anterior — usa mediana da família">~${Math.round(BF_CACHE.familyMedianDisc * 100)}%*</span>`}</td>
        <td class="text-center whitespace-nowrap"><span class="ui-badge ui-badge--${badgeTone}">${diag}</span></td>
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

  // Shade Black Friday windows (Nov 1 – Dec 2) and mark exact Black Friday date
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
        c.fillStyle = 'rgba(245, 158, 11, 0.08)';
        c.fillRect(x0, chartArea.top, Math.max(2, x1 - x0), chartArea.bottom - chartArea.top);
        c.fillStyle = 'rgba(245, 158, 11, 0.7)';
        c.font = '600 12px ' + gcaFontFamily();
        c.fillText(`BF ${y}`, x0 + 3, chartArea.top + 11);

        // Exact Black Friday Date marker (4th Friday of November)
        const exactBf = getExactBlackFridayDate(parseInt(y, 10));
        let iBf = dates.findIndex(d => d >= exactBf);
        if (iBf !== -1) {
          const xBf = x.getPixelForValue(iBf);
          if (xBf >= chartArea.left && xBf <= chartArea.right) {
            c.save();
            c.setLineDash([4, 3]);
            c.strokeStyle = '#ef4444';
            c.lineWidth = 1.5;
            c.beginPath();
            c.moveTo(xBf, chartArea.top);
            c.lineTo(xBf, chartArea.bottom);
            c.stroke();
            c.restore();

            c.fillStyle = '#ef4444';
            c.font = 'bold 12px ' + gcaFontFamily();
            const dayStr = exactBf.slice(8);
            c.fillText(`📍 Dia BF (${dayStr}/11)`, xBf - 24, chartArea.top + 23);
          }
        }
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

  const targetBfShade = {
    id: 'targetBfShade',
    beforeDatasetsDraw(chart) {
      const { ctx: c, chartArea, scales: { x } } = chart;
      if (!chartArea) return;
      const sampledDates = sampled.map(h => h.date);
      const years = [...new Set(sampledDates.map(d => d.slice(0, 4)))];
      c.save();
      years.forEach(y => {
        const exactBf = getExactBlackFridayDate(parseInt(y, 10));
        const iBf = sampledDates.findIndex(d => d >= exactBf);
        if (iBf !== -1) {
          const xBf = x.getPixelForValue(iBf);
          if (xBf >= chartArea.left && xBf <= chartArea.right) {
            c.save();
            c.setLineDash([3, 3]);
            c.strokeStyle = '#ef4444';
            c.lineWidth = 1.3;
            c.beginPath();
            c.moveTo(xBf, chartArea.top);
            c.lineTo(xBf, chartArea.bottom);
            c.stroke();
            c.restore();

            c.fillStyle = '#ef4444';
            c.font = 'bold 12px ' + gcaFontFamily();
            c.fillText(`📍 BF (${exactBf.slice(8)}/11)`, xBf - 20, chartArea.top + 14);
          }
        }
      });
      c.restore();
    }
  };

  chartBFTarget = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    plugins: [targetBfShade],
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
  const testPriceInp = document.getElementById('bf-input-test-price');
  if (testPriceInp && testPriceInp.dataset.userEditedSlug !== slug) {
    testPriceInp.value = Math.round(st.current);
    delete testPriceInp.dataset.userEditedSlug;
  }
  const couponInput = document.getElementById('bf-input-coupon');
  if (couponInput) couponInput.value = '';

  // Render Target Info Pill (VRAM badge, RAM, Arch, Today's Price)
  const pillEl = document.getElementById('bf-target-info-pill');
  if (pillEl) {
    if (st.kind === 'laptop') {
      const l = st.item;
      pillEl.innerHTML = `
        <span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-mono font-bold">${l.cpu_name}</span>
        <span class="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-xs font-mono">${l.gpu_name}</span>
        <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono">${l.ram_gb}GB • ${l.screen_inches}" ${l.screen_hz}Hz</span>
        <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold">Hoje: ${fmtBRL(st.current)}</span>
      `;
    } else if (st.kind === 'gpu') {
      const g = st.item;
      pillEl.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-sky-300 font-mono text-xs font-bold border border-sky-500/30">
          <span class="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
          ${g.vram_gb} GB ${g.memory_type || 'GDDR6'} (${g.bandwidth_gbs || 288} GB/s)
        </span>
        <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono">${g.arch || 'GPU'}</span>
        <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold">Hoje: ${fmtBRL(st.current)}</span>
      `;
    } else {
      pillEl.innerHTML = `
        <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono">${st.item.socket || 'Processador'}</span>
        <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold">Hoje: ${fmtBRL(st.current)}</span>
      `;
    }
  }

  // Check if Promo Radar has an active coupon / flash deal for this target item
  const ctnActive = document.getElementById('bf-active-coupons-container');
  if (ctnActive) {
    const activeReg = getActiveRegionId();
    const lastDataReg = (PROMO_STATE.lastData && PROMO_STATE.lastData.region_id) ? PROMO_STATE.lastData.region_id.toLowerCase() : activeReg;
    const brChannels = new Set(['ofertasadrenaline', 'peperaiohardware', 'iskandarsouza', 'benchpromos', 'kabumofertas', 'nerdofertas', 'ofertastechbr']);

    const allMatchingDeals = (PROMO_STATE.lastData && lastDataReg === activeReg && Array.isArray(PROMO_STATE.lastData.matched_deals)) 
      ? PROMO_STATE.lastData.matched_deals.filter(d => {
          if (d.matched_slug !== slug) return false;
          const dReg = (d.region_id || lastDataReg).toLowerCase();
          if (dReg !== activeReg) return false;
          if (activeReg === 'mx' || activeReg === 'eu') {
            const isBr = brChannels.has((d.channel_id || '').toLowerCase()) || /\.br\b|t\.me\//i.test(d.buy_url || d.post_url || '');
            if (isBr) return false;
            if (activeReg === 'eu' && /\.mx\b|cyberpuerta|ddtech|promodescuentos/i.test(d.buy_url || d.post_url || '')) return false;
          } else if (activeReg === 'br') {
            if (dReg === 'mx' || dReg === 'eu') return false;
          }
          return true;
        }) 
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
      const tsMs = d.timestamp ? Date.parse(d.timestamp) : NaN;
      const ageHrs = !isNaN(tsMs) ? Math.max(0, (Date.now() - tsMs) / 3600000) : (typeof d.age_hours === 'number' ? d.age_hours : 999);
      if (ageHrs > 48 || (!d._isStoreDirect && !d.timestamp)) return false;
      if (d.is_expired || d.deal_status === 'out_of_stock' || d.deal_status === 'expired' || d.deal_status === 'untested') return false;
      if (dStat && (dStat.status === 'expired' || dStat.status === 'out_of_stock' || dStat.status === 'untested')) return false;
      if (d.is_coupon_expired || (cStat && cStat.status === 'expired')) return false;
      return true;
    });
    const best = activeDeals.length > 0 ? activeDeals[0] : null;
    const cheapestActive = activeDeals.reduce((min, d) => (!min || (d.price_brl || 999999) < (min.price_brl || 999999)) ? d : min, null);
    if (cheapestActive && cheapestActive.price_brl > 0 && cheapestActive.price_brl < st.current) {
      if (testPriceInp && (testPriceInp.dataset.userEditedSlug !== slug || !silent)) {
        testPriceInp.value = Math.round(cheapestActive.price_brl);
        if (!silent) delete testPriceInp.dataset.userEditedSlug;
      }
    }

    const regLabels = {
      br: {
        sym: 'R$', defStore: 'E-commerce', expired: 'OFERTA ENCERRADA NA LOJA',
        verified: '✅ CONFIRMADO EM ESTOQUE NA LOJA', riskExp: 'Risco de Expirado',
        couponTitle: 'Cupom Detectado', directTitle: 'Oferta Direta (Sem Cupom)',
        directSub: 'Preço à vista no link', btnTest: 'Testar', btnCopy: 'Copiar Cupom',
        btnOpen: 'Abrir Loja', btnSim: 'Simular Preço', src: 'Canal', store: 'Loja',
        worked: 'Funcionou no carrinho?', yes: '👍 Sim', expBtn: '👎 Expirou', clr: 'Limpar',
        noneTitle: 'Nenhuma promoção ativa no momento',
        noneDesc: p => `Última oferta de ${formatMoney(p)} encerrada`,
        refDesc: p => `Preço mantido no catálogo oficial: ${formatMoney(p)}`
      },
      mx: {
        sym: '$', defStore: 'Cyberpuerta', expired: 'OFERTA TERMINADA EN TIENDA',
        verified: '✅ CONFIRMADO ACTIVO EN TIENDA', riskExp: 'Riesgo de Expirado',
        couponTitle: 'Cupón Detectado', directTitle: 'Oferta Directa (Sin Cupón)',
        directSub: 'Precio de contado en enlace', btnTest: 'Probar', btnCopy: 'Copiar Cupón',
        btnOpen: 'Abrir Tienda', btnSim: 'Simular Precio', src: 'Fuente', store: 'Tienda',
        worked: '¿Funcionó en el carrito?', yes: '👍 Sí', expBtn: '👎 Expiró', clr: 'Limpiar',
        noneTitle: 'Ninguna promoción activa en México',
        noneDesc: p => `Última oferta de ${formatMoney(p)} terminada`,
        refDesc: p => `Precio de referencia en México: ${formatMoney(p)}`
      },
      eu: {
        sym: '€', defStore: 'Alternate DE', expired: 'OFERTA ENCERRADA NA EUROPA',
        verified: '✅ CONFIRMADO EM ESTOQUE (EU)', riskExp: 'Risco de Expirado',
        couponTitle: 'Cupom / Voucher EU', directTitle: 'Oferta Direta EU',
        directSub: 'Preço direto no link europeu', btnTest: 'Testar', btnCopy: 'Copiar Cupom',
        btnOpen: 'Abrir Loja EU', btnSim: 'Simular Preço', src: 'Fonte', store: 'Loja EU',
        worked: 'Funcionou no checkout?', yes: '👍 Sim', expBtn: '👎 Expirou', clr: 'Limpar',
        noneTitle: 'Sem promoções ativas na Europa no momento',
        noneDesc: p => `Última oferta EU de ${formatMoney(p)} encerrada`,
        refDesc: p => `Preço de referência na Europa: ${formatMoney(p)}`
      }
    }[activeReg] || {};

    if (best) {
      ctnActive.classList.remove('hidden');
      const currSym = window.STATE?.market?.monetary?.currency_symbol || regLabels.sym || 'R$';
      const rawCode = (best.coupon_code || '').trim();
      const rawInfo = (best.coupon_info || '').trim();
      let hasRealCoupon = false;
      let cleanCoup = '';

      if (rawCode && /[A-Z]/i.test(rawCode) && !/^(HTTPS?|WWW|COM|BR|MX|EU|OFERTA|PROMO|LINK|NULL|UNDEFINED|OFERTAFLASH)$/i.test(rawCode)) {
        cleanCoup = rawCode.replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase();
        if (cleanCoup.length >= 3) hasRealCoupon = true;
      } else if (rawInfo && !/^(oferta|link|site|preço|preco|cash|sem|pix)/i.test(rawInfo)) {
        const mOff = rawInfo.match(/(?:R\$|\$|€|£)?\s*([0-9]{2,4})\s*OFF/i);
        if (mOff) {
          cleanCoup = `${currSym} ${mOff[1]} OFF`;
          hasRealCoupon = true;
        } else {
          const m = rawInfo.match(/\b([A-Z0-9_\-]{4,22})\b/);
          if (m && /[A-Z]/i.test(m[1]) && !/^(HTTPS?|WWW|COM|BR|MX|EU|OFERTA|PROMO|LINK|NULL|OFERTAFLASH|RESGATE|CUPOM|DESCONTO)$/i.test(m[1])) {
            cleanCoup = m[1].toUpperCase();
            hasRealCoupon = true;
          }
        }
      }

      if (cleanCoup && /^[0-9]+$/.test(cleanCoup)) {
        cleanCoup = `${currSym} ${cleanCoup} OFF`;
        hasRealCoupon = true;
      }

      const pId = best.post_id || '';
      const dealsMap = (PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.deals) || {};
      const dealStatus = dealsMap[pId] || dealsMap[pId.toLowerCase()] || (best.buy_url ? dealsMap[best.buy_url] : null);
      const couponStatus = (cleanCoup && PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.coupons && PROMO_STATE.couponStatus.coupons[cleanCoup]) || null;
      const isExpired = best.is_expired || (dealStatus && (dealStatus.status === 'expired' || dealStatus.status === 'out_of_stock')) || (couponStatus && couponStatus.status === 'expired');
      const isVerifiedActive = !isExpired && (
        (hasRealCoupon && ((couponStatus && couponStatus.status === 'verified') || best.coupon_status === 'verified')) ||
        (!hasRealCoupon && ((dealStatus && dealStatus.status === 'active' && dealStatus.stock_verified) || (best.deal_status === 'active' && best.stock_verified)))
      );
      const isUnverifiedCoupon = !isExpired && !isVerifiedActive && (hasRealCoupon || best.deal_status === 'unverified_coupon');
      const liveStorePrice = (dealStatus && dealStatus.live_price) || best.live_store_price_brl || null;
      const buyUrl = best.buy_url || best.post_url || '#';
      const resolvedStore = (dealStatus && dealStatus.store_name && dealStatus.store_name !== 'E-commerce') ? dealStatus.store_name : (best.store_name || regLabels.defStore || 'E-commerce');

      let freshBadge = '';
      if (isExpired) {
        freshBadge = `<span class="px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-300 border border-rose-500/50 font-mono text-xs font-bold" title="${(dealStatus && dealStatus.reason) || 'Oferta encerrada'}">❌ ${regLabels.expired}</span>`;
      } else if (isVerifiedActive) {
        freshBadge = `<span class="px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-500/50 font-mono text-xs font-bold" title="${(dealStatus && dealStatus.reason) || 'Confirmado em estoque na loja'}">${regLabels.verified}</span>`;
      } else if (isUnverifiedCoupon) {
        freshBadge = `<span class="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-200 border border-amber-500/50 font-mono text-xs font-bold" title="${(dealStatus && dealStatus.reason) || 'Depende do cupom aplicar no carrinho da loja'}">⚠️ DEPENDE DE CUPOM NO CARRINHO${liveStorePrice ? ` (Sem cupom: ${formatMoney(liveStorePrice)})` : ''}</span>`;
      } else if (best.age_hours <= 2) {
        freshBadge = `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-xs font-bold">🟢 Fresco (${best.age_hours}h)</span>`;
      } else if (best.age_hours <= 8) {
        freshBadge = `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs font-bold">🟡 Moderado (${best.age_hours}h)</span>`;
      } else {
        freshBadge = `<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono text-xs font-bold">🔴 ${regLabels.riskExp} (${best.age_hours}h)</span>`;
      }

      let titleHtml = '';
      if (hasRealCoupon) {
        titleHtml = `
          <span class="font-mono text-amber-300 font-bold">🎟️ ${regLabels.couponTitle}:</span>
          <span class="text-white font-mono font-bold ${isExpired ? 'line-through text-slate-400' : ''}">${cleanCoup}</span>
          <span class="text-emerald-400 font-mono font-bold">(${formatMoney(best.price_brl)})</span>
        `;
      } else {
        titleHtml = `
          <span class="font-mono text-emerald-400 font-bold">⚡ ${regLabels.directTitle}:</span>
          <span class="text-white font-mono font-bold">${formatMoney(best.price_brl)}</span>
          <span class="text-slate-400 font-mono text-xs">(${regLabels.directSub})</span>
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
            <button onclick="testDealCouponNow('${best.post_id}', '${buyUrl}', '${cleanCoup}', ${best.price_brl}, '${best.matched_slug || slug}', '${best.matched_kind || st.kind}')" class="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 transition font-bold text-xs cursor-pointer flex items-center gap-1" title="Testar status">
              <span>🧪 ${regLabels.btnTest}</span>
            </button>
            ${hasRealCoupon ? `
              <button onclick="copyCouponAndOpen('${cleanCoup}', '${buyUrl}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-bold text-xs cursor-pointer" title="Copiar cupom">
                📋 ${regLabels.btnCopy}
              </button>
            ` : ''}
            <a href="${buyUrl}" target="_blank" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition font-bold text-xs cursor-pointer flex items-center gap-1" title="Abrir loja">
              ↗ ${regLabels.btnOpen}
            </a>
            <button onclick="applyActiveCouponToBF(${best.price_brl}, '${escape(cleanCoup)}')" class="px-2 py-1 rounded bg-amber-400 text-slate-950 text-xs font-bold hover:bg-amber-300 transition cursor-pointer" title="Simular preço">
              ⚡ ${regLabels.btnSim}
            </button>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-1 text-xs text-slate-400 pt-1 border-t border-slate-800/80 font-mono">
          <span>${regLabels.src}: ${best.channel_name || '@' + best.channel_id} • há ${best.age_hours}h • ${regLabels.store}: ${resolvedStore} • Modelo: ${(best.title || '').slice(0, 55)}</span>
          <div class="flex items-center gap-1">
            <span class="text-slate-400 text-xs">${regLabels.worked}</span>
            <button onclick="setCouponUserStatus('${cleanCoup || best.post_id}', 'working')" class="px-1.5 py-0.5 rounded ${isVerifiedActive ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 hover:bg-emerald-500/30 text-emerald-300'} text-xs cursor-pointer">${regLabels.yes}</button>
            <button onclick="setCouponUserStatus('${cleanCoup || best.post_id}', 'expired')" class="px-1.5 py-0.5 rounded ${isExpired ? 'bg-rose-500 text-white font-bold' : 'bg-slate-800 hover:bg-rose-500/30 text-rose-300'} text-xs cursor-pointer">${regLabels.expBtn}</button>
            ${(isVerifiedActive || isExpired) ? `<button onclick="setCouponUserStatus('${cleanCoup || best.post_id}', null)" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs cursor-pointer" title="Limpar">↺ ${regLabels.clr}</button>` : ''}
          </div>
        </div>
      `;
    } else {
      const latestExpired = allMatchingDeals.length > 0 ? allMatchingDeals[0] : null;
      if (latestExpired) {
        ctnActive.classList.remove('hidden');
        ctnActive.className = 'p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 flex flex-col gap-1 text-xs';
        ctnActive.innerHTML = `
          <div class="flex items-center justify-between gap-1.5 flex-wrap">
            <span class="font-mono text-rose-300 font-bold">❌ ${regLabels.noneTitle}</span>
            <span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono text-xs">${regLabels.noneDesc(latestExpired.price_brl)}</span>
          </div>
          <div class="text-xs text-slate-400 font-mono">${regLabels.refDesc(st.current)}.</div>
        `;
      } else {
        ctnActive.innerHTML = '';
        ctnActive.classList.add('hidden');
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
          ${isMarkedExpired ? '<span class="px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-300 font-bold text-xs">⚠️ MARCADO EXPIRADO</span>' : ''}
        </div>
        ${isMarkedExpired ? '<div class="text-rose-300 text-xs mt-1">⚠️ Você ou o sistema marcaram este cupom como EXPIRADO. A loja pode recusar o desconto no carrinho real.</div>' : ''}
      `;
    } else if (coupRaw && !/^(OFERTAFLASH|OFERTA FLASH)$/i.test(coupRaw)) {
      summaryEl.classList.remove('hidden');
      summaryEl.innerHTML = `
        <div class="flex items-center justify-between text-xs text-slate-300">
          <span>🎟️ Cupom <strong>${cleanCoup}</strong> inserido. O preço anunciado de <strong>${fmtBRL(basePrice)}</strong> já é o valor final com este cupom na loja.</span>
          ${isMarkedExpired ? '<span class="px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-300 font-bold text-xs">⚠️ MARCADO EXPIRADO</span>' : ''}
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
  let badgeText, verdictMsg, tone;
  if (test <= Math.min(r.low, uMin)) {
    badgeText = 'COMPRE AGORA';
    verdictMsg = 'Abaixo da faixa esperada de Black Friday e do seu mínimo.';
    tone = 'good';
  } else if (test <= uMin) {
    badgeText = 'ÓTIMO PREÇO';
    verdictMsg = 'Abaixo do seu preço mínimo esperado.';
    tone = 'good';
  } else if (test <= r.high) {
    badgeText = 'DENTRO DA FAIXA BF';
    verdictMsg = 'Dentro da faixa esperada de Black Friday.';
    tone = 'good';
  } else if (test <= uMax) {
    badgeText = 'ACEITÁVEL';
    verdictMsg = 'Dentro do seu teto, mas pode cair mais na Black Friday.';
    tone = 'warn';
  } else {
    badgeText = 'AGUARDE';
    verdictMsg = `Acima do teto em ${fmtBRLShort(test - uMax)}. Não é preço de Black Friday.`;
    tone = 'bad';
  }

  const lo = Math.min(st.allMin || r.low, uMin, r.low, test, st.current) * 0.94;
  const hi = Math.max(st.current, uMax, r.high, test, st.recentAvg || r.high) * 1.06;
  const span = Math.max(1, hi - lo);
  const pos = v => Math.max(2, Math.min(98, ((v - lo) / span) * 100));

  const pLow = pos(r.low);
  const pHigh = pos(r.high);
  const pWarnEnd = Math.min(98, pos(Math.max(uMax, r.high * 1.08)));
  const pToday = pos(st.current);
  const pTest = pos(test);
  const pUserLow = pos(uMin);
  const pUserHigh = pos(uMax);
  const hasDistinctTest = Math.abs(test - st.current) >= 1;
  const py = st.years[parseInt(bfToday().slice(0, 4)) - 1] || {};

  // Clamp floating pin tag horizontally so it never clips on narrow mobile screens
  const tagShift = p => (p < 22 ? 'translateX(-15%)' : p > 78 ? 'translateX(-85%)' : 'translateX(-50%)');

  const gaugeEl = document.getElementById('bf-test-verdict');
  if (!gaugeEl) return;

  gaugeEl.innerHTML = `
    <div class="ui-bf-gauge-card ui-bf-gauge-card--${tone}">
      <!-- Verdict First -->
      <div class="ui-bf-gauge-verdict">
        <span class="ui-badge ui-badge--${tone} font-bold">${badgeText}</span>
        <span class="ui-mono font-extrabold text-lg text-white">${fmtBRL(test)}</span>
      </div>
      <p class="ui-body-sm text-slate-200">${verdictMsg}</p>

      <!-- Visual 3-Zone Price Gauge -->
      <div class="ui-bf-gauge-wrap">
        <div class="ui-bf-gauge-track">
          <div class="ui-bf-gauge-zone ui-bf-gauge-zone--good" style="left:0%; width:${pHigh}%"></div>
          <div class="ui-bf-gauge-zone ui-bf-gauge-zone--warn" style="left:${pHigh}%; width:${Math.max(0, pWarnEnd - pHigh)}%"></div>
          <div class="ui-bf-gauge-zone ui-bf-gauge-zone--bad" style="left:${pWarnEnd}%; width:${Math.max(0, 100 - pWarnEnd)}%"></div>

          <!-- Expected BF Range Band -->
          <div class="ui-bf-gauge-expected" style="left:${pLow}%; width:${Math.max(4, pHigh - pLow)}%" title="Faixa esperada BF: ${fmtBRLShort(r.low)} – ${fmtBRLShort(r.high)}"></div>

          <!-- User Custom Range Bracket -->
          <div class="ui-bf-gauge-user" style="left:${pUserLow}%; width:${Math.max(4, pUserHigh - pUserLow)}%" title="Sua faixa alvo: ${fmtBRLShort(uMin)} – ${fmtBRLShort(uMax)}"></div>

          <!-- Today Pin -->
          <div class="ui-bf-gauge-pin ui-bf-gauge-pin--today" style="left:${pToday}%" title="Preço hoje: ${fmtBRL(st.current)}">
            ${!hasDistinctTest ? `<span class="ui-bf-gauge-pin-tag" style="transform:${tagShift(pToday)}">Hoje • ${fmtBRLShort(st.current)}</span>` : ''}
          </div>

          <!-- Simulated / Coupon Pin (when user tests another price) -->
          ${hasDistinctTest ? `
            <div class="ui-bf-gauge-pin ui-bf-gauge-pin--test" style="left:${pTest}%" title="Preço simulado: ${fmtBRL(test)}">
              <span class="ui-bf-gauge-pin-tag" style="transform:${tagShift(pTest)}; border-color:var(--ui-brand-border); color:var(--ui-brand-hover);">Simulado • ${fmtBRLShort(test)}</span>
            </div>
          ` : ''}
        </div>
        <div class="ui-bf-gauge-axis">
          <span class="text-emerald-400">Mín ${fmtBRLShort(st.allMin || r.low)}</span>
          <span class="text-slate-400">Teto ${fmtBRLShort(Math.max(uMax, r.high, st.current))}</span>
        </div>
      </div>

      <!-- Compact Key Numbers -->
      <div class="grid grid-cols-2 gap-2 text-xs ui-mono pt-1 border-t border-slate-800/80">
        <div>
          <span class="text-slate-400 block">Faixa esperada BF</span>
          <span class="text-emerald-300 font-bold">${fmtBRLShort(r.low)} – ${fmtBRLShort(r.high)}</span>
        </div>
        <div class="text-right">
          <span class="text-slate-400 block">Menor histórico</span>
          <span class="text-slate-100 font-bold">${fmtBRLShort(st.allMin)}</span>
        </div>
      </div>

      <!-- Collapsible Statistical Details -->
      <details class="ui-details">
        <summary class="ui-details-summary">Ver detalhes do cálculo</summary>
        <div class="ui-details-body">
          <div class="grid grid-cols-2 gap-y-1.5 text-xs ui-mono">
            <span class="text-slate-400">Preço hoje:</span><span class="text-right text-white font-semibold">${fmtBRLShort(st.current)}</span>
            <span class="text-slate-400">Base (média pré-BF):</span><span class="text-right text-slate-200">${fmtBRLShort(r.base)}</span>
            <span class="text-slate-400">Desconto usado:</span><span class="text-right text-slate-200">${Math.round(r.disc * 100)}% ${r.ownData ? '(BF passada)' : '(mediana)'}</span>
            <span class="text-slate-400">Piso BF passada:</span><span class="text-right text-amber-300">${py.bfMin ? fmtBRLShort(py.bfMin) : '—'}</span>
            <span class="text-slate-400">Preço vs mínimo:</span><span class="text-right ${test <= st.allMin ? 'text-emerald-300 font-bold' : 'text-slate-200'}">${test <= st.allMin ? 'NOVO MÍNIMO' : '+' + Math.round((test / st.allMin - 1) * 100) + '%'}</span>
          </div>
          <p class="text-xs text-slate-400 mt-2">Borda verde = faixa estatística esperada. Tracejado azul = sua faixa salva por produto.</p>
        </div>
      </details>
    </div>`;
}

function syncBFTargetRangeToExpected() {
  const sel = document.getElementById('bf-target-item');
  if (!sel) return;
  const slug = sel.value;
  const st = BF_CACHE.stats.find(s => s.item.slug === slug);
  if (!st || !st.range) return;
  const minInp = document.getElementById('bf-input-min');
  const maxInp = document.getElementById('bf-input-max');
  if (minInp) minInp.value = st.range.low;
  if (maxInp) maxInp.value = st.range.high;
  if (!STATE.bfRanges) STATE.bfRanges = {};
  STATE.bfRanges[slug] = { min: st.range.low, max: st.range.high };
  saveUserPrefs();
  updateBFPromoEvaluator();
}
window.syncBFTargetRangeToExpected = syncBFTargetRangeToExpected;

// ============================================================================
// 6. CLIENT-SIDE FLASH PROMO & COUPON RADAR (100% PROCESSED IN USER BROWSER)
// ============================================================================
const PROMO_CACHE_KEY = 'gpuAnalyzerPromoCache_v1';
function getActiveRegionId() {
  const regFromState = (typeof STATE !== 'undefined' && STATE?.market?.region_id) ||
                       (typeof window !== 'undefined' && window.STATE?.market?.region_id);
  if (regFromState) {
    const r = String(regFromState).toLowerCase().trim();
    if (r === 'mx' || r === 'br' || r === 'eu') return r;
  }
  try {
    const urlReg = (typeof URLSearchParams !== 'undefined' && window.location && window.location.search)
      ? (new URLSearchParams(window.location.search).get('region') || '').toLowerCase().trim()
      : '';
    if (urlReg === 'mx' || urlReg === 'br' || urlReg === 'eu') return urlReg;
    const saved = (localStorage.getItem('selected_market_region') || '').toLowerCase().trim();
    if (saved === 'mx' || saved === 'br' || saved === 'eu') return saved;
  } catch (_) {}
  return 'br';
}

function getPromoCacheKey() {
  const reg = getActiveRegionId();
  return `gpuAnalyzerPromoCache_${reg}_v2`;
}

function getCouponStatusCacheKey() {
  const reg = getActiveRegionId();
  return `gpuAnalyzerCouponStatus_${reg}_v2`;
}

// Purge obsolete v1 caches to prevent stale unverified deals
try {
  ['br', 'mx', 'eu'].forEach(r => {
    localStorage.removeItem(`gpuAnalyzerPromoCache_${r}_v1`);
    localStorage.removeItem(`gpuAnalyzerCouponStatus_${r}_v1`);
  });
  localStorage.removeItem('gpuAnalyzerCouponStatus_v1');
} catch (_) {}

function getNotifiedStorageKey() {
  const reg = getActiveRegionId();
  return `gpuAnalyzerNotifiedDeals_${reg}_v2`;
}

let _bgKeepAliveCtx = null;
let _bgKeepAliveOsc = null;

function enableMobileBackgroundKeepAlive(enable) {
  try {
    if (!enable) {
      if (_bgKeepAliveOsc) {
        try { _bgKeepAliveOsc.stop(); _bgKeepAliveOsc.disconnect(); } catch (_) {}
        _bgKeepAliveOsc = null;
      }
      if (_bgKeepAliveCtx) {
        try { _bgKeepAliveCtx.close(); } catch (_) {}
        _bgKeepAliveCtx = null;
      }
      return;
    }
    if (_bgKeepAliveCtx) return; // Already active

    // 1. Silent 1Hz sub-audible oscillator at 0.0001 gain keeps mobile browser tab alive in background
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      _bgKeepAliveCtx = new AudioCtx();
      _bgKeepAliveOsc = _bgKeepAliveCtx.createOscillator();
      const gain = _bgKeepAliveCtx.createGain();
      _bgKeepAliveOsc.frequency.value = 1;
      gain.gain.value = 0.0001; // Effectively silent
      _bgKeepAliveOsc.connect(gain);
      gain.connect(_bgKeepAliveCtx.destination);
      _bgKeepAliveOsc.start();
    }

    // 2. Hold a navigator.locks lock so Chrome's Tab Freezer marks the tab as busy
    if (navigator.locks && navigator.locks.request) {
      navigator.locks.request('gpu_radar_bg_lock', () => new Promise(() => {}));
    }
  } catch (e) {
    console.warn('Keep-alive init warning:', e);
  }
}

// ===== Disjuntor dos proxies públicos do Telegram =====
// Os proxies gratuitos (codetabs, allorigins, corsproxy) caem com frequência. Quando
// falham em sequência, paramos de tentar por um tempo em vez de disparar dezenas de
// requisições que demoram 4s cada. O robô do GitHub Actions continua trazendo as
// promoções pelo promos_cache.json.
const TG_PROXY_BREAKER_KEY = 'gca-tg-proxy-down-until';
const TG_PROXY_FAIL_LIMIT = 3;            // canais seguidos sem resposta
const TG_PROXY_COOLDOWN_MS = 30 * 60000;  // pausa de 30 min
let _tgProxyFailStreak = 0;

function isTgProxyDown() {
  let until = 0;
  try { until = Number(sessionStorage.getItem(TG_PROXY_BREAKER_KEY)) || 0; } catch (_) {}
  return Date.now() < until;
}
function _tgProxyResult(ok) {
  if (ok) {
    _tgProxyFailStreak = 0;
    try { sessionStorage.removeItem(TG_PROXY_BREAKER_KEY); } catch (_) {}
    return;
  }
  _tgProxyFailStreak++;
  if (_tgProxyFailStreak >= TG_PROXY_FAIL_LIMIT) {
    try { sessionStorage.setItem(TG_PROXY_BREAKER_KEY, String(Date.now() + TG_PROXY_COOLDOWN_MS)); } catch (_) {}
    _tgProxyFailStreak = 0;
  }
}
window.isTgProxyDown = isTgProxyDown;

async function fetchTelegramChannelHTML(chId, query) {
  const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
  if (!isStatic) {
    try {
      const r = await fetchWithTimeout(`/api/tg-raw?ch=${encodeURIComponent(chId)}&q=${encodeURIComponent(query || '')}`, { cache: 'no-store' }, 4500);
      if (r.ok) return await r.text();
    } catch (_) {}
  }
  if (isTgProxyDown()) return '';
  // Static GitHub Pages fallback: race CORS proxies concurrently with 4s timeout
  const tgUrl = `https://t.me/s/${encodeURIComponent(chId)}` + (query ? `?q=${encodeURIComponent(query)}` : '');
  const proxies = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(tgUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(tgUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(tgUrl)}`
  ];
  try {
    const html = await Promise.any(proxies.map(async (pUrl) => {
      const r = await fetchWithTimeout(pUrl, { cache: 'no-store' }, 4000);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      if (!txt || !txt.includes('tgme_widget_message')) throw new Error('Empty TG feed');
      return txt;
    }));
    _tgProxyResult(true);
    return html;
  } catch (_) {}
  try {
    const rJson = await fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(tgUrl)}`, { cache: 'no-store' }, 4000);
    if (rJson.ok) {
      const j = await rJson.json();
      if (j && j.contents && j.contents.includes('tgme_widget_message')) {
        _tgProxyResult(true);
        return j.contents;
      }
    }
  } catch (_) {}
  _tgProxyResult(false);
  return '';
}

const CLIENT_PROMO_CHANNELS = [
  { id: 'ofertasadrenaline', name: 'Ofertas Adrenaline' },
  { id: 'peperaiohardware',  name: 'Peperaio Hardware' },
  { id: 'iskandarsouza',     name: 'Iskandar Souza' },
  { id: 'benchpromos',       name: 'BenchPromos' },
  { id: 'kabumofertas',      name: 'KaBuM Ofertas' },
  { id: 'nerdofertas',       name: 'Nerd Ofertas' }
];

const CLIENT_PROMO_QUERIES = ['', 'RTX', '5060', '5070', '4060', '7600', 'RX ', 'Ryzen', 'DDR4', 'DDR5', 'placa mãe', 'B760', 'H610', 'B550', 'B650', 'Fonte', 'notebook', 'macbook', 'nitro', 'loq', 'expirou', 'acabou', 'esgotou'];

function getClientPromoChannels() {
  const sources = (typeof STATE !== 'undefined' && STATE?.market?.promotion_sources) ||
                  (typeof window !== 'undefined' && window.STATE?.market?.promotion_sources);
  if (sources?.channels?.length) {
    return sources.channels;
  }
  const reg = getActiveRegionId();
  if (reg === 'mx') {
    return [
      { id: 'promodescuentos_gpus', name: 'Promodescuentos Tarjetas Gráficas' },
      { id: 'promodescuentos_pc',   name: 'Promodescuentos Componentes PC' },
      { id: 'cyberpuerta_ofertas',  name: 'Cyberpuerta Ofertas MX' },
      { id: 'ddtech_ofertas',       name: 'DDTech Promociones MX' }
    ];
  }
  if (reg === 'eu') {
    return [
      { id: 'mydealz_de',     name: 'MyDealz DE (Deals EU)' },
      { id: 'dealabs_fr',     name: 'Dealabs FR (Deals EU)' },
      { id: 'chollometro_es', name: 'Chollometro ES (Deals EU)' }
    ];
  }
  return CLIENT_PROMO_CHANNELS;
}

function getClientPromoQueries() {
  const sources = (typeof STATE !== 'undefined' && STATE?.market?.promotion_sources) ||
                  (typeof window !== 'undefined' && window.STATE?.market?.promotion_sources);
  if (sources?.search_keywords?.length) {
    return sources.search_keywords;
  }
  const reg = getActiveRegionId();
  if (reg === 'mx') {
    return ['', 'RTX', '5060', '5070', '4060', '7600', 'RX', 'Ryzen', 'DDR4', 'DDR5', 'agotado', 'expiró'];
  }
  if (reg === 'eu') {
    return ['', 'RTX', '5060', '5070', '9070', 'RX', 'Ryzen', 'DDR5', 'Caseking', 'abgelaufen', 'ausverkauft'];
  }
  return CLIENT_PROMO_QUERIES;
}

const CLIENT_LAPTOP_CLUE_RE = /\b(notebook|laptop|macbook|ultrabook|ideapad|vivobook|zenbook|thinkpad|inspiron|galaxy\s*book|acer\s*nitro|nitro\s*v?1[56]|lenovo\s*loq|legion\s*5|dell\s*g15|tuf\s*gaming\s*[af]1[567]|predator\s*helios|avell|victus)\b/i;
const CLIENT_LAPTOP_ACCESSORY_RE = /^\s*[^a-zA-Z0-9]*(?:power\s*bank|mochila|bolsa|suporte|base\s*(?:refrigerada|cooler)|cooler\s*para|capa|case|sleeve|pel[íi]cula|carregador|fonte\s*para|hub\s*usb|mouse|teclado|pendrive)|\b(?:para|p\/)\s*notebook\b/i;
const CLIENT_EXCLUDE_SYSTEM_RE = /\b(computador\s*completo|pc\s*completo|all\s*in\s*one|console|playstation|ps5|xbox|monitor|tv\s|smart\s*tv|cadeira|teclado|mouse|headset|smartphone|celular|iphone|galaxy\s*s)\b/i;

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
  ['rx-7600-xt',       /\brx\s*7600\s*xt\b(?!.*?\b8\s*gb\b)/i],
  ['rx-7650-gre',      /\brx\s*7650\s*gre\b/i],
  ['rx-7600',          /\brx\s*7600(?!\s*xt)\b|\brx\s*7600\s*xt\b.*?\b8\s*gb\b/i],
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
  ['ryzen-3-3200g',    /\bryzen\s*3\s*3200g\b|\b3200g\b/i],
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
  const activeReg = typeof getActiveRegionId === 'function' ? getActiveRegionId() : 'br';
  const decSep = activeReg === 'br' ? ',' : (window.STATE?.market?.monetary?.decimal_separator || ',');
  if (decSep === ',') {
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    else if (s.includes('.')) {
      const parts = s.split('.');
      if (parts[parts.length - 1].length === 3) s = s.replace(/\./g, '');
    }
  } else {
    // US / UK / MX style: 1,299.99
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
  let requiresCoupon = false;
  const candidates = [];

  const mCode = fullText.match(/(?:cupom|c[oó]digo|promo code|coupon)\s*(?:de\s*desconto)?\s*[:\-]?\s*\b([A-Z0-9]{4,18})\b/i);
  if (mCode) {
    const w = mCode[1].toUpperCase();
    const stop = new Set(['PARA', 'ESTA', 'ESSA', 'HOJE', 'AQUI', 'MAIS', 'PELO', 'SITE', 'LOJA', 'SHOPEE', 'KABUM', 'MAGALU', 'MERCADO', 'AMAZON', 'NEWEGG', 'BESTBUY', 'HTTPS', 'HTTP', 'WWW', 'COM', 'BR', 'RESGATE', 'APP']);
    if (!stop.has(w)) {
      couponCode = w;
      requiresCoupon = true;
    }
  }

  // Detect explicit discount amounts or percentages
  for (const line of lines) {
    const mDisc = line.match(/(?:cupom\s*de|desconto\s*de|menos|abatimento|off\s*de|save)\s*R?\$?\s*([0-9]{2,4})/i) ||
                  line.match(/(?:R\$|\$|€|£)\s*([0-9]{2,4})\s*(?:off|de\s*desconto|discount)/i);
    if (mDisc) {
      const dVal = parseFloat(mDisc[1]);
      if (dVal >= 10 && dVal <= 3000) {
        detectedDiscountBRL = Math.max(detectedDiscountBRL, dVal);
        requiresCoupon = true;
      }
    }
    const mPct = line.match(/\b([1-9][0-9]?)\s*%\s*(?:off|de\s*desconto|discount)/i);
    if (mPct) {
      const pVal = parseFloat(mPct[1]);
      if (pVal >= 3 && pVal <= 40) {
        detectedDiscountPct = Math.max(detectedDiscountPct, pVal);
        requiresCoupon = true;
      }
    }
  }

  const activeReg = typeof getActiveRegionId === 'function' ? getActiveRegionId() : 'br';
  const customPriceRegex = activeReg === 'br' ? null : window.STATE?.market?.monetary?.price_regex;
  const priceRe = customPriceRegex
    ? new RegExp(customPriceRegex, 'gi')
    : /R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]{3,5}(?:,[0-9]{1,2})?)/gi;
  const minValidPrice = activeReg === 'br' ? 80 : (window.STATE?.market?.monetary?.min_valid_hardware_price || 80);
  const maxValidPrice = activeReg === 'br' ? 45000 : (window.STATE?.market?.monetary?.max_valid_hardware_price || 45000);
  const cashKeywords = ['por r$', 'valor', '💵', '💰', 'pix', 'à vista', 'a vista', '🔥', 'no app'];

  for (const line of lines) {
    const low = line.toLowerCase();
    if (!couponInfo && ['cupom', '🎟', '🏷', 'resgate', 'resgatem', 'moedas', 'coupon', 'code:'].some(k => low.includes(k))) {
      const cleaned = line.replace(/https?:\/\/\S+/g, '').replace(/^[\s\-•🎟️🏷️💵🔥📝*]+|[\s\-•🎟️🏷️💵🔥📝*]+$/g, '');
      if (cleaned.length >= 4) {
        couponInfo = cleaned;
        requiresCoupon = true;
      }
    }
    let m;
    priceRe.lastIndex = 0;
    while ((m = priceRe.exec(line)) !== null) {
      const val = parsePriceClient(m[1]);
      if (val < minValidPrice || val > maxValidPrice) continue;
      const start = m.index;
      const end = start + m[0].length;
      const before = line.slice(Math.max(0, start - 25), start).toLowerCase();
      const after = line.slice(end, Math.min(line.length, end + 25)).toLowerCase();
      if (/\b(off|desconto|discount)\b/.test(after) || /\b(cupom\s*de|desconto\s*de|resgate|resgatem|abatimento|save)\b/.test(before)) {
        if (!detectedDiscountBRL || val > detectedDiscountBRL) detectedDiscountBRL = Math.max(detectedDiscountBRL, val);
        requiresCoupon = true;
        continue;
      }
      if (/\d+\s*x\s*(?:de\s*)?$/.test(before)) continue;
      let prio = 1;
      if (cashKeywords.some(k => low.includes(k))) prio = 3;
      else if (low.includes('parcelado') || low.includes('12x') || low.includes('10x') || low.includes('cartão')) prio = 0;
      candidates.push([prio, val]);
    }
  }
  if (!candidates.length) return { price: null, rawPrice: null, discountApplied: 0, couponCode, couponInfo, requiresCoupon };
  const maxPrio = Math.max(...candidates.map(c => c[0]));
  const bestVals = candidates.filter(c => c[0] === maxPrio).map(c => c[1]);
  const basePrice = Math.min(...bestVals);
  const maxBasePrice = Math.max(...bestVals);

  // CRITICAL BRAZIL RULE: Never double-discount!
  // In Brazilian Telegram channels (@peperaiohardware, @iskandarsouza, @ofertasadrenaline, @benchpromos),
  // the announced cash/Pix price (e.g. "💰 R$ 1.644 ... Resgatem o cupom de R$ 100 OFF") IS ALREADY the final price with the coupon!
  const finalPrice = basePrice;
  let discountApplied = 0;
  let rawPrice = basePrice;

  if (maxBasePrice > basePrice * 1.02 && maxBasePrice < basePrice * 1.45) {
    rawPrice = maxBasePrice;
    discountApplied = Math.round((maxBasePrice - basePrice) * 100) / 100;
  } else if (detectedDiscountBRL > 0 && detectedDiscountBRL < basePrice * 0.45) {
    discountApplied = detectedDiscountBRL;
    rawPrice = Math.round((basePrice + detectedDiscountBRL) * 100) / 100;
  } else if (detectedDiscountPct > 0) {
    rawPrice = Math.round((basePrice / Math.max(0.5, 1.0 - detectedDiscountPct / 100.0)) * 100) / 100;
    discountApplied = Math.round((rawPrice - basePrice) * 100) / 100;
  }

  const isConditionalVoucher = /\b(no\s*app|pelo\s*app|aplicativo|moedas|live|resgate|resgatem|exclusivo\s*app)\b/i.test(fullText);

  return {
    price: Math.round(finalPrice * 100) / 100,
    rawPrice: Math.round(rawPrice * 100) / 100,
    discountApplied,
    couponCode,
    couponInfo,
    isConditionalVoucher,
    requiresCoupon: Boolean(requiresCoupon || couponCode || couponInfo || discountApplied > 0 || isConditionalVoucher)
  };
}

function matchLaptopCatalogClient(headText) {
  const laptops = (DB && DB.laptops) || [];
  if (!laptops.length || CLIENT_LAPTOP_ACCESSORY_RE.test(headText || '')) return null;

  const low = (headText || '').toLowerCase();
  const mGpu = low.match(/\b(rtx\s*(?:5080|5070\s*ti|5070|5060|5050|4080|4070|4060|4050|3060|3050|2050)|gtx\s*1650)\b/);
  const txtGpu = mGpu ? mGpu[1].replace(/\s+/g, ' ').trim() : '';
  const mCpu = low.match(/\b(i[3579][-\s]*\d{4,5}[a-z]*|ultra\s*[x579][-\s]*\d{3}[a-z]*|ryzen\s*[3579][-\s]*\d{4}[a-z]*|m[1-5](?:\s*(?:pro|max))?)\b/);
  const txtCpu = mCpu ? mCpu[1].replace(/[-\s]+/g, '').toLowerCase() : '';
  const mRam = low.match(/\b(8|16|24|32)\s*gb\b/);
  const txtRam = mRam ? parseInt(mRam[1], 10) : 0;

  let bestScore = 0;
  let bestItem = null;
  for (const lap of laptops) {
    const lName = (lap.name || '').toLowerCase();
    const lSlug = (lap.slug || '').toLowerCase();
    const lBrand = (lap.brand || '').toLowerCase();
    const lCpu = (lap.cpu_name || '').toLowerCase().replace(/[-\s]+/g, '');
    const lGpu = (lap.gpu_name || '').toLowerCase().replace(/\s+/g, ' ');
    let score = 0;

    if (lBrand && low.includes(lBrand)) score += 18;
    else if (lBrand) score -= 12;

    const lineKws = ['macbook pro', 'macbook air', 'galaxy book6', 'galaxy book4', 'vivobook go', 'vivobook', 'zenbook', 'ideapad slim', 'ideapad', 'loq-e', 'loq', 'nitro v16', 'nitro v15', 'nitro', 'tuf gaming', 'predator helios', 'alienware', 'inspiron', 'aspire go', 'yoga', 'v14', 'g15'];
    for (const kw of lineKws) {
      if (low.includes(kw)) {
        if (lName.includes(kw) || lSlug.includes(kw)) score += 30;
        else score -= 10;
      }
    }

    const skuMatches = low.match(/\b([a-z0-9]{6,14})\b/g) || [];
    for (const s of skuMatches) {
      if (/[0-9]/.test(s) && /[a-z]/.test(s) && lName.includes(s)) score += 45;
    }

    if (txtGpu) {
      if (lGpu.includes(txtGpu)) score += 36;
      else score -= 55;
    } else if (lGpu.includes('rtx ') || lGpu.includes('gtx ')) {
      score -= 22;
    }

    if (txtCpu) {
      if (lCpu.includes(txtCpu) || lName.replace(/[-\s]+/g, '').includes(txtCpu)) score += 26;
      else score -= 22;
    }

    if (txtRam && lap.ram_gb === txtRam) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestItem = lap;
    }
  }
  return (bestItem && bestScore >= 45) ? { kind: 'laptop', item: bestItem } : null;
}

const CLIENT_MOBO_CHIPSET_SOCKET = {
  h610: 'LGA1700', b660: 'LGA1700', b760: 'LGA1700', z690: 'LGA1700', z790: 'LGA1700',
  h810: 'LGA1851', b860: 'LGA1851', z890: 'LGA1851',
  a520: 'AM4', b450: 'AM4', b550: 'AM4', x570: 'AM4',
  a620: 'AM5', b650: 'AM5', b840: 'AM5', b850: 'AM5', x670: 'AM5', x870: 'AM5'
};

function extractMoboSpecsClient(text) {
  const t = text || '';
  const low = t.toLowerCase();
  const mChip = low.match(/\b((?:h610|b660|b760|z690|z790|h810|b860|z890|a520|b450|b550|x570|a620|b650|b840|b850|x670|x870)[a-z0-9\-]*)\b/i);
  const chipset = mChip ? mChip[1].toUpperCase() : '';
  const chipBase = chipset.slice(0, 4).toLowerCase();

  let socket = '';
  if (/\blga\s*1700\b/i.test(low)) socket = 'LGA1700';
  else if (/\blga\s*1851\b/i.test(low)) socket = 'LGA1851';
  else if (/\bam5\b/i.test(low)) socket = 'AM5';
  else if (/\bam4\b/i.test(low)) socket = 'AM4';
  else if (chipBase && CLIENT_MOBO_CHIPSET_SOCKET[chipBase]) socket = CLIENT_MOBO_CHIPSET_SOCKET[chipBase];

  let memory_type = '';
  if (/\bddr4\b|\bd4\b/i.test(low)) memory_type = 'DDR4';
  else if (/\bddr5\b|\bd5\b/i.test(low)) memory_type = 'DDR5';
  else if (socket === 'AM4') memory_type = 'DDR4';
  else if (socket === 'AM5' || socket === 'LGA1851') memory_type = 'DDR5';

  let brand = '';
  for (const b of ['ASUS', 'MSI', 'Gigabyte', 'ASRock', 'Biostar', 'Maxsun', 'Colorful', 'SuperFrame', 'Pichau', 'Mancer', 'Husky']) {
    if (low.includes(b.toLowerCase())) { brand = b; break; }
  }
  return { brand, socket, memory_type, chipset };
}

function matchMoboCatalogClient(text) {
  const t = text || '';
  const low = t.toLowerCase();
  if (/\bkit\s*upgrade\b|placa[\s-]*m[ãa]e[\s\S]{0,80}?\+\s*(?:processador|ryzen|core\s*i[3579]|mem[óo]ria)|\bkit\s*(?:com\s+)?placa[\s-]*m[ãa]e\b/i.test(low)) {
    return null;
  }
  const hasMoboWord = /placa[\s-]*m[ãa]e|motherboard|\bmobo\b/i.test(low);
  const specs = extractMoboSpecsClient(t);
  const hasNonMoboPrimary = /^\s*[^a-z0-9]*(?:processador|cpu|placa\s*de\s*v[íi]deo|mem[óo]ria)\b|\b(?:rtx|rx\s*\d|radeon|geforce|ryzen|core\s*i[3579])\b/i.test(low);
  if (!hasMoboWord && (!specs.chipset || hasNonMoboPrimary)) return null;

  const mobos = ((typeof DB !== 'undefined' && DB.motherboards) || []).filter(m => m && m.slug !== 'x99-p4-lga2011');
  const chipBase = (specs.chipset || '').slice(0, 4).toLowerCase();
  let bestItem = null;
  let bestScore = 0;

  for (const m of mobos) {
    const mSock = m.socket || '';
    const mMem = (m.memory_type || '').toUpperCase();
    if (specs.socket && mSock && mSock !== specs.socket) continue;
    if (specs.memory_type && mMem && mMem !== specs.memory_type) continue;
    if (specs.brand && m.brand && specs.brand.toLowerCase() !== String(m.brand).toLowerCase()) continue;

    const mName = (m.name || '').toLowerCase();
    const mSlug = (m.slug || '').toLowerCase();
    let score = 0;
    if (specs.socket && mSock === specs.socket) score += 10;
    if (specs.memory_type && mMem === specs.memory_type) score += 10;
    if (chipBase && (mName.includes(chipBase) || mSlug.includes(chipBase))) score += 35;
    if (specs.brand && `${(m.brand || '').toLowerCase()} ${mName}`.includes(specs.brand.toLowerCase())) score += 20;
    const tokens = mSlug.match(/[a-z0-9]{3,}/g) || [];
    for (const tok of tokens) {
      if (!['pro', 'ddr4', 'ddr5', 'wifi', 'plus', 'gaming'].includes(tok) && low.includes(tok)) score += 12;
    }
    if (score > bestScore) {
      bestScore = score;
      bestItem = m;
    }
  }

  if (bestItem && bestScore >= 35) {
    return { kind: 'mobo', item: { ...bestItem, _chipset: specs.chipset || '' } };
  }
  if (!hasMoboWord && !specs.chipset) return null;

  const pool = mobos
    .filter(m => (m.price_brl || 0) > 0 && (!specs.socket || m.socket === specs.socket) && (!specs.memory_type || (m.memory_type || '').toUpperCase() === specs.memory_type))
    .map(m => m.price_brl)
    .sort((a, b) => a - b);
  const medPrice = pool.length ? pool[Math.floor(pool.length / 2)] : 0;
  const label = ['Placa-Mãe', specs.brand, specs.chipset || specs.socket, specs.memory_type].filter(Boolean).join(' ');
  return {
    kind: 'mobo',
    item: {
      slug: `mobo-${(specs.socket || 'any').toLowerCase()}-${(specs.memory_type || 'any').toLowerCase()}`,
      name: label,
      brand: specs.brand,
      socket: specs.socket,
      memory_type: specs.memory_type,
      chipset: specs.chipset,
      price_brl: medPrice
    }
  };
}

function extractPsuSpecsClient(text) {
  const low = (text || '').toLowerCase();
  const mW = low.match(/\b([4-9]\d0|1[0-6]\d0)\s*w\b/);
  const watts = mW ? parseInt(mW[1], 10) : 0;

  let modularity = 'Non-Modular';
  if (/semi[\s-]*modular/i.test(low)) modularity = 'Semi-Modular';
  else if (/(?:full[\s-]*modular|\bmodular\b)/i.test(low) && !low.includes('não modular')) modularity = 'Modular';

  let cert = '';
  if (/80\s*(?:plus|\+)\s*platinum/i.test(low)) cert = '80 Plus Platinum';
  else if (/80\s*(?:plus|\+)\s*gold/i.test(low)) cert = '80 Plus Gold';
  else if (/80\s*(?:plus|\+)\s*bronze/i.test(low)) cert = '80 Plus Bronze';
  else if (/80\s*(?:plus|\+)\s*(?:white|standard)/i.test(low)) cert = '80 Plus White';

  let brand = '';
  for (const b of ['Corsair', 'MSI', 'XPG', 'Cooler Master', 'Seasonic', 'EVGA', 'Gigabyte', 'ASUS', 'Thermaltake', 'Gamemax', 'Pichau', 'Mancer', 'SuperFrame', 'Redragon', 'Duex', 'Rise Mode', 'DeepCool']) {
    if (low.includes(b.toLowerCase())) { brand = b; break; }
  }
  return { brand, watts, modularity, cert };
}

function matchPsuCatalogClient(text) {
  const low = (text || '').toLowerCase();
  if (/fonte\s*(?:para|p\/|de)\s*(?:notebook|monitor|celular|led|cftv|xbox|ps[45]|carregador)|\bnobreak\b|\bestabilizador\b/i.test(low)) return null;
  if (!/\bfonte\b/i.test(low)) return null;
  const specs = extractPsuSpecsClient(text);
  if (!specs.watts) return null;

  const psus = (typeof DB !== 'undefined' && DB.psus) || [];
  let bestItem = null;
  let bestScore = 0;
  for (const ps of psus) {
    if (Number(ps.watts || 0) !== specs.watts) continue;
    if (specs.brand && ps.brand && specs.brand.toLowerCase() !== String(ps.brand).toLowerCase()) continue;
    const psName = (ps.name || '').toLowerCase();
    const psSlug = (ps.slug || '').toLowerCase();
    let score = 15;
    if (specs.brand && `${(ps.brand || '').toLowerCase()} ${psName}`.includes(specs.brand.toLowerCase())) score += 25;
    if (specs.modularity && ps.modularity === specs.modularity) score += 10;
    const tokens = psSlug.match(/[a-z0-9]{3,}/g) || [];
    for (const tok of tokens) {
      if (tok !== `${specs.watts}w` && low.includes(tok)) score += 15;
    }
    if (score > bestScore) {
      bestScore = score;
      bestItem = ps;
    }
  }
  if (bestItem && bestScore >= 30) {
    return { kind: 'psu', item: bestItem };
  }
  const pool = psus.filter(p => (p.price_brl || 0) > 0 && Number(p.watts || 0) === specs.watts).map(p => p.price_brl).sort((a, b) => a - b);
  const medPrice = pool.length ? pool[Math.floor(pool.length / 2)] : 0;
  return {
    kind: 'psu',
    item: {
      slug: `psu-${specs.watts}w`,
      name: ['Fonte', specs.brand, `${specs.watts}W`, specs.cert].filter(Boolean).join(' '),
      brand: specs.brand,
      watts: specs.watts,
      modularity: specs.modularity,
      certs: specs.cert ? [specs.cert] : [],
      price_brl: medPrice
    }
  };
}

function extractDealSpecsClient(deal, catItem) {
  const kind = (deal?.matched_kind || 'gpu').toLowerCase();
  const cat = catItem || {};
  const existing = (deal && deal.item_specs && typeof deal.item_specs === 'object') ? { ...deal.item_specs } : {};
  const txt = `${deal?.title || ''} ${deal?.head_text || ''} ${cat.name || ''}`.trim();

  if (kind === 'gpu') {
    let brand = existing.brand || cat.brand || '';
    if (!brand) {
      if (/\b(?:rtx|geforce)\b/i.test(txt)) brand = 'NVIDIA';
      else if (/\b(?:rx\s*\d|radeon)\b/i.test(txt)) brand = 'AMD';
      else if (/\barc\b/i.test(txt)) brand = 'Intel';
    }
    return { brand, vram_gb: Number(existing.vram_gb || cat.vram_gb || 0) };
  }
  if (kind === 'cpu') {
    const low = txt.toLowerCase();
    const brand = existing.brand || (/ryzen|threadripper|athlon/i.test(low) ? 'AMD' : (/core|xeon|intel/i.test(low) ? 'Intel' : ''));
    return { brand, socket: existing.socket || cat.socket || '', ddr: existing.ddr || cat.ddr || '' };
  }
  if (kind === 'ram') {
    let memory_type = (existing.memory_type || cat.memory_type || '').toUpperCase();
    if (!memory_type) {
      const m = txt.match(/\b(ddr4|ddr5)\b/i);
      if (m) memory_type = m[1].toUpperCase();
    }
    let capacity_gb = Number(existing.capacity_gb || cat.capacity_gb || 0);
    if (!capacity_gb) {
      const mc = txt.match(/\b(8|16|32|48|64|96|128)\s*gb\b/i);
      if (mc) capacity_gb = parseInt(mc[1], 10);
    }
    let speed_mtps = Number(existing.speed_mtps || cat.speed_mtps || 0);
    if (!speed_mtps) {
      const ms = txt.match(/\b([2-9]\d{3})\s*(?:mhz|mt\/?s)?\b/i);
      if (ms) speed_mtps = parseInt(ms[1], 10);
    }
    return { memory_type, capacity_gb, speed_mtps };
  }
  if (kind === 'mobo') {
    const postTxt = `${deal?.title || ''} ${deal?.head_text || ''}`.trim();
    const isDirect = Boolean(deal && (deal._isStoreDirect || deal.channel_id === 'catalogo_lojas'));
    const parsedPost = extractMoboSpecsClient(postTxt || txt);
    const sock = (parsedPost.socket || existing.socket || cat.socket || '').toUpperCase();
    let mem = '';
    let memAmbiguous = false;
    if (isDirect) {
      mem = (existing.memory_type || cat.memory_type || parsedPost.memory_type || '').toUpperCase();
    } else if (sock === 'AM4' || sock === 'AM5' || sock === 'LGA1851' || parsedPost.memory_type) {
      mem = (parsedPost.memory_type || existing.memory_type || cat.memory_type || '').toUpperCase();
    } else if (existing.memory_type && !existing.memory_type_ambiguous) {
      mem = String(existing.memory_type).toUpperCase();
    } else {
      mem = '';
      memAmbiguous = true;
    }
    return {
      brand: existing.brand || cat.brand || parsedPost.brand || '',
      socket: sock,
      memory_type: mem,
      memory_type_ambiguous: memAmbiguous,
      chipset: existing.chipset || cat._chipset || cat.chipset || parsedPost.chipset || ''
    };
  }
  if (kind === 'psu') {
    const parsed = extractPsuSpecsClient(txt);
    const certs = Array.isArray(cat.certs) ? cat.certs : [];
    const rawMod = String(existing.modularity || cat.modularity || '');
    const mod = (!rawMod || rawMod.startsWith('$')) ? parsed.modularity : rawMod;
    return {
      brand: existing.brand || cat.brand || parsed.brand || '',
      watts: Number(existing.watts || cat.watts || parsed.watts || 0),
      modularity: mod || 'Non-Modular',
      cert: existing.cert || certs[0] || parsed.cert || ''
    };
  }
  if (kind === 'laptop') {
    return {
      brand: existing.brand || cat.brand || '',
      ram_gb: Number(existing.ram_gb || cat.ram_gb || 0),
      gpu_is_dedicated: Boolean(existing.gpu_is_dedicated || cat.gpu_is_dedicated)
    };
  }
  if (kind === 'smartphone') {
    let brand = String(existing.brand || deal?.brand || cat.brand || '').trim();
    if (!brand) {
      if (/\b(iphone|apple)\b/i.test(txt)) brand = 'Apple';
      else if (/\b(samsung|galaxy)\b/i.test(txt)) brand = 'Samsung';
      else if (/\b(xiaomi|poco|redmi)\b/i.test(txt)) brand = 'Xiaomi';
      else if (/\b(motorola|moto\s*[ge]\d+|edge\s*[56]0)\b/i.test(txt)) brand = 'Motorola';
      else if (/\brealme\b/i.test(txt)) brand = 'Realme';
    }
    return {
      brand,
      ram_gb: Number(existing.ram_gb || cat.ram_gb || 0),
      storage_gb: Number(existing.storage_gb || cat.storage_gb || 0),
      name: String(cat.name || deal?.matched_name || deal?.title || '')
    };
  }
  return existing;
}

const _CLIENT_PHONE_NOISE_TOKENS = new Set([
  'celular', 'smartphone', 'tela', 'dual', 'chip', 'sim', 'esim', '5g', '4g',
  'nfc', 'ram', 'gb', 'tb', 'de', 'com', 'para', 'sem', 'em', 'no', 'na',
  'preto', 'azul', 'branco', 'verde', 'prata', 'titanio', 'grafite', 'cinza',
  'rosa', 'dourado', 'roxo', 'laranja', 'amarelo', 'vermelho', 'black', 'white'
]);
const _CLIENT_PHONE_TIER_WORDS = ['ultra', 'pro', 'max', 'plus', 'fe', 'lite', 'neo', 'fusion'];

function _normalizePhoneStrClient(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function _normalizePhoneTokensClient(text) {
  const low = _normalizePhoneStrClient(text);
  const out = [];
  for (const tok of (low.match(/[a-z0-9]+/g) || [])) {
    if (_CLIENT_PHONE_NOISE_TOKENS.has(tok)) continue;
    if (/^(?:64|128|256|512|1024)(?:gb|tb)?$/.test(tok) || /^(?:4|6|8|12|16|24)gb$/.test(tok)) continue;
    out.push(tok);
  }
  return out;
}

function _smartphoneDealMatchesModelClient(deal, catItem, modelEntry) {
  const mSlug = (modelEntry && typeof modelEntry === 'object' ? String(modelEntry.slug || '') : '').trim().toLowerCase();
  const mName = (modelEntry && typeof modelEntry === 'object' ? String(modelEntry.name || '') : String(modelEntry || '')).trim();
  if (mSlug && String(deal?.matched_slug || '').trim().toLowerCase() === mSlug) return true;

  const targetTokens = _normalizePhoneTokensClient(mName || mSlug.replace(/-/g, ' '));
  if (!targetTokens.length) return false;

  const titleRaw = String(deal?.title || '');
  const matchedRaw = String(deal?.matched_name || catItem?.name || '');
  const dealTokenSet = new Set(_normalizePhoneTokensClient(`${titleRaw} ${deal?.head_text || ''} ${matchedRaw}`));

  const brandWords = new Set(['samsung', 'apple', 'xiaomi', 'motorola', 'realme']);
  const coreTarget = targetTokens.filter(t => !brandWords.has(t));
  const checkTokens = coreTarget.length ? coreTarget : targetTokens;
  if (!checkTokens.every(t => dealTokenSet.has(t))) return false;

  const dealTitleLow = _normalizePhoneStrClient(titleRaw);
  const targetSet = new Set(targetTokens);
  for (const tw of _CLIENT_PHONE_TIER_WORDS) {
    if (new RegExp(`\\b${tw}\\b`).test(dealTitleLow) && !targetSet.has(tw)) {
      return false;
    }
  }
  return true;
}

function matchCatalogItemClient(headText) {
  if (CLIENT_LAPTOP_CLUE_RE.test(headText || '') && !CLIENT_LAPTOP_ACCESSORY_RE.test(headText || '')) {
    return matchLaptopCatalogClient(headText);
  }
  const hasComp = /\b(placa\s*de\s*v[íi]deo|gpu|rtx|geforce|radeon|ryzen|core\s*i[3579]|ddr[45]|mem[óo]ria\s*ram|placa[\s-]*m[ãa]e|motherboard|mobo|fonte)\b/i.test(headText || '');
  if (!hasComp && CLIENT_EXCLUDE_SYSTEM_RE.test(headText || '')) return null;

  const isExplicitMobo = /placa[\s-]*m[ãa]e|motherboard|\bmobo\b/i.test(headText || '') && !/\bkit\s*upgrade\b|\+\s*(?:processador|ryzen|core\s*i)/i.test(headText || '');
  if (isExplicitMobo) {
    const mHit = matchMoboCatalogClient(headText);
    if (mHit) return mHit;
  }

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
  const mHit = matchMoboCatalogClient(headText);
  if (mHit) return mHit;

  const pHit = matchPsuCatalogClient(headText);
  if (pHit) return pHit;

  for (const [slug, re] of CLIENT_RAM_RULES) {
    if (re.test(headText)) {
      const ram = (DB.rams || []).find(r => r.slug === slug);
      if (ram) return { kind: 'ram', item: ram };
    }
  }
  return null;
}

function _unwrapAffiliateUrlClient(rawUrl) {
  let u = String(rawUrl || '').trim();
  if (!u) return '';
  if (u.includes('&amp;')) u = u.replace(/&amp;/gi, '&');
  for (let i = 0; i < 3; i++) {
    const low = u.toLowerCase();
    if (low.includes('awin1.com') || low.includes('cread.php')) {
      try {
        const parsed = new URL(u);
        const ued = parsed.searchParams.get('ued') || parsed.searchParams.get('p');
        if (ued && ued.startsWith('http')) {
          u = ued.trim();
          continue;
        }
      } catch (_) {}
    }
    break;
  }
  return u;
}

// Parse raw Telegram HTML directly inside the user's browser using native DOMParser
function parseTelegramHTMLInBrowser(rawHtml, chId, chName) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');
  const nodes = doc.querySelectorAll('.tgme_widget_message');
  const results = [];
  const footerExclusions = [
    't.me/', 'bit.ly/canal', 'bit.ly/ofertas', 'bit.ly/ofeertas',
    'nerdofertas.com/t', 'linkmc.click', 'adrena.click/ofertas',
    'alertadaspromobot', 'linktr.ee', 'whatsapp.com', 'chat.whatsapp.com',
    'instagram.com', 'youtube.com', 'tiktok.com', 'discord.gg', 'x.com/', 'twitter.com/'
  ];

  nodes.forEach(node => {
    const postId = node.getAttribute('data-post');
    const txtEl = node.querySelector('.tgme_widget_message_text');
    if (!postId || !txtEl) return;

    const links = [...txtEl.querySelectorAll('a[href^="http"]')]
      .map(a => ({ raw: a.getAttribute('href') || '', url: _unwrapAffiliateUrlClient(a.getAttribute('href')) }))
      .filter(({ raw, url }) => {
        const rl = raw.toLowerCase();
        const ul = url.toLowerCase();
        return url && !footerExclusions.some(x => rl.includes(x) || ul.includes(x));
      });

    const clone = txtEl.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    const lines = (clone.textContent || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && l !== '⠀');
    if (!lines.length) return;

    const timeEl = node.querySelector('time[datetime]');
    const isoDt = timeEl ? timeEl.getAttribute('datetime') : '';

    let imageUrl = null;
    const photoEl = node.querySelector('.tgme_widget_message_photo_wrap');
    if (photoEl) {
      const bg = photoEl.style.backgroundImage || photoEl.getAttribute('style') || '';
      const mBg = bg.match(/url\(['"]?(https?:\/\/[^'")]+)['"]?\)/i);
      if (mBg) imageUrl = mBg[1];
    }

    const titleCand = lines.slice(0, 4).find(
      ln => ln.replace(/[^a-zA-Z0-9]/g, '').length >= 6 && !/^(baixa|baixou|parcelado|cupom|oferta|promo|#)/i.test(ln.replace(/^[ ⭐️🔥🚨⚡]+/, ''))
    );
    const title = (titleCand || lines[0]).replace(/^[ ⭐️🔥🚨⚡🏹]+/, '').slice(0, 160);
    const { price, rawPrice, discountApplied, couponCode, couponInfo, isConditionalVoucher, requiresCoupon } = extractPriceAndCouponClient(lines);
    if (!price) return;

    const scoreLink = (url, idx) => {
      const ul = url.toLowerCase();
      let s = 0;
      if (['kabum.com.br', 'terabyteshop.com.br', 'pichau.com.br', 'amazon.com.br', 'amzn.to', 'mercadolivre.com.br', 'meli.la', 's.shopee.com.br', 'shopee.com.br', 'magazineluiza.com.br', 'magazinevoce.com.br', 'divulgador.magalu.com', 'gigantec.com.br', 'patoloco.com.br'].some(st => ul.includes(st))) {
        s += 50;
      }
      if (['/produto/', '/dp/', '/mlb', 'benchpromos.com.br', 'seuhardware', 'aoferta.net', 'tidd.ly'].some(pt => ul.includes(pt))) {
        s += 25;
      }
      return s * 100 + idx;
    };
    const rankedUrls = links
      .map(({ url }, idx) => ({ url, score: scoreLink(url, idx) }))
      .sort((a, b) => b.score - a.score)
      .map(x => x.url);
    const buyUrl = rankedUrls.length ? rankedUrls[0] : `https://t.me/${postId}`;
    const uLow = buyUrl.toLowerCase();
    let storeName = 'E-commerce';
    if (uLow.includes('kabum')) storeName = 'KaBuM!';
    else if (uLow.includes('pichau')) storeName = 'Pichau';
    else if (uLow.includes('terabyte')) storeName = 'Terabyte';
    else if (uLow.includes('mercadolivre') || uLow.includes('meli.la')) storeName = 'Mercado Livre';
    else if (uLow.includes('amazon') || uLow.includes('amzn.to')) storeName = 'Amazon BR';
    else if (uLow.includes('shopee')) storeName = 'Shopee';
    else if (uLow.includes('magalu') || uLow.includes('magazine')) storeName = 'Magalu';
    else if (uLow.includes('gigantec')) storeName = 'Gigantec';
    else if (uLow.includes('patoloco')) storeName = 'Pato Loco';
    else if (uLow.includes('aliexpress') || uLow.includes('s.click.ali')) storeName = 'AliExpress';

    results.push({
      post_id: postId,
      channel_id: chId,
      channel_name: chName,
      post_url: `https://t.me/${postId}`,
      timestamp: isoDt,
      title,
      head_text: lines.slice(0, 3).join(' ').slice(0, 260),
      price_brl: price,
      promo_price_brl: price,
      raw_price_brl: rawPrice,
      discount_applied: discountApplied,
      coupon_code: couponCode,
      coupon_info: couponInfo,
      is_conditional_voucher: Boolean(isConditionalVoucher),
      requires_coupon: Boolean(requiresCoupon),
      image_url: imageUrl,
      store_name: storeName,
      buy_url: buyUrl,
      coupon_url: rankedUrls.find(u => u !== buyUrl) || null
    });
  });
  return results;
}

function _applyCouponAndExpiryOverlay(item) {
  if (!item) return item;
  const hbPrice = Number(item.hb_price_brl || 0);
  const couponCode = (item.coupon_code || '').trim().toUpperCase();
  const isCondVoucher = Boolean(item.is_conditional_voucher || /\b(no\s*app|pelo\s*app|aplicativo|moedas|live|resgate|resgatem|exclusivo\s*app)\b/i.test((item.head_text || '') + ' ' + (item.raw_text || '')));
  item.is_conditional_voucher = isCondVoucher;
  const reqCoupon = Boolean(item.requires_coupon || couponCode || item.coupon_info || item.discount_applied > 0 || isCondVoucher);
  item.requires_coupon = reqCoupon;
  item.promo_price_brl = item.promo_price_brl || item.price_brl;

  const pId = item.post_id || '';
  const pIdLower = pId.toLowerCase();
  const buyUrl = item.buy_url || '';
  const dealsMap = (PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.deals) || {};
  const couponsMap = (PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.coupons) || {};
  const cStatus = couponCode ? couponsMap[couponCode] : null;
  const activeReg = getActiveRegionId();
  const rawDStatus = dealsMap[pId] || dealsMap[pIdLower] || (buyUrl ? dealsMap[buyUrl] : null);
  const isBrStatusLeak = activeReg !== 'br' && rawDStatus && (
    /\.br\b|kabum|terabyte|pichau|magalu|performancesolutions|performance-solutions|zoom\.com\.br|mercadolivre/i.test(
      `${rawDStatus.final_url || ''} ${rawDStatus.store_name || ''}`
    )
  );
  const dStatus = isBrStatusLeak ? null : rawDStatus;

  if (dStatus) {
    if (!item._isStoreDirect && dStatus.store_name && dStatus.store_name !== 'E-commerce' && dStatus.store_name !== 'Loja') {
      item.store_name = dStatus.store_name;
    }
    if (dStatus.live_price) {
      item.live_store_price_brl = dStatus.live_price;
    }
    item.stock_verified = Boolean(dStatus.stock_verified);
    item.deal_status_reason = dStatus.reason || item.deal_status_reason || '';

    if (dStatus.status === 'expired' || dStatus.status === 'out_of_stock') {
      item.is_expired = true;
      item.deal_status = dStatus.status;
    } else if (dStatus.status === 'unverified_coupon') {
      item.is_expired = false;
      item.deal_status = 'unverified_coupon';
    } else if (dStatus.status === 'active') {
      item.is_expired = false;
      item.deal_status = 'active';
    } else {
      item.is_expired = Boolean(!item._isStoreDirect && (item.age_hours || 0) > 8);
      item.deal_status = item.is_expired ? 'expired' : 'untested';
    }
  } else if (!item._isStoreDirect && (item.age_hours || 0) > 8) {
    item.is_expired = true;
    item.deal_status = 'expired';
    item.stock_verified = false;
    item.deal_status_reason = `Oferta antiga (${item.age_hours}h atrás) sem confirmação de estoque ativo`;
  } else if (!item.deal_status) {
    item.is_expired = Boolean(item.is_expired);
    item.deal_status = item._isStoreDirect ? 'active' : (reqCoupon ? 'unverified_coupon' : 'untested');
    item.stock_verified = Boolean(item._isStoreDirect);
  }

  if (cStatus && cStatus.status === 'expired') {
    item.is_coupon_expired = true;
    item.is_expired = true;
    if (item.deal_status !== 'out_of_stock') item.deal_status = 'expired';
    item.coupon_status = 'expired';
    item.coupon_status_reason = cStatus.reason;
    if (!item.coupon_discount_revoked) {
      if (item.live_store_price_brl && item.live_store_price_brl > item.price_brl) {
        item.price_brl = item.live_store_price_brl;
        item.coupon_discount_revoked = true;
      } else if (item.raw_price_brl && item.raw_price_brl > item.price_brl) {
        item.price_brl = item.raw_price_brl;
        item.coupon_discount_revoked = true;
      } else if (item.discount_applied > 0) {
        item.price_brl = Math.round((item.price_brl + item.discount_applied) * 100) / 100;
        item.coupon_discount_revoked = true;
      }
    }
    if (hbPrice > 0) {
      item.savings_vs_hb_brl = Math.round((hbPrice - item.price_brl) * 100) / 100;
    }
  } else if (cStatus && cStatus.status === 'verified') {
    item.is_coupon_expired = false;
    item.coupon_status = 'verified';
    item.coupon_status_reason = cStatus.reason || '';
  } else if (dStatus && dStatus.coupon_status) {
    item.coupon_status = dStatus.coupon_status;
    item.is_coupon_expired = dStatus.coupon_status === 'expired';
    if (item.is_coupon_expired) {
      item.is_expired = true;
      if (item.deal_status !== 'out_of_stock') item.deal_status = 'expired';
    }
  } else if (!item.coupon_status) {
    item.is_coupon_expired = false;
    item.coupon_status = reqCoupon ? 'unverified' : 'none';
  }
  return item;
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
    const local = JSON.parse(localStorage.getItem(getCouponStatusCacheKey()) || '{}');
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
    localStorage.setItem(getCouponStatusCacheKey(), JSON.stringify(PROMO_STATE.couponStatus));
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
      if (m.kind === 'mobo' && item.price_brl < 220) return;
      if (m.kind === 'psu' && item.price_brl < 110) return;
      const hbPrice = m.item._hbPrice || m.item.price_brl || 0;
      if (hbPrice > 0 && (item.price_brl < hbPrice * 0.45 || item.price_brl > hbPrice * 1.35)) return;
      item.matched_kind = m.kind;
      item.matched_slug = m.item.slug;
      item.matched_name = m.item.name;
      item.hb_price_brl = hbPrice;
      item.savings_vs_hb_brl = hbPrice > 0 ? Math.round((hbPrice - item.price_brl) * 100) / 100 : 0;
      item.item_specs = extractDealSpecsClient(item, m.item);

      _applyCouponAndExpiryOverlay(item);

      matchedDeals.push(item);

      const slug = m.item.slug;
      // CRITICAL POLICY: ONLY STOCK-VERIFIED ACTIVE DEALS (that do NOT depend on unverified coupons) CAN ENTER bestBySlug!
      if (
        !item.is_expired &&
        item.deal_status === 'active' &&
        item.stock_verified === true &&
        !item.is_coupon_expired &&
        (!item.requires_coupon || item.coupon_status === 'verified') &&
        (!item.is_conditional_voucher || item.coupon_status === 'verified') &&
        (hbPrice <= 0 || item.price_brl < hbPrice)
      ) {
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
  trigAvg30d: true,
  avg30dMinPct: 5,
  notifyLogic: 'OR',     // 'OR' | 'AND'
  notifyKind: 'all',     // 'all' | 'gpu' | 'cpu_gpu'
  notifyCategories: {
    gpu: true,
    cpu: true,
    psu: true,
    mobo: true,
    ram: true,
    laptop: false,
    smartphone: false,
    peripheral: false,
    air_fryer: false,
    diapers: false,
    misc_custom: false
  },
  specFilters: {
    mobo: {},
    ram: {},
    cpu: {},
    gpu: {},
    psu: {},
    laptop: {},
    smartphone: {},
    peripheral: {},
    air_fryer: {},
    diapers: {},
    misc_custom: {}
  },
  notifyWinToast: true,
  notifyWinPopup: false,
  notifyWebToast: true,
  notifySound: true,
  notifyPhone: false,
  phoneService: 'ntfy', // 'ntfy' | 'whatsapp' | 'email'
  ntfyTopic: 'alerta_deal_jz265i',
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

function loadPersistedNotifiedKeys() {
  try {
    const key = getNotifiedStorageKey();
    const local = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(local)) local.forEach(k => PROMO_STATE.notifiedKeys.add(k));

    const sess = JSON.parse(sessionStorage.getItem(key) || '[]');
    if (Array.isArray(sess)) sess.forEach(k => PROMO_STATE.notifiedKeys.add(k));
  } catch (_) {}
}

function persistNotifiedKeys() {
  try {
    const key = getNotifiedStorageKey();
    const list = [...PROMO_STATE.notifiedKeys].slice(-400);
    localStorage.setItem(key, JSON.stringify(list));
    sessionStorage.setItem(key, JSON.stringify(list.slice(-100)));
  } catch (_) {}
}

async function syncNotifiedHistoryFromServer() {
  try {
    const regId = getActiveRegionId();
    const staticFile = regId === 'eu'
      ? 'data/notified_history_eu.json'
      : (regId === 'mx' ? 'data/notified_history_mx.json' : 'data/notified_history.json');
    const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    const urls = isStatic
      ? [
          `https://raw.githubusercontent.com/Cktto12/pc-part-analyzer-br/main/${staticFile}?t=` + Date.now(),
          `${staticFile}?t=` + Date.now()
        ]
      : [`${staticFile}?t=` + Date.now()];
    for (const u of urls) {
      try {
        const res = await fetch(u, { cache: 'no-store' });
        if (res.ok) {
          const hist = await res.json();
          if (hist && typeof hist === 'object') {
            Object.keys(hist).forEach(k => PROMO_STATE.notifiedKeys.add(k));
            persistNotifiedKeys();
            break;
          }
        }
      } catch (_) {}
    }
  } catch (_) {}
}

async function syncCouponStatusFromServer() {
  try {
    const regId = getActiveRegionId();
    const staticFile = regId === 'eu'
      ? 'data/coupon_status_eu.json'
      : (regId === 'mx' ? 'data/coupon_status_mx.json' : 'data/coupon_status.json');
    const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    let statusObj = null;
    if (!isStatic) {
      try {
        const res = await fetch(`/api/coupon-status?region=${encodeURIComponent(regId)}&t=` + Date.now(), { cache: 'no-store' });
        if (res.ok) {
          const d = await res.json();
          statusObj = d.status || d;
        }
      } catch (_) {}
    }
    if (!statusObj) {
      const urls = isStatic
        ? [
            `https://raw.githubusercontent.com/Cktto12/pc-part-analyzer-br/main/${staticFile}?t=` + Date.now(),
            `${staticFile}?t=` + Date.now()
          ]
        : [`${staticFile}?t=` + Date.now()];
      for (const u of urls) {
        try {
          const resStatic = await fetch(u, { cache: 'no-store' });
          if (resStatic.ok) {
            statusObj = await resStatic.json();
            if (statusObj && typeof statusObj === 'object') break;
          }
        } catch (_) {}
      }
    }
    if (statusObj && typeof statusObj === 'object') {
      if (!PROMO_STATE.couponStatus || PROMO_STATE.couponStatus._region !== regId) {
        PROMO_STATE.couponStatus = { _region: regId, coupons: {}, deals: {} };
      }
      if (!PROMO_STATE.couponStatus.coupons) PROMO_STATE.couponStatus.coupons = {};
      if (!PROMO_STATE.couponStatus.deals) PROMO_STATE.couponStatus.deals = {};
      if (statusObj.coupons) Object.assign(PROMO_STATE.couponStatus.coupons, statusObj.coupons);
      if (statusObj.deals) Object.assign(PROMO_STATE.couponStatus.deals, statusObj.deals);
      try {
        localStorage.setItem(getCouponStatusCacheKey(), JSON.stringify(PROMO_STATE.couponStatus));
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
      'autoSyncEnabled', 'notifyEnabled', 'trigCB', 'trigBF', 'trigHB', 'trigAvg30d',
      'notifyWinToast', 'notifyWinPopup', 'notifyWebToast', 'notifySound', 'notifyPhone', 'ntfyRing'
    ].forEach(k => {
      if (typeof savedCfg[k] === 'boolean') PROMO_STATE[k] = savedCfg[k];
    });
    ['autoSyncMins', 'notifyMinCB', 'hbMinBrl', 'hbMinPct', 'avg30dMinPct', 'emailPort'].forEach(k => {
      if (typeof savedCfg[k] === 'number' && !isNaN(savedCfg[k])) PROMO_STATE[k] = savedCfg[k];
    });
    ['bfMode', 'hbMode', 'notifyLogic', 'notifyKind', 'phoneService', 'ntfyTopic', 'ntfyPriority', 'waNumber', 'waApikey', 'emailHost', 'emailUser', 'emailPass', 'emailRecipient'].forEach(k => {
      if (typeof savedCfg[k] === 'string' && savedCfg[k] !== undefined) PROMO_STATE[k] = savedCfg[k];
    });
    if (savedCfg.notifyCategories && typeof savedCfg.notifyCategories === 'object') {
      PROMO_STATE.notifyCategories = Object.assign(
        {
          gpu: true, cpu: true, psu: true, mobo: true, ram: true,
          laptop: false, smartphone: false, peripheral: false, air_fryer: false, diapers: false, misc_custom: false
        },
        savedCfg.notifyCategories
      );
    }
    if (savedCfg.specFilters && typeof savedCfg.specFilters === 'object') {
      ['mobo', 'ram', 'cpu', 'gpu', 'psu', 'laptop', 'smartphone', 'peripheral', 'air_fryer', 'diapers', 'misc_custom'].forEach(cat => {
        if (savedCfg.specFilters[cat] && typeof savedCfg.specFilters[cat] === 'object') {
          PROMO_STATE.specFilters[cat] = { ...savedCfg.specFilters[cat] };
        }
      });
    }
  }
} catch (_) {}

function _hasActiveSpecFilterForCat(cat) {
  const sf = (PROMO_STATE.specFilters && PROMO_STATE.specFilters[cat]) || {};
  return Object.values(sf).some(v => {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'boolean') return v === true;
    if (typeof v === 'number') return v > 0;
    return Boolean(v && String(v).trim());
  });
}

function _psuCertTierClient(certStr) {
  const low = (certStr || '').toLowerCase();
  if (low.includes('platinum') || low.includes('titanium')) return 3;
  if (low.includes('gold')) return 2;
  if (low.includes('bronze')) return 1;
  return 0;
}

function _findCatalogItemForDeal(deal) {
  if (!deal || !deal.matched_slug || typeof DB === 'undefined') return null;
  const mc = (DB.misc_catalog && typeof DB.misc_catalog === 'object') ? DB.misc_catalog : {};
  const grpMap = {
    gpu: DB.gpus,
    cpu: DB.cpus,
    ram: DB.rams,
    mobo: DB.motherboards,
    psu: DB.psus,
    laptop: DB.laptops,
    smartphone: DB.smartphones,
    peripheral: DB.peripherals,
    air_fryer: mc.air_fryer,
    diapers: mc.diapers
  };
  const k = (deal.matched_kind || 'gpu').toLowerCase();
  const arr = grpMap[k] || mc[k];
  if (Array.isArray(arr)) {
    return arr.find(x => x && x.slug === deal.matched_slug) || null;
  }
  const allMisc = Object.values(mc).flat();
  return allMisc.find(x => x && x.slug === deal.matched_slug) || null;
}

function _matchesAnyKeywordPhraseClient(hayText, kwVal) {
  const phrases = Array.isArray(kwVal)
    ? kwVal.map(x => String(x || '').trim()).filter(Boolean)
    : String(kwVal || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  if (!phrases.length) return true;
  const hayNorm = _normalizePhoneStrClient(hayText || '');
  return phrases.some(phr => {
    const words = _normalizePhoneStrClient(phr).match(/[a-z0-9]+/g) || [];
    return words.length > 0 && words.every(w => hayNorm.includes(w));
  });
}

function _parseAirFryerClient(txt, priceBrl, rawSpecs = null) {
  if (rawSpecs && (rawSpecs.liters || rawSpecs.is_oven !== undefined)) return rawSpecs;
  const low = _normalizePhoneStrClient(txt || '');
  const brands = ['Philips Walita', 'Walita', 'Electrolux', 'Mondial', 'Oster', 'Britania', 'Arno', 'Midea', 'Philco', 'Cadence', 'Ninja', 'Gaabor', 'Xiaomi'];
  let brand = '';
  for (const b of brands) {
    if (low.includes(b.toLowerCase())) {
      brand = b === 'Walita' ? 'Philips Walita' : (b === 'Britania' ? 'Britânia' : b);
      break;
    }
  }
  let liters = 0;
  const mL = low.match(/(\d+(?:[.,]\d)?)\s*(?:l\b|litros?)/);
  if (mL) {
    const v = parseFloat(mL[1].replace(',', '.'));
    if (v >= 1.5 && v <= 30) liters = v;
  }
  const isOven = /\boven\b|forno|12\s*l|11\s*l|10\s*l|duplo\s*cesto|dual/.test(low);
  const isDigital = /digital|touch|led|display|wi-?fi/.test(low);
  const ppl = (liters > 0 && priceBrl > 0) ? Math.round((priceBrl / liters) * 100) / 100 : 0;
  return { brand, liters, is_oven: isOven, is_digital: isDigital, price_per_liter: ppl };
}

function _parseDiaperClient(txt, priceBrl, rawSpecs = null) {
  if (rawSpecs && (rawSpecs.price_per_unit || rawSpecs.units)) return rawSpecs;
  const low = _normalizePhoneStrClient(txt || '');
  const brands = ['Pampers', 'Huggies', 'Babysec', 'Pom Pom', 'MamyPoko', 'Cremer', 'loop', 'Personal'];
  let brand = '';
  for (const b of brands) {
    if (low.includes(b.toLowerCase())) {
      brand = b;
      break;
    }
  }
  let size = '';
  const mSz = low.match(/\b(xxxg|xxg|xg|rn|p|m|g)\b/i);
  if (mSz) size = mSz[1].toUpperCase();
  const isPants = /pants|vestir|cal[cç]a|shortinho/.test(low);
  let units = 0;
  const mU = low.match(/(?:com\s*|c\/\s*)?(\d{2,3})\s*(?:unid(?:ades?)?|un\.?|tiras?|fraldas?)\b/);
  if (mU) {
    const u = parseInt(mU[1], 10);
    if (u >= 10 && u <= 600) units = u;
  }
  const ppu = (units > 0 && priceBrl > 0) ? Math.round((priceBrl / units) * 100) / 100 : 0;
  return { brand, size, is_pants: isPants, units, price_per_unit: ppu };
}

const _PERIPH_NOISE_CLIENT = new Set([
  'mouse', 'teclado', 'headset', 'fone', 'ouvido', 'gamer', 'gaming', 'sem',
  'fio', 'wireless', 'bluetooth', 'usb', 'rgb', 'preto', 'branco', 'rosa',
  'azul', 'vermelho', 'cinza', 'mecanico', 'optico', 'magnetico', 'para', 'pc', 'com', 'de', 'e'
]);

function _inferPeriphBrandClient(obj, txtStr) {
  const b = String(obj?.brand || '').trim();
  if (b) return b;
  const low = _normalizePhoneStrClient(txtStr || '');
  for (const cand of ['Logitech', 'Razer', 'HyperX', 'Redragon', 'Corsair', 'SteelSeries', 'JBL', 'Havit', 'Fifine', 'Attack Shark', 'Fallen', 'Keychron', 'Akko', 'Aula', 'Darmoshark', 'Dell', 'Sony', 'Sennheiser']) {
    if (low.includes(cand.toLowerCase())) return cand;
  }
  return '';
}

function _periphDealMatchesModelClient(deal, catItem, modelEntry) {
  const mSlug = String((typeof modelEntry === 'object' ? modelEntry.slug : '') || '').trim().toLowerCase();
  const mName = String((typeof modelEntry === 'object' ? modelEntry.name : modelEntry) || '').trim();
  if (mSlug && String(deal?.matched_slug || '').trim().toLowerCase() === mSlug) return true;
  const rawTokens = _normalizePhoneStrClient(mName || mSlug.replace(/-/g, ' ')).match(/[a-z0-9]+/g) || [];
  const core = rawTokens.filter(t => !_PERIPH_NOISE_CLIENT.has(t) && (t.length >= 2 || /^\d+$/.test(t)));
  const reqTokens = core.length ? core : rawTokens;
  if (!reqTokens.length) return false;
  const combined = `${deal?.title || ''} ${deal?.head_text || ''} ${deal?.matched_name || ''} ${catItem?.name || ''}`;
  const dealSet = new Set(_normalizePhoneStrClient(combined).match(/[a-z0-9]+/g) || []);
  return reqTokens.every(t => dealSet.has(t));
}

function dealMatchesPromoPreferences(deal, catItem = null, opts = {}) {
  if (!deal) return false;
  const rawKind = (deal.matched_kind || deal.misc_category || 'gpu').toLowerCase().trim();
  const knownKinds = new Set(['gpu', 'cpu', 'ram', 'mobo', 'psu', 'laptop', 'smartphone', 'peripheral', 'air_fryer', 'diapers', 'misc_custom']);
  const kind = knownKinds.has(rawKind) ? rawKind : 'misc_custom';
  const cats = PROMO_STATE.notifyCategories || {};
  const catEnabled = cats[kind] !== false;
  if (!opts.ignoreCategoryToggle && !catEnabled) {
    if (
      !(opts.allowLaptopInLaptopCtx && kind === 'laptop') &&
      !(opts.allowSmartphoneInSmartphoneCtx && kind === 'smartphone') &&
      !(opts.allowPeripheralInPeriphCtx && kind === 'peripheral') &&
      !(opts.allowMiscInMiscCtx && (kind === 'air_fryer' || kind === 'diapers' || kind === 'misc_custom'))
    ) {
      return false;
    }
  }

  const sf = (PROMO_STATE.specFilters && PROMO_STATE.specFilters[kind]) || {};
  const maxPrice = Number(sf.max_price || 0);
  if (maxPrice > 0 && Number(deal.price_brl || 0) > maxPrice) return false;

  const resolvedCat = catItem || _findCatalogItemForDeal(deal);
  const specs = extractDealSpecsClient(deal, resolvedCat);
  const txt = `${deal.title || ''} ${deal.head_text || ''} ${(resolvedCat && resolvedCat.name) || ''}`.toLowerCase();
  deal._unverifiedMemType = false;

  if (kind === 'mobo') {
    const reqSockets = Array.isArray(sf.sockets) ? sf.sockets.map(s => String(s).trim().toUpperCase()).filter(Boolean) : [];
    const sock = String(specs.socket || (resolvedCat && resolvedCat.socket) || '').trim().toUpperCase();
    if (reqSockets.length) {
      if (!sock || !reqSockets.includes(sock)) return false;
    }
    const reqMems = Array.isArray(sf.memory_types) ? sf.memory_types.map(m => String(m).trim().toUpperCase()).filter(Boolean) : [];
    if (reqMems.length) {
      const mem = String(specs.memory_type || '').trim().toUpperCase();
      if (mem) {
        if (!reqMems.includes(mem)) return false;
      } else {
        const allowAmbig = sf.allow_ambiguous_mem !== false;
        if (allowAmbig) {
          deal._unverifiedMemType = true;
        } else {
          return false;
        }
      }
    }
    const chipQ = String(sf.chipset_query || '').trim().toLowerCase();
    if (chipQ) {
      const toks = chipQ.split(/[,;\s]+/).map(t => t.trim()).filter(Boolean);
      const hay = `${specs.chipset || ''} ${txt} ${deal.matched_slug || ''}`.toLowerCase();
      if (toks.length && !toks.some(tok => hay.includes(tok))) return false;
    }
  } else if (kind === 'ram') {
    const reqMems = Array.isArray(sf.memory_types) ? sf.memory_types.map(m => String(m).trim().toUpperCase()).filter(Boolean) : [];
    if (reqMems.length) {
      const mem = String(specs.memory_type || '').trim().toUpperCase();
      if (!mem || !reqMems.includes(mem)) return false;
    }
    const minCap = Number(sf.min_capacity_gb || 0);
    if (minCap > 0 && Number(specs.capacity_gb || 0) < minCap) return false;
    const minSpd = Number(sf.min_speed_mtps || 0);
    if (minSpd > 0 && Number(specs.speed_mtps || 0) < minSpd) return false;
  } else if (kind === 'cpu') {
    const reqSockets = Array.isArray(sf.sockets) ? sf.sockets.map(s => String(s).trim().toUpperCase()).filter(Boolean) : [];
    if (reqSockets.length) {
      const sock = String(specs.socket || '').trim().toUpperCase();
      if (!sock || !reqSockets.includes(sock)) return false;
    }
    const reqBrands = Array.isArray(sf.brands) ? sf.brands.map(b => String(b).trim().toLowerCase()).filter(Boolean) : [];
    if (reqBrands.length) {
      const brand = String(specs.brand || '').trim().toLowerCase();
      if (!brand || !reqBrands.includes(brand)) return false;
    }
  } else if (kind === 'gpu') {
    const reqBrands = Array.isArray(sf.brands) ? sf.brands.map(b => String(b).trim().toLowerCase()).filter(Boolean) : [];
    if (reqBrands.length) {
      const brand = String(specs.brand || '').trim().toLowerCase();
      if (!brand || !reqBrands.includes(brand)) return false;
    }
    const minVram = Number(sf.min_vram_gb || 0);
    if (minVram > 0 && Number(specs.vram_gb || 0) < minVram) return false;
  } else if (kind === 'psu') {
    const minW = Number(sf.min_watts || 0);
    if (minW > 0 && Number(specs.watts || 0) < minW) return false;
    const reqMods = Array.isArray(sf.modularity) ? sf.modularity.map(m => String(m).trim().toLowerCase()).filter(Boolean) : [];
    if (reqMods.length) {
      const mod = String(specs.modularity || '').trim().toLowerCase();
      if (!mod || !reqMods.includes(mod)) return false;
    }
    const minCert = String(sf.min_cert || '').trim().toLowerCase();
    if (minCert) {
      const certStr = `${specs.cert || ''} ${txt}`;
      if (_psuCertTierClient(certStr) < _psuCertTierClient(minCert)) return false;
    }
  } else if (kind === 'laptop') {
    const minRam = Number(sf.min_ram_gb || 0);
    if (minRam > 0 && Number(specs.ram_gb || 0) < minRam) return false;
    if (sf.dedicated_gpu_only && !specs.gpu_is_dedicated) return false;
  } else if (kind === 'smartphone') {
    const inferBrand = (obj, txtStr) => {
      const b = String(obj?.brand || '').trim();
      if (b) return b;
      const low = _normalizePhoneStrClient(txtStr || '');
      if (/\b(iphone|apple)\b/.test(low)) return 'Apple';
      if (/\b(samsung|galaxy)\b/.test(low)) return 'Samsung';
      if (/\b(xiaomi|poco|redmi)\b/.test(low)) return 'Xiaomi';
      if (/\b(motorola|moto\s*[ge]\d+|edge\s*[56]0)\b/.test(low)) return 'Motorola';
      if (/\b(google\s*pixel|pixel\s*(?:8|9|10))\b/.test(low)) return 'Google';
      if (/\brealme\b/.test(low)) return 'Realme';
      return '';
    };
    const dealBrand = inferBrand(specs, txt).toLowerCase();
    const reqBrands = Array.isArray(sf.brands) ? sf.brands.map(b => String(b).trim().toLowerCase()).filter(Boolean) : [];
    const reqModels = Array.isArray(sf.models) ? sf.models.filter(m => (m && typeof m === 'object' ? (m.slug || m.name) : String(m || '').trim())) : [];

    if (reqModels.length) {
      const modelBrands = new Set();
      reqModels.forEach(m => {
        const mb = inferBrand(typeof m === 'object' ? m : null, typeof m === 'object' ? m.name : String(m)).toLowerCase();
        if (mb) modelBrands.add(mb);
      });
      const openBrands = reqBrands.filter(b => !modelBrands.has(b));
      const brandOpenHit = Boolean(dealBrand && openBrands.includes(dealBrand));
      const modelHit = reqModels.some(m => _smartphoneDealMatchesModelClient(deal, resolvedCat, m));
      if (!brandOpenHit && !modelHit) return false;
    } else if (reqBrands.length) {
      if (!dealBrand || !reqBrands.includes(dealBrand)) return false;
    }
  } else if (kind === 'peripheral') {
    const reqSubs = Array.isArray(sf.sub_kinds) ? sf.sub_kinds.map(s => String(s).trim().toLowerCase()).filter(Boolean) : [];
    let subK = String(specs.sub_kind || deal.peripheral_kind || resolvedCat?.kind || '').trim().toLowerCase();
    if (!subK) {
      const lt = _normalizePhoneStrClient(txt);
      if (/\b(mouse|superlight|viper|deathadder)\b/.test(lt)) subK = 'mouse';
      else if (/\b(teclado|keyboard|keychron|kumara|fizz)\b/.test(lt)) subK = 'keyboard';
      else if (/\b(headset|fone|cloud\s*(?:ii|iii|stinger|alpha)|blackshark)\b/.test(lt)) subK = 'headset';
    }
    if (reqSubs.length && (!subK || !reqSubs.includes(subK))) return false;
    if (sf.wireless_only) {
      const isWl = Boolean(specs.wireless || deal.is_wireless || resolvedCat?.is_wireless || /\b(sem\s*fio|wireless|lightspeed|2\.4\s*g|bluetooth|tri-?mode|superlight)\b/i.test(txt));
      if (!isWl) return false;
    }
    if (sf.gamer_only) {
      const isGm = Boolean(specs.gamer || deal.is_gamer || /\b(gamer|gaming|hero\s*25k|paw\s*3\d{3}|hall\s*effect|magn[eé]tic|mec[aâ]nic|rgb|superlight|cloud|blackshark|zeus|kumara)\b/i.test(txt));
      if (!isGm) return false;
    }
    const dealBrand = _inferPeriphBrandClient(deal, txt).toLowerCase();
    const reqBrands = Array.isArray(sf.brands) ? sf.brands.map(b => String(b).trim().toLowerCase()).filter(Boolean) : [];
    const reqModels = Array.isArray(sf.models) ? sf.models.filter(m => (m && typeof m === 'object' ? (m.slug || m.name) : String(m || '').trim())) : [];
    if (reqModels.length) {
      const modelBrands = new Set();
      reqModels.forEach(m => {
        const mb = _inferPeriphBrandClient(typeof m === 'object' ? m : null, typeof m === 'object' ? m.name : String(m)).toLowerCase();
        if (mb) modelBrands.add(mb);
      });
      const openBrands = reqBrands.filter(b => !modelBrands.has(b));
      const brandOpenHit = Boolean(dealBrand && openBrands.includes(dealBrand));
      const modelHit = reqModels.some(m => _periphDealMatchesModelClient(deal, resolvedCat, m));
      if (!brandOpenHit && !modelHit) return false;
    } else if (reqBrands.length) {
      if (!dealBrand || !reqBrands.includes(dealBrand)) return false;
    }
  } else if (kind === 'air_fryer') {
    const afSp = _parseAirFryerClient(txt, Number(deal.price_brl || 0), deal.misc_specs || resolvedCat?.specs || specs);
    const reqBrands = Array.isArray(sf.brands) ? sf.brands.map(b => _normalizePhoneStrClient(b)).filter(Boolean) : [];
    if (reqBrands.length) {
      const bVal = _normalizePhoneStrClient(afSp.brand || deal.brand || resolvedCat?.brand || '');
      const tNorm = _normalizePhoneStrClient(txt);
      if (!reqBrands.some(rb => (bVal && bVal.includes(rb)) || tNorm.includes(rb))) return false;
    }
    const fmt = String(sf.format || '').trim().toLowerCase();
    if (fmt === 'oven' && !afSp.is_oven) return false;
    if (fmt === 'cesto' && afSp.is_oven) return false;
    if (sf.digital_only && !afSp.is_digital) return false;
    const minL = Number(sf.min_liters || 0);
    if (minL > 0 && Number(afSp.liters || 0) < minL) return false;
    const maxPpl = Number(sf.max_price_per_liter || 0);
    const ppl = Number(afSp.price_per_liter || (afSp.liters > 0 ? Number(deal.price_brl || 0) / afSp.liters : 0));
    if (maxPpl > 0 && (ppl <= 0 || ppl > maxPpl)) return false;
    if (sf.keyword && !_matchesAnyKeywordPhraseClient(txt, sf.keyword)) return false;
  } else if (kind === 'diapers') {
    const dpSp = _parseDiaperClient(txt, Number(deal.price_brl || 0), deal.misc_specs || resolvedCat?.specs || specs);
    const reqBrands = Array.isArray(sf.brands) ? sf.brands.map(b => _normalizePhoneStrClient(b)).filter(Boolean) : [];
    if (reqBrands.length) {
      const bVal = _normalizePhoneStrClient(dpSp.brand || deal.brand || resolvedCat?.brand || '');
      const tNorm = _normalizePhoneStrClient(txt);
      if (!reqBrands.some(rb => (bVal && bVal.includes(rb)) || tNorm.includes(rb))) return false;
    }
    const reqSizes = Array.isArray(sf.sizes) ? sf.sizes.map(s => String(s).trim().toUpperCase()).filter(Boolean) : [];
    if (reqSizes.length) {
      const sz = String(dpSp.size || '').trim().toUpperCase();
      if (!sz || !reqSizes.includes(sz)) return false;
    }
    const sty = String(sf.style || '').trim().toLowerCase();
    if (sty === 'pants' && !dpSp.is_pants) return false;
    if (sty === 'fita' && dpSp.is_pants) return false;
    const maxPpu = Number(sf.max_price_per_unit || 0);
    const ppu = Number(dpSp.price_per_unit || 0);
    if (maxPpu > 0 && (ppu <= 0 || ppu > maxPpu)) return false;
    if (sf.keyword && !_matchesAnyKeywordPhraseClient(txt, sf.keyword)) return false;
  } else if (kind === 'misc_custom') {
    const kw = String(sf.keywords || '').trim();
    if (!kw) return false;
    if (!_matchesAnyKeywordPhraseClient(txt, kw)) return false;
  }

  return true;
}
window.dealMatchesPromoPreferences = dealMatchesPromoPreferences;

function _refreshAllPromoPreferenceViews() {
  evaluateDealsForAlerts();
  renderPromoRadarPanel();
  if (typeof renderBFPromosCardsTab === 'function') renderBFPromosCardsTab();
  if (typeof renderHomeTab === 'function') renderHomeTab();
}

function renderPromoActivePrefsBar() {
  const bar = document.getElementById('promo-active-prefs-bar');
  const sumBadge = document.getElementById('promo-prefs-summary-badge');
  const cats = PROMO_STATE.notifyCategories || {};
  const catNames = {
    gpu: 'GPUs', cpu: 'CPUs', ram: 'RAM', mobo: 'Placas-Mãe', psu: 'Fontes',
    laptop: 'Notebooks', smartphone: 'Smartphones',
    peripheral: 'Periféricos', air_fryer: 'Air Fryer', diapers: 'Fraldas', misc_custom: 'Monitor Livre'
  };
  const enabledCats = Object.keys(catNames).filter(c => cats[c] !== false);
  const specCount = Object.keys(catNames).filter(c => _hasActiveSpecFilterForCat(c)).length;

  if (sumBadge) {
    sumBadge.textContent = specCount > 0 ? `${enabledCats.length} cat. • ${specCount} spec${specCount > 1 ? 's' : ''}` : `${enabledCats.length} cat.`;
  }
  if (!bar) return;

  const optOutDefaultOff = new Set(['laptop', 'smartphone', 'peripheral', 'air_fryer', 'diapers', 'misc_custom']);
  const chips = [];
  if (cats.laptop === false) {
    chips.push(`
      <span class="ui-badge ui-badge--warn">
        <span>Sem Notebooks</span>
        <button type="button" onclick="onPromoCategoryToggle('laptop', true)" class="ml-1 hover:text-white cursor-pointer" title="Ativar Notebooks">Ativar</button>
      </span>`);
  }
  Object.keys(catNames).forEach(cat => {
    if (cats[cat] === false) {
      if (!optOutDefaultOff.has(cat)) {
        chips.push(`
          <span class="ui-badge ui-badge--bad">
            <span>Sem ${catNames[cat]}</span>
            <button type="button" onclick="onPromoCategoryToggle('${cat}', true)" class="ml-1 hover:text-white cursor-pointer" title="Reativar ${catNames[cat]}">Reativar</button>
          </span>`);
      }
      return;
    }
    const sf = (PROMO_STATE.specFilters && PROMO_STATE.specFilters[cat]) || {};
    const desc = [];
    if (Array.isArray(sf.sub_kinds) && sf.sub_kinds.length) desc.push(sf.sub_kinds.join('/'));
    if (Array.isArray(sf.sockets) && sf.sockets.length) desc.push(sf.sockets.join('/'));
    if (Array.isArray(sf.memory_types) && sf.memory_types.length) {
      desc.push(cat === 'mobo' && sf.allow_ambiguous_mem !== false
        ? `${sf.memory_types.join('/')} (+aviso DDR?)`
        : sf.memory_types.join('/'));
    }
    if (Array.isArray(sf.brands) && sf.brands.length) desc.push(sf.brands.join('/'));
    if (Array.isArray(sf.sizes) && sf.sizes.length) desc.push(`Tam. ${sf.sizes.join('/')}`);
    if (Array.isArray(sf.models) && sf.models.length) desc.push(sf.models.map(m => (typeof m === 'object' ? m.name : m)).join(', '));
    if (Array.isArray(sf.modularity) && sf.modularity.length) desc.push(sf.modularity.join('/'));
    if (sf.chipset_query) desc.push(sf.chipset_query.toUpperCase());
    if (sf.min_capacity_gb > 0) desc.push(`${sf.min_capacity_gb}GB+`);
    if (sf.min_speed_mtps > 0) desc.push(`${sf.min_speed_mtps}+MT/s`);
    if (sf.min_vram_gb > 0) desc.push(`${sf.min_vram_gb}GB+ VRAM`);
    if (sf.min_watts > 0) desc.push(`${sf.min_watts}W+`);
    if (sf.min_cert) desc.push(`80+ ${sf.min_cert.charAt(0).toUpperCase() + sf.min_cert.slice(1)}+`);
    if (sf.min_ram_gb > 0) desc.push(`${sf.min_ram_gb}GB+ RAM`);
    if (sf.dedicated_gpu_only) desc.push('GPU Dedicada');
    if (sf.wireless_only) desc.push('Sem fio');
    if (sf.gamer_only) desc.push('Gamer');
    if (sf.format) desc.push(sf.format === 'oven' ? 'Oven' : 'Cesto');
    if (sf.digital_only) desc.push('Digital');
    if (sf.min_liters > 0) desc.push(`${sf.min_liters}L+`);
    if (sf.max_price_per_liter > 0) desc.push(`≤ R$${sf.max_price_per_liter}/L`);
    if (sf.style) desc.push(sf.style === 'pants' ? 'Pants' : 'Fita');
    if (sf.max_price_per_unit > 0) desc.push(`≤ R$${Number(sf.max_price_per_unit).toFixed(2)}/un`);
    if (sf.keyword) desc.push(`"${sf.keyword}"`);
    if (sf.keywords) desc.push(sf.keywords);
    if (sf.max_price > 0) desc.push(`≤ ${typeof fmtBRLShort === 'function' ? fmtBRLShort(sf.max_price) : sf.max_price}`);
    if (desc.length) {
      chips.push(`
        <span class="ui-badge ui-badge--brand">
          <span>${catNames[cat]}: <strong>${desc.join(' • ')}</strong></span>
          <button type="button" onclick="removePromoSpecRule('${cat}')" class="ml-1 hover:text-white cursor-pointer" aria-label="Remover filtro de ${catNames[cat]}" title="Limpar filtro de ${catNames[cat]}">✕</button>
        </span>`);
    }
  });

  if (!chips.length) {
    bar.innerHTML = '';
    bar.classList.add('hidden');
  } else {
    bar.innerHTML = `<span class="text-xs text-slate-400 font-semibold">Filtros ativos:</span>${chips.join('')}`;
    bar.classList.remove('hidden');
  }
}

function syncPromoCategoryCheckboxesFromState() {
  if (!PROMO_STATE.notifyCategories) return;
  const allCats = ['gpu', 'cpu', 'psu', 'mobo', 'ram', 'laptop', 'smartphone', 'peripheral', 'air_fryer', 'diapers', 'misc_custom'];
  allCats.forEach(cat => {
    const enabled = PROMO_STATE.notifyCategories[cat] !== false;
    const legacyChk = document.getElementById(`chk-notify-prod-${cat}`);
    if (legacyChk) legacyChk.checked = enabled;
    const prefChk = document.getElementById(`chk-pref-cat-${cat}`);
    if (prefChk) prefChk.checked = enabled;
    const specCard = document.getElementById(`spec-card-${cat}`);
    if (specCard) specCard.classList.toggle('is-disabled', !enabled);
    const pillBtn = document.querySelector(`#bf-cards-filter-pills button[data-bf-filter="${cat}"]`);
    if (pillBtn) {
      const ctx = (typeof STATE !== 'undefined' && STATE.context) || 'gpu';
      const allowCtxPill = (ctx === 'laptop' && cat === 'laptop')
        || (ctx === 'smartphone' && cat === 'smartphone')
        || (ctx === 'peripherals' && cat === 'peripheral')
        || (ctx === 'misc' && (cat === 'air_fryer' || cat === 'diapers' || cat === 'misc_custom'));
      const hidePill = !enabled && !allowCtxPill;
      pillBtn.classList.toggle('hidden', hidePill);
    }
  });
  const lapEnabled = PROMO_STATE.notifyCategories.laptop === true;
  const lapFields = document.getElementById('spec-laptop-fields');
  if (lapFields) lapFields.classList.toggle('hidden', !lapEnabled);
  ['laptop', 'smartphone', 'peripheral', 'air_fryer', 'diapers', 'misc_custom'].forEach(cat => {
    const en = PROMO_STATE.notifyCategories[cat] === true;
    const tag = document.getElementById(`spec-${cat}-status-tag`);
    const note = document.getElementById(`spec-${cat}-off-note`);
    if (tag) {
      tag.textContent = en ? 'Ativo' : 'Desativado';
      tag.className = `ui-mono text-[11px] ${en ? 'text-emerald-400' : 'text-slate-500'}`;
    }
    if (note) note.classList.toggle('hidden', en);
  });
  renderPromoActivePrefsBar();
}

function syncPromoSpecInputsFromState() {
  const sf = PROMO_STATE.specFilters || {};
  document.querySelectorAll('#promo-prefs-panel button[data-spec-cat][data-spec-key][data-spec-val]').forEach(btn => {
    const cat = btn.getAttribute('data-spec-cat');
    const key = btn.getAttribute('data-spec-key');
    const val = btn.getAttribute('data-spec-val');
    const arr = (sf[cat] && Array.isArray(sf[cat][key])) ? sf[cat][key] : [];
    const active = arr.includes(val);
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v !== undefined && v !== null && v !== 0) ? String(v) : (el.tagName === 'SELECT' ? (el.querySelector('option')?.value ?? '') : ''); };
  const mobo = sf.mobo || {};
  setVal('spec-mobo-chipset', mobo.chipset_query || '');
  setVal('spec-mobo-max-price', mobo.max_price || '');
  const moboAmbigChk = document.getElementById('spec-mobo-allow-ambiguous');
  if (moboAmbigChk) moboAmbigChk.checked = mobo.allow_ambiguous_mem !== false;
  const ram = sf.ram || {};
  setVal('spec-ram-min-cap', ram.min_capacity_gb || 0);
  setVal('spec-ram-min-speed', ram.min_speed_mtps || 0);
  setVal('spec-ram-max-price', ram.max_price || '');
  const cpu = sf.cpu || {};
  setVal('spec-cpu-max-price', cpu.max_price || '');
  const gpu = sf.gpu || {};
  setVal('spec-gpu-min-vram', gpu.min_vram_gb || 0);
  setVal('spec-gpu-max-price', gpu.max_price || '');
  const psu = sf.psu || {};
  setVal('spec-psu-min-watts', psu.min_watts || 0);
  setVal('spec-psu-min-cert', psu.min_cert || '');
  setVal('spec-psu-max-price', psu.max_price || '');
  const lap = sf.laptop || {};
  setVal('spec-laptop-min-ram', lap.min_ram_gb || 0);
  setVal('spec-laptop-max-price', lap.max_price || '');
  const dgpuChk = document.getElementById('spec-laptop-dgpu');
  if (dgpuChk) dgpuChk.checked = Boolean(lap.dedicated_gpu_only);

  const sp = sf.smartphone || {};
  setVal('spec-smartphone-max-price', sp.max_price || '');
  renderSmartphoneSelectedModelsChips();

  const per = sf.peripheral || {};
  setVal('spec-peripheral-max-price', per.max_price || '');
  const perWl = document.getElementById('spec-peripheral-wireless');
  if (perWl) perWl.checked = Boolean(per.wireless_only);
  const perGm = document.getElementById('spec-peripheral-gamer');
  if (perGm) perGm.checked = Boolean(per.gamer_only);
  renderPeripheralSelectedModelsChips();

  const af = sf.air_fryer || {};
  setVal('spec-air_fryer-format', af.format || '');
  setVal('spec-air_fryer-min-liters', af.min_liters || '');
  setVal('spec-air_fryer-max-ppl', af.max_price_per_liter || '');
  setVal('spec-air_fryer-max-price', af.max_price || '');
  setVal('spec-air_fryer-keyword', af.keyword || '');
  const afDig = document.getElementById('spec-air_fryer-digital');
  if (afDig) afDig.checked = Boolean(af.digital_only);

  const dp = sf.diapers || {};
  setVal('spec-diapers-style', dp.style || '');
  setVal('spec-diapers-max-ppu', dp.max_price_per_unit || '');
  setVal('spec-diapers-max-price', dp.max_price || '');
  setVal('spec-diapers-keyword', dp.keyword || '');

  const mc = sf.misc_custom || {};
  setVal('spec-misc_custom-keywords', mc.keywords || '');
  setVal('spec-misc_custom-max-price', mc.max_price || '');

  renderPromoActivePrefsBar();
}

let _spSuggestHighlightIdx = -1;
let _spCurrentSuggestions = [];

function getSmartphoneNotifySuggestions(query) {
  const pool = (typeof DB !== 'undefined' && Array.isArray(DB.smartphones)) ? DB.smartphones : [];
  const qNorm = _normalizePhoneStrClient(query || '').trim();
  const qTokens = _normalizePhoneTokensClient(qNorm);
  const sf = (PROMO_STATE.specFilters && PROMO_STATE.specFilters.smartphone) || {};
  const picked = Array.isArray(sf.models) ? sf.models : [];
  const pickedSlugs = new Set(picked.map(m => String((typeof m === 'object' ? m.slug : m) || '').toLowerCase()).filter(Boolean));
  const activeBrands = new Set((sf.brands || []).map(b => String(b).toLowerCase()));

  const scored = [];
  pool.forEach(sp => {
    if (!sp || !sp.slug || pickedSlugs.has(String(sp.slug).toLowerCase())) return;
    const rawName = (typeof shortSmartphoneName === 'function') ? shortSmartphoneName(sp) : (sp.name || '');
    const hay = _normalizePhoneStrClient(`${sp.name || ''} ${sp.brand || ''} ${sp.soc_name || ''} ${sp.storage_gb || ''}gb`);
    let score = 0;

    if (!qNorm) {
      score = sp.category === 'flagship' ? 40 : (sp.category === 'upper_mid' ? 30 : 20);
      score += (sp.popularity || 0) * 0.1;
    } else {
      if (hay.includes(qNorm)) score += 60;
      const hayTokens = new Set(_normalizePhoneTokensClient(hay));
      const matchedCount = qTokens.filter(t => hayTokens.has(t) || hay.includes(t)).length;
      if (qTokens.length > 0) {
        if (matchedCount === qTokens.length) score += 80;
        else if (matchedCount > 0) score += matchedCount * 22;
      } else if (hay.includes(qNorm)) {
        score += 45;
      }
      if (score === 0) return;
    }

    if (activeBrands.size && activeBrands.has(String(sp.brand || '').toLowerCase())) {
      score += 18;
    }
    scored.push({ sp, displayName: rawName, score });
  });

  scored.sort((a, b) => (b.score - a.score) || (Number(a.sp.price_brl || 0) - Number(b.sp.price_brl || 0)));
  return scored.slice(0, 8);
}
window.getSmartphoneNotifySuggestions = getSmartphoneNotifySuggestions;

function _closeSmartphoneSuggestMenu() {
  const menu = document.getElementById('spec-smartphone-suggestions');
  const inp = document.getElementById('spec-smartphone-model-input');
  if (menu) menu.classList.add('hidden');
  if (inp) inp.setAttribute('aria-expanded', 'false');
  _spSuggestHighlightIdx = -1;
}

function onSmartphoneNotifyInput(rawVal) {
  const menu = document.getElementById('spec-smartphone-suggestions');
  const inp = document.getElementById('spec-smartphone-model-input');
  if (!menu) return;
  const q = String(rawVal || '').trim();
  const matches = getSmartphoneNotifySuggestions(q);
  _spCurrentSuggestions = matches.map(m => ({
    slug: m.sp.slug,
    name: m.displayName,
    brand: m.sp.brand || '',
    price: m.sp.price_brl || 0,
    ram: m.sp.ram_gb || 0,
    storage: m.sp.storage_gb || 0,
    img: m.sp.image_url || '',
    isCustom: false
  }));

  const exactMatch = matches.some(m => _normalizePhoneStrClient(m.displayName) === _normalizePhoneStrClient(q));
  if (q.length >= 3 && !exactMatch) {
    _spCurrentSuggestions.push({
      slug: '',
      name: q,
      brand: '',
      price: 0,
      isCustom: true
    });
  }

  if (!_spCurrentSuggestions.length) {
    menu.innerHTML = `<div class="px-3 py-2 text-xs text-slate-400">Nenhum aparelho encontrado no catálogo. Continue digitando 3+ letras para monitorar termo livre.</div>`;
  } else {
    menu.innerHTML = _spCurrentSuggestions.map((opt, idx) => {
      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const priceStr = opt.price > 0 && typeof fmtBRLShort === 'function' ? fmtBRLShort(opt.price) : '';
      const subStr = opt.isCustom
        ? 'Termo livre em canais de promoção'
        : `${opt.brand || 'Smartphone'} • ${opt.ram || '?'}GB / ${opt.storage || '?'}GB`;
      return `
        <button type="button" role="option" data-sp-idx="${idx}" onclick="pickSmartphoneNotifyOption(${idx})" class="ui-autocomplete-item ${_spSuggestHighlightIdx === idx ? 'is-highlighted' : ''}">
          <div class="flex items-center gap-2 min-w-0">
            ${opt.img ? `<img src="${esc(opt.img)}" alt="" class="w-7 h-7 rounded object-contain bg-slate-950 p-0.5 shrink-0" onerror="this.style.display='none'">` : `<span class="w-7 h-7 rounded bg-slate-900 flex items-center justify-center text-xs shrink-0">${opt.isCustom ? '🔎' : '📱'}</span>`}
            <div class="min-w-0">
              <div class="text-xs font-bold truncate">${opt.isCustom ? `Monitorar termo "${esc(opt.name)}"` : esc(opt.name)}</div>
              <div class="text-[11px] text-slate-400 truncate">${esc(subStr)}</div>
            </div>
          </div>
          ${priceStr ? `<span class="ui-mono text-xs font-bold text-emerald-400 shrink-0">${esc(priceStr)}</span>` : ''}
        </button>`;
    }).join('');
  }

  menu.classList.remove('hidden');
  if (inp) inp.setAttribute('aria-expanded', 'true');
  _spSuggestHighlightIdx = _spCurrentSuggestions.length ? 0 : -1;
}
window.onSmartphoneNotifyInput = onSmartphoneNotifyInput;

function pickSmartphoneNotifyOption(idx) {
  const opt = _spCurrentSuggestions[idx];
  if (!opt) return;
  pickSmartphoneNotifyModel(opt.slug, opt.name, opt.brand);
}
window.pickSmartphoneNotifyOption = pickSmartphoneNotifyOption;

function onSmartphoneNotifyKeydown(ev) {
  const menu = document.getElementById('spec-smartphone-suggestions');
  const isOpen = menu && !menu.classList.contains('hidden');
  if (ev.key === 'Escape') {
    _closeSmartphoneSuggestMenu();
    return;
  }
  if (!isOpen && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
    onSmartphoneNotifyInput(ev.target?.value || '');
    return;
  }
  if (!isOpen || !_spCurrentSuggestions.length) return;
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    _spSuggestHighlightIdx = (_spSuggestHighlightIdx + 1) % _spCurrentSuggestions.length;
    menu.querySelectorAll('.ui-autocomplete-item').forEach((el, i) => el.classList.toggle('is-highlighted', i === _spSuggestHighlightIdx));
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    _spSuggestHighlightIdx = (_spSuggestHighlightIdx - 1 + _spCurrentSuggestions.length) % _spCurrentSuggestions.length;
    menu.querySelectorAll('.ui-autocomplete-item').forEach((el, i) => el.classList.toggle('is-highlighted', i === _spSuggestHighlightIdx));
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    const pickIdx = _spSuggestHighlightIdx >= 0 ? _spSuggestHighlightIdx : 0;
    pickSmartphoneNotifyOption(pickIdx);
  }
}
window.onSmartphoneNotifyKeydown = onSmartphoneNotifyKeydown;

function pickSmartphoneNotifyModel(slug, name, brand = '') {
  if (!PROMO_STATE.specFilters) PROMO_STATE.specFilters = {};
  if (!PROMO_STATE.specFilters.smartphone) PROMO_STATE.specFilters.smartphone = {};
  const list = Array.isArray(PROMO_STATE.specFilters.smartphone.models) ? [...PROMO_STATE.specFilters.smartphone.models] : [];
  const normSlug = String(slug || '').trim().toLowerCase();
  const normName = String(name || '').trim();
  if (!normSlug && !normName) return;

  const already = list.some(m => {
    const ms = String((typeof m === 'object' ? m.slug : '') || '').toLowerCase();
    const mn = String((typeof m === 'object' ? m.name : m) || '').toLowerCase();
    return (normSlug && ms === normSlug) || (normName && mn === normName.toLowerCase());
  });
  if (!already) {
    list.push({ slug: normSlug, name: normName || normSlug, brand: String(brand || '').trim() });
    PROMO_STATE.specFilters.smartphone.models = list;
  }

  if (!PROMO_STATE.notifyCategories) PROMO_STATE.notifyCategories = {};
  PROMO_STATE.notifyCategories.smartphone = true;

  const inp = document.getElementById('spec-smartphone-model-input');
  if (inp) inp.value = '';
  _closeSmartphoneSuggestMenu();

  syncPromoCategoryCheckboxesFromState();
  syncPromoSpecInputsFromState();
  savePromoSettingsToStorage();
  _refreshAllPromoPreferenceViews();
}
window.pickSmartphoneNotifyModel = pickSmartphoneNotifyModel;

function removeSmartphoneNotifyModel(idx) {
  const sp = PROMO_STATE.specFilters && PROMO_STATE.specFilters.smartphone;
  if (!sp || !Array.isArray(sp.models)) return;
  sp.models.splice(idx, 1);
  renderSmartphoneSelectedModelsChips();
  renderPromoActivePrefsBar();
  savePromoSettingsToStorage();
  _refreshAllPromoPreferenceViews();
}
window.removeSmartphoneNotifyModel = removeSmartphoneNotifyModel;

function renderSmartphoneSelectedModelsChips() {
  const host = document.getElementById('spec-smartphone-selected-models');
  if (!host) return;
  const models = (PROMO_STATE.specFilters && PROMO_STATE.specFilters.smartphone && Array.isArray(PROMO_STATE.specFilters.smartphone.models))
    ? PROMO_STATE.specFilters.smartphone.models
    : [];
  if (!models.length) {
    host.innerHTML = '';
    return;
  }
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  host.innerHTML = models.map((m, i) => {
    const label = typeof m === 'object' ? (m.name || m.slug) : String(m);
    const brandTag = (typeof m === 'object' && m.brand) ? `<span class="text-slate-400 text-[10px]">${esc(m.brand)}</span>` : '';
    return `
      <span class="ui-model-pill">
        <span>📱 ${esc(label)}</span>
        ${brandTag}
        <button type="button" onclick="removeSmartphoneNotifyModel(${i})" aria-label="Remover ${esc(label)}" title="Remover ${esc(label)}">✕</button>
      </span>`;
  }).join('');
}

if (typeof document !== 'undefined' && !window._spSuggestDocClickBound) {
  window._spSuggestDocClickBound = true;
  document.addEventListener('click', (ev) => {
    const wrap = document.getElementById('spec-smartphone-model-input')?.closest('.ui-autocomplete-wrap');
    if (wrap && !wrap.contains(ev.target)) {
      _closeSmartphoneSuggestMenu();
    }
    const perWrap = document.getElementById('spec-peripheral-model-input')?.closest('.ui-autocomplete-wrap');
    if (perWrap && !perWrap.contains(ev.target)) {
      _closePeripheralSuggestMenu();
    }
  });
}

let _perSuggestHighlightIdx = -1;
let _perCurrentSuggestions = [];

function getPeripheralNotifySuggestions(query) {
  const pool = (typeof DB !== 'undefined' && Array.isArray(DB.peripherals)) ? DB.peripherals : [];
  const qNorm = _normalizePhoneStrClient(query || '').trim();
  const qTokens = (qNorm.match(/[a-z0-9]+/g) || []).filter(t => !_PERIPH_NOISE_CLIENT.has(t) || t.length >= 3);
  const sf = (PROMO_STATE.specFilters && PROMO_STATE.specFilters.peripheral) || {};
  const picked = Array.isArray(sf.models) ? sf.models : [];
  const pickedSlugs = new Set(picked.map(m => String((typeof m === 'object' ? m.slug : m) || '').toLowerCase()).filter(Boolean));
  const activeBrands = new Set((sf.brands || []).map(b => String(b).toLowerCase()));
  const activeKinds = new Set((sf.sub_kinds || []).map(k => String(k).toLowerCase()));

  const scored = [];
  pool.forEach(pr => {
    if (!pr || !pr.slug || pickedSlugs.has(String(pr.slug).toLowerCase())) return;
    if (activeKinds.size && !activeKinds.has(String(pr.kind || '').toLowerCase())) return;
    const rawName = (typeof shortPeripherName === 'function') ? shortPeripherName(pr) : (pr.name || '');
    const hay = _normalizePhoneStrClient(`${pr.name || ''} ${pr.brand || ''} ${pr.kind || ''} ${(pr.specs && pr.specs.summary) || ''}`);
    let score = 0;

    if (!qNorm) {
      score = Number(pr.cb_score || 50);
    } else {
      if (hay.includes(qNorm)) score += 60;
      const hayTokens = new Set(hay.match(/[a-z0-9]+/g) || []);
      const matchedCount = qTokens.filter(t => hayTokens.has(t) || hay.includes(t)).length;
      if (qTokens.length > 0) {
        if (matchedCount === qTokens.length) score += 80;
        else if (matchedCount > 0) score += matchedCount * 22;
      } else if (hay.includes(qNorm)) {
        score += 45;
      }
      if (score === 0) return;
    }

    if (activeBrands.size && activeBrands.has(String(pr.brand || '').toLowerCase())) {
      score += 18;
    }
    scored.push({ pr, displayName: rawName, score });
  });

  scored.sort((a, b) => (b.score - a.score) || (Number(b.pr.cb_score || 0) - Number(a.pr.cb_score || 0)));
  return scored.slice(0, 8);
}

function _closePeripheralSuggestMenu() {
  const menu = document.getElementById('spec-peripheral-suggestions');
  const inp = document.getElementById('spec-peripheral-model-input');
  if (menu) menu.classList.add('hidden');
  if (inp) inp.setAttribute('aria-expanded', 'false');
  _perSuggestHighlightIdx = -1;
}

function onPeripheralNotifyInput(rawVal) {
  const menu = document.getElementById('spec-peripheral-suggestions');
  const inp = document.getElementById('spec-peripheral-model-input');
  if (!menu) return;
  const q = String(rawVal || '').trim();
  const matches = getPeripheralNotifySuggestions(q);
  _perCurrentSuggestions = matches.map(m => ({
    slug: m.pr.slug,
    name: m.displayName,
    brand: m.pr.brand || '',
    kind: m.pr.kind || '',
    price: m.pr.price_brl || 0,
    img: m.pr.image_url || '',
    isCustom: false
  }));

  const exactMatch = matches.some(m => _normalizePhoneStrClient(m.displayName) === _normalizePhoneStrClient(q));
  if (q.length >= 3 && !exactMatch) {
    _perCurrentSuggestions.push({ slug: '', name: q, brand: '', kind: '', price: 0, isCustom: true });
  }

  if (!_perCurrentSuggestions.length) {
    menu.innerHTML = `<div class="px-3 py-2 text-xs text-slate-400">Nenhum periférico encontrado. Digite 3+ letras para monitorar termo livre.</div>`;
  } else {
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    menu.innerHTML = _perCurrentSuggestions.map((opt, idx) => {
      const priceStr = opt.price > 0 && typeof fmtBRLShort === 'function' ? fmtBRLShort(opt.price) : '';
      const subStr = opt.isCustom ? 'Termo livre em canais de promoção' : `${opt.brand || 'Marca'} • ${opt.kind || 'Periférico'}`;
      const ico = opt.kind === 'keyboard' ? '⌨️' : (opt.kind === 'headset' ? '🎧' : (opt.isCustom ? '🔎' : '🖱️'));
      return `
        <button type="button" role="option" data-per-idx="${idx}" onclick="pickPeripheralNotifyOption(${idx})" class="ui-autocomplete-item ${_perSuggestHighlightIdx === idx ? 'is-highlighted' : ''}">
          <div class="flex items-center gap-2 min-w-0">
            ${opt.img ? `<img src="${esc(opt.img)}" alt="" class="w-7 h-7 rounded object-contain bg-slate-950 p-0.5 shrink-0" onerror="this.style.display='none'">` : `<span class="w-7 h-7 rounded bg-slate-900 flex items-center justify-center text-xs shrink-0">${ico}</span>`}
            <div class="min-w-0">
              <div class="text-xs font-bold truncate">${opt.isCustom ? `Monitorar "${esc(opt.name)}"` : esc(opt.name)}</div>
              <div class="text-[11px] text-slate-400 truncate">${esc(subStr)}</div>
            </div>
          </div>
          ${priceStr ? `<span class="ui-mono text-xs font-bold text-emerald-400 shrink-0">${esc(priceStr)}</span>` : ''}
        </button>`;
    }).join('');
  }

  menu.classList.remove('hidden');
  if (inp) inp.setAttribute('aria-expanded', 'true');
  _perSuggestHighlightIdx = _perCurrentSuggestions.length ? 0 : -1;
}
window.onPeripheralNotifyInput = onPeripheralNotifyInput;

function pickPeripheralNotifyOption(idx) {
  const opt = _perCurrentSuggestions[idx];
  if (!opt) return;
  pickPeripheralNotifyModel(opt.slug, opt.name, opt.brand);
}
window.pickPeripheralNotifyOption = pickPeripheralNotifyOption;

function onPeripheralNotifyKeydown(ev) {
  const menu = document.getElementById('spec-peripheral-suggestions');
  const isOpen = menu && !menu.classList.contains('hidden');
  if (ev.key === 'Escape') { _closePeripheralSuggestMenu(); return; }
  if (!isOpen && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
    onPeripheralNotifyInput(ev.target?.value || '');
    return;
  }
  if (!isOpen || !_perCurrentSuggestions.length) return;
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    _perSuggestHighlightIdx = (_perSuggestHighlightIdx + 1) % _perCurrentSuggestions.length;
    menu.querySelectorAll('.ui-autocomplete-item').forEach((el, i) => el.classList.toggle('is-highlighted', i === _perSuggestHighlightIdx));
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    _perSuggestHighlightIdx = (_perSuggestHighlightIdx - 1 + _perCurrentSuggestions.length) % _perCurrentSuggestions.length;
    menu.querySelectorAll('.ui-autocomplete-item').forEach((el, i) => el.classList.toggle('is-highlighted', i === _perSuggestHighlightIdx));
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    pickPeripheralNotifyOption(_perSuggestHighlightIdx >= 0 ? _perSuggestHighlightIdx : 0);
  }
}
window.onPeripheralNotifyKeydown = onPeripheralNotifyKeydown;

function pickPeripheralNotifyModel(slug, name, brand = '') {
  if (!PROMO_STATE.specFilters) PROMO_STATE.specFilters = {};
  if (!PROMO_STATE.specFilters.peripheral) PROMO_STATE.specFilters.peripheral = {};
  const list = Array.isArray(PROMO_STATE.specFilters.peripheral.models) ? [...PROMO_STATE.specFilters.peripheral.models] : [];
  const normSlug = String(slug || '').trim().toLowerCase();
  const normName = String(name || '').trim();
  if (!normSlug && !normName) return;

  const already = list.some(m => {
    const ms = String((typeof m === 'object' ? m.slug : '') || '').toLowerCase();
    const mn = String((typeof m === 'object' ? m.name : m) || '').toLowerCase();
    return (normSlug && ms === normSlug) || (normName && mn === normName.toLowerCase());
  });
  if (!already) {
    list.push({ slug: normSlug, name: normName || normSlug, brand: String(brand || '').trim() });
    PROMO_STATE.specFilters.peripheral.models = list;
  }
  if (!PROMO_STATE.notifyCategories) PROMO_STATE.notifyCategories = {};
  PROMO_STATE.notifyCategories.peripheral = true;
  const inp = document.getElementById('spec-peripheral-model-input');
  if (inp) inp.value = '';
  _closePeripheralSuggestMenu();
  syncPromoCategoryCheckboxesFromState();
  syncPromoSpecInputsFromState();
  savePromoSettingsToStorage();
  _refreshAllPromoPreferenceViews();
}
window.pickPeripheralNotifyModel = pickPeripheralNotifyModel;

function removePeripheralNotifyModel(idx) {
  const pf = PROMO_STATE.specFilters && PROMO_STATE.specFilters.peripheral;
  if (!pf || !Array.isArray(pf.models)) return;
  pf.models.splice(idx, 1);
  renderPeripheralSelectedModelsChips();
  renderPromoActivePrefsBar();
  savePromoSettingsToStorage();
  _refreshAllPromoPreferenceViews();
}
window.removePeripheralNotifyModel = removePeripheralNotifyModel;

function renderPeripheralSelectedModelsChips() {
  const host = document.getElementById('spec-peripheral-selected-models');
  if (!host) return;
  const models = (PROMO_STATE.specFilters && PROMO_STATE.specFilters.peripheral && Array.isArray(PROMO_STATE.specFilters.peripheral.models))
    ? PROMO_STATE.specFilters.peripheral.models
    : [];
  if (!models.length) { host.innerHTML = ''; return; }
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  host.innerHTML = models.map((m, i) => {
    const label = typeof m === 'object' ? (m.name || m.slug) : String(m);
    const brandTag = (typeof m === 'object' && m.brand) ? `<span class="text-slate-400 text-[10px]">${esc(m.brand)}</span>` : '';
    return `
      <span class="ui-model-pill">
        <span>🖱️ ${esc(label)}</span>
        ${brandTag}
        <button type="button" onclick="removePeripheralNotifyModel(${i})" aria-label="Remover ${esc(label)}" title="Remover ${esc(label)}">✕</button>
      </span>`;
  }).join('');
}

function togglePromoPreferencesPanel(forceOpen) {
  const panel = document.getElementById('promo-prefs-panel');
  const btn = document.getElementById('btn-promo-preferences');
  if (!panel) return;
  const nextOpen = (typeof forceOpen === 'boolean') ? forceOpen : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !nextOpen);
  if (btn) btn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
}
window.togglePromoPreferencesPanel = togglePromoPreferencesPanel;

function openPromoPreferencesFromConfig() {
  if (typeof switchTab === 'function') switchTab('bf-promos');
  togglePromoPreferencesPanel(true);
  setTimeout(() => {
    document.getElementById('promo-prefs-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 80);
}
window.openPromoPreferencesFromConfig = openPromoPreferencesFromConfig;

function openPromoAlertTriggersSection() {
  const det = document.getElementById('promo-radar-controls-details');
  if (det) det.open = true;
  if (!PROMO_STATE.configMenuOpen && typeof togglePromoNotifyConfigMenu === 'function') {
    togglePromoNotifyConfigMenu();
  }
  setTimeout(() => {
    document.getElementById('promo-notify-config-menu')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 60);
}
window.openPromoAlertTriggersSection = openPromoAlertTriggersSection;

function onPromoCategoryToggle(cat, checked) {
  if (!PROMO_STATE.notifyCategories) {
    PROMO_STATE.notifyCategories = {
      gpu: true, cpu: true, ram: true, mobo: true, psu: true,
      laptop: false, smartphone: false, peripheral: false, air_fryer: false, diapers: false, misc_custom: false
    };
  }
  PROMO_STATE.notifyCategories[cat] = Boolean(checked);
  if (!checked && typeof BF_CARDS_FILTER !== 'undefined' && BF_CARDS_FILTER === cat) {
    BF_CARDS_FILTER = 'all';
    document.querySelectorAll('#bf-cards-filter-pills button[data-bf-filter]').forEach(b => {
      b.classList.toggle('is-active', b.getAttribute('data-bf-filter') === 'all');
    });
  }
  syncPromoCategoryCheckboxesFromState();
  savePromoSettingsToStorage();
  _refreshAllPromoPreferenceViews();
}
window.onPromoCategoryToggle = onPromoCategoryToggle;

function onTogglePromoSpecChip(cat, key, val) {
  if (!PROMO_STATE.specFilters) PROMO_STATE.specFilters = {};
  if (!PROMO_STATE.specFilters[cat]) PROMO_STATE.specFilters[cat] = {};
  const cur = Array.isArray(PROMO_STATE.specFilters[cat][key]) ? [...PROMO_STATE.specFilters[cat][key]] : [];
  const idx = cur.indexOf(val);
  if (idx >= 0) cur.splice(idx, 1);
  else cur.push(val);
  PROMO_STATE.specFilters[cat][key] = cur;
  if (PROMO_STATE.notifyCategories && PROMO_STATE.notifyCategories[cat] === false) {
    PROMO_STATE.notifyCategories[cat] = true;
    syncPromoCategoryCheckboxesFromState();
  }
  syncPromoSpecInputsFromState();
  savePromoSettingsToStorage();
  _refreshAllPromoPreferenceViews();
}
window.onTogglePromoSpecChip = onTogglePromoSpecChip;

function onPromoSpecInputChange() {
  if (!PROMO_STATE.specFilters) PROMO_STATE.specFilters = {};
  const numVal = (id) => { const v = parseFloat(document.getElementById(id)?.value || '0'); return (v > 0 && !isNaN(v)) ? v : 0; };
  const intVal = (id) => { const v = parseInt(document.getElementById(id)?.value || '0', 10); return (v > 0 && !isNaN(v)) ? v : 0; };
  const strVal = (id) => (document.getElementById(id)?.value || '').trim();

  PROMO_STATE.specFilters.mobo = {
    ...(PROMO_STATE.specFilters.mobo || {}),
    chipset_query: strVal('spec-mobo-chipset'),
    max_price: numVal('spec-mobo-max-price'),
    allow_ambiguous_mem: Boolean(document.getElementById('spec-mobo-allow-ambiguous')?.checked ?? true)
  };
  PROMO_STATE.specFilters.ram = { ...(PROMO_STATE.specFilters.ram || {}), min_capacity_gb: intVal('spec-ram-min-cap'), min_speed_mtps: intVal('spec-ram-min-speed'), max_price: numVal('spec-ram-max-price') };
  PROMO_STATE.specFilters.cpu = { ...(PROMO_STATE.specFilters.cpu || {}), max_price: numVal('spec-cpu-max-price') };
  PROMO_STATE.specFilters.gpu = { ...(PROMO_STATE.specFilters.gpu || {}), min_vram_gb: intVal('spec-gpu-min-vram'), max_price: numVal('spec-gpu-max-price') };
  PROMO_STATE.specFilters.psu = { ...(PROMO_STATE.specFilters.psu || {}), min_watts: intVal('spec-psu-min-watts'), min_cert: strVal('spec-psu-min-cert'), max_price: numVal('spec-psu-max-price') };
  PROMO_STATE.specFilters.laptop = { ...(PROMO_STATE.specFilters.laptop || {}), min_ram_gb: intVal('spec-laptop-min-ram'), max_price: numVal('spec-laptop-max-price'), dedicated_gpu_only: Boolean(document.getElementById('spec-laptop-dgpu')?.checked) };
  PROMO_STATE.specFilters.smartphone = { ...(PROMO_STATE.specFilters.smartphone || {}), max_price: numVal('spec-smartphone-max-price') };
  PROMO_STATE.specFilters.peripheral = {
    ...(PROMO_STATE.specFilters.peripheral || {}),
    wireless_only: Boolean(document.getElementById('spec-peripheral-wireless')?.checked),
    gamer_only: Boolean(document.getElementById('spec-peripheral-gamer')?.checked),
    max_price: numVal('spec-peripheral-max-price')
  };
  PROMO_STATE.specFilters.air_fryer = {
    ...(PROMO_STATE.specFilters.air_fryer || {}),
    format: strVal('spec-air_fryer-format'),
    digital_only: Boolean(document.getElementById('spec-air_fryer-digital')?.checked),
    min_liters: numVal('spec-air_fryer-min-liters'),
    max_price_per_liter: numVal('spec-air_fryer-max-ppl'),
    max_price: numVal('spec-air_fryer-max-price'),
    keyword: strVal('spec-air_fryer-keyword')
  };
  PROMO_STATE.specFilters.diapers = {
    ...(PROMO_STATE.specFilters.diapers || {}),
    style: strVal('spec-diapers-style'),
    max_price_per_unit: numVal('spec-diapers-max-ppu'),
    max_price: numVal('spec-diapers-max-price'),
    keyword: strVal('spec-diapers-keyword')
  };
  PROMO_STATE.specFilters.misc_custom = {
    ...(PROMO_STATE.specFilters.misc_custom || {}),
    keywords: strVal('spec-misc_custom-keywords'),
    max_price: numVal('spec-misc_custom-max-price')
  };

  let catAutoEnabled = false;
  if (PROMO_STATE.notifyCategories) {
    if (PROMO_STATE.specFilters.smartphone.max_price > 0 && !PROMO_STATE.notifyCategories.smartphone) {
      PROMO_STATE.notifyCategories.smartphone = true; catAutoEnabled = true;
    }
    if ((PROMO_STATE.specFilters.peripheral.max_price > 0 || PROMO_STATE.specFilters.peripheral.wireless_only || PROMO_STATE.specFilters.peripheral.gamer_only) && !PROMO_STATE.notifyCategories.peripheral) {
      PROMO_STATE.notifyCategories.peripheral = true; catAutoEnabled = true;
    }
    if ((PROMO_STATE.specFilters.air_fryer.min_liters > 0 || PROMO_STATE.specFilters.air_fryer.max_price_per_liter > 0 || PROMO_STATE.specFilters.air_fryer.max_price > 0 || PROMO_STATE.specFilters.air_fryer.keyword || PROMO_STATE.specFilters.air_fryer.format || PROMO_STATE.specFilters.air_fryer.digital_only) && !PROMO_STATE.notifyCategories.air_fryer) {
      PROMO_STATE.notifyCategories.air_fryer = true; catAutoEnabled = true;
    }
    if ((PROMO_STATE.specFilters.diapers.max_price_per_unit > 0 || PROMO_STATE.specFilters.diapers.max_price > 0 || PROMO_STATE.specFilters.diapers.keyword || PROMO_STATE.specFilters.diapers.style) && !PROMO_STATE.notifyCategories.diapers) {
      PROMO_STATE.notifyCategories.diapers = true; catAutoEnabled = true;
    }
    if (PROMO_STATE.specFilters.misc_custom.keywords && !PROMO_STATE.notifyCategories.misc_custom) {
      PROMO_STATE.notifyCategories.misc_custom = true; catAutoEnabled = true;
    }
  }
  if (catAutoEnabled) syncPromoCategoryCheckboxesFromState();

  renderPromoActivePrefsBar();
  savePromoSettingsToStorage();
  _refreshAllPromoPreferenceViews();
}
window.onPromoSpecInputChange = onPromoSpecInputChange;

function clearPromoSpecFilters() {
  PROMO_STATE.specFilters = {
    mobo: {}, ram: {}, cpu: {}, gpu: {}, psu: {}, laptop: {},
    smartphone: {}, peripheral: {}, air_fryer: {}, diapers: {}, misc_custom: {}
  };
  syncPromoSpecInputsFromState();
  savePromoSettingsToStorage();
  _refreshAllPromoPreferenceViews();
}
window.clearPromoSpecFilters = clearPromoSpecFilters;

function removePromoSpecRule(cat) {
  if (!PROMO_STATE.specFilters) PROMO_STATE.specFilters = {};
  PROMO_STATE.specFilters[cat] = {};
  syncPromoSpecInputsFromState();
  savePromoSettingsToStorage();
  _refreshAllPromoPreferenceViews();
}
window.removePromoSpecRule = removePromoSpecRule;

function prefillPromoSpecsFromRefPC() {
  const refMobo = (typeof STATE !== 'undefined' && (STATE.refPC?.mobo || STATE.build?.mobo)) || {};
  const refCpu = (typeof STATE !== 'undefined' && (STATE.refPC?.cpu || STATE.build?.cpu)) || {};
  const refRam = (typeof STATE !== 'undefined' && (STATE.refPC?.ram || STATE.build?.ram)) || {};
  const sock = String(refMobo.socket || refCpu.socket || '').trim().toUpperCase();
  const mem = String(refMobo.memory_type || refRam.memory_type || '').trim().toUpperCase();
  if (!PROMO_STATE.specFilters) PROMO_STATE.specFilters = {};
  if (['AM4', 'AM5', 'LGA1700', 'LGA1851'].includes(sock)) {
    PROMO_STATE.specFilters.mobo = { ...(PROMO_STATE.specFilters.mobo || {}), sockets: [sock] };
    PROMO_STATE.specFilters.cpu = { ...(PROMO_STATE.specFilters.cpu || {}), sockets: [sock] };
  }
  if (['DDR4', 'DDR5'].includes(mem)) {
    PROMO_STATE.specFilters.mobo = { ...(PROMO_STATE.specFilters.mobo || {}), memory_types: [mem] };
    PROMO_STATE.specFilters.ram = { ...(PROMO_STATE.specFilters.ram || {}), memory_types: [mem] };
  }
  syncPromoCategoryCheckboxesFromState();
  syncPromoSpecInputsFromState();
  savePromoSettingsToStorage();
  _refreshAllPromoPreferenceViews();
  if (typeof showWebToastNotification === 'function') {
    const desc = [sock || 'socket padrão', mem || 'RAM padrão'].join(' • ');
    showWebToastNotification('⚡ Specs Preenchidas do Meu PC', `Filtros de Placa-Mãe / CPU / RAM ajustados para ${desc}.`);
  }
}
window.prefillPromoSpecsFromRefPC = prefillPromoSpecsFromRefPC;

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

function isLocalServerHost() {
  const h = window.location.hostname || '';
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    /^192\.168\.\d+\.\d+$/.test(h) ||
    /^10\.\d+\.\d+\.\d+$/.test(h) ||
    /^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)
  );
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
      trigAvg30d: PROMO_STATE.trigAvg30d,
      avg30dMinPct: PROMO_STATE.avg30dMinPct,
      notifyLogic: PROMO_STATE.notifyLogic,
      notifyKind: PROMO_STATE.notifyKind,
      notifyCategories: PROMO_STATE.notifyCategories,
      specFilters: PROMO_STATE.specFilters,
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

  const topicLink = document.getElementById('link-open-ntfy-topic');
  const activeTopic = (PROMO_STATE.ntfyTopic || 'alerta_deal_jz265i').trim();
  if (topicLink) topicLink.href = `https://ntfy.sh/${encodeURIComponent(activeTopic)}`;

  // Sync to Python server background monitor so alerts fire even when browser is closed!
  // Works on localhost AND from GitHub Pages when PC daemon is running locally (Private Network CORS)
  const alertPayload = {
    notifyEnabled: PROMO_STATE.notifyEnabled,
    intervalMins: PROMO_STATE.autoSyncMins || 1,
    intervalSecs: 30,
    notifyWinToast: PROMO_STATE.notifyWinToast,
    notifyPhone: PROMO_STATE.notifyPhone,
    phoneService: PROMO_STATE.phoneService || 'ntfy',
    ntfyTopic: activeTopic,
    ntfyRing: PROMO_STATE.ntfyRing,
    ntfyPriority: PROMO_STATE.ntfyPriority,
    trigCB: PROMO_STATE.trigCB,
    notifyMinCB: PROMO_STATE.notifyMinCB,
    trigBF: PROMO_STATE.trigBF,
    bfMode: PROMO_STATE.bfMode,
    trigHB: PROMO_STATE.trigHB,
    hbMinBrl: PROMO_STATE.hbMinBrl,
    hbMinPct: PROMO_STATE.hbMinPct,
    trigAvg30d: PROMO_STATE.trigAvg30d,
    avg30dMinPct: PROMO_STATE.avg30dMinPct,
    notifyLogic: PROMO_STATE.notifyLogic,
    notifyCategories: PROMO_STATE.notifyCategories,
    specFilters: PROMO_STATE.specFilters,
    custom_targets: [
      { slug: 'rtx-5060', name: 'RTX 5060', max_price: 2300 },
      { slug: 'rtx-5070', name: 'RTX 5070', max_price: 4500 },
      { slug: 'rtx-4060', name: 'RTX 4060', max_price: 1850 }
    ]
  };

  const isLocal = isLocalServerHost();
  const targetEndpoint = isLocal ? '/api/alert-config' : 'http://127.0.0.1:8080/api/alert-config';
  fetch(targetEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alertPayload)
  }).catch(() => {});
}

async function subscribeToBackgroundPush() {
  const bgStatusEl = document.getElementById('bg-monitor-status');
  const btn = document.getElementById('btn-subscribe-push');
  const topic = (PROMO_STATE.ntfyTopic || 'alerta_deal_jz265i').trim();
  const topicLink = document.getElementById('link-open-ntfy-topic');
  if (topicLink) topicLink.href = `https://ntfy.sh/${encodeURIComponent(topic)}`;

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Inscrevendo...';
  }
  const setStatus = (msg, cls) => {
    if (bgStatusEl) { bgStatusEl.innerHTML = msg; bgStatusEl.className = cls; }
  };

  try {
    // 1. Request Browser Notification Permission
    let perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }

    // 2. Register Service Worker + Periodic Sync (for GitHub Pages closed-tab background polling)
    let swOk = false;
    let periodicOk = false;
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || isLocalServerHost())) {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js');
        swOk = true;
        if (reg.active) reg.active.postMessage({ type: 'SET_TOPIC', topic });
        if (reg.installing) reg.installing.postMessage({ type: 'SET_TOPIC', topic });
        if ('periodicSync' in reg) {
          try {
            await reg.periodicSync.register('promo-radar-sync', { minInterval: 5 * 60 * 1000 });
            periodicOk = true;
          } catch (_) {}
        }
      } catch (_) {}
    }

    // 3. Sync alert config & topic directly to local PC Python daemon (works from GitHub Pages too!)
    let daemonOnline = false;
    const isLocal = isLocalServerHost();
    try {
      const r = await fetchWithTimeout(isLocal ? '/api/alert-config' : 'http://127.0.0.1:8080/api/alert-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notifyEnabled: true,
          intervalMins: 1,
          intervalSecs: 30,
          notifyWinToast: true,
          notifyPhone: true,
          phoneService: PROMO_STATE.phoneService || 'ntfy',
          ntfyTopic: topic
        })
      }, 3000);
      if (r.ok) daemonOnline = true;
    } catch (_) {}

    if (btn) {
      btn.disabled = false;
      btn.textContent = daemonOnline ? '✅ Push Inscrito & Sincronizado' : '✅ Service Worker Inscrito';
    }

    if (daemonOnline && perm === 'granted') {
      setStatus(
        `✅ Inscrito! Monitor PC ativo (30s) + Service Worker${periodicOk ? ' + PeriodicSync' : ''} inscritos no tópico <code>${topic}</code>. Para push web nativo em qualquer aba/celular: <a href="https://ntfy.sh/${encodeURIComponent(topic)}" target="_blank" class="underline text-amber-300">ntfy.sh/${topic}</a>`,
        'text-xs text-emerald-400 font-mono mt-1'
      );
    } else if (perm === 'granted') {
      setStatus(
        `✅ Service Worker ativo! Para push instantâneo 24/7 com a aba 100% fechada, clique em <a href="https://ntfy.sh/${encodeURIComponent(topic)}" target="_blank" class="underline text-amber-300 font-bold">ntfy.sh/${topic} → Subscribe</a> (ou deixe o monitor do PC rodando).`,
        'text-xs text-sky-300 font-mono mt-1'
      );
    } else {
      setStatus(
        `⚠️ Permissão de notificação do navegador: ${perm}. Libere notificações no cadeado da URL ou assine direto em <a href="https://ntfy.sh/${encodeURIComponent(topic)}" target="_blank" class="underline text-amber-300">ntfy.sh/${topic}</a>.`,
        'text-xs text-amber-300 font-mono mt-1'
      );
    }
    try { localStorage.setItem('gca_push_subscribed_v1', '1'); } catch (_) {}
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📲 Inscrever-se em Push (Aba Fechada)';
    }
    setStatus(`Erro ao inscrever push: ${e.message}`, 'text-xs text-rose-400 font-mono mt-1');
  }
}
window.subscribeToBackgroundPush = subscribeToBackgroundPush;

function updateBackgroundMonitorUI() {
  const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
  const badge = document.getElementById('bg-monitor-badge');
  const desc = document.getElementById('bg-monitor-desc');
  const topic = (PROMO_STATE.ntfyTopic || 'alerta_deal_jz265i').trim();
  const topicLink = document.getElementById('link-open-ntfy-topic');
  if (topicLink) topicLink.href = `https://ntfy.sh/${encodeURIComponent(topic)}`;

  if (isStatic) {
    if (badge) {
      badge.textContent = '🌐 GitHub Pages (Push Sync)';
      badge.className = 'px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-xs font-bold';
    }
    if (desc) {
      desc.innerHTML = 'No GitHub Pages, clique em <strong>Inscrever-se em Push</strong> para ativar o Service Worker + sincronizar suas metas com o monitor Python do PC (30s) e receber alertas em <code>ntfy.sh/' + topic + '</code> mesmo com a aba fechada.';
    }
  } else {
    if (badge) {
      badge.textContent = '● Ativo no PC (30s)';
      badge.className = 'px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold';
    }
  }
}
window.updateBackgroundMonitorUI = updateBackgroundMonitorUI;

async function testBackgroundAlertNow() {
  const statusEl = document.getElementById('phone-test-status');
  const bgStatusEl = document.getElementById('bg-monitor-status');
  const updateStatus = (msg, cls) => {
    if (statusEl) { statusEl.textContent = msg; statusEl.className = cls; }
    if (bgStatusEl) { bgStatusEl.textContent = msg; bgStatusEl.className = cls; }
  };

  updateStatus('Verificando monitor de segundo plano...', 'text-xs text-amber-300 font-mono');

  let serverSuccess = false;

  try {
    const res = await fetch(
      isLocalServerHost()
        ? '/api/test-background-alert'
        : 'http://127.0.0.1:8080/api/test-background-alert',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notifyEnabled: true,
          notifyWinToast: true,
          notifyPhone: true,
          ntfyTopic: PROMO_STATE.ntfyTopic || 'alerta_deal_jz265i',
          phoneService: PROMO_STATE.phoneService || 'ntfy'
        })
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.ok) {
        serverSuccess = true;
      }
    }
  } catch (_) {}

  if (serverSuccess) {
    updateStatus('✓ Alerta em segundo plano disparado pelo servidor local (Windows + Celular)!', 'text-xs text-emerald-400 font-mono font-bold');
    playDealAlertChime();
    return;
  }

  // Fallback for Static / GitHub Pages or when local Python server is not running:
  // 1. Browser Notification API (Desktop toast)
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification('🔔 [Alerta GPU] RTX 5060 por R$ 2.190 (Teste)', {
          body: '✓ Alerta disparado no navegador com sucesso! (Modo Web/GitHub)',
          icon: 'favicon.ico'
        });
      } catch (_) {}
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  // 2. Direct Phone notification via ntfy.sh (or WhatsApp)
  const ntfyTopic = PROMO_STATE.ntfyTopic || 'alerta_deal_jz265i';
  if ((PROMO_STATE.phoneService || 'ntfy') === 'ntfy' && ntfyTopic) {
    try {
      await fetch('https://ntfy.sh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: ntfyTopic,
          title: '🔥 [TESTE 2º PLANO] RTX 5060 8GB por R$ 2.190,00',
          message: '🔔 Teste de alerta disparado com sucesso!\n\nNo GitHub Pages (web), o navegador monitora enquanto a aba estiver aberta. Para monitoramento com o navegador 100% FECHADO, execute "python server.py" no seu PC.',
          tags: ['bell', 'lightning'],
          priority: 4
        })
      });
    } catch (_) {}
  }

  playDealAlertChime();

  const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
  if (isStatic) {
    updateStatus(
      '✓ Alerta testado com sucesso no navegador e celular (ntfy.sh)! Nota: O monitoramento com navegador FECHADO requer o servidor Python local rodando no PC ("python server.py").',
      'text-xs text-sky-300 font-mono font-bold'
    );
  } else {
    updateStatus(
      '✓ Alerta testado no navegador e celular via ntfy.sh! (Inicie "python server.py" para segundo plano nativo no Windows).',
      'text-xs text-amber-300 font-mono font-bold'
    );
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
  setChk('chk-trig-avg30d', PROMO_STATE.trigAvg30d);
  setVal('input-notify-avg30d-pct', PROMO_STATE.avg30dMinPct);
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
  syncPromoCategoryCheckboxesFromState();
  syncPromoSpecInputsFromState();
  if (isLocalServerHost() && !window._promoHydratedFromServer) {
    window._promoHydratedFromServer = true;
    try {
      const hasLocalSpec = Boolean(JSON.parse(localStorage.getItem('gpuAnalyzerPromoSettings_v1') || 'null')?.specFilters);
      if (!hasLocalSpec) {
        fetch('/api/alert-config', { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null))
          .then(srvCfg => {
            if (!srvCfg || typeof srvCfg !== 'object') return;
            if (srvCfg.notifyCategories && typeof srvCfg.notifyCategories === 'object') {
              PROMO_STATE.notifyCategories = Object.assign({}, PROMO_STATE.notifyCategories, srvCfg.notifyCategories);
            }
            if (srvCfg.specFilters && typeof srvCfg.specFilters === 'object') {
              PROMO_STATE.specFilters = Object.assign({}, PROMO_STATE.specFilters, srvCfg.specFilters);
            }
            syncPromoCategoryCheckboxesFromState();
            syncPromoSpecInputsFromState();
            _refreshAllPromoPreferenceViews();
          })
          .catch(() => {});
      }
    } catch (_) {}
  }
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
  PROMO_STATE.trigAvg30d = getChk('chk-trig-avg30d', true);
  PROMO_STATE.avg30dMinPct = Math.max(1, parseFloat(getVal('input-notify-avg30d-pct', '5')) || 5);
  PROMO_STATE.notifyLogic = getVal('select-notify-logic', 'OR');
  PROMO_STATE.notifyKind = getVal('select-notify-kind', 'all');
  PROMO_STATE.notifyCategories = {
    gpu: getChk('chk-notify-prod-gpu', true),
    cpu: getChk('chk-notify-prod-cpu', true),
    psu: getChk('chk-notify-prod-psu', true),
    mobo: getChk('chk-notify-prod-mobo', true),
    ram: getChk('chk-notify-prod-ram', true),
    laptop: getChk('chk-notify-prod-laptop', false),
    smartphone: getChk('chk-notify-prod-smartphone', false),
    peripheral: getChk('chk-notify-prod-peripheral', false),
    air_fryer: getChk('chk-notify-prod-air_fryer', false),
    diapers: getChk('chk-notify-prod-diapers', false),
    misc_custom: getChk('chk-notify-prod-misc_custom', false)
  };
  syncPromoCategoryCheckboxesFromState();
  PROMO_STATE.notifyWinToast = getChk('chk-notify-win-toast', true);
  PROMO_STATE.notifyWinPopup = getChk('chk-notify-win-popup', false);
  PROMO_STATE.notifyWebToast = getChk('chk-notify-web-toast', true);
  PROMO_STATE.notifySound = getChk('chk-notify-sound', true);
  PROMO_STATE.notifyPhone = getChk('chk-notify-phone', false);

  const rad = document.querySelector('input[name="phone-service-choice"]:checked');
  if (rad) PROMO_STATE.phoneService = rad.value;
  PROMO_STATE.ntfyTopic = getVal('input-phone-ntfy-topic', 'alerta_deal_jz265i').trim();
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
    _refreshAllPromoPreferenceViews();
  } else if (typeof renderHomeTab === 'function') {
    renderHomeTab();
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
    if (PROMO_STATE.trigAvg30d) {
      parts.push(`⚡ −${PROMO_STATE.avg30dMinPct}% vs Média 30d`);
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
  const activeReg = getActiveRegionId();
  const lastDataReg = (PROMO_STATE.lastData && PROMO_STATE.lastData.region_id)
    ? PROMO_STATE.lastData.region_id.toLowerCase()
    : activeReg;

  const brChannels = new Set(['ofertasadrenaline', 'peperaiohardware', 'iskandarsouza', 'benchpromos', 'kabumofertas', 'nerdofertas', 'ofertastechbr']);

  // Compute maximum composite/price ratio with default/current weights to also evaluate non-active flash deals
  let maxGpuRawRatio = 0;
  (DB.gpus || []).forEach(g => {
    if (g.slug !== 'rx-580-8gb-ref' && (g._rawCBRatio || 0) > maxGpuRawRatio) {
      maxGpuRawRatio = g._rawCBRatio;
    }
  });

  const qualifying = [];
  const allEvalDeals = [...PROMO_STATE.lastData.matched_deals];
  const seenAlertPids = new Set(allEvalDeals.map(x => x && x.post_id).filter(Boolean));
  const nc = PROMO_STATE.notifyCategories || {};
  if (nc.smartphone === true && Array.isArray(PROMO_STATE.lastData.smartphone_deals)) {
    PROMO_STATE.lastData.smartphone_deals.forEach(sd => {
      if (!sd) return;
      const sdCopy = { ...sd, matched_kind: 'smartphone', stock_verified: sd.is_expired ? false : (sd.stock_verified !== false) };
      if (!sdCopy.post_id || !seenAlertPids.has(sdCopy.post_id)) {
        allEvalDeals.push(sdCopy);
        if (sdCopy.post_id) seenAlertPids.add(sdCopy.post_id);
      }
    });
  }
  if (nc.peripheral === true && Array.isArray(PROMO_STATE.lastData.peripheral_deals)) {
    PROMO_STATE.lastData.peripheral_deals.forEach(pd => {
      if (!pd) return;
      const pdCopy = { ...pd, matched_kind: 'peripheral', stock_verified: pd.is_expired ? false : (pd.stock_verified !== false) };
      if (!pdCopy.post_id || !seenAlertPids.has(pdCopy.post_id)) {
        allEvalDeals.push(pdCopy);
        if (pdCopy.post_id) seenAlertPids.add(pdCopy.post_id);
      }
    });
  }
  if ((nc.air_fryer === true || nc.diapers === true || nc.misc_custom === true) && Array.isArray(PROMO_STATE.lastData.misc_deals)) {
    PROMO_STATE.lastData.misc_deals.forEach(md => {
      if (!md) return;
      const mk = md.misc_category || md.matched_kind || 'misc_custom';
      const mdCopy = { ...md, matched_kind: (mk === 'air_fryer' || mk === 'diapers') ? mk : 'misc_custom', stock_verified: md.is_expired ? false : (md.stock_verified !== false) };
      if (!mdCopy.post_id || !seenAlertPids.has(mdCopy.post_id)) {
        allEvalDeals.push(mdCopy);
        if (mdCopy.post_id) seenAlertPids.add(mdCopy.post_id);
      }
    });
  }
  if (nc.misc_custom === true && (PROMO_STATE.specFilters?.misc_custom?.keywords || '').trim() && Array.isArray(PROMO_STATE.lastData.recent_feed)) {
    PROMO_STATE.lastData.recent_feed.forEach(fd => {
      if (!fd || (fd.post_id && seenAlertPids.has(fd.post_id))) return;
      allEvalDeals.push({ ...fd, matched_kind: 'misc_custom', stock_verified: true });
      if (fd.post_id) seenAlertPids.add(fd.post_id);
    });
  }
  allEvalDeals.forEach(d => {
    const dReg = (d.region_id || lastDataReg).toLowerCase();
    if (dReg !== activeReg) return;
    if (activeReg === 'mx' || activeReg === 'eu') {
      const ch = (d.channel_id || '').toLowerCase().replace(/^@/, '');
      if (brChannels.has(ch)) return;
      const bUrl = (d.buy_url || d.post_url || '').toLowerCase();
      if (bUrl.includes('.br') || bUrl.includes('kabum') || bUrl.includes('terabyte') || bUrl.includes('pichau')) return;
      if (activeReg === 'eu' && (bUrl.includes('.mx') || bUrl.includes('cyberpuerta') || bUrl.includes('ddtech'))) return;
    }
    if (!dealMatchesPromoPreferences(d)) return;

    let cbScore = null;
    let hitCB = false;
    let hitBF = false;
    let hitHB = false;
    const reasons = [];

    // 1. Evaluate CB & BF across all tracked catalogs
    const catalogItem = _findCatalogItemForDeal(d);

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
    if (catalogItem && ['gpu', 'cpu', 'laptop', 'smartphone', 'peripheral', 'air_fryer', 'diapers'].includes(d.matched_kind)) {
      const st = bfAnalyzeItem(catalogItem, d.matched_kind);
      const exp = bfExpectedRange(st, 0.10);
      const userSaved = (STATE.bfRanges && STATE.bfRanges[d.matched_slug]) || null;
      const userMin = userSaved ? userSaved.min : exp.low;
      const userMax = userSaved ? userSaved.max : exp.high;

      const mode = PROMO_STATE.bfMode || 'user_or_low';
      d.bf_alert_banner = null;
      if (d.price_brl <= st.allMin * 1.01) {
        hitBF = true;
        d.bf_alert_banner = '🚨🔥 PREÇO DE BLACK FRIDAY — MÍNIMO HISTÓRICO! 🔥🚨';
        reasons.push(`🔥 Mín. Histórico (${formatMoneyShort(st.allMin)})`);
      } else if (d.price_brl <= Math.max(exp.low, userMin)) {
        d.bf_alert_banner = '🚨🔥 PREÇO DE BLACK FRIDAY (PISO BF)! 🔥🚨';
        if (mode !== 'all_min') {
          hitBF = true;
          reasons.push(`🏷️ Piso Black Friday (≤ ${formatMoneyShort(Math.max(exp.low, userMin))})`);
        }
      } else if (d.price_brl <= exp.mid) {
        d.bf_alert_banner = '⚡🔥 PREÇO DE BLACK FRIDAY (NA FAIXA)! 🔥⚡';
        if (mode !== 'all_min') {
          hitBF = true;
          reasons.push(`🏷️ Média Esperada BF (≤ ${formatMoneyShort(exp.mid)})`);
        }
      } else if (d.price_brl <= Math.max(exp.high, userMax)) {
        d.bf_alert_banner = '⚡🔥 PREÇO DE BLACK FRIDAY (NA FAIXA)! 🔥⚡';
        if (mode === 'user_or_low' || mode === 'bf_high') {
          hitBF = true;
          reasons.push(`🏷️ Dentro da Faixa BF (≤ ${formatMoneyShort(Math.max(exp.high, userMax))})`);
        }
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
      reasons.push(activeReg === 'eu'
        ? `📉 −${formatMoneyShort(d.savings_vs_hb_brl)} (−${Math.round(pctVsHB)}%) vs Catálogo EU`
        : (activeReg === 'mx'
          ? `📉 −${formatMoneyShort(d.savings_vs_hb_brl)} (−${Math.round(pctVsHB)}%) vs Catálogo`
          : `📉 −${formatMoneyShort(d.savings_vs_hb_brl)} (−${Math.round(pctVsHB)}%) vs Database`));
    }

    // 4. Evaluate 30-day rolling average flash drop (default >= 5%)
    let hitAvg30d = false;
    if (PROMO_STATE.trigAvg30d && d.matched_slug && d.price_brl > 0) {
      const catIt = catalogItem || _findCatalogItemForDeal(d);
      const avg30 = (catIt && catIt.price_stats && catIt.price_stats.avg_30d) ? catIt.price_stats.avg_30d : 0;
      if (avg30 > 0) {
        const drop30Pct = ((avg30 - d.price_brl) / avg30) * 100;
        if (drop30Pct >= (PROMO_STATE.avg30dMinPct || 5)) {
          hitAvg30d = true;
          reasons.push(`⚡ −${drop30Pct.toFixed(1)}% vs Média 30d (${formatMoneyShort(avg30)})`);
        }
      }
    }

    let hitDomainWatch = false;
    const dk = (d.matched_kind || '').toLowerCase();
    const dSf = (PROMO_STATE.specFilters && PROMO_STATE.specFilters[dk]) || {};
    if (dk === 'smartphone' && ((Array.isArray(dSf.models) && dSf.models.length > 0) || Number(dSf.max_price || 0) > 0)) {
      hitDomainWatch = true;
      reasons.push('📱 Smartphone monitorado');
    } else if (dk === 'peripheral' && ((Array.isArray(dSf.models) && dSf.models.length > 0) || (Array.isArray(dSf.brands) && dSf.brands.length > 0) || (Array.isArray(dSf.sub_kinds) && dSf.sub_kinds.length > 0) || Number(dSf.max_price || 0) > 0)) {
      hitDomainWatch = true;
      reasons.push('🖱️ Periférico monitorado');
    } else if (dk === 'air_fryer' && ((Array.isArray(dSf.brands) && dSf.brands.length > 0) || dSf.format || Number(dSf.min_liters || 0) > 0 || Number(dSf.max_price_per_liter || 0) > 0 || Number(dSf.max_price || 0) > 0 || dSf.keyword)) {
      hitDomainWatch = true;
      reasons.push('🍟 Air Fryer no critério');
    } else if (dk === 'diapers' && ((Array.isArray(dSf.brands) && dSf.brands.length > 0) || (Array.isArray(dSf.sizes) && dSf.sizes.length > 0) || dSf.style || Number(dSf.max_price_per_unit || 0) > 0 || Number(dSf.max_price || 0) > 0 || dSf.keyword)) {
      hitDomainWatch = true;
      reasons.push('👶 Fralda no critério');
    } else if (dk === 'misc_custom' && (dSf.keywords || '').trim()) {
      hitDomainWatch = true;
      reasons.push('📦 Item personalizado encontrado');
    }

    if (d._unverifiedMemType || d.unverified_memory_type) {
      if (!reasons.some(r => String(r).includes('DDR4/DDR5'))) {
        reasons.push('⚠️ Verificar tipo de RAM (DDR4/DDR5)');
      }
    }
    d.cb_score = cbScore;
    d.is_high_cb = hitCB;
    d.is_pechincha = hitBF || hitHB || hitAvg30d || hitDomainWatch;
    d.alert_reasons = reasons;

    // Filter by item category
    if (PROMO_STATE.notifyCategories) {
      const kind = d.matched_kind || 'gpu';
      if (PROMO_STATE.notifyCategories[kind] === false) return;
    } else {
      if (PROMO_STATE.notifyKind === 'gpu' && d.matched_kind !== 'gpu') return;
      if (PROMO_STATE.notifyKind === 'cpu_gpu' && d.matched_kind !== 'gpu' && d.matched_kind !== 'cpu') return;
    }

    // Combine active triggers with OR / AND logic
    const activeResults = [];
    if (PROMO_STATE.trigCB) activeResults.push(hitCB);
    if (PROMO_STATE.trigBF) activeResults.push(hitBF);
    if (PROMO_STATE.trigHB) activeResults.push(hitHB);
    if (PROMO_STATE.trigAvg30d) activeResults.push(hitAvg30d);

    if (!activeResults.length && !hitDomainWatch) return;
    const qualifies = hitDomainWatch || (PROMO_STATE.notifyLogic === 'AND'
      ? activeResults.every(Boolean)
      : activeResults.some(Boolean));

    if (qualifies) {
      qualifying.push(d);
    }
  });

  return qualifying;
}

let _dealToastTimer = null;

function showDealToastNotification(deal) {
  if (!PROMO_STATE.notifyWebToast) return;
  const container = document.getElementById('promo-toast-container');
  if (!container) return;

  if (_dealToastTimer) {
    clearTimeout(_dealToastTimer);
    _dealToastTimer = null;
  }

  // Max 1 compact offer alert at a time (replaces any previous alert)
  container.innerHTML = '';

  const toastId = 'toast-' + Math.random().toString(36).slice(2, 9);
  const firstReason = (deal.alert_reasons && deal.alert_reasons[0]) || 'Oferta';
  const couponTag = (deal.coupon_code || deal.coupon_info)
    ? `<span class="ui-badge ui-badge--warn ui-mono">${deal.coupon_code || deal.coupon_info}</span>`
    : '';
  const memWarnTag = (deal._unverifiedMemType || deal.unverified_memory_type)
    ? `<span class="ui-badge ui-badge--warn">⚠️ Verificar DDR4/DDR5</span>`
    : '';

  const div = document.createElement('div');
  div.id = toastId;
  div.className = 'ui-deal-toast';
  div.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <span class="ui-badge ui-badge--good">${firstReason}</span>
      <button type="button" onclick="document.getElementById('${toastId}')?.remove()" class="text-slate-400 hover:text-white text-sm leading-none px-1 cursor-pointer" aria-label="Fechar aviso">✕</button>
    </div>
    <div class="flex items-baseline justify-between gap-2">
      <span class="font-bold text-slate-100 text-sm truncate">${deal.matched_name}</span>
      <span class="ui-mono font-bold text-base text-emerald-400 shrink-0">${fmtBRL(deal.price_brl)}</span>
    </div>
    <div class="flex items-center justify-between gap-2 pt-1">
      <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
        ${memWarnTag}
        ${couponTag}
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button type="button" onclick="sendPromoToDuelOrBF('${deal.matched_kind}', '${deal.matched_slug}', ${deal.price_brl}); document.getElementById('${toastId}')?.remove();" class="ui-btn ui-btn--sm ui-btn--ghost">
          ${deal.matched_kind === 'gpu' ? 'Duelo' : 'Ver'}
        </button>
        <a href="${deal.buy_url}" target="_blank" rel="noopener" class="ui-btn ui-btn--sm ui-btn--good">
          Oferta ↗
        </a>
      </div>
    </div>
  `;

  const scheduleDismiss = () => {
    _dealToastTimer = setTimeout(() => {
      const el = document.getElementById(toastId);
      if (el) el.remove();
    }, 7000);
  };

  div.addEventListener('mouseenter', () => {
    if (_dealToastTimer) {
      clearTimeout(_dealToastTimer);
      _dealToastTimer = null;
    }
  });
  div.addEventListener('mouseleave', scheduleDismiss);

  container.appendChild(div);
  scheduleDismiss();
}

function fireWindowsNativeNotification(deal) {
  const reasons = (deal.alert_reasons || []).join(' • ');
  const bfHead = deal.bf_alert_banner ? `${deal.bf_alert_banner} • ` : '';
  const couponTxt = (deal.coupon_code || deal.coupon_info) ? ` | Cupom: ${deal.coupon_code || deal.coupon_info}` : '';
  const title = `🔥 ${deal.matched_name} por ${fmtBRL(deal.price_brl)}`;
  const line1 = `${bfHead}${reasons}${couponTxt}`;
  const line2 = `Canal @${deal.channel_id} — Clique para abrir oferta`;
  const url = deal.buy_url && deal.buy_url.startsWith('http') ? deal.buy_url : (deal.post_url || '');

  // 1. Trigger real Windows 10/11 OS Toast / Popup via server.py (local server only)
  if ((PROMO_STATE.notifyWinToast || PROMO_STATE.notifyWinPopup) && isLocalServerHost()) {
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
  const bfLine = deal.bf_alert_banner ? `${deal.bf_alert_banner}\n` : '';
  const couponTxt = (deal.coupon_code || deal.coupon_info) ? `\n🎟️ Cupom Necessário: ${deal.coupon_code || deal.coupon_info}` : '';
  const couponTag = (deal.coupon_code || deal.coupon_info) ? ` (c/ Cupom: ${deal.coupon_code || deal.coupon_info})` : '';
  const hbDiffTxt = deal.hb_price_brl > deal.price_brl ? `\n📉 Economia vs Ref: -${formatMoney(deal.savings_vs_hb_brl)} (Ref: ${formatMoney(deal.hb_price_brl)})` : '';
  const title = `🔥 ${deal.matched_name} por ${formatMoney(deal.price_brl)}${couponTag}`;
  const message = `${bfLine}${reasons}${couponTxt}${hbDiffTxt}\n📢 Canal: @${deal.channel_id}\n${deal.title}`;
  const url = deal.buy_url && deal.buy_url.startsWith('http') ? deal.buy_url : (deal.post_url || '');

  const postId = deal.post_id || `${deal.channel_id}_${deal.matched_slug}_${Math.round(deal.price_brl)}`;
  const regId = getActiveRegionId();

  const payload = {
    channel: PROMO_STATE.phoneService || 'ntfy',
    title,
    message,
    url,
    post_id: postId,
    region: regId
  };

  if (PROMO_STATE.phoneService === 'ntfy') {
    payload.topic = PROMO_STATE.ntfyTopic || 'alerta_deal_jz265i';
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

  const activeReg = getActiveRegionId();
  const sampleDeal = activeReg === 'eu' ? {
    matched_kind: 'gpu',
    matched_slug: 'rtx-5060',
    matched_name: 'RTX 5060 8GB (Teste EU)',
    price_brl: 499,
    hb_price_brl: 559,
    savings_vs_hb_brl: 60,
    alert_reasons: ['🏆 CB 95/100', '🔥 DEAL EU', `−${formatMoney(60)} vs Catálogo EU`],
    coupon_code: 'EU10',
    channel_id: 'mydealz_de',
    title: 'GeForce RTX 5060 8GB em oferta verificada na Europa (Caseking / MyDealz)!',
    buy_url: 'https://geizhals.eu/?fs=RTX+5060'
  } : (activeReg === 'mx' ? {
    matched_kind: 'gpu',
    matched_slug: 'rtx-5060',
    matched_name: 'RTX 5060 8GB (Prueba Celular)',
    price_brl: 6434,
    hb_price_brl: 7513,
    savings_vs_hb_brl: 1079,
    alert_reasons: ['🏆 CB 95/100', '🔥 GANGA', `−${formatMoney(1079)} vs Catálogo`],
    coupon_code: 'MX10',
    channel_id: 'promos_gamer_mexico',
    title: 'Tarjeta de Video GeForce RTX 5060 con cupón de descuento en México!',
    buy_url: 'https://www.cyberpuerta.mx/'
  } : {
    matched_kind: 'gpu',
    matched_slug: 'rtx-5060',
    matched_name: 'RTX 5060 8GB (Teste Celular)',
    price_brl: 1849,
    hb_price_brl: 2159,
    savings_vs_hb_brl: 310,
    alert_reasons: ['🏆 CB 95/100', '🔥 PECHINCHA', `−${formatMoney(310)} vs Database`],
    coupon_code: 'PC10',
    channel_id: 'ofertasadrenaline',
    title: 'Placa de Vídeo GeForce RTX 5060 com cupom de desconto nos grupos!',
    buy_url: 'https://t.me/s/ofertasadrenaline'
  });

  const prevSetting = PROMO_STATE.notifyPhone;
  PROMO_STATE.notifyPhone = true;

  try {
    const payload = {
      channel: PROMO_STATE.phoneService || 'ntfy',
      title: activeReg === 'eu'
        ? `🔥 [TESTE EU] ${sampleDeal.matched_name} por ${formatMoney(sampleDeal.price_brl)} (EU10)`
        : (activeReg === 'mx'
          ? `🔥 [PRUEBA] ${sampleDeal.matched_name} por ${formatMoney(sampleDeal.price_brl)} (c/ Cupón: MX10)`
          : `🔥 [TESTE] ${sampleDeal.matched_name} por ${formatMoney(sampleDeal.price_brl)} (c/ Cupom: PC10)`),
      message: activeReg === 'eu'
        ? `🔔 Teste de notificação EU bem-sucedido!\n\n🏆 CB 95/100 • DEAL EU\n🎟️ Cupom: EU10\n📉 Economia: -${formatMoney(60)} vs Catálogo EU\n📢 Fonte: MyDealz DE\n\nRecebida normalmente no celular.`
        : (activeReg === 'mx'
          ? `🔔 ¡Prueba de notificación móvil exitosa!\n\n🏆 CB 95/100 • GANGA\n🎟️ Cupón: MX10\n📉 Ahorro: -${formatMoney(1079)} vs Catálogo\n📢 Canal: @promos_gamer_mexico\n\nRecibida en celular respetando modo No Molestar.`
          : `🔔 Teste de disparo no celular bem-sucedido!\n\n🏆 CB 95/100 • PECHINCHA\n🎟️ Cupom Necessário: PC10\n📉 Economia: -${formatMoney(310)} vs Catálogo\n📢 Canal: @ofertasadrenaline\n\nRecebida como notificação comum (respeitando o modo Não Perturbe e volume padrão).`),
      url: sampleDeal.buy_url,
      force: true,
      region: activeReg
    };

    if (PROMO_STATE.phoneService === 'ntfy') {
      payload.topic = PROMO_STATE.ntfyTopic || 'alerta_deal_jz265i';
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
      document.title = `🔥 (${newAlerts.length}) Pechincha! · GCA`;
    }
  } else if (forceTest) {
    const activeReg = getActiveRegionId();
    // If user clicked "Testar Alerta" and no new unnotified deal existed, show the best qualifying deal or a demo alert
    const sample = qualifying[0] || (activeReg === 'eu' ? {
      matched_kind: 'gpu',
      matched_slug: 'rtx-5060',
      matched_name: 'GeForce RTX 5060 8GB (Teste EU)',
      price_brl: 499,
      hb_price_brl: 559,
      savings_vs_hb_brl: 60,
      cb_score: 95,
      is_high_cb: true,
      is_pechincha: true,
      alert_reasons: [`🏆 CB 95/100`, `🔥 −${formatMoneyShort(60)} vs Catálogo EU`],
      coupon_code: 'EU10',
      channel_id: 'mydealz_de',
      title: 'Teste de Notificação EU: GeForce RTX 5060 em oferta na Europa!',
      buy_url: 'https://geizhals.eu/?fs=RTX+5060'
    } : (activeReg === 'mx' ? {
      matched_kind: 'gpu',
      matched_slug: 'rtx-5060',
      matched_name: 'GeForce RTX 5060 8GB (Prueba México)',
      price_brl: 6434,
      hb_price_brl: 7513,
      savings_vs_hb_brl: 1079,
      cb_score: 95,
      is_high_cb: true,
      is_pechincha: true,
      alert_reasons: [`🏆 CB 95/100`, `🔥 −${formatMoneyShort(1079)} vs Catálogo`],
      coupon_code: 'MX10',
      channel_id: 'promos_gamer_mexico',
      title: 'Prueba de Notificación: Tarjeta de Video RTX 5060 con cupón en México!',
      buy_url: 'https://www.cyberpuerta.mx/'
    } : {
      matched_kind: 'gpu',
      matched_slug: 'rtx-5060',
      matched_name: 'GeForce RTX 5060 8GB (Teste)',
      price_brl: 1849,
      hb_price_brl: 2159,
      savings_vs_hb_brl: 310,
      cb_score: 95,
      is_high_cb: true,
      is_pechincha: true,
      alert_reasons: [`🏆 CB 95/100`, `🔥 −${formatMoneyShort(310)} vs Database`],
      coupon_code: 'PC10',
      channel_id: 'ofertasadrenaline',
      title: 'Teste de Notificação: Placa de Vídeo RTX 5060 com cupom relâmpago nos grupos!',
      buy_url: 'https://t.me/s/ofertasadrenaline'
    }));
    playDealAlertChime();
    showDealToastNotification(sample);
    fireWindowsNativeNotification(sample);
  }
}

window.addEventListener('focus', () => {
  if (document.title.startsWith('🔥')) {
    document.title = 'GCA · Preços de Hardware & Black Friday';
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
  PROMO_STATE.open = true;
  if (typeof switchTab === 'function') {
    switchTab('bf-promos');
  }
  if (!PROMO_STATE.lastData && typeof scanLivePromos === 'function') {
    scanLivePromos(false);
  }
}

function backupOriginalHBPrices(force = false) {
  ['gpus', 'cpus', 'rams', 'laptops'].forEach(group => {
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

function applyFlashPromosToCatalog(forceRefresh = false) {
  if (!DB.gpus || !DB.gpus.length) return;
  backupOriginalHBPrices();

  const activeReg = getActiveRegionId();
  const lastDataReg = (PROMO_STATE.lastData && PROMO_STATE.lastData.region_id)
    ? PROMO_STATE.lastData.region_id.toLowerCase()
    : activeReg;

  // STRICT ISOLATION: Never apply deals if lastData.region_id does not match activeReg!
  const bestMap = (lastDataReg === activeReg && PROMO_STATE.lastData && PROMO_STATE.lastData.best_by_slug) || {};
  let appliedCount = 0;
  let catalogChanged = false;

  const brChannels = new Set(['ofertasadrenaline', 'peperaiohardware', 'iskandarsouza', 'benchpromos', 'kabumofertas', 'nerdofertas', 'ofertastechbr']);

  ['gpus', 'cpus', 'rams', 'laptops'].forEach(group => {
    (DB[group] || []).forEach(it => {
      const prevPrice = it.price_brl;
      const prevCoupon = it.coupon || null;
      const prevStore = it.store_name || '';
      const prevUrl = it.offer_url || '';
      const prevFlashId = it._flashPromo ? it._flashPromo.post_id : null;
      const prevCouponId = it._couponPromo ? it._couponPromo.post_id : null;

      const promo = bestMap[it.slug];
      const promoRegion = (promo && promo.region_id ? promo.region_id : lastDataReg).toLowerCase();
      const promoUrlLower = ((promo && (promo.buy_url || promo.post_url)) || '').toLowerCase();
      const isCrossRegionLeak = promo && (
        (activeReg !== 'br' && (brChannels.has((promo.channel_id || '').toLowerCase()) || /\.br\b|t\.me\/(?:peperaio|ofertasadrenaline|iskandar|kabum|benchpromos|nerdofertas|ofertastechbr)/i.test(promoUrlLower))) ||
        (activeReg === 'eu' && /\.mx\b|cyberpuerta|ddtech|promodescuentos/i.test(promoUrlLower))
      );

      const requiresCoup = Boolean(promo && (promo.requires_coupon || promo.coupon_code || promo.coupon_info || promo.is_conditional_voucher));
      const isCoupVerified = Boolean(promo && promo.coupon_status === 'verified');
      const isStockVerified = Boolean(promo && promo.stock_verified === true);
      const isDirectActive = Boolean(
        PROMO_STATE.applyFlash &&
        promo &&
        promoRegion === activeReg &&
        !isCrossRegionLeak &&
        !promo.is_expired &&
        promo.deal_status === 'active' &&
        isStockVerified &&
        !promo.is_coupon_expired &&
        !requiresCoup &&
        promo.price_brl < it._hbPrice
      );

      if (isDirectActive) {
        it.price_brl = promo.price_brl;
        it.coupon = promo.coupon_code || promo.coupon_info || (activeReg === 'eu' ? 'OFERTA EU' : (activeReg === 'mx' ? 'OFERTA MX' : 'OFERTA DIRETA'));
        it.store_name = promo.store_name || `@${promo.channel_id}`;
        it.offer_url = promo.buy_url || promo.post_url;
        it._flashPromo = promo;
        it._couponPromo = null;
        appliedCount++;
      } else {
        const storeCashPrice = (promo && isStockVerified && promo.live_store_price_brl && promo.live_store_price_brl < it._hbPrice)
          ? promo.live_store_price_brl
          : it._hbPrice;
        it.price_brl = storeCashPrice;
        it.coupon = it._hbCoupon;
        it.store_name = (storeCashPrice < it._hbPrice && promo && promo.store_name) ? promo.store_name : it._hbStore;
        it.offer_url = (storeCashPrice < it._hbPrice && promo && promo.buy_url) ? promo.buy_url : it._hbUrl;
        it._flashPromo = null;
        if (promo && !promo.is_expired && !promo.is_coupon_expired && (isCoupVerified || promo.deal_status === 'unverified_coupon')) {
          it._couponPromo = promo;
        } else {
          it._couponPromo = null;
        }
      }

      const nextFlashId = it._flashPromo ? it._flashPromo.post_id : null;
      const nextCouponId = it._couponPromo ? it._couponPromo.post_id : null;
      if (
        it.price_brl !== prevPrice ||
        (it.coupon || null) !== prevCoupon ||
        (it.store_name || '') !== prevStore ||
        (it.offer_url || '') !== prevUrl ||
        nextFlashId !== prevFlashId ||
        nextCouponId !== prevCouponId
      ) {
        catalogChanged = true;
      }
    });
  });

  // Contagem única de ofertas (topo, Início e Promoções mostram o mesmo número)
  PROMO_STATE.activeOfferCtx = null;
  getActiveOfferCount();

  if (!catalogChanged && !forceRefresh) return;

  enrichGPUsWithContextualMetrics();
  if (typeof enrichLaptopsWithContextualMetrics === 'function') enrichLaptopsWithContextualMetrics();
  if (typeof STATE !== 'undefined' && STATE.activeTab === 'sim') {
    STATE._selectorsDirty = true;
    return;
  }
  if (typeof STATE !== 'undefined') STATE._selectorsDirty = false;
  populateSelectors();
  renderActiveTab();
}

function onToggleApplyFlashPromos(checked) {
  PROMO_STATE.applyFlash = checked;
  applyFlashPromosToCatalog(true);
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
  enableMobileBackgroundKeepAlive(PROMO_STATE.autoSyncEnabled);
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
  if (kind === 'laptop') {
    if (typeof setMainContext === 'function') setMainContext('laptop');
    STATE.laptopDuelCandSlug = slug;
    const sel = document.getElementById('laptop-duel-select-cand');
    if (sel) sel.value = slug;
    if (typeof syncLaptopDuelPriceInputsFromSelection === 'function') syncLaptopDuelPriceInputsFromSelection();
    const pInp = document.getElementById('laptop-duel-price-cand');
    if (pInp) pInp.value = price;
    switchTab('versus');
  } else if (kind === 'gpu') {
    if (typeof setMainContext === 'function') setMainContext('gpu');
    STATE.duelCandSlug = slug;
    const sel = document.getElementById('duel-select-cand');
    if (sel) sel.value = slug;
    if (typeof syncDuelPriceInputsFromSelection === 'function') syncDuelPriceInputsFromSelection();
    const pInp = document.getElementById('duel-price-cand');
    if (pInp) pInp.value = price;
    switchTab('versus');
  } else if (kind === 'cpu') {
    if (typeof setMainContext === 'function') setMainContext('cpu');
    STATE.cpuDuelCandSlug = slug;
    const sel = document.getElementById('cpu-duel-select-cand');
    if (sel) sel.value = slug;
    if (typeof syncCpuDuelPriceInputsFromSelection === 'function') syncCpuDuelPriceInputsFromSelection();
    const pInp = document.getElementById('cpu-duel-price-cand');
    if (pInp) pInp.value = price;
    switchTab('versus');
  } else if (kind === 'mobo' || kind === 'ram' || kind === 'psu') {
    switchTab('builder');
  } else if (kind === 'smartphone') {
    if (typeof setMainContext === 'function') setMainContext('smartphone', false);
    if (typeof setSmartphoneDuelItem === 'function' && slug) setSmartphoneDuelItem(slug, 'cand');
    else switchTab('versus');
  } else if (kind === 'peripheral' || kind === 'peripherals') {
    if (typeof setMainContext === 'function') setMainContext('peripherals', false);
    if (typeof setPeriphMainDuelItem === 'function' && slug) setPeriphMainDuelItem(slug, 'a');
    else switchTab('versus');
  } else if (kind === 'air_fryer' || kind === 'diapers' || kind === 'misc') {
    if (typeof setMainContext === 'function') setMainContext('misc', false);
    if (typeof setMiscMainDuelItem === 'function' && slug) setMiscMainDuelItem(slug, 'a', kind === 'misc' ? null : kind);
    else switchTab('versus');
  } else {
    switchTab('bf');
    const sel = document.getElementById('bf-target-item');
    if (sel) {
      sel.value = slug;
      onBFTargetItemChange();
      const pInp = document.getElementById('bf-input-test-price');
      if (pInp) pInp.value = price;
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

  // Always refresh notified history and coupon status ledger before evaluating deals
  await Promise.all([
    syncNotifiedHistoryFromServer(),
    syncCouponStatusFromServer()
  ]);

  // REGIONAL PIPELINE (MX / EU): Fetch strictly from /api/promos?region=<reg>
  if (activeRegId === 'mx' || activeRegId === 'eu') {
    const isEu = activeRegId === 'eu';
    const cacheFile = isEu ? 'data/promos_cache_eu.json' : 'data/promos_cache_mx.json';
    const scanLabel = isEu
      ? 'Buscando ofertas na Europa (Caseking / MyDealz / Dealabs / Chollometro)...'
      : 'Buscando ofertas y cupones en México (Promodescuentos / Cyberpuerta / DDTech)...';
    const donePrefix = isEu ? 'Radar Europa (€ EUR)' : 'Radar México ($ MXN)';
    const dealNoun = isEu ? 'ofertas na Europa' : 'ofertas en tiendas MX';
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = scanLabel;
    try {
      const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
      let prData = null;
      if (!isStatic) {
        try {
          const apiRes = await fetch(`/api/promos?max_age=${maxAge}&region=${activeRegId}&market=${activeRegId}` + (force ? '&force=1' : ''));
          if (apiRes.ok) prData = await apiRes.json();
        } catch (_) {}
      }

      if ((!prData || !Array.isArray(prData.matched_deals)) && isStatic) {
        try {
          const rawRes = await fetch(`https://raw.githubusercontent.com/Cktto12/pc-part-analyzer-br/main/${cacheFile}?t=` + Date.now(), { cache: 'no-store' });
          if (rawRes.ok) prData = await rawRes.json();
        } catch (_) {}
      }

      if (!prData || !Array.isArray(prData.matched_deals)) {
        try {
          const prRes = await fetch(`${cacheFile}?t=` + Date.now(), { cache: 'no-store' });
          if (prRes.ok) prData = await prRes.json();
        } catch (_) {}
      }

      if (!prData || (!Array.isArray(prData.matched_deals) && !Array.isArray(prData.recent_feed))) {
        try {
          const rawRes = await fetch(`https://raw.githubusercontent.com/Cktto12/pc-part-analyzer-br/main/${cacheFile}?t=` + Date.now(), { cache: 'no-store' });
          if (rawRes.ok) prData = await rawRes.json();
        } catch (_) {}
      }

      if (!prData || typeof prData !== 'object') {
        prData = { ok: true, region_id: activeRegId, scanned_at: new Date().toLocaleTimeString(), channels_scanned: [], matched_count: 0, matched_deals: [], best_by_slug: {}, recent_feed: [] };
      }
      prData.region_id = activeRegId;
      PROMO_STATE.rawPosts = [];
      PROMO_STATE.lastData = prData;
      PROMO_STATE.channelsScanned = prData.channels_scanned || [];
      applyFlashPromosToCatalog();
      checkAndFireDealNotifications(false);
      updateBFPromoEvaluator(true);
      renderPromoRadarPanel();
      if (statusEl) {
        statusEl.textContent = `${donePrefix}: Sincronizado às ${prData.scanned_at || 'agora'} • ${(prData.matched_deals || []).length} ${dealNoun}`;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
    return;
  }

  // BRAZIL PIPELINE: First try backend /api/promos (if local server.py is running), then fetch latest cloud-validated promos_cache.json from GitHub raw,
  // and if force=true on static GitHub Pages, also perform a throttled live Telegram scan (only main feed + extraQ) and merge!
  if (statusEl) statusEl.textContent = 'Sincronizando ofertas em tempo real e validação de estoque/cupons...';
  if (btn) btn.disabled = true;

  try {
    const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';

    // 1. If running on local server.py, let the Python backend do the full scan + 2-layer store & coupon verification
    if (!isStatic && !extraQ && !extraCh) {
      try {
        const apiRes = await fetch(`/api/promos?max_age=${maxAge}&region=br&market=br` + (force ? '&force=1' : ''), { cache: 'no-store' });
        if (apiRes.ok) {
          const prData = await apiRes.json();
          if (prData && Array.isArray(prData.matched_deals)) {
            if (prData.coupon_status) {
              if (!PROMO_STATE.couponStatus) PROMO_STATE.couponStatus = { coupons: {}, deals: {} };
              Object.assign(PROMO_STATE.couponStatus.coupons || {}, prData.coupon_status.coupons || {});
              Object.assign(PROMO_STATE.couponStatus.deals || {}, prData.coupon_status.deals || {});
            }
            PROMO_STATE.lastData = prData;
            PROMO_STATE.channelsScanned = prData.channels_scanned || [];
            applyFlashPromosToCatalog();
            checkAndFireDealNotifications(false);
            updateBFPromoEvaluator(true);
            renderPromoRadarPanel();
            if (statusEl) {
              statusEl.textContent = `Servidor Local (2-Layer Store Verified): Sincronizado às ${prData.scanned_at} • ${prData.matched_deals.length} ofertas`;
            }
            return;
          }
        }
      } catch (_) {}
    }

    // 2. Fetch latest cloud-validated promos_cache.json (from GitHub raw first to bypass CDN lag, then local static file)
    let cloudData = null;
    const cacheUrls = isStatic
      ? [
          `https://raw.githubusercontent.com/Cktto12/pc-part-analyzer-br/main/data/promos_cache.json?t=` + Date.now(),
          `data/promos_cache.json?t=` + Date.now()
        ]
      : [
          `data/promos_cache.json?t=` + Date.now(),
          `https://raw.githubusercontent.com/Cktto12/pc-part-analyzer-br/main/data/promos_cache.json?t=` + Date.now()
        ];
    for (const cUrl of cacheUrls) {
      try {
        const r = await fetch(cUrl, { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          if (d && Array.isArray(d.matched_deals) && d.matched_deals.length > 0) {
            cloudData = d;
            break;
          }
        }
      } catch (_) {}
    }

    if (cloudData && cloudData.coupon_status) {
      if (!PROMO_STATE.couponStatus) PROMO_STATE.couponStatus = { coupons: {}, deals: {} };
      Object.assign(PROMO_STATE.couponStatus.coupons || {}, cloudData.coupon_status.coupons || {});
      Object.assign(PROMO_STATE.couponStatus.deals || {}, cloudData.coupon_status.deals || {});
    }

    // If not forcing a live scrape and no custom search query/channel was entered, use the cloud-validated snapshot immediately
    if (!force && !extraQ && !extraCh && cloudData) {
      const filteredMatches = (cloudData.matched_deals || []).filter(d => (d.age_hours || 0) <= maxAge);
      const filteredFeed = (cloudData.recent_feed || []).filter(d => (d.age_hours || 0) <= maxAge);
      PROMO_STATE.lastData = Object.assign({}, cloudData, {
        matched_count: filteredMatches.length,
        matched_deals: filteredMatches,
        recent_feed: filteredFeed
      });
      PROMO_STATE.channelsScanned = cloudData.channels_scanned || [];
      applyFlashPromosToCatalog();
      checkAndFireDealNotifications(false);
      updateBFPromoEvaluator(true);
      renderPromoRadarPanel();
      if (statusEl) {
        statusEl.textContent = `Nuvem GitHub (Validado): Sincronizado às ${cloudData.scanned_at} • ${filteredMatches.length} ofertas na janela`;
      }
      return;
    }

    // 3. When force=true on GitHub Pages (or custom query/channel), run a throttled live Telegram scrape (1 query per channel, batched 3 at a time)
    const channels = [...getClientPromoChannels()];
    if (extraCh) {
      extraCh.split(',').forEach(raw => {
        const id = raw.trim().replace(/^@/, '').split('/').pop();
        if (id && !channels.some(c => c.id.toLowerCase() === id.toLowerCase())) {
          channels.push({ id, name: `@${id}` });
        }
      });
    }
    const queries = isStatic ? (extraQ ? ['', extraQ] : ['']) : (extraQ ? [...getClientPromoQueries(), extraQ] : [...getClientPromoQueries()]);

    const pairs = [];
    channels.forEach(ch => {
      queries.forEach(q => pairs.push({ ch, q }));
    });

    const allRaw = [];
    const batchSize = isStatic ? 3 : 7;
    for (let i = 0; i < pairs.length; i += batchSize) {
      const slice = pairs.slice(i, i + batchSize);
      const batchRes = await Promise.all(
        slice.map(({ ch, q }) =>
          fetchTelegramChannelHTML(ch.id, q)
            .then(htmlStr => (htmlStr ? parseTelegramHTMLInBrowser(htmlStr, ch.id, ch.name) : []))
            .catch(() => [])
        )
      );
      batchRes.forEach(arr => allRaw.push(...arr));
    }

    // Merge live-scraped posts with cloudData so we never lose cloud-validated deals if a CORS proxy throttles
    if (allRaw.length === 0 && cloudData) {
      const filteredMatches = (cloudData.matched_deals || []).filter(d => (d.age_hours || 0) <= maxAge);
      const filteredFeed = (cloudData.recent_feed || []).filter(d => (d.age_hours || 0) <= maxAge);
      PROMO_STATE.lastData = Object.assign({}, cloudData, {
        matched_count: filteredMatches.length,
        matched_deals: filteredMatches,
        recent_feed: filteredFeed
      });
      PROMO_STATE.channelsScanned = cloudData.channels_scanned || [];
      applyFlashPromosToCatalog();
      checkAndFireDealNotifications(false);
      updateBFPromoEvaluator(true);
      renderPromoRadarPanel();
      if (statusEl) {
        statusEl.textContent = `Nuvem GitHub (Validado): Sincronizado às ${cloudData.scanned_at} • ${filteredMatches.length} ofertas`;
      }
      return;
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

    // Merge cloudData's validated matched_deals and recent_feed if any channel wasn't returned by the proxy
    if (cloudData) {
      const seenMatched = new Set(data.matched_deals.map(d => d.post_id));
      (cloudData.matched_deals || []).forEach(cd => {
        if ((cd.age_hours || 0) <= maxAge && !seenMatched.has(cd.post_id)) {
          if (!extraQ || (cd.title || '').toLowerCase().includes(extraQ.toLowerCase())) {
            data.matched_deals.push(cd);
            seenMatched.add(cd.post_id);
          }
        }
      });
      const seenFeed = new Set(data.recent_feed.map(d => d.post_id));
      (cloudData.recent_feed || []).forEach(cf => {
        if ((cf.age_hours || 0) <= maxAge && !seenFeed.has(cf.post_id)) {
          if (!extraQ || (cf.title || '').toLowerCase().includes(extraQ.toLowerCase())) {
            data.recent_feed.push(cf);
            seenFeed.add(cf.post_id);
          }
        }
      });
      data.matched_deals.sort((a, b) => (
        (a.is_expired ? 1 : 0) - (b.is_expired ? 1 : 0) ||
        (a.is_coupon_expired ? 1 : 0) - (b.is_coupon_expired ? 1 : 0) ||
        ((a.age_hours > 24) - (b.age_hours > 24)) ||
        (b.savings_vs_hb_brl - a.savings_vs_hb_brl) ||
        (a.price_brl - b.price_brl)
      ));
      data.recent_feed.sort((a, b) => (a.age_hours || 0) - (b.age_hours || 0));
      data.matched_count = data.matched_deals.length;
      if (cloudData.best_by_slug) {
        Object.keys(cloudData.best_by_slug).forEach(slug => {
          const cb = cloudData.best_by_slug[slug];
          if (cb && cb.deal_status === 'active' && cb.stock_verified && !cb.is_expired && (!data.best_by_slug[slug] || cb.price_brl < data.best_by_slug[slug].price_brl)) {
            data.best_by_slug[slug] = cb;
          }
        });
      }
    }

    PROMO_STATE.lastData = data;
    applyFlashPromosToCatalog();
    checkAndFireDealNotifications(false);
    updateBFPromoEvaluator(true);
    renderPromoRadarPanel();
    if (statusEl) {
      statusEl.textContent = `Radar Tempo Real + Validação Lojas às ${data.scanned_at} • ${data.matched_deals.length} ofertas`;
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

  if (typeof renderHomeTab === 'function' && typeof STATE !== 'undefined' && STATE.activeTab === 'home') {
    renderHomeTab();
  }

  const matchedEl = document.getElementById('promo-matched-list');
  const feedEl = document.getElementById('promo-general-feed');
  const sumEl = document.getElementById('promo-matched-summary');
  const sitewiseEl = document.getElementById('sitewise-validator-text');

  const maxAge = parseFloat(document.getElementById('select-promo-max-age')?.value || document.getElementById('promo-max-age')?.value || '48') || 48;
  const nowMs = Date.now();
  const rawDeals = (data.matched_deals || []).map(d => {
    const copy = { ...d };
    if (copy.timestamp) {
      const t = Date.parse(copy.timestamp);
      if (!isNaN(t)) copy.age_hours = Math.round(Math.max(0, (nowMs - t) / 3600000) * 10) / 10;
    }
    return _applyCouponAndExpiryOverlay(copy);
  }).filter(d => {
    if (!d._isStoreDirect && !d.timestamp) return false;
    if ((d.age_hours != null ? Number(d.age_hours) : 999) > maxAge) return false;
    if (d.is_expired || d.is_coupon_expired || d.deal_status === 'out_of_stock' || d.deal_status === 'expired') return false;
    if (!dealMatchesPromoPreferences(d)) return false;
    return true;
  });
  // Weigh direct retailer default pricing (before coupons) alongside group promotions:
  // If a retailer's default price is cheaper than any active group deal for that slug (or no group deal exists) and it's a BF/near-BF/30d-drop, include it!
  const bestActiveGroupBySlug = new Map();
  rawDeals.forEach(d => {
    if (d.matched_slug) {
      const prev = bestActiveGroupBySlug.get(d.matched_slug);
      if (!prev || d.price_brl < prev) bestActiveGroupBySlug.set(d.matched_slug, d.price_brl);
    }
  });
  const storeExtras = [];
  [['gpus', 'gpu'], ['cpus', 'cpu'], ['laptops', 'laptop']].forEach(([grp, kindName]) => {
    (DB[grp] || []).forEach(it => {
      if (!it || !it.slug || !it.price_brl || it.store_name === 'referencia' || it.is_xeon) return;
      const bestGroupP = bestActiveGroupBySlug.get(it.slug);
      if (bestGroupP !== undefined && bestGroupP <= it.price_brl) return; // group deal is already cheaper
      const avg30 = it.price_stats && it.price_stats.avg_30d;
      const drop30 = (avg30 && avg30 > 0) ? ((avg30 - it.price_brl) / avg30) * 100 : 0;
      const tgt = it.price_stats && it.price_stats.target_price;
      const isGood = (tgt && it.price_brl <= tgt * 1.05) || drop30 >= 3;
      if (!isGood) return;
      const extraDeal = {
        post_id: `store_${it.slug}`,
        matched_kind: kindName,
        matched_slug: it.slug,
        matched_name: it.name,
        title: it.offer_title || it.name,
        price_brl: it.price_brl,
        hb_price_brl: it.price_brl,
        savings_vs_hb_brl: 0,
        store_name: it.store_name || (getActiveRegionId() === 'eu' ? 'EU Store' : (getActiveRegionId() === 'mx' ? 'Tienda MX' : 'Loja BR')),
        channel_id: 'catalogo_lojas',
        buy_url: it.offer_url || it.href || '#',
        post_url: it.href || it.offer_url || '#',
        age_hours: 0.5,
        deal_status: 'active',
        stock_verified: true,
        requires_coupon: false,
        _isStoreDirect: true
      };
      if (!dealMatchesPromoPreferences(extraDeal, it)) return;
      storeExtras.push(extraDeal);
    });
  });
  const deals = [...rawDeals, ...storeExtras];
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
          const isOutOfStock = d.is_expired || d.deal_status === 'out_of_stock' || d.deal_status === 'expired';
          const rawCoup = d.coupon_code || d.coupon_info;
          const reqCoup = Boolean(d.requires_coupon || rawCoup);
          let couponBadge = '';
          if (rawCoup) {
            const cleanCoup = (d.coupon_code || rawCoup).replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase() || rawCoup;
            const uStat = typeof getCouponUserStatus === 'function' ? getCouponUserStatus(cleanCoup) : null;
            const isExp = isCouponExpired || (uStat && uStat.status === 'expired');
            const isVerified = !isExp && (d.coupon_status === 'verified' || (uStat && uStat.status === 'working'));
            let freshTag = '';
            if (isExp) {
              freshTag = '<span class="text-rose-400 font-bold ml-1">❌ Expirado</span>';
            } else if (isVerified) {
              freshTag = '<span class="text-emerald-300 font-bold ml-1">✅ Confirmado na Loja</span>';
            } else {
              freshTag = `<span class="text-amber-300 font-semibold ml-1">⚠️ Validar no Carrinho${d.live_store_price_brl ? ` (Sem cupom: ${fmtBRLShort(d.live_store_price_brl)})` : ''}</span>`;
            }

            couponBadge = `
              <button onclick="copyCouponAndOpen('${cleanCoup}', '${d.buy_url || d.post_url}')" class="px-1.5 py-0.5 rounded ${isExp ? 'bg-rose-500/20 text-rose-300 line-through border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'} font-mono text-xs cursor-pointer inline-flex items-center gap-1" title="Clique para copiar cupom e testar na loja">
                🎟️ ${cleanCoup} 📋 ${freshTag}
              </button>
            `;
          } else if (!isOutOfStock) {
            if (d.stock_verified && d.deal_status === 'active') {
              couponBadge = `<span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-xs font-semibold" title="${d.deal_status_reason || 'Oferta direta confirmada em estoque'}">✅ Em Estoque (Sem Cupom)</span>`;
            } else {
              couponBadge = `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono text-xs font-semibold" title="${d.deal_status_reason || 'Oferta direta no link'}">⚡ Oferta Direta</span>`;
            }
          }
          const cbBadge = d.cb_score != null
            ? `<span class="px-1.5 py-0.5 rounded ${d.is_high_cb ? 'bg-purple-500/30 text-purple-200 border border-purple-400/50 font-extrabold' : 'bg-slate-800 text-slate-300'} font-mono text-xs">${d.is_high_cb ? '🏆 ' : ''}CB ${d.cb_score}/100</span>`
            : '';
          const pechBadge = d.is_pechincha
            ? `<span class="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-200 border border-rose-400/50 font-mono font-extrabold text-xs">🔥 PECHINCHA</span>`
            : '';
          const statusBadge = isOutOfStock
            ? `<span class="px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-300 border border-rose-500/40 font-mono text-xs font-bold">⚠️ ${d.deal_status === 'out_of_stock' ? 'Esgotado' : 'Encerrado'}</span>`
            : (isCouponExpired && d.coupon_discount_revoked
              ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 border border-amber-500/40 font-mono text-xs font-semibold">Preço Sem Cupom</span>`
              : '');
          const safeId = (d.post_id || '').replace(/[^a-zA-Z0-9]/g, '_');
          const cleanCoupCode = (d.coupon_code || '').replace(/[^a-zA-Z0-9_\-]/g, '').toUpperCase();
          const isVerifiedActive = !isOutOfStock && !isCouponExpired && d.stock_verified && (reqCoup ? d.coupon_status === 'verified' : d.deal_status === 'active');
          const isUnverifiedCoup = !isOutOfStock && !isCouponExpired && !isVerifiedActive && (reqCoup || d.deal_status === 'unverified_coupon');
          const testBtnClass = isVerifiedActive
            ? 'px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 font-semibold text-xs cursor-pointer inline-flex items-center gap-1'
            : isUnverifiedCoup
              ? 'px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 font-semibold text-xs cursor-pointer inline-flex items-center gap-1'
              : 'px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-sky-400 border border-slate-700 font-semibold text-xs cursor-pointer inline-flex items-center gap-1';
          const testBtnLabel = isVerifiedActive ? '✅ Em Estoque' : isUnverifiedCoup ? '⚠️ Testar Cupom' : '🧪 Testar';
          return `
            <div class="p-3 rounded-xl bg-slate-950/80 border ${isOutOfStock ? 'border-rose-900/60 opacity-75' : isHot ? 'border-amber-400/60 shadow-md shadow-amber-500/10' : isCheaper ? 'border-emerald-500/40' : 'border-slate-800'} flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-bold text-xs">${d.matched_name}</span>
                  <span class="font-mono font-extrabold text-sm ${isOutOfStock ? 'text-slate-400 line-through' : isCheaper ? 'text-emerald-400' : 'text-white'}">
                    ${d.coupon_discount_revoked && d.promo_price_brl ? `<span class="line-through text-slate-500 text-xs mr-1">${fmtBRL(d.promo_price_brl)}</span>` : ''}
                    ${fmtBRL(d.price_brl)}
                  </span>
                  ${isCheaper && !isOutOfStock
                    ? `<span class="text-xs font-mono text-emerald-300 font-bold">(−${fmtBRLShort(d.savings_vs_hb_brl)} vs Ref ${fmtBRLShort(d.hb_price_brl)})</span>`
                    : `<span class="text-xs font-mono text-slate-500">(Ref: ${fmtBRLShort(d.hb_price_brl)})</span>`}
                  ${cbBadge}
                  ${pechBadge}
                  ${statusBadge}
                  ${couponBadge}
                </div>
                <div class="text-xs text-slate-300 truncate max-w-xl" title="${d.title}">${d.title}</div>
                <div class="text-xs font-mono text-slate-500">
                  Canal: <a href="${d.post_url}" target="_blank" class="text-sky-400 hover:underline">@${d.channel_id} ↗</a> • há ${d.age_hours}h${d.store_name && d.store_name !== 'E-commerce' ? ` • Loja: <span class="text-slate-300">${d.store_name}</span>` : ''}
                  ${d.coupon_url ? ` • <a href="${d.coupon_url}" target="_blank" class="text-amber-300 hover:underline">Resgatar Cupom ↗</a>` : ''}
                  ${d.deal_status_reason ? ` • <span class="${isOutOfStock ? 'text-rose-400/90' : isVerifiedActive ? 'text-emerald-400/90' : 'text-amber-400/90'}">${d.deal_status_reason}</span>` : ''}
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button id="btn-test-${safeId}" onclick="testDealCouponNow('${d.post_id}', '${d.buy_url}', '${cleanCoupCode}', ${d.promo_price_brl || d.price_brl}, '${d.matched_slug || ''}', '${d.matched_kind || 'gpu'}')" class="${testBtnClass}" title="Testar se o produto está em estoque e se o cupom aplica na loja">
                  ${testBtnLabel}
                </button>
                <button onclick="sendPromoToDuelOrBF('${d.matched_kind}', '${d.matched_slug}', ${d.price_brl})" class="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-300 font-semibold text-xs cursor-pointer">
                  ${d.matched_kind === 'gpu' ? 'Duelo' : 'Testar BF'}
                </button>
                <a href="${d.buy_url}" target="_blank" class="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs">
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
            ${f.coupon_code ? `<span class="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-xs">🎟️ ${f.coupon_code}</span>` : ''}
            <span class="text-xs font-mono text-slate-500">@${f.channel_id} • ${f.age_hours}h</span>
          </div>
          <div class="text-xs text-slate-300 truncate" title="${f.title}">${f.title}</div>
        </div>
        <a href="${f.buy_url}" target="_blank" class="px-2 py-1 rounded bg-slate-800 hover:bg-sky-500 hover:text-slate-950 text-sky-300 text-xs font-semibold shrink-0">Abrir ↗</a>
      </div>
    `).join('');
  }
  if (typeof STATE !== 'undefined' && STATE.activeTab === 'bf-promos' && typeof renderBFPromosCardsTab === 'function') {
    renderBFPromosCardsTab();
  }
}

const _HB_CLIENT_CACHE = new Map();
const _HB_CLIENT_INFLIGHT = new Map();

async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function _extractNextJsonArray(txt, key) {
  const idx = txt.indexOf(`"${key}":[`);
  if (idx === -1) return [];
  const start = txt.indexOf('[', idx);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < txt.length; i++) {
    const ch = txt[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (ch === '\\') { esc = true; }
      else if (ch === '"') { inStr = false; }
    } else {
      if (ch === '"') { inStr = true; }
      else if (ch === '[') { depth++; }
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(txt.slice(start, i + 1)); } catch (_) { return []; }
        }
      }
    }
  }
  return [];
}

async function _fetchHBLiveTextCached(kind, slug) {
  const catMap = { gpu: 'placas-de-video', cpu: 'processadores', ram: 'memorias-ram', mobo: 'placas-mae', psu: 'fontes' };
  const cat = catMap[kind || 'gpu'] || 'placas-de-video';
  const cacheKey = `${cat}/${slug}`;
  const cached = _HB_CLIENT_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.ts < 180000)) {
    return cached.txt;
  }
  if (_HB_CLIENT_INFLIGHT.has(cacheKey)) {
    return await _HB_CLIENT_INFLIGHT.get(cacheKey);
  }

  const p = (async () => {
    const hbUrl = `https://www.hardwarebarato.com/produtos/${cat}/${slug}`;
    const proxies = [
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(hbUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(hbUrl)}`
    ];
    try {
      const txt = await Promise.any(proxies.map(async (pUrl) => {
        const r = await fetchWithTimeout(pUrl, { cache: 'no-store' }, 4500);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const rawHtml = await r.text();
        const unescaped = rawHtml.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        if (!unescaped.includes('"data":[') || (!unescaped.includes('"storeName":') && !unescaped.includes('"store":'))) {
          throw new Error('Invalid HB payload');
        }
        return unescaped;
      }));
      _HB_CLIENT_CACHE.set(cacheKey, { ts: Date.now(), txt });
      return txt;
    } catch (_) {
      return null;
    } finally {
      _HB_CLIENT_INFLIGHT.delete(cacheKey);
    }
  })();

  _HB_CLIENT_INFLIGHT.set(cacheKey, p);
  return await p;
}

async function verifyDealOnStaticClient(postId, buyUrl, couponCode, expectedPrice, slug, kind, options = {}) {
  if (!options.skipSync) {
    await syncCouponStatusFromServer();
  }
  const dealsMap = (PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.deals) || {};
  const couponsMap = (PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.coupons) || {};
  const cleanCoup = (couponCode || '').trim().toUpperCase();
  const normBuyUrl = _unwrapAffiliateUrlClient(buyUrl);

  // Check if Hardware Barato live product page can be fetched via CORS proxy (cached + 4.5s timeout race)
  if (slug && getActiveRegionId() === 'br') {
    const txt = await _fetchHBLiveTextCached(kind, slug);
    if (txt) {
      const uLow = (normBuyUrl || '').toLowerCase();
      let storeKey = '';
      let storeLabel = 'Loja';
      if (uLow.includes('kabum')) { storeKey = 'kabum'; storeLabel = 'KaBuM!'; }
      else if (uLow.includes('terabyte')) { storeKey = 'terabyte'; storeLabel = 'Terabyte'; }
      else if (uLow.includes('pichau')) { storeKey = 'pichau'; storeLabel = 'Pichau'; }
      else if (uLow.includes('mercadolivre') || uLow.includes('meli.la')) { storeKey = 'mercado-livre'; storeLabel = 'Mercado Livre'; }
      else if (uLow.includes('shopee')) { storeKey = 'shopee'; storeLabel = 'Shopee'; }
      else if (uLow.includes('amazon') || uLow.includes('amzn.to') || uLow.includes('a.co/')) { storeKey = 'amazon'; storeLabel = 'Amazon BR'; }
      else if (uLow.includes('magalu') || uLow.includes('magazine')) { storeKey = 'magazine-luiza'; storeLabel = 'Magalu'; }
      else if (uLow.includes('gigantec')) { storeKey = 'gigantec'; storeLabel = 'Gigantec'; }
      else if (uLow.includes('patoloco')) { storeKey = 'pato-loco'; storeLabel = 'Pato Loco'; }
      else if (uLow.includes('guerradigital')) { storeKey = 'guerra-digital'; storeLabel = 'Guerra Digital'; }
      else if (uLow.includes('fgtec')) { storeKey = 'fgtec'; storeLabel = 'FGTEC'; }

      const activeCoupons = new Set();
      const couponsArr = _extractNextJsonArray(txt, 'coupons');
      couponsArr.forEach(c => {
        if (!c || (c.archivedAt !== null && c.archivedAt !== undefined)) return;
        const code = (c.code || c.coupon || '').trim().toUpperCase();
        if (code) activeCoupons.add(code);
      });

      const offersArr = _extractNextJsonArray(txt, 'data');
      if (offersArr.length && storeKey) {
        const storePrices = [];
        offersArr.forEach(o => {
          if (!o) return;
          const stName = String(o.storeName || o.store || '').toLowerCase();
          if (!stName.includes(storeKey)) return;
          const pRaw = Number(o.price);
          if (pRaw > 0) {
            const pBrl = Number.isInteger(pRaw) ? Math.round(pRaw) / 100 : pRaw;
            storePrices.push(pBrl);
          }
          if (o.coupon && o.coupon.code) {
            activeCoupons.add(String(o.coupon.code).trim().toUpperCase());
          }
        });
        if (storePrices.length === 0) {
          return {
            status: 'out_of_stock',
            stock_verified: false,
            reason: `Produto esgotado na ${storeLabel} (0 unidades em estoque hoje)`
          };
        }
        const minStorePrice = Math.min(...storePrices);
        if (!cleanCoup) {
          if (expectedPrice && minStorePrice > expectedPrice * 1.06) {
            return {
              status: 'out_of_stock',
              live_price: minStorePrice,
              stock_verified: false,
              reason: `Oferta encerrada na ${storeLabel} — menor preço em estoque hoje: ${fmtBRL(minStorePrice)}`
            };
          }
          return {
            status: 'active',
            coupon_status: 'none',
            live_price: minStorePrice,
            stock_verified: true,
            store_name: storeLabel,
            reason: `Confirmado em estoque na ${storeLabel} por ${fmtBRL(minStorePrice)} (sem depender de cupom)`
          };
        } else {
          if (activeCoupons.has(cleanCoup)) {
            return {
              status: 'active',
              coupon_status: 'verified',
              live_price: minStorePrice,
              stock_verified: true,
              store_name: storeLabel,
              reason: `Cupom ${cleanCoup} confirmado ativo na ${storeLabel}!`
            };
          }
          if (expectedPrice && minStorePrice > Math.max(expectedPrice * 1.22, expectedPrice + 400)) {
            return {
              status: 'expired',
              coupon_status: 'expired',
              live_price: minStorePrice,
              stock_verified: false,
              store_name: storeLabel,
              reason: `Oferta encerrada na ${storeLabel} — preço subiu para ${fmtBRL(minStorePrice)}`
            };
          }
          return {
            status: 'unverified_coupon',
            coupon_status: 'unverified',
            live_price: minStorePrice,
            stock_verified: true,
            store_name: storeLabel,
            reason: `Em estoque na ${storeLabel} por ${fmtBRL(minStorePrice)} (sem cupom). Desconto de ${cleanCoup} depende de validação no carrinho`
          };
        }
      }
    }
  }

  // Fallback to cloud-synced coupon_status.json
  const dStat = (postId && (dealsMap[postId] || dealsMap[postId.toLowerCase()])) || (buyUrl && dealsMap[buyUrl]);
  const cStat = cleanCoup ? couponsMap[cleanCoup] : null;
  if (dStat) return dStat;
  if (cStat) return cStat;
  return {
    status: cleanCoup ? 'unverified_coupon' : 'untested',
    coupon_status: cleanCoup ? 'unverified' : 'none',
    stock_verified: false,
    reason: cleanCoup
      ? `Cupom ${cleanCoup} pendente de teste no carrinho da loja`
      : `Verifique a disponibilidade diretamente no link da loja`
  };
}

function _applyDealStatusInMemory(postId, buyUrl, couponCode, res, isStatic, notifyUser = true) {
  if (!PROMO_STATE.couponStatus) PROMO_STATE.couponStatus = { coupons: {}, deals: {} };
  if (!PROMO_STATE.couponStatus.coupons) PROMO_STATE.couponStatus.coupons = {};
  if (!PROMO_STATE.couponStatus.deals) PROMO_STATE.couponStatus.deals = {};

  const safeId = (postId || '').replace(/[^a-zA-Z0-9]/g, '_');
  const btn = document.getElementById(`btn-test-${safeId}`);

  const entry = {
    status: res.status || 'untested',
    coupon_status: res.coupon_status || (couponCode ? 'unverified' : 'none'),
    stock_verified: Boolean(res.stock_verified),
    live_price: res.live_price || null,
    store_name: res.store_name || null,
    reason: res.reason || '',
    updated_at: new Date().toLocaleTimeString('pt-BR')
  };

  if (postId) {
    PROMO_STATE.couponStatus.deals[postId] = entry;
    PROMO_STATE.couponStatus.deals[postId.toLowerCase()] = entry;
  }
  if (buyUrl) {
    PROMO_STATE.couponStatus.deals[buyUrl] = entry;
  }

  const matchedDeals = (PROMO_STATE.lastData && Array.isArray(PROMO_STATE.lastData.matched_deals))
    ? PROMO_STATE.lastData.matched_deals
    : [];

  if (res.status === 'expired' || res.status === 'out_of_stock') {
    if (couponCode && res.coupon_status === 'expired') {
      PROMO_STATE.couponStatus.coupons[couponCode.toUpperCase()] = {
        status: 'expired',
        reason: res.reason,
        updated_at: new Date().toLocaleTimeString('pt-BR')
      };
    }
    if (btn) {
      btn.disabled = false;
      btn.className = "px-2 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold text-xs";
      btn.innerHTML = res.status === 'out_of_stock' ? `⚠️ Esgotado` : `❌ Expirado`;
      btn.title = res.reason;
    }
    matchedDeals.forEach(d => {
      if (d.post_id === postId) {
        d.is_expired = true;
        d.deal_status = res.status;
        d.deal_status_reason = res.reason;
        if (res.live_price && res.live_price > d.price_brl) {
          d.price_brl = res.live_price;
          d.coupon_discount_revoked = true;
        }
      }
    });
    if (notifyUser && typeof showWebToastNotification === 'function') {
      showWebToastNotification(
        res.status === 'out_of_stock' ? `⚠️ Produto Esgotado` : `❌ Oferta/Cupom Encerrado`,
        `${res.reason}`
      );
    }
  } else if (res.status === 'unverified_coupon' || res.status === 'untested') {
    if (couponCode) {
      PROMO_STATE.couponStatus.coupons[couponCode.toUpperCase()] = {
        status: 'unverified',
        reason: res.reason,
        updated_at: new Date().toLocaleTimeString('pt-BR')
      };
    }
    if (btn) {
      btn.disabled = false;
      btn.className = "px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold text-xs";
      btn.innerHTML = `⚠️ No Carrinho`;
      btn.title = res.reason;
    }
    matchedDeals.forEach(d => {
      if (d.post_id === postId) {
        d.is_expired = false;
        d.deal_status = res.status;
        d.deal_status_reason = res.reason;
        if (res.live_price) d.live_store_price_brl = res.live_price;
      }
    });
    if (notifyUser && typeof showWebToastNotification === 'function') {
      showWebToastNotification(`⚠️ Verificação de Cupom`, `${res.reason}`);
    }
  } else {
    if (couponCode) {
      PROMO_STATE.couponStatus.coupons[couponCode.toUpperCase()] = {
        status: 'verified',
        reason: res.reason,
        updated_at: new Date().toLocaleTimeString('pt-BR')
      };
    }
    if (btn) {
      btn.disabled = false;
      btn.className = "px-2 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold text-xs";
      btn.innerHTML = `✅ Em Estoque`;
      btn.title = res.reason;
    }
    matchedDeals.forEach(d => {
      if (d.post_id === postId) {
        d.is_expired = false;
        d.deal_status = 'active';
        d.stock_verified = true;
        d.deal_status_reason = res.reason;
      }
    });
    if (notifyUser && typeof showWebToastNotification === 'function') {
      showWebToastNotification(`✅ Confirmado em Estoque!`, `${res.reason}`);
    }
  }
}

async function testDealCouponNow(postId, buyUrl, couponCode, expectedPrice, slug, kind, options = {}) {
  const safeId = (postId || '').replace(/[^a-zA-Z0-9]/g, '_');
  const btn = document.getElementById(`btn-test-${safeId}`);
  const skipRender = Boolean(options.skipRender);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin">⏳</span> Testando...`;
  }

  try {
    const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    let res = null;

    if (!isStatic) {
      try {
        const matchObj = (PROMO_STATE.lastData && Array.isArray(PROMO_STATE.lastData.matched_deals))
          ? PROMO_STATE.lastData.matched_deals.find(d => d && d.post_id === postId)
          : null;
        const resolvedAge = options.age_hours != null ? options.age_hours : (matchObj ? matchObj.age_hours : null);
        const q = new URLSearchParams({
          url: buyUrl || '',
          code: couponCode || '',
          price: expectedPrice || '',
          post_id: postId || '',
          slug: slug || '',
          kind: kind || 'gpu'
        });
        if (resolvedAge != null && !isNaN(Number(resolvedAge))) {
          q.set('age_hours', String(resolvedAge));
        }
        const resp = await fetchWithTimeout(`/api/test-coupon?${q.toString()}`, { cache: 'no-store' }, 9000);
        if (resp.ok) {
          const data = await resp.json();
          res = data.result || null;
        }
      } catch (_) {}
    }

    if (!res) {
      res = await verifyDealOnStaticClient(postId, buyUrl, couponCode, expectedPrice, slug, kind, { skipSync: options.skipSync });
    }

    _applyDealStatusInMemory(postId, buyUrl, couponCode, res, isStatic, !skipRender);

    if (!skipRender) {
      try {
        localStorage.setItem(getCouponStatusCacheKey(), JSON.stringify(PROMO_STATE.couponStatus));
      } catch (_) {}
      if (!isStatic && (res.status === 'expired' || res.status === 'out_of_stock')) {
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
      }
      if (PROMO_STATE.rawPosts && PROMO_STATE.rawPosts.length) {
        PROMO_STATE.lastData = buildPromoPayloadClient(PROMO_STATE.rawPosts, PROMO_STATE.channelsScanned, 48);
      }
      applyFlashPromosToCatalog();
      renderPromoRadarPanel();
      if (typeof onBFTargetItemChange === 'function') onBFTargetItemChange(true);
    }
    return res;
  } catch (err) {
    console.warn('Erro ao testar cupom:', err);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `🧪 Testar`;
    }
    return null;
  }
}

async function testAllRadarCoupons() {
  const btn = document.getElementById('btn-test-all-coupons');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin">⏳</span> Testando Cupons...`;
  }

  const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
  const deals = (PROMO_STATE.lastData && PROMO_STATE.lastData.matched_deals) || [];
  const toTest = deals.slice(0, 16);
  let tested = 0;
  let expiredCount = 0;

  try {
    let usedBackendBatch = false;
    if (!isStatic && toTest.length > 0) {
      try {
        const resp = await fetchWithTimeout('/api/test-all-coupons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            region: getActiveRegionId(),
            max_items: toTest.length,
            deals: toTest
          })
        }, 40000);
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.ok) {
            usedBackendBatch = true;
            tested = data.tested || toTest.length;
            if (data.coupon_status) {
              PROMO_STATE.couponStatus = data.coupon_status;
              try {
                localStorage.setItem(getCouponStatusCacheKey(), JSON.stringify(PROMO_STATE.couponStatus));
              } catch (_) {}
            }
            if (PROMO_STATE.lastData) {
              if (Array.isArray(data.matched_deals)) {
                PROMO_STATE.lastData.matched_deals = data.matched_deals;
                expiredCount = data.matched_deals.filter(d => d.is_expired || d.deal_status === 'expired' || d.deal_status === 'out_of_stock').length;
              }
              if (data.best_by_slug) PROMO_STATE.lastData.best_by_slug = data.best_by_slug;
              if (data.last_sitewise_test_at) PROMO_STATE.lastData.last_sitewise_test_at = data.last_sitewise_test_at;
            }
          }
        }
      } catch (err) {
        console.warn('Batch endpoint fallback to concurrent client mode:', err);
      }
    }

    if (!usedBackendBatch && toTest.length > 0) {
      await syncCouponStatusFromServer();
      let idx = 0;
      const CONCURRENCY = 5;
      const runWorker = async () => {
        while (idx < toTest.length) {
          const d = toTest[idx++];
          try {
            await testDealCouponNow(
              d.post_id,
              d.buy_url,
              d.coupon_code || '',
              d.promo_price_brl || d.price_brl,
              d.matched_slug || '',
              d.matched_kind || 'gpu',
              { skipRender: true, skipSync: true }
            );
            if (d.is_expired || d.deal_status === 'expired' || d.deal_status === 'out_of_stock') {
              expiredCount++;
            }
          } catch (_) {}
          tested++;
          if (btn) {
            btn.innerHTML = `<span class="inline-block animate-spin">⏳</span> Testando (${tested}/${toTest.length})...`;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toTest.length) }, runWorker));
      try {
        localStorage.setItem(getCouponStatusCacheKey(), JSON.stringify(PROMO_STATE.couponStatus));
      } catch (_) {}
    }

    if (!usedBackendBatch && PROMO_STATE.rawPosts && PROMO_STATE.rawPosts.length) {
      PROMO_STATE.lastData = buildPromoPayloadClient(PROMO_STATE.rawPosts, PROMO_STATE.channelsScanned, 48);
    }
    applyFlashPromosToCatalog();
    renderPromoRadarPanel();
    if (typeof onBFTargetItemChange === 'function') onBFTargetItemChange(true);

    if (typeof showWebToastNotification === 'function') {
      showWebToastNotification(
        `🧪 Teste Concluído (${tested} ofertas)`,
        expiredCount > 0
          ? `${expiredCount} ofertas esgotadas/expiradas foram filtradas automaticamente!`
          : `Validação de estoque e cupons atualizada.`
      );
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🧪 Testar Cupons & Links</span>`;
    }
  }
}

// =========================================================================
// TAB 5B: BLACK FRIDAY PROMOÇÕES AO VIVO (1 ROW/CARD, IMAGENS, POLL 10s)
// =========================================================================
let BF_CARDS_FILTER = 'all';
let _bfLiveTimer = null;
let _bfLiveEnabled = true;
let _bfLiveBusy = false;
const _bfAutoTestedIds = new Set();

function setBFCardsFilter(filterKey) {
  BF_CARDS_FILTER = filterKey || 'all';
  const pills = document.querySelectorAll('#bf-cards-filter-pills button[data-bf-filter]');
  pills.forEach(b => {
    const isSelected = b.getAttribute('data-bf-filter') === BF_CARDS_FILTER;
    b.classList.toggle('is-active', isSelected);
  });
  renderBFPromosCardsTab();
}
window.setBFCardsFilter = setBFCardsFilter;

async function pollBFLiveCardsFeed(manual) {
  const activeReg = typeof getActiveRegionId === 'function' ? getActiveRegionId() : 'br';
  if (activeReg !== 'br') {
    const statusEl = document.getElementById('bf-cards-live-status');
    const nowStr = new Date().toLocaleTimeString('pt-BR');
    if (statusEl) {
      statusEl.textContent = activeReg === 'eu'
        ? `🟢 Radar EU • MyDealz / Dealabs / Chollometro (${nowStr})`
        : `🟢 Radar MX • Promodescuentos / Cyberpuerta (${nowStr})`;
    }
    if (manual && typeof scanLivePromos === 'function') {
      scanLivePromos(true);
    }
    return;
  }
  if (_bfLiveBusy) return;
  _bfLiveBusy = true;
  const statusEl = document.getElementById('bf-cards-live-status');
  if (statusEl && manual) statusEl.textContent = '🔄 Puxando grupos...';

  try {
    const channels = CLIENT_PROMO_CHANNELS || [];
    const maxAge = parseFloat(document.getElementById('select-promo-max-age')?.value || document.getElementById('promo-max-age')?.value || '48') || 48;
    const nowMs = Date.now();
    const htmlList = await Promise.all(channels.map(ch => fetchTelegramChannelHTML(ch.id, '').then(raw => ({ ch, raw })).catch(() => ({ ch, raw: '' }))));

    const freshPosts = [];
    htmlList.forEach(({ ch, raw }) => {
      if (!raw) return;
      const parsed = parseTelegramHTMLInBrowser(raw, ch.id, ch.name);
      if (parsed && parsed.length) freshPosts.push(...parsed);
    });

    if (!PROMO_STATE.lastData) {
      PROMO_STATE.lastData = { ok: true, region_id: getActiveRegionId(), matched_deals: [], recent_feed: [], best_by_slug: {} };
    }
    const existingById = new Map();
    (PROMO_STATE.lastData.matched_deals || []).forEach(d => {
      if (!d || !d.post_id) return;
      const ts = d.timestamp ? Date.parse(d.timestamp) : NaN;
      const ageHrs = !isNaN(ts) ? Math.max(0.01, (nowMs - ts) / 3600000) : (typeof d.age_hours === 'number' ? d.age_hours : 999);
      if (!d._isStoreDirect && (isNaN(ts) || ageHrs > maxAge)) return;
      const updated = _applyCouponAndExpiryOverlay({ ...d, age_hours: Math.round(ageHrs * 100) / 100 });
      if (!updated.is_expired && updated.deal_status !== 'out_of_stock' && updated.deal_status !== 'expired') {
        existingById.set(d.post_id, updated);
      }
    });

    const newlyQueued = [];
    const dealsStatusMap = (PROMO_STATE.couponStatus && PROMO_STATE.couponStatus.deals) || {};
    if (freshPosts.length) {
      freshPosts.forEach(p => {
        if (!p.timestamp) return;
        const ts = Date.parse(p.timestamp);
        if (isNaN(ts)) return;
        const ageHours = Math.max(0.01, (nowMs - ts) / 3600000);
        if (ageHours > maxAge) return;

        const m = matchCatalogItemClient(p.head_text);
        if (!m || !m.item) return;
        if (m.kind === 'mobo' && p.price_brl < 220) return;
        if (m.kind === 'psu' && p.price_brl < 110) return;
        const hbPrice = m.item._hbPrice || m.item.price_brl || 0;
        if (hbPrice > 0 && (p.price_brl < hbPrice * 0.45 || p.price_brl > hbPrice * 1.35)) return;

        const prev = existingById.get(p.post_id) || {};
        const merged = _applyCouponAndExpiryOverlay({
          ...prev,
          ...p,
          matched_kind: m.kind,
          matched_slug: m.item.slug,
          matched_name: m.item.name,
          hb_price_brl: hbPrice,
          savings_vs_hb_brl: hbPrice > 0 ? Math.round((hbPrice - p.price_brl) * 100) / 100 : 0,
          item_specs: extractDealSpecsClient(p, m.item),
          age_hours: Math.round(ageHours * 100) / 100,
          region_id: getActiveRegionId()
        });
        existingById.set(p.post_id, merged);

        const alreadyRecorded = Boolean(dealsStatusMap[merged.post_id] || dealsStatusMap[String(merged.post_id).toLowerCase()] || (merged.buy_url && dealsStatusMap[merged.buy_url]));
        if (
          !merged.is_expired &&
          !alreadyRecorded &&
          (merged.deal_status === 'untested' || merged.deal_status === 'unverified_coupon') &&
          !_bfAutoTestedIds.has(merged.post_id)
        ) {
          newlyQueued.push(merged);
        }
      });
    }

    PROMO_STATE.lastData.matched_deals = [...existingById.values()];
    if (typeof STATE !== 'undefined' && STATE.activeTab === 'bf-promos') {
      renderBFPromosCardsTab();
    }

    if (newlyQueued.length && typeof testDealCouponNow === 'function') {
      const batch = newlyQueued.slice(0, 4);
      batch.forEach(d => _bfAutoTestedIds.add(d.post_id));
      Promise.all(
        batch.map(d =>
          testDealCouponNow(
            d.post_id,
            d.buy_url,
            d.coupon_code || '',
            d.price_brl || 0,
            d.matched_slug || '',
            d.matched_kind || 'gpu',
            { skipRender: true, skipSync: true, age_hours: d.age_hours }
          ).catch(() => null)
        )
      ).then(() => {
        applyFlashPromosToCatalog();
        if (typeof STATE !== 'undefined' && STATE.activeTab === 'bf-promos') renderBFPromosCardsTab();
        if (typeof onBFTargetItemChange === 'function') onBFTargetItemChange(true);
      });
    }
    if (statusEl) {
      const nowStr = new Date().toLocaleTimeString('pt-BR');
      const proxyDown = typeof isTgProxyDown === 'function' && isTgProxyDown();
      statusEl.textContent = !_bfLiveEnabled
        ? `⏸️ Pausado (${nowStr})`
        : (proxyDown ? `🟡 Dados do robô • leitura direta indisponível (${nowStr})` : `🟢 Ao vivo • 10s (${nowStr})`);
      statusEl.title = proxyDown
        ? 'Os serviços públicos usados para ler o Telegram direto do navegador estão fora do ar. As ofertas continuam vindo do robô que atualiza o site a cada poucas horas. Nova tentativa em até 30 min.'
        : '';
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '⚠️ Reconectando (10s)...';
  } finally {
    _bfLiveBusy = false;
  }
}
window.pollBFLiveCardsFeed = pollBFLiveCardsFeed;

function startBFLivePolling() {
  stopBFLivePolling();
  if (!_bfLiveEnabled) return;
  pollBFLiveCardsFeed(false);
  _bfLiveTimer = setInterval(() => {
    if (_bfLiveEnabled && typeof STATE !== 'undefined' && STATE.activeTab === 'bf-promos') {
      pollBFLiveCardsFeed(false);
    }
  }, 10000);
}
window.startBFLivePolling = startBFLivePolling;

function stopBFLivePolling() {
  if (_bfLiveTimer) {
    clearInterval(_bfLiveTimer);
    _bfLiveTimer = null;
  }
}
window.stopBFLivePolling = stopBFLivePolling;

function toggleBFLivePolling() {
  _bfLiveEnabled = !_bfLiveEnabled;
  const btn = document.getElementById('btn-bf-live-toggle');
  const statusEl = document.getElementById('bf-cards-live-status');
  if (btn) {
    btn.textContent = _bfLiveEnabled ? 'Pausar Auto (10s)' : 'Retomar Auto (10s)';
    btn.className = _bfLiveEnabled ? 'ui-btn ui-btn--sm' : 'ui-btn ui-btn--sm ui-btn--ghost';
  }
  if (_bfLiveEnabled) {
    startBFLivePolling();
  } else {
    stopBFLivePolling();
    if (statusEl) statusEl.textContent = 'Auto-poll pausado';
  }
}
window.toggleBFLivePolling = toggleBFLivePolling;

// ===== Contagem única de ofertas ativas =====
// Ofertas ativas = cards da aba Promoções (grupos + lojas) em estoque, no contexto atual.
function syncOfferCounters() {
  const n = PROMO_STATE.activeOfferCount;
  if (n == null) return;
  const label = `${n} ${n === 1 ? 'oferta' : 'ofertas'}`;
  const badge = document.getElementById('promo-radar-badge');
  if (badge) badge.textContent = label;
  const kpi = document.getElementById('home-kpi-deals');
  if (kpi) kpi.textContent = String(n);
}

function getActiveOfferCount() {
  const ctx = (typeof STATE !== 'undefined' && STATE.context) || 'gpu';
  if (PROMO_STATE.activeOfferCount == null || PROMO_STATE.activeOfferCtx !== ctx) {
    try { renderBFPromosCardsTab(); } catch (_) { /* sem dados ainda */ }
  }
  return PROMO_STATE.activeOfferCount;
}
window.getActiveOfferCount = getActiveOfferCount;

function renderBFPromosCardsTab() {
  const grid = document.getElementById('bf-promos-cards-grid');
  const countBadge = document.getElementById('bf-cards-live-count');
  if (!grid) return;

  const lastData = PROMO_STATE.lastData;
  const matchedDeals = (lastData && Array.isArray(lastData.matched_deals)) ? lastData.matched_deals : [];
  const generalFeed = (lastData && Array.isArray(lastData.recent_feed)) ? lastData.recent_feed : [];

  const imgByPost = new Map();
  generalFeed.forEach(f => {
    if (f.post_id && f.image_url) imgByPost.set(f.post_id, f.image_url);
  });

  const searchQ = (document.getElementById('bf-cards-search')?.value || '').trim().toLowerCase();
  const sortMode = (document.getElementById('bf-cards-sort')?.value || 'recent');
  const nowMs = Date.now();

  const maxAge = parseFloat(document.getElementById('select-promo-max-age')?.value || document.getElementById('promo-max-age')?.value || '48') || 48;

  const _enrichCard = (origDeal) => {
    const d = _applyCouponAndExpiryOverlay({ ...origDeal });
    const imgUrl = d.image_url || imgByPost.get(d.post_id) || d.image || null;
    const mc = (DB.misc_catalog && typeof DB.misc_catalog === 'object') ? DB.misc_catalog : {};
    const grpByKind = {
      laptop: DB.laptops || [],
      smartphone: DB.smartphones || [],
      peripheral: DB.peripherals || [],
      air_fryer: mc.air_fryer || [],
      diapers: mc.diapers || [],
      cpu: DB.cpus || [],
      ram: DB.rams || [],
      mobo: DB.motherboards || [],
      psu: DB.psus || [],
      gpu: DB.gpus || []
    };
    const rawK = (d.matched_kind || 'gpu').toLowerCase();
    const catGroup = grpByKind[rawK] || mc[rawK] || (DB.gpus || []);
    const catItem = catGroup.find(x => x.slug === d.matched_slug) || null;
    const itemSpecs = extractDealSpecsClient(d, catItem);
    d.item_specs = itemSpecs;

    // Compute Black Friday target range identically to Black Friday view
    let bfRange = null;
    let allMin = null;
    if (catItem && typeof bfAnalyzeItem === 'function' && typeof bfExpectedRange === 'function') {
      const st = bfAnalyzeItem(catItem, d.matched_kind || 'gpu');
      bfRange = bfExpectedRange(st, 0.10);
      allMin = st.allMin;
    } else if (catItem && catItem.price_stats) {
      allMin = catItem.price_stats.min_all_time || null;
    }

    const userSaved = (typeof STATE !== 'undefined' && STATE.bfRanges && STATE.bfRanges[d.matched_slug]) || null;
    const targetLow = userSaved ? userSaved.min : (bfRange ? bfRange.low : (catItem?.price_stats?.target_price || null));
    const targetHigh = userSaved ? userSaved.max : (bfRange ? bfRange.high : null);

    let ageHrs = d.age_hours != null ? Number(d.age_hours) : 999;
    let tsMs = 0;
    if (d.timestamp) {
      const t = Date.parse(d.timestamp);
      if (!isNaN(t)) {
        tsMs = t;
        ageHrs = Math.max(0, (nowMs - t) / 3600000);
      }
    }

    const isOutOfStock = Boolean(
      d.is_expired ||
      d.is_coupon_expired ||
      d.deal_status === 'out_of_stock' ||
      d.deal_status === 'expired' ||
      (!d._isStoreDirect && (!d.timestamp || ageHrs > maxAge))
    );
    const isHistoricalMin = !isOutOfStock && Boolean(allMin && d.price_brl <= allMin * 1.015);
    const isBFLow = !isOutOfStock && Boolean(targetLow && d.price_brl <= targetLow);
    const isBFRange = !isOutOfStock && Boolean(targetHigh && d.price_brl <= targetHigh);
    const isNearBF = !isOutOfStock && Boolean(!isBFRange && targetHigh && d.price_brl <= targetHigh * 1.05);
    const avg30 = catItem && catItem.price_stats ? catItem.price_stats.avg_30d : null;
    const drop30Pct = (avg30 && avg30 > 0) ? ((avg30 - d.price_brl) / avg30) * 100 : 0;
    const isInBFPrice = !isOutOfStock && (isHistoricalMin || isBFLow || isBFRange || drop30Pct >= (PROMO_STATE.avg30dMinPct || 5));

    // Best reference price to compute prominent discount %
    const refCandidates = [
      (!d._isStoreDirect && d.hb_price_brl > d.price_brl) ? d.hb_price_brl : 0,
      (avg30 && avg30 > d.price_brl) ? avg30 : 0
    ].filter(v => v > 0);
    const refPrice = refCandidates.length ? Math.max(...refCandidates) : 0;
    const discountPct = refPrice > 0 ? Math.round(((refPrice - d.price_brl) / refPrice) * 100) : 0;

    return {
      ...d,
      _catItem: catItem,
      imgUrl,
      targetLow,
      targetHigh,
      allMin,
      avg30,
      drop30Pct,
      refPrice,
      discountPct,
      isOutOfStock,
      isHistoricalMin,
      isBFLow,
      isBFRange,
      isNearBF,
      isInBFPrice,
      tsMs,
      ageHrs
    };
  };

  // 1. Live Telegram group posts across all contexts & user-enabled categories
  const curCtx = (typeof STATE !== 'undefined' && STATE.context) || 'gpu';
  const isPhoneCtx = curCtx === 'smartphone';
  const isPerCtx = curCtx === 'peripherals';
  const isMiscCtx = curCtx === 'misc';
  const isLapCtx = curCtx === 'laptop';
  const nc = PROMO_STATE.notifyCategories || {};

  const phoneAlertsActive = nc.smartphone === true;
  const periphAlertsActive = nc.peripheral === true;
  const miscAlertsActive = (nc.air_fryer === true || nc.diapers === true || nc.misc_custom === true);

  const fallbackPromos = (typeof DB !== 'undefined' && DB.live_promos) ? DB.live_promos : {};
  const rawPhoneDeals = (lastData && Array.isArray(lastData.smartphone_deals)) ? lastData.smartphone_deals : (fallbackPromos.smartphone_deals || []);
  const rawPeriphDeals = (lastData && Array.isArray(lastData.peripheral_deals)) ? lastData.peripheral_deals : (fallbackPromos.peripheral_deals || []);
  const rawMiscDeals = (lastData && Array.isArray(lastData.misc_deals)) ? lastData.misc_deals : (fallbackPromos.misc_deals || []);

  const phoneGroupCards = (isPhoneCtx || phoneAlertsActive || BF_CARDS_FILTER === 'smartphone')
    ? rawPhoneDeals.map(sd => _enrichCard({ ...sd, matched_kind: 'smartphone', matched_slug: sd.matched_slug || '', matched_name: sd.matched_name || sd.title }))
    : [];
  const periphGroupCards = (isPerCtx || periphAlertsActive || BF_CARDS_FILTER === 'peripheral')
    ? rawPeriphDeals.map(pd => _enrichCard({ ...pd, matched_kind: 'peripheral', matched_slug: pd.matched_slug || '', matched_name: pd.matched_name || pd.title }))
    : [];
  const miscGroupCards = (isMiscCtx || miscAlertsActive || ['air_fryer', 'diapers', 'misc_custom'].includes(BF_CARDS_FILTER))
    ? rawMiscDeals.map(md => {
        const mcId = md.misc_category || md.matched_kind || 'misc_custom';
        const mk = (mcId === 'air_fryer' || mcId === 'diapers') ? mcId : 'misc_custom';
        return _enrichCard({ ...md, matched_kind: mk, matched_slug: md.matched_slug || '', matched_name: md.matched_name || md.title, item_specs: md.item_specs || md.misc_specs || {} });
      })
    : [];

  const miscFeedExtra = [];
  if ((isMiscCtx || nc.misc_custom === true || BF_CARDS_FILTER === 'misc_custom') && (PROMO_STATE.specFilters?.misc_custom?.keywords || '').trim()) {
    const knownIds = new Set([...matchedDeals, ...rawMiscDeals].map(x => x && x.post_id).filter(Boolean));
    generalFeed.forEach(fd => {
      if (fd && !knownIds.has(fd.post_id)) {
        miscFeedExtra.push(_enrichCard({ ...fd, matched_kind: 'misc_custom', matched_name: fd.title }));
      }
    });
  }

  let groupCards = [];
  if (isPhoneCtx) groupCards = phoneGroupCards;
  else if (isPerCtx) groupCards = periphGroupCards;
  else if (isMiscCtx) groupCards = [...miscGroupCards, ...miscFeedExtra];
  else groupCards = [...matchedDeals.map(_enrichCard), ...phoneGroupCards, ...periphGroupCards, ...miscGroupCards, ...miscFeedExtra];

  // Deduplication signature set from Telegram groups so identical store/price isn't duplicated
  const seenKeys = new Set();
  groupCards.forEach(d => {
    seenKeys.add(`${d.matched_slug}_${(d.store_name || '').toLowerCase()}_${Math.round(d.price_brl || 0)}`);
  });

  // 2. Direct Store Catalog deals
  const storeCatalogCards = [];
  const dbTs = (typeof DB !== 'undefined' && DB.updated_at) ? Date.parse(DB.updated_at.replace(' ', 'T')) : nowMs;
  const storeAgeHrs = !isNaN(dbTs) ? Math.max(0.05, (nowMs - dbTs) / 3600000) : 0.5;
  const mcObj = (typeof DB !== 'undefined' && DB.misc_catalog && typeof DB.misc_catalog === 'object') ? DB.misc_catalog : {};

  const directSources = [
    ['gpu', DB.gpus || []],
    ['cpu', DB.cpus || []],
    ['laptop', DB.laptops || []],
    ['smartphone', DB.smartphones || []],
    ['peripheral', DB.peripherals || []],
    ['air_fryer', mcObj.air_fryer || []],
    ['diapers', mcObj.diapers || []]
  ];

  directSources.forEach(([kindName, arr]) => {
    if (isPhoneCtx && kindName !== 'smartphone') return;
    if (isPerCtx && kindName !== 'peripheral') return;
    if (isMiscCtx && kindName !== 'air_fryer' && kindName !== 'diapers') return;
    if (!isPhoneCtx && kindName === 'smartphone' && !phoneAlertsActive && BF_CARDS_FILTER !== 'smartphone') return;
    if (!isPerCtx && kindName === 'peripheral' && !periphAlertsActive && BF_CARDS_FILTER !== 'peripheral') return;
    if (!isMiscCtx && (kindName === 'air_fryer' || kindName === 'diapers') && nc[kindName] !== true && BF_CARDS_FILTER !== kindName) return;

    arr.forEach(it => {
      if (!it || !it.slug || !it.price_brl || it.store_name === 'referencia' || it.is_xeon) return;
      const baseCard = _enrichCard({
        post_id: `store_${it.slug}`,
        matched_kind: kindName,
        matched_slug: it.slug,
        matched_name: it.name,
        title: it.offer_title || it.name,
        price_brl: it.price_brl,
        hb_price_brl: it.price_brl,
        coupon_code: it.coupon || null,
        store_name: it.store_name || (getActiveRegionId() === 'eu' ? 'EU Store' : (getActiveRegionId() === 'mx' ? 'Tienda MX' : 'Loja BR')),
        channel_id: 'catalogo_lojas',
        buy_url: it.offer_url || it.href || '#',
        post_url: it.href || it.offer_url || '#',
        image_url: it.image || it.image_url || null,
        item_specs: it.specs || undefined,
        age_hours: storeAgeHrs,
        timestamp: !isNaN(dbTs) ? new Date(dbTs).toISOString() : '',
        _isStoreDirect: true
      });
      const passes = (baseCard.isInBFPrice || baseCard.isNearBF || baseCard.drop30Pct >= 3) && dealMatchesPromoPreferences(baseCard, it, {
        allowSmartphoneInSmartphoneCtx: isPhoneCtx,
        allowLaptopInLaptopCtx: isLapCtx,
        allowPeripheralInPeriphCtx: isPerCtx,
        allowMiscInMiscCtx: isMiscCtx
      });
      if (passes) {
        const sig = `${baseCard.matched_slug}_${(baseCard.store_name || '').toLowerCase()}_${Math.round(baseCard.price_brl || 0)}`;
        if (!seenKeys.has(sig)) {
          storeCatalogCards.push(baseCard);
        }
      }
    });
  });

  // Include matching Motherboards / RAM / PSUs from catalog when category is enabled & user set spec filters or selected that category pill
  [['motherboards', 'mobo'], ['rams', 'ram'], ['psus', 'psu']].forEach(([grp, kindName]) => {
    const enabled = !PROMO_STATE.notifyCategories || PROMO_STATE.notifyCategories[kindName] !== false;
    if (!enabled) return;
    if (!_hasActiveSpecFilterForCat(kindName) && BF_CARDS_FILTER !== kindName) return;
    const catMatches = [];
    (DB[grp] || []).forEach(it => {
      if (!it || !it.slug || !it.price_brl || it.slug === 'x99-p4-lga2011') return;
      const card = _enrichCard({
        post_id: `store_${kindName}_${it.slug}`,
        matched_kind: kindName,
        matched_slug: it.slug,
        matched_name: it.name,
        title: it.name,
        price_brl: it.price_brl,
        hb_price_brl: it.price_brl,
        store_name: it.store_name || 'Hardware Barato',
        channel_id: 'catalogo_lojas',
        buy_url: it.offer_url || '#',
        post_url: it.offer_url || '#',
        age_hours: storeAgeHrs,
        timestamp: !isNaN(dbTs) ? new Date(dbTs).toISOString() : '',
        _isStoreDirect: true
      });
      if (dealMatchesPromoPreferences(card, it)) {
        catMatches.push(card);
      }
    });
    catMatches.sort((a, b) => (a.price_brl || 0) - (b.price_brl || 0)).slice(0, 20).forEach(card => {
      const sig = `${card.matched_slug}_${(card.store_name || '').toLowerCase()}_${Math.round(card.price_brl || 0)}`;
      if (!seenKeys.has(sig)) {
        seenKeys.add(sig);
        storeCatalogCards.push(card);
      }
    });
  });

  syncPromoCategoryCheckboxesFromState();
  syncPromoSpecInputsFromState();

  const allCards = [...groupCards, ...storeCatalogCards];

  // Fonte única da contagem de ofertas ativas respeitando preferências e contexto
  const ctxMatchOpts = {
    allowSmartphoneInSmartphoneCtx: isPhoneCtx,
    allowLaptopInLaptopCtx: isLapCtx,
    allowPeripheralInPeriphCtx: isPerCtx,
    allowMiscInMiscCtx: isMiscCtx
  };
  const _inActiveContext = (d) => {
    if (isPhoneCtx) return d.matched_kind === 'smartphone';
    if (isPerCtx) return d.matched_kind === 'peripheral';
    if (isMiscCtx) return ['air_fryer', 'diapers', 'misc_custom'].includes(d.matched_kind);
    if (isLapCtx) return d.matched_kind === 'laptop';
    return d.matched_kind !== 'laptop';
  };

  const activeInCtx = allCards.filter(d => !d.isOutOfStock && _inActiveContext(d) && dealMatchesPromoPreferences(d, d._catItem, ctxMatchOpts));
  PROMO_STATE.activeOfferCount = activeInCtx.length;
  PROMO_STATE.activeOfferCtx = curCtx;
  syncOfferCounters();

  const items = allCards.filter(d => {
    if (d.isOutOfStock) return false;
    if (!_inActiveContext(d)) return false;
    if (!dealMatchesPromoPreferences(d, d._catItem, ctxMatchOpts)) return false;
    if (BF_CARDS_FILTER === 'hist_min' && !d.isHistoricalMin) return false;
    if (BF_CARDS_FILTER === 'gpu' && d.matched_kind !== 'gpu') return false;
    if (BF_CARDS_FILTER === 'cpu' && d.matched_kind !== 'cpu') return false;
    if (BF_CARDS_FILTER === 'ram' && d.matched_kind !== 'ram') return false;
    if (BF_CARDS_FILTER === 'mobo' && d.matched_kind !== 'mobo') return false;
    if (BF_CARDS_FILTER === 'psu' && d.matched_kind !== 'psu') return false;
    if (BF_CARDS_FILTER === 'laptop' && d.matched_kind !== 'laptop') return false;
    if (BF_CARDS_FILTER === 'smartphone' && d.matched_kind !== 'smartphone') return false;
    if (BF_CARDS_FILTER === 'peripheral' && d.matched_kind !== 'peripheral') return false;
    if (BF_CARDS_FILTER === 'air_fryer' && d.matched_kind !== 'air_fryer') return false;
    if (BF_CARDS_FILTER === 'diapers' && d.matched_kind !== 'diapers') return false;
    if (BF_CARDS_FILTER === 'misc_custom' && d.matched_kind !== 'misc_custom') return false;
    if (BF_CARDS_FILTER === 'store_direct' && !d._isStoreDirect) return false;
    if (BF_CARDS_FILTER === 'in_stock' && d.isOutOfStock) return false;
    if (BF_CARDS_FILTER === 'bf_deal' && !d.isInBFPrice && !d.isNearBF) return false;

    if (searchQ) {
      const hay = `${d.title || ''} ${d.matched_name || ''} ${d.store_name || ''} ${d.coupon_code || ''} ${d.channel_id || ''}`.toLowerCase();
      if (!hay.includes(searchQ)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortMode === 'discount') {
      if (b.discountPct !== a.discountPct) return b.discountPct - a.discountPct;
      return (a.price_brl || 0) - (b.price_brl || 0);
    }
    if (sortMode === 'price_asc') {
      return (a.price_brl || 0) - (b.price_brl || 0);
    }
    const aFreshGroup = !a._isStoreDirect && a.ageHrs <= 1.5;
    const bFreshGroup = !b._isStoreDirect && b.ageHrs <= 1.5;
    if (aFreshGroup !== bFreshGroup) return aFreshGroup ? -1 : 1;
    if (aFreshGroup && bFreshGroup) return (b.tsMs || 0) - (a.tsMs || 0);
    if (a.isHistoricalMin !== b.isHistoricalMin) return a.isHistoricalMin ? -1 : 1;
    if (a.isInBFPrice !== b.isInBFPrice) return a.isInBFPrice ? -1 : 1;
    if (a.tsMs && b.tsMs && a.tsMs !== b.tsMs) return b.tsMs - a.tsMs;
    return a.ageHrs - b.ageHrs;
  });

  if (countBadge) countBadge.textContent = `${activeInCtx.length} ofertas ativas`;

  // Populate KPI strip
  const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
  setKpi('promos-kpi-total', items.length);
  setKpi('promos-kpi-histmin', items.filter(d => d.isHistoricalMin && !d.isOutOfStock).length);
  setKpi('promos-kpi-bf', items.filter(d => (d.isBFLow || d.isBFRange) && !d.isOutOfStock).length);
  setKpi('promos-kpi-coupons', items.filter(d => Boolean((d.coupon_code || '').trim()) && !d.isOutOfStock).length);

  if (!items.length) {
    grid.innerHTML = `
      <div class="col-span-full ui-empty-state">
        <div class="ui-empty-state-icon">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>
        <div class="ui-empty-state-title">Nenhuma promoção encontrada</div>
        <p class="ui-empty-state-desc">Nenhum item corresponde ao filtro ou busca atual. Limpe os filtros ou atualize o Radar.</p>
        <div class="flex flex-wrap items-center justify-center gap-2 mt-2">
          <button type="button" onclick="const s=document.getElementById('bf-cards-search'); if(s) s.value=''; setBFCardsFilter('all');" class="ui-btn ui-btn--sm">Limpar filtros</button>
          <button type="button" onclick="pollBFLiveCardsFeed(true); scanLivePromos(true);" class="ui-btn ui-btn--primary ui-btn--sm">Atualizar agora</button>
        </div>
      </div>`;
    return;
  }

  grid.innerHTML = items.map(d => {
    const cleanCoup = (d.coupon_code || '').trim().toUpperCase();
    const ageLabel = d.ageHrs < 1
      ? `${Math.max(1, Math.round(d.ageHrs * 60))}m`
      : `${d.ageHrs.toFixed(1)}h`;

    const cardModifier = d.isOutOfStock
      ? 'ui-promo-card--oos'
      : d.isHistoricalMin
        ? 'ui-promo-card--hist'
        : (d.isBFLow || d.isBFRange)
          ? 'ui-promo-card--bf'
          : d.isNearBF
            ? 'ui-promo-card--warn'
            : '';

    const ribbonHtml = d.isOutOfStock
      ? `<div class="ui-promo-ribbon ui-promo-ribbon--oos"><span>Esgotado / Encerrado</span><span class="ui-mono">há ${ageLabel}</span></div>`
      : d.isHistoricalMin
        ? `<div class="ui-promo-ribbon ui-promo-ribbon--hist"><span>★ Mínimo Histórico</span><span class="ui-mono">há ${ageLabel}</span></div>`
        : d.isBFLow
          ? `<div class="ui-promo-ribbon ui-promo-ribbon--bf"><span>Piso Black Friday</span><span class="ui-mono">há ${ageLabel}</span></div>`
          : '';

    const bfVerdictBadge = d.isHistoricalMin
      ? `<span class="ui-badge ui-badge--good">Mínimo histórico</span>`
      : d.isBFLow
        ? `<span class="ui-badge ui-badge--good">Piso BF</span>`
        : d.isBFRange
          ? `<span class="ui-badge ui-badge--good">Preço BF</span>`
          : d.isNearBF
            ? `<span class="ui-badge ui-badge--warn">Perto da BF (+${fmtBRLShort(d.price_brl - d.targetHigh)})</span>`
            : d.targetHigh
              ? `<span class="ui-badge ui-badge--bad">Acima da BF (+${fmtBRLShort(d.price_brl - d.targetHigh)})</span>`
              : '';

    const targetText = d.targetLow && d.targetHigh
      ? `${fmtBRLShort(d.targetLow)} – ${fmtBRLShort(d.targetHigh)}`
      : (d.targetLow ? fmtBRLShort(d.targetLow) : '—');

    const thumbHtml = d.imgUrl
      ? `<img src="${d.imgUrl}" alt="" loading="lazy" class="ui-promo-thumb" onerror="this.style.display='none'" />`
      : `<div class="ui-promo-thumb ui-promo-thumb--placeholder">${d.matched_kind || 'HW'}</div>`;

    const discountHtml = (!d.isOutOfStock && d.discountPct >= 3)
      ? `<span class="ui-promo-discount" title="Desconto estimado frente à referência/média 30d (${fmtBRLShort(d.refPrice)})">−${d.discountPct}%</span>`
      : '';

    const sp = d.item_specs || {};
    const specTagVals = [];
    if (d.matched_kind === 'mobo') {
      if (sp.socket) specTagVals.push(sp.socket);
      if (sp.memory_type) specTagVals.push(sp.memory_type);
      if (sp.chipset) specTagVals.push(sp.chipset);
    } else if (d.matched_kind === 'ram') {
      if (sp.memory_type) specTagVals.push(sp.memory_type);
      if (sp.capacity_gb > 0) specTagVals.push(`${sp.capacity_gb}GB`);
      if (sp.speed_mtps > 0) specTagVals.push(`${sp.speed_mtps}MT/s`);
    } else if (d.matched_kind === 'cpu') {
      if (sp.socket) specTagVals.push(sp.socket);
      if (sp.ddr) specTagVals.push(sp.ddr);
    } else if (d.matched_kind === 'gpu') {
      if (sp.vram_gb > 0) specTagVals.push(`${sp.vram_gb}GB`);
      if (sp.brand) specTagVals.push(sp.brand);
    } else if (d.matched_kind === 'psu') {
      if (sp.watts > 0) specTagVals.push(`${sp.watts}W`);
      if (sp.modularity) specTagVals.push(sp.modularity === 'Non-Modular' ? 'Não-Mod' : sp.modularity);
      if (sp.cert) specTagVals.push(sp.cert);
    } else if (d.matched_kind === 'laptop') {
      if (sp.ram_gb > 0) specTagVals.push(`${sp.ram_gb}GB RAM`);
      if (sp.gpu_is_dedicated) specTagVals.push('GPU Dedicada');
    } else if (d.matched_kind === 'smartphone') {
      if (sp.brand) specTagVals.push(sp.brand);
      if (sp.ram_gb > 0 && sp.storage_gb > 0) specTagVals.push(`${sp.ram_gb}GB/${sp.storage_gb}GB`);
    } else if (d.matched_kind === 'peripheral') {
      const kLbl = (d.peripheral_kind || sp.sub_kind || '') === 'mouse' ? 'Mouse' : ((d.peripheral_kind || sp.sub_kind || '') === 'keyboard' ? 'Teclado' : 'Headset');
      specTagVals.push(kLbl);
      if (sp.brand || d.brand) specTagVals.push(sp.brand || d.brand);
      if (sp.wireless || d.is_wireless) specTagVals.push('Sem fio');
    }
    const _cardSym = (typeof STATE !== 'undefined' && STATE.market?.monetary?.currency_symbol) || 'R$';
    const _cardReg = typeof getActiveRegionId === 'function' ? getActiveRegionId() : 'br';
    if (d.matched_kind === 'air_fryer') {
      const af = _parseAirFryerClient(`${d.title || ''} ${d.matched_name || ''}`, d.price_brl, d.misc_specs || sp);
      if (af.brand) specTagVals.push(af.brand);
      if (af.liters > 0) specTagVals.push(`${af.liters}L`);
      if (af.price_per_liter > 0) specTagVals.push(`${_cardSym}${Math.round(af.price_per_liter)}/L`);
    } else if (d.matched_kind === 'diapers') {
      const dp = _parseDiaperClient(`${d.title || ''} ${d.matched_name || ''}`, d.price_brl, d.misc_specs || sp);
      if (dp.brand) specTagVals.push(dp.brand);
      if (dp.size) specTagVals.push(`Tam. ${dp.size}`);
      if (dp.price_per_unit > 0) specTagVals.push(`${_cardSym}${Number(dp.price_per_unit).toFixed(2)}/un`);
    }
    const specTagsHtml = [
      ...specTagVals.slice(0, 3).map(v => `<span class="ui-spec-tag">${v}</span>`),
      (d._unverifiedMemType || d.unverified_memory_type)
        ? `<span class="ui-badge ui-badge--warn" title="Anúncio não especifica DDR4 ou DDR5 — confirme antes de comprar">⚠️ Verificar DDR4/DDR5</span>`
        : ''
    ].filter(Boolean).join('');
    const actionBtnLabel = ['mobo', 'ram', 'psu'].includes(d.matched_kind)
      ? 'Montar'
      : (['gpu', 'laptop', 'cpu', 'smartphone', 'peripheral', 'air_fryer', 'diapers'].includes(d.matched_kind) ? 'Duelo' : 'Ver BF');

    return `
      <article class="ui-promo-card ${cardModifier}">
        ${ribbonHtml}
        <div class="ui-promo-body">
          <!-- Top: Thumb + Model/Store + Discount % -->
          <div class="ui-promo-head">
            ${thumbHtml}
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex items-center justify-between gap-2">
                <span class="ui-badge ui-badge--brand ui-mono truncate max-w-[170px]">${d.matched_name || d.matched_slug || ''}</span>
                ${discountHtml}
              </div>
              <div class="text-xs text-slate-400 flex items-center flex-wrap gap-1.5">
                <span class="text-slate-200 font-semibold">${d.store_name || (_cardReg === 'eu' ? 'EU Store' : (_cardReg === 'mx' ? 'Tienda MX' : 'Loja BR'))}</span>
                <span>•</span>
                <span>${d._isStoreDirect ? 'Catálogo' : '@' + (d.channel_id || 'grupo')}</span>
                ${!ribbonHtml ? `<span>• há ${ageLabel}</span>` : ''}
              </div>
              ${specTagsHtml ? `<div class="flex flex-wrap gap-1 pt-0.5">${specTagsHtml}</div>` : ''}
            </div>
          </div>

          <!-- Title -->
          <div class="ui-promo-title" title="${d.title}">${d.title}</div>

          <!-- Price Box -->
          <div class="ui-promo-price-box">
            <div>
              <div class="flex items-baseline gap-2 flex-wrap">
                <span class="ui-promo-price ${d.isInBFPrice && !d.isOutOfStock ? 'ui-promo-price--good' : ''}">${fmtBRL(d.price_brl)}</span>
                ${d.refPrice > d.price_brl ? `<span class="ui-promo-ref-price">${fmtBRLShort(d.refPrice)}</span>` : ''}
              </div>
              <div class="text-xs ui-mono text-slate-400 mt-1">
                Alvo BF: <span class="text-slate-200 font-semibold">${targetText}</span>
              </div>
            </div>
            <div class="flex flex-col items-end gap-1">
              ${bfVerdictBadge}
            </div>
          </div>

          <!-- Coupon Pill (if present) -->
          ${cleanCoup ? `
            <button type="button" onclick="copyCouponAndOpen('${cleanCoup}', '${d.buy_url || d.post_url}')" class="w-full ui-btn ui-btn--sm justify-between" style="background:var(--ui-warn-soft); border-color:var(--ui-warn-border); color:var(--ui-warn-text);" title="Copiar cupom e abrir loja">
              <span class="ui-mono font-bold">🎟️ Cupom: ${cleanCoup}</span>
              <span class="text-xs">Copiar ↗</span>
            </button>
          ` : ''}

          <!-- Actions Footer -->
          <div class="ui-promo-footer">
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="sendPromoToDuelOrBF('${d.matched_kind}', '${d.matched_slug}', ${d.price_brl})" class="ui-btn ui-btn--sm">
                ${actionBtnLabel}
              </button>
              <a href="${d.post_url}" target="_blank" class="ui-btn ui-btn--sm ui-btn--ghost">Post ↗</a>
            </div>
            <a href="${d.buy_url}" target="_blank" class="ui-btn ui-btn--good ui-btn--sm">Ver oferta ↗</a>
          </div>
        </div>
      </article>
    `;
  }).join('');
}
window.renderBFPromosCardsTab = renderBFPromosCardsTab;
