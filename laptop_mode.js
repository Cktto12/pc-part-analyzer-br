/* ============================================================================
 * GCA ANALYZER — FULL-SYSTEM LAPTOP MODE (Versus-Style Comparison Engine)
 * Compares complete laptop systems (CPU + Mobile GPU/TGP + RAM/Upgradeability +
 * SSD + Display Hz/sRGB/Nits + Battery/Portability + Ports/Wi-Fi + Zoom BR History).
 * Never loads or mixes desktop GPUs or CPUs.
 * ============================================================================ */

let chartLaptopDuelRadar = null;
let chartLaptopDuelHistory = null;
let chartLaptopCBScatter = null;
let chartSimLaptopRadar = null;

const LAP_CATEGORY_LABELS = {
  gaming_pro: '👑 Gamer / Creator Pro',
  gaming: '🎮 Gamer Intermediário',
  macbook: '🍎 MacBook (Apple Silicon)',
  ultrabook: '💼 Ultrabook & Produtividade',
  budget: '🏷️ Entrada & Estudo'
};

const LAP_CATEGORY_SHORT = {
  gaming_pro: 'Gamer Pro',
  gaming: 'Gamer',
  macbook: 'MacBook',
  ultrabook: 'Ultrabook',
  budget: 'Entrada'
};

const LAP_CATEGORY_COLORS = {
  gaming_pro: '#a855f7',
  gaming: '#10b981',
  macbook: '#f59e0b',
  ultrabook: '#38bdf8',
  budget: '#94a3b8'
};

const LAP_SVGS = {
  speed: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l3-3"/><path d="M3.34 17a10 10 0 1 1 17.32 0"/></svg>`,
  cpu: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>`,
  robot: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16.01"/><line x1="16" y1="16" x2="16" y2="16.01"/></svg>`,
  screen: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  battery: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="13" x2="23" y2="11"/><path d="M11 9l-3 3h4l-2 3"/></svg>`,
  money: `<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
};

function _escLapHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _destroyChartSafe(chartInstance, canvasId) {
  if (chartInstance && typeof chartInstance.destroy === 'function') {
    try { chartInstance.destroy(); } catch (_) {}
  }
  if (typeof Chart !== 'undefined' && canvasId) {
    const el = document.getElementById(canvasId);
    if (el && typeof Chart.getChart === 'function') {
      const existing = Chart.getChart(el);
      if (existing) {
        try { existing.destroy(); } catch (_) {}
      }
    }
  }
  return null;
}

function getLaptopPool() {
  return (typeof DB !== 'undefined' && Array.isArray(DB.laptops)) ? DB.laptops : [];
}

function findLaptopBySlug(slug) {
  const pool = getLaptopPool();
  return pool.find(l => l.slug === slug) || null;
}

function getLaptopEffectiveGpuMem(lap) {
  if (!lap) return 4;
  if (lap.is_apple_unified) {
    // Unified memory allocates ~75% safely to GPU/MLX inference workloads
    return Math.max(6, Math.round((lap.ram_gb || 16) * 0.75));
  }
  return Number(lap.gpu_vram_gb || 0);
}

