"""
Live Brazilian Smartphone Catalog & Price History Scraper (Zoom.com.br) + Full-System Enrichment.
Mirrors laptop_scraper.py depth: fetches real Brazilian smartphones, live best offers, stores,
images, technical specifications, and daily price histories from Zoom.com.br, enriching every
model with Mobile SoC / Geekbench / AnTuTu / GPU Gaming / NPU AI, Camera System (OIS, Optical
Zoom, Video), Display (OLED/LTPO, Hz, Nits), Battery (mAh, SOT, Fast/Wireless Charge),
Connectivity (5G, NFC, eSIM, IP68), and Software Update Longevity metrics.
"""
import os
import sys
import re
import json
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

ZOOM_SMARTPHONE_SHELVES = [
    "/celular",
    "/celular/samsung/galaxy-s26",
    "/celular/samsung/galaxy-s24",
    "/search?q=galaxy+s26+fe",
    "/search?q=galaxy+s24+ultra",
    "/search?q=galaxy+s24+plus",
    "/search?q=galaxy+s24+fe",
    "/celular?page=2",
    "/celular?page=3",
    "/celular/samsung",
    "/celular/apple",
    "/celular/xiaomi",
    "/celular/motorola",
    "/celular/realme",
    "/search?q=galaxy+s26+plus",
    "/search?q=galaxy+s26",
    "/search?q=galaxy+s26+ultra",
    "/search?q=galaxy+a57",
    "/search?q=galaxy+a37",
    "/search?q=galaxy+a56+a55+a36+s24+s25",
    "/search?q=galaxy+z+flip",
    "/search?q=galaxy+z+fold",
    "/search?q=iphone+17",
    "/search?q=iphone+17+pro+max",
    "/search?q=iphone+18",
    "/search?q=poco+x8",
    "/search?q=poco+f8",
    "/search?q=poco+f7",
    "/search?q=poco+x7+f7+f6",
    "/search?q=xiaomi+15t",
    "/search?q=redmi+note+15+pro",
    "/search?q=motorola+edge+50+60",
    "/search?q=edge+60",
    "/search?q=pixel+10",
    "/search?q=pixel+9",
    "/search?q=realme+gt",
    "/search?q=asus+rog+phone",
]

PINNED_SMARTPHONE_SLUGS = [
    # Samsung Galaxy S26 Lineup (8 models)
    "celular-samsung-galaxy-s26-5g-256gb",
    "celular-samsung-galaxy-s26-5g-512gb-12-gb",
    "celular-samsung-galaxy-s26-plus-5g-256gb",
    "celular-samsung-galaxy-s26-plus-5g-512gb-12-gb",
    "celular-samsung-galaxy-s26-ultra-5g-256gb",
    "celular-samsung-galaxy-s26-ultra-5g-512gb",
    "celular-samsung-galaxy-s26-ultra-5g-1tb",
    "celular-samsung-galaxy-s26-fe-5g-128gb-8-gb",
    # Samsung Galaxy S24 Lineup (6 models)
    "smartphone-samsung-galaxy-s24-128gb-5g",
    "smartphone-samsung-galaxy-s24-plus-5g-512gb-camera-tripla",
    "smartphone-samsung-galaxy-s24-ultra-5g-256gb-camera-quadrupla",
    "smartphone-samsung-galaxy-s24-ultra-5g-512gb-camera-quadrupla",
    "celular-samsung-galaxy-s24-fe-5g-128gb-8-gb",
    "celular-samsung-galaxy-s24-fe-5g-256gb-8-gb",
]

