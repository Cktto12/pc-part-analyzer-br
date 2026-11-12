/**
 * GPU & Build Analyzer Pro — Frontend Engine
 * Integrates live Hardware Barato data, 180-day price history & Target Price,
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

  // Editable PC Build State (Pre-populated with user's detected Xeon E5-2680 v4 + X99-P4 + 16GB DDR4 + RTX 5070 target upgrade)
  build: {
    cpu: { slug: 'xeon-e5-2680-v4', name: 'Intel Xeon E5-2680 v4 (14C/28T)', tdp: 120, price: 120, owned: true, benchmark: 2150, socket: 'LGA2011-3' },
    gpu: { slug: 'rtx-5070', name: 'RTX 5070 12GB', tdp: 250, price: 5103.89, owned: false },
    mobo: { slug: 'x99-p4-lga2011', name: 'Placa-Mãe X99-P4 (LGA2011-3)', tdp: 40, price: 280, owned: true, socket: 'LGA2011-3', memory_type: 'DDR4' },
    ram: { slug: 'ddr4-16gb-2400', name: '16 GB DDR4 2400 MT/s (Atual)', tdp: 10, price: 210, owned: true, capacity_gb: 16, memory_type: 'DDR4' },
    storage: { name: 'SSD NVMe M.2 1TB + SATA', tdp: 12, price: 380, owned: true },
    cooling: { name: 'Cooler CPU + 4x Fans Gabinete', tdp: 20, price: 150, owned: true },
    psu: { slug: 'corsair-cx650-650w', name: 'Fonte 650W 80 Plus Bronze', watts: 650, price: 369.99, owned: false }
  }
};

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

// Helper to render center-referenced comparative bars (Reference is 100% in middle, candidate extends right or left)
function renderComparisonBarHTML({
  title,
  iconSvg,
  baseVal,
  candVal,
  baseLabel,
  candLabel,
  diffPct,
  isPrice = false
}) {
  const diff = diffPct != null ? diffPct : (baseVal > 0 ? ((candVal / baseVal) - 1) * 100 : 0);
  let candBarWidthPct = 50;
  let barColor = 'bg-sky-400';
  let badgeColor = 'text-sky-300';

  if (isPrice) {
    if (diff > 0) {
      candBarWidthPct = Math.min(100, 50 + (diff * 0.4));
      barColor = 'bg-amber-400';
      badgeColor = 'text-amber-300';
    } else {
      candBarWidthPct = Math.max(10, 50 + (diff * 0.5));
      barColor = 'bg-emerald-400';
      badgeColor = 'text-emerald-300';
    }
  } else {
    if (diff >= 0) {
      candBarWidthPct = Math.min(100, 50 + Math.min(50, diff * 0.7));
      barColor = 'bg-gradient-to-r from-sky-400 to-emerald-400';
      badgeColor = 'text-emerald-300';
    } else {
      candBarWidthPct = Math.max(10, 50 * Math.max(0.2, 1 + diff / 100));
      barColor = 'bg-rose-400';
      badgeColor = 'text-rose-300';
    }
  }

  const sign = diff > 0 ? '+' : '';
  const diffText = `${sign}${Math.round(diff)}%`;

  return `
    <div class="space-y-1">
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-1.5 text-slate-300 font-medium">
          ${iconSvg}
          <span>${title}</span>
        </div>
        <div class="flex items-center gap-2 font-mono text-[11px]">
          <span class="text-slate-400">${baseLabel != null ? baseLabel : baseVal}</span>
          <span class="text-slate-600">vs</span>
          <span class="font-bold ${badgeColor}">${candLabel != null ? candLabel : candVal} <span class="text-[10px] opacity-80">(${diffText})</span></span>
        </div>
      </div>
      <div class="h-2 w-full bg-slate-950 rounded-full relative overflow-hidden border border-slate-800">
        <div class="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600/80 z-20" title="100% Base"></div>
        <div class="h-full rounded-full transition-all duration-300 ${barColor}" style="width: ${candBarWidthPct.toFixed(1)}%;"></div>
      </div>
    </div>
  `;
}

// Format BRL currency
function fmtBRL(val) {
  if (val === null || val === undefined || isNaN(val)) return 'R$ --';
  return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtBRLShort(val) {
  if (val === null || val === undefined || isNaN(val)) return 'R$ --';
  const sign = val < 0 ? '-' : '';
  return sign + 'R$ ' + Math.round(Math.abs(val)).toLocaleString('pt-BR');
}

// Compute effective Local AI Inference score of a GPU directly from token/s throughput (8B, 14B, 32B), KV-cache VRAM headroom, and memory bandwidth
function getEffectiveAIScore(gpu) {
  const vram = gpu.vram_gb || 8;
  const bw = gpu.bandwidth_gbs || 256;
  const tok8 = gpu.llm_8b_tok_s || 20;
  const tok14 = gpu.llm_14b_tok_s || 5;
  const tok32 = gpu.llm_32b_tok_s || 0;
  const fp16 = gpu.fp16_tflops || 20;
  const heft = parseFloat(STATE.vramHeft) || 1.6;
  const isNvidia = gpu.brand === 'NVIDIA';

  // Local Inference Throughput Calculus:
  // - At heft=1.0 (Light 8B): 8B token/s dominates, 8GB VRAM is fine.
  // - At heft=1.6 (14B + AI Training + RAG KV-cache): 14B token/s (which requires >=12GB to avoid PCIe RAM offload) is heavily weighted!
  // - At heft=2.3 (14B-32B + Multi-agent local inference): 14B & 32B token/s + CUDA/Tensor FP8/FP4 support dominate.
  let infPoints = 0;
  if (heft <= 1.1) {
    infPoints = (tok8 * 32) + (tok14 * 22) + (vram * 95) + (bw * 1.4);
  } else if (heft <= 1.8) {
    // 14B Q4 (~9.2GB) + 8k-16k KV-cache needs 12GB+ VRAM. On 8GB, tok14 drops to ~9 tok/s (PCIe bottleneck) vs ~58 tok/s on RTX 5070 12GB!
    const kvCacheFitBonus = vram >= 16 ? 1850 : (vram >= 12 ? 1150 : (vram >= 10 ? 450 : -450));
    infPoints = (tok8 * 16) + (tok14 * 58) + (tok32 * 40) + kvCacheFitBonus + (bw * 1.8) + (fp16 * 8);
  } else {
    const kvCacheFitBonus = vram >= 24 ? 3800 : (vram >= 16 ? 2600 : (vram >= 12 ? 1350 : -950));
    infPoints = (tok8 * 10) + (tok14 * 68) + (tok32 * 85) + kvCacheFitBonus + (bw * 2.2) + (fp16 * 11);
  }

  // Ecosystem multiplier for local inference engines (TensorRT-LLM, vLLM, FlashAttention-2, llama.cpp CUDA vs ROCm/SYCL)
  const ecoMult = isNvidia ? 1.18 : (gpu.brand === 'Intel' ? 0.92 : 0.86);
  return Math.max(250, Math.round(infPoints * ecoMult));
}

// Compute effective Engineering / AI Training / Ethernet Frames / OpenDSS Score
function getEffectiveEngineeringScore(gpu) {
  const vram = gpu.vram_gb || 8;
  const bw = gpu.bandwidth_gbs || 256;
  const fp16 = gpu.fp16_tflops || 20;
  const bench = gpu.gaming_score || 1500;
  const heft = parseFloat(STATE.vramHeft) || 1.6;

  // 1. AI Training & Simulação 3D (NVIDIA Omniverse, Isaac Sim, PhysX 5, PyTorch Neural Nets):
  //    Requires CUDA + Tensor Cores (FP8/FP16/BF16) & >=12GB VRAM
  // 2. Ethernet Frame / High-Speed Packet Processing (DOCA GPUNetIO, DPDK GPU, CuPy/RAPIDS cuDF ring buffers):
  //    Depends on Memory Bandwidth (GB/s), CUDA stream throughput, and VRAM buffer size
  // 3. OpenDSS / Power Grid Time-Series & Monte Carlo Co-Simulation (CuPy / cuSOLVER sparse matrix & AI surrogate models):
  //    Depends on CUDA sparse solvers + FP16/FP32 compute + bandwidth
  const isNvidia = gpu.brand === 'NVIDIA';
  const hasTensorCores = isNvidia && (gpu.arch && (gpu.arch.includes('Blackwell') || gpu.arch.includes('Ada') || gpu.arch.includes('Ampere') || gpu.arch.includes('Turing')));
  const cudaEcoMult = isNvidia ? (hasTensorCores ? (heft >= 1.5 ? 1.50 : 1.35) : 1.15) : (gpu.brand === 'Intel' ? 0.85 : 0.65);
  const vramTwinBonus = vram >= 16 ? 1200 : (vram >= 12 ? 750 : (vram <= 8 && heft >= 1.5 ? -300 : 150));
  const tensorTrainBonus = hasTensorCores ? 650 : (isNvidia ? 200 : -450);

  const rawEng = (bench * 0.40) + (bw * 2.8) + (fp16 * 19) + (vram * 130) + vramTwinBonus + tensorTrainBonus;
  return Math.max(200, Math.round(rawEng * cudaEcoMult));
}

// Compute composite contextual performance score for a GPU based on user sliders
function getContextualCompositeScore(gpu, customWeights = null) {
  const wg = customWeights ? customWeights.wGaming : STATE.wGaming;
  const wa = customWeights ? customWeights.wAI : STATE.wAI;
  const ws = customWeights ? customWeights.wSoft : STATE.wSoft;
  const totalW = Math.max(1, wg + wa + ws);

  const gNorm = wg / totalW;
  const aNorm = wa / totalW;
  const sNorm = ws / totalW;

  const gaming = (typeof getEffectiveGamingScore === 'function') ? getEffectiveGamingScore(gpu) : (gpu.gaming_score || 1500);
  const ai = getEffectiveAIScore(gpu);
  const engSoft = getEffectiveEngineeringScore(gpu);

  return gNorm * gaming + aNorm * ai + sNorm * engSoft;
}

// Recompute contextual Custo-Benefício (0-100) across all GPUs
function enrichGPUsWithContextualMetrics() {
  if (!DB.gpus || !DB.gpus.length) return;

  let maxRawRatio = 0;
  DB.gpus.forEach(g => {
    const comp = getContextualCompositeScore(g);
    g._compositeScore = Math.round(comp);
    g._effectiveAI = getEffectiveAIScore(g);
    const price = g._customPrice || g.price_brl || 99999;
    // Slight diminishing return dampening + price efficiency
    const rawRatio = comp / Math.pow(price, 0.92);
    g._rawCBRatio = rawRatio;
    // Exclude legacy reference GPU from setting the 100 ceiling
    if (g.slug !== 'rx-580-8gb-ref' && rawRatio > maxRawRatio) {
      maxRawRatio = rawRatio;
    }
  });

  DB.gpus.forEach(g => {
    g._myCBScore = maxRawRatio > 0 ? Math.min(100, Math.round((g._rawCBRatio / maxRawRatio) * 100)) : 50;
  });
}

// Evaluate Relational Upgrade Verdict between Base GPU and Candidate GPU
function evaluateRelationalUpgrade(baseGpu, candGpu, basePrice, candPrice) {
  const baseComp = getContextualCompositeScore(baseGpu);
  const candComp = getContextualCompositeScore(candGpu);
  const perfRatio = candComp / Math.max(1, baseComp);
  const perfGainPct = (perfRatio - 1) * 100;

  const gScore = g => (typeof getEffectiveGamingScore === 'function') ? getEffectiveGamingScore(g) : (g.gaming_score || 1);
  const gamingGainPct = ((gScore(candGpu) / Math.max(1, gScore(baseGpu))) - 1) * 100;
  const aiGainPct = ((( getEffectiveAIScore(candGpu) ) / Math.max(1, getEffectiveAIScore(baseGpu))) - 1) * 100;
  const softGainPct = (((getEffectiveEngineeringScore(candGpu)) / Math.max(1, getEffectiveEngineeringScore(baseGpu))) - 1) * 100;
  const vramDiff = (candGpu.vram_gb || 8) - (baseGpu.vram_gb || 8);

  const actualDelta = candPrice - basePrice;

  // Linear parity delta: if Candidate is +64% better overall, linear parity extra is 0.64 * basePrice
  const linearParityDelta = basePrice * (perfRatio - 1);

  // VRAM tier step-up value for AI & longevity (e.g., jumping from 8GB to 12GB or 16GB avoids obsolescence)
  const totalW = Math.max(1, STATE.wGaming + STATE.wAI + STATE.wSoft);
  const aiWeightNorm = STATE.wAI / totalW;
  let vramStepBonusBRL = 0;
  if (vramDiff > 0) {
    // Each extra 4GB over 8GB is worth tangible longevity, scaled by AI weight and VRAM heft
    vramStepBonusBRL = (vramDiff / 4) * 240 * (0.4 + aiWeightNorm * parseFloat(STATE.vramHeft));
  } else if (vramDiff < 0) {
    vramStepBonusBRL = (vramDiff / 4) * 260 * (0.4 + aiWeightNorm * parseFloat(STATE.vramHeft));
  }

  // Fair Max Delta (Teto Justo): Linear Parity + VRAM longevity bonus
  const fairMaxDelta = Math.round(Math.max(100, linearParityDelta + vramStepBonusBRL));
  // Great Deal / Steal Threshold (Ótimo / No-Brainer): ~62% of Fair Max Delta
  const stealDelta = Math.round(fairMaxDelta * 0.62);
  // Stretch / Enthusiast Limit (Caro / Ágio Máximo Tolerável): ~132% of Fair Max Delta
  const stretchMaxDelta = Math.round(fairMaxDelta * 1.32);

  let tier = 'bad';
  let label = 'CILADA / NÃO COMPENSA HOJE';
  let color = 'rose';
  let summary = '';

  if (perfGainPct <= 0) {
    if (actualDelta < 0 && Math.abs(actualDelta) >= Math.abs(linearParityDelta)) {
      tier = 'fair';
      label = 'ECONOMIA VÁLIDA';
      color = 'sky';
      summary = `A ${candGpu.name} entrega ${perfGainPct.toFixed(1)}% de desempenho relativo, mas custa ${fmtBRLShort(Math.abs(actualDelta))} a menos.`;
    } else {
      tier = 'bad';
      label = 'INFERIOR / NÃO COMPENSA';
      color = 'rose';
      summary = `A ${candGpu.name} tem desempenho contextual menor (${perfGainPct.toFixed(1)}%) para o seu perfil de uso.`;
    }
  } else {
    if (actualDelta <= stealDelta) {
      tier = 'steal';
      label = 'PECHINCHA / COMPRA IMEDIATA';
      color = 'emerald';
      summary = `Diferença de apenas ${fmtBRLShort(actualDelta)} para ganhar +${perfGainPct.toFixed(1)}% de performance ponderada (+${gamingGainPct.toFixed(0)}% Jogos, +${aiGainPct.toFixed(0)}% IA). Excelente negócio!`;
    } else if (actualDelta <= fairMaxDelta) {
      tier = 'fair';
      label = 'VALE O UPGRADE (PREÇO JUSTO)';
      color = 'sky';
      summary = `Diferença de ${fmtBRLShort(actualDelta)} está dentro do teto justo de até +${fmtBRLShort(fairMaxDelta)} pelo salto de +${perfGainPct.toFixed(1)}% (+${candGpu.vram_gb - baseGpu.vram_gb}GB VRAM).`;
    } else if (actualDelta <= stretchMaxDelta) {
      tier = 'stretch';
      label = 'ÁGIO ALTO / ESPERE CAIR';
      color = 'amber';
      summary = `Diferença atual de ${fmtBRLShort(actualDelta)} está R$ ${Math.round(actualDelta - fairMaxDelta).toLocaleString('pt-BR')} acima do preço justo (+${fmtBRLShort(fairMaxDelta)}). Só vale se fizer questão absoluta dos ${candGpu.vram_gb}GB/performance hoje.`;
    } else {
      tier = 'bad';
      label = 'PÉSSIMO CUSTO-BENEFÍCIO RELACIONAL';
      color = 'rose';
      summary = `Pagar ${fmtBRLShort(actualDelta)} a mais (+${((actualDelta / basePrice) * 100).toFixed(0)}% no preço) por +${perfGainPct.toFixed(1)}% de ganho é desproporcional. O máximo justo seria pagar até +${fmtBRLShort(fairMaxDelta)} (ou seja, ${candGpu.name} até ${fmtBRLShort(basePrice + fairMaxDelta)}).`;
    }
  }

  return {
    perfRatio,
    perfGainPct,
    gamingGainPct,
    aiGainPct,
    softGainPct,
    vramDiff,
    actualDelta,
    stealDelta,
    fairMaxDelta,
    stretchMaxDelta,
    fairMaxCandPrice: basePrice + fairMaxDelta,
    stealCandPrice: basePrice + stealDelta,
    tier,
    label,
    color,
    summary
  };
}

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
    sim: 'Simulador de Desempenho Real'
  };
  const activeTitleEl = document.getElementById('header-active-tab-title');
  if (activeTitleEl && tabTitles[tabId]) {
    activeTitleEl.textContent = tabTitles[tabId];
  }

  ['versus', 'cb', 'builder', 'upgrades', 'bf', 'sim'].forEach(id => {
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
  const panel = document.getElementById('context-settings-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
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

  // CPU selector for the FPS simulator (detected Xeon first)
  const simCpuSel = document.getElementById('sim-select-cpu');
  if (simCpuSel) {
    const cpusSorted = [...DB.cpus].sort((a, b) => (b.is_xeon ? 1 : 0) - (a.is_xeon ? 1 : 0) || a.name.localeCompare(b.name));
    simCpuSel.innerHTML = cpusSorted.map(c => `<option value="${c.slug}">${c.name}${c.is_xeon ? '' : ' — ' + fmtBRLShort(c.price_brl)}</option>`).join('');
    simCpuSel.value = STATE.build.cpu.slug || 'xeon-e5-2680-v4';
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
  const bEffGaming = baseEffGaming;
  const cEffGaming = candEffGaming;

  // Radar Axes (0-100)
  const bScoreGame = Math.min(100, Math.max(15, Math.round((bEffGaming / 4800) * 100)));
  const cScoreGame = Math.min(100, Math.max(15, Math.round((cEffGaming / 4800) * 100)));

  const getTechScore = (g) => {
    const p = typeof getGpuTechProfile === 'function' ? getGpuTechProfile(g) : {};
    if (p.isBlackwell) return 98;
    if (g.arch && g.arch.includes('Ada')) return 85;
    if (g.brand === 'NVIDIA' && g.arch && g.arch.includes('Ampere')) return 70;
    if (g.brand === 'AMD' && g.arch && g.arch.includes('RDNA 4')) return 82;
    if (g.brand === 'AMD' && g.arch && g.arch.includes('RDNA 3')) return 68;
    return 45;
  };
  const bScoreTech = getTechScore(baseGpu);
  const cScoreTech = getTechScore(candGpu);

  const getAIInferenceScore = (gpu) => {
    const isNvidia = gpu.brand === 'NVIDIA';
    const isIntel = gpu.brand === 'Intel';
    const vram = gpu.vram_gb || 8;
    const tok8 = gpu.llm_8b_tok_s || (isNvidia ? 40 : 15);
    const tok14 = gpu.llm_14b_tok_s || (isNvidia ? 8 : 4);

    // AI Hardware Acceleration Factor (Tensor Cores / XMX vs No Matrix Units)
    let hwBonus = 0;
    if (isNvidia) {
      if (gpu.arch && (gpu.arch.includes('Blackwell') || gpu.slug.includes('50'))) {
        hwBonus = 24; // 5th Gen Tensor Cores + FP4/FP8 transformer engine
      } else if (gpu.arch && (gpu.arch.includes('Ada') || gpu.slug.includes('40'))) {
        hwBonus = 18; // 4th Gen Tensor Cores + FP8
      } else if (gpu.arch && (gpu.arch.includes('Ampere') || gpu.slug.includes('30'))) {
        hwBonus = 12; // 3rd Gen Tensor Cores (BF16/TF32)
      } else {
        hwBonus = 6;  // Turing
      }
    } else if (isIntel && gpu.arch && gpu.arch.includes('Battlemage')) {
      hwBonus = 12; // Intel XMX Matrix Engines
    } else {
      // Polaris RX 580 or older architectures with NO matrix accelerators
      hwBonus = 0;
    }

    // High throughput on 8B models (Llama 3 8B, Gemma 2, Mistral 7B)
    const speed8 = Math.min(42, (tok8 / 110) * 42);
    // Throughput on 14B models (offloads on 8GB, fast on 12GB+)
    const speed14 = Math.min(26, (tok14 / 65) * 26);
    // VRAM headroom for KV cache and context window
    const vramTier = vram >= 16 ? 12 : (vram >= 12 ? 8 : (vram >= 10 ? 4 : (vram >= 8 ? 1 : -10)));

    return Math.min(100, Math.max(10, Math.round(hwBonus + speed8 + speed14 + vramTier)));
  };

  const bScoreAI = getAIInferenceScore(baseGpu);
  const cScoreAI = getAIInferenceScore(candGpu);

  const bTrainRaw = getEffectiveEngineeringScore(baseGpu);
  const cTrainRaw = getEffectiveEngineeringScore(candGpu);
  const bScoreTrain = Math.min(100, Math.max(15, Math.round((bTrainRaw / 5200) * 100)));
  const cScoreTrain = Math.min(100, Math.max(15, Math.round((cTrainRaw / 5200) * 100)));

  const bScoreEff = Math.min(100, Math.max(20, Math.round(((bEffGaming / Math.max(120, baseGpu.tdp_w)) / 18) * 100)));
  const cScoreEff = Math.min(100, Math.max(20, Math.round(((cEffGaming / Math.max(120, candGpu.tdp_w)) / 18) * 100)));

  const bScoreCB = Math.min(100, Math.max(15, baseGpu._myCBScore || 70));
  const cScoreCB = Math.min(100, Math.max(15, candGpu._myCBScore || 70));

  const bOverallPerf = Math.round(0.40 * bScoreGame + 0.25 * bScoreAI + 0.20 * bScoreTrain + 0.15 * bScoreTech);
  const cOverallPerf = Math.round(0.40 * cScoreGame + 0.25 * cScoreAI + 0.20 * cScoreTrain + 0.15 * cScoreTech);

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
    versusBarsEl.innerHTML = [
      renderComparisonBarHTML({
        title: 'Desempenho em Jogos (FPS Efetivo)',
        iconSvg: SPEEDOMETER_SVG,
        baseVal: bEffGaming,
        candVal: cEffGaming,
        baseLabel: `${bEffGaming} pts`,
        candLabel: `${cEffGaming} pts`,
        diffPct: rel.gamingGainPct
      }),
      renderComparisonBarHTML({
        title: 'Inferência de IA (LLMs Locais / tok/s 14B)',
        iconSvg: ROBOT_SVG,
        baseVal: baseGpu.llm_14b_tok_s || 5,
        candVal: candGpu.llm_14b_tok_s || 5,
        baseLabel: `${baseGpu.llm_14b_tok_s || 5} tok/s`,
        candLabel: `${candGpu.llm_14b_tok_s || 5} tok/s`,
        diffPct: rel.aiGainPct
      }),
      renderComparisonBarHTML({
        title: 'AI Training & Engenharia',
        iconSvg: CIRCUIT_SVG,
        baseVal: bTrainRaw,
        candVal: cTrainRaw,
        baseLabel: `${bTrainRaw} pts`,
        candLabel: `${cTrainRaw} pts`,
        diffPct: rel.softGainPct
      }),
      renderComparisonBarHTML({
        title: 'Investimento / Preço Hoje',
        iconSvg: MONEY_SVG,
        baseVal: basePrice,
        candVal: candPrice,
        baseLabel: fmtBRLShort(basePrice),
        candLabel: fmtBRLShort(candPrice),
        diffPct: ((candPrice / Math.max(1, basePrice)) - 1) * 100,
        isPrice: true
      }),
      renderComparisonBarHTML({
        title: 'Índice de Custo-Benefício',
        iconSvg: STAR_SVG,
        baseVal: bScoreCB,
        candVal: cScoreCB,
        baseLabel: `${bScoreCB}/100`,
        candLabel: `${cScoreCB}/100`,
        diffPct: ((cScoreCB / Math.max(1, bScoreCB)) - 1) * 100
      })
    ].join('');
  }

  // Render Hexagonal Radar Chart
  const radarCanvas = document.getElementById('chart-duel-radar');
  if (radarCanvas) {
    const radarCtx = radarCanvas.getContext('2d');
    if (chartDuelRadar) chartDuelRadar.destroy();

    chartDuelRadar = new Chart(radarCtx, {
      type: 'radar',
      data: {
        labels: ['Jogos (FPS)', 'Ray Tracing / Tech', 'Inferência IA', 'Treinamento & Redes', 'Eficiência (W)', 'Custo-Benefício'],
        datasets: [
          {
            label: baseGpu.name,
            data: [bScoreGame, bScoreTech, bScoreAI, bScoreTrain, bScoreEff, bScoreCB],
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
            label: candGpu.name,
            data: [cScoreGame, cScoreTech, cScoreAI, cScoreTrain, cScoreEff, cScoreCB],
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.25)',
            pointBackgroundColor: '#38bdf8',
            pointBorderColor: '#ffffff',
            pointHoverBackgroundColor: '#ffffff',
            pointHoverBorderColor: '#38bdf8',
            borderWidth: 2,
            pointRadius: 3
          }
        ]
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

  // Update Thermometer Labels & Marker Position
  document.getElementById('zone-lbl-1').textContent = `Até +${fmtBRLShort(rel.stealDelta)} (${candGpu.name} ≤ ${fmtBRLShort(basePrice + rel.stealDelta)})`;
  document.getElementById('zone-lbl-2').textContent = `Até +${fmtBRLShort(rel.fairMaxDelta)} (${candGpu.name} ≤ ${fmtBRLShort(basePrice + rel.fairMaxDelta)})`;
  document.getElementById('zone-lbl-3').textContent = `Até +${fmtBRLShort(rel.stretchMaxDelta)} (${candGpu.name} ≤ ${fmtBRLShort(basePrice + rel.stretchMaxDelta)})`;
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
            callback: v => 'R$ ' + v.toLocaleString('pt-BR')
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
    if (title) title.textContent = 'Mapa de Eficiência: Preço Atual (R$) vs Custo-Benefício (Índice 0–100)';
  } else {
    if (btnBenefit) btnBenefit.className = 'px-2.5 py-1 rounded text-xs font-medium transition text-slate-400 hover:text-slate-200';
    if (btnBench) btnBench.className = 'px-2.5 py-1 rounded text-xs font-semibold transition bg-sky-500/20 text-sky-300 border border-sky-500/30';
    if (title) title.textContent = 'Mapa de Eficiência: Preço Atual (R$) vs Desempenho Bruto (Score Contextual)';
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
  const search = (document.getElementById('cb-search').value || '').toLowerCase().trim();
  const brand = document.getElementById('cb-filter-brand').value;
  const minVram = parseInt(document.getElementById('cb-filter-vram').value) || 0;
  STATE.cbRelBaseSlug = document.getElementById('cb-filter-base-rel').value || 'rtx-5060';

  const baseGpu = DB.gpus.find(g => g.slug === STATE.cbRelBaseSlug) || DB.gpus[0];
  document.getElementById('th-rel-verdict').textContent = `Relação vs ${baseGpu.name}`;

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

  const basePrice = (baseGpu && baseGpu.price_brl) ? baseGpu.price_brl : 2000;
  const cols = STATE.cbColumns || { target: true, trend: false, hb_cb: false, rel_verdict: true, actions: true };
  const tbody = document.getElementById('cb-table-body');
  tbody.innerHTML = rows.map((g, idx) => {
    const rel = g.slug === baseGpu.slug
      ? { label: 'PLACA BASE', color: 'slate', actualDelta: 0, perfGainPct: 0, fairMaxDelta: 0 }
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
    const flashBadge = g._flashPromo ? `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-[10px]" title="${g._flashPromo.title}">⚡ FLASH −${fmtBRLShort(g._flashPromo.savings_vs_hb_brl)} vs HB (${g._flashPromo.age_hours}h)</span>` : '';
    const couponBadge = g.coupon
      ? `<button onclick="typeof copyCouponAndOpen === 'function' ? copyCouponAndOpen('${g.coupon}', '${g.offer_url}') : navigator.clipboard.writeText('${g.coupon}')" class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[10px] hover:bg-amber-500/40 transition cursor-pointer" title="Clique para copiar cupom e abrir a loja">🎟️ Cupom: ${g.coupon} 📋</button>`
      : '';

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
          ${g._flashPromo ? `<span class="text-[10px] text-slate-500 line-through block">HB: ${fmtBRLShort(g._hbPrice)}</span>` : ''}
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
          ${g.slug === baseGpu.slug ? `
            <div class="flex flex-col items-end gap-1 font-mono">
              <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold">100% BASE</span>
              <span class="text-[10px] text-slate-500">Referência</span>
            </div>
          ` : `
            <div class="space-y-1.5 w-52 ml-auto font-mono text-right">
              <!-- Top Row: Compact Badge + Small Justo Limit (No Overlap) -->
              <div class="flex items-center justify-between gap-1 text-[10px]">
                <span class="px-2 py-0.5 rounded font-black uppercase tracking-tight ${badgeMap[rel.color] || 'bg-slate-800 text-slate-300'}">
                  ${rel.tier === 'steal' ? 'PECHINCHA' : (rel.tier === 'fair' ? (rel.perfGainPct < 0 ? 'ECONOMIA' : 'VALE A PENA') : (rel.tier === 'stretch' ? 'ÁGIO ALTO' : 'NÃO COMPENSA'))}
                </span>
                <span class="text-[9px] text-slate-400 font-mono">(Justo ≤ +${fmtBRLShort(rel.fairMaxDelta)})</span>
              </div>

              <!-- Bar 1: Desempenho (Speedometer Icon Beside Bar) -->
              <div class="flex items-center gap-1.5">
                <span class="text-sky-400 shrink-0" title="Desempenho Relativo">${SPEEDOMETER_SVG}</span>
                <div class="h-2 flex-1 bg-slate-950 rounded-full relative overflow-hidden border border-slate-800" title="Desempenho: ${rel.perfGainPct >= 0 ? '+' : ''}${rel.perfGainPct.toFixed(0)}%">
                  <div class="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600/80 z-20"></div>
                  <div class="h-full rounded-full ${rel.perfGainPct >= 0 ? 'bg-gradient-to-r from-sky-400 to-emerald-400' : 'bg-rose-400'}" style="width: ${rel.perfGainPct >= 0 ? Math.min(100, 50 + Math.min(50, rel.perfGainPct * 0.7)).toFixed(1) : Math.max(10, 50 * Math.max(0.2, 1 + rel.perfGainPct / 100)).toFixed(1)}%;"></div>
                </div>
              </div>

              <!-- Bar 2: Preço / Investimento (Money Icon Beside Bar) -->
              <div class="flex items-center gap-1.5">
                <span class="text-emerald-400 shrink-0 font-bold font-mono text-xs" title="Diferença de Preço">${MONEY_SVG}</span>
                <div class="h-2 flex-1 bg-slate-950 rounded-full relative overflow-hidden border border-slate-800" title="Preço: ${rel.actualDelta >= 0 ? '+' : ''}${fmtBRLShort(rel.actualDelta)}">
                  <div class="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-600/80 z-20"></div>
                  <div class="h-full rounded-full ${rel.actualDelta <= 0 ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : (rel.actualDelta <= rel.fairMaxDelta ? 'bg-sky-400' : 'bg-amber-400')}" style="width: ${rel.actualDelta <= 0 ? Math.max(15, 50 - Math.min(45, (Math.abs(rel.actualDelta) / Math.max(1, basePrice)) * 50)).toFixed(1) : Math.min(100, 50 + Math.min(50, (rel.actualDelta / Math.max(1, basePrice)) * 50)).toFixed(1)}%;"></div>
                </div>
              </div>

              <!-- Bottom Row: Deltas Under Both Bars -->
              <div class="flex items-center justify-between text-[10px] text-slate-300 font-mono pt-0.5">
                <span class="font-bold ${rel.perfGainPct >= 0 ? 'text-sky-300' : 'text-rose-400'}">
                  ${rel.perfGainPct >= 0 ? '+' : ''}${rel.perfGainPct.toFixed(0)}% perf
                </span>
                <span class="font-bold ${rel.actualDelta <= rel.fairMaxDelta ? 'text-emerald-300' : 'text-amber-300'}">
                  ${rel.actualDelta >= 0 ? '+' : ''}${fmtBRLShort(rel.actualDelta)}
                </span>
              </div>
            </div>
          `}
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
          title: { display: true, text: 'Preço Atual (R$)', color: '#94a3b8' },
          ticks: { color: '#94a3b8', callback: v => 'R$ ' + v.toLocaleString('pt-BR') },
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

async function detectMyLocalPC(applyToBuild = true) {
  const banner = document.getElementById('detected-pc-summary');
  const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
  if (isStatic) {
    if (banner) banner.textContent = 'Modo Nuvem GitHub: Edite os componentes da sua máquina nos seletores abaixo ou use presets.';
    return;
  }
  banner.textContent = 'Consultando hardware local via API Windows (CIM/WMI)...';
  try {
    const res = await fetch('/api/my-pc');
    const info = await res.json();
    if (info && info.cpu_name) {
      const isLaptop = /H|U|P|Mobile|Iris/i.test(info.cpu_name + ' ' + (info.gpu_name || ''));
      banner.innerHTML = `
        <strong>CPU Local:</strong> ${info.cpu_name} (${info.cpu_cores}C/${info.cpu_threads}T) •
        <strong>Placa-Mãe:</strong> ${info.mobo_vendor} ${info.mobo_model} •
        <strong>RAM:</strong> ${info.ram_gb} GB (${info.ram_speed} MT/s) •
        <strong>GPU:</strong> ${info.gpu_name}
        ${isLaptop && !applyToBuild ? '<span class="ml-2 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]">Notebook detectado — mantendo preset Xeon E5-2680 v4 na Build</span>' : ''}
      `;
      if (applyToBuild || !isLaptop) {
        const isXeon = /xeon/i.test(info.cpu_name);
        const ramType = (info.ram_speed || 2400) >= 4400 ? 'DDR5' : 'DDR4';
        STATE.build.cpu = {
          slug: isXeon ? 'xeon-e5-2680-v4' : STATE.build.cpu.slug,
          name: `${info.cpu_name} (${info.cpu_cores}C/${info.cpu_threads}T)`,
          tdp: isXeon ? 120 : 95,
          price: 150,
          owned: true,
          benchmark: isXeon ? 2150 : 6500,
          socket: isXeon ? 'LGA2011-3' : STATE.build.cpu.socket
        };
        STATE.build.mobo = {
          slug: 'x99-p4-lga2011',
          name: `${info.mobo_vendor} ${info.mobo_model}`,
          tdp: 40,
          price: 280,
          owned: true,
          socket: isXeon ? 'LGA2011-3' : STATE.build.mobo.socket,
          memory_type: ramType
        };
        STATE.build.ram = {
          slug: 'ddr4-16gb-2400',
          name: `${info.ram_gb} GB ${ramType} ${info.ram_speed || 2400} MT/s`,
          tdp: 10,
          price: 210,
          owned: true,
          capacity_gb: info.ram_gb || 16,
          memory_type: ramType
        };
        renderPCBuilder();
      }
    }
  } catch (e) {
    banner.textContent = 'Não foi possível consultar automaticamente; edite os campos manualmente abaixo.';
  }
}

function renderPCBuilder() {
  const container = document.getElementById('builder-parts-container');

  const gpuOptions = DB.gpus.map(g =>
    `<option value="${g.slug}" ${STATE.build.gpu.slug === g.slug ? 'selected' : ''}>${g.name} (${g.vram_gb}GB) — ${fmtBRL(g.price_brl)} [${g.tdp_w}W]</option>`
  ).join('');

  const cpuOptions = DB.cpus.map(c =>
    `<option value="${c.slug}" ${STATE.build.cpu.slug === c.slug ? 'selected' : ''}>${c.name} (${c.socket}) — ${fmtBRL(c.price_brl)} [${c.tdp_w}W]</option>`
  ).join('');

  const moboOptions = DB.motherboards.map(m =>
    `<option value="${m.slug}" ${STATE.build.mobo.slug === m.slug ? 'selected' : ''}>${m.name} (${m.socket}/${m.memory_type}) — ${fmtBRL(m.price_brl)}</option>`
  ).join('');

  const ramOptions = DB.rams.slice(0, 45).map(r =>
    `<option value="${r.slug}" ${STATE.build.ram.slug === r.slug ? 'selected' : ''}>${r.name} — ${fmtBRL(r.price_brl)}</option>`
  ).join('');

  const psuOptions = DB.psus.slice(0, 60).map(p =>
    `<option value="${p.slug}" ${STATE.build.psu.slug === p.slug ? 'selected' : ''}>${p.name} (${p.watts}W) — ${fmtBRL(p.price_brl)}</option>`
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
        <input type="text" value="${STATE.build.gpu.name}" oninput="updateBuildField('gpu', 'name', this.value)" class="w-full bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300" placeholder="Nome customizado da GPU" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">TDP / Consumo (W)</label>
        <input type="number" value="${STATE.build.gpu.tdp}" oninput="updateBuildField('gpu', 'tdp', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-400" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (R$)</label>
        <input type="number" value="${STATE.build.gpu.price}" oninput="updateBuildField('gpu', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${STATE.build.gpu.owned ? 'checked' : ''} onchange="updateBuildField('gpu', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
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
        <input type="text" value="${STATE.build.cpu.name}" oninput="updateBuildField('cpu', 'name', this.value)" class="w-full bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">TDP / Consumo (W)</label>
        <input type="number" value="${STATE.build.cpu.tdp}" oninput="updateBuildField('cpu', 'tdp', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-400" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (R$)</label>
        <input type="number" value="${STATE.build.cpu.price}" oninput="updateBuildField('cpu', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${STATE.build.cpu.owned ? 'checked' : ''} onchange="updateBuildField('cpu', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
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
        <input type="text" value="${STATE.build.mobo.name}" oninput="updateBuildField('mobo', 'name', this.value)" class="w-full bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Consumo (W)</label>
        <input type="number" value="${STATE.build.mobo.tdp}" oninput="updateBuildField('mobo', 'tdp', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-400" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (R$)</label>
        <input type="number" value="${STATE.build.mobo.price}" oninput="updateBuildField('mobo', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${STATE.build.mobo.owned ? 'checked' : ''} onchange="updateBuildField('mobo', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
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
        <input type="text" value="${STATE.build.ram.name}" oninput="updateBuildField('ram', 'name', this.value)" class="w-full bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Consumo (W)</label>
        <input type="number" value="${STATE.build.ram.tdp}" oninput="updateBuildField('ram', 'tdp', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-400" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (R$)</label>
        <input type="number" value="${STATE.build.ram.price}" oninput="updateBuildField('ram', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${STATE.build.ram.owned ? 'checked' : ''} onchange="updateBuildField('ram', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
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
        <input type="text" value="${STATE.build.psu.name}" oninput="updateBuildField('psu', 'name', this.value)" class="w-full bg-slate-950/60 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-amber-300 block">Potência Fonte (W)</label>
        <input type="number" value="${STATE.build.psu.watts}" oninput="updateBuildField('psu', 'watts', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-amber-500/50 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-300" step="50" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (R$)</label>
        <input type="number" value="${STATE.build.psu.price}" oninput="updateBuildField('psu', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${STATE.build.psu.owned ? 'checked' : ''} onchange="updateBuildField('psu', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
      </div>
    </div>

    <!-- STORAGE & COOLING ROW -->
    <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
      <div class="md:col-span-2">
        <span class="text-[10px] font-mono uppercase text-slate-400 font-bold block">SSD, Cooler & Fans</span>
        <span class="text-xs text-slate-300 font-semibold">Restante do Setup</span>
      </div>
      <div class="md:col-span-5">
        <input type="text" value="${STATE.build.storage.name}" oninput="updateBuildField('storage', 'name', this.value)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Consumo (W)</label>
        <input type="number" value="${STATE.build.storage.tdp + STATE.build.cooling.tdp}" oninput="updateBuildField('storage', 'tdp', parseFloat(this.value)||0); STATE.build.cooling.tdp=0;" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-amber-400" />
      </div>
      <div class="md:col-span-2">
        <label class="text-[10px] font-mono text-slate-400 block">Preço (R$)</label>
        <input type="number" value="${STATE.build.storage.price}" oninput="updateBuildField('storage', 'price', parseFloat(this.value)||0)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-emerald-400" step="50" />
      </div>
      <div class="md:col-span-1 flex flex-col items-center">
        <label class="text-[10px] font-mono text-slate-400 mb-1">Já Tenho?</label>
        <input type="checkbox" ${STATE.build.storage.owned ? 'checked' : ''} onchange="updateBuildField('storage', 'owned', this.checked)" class="w-4 h-4 accent-emerald-500 cursor-pointer" />
      </div>
    </div>
  `;

  updateBuilderPowerAndDiagnostics();
}

function onBuilderCatalogPick(partKey, slug) {
  if (partKey === 'gpu') {
    const g = DB.gpus.find(x => x.slug === slug);
    if (g) STATE.build.gpu = { slug: g.slug, name: `${g.name} (${g.vram_gb}GB)`, tdp: g.tdp_w, price: g.price_brl, owned: STATE.build.gpu.owned };
  } else if (partKey === 'cpu') {
    const c = DB.cpus.find(x => x.slug === slug);
    if (c) {
      STATE.build.cpu = { slug: c.slug, name: c.name, tdp: c.tdp_w, price: c.price_brl, owned: STATE.build.cpu.owned, benchmark: c.benchmark, socket: c.socket };
      const simCpuSel = document.getElementById('sim-select-cpu');
      if (simCpuSel) simCpuSel.value = c.slug;
    }
  } else if (partKey === 'mobo') {
    const m = DB.motherboards.find(x => x.slug === slug);
    if (m) STATE.build.mobo = { slug: m.slug, name: m.name, tdp: m.tdp_w, price: m.price_brl, owned: STATE.build.mobo.owned, socket: m.socket, memory_type: m.memory_type };
  } else if (partKey === 'ram') {
    const r = DB.rams.find(x => x.slug === slug);
    if (r) STATE.build.ram = { slug: r.slug, name: r.name, tdp: r.tdp_w, price: r.price_brl, owned: STATE.build.ram.owned, capacity_gb: r.capacity_gb, memory_type: r.memory_type };
  } else if (partKey === 'psu') {
    const p = DB.psus.find(x => x.slug === slug);
    if (p) STATE.build.psu = { slug: p.slug, name: p.name, watts: p.watts, price: p.price_brl, owned: STATE.build.psu.owned };
  }
  renderPCBuilder();
}

function updateBuildField(partKey, field, value) {
  STATE.build[partKey][field] = value;
  updateBuilderPowerAndDiagnostics();
}

function updateBuilderPowerAndDiagnostics() {
  const b = STATE.build;
  const typicalLoad = Math.round((b.gpu.tdp || 0) + (b.cpu.tdp || 0) + (b.mobo.tdp || 0) + (b.ram.tdp || 0) + (b.storage.tdp || 0) + (b.cooling.tdp || 0));
  // Modern GPUs have 15-25% transient power spikes; recommended PSU should keep typical load around ~70-75%
  const peakTransient = Math.round(typicalLoad * 1.18);
  const recommendedPSU = Math.ceil((typicalLoad * 1.35) / 50) * 50;

  const psuWatts = b.psu.watts || 500;
  const loadPct = Math.round((typicalLoad / Math.max(1, psuWatts)) * 100);

  document.getElementById('pwr-typical-val').textContent = `${typicalLoad}W`;
  document.getElementById('pwr-peak-val').textContent = `${peakTransient}W`;
  document.getElementById('pwr-rec-val').textContent = `${recommendedPSU}W`;
  document.getElementById('pwr-psu-watts').textContent = `${psuWatts}W`;
  document.getElementById('pwr-load-pct').textContent = `${loadPct}%`;

  const bar = document.getElementById('pwr-load-bar');
  const pill = document.getElementById('power-status-pill');
  const advice = document.getElementById('pwr-advice-text');

  bar.style.width = `${Math.min(100, loadPct)}%`;
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

  // Recommend top 3 PSUs from Hardware Barato that meet recommendedPSU
  const recPsus = DB.psus
    .filter(p => p.watts >= recommendedPSU && p.price_brl > 150)
    .sort((a, b) => a.price_brl - b.price_brl)
    .slice(0, 3);

  document.getElementById('pwr-recommended-psus').innerHTML = recPsus.map(p => `
    <div class="flex items-center justify-between bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
      <div>
        <span class="font-semibold text-white">${p.name}</span>
        <span class="text-[10px] font-mono text-amber-300 ml-1">(${p.watts}W)</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="font-mono font-bold text-emerald-400">${fmtBRL(p.price_brl)}</span>
        <button onclick="onBuilderCatalogPick('psu', '${p.slug}')" class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500 hover:text-slate-950 text-[10px] font-bold cursor-pointer">Usar</button>
      </div>
    </div>
  `).join('');

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

  // Compatibility & Bottleneck Diagnostics
  const diags = [];
  const gpuObj = DB.gpus.find(g => g.slug === b.gpu.slug) || DB.gpus[0];
  const cpuBench = b.cpu.benchmark || 2500;

  if (b.cpu.slug === 'xeon-e5-2680-v4' && gpuObj && gpuObj.gaming_score >= 3000) {
    diags.push(`
      <div class="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200">
        <strong>⚠️ Alerta de Gargalo em Jogos (1080p):</strong> Seu <strong>Xeon E5-2680 v4</strong> tem 14 núcleos ótimos para multitarefa, mas o clock single-core (2.4–3.3 GHz) e PCIe 3.0 limitam GPUs fortes como a <strong>${gpuObj.name}</strong> em ~22% no 1080p. Em <strong>1440p/4K ou IA Local (LLMs)</strong>, o gargalo cai bastante pois a carga fica na GPU!
      </div>
    `);
  }

  if ((b.ram.capacity_gb || 16) <= 16 && (STATE.wAI >= 25 || STATE.wSoft >= 20)) {
    diags.push(`
      <div class="p-3 rounded-xl bg-purple-950/40 border border-purple-500/40 text-xs text-purple-200">
        <strong>🧠 Alerta Crítico de RAM p/ AI Training, Ethernet & OpenDSS:</strong> Você está com <strong>${b.ram.capacity_gb || 16} GB de RAM</strong>. Como o seu <strong>Xeon E5-2680 v4 (14C/28T)</strong> é excelente para rodar 20+ processos paralelos de <strong>OpenDSS</strong>, captura de <strong>frames Ethernet/PCAP em ring-buffers</strong> e ambientes <strong>AI Training + Inferência Local</strong>, 16 GB vai esgotar rápido. Subir para <strong>32 GB ou 64 GB DDR4 Quad-Channel na sua X99-P4</strong> dará um salto massivo de throughput!
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
      note: `No seu Xeon E5-2680 v4 (14C/28T), rode 24+ processos paralelos alimentando tensores na GPU`
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

// Refresh Live Data from Hardware Barato via Backend API
async function refreshHardwareBarato() {
  const btn = document.getElementById('btn-refresh-hb');
  const icon = document.getElementById('icon-refresh');
  const status = document.getElementById('header-status');
  btn.disabled = true;
  icon.classList.add('animate-spin');
  status.textContent = 'Sincronizando preços e históricos ao vivo de hardwarebarato.com...';

  try {
    let data = null;
    const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    if (!isStatic) {
      try {
        const res = await fetch('/api/refresh', { method: 'POST' });
        if (res.ok) data = await res.json();
      } catch (_) {}
    }
    if (!data || !data.ok) {
      const res = await fetch('data/hardware_db.json?t=' + Date.now());
      if (res.ok) {
        const db = await res.json();
        data = { ok: true, db, from_static: true };
      }
    }
    if (data && data.ok && data.db) {
      DB = data.db;
      enrichGPUsWithContextualMetrics();
      populateSelectors();
      renderActiveTab();
      if (data.from_static) {
        status.textContent = `Atualizado da base Nuvem GitHub em ${DB.updated_at} (${DB.gpus.length} GPUs monitoradas)`;
      } else {
        status.textContent = `Atualizado ao vivo de HardwareBarato.com em ${DB.updated_at} (${DB.gpus.length} GPUs monitoradas)`;
      }
    }
  } catch (e) {
    status.textContent = 'Erro ao atualizar ao vivo. Usando banco local.';
  } finally {
    btn.disabled = false;
    icon.classList.remove('animate-spin');
  }
}

// Initial Boot
async function initApp() {
  // Slider / number box handlers are wired inline in index.html
  if (typeof loadUserPrefs === 'function') loadUserPrefs();

  try {
    let res;
    const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    if (!isStatic) {
      try {
        res = await fetch('/api/hardware');
        if (!res.ok) throw new Error('api down');
      } catch (_) {
        res = await fetch('data/hardware_db.json');
      }
    } else {
      res = await fetch('data/hardware_db.json');
    }
    DB = await res.json();
    document.getElementById('header-status').textContent =
      `Dados sincronizados de HardwareBarato.com em ${DB.updated_at} • ${DB.gpus.length} GPUs com histórico de até 600 dias`;

    enrichGPUsWithContextualMetrics();
    updateTopContextSummary();
    populateSelectors();
    renderDuelAnalysis();
    renderPCBuilder();
    detectMyLocalPC(false);
    if (typeof scanLivePromos === 'function') scanLivePromos(false);

    document.addEventListener('click', (e) => {
      const menu = document.getElementById('cb-col-menu');
      const wrapper = document.getElementById('cb-col-menu-wrapper');
      if (menu && !menu.classList.contains('hidden') && wrapper && !wrapper.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });
  } catch (e) {
    console.error('Failed to load DB:', e);
    document.getElementById('header-status').textContent = 'Erro ao carregar dados. Execute iniciar_app.bat para iniciar o servidor.';
  }
}

window.addEventListener('DOMContentLoaded', initApp);