function shortLaptopLabel(lap) {
  if (!lap) return 'Notebook';
  let base = String(lap.name || lap.slug || '')
    .replace(/^Notebook\s+(?:Gamer\s+)?/i, '')
    .replace(/^Apple\s+/i, '')
    .replace(/\bWindows\s*11(?:\s*Home|\s*Pro)?\b/gi, '')
    .replace(/\bLinux\b/gi, '')
    .replace(/\bmacOS\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (base.length > 42) base = base.slice(0, 41).trim() + '…';
  const gpuShort = String(lap.gpu_name || '')
    .replace(/GeForce\s+/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
  return `${base} • ${gpuShort || lap.cpu_name} • ${lap.ram_gb || 16}GB`;
}

function shortLaptopChipName(lap) {
  if (!lap) return 'Notebook';
  const line = [lap.brand, lap.line].filter(Boolean).join(' ');
  const gpuShort = String(lap.gpu_name || '')
    .replace(/GeForce\s+/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+Graphics/i, '')
    .trim();
  return `${line || lap.brand || 'Note'} ${gpuShort ? '(' + gpuShort + ')' : ''}`.slice(0, 24);
}

/* ============================================================================
 * A. CONTEXTUAL SCORING & RELATIONAL ENGINE
 * ============================================================================ */

function getLaptopWorkstationScore(lap) {
  if (!lap) return 1000;
  const ws = (typeof STATE !== 'undefined' && STATE.workstationProfile)
    ? STATE.workstationProfile
    : { rendering: 40, editing: 30, compilation: 30 };
  const rW = Number(ws.rendering || 40);
  const eW = Number(ws.editing || 30);
  const cW = Number(ws.compilation || 30);
  const tot = Math.max(1, rW + eW + cW);
  const rS = Number(lap.workstation_render_score || lap.workstation_score || 3000);
  const eS = Number(lap.workstation_editing_score || lap.workstation_score || 3000);
  const cS = Number(lap.workstation_compile_score || lap.workstation_score || 3000);
  return Math.max(300, Math.round((rW * rS + eW * eS + cW * cS) / tot));
}

function getLaptopAIScore(lap) {
  if (!lap) return 300;
  const heft = (typeof STATE !== 'undefined' && parseFloat(STATE.vramHeft)) || 1.6;
  const baseAi = Number(lap.ai_score || 400);
  const effMem = getLaptopEffectiveGpuMem(lap);
  // Reward VRAM / Apple Unified capacity smoothly based on STATE.vramHeft
  const memRef = 6;
  const memRatio = Math.max(0.45, Math.min(3.5, effMem / memRef));
  const memMult = Math.pow(memRatio, Math.max(0, heft - 1.0) * 0.45);
  const mlxOrCudaBonus = lap.gpu_is_dedicated
    ? (1.08 + (Number(lap.gpu_fp16_tflops || 5) / 80))
    : (lap.is_apple_unified ? 1.15 : (lap.has_npu ? 0.85 : 0.65));
  return Math.max(150, Math.round(baseAi * memMult * mlxOrCudaBonus));
}

function getLaptopSystemQualityScore(lap) {
  if (!lap) return 50;
  const disp = Number(lap.display_score || 60);
  const batt = Number(lap.battery_score || 55);
  const port = Number(lap.portability_score || 60);
  const conn = Number(lap.connectivity_score || 75);
  const upg = Number(lap.upgradeability_score || 50);
  return Math.min(100, Math.max(10, Math.round(
    disp * 0.28 + batt * 0.22 + port * 0.18 + conn * 0.16 + upg * 0.16
  )));
}

function getLaptopIntensityConfig() {
  const src = (typeof STATE !== 'undefined' && STATE.workloadIntensity) ? STATE.workloadIntensity : {};
  const clamp = v => {
    const n = parseInt(v, 10);
    return isNaN(n) ? 3 : Math.max(1, Math.min(5, n));
  };
  return {
    gaming: clamp(src.gaming),
    workstation: clamp(src.workstation),
    localAI: clamp(src.localAI),
    aiTraining: clamp(src.aiTraining)
  };
}

function _intensityUtilityCurve(val, target, floor, level) {
  const num = Number(val || 0);
  if (num <= 0) return 0.01;
  const ratio = num / Math.max(1, target);
  if (ratio >= 1.0) {
    // Tight saturation cap at Light (L1), generous flagship headroom reward at Extreme (L5)
    const headroomGain = 0.06 + (level - 1) * 0.055;
    return Math.min(1.38, 1.0 + headroomGain * Math.log1p(ratio - 1.0));
  }
  const exp = 0.85 + (level - 1) * 0.30;
  let u = Math.pow(ratio, exp);
  if (num < floor) {
    u *= Math.pow(num / Math.max(1, floor), 0.65 + (level - 1) * 0.42);
  }
  return Math.max(0.01, u);
}

function _computeLaptopAiTrainRaw(lap) {
  if (!lap) return 100;
  const em = getLaptopEffectiveGpuMem(lap);
  const cudaBonus = lap.gpu_brand === 'NVIDIA' ? 1.38 : (lap.is_apple_unified ? 0.76 : 0.22);
  return Math.max(50, Math.round(
    (Number(lap.gpu_fp16_tflops || 0) * 95 + Number(lap.gpu_tgp_w || 0) * 8 + em * 120) * cudaBonus +
    Number(lap.software_score || 0) * 0.06
  ));
}

function getLaptopCatalogExtremes() {
  const pool = getLaptopPool();
  if (!pool.length) {
    return {
      maxGaming: 4000, maxWS: 22000, maxAI: 5000, maxAiTrain: 5800, maxSoft: 22000,
      maxPrice: 20000, maxComposite: 9500, maxVram: 16, maxTgp: 140, maxHz: 240
    };
  }
  return {
    maxGaming: Math.max(1000, ...pool.map(l => Number(l.gaming_score || 0))),
    maxWS: Math.max(2000, ...pool.map(l => getLaptopWorkstationScore(l))),
    maxAI: Math.max(1000, ...pool.map(l => getLaptopAIScore(l))),
    maxAiTrain: Math.max(1000, ...pool.map(l => _computeLaptopAiTrainRaw(l))),
    maxSoft: Math.max(2000, ...pool.map(l => Number(l.software_score || 0))),
    maxPrice: Math.max(3000, ...pool.map(l => Number(l.price_brl || 0))),
    maxComposite: Math.max(3000, ...pool.map(l => Number(l._compositeScore || 5000))),
    maxVram: Math.max(8, ...pool.map(l => getLaptopEffectiveGpuMem(l))),
    maxTgp: Math.max(80, ...pool.map(l => Number(l.gpu_tgp_w || 0))),
    maxHz: Math.max(144, ...pool.map(l => Number(l.screen_hz || 60)))
  };
}

function _computeLaptopIntensityEvaluation(lap, customWeights = null) {
  const st = (typeof STATE !== 'undefined') ? STATE : {};
  const wG = customWeights ? Number(customWeights.wGaming || 0) : (st.wGaming !== undefined ? Number(st.wGaming) : 30);
  const wWS = customWeights ? Number(customWeights.wWorkstation || 0) : (st.wWorkstation !== undefined ? Number(st.wWorkstation) : 35);
  const wAI = customWeights ? Number(customWeights.wAI || 0) : (st.wAI !== undefined ? Number(st.wAI) : 20);
  const wTrn = customWeights ? Number(customWeights.wSoft || 0) : (st.wSoft !== undefined ? Number(st.wSoft) : 15);
  const totalPct = Math.max(1, wG + wWS + wAI + wTrn);

  const intens = getLaptopIntensityConfig();
  const ig = intens.gaming;
  const iws = intens.workstation;
  const ilai = intens.localAI;
  const itrn = intens.aiTraining;

  const ramGb = Number(lap.ram_gb || 8);
  const baseRamSanity = ramGb < 8 ? 0.52 : 1.0;
  const em = getLaptopEffectiveGpuMem(lap);
  const heft = parseFloat(st.vramHeft) || 1.6;

  // 1. Gaming Utility
  const gTgt = [550, 1400, 2400, 3150, 4050][ig - 1];
  const gFlr = [300, 850, 1550, 2350, 2950][ig - 1];
  const uG = _intensityUtilityCurve(lap.gaming_score, gTgt, gFlr, ig);

  // 2. Workstation Utility (Render / Editing / Dev profile + RAM floor)
  const wsEff = getLaptopWorkstationScore(lap);
  const wsTgt = [6000, 10500, 15000, 18500, 22500][iws - 1];
  const wsFlr = [3800, 7200, 10800, 14200, 17500][iws - 1];
  const ramWsReq = [8, 16, 16, 24, 32][iws - 1];
  const ramWsMult = ramGb >= ramWsReq ? 1.0 : Math.max(0.35, Math.pow(ramGb / ramWsReq, 0.60 + 0.16 * iws));
  const uWS = _intensityUtilityCurve(wsEff, wsTgt, wsFlr, iws) * ramWsMult;

  // 3. Local AI Utility (LLMs Q4 tok/s + VRAM / Apple Unified capacity)
  const aiEff = getLaptopAIScore(lap);
  const aiRaw = (Number(lap.ai_score || 0) * (0.70 + 0.30 * (em / 8)) +
    Number(lap.llm_8b_tok_s || 0) * 18 +
    Number(lap.llm_14b_tok_s || 0) * 32 +
    Number(lap.llm_32b_tok_s || 0) * 65) * (0.90 + 0.06 * heft);
  const aiTgt = [420, 1500, 2700, 3900, 5200][ilai - 1];
  const aiFlr = [200, 850, 1750, 2600, 3400][ilai - 1];
  const memAiReq = [4, 6, 8, 10, 14][ilai - 1];
  const memAiMult = em >= memAiReq ? 1.0 : Math.max(0.18, Math.pow(em / memAiReq, 0.45 + 0.30 * ilai));
  const uLAI = _intensityUtilityCurve(aiRaw, aiTgt, aiFlr, ilai) * memAiMult;

  // 4. AI Training & CUDA / Engineering Utility
  const aiTrainEff = _computeLaptopAiTrainRaw(lap);
  const trnTgt = [520, 1750, 3200, 4400, 5700][itrn - 1];
  const trnFlr = [220, 950, 2100, 3100, 4000][itrn - 1];
  const ramTrReq = [8, 16, 16, 24, 32][itrn - 1];
  const ramTrMult = ramGb >= ramTrReq ? 1.0 : Math.max(0.28, Math.pow(ramGb / ramTrReq, 0.50 + 0.22 * itrn));
  const uTrn = _intensityUtilityCurve(aiTrainEff, trnTgt, trnFlr, itrn) * ramTrMult;

  // Blend pillars: heavier intensity naturally gives that workload slightly stronger pull
  const pcts = [wG, wWS, wAI, wTrn];
  const lvls = [ig, iws, ilai, itrn];
  const utils = [uG, uWS, uLAI, uTrn];
  const effWeights = pcts.map((pct, i) => pct * (0.60 + 0.28 * lvls[i]));
  const totEffW = Math.max(1, effWeights.reduce((a, b) => a + b, 0));
  const workU = effWeights.reduce((acc, ew, i) => acc + ew * utils[i], 0) / totEffW;

  // Cross-pillar readiness gate: penalizes severe under-provisioning on Heavy/Extreme active pillars
  let gate = 1.0;
  for (let i = 0; i < 4; i++) {
    if (pcts[i] >= 10 && lvls[i] >= 3 && utils[i] < 0.42) {
      const severity = ((lvls[i] - 2) / 3) * Math.min(1, pcts[i] / 25);
      gate *= Math.max(0.32, Math.pow(utils[i] / 0.42, 0.65 + 0.85 * severity));
    }
  }
  gate = Math.max(0.18, gate);

  const avgIntensity = pcts.reduce((acc, pct, i) => acc + pct * lvls[i], 0) / totalPct;
  const ergW = Math.max(0.08, 0.30 - (avgIntensity - 1) * 0.055);
  const sysQuality = getLaptopSystemQualityScore(lap);
  const effectiveU = (workU * (1 - ergW) + (sysQuality / 100) * ergW * Math.min(1, workU * 1.4)) * gate * baseRamSanity;
  const compositeScore = Math.max(10, Math.round(effectiveU * 8800));

  return {
    wsEff,
    aiEff,
    aiTrainEff,
    sysQuality,
    effMem: em,
    compositeScore,
    readinessGate: gate,
    avgIntensity,
    intens,
    pillarUtils: { gaming: uG, workstation: uWS, localAI: uLAI, aiTraining: uTrn }
  };
}

function getLaptopContextualCompositeScore(lap, customWeights = null) {
  if (!lap) return 1000;
  return _computeLaptopIntensityEvaluation(lap, customWeights).compositeScore;
}

function enrichLaptopsWithContextualMetrics() {
  const pool = getLaptopPool();
  if (!pool.length) return;

  let maxComposite = 1000;
  pool.forEach(lap => {
    const ev = _computeLaptopIntensityEvaluation(lap);
    lap._wsEff = ev.wsEff;
    lap._aiEff = ev.aiEff;
    lap._aiTrainEff = ev.aiTrainEff;
    lap._sysQuality = ev.sysQuality;
    lap._effGpuMem = ev.effMem;
    lap._compositeScore = ev.compositeScore;
    lap._readinessGate = ev.readinessGate;
    lap._avgIntensity = ev.avgIntensity;
    lap._pillarUtils = ev.pillarUtils;
    if (ev.compositeScore > maxComposite) maxComposite = ev.compositeScore;

    const priceSafe = Math.max(1000, Number(lap.price_brl || 3000));
    const priceExp = 0.94 - (ev.avgIntensity - 1) * 0.045;
    lap._rawCBRatio = lap._compositeScore / Math.pow(priceSafe, priceExp);
    lap._dominatedBy = null;
    lap._paretoPenalty = 1.0;
  });

  pool.forEach(lap => {
    lap._overallVersusScore = Math.min(99, Math.max(10, Math.round(
      (lap._compositeScore / Math.max(1, maxComposite)) * 65 +
      lap._sysQuality * 0.35 * Math.min(1, lap._readinessGate + 0.25)
    )));
  });

  // Pareto dominance check (comparing laptops where price is close or strictly lower + system/perf strictly stronger)
  pool.forEach(a => {
    let worstPenalty = 1.0;
    let domName = null;
    for (const b of pool) {
      if (a.slug === b.slug) continue;
      const bCheaperOrClose = b.price_brl <= a.price_brl * 1.015;
      const bStrongerPerf = b._compositeScore >= a._compositeScore * 1.05;
      const bNotWorseErgonomics = b._sysQuality >= a._sysQuality - 4;
      if (bCheaperOrClose && bStrongerPerf && bNotWorseErgonomics) {
        const gap = Math.min(0.14, (b._compositeScore / Math.max(1, a._compositeScore) - 1) * 0.25);
        const pen = Math.max(0.86, 1.0 - gap);
        if (pen < worstPenalty) {
          worstPenalty = pen;
          domName = shortLaptopChipName(b);
        }
      }
    }
    a._paretoPenalty = worstPenalty;
    a._dominatedBy = domName;
    a._adjustedCB = a._rawCBRatio * a._paretoPenalty;
  });

  const maxAdjCB = Math.max(0.0001, ...pool.map(l => l._adjustedCB));
  pool.forEach(lap => {
    lap._myCBScore = Math.min(100, Math.max(5, Math.round((lap._adjustedCB / maxAdjCB) * 100)));
  });
}

function evaluateLaptopRelationalUpgrade(baseLap, candLap, basePrice, candPrice) {
  const bScore = Math.max(1, baseLap._compositeScore || getLaptopContextualCompositeScore(baseLap));
  const cScore = Math.max(1, candLap._compositeScore || getLaptopContextualCompositeScore(candLap));
  const perfRatio = cScore / bScore;
  const perfGainPct = (perfRatio - 1) * 100;

  const gGainPct = ((Number(candLap.gaming_score || 1) / Math.max(1, Number(baseLap.gaming_score || 1))) - 1) * 100;
  const wsGainPct = ((getLaptopWorkstationScore(candLap) / Math.max(1, getLaptopWorkstationScore(baseLap))) - 1) * 100;
  const aiGainPct = ((getLaptopAIScore(candLap) / Math.max(1, getLaptopAIScore(baseLap))) - 1) * 100;
  const bTrn = Number(baseLap._aiTrainEff || _computeLaptopAiTrainRaw(baseLap));
  const cTrn = Number(candLap._aiTrainEff || _computeLaptopAiTrainRaw(candLap));
  const trnGainPct = ((cTrn / Math.max(1, bTrn)) - 1) * 100;

  const actualDelta = candPrice - basePrice;
  const priceDeltaPct = basePrice > 0 ? (actualDelta / basePrice) * 100 : 0;

  let fairMaxDelta, stealDelta, stretchMaxDelta;
  let stealCandPrice, fairMaxCandPrice, stretchCandPrice;
  let tier, color, summary;

  const baseShort = shortLaptopChipName(baseLap);
  const candShort = shortLaptopChipName(candLap);

  if (perfGainPct <= 0.5) {
    // Candidate has equal or lower workload score (could still shine in battery/screen/portability or price!)
    const targetDiscount = Math.max(0.55, perfRatio);
    fairMaxCandPrice = Math.round(basePrice * targetDiscount);
    stealCandPrice = Math.round(fairMaxCandPrice * 0.85);
    stretchCandPrice = Math.round(basePrice * 1.04);
    fairMaxDelta = fairMaxCandPrice - basePrice;
    stealDelta = stealCandPrice - basePrice;
    stretchMaxDelta = stretchCandPrice - basePrice;

    const portDiff = (candLap.weight_kg || 2) - (baseLap.weight_kg || 2);
    const battDiff = (candLap.battery_hours_light || 5) - (baseLap.battery_hours_light || 5);
    const portabilityContext = (portDiff <= -0.3 || battDiff >= 3)
      ? ` Apesar da performance bruta ${perfGainPct.toFixed(1)}%, o ${candShort} compensa com ${portDiff <= -0.3 ? `${Math.abs(portDiff).toFixed(2)} kg a menos` : ''}${portDiff <= -0.3 && battDiff >= 3 ? ' e ' : ''}${battDiff >= 3 ? `+${battDiff.toFixed(1)}h de bateria` : ''}.`
      : '';

    if (candPrice <= stealCandPrice) {
      tier = 'EXCELENTE NEGÓCIO';
      color = 'emerald';
      summary = `${candShort} entrega ${perfGainPct.toFixed(1)}% de performance frente ao ${baseShort}, mas custa ${fmtBRLShort(Math.abs(actualDelta))} a menos (desconto supera a diferença de desempenho).${portabilityContext}`;
    } else if (candPrice <= fairMaxCandPrice) {
      tier = 'COMPENSA (JUSTO)';
      color = 'sky';
      summary = `Economia de ${fmtBRLShort(Math.abs(actualDelta))} alinhada à diferença de ${perfGainPct.toFixed(1)}% de desempenho contextual.${portabilityContext}`;
    } else if (candPrice <= stretchCandPrice && (portDiff <= -0.35 || battDiff >= 4)) {
      tier = 'COMPENSA POR PORTABILIDADE';
      color = 'amber';
      summary = `Desempenho bruto ${perfGainPct.toFixed(1)}% vs ${baseShort} por ${actualDelta >= 0 ? '+' : ''}${fmtBRLShort(actualDelta)}. O ágio só se justifica se mobilidade e bateria forem sua prioridade.${portabilityContext}`;
    } else {
      tier = 'NÃO COMPENSA';
      color = 'rose';
      summary = `${candShort} custa ${actualDelta >= 0 ? '+' + fmtBRLShort(actualDelta) + ' a mais' : fmtBRLShort(Math.abs(actualDelta)) + ' a menos'} para entregar ${perfGainPct.toFixed(1)}% no score contextual. O ${baseShort} oferece melhor entrega por real gasto.`;
    }
  } else {
    fairMaxDelta = Math.round(basePrice * (perfRatio - 1));
    stealDelta = Math.round(fairMaxDelta * 0.72);
    stretchMaxDelta = Math.round(fairMaxDelta * 1.25);

    stealCandPrice = Math.round(basePrice + stealDelta);
    fairMaxCandPrice = Math.round(basePrice + fairMaxDelta);
    stretchCandPrice = Math.round(basePrice + stretchMaxDelta);

    const domWarn = candLap._dominatedBy ? ` Atenção: ${candLap._dominatedBy} oferece conjunto ainda melhor nesta faixa.` : '';

    if (actualDelta <= 0) {
      tier = 'IMPERDÍVEL (MAIS BARATO E FORTE)';
      color = 'emerald';
      summary = `${candShort} é +${perfGainPct.toFixed(1)}% mais forte (${gGainPct >= 0 ? '+' : ''}${gGainPct.toFixed(0)}% Jogos, ${aiGainPct >= 0 ? '+' : ''}${aiGainPct.toFixed(0)}% IA) e ainda custa ${fmtBRLShort(Math.abs(actualDelta))} a menos que ${baseShort}!`;
    } else if (actualDelta <= stealDelta) {
      tier = 'EXCELENTE NEGÓCIO';
      color = 'emerald';
      summary = `Diferença de apenas +${fmtBRLShort(actualDelta)} (+${priceDeltaPct.toFixed(0)}%) para salto de +${perfGainPct.toFixed(1)}% no desempenho contextual (+${gGainPct.toFixed(0)}% Jogos, +${aiGainPct.toFixed(0)}% IA). Eficiência superior ao modelo base!`;
    } else if (actualDelta <= fairMaxDelta) {
      tier = 'COMPENSA (JUSTO)';
      color = 'sky';
      summary = `Diferença de +${fmtBRLShort(actualDelta)} dentro da paridade justa de até +${fmtBRLShort(fairMaxDelta)} pelo ganho de +${perfGainPct.toFixed(1)}% em sistema completo.`;
    } else if (actualDelta <= stretchMaxDelta) {
      tier = 'ÁGIO ALTO';
      color = 'amber';
      summary = `Está ${fmtBRLShort(actualDelta - fairMaxDelta)} acima da paridade linear (+${fmtBRLShort(fairMaxDelta)}). Vale a pena se você realmente precisa da tela, VRAM ou bateria extras.${domWarn}`;
    } else {
      tier = 'NÃO COMPENSA';
      color = 'rose';
      summary = `Pagar +${fmtBRLShort(actualDelta)} (+${priceDeltaPct.toFixed(0)}% no preço) por +${perfGainPct.toFixed(1)}% de desempenho contextual é desproporcional. Teto justo para ${candShort}: até ${fmtBRLShort(fairMaxCandPrice)}.${domWarn}`;
    }
  }

  return {
    perfRatio, perfGainPct, gGainPct, wsGainPct, aiGainPct, trnGainPct,
    actualDelta, priceDeltaPct,
    fairMaxDelta, stealDelta, stretchMaxDelta,
    stealCandPrice, fairMaxCandPrice, stretchCandPrice,
    tier, color, summary
  };
}

/* ============================================================================
 * B. SELECTORS, PRESETS & SYNC
 * ============================================================================ */

function _buildGroupedLaptopOptionsHTML(pool, selectedSlug, labelPrefix = '') {
  const groups = ['gaming_pro', 'gaming', 'macbook', 'ultrabook', 'budget'];
  let html = '';
  groups.forEach(cat => {
    const items = pool.filter(l => l.category === cat).sort((a, b) => a.price_brl - b.price_brl);
    if (!items.length) return;
    html += `<optgroup label="${LAP_CATEGORY_LABELS[cat] || cat}">`;
    items.forEach(l => {
      const sel = l.slug === selectedSlug ? 'selected' : '';
      html += `<option value="${_escLapHtml(l.slug)}" ${sel}>${labelPrefix}${_escLapHtml(shortLaptopLabel(l))} (${fmtBRLShort(l.price_brl)})</option>`;
    });
    html += `</optgroup>`;
  });
  return html;
}

function _pickDefaultDuelPair(pool) {
  const gamersMid = pool.filter(l => l.category === 'gaming').sort((a, b) => (b._myCBScore || 0) - (a._myCBScore || 0));
  const gamersPro = pool.filter(l => l.category === 'gaming_pro').sort((a, b) => (b._myCBScore || 0) - (a._myCBScore || 0));
  const allSorted = [...pool].sort((a, b) => a.price_brl - b.price_brl);

  const base = gamersMid[0] || allSorted[0] || pool[0];
  const cand = gamersPro.find(l => l.slug !== (base && base.slug))
    || [...pool].sort((a, b) => (b._compositeScore || 0) - (a._compositeScore || 0)).find(l => l.slug !== (base && base.slug))
    || pool[1]
    || base;
  return { base, cand };
}

function _renderDynamicLaptopPresets(pool) {
  const container = document.getElementById('laptop-duel-presets');
  if (!container || pool.length < 2) return;

  const byCat = cat => pool.filter(l => l.category === cat).sort((a, b) => (b._myCBScore || 0) - (a._myCBScore || 0));
  const byPerf = cat => pool.filter(l => l.category === cat).sort((a, b) => (b._compositeScore || 0) - (a._compositeScore || 0));

  const midGamer = byCat('gaming')[0];
  const proGamer = byCat('gaming_pro')[0] || byPerf('gaming_pro')[0];
  const mac = byCat('macbook')[0] || byPerf('macbook')[0];
  const ultra = byCat('ultrabook')[0] || byPerf('ultrabook')[0];
  const topCB = [...pool].sort((a, b) => (b._myCBScore || 0) - (a._myCBScore || 0));

  const presets = [];
  if (midGamer && proGamer && midGamer.slug !== proGamer.slug) {
    presets.push({ label: '🎮 RTX 3050/4050 vs RTX 4060+', base: midGamer.slug, cand: proGamer.slug });
  }
  if (proGamer && mac && proGamer.slug !== mac.slug) {
    presets.push({ label: '🍎 MacBook vs Gamer RTX', base: proGamer.slug, cand: mac.slug });
  }
  if (ultra && midGamer && ultra.slug !== midGamer.slug) {
    presets.push({ label: '💼 Ultrabook vs Gamer', base: ultra.slug, cand: midGamer.slug });
  }
  if (topCB.length >= 2) {
    presets.push({ label: '🏆 Top #2 vs Top #1 C/B', base: topCB[1].slug, cand: topCB[0].slug });
  }

  container.innerHTML = presets.map(p => `
    <button type="button" onclick="setLaptopDuelPreset('${_escLapHtml(p.cand)}','${_escLapHtml(p.base)}')"
      class="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800/90 hover:bg-purple-500/20 text-slate-200 hover:text-purple-200 border border-slate-700 hover:border-purple-500/40 transition cursor-pointer">
      ${p.label}
    </button>
  `).join('');
}

function populateLaptopSelectors() {
  const pool = getLaptopPool();
  if (!pool.length) return;

  const { base: defBase, cand: defCand } = _pickDefaultDuelPair(pool);

  if (!STATE.laptopDuelBaseSlug || !findLaptopBySlug(STATE.laptopDuelBaseSlug)) {
    STATE.laptopDuelBaseSlug = defBase ? defBase.slug : pool[0].slug;
  }
  if (!STATE.laptopDuelCandSlug || !findLaptopBySlug(STATE.laptopDuelCandSlug)) {
    STATE.laptopDuelCandSlug = defCand ? defCand.slug : pool[0].slug;
  }
  if (!STATE.laptopCbRelBaseSlug || !findLaptopBySlug(STATE.laptopCbRelBaseSlug)) {
    STATE.laptopCbRelBaseSlug = STATE.laptopDuelBaseSlug;
  }
  if (!STATE.simLaptopASlug || !findLaptopBySlug(STATE.simLaptopASlug)) {
    STATE.simLaptopASlug = STATE.laptopDuelBaseSlug;
  }
  if (!STATE.simLaptopBSlug || !findLaptopBySlug(STATE.simLaptopBSlug)) {
    STATE.simLaptopBSlug = STATE.laptopDuelCandSlug;
  }
  if (!STATE.laptopBuilder) {
    STATE.laptopBuilder = {
      slug: '', price: 0, extraRamGb: 0, extraRamPrice: 0, extraRamOwned: false,
      extraSsdGb: 0, extraSsdPrice: 0, extraSsdOwned: false,
      accessoryName: 'Suporte / Cooling Pad + Hub USB-C', accessoryPrice: 220, accessoryOwned: false
    };
  }
  if (!STATE.laptopBuilder.slug || !findLaptopBySlug(STATE.laptopBuilder.slug)) {
    STATE.laptopBuilder.slug = STATE.laptopDuelCandSlug;
    const bLap = findLaptopBySlug(STATE.laptopBuilder.slug);
    STATE.laptopBuilder.price = bLap ? bLap.price_brl : 0;
  }

  const selBase = document.getElementById('laptop-duel-select-base');
  const selCand = document.getElementById('laptop-duel-select-cand');
  const selCbBase = document.getElementById('laptop-cb-filter-base-rel');
  const selSimA = document.getElementById('sim-select-laptop-a');
  const selSimB = document.getElementById('sim-select-laptop-b');

  if (selBase) selBase.innerHTML = _buildGroupedLaptopOptionsHTML(pool, STATE.laptopDuelBaseSlug);
  if (selCand) selCand.innerHTML = _buildGroupedLaptopOptionsHTML(pool, STATE.laptopDuelCandSlug);
  if (selCbBase) selCbBase.innerHTML = _buildGroupedLaptopOptionsHTML(pool, STATE.laptopCbRelBaseSlug);
  if (selSimA) selSimA.innerHTML = _buildGroupedLaptopOptionsHTML(pool, STATE.simLaptopASlug);
  if (selSimB) selSimB.innerHTML = _buildGroupedLaptopOptionsHTML(pool, STATE.simLaptopBSlug);

  _renderDynamicLaptopPresets(pool);
  syncLaptopDuelPriceInputsFromSelection();
}

function syncLaptopDuelPriceInputsFromSelection() {
  const baseLap = findLaptopBySlug(STATE.laptopDuelBaseSlug);
  const candLap = findLaptopBySlug(STATE.laptopDuelCandSlug);
  const pBase = document.getElementById('laptop-duel-price-base');
  const pCand = document.getElementById('laptop-duel-price-cand');
  if (pBase && baseLap) pBase.value = Math.round(baseLap.price_brl);
  if (pCand && candLap) pCand.value = Math.round(candLap.price_brl);
}

function setLaptopDuelPreset(candSlug, baseSlug) {
  if (findLaptopBySlug(baseSlug)) STATE.laptopDuelBaseSlug = baseSlug;
  if (findLaptopBySlug(candSlug)) STATE.laptopDuelCandSlug = candSlug;
  const selBase = document.getElementById('laptop-duel-select-base');
  const selCand = document.getElementById('laptop-duel-select-cand');
  if (selBase) selBase.value = STATE.laptopDuelBaseSlug;
  if (selCand) selCand.value = STATE.laptopDuelCandSlug;
  syncLaptopDuelPriceInputsFromSelection();
  renderLaptopDuelAnalysis();
}

function onLaptopDuelSelectionChange() {
  const selBase = document.getElementById('laptop-duel-select-base');
  const selCand = document.getElementById('laptop-duel-select-cand');
  if (selBase && selBase.value) STATE.laptopDuelBaseSlug = selBase.value;
  if (selCand && selCand.value) STATE.laptopDuelCandSlug = selCand.value;
  syncLaptopDuelPriceInputsFromSelection();
  renderLaptopDuelAnalysis();
}

function swapLaptopDuelPair() {
  const tmp = STATE.laptopDuelBaseSlug;
  STATE.laptopDuelBaseSlug = STATE.laptopDuelCandSlug;
  STATE.laptopDuelCandSlug = tmp;
  const selBase = document.getElementById('laptop-duel-select-base');
  const selCand = document.getElementById('laptop-duel-select-cand');
  if (selBase) selBase.value = STATE.laptopDuelBaseSlug;
  if (selCand) selCand.value = STATE.laptopDuelCandSlug;
  syncLaptopDuelPriceInputsFromSelection();
  renderLaptopDuelAnalysis();
}

function resetLaptopDuelPricesToLive() {
  syncLaptopDuelPriceInputsFromSelection();
  renderLaptopDuelAnalysis();
}

function sendLaptopToDuel(slug, isCand = true) {
  if (!findLaptopBySlug(slug)) return;
  if (typeof setMainContext === 'function') setMainContext('laptop');
  if (isCand) STATE.laptopDuelCandSlug = slug;
  else STATE.laptopDuelBaseSlug = slug;

  const sel = document.getElementById(isCand ? 'laptop-duel-select-cand' : 'laptop-duel-select-base');
  if (sel) sel.value = slug;
  syncLaptopDuelPriceInputsFromSelection();
  if (typeof switchTab === 'function') switchTab('versus');
  else renderLaptopDuelAnalysis();
}

/* ============================================================================
 * C. TAB 1 — VERSUS FULL-SYSTEM ANALYSIS
 * ============================================================================ */

function _syncLaptopScaleButtons() {
  const isAbs = (typeof STATE !== 'undefined' && STATE.comparisonScaleMode === 'absolute');
  const bRel = document.getElementById('btn-laptop-scale-rel-duel');
  const bAbs = document.getElementById('btn-laptop-scale-abs-duel');
  if (!bRel || !bAbs) return;
  bRel.classList.toggle('is-active', !isAbs);
  bAbs.classList.toggle('is-active', isAbs);
}

function _renderLaptopPickerMeta(lap, side) {
  const thumb = document.getElementById(`laptop-${side}-thumb`);
  if (thumb) {
    if (lap.image) {
      thumb.src = lap.image;
      thumb.alt = lap.name;
      thumb.classList.remove('hidden');
    } else {
      thumb.classList.add('hidden');
    }
  }
  const badgeEl = document.getElementById(`laptop-${side}-status-badge`);
  if (badgeEl) {
    badgeEl.innerHTML = typeof getPriceStatusBadgeHTML === 'function' ? getPriceStatusBadgeHTML(lap) : '';
  }
  const st = lap.price_stats || {};
  const tgtEl = document.getElementById(`laptop-duel-target-${side}`);
  if (tgtEl) tgtEl.textContent = st.target_price ? fmtBRL(st.target_price) : fmtBRL(lap.price_brl);
  const histEl = document.getElementById(`laptop-duel-hist-${side}`);
  if (histEl) {
    const minVal = st.min_all_time || st.min_90d || lap.price_brl;
    histEl.textContent = `${fmtBRLShort(minVal)} (mín)`;
  }
  const specsEl = document.getElementById(`laptop-duel-specs-${side}`);
  if (specsEl) {
    const ramTag = lap.ram_soldered ? `${lap.ram_gb}GB Soldada` : `${lap.ram_gb}GB (Máx ${lap.ram_max_gb}GB)`;
    specsEl.innerHTML = `
      <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200">⚡ ${_escLapHtml(lap.cpu_name)}</span>
      <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-purple-300">🎮 ${_escLapHtml(lap.gpu_name)}</span>
      <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-sky-300">🧠 ${ramTag} • ${lap.storage_gb >= 1024 ? (lap.storage_gb / 1024) + 'TB' : lap.storage_gb + 'GB'}</span>
      <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300">📺 ${lap.screen_inches}" ${lap.screen_hz}Hz</span>
      <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-amber-300">⚖️ ${lap.weight_kg}kg • 🔋 ${lap.battery_wh}Wh</span>
    `;
  }
}

function _buildVersusWhyBullets(lapA, lapB, priceA, priceB) {
  const reasonsA = [];
  const reasonsB = [];

  const cmpHigher = (valA, valB, pctMin, absMin, makeTextA, makeTextB) => {
    const a = Number(valA || 0), b = Number(valB || 0);
    if (a > b) {
      const diff = a - b;
      const pct = b > 0 ? (diff / b) * 100 : 100;
      if (diff >= absMin && pct >= pctMin) reasonsA.push({ score: pct + diff * 0.1, text: makeTextA(a, b, diff, pct) });
    } else if (b > a) {
      const diff = b - a;
      const pct = a > 0 ? (diff / a) * 100 : 100;
      if (diff >= absMin && pct >= pctMin) reasonsB.push({ score: pct + diff * 0.1, text: makeTextB(b, a, diff, pct) });
    }
  };

  // Price advantage
  if (priceA < priceB - 100) {
    const save = priceB - priceA;
    reasonsA.push({ score: 65, text: `<strong>${fmtBRLShort(save)} mais barato</strong> hoje (${fmtBRLShort(priceA)} vs ${fmtBRLShort(priceB)})` });
  } else if (priceB < priceA - 100) {
    const save = priceA - priceB;
    reasonsB.push({ score: 65, text: `<strong>${fmtBRLShort(save)} mais barato</strong> hoje (${fmtBRLShort(priceB)} vs ${fmtBRLShort(priceA)})` });
  }

  // Gaming / GPU + TGP
  cmpHigher(lapA.gaming_score, lapB.gaming_score, 8, 80,
    (a, b, d, p) => `<strong>+${p.toFixed(0)}% mais FPS em Jogos</strong> (${_escLapHtml(lapA.gpu_name)} vs ${_escLapHtml(lapB.gpu_name)})`,
    (b, a, d, p) => `<strong>+${p.toFixed(0)}% mais FPS em Jogos</strong> (${_escLapHtml(lapB.gpu_name)} vs ${_escLapHtml(lapA.gpu_name)})`
  );

  // VRAM / Unified Memory
  cmpHigher(lapA._effGpuMem, lapB._effGpuMem, 15, 2,
    (a, b) => `<strong>${a}GB de ${lapA.is_apple_unified ? 'Memória Unificada p/ GPU' : 'VRAM dedicada'}</strong> vs ${b}GB (melhor para texturas e LLMs maiores)`,
    (b, a) => `<strong>${b}GB de ${lapB.is_apple_unified ? 'Memória Unificada p/ GPU' : 'VRAM dedicada'}</strong> vs ${a}GB (melhor para texturas e LLMs maiores)`
  );

  // Workstation
  cmpHigher(lapA._wsEff, lapB._wsEff, 8, 400,
    (a, b, d, p) => `<strong>+${p.toFixed(0)}% mais rápido em Workstation / Render / Compilação</strong> (${_escLapHtml(lapA.cpu_name)})`,
    (b, a, d, p) => `<strong>+${p.toFixed(0)}% mais rápido em Workstation / Render / Compilação</strong> (${_escLapHtml(lapB.cpu_name)})`
  );

  // AI Local tok/s
  cmpHigher(lapA.llm_8b_tok_s, lapB.llm_8b_tok_s, 15, 3,
    (a, b) => `<strong>IA Local mais veloz:</strong> ~${a} tok/s em Llama 8B vs ~${b} tok/s`,
    (b, a) => `<strong>IA Local mais veloz:</strong> ~${b} tok/s em Llama 8B vs ~${a} tok/s`
  );

  // Display Hz / sRGB / Nits
  cmpHigher(lapA.screen_hz, lapB.screen_hz, 20, 30,
    (a, b) => `<strong>Tela mais fluida de ${a}Hz</strong> vs ${b}Hz`,
    (b, a) => `<strong>Tela mais fluida de ${b}Hz</strong> vs ${a}Hz`
  );
  cmpHigher(lapA.srgb_pct, lapB.srgb_pct, 10, 15,
    (a, b) => `<strong>Fidelidade de cor superior:</strong> ${a}% sRGB vs ${b}% sRGB`,
    (b, a) => `<strong>Fidelidade de cor superior:</strong> ${b}% sRGB vs ${a}% sRGB`
  );
  cmpHigher(lapA.brightness_nits, lapB.brightness_nits, 15, 50,
    (a, b) => `<strong>Tela mais brilhante:</strong> ${a} nits vs ${b} nits`,
    (b, a) => `<strong>Tela mais brilhante:</strong> ${b} nits vs ${a} nits`
  );

  // Battery autonomy
  cmpHigher(lapA.battery_hours_light, lapB.battery_hours_light, 20, 1.5,
    (a, b, d) => `<strong>+${d.toFixed(1)}h a mais de bateria</strong> (${a.toFixed(1)}h vs ${b.toFixed(1)}h em uso leve)`,
    (b, a, d) => `<strong>+${d.toFixed(1)}h a mais de bateria</strong> (${b.toFixed(1)}h vs ${a.toFixed(1)}h em uso leve)`
  );

  // Lower weight
  const wDiff = Number(lapB.weight_kg || 2) - Number(lapA.weight_kg || 2);
  if (wDiff >= 0.25) {
    reasonsA.push({ score: 45 + wDiff * 12, text: `<strong>${wDiff.toFixed(2)} kg mais leve</strong> na mochila (${lapA.weight_kg} kg vs ${lapB.weight_kg} kg)` });
  } else if (wDiff <= -0.25) {
    reasonsB.push({ score: 45 + Math.abs(wDiff) * 12, text: `<strong>${Math.abs(wDiff).toFixed(2)} kg mais leve</strong> na mochila (${lapB.weight_kg} kg vs ${lapA.weight_kg} kg)` });
  }

  // Upgradeability / RAM slots / M.2 extra
  if (!lapA.ram_soldered && lapB.ram_soldered) {
    reasonsA.push({ score: 52, text: `<strong>RAM expansível até ${lapA.ram_max_gb}GB</strong> (${lapA.ram_slots} slots SO-DIMM) vs soldada sem upgrade` });
  } else if (!lapB.ram_soldered && lapA.ram_soldered) {
    reasonsB.push({ score: 52, text: `<strong>RAM expansível até ${lapB.ram_max_gb}GB</strong> (${lapB.ram_slots} slots SO-DIMM) vs soldada sem upgrade` });
  } else {
    cmpHigher(lapA.ram_gb, lapB.ram_gb, 25, 8,
      (a, b) => `<strong>Vem com mais RAM de fábrica:</strong> ${a}GB vs ${b}GB`,
      (b, a) => `<strong>Vem com mais RAM de fábrica:</strong> ${b}GB vs ${a}GB`
    );
  }
  if ((lapA.extra_m2_slots || 0) > (lapB.extra_m2_slots || 0)) {
    reasonsA.push({ score: 36, text: `<strong>Slot M.2 extra livre</strong> para adicionar 2º SSD sem trocar o principal` });
  } else if ((lapB.extra_m2_slots || 0) > (lapA.extra_m2_slots || 0)) {
    reasonsB.push({ score: 36, text: `<strong>Slot M.2 extra livre</strong> para adicionar 2º SSD sem trocar o principal` });
  }

  // Storage capacity
  cmpHigher(lapA.storage_gb, lapB.storage_gb, 40, 256,
    (a, b) => `<strong>Mais espaço SSD de fábrica:</strong> ${a >= 1024 ? (a / 1024) + 'TB' : a + 'GB'} vs ${b >= 1024 ? (b / 1024) + 'TB' : b + 'GB'}`,
    (b, a) => `<strong>Mais espaço SSD de fábrica:</strong> ${b >= 1024 ? (b / 1024) + 'TB' : b + 'GB'} vs ${a >= 1024 ? (a / 1024) + 'TB' : a + 'GB'}`
  );

  reasonsA.sort((x, y) => y.score - x.score);
  reasonsB.sort((x, y) => y.score - x.score);
  return {
    a: reasonsA.slice(0, 6).map(x => x.text),
    b: reasonsB.slice(0, 6).map(x => x.text)
  };
}

function _renderLaptopSpecSheet(baseLap, candLap, basePrice, candPrice) {
  const el = document.getElementById('laptop-duel-spec-sheet');
  if (!el) return;

  const row = (label, valA, valB, numA = null, numB = null, lowerBetter = false) => {
    let winA = false, winB = false;
    if (numA !== null && numB !== null && Number(numA) !== Number(numB)) {
      if (lowerBetter) {
        winA = Number(numA) < Number(numB);
        winB = Number(numB) < Number(numA);
      } else {
        winA = Number(numA) > Number(numB);
        winB = Number(numB) > Number(numA);
      }
    }
    const clsA = winA ? 'text-emerald-300 font-bold bg-emerald-500/10 rounded px-2 py-0.5 border border-emerald-500/30' : 'text-slate-200';
    const clsB = winB ? 'text-emerald-300 font-bold bg-emerald-500/10 rounded px-2 py-0.5 border border-emerald-500/30' : 'text-slate-200';
    return `
      <tr class="border-b border-slate-800/60 hover:bg-slate-900/50 transition">
        <td class="py-2 px-3 text-slate-400 font-medium w-1/3">${label}</td>
        <td class="py-2 px-3 text-xs font-mono w-1/3"><span class="${clsA}">${winA ? '✓ ' : ''}${valA}</span></td>
        <td class="py-2 px-3 text-xs font-mono w-1/3"><span class="${clsB}">${winB ? '✓ ' : ''}${valB}</span></td>
      </tr>
    `;
  };

  const sec = (title, icon, rowsHtml) => `
    <div class="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60">
      <div class="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs font-bold text-slate-200">
        <span>${icon} ${title}</span>
        <div class="hidden sm:flex items-center gap-4 text-xs font-mono">
          <span class="text-emerald-400">Base: ${_escLapHtml(shortLaptopChipName(baseLap))}</span>
          <span class="text-purple-400">Cand: ${_escLapHtml(shortLaptopChipName(candLap))}</span>
        </div>
      </div>
      <table class="w-full text-left border-collapse text-xs">
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  const fmtMem = l => l.is_apple_unified ? `${l._effGpuMem}GB Unif.` : (l.gpu_vram_gb > 0 ? `${l.gpu_vram_gb}GB VRAM` : 'Compartilhada');
  const fmtSsd = l => l.storage_gb >= 1024 ? `${(l.storage_gb / 1024).toFixed(l.storage_gb % 1024 ? 1 : 0)} TB` : `${l.storage_gb} GB`;

  const s1 = sec('1. Processador & Plataforma', '⚙️', [
    row('Processador (CPU)', _escLapHtml(baseLap.cpu_name), _escLapHtml(candLap.cpu_name), baseLap.cpu_multi_score, candLap.cpu_multi_score),
    row('Núcleos / Threads', `${baseLap.cpu_cores}C / ${baseLap.cpu_threads}T`, `${candLap.cpu_cores}C / ${candLap.cpu_threads}T`, baseLap.cpu_threads, candLap.cpu_threads),
    row('Clock Boost / Cache L3', `${baseLap.cpu_boost_ghz} GHz • ${baseLap.cpu_cache_mb}MB`, `${candLap.cpu_boost_ghz} GHz • ${candLap.cpu_cache_mb}MB`, baseLap.cpu_single_score, candLap.cpu_single_score),
    row('TDP Base & Arquitetura', `${baseLap.cpu_tdp_w}W • ${_escLapHtml(baseLap.cpu_arch)}`, `${candLap.cpu_tdp_w}W • ${_escLapHtml(candLap.cpu_arch)}`),
    row('NPU Dedicada (IA Copilot+ / ANE)', baseLap.has_npu ? 'Sim ✓' : 'Não', candLap.has_npu ? 'Sim ✓' : 'Não', baseLap.has_npu ? 1 : 0, candLap.has_npu ? 1 : 0)
  ].join(''));

  const s2 = sec('2. Placa de Vídeo (GPU) & IA Local', '🎮', [
    row('GPU', _escLapHtml(baseLap.gpu_name), _escLapHtml(candLap.gpu_name), baseLap.gaming_score, candLap.gaming_score),
    row('Memória Gráfica (VRAM / Unificada)', fmtMem(baseLap), fmtMem(candLap), baseLap._effGpuMem, candLap._effGpuMem),
    row('TGP Máximo da GPU', baseLap.gpu_is_dedicated ? `${baseLap.gpu_tgp_w}W` : (baseLap.is_apple_unified ? `${baseLap.gpu_tgp_w}W SoC` : 'Integrada'), candLap.gpu_is_dedicated ? `${candLap.gpu_tgp_w}W` : (candLap.is_apple_unified ? `${candLap.gpu_tgp_w}W SoC` : 'Integrada'), baseLap.gpu_tgp_w, candLap.gpu_tgp_w),
    row('Largura de Banda & FP16', `${baseLap.gpu_bw_gbs} GB/s • ${baseLap.gpu_fp16_tflops} TFLOPS`, `${candLap.gpu_bw_gbs} GB/s • ${candLap.gpu_fp16_tflops} TFLOPS`, baseLap.gpu_fp16_tflops, candLap.gpu_fp16_tflops),
    row('Velocidade LLM 8B / 14B (Q4)', `${baseLap.llm_8b_tok_s} / ${baseLap.llm_14b_tok_s} tok/s`, `${candLap.llm_8b_tok_s} / ${candLap.llm_14b_tok_s} tok/s`, baseLap.llm_8b_tok_s, candLap.llm_8b_tok_s),
    row('Suporte LLM 32B Q4', baseLap.llm_32b_tok_s > 0 ? `${baseLap.llm_32b_tok_s} tok/s` : 'Offload CPU/RAM', candLap.llm_32b_tok_s > 0 ? `${candLap.llm_32b_tok_s} tok/s` : 'Offload CPU/RAM', baseLap.llm_32b_tok_s, candLap.llm_32b_tok_s)
  ].join(''));

  const s3 = sec('3. Memória RAM & Armazenamento', '💾', [
    row('RAM Instalada & Tipo', `${baseLap.ram_gb} GB ${baseLap.ram_type}`, `${candLap.ram_gb} GB ${candLap.ram_type}`, baseLap.ram_gb, candLap.ram_gb),
    row('Expansão de RAM', baseLap.ram_soldered ? 'Soldada (Sem upgrade)' : `${baseLap.ram_slots} slots SO-DIMM (Máx ${baseLap.ram_max_gb}GB)`, candLap.ram_soldered ? 'Soldada (Sem upgrade)' : `${candLap.ram_slots} slots SO-DIMM (Máx ${candLap.ram_max_gb}GB)`, baseLap.ram_soldered ? 0 : baseLap.ram_max_gb, candLap.ram_soldered ? 0 : candLap.ram_max_gb),
    row('SSD de Fábrica', `${fmtSsd(baseLap)} (${baseLap.storage_type})`, `${fmtSsd(candLap)} (${candLap.storage_type})`, baseLap.storage_gb, candLap.storage_gb),
    row('Slots M.2 Extras Livres', `${baseLap.extra_m2_slots} slot(s) extra`, `${candLap.extra_m2_slots} slot(s) extra`, baseLap.extra_m2_slots, candLap.extra_m2_slots)
  ].join(''));

  const s4 = sec('4. Tela & Qualidade Visual', '📺', [
    row('Tamanho & Painel', `${baseLap.screen_inches}" ${_escLapHtml(baseLap.panel_type)}`, `${candLap.screen_inches}" ${_escLapHtml(candLap.panel_type)}`),
    row('Resolução & Taxa (Hz)', `${baseLap.screen_res} @ ${baseLap.screen_hz}Hz`, `${candLap.screen_res} @ ${candLap.screen_hz}Hz`, baseLap.screen_hz, candLap.screen_hz),
    row('Fidelidade sRGB & Brilho', `${baseLap.srgb_pct}% sRGB • ${baseLap.brightness_nits} nits`, `${candLap.srgb_pct}% sRGB • ${candLap.brightness_nits} nits`, baseLap.srgb_pct + baseLap.brightness_nits * 0.2, candLap.srgb_pct + candLap.brightness_nits * 0.2)
  ].join(''));

  const s5 = sec('5. Bateria, Fonte & Portabilidade', '🔋', [
    row('Peso & Espessura', `${baseLap.weight_kg} kg • ${baseLap.thickness_mm} mm`, `${candLap.weight_kg} kg • ${candLap.thickness_mm} mm`, baseLap.weight_kg, candLap.weight_kg, true),
    row('Capacidade da Bateria', `${baseLap.battery_wh} Wh`, `${candLap.battery_wh} Wh`, baseLap.battery_wh, candLap.battery_wh),
    row('Autonomia Est. (Leve / Pesado)', `${baseLap.battery_hours_light}h / ${baseLap.battery_hours_heavy}h`, `${candLap.battery_hours_light}h / ${candLap.battery_hours_heavy}h`, baseLap.battery_hours_light, candLap.battery_hours_light),
    row('Carregador & USB-C PD', `${baseLap.charger_w}W • ${baseLap.usb_c_pd ? 'Suporta USB-C PD ✓' : 'Proprietário'}`, `${candLap.charger_w}W • ${candLap.usb_c_pd ? 'Suporta USB-C PD ✓' : 'Proprietário'}`)
  ].join(''));

  const s6 = sec('6. Conectividade, Teclado, SO & Compra', '🔌', [
    row('Portas Disponíveis', _escLapHtml((baseLap.ports || []).join(', ')), _escLapHtml((candLap.ports || []).join(', ')), (baseLap.ports || []).length, (candLap.ports || []).length),
    row('Wi-Fi & Conexões sem Fio', _escLapHtml(baseLap.wifi_spec), _escLapHtml(candLap.wifi_spec)),
    row('Teclado & Sistema Operacional', `${_escLapHtml(baseLap.keyboard_layout)}${baseLap.keyboard_backlit ? ' Retroiluminado' : ''} • ${_escLapHtml(baseLap.os)}`, `${_escLapHtml(candLap.keyboard_layout)}${candLap.keyboard_backlit ? ' Retroiluminado' : ''} • ${_escLapHtml(candLap.os)}`),
    row('Loja Atual & Parcelamento', `${_escLapHtml(baseLap.store_name)} • ${fmtBRLShort(basePrice)} (${baseLap.installments}x ${fmtBRLShort(baseLap.installment_price_brl / Math.max(1, baseLap.installments))})`, `${_escLapHtml(candLap.store_name)} • ${fmtBRLShort(candPrice)} (${candLap.installments}x ${fmtBRLShort(candLap.installment_price_brl / Math.max(1, candLap.installments))})`, basePrice, candPrice, true)
  ].join(''));

  el.innerHTML = s1 + s2 + s3 + s4 + s5 + s6;
}

function renderLaptopDuelAnalysis() {
  const pool = getLaptopPool();
  if (!pool.length) return;
  enrichLaptopsWithContextualMetrics();

  if (!findLaptopBySlug(STATE.laptopDuelBaseSlug) || !findLaptopBySlug(STATE.laptopDuelCandSlug)) {
    populateLaptopSelectors();
  }
  const baseLap = findLaptopBySlug(STATE.laptopDuelBaseSlug) || pool[0];
  const candLap = findLaptopBySlug(STATE.laptopDuelCandSlug) || pool[Math.min(1, pool.length - 1)];

  const basePriceInput = parseFloat(document.getElementById('laptop-duel-price-base')?.value);
  const candPriceInput = parseFloat(document.getElementById('laptop-duel-price-cand')?.value);
  const basePrice = (basePriceInput > 0) ? basePriceInput : baseLap.price_brl;
  const candPrice = (candPriceInput > 0) ? candPriceInput : candLap.price_brl;

  _syncLaptopScaleButtons();
  _renderLaptopPickerMeta(baseLap, 'base');
  _renderLaptopPickerMeta(candLap, 'cand');

  const rel = evaluateLaptopRelationalUpgrade(baseLap, candLap, basePrice, candPrice);
  const ex = getLaptopCatalogExtremes();

  // Overall Versus Score Cards (A = Cyan, B = Violet)
  const ratingsEl = document.getElementById('laptop-duel-versus-ratings');
  if (ratingsEl) {
    const bWin = baseLap._overallVersusScore > candLap._overallVersusScore;
    const cWin = candLap._overallVersusScore > baseLap._overallVersusScore;
    ratingsEl.innerHTML = `
      <div class="ui-score-card ui-score-card--a">
        <div class="flex items-center justify-between gap-2">
          <span class="ui-badge ui-badge--a">A · Base ${bWin ? '★' : ''}</span>
          <span class="text-xs ui-mono text-slate-400">C/B ${baseLap._myCBScore}/100</span>
        </div>
        <span class="text-sm font-bold text-white truncate block mt-1">${_escLapHtml(shortLaptopChipName(baseLap))}</span>
        <div class="flex items-baseline gap-1.5 pt-1">
          <span class="text-2xl ui-mono font-black" style="color: var(--ui-compare-a-text);">${baseLap._overallVersusScore}</span>
          <span class="text-xs text-slate-400">/ 100 Score geral</span>
        </div>
      </div>
      <div class="ui-score-card ui-score-card--b">
        <div class="flex items-center justify-between gap-2">
          <span class="ui-badge ui-badge--b">B · Candidato ${cWin ? '★' : ''}</span>
          <span class="text-xs ui-mono text-slate-400">C/B ${candLap._myCBScore}/100</span>
        </div>
        <span class="text-sm font-bold text-white truncate block mt-1">${_escLapHtml(shortLaptopChipName(candLap))}</span>
        <div class="flex items-baseline gap-1.5 pt-1">
          <span class="text-2xl ui-mono font-black" style="color: var(--ui-compare-b-text);">${candLap._overallVersusScore}</span>
          <span class="text-xs text-slate-400">/ 100 Score geral</span>
        </div>
      </div>
    `;
  }

  // Versus Comparison Bars
  const barsEl = document.getElementById('laptop-duel-versus-bars');
  if (barsEl && typeof renderComparisonBarHTML === 'function') {
    const bNameShort = shortLaptopChipName(baseLap);
    const cNameShort = shortLaptopChipName(candLap);
    barsEl.innerHTML = [
      renderComparisonBarHTML({
        title: 'Score Contextual Geral (Pesos Ativos)',
        iconSvg: LAP_SVGS.speed,
        baseVal: baseLap._compositeScore,
        candVal: candLap._compositeScore,
        baseLabel: `${baseLap._compositeScore} pts`,
        candLabel: `${candLap._compositeScore} pts`,
        diffPct: rel.perfGainPct,
        maxVal: ex.maxComposite,
        baseName: bNameShort,
        candName: cNameShort
      }),
      renderComparisonBarHTML({
        title: 'Jogos & GPU TGP',
        iconSvg: LAP_SVGS.speed,
        baseVal: baseLap.gaming_score,
        candVal: candLap.gaming_score,
        baseLabel: `${baseLap.gaming_score} pts`,
        candLabel: `${candLap.gaming_score} pts`,
        diffPct: rel.gGainPct,
        maxVal: ex.maxGaming,
        baseName: bNameShort,
        candName: cNameShort
      }),
      renderComparisonBarHTML({
        title: 'Workstation (Render / Edição / Dev)',
        iconSvg: LAP_SVGS.cpu,
        baseVal: baseLap._wsEff,
        candVal: candLap._wsEff,
        baseLabel: `${baseLap._wsEff}`,
        candLabel: `${candLap._wsEff}`,
        diffPct: rel.wsGainPct,
        maxVal: ex.maxWS,
        baseName: bNameShort,
        candName: cNameShort
      }),
      renderComparisonBarHTML({
        title: 'IA Local / VRAM & LLMs',
        iconSvg: LAP_SVGS.robot,
        baseVal: baseLap._aiEff,
        candVal: candLap._aiEff,
        baseLabel: `${baseLap._effGpuMem}GB • ${baseLap.llm_8b_tok_s} t/s`,
        candLabel: `${candLap._effGpuMem}GB • ${candLap.llm_8b_tok_s} t/s`,
        diffPct: rel.aiGainPct,
        maxVal: ex.maxAI,
        baseName: bNameShort,
        candName: cNameShort
      }),
      renderComparisonBarHTML({
        title: 'AI Training & CUDA FP16',
        iconSvg: LAP_SVGS.cpu,
        baseVal: baseLap._aiTrainEff || _computeLaptopAiTrainRaw(baseLap),
        candVal: candLap._aiTrainEff || _computeLaptopAiTrainRaw(candLap),
        baseLabel: `${baseLap.gpu_fp16_tflops} TFLOPS`,
        candLabel: `${candLap.gpu_fp16_tflops} TFLOPS`,
        diffPct: rel.trnGainPct,
        maxVal: ex.maxAiTrain,
        baseName: bNameShort,
        candName: cNameShort
      }),
      renderComparisonBarHTML({
        title: 'Qualidade da Tela (Hz / sRGB / Nits)',
        iconSvg: LAP_SVGS.screen,
        baseVal: baseLap.display_score,
        candVal: candLap.display_score,
        baseLabel: `${baseLap.screen_hz}Hz (${baseLap.display_score}/100)`,
        candLabel: `${candLap.screen_hz}Hz (${candLap.display_score}/100)`,
        maxVal: 100,
        baseName: bNameShort,
        candName: cNameShort
      }),
      renderComparisonBarHTML({
        title: 'Bateria & Portabilidade',
        iconSvg: LAP_SVGS.battery,
        baseVal: Math.round((baseLap.battery_score + baseLap.portability_score) / 2),
        candVal: Math.round((candLap.battery_score + candLap.portability_score) / 2),
        baseLabel: `${baseLap.battery_hours_light}h • ${baseLap.weight_kg}kg`,
        candLabel: `${candLap.battery_hours_light}h • ${candLap.weight_kg}kg`,
        maxVal: 100,
        baseName: bNameShort,
        candName: cNameShort
      }),
      renderComparisonBarHTML({
        title: 'Investimento Hoje',
        iconSvg: LAP_SVGS.money,
        baseVal: basePrice,
        candVal: candPrice,
        baseLabel: fmtBRLShort(basePrice),
        candLabel: fmtBRLShort(candPrice),
        isPrice: true,
        maxVal: ex.maxPrice,
        baseName: bNameShort,
        candName: cNameShort
      })
    ].join('');
  }

  // 8-Axis Versus Radar Chart
  chartLaptopDuelRadar = _destroyChartSafe(chartLaptopDuelRadar, 'chart-laptop-duel-radar');
  const radarCanvas = document.getElementById('chart-laptop-duel-radar');
  if (radarCanvas && typeof Chart !== 'undefined') {
    const toRadarArr = l => [
      Math.min(100, Math.round((l.gaming_score / ex.maxGaming) * 100)),
      Math.min(100, Math.round((l._wsEff / ex.maxWS) * 100)),
      Math.min(100, Math.round((l._aiEff / ex.maxAI) * 100)),
      Math.min(100, Math.round((l.software_score / ex.maxSoft) * 100)),
      Number(l.display_score || 60),
      Number(l.battery_score || 55),
      Number(l.portability_score || 60),
      Math.min(100, Math.round(((l.upgradeability_score || 50) + (l.connectivity_score || 70)) / 2))
    ];
    chartLaptopDuelRadar = new Chart(radarCanvas.getContext('2d'), {
      type: 'radar',
      data: {
        labels: ['Jogos', 'Workstation', 'IA / VRAM', 'Software', 'Tela', 'Bateria', 'Portabilidade', 'Upgr./Portas'],
        datasets: [
          {
            label: `A · ${shortLaptopChipName(baseLap)}`,
            data: toRadarArr(baseLap),
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.22)',
            borderWidth: 2,
            pointBackgroundColor: '#38bdf8'
          },
          {
            label: `B · ${shortLaptopChipName(candLap)}`,
            data: toRadarArr(candLap),
            borderColor: '#a78bfa',
            backgroundColor: 'rgba(167, 139, 250, 0.24)',
            borderWidth: 2,
            pointBackgroundColor: '#a78bfa'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false, stepSize: 25 },
            grid: { color: 'rgba(148, 163, 184, 0.16)' },
            angleLines: { color: 'rgba(148, 163, 184, 0.16)' },
            pointLabels: { color: '#cbd5e1', font: { size: 12, family: 'Inter, sans-serif', weight: '600' } }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  const legEl = document.getElementById('laptop-duel-radar-legend');
  if (legEl) {
    legEl.innerHTML = `
      <span class="flex items-center gap-1.5 text-white font-semibold"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background: var(--ui-compare-a);"></span> ${_escLapHtml(shortLaptopChipName(baseLap))}</span>
      <span class="flex items-center gap-1.5 text-white font-semibold"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background: var(--ui-compare-b);"></span> ${_escLapHtml(shortLaptopChipName(candLap))}</span>
    `;
  }

  // Why is Laptop A / Laptop B better?
  const whys = _buildVersusWhyBullets(baseLap, candLap, basePrice, candPrice);
  const whyAEl = document.getElementById('laptop-duel-why-a');
  if (whyAEl) {
    whyAEl.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <span class="text-sm font-bold text-white">Por que escolher ${_escLapHtml(shortLaptopChipName(baseLap))}?</span>
        <span class="ui-badge ui-badge--a">A · Base</span>
      </div>
      <ul class="space-y-1.5 text-sm text-slate-300">
        ${(whys.a.length ? whys.a : ['Equilíbrio próximo neste confronto — confira Custo-Benefício e Histórico de preços.'])
          .map(t => `<li class="flex items-start gap-2"><span class="font-bold" style="color: var(--ui-compare-a);">•</span><span>${t}</span></li>`).join('')}
      </ul>
    `;
  }
  const whyBEl = document.getElementById('laptop-duel-why-b');
  if (whyBEl) {
    whyBEl.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <span class="text-sm font-bold text-white">Por que escolher ${_escLapHtml(shortLaptopChipName(candLap))}?</span>
        <span class="ui-badge ui-badge--b">B · Candidato</span>
      </div>
      <ul class="space-y-1.5 text-sm text-slate-300">
        ${(whys.b.length ? whys.b : ['Modelo equivalente neste recorte — avalie se o preço justifica o conjunto.'])
          .map(t => `<li class="flex items-start gap-2"><span class="font-bold" style="color: var(--ui-compare-b);">•</span><span>${t}</span></li>`).join('')}
      </ul>
    `;
  }

  // Relational Verdict Box (Veredito Primeiro)
  const badgeMap = {
    emerald: 'bg-emerald-500 text-slate-950',
    sky: 'bg-sky-400 text-slate-950',
    amber: 'bg-amber-400 text-slate-950',
    rose: 'bg-rose-500 text-white'
  };
  const verdictEl = document.getElementById('laptop-duel-verdict-box');
  if (verdictEl) {
    const isGood = rel.color === 'emerald' || rel.color === 'sky';
    const isWarn = rel.color === 'amber';
    const tone = isGood ? 'good' : (isWarn ? 'warn' : 'bad');
    const badgeLabel = rel.color === 'emerald' ? 'Vale muito' : (isGood ? 'Vale a pena' : (isWarn ? 'Aguarde' : 'Não compensa'));
    const deltaSign = rel.actualDelta >= 0 ? '+' : '';
    const perfSign = rel.perfGainPct >= 0 ? '+' : '';
    const deltaPct = Math.round((rel.actualDelta / Math.max(1, basePrice)) * 100);
    const bName = _escLapHtml(shortLaptopChipName(baseLap));
    const cName = _escLapHtml(shortLaptopChipName(candLap));

    let oneLineVerdict = '';
    if (isGood) {
      oneLineVerdict = rel.actualDelta <= 0 && rel.perfGainPct >= 0
        ? `Vale muito: ${cName} entrega ${perfSign}${rel.perfGainPct.toFixed(0)}% de desempenho custando menos.`
        : `Vale a pena pagar ${deltaSign}${fmtBRLShort(rel.actualDelta)} pelo ${cName} (${perfSign}${rel.perfGainPct.toFixed(0)}% de ganho geral).`;
    } else if (isWarn) {
      const excess = Math.max(0, rel.actualDelta - rel.fairMaxDelta);
      oneLineVerdict = `Aguarde: o ${cName} está ${fmtBRLShort(excess)} acima do teto justo para ${perfSign}${rel.perfGainPct.toFixed(0)}% de ganho.`;
    } else {
      oneLineVerdict = `Não compensa: ${deltaSign}${fmtBRLShort(rel.actualDelta)} a mais por ${perfSign}${rel.perfGainPct.toFixed(0)}% de ganho está caro.`;
    }

    verdictEl.className = `ui-verdict ui-verdict--${tone} space-y-4`;
    verdictEl.innerHTML = `
      <div class="ui-verdict-grid">
        <div class="space-y-2 max-w-3xl">
          <div class="flex flex-wrap items-center gap-2">
            <span class="ui-badge ui-badge--${tone} font-bold uppercase tracking-wide">${badgeLabel}</span>
            <span class="ui-badge">${rel.tier}</span>
          </div>
          <h3 class="ui-verdict-headline">${oneLineVerdict}</h3>
        </div>
        <div class="ui-verdict-numbers">
          <div class="ui-verdict-stat">
            <span class="ui-verdict-stat-label">Diferença de preço</span>
            <span class="ui-verdict-stat-value">${deltaSign}${fmtBRLShort(rel.actualDelta)}</span>
            <span class="ui-verdict-stat-sub">${deltaSign}${deltaPct}% vs ${bName}</span>
          </div>
          <div class="ui-verdict-stat">
            <span class="ui-verdict-stat-label">Teto justo (B)</span>
            <span class="ui-verdict-stat-value" style="color: var(--ui-good-text);">${fmtBRLShort(rel.fairMaxCandPrice)}</span>
            <span class="ui-verdict-stat-sub">Até +${fmtBRLShort(rel.fairMaxDelta)} de diferença</span>
          </div>
        </div>
      </div>

      <details class="ui-details">
        <summary>Ver detalhes do cálculo</summary>
        <div class="ui-details-body">
          <p class="text-slate-200 leading-relaxed">${rel.summary}</p>
        </div>
      </details>
    `;
  }

  // Thermometer & Scenarios
  const subEl = document.getElementById('laptop-duel-thermometer-subtitle');
  if (subEl) {
    subEl.textContent = `Se ${_escLapHtml(shortLaptopChipName(baseLap))} custa ${fmtBRLShort(basePrice)}, veja as faixas justas para ${_escLapHtml(shortLaptopChipName(candLap))}:`;
  }
  const candShortName = shortLaptopChipName(candLap);
  const z1 = document.getElementById('laptop-zone-lbl-1');
  const z2 = document.getElementById('laptop-zone-lbl-2');
  const z3 = document.getElementById('laptop-zone-lbl-3');
  const z4 = document.getElementById('laptop-zone-lbl-4');
  if (z1) z1.textContent = `Até ${fmtBRLShort(rel.stealCandPrice)} (Ótimo)`;
  if (z2) z2.textContent = `Até ${fmtBRLShort(rel.fairMaxCandPrice)} (Justo)`;
  if (z3) z3.textContent = `Até ${fmtBRLShort(rel.stretchCandPrice)} (Ágio)`;
  if (z4) z4.textContent = `Acima de ${fmtBRLShort(rel.stretchCandPrice)}`;

  const marker = document.getElementById('laptop-thermometer-marker');
  const markerVal = document.getElementById('laptop-marker-delta-val');
  if (markerVal) markerVal.textContent = `${rel.actualDelta >= 0 ? '+' : ''}${fmtBRLShort(rel.actualDelta)}`;
  if (marker) {
    let pct = 50;
    const minRef = Math.min(rel.stealDelta - Math.max(400, basePrice * 0.1), rel.actualDelta);
    const maxRef = Math.max(rel.stretchMaxDelta + Math.max(500, basePrice * 0.15), rel.actualDelta + 1);
    if (rel.actualDelta <= rel.stealDelta) {
      pct = 5 + 20 * Math.max(0, (rel.actualDelta - minRef) / Math.max(1, rel.stealDelta - minRef));
    } else if (rel.actualDelta <= rel.fairMaxDelta) {
      pct = 25 + 25 * ((rel.actualDelta - rel.stealDelta) / Math.max(1, rel.fairMaxDelta - rel.stealDelta));
    } else if (rel.actualDelta <= rel.stretchMaxDelta) {
      pct = 50 + 25 * ((rel.actualDelta - rel.fairMaxDelta) / Math.max(1, rel.stretchMaxDelta - rel.fairMaxDelta));
    } else {
      pct = 75 + 21 * Math.min(1, (rel.actualDelta - rel.stretchMaxDelta) / Math.max(1, maxRef - rel.stretchMaxDelta));
    }
    marker.style.left = `${Math.min(96, Math.max(4, pct)).toFixed(1)}%`;
  }

  const scenEl = document.getElementById('laptop-duel-scenarios-grid');
  if (scenEl) {
    const bTgt = (baseLap.price_stats && baseLap.price_stats.target_price) || basePrice;
    const cTgt = (candLap.price_stats && candLap.price_stats.target_price) || candPrice;
    const cMin = (candLap.price_stats && candLap.price_stats.min_90d) || candPrice;
    const relTgt = evaluateLaptopRelationalUpgrade(baseLap, candLap, bTgt, cTgt);
    const relMin = evaluateLaptopRelationalUpgrade(baseLap, candLap, basePrice, cMin);
    const cardSc = (label, aName, bName, pA, pB, rObj) => `
      <div class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono uppercase text-slate-400 font-bold">${label}</span>
          <span class="px-1.5 py-0.5 rounded text-xs font-mono font-bold ${badgeMap[rObj.color] || badgeMap.sky}">${rObj.tier}</span>
        </div>
        <div class="text-xs font-bold text-white">${_escLapHtml(candShortName)} (${fmtBRLShort(pB)}) vs ${_escLapHtml(shortLaptopChipName(baseLap))} (${fmtBRLShort(pA)})</div>
        <div class="text-xs font-mono text-slate-300">Diferença: <strong>${rObj.actualDelta >= 0 ? '+' : ''}${fmtBRLShort(rObj.actualDelta)}</strong></div>
      </div>
    `;
    scenEl.innerHTML = [
      cardSc('Cenário 1 • Preço Hoje', shortLaptopChipName(baseLap), candShortName, basePrice, candPrice, rel),
      cardSc('Cenário 2 • Ambos no Preço Alvo', shortLaptopChipName(baseLap), candShortName, bTgt, cTgt, relTgt),
      cardSc('Cenário 3 • Candidato na Mín. 90d', shortLaptopChipName(baseLap), candShortName, basePrice, cMin, relMin)
    ].join('');
  }

  // 6-section Categorized Spec Sheet
  _renderLaptopSpecSheet(baseLap, candLap, basePrice, candPrice);

  // Price History Chart
  chartLaptopDuelHistory = _destroyChartSafe(chartLaptopDuelHistory, 'chart-laptop-duel-history');
  const histCanvas = document.getElementById('chart-laptop-duel-history');
  if (histCanvas && typeof Chart !== 'undefined') {
    const bHist = Array.isArray(baseLap.history) ? baseLap.history : [];
    const cHist = Array.isArray(candLap.history) ? candLap.history : [];
    const dateSet = new Set([...bHist.map(h => h.date), ...cHist.map(h => h.date)]);
    const dates = [...dateSet].sort();
    const bMap = Object.fromEntries(bHist.map(h => [h.date, h.price]));
    const cMap = Object.fromEntries(cHist.map(h => [h.date, h.price]));

    chartLaptopDuelHistory = new Chart(histCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: dates.map(d => d.slice(5)),
        datasets: [
          {
            label: `Base: ${shortLaptopChipName(baseLap)}`,
            data: dates.map(d => bMap[d] ?? null),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            tension: 0.25,
            spanGaps: true,
            borderWidth: 2,
            pointRadius: 2
          },
          {
            label: `Cand: ${shortLaptopChipName(candLap)}`,
            data: dates.map(d => cMap[d] ?? null),
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.12)',
            tension: 0.25,
            spanGaps: true,
            borderWidth: 2,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtBRL(ctx.parsed.y)}` } }
        },
        scales: {
          x: { ticks: { color: '#64748b', maxRotation: 0 }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#64748b', callback: v => fmtBRLShort(v) }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  // Smart Alternatives & Insight
  const altsEl = document.getElementById('laptop-duel-alternatives-list');
  if (altsEl) {
    const alts = pool
      .filter(l => l.slug !== candLap.slug && l.slug !== baseLap.slug && l.price_brl <= candPrice * 1.18 && l.price_brl >= candPrice * 0.68)
      .sort((a, b) => (b._myCBScore - a._myCBScore) || (b._compositeScore - a._compositeScore))
      .slice(0, 4);
    altsEl.innerHTML = alts.length ? alts.map(a => {
      const rVsB = evaluateLaptopRelationalUpgrade(baseLap, a, basePrice, a.price_brl);
      return `
        <button type="button" onclick="sendLaptopToDuel('${_escLapHtml(a.slug)}', true)" class="w-full text-left p-2.5 rounded-xl bg-slate-900/90 hover:bg-purple-500/15 border border-slate-800 hover:border-purple-500/40 transition cursor-pointer flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-bold text-white truncate">${_escLapHtml(a.name)}</div>
            <div class="text-xs font-mono text-slate-400 mt-0.5">${_escLapHtml(a.gpu_name)} • ${a.ram_gb}GB • ${a.screen_hz}Hz • C/B ${a._myCBScore}/100</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-xs font-mono font-bold text-purple-300">${fmtBRLShort(a.price_brl)}</div>
            <div class="text-xs font-mono text-${rVsB.color}-400">${rVsB.perfGainPct >= 0 ? '+' : ''}${rVsB.perfGainPct.toFixed(0)}% perf</div>
          </div>
        </button>
      `;
    }).join('') : '<p class="text-xs text-slate-400">Nenhuma alternativa próxima nesta faixa de orçamento.</p>';
  }

  const insEl = document.getElementById('laptop-duel-system-insight');
  if (insEl) {
    const wi = getLaptopIntensityConfig();
    const lvName = l => (['', 'Leve', 'Mod.', 'Pesado', 'M.Pes.', 'Extremo'][l] || 'Pesado');
    const notes = [
      `🎚️ <strong>Intensidade Ativa:</strong> Jogos <strong>${lvName(wi.gaming)} (${wi.gaming}/5)</strong> • Workstation <strong>${lvName(wi.workstation)} (${wi.workstation}/5)</strong> • IA Local <strong>${lvName(wi.localAI)} (${wi.localAI}/5)</strong> • AI Training <strong>${lvName(wi.aiTraining)} (${wi.aiTraining}/5)</strong>.`
    ];
    if (baseLap.ram_soldered || candLap.ram_soldered) {
      const solderedNames = [baseLap, candLap].filter(l => l.ram_soldered).map(l => shortLaptopChipName(l));
      notes.push(`🔒 <strong>Memória Soldada:</strong> ${solderedNames.join(' e ')} não permitem upgrade de RAM após a compra — garanta a capacidade ideal já na aquisição.`);
    }
    if (candLap.gpu_is_dedicated && candLap.gpu_tgp_w >= 95) {
      notes.push(`⚡ <strong>Full-Power TGP:</strong> ${_escLapHtml(shortLaptopChipName(candLap))} opera com até ${candLap.gpu_tgp_w}W na GPU (mantém desempenho próximo ao teto da arquitetura quando conectado à tomada).`);
    }
    if (baseLap.is_apple_unified || candLap.is_apple_unified) {
      notes.push(`🍎 <strong>Apple Silicon vs Windows RTX:</strong> MacBooks mantêm ~95% da potência na bateria e usam Memória Unificada via MLX, porém jogos AAA x86 e CUDA nativo favorecem notebooks RTX.`);
    }
    insEl.innerHTML = notes.join('<br>');
  }
}

/* ============================================================================
 * D. TAB 2 — COST-BENEFIT RANKING & SCATTER
 * ============================================================================ */

function setLaptopCBChartMetric(metric) {
  STATE.laptopCbChartMetric = metric === 'benchmark' ? 'benchmark' : 'benefit';
  renderLaptopCBTable();
}

function setLaptopCBSort(col) {
  if (STATE.laptopCbSortBy === col) {
    STATE.laptopCbSortAsc = !STATE.laptopCbSortAsc;
  } else {
    STATE.laptopCbSortBy = col;
    STATE.laptopCbSortAsc = (col === 'name' || col === 'price' || col === 'target');
  }
  renderLaptopCBTable();
}

function renderLaptopCBTable() {
  const pool = getLaptopPool();
  if (!pool.length) return;
  enrichLaptopsWithContextualMetrics();

  const intPill = document.getElementById('laptop-cb-intensity-pill');
  if (intPill) {
    const wi = getLaptopIntensityConfig();
    intPill.textContent = `⚙ Carga: J${wi.gaming} · WS${wi.workstation} · IA${wi.localAI} · Trn${wi.aiTraining} (Alterar)`;
  }

  const search = (document.getElementById('laptop-cb-search')?.value || '').trim().toLowerCase();
  const brandFilter = document.getElementById('laptop-cb-filter-brand')?.value || 'ALL';
  const catFilter = document.getElementById('laptop-cb-filter-category')?.value || 'ALL';
  const gpuFilter = document.getElementById('laptop-cb-filter-gpu')?.value || 'ALL';
  const ramFilter = parseInt(document.getElementById('laptop-cb-filter-ram')?.value || '0', 10) || 0;
  const relBaseSel = document.getElementById('laptop-cb-filter-base-rel');
  if (relBaseSel && relBaseSel.value) STATE.laptopCbRelBaseSlug = relBaseSel.value;

  const baseLap = findLaptopBySlug(STATE.laptopCbRelBaseSlug) || findLaptopBySlug(STATE.laptopDuelBaseSlug) || pool[0];

  const filtered = pool.filter(l => {
    if (search) {
      const hay = `${l.name} ${l.cpu_name} ${l.gpu_name} ${l.brand} ${l.line}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (brandFilter !== 'ALL' && String(l.brand || '').toLowerCase() !== brandFilter.toLowerCase()) return false;
    if (catFilter !== 'ALL' && l.category !== catFilter) return false;
    if (gpuFilter === 'DEDICATED' && !l.gpu_is_dedicated) return false;
    if (gpuFilter === 'VRAM6' && l._effGpuMem < 6) return false;
    if (gpuFilter === 'VRAM8' && l._effGpuMem < 8) return false;
    if (ramFilter > 0 && (l.ram_gb || 0) < ramFilter) return false;
    return true;
  });

  // Compute ranks on full CB ordering first
  const byRank = [...filtered].sort((a, b) => (b._myCBScore - a._myCBScore) || (b._compositeScore - a._compositeScore));
  const rankMap = new Map(byRank.map((l, i) => [l.slug, i + 1]));

  const sortBy = STATE.laptopCbSortBy || 'my_cb';
  const asc = !!STATE.laptopCbSortAsc;
  filtered.sort((a, b) => {
    let va, vb;
    switch (sortBy) {
      case 'rank': va = rankMap.get(a.slug); vb = rankMap.get(b.slug); break;
      case 'name': va = a.name; vb = b.name; break;
      case 'ram': va = a.ram_gb * 10000 + a.storage_gb; vb = b.ram_gb * 10000 + b.storage_gb; break;
      case 'screen': va = a.display_score * 100 - a.weight_kg * 10; vb = b.display_score * 100 - b.weight_kg * 10; break;
      case 'gaming': va = a._compositeScore; vb = b._compositeScore; break;
      case 'price': va = a.price_brl; vb = b.price_brl; break;
      case 'target': va = (a.price_stats && a.price_stats.target_price) || a.price_brl; vb = (b.price_stats && b.price_stats.target_price) || b.price_brl; break;
      default: va = a._myCBScore * 100 + (a._compositeScore / 1000); vb = b._myCBScore * 100 + (b._compositeScore / 1000);
    }
    if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    return asc ? (va - vb) : (vb - va);
  });

  // Update chart toggle button visuals
  const isBench = STATE.laptopCbChartMetric === 'benchmark';
  const btnB = document.getElementById('laptop-cb-chart-btn-benefit');
  const btnM = document.getElementById('laptop-cb-chart-btn-benchmark');
  const titleEl = document.getElementById('laptop-cb-chart-title');
  if (btnB && btnM) {
    btnB.classList.toggle('is-active', !isBench);
    btnM.classList.toggle('is-active', isBench);
  }
  if (titleEl) {
    titleEl.textContent = isBench
      ? 'Mapa Full-System: Preço (R$) vs Score Geral do Sistema (0–100)'
      : 'Mapa de Eficiência de Notebooks: Preço (R$) vs Custo-Benefício (0–100)';
  }

  // Scatter Chart
  chartLaptopCBScatter = _destroyChartSafe(chartLaptopCBScatter, 'chart-laptop-cb-scatter');
  const scatCanvas = document.getElementById('chart-laptop-cb-scatter');
  if (scatCanvas && typeof Chart !== 'undefined') {
    const cats = ['gaming_pro', 'gaming', 'macbook', 'ultrabook', 'budget'];
    const datasets = cats.map(cat => {
      const pts = filtered.filter(l => l.category === cat).map(l => ({
        x: Math.round(l.price_brl),
        y: isBench ? l._overallVersusScore : l._myCBScore,
        slug: l.slug,
        title: l.name,
        gpu: l.gpu_name,
        ram: l.ram_gb
      }));
      return {
        label: LAP_CATEGORY_SHORT[cat] || cat,
        data: pts,
        backgroundColor: LAP_CATEGORY_COLORS[cat] || '#a855f7',
        pointRadius: pts.map(p => p.slug === baseLap.slug ? 8 : 5.5),
        pointHoverRadius: 9
      };
    }).filter(ds => ds.data.length > 0);

    chartLaptopCBScatter = new Chart(scatCanvas.getContext('2d'), {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_, elements) => {
          if (elements && elements.length) {
            const el = elements[0];
            const pt = datasets[el.datasetIndex]?.data[el.index];
            if (pt && pt.slug) sendLaptopToDuel(pt.slug, true);
          }
        },
        plugins: {
          legend: { labels: { color: '#cbd5e1', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const p = ctx.raw;
                return `${p.title.slice(0, 40)} • ${fmtBRL(p.x)} • ${isBench ? 'Versus' : 'C/B'}: ${p.y}/100`;
              }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'Preço Atual', color: '#94a3b8' }, ticks: { color: '#94a3b8', callback: v => fmtBRLShort(v) }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { min: 0, max: 105, title: { display: true, text: isBench ? 'Score Versus (0-100)' : 'Custo-Benefício (0-100)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // Table body
  const tbody = document.getElementById('laptop-cb-table-body');
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-slate-400">Nenhum notebook encontrado para esses filtros.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => {
    const rnk = rankMap.get(l.slug) || 99;
    const isBase = l.slug === baseLap.slug;
    const rel = evaluateLaptopRelationalUpgrade(baseLap, l, baseLap.price_brl, l.price_brl);
    const tgt = (l.price_stats && l.price_stats.target_price) || l.price_brl;
    const priceStatus = typeof getPriceTargetStatus === 'function'
      ? getPriceTargetStatus(l.price_brl, tgt, l.price_stats?.min_90d)
      : { badgeHtml: '' };
    const sparklineHtml = typeof renderPriceSparklineSVG === 'function'
      ? renderPriceSparklineSVG(l, l.price_brl, tgt)
      : '';
    const cbTone = l._myCBScore >= 82 ? 'ui-badge--good' : (l._myCBScore >= 65 ? 'ui-badge--brand' : 'ui-badge--warn');
    const ssdLbl = l.storage_gb >= 1024 ? `${(l.storage_gb / 1024)}TB` : `${l.storage_gb}GB`;
    const flashTag = l._flashPromo
      ? `<span class="ui-badge ui-badge--good mt-1">Promo −${fmtBRLShort(l._flashPromo.savings_vs_hb_brl || 0)}</span>`
      : '';

    return `
      <tr class="${isBase ? 'bg-sky-950/20' : ''}">
        <td class="ui-mono font-semibold text-slate-400">${rnk}</td>
        <td>
          <div class="flex items-center gap-2.5">
            ${l.image ? `<img src="${_escLapHtml(l.image)}" alt="" class="w-10 h-10 rounded-lg object-contain bg-slate-950 border border-slate-800 p-0.5 shrink-0" onerror="this.style.display='none'">` : ''}
            <div class="min-w-0">
              <div class="font-bold text-white text-sm truncate max-w-[260px]" title="${_escLapHtml(l.name)}">${_escLapHtml(l.name)}</div>
              <div class="text-xs ui-mono text-slate-400 truncate max-w-[260px]">${_escLapHtml(l.cpu_name)} • ${_escLapHtml(l.gpu_name)}</div>
              ${l._readinessGate < 0.70 ? `<div class="text-xs text-rose-400 ui-mono font-semibold mt-0.5">Abaixo da carga exigida</div>` : ''}
            </div>
          </div>
        </td>
        <td class="text-center ui-mono">
          <div class="text-slate-100 font-semibold">${l.ram_gb}GB / ${ssdLbl}</div>
          <div class="text-xs ${l.ram_soldered ? 'text-amber-300' : 'text-slate-400'}">${l.ram_soldered ? 'Soldada' : `Exp. ${l.ram_max_gb}GB`}</div>
        </td>
        <td class="text-center ui-mono">
          <div class="text-slate-100">${l.screen_inches}" ${l.screen_hz}Hz</div>
          <div class="text-xs text-slate-400">${l.weight_kg}kg • ${l.battery_hours_light}h</div>
        </td>
        <td class="text-right ui-mono">
          <div class="font-bold text-white text-sm">${fmtBRL(l.price_brl)}</div>
          <div class="mt-1 flex justify-end">${priceStatus.badgeHtml}</div>
          ${flashTag}
        </td>
        <td class="text-right ui-mono">
          <div class="text-slate-200 font-semibold">${fmtBRLShort(tgt)}</div>
          <div class="text-xs text-slate-400">${_escLapHtml(l.store_name || '')}</div>
        </td>
        <td class="text-center">${sparklineHtml}</td>
        <td class="text-center">
          <span class="ui-badge ${cbTone} ui-mono font-bold text-sm px-2.5 py-1">${l._myCBScore}</span>
          <div class="text-xs ui-mono text-slate-400 mt-1">Score ${l._overallVersusScore}</div>
        </td>
        <td class="text-right ui-mono">
          ${isBase ? '<span class="ui-badge ui-badge--a">Base</span>' : `
            <div class="text-${rel.color}-300 font-bold text-xs">${rel.perfGainPct >= 0 ? '+' : ''}${rel.perfGainPct.toFixed(0)}% perf</div>
            <div class="text-xs text-slate-400">${rel.actualDelta >= 0 ? '+' : ''}${fmtBRLShort(rel.actualDelta)}</div>
          `}
        </td>
        <td class="text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button type="button" onclick="sendLaptopToDuel('${_escLapHtml(l.slug)}', true)" class="ui-btn ui-btn--sm" title="Comparar no Duelo">Duelo</button>
            ${l.offer_url ? `<a href="${_escLapHtml(l.offer_url)}" target="_blank" rel="noopener" class="ui-btn ui-btn--sm ui-btn--ghost" title="Ver oferta">↗</a>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* ============================================================================
 * E. TAB 3 — OBJECTIVE PURCHASE PLANNER (BUILDER MODE FOR LAPTOPS)
 * ============================================================================ */

function pickLaptopForObjective(goal) {
  const pool = getLaptopPool();
  if (!pool.length) return;
  enrichLaptopsWithContextualMetrics();

  const wi = getLaptopIntensityConfig();
  let chosen = pool[0];
  if (goal === 'gaming') {
    const score = l => ((l._pillarUtils?.gaming || 0.5) * (40 + wi.gaming * 15)) + l._myCBScore * 0.45;
    chosen = [...pool].sort((a, b) => score(b) - score(a))[0];
  } else if (goal === 'ai') {
    const aiLevel = Math.max(wi.localAI, wi.aiTraining);
    const score = l => (((l._pillarUtils?.localAI || 0.5) * 0.55 + (l._pillarUtils?.aiTraining || 0.5) * 0.45) * (40 + aiLevel * 16)) + l._myCBScore * 0.40;
    chosen = [...pool].sort((a, b) => score(b) - score(a))[0];
  } else if (goal === 'workstation') {
    const score = l => ((l._pillarUtils?.workstation || 0.5) * (40 + wi.workstation * 15)) + l._myCBScore * 0.45;
    chosen = [...pool].sort((a, b) => score(b) - score(a))[0];
  } else if (goal === 'mobility') {
    const score = l => (l.battery_score + l.portability_score) + l._myCBScore * 0.65;
    chosen = [...pool].sort((a, b) => score(b) - score(a))[0];
  }

  STATE.laptopBuilder.slug = chosen.slug;
  STATE.laptopBuilder.price = Math.round(chosen.price_brl);
  STATE.laptopBuilder.extraRamGb = 0;
  STATE.laptopBuilder.extraRamPrice = 0;
  STATE.laptopBuilder.extraSsdGb = 0;
  STATE.laptopBuilder.extraSsdPrice = 0;
  renderLaptopBuilder();
}

function onLaptopBuilderSelect(slug) {
  const lap = findLaptopBySlug(slug);
  if (!lap) return;
  STATE.laptopBuilder.slug = slug;
  STATE.laptopBuilder.price = Math.round(lap.price_brl);
  if (lap.ram_soldered) {
    STATE.laptopBuilder.extraRamGb = 0;
    STATE.laptopBuilder.extraRamPrice = 0;
  }
  renderLaptopBuilder();
}

function _estRamCostBrl(gb, ramType) {
  if (!gb || gb <= 0) return 0;
  const isDdr5 = String(ramType || '').toUpperCase().includes('DDR5');
  const map = isDdr5 ? { 8: 220, 16: 430, 32: 890, 48: 1350 } : { 8: 140, 16: 270, 32: 540, 48: 820 };
  return map[gb] || Math.round(gb * (isDdr5 ? 27 : 17));
}

function _estSsdCostBrl(gb) {
  if (!gb || gb <= 0) return 0;
  const map = { 512: 290, 1024: 480, 2048: 920 };
  return map[gb] || Math.round(gb * 0.48);
}

function updateLaptopBuilderField(field, val) {
  const b = STATE.laptopBuilder;
  const lap = findLaptopBySlug(b.slug);
  if (field === 'extraRamGb') {
    const g = parseInt(val, 10) || 0;
    b.extraRamGb = g;
    b.extraRamPrice = _estRamCostBrl(g, lap && lap.ram_type);
  } else if (field === 'extraSsdGb') {
    const s = parseInt(val, 10) || 0;
    b.extraSsdGb = s;
    b.extraSsdPrice = _estSsdCostBrl(s);
  } else if (field === 'price' || field === 'extraRamPrice' || field === 'extraSsdPrice' || field === 'accessoryPrice') {
    b[field] = Math.max(0, parseFloat(val) || 0);
  } else if (field === 'extraRamOwned' || field === 'extraSsdOwned' || field === 'accessoryOwned') {
    b[field] = !!val;
  } else {
    b[field] = val;
  }
  renderLaptopBuilder();
}

function renderLaptopBuilder() {
  const pool = getLaptopPool();
  if (!pool.length) return;
  enrichLaptopsWithContextualMetrics();

  const b = STATE.laptopBuilder;
  let lap = findLaptopBySlug(b.slug);
  if (!lap) {
    lap = pool[0];
    b.slug = lap.slug;
    b.price = Math.round(lap.price_brl);
  }
  const lapPrice = b.price > 0 ? b.price : lap.price_brl;

  const partsEl = document.getElementById('laptop-builder-parts-container');
  if (partsEl) {
    const maxExtraRam = Math.max(0, (lap.ram_max_gb || lap.ram_gb) - (lap.ram_gb || 0));
    const ramChoices = [0, 8, 16, 32].filter(v => v === 0 || (!lap.ram_soldered && v <= maxExtraRam));
    const ramSelectDisabled = lap.ram_soldered || ramChoices.length <= 1;

    partsEl.innerHTML = `
      <div class="p-4 rounded-xl bg-slate-900/85 border border-purple-500/35 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-mono uppercase text-purple-300 font-bold">1. Notebook Principal (Chassis Completo)</span>
          <span class="text-xs font-mono text-slate-400">Categoria: ${LAP_CATEGORY_SHORT[lap.category] || lap.category} • C/B ${lap._myCBScore}/100</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div class="sm:col-span-9">
            <select onchange="onLaptopBuilderSelect(this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white">
              ${_buildGroupedLaptopOptionsHTML(pool, lap.slug)}
            </select>
          </div>
          <div class="sm:col-span-3 flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5">
            <span class="text-xs font-mono text-slate-400">R$</span>
            <input type="number" value="${Math.round(lapPrice)}" step="100" onchange="updateLaptopBuilderField('price', this.value)" class="w-full bg-transparent text-xs font-mono font-bold text-emerald-300 focus:outline-none">
          </div>
        </div>
        <div class="flex flex-wrap gap-2 text-xs font-mono text-slate-300 pt-1">
          <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">⚙️ ${_escLapHtml(lap.cpu_name)}</span>
          <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-purple-300">🎮 ${_escLapHtml(lap.gpu_name)}</span>
          <span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-sky-300">📺 ${lap.screen_inches}" ${lap.screen_hz}Hz (${lap.srgb_pct}% sRGB)</span>
        </div>
      </div>

      <div class="p-4 rounded-xl bg-slate-900/85 border border-slate-800 space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-sky-300">2. Expansão de Memória RAM (${lap.ram_gb}GB de fábrica • ${lap.ram_type})</span>
          <span class="text-xs font-mono ${lap.ram_soldered ? 'text-amber-400' : 'text-emerald-400'}">
            ${lap.ram_soldered ? '🔒 RAM Soldada (sem upgrade)' : `🔓 ${lap.ram_slots} slots SO-DIMM • Máx ${lap.ram_max_gb}GB`}
          </span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div class="sm:col-span-6">
            <select ${ramSelectDisabled ? 'disabled' : ''} onchange="updateLaptopBuilderField('extraRamGb', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white disabled:opacity-50">
              ${ramChoices.map(v => `<option value="${v}" ${b.extraRamGb === v ? 'selected' : ''}>${v === 0 ? 'Manter RAM original (' + lap.ram_gb + 'GB)' : '+ ' + v + 'GB SO-DIMM → Total ' + (lap.ram_gb + v) + 'GB'}</option>`).join('')}
            </select>
          </div>
          <div class="sm:col-span-3 flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span class="text-xs font-mono text-slate-400">R$</span>
            <input type="number" ${ramSelectDisabled ? 'disabled' : ''} value="${Math.round(b.extraRamPrice || 0)}" step="50" onchange="updateLaptopBuilderField('extraRamPrice', this.value)" class="w-full bg-transparent text-xs font-mono text-white focus:outline-none">
          </div>
          <label class="sm:col-span-3 flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" ${b.extraRamOwned ? 'checked' : ''} onchange="updateLaptopBuilderField('extraRamOwned', this.checked)" class="accent-sky-400">
            <span>Já possuo</span>
          </label>
        </div>
      </div>

      <div class="p-4 rounded-xl bg-slate-900/85 border border-slate-800 space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-emerald-300">3. Expansão de SSD NVMe (${lap.storage_gb >= 1024 ? (lap.storage_gb / 1024) + 'TB' : lap.storage_gb + 'GB'} de fábrica)</span>
          <span class="text-xs font-mono ${lap.extra_m2_slots > 0 ? 'text-emerald-400' : 'text-amber-300'}">
            ${lap.extra_m2_slots > 0 ? `✓ ${lap.extra_m2_slots} slot M.2 extra livre` : '⚠ Slot único (requer substituir SSD principal)'}
          </span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div class="sm:col-span-6">
            <select onchange="updateLaptopBuilderField('extraSsdGb', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white">
              <option value="0" ${b.extraSsdGb === 0 ? 'selected' : ''}>Manter SSD original (${lap.storage_gb}GB)</option>
              <option value="512" ${b.extraSsdGb === 512 ? 'selected' : ''}>+512 GB SSD NVMe Gen4</option>
              <option value="1024" ${b.extraSsdGb === 1024 ? 'selected' : ''}>+1 TB SSD NVMe Gen4</option>
              <option value="2048" ${b.extraSsdGb === 2048 ? 'selected' : ''}>+2 TB SSD NVMe Gen4</option>
            </select>
          </div>
          <div class="sm:col-span-3 flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span class="text-xs font-mono text-slate-400">R$</span>
            <input type="number" value="${Math.round(b.extraSsdPrice || 0)}" step="50" onchange="updateLaptopBuilderField('extraSsdPrice', this.value)" class="w-full bg-transparent text-xs font-mono text-white focus:outline-none">
          </div>
          <label class="sm:col-span-3 flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" ${b.extraSsdOwned ? 'checked' : ''} onchange="updateLaptopBuilderField('extraSsdOwned', this.checked)" class="accent-emerald-400">
            <span>Já possuo</span>
          </label>
        </div>
      </div>

      <div class="p-4 rounded-xl bg-slate-900/85 border border-slate-800 space-y-2.5">
        <span class="text-xs font-bold text-amber-300 block">4. Ecossistema & Ergonomia (Cooling Pad / Hub USB-C / Dock)</span>
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div class="sm:col-span-6">
            <input type="text" value="${_escLapHtml(b.accessoryName || '')}" onchange="updateLaptopBuilderField('accessoryName', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white">
          </div>
          <div class="sm:col-span-3 flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span class="text-xs font-mono text-slate-400">R$</span>
            <input type="number" value="${Math.round(b.accessoryPrice || 0)}" step="20" onchange="updateLaptopBuilderField('accessoryPrice', this.value)" class="w-full bg-transparent text-xs font-mono text-white focus:outline-none">
          </div>
          <label class="sm:col-span-3 flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" ${b.accessoryOwned ? 'checked' : ''} onchange="updateLaptopBuilderField('accessoryOwned', this.checked)" class="accent-amber-400">
            <span>Já possuo</span>
          </label>
        </div>
      </div>
    `;
  }

  const powerEl = document.getElementById('laptop-builder-power-card');
  if (powerEl) {
    powerEl.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <span class="text-xs font-mono uppercase text-amber-300 font-bold">Diagnóstico de Energia & Mobilidade</span>
        <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 font-mono text-xs">${lap.battery_wh} Wh</span>
      </div>
      <div class="grid grid-cols-2 gap-2.5 text-xs">
        <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
          <span class="text-xs text-slate-400 block">Fonte / TGP</span>
          <strong class="text-white font-mono">${lap.charger_w}W (${lap.usb_c_pd ? 'USB-C PD ✓' : 'Proprietário'})</strong>
        </div>
        <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
          <span class="text-xs text-slate-400 block">Autonomia Est.</span>
          <strong class="text-emerald-300 font-mono">${lap.battery_hours_light}h leve / ${lap.battery_hours_heavy}h carga</strong>
        </div>
        <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
          <span class="text-xs text-slate-400 block">Peso & Perfil</span>
          <strong class="text-sky-300 font-mono">${lap.weight_kg} kg • ${lap.thickness_mm} mm</strong>
        </div>
        <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
          <span class="text-xs text-slate-400 block">Portas</span>
          <strong class="text-slate-200 font-mono text-xs">${_escLapHtml((lap.ports || []).slice(0, 3).join(', '))}</strong>
        </div>
      </div>
    `;
  }

  const totalExtraRam = b.extraRamOwned ? 0 : (b.extraRamPrice || 0);
  const totalExtraSsd = b.extraSsdOwned ? 0 : (b.extraSsdPrice || 0);
  const totalAcc = b.accessoryOwned ? 0 : (b.accessoryPrice || 0);
  const totalCost = lapPrice + totalExtraRam + totalExtraSsd + totalAcc;
  const effRam = (lap.ram_gb || 0) + (lap.ram_soldered ? 0 : (b.extraRamGb || 0));
  const effSsd = lap.extra_m2_slots > 0
    ? ((lap.storage_gb || 0) + (b.extraSsdGb || 0))
    : Math.max(lap.storage_gb || 0, b.extraSsdGb || 0);

  const sumEl = document.getElementById('laptop-builder-summary-card');
  if (sumEl) {
    sumEl.innerHTML = `
      <div class="border-b border-slate-800 pb-3">
        <span class="text-xs font-mono uppercase text-purple-400 font-bold">Resumo Real do Investimento</span>
        <div class="text-2xl font-mono font-black text-white mt-1">${fmtBRL(totalCost)}</div>
        <div class="text-xs text-slate-400 font-mono mt-0.5">Config Final: <strong>${effRam}GB RAM</strong> • <strong>${effSsd >= 1024 ? (effSsd / 1024) + 'TB' : effSsd + 'GB'} SSD</strong></div>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs font-mono">
        <div class="p-2 rounded bg-slate-950 border border-slate-800"><span class="text-slate-400 block text-xs">Jogos</span><strong class="text-emerald-300">${Math.round(lap.gaming_score)} pts</strong></div>
        <div class="p-2 rounded bg-slate-950 border border-slate-800"><span class="text-slate-400 block text-xs">Workstation</span><strong class="text-amber-300">${Math.round(lap._wsEff)} pts</strong></div>
        <div class="p-2 rounded bg-slate-950 border border-slate-800"><span class="text-slate-400 block text-xs">IA Local / VRAM</span><strong class="text-purple-300">${lap._effGpuMem}GB • ${lap.llm_8b_tok_s} t/s</strong></div>
        <div class="p-2 rounded bg-slate-950 border border-slate-800"><span class="text-slate-400 block text-xs">Versus Full</span><strong class="text-sky-300">${lap._overallVersusScore}/100</strong></div>
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" onclick="sendLaptopToDuel('${_escLapHtml(lap.slug)}', true)" class="flex-1 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/35 text-purple-200 border border-purple-500/40 text-xs font-bold cursor-pointer">⚔️ Comparar no Duelo</button>
        <button type="button" onclick="STATE.simLaptopBSlug='${_escLapHtml(lap.slug)}'; populateLaptopSelectors(); switchTab('sim');" class="flex-1 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-500/40 text-xs font-bold cursor-pointer">🔬 Simular FPS/IA</button>
      </div>
    `;
  }
}

/* ============================================================================
 * F. TAB 4 — UPGRADEABILITY MATRIX (SO-DIMM RAM & NVME SSD)
 * ============================================================================ */

function applyLaptopUpgradePick(slug, targetRamGb, targetSsdGb) {
  const lap = findLaptopBySlug(slug);
  if (!lap) return;
  STATE.laptopBuilder.slug = slug;
  STATE.laptopBuilder.price = Math.round(lap.price_brl);
  const deltaRam = (!lap.ram_soldered && targetRamGb > lap.ram_gb) ? Math.min(32, targetRamGb - lap.ram_gb) : 0;
  STATE.laptopBuilder.extraRamGb = deltaRam;
  STATE.laptopBuilder.extraRamPrice = _estRamCostBrl(deltaRam, lap.ram_type);
  const deltaSsd = targetSsdGb > lap.storage_gb ? (lap.extra_m2_slots > 0 ? Math.min(2048, targetSsdGb - lap.storage_gb) : targetSsdGb) : 0;
  STATE.laptopBuilder.extraSsdGb = deltaSsd;
  STATE.laptopBuilder.extraSsdPrice = _estSsdCostBrl(deltaSsd);

  if (typeof switchTab === 'function') switchTab('builder');
  else renderLaptopBuilder();
}

function renderLaptopUpgrades() {
  const pool = getLaptopPool();
  if (!pool.length) return;
  enrichLaptopsWithContextualMetrics();

  const targetRam = parseInt(document.getElementById('laptop-upg-ram-cap')?.value || '32', 10) || 32;
  const targetSsd = parseInt(document.getElementById('laptop-upg-ssd-cap')?.value || '1024', 10) || 1024;
  const strategy = document.getElementById('laptop-upg-strategy')?.value || 'ALL';
  const budget = parseFloat(document.getElementById('laptop-upg-budget')?.value || '8500') || 8500;

  const evaluated = pool.map(l => {
    const canRam = l.ram_gb >= targetRam || (!l.ram_soldered && l.ram_max_gb >= targetRam);
    let ramCost = 0;
    let ramNote = 'Já atende de fábrica';
    if (!canRam) {
      ramNote = l.ram_soldered ? `Bloqueado (${l.ram_gb}GB soldada)` : `Máximo suportado ${l.ram_max_gb}GB`;
    } else if (l.ram_gb < targetRam) {
      const addGb = targetRam - l.ram_gb;
      // If 2 slots already populated with 2x8GB and targeting 32GB, need a 2x16GB kit (higher cost minus resale ~20%)
      ramCost = (l.ram_gb === 16 && targetRam === 32 && l.ram_slots === 2)
        ? Math.round(_estRamCostBrl(32, l.ram_type) * 0.85)
        : _estRamCostBrl(addGb, l.ram_type);
      ramNote = `+${addGb}GB ${l.ram_type} SO-DIMM`;
    }

    let ssdCost = 0;
    let ssdNote = 'SSD atende de fábrica';
    if (l.storage_gb < targetSsd) {
      if (l.extra_m2_slots > 0) {
        const addSsd = targetSsd - l.storage_gb >= 1024 ? 1024 : 512;
        ssdCost = _estSsdCostBrl(addSsd);
        ssdNote = `+${addSsd >= 1024 ? '1TB' : '512GB'} no 2º slot M.2`;
      } else {
        ssdCost = _estSsdCostBrl(targetSsd);
        ssdNote = `Trocar SSD único para ${targetSsd >= 1024 ? (targetSsd / 1024) + 'TB' : targetSsd + 'GB'}`;
      }
    }

    const totalCost = Math.round(l.price_brl + ramCost + ssdCost);
    const valueScore = totalCost > 0 ? (l._compositeScore / totalCost) * 1000 : 0;
    return { lap: l, canRam, ramCost, ssdCost, totalCost, ramNote, ssdNote, valueScore };
  });

  const matching = evaluated.filter(e => {
    if (!e.canRam) return false;
    if (strategy === 'EXPANDABLE' && e.lap.ram_soldered) return false;
    if (strategy === 'SOLDERED' && !e.lap.ram_soldered) return false;
    return e.totalCost <= budget;
  }).sort((a, b) => b.valueScore - a.valueScore);

  const gridEl = document.getElementById('laptop-upg-cards-grid');
  if (gridEl) {
    if (!matching.length) {
      gridEl.innerHTML = `<div class="col-span-full p-6 rounded-xl bg-slate-900/80 border border-amber-500/30 text-center text-xs text-amber-200">Nenhum notebook atinge ${targetRam}GB RAM + ${targetSsd >= 1024 ? (targetSsd / 1024) + 'TB' : targetSsd + 'GB'} SSD dentro de ${fmtBRLShort(budget)}. Aumente o orçamento ou ajuste o alvo.</div>`;
    } else {
      gridEl.innerHTML = matching.slice(0, 8).map((e, idx) => `
        <div class="p-4 rounded-xl bg-slate-950/90 border ${idx === 0 ? 'border-emerald-500/60 shadow-lg shadow-emerald-500/10' : 'border-slate-800'} flex flex-col justify-between space-y-3">
          <div>
            <div class="flex items-center justify-between gap-2 mb-1.5">
              <span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${e.lap.ram_soldered ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}">
                ${idx === 0 ? '🏆 MELHOR C/B FINAL' : (e.lap.ram_soldered ? '🔒 Pronto de Fábrica' : '🔓 Expansível')}
              </span>
              <span class="text-xs font-mono text-slate-400">Score ${e.lap._overallVersusScore}/100</span>
            </div>
            <div class="text-xs font-bold text-white line-clamp-2">${_escLapHtml(e.lap.name)}</div>
            <div class="text-xs font-mono text-purple-300 mt-1">${_escLapHtml(e.lap.gpu_name)}</div>
          </div>
          <div class="space-y-1 text-xs font-mono border-t border-slate-800 pt-2">
            <div class="flex justify-between"><span class="text-slate-400">Base hoje:</span><span class="text-white">${fmtBRLShort(e.lap.price_brl)}</span></div>
            <div class="flex justify-between"><span class="text-slate-400">RAM (${e.ramNote}):</span><span class="text-sky-300">${e.ramCost > 0 ? '+' + fmtBRLShort(e.ramCost) : 'R$ 0'}</span></div>
            <div class="flex justify-between"><span class="text-slate-400">SSD (${e.ssdNote}):</span><span class="text-emerald-300">${e.ssdCost > 0 ? '+' + fmtBRLShort(e.ssdCost) : 'R$ 0'}</span></div>
            <div class="flex justify-between pt-1 border-t border-slate-800 font-bold text-xs"><span class="text-slate-200">Total Configurado:</span><span class="text-amber-300">${fmtBRL(e.totalCost)}</span></div>
          </div>
          <button type="button" onclick="applyLaptopUpgradePick('${_escLapHtml(e.lap.slug)}', ${targetRam}, ${targetSsd})" class="w-full py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/35 text-purple-200 border border-purple-500/40 text-xs font-bold cursor-pointer">
            Carregar no Planejador →
          </button>
        </div>
      `).join('');
    }
  }

  const costsEl = document.getElementById('laptop-upg-costs-table');
  if (costsEl) {
    costsEl.innerHTML = `
      <div class="grid grid-cols-2 gap-2 font-mono text-xs">
        <div class="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between"><span>Módulo 16GB DDR5 SO-DIMM</span><strong class="text-sky-300">~${fmtBRLShort(430)}</strong></div>
        <div class="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between"><span>Kit 32GB DDR5 SO-DIMM</span><strong class="text-sky-300">~${fmtBRLShort(890)}</strong></div>
        <div class="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between"><span>SSD NVMe Gen4 1TB</span><strong class="text-emerald-300">~${fmtBRLShort(480)}</strong></div>
        <div class="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between"><span>SSD NVMe Gen4 2TB</span><strong class="text-emerald-300">~${fmtBRLShort(920)}</strong></div>
      </div>
    `;
  }

  const vEl = document.getElementById('laptop-upg-verdict');
  if (vEl) {
    const blockedCount = evaluated.filter(e => !e.canRam).length;
    const topPick = matching[0];
    vEl.innerHTML = `
      <span class="text-xs font-mono uppercase text-purple-400 font-bold">Diagnóstico de Engenharia & Expansão</span>
      <p class="text-slate-200 leading-relaxed">
        Dos <strong>${pool.length} notebooks</strong> analisados, <strong>${blockedCount}</strong> possuem memória soldada insuficiente ou limite abaixo de <strong>${targetRam}GB RAM</strong>.
        ${topPick
          ? `A opção mais inteligente dentro de ${fmtBRLShort(budget)} é <strong>${_escLapHtml(shortLaptopChipName(topPick.lap))}</strong>, fechando em <strong>${fmtBRL(topPick.totalCost)}</strong> com ${targetRam}GB RAM e ${targetSsd >= 1024 ? (targetSsd / 1024) + 'TB' : targetSsd + 'GB'} SSD.`
          : 'Tente elevar o orçamento ou reduzir a meta para 16GB/512GB.'}
      </p>
    `;
  }
}

/* ============================================================================
 * G. TAB 6 — FULL-SYSTEM PERFORMANCE SIMULATOR (AC VS BATTERY & SCREEN HZ)
 * ============================================================================ */

function swapSimulatorLaptops() {
  const tmp = STATE.simLaptopASlug;
  STATE.simLaptopASlug = STATE.simLaptopBSlug;
  STATE.simLaptopBSlug = tmp;
  const sA = document.getElementById('sim-select-laptop-a');
  const sB = document.getElementById('sim-select-laptop-b');
  if (sA) sA.value = STATE.simLaptopASlug;
  if (sB) sB.value = STATE.simLaptopBSlug;
  renderLaptopSimulator();
}

function _parseScreenHeight(resStr) {
  const m = String(resStr || '1920x1080').match(/(\d+)\s*x\s*(\d+)/i);
  return m ? parseInt(m[2], 10) : 1080;
}

function _simulateLaptopSnapshot(lap, powerMode, resMode) {
  const onBattery = powerMode === 'battery';
  // Real mobile physics: Windows dGPUs throttle ~48% on battery; Apple Silicon stays ~94%
  const gpuPowerScale = onBattery ? (lap.is_apple_unified ? 0.94 : (lap.gpu_is_dedicated ? 0.46 : 0.78)) : 1.0;
  const cpuPowerScale = onBattery ? (lap.is_apple_unified ? 0.96 : 0.70) : 1.0;

  let targetResHeight = _parseScreenHeight(lap.screen_res);
  let targetHz = Number(lap.screen_hz || 60);
  if (resMode === 'external') {
    const extRes = (typeof STATE !== 'undefined' && STATE.monitorRes) || '1440p';
    targetResHeight = extRes.includes('4k') || extRes.includes('2160') ? 2160 : (extRes.includes('1440') ? 1440 : 1080);
    targetHz = Number((typeof STATE !== 'undefined' && STATE.monitorMaxFps) || 144);
  }
  const resScale = targetResHeight >= 2160 ? 0.48 : (targetResHeight >= 1440 ? 0.76 : (targetResHeight >= 1200 ? 0.90 : 1.0));

  const gamingEff = Number(lap.gaming_score || 400) * gpuPowerScale * resScale;
  const wsEff = getLaptopWorkstationScore(lap) * cpuPowerScale * (lap.gpu_is_dedicated && onBattery ? 0.72 : 1.0);
  const aiEff = getLaptopAIScore(lap) * (lap.is_apple_unified ? (onBattery ? 0.95 : 1.0) : (onBattery ? 0.58 : 1.0));
  const softEff = Number(lap.software_score || 2000) * cpuPowerScale;

  // Estimate FPS across active games (or default fallback)
  const gamesPool = (typeof STATE !== 'undefined' && Array.isArray(STATE.games) && STATE.games.length)
    ? STATE.games
    : (typeof DEFAULT_GAMES !== 'undefined' ? DEFAULT_GAMES : [
        { id: 'cyberpunk', title: 'Cyberpunk 2077 (High/RT)', fps1440: 48, cpuFps: 160, vramReq: 8, relevant: true },
        { id: 'cs2', title: 'Counter-Strike 2', fps1440: 260, cpuFps: 600, vramReq: 4, relevant: true }
      ]);
  const relevantGames = gamesPool.filter(g => g.relevant !== false);
  const useGames = relevantGames.length ? relevantGames : gamesPool.slice(0, 5);

  const desktopRefGamingScore = 2900; // calibrates 1440p review baseline
  const gameResults = useGames.map(g => {
    const base1440Fps = Number(g.fps1440 || 60);
    const estGpuFps = base1440Fps * (Number(lap.gaming_score || 400) / desktopRefGamingScore) * gpuPowerScale * (targetResHeight >= 2160 ? 0.62 : (targetResHeight >= 1440 ? 1.0 : 1.32));
    const estCpuCap = Number(g.cpuFps || 180) * (Number(lap.cpu_single_score || 70) / 88) * cpuPowerScale;
    const vramReq = Number(g.vramReq || 6);
    const vramPenalty = lap._effGpuMem < vramReq ? Math.max(0.58, lap._effGpuMem / vramReq) : 1.0;
    const macPenalty = lap.is_apple_unified ? 0.68 : 1.0; // compatibility / Rosetta / Metal headroom vs DirectX
    const fps = Math.max(12, Math.round(Math.min(estCpuCap, estGpuFps) * vramPenalty * macPenalty));
    return { title: g.title, fps, capHz: targetHz, screenUtilizationPct: Math.min(100, Math.round((fps / targetHz) * 100)) };
  });

  const avgFps = gameResults.length ? Math.round(gameResults.reduce((s, g) => s + g.fps, 0) / gameResults.length) : 0;
  return {
    lap, gamingEff, wsEff, aiEff, softEff, targetHz, targetResHeight,
    gameResults, avgFps,
    tok8b: +(Number(lap.llm_8b_tok_s || 4) * (lap.is_apple_unified ? (onBattery ? 0.95 : 1) : (onBattery ? 0.60 : 1))).toFixed(1),
    tok14b: +(Number(lap.llm_14b_tok_s || 0) * (lap.is_apple_unified ? (onBattery ? 0.95 : 1) : (onBattery ? 0.60 : 1))).toFixed(1),
    tok32b: +(Number(lap.llm_32b_tok_s || 0) * (lap.is_apple_unified ? (onBattery ? 0.95 : 1) : (onBattery ? 0.60 : 1))).toFixed(1)
  };
}

function renderLaptopSimulator() {
  const pool = getLaptopPool();
  if (!pool.length) return;
  enrichLaptopsWithContextualMetrics();

  const selA = document.getElementById('sim-select-laptop-a');
  const selB = document.getElementById('sim-select-laptop-b');
  if (selA && selA.value) STATE.simLaptopASlug = selA.value;
  if (selB && selB.value) STATE.simLaptopBSlug = selB.value;

  const lapA = findLaptopBySlug(STATE.simLaptopASlug) || pool[0];
  const lapB = findLaptopBySlug(STATE.simLaptopBSlug) || pool[Math.min(1, pool.length - 1)];

  const powerMode = document.getElementById('sim-laptop-power-mode')?.value || 'ac';
  const resMode = document.getElementById('sim-laptop-res-mode')?.value || 'native';

  const simA = _simulateLaptopSnapshot(lapA, powerMode, resMode);
  const simB = _simulateLaptopSnapshot(lapB, powerMode, resMode);

  const bannerEl = document.getElementById('sim-laptop-status-banner');
  if (bannerEl) {
    bannerEl.innerHTML = powerMode === 'battery'
      ? `<div class="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200">🔋 <strong>Modo Bateria Ativo:</strong> Notebooks Windows com GPU dedicada reduzem TGP para ~45% fora da tomada; MacBooks Apple Silicon mantêm ~95% do desempenho máximo.</div>`
      : `<div class="p-3 rounded-xl bg-emerald-950/35 border border-emerald-500/35 text-xs text-emerald-200">🔌 <strong>Modo Tomada (TGP Máximo):</strong> Simulando potência térmica completa de CPU + GPU (${resMode === 'native' ? 'Tela Nativa de cada Notebook' : 'Monitor Externo Configurado'}).</div>`;
  }

  const heroEl = document.getElementById('sim-laptop-hero-cards');
  if (heroEl) {
    heroEl.innerHTML = `
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-sky-500/30 space-y-1">
        <span class="text-xs font-mono uppercase text-slate-400">FPS Médio Estimado</span>
        <div class="text-sm font-mono font-bold text-white"><span class="text-sky-300">${simA.avgFps} fps</span> vs <span class="text-emerald-300">${simB.avgFps} fps</span></div>
        <div class="text-xs text-slate-400">Tela A: ${simA.targetHz}Hz • Tela B: ${simB.targetHz}Hz</div>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-1">
        <span class="text-xs font-mono uppercase text-slate-400">Workstation (Render/Dev)</span>
        <div class="text-sm font-mono font-bold text-white"><span class="text-sky-300">${Math.round(simA.wsEff)}</span> vs <span class="text-emerald-300">${Math.round(simB.wsEff)}</span></div>
        <div class="text-xs text-slate-400">${simB.wsEff >= simA.wsEff ? `+${(((simB.wsEff / Math.max(1, simA.wsEff)) - 1) * 100).toFixed(0)}% p/ B` : `+${(((simA.wsEff / Math.max(1, simB.wsEff)) - 1) * 100).toFixed(0)}% p/ A`}</div>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-purple-500/30 space-y-1">
        <span class="text-xs font-mono uppercase text-slate-400">IA Local (Llama 8B Q4)</span>
        <div class="text-sm font-mono font-bold text-white"><span class="text-sky-300">${simA.tok8b} t/s</span> vs <span class="text-emerald-300">${simB.tok8b} t/s</span></div>
        <div class="text-xs text-slate-400">${lapA._effGpuMem}GB vs ${lapB._effGpuMem}GB GPU/Unif.</div>
      </div>
      <div class="p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/30 space-y-1">
        <span class="text-xs font-mono uppercase text-slate-400">Bateria & Mobilidade</span>
        <div class="text-sm font-mono font-bold text-white"><span class="text-sky-300">${lapA.battery_hours_light}h / ${lapA.weight_kg}kg</span> vs <span class="text-emerald-300">${lapB.battery_hours_light}h / ${lapB.weight_kg}kg</span></div>
        <div class="text-xs text-slate-400">Fontes: ${lapA.charger_w}W vs ${lapB.charger_w}W</div>
      </div>
    `;
  }

  // Sim 6-axis Radar
  const ex = getLaptopCatalogExtremes();
  chartSimLaptopRadar = _destroyChartSafe(chartSimLaptopRadar, 'chart-sim-laptop-radar');
  const radCanvas = document.getElementById('chart-sim-laptop-radar');
  const toSimRad = s => [
    Math.min(100, Math.round((s.gamingEff / ex.maxGaming) * 100)),
    Math.min(100, Math.round((s.wsEff / ex.maxWS) * 100)),
    Math.min(100, Math.round((s.aiEff / ex.maxAI) * 100)),
    Number(s.lap.display_score || 60),
    Number(s.lap.battery_score || 55),
    Number(s.lap.portability_score || 60)
  ];
  const rDataA = toSimRad(simA);
  const rDataB = toSimRad(simB);
  if (radCanvas && typeof Chart !== 'undefined') {
    chartSimLaptopRadar = new Chart(radCanvas.getContext('2d'), {
      type: 'radar',
      data: {
        labels: ['Jogos (Real)', 'Workstation', 'IA / LLM', 'Tela', 'Bateria', 'Portabilidade'],
        datasets: [
          { label: `A: ${shortLaptopChipName(lapA)}`, data: rDataA, borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.22)', borderWidth: 2 },
          { label: `B: ${shortLaptopChipName(lapB)}`, data: rDataB, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.22)', borderWidth: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: 'rgba(148,163,184,0.16)' }, angleLines: { color: 'rgba(148,163,184,0.16)' }, pointLabels: { color: '#cbd5e1', font: { size: 11 } } } },
        plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 11 } } } }
      }
    });
  }

  const winBadgeEl = document.getElementById('sim-laptop-radar-winner-badge');
  if (winBadgeEl) {
    const avgA = Math.round(rDataA.reduce((a, b) => a + b, 0) / 6);
    const avgB = Math.round(rDataB.reduce((a, b) => a + b, 0) / 6);
    winBadgeEl.innerHTML = `<span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-white">Média Simulada: <strong class="text-sky-300">A ${avgA}</strong> vs <strong class="text-emerald-300">B ${avgB}</strong></span>`;
  }

  const brkEl = document.getElementById('sim-laptop-radar-metrics-breakdown');
  if (brkEl) {
    const dims = ['Jogos (Real)', 'Workstation', 'IA / LLM', 'Tela', 'Bateria', 'Portabilidade'];
    brkEl.innerHTML = dims.map((d, i) => `
      <div class="p-2 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between">
        <span class="text-slate-300">${d}</span>
        <span><strong class="text-sky-300">${rDataA[i]}</strong> <span class="text-slate-600">vs</span> <strong class="text-emerald-300">${rDataB[i]}</strong></span>
      </div>
    `).join('');
  }

  const wsEl = document.getElementById('sim-laptop-workstation-panel');
  if (wsEl) {
    const scaleA = powerMode === 'battery' ? (lapA.is_apple_unified ? 0.95 : 0.72) : 1.0;
    const scaleB = powerMode === 'battery' ? (lapB.is_apple_unified ? 0.95 : 0.72) : 1.0;
    const mkBar = (lbl, vA, vB) => {
      const m = Math.max(vA, vB, 1);
      return `
        <div class="space-y-1 text-xs">
          <div class="flex justify-between font-mono"><span class="text-slate-300">${lbl}</span><span><strong class="text-sky-300">${Math.round(vA)}</strong> vs <strong class="text-emerald-300">${Math.round(vB)}</strong></span></div>
          <div class="grid grid-cols-2 gap-2">
            <div class="h-2 bg-slate-950 rounded-full overflow-hidden"><div class="h-full bg-sky-400" style="width:${(vA / m * 100).toFixed(0)}%"></div></div>
            <div class="h-2 bg-slate-950 rounded-full overflow-hidden"><div class="h-full bg-emerald-400" style="width:${(vB / m * 100).toFixed(0)}%"></div></div>
          </div>
        </div>
      `;
    };
    wsEl.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-800 pb-2">
        <span class="text-xs font-bold text-amber-300">Workstation Profissional (Respeita Pesos Render / Edição / Dev)</span>
        <span class="text-xs font-mono text-slate-400">${_escLapHtml(lapA.cpu_name)} vs ${_escLapHtml(lapB.cpu_name)}</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        ${mkBar('Renderização 3D (Blender/CAD)', lapA.workstation_render_score * scaleA, lapB.workstation_render_score * scaleB)}
        ${mkBar('Edição de Vídeo 4K (Premiere/Resolve)', lapA.workstation_editing_score * scaleA, lapB.workstation_editing_score * scaleB)}
        ${mkBar('Compilação & Dev (Docker/Rust/C++)', lapA.workstation_compile_score * scaleA, lapB.workstation_compile_score * scaleB)}
      </div>
    `;
  }

  const gamesEl = document.getElementById('sim-laptop-games-list');
  if (gamesEl) {
    gamesEl.innerHTML = simA.gameResults.map((gA, idx) => {
      const gB = simB.gameResults[idx] || gA;
      return `
        <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
          <div class="font-bold text-slate-200 truncate">${_escLapHtml(gA.title)}</div>
          <div class="flex items-center justify-between font-mono text-xs mt-1">
            <span class="text-sky-300">A: <strong>${gA.fps} FPS</strong> (${gA.screenUtilizationPct}% ${gA.capHz}Hz)</span>
            <span class="text-emerald-300">B: <strong>${gB.fps} FPS</strong> (${gB.screenUtilizationPct}% ${gB.capHz}Hz)</span>
          </div>
        </div>
      `;
    }).join('');
  }

  const aiEl = document.getElementById('sim-laptop-ai-list');
  if (aiEl) {
    const mkLlm = (name, vA, vB, memReq) => `
      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
        <div class="flex justify-between"><strong class="text-slate-200">${name}</strong><span class="text-xs font-mono text-purple-300">Req: ~${memReq}GB</span></div>
        <div class="flex justify-between font-mono text-xs mt-1">
          <span class="${lapA._effGpuMem >= memReq ? 'text-sky-300' : 'text-amber-400'}">A: ${vA > 0 ? vA + ' tok/s' : 'Offload CPU'}</span>
          <span class="${lapB._effGpuMem >= memReq ? 'text-emerald-300' : 'text-amber-400'}">B: ${vB > 0 ? vB + ' tok/s' : 'Offload CPU'}</span>
        </div>
      </div>
    `;
    aiEl.innerHTML = [
      mkLlm('Llama 3.1 8B (Q4_K_M)', simA.tok8b, simB.tok8b, 6),
      mkLlm('Qwen 2.5 14B (Q4_K_M)', simA.tok14b, simB.tok14b, 10),
      mkLlm('DeepSeek / Qwen 32B (Q4)', simA.tok32b, simB.tok32b, 18)
    ].join('');
  }

  const softEl = document.getElementById('sim-laptop-soft-list');
  if (softEl) {
    softEl.innerHTML = `
      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs flex justify-between font-mono">
        <span class="text-slate-300">AI Training / Fine-Tune Index</span>
        <span><strong class="text-sky-300">${Math.round(simA.aiEff)}</strong> vs <strong class="text-emerald-300">${Math.round(simB.aiEff)}</strong></span>
      </div>
      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs flex justify-between font-mono">
        <span class="text-slate-300">Engenharia / CAD / FEA</span>
        <span><strong class="text-sky-300">${Math.round(simA.softEff)}</strong> vs <strong class="text-emerald-300">${Math.round(simB.softEff)}</strong></span>
      </div>
      <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs flex justify-between font-mono">
        <span class="text-slate-300">Autonomia Carga Pesada</span>
        <span><strong class="text-sky-300">${lapA.battery_hours_heavy}h</strong> vs <strong class="text-emerald-300">${lapB.battery_hours_heavy}h</strong></span>
      </div>
    `;
  }
}

/* ============================================================================
 * H. TAB 7 — REFERENCE LAPTOP CONFIG SECTION
 * ============================================================================ */

function _loadSavedRefLaptop() {
  try {
    const raw = localStorage.getItem('gca_ref_laptop');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        STATE.refLaptop = { slug: parsed.slug || '', name: parsed.name || '', price: Number(parsed.price || 0) };
      }
    }
  } catch (_) {}
}

function _saveRefLaptop() {
  try {
    localStorage.setItem('gca_ref_laptop', JSON.stringify(STATE.refLaptop || { slug: '', name: '', price: 0 }));
  } catch (_) {}
}

function onConfigRefLaptopSelect(slug) {
  const lap = findLaptopBySlug(slug);
  if (!STATE.refLaptop) STATE.refLaptop = { slug: '', name: '', price: 0 };
  if (lap) {
    STATE.refLaptop = { slug: lap.slug, name: lap.name, price: Math.round(lap.price_brl) };
  } else {
    STATE.refLaptop.slug = '';
  }
  _saveRefLaptop();
  renderConfigLaptopSection();
}

function onConfigRefLaptopField(field, val) {
  if (!STATE.refLaptop) STATE.refLaptop = { slug: '', name: '', price: 0 };
  STATE.refLaptop[field] = field === 'price' ? (parseFloat(val) || 0) : val;
  _saveRefLaptop();
}

function applyRefLaptopToDuel() {
  if (!STATE.refLaptop || !STATE.refLaptop.slug || !findLaptopBySlug(STATE.refLaptop.slug)) return;
  STATE.laptopDuelBaseSlug = STATE.refLaptop.slug;
  const selBase = document.getElementById('laptop-duel-select-base');
  if (selBase) selBase.value = STATE.refLaptop.slug;
  syncLaptopDuelPriceInputsFromSelection();
  if (typeof switchTab === 'function') switchTab('versus');
}

function renderConfigLaptopSection() {
  const el = document.getElementById('cfg-ref-laptop-container');
  if (!el) return;
  const pool = getLaptopPool();
  if (!STATE.refLaptop || (!STATE.refLaptop.slug && !STATE.refLaptop.name)) {
    _loadSavedRefLaptop();
  }
  const ref = STATE.refLaptop || { slug: '', name: '', price: 0 };
  const matched = ref.slug ? findLaptopBySlug(ref.slug) : null;

  el.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
      <div class="md:col-span-6">
        <label class="text-xs font-bold text-slate-300 block mb-1">Selecionar Notebook do Catálogo (ou vazio para customizado)</label>
        <select onchange="onConfigRefLaptopSelect(this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white">
          <option value="">-- Nenhum / Digitar manualmente --</option>
          ${_buildGroupedLaptopOptionsHTML(pool, ref.slug)}
        </select>
      </div>
      <div class="md:col-span-4">
        <label class="text-xs font-bold text-slate-300 block mb-1">Nome / Modelo Atual</label>
        <input type="text" value="${_escLapHtml(ref.name)}" placeholder="Ex: Dell Inspiron i5 16GB" oninput="onConfigRefLaptopField('name', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white">
      </div>
      <div class="md:col-span-2">
        <label class="text-xs font-bold text-slate-300 block mb-1">Valor Estimado (R$)</label>
        <input type="number" value="${Math.round(ref.price || 0)}" step="100" oninput="onConfigRefLaptopField('price', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-emerald-300">
      </div>
    </div>
    ${matched ? `
      <div class="p-3 rounded-xl bg-slate-950 border border-purple-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div class="text-slate-300 font-mono">
          <strong>${_escLapHtml(shortLaptopChipName(matched))}</strong> • ${_escLapHtml(matched.cpu_name)} • ${_escLapHtml(matched.gpu_name)} • ${matched.ram_gb}GB RAM
        </div>
        <button type="button" onclick="applyRefLaptopToDuel()" class="px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/35 text-purple-200 border border-purple-500/40 font-bold cursor-pointer">
          Usar como Notebook Base no Duelo →
        </button>
      </div>
    ` : ''}
  `;
}

// Initialize saved ref laptop on load
_loadSavedRefLaptop();

// Global exports for app.js, app_features.js & inline HTML handlers
window.getLaptopContextualCompositeScore = getLaptopContextualCompositeScore;
window.enrichLaptopsWithContextualMetrics = enrichLaptopsWithContextualMetrics;
window.evaluateLaptopRelationalUpgrade = evaluateLaptopRelationalUpgrade;
window.populateLaptopSelectors = populateLaptopSelectors;
window.syncLaptopDuelPriceInputsFromSelection = syncLaptopDuelPriceInputsFromSelection;
window.setLaptopDuelPreset = setLaptopDuelPreset;
window.onLaptopDuelSelectionChange = onLaptopDuelSelectionChange;
window.swapLaptopDuelPair = swapLaptopDuelPair;
window.resetLaptopDuelPricesToLive = resetLaptopDuelPricesToLive;
window.sendLaptopToDuel = sendLaptopToDuel;
window.renderLaptopDuelAnalysis = renderLaptopDuelAnalysis;
window.setLaptopCBChartMetric = setLaptopCBChartMetric;
window.setLaptopCBSort = setLaptopCBSort;
window.renderLaptopCBTable = renderLaptopCBTable;
window.pickLaptopForObjective = pickLaptopForObjective;
window.onLaptopBuilderSelect = onLaptopBuilderSelect;
window.updateLaptopBuilderField = updateLaptopBuilderField;
window.renderLaptopBuilder = renderLaptopBuilder;
window.applyLaptopUpgradePick = applyLaptopUpgradePick;
window.renderLaptopUpgrades = renderLaptopUpgrades;
window.swapSimulatorLaptops = swapSimulatorLaptops;
window.renderLaptopSimulator = renderLaptopSimulator;
window.onConfigRefLaptopSelect = onConfigRefLaptopSelect;
window.onConfigRefLaptopField = onConfigRefLaptopField;
window.applyRefLaptopToDuel = applyRefLaptopToDuel;
window.renderConfigLaptopSection = renderConfigLaptopSection;