# Mobile SoC benchmark table:
# single (0-100 GB6 SC), multi (GB6 MC), gpu (3DMark WLE / gaming index),
# antutu (v10 est), npu_tops, nm, arch, sustained_pct (thermal sustainability)
MOBILE_SOC_TABLE = [
    # Apple Silicon Mobile
    (r"a20\s*pro", {"label": "Apple A20 Pro", "single": 100, "multi": 10600, "gpu": 7100, "antutu": 2750000, "npu_tops": 58, "nm": 2, "arch": "Apple 2nm N2", "sustained": 85}),
    (r"\ba20\b", {"label": "Apple A20", "single": 100, "multi": 9900, "gpu": 6200, "antutu": 2450000, "npu_tops": 52, "nm": 2, "arch": "Apple 2nm N2", "sustained": 84}),
    (r"a19\s*pro", {"label": "Apple A19 Pro", "single": 100, "multi": 9800, "gpu": 6200, "antutu": 2350000, "npu_tops": 48, "nm": 3, "arch": "Apple 3nm N3P", "sustained": 82}),
    (r"\ba19\b", {"label": "Apple A19", "single": 98, "multi": 9100, "gpu": 5400, "antutu": 2050000, "npu_tops": 44, "nm": 3, "arch": "Apple 3nm N3P", "sustained": 80}),
    (r"a18\s*pro", {"label": "Apple A18 Pro", "single": 96, "multi": 8850, "gpu": 5200, "antutu": 1920000, "npu_tops": 38, "nm": 3, "arch": "Apple 3nm N3E", "sustained": 80}),
    (r"\ba18\b", {"label": "Apple A18", "single": 94, "multi": 8300, "gpu": 4600, "antutu": 1750000, "npu_tops": 35, "nm": 3, "arch": "Apple 3nm N3E", "sustained": 78}),
    (r"a17\s*pro", {"label": "Apple A17 Pro", "single": 88, "multi": 7400, "gpu": 4500, "antutu": 1620000, "npu_tops": 35, "nm": 3, "arch": "Apple 3nm N3B", "sustained": 76}),
    (r"a16\s*bionic|\ba16\b", {"label": "Apple A16 Bionic", "single": 80, "multi": 6550, "gpu": 3700, "antutu": 1460000, "npu_tops": 17, "nm": 4, "arch": "Apple 4nm", "sustained": 82}),
    (r"a15\s*bionic|\ba15\b", {"label": "Apple A15 Bionic", "single": 74, "multi": 5700, "gpu": 3100, "antutu": 1240000, "npu_tops": 15.8, "nm": 5, "arch": "Apple 5nm", "sustained": 82}),
    (r"a14\s*bionic|\ba14\b", {"label": "Apple A14 Bionic", "single": 64, "multi": 4800, "gpu": 2300, "antutu": 950000, "npu_tops": 11, "nm": 5, "arch": "Apple 5nm", "sustained": 80}),
    # Qualcomm Snapdragon
    (r"snapdragon\s*8\s*elite\s*gen\s*5|snapdragon\s*8\s*elite\s*2|sm8850", {"label": "Snapdragon 8 Elite Gen 5", "single": 100, "multi": 11200, "gpu": 7600, "antutu": 3250000, "npu_tops": 80, "nm": 3, "arch": "Oryon Gen 3 3nm", "sustained": 82}),
    (r"snapdragon\s*8\s*elite|8\s*gen\s*4|sm8750", {"label": "Snapdragon 8 Elite", "single": 96, "multi": 9900, "gpu": 6500, "antutu": 2650000, "npu_tops": 60, "nm": 3, "arch": "Oryon 3nm", "sustained": 78}),
    (r"snapdragon\s*8\s*gen\s*3|sm8650", {"label": "Snapdragon 8 Gen 3", "single": 72, "multi": 7100, "gpu": 5100, "antutu": 2050000, "npu_tops": 45, "nm": 4, "arch": "ARMv9 4nm", "sustained": 76}),
    (r"snapdragon\s*8s\s*gen\s*4", {"label": "Snapdragon 8s Gen 4", "single": 74, "multi": 7000, "gpu": 4900, "antutu": 2000000, "npu_tops": 42, "nm": 4, "arch": "ARMv9 4nm", "sustained": 78}),
    (r"snapdragon\s*8s\s*gen\s*3", {"label": "Snapdragon 8s Gen 3", "single": 64, "multi": 5400, "gpu": 3600, "antutu": 1520000, "npu_tops": 34, "nm": 4, "arch": "ARMv9 4nm", "sustained": 80}),
    (r"snapdragon\s*8\s*gen\s*2|sm8550", {"label": "Snapdragon 8 Gen 2", "single": 65, "multi": 5450, "gpu": 3950, "antutu": 1550000, "npu_tops": 28, "nm": 4, "arch": "ARMv9 4nm", "sustained": 82}),
    (r"snapdragon\s*7\+\s*gen\s*3", {"label": "Snapdragon 7+ Gen 3", "single": 61, "multi": 5050, "gpu": 3400, "antutu": 1420000, "npu_tops": 25, "nm": 4, "arch": "ARMv9 4nm", "sustained": 82}),
    (r"snapdragon\s*7s\s*gen\s*3", {"label": "Snapdragon 7s Gen 3", "single": 42, "multi": 3350, "gpu": 1650, "antutu": 780000, "npu_tops": 14, "nm": 4, "arch": "ARMv9 4nm", "sustained": 86}),
    (r"snapdragon\s*7\s*gen\s*3", {"label": "Snapdragon 7 Gen 3", "single": 44, "multi": 3500, "gpu": 1950, "antutu": 860000, "npu_tops": 16, "nm": 4, "arch": "ARMv9 4nm", "sustained": 85}),
    (r"snapdragon\s*7s\s*gen\s*2", {"label": "Snapdragon 7s Gen 2", "single": 36, "multi": 2950, "gpu": 1250, "antutu": 610000, "npu_tops": 10, "nm": 4, "arch": "ARMv8 4nm", "sustained": 86}),
    (r"snapdragon\s*6\s*gen\s*3", {"label": "Snapdragon 6 Gen 3", "single": 36, "multi": 2950, "gpu": 1250, "antutu": 620000, "npu_tops": 10, "nm": 4, "arch": "ARMv8 4nm", "sustained": 88}),
    (r"snapdragon\s*6\s*gen\s*1", {"label": "Snapdragon 6 Gen 1", "single": 33, "multi": 2800, "gpu": 1120, "antutu": 560000, "npu_tops": 8, "nm": 4, "arch": "ARMv8 4nm", "sustained": 88}),
    (r"snapdragon\s*695", {"label": "Snapdragon 695 5G", "single": 30, "multi": 2150, "gpu": 820, "antutu": 440000, "npu_tops": 5, "nm": 6, "arch": "Kryo 660 6nm", "sustained": 90}),
    (r"snapdragon\s*685|snapdragon\s*680", {"label": "Snapdragon 685", "single": 22, "multi": 1620, "gpu": 520, "antutu": 345000, "npu_tops": 4, "nm": 6, "arch": "Kryo 265 6nm", "sustained": 92}),
    (r"snapdragon\s*4\s*gen\s*2", {"label": "Snapdragon 4 Gen 2", "single": 31, "multi": 2200, "gpu": 780, "antutu": 445000, "npu_tops": 5, "nm": 4, "arch": "ARMv8 4nm", "sustained": 90}),
    # MediaTek Dimensity & Helio
    (r"dimensity\s*9500", {"label": "Dimensity 9500", "single": 98, "multi": 10600, "gpu": 7200, "antutu": 3050000, "npu_tops": 70, "nm": 3, "arch": "All-Big-Core 3nm", "sustained": 82}),
    (r"dimensity\s*9400", {"label": "Dimensity 9400", "single": 92, "multi": 9200, "gpu": 6200, "antutu": 2550000, "npu_tops": 56, "nm": 3, "arch": "All-Big-Core 3nm", "sustained": 80}),
    (r"dimensity\s*9300", {"label": "Dimensity 9300+", "single": 74, "multi": 7400, "gpu": 5300, "antutu": 2120000, "npu_tops": 46, "nm": 4, "arch": "All-Big-Core 4nm", "sustained": 77}),
    (r"dimensity\s*8500|dimensity\s*8450", {"label": "Dimensity 8450 / 8500", "single": 63, "multi": 6700, "gpu": 4500, "antutu": 1820000, "npu_tops": 32, "nm": 4, "arch": "All-Big-Core 4nm", "sustained": 84}),
    (r"dimensity\s*8400", {"label": "Dimensity 8400 Ultra", "single": 58, "multi": 6200, "gpu": 4100, "antutu": 1680000, "npu_tops": 28, "nm": 4, "arch": "All-Big-Core 4nm", "sustained": 83}),
    (r"dimensity\s*8350|dimensity\s*8300", {"label": "Dimensity 8300 Ultra", "single": 52, "multi": 4800, "gpu": 3500, "antutu": 1440000, "npu_tops": 22, "nm": 4, "arch": "ARMv9 4nm", "sustained": 82}),
    (r"dimensity\s*7400", {"label": "Dimensity 7400", "single": 41, "multi": 3350, "gpu": 1700, "antutu": 760000, "npu_tops": 14, "nm": 4, "arch": "ARMv8.2 4nm", "sustained": 88}),
    (r"dimensity\s*7300|dimensity\s*7350", {"label": "Dimensity 7300", "single": 37, "multi": 3100, "gpu": 1480, "antutu": 690000, "npu_tops": 12, "nm": 4, "arch": "ARMv8.2 4nm", "sustained": 88}),
    (r"dimensity\s*7060|dimensity\s*7050|dimensity\s*7025|dimensity\s*7200", {"label": "Dimensity 7050/7060", "single": 35, "multi": 2700, "gpu": 1280, "antutu": 620000, "npu_tops": 10, "nm": 6, "arch": "ARMv8.2 6nm", "sustained": 89}),
    (r"dimensity\s*6300|dimensity\s*6100|dimensity\s*6080", {"label": "Dimensity 6300 5G", "single": 27, "multi": 2050, "gpu": 780, "antutu": 430000, "npu_tops": 5, "nm": 6, "arch": "ARMv8.2 6nm", "sustained": 91}),
    (r"helio\s*g100|helio\s*g99", {"label": "Helio G99 / G100", "single": 26, "multi": 2020, "gpu": 760, "antutu": 425000, "npu_tops": 4, "nm": 6, "arch": "ARMv8.2 6nm", "sustained": 91}),
    (r"helio\s*g91|helio\s*g88|helio\s*g85|helio\s*g81", {"label": "Helio G85 / G81", "single": 18, "multi": 1350, "gpu": 460, "antutu": 270000, "npu_tops": 2, "nm": 12, "arch": "ARMv8 12nm", "sustained": 92}),
    # Samsung Exynos
    (r"exynos\s*2600", {"label": "Exynos 2600", "single": 94, "multi": 10200, "gpu": 6800, "antutu": 2850000, "npu_tops": 68, "nm": 2, "arch": "Samsung 2nm GAA", "sustained": 80}),
    (r"exynos\s*2500", {"label": "Exynos 2500", "single": 76, "multi": 7600, "gpu": 4900, "antutu": 2050000, "npu_tops": 45, "nm": 3, "arch": "Samsung 3nm GAA", "sustained": 76}),
    (r"exynos\s*2400e?", {"label": "Exynos 2400", "single": 69, "multi": 6700, "gpu": 4400, "antutu": 1760000, "npu_tops": 38, "nm": 4, "arch": "Xclipse RDNA3 4nm", "sustained": 75}),
    (r"exynos\s*1680", {"label": "Exynos 1680", "single": 51, "multi": 4450, "gpu": 2550, "antutu": 1050000, "npu_tops": 18, "nm": 4, "arch": "Xclipse 550 4nm", "sustained": 85}),
    (r"exynos\s*1580", {"label": "Exynos 1580", "single": 46, "multi": 3950, "gpu": 2150, "antutu": 910000, "npu_tops": 15, "nm": 4, "arch": "Xclipse 540 4nm", "sustained": 84}),
    (r"exynos\s*1480", {"label": "Exynos 1480", "single": 40, "multi": 3450, "gpu": 1680, "antutu": 740000, "npu_tops": 11, "nm": 4, "arch": "Xclipse 530 4nm", "sustained": 85}),
    (r"exynos\s*1380", {"label": "Exynos 1380", "single": 35, "multi": 2900, "gpu": 1240, "antutu": 605000, "npu_tops": 8, "nm": 5, "arch": "Samsung 5nm", "sustained": 86}),
    (r"exynos\s*1330|exynos\s*1280", {"label": "Exynos 1330 / 1280", "single": 30, "multi": 2180, "gpu": 860, "antutu": 455000, "npu_tops": 5, "nm": 5, "arch": "Samsung 5nm", "sustained": 88}),
    # Google Tensor
    (r"tensor\s*g5", {"label": "Google Tensor G5", "single": 76, "multi": 6800, "gpu": 3900, "antutu": 1580000, "npu_tops": 50, "nm": 3, "arch": "TSMC 3nm N3E", "sustained": 82}),
    (r"tensor\s*g4", {"label": "Google Tensor G4", "single": 64, "multi": 5100, "gpu": 3100, "antutu": 1240000, "npu_tops": 42, "nm": 4, "arch": "Samsung 4nm", "sustained": 78}),
    # Unisoc / Entry
    (r"unisoc\s*t760|unisoc\s*t820", {"label": "Unisoc T760 5G", "single": 27, "multi": 2200, "gpu": 820, "antutu": 450000, "npu_tops": 4, "nm": 6, "arch": "ARMv8 6nm", "sustained": 89}),
    (r"unisoc\s*t61[26]|unisoc\s*t606|unisoc\s*t7250", {"label": "Unisoc T606 / T616", "single": 16, "multi": 1380, "gpu": 390, "antutu": 255000, "npu_tops": 1.5, "nm": 12, "arch": "ARMv8 12nm", "sustained": 92}),
]

