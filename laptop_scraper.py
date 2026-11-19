"""
Live Brazilian Laptop Catalog & Price History Scraper (Zoom.com.br) + Full-System Enrichment.
Fetches real Brazilian notebooks, live best offers, stores, images, technical specifications,
and daily price histories from Zoom.com.br, enriching every model with CPU/GPU/TGP, Display,
Battery, Portability, Upgradeability, AI/VRAM/Unified-Memory, Workstation, and Versus.com-style
full-system comparison metrics.
"""
import os
import sys
import re
import html
import json
import math
import statistics
import urllib.request
import concurrent.futures
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ZOOM_BASE_URL = "https://www.zoom.com.br"
SCRAPER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
}

ZOOM_SHELF_PATHS = [
    "/notebook/geforce-rtx-4060",
    "/notebook/geforce-rtx-4050",
    "/notebook/geforce-rtx-3050",
    "/notebook/geforce-rtx-5060",
    "/notebook/geforce-rtx-5050",
    "/notebook/macbook",
    "/notebook/notebook-gamer",
    "/notebook/notebook-gamer?page=2",
    "/notebook",
    "/notebook?page=2",
    "/notebook/lenovo",
    "/notebook/acer",
    "/notebook/asus",
    "/notebook/dell",
    "/notebook/samsung",
]

# Mobile CPU specifications database:
# cores, threads, boost_ghz, cache_mb, tdp_w, single_score (0-100), multi_score (Cinebench R23 est), arch, has_npu
MOBILE_CPU_TABLE = [
    (r"ultra\s*9\s*275hx|285hx", {"cores": 24, "threads": 24, "boost": 5.4, "cache": 36, "tdp": 55, "single": 98, "multi": 23500, "arch": "Arrow Lake-HX", "npu": True}),
    (r"ultra\s*7\s*(?:255hx|265hx|x7\s*358h|356h|255h)", {"cores": 16, "threads": 16, "boost": 5.1, "cache": 24, "tdp": 45, "single": 94, "multi": 18200, "arch": "Arrow/Panther Lake", "npu": True}),
    (r"ultra\s*7\s*155h", {"cores": 16, "threads": 22, "boost": 4.8, "cache": 24, "tdp": 28, "single": 86, "multi": 15200, "arch": "Meteor Lake", "npu": True}),
    (r"ultra\s*5\s*125h", {"cores": 14, "threads": 18, "boost": 4.5, "cache": 18, "tdp": 28, "single": 81, "multi": 12400, "arch": "Meteor Lake", "npu": True}),
    (r"core\s*i9[-\s]*14900hx", {"cores": 24, "threads": 32, "boost": 5.8, "cache": 36, "tdp": 55, "single": 95, "multi": 22800, "arch": "Raptor Lake-HX", "npu": False}),
    (r"core\s*i9[-\s]*13900h", {"cores": 14, "threads": 20, "boost": 5.4, "cache": 24, "tdp": 45, "single": 91, "multi": 16800, "arch": "Raptor Lake-H", "npu": False}),
    (r"core\s*i7[-\s]*14700hx", {"cores": 20, "threads": 28, "boost": 5.5, "cache": 33, "tdp": 55, "single": 91, "multi": 20400, "arch": "Raptor Lake-HX", "npu": False}),
    (r"core\s*i7[-\s]*13650hx", {"cores": 14, "threads": 20, "boost": 4.9, "cache": 24, "tdp": 55, "single": 87, "multi": 16900, "arch": "Raptor Lake-HX", "npu": False}),
    (r"core\s*i7[-\s]*13645hx|13620h", {"cores": 10, "threads": 16, "boost": 4.9, "cache": 24, "tdp": 45, "single": 85, "multi": 14500, "arch": "Raptor Lake", "npu": False}),
    (r"core\s*i7[-\s]*13700h", {"cores": 14, "threads": 20, "boost": 5.0, "cache": 24, "tdp": 45, "single": 88, "multi": 16200, "arch": "Raptor Lake-H", "npu": False}),
    (r"core\s*i7[-\s]*12650h", {"cores": 10, "threads": 16, "boost": 4.7, "cache": 24, "tdp": 45, "single": 81, "multi": 13200, "arch": "Alder Lake-H", "npu": False}),
    (r"core\s*(?:7\s*240h)", {"cores": 10, "threads": 16, "boost": 5.2, "cache": 24, "tdp": 45, "single": 87, "multi": 14800, "arch": "Raptor Lake Refresh", "npu": False}),
    (r"core\s*(?:5\s*210h)", {"cores": 8, "threads": 12, "boost": 4.8, "cache": 12, "tdp": 45, "single": 83, "multi": 11600, "arch": "Raptor Lake Refresh", "npu": False}),
    (r"core\s*i5[-\s]*13450hx", {"cores": 10, "threads": 16, "boost": 4.6, "cache": 20, "tdp": 55, "single": 83, "multi": 13800, "arch": "Raptor Lake-HX", "npu": False}),
    (r"core\s*i5[-\s]*13420h", {"cores": 8, "threads": 12, "boost": 4.6, "cache": 12, "tdp": 45, "single": 82, "multi": 11200, "arch": "Raptor Lake-H", "npu": False}),
    (r"core\s*i5[-\s]*12450hx?", {"cores": 8, "threads": 12, "boost": 4.4, "cache": 12, "tdp": 45, "single": 78, "multi": 10200, "arch": "Alder Lake", "npu": False}),
    (r"core\s*i5[-\s]*12500h", {"cores": 12, "threads": 16, "boost": 4.5, "cache": 18, "tdp": 45, "single": 80, "multi": 12800, "arch": "Alder Lake-H", "npu": False}),
    (r"core\s*i7[-\s]*1355u|1365u|1360p", {"cores": 10, "threads": 12, "boost": 5.0, "cache": 12, "tdp": 15, "single": 83, "multi": 9200, "arch": "Raptor Lake-U", "npu": False}),
    (r"core\s*i5[-\s]*(?:1335u|1334u|1340p)", {"cores": 10, "threads": 12, "boost": 4.6, "cache": 12, "tdp": 15, "single": 79, "multi": 8400, "arch": "Raptor Lake-U", "npu": False}),
    (r"core\s*i5[-\s]*1235u", {"cores": 10, "threads": 12, "boost": 4.4, "cache": 12, "tdp": 15, "single": 75, "multi": 7600, "arch": "Alder Lake-U", "npu": False}),
    (r"core\s*i5[-\s]*1135g7|1135g7", {"cores": 4, "threads": 8, "boost": 4.2, "cache": 8, "tdp": 15, "single": 66, "multi": 5400, "arch": "Tiger Lake-U", "npu": False}),
    (r"core\s*i3[-\s]*(?:1315u|1305u|1215u|n305)", {"cores": 6, "threads": 8, "boost": 4.5, "cache": 10, "tdp": 15, "single": 71, "multi": 5600, "arch": "Raptor/Alder Lake-U", "npu": False}),
    (r"celeron|cel-n\d+|n4020|n4500|n100", {"cores": 2, "threads": 2, "boost": 2.8, "cache": 4, "tdp": 6, "single": 26, "multi": 1150, "arch": "Gemini/Jasper Lake", "npu": False}),
    (r"core\s*i7[-\s]*10750h", {"cores": 6, "threads": 12, "boost": 5.0, "cache": 12, "tdp": 45, "single": 64, "multi": 7100, "arch": "Comet Lake-H", "npu": False}),
    (r"ryzen\s*9\s*(?:7945hx|8945hs|ai\s*9)", {"cores": 12, "threads": 24, "boost": 5.2, "cache": 32, "tdp": 45, "single": 92, "multi": 19500, "arch": "Zen 4/5 Mobile", "npu": True}),
    (r"ryzen\s*7\s*(?:8845hs|7840hs|7735hs|7435hs)", {"cores": 8, "threads": 16, "boost": 4.9, "cache": 16, "tdp": 45, "single": 86, "multi": 14600, "arch": "Zen 4/3+ HS", "npu": True}),
    (r"ryzen\s*7\s*(?:7730u|5825u|5700u)", {"cores": 8, "threads": 16, "boost": 4.5, "cache": 16, "tdp": 15, "single": 75, "multi": 10200, "arch": "Zen 3/2 U", "npu": False}),
    (r"ryzen\s*5\s*(?:7535hs|7535h|6600h)", {"cores": 6, "threads": 12, "boost": 4.5, "cache": 16, "tdp": 45, "single": 79, "multi": 10400, "arch": "Zen 3+ HS", "npu": False}),
    (r"ryzen\s*5\s*(?:7520u|7320u)", {"cores": 4, "threads": 8, "boost": 4.3, "cache": 4, "tdp": 15, "single": 66, "multi": 5400, "arch": "Mendocino Zen 2", "npu": False}),
    (r"ryzen\s*5\s*(?:7530u|5625u|5500u)", {"cores": 6, "threads": 12, "boost": 4.3, "cache": 16, "tdp": 15, "single": 72, "multi": 8200, "arch": "Zen 3/2 U", "npu": False}),
    (r"apple\s*m5\b|\bm5\b", {"cores": 10, "threads": 10, "boost": 4.5, "cache": 28, "tdp": 22, "single": 100, "multi": 15400, "arch": "Apple Silicon M5", "npu": True}),
    (r"apple\s*m4\s*max", {"cores": 16, "threads": 16, "boost": 4.5, "cache": 48, "tdp": 45, "single": 99, "multi": 23800, "arch": "Apple Silicon M4 Max", "npu": True}),
    (r"apple\s*m4\s*pro", {"cores": 14, "threads": 14, "boost": 4.5, "cache": 36, "tdp": 35, "single": 99, "multi": 20500, "arch": "Apple Silicon M4 Pro", "npu": True}),
    (r"apple\s*m4\b|\bm4\b", {"cores": 10, "threads": 10, "boost": 4.4, "cache": 24, "tdp": 20, "single": 98, "multi": 14200, "arch": "Apple Silicon M4", "npu": True}),
    (r"apple\s*m3\s*pro", {"cores": 12, "threads": 12, "boost": 4.1, "cache": 24, "tdp": 30, "single": 91, "multi": 15600, "arch": "Apple Silicon M3 Pro", "npu": True}),
    (r"apple\s*m3\b|\bm3\b", {"cores": 8, "threads": 8, "boost": 4.05, "cache": 20, "tdp": 18, "single": 90, "multi": 10800, "arch": "Apple Silicon M3", "npu": True}),
    (r"apple\s*m2\b|\bm2\b", {"cores": 8, "threads": 8, "boost": 3.5, "cache": 16, "tdp": 15, "single": 82, "multi": 8900, "arch": "Apple Silicon M2", "npu": True}),
    (r"apple\s*m1\b|\bm1\b", {"cores": 8, "threads": 8, "boost": 3.2, "cache": 16, "tdp": 15, "single": 77, "multi": 7900, "arch": "Apple Silicon M1", "npu": True}),
]

