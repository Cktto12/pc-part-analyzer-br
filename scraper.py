"""
Data Enrichment & Hardware Barato Live Scraper for Site Analyze Builds.
Fetches live GPUs, CPUs, RAM, Motherboards, PSUs, and daily price histories from hardwarebarato.com,
cleans outlier glitches, enriches GPUs with AI/VRAM/Bandwidth/FPS/Software specs, and saves to data/hardware_db.json.
"""
import os
import sys
import urllib.request
import re
import json
import statistics
import concurrent.futures
from datetime import datetime

try:
    from config import get_market_config
except Exception:
    get_market_config = None

def get_catalog_base_url():
    if get_market_config:
        try:
            cfg = get_market_config()
            db_settings = cfg.get("database_source_settings", {})
            return (db_settings.get("catalog_base_url") or 'https://www.hardwarebarato.com').rstrip('/')
        except Exception:
            pass
    return 'https://www.hardwarebarato.com'

sys.stdout.reconfigure(encoding='utf-8')

# Detailed architectural & AI metadata for all 57 GPUs on Hardware Barato
# vram: GB, bw: Memory Bandwidth (GB/s), bus: bit, gen: generation label,
# tensor: AI architecture multiplier (CUDA/Tensor vs ROCm vs XMX)
GPU_SPECS = {
    # NVIDIA RTX 50 Series (Blackwell - GDDR7, FP4/FP8 Tensor, DLSS 4)
    "rtx-5090":         {"vram": 32, "bw": 1792, "bus": 512, "type": "GDDR7", "brand": "NVIDIA", "arch": "Blackwell", "ai_mult": 1.35, "fp16_tflops": 209.5},
    "rtx-5080":         {"vram": 16, "bw": 960,  "bus": 256, "type": "GDDR7", "brand": "NVIDIA", "arch": "Blackwell", "ai_mult": 1.30, "fp16_tflops": 112.7},
    "rtx-5070-ti":      {"vram": 16, "bw": 896,  "bus": 256, "type": "GDDR7", "brand": "NVIDIA", "arch": "Blackwell", "ai_mult": 1.28, "fp16_tflops": 87.9},
    "rtx-5070":         {"vram": 12, "bw": 672,  "bus": 192, "type": "GDDR7", "brand": "NVIDIA", "arch": "Blackwell", "ai_mult": 1.25, "fp16_tflops": 61.7},
    "rtx-5060-ti-16gb": {"vram": 16, "bw": 448,  "bus": 128, "type": "GDDR7", "brand": "NVIDIA", "arch": "Blackwell", "ai_mult": 1.25, "fp16_tflops": 44.0},
    "rtx-5060-ti-8gb":  {"vram": 8,  "bw": 448,  "bus": 128, "type": "GDDR7", "brand": "NVIDIA", "arch": "Blackwell", "ai_mult": 1.22, "fp16_tflops": 44.0},
    "rtx-5060":         {"vram": 8,  "bw": 448,  "bus": 128, "type": "GDDR7", "brand": "NVIDIA", "arch": "Blackwell", "ai_mult": 1.20, "fp16_tflops": 38.0},
    "rtx-5050":         {"vram": 8,  "bw": 320,  "bus": 128, "type": "GDDR6", "brand": "NVIDIA", "arch": "Blackwell", "ai_mult": 1.18, "fp16_tflops": 28.0},

    # NVIDIA RTX 40 Series (Ada Lovelace - FP8 Tensor, DLSS 3)
    "rtx-4080-super":   {"vram": 16, "bw": 736,  "bus": 256, "type": "GDDR6X", "brand": "NVIDIA", "arch": "Ada Lovelace", "ai_mult": 1.25, "fp16_tflops": 104.5},
    "rtx-4080":         {"vram": 16, "bw": 717,  "bus": 256, "type": "GDDR6X", "brand": "NVIDIA", "arch": "Ada Lovelace", "ai_mult": 1.25, "fp16_tflops": 97.5},
    "rtx-4070-ti":      {"vram": 12, "bw": 504,  "bus": 192, "type": "GDDR6X", "brand": "NVIDIA", "arch": "Ada Lovelace", "ai_mult": 1.22, "fp16_tflops": 80.2},
    "rtx-4070":         {"vram": 12, "bw": 504,  "bus": 192, "type": "GDDR6X", "brand": "NVIDIA", "arch": "Ada Lovelace", "ai_mult": 1.22, "fp16_tflops": 58.3},
    "rtx-4060-ti-8gb":  {"vram": 8,  "bw": 288,  "bus": 128, "type": "GDDR6",  "brand": "NVIDIA", "arch": "Ada Lovelace", "ai_mult": 1.18, "fp16_tflops": 44.1},
    "rtx-4060":         {"vram": 8,  "bw": 272,  "bus": 128, "type": "GDDR6",  "brand": "NVIDIA", "arch": "Ada Lovelace", "ai_mult": 1.18, "fp16_tflops": 30.3},

    # NVIDIA RTX 30 Series (Ampere - CUDA + 3rd Gen Tensor)
    "rtx-3090-ti":      {"vram": 24, "bw": 1008, "bus": 384, "type": "GDDR6X", "brand": "NVIDIA", "arch": "Ampere", "ai_mult": 1.20, "fp16_tflops": 80.0},
    "rtx-3080-ti":      {"vram": 12, "bw": 912,  "bus": 384, "type": "GDDR6X", "brand": "NVIDIA", "arch": "Ampere", "ai_mult": 1.18, "fp16_tflops": 68.2},
    "rtx-3080-12gb":    {"vram": 12, "bw": 912,  "bus": 384, "type": "GDDR6X", "brand": "NVIDIA", "arch": "Ampere", "ai_mult": 1.18, "fp16_tflops": 61.2},
    "rtx-3080-10gb":    {"vram": 10, "bw": 760,  "bus": 320, "type": "GDDR6X", "brand": "NVIDIA", "arch": "Ampere", "ai_mult": 1.15, "fp16_tflops": 59.6},
    "rtx-3070-ti":      {"vram": 8,  "bw": 608,  "bus": 256, "type": "GDDR6X", "brand": "NVIDIA", "arch": "Ampere", "ai_mult": 1.15, "fp16_tflops": 43.5},
    "rtx-3070":         {"vram": 8,  "bw": 448,  "bus": 256, "type": "GDDR6",  "brand": "NVIDIA", "arch": "Ampere", "ai_mult": 1.15, "fp16_tflops": 40.6},
    "rtx-3060-ti":      {"vram": 8,  "bw": 448,  "bus": 256, "type": "GDDR6",  "brand": "NVIDIA", "arch": "Ampere", "ai_mult": 1.15, "fp16_tflops": 32.4},
    "rtx-3060-12gb":    {"vram": 12, "bw": 360,  "bus": 192, "type": "GDDR6",  "brand": "NVIDIA", "arch": "Ampere", "ai_mult": 1.18, "fp16_tflops": 25.4},
    "rtx-3060-8gb":     {"vram": 8,  "bw": 240,  "bus": 128, "type": "GDDR6",  "brand": "NVIDIA", "arch": "Ampere", "ai_mult": 1.12, "fp16_tflops": 25.4},
    "rtx-3050-8gb":     {"vram": 8,  "bw": 224,  "bus": 128, "type": "GDDR6",  "brand": "NVIDIA", "arch": "Ampere", "ai_mult": 1.10, "fp16_tflops": 18.2},
    "rtx-3050-6gb":     {"vram": 6,  "bw": 168,  "bus": 96,  "type": "GDDR6",  "brand": "NVIDIA", "arch": "Ampere", "ai_mult": 1.05, "fp16_tflops": 13.6},

    # NVIDIA RTX 20 Series (Turing)
    "rtx-2070":         {"vram": 8,  "bw": 448,  "bus": 256, "type": "GDDR6",  "brand": "NVIDIA", "arch": "Turing", "ai_mult": 1.05, "fp16_tflops": 14.9},
    "rtx-2060-super":   {"vram": 8,  "bw": 448,  "bus": 256, "type": "GDDR6",  "brand": "NVIDIA", "arch": "Turing", "ai_mult": 1.05, "fp16_tflops": 14.4},
    "rtx-2060-12gb":    {"vram": 12, "bw": 336,  "bus": 192, "type": "GDDR6",  "brand": "NVIDIA", "arch": "Turing", "ai_mult": 1.08, "fp16_tflops": 14.2},
    "rtx-2060-6gb":     {"vram": 6,  "bw": 336,  "bus": 192, "type": "GDDR6",  "brand": "NVIDIA", "arch": "Turing", "ai_mult": 1.00, "fp16_tflops": 12.9},

    # AMD RX 9000 Series (RDNA 4 - FSR 4, Improved AI Matrix)
    "rx-9070-xt":       {"vram": 16, "bw": 640,  "bus": 256, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 4", "ai_mult": 0.92, "fp16_tflops": 97.3},
    "rx-9070":          {"vram": 16, "bw": 640,  "bus": 256, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 4", "ai_mult": 0.92, "fp16_tflops": 72.3},
    "rx-9070-gre":      {"vram": 12, "bw": 432,  "bus": 192, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 4", "ai_mult": 0.90, "fp16_tflops": 60.0},
    "rx-9060-xt-16gb":  {"vram": 16, "bw": 320,  "bus": 128, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 4", "ai_mult": 0.90, "fp16_tflops": 45.0},
    "rx-9060-xt-8gb":   {"vram": 8,  "bw": 320,  "bus": 128, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 4", "ai_mult": 0.88, "fp16_tflops": 45.0},
    "rx-9050-8gb":      {"vram": 8,  "bw": 256,  "bus": 128, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 4", "ai_mult": 0.85, "fp16_tflops": 24.0},

    # AMD RX 7000 Series (RDNA 3)
    "rx-7900-xtx":      {"vram": 24, "bw": 960,  "bus": 384, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 3", "ai_mult": 0.88, "fp16_tflops": 122.8},
    "rx-7900-gre":      {"vram": 16, "bw": 576,  "bus": 256, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 3", "ai_mult": 0.85, "fp16_tflops": 91.9},
    "rx-7800-xt":       {"vram": 16, "bw": 624,  "bus": 256, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 3", "ai_mult": 0.85, "fp16_tflops": 74.6},
    "rx-7700-xt":       {"vram": 12, "bw": 432,  "bus": 192, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 3", "ai_mult": 0.84, "fp16_tflops": 70.4},
    "rx-7600-xt":       {"vram": 16, "bw": 288,  "bus": 128, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 3", "ai_mult": 0.85, "fp16_tflops": 45.1},
    "rx-7650-gre":      {"vram": 8,  "bw": 288,  "bus": 128, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 3", "ai_mult": 0.82, "fp16_tflops": 43.5},
    "rx-7600":          {"vram": 8,  "bw": 288,  "bus": 128, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 3", "ai_mult": 0.82, "fp16_tflops": 43.5},

    # AMD RX 6000 & 5000 Series (RDNA 2 / RDNA 1)
    "rx-6800-xt":       {"vram": 16, "bw": 512,  "bus": 256, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 2", "ai_mult": 0.78, "fp16_tflops": 41.5},
    "rx-6750-xt":       {"vram": 12, "bw": 432,  "bus": 192, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 2", "ai_mult": 0.76, "fp16_tflops": 26.5},
    "rx-6700-xt":       {"vram": 12, "bw": 384,  "bus": 192, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 2", "ai_mult": 0.76, "fp16_tflops": 26.4},
    "rx-6600-xt":       {"vram": 8,  "bw": 256,  "bus": 128, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 2", "ai_mult": 0.74, "fp16_tflops": 21.2},
    "rx-6600":          {"vram": 8,  "bw": 224,  "bus": 128, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 2", "ai_mult": 0.74, "fp16_tflops": 17.9},
    "rx-6500-xt-8gb":   {"vram": 8,  "bw": 144,  "bus": 64,  "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 2", "ai_mult": 0.65, "fp16_tflops": 11.5},
    "rx-6500-xt-4gb":   {"vram": 4,  "bw": 144,  "bus": 64,  "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 2", "ai_mult": 0.50, "fp16_tflops": 11.5},
    "rx-6400":          {"vram": 4,  "bw": 128,  "bus": 64,  "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 2", "ai_mult": 0.45, "fp16_tflops": 7.1},
    "rx-5600-xt":       {"vram": 6,  "bw": 336,  "bus": 192, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 1", "ai_mult": 0.60, "fp16_tflops": 14.4},
    "rx-5600":          {"vram": 6,  "bw": 288,  "bus": 192, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 1", "ai_mult": 0.60, "fp16_tflops": 12.6},
    "rx-5500-xt":       {"vram": 8,  "bw": 224,  "bus": 128, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 1", "ai_mult": 0.60, "fp16_tflops": 10.4},
    "rx-5500":          {"vram": 4,  "bw": 224,  "bus": 128, "type": "GDDR6",  "brand": "AMD",    "arch": "RDNA 1", "ai_mult": 0.50, "fp16_tflops": 10.4},

    # Intel Arc (Battlemage & Alchemist - XMX Engines)
    "arc-b580":         {"vram": 12, "bw": 456,  "bus": 192, "type": "GDDR6",  "brand": "Intel",  "arch": "Battlemage", "ai_mult": 0.96, "fp16_tflops": 46.0},
    "arc-b570":         {"vram": 10, "bw": 380,  "bus": 160, "type": "GDDR6",  "brand": "Intel",  "arch": "Battlemage", "ai_mult": 0.94, "fp16_tflops": 38.0},
    "arc-a380":         {"vram": 6,  "bw": 186,  "bus": 96,  "type": "GDDR6",  "brand": "Intel",  "arch": "Alchemist",  "ai_mult": 0.80, "fp16_tflops": 8.2},

    # Legacy Reference Baseline (User's Current GPU)
    "rx-580-8gb-ref":   {"vram": 8,  "bw": 224,  "bus": 256, "type": "GDDR5",  "brand": "AMD",    "arch": "Polaris (Sua GPU Atual)", "ai_mult": 0.45, "fp16_tflops": 6.2},
}

def compute_ai_and_software_scores(slug, bench, spec):
    """
    Computes:
    - gaming_score: normalized gaming score (RTX 5060 = 100 base or raw benchmark)
    - ai_score: heavily weighted by VRAM capacity (non-linear tiers for LLM fitting), Memory Bandwidth (token/s speed), and CUDA/Tensor support.
    - software_score: weighted by compute, VRAM, and encoder/CUDA support (Blender, Premiere, DaVinci, CAD).
    - llm_tok_s: estimated tokens/sec on Llama-3 8B Q4_K_M (~5.5GB VRAM) and 14B Q4_K_M (~9.5GB VRAM) and 32B Q4_K_M (~19GB VRAM).
    """
    vram = spec["vram"]
    bw = spec["bw"]
    ai_mult = spec["ai_mult"]
    brand = spec["brand"]
    fp16 = spec["fp16_tflops"]

    if not bench:
        bench = int(fp16 * 65)

    # 1. VRAM Tier Value for AI (Hefty value for RAM in AI applications!)
    # <6GB: almost unusable for modern local LLMs / Flux / SDXL (penalty)
    # 8GB: runs 7B-8B Q4 models, tight for SDXL/Flux or larger context
    # 10GB: comfortable 8B + context, basic 12B
    # 12GB: sweet spot for 12B-14B Q4 models, SDXL, Lora training
    # 16GB: huge step up — runs 14B Q6/Q8, 22B-24B Q4, Flux Dev, video gen
    # 24GB+: enthusiast AI workstation — 32B-70B Q4, full fine-tuning
    vram_ai_points = {
        4: 250,
        6: 550,
        8: 1200,
        10: 1750,
        12: 2600,
        16: 4200,
        24: 6800,
        32: 9500
    }.get(vram, vram * 220)

    # Bandwidth drives LLM token generation speed (tokens/s ~ bandwidth / model_size)
    bw_points = bw * 3.8

    # Compute & Tensor core points
    compute_points = (bench * 0.45) * ai_mult

    # Total AI Score (calibrated roughly on the same scale as gaming benchmark 1000-14000)
    ai_score = int((vram_ai_points * 0.48 + bw_points * 0.30 + compute_points * 0.22) * ai_mult)

    # Software / Workstation / Engineering Score (Digital Twins, OpenDSS / Power Grid Co-Simulation, Ethernet Frame / PCAP GPU Data Processing, Omniverse/USD, Blender, CAD)
    # Heavily depends on CUDA / CuPy / RAPIDS / PhysX / OptiX ecosystem: NVIDIA has massive native advantage over AMD/Intel for scientific computing & digital twins
    cuda_eng_bonus = 1.42 if brand == "NVIDIA" else (0.95 if brand == "Intel" else 0.72)
    software_score = int((bench * 0.50 + vram * 165 + bw * 2.2 + fp16 * 18) * cuda_eng_bonus)

    # Local Inference Score: combines actual LLM token/s throughput (8B + 14B + 32B) + KV-cache/VRAM headroom + Tensor FP16/FP8/FP4
    # On 8GB VRAM, 14B models spill into system RAM (PCIe bottleneck ~8 tok/s vs ~48+ tok/s on 12GB+), so local inference must directly penalize 8GB and reward 12GB/16GB+ and high memory bandwidth
    if vram < 6:
        tok_8b = 0
    elif vram == 6:
        tok_8b = round((bw / 5.8) * 0.45 * ai_mult, 1)
    else:
        tok_8b = round((bw / 5.5) * 0.68 * ai_mult, 1)

    # 14B Q4 (~9.0 GB): fits in >= 10GB VRAM (offloads to system RAM on 8GB = 5x-6x slower!)
    if vram >= 12:
        tok_14b = round((bw / 9.2) * 0.66 * ai_mult, 1)
    elif vram == 10:
        tok_14b = round((bw / 9.2) * 0.50 * ai_mult, 1)
    elif vram == 8:
        tok_14b = round(7.5 * ai_mult, 1)  # Partial CPU/RAM offload bottleneck over PCIe
    else:
        tok_14b = 0

    # 32B Q4 (~18.5 GB): fits in >= 24GB VRAM (partial offload on 16GB)
    if vram >= 24:
        tok_32b = round((bw / 19.0) * 0.65 * ai_mult, 1)
    elif vram == 16:
        tok_32b = round(11.5 * ai_mult, 1)  # Partial offload with 16GB fits ~85% of layers
    else:
        tok_32b = 0

    # Direct Local Inference Throughput Score (used in the calculus!)
    local_inf_score = int(
        (tok_8b * 18) +
        (tok_14b * 48) +
        (tok_32b * 55) +
        (vram_ai_points * 0.55) +
        (fp16 * 12 * ai_mult)
    )

    # Total AI & Local Inference Score
    ai_score = int(local_inf_score * 0.65 + (vram_ai_points * 0.48 + bw_points * 0.30 + compute_points * 0.22) * ai_mult * 0.35)

    return {
        "gaming_score": bench,
        "ai_score": ai_score,
        "local_inf_score": local_inf_score,
        "software_score": software_score,
        "llm_8b_tok_s": tok_8b,
        "llm_14b_tok_s": tok_14b,
        "llm_32b_tok_s": tok_32b,
    }

def fetch_json_arrays(path):
    url = get_catalog_base_url() + path
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', errors='ignore')
    pushes = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', html, re.DOTALL)
    unescaped = "".join(pushes).replace('\\"', '"').replace('\\\\', '\\')
    arrays = []
    for m in re.finditer(r'\[\{"slug":', unescaped):
        start = m.start()
        depth = 0
        end = -1
        for i in range(start, len(unescaped)):
            if unescaped[i] == '[': depth += 1
            elif unescaped[i] == ']':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end != -1:
            try:
                arr = json.loads(unescaped[start:end])
                arrays.append(arr)
            except Exception:
                pass
    return unescaped, arrays

def safe_price(val, default=0.0):
    if isinstance(val, (int, float)):
        return float(val) / 100.0
    return default

def fetch_gpu_detail(gpu_item):
    slug = gpu_item['slug']
    lp = gpu_item.get('lowestPrice') or {}
    coupon = lp.get('coupon')
    reg_price = safe_price(lp.get('price'), 0.0)
    current_price = safe_price(coupon.get('price') if isinstance(coupon, dict) else None, reg_price)
    if current_price <= 0:
        current_price = reg_price
    inst_base = safe_price(lp.get('installmentPrice'), reg_price)
    inst_price = safe_price(coupon.get('installmentPrice') if isinstance(coupon, dict) else None, inst_base)

    history = []
    offers = []
    scraped_vram = None
    try:
        url = f'https://www.hardwarebarato.com/produtos/placas-de-video/{slug}'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', errors='ignore')
        pushes = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', html, re.DOTALL)
        unescaped = "".join(pushes).replace('\\"', '"').replace('\\\\', '\\')

        vram_match = re.search(r'"(\d+)\s*GB\s*VRAM"', unescaped, re.IGNORECASE)
        if vram_match:
            scraped_vram = int(vram_match.group(1))

        hist_idx = unescaped.find('"dailyMinPrices":')
        if hist_idx != -1:
            arr_start = unescaped.find('[', hist_idx)
            depth = 0
            arr_end = -1
            for i in range(arr_start, len(unescaped)):
                if unescaped[i] == '[': depth += 1
                elif unescaped[i] == ']':
                    depth -= 1
                    if depth == 0:
                        arr_end = i + 1
                        break
            if arr_end != -1:
                raw_hist = json.loads(unescaped[arr_start:arr_end])
                # Filter out obvious store price glitches (< 35% of current_price or < R$ 400)
                floor_valid = max(400.0, current_price * 0.38)
                seen_dates = set()
                for h in raw_hist:
                    date_str = h.get('addedAt', '').replace('$D', '')[:10]
                    p = safe_price(h.get('price'), 0.0)
                    if date_str and p >= floor_valid and date_str not in seen_dates:
                        seen_dates.add(date_str)
                        history.append({
                            'date': date_str,
                            'price': round(p, 2),
                            'store': h.get('storeName') or 'loja'
                        })
    except Exception as e:
        print(f"Warning fetching detail for {slug}: {e}")

    spec = GPU_SPECS.get(slug, {
        "vram": scraped_vram or 8,
        "bw": 256,
        "bus": 128,
        "type": "GDDR6",
        "brand": "NVIDIA" if "rtx" in slug else ("Intel" if "arc" in slug else "AMD"),
        "arch": "Modern",
        "ai_mult": 1.0,
        "fp16_tflops": 25.0
    })
    if scraped_vram and "vram" not in GPU_SPECS.get(slug, {}):
        spec["vram"] = scraped_vram

    scores = compute_ai_and_software_scores(slug, gpu_item.get('benchmark'), spec)

    # Ensure history is sorted chronologically (oldest -> newest) and slice from the END (most recent days)
    history.sort(key=lambda x: x['date'])
    prices_all = [h['price'] for h in history] if history else [current_price]
    prices_30d = [h['price'] for h in history[-30:]] if history else [current_price]
    prices_90d = [h['price'] for h in history[-90:]] if history else [current_price]
    prices_180d = [h['price'] for h in history[-180:]] if history else [current_price]

    # Post-July 2026 structural price window (respects the 10-15% market price hike)
    cur_year = datetime.now().year
    post_july_prices = [h['price'] for h in history if h['date'] >= f"{cur_year}-07-01"]
    regime_pool = post_july_prices if len(post_july_prices) >= 5 else prices_90d

    min_all = round(min(prices_all), 2)
    min_90d = round(min(prices_90d), 2)
    avg_30d = round(statistics.mean(prices_30d), 2)
    avg_90d = round(statistics.mean(prices_90d), 2)
    median_180d = round(statistics.median(prices_180d), 2)

    # Smart Target Price: 20th percentile of the post-July regime window (or recent 90d window)
    sorted_regime = sorted(regime_pool)
    p20_idx = max(0, int(len(sorted_regime) * 0.20) - 1)
    target_price = round(sorted_regime[p20_idx], 2)

    # Price trend / rising flag
    vs_avg_90d_pct = round(((current_price - avg_90d) / avg_90d) * 100, 1) if avg_90d > 0 else 0.0
    vs_min_90d_pct = round(((current_price - min_90d) / min_90d) * 100, 1) if min_90d > 0 else 0.0
    vs_target_brl = round(current_price - target_price, 2)

    if current_price <= target_price * 1.03:
        price_status = "great"       # No Preço Alvo / Excelente momento
    elif vs_avg_90d_pct <= 5.0:
        price_status = "normal"      # Preço Normal / Estável
    elif vs_avg_90d_pct <= 14.0:
        price_status = "rising"      # Subindo / Acima da Média
    else:
        price_status = "inflated"    # Inflacionado / Alerta de Alta

    return {
        "slug": slug,
        "name": gpu_item.get("name", slug),
        "href": f"https://www.hardwarebarato.com{gpu_item.get('href', '')}",
        "brand": spec["brand"],
        "arch": spec["arch"],
        "vram_gb": spec["vram"],
        "memory_type": spec["type"],
        "bus_bits": spec["bus"],
        "bandwidth_gbs": spec["bw"],
        "fp16_tflops": spec["fp16_tflops"],
        "tdp_w": gpu_item.get("tdp") or 150,
        "price_brl": round(current_price, 2),
        "regular_price_brl": round(reg_price, 2),
        "installment_price_brl": round(inst_price, 2),
        "coupon": coupon.get("code") if isinstance(coupon, dict) else None,
        "coupon_label": coupon.get("discountLabel") if isinstance(coupon, dict) else None,
        "store_name": lp.get("storeName") or "loja",
        "offer_url": lp.get("url") or f"https://www.hardwarebarato.com/produtos/placas-de-video/{slug}",
        "offer_title": lp.get("name") or gpu_item.get("name", slug),
        "image": lp.get("image") or "",
        "hb_cb_score": gpu_item.get("pricePerformanceScore") or 0,
        "gaming_score": scores["gaming_score"],
        "ai_score": scores["ai_score"],
        "local_inf_score": scores["local_inf_score"],
        "software_score": scores["software_score"],
        "llm_8b_tok_s": scores["llm_8b_tok_s"],
        "llm_14b_tok_s": scores["llm_14b_tok_s"],
        "llm_32b_tok_s": scores["llm_32b_tok_s"],
        "price_stats": {
            "target_price": target_price,
            "min_all_time": min_all,
            "min_90d": min_90d,
            "avg_30d": avg_30d,
            "avg_90d": avg_90d,
            "median_180d": median_180d,
            "vs_avg_90d_pct": vs_avg_90d_pct,
            "vs_min_90d_pct": vs_min_90d_pct,
            "vs_target_brl": vs_target_brl,
            "status": price_status,
        },
        # Keep up to 600 days of daily history (includes 2025 Nov Black Friday + 2026!) for fast interactive charts
        "history": history[:600]
    }

def build_database(output_path):
    print("Fetching live catalog from Hardware Barato...")
    _, gpu_arrays = fetch_json_arrays('/produtos/placas-de-video')
    raw_gpus = gpu_arrays[0] if gpu_arrays else []
    print(f"Found {len(raw_gpus)} GPUs. Fetching individual price histories in parallel...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        enriched_gpus = list(ex.map(fetch_gpu_detail, raw_gpus))

    # Add RX 580 2048SP 8GB reference baseline entry
    rx580_scores = compute_ai_and_software_scores("rx-580-8gb-ref", 890, GPU_SPECS["rx-580-8gb-ref"])
    enriched_gpus.append({
        "slug": "rx-580-8gb-ref",
        "name": "RX 580 2048SP 8GB",
        "href": "https://www.hardwarebarato.com/produtos/placas-de-video",
        "brand": "AMD",
        "arch": "Polaris",
        "vram_gb": 8,
        "memory_type": "GDDR5",
        "bus_bits": 256,
        "bandwidth_gbs": 224,
        "fp16_tflops": 6.2,
        "tdp_w": 150,
        "price_brl": 650.0,
        "regular_price_brl": 650.0,
        "installment_price_brl": 650.0,
        "coupon": None,
        "coupon_label": "Usada / Entrada",
        "store_name": "referencia",
        "offer_url": "https://www.hardwarebarato.com/produtos/placas-de-video",
        "offer_title": "AMD Radeon RX 580 2048SP 8GB GDDR5",
        "image": "",
        "hb_cb_score": 55,
        "gaming_score": rx580_scores["gaming_score"],
        "ai_score": rx580_scores["ai_score"],
        "local_inf_score": rx580_scores["local_inf_score"],
        "software_score": rx580_scores["software_score"],
        "llm_8b_tok_s": rx580_scores["llm_8b_tok_s"],
        "llm_14b_tok_s": rx580_scores["llm_14b_tok_s"],
        "llm_32b_tok_s": rx580_scores["llm_32b_tok_s"],
        "price_stats": {
            "target_price": 600.0,
            "min_all_time": 550.0,
            "min_90d": 600.0,
            "avg_30d": 650.0,
            "avg_90d": 650.0,
            "median_180d": 650.0,
            "vs_avg_90d_pct": 0.0,
            "vs_min_90d_pct": 8.3,
            "vs_target_brl": 50.0,
            "status": "normal",
        },
        "history": []
    })

    # Fetch CPUs, RAM, Motherboards, PSUs for the PC Builder & Power Calculator
    print("Fetching CPUs, RAM, Motherboards, and PSUs from Hardware Barato...")
    _, cpu_arrays = fetch_json_arrays('/produtos/processadores')
    raw_cpus = cpu_arrays[0] if cpu_arrays else []

    # Key CPUs across generations to fetch full 550-day Black Friday history for
    KEY_CPU_HISTORY_SLUGS = {
        "ryzen-5-5500", "ryzen-5-5600", "ryzen-5-5600x", "ryzen-7-5700x", "ryzen-7-5700x3d",
        "ryzen-5-7600", "ryzen-5-7600x", "ryzen-7-7700", "ryzen-7-7800x3d",
        "ryzen-5-9600x", "ryzen-7-9700x", "ryzen-7-9800x3d",
        "core-i5-12400f", "core-i5-13400f", "core-i5-14400f", "core-i5-14600kf",
        "core-ultra-5-225f", "core-ultra-5-245kf"
    }

    def fetch_cpu_history(slug_and_price):
        slug, cur_p = slug_and_price
        hist = []
        try:
            url = f'https://www.hardwarebarato.com/produtos/processadores/{slug}'
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            html = urllib.request.urlopen(req, timeout=15).read().decode('utf-8', errors='ignore')
            pushes = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', html, re.DOTALL)
            unescaped = "".join(pushes).replace('\\"', '"').replace('\\\\', '\\')
            hist_idx = unescaped.find('"dailyMinPrices":')
            if hist_idx != -1:
                arr_start = unescaped.find('[', hist_idx)
                depth = 0
                arr_end = -1
                for i in range(arr_start, len(unescaped)):
                    if unescaped[i] == '[': depth += 1
                    elif unescaped[i] == ']':
                        depth -= 1
                        if depth == 0:
                            arr_end = i + 1
                            break
                if arr_end != -1:
                    raw_hist = json.loads(unescaped[arr_start:arr_end])
                    floor_valid = max(200.0, cur_p * 0.35)
                    seen_dates = set()
                    for h in raw_hist:
                        date_str = h.get('addedAt', '').replace('$D', '')[:10]
                        p = safe_price(h.get('price'), 0.0)
                        if date_str and p >= floor_valid and date_str not in seen_dates:
                            seen_dates.add(date_str)
                            hist.append({'date': date_str, 'price': round(p, 2), 'store': h.get('storeName') or 'loja'})
        except Exception:
            pass
        return slug, hist[:600]

    cpu_to_fetch = []
    for c in raw_cpus:
        if c['slug'] in KEY_CPU_HISTORY_SLUGS:
            lp = c.get('lowestPrice') or {}
            coup = lp.get('coupon')
            reg_p = safe_price(lp.get('price'), 0.0)
            p = safe_price(coup.get('price') if isinstance(coup, dict) else None, reg_p)
            cpu_to_fetch.append((c['slug'], p))

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        cpu_hist_results = dict(ex.map(fetch_cpu_history, cpu_to_fetch))

    cpus = [{
        "slug": "xeon-e5-2680-v4",
        "name": "Intel Xeon E5-2680 v4 (14C/28T)",
        "tdp_w": 120,
        "benchmark": 2150,
        "single_core_factor": 0.68,
        "is_xeon": True,
        "price_brl": 120.0,
        "socket": "LGA2011-3",
        "ddr": "DDR4",
        "store_name": "atual",
        "offer_url": "https://www.hardwarebarato.com/produtos/processadores",
        "history": []
    }]
    for c in raw_cpus:
        lp = c.get('lowestPrice') or {}
        coup = lp.get('coupon')
        reg_p = safe_price(lp.get('price'), 0.0)
        p = safe_price(coup.get('price') if isinstance(coup, dict) else None, reg_p)
        if p <= 0:
            continue
        name = c.get('name', '')
        # Infer socket (Ryzen 7000/8000/9000 desktop = AM5, Ryzen 1000-5000 = AM4)
        ryzen_model = re.search(r'Ryzen\s+\d\s+(\d)\d{3}', name)
        if ryzen_model and ryzen_model.group(1) in ('7', '8', '9'):
            socket, ddr = "AM5", "DDR5"
        elif any(x in name for x in ['7600', '7700', '7800X3D', '7900', '7950', '8400F', '8500G', '8600G', '8700', '9600X', '9700X', '9800X3D', '9900X', '9950X']) and 'Threadripper' not in name:
            socket, ddr = "AM5", "DDR5"
        elif 'Ryzen' in name:
            socket, ddr = "AM4", "DDR4"
        elif 'Ultra' in name:
            socket, ddr = "LGA1851", "DDR5"
        elif any(x in name for x in ['12100', '12400', '12600', '12700', '12900', '13400', '13600', '13700', '13900', '14100', '14400', '14600', '14700', '14900']):
            socket, ddr = "LGA1700", "DDR4/DDR5"
        else:
            socket, ddr = "LGA1200/Other", "DDR4"

        cpus.append({
            "slug": c['slug'],
            "name": name,
            "tdp_w": c.get('tdp') or 65,
            "benchmark": c.get('benchmark') or 3000,
            "price_brl": round(p, 2),
            "socket": socket,
            "ddr": ddr,
            "store_name": lp.get('storeName') or 'loja',
            "offer_url": lp.get('url') or f"https://www.hardwarebarato.com{c.get('href', '')}",
            "history": cpu_hist_results.get(c['slug'], [])
        })

    _, ram_arrays = fetch_json_arrays('/produtos/memorias-ram')
    raw_rams = ram_arrays[0] if ram_arrays else []
    rams = []
    for r in raw_rams:
        lp = r.get('lowestPrice') or {}
        p = safe_price(lp.get('price'), 0.0)
        if p > 0:
            rams.append({
                "slug": r['slug'],
                "name": r.get('name', ''),
                "memory_type": (r.get('memoryType') or 'ddr4').upper(),
                "capacity_gb": r.get('totalCapacityGb') or 16,
                "speed_mtps": r.get('speedMtps') or 3200,
                "tdp_w": 8 if (r.get('totalCapacityGb') or 16) <= 16 else 15,
                "price_brl": round(p, 2),
                "offer_url": f"https://www.hardwarebarato.com{r.get('href', '')}"
            })

    _, mobo_arrays = fetch_json_arrays('/produtos/placas-mae')
    mobos = [{
        "slug": "x99-p4-lga2011",
        "name": "Placa-Mãe X99-P4 (LGA2011-3 - Sua Placa Atual)",
        "brand": "X99",
        "socket": "LGA2011-3",
        "memory_type": "DDR4",
        "tdp_w": 40,
        "price_brl": 280.0,
        "offer_url": "https://www.hardwarebarato.com/produtos/placas-mae"
    }]
    seen_mobo = set()
    for arr in mobo_arrays:
        for m in arr:
            if m['slug'] in seen_mobo:
                continue
            seen_mobo.add(m['slug'])
            lp = m.get('lowestPrice') or {}
            p = safe_price(lp.get('price'), 0.0)
            if p <= 0:
                continue
            href = m.get('href', '')
            socket = "AM5" if "am5" in href else ("AM4" if "am4" in href else ("LGA1851" if any(k in href for k in ["h810", "b860", "z890"]) else "LGA1700"))
            mobos.append({
                "slug": m['slug'],
                "name": m.get('name', ''),
                "brand": m.get('brandName', ''),
                "socket": socket,
                "memory_type": (m.get('memoryType') or 'ddr4').upper(),
                "tdp_w": 35,
                "price_brl": round(p, 2),
                "offer_url": f"https://www.hardwarebarato.com{href}"
            })

    _, psu_arrays = fetch_json_arrays('/produtos/fontes')
    raw_psus = psu_arrays[0] if psu_arrays else []
    psus = []
    for ps in raw_psus:
        lp = ps.get('lowestPrice') or {}
        p = safe_price(lp.get('price'), 0.0)
        if p > 0:
            psus.append({
                "slug": ps['slug'],
                "name": ps.get('name', ''),
                "brand": ps.get('brand', ''),
                "watts": ps.get('watts') or 500,
                "modularity": ps.get('modularity') or 'Non-Modular',
                "certs": ps.get('certificationLabels') or [],
                "price_brl": round(p, 2),
                "offer_url": f"https://www.hardwarebarato.com/produtos/fontes/{ps['slug']}"
            })

    db = {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": "https://www.hardwarebarato.com/",
        "gpus": enriched_gpus,
        "cpus": cpus,
        "rams": rams,
        "motherboards": mobos,
        "psus": psus
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    print(f"Database saved to {output_path} ({len(enriched_gpus)} GPUs, {len(cpus)} CPUs, {len(rams)} RAMs, {len(mobos)} Mobos, {len(psus)} PSUs)")
    return db

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "hardware_db.json")
    build_database(out)