MODEL_SOC_HINTS = [
    (r"iphone\s*18\s*(?:pro|air)", "a20 pro"),
    (r"iphone\s*18\b", "a20"),
    (r"iphone\s*17\s*pro", "a19 pro"),
    (r"iphone\s*17\s*air", "a19 pro"),
    (r"iphone\s*17\b", "a19"),
    (r"iphone\s*16\s*pro", "a18 pro"),
    (r"iphone\s*16e?\b", "a18"),
    (r"iphone\s*15\s*pro", "a17 pro"),
    (r"iphone\s*15\b|iphone\s*14\s*pro", "a16 bionic"),
    (r"iphone\s*14\b|iphone\s*13\b", "a15 bionic"),
    (r"galaxy\s*s26\s*ultra", "snapdragon 8 elite gen 5"),
    (r"galaxy\s*s26\s*fe", "exynos 2500"),
    (r"galaxy\s*s26\s*(?:plus|\+|edge)?\b", "exynos 2600"),
    (r"galaxy\s*s25\s*(?:ultra|plus|\+|edge)?\b", "snapdragon 8 elite"),
    (r"galaxy\s*s24\s*ultra", "snapdragon 8 gen 3"),
    (r"galaxy\s*s24\s*fe|galaxy\s*s24\b", "exynos 2400"),
    (r"galaxy\s*s23\b", "snapdragon 8 gen 2"),
    (r"galaxy\s*z\s*fold\s*8|galaxy\s*z\s*flip\s*7", "snapdragon 8 elite"),
    (r"galaxy\s*z\s*fold\s*[67]|galaxy\s*z\s*flip\s*[6]", "snapdragon 8 gen 3"),
    (r"galaxy\s*a57", "exynos 1680"),
    (r"galaxy\s*a56", "exynos 1580"),
    (r"galaxy\s*a55", "exynos 1480"),
    (r"galaxy\s*a37", "snapdragon 6 gen 3"),
    (r"galaxy\s*a36", "snapdragon 6 gen 3"),
    (r"galaxy\s*a35", "exynos 1380"),
    (r"galaxy\s*a26|galaxy\s*a25", "exynos 1380"),
    (r"galaxy\s*a16|galaxy\s*a15|galaxy\s*a17", "helio g99"),
    (r"galaxy\s*a06|galaxy\s*a05", "helio g85"),
    (r"pixel\s*10", "tensor g5"),
    (r"pixel\s*9", "tensor g4"),
    (r"poco\s*x8\s*pro", "dimensity 8500"),
    (r"poco\s*x8\b", "dimensity 7400"),
    (r"poco\s*x7\s*pro", "dimensity 8400"),
    (r"poco\s*x7\b", "dimensity 7300"),
    (r"poco\s*x6\s*pro", "dimensity 8300"),
    (r"poco\s*x6\b", "snapdragon 7s gen 2"),
    (r"poco\s*f8\s*(?:pro|ultra)?\b", "snapdragon 8 elite"),
    (r"poco\s*f7\s*pro|poco\s*f7\s*ultra", "snapdragon 8 gen 3"),
    (r"poco\s*f7\b", "snapdragon 8s gen 4"),
    (r"poco\s*f6\s*pro", "snapdragon 8 gen 2"),
    (r"poco\s*f6\b", "snapdragon 8s gen 3"),
    (r"poco\s*m7\s*pro|poco\s*m6\s*pro", "dimensity 7050"),
    (r"poco\s*c[678]\d", "helio g85"),
    (r"xiaomi\s*15t\s*pro", "dimensity 9400"),
    (r"xiaomi\s*15t\b", "dimensity 8400"),
    (r"redmi\s*note\s*15\s*pro\+", "snapdragon 7s gen 3"),
    (r"redmi\s*note\s*15\s*pro", "dimensity 7400"),
    (r"redmi\s*note\s*15", "dimensity 7060"),
    (r"redmi\s*note\s*14\s*pro\+", "snapdragon 7s gen 3"),
    (r"redmi\s*note\s*14\s*pro", "dimensity 7300"),
    (r"redmi\s*note\s*14\s*5g", "dimensity 7050"),
    (r"redmi\s*note\s*14\b", "helio g99"),
    (r"redmi\s*note\s*13\s*pro", "snapdragon 7s gen 2"),
    (r"redmi\s*note\s*13\b", "snapdragon 685"),
    (r"redmi\s*14c|redmi\s*13c|redmi\s*a[35]", "helio g81"),
    (r"edge\s*60\s*pro|edge\s*50\s*ultra", "snapdragon 8s gen 3"),
    (r"edge\s*60\s*fusion|edge\s*50\s*pro|edge\s*50\s*neo|edge\s*50\s*fusion", "dimensity 7300"),
    (r"moto\s*g85|moto\s*g84|moto\s*g75", "snapdragon 6 gen 3"),
    (r"moto\s*g56|moto\s*g55|moto\s*g54", "dimensity 7060"),
    (r"moto\s*g35|moto\s*g34", "unisoc t760"),
    (r"moto\s*g24|moto\s*g15|moto\s*g05|moto\s*g04", "helio g85"),
    (r"realme\s*gt\s*7\s*pro", "snapdragon 8 elite"),
    (r"realme\s*gt\s*[67]", "snapdragon 8s gen 3"),
    (r"realme\s*1[34]\s*pro", "snapdragon 7s gen 3"),
    (r"realme\s*c[67]\d", "unisoc t616"),
    (r"rog\s*phone\s*[89]", "snapdragon 8 elite"),
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


def _first_int(val_list, default=None):
    v = _first_float(val_list, None)
    return int(round(v)) if v is not None else default


def _detect_soc(text, model_name):
    combo = f"{text} {model_name}".lower()
    for pat, spec in MOBILE_SOC_TABLE:
        if re.search(pat, combo, re.I):
            return dict(spec)
    for mpat, hint in MODEL_SOC_HINTS:
        if re.search(mpat, model_name.lower(), re.I):
            for pat, spec in MOBILE_SOC_TABLE:
                if re.search(pat, hint, re.I):
                    return dict(spec)
    return {"label": "Octa-Core Intermediário", "single": 30, "multi": 2200, "gpu": 900, "antutu": 450000, "npu_tops": 5, "nm": 6, "arch": "ARMv8 6nm", "sustained": 88}


def fetch_zoom_smartphone_listings():
    hit_by_slug = {}
    shelf_ordered = []

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
        all_lists = list(ex.map(_fetch_shelf, ZOOM_SMARTPHONE_SHELVES))

    for hlist in all_lists:
        for h in hlist:
            slug = (h.get("seoUrl") or "").strip().lower()
            name = (h.get("name") or "").strip()
            raw_url = (h.get("url") or "").lower()
            if not slug or slug in hit_by_slug:
                continue
            if not (raw_url.startswith("/celular/") or slug.startswith("celular-") or slug.startswith("smartphone-") or "iphone" in slug):
                continue
            if re.search(r"\b(capa|pel[íi]cula|carregador|cabo|suporte|fone|smartwatch|watch|tablet|ipad|trocafy|recondicionado|reembalado|seminovo|usado|vitrine|combo)\b", name, re.I):
                continue
            if re.search(r"\+\s*(smartwatch|watch|buds|fone|capa|pel[íi]cula|carregador)", name, re.I):
                continue
            price = h.get("price") or (h.get("bestOffer") or {}).get("price") or 0
            try:
                price_f = float(price)
            except (TypeError, ValueError):
                price_f = 0.0
            if price_f < 420 or price_f > 21000:
                continue
            hit_by_slug[slug] = h
            shelf_ordered.append(h)

    seen_slugs = set()
    candidates = []
    for sl in PINNED_SMARTPHONE_SLUGS:
        if sl in seen_slugs:
            continue
        seen_slugs.add(sl)
        candidates.append(hit_by_slug.get(sl) or {"seoUrl": sl, "url": f"/celular/{sl}", "name": sl})

    for h in shelf_ordered:
        sl = (h.get("seoUrl") or "").strip().lower()
        if sl and sl not in seen_slugs:
            seen_slugs.add(sl)
            candidates.append(h)

    return candidates[:165]


def enrich_smartphone(raw):
    name = raw["name"]
    low = name.lower()
    attrs = raw.get("attrs") or {}
    price_brl = float(raw.get("price_brl") or 0)
    history = raw.get("history") or []

    brand = (attrs.get("Marca") or [""])[0].strip()
    if not brand:
        for b in ["Apple", "Samsung", "Xiaomi", "Motorola", "Realme", "Asus", "Google", "Honor", "Oppo", "OnePlus", "Poco"]:
            if b.lower() in low:
                brand = "Xiaomi" if b == "Poco" else b
                break
    brand = brand or "Smartphone"
    is_apple = brand.lower() == "apple" or "iphone" in low
    is_samsung = brand.lower() == "samsung" or "galaxy" in low
    is_motorola = brand.lower() == "motorola" or "moto " in low or "edge " in low
    is_xiaomi = brand.lower() in ("xiaomi", "poco", "redmi") or any(k in low for k in ("xiaomi", "poco", "redmi"))
    is_google = brand.lower() == "google" or "pixel" in low

    os_name = "iOS" if is_apple else ((attrs.get("Sistema Operacional") or ["Android"])[0])
    line = (attrs.get("Linha") or attrs.get("Série") or [""])[0].strip()

    proc_str = " ".join(attrs.get("Processador") or [])
    soc = _detect_soc(proc_str, name)

    ram_gb = _first_int(attrs.get("Memória Ram"), None)
    if not ram_gb:
        m_ram = re.search(r"\b(4|6|8|12|16)\s*gb(?:\s*ram)?\b", low)
        if m_ram and int(m_ram.group(1)) <= 16:
            ram_gb = int(m_ram.group(1))
    if not ram_gb:
        if is_apple:
            ram_gb = 12 if ("17 pro" in low or "18" in low) else (8 if any(x in low for x in ("17", "16", "15 pro")) else 6)
        else:
            ram_gb = 12 if price_brl >= 3200 else (8 if price_brl >= 1100 else 4)

    raw_st_vals = attrs.get("Memória Interna") or []
    raw_st_str = " ".join(str(x) for x in raw_st_vals)
    if re.search(r"\b1\s*tb\b", raw_st_str, re.I) or re.search(r"\b1\s*tb\b", low):
        storage_gb = 1024
    else:
        storage_gb = _first_int(raw_st_vals, None)
        if storage_gb and storage_gb <= 4:
            storage_gb *= 1024
    if not storage_gb:
        m_st = re.search(r"\b(64|128|256|512)\s*gb\b|\b(1)\s*tb\b", low)
        if m_st:
            storage_gb = 1024 if m_st.group(2) else int(m_st.group(1))
    storage_gb = storage_gb or (256 if price_brl >= 1500 else 128)

    if is_apple:
        storage_type = "NVMe"
    elif soc["antutu"] >= 1350000:
        storage_type = "UFS 4.0"
    elif soc["antutu"] >= 650000:
        storage_type = "UFS 3.1"
    elif soc["antutu"] >= 380000:
        storage_type = "UFS 2.2"
    else:
        storage_type = "eMMC 5.1"

    screen_inches = _first_float(attrs.get("Tamanho da Tela"), None)
    if not screen_inches or screen_inches < 4.5 or screen_inches > 8.5:
        if "s26 ultra" in low:
            screen_inches = 6.9
        elif "s24 ultra" in low or "s25 ultra" in low:
            screen_inches = 6.8
        elif "ultra" in low or "pro max" in low:
            screen_inches = 6.9
        elif is_samsung and ("plus" in low or "fe" in low) and "s2" in low:
            screen_inches = 6.7
        elif ("s24" in low or "s25" in low or "s26" in low) and "ultra" not in low and "plus" not in low and "fe" not in low:
            screen_inches = 6.2
        elif "iphone 15" in low or "iphone 14" in low:
            screen_inches = 6.1
        else:
            screen_inches = 6.67
    screen_type_raw = " ".join(attrs.get("Tipo de Tela") or [])
    if is_apple:
        screen_type = "LTPO Super Retina XDR OLED" if ("pro" in low or "17" in low or "18" in low) else "Super Retina XDR OLED"
    elif re.search(r"dynamic\s*amoled|ltpo", screen_type_raw, re.I) or "galaxy s2" in low or is_google:
        screen_type = "LTPO Dynamic AMOLED 2X" if is_samsung else ("LTPO OLED" if "pro" in low or is_google else "LTPO AMOLED")
    elif re.search(r"poled|p-oled", screen_type_raw, re.I) or ("edge" in low and is_motorola):
        screen_type = "pOLED"
    elif re.search(r"amoled|oled", screen_type_raw, re.I) or price_brl >= 1150:
        screen_type = "AMOLED"
    else:
        screen_type = "IPS LCD"

    is_oled = any(k in screen_type.lower() for k in ("oled", "amoled", "retina"))
    is_ltpo = "ltpo" in screen_type.lower()

    hz_str = " ".join(attrs.get("Taxa de Atualização") or attrs.get("Diferenciais da Tela") or [])
    screen_hz = _first_int([hz_str], None)
    if not screen_hz or screen_hz not in (60, 90, 120, 144, 165):
        if is_apple:
            screen_hz = 120 if ("pro" in low or "17" in low or "18" in low) else 60
        elif "edge" in low and is_motorola:
            screen_hz = 144 if "pro" in low or "ultra" in low else 120
        elif price_brl >= 1000 or is_oled:
            screen_hz = 120
        else:
            screen_hz = 90

    screen_res = " ".join(attrs.get("Resolução da Tela") or [])
    if not screen_res:
        if "ultra" in low or "pro max" in low:
            screen_res = "QHD+ (3120x1440)"
        elif is_oled or price_brl >= 1000:
            screen_res = "Full HD+ (2400x1080)"
        else:
            screen_res = "HD+ (1600x720)"

    if is_ltpo:
        brightness_nits = 2600 if ("s24" in low or "s25" in low or "s26" in low or "17" in low or "18" in low or "16 pro" in low or "pixel 10" in low or "pixel 9 pro" in low) else 2000
    elif is_oled:
        brightness_nits = 1600 if price_brl >= 2200 else 1200
    else:
        brightness_nits = 650

    display_score = 45
    if is_oled: display_score += 22
    if is_ltpo: display_score += 8
    if screen_hz >= 120: display_score += 12
    elif screen_hz >= 90: display_score += 6
    if "qhd" in screen_res.lower() or "1440" in screen_res or "1.5k" in screen_res.lower():
        display_score += 7
    elif "full hd" in screen_res.lower() or "1080" in screen_res:
        display_score += 4
    display_score += min(6, int((brightness_nits - 500) / 350))
    display_score = max(35, min(100, display_score))

    rear_raw = " ".join(attrs.get("Resolução da Câmera Traseira") or [])
    rear_mps = [int(x) for x in re.findall(r"(\d{2,3})\s*mp", rear_raw, re.I)]
    cam_main_mp = max(rear_mps) if rear_mps else (200 if "ultra" in low or "note 14 pro" in low else (48 if is_apple else 50))
    front_raw = " ".join(attrs.get("Resolução da Câmera Frontal") or attrs.get("Câmera Frontal") or [])
    cam_front_mp = _first_int([front_raw], 12 if is_apple else (32 if price_brl >= 1700 else 13))
    cam_diff = " ".join(attrs.get("Diferenciais da Câmera") or []) + " " + rear_raw
    video_raw = " ".join(attrs.get("Filma em(Câmera Traseira)") or [])

    cam_ois = bool(re.search(r"ois|estabiliza[çc][ãa]o\s*[óo]ptica", cam_diff, re.I)) or is_apple or is_google or price_brl >= 1450
    has_tele = bool(re.search(r"telefoto|teleobjetiva|perisc[óo]pio|zoom\s*[óo]ptico", cam_diff, re.I)) or any(k in low for k in ("ultra", "pro", "s26", "s25", "s24", "s23", "edge 50 pro", "edge 60 pro", "pixel 9", "pixel 10", "15t"))
    cam_zoom_optical = 5 if ("ultra" in low or "16 pro" in low or "17 pro" in low or "18 pro" in low or "15 pro max" in low or "pixel 10 pro" in low or "pixel 9 pro" in low) else (3 if has_tele else 0)
    cam_ultrawide_mp = 48 if ("16 pro" in low or "17 pro" in low or "18 pro" in low or "s25 ultra" in low or "s26 ultra" in low or "pixel 10" in low or "pixel 9 pro" in low) else (12 if (is_apple or price_brl >= 1600) else (8 if price_brl >= 1000 else 0))

    if re.search(r"8k", video_raw, re.I) or ("galaxy s2" in low):
        cam_video_max = "8K 30fps / 4K 60fps"
    elif re.search(r"4k", video_raw, re.I) or is_apple or price_brl >= 1350:
        cam_video_max = "4K 60fps" if (is_apple or soc["antutu"] >= 900000) else "4K 30fps"
    else:
        cam_video_max = "Full HD 60fps"

    camera_score = 38
    if is_apple:
        camera_score += 36 if "pro" in low else 28
    elif "ultra" in low and is_samsung:
        camera_score += 38
    elif "galaxy s2" in low:
        camera_score += 31
    elif price_brl >= 2500:
        camera_score += 24
    elif price_brl >= 1500:
        camera_score += 17
    elif price_brl >= 950:
        camera_score += 10
    if cam_ois: camera_score += 9
    if cam_zoom_optical >= 5: camera_score += 11
    elif cam_zoom_optical >= 3: camera_score += 7
    if "4k 60" in cam_video_max.lower() or "8k" in cam_video_max.lower(): camera_score += 6
    elif "4k" in cam_video_max.lower(): camera_score += 3
    if cam_ultrawide_mp >= 12: camera_score += 3
    camera_score = max(30, min(100, camera_score))

    battery_mah = _first_int(attrs.get("Capacidade da Bateria"), None)
    if not battery_mah or battery_mah < 2500 or battery_mah > 10000:
        if is_apple:
            battery_mah = 4850 if ("pro max" in low and ("17" in low or "18" in low)) else (4685 if "pro max" in low else (4050 if "18" in low else (3900 if "17" in low else (3561 if "16" in low else 3349))))
        elif "poco x7 pro" in low or "poco x8" in low or "f7" in low or "f8" in low:
            battery_mah = 6000
        elif is_samsung and re.search(r"\bgalaxy\s*m\d+", low):
            battery_mah = 6000
        else:
            battery_mah = 5000

    if is_apple:
        charge_w = 35 if ("16" in low or "17" in low or "18" in low) else 25
        wireless_charge_w = 25 if ("16" in low or "17" in low or "18" in low) else 15
    elif is_xiaomi:
        charge_w = 90 if ("pro" in low or "f6" in low or "f7" in low or "f8" in low or "x8" in low) else (45 if price_brl >= 1300 else 33)
        wireless_charge_w = 50 if "ultra" in low else 0
    elif is_motorola:
        charge_w = 125 if ("edge 50 pro" in low or "ultra" in low) else (68 if "edge" in low else 33)
        wireless_charge_w = 50 if ("edge 50 pro" in low or "ultra" in low) else (15 if "edge" in low else 0)
    elif is_samsung:
        charge_w = 45 if ("ultra" in low or "plus" in low or "a56" in low or "a57" in low or "a36" in low or "a37" in low) else 25
        wireless_charge_w = 15 if "galaxy s2" in low or "z fold" in low or "z flip" in low else 0
    elif is_google:
        charge_w = 45 if "10" in low else 37
        wireless_charge_w = 23
    else:
        charge_w = 45 if price_brl >= 1500 else 33
        wireless_charge_w = 0

    eff_mult = 1.24 if is_apple else (1.06 if soc["nm"] <= 4 else 0.94)
    battery_hours_sot = round(max(4.5, min(14.5, (battery_mah / 500.0) * eff_mult * (0.94 if screen_hz >= 120 and not is_ltpo else 1.0))), 1)
    charge_0_100_min = max(24, min(115, int(round((battery_mah / max(15, charge_w)) * 0.56))))

    battery_score = max(40, min(100, int(round(
        min(52, (battery_hours_sot / 12.5) * 52) +
        min(30, (charge_w / 90.0) * 30) +
        (10 if wireless_charge_w >= 15 else 0) +
        (8 if battery_mah >= 5500 else (4 if battery_mah >= 5000 else 0))
    ))))

    all_attr_text = json.dumps(attrs, ensure_ascii=False).lower() + " " + low
    has_5g = bool(re.search(r"\b5g\b", all_attr_text)) or is_apple or price_brl >= 1050
    has_nfc = bool(re.search(r"\bnfc\b", all_attr_text)) or is_apple or price_brl >= 950
    has_esim = bool(re.search(r"e-?sim", all_attr_text)) or is_apple or ("galaxy s2" in low) or ("galaxy a5" in low) or ("edge" in low) or ("note 14 pro" in low)
    has_microsd = (not is_apple) and ("galaxy s2" not in low) and ("poco f" not in low) and (bool(re.search(r"micro\s*sd|cart[ãa]o\s*de\s*mem[óo]ria", all_attr_text)) or price_brl < 1900)

    if is_apple or "galaxy s2" in low or "edge 50" in low or "edge 60" in low or "poco x7" in low or "poco x8" in low or "note 14 pro" in low or "note 15 pro" in low or "f7" in low or "f8" in low or is_google or "xiaomi 15t" in low:
        ip_rating = "IP68"
    elif "galaxy a5" in low or "galaxy a3" in low or "galaxy a26" in low:
        ip_rating = "IP67"
    elif price_brl >= 1100:
        ip_rating = "IP54"
    else:
        ip_rating = "IP52 / Básico"

    if is_samsung and ("galaxy s24" in low or "galaxy s25" in low or "galaxy s26" in low or "z fold" in low or "z flip" in low):
        os_updates_years = 7
    elif is_google:
        os_updates_years = 7
    elif is_samsung and ("galaxy a56" in low or "galaxy a57" in low or "galaxy a36" in low or "galaxy a37" in low or "galaxy a26" in low or "galaxy a16" in low or "galaxy a17" in low):
        os_updates_years = 6
    elif is_apple:
        os_updates_years = 6
    elif is_samsung:
        os_updates_years = 4
    elif is_xiaomi and price_brl >= 1500:
        os_updates_years = 4
    elif is_motorola and "edge" in low:
        os_updates_years = 4
    else:
        os_updates_years = 3 if price_brl >= 1000 else 2

    connectivity_score = 45
    if has_5g: connectivity_score += 18
    if has_nfc: connectivity_score += 14
    if has_esim: connectivity_score += 10
    if ip_rating in ("IP68", "IP69"): connectivity_score += 13
    elif ip_rating == "IP67": connectivity_score += 9
    elif "54" in ip_rating: connectivity_score += 4
    connectivity_score = max(40, min(100, connectivity_score))

    longevity_score = max(35, min(100, int(round(
        min(48, (os_updates_years / 7.0) * 48) +
        min(22, (ram_gb / 12.0) * 22) +
        min(18, (storage_gb / 256.0) * 18) +
        (12 if ip_rating in ("IP68", "IP67") else 4)
    ))))

    if price_brl >= 3800 or soc["antutu"] >= 1650000:
        category = "flagship"
    elif price_brl >= 2100 or soc["antutu"] >= 1100000:
        category = "upper_mid"
    elif price_brl >= 1050 or soc["antutu"] >= 500000:
        category = "midrange"
    else:
        category = "entry"

    prices = [float(h["price"]) for h in history if h.get("price") and float(h["price"]) > 300]
    if price_brl > 0:
        prices.append(price_brl)
    min_all = round(min(prices), 2) if prices else price_brl
    min_90d = round(min(prices[-90:]), 2) if prices else price_brl
    avg_30d = round(statistics.mean(prices[-30:]), 2) if prices else price_brl
    avg_90d = round(statistics.mean(prices[-90:]), 2) if prices else price_brl
    median_180d = round(statistics.median(prices[-180:]), 2) if prices else price_brl
    target_price = round(min(avg_90d * 0.92, min_90d * 1.04), 2) if prices else price_brl

    vs_avg_90d_pct = round(((price_brl - avg_90d) / avg_90d) * 100, 1) if avg_90d > 0 else 0.0
    vs_min_90d_pct = round(((price_brl - min_90d) / min_90d) * 100, 1) if min_90d > 0 else 0.0
    vs_target_brl = round(price_brl - target_price, 2)
    p_status = "great" if price_brl <= target_price else ("fair" if price_brl <= avg_90d * 1.03 else "high")

    return {
        "slug": raw["slug"],
        "name": name,
        "brand": brand,
        "line": line,
        "category": category,
        "os": os_name,
        "price_brl": round(price_brl, 2),
        "regular_price_brl": round(price_brl, 2),
        "store_name": raw.get("store_name") or "Loja BR",
        "offer_url": raw.get("offer_url") or "",
        "image_url": raw.get("image_url") or "",
        "num_parcels": raw.get("num_parcels") or 10,
        "total_parceled_brl": round(float(raw.get("total_parceled_brl") or price_brl), 2),
        "soc_name": soc["label"],
        "soc_arch": soc["arch"],
        "soc_nm": soc["nm"],
        "soc_single_score": soc["single"],
        "soc_multi_score": soc["multi"],
        "soc_gpu_score": soc["gpu"],
        "soc_antutu": soc["antutu"],
        "soc_npu_tops": soc["npu_tops"],
        "soc_sustained_pct": soc["sustained"],
        "perf_score": max(20, min(100, int(round((soc["antutu"] / 2400000.0) * 65 + (soc["single"] / 100.0) * 35)))),
        "ram_gb": ram_gb,
        "storage_gb": storage_gb,
        "storage_type": storage_type,
        "has_microsd": has_microsd,
        "screen_inches": round(screen_inches, 2),
        "screen_type": screen_type,
        "screen_hz": screen_hz,
        "screen_res": screen_res,
        "brightness_nits": brightness_nits,
        "is_oled": is_oled,
        "is_ltpo": is_ltpo,
        "display_score": display_score,
        "cam_main_mp": cam_main_mp,
        "cam_ultrawide_mp": cam_ultrawide_mp,
        "cam_front_mp": cam_front_mp,
        "cam_ois": cam_ois,
        "cam_zoom_optical": cam_zoom_optical,
        "cam_video_max": cam_video_max,
        "camera_score": camera_score,
        "battery_mah": battery_mah,
        "charge_w": charge_w,
        "wireless_charge_w": wireless_charge_w,
        "battery_hours_sot": battery_hours_sot,
        "charge_0_100_min": charge_0_100_min,
        "battery_score": battery_score,
        "has_5g": has_5g,
        "has_nfc": has_nfc,
        "has_esim": has_esim,
        "ip_rating": ip_rating,
        "os_updates_years": os_updates_years,
        "connectivity_score": connectivity_score,
        "longevity_score": longevity_score,
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


def fetch_zoom_smartphone_detail(hit, existing_history=None):
    slug = (hit.get("seoUrl") or "").strip().lower()
    raw_url = hit.get("url") or f"/celular/{slug}"
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
        print(f"Warning fetching smartphone {slug}: {e}")

    price_brl = float(best_offer.get("price") or hit.get("price") or 0.0)
    if price_brl <= 0 and ph_days:
        valid_days = []
        for d_item in ph_days:
            try:
                dp = float(d_item.get("price") or 0)
            except (TypeError, ValueError):
                dp = 0.0
            ds = str(d_item.get("date") or "")[:10]
            if ds and dp > 400:
                valid_days.append((ds, dp))
        if valid_days:
            valid_days.sort(key=lambda x: x[0])
            price_brl = valid_days[-1][1]
    if best_offer.get("imageUrl"):
        img_url = best_offer["imageUrl"]
    store_name = best_offer.get("sellerName") or "Zoom BR (Ref.)"
    num_parcels = best_offer.get("numParcels") or 10
    total_parceled = float(best_offer.get("totalParceledValue") or price_brl)

    floor_valid = max(320.0, price_brl * 0.38) if price_brl > 0 else 320.0
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

    return enrich_smartphone({
        "slug": slug,
        "name": prod_name,
        "price_brl": price_brl,
        "store_name": store_name,
        "offer_url": full_url,
        "image_url": img_url,
        "num_parcels": num_parcels,
        "total_parceled_brl": total_parceled,
        "attrs": attrs,
        "history": history,
    })


def build_smartphones_catalog(existing_smartphones=None):
    print("Fetching live Brazilian smartphone catalog & price histories from Zoom.com.br...")
    prev_hist_map = {}
    for ph in (existing_smartphones or []):
        if ph.get("slug") and ph.get("history"):
            prev_hist_map[ph["slug"]] = ph["history"]

    hits = fetch_zoom_smartphone_listings()
    print(f"Found {len(hits)} unique Zoom smartphones. Fetching details & daily price histories...")

    def _worker(hit):
        slug = (hit.get("seoUrl") or "").strip().lower()
        return fetch_zoom_smartphone_detail(hit, existing_history=prev_hist_map.get(slug))

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        phones = [item for item in ex.map(_worker, hits) if item and item.get("price_brl", 0) >= 400]

    print(f"Enriched {len(phones)} smartphones successfully.")
    return phones


def refresh_live_smartphone_prices(db):
    phones = db.get("smartphones") or []
    if not phones:
        return 0, 0
    hits = fetch_zoom_smartphone_listings()
    hit_by_slug = {(h.get("seoUrl") or "").strip().lower(): h for h in hits if h.get("seoUrl")}
    today_str = datetime.now().strftime("%Y-%m-%d")
    updated = 0
    dropped = 0

    for ph in phones:
        h = hit_by_slug.get(ph.get("slug"))
        if not h:
            continue
        new_p = float(h.get("price") or (h.get("bestOffer") or {}).get("price") or 0)
        if new_p < 400:
            continue
        old_p = float(ph.get("price_brl") or 0)
        if old_p > 0 and new_p < old_p * 0.99:
            dropped += 1
        ph["price_brl"] = round(new_p, 2)
        ph["regular_price_brl"] = round(new_p, 2)
        hist = ph.get("history")
        if isinstance(hist, list):
            if hist and hist[-1].get("date") == today_str:
                if new_p < float(hist[-1].get("price") or 999999):
                    hist[-1]["price"] = round(new_p, 2)
            else:
                hist.append({"date": today_str, "price": round(new_p, 2), "store": ph.get("store_name") or "zoom"})
                if len(hist) > 600:
                    ph["history"] = hist[-600:]
        updated += 1
    return updated, dropped


if __name__ == "__main__":
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "hardware_db.json")
    db = {}
    if os.path.exists(db_path):
        with open(db_path, "r", encoding="utf-8") as f:
            db = json.load(f)
    phones = build_smartphones_catalog(existing_smartphones=db.get("smartphones"))
    if phones:
        by_slug = {item.get("slug"): item for item in (db.get("smartphones") or []) if item.get("slug")}
        for item in phones:
            if item.get("slug"):
                by_slug[item["slug"]] = item
        fresh_slugs = {item.get("slug") for item in phones if item.get("slug")}
        db["smartphones"] = list(phones) + [v for k, v in by_slug.items() if k not in fresh_slugs]
        db["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        with open(db_path, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)
        print(f"Saved {len(db['smartphones'])} smartphones to {db_path}")
    else:
        print("Warning: 0 smartphones scraped (rate-limited/offline); preserving existing catalog.")