# Mobile GPU base specifications at reference TGP (fp16_tflops, gaming_ref, vram, bw_gbs, bus, ai_mult, brand, arch, dedicated)
MOBILE_GPU_TABLE = [
    (r"rtx\s*5080", {"label": "NVIDIA GeForce RTX 5080", "vram": 16, "bw": 896, "bus": 256, "fp16": 68.0, "gaming": 5950, "ai_mult": 1.30, "brand": "NVIDIA", "arch": "Blackwell Mobile", "dedicated": True, "ref_tgp": 150}),
    (r"rtx\s*5070\s*ti", {"label": "NVIDIA GeForce RTX 5070 Ti", "vram": 12, "bw": 672, "bus": 192, "fp16": 50.0, "gaming": 4750, "ai_mult": 1.26, "brand": "NVIDIA", "arch": "Blackwell Mobile", "dedicated": True, "ref_tgp": 140}),
    (r"rtx\s*5070(?!\s*ti)", {"label": "NVIDIA GeForce RTX 5070", "vram": 8, "bw": 448, "bus": 128, "fp16": 38.0, "gaming": 3650, "ai_mult": 1.24, "brand": "NVIDIA", "arch": "Blackwell Mobile", "dedicated": True, "ref_tgp": 115}),
    (r"rtx\s*5060", {"label": "NVIDIA GeForce RTX 5060", "vram": 8, "bw": 384, "bus": 128, "fp16": 32.0, "gaming": 3180, "ai_mult": 1.22, "brand": "NVIDIA", "arch": "Blackwell Mobile", "dedicated": True, "ref_tgp": 100}),
    (r"rtx\s*5050", {"label": "NVIDIA GeForce RTX 5050", "vram": 8, "bw": 320, "bus": 128, "fp16": 23.0, "gaming": 2350, "ai_mult": 1.18, "brand": "NVIDIA", "arch": "Blackwell Mobile", "dedicated": True, "ref_tgp": 85}),
    (r"rtx\s*4080", {"label": "NVIDIA GeForce RTX 4080", "vram": 12, "bw": 432, "bus": 192, "fp16": 49.0, "gaming": 4600, "ai_mult": 1.22, "brand": "NVIDIA", "arch": "Ada Mobile", "dedicated": True, "ref_tgp": 150}),
    (r"rtx\s*4070", {"label": "NVIDIA GeForce RTX 4070", "vram": 8, "bw": 256, "bus": 128, "fp16": 30.0, "gaming": 3280, "ai_mult": 1.18, "brand": "NVIDIA", "arch": "Ada Mobile", "dedicated": True, "ref_tgp": 115}),
    (r"rtx\s*4060", {"label": "NVIDIA GeForce RTX 4060", "vram": 8, "bw": 256, "bus": 128, "fp16": 24.5, "gaming": 2850, "ai_mult": 1.18, "brand": "NVIDIA", "arch": "Ada Mobile", "dedicated": True, "ref_tgp": 105}),
    (r"rtx\s*4050", {"label": "NVIDIA GeForce RTX 4050", "vram": 6, "bw": 192, "bus": 96, "fp16": 18.0, "gaming": 2120, "ai_mult": 1.12, "brand": "NVIDIA", "arch": "Ada Mobile", "dedicated": True, "ref_tgp": 85}),
    (r"rtx\s*3060", {"label": "NVIDIA GeForce RTX 3060", "vram": 6, "bw": 336, "bus": 192, "fp16": 19.5, "gaming": 2180, "ai_mult": 1.10, "brand": "NVIDIA", "arch": "Ampere Mobile", "dedicated": True, "ref_tgp": 105}),
    (r"rtx\s*3050", {"label": "NVIDIA GeForce RTX 3050", "vram": 6, "bw": 168, "bus": 96, "fp16": 12.8, "gaming": 1480, "ai_mult": 1.05, "brand": "NVIDIA", "arch": "Ampere Mobile", "dedicated": True, "ref_tgp": 75}),
    (r"rtx\s*2050", {"label": "NVIDIA GeForce RTX 2050", "vram": 4, "bw": 112, "bus": 64, "fp16": 9.2, "gaming": 1180, "ai_mult": 0.92, "brand": "NVIDIA", "arch": "Ampere Mobile", "dedicated": True, "ref_tgp": 55}),
    (r"gtx\s*1650", {"label": "NVIDIA GeForce GTX 1650", "vram": 4, "bw": 192, "bus": 128, "fp16": 5.8, "gaming": 960, "ai_mult": 0.60, "brand": "NVIDIA", "arch": "Turing Mobile", "dedicated": True, "ref_tgp": 50}),
]


def _flatten_zoom_attributes(attr_groups):
    out = {}
    for g in (attr_groups or []):
        for item in (g.get("values") or []):
            key = (item.get("name") or "").strip()
            vals = item.get("values") or []
            if key and vals:
                out[key] = vals
    return out


def _first_float(val_list, default=None):
    if not val_list:
        return default
    for v in val_list:
        m = re.search(r"([0-9]+(?:[.,][0-9]+)?)", str(v))
        if m:
            try:
                return float(m.group(1).replace(",", "."))
            except ValueError:
                pass
    return default


def fetch_zoom_laptop_listings():
    seen_slugs = set()
    candidates = []

    def _fetch_shelf(path):
        url = ZOOM_BASE_URL + path
        req = urllib.request.Request(url, headers=SCRAPER_HEADERS)
        try:
            html_str = urllib.request.urlopen(req, timeout=12).read().decode("utf-8", errors="ignore")
            m = re.search(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', html_str, re.S)
            if not m:
                return []
            data = json.loads(m.group(1))
            redux = data.get("props", {}).get("initialReduxState", {})
            hits_obj = redux.get("hits", {})
            return hits_obj.get("hits") or hits_obj.get("results") or []
        except Exception:
            return []

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        all_lists = list(ex.map(_fetch_shelf, ZOOM_SHELF_PATHS))

    for shelf_idx, hlist in enumerate(all_lists):
        for h in hlist:
            slug = (h.get("seoUrl") or "").strip().lower()
            name = (h.get("name") or "").strip()
            if not slug or slug in seen_slugs:
                continue
            if not (slug.startswith("notebook-") or slug.startswith("macbook-")):
                continue
            # Filter out invalid/zero prices or accessories
            price = h.get("price") or (h.get("bestOffer") or {}).get("price") or 0
            try:
                price_f = float(price)
            except (TypeError, ValueError):
                price_f = 0.0
            if price_f < 1200:
                continue
            seen_slugs.add(slug)
            candidates.append(h)

    return candidates[:55]


def fetch_zoom_laptop_detail(hit, existing_history=None):
    slug = (hit.get("seoUrl") or "").strip().lower()
    raw_url = hit.get("url") or f"/notebook/{slug}"
    full_url = raw_url if raw_url.startswith("http") else f"{ZOOM_BASE_URL}{raw_url}"
    name = (hit.get("name") or slug).strip()

    attrs = {}
    best_offer = {}
    ph_days = []
    img_url = hit.get("image") or ""
    prod_name = name

    try:
        req = urllib.request.Request(full_url, headers=SCRAPER_HEADERS)
        html_str = urllib.request.urlopen(req, timeout=12).read().decode("utf-8", errors="ignore")
        m = re.search(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', html_str, re.S)
        if m:
            d = json.loads(m.group(1))
            props = d.get("props", {})
            redux = props.get("initialReduxState", {})
            pid = str(props.get("pageProps", {}).get("page", {}).get("productID") or "")
            prod_root = redux.get("products", {}).get("product", {}) or {}
            prod_info = prod_root.get("product") or {}
            if prod_info.get("name"):
                prod_name = prod_info["name"]
            attrs = _flatten_zoom_attributes(prod_root.get("attributes"))
            best_offer = redux.get("offers", {}).get("bestOffer") or {}
            if not img_url and prod_root.get("images"):
                img_url = prod_root["images"][0]
            if not img_url and best_offer.get("imageUrl"):
                img_url = best_offer["imageUrl"]
            ph_map = redux.get("priceHistory", {}).get("priceHistory", {})
            ph_entry = ph_map.get(pid) or (list(ph_map.values())[0] if ph_map else {})
            ph_days = ph_entry.get("days") or []
    except Exception as e:
        print(f"Warning fetching laptop {slug}: {e}")

    price_brl = float(best_offer.get("price") or hit.get("price") or 0.0)
    if best_offer.get("imageUrl"):
        img_url = best_offer["imageUrl"]
    store_name = best_offer.get("sellerName") or "Loja BR"
    offer_title = best_offer.get("name") or prod_name
    num_parcels = best_offer.get("numParcels") or 10
    total_parceled = float(best_offer.get("totalParceledValue") or price_brl)

    floor_valid = max(800.0, price_brl * 0.38) if price_brl > 0 else 800.0
    hist_by_date = {}
    for h in (existing_history or []):
        d_str = str(h.get("date") or "")[:10]
        p_val = float(h.get("price") or 0)
        if d_str and p_val >= floor_valid:
            hist_by_date[d_str] = {"date": d_str, "price": round(p_val, 2), "store": h.get("store") or "zoom"}

    for h in ph_days:
        d_str = str(h.get("date") or "")[:10]
        try:
            p_val = float(h.get("price") or 0)
        except (TypeError, ValueError):
            p_val = 0.0
        if d_str and p_val >= floor_valid:
            hist_by_date[d_str] = {"date": d_str, "price": round(p_val, 2), "store": "zoom"}

    today_str = datetime.now().strftime("%Y-%m-%d")
    if price_brl >= floor_valid:
        cur_today = hist_by_date.get(today_str)
        if not cur_today or price_brl < cur_today["price"]:
            hist_by_date[today_str] = {"date": today_str, "price": round(price_brl, 2), "store": store_name}

    history = sorted(hist_by_date.values(), key=lambda x: x["date"])[-600:]

    raw = {
        "slug": slug,
        "name": prod_name,
        "offer_title": offer_title,
        "href": full_url,
        "offer_url": full_url,
        "image": img_url,
        "store_name": store_name,
        "price_brl": round(price_brl, 2),
        "regular_price_brl": round(price_brl, 2),
        "installment_price_brl": round(total_parceled, 2),
        "installments": int(num_parcels) if num_parcels else 10,
        "attrs": attrs,
        "history": history,
    }
    return enrich_laptop_specs(raw)


def _match_cpu(cpu_text):
    low = (cpu_text or "").lower()
    for pat, spec in MOBILE_CPU_TABLE:
        if re.search(pat, low, re.I):
            return dict(spec)
    # Fallback heuristics
    if "i9" in low:
        return {"cores": 14, "threads": 20, "boost": 5.2, "cache": 24, "tdp": 45, "single": 88, "multi": 16000, "arch": "Intel Core i9 Mobile", "npu": False}
    if "i7" in low or "ultra 7" in low:
        return {"cores": 12, "threads": 16, "boost": 4.9, "cache": 24, "tdp": 45, "single": 84, "multi": 13500, "arch": "Intel Core 7/i7 Mobile", "npu": "ultra" in low}
    if "ryzen 7" in low:
        return {"cores": 8, "threads": 16, "boost": 4.7, "cache": 16, "tdp": 35, "single": 81, "multi": 12500, "arch": "AMD Ryzen 7 Mobile", "npu": "8845" in low}
    if "i5" in low or "ultra 5" in low or "core 5" in low:
        return {"cores": 8, "threads": 12, "boost": 4.6, "cache": 12, "tdp": 28, "single": 78, "multi": 10000, "arch": "Intel Core 5/i5 Mobile", "npu": "ultra" in low}
    if "ryzen 5" in low:
        return {"cores": 6, "threads": 12, "boost": 4.4, "cache": 16, "tdp": 15, "single": 72, "multi": 7800, "arch": "AMD Ryzen 5 Mobile", "npu": False}
    if "i3" in low or "ryzen 3" in low:
        return {"cores": 4, "threads": 8, "boost": 4.1, "cache": 8, "tdp": 15, "single": 68, "multi": 5200, "arch": "Mobile Entry", "npu": False}
    return {"cores": 8, "threads": 12, "boost": 4.4, "cache": 12, "tdp": 28, "single": 75, "multi": 9000, "arch": "Mobile SoC", "npu": False}


def _estimate_tgp_for_chassis(full_text, d_gpu):
    ref_tgp = d_gpu.get("ref_tgp", 85)
    low = full_text.lower()
    if any(k in low for k in ["legion", "helios", "predator", "rog strix", "alienware", "dell g15", "avell"]):
        return min(175, int(round(ref_tgp * 1.15)))
    if any(k in low for k in ["loq-e", "15iax9e", "essential", "thin", "cyborg", "galaxy book"]):
        return max(45, int(round(ref_tgp * 0.68)))
    if any(k in low for k in ["nitro v", "anv15", "victus", "zephyrus"]):
        return max(50, int(round(ref_tgp * 0.78)))
    if any(k in low for k in ["loq", "tuf gaming", "nitro 5", "an515"]):
        return ref_tgp
    return max(55, int(round(ref_tgp * 0.90)))


def _match_gpu(gpu_text, full_text, ram_gb, cpu_spec):
    combined = f"{gpu_text} {full_text}".lower()
    for pat, spec in MOBILE_GPU_TABLE:
        if re.search(pat, combined, re.I):
            tgp_w = _estimate_tgp_for_chassis(full_text, spec)
            # TGP scaling curve (diminishing returns above ref_tgp)
            ratio = tgp_w / max(30, spec["ref_tgp"])
            tgp_mult = min(1.08, max(0.68, 0.70 + 0.30 * ratio))
            return {
                "gpu_name": f"{spec['label']} ({tgp_w}W)",
                "gpu_vram_gb": spec["vram"],
                "gpu_tgp_w": tgp_w,
                "gpu_bw_gbs": spec["bw"],
                "gpu_fp16_tflops": round(spec["fp16"] * tgp_mult, 1),
                "gpu_gaming_base": int(round(spec["gaming"] * tgp_mult)),
                "gpu_ai_mult": spec["ai_mult"],
                "gpu_brand": spec["brand"],
                "gpu_arch": spec["arch"],
                "gpu_is_dedicated": True,
                "is_apple_unified": False,
            }

    # Apple Silicon Unified GPU
    if "apple m" in combined or "macbook" in combined:
        if "m4 max" in combined:
            fp16, gaming, bw = 27.0, 2150, 546
            gname = "Apple M4 Max GPU (40-core Unified)"
        elif "m4 pro" in combined:
            fp16, gaming, bw = 16.5, 1450, 273
            gname = "Apple M4 Pro GPU (20-core Unified)"
        elif "m5" in combined:
            fp16, gaming, bw = 11.5, 1020, 153
            gname = "Apple M5 GPU (10-core Unified)"
        elif "m4" in combined:
            fp16, gaming, bw = 9.2, 880, 120
            gname = "Apple M4 GPU (10-core Unified)"
        elif "m3" in combined:
            fp16, gaming, bw = 7.6, 760, 100
            gname = "Apple M3 GPU (10-core Unified)"
        elif "m2" in combined:
            fp16, gaming, bw = 7.1, 680, 100
            gname = "Apple M2 GPU (10-core Unified)"
        else:
            fp16, gaming, bw = 5.2, 540, 68
            gname = "Apple M1 GPU (8-core Unified)"
        unified_vram = max(6, int(round(ram_gb * 0.72)))
        return {
            "gpu_name": gname,
            "gpu_vram_gb": unified_vram,
            "gpu_tgp_w": 24,
            "gpu_bw_gbs": bw,
            "gpu_fp16_tflops": fp16,
            "gpu_gaming_base": gaming,
            "gpu_ai_mult": 0.96,  # Apple MLX Metal native LLM support
            "gpu_brand": "Apple",
            "gpu_arch": "Apple Silicon Unified",
            "gpu_is_dedicated": False,
            "is_apple_unified": True,
        }

    # Modern Intel Arc / AMD Radeon 780M/890M iGPUs vs standard Iris Xe / UHD
    if any(k in combined for k in ["arc ", "ultra 5", "ultra 7", "ultra 9", "ultra x7", "358h", "356h", "890m", "780m"]):
        is_panther = "358h" in combined or "356h" in combined or "x7" in combined
        return {
            "gpu_name": "Intel Arc B390 / Graphics (Integrada)" if is_panther else "Intel Arc / Radeon 780M (Integrada)",
            "gpu_vram_gb": max(4, int(ram_gb // 3)),
            "gpu_tgp_w": 28,
            "gpu_bw_gbs": 120 if is_panther else 96,
            "gpu_fp16_tflops": 12.0 if is_panther else 8.4,
            "gpu_gaming_base": 1220 if is_panther else 860,
            "gpu_ai_mult": 0.78,
            "gpu_brand": "Intel" if "ultra" in combined else "AMD",
            "gpu_arch": "Integrated Arc/RDNA3",
            "gpu_is_dedicated": False,
            "is_apple_unified": False,
        }

    is_iris_or_radeon = any(k in combined for k in ["i5-13", "i7-13", "i5-12", "i7-12", "ryzen 7", "ryzen 5 753", "ryzen 5 5"])
    return {
        "gpu_name": "Intel Iris Xe / AMD Radeon Graphics (Integrada)",
        "gpu_vram_gb": 2,
        "gpu_tgp_w": 15,
        "gpu_bw_gbs": 68,
        "gpu_fp16_tflops": 3.8 if is_iris_or_radeon else 2.2,
        "gpu_gaming_base": 520 if is_iris_or_radeon else 360,
        "gpu_ai_mult": 0.45,
        "gpu_brand": "AMD" if "ryzen" in combined else "Intel",
        "gpu_arch": "Integrated iGPU",
        "gpu_is_dedicated": False,
        "is_apple_unified": False,
    }


def _clean_gpu_display_name(raw_gpu, matched_info, attrs):
    if matched_info["is_apple_unified"] or not matched_info["gpu_is_dedicated"]:
        return matched_info["gpu_name"]
    ded = attrs.get("Placa de Vídeo Dedicada") or []
    base = (ded[0] if ded else raw_gpu or "").strip()
    if not base:
        base = re.sub(r"\s*\(\d+W\)$", "", matched_info["gpu_name"])
    return f"{base} ({matched_info['gpu_vram_gb']}GB • {matched_info['gpu_tgp_w']}W TGP)"


def enrich_laptop_specs(raw):
    attrs = raw.get("attrs") or {}
    name = html.unescape(raw.get("name") or "")
    offer_title = html.unescape(raw.get("offer_title") or "")
    full_text = f"{name} {offer_title}"
    low = full_text.lower()

    brand = (attrs.get("Marca") or [""])[0]
    if not brand:
        for b in ["Lenovo", "Acer", "Asus", "Dell", "Samsung", "Apple", "MSI", "Gigabyte", "Avell", "HP", "VAIO"]:
            if b.lower() in low:
                brand = b
                break
        if not brand:
            brand = "Notebook"

    line = (attrs.get("Linha") or [""])[0]
    os_name = (attrs.get("Sistema Operacional") or [""])[0]
    if not os_name:
        if "macbook" in low or "mac os" in low or "macos" in low:
            os_name = "macOS"
        elif "linux" in low or "ubuntu" in low or "keepos" in low:
            os_name = "Linux"
        else:
            os_name = "Windows 11"

    cpu_raw = (attrs.get("Processador") or [""])[0]
    if not cpu_raw:
        m_cpu = re.search(
            r"\b((?:Intel\s*Core\s*(?:Ultra\s*(?:X?\d\s*\d{3}[A-Z]*|\d\s*\d{3}[A-Z]*)|i[3579][-\s]*\d{4,5}[A-Z]*|[57]\s*\d{3}H)|AMD\s*Ryzen\s*\d[\s-]*(?:AI\s*)?\d{4}[A-Z]*|Apple\s*M\d(?:\s*(?:Pro|Max|Ultra))?|Celeron\s*[A-Z0-9-]+))",
            full_text,
            re.I,
        )
        cpu_raw = m_cpu.group(1).strip() if m_cpu else "Processador Mobile"
    cpu_spec = _match_cpu(f"{cpu_raw} {full_text}")

    ram_gb = int(_first_float(attrs.get("Memória RAM"), 0) or 0)
    if ram_gb <= 0:
        m_ram = re.search(r"\b(8|12|16|24|32|48|64)\s*GB\s*(?:de\s*)?(?:RAM|DDR|LPDDR)?", full_text, re.I)
        ram_gb = int(m_ram.group(1)) if m_ram else 8

    storage_gb = int(_first_float(attrs.get("SSD"), 0) or 0)
    if storage_gb <= 0:
        if "2tb" in low or "2 tb" in low:
            storage_gb = 2048
        elif "1tb" in low or "1 tb" in low:
            storage_gb = 1024
        elif "256gb" in low or "256 gb" in low:
            storage_gb = 256
        else:
            storage_gb = 512

    gpu_ded_list = attrs.get("Placa de Vídeo Dedicada") or []
    gpu_raw = gpu_ded_list[0] if gpu_ded_list else ""
    gpu_info = _match_gpu(gpu_raw, full_text, ram_gb, cpu_spec)
    gpu_display = _clean_gpu_display_name(gpu_raw, gpu_info, attrs)

    # Display specs
    screen_inches = _first_float(attrs.get("Tamanho da Tela"), 0.0) or 0.0
    if screen_inches <= 0:
        m_in = re.search(r'\b(13\.[36]|14(?:\.\d)?|15\.[36]|16(?:\.\d)?|17\.[03])\s*(?:"|pol)', low)
        screen_inches = float(m_in.group(1)) if m_in else 15.6

    screen_hz = int(_first_float(attrs.get("Taxa de atualização / Frequência"), 0) or 0)
    if screen_hz <= 0:
        m_hz = re.search(r"\b(90|120|144|165|180|240|300)\s*hz\b", low)
        if m_hz:
            screen_hz = int(m_hz.group(1))
        elif "macbook pro" in low or "pro" in low and "book6 pro" in low:
            screen_hz = 120
        elif gpu_info["gpu_is_dedicated"] and not ("book" in low and "ultra" in low):
            screen_hz = 144
        else:
            screen_hz = 60

    res_list = " ".join(attrs.get("Resolução de Tela") or [])
    res_low = f"{res_list} {name}".lower()
    if "3456x2234" in res_low or ("macbook pro" in low and screen_inches >= 16.0):
        screen_res = "3456x2234"
    elif "3024x1964" in res_low or "wqxga+" in res_low or ("macbook pro" in low and screen_inches >= 14.0):
        screen_res = "3024x1964"
    elif "2880x1800" in res_low or "2.8k" in res_low:
        screen_res = "2880x1800"
    elif "2560x1664" in res_low or ("macbook air" in low and any(x in low for x in ["m2", "m3", "m4", "m5"])):
        screen_res = "2560x1664"
    elif "2560x1600" in res_low or "2560x1440" in res_low or "qhd" in res_low or "wqxga" in res_low:
        screen_res = "2560x1600"
    elif "wuxga" in res_low or "1920x1200" in res_low:
        screen_res = "1920x1200"
    else:
        screen_res = "1920x1080"

    panel_feats = " ".join((attrs.get("Recursos") or []) + [full_text]).lower()
    if "amoled" in panel_feats or "oled" in panel_feats or "book6 pro" in low or "book6 ultra" in low or "book4 pro" in low:
        panel_type = "AMOLED / OLED"
        srgb_pct = 100
        brightness_nits = 450
    elif "retina" in panel_feats or "macbook" in low:
        panel_type = "Liquid Retina IPS"
        srgb_pct = 100
        brightness_nits = 500
    elif any(k in low for k in ["legion", "helios", "rog", "alienware"]):
        panel_type = "IPS 100% sRGB"
        srgb_pct = 100
        brightness_nits = 350
    elif any(k in low for k in ["loq", "galaxy book", "zenbook"]):
        panel_type = "IPS Antirreflexo"
        srgb_pct = 100 if "loq" in low and "loq-e" not in low else 65
        brightness_nits = 300
    else:
        panel_type = "IPS / WVA"
        srgb_pct = 63
        brightness_nits = 250

    # Memory Upgradeability & Type
    is_mac = brand.lower() == "apple" or "macbook" in low
    is_ultrabook_soldered = is_mac or any(k in low for k in ["galaxy book", "vivobook go", "e1504", "v14 g4", "zenbook", "slim 3"])
    ram_max_gb = int(_first_float(attrs.get("Memória RAM Expansível até"), 0) or 0)

    if is_mac:
        ram_type = "Unified LPDDR5X"
        ram_soldered = True
        ram_slots = 0
        ram_max_gb = ram_gb
        extra_m2_slots = 0
    elif is_ultrabook_soldered and ram_max_gb <= ram_gb:
        ram_type = "LPDDR5" if any(k in low for k in ["7520u", "ultra", "galaxy book", "1335u", "358h", "356h"]) else "DDR4"
        ram_soldered = True
        ram_slots = 0
        ram_max_gb = ram_gb
        extra_m2_slots = 1 if ("slim" in low or "book4" in low or "book6" in low) else 0
    else:
        ram_soldered = False
        ram_slots = 1 if ("loq-e" in low or "15iax9e" in low or "essential" in low) else 2
        ram_type = "DDR5" if any(k in low for k in ["13450", "13650", "13645", "13620", "13700", "14700", "14900", "12450hx", "13900h", "ultra", "210h", "240h", "rtx 40", "rtx 50", "7535", "8845"]) else "DDR4"
        if ram_max_gb <= 0:
            ram_max_gb = 32 if ram_slots == 1 else 64
        extra_m2_slots = 1 if gpu_info["gpu_is_dedicated"] else 0

    # Chassis Dimensions & Weight
    weight_kg = _first_float(attrs.get("Peso"), 0.0) or 0.0
    if weight_kg <= 0:
        if is_mac:
            weight_kg = 1.24 if screen_inches < 14.2 else 1.55
        elif gpu_info["gpu_is_dedicated"]:
            weight_kg = 2.65 if screen_inches >= 16 else 2.25
        else:
            weight_kg = 1.62
    thickness_cm = _first_float(attrs.get("Altura"), 0.0) or 0.0
    thickness_mm = round(thickness_cm * 10, 1) if 0.5 <= thickness_cm <= 6.0 else (11.5 if is_mac else (23.5 if gpu_info["gpu_is_dedicated"] else 18.0))
    width_mm = round((_first_float(attrs.get("Largura"), 35.8) or 35.8) * 10, 1)
    depth_mm = round((_first_float(attrs.get("Profundidade"), 24.5) or 24.5) * 10, 1)

    # Category classification
    if is_mac:
        category = "macbook"
    elif gpu_info["gpu_is_dedicated"] and (gpu_info["gpu_vram_gb"] >= 8 or "helios" in low or "legion" in low or "alienware" in low or "book6 ultra" in low):
        category = "gaming_pro"
    elif gpu_info["gpu_is_dedicated"]:
        category = "gaming"
    elif ("core ultra" in low or "book6 pro" in low or "book4 pro" in low or "yoga" in low or "zenbook" in low or screen_inches <= 14.5 or ram_gb >= 16) and "celeron" not in low:
        category = "ultrabook"
    else:
        category = "budget"

    # Battery & Charger estimation
    if is_mac:
        battery_wh = 70 if "pro" in low else 54
        charger_w = 70 if "pro" in low else 35
        usb_c_pd = True
    elif any(k in low for k in ["helios", "legion", "alienware", "book6 ultra"]):
        battery_wh = 84
        charger_w = 240 if gpu_info["gpu_is_dedicated"] else 140
        usb_c_pd = True
    elif gpu_info["gpu_is_dedicated"]:
        battery_wh = 60 if "loq" in low or "g5" in low else (57 if "nitro" in low else 68)
        charger_w = 170 if gpu_info["gpu_vram_gb"] >= 8 else 135
        usb_c_pd = "loq" in low or "nitro v" in low or "tuf" in low
    elif category == "ultrabook":
        battery_wh = 63 if "galaxy book" in low else 56
        charger_w = 65
        usb_c_pd = True
    else:
        battery_wh = 47
        charger_w = 65
        usb_c_pd = "type-c" in low or "usb-c" in " ".join(attrs.get("Entradas e Saídas") or []).lower()

    avg_light_draw_w = 4.2 if is_mac else (7.5 if cpu_spec["tdp"] <= 20 else 13.5)
    avg_heavy_draw_w = cpu_spec["tdp"] * 0.7 + (gpu_info["gpu_tgp_w"] * 0.45 if gpu_info["gpu_is_dedicated"] else 15)
    battery_hours_light = round(max(2.5, min(18.0, battery_wh / avg_light_draw_w)), 1)
    battery_hours_heavy = round(max(1.0, min(8.0, battery_wh / max(15.0, avg_heavy_draw_w))), 1)

    # Connectivity & Keyboard
    wifi_list = attrs.get("Conexões Sem Fio") or []
    wifi_spec = ", ".join(wifi_list) if wifi_list else ("Wi-Fi 6E, Bluetooth 5.3" if category in ("macbook", "ultrabook", "gaming_pro") else "Wi-Fi 6, Bluetooth 5.1")
    ports = attrs.get("Entradas e Saídas") or (["Thunderbolt 4 / USB-C", "MagSafe 3", "Áudio P2"] if is_mac else ["HDMI", "USB-C", "USB-A 3.2", "Áudio"])
    usb_count = int(_first_float(attrs.get("Quantidades de Entradas USB"), 3) or 3)
    kb_feats = " ".join(attrs.get("Recursos do Teclado/Touchpad") or []).lower()
    keyboard_layout = (attrs.get("Padrão") or ["ABNT2" if not is_mac else "US/ANSI"])[0]
    keyboard_backlit = ("retroiluminado" in kb_feats) or is_mac or gpu_info["gpu_is_dedicated"] or "pro" in low
    keyboard_numpad = ("numérico" in kb_feats) or (screen_inches >= 15.5 and not is_mac and "zephyrus" not in low)

    # Performance & Workload Scores (same semantic scale as GPU/CPU modules!)
    cpu_gaming_factor = max(0.76, min(1.08, 0.72 + (cpu_spec["single"] / 100.0) * 0.34))
    gaming_score = int(round(gpu_info["gpu_gaming_base"] * cpu_gaming_factor))

    # Workstation split (aligns cleanly with STATE.workstationProfile: rendering, editing, compilation)
    render_score = int(round(cpu_spec["multi"] * 0.55 + gpu_info["gpu_fp16_tflops"] * (240 if gpu_info["gpu_brand"] == "NVIDIA" else 110)))
    editing_score = int(round(cpu_spec["multi"] * 0.38 + cpu_spec["single"] * 52 + (3200 if (is_mac or gpu_info["gpu_brand"] == "NVIDIA") else 1400) + min(ram_gb, 32) * 85))
    compile_score = int(round(cpu_spec["multi"] * 0.72 + cpu_spec["single"] * 45 + min(ram_gb, 32) * 110))
    workstation_score = int(round(render_score * 0.4 + editing_score * 0.3 + compile_score * 0.3))

    # AI & Local Inference (VRAM / Apple Unified Memory + Bandwidth + CUDA/MLX)
    eff_vram = gpu_info["gpu_vram_gb"]
    bw = gpu_info["gpu_bw_gbs"]
    ai_mult = gpu_info["gpu_ai_mult"]
    fp16 = gpu_info["gpu_fp16_tflops"]

    vram_ai_pts = {2: 120, 4: 340, 6: 680, 8: 1350, 12: 2650, 16: 4200, 24: 6000}.get(eff_vram, eff_vram * 210)
    if eff_vram >= 6:
        tok_8b = round((bw / 5.5) * 0.65 * ai_mult, 1)
    elif eff_vram >= 4:
        tok_8b = round((bw / 6.2) * 0.38 * ai_mult, 1)
    else:
        tok_8b = round(max(2.5, (bw / 16.0)), 1)

    if eff_vram >= 12:
        tok_14b = round((bw / 9.2) * 0.64 * ai_mult, 1)
    elif eff_vram >= 8:
        tok_14b = round(max(4.5, (bw / 28.0) * ai_mult), 1)
    elif eff_vram >= 6:
        tok_14b = round(4.2 * ai_mult, 1)
    else:
        tok_14b = round(max(1.5, cpu_spec["threads"] * 0.18), 1)

    if eff_vram >= 16:
        tok_32b = round((bw / 19.0) * 0.55 * ai_mult, 1)
    elif eff_vram >= 12:
        tok_32b = round(5.5 * ai_mult, 1)
    else:
        tok_32b = 0.0

    local_inf_score = int(round((tok_8b * 18) + (tok_14b * 48) + (tok_32b * 55) + (vram_ai_pts * 0.55) + (fp16 * 14 * ai_mult)))
    cuda_bonus = 1.40 if gpu_info["gpu_brand"] == "NVIDIA" else (1.05 if gpu_info["gpu_brand"] == "Apple" else 0.72)
    software_score = int(round((gaming_score * 0.35 + cpu_spec["multi"] * 0.52 + eff_vram * 170 + fp16 * 20) * cuda_bonus))
    ai_score = int(round(local_inf_score * 0.68 + (vram_ai_pts * 0.5 + bw * 3.0) * ai_mult * 0.32))

    # Versus Full-System Pillar Scores (0-100)
    res_pixels_mp = (int(screen_res.split("x")[0]) * int(screen_res.split("x")[1])) / 1_000_000.0
    display_score = int(min(100, round(
        min(34, (screen_hz / 165.0) * 34) +
        min(28, (res_pixels_mp / 5.0) * 28) +
        (18 if srgb_pct >= 98 else 9) +
        (20 if ("OLED" in panel_type or "Retina" in panel_type) else 12)
    )))
    portability_score = int(max(20, min(100, round(105 - (weight_kg - 1.1) * 32 - max(0, thickness_mm - 12) * 1.1))))
    battery_score = int(min(100, round((battery_hours_light / 15.0) * 70 + (battery_wh / 90.0) * 30)))
    connectivity_score = int(min(100, round(35 + min(30, len(ports) * 7) + (15 if "Thunderbolt" in str(ports) or "USB-C" in str(ports) else 5) + (15 if "6E" in wifi_spec or "7" in wifi_spec else 10) + (5 if keyboard_backlit else 0))))
    upgradeability_score = int(min(100, (15 if ram_soldered else 50) + (15 if ram_max_gb >= 64 else (8 if ram_max_gb >= 32 else 0)) + (25 if extra_m2_slots >= 1 else 10) + (10 if storage_gb >= 1024 else 5)))

    # Price stats
    history = raw.get("history") or []
    price_brl = float(raw.get("price_brl") or 0)
    all_prices = [h["price"] for h in history] if history else ([price_brl] if price_brl > 0 else [3000.0])
    prices_30d = all_prices[-30:]
    prices_90d = all_prices[-90:]
    min_all = round(min(all_prices), 2)
    min_90d = round(min(prices_90d), 2)
    avg_30d = round(statistics.mean(prices_30d), 2)
    avg_90d = round(statistics.mean(prices_90d), 2)
    median_180d = round(statistics.median(all_prices[-180:]), 2)
    sorted_recent = sorted(prices_90d)
    p20_idx = max(0, int(len(sorted_recent) * 0.20) - 1)
    target_price = round(sorted_recent[p20_idx], 2)
    vs_avg_90d_pct = round(((price_brl - avg_90d) / avg_90d) * 100, 1) if avg_90d > 0 else 0.0
    vs_min_90d_pct = round(((price_brl - min_90d) / min_90d) * 100, 1) if min_90d > 0 else 0.0
    vs_target_brl = round(price_brl - target_price, 2)

    if price_brl <= target_price * 1.03:
        p_status = "great"
    elif vs_avg_90d_pct <= 5.0:
        p_status = "normal"
    elif vs_avg_90d_pct <= 14.0:
        p_status = "rising"
    else:
        p_status = "inflated"

    return {
        "slug": raw["slug"],
        "name": name,
        "brand": brand,
        "line": line or brand,
        "category": category,
        "href": raw["href"],
        "offer_url": raw["offer_url"],
        "offer_title": offer_title,
        "image": raw.get("image") or "",
        "store_name": raw.get("store_name") or "Loja BR",
        "price_brl": round(price_brl, 2),
        "regular_price_brl": round(price_brl, 2),
        "installment_price_brl": round(raw.get("installment_price_brl") or price_brl, 2),
        "installments": raw.get("installments") or 10,
        "coupon": None,
        "coupon_label": None,
        # CPU & GPU
        "cpu_name": cpu_raw,
        "cpu_cores": cpu_spec["cores"],
        "cpu_threads": cpu_spec["threads"],
        "cpu_boost_ghz": cpu_spec["boost"],
        "cpu_cache_mb": cpu_spec["cache"],
        "cpu_tdp_w": cpu_spec["tdp"],
        "cpu_single_score": cpu_spec["single"],
        "cpu_multi_score": cpu_spec["multi"],
        "cpu_arch": cpu_spec["arch"],
        "has_npu": cpu_spec["npu"],
        "gpu_name": gpu_display,
        "gpu_vram_gb": gpu_info["gpu_vram_gb"],
        "gpu_tgp_w": gpu_info["gpu_tgp_w"],
        "gpu_bw_gbs": gpu_info["gpu_bw_gbs"],
        "gpu_fp16_tflops": gpu_info["gpu_fp16_tflops"],
        "gpu_brand": gpu_info["gpu_brand"],
        "gpu_arch": gpu_info["gpu_arch"],
        "gpu_is_dedicated": gpu_info["gpu_is_dedicated"],
        "is_apple_unified": gpu_info["is_apple_unified"],
        # RAM & Storage
        "ram_gb": ram_gb,
        "ram_type": ram_type,
        "ram_max_gb": ram_max_gb,
        "ram_soldered": ram_soldered,
        "ram_slots": ram_slots,
        "storage_gb": storage_gb,
        "storage_type": "SSD NVMe Gen4" if ("40" in gpu_display or "50" in gpu_display or is_mac or "ultra" in low) else "SSD NVMe Gen3",
        "extra_m2_slots": extra_m2_slots,
        # Display
        "screen_inches": round(screen_inches, 1),
        "screen_res": screen_res,
        "screen_hz": screen_hz,
        "panel_type": panel_type,
        "srgb_pct": srgb_pct,
        "brightness_nits": brightness_nits,
        # Chassis, Battery, Ports, OS
        "weight_kg": round(weight_kg, 2),
        "thickness_mm": thickness_mm,
        "width_mm": width_mm,
        "depth_mm": depth_mm,
        "battery_wh": battery_wh,
        "battery_hours_light": battery_hours_light,
        "battery_hours_heavy": battery_hours_heavy,
        "charger_w": charger_w,
        "usb_c_pd": usb_c_pd,
        "ports": ports,
        "usb_count": usb_count,
        "wifi_spec": wifi_spec,
        "keyboard_layout": keyboard_layout,
        "keyboard_backlit": keyboard_backlit,
        "keyboard_numpad": keyboard_numpad,
        "os": os_name,
        # Workload & Versus Scores
        "gaming_score": gaming_score,
        "workstation_render_score": render_score,
        "workstation_editing_score": editing_score,
        "workstation_compile_score": compile_score,
        "workstation_score": workstation_score,
        "llm_8b_tok_s": tok_8b,
        "llm_14b_tok_s": tok_14b,
        "llm_32b_tok_s": tok_32b,
        "local_inf_score": local_inf_score,
        "ai_score": ai_score,
        "software_score": software_score,
        "display_score": display_score,
        "portability_score": portability_score,
        "battery_score": battery_score,
        "connectivity_score": connectivity_score,
        "upgradeability_score": upgradeability_score,
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
            "status": p_status,
        },
        "history": history,
    }


def build_laptops_catalog(existing_laptops=None):
    print("Fetching live Brazilian laptop catalog & price histories from Zoom.com.br...")
    prev_hist_map = {}
    for lap in (existing_laptops or []):
        if lap.get("slug") and lap.get("history"):
            prev_hist_map[lap["slug"]] = lap["history"]

    hits = fetch_zoom_laptop_listings()
    print(f"Found {len(hits)} unique Zoom notebooks. Fetching details & daily price histories...")

    def _worker(hit):
        slug = (hit.get("seoUrl") or "").strip().lower()
        return fetch_zoom_laptop_detail(hit, existing_history=prev_hist_map.get(slug))

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        laptops = [item for item in ex.map(_worker, hits) if item and item.get("price_brl", 0) > 1000]

    print(f"Enriched {len(laptops)} notebooks successfully.")
    return laptops


def refresh_live_laptop_prices(db):
    """Fast refresh of Zoom notebook listing prices without re-fetching every product page."""
    laptops = db.get("laptops") or []
    if not laptops:
        return 0, 0

    hits = fetch_zoom_laptop_listings()
    hit_by_slug = {(h.get("seoUrl") or "").strip().lower(): h for h in hits if h.get("seoUrl")}
    today_str = datetime.now().strftime("%Y-%m-%d")
    updated = 0
    dropped = 0

    for lap in laptops:
        h = hit_by_slug.get(lap.get("slug"))
        if not h:
            continue
        new_p = float(h.get("price") or (h.get("bestOffer") or {}).get("price") or 0)
        if new_p <= 1000:
            continue
        old_p = float(lap.get("price_brl") or 0)
        if old_p > 0 and new_p < old_p * 0.99:
            dropped += 1
        lap["price_brl"] = round(new_p, 2)
        lap["regular_price_brl"] = round(new_p, 2)
        hist = lap.get("history")
        if isinstance(hist, list):
            if hist and hist[-1].get("date") == today_str:
                if new_p < float(hist[-1].get("price") or 999999):
                    hist[-1]["price"] = round(new_p, 2)
            else:
                hist.append({"date": today_str, "price": round(new_p, 2), "store": lap.get("store_name") or "zoom"})
                if len(hist) > 600:
                    lap["history"] = hist[-600:]
        updated += 1

    return updated, dropped


if __name__ == "__main__":
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "hardware_db.json")
    db = {}
    if os.path.exists(db_path):
        with open(db_path, "r", encoding="utf-8") as f:
            db = json.load(f)
    laptops = build_laptops_catalog(existing_laptops=db.get("laptops"))
    db["laptops"] = laptops
    db["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    with open(db_path, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(laptops)} laptops to {db_path}")
