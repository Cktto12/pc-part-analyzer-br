"""
Real-Time Flash Promo & Coupon Radar for GPU & Build Analyzer Pro.
Strictly isolated by region:
- Brazil ('br'): Pulls deals and coupons from Brazilian Telegram mirrors (@ofertasadrenaline, @peperaiohardware, etc.) -> data/promos_cache.json
- Mexico ('mx'): Pulls deals and MX-locked coupons from Promodescuentos.com, Cyberpuerta.mx, and DDTech.mx -> data/promos_cache_mx.json
"""
import os
import sys
import re
import html
import json
import time
import urllib.request
import urllib.parse
import concurrent.futures
from datetime import datetime, timezone

try:
    from config import get_market_config, get_promotion_channels, get_monetary_config
except Exception:
    get_market_config = None
    get_promotion_channels = None
    get_monetary_config = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DEFAULT_BR_CHANNELS = [
    {"id": "ofertasadrenaline", "name": "Ofertas Adrenaline"},
    {"id": "peperaiohardware",  "name": "Peperaio Hardware"},
    {"id": "iskandarsouza",     "name": "Iskandar Souza"},
    {"id": "benchpromos",       "name": "BenchPromos"},
    {"id": "kabumofertas",      "name": "KaBuM Ofertas"},
    {"id": "nerdofertas",       "name": "Nerd Ofertas"},
]

DEFAULT_SEARCH_QUERIES = [
    "", "RTX", "5060", "5070", "4060", "7600", "RX ", "Ryzen", "DDR4", "DDR5", "placa mãe", "B760", "H610", "B550", "B650", "Fonte", "notebook", "macbook", "nitro", "loq", "expirou", "acabou", "esgotou"
]

LAPTOP_CLUE_RE = re.compile(
    r"\b(notebook|laptop|macbook|ultrabook|ideapad|vivobook|zenbook|thinkpad|inspiron|galaxy\s*book|acer\s*nitro|nitro\s*v?1[56]|lenovo\s*loq|legion\s*5|dell\s*g15|tuf\s*gaming\s*[af]1[567]|predator\s*helios|avell|victus)\b",
    re.IGNORECASE,
)

LAPTOP_ACCESSORY_RE = re.compile(
    r"^\s*[^a-zA-Z0-9]*(?:power\s*bank|mochila|bolsa|suporte|base\s*(?:refrigerada|cooler)|cooler\s*para|capa|case|sleeve|pel[íi]cula|carregador|fonte\s*para|hub\s*usb|mouse|teclado|pendrive)|\b(?:para|p/)\s*notebook\b",
    re.IGNORECASE,
)

EXCLUDE_SYSTEM_RE = re.compile(
    r"\b(computador\s*completo|pc\s*completo|pc\s*gamer\s*armada|pc\s*gamer|gaming\s*pc|komplett-?pc|pc\s*komplett|desktop-?pc|all\s*in\s*one|console|playstation|ps5|xbox|monitor|tv\s|smart\s*tv|cadeira|silla|teclado|mouse|headset|smartphone|celular|iphone|galaxy\s*s)\b",
    re.IGNORECASE,
)

GPU_MATCH_RULES = [
    ("rtx-5090",         r"\b(?:rtx|geforce)?\s*5090\b"),
    ("rtx-5080",         r"\b(?:rtx|geforce)?\s*5080\b"),
    ("rtx-5070-ti",      r"\b(?:rtx|geforce)?\s*5070\s*ti\b"),
    ("rtx-5070",         r"\b(?:rtx|geforce)?\s*5070(?!\s*ti)\b"),
    ("rtx-5060-ti-16gb", r"\b(?:rtx|geforce)?\s*5060\s*ti\b.*?\b16\s*gb\b|\b16\s*gb\b.*?\b(?:rtx|geforce)?\s*5060\s*ti\b"),
    ("rtx-5060-ti-8gb",  r"\b(?:rtx|geforce)?\s*5060\s*ti\b(?!.*?\b16\s*gb\b)"),
    ("rtx-5060",         r"\b(?:rtx|geforce)?\s*5060(?!\s*ti)\b"),
    ("rtx-5050",         r"\b(?:rtx|geforce)?\s*5050\b"),
    ("rtx-4080-super",   r"\b(?:rtx|geforce)?\s*4080\s*super\b"),
    ("rtx-4080",         r"\b(?:rtx|geforce)?\s*4080(?!\s*super)\b"),
    ("rtx-4070-ti",      r"\b(?:rtx|geforce)?\s*4070\s*ti\b"),
    ("rtx-4070",         r"\b(?:rtx|geforce)?\s*4070(?!\s*ti)\b"),
    ("rtx-4060-ti-8gb",  r"\b(?:rtx|geforce)?\s*4060\s*ti\b"),
    ("rtx-4060",         r"\b(?:rtx|geforce)?\s*4060(?!\s*ti)\b"),
    ("rtx-3080-ti",      r"\brtx\s*3080\s*ti\b"),
    ("rtx-3080-12gb",    r"\brtx\s*3080\b.*?\b12\s*gb\b"),
    ("rtx-3080-10gb",    r"\brtx\s*3080(?!\s*ti)\b"),
    ("rtx-3070-ti",      r"\brtx\s*3070\s*ti\b"),
    ("rtx-3070",         r"\brtx\s*3070(?!\s*ti)\b"),
    ("rtx-3060-ti",      r"\brtx\s*3060\s*ti\b"),
    ("rtx-3060-12gb",    r"\brtx\s*3060(?!\s*ti)\b.*?\b12\s*gb\b|\b12\s*gb\b.*?\brtx\s*3060(?!\s*ti)\b"),
    ("rtx-3060-8gb",     r"\brtx\s*3060(?!\s*ti)\b.*?\b8\s*gb\b"),
    ("rtx-3060-12gb",    r"\brtx\s*3060(?!\s*ti)\b"),
    ("rtx-3050-8gb",     r"\brtx\s*3050\b.*?\b8\s*gb\b"),
    ("rtx-3050-6gb",     r"\brtx\s*3050\b"),
    ("rtx-2060-super",   r"\brtx\s*2060\s*super\b"),
    ("rtx-2060-12gb",    r"\brtx\s*2060\b.*?\b12\s*gb\b"),
    ("rtx-2060-6gb",     r"\brtx\s*2060(?!\s*super)\b"),
    ("rx-9070-xt",       r"\brx\s*9070\s*xt\b"),
    ("rx-9070-gre",      r"\brx\s*9070\s*gre\b"),
    ("rx-9070",          r"\brx\s*9070(?!\s*xt|\s*gre)\b"),
    ("rx-9060-xt-16gb",  r"\brx\s*9060\s*xt\b.*?\b16\s*gb\b|\b16\s*gb\b.*?\brx\s*9060\s*xt\b"),
    ("rx-9060-xt-8gb",   r"\brx\s*9060\s*xt\b"),
    ("rx-7900-xtx",      r"\brx\s*7900\s*xtx\b"),
    ("rx-7900-gre",      r"\brx\s*7900\s*gre\b"),
    ("rx-7800-xt",       r"\brx\s*7800\s*xt\b"),
    ("rx-7700-xt",       r"\brx\s*7700\s*xt\b"),
    ("rx-7600-xt",       r"\brx\s*7600\s*xt\b(?!.*?\b8\s*gb\b)"),
    ("rx-7650-gre",      r"\brx\s*7650\s*gre\b"),
    ("rx-7600",          r"\brx\s*7600(?!\s*xt)\b|\brx\s*7600\s*xt\b.*?\b8\s*gb\b"),
    ("rx-6750-xt",       r"\brx\s*6750\s*xt\b"),
    ("rx-6700-xt",       r"\brx\s*6700\s*xt\b"),
    ("rx-6600-xt",       r"\brx\s*6600\s*xt\b"),
    ("rx-6600",          r"\brx\s*6600(?!\s*xt)\b"),
    ("arc-b580",         r"\barc\s*b580\b"),
    ("arc-b570",         r"\barc\s*b570\b"),
]

CPU_MATCH_RULES = [
    ("ryzen-7-9800x3d",  r"\bryzen\s*7\s*9800x3d\b|\b9800x3d\b"),
    ("ryzen-7-7800x3d",  r"\bryzen\s*7\s*7800x3d\b|\b7800x3d\b"),
    ("ryzen-7-5700x3d",  r"\bryzen\s*7\s*5700x3d\b|\b5700x3d\b"),
    ("ryzen-5-5500x3d",  r"\b5500x3d\b"),
    ("ryzen-7-9700x",    r"\bryzen\s*7\s*9700x\b|\b9700x\b"),
    ("ryzen-5-9600x",    r"\bryzen\s*5\s*9600x\b|\b9600x\b"),
    ("ryzen-7-7700x",    r"\bryzen\s*7\s*7700x\b"),
    ("ryzen-7-7700",     r"\bryzen\s*7\s*7700(?!\s*x)\b"),
    ("ryzen-5-7600x",    r"\bryzen\s*5\s*7600x\b"),
    ("ryzen-5-7600",     r"\bryzen\s*5\s*7600(?!\s*x)\b"),
    ("ryzen-7-5700x",    r"\bryzen\s*7\s*5700x(?!3d)\b"),
    ("ryzen-7-5700",     r"\bryzen\s*7\s*5700(?!\s*x|\s*g)\b"),
    ("ryzen-5-5600x",    r"\bryzen\s*5\s*5600x(?!t)\b"),
    ("ryzen-5-5600gt",   r"\bryzen\s*5\s*5600gt\b"),
    ("ryzen-5-5600g",    r"\bryzen\s*5\s*5600g(?!t|e)\b"),
    ("ryzen-5-5600",     r"\bryzen\s*5\s*5600(?!\s*x|\s*g)\b"),
    ("ryzen-5-5500",     r"\bryzen\s*5\s*5500(?!x3d)\b"),
    ("ryzen-3-3200g",    r"\bryzen\s*3\s*3200g\b|\b3200g\b"),
    ("core-i5-14600kf",  r"\bi5[\s-]*14600kf\b"),
    ("core-i5-14400f",   r"\bi5[\s-]*14400f\b"),
    ("core-i5-13400f",   r"\bi5[\s-]*13400f\b"),
    ("core-i5-12400f",   r"\bi5[\s-]*12400f\b"),
]

RAM_MATCH_RULES = [
    ("ddr5-32gb-6000",   r"\bddr5\b.*?\b(32\s*gb|2\s*x\s*16\s*gb)\b.*?\b6000\b|\b(32\s*gb|2\s*x\s*16\s*gb)\b.*?\bddr5\b.*?\b6000\b"),
    ("ddr5-32gb-5600",   r"\bddr5\b.*?\b(32\s*gb|2\s*x\s*16\s*gb)\b(?!.*?\b6000\b)"),
    ("ddr5-16gb-6000",   r"\bddr5\b.*?\b(16\s*gb|2\s*x\s*8\s*gb)\b.*?\b6000\b|\b(16\s*gb|2\s*x\s*8\s*gb)\b.*?\bddr5\b.*?\b6000\b"),
    ("ddr5-16gb-5600",   r"\bddr5\b.*?\b(16\s*gb|2\s*x\s*8\s*gb)\b(?!.*?\b6000\b)"),
    ("ddr4-32gb-3200",   r"\bddr4\b.*?\b(32\s*gb|2\s*x\s*16\s*gb)\b"),
    ("ddr4-16gb-3200",   r"\bddr4\b.*?\b(16\s*gb|2\s*x\s*8\s*gb)\b"),
    ("ddr4-8gb-3200",    r"\bddr4\b.*?\b8\s*gb\b(?!\s*x\s*2)"),
]

# Legacy single-cache alias kept for server.py compatibility, backed by per-region cache
_PROMO_CACHE = {"updated_at": 0, "data": None}
_PROMO_CACHE_BY_REGION = {
    "br": {"updated_at": 0, "data": None},
    "mx": {"updated_at": 0, "data": None},
    "eu": {"updated_at": 0, "data": None},
}


def parse_price_number(s, monetary=None):
    s = str(s).strip()
    if not monetary and get_monetary_config:
        monetary = get_monetary_config()
    monetary = monetary or {}
    dec_sep = monetary.get("decimal_separator", ",")

    if dec_sep == ",":
        if "," in s and "." in s:
            s = s.replace(".", "").replace(",", ".")
        elif "," in s:
            s = s.replace(",", ".")
        elif "." in s:
            parts = s.split(".")
            if len(parts[-1]) == 3:
                s = s.replace(".", "")
    else:
        s = s.replace(",", "")

    try:
        return float(s)
    except ValueError:
        return 0.0

parse_brl_number = parse_price_number


def extract_price_and_coupon(lines):
    candidates = []
    coupon_info = None
    coupon_code = None
    detected_discount_brl = 0.0
    detected_discount_pct = 0.0

    full_text = "\n".join(lines)

    m_code = re.search(
        r"(?:cupom|cupon|cup[oó]n|c[oó]digo)\s*(?:de\s*desconto|de\s*descuento)?\s*[:\-]?\s*\b([A-Z0-9]{4,18})\b",
        full_text,
        re.IGNORECASE,
    )
    if m_code:
        word = m_code.group(1).upper()
        if word not in {"PARA", "ESTA", "ESSA", "HOJE", "AQUI", "MAIS", "PELO", "SITE", "LOJA", "SHOPEE", "KABUM", "MAGALU", "MERCADO", "HTTPS", "HTTP", "WWW", "COM", "BR", "MX"}:
            coupon_code = word

    # extract_price_and_coupon parses Brazilian Telegram channel messages -> always use BRL format
    monetary = {"decimal_separator": ","}
    min_val = 18.0
    max_val = 45000.0
    price_pat = r"R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]{3,5}(?:,[0-9]{1,2})?)"
    cash_keywords = ["por r$", "valor", "💵", "💰", "pix", "à vista", "a vista", "no app", "🔥"]

    for line in lines:
        m_disc = re.search(r"(?:cupom\s*de|desconto\s*de|menos|abatimento|off\s*de)\s*R?\$?\s*([0-9]{2,4})", line, re.I) or re.search(r"R\$\s*([0-9]{2,4})\s*(?:off|de\s*desconto)", line, re.I)
        if m_disc:
            try:
                d_val = float(m_disc.group(1))
                if 30 <= d_val <= 3000:
                    detected_discount_brl = max(detected_discount_brl, d_val)
            except ValueError:
                pass
        m_pct = re.search(r"\b([1-9][0-9]?)\s*%\s*(?:off|de\s*desconto|de\s*descuento)", line, re.I)
        if m_pct:
            try:
                p_val = float(m_pct.group(1))
                if 3 <= p_val <= 40:
                    detected_discount_pct = max(detected_discount_pct, p_val)
            except ValueError:
                pass

        low = line.lower()
        if any(k in low for k in ["cupom", "cupón", "cupon", "🎟", "🏷", "resgate", "moedas"]):
            if not coupon_info:
                cleaned_c = re.sub(r"https?://\S+", "", line).strip(" -•🎟️🏷️💵🔥*")
                if len(cleaned_c) >= 4:
                    coupon_info = cleaned_c

        for m in re.finditer(price_pat, line, re.IGNORECASE):
            val = parse_price_number(m.group(1), monetary)
            if val < min_val or val > max_val:
                continue
            start, end = m.span()
            before = line[max(0, start - 22):start].lower()
            after = line[end:min(len(line), end + 22)].lower()

            if re.search(r"\b(off|desconto|descuento|bonificaci[oó]n)\b", after) or re.search(r"\b(cupom\s*de|desconto\s*de|resgate|abatimento)\b", before):
                if not detected_discount_brl or val > detected_discount_brl:
                    detected_discount_brl = max(detected_discount_brl, val)
                continue
            if re.search(r"\d+\s*x\s*(?:de\s*)?$", before) or re.search(r"\bmsi\b", after):
                continue

            prio = 1
            if any(k in low for k in cash_keywords):
                prio = 3
            elif "parcelado" in low or "12x" in low or "10x" in low or "meses sin intereses" in low:
                prio = 0
            candidates.append((prio, val))

    if not candidates:
        is_conditional_voucher = bool(re.search(r"\b(no\s*app|pelo\s*app|aplicativo|moedas|live|resgate|resgatem|exclusivo\s*app)\b", full_text, re.I))
        return None, None, 0.0, coupon_code, coupon_info, is_conditional_voucher

    max_prio = max(c[0] for c in candidates)
    best_vals = [c[1] for c in candidates if c[0] == max_prio]
    final_price = min(best_vals)

    # In Brazilian promo groups (@peperaiohardware, @iskandarsouza, @ofertasadrenaline, etc.),
    # the announced price (e.g. "💵 R$ 1683 no app" or "💰 R$ 1.729") is ALREADY the final price with coupon.
    # Never subtract the coupon a second time from final_price! Instead, compute raw_price (price without coupon).
    if len(set(best_vals)) > 1 and max(best_vals) > final_price:
        raw_price = max(best_vals)
        discount_applied = round(raw_price - final_price, 2)
    elif detected_discount_brl > 0 and detected_discount_brl < final_price * 0.45:
        raw_price = round(final_price + detected_discount_brl, 2)
        discount_applied = round(detected_discount_brl, 2)
    elif 0 < detected_discount_pct <= 40:
        raw_price = round(final_price / (1.0 - detected_discount_pct / 100.0), 2)
        discount_applied = round(raw_price - final_price, 2)
    else:
        raw_price = final_price
        discount_applied = 0.0

    is_conditional_voucher = bool(re.search(r"\b(no\s*app|pelo\s*app|aplicativo|moedas|live|resgate|resgatem|exclusivo\s*app)\b", full_text, re.I))
    return round(final_price, 2), round(raw_price, 2), round(discount_applied, 2), coupon_code, coupon_info, is_conditional_voucher


_MOBO_CHIPSET_SOCKET = {
    "h610": "LGA1700", "b660": "LGA1700", "b760": "LGA1700", "z690": "LGA1700", "z790": "LGA1700",
    "h810": "LGA1851", "b860": "LGA1851", "z890": "LGA1851",
    "a520": "AM4", "b450": "AM4", "b550": "AM4", "x570": "AM4",
    "a620": "AM5", "b650": "AM5", "b840": "AM5", "b850": "AM5", "x670": "AM5", "x870": "AM5",
}


def extract_mobo_specs_from_text(text):
    t = text or ""
    low = t.lower()
    m_chip = re.search(r"\b((?:h610|b660|b760|z690|z790|h810|b860|z890|a520|b450|b550|x570|a620|b650|b840|b850|x670|x870)[a-z0-9\-]*)\b", low)
    chipset = m_chip.group(1).upper() if m_chip else ""
    chip_base = chipset[:4].lower() if chipset else ""

    socket = None
    if re.search(r"\blga\s*1700\b", low):
        socket = "LGA1700"
    elif re.search(r"\blga\s*1851\b", low):
        socket = "LGA1851"
    elif re.search(r"\bam5\b", low):
        socket = "AM5"
    elif re.search(r"\bam4\b", low):
        socket = "AM4"
    elif chip_base in _MOBO_CHIPSET_SOCKET:
        socket = _MOBO_CHIPSET_SOCKET[chip_base]

    memory_type = None
    if re.search(r"\bddr4\b|\bd4\b", low):
        memory_type = "DDR4"
    elif re.search(r"\bddr5\b|\bd5\b", low):
        memory_type = "DDR5"
    elif socket == "AM4":
        memory_type = "DDR4"
    elif socket in ("AM5", "LGA1851"):
        memory_type = "DDR5"

    brand = ""
    for b in ("ASUS", "MSI", "Gigabyte", "ASRock", "Biostar", "Maxsun", "Colorful", "SuperFrame", "Pichau", "Mancer", "Husky"):
        if b.lower() in low:
            brand = b
            break

    return {"brand": brand, "socket": socket, "memory_type": memory_type, "chipset": chipset}


def match_mobo_catalog_item(text, db):
    t = text or ""
    low = t.lower()
    if re.search(r"\bkit\s*upgrade\b|placa[\s-]*m[ãa]e[\s\S]{0,80}?\+\s*(?:processador|ryzen|core\s*i[3579]|mem[óo]ria)|\bkit\s*(?:com\s+)?placa[\s-]*m[ãa]e\b", low):
        return None, None
    has_mobo_word = bool(re.search(r"placa[\s-]*m[ãa]e|motherboard|\bmobo\b", low))
    specs = extract_mobo_specs_from_text(t)
    has_non_mobo_primary = bool(re.search(r"^\s*[^a-z0-9]*(?:processador|cpu|placa\s*de\s*v[íi]deo|mem[óo]ria)\b|\b(?:rtx|rx\s*\d|radeon|geforce|ryzen|core\s*i[3579])\b", low))
    if not has_mobo_word and (not specs["chipset"] or has_non_mobo_primary):
        return None, None

    mobos = [m for m in (db.get("motherboards") or []) if m.get("slug") != "x99-p4-lga2011"]
    chip_base = (specs["chipset"] or "")[:4].lower()
    best_item = None
    best_score = 0
    for m in mobos:
        m_sock = m.get("socket") or ""
        m_mem = (m.get("memory_type") or "").upper()
        if specs["socket"] and m_sock and m_sock != specs["socket"]:
            continue
        if specs["memory_type"] and m_mem and m_mem != specs["memory_type"]:
            continue
        if specs["brand"] and m.get("brand") and specs["brand"].lower() != m.get("brand", "").lower():
            continue
        m_name = (m.get("name") or "").lower()
        m_slug = (m.get("slug") or "").lower()
        score = 0
        if specs["socket"] and m_sock == specs["socket"]:
            score += 10
        if specs["memory_type"] and m_mem == specs["memory_type"]:
            score += 10
        if chip_base and (chip_base in m_name or chip_base in m_slug):
            score += 35
        if specs["brand"] and specs["brand"].lower() in (m.get("brand", "").lower() + " " + m_name):
            score += 20
        for tok in re.findall(r"[a-z0-9]{3,}", m_slug):
            if tok not in ("pro", "ddr4", "ddr5", "wifi", "plus", "gaming") and tok in low:
                score += 12
        if score > best_score:
            best_score = score
            best_item = m

    if best_item and best_score >= 35:
        item_out = dict(best_item)
        if specs["chipset"]:
            item_out["_chipset"] = specs["chipset"]
        return "mobo", item_out

    if not has_mobo_word and not specs["chipset"]:
        return None, None

    pool = [
        float(m.get("price_brl") or 0) for m in mobos
        if float(m.get("price_brl") or 0) > 0
        and (not specs["socket"] or m.get("socket") == specs["socket"])
        and (not specs["memory_type"] or (m.get("memory_type") or "").upper() == specs["memory_type"])
    ]
    if not pool and specs["socket"]:
        pool = [float(m.get("price_brl") or 0) for m in mobos if float(m.get("price_brl") or 0) > 0 and m.get("socket") == specs["socket"]]
    med_price = round(sorted(pool)[len(pool) // 2], 2) if pool else 0.0
    label_parts = [p for p in ("Placa-Mãe", specs["brand"], specs["chipset"] or specs["socket"], specs["memory_type"]) if p]
    synth_slug = f"mobo-{(specs['socket'] or 'any').lower()}-{(specs['memory_type'] or 'any').lower()}"
    return "mobo", {
        "slug": synth_slug,
        "name": " ".join(label_parts),
        "brand": specs["brand"],
        "socket": specs["socket"] or "",
        "memory_type": specs["memory_type"] or "",
        "chipset": specs["chipset"],
        "price_brl": med_price,
    }


def extract_psu_specs_from_text(text):
    t = text or ""
    low = t.lower()
    m_w = re.search(r"\b([4-9]\d0|1[0-6]\d0)\s*w\b", low)
    watts = int(m_w.group(1)) if m_w else 0

    modularity = "Non-Modular"
    if re.search(r"semi[\s-]*modular", low):
        modularity = "Semi-Modular"
    elif re.search(r"full[\s-]*modular|\bmodular\b", low) and "n\u00e3o modular" not in low:
        modularity = "Modular"

    cert = ""
    for pat, label in (
        (r"80\s*(?:plus|\+)\s*platinum", "80 Plus Platinum"),
        (r"80\s*(?:plus|\+)\s*gold", "80 Plus Gold"),
        (r"80\s*(?:plus|\+)\s*bronze", "80 Plus Bronze"),
        (r"80\s*(?:plus|\+)\s*(?:white|standard)", "80 Plus White"),
    ):
        if re.search(pat, low):
            cert = label
            break

    brand = ""
    for b in ("Corsair", "MSI", "XPG", "Cooler Master", " Seasonic", "EVGA", "Gigabyte", "ASUS", "Thermaltake", "Gamemax", "Pichau", "Mancer", "SuperFrame", "Redragon", "Duex", "Rise Mode", "DeepCool"):
        if b.strip().lower() in low:
            brand = b.strip()
            break

    return {"brand": brand, "watts": watts, "modularity": modularity, "cert": cert}


def match_psu_catalog_item(text, db):
    t = text or ""
    low = t.lower()
    if re.search(r"fonte\s*(?:para|p/|de)\s*(?:notebook|monitor|celular|led|cftv|xbox|ps[45]|carregador)|\bnobreak\b|\bestabilizador\b", low):
        return None, None
    if not re.search(r"\bfonte\b", low):
        return None, None
    specs = extract_psu_specs_from_text(t)
    watts = specs["watts"]
    if not watts:
        return None, None

    psus = db.get("psus") or []
    best_item = None
    best_score = 0
    for ps in psus:
        ps_w = int(ps.get("watts") or 0)
        if ps_w != watts:
            continue
        if specs["brand"] and ps.get("brand") and specs["brand"].lower() != ps.get("brand", "").lower():
            continue
        ps_name = (ps.get("name") or "").lower()
        ps_slug = (ps.get("slug") or "").lower()
        score = 15
        if specs["brand"] and specs["brand"].lower() in ((ps.get("brand") or "").lower() + " " + ps_name):
            score += 25
        if specs["modularity"] and (ps.get("modularity") or "") == specs["modularity"]:
            score += 10
        for tok in re.findall(r"[a-z0-9]{3,}", ps_slug):
            if tok != f"{watts}w" and tok in low:
                score += 15
        if score > best_score:
            best_score = score
            best_item = ps

    if best_item and best_score >= 30:
        return "psu", best_item

    pool = [float(p.get("price_brl") or 0) for p in psus if float(p.get("price_brl") or 0) > 0 and int(p.get("watts") or 0) == watts]
    med_price = round(sorted(pool)[len(pool) // 2], 2) if pool else 0.0
    label_parts = [p for p in ("Fonte", specs["brand"], f"{watts}W", specs["cert"]) if p]
    return "psu", {
        "slug": f"psu-{watts}w",
        "name": " ".join(label_parts),
        "brand": specs["brand"],
        "watts": watts,
        "modularity": specs["modularity"],
        "certs": [specs["cert"]] if specs["cert"] else [],
        "price_brl": med_price,
    }


def extract_item_specs(kind, item, cat_item):
    kind = (kind or "gpu").lower()
    cat = cat_item or {}
    txt = f"{item.get('title', '')} {item.get('head_text', '')}".strip()
    if kind == "gpu":
        return {"brand": cat.get("brand") or "", "vram_gb": cat.get("vram_gb") or 0}
    if kind == "cpu":
        name_l = (cat.get("name") or "").lower()
        brand = "AMD" if ("ryzen" in name_l or "threadripper" in name_l or "athlon" in name_l) else ("Intel" if ("core" in name_l or "xeon" in name_l or "intel" in name_l) else "")
        return {"brand": brand, "socket": cat.get("socket") or "", "ddr": cat.get("ddr") or ""}
    if kind == "ram":
        return {"memory_type": (cat.get("memory_type") or "").upper(), "capacity_gb": cat.get("capacity_gb") or 0, "speed_mtps": cat.get("speed_mtps") or 0}
    if kind == "mobo":
        parsed = extract_mobo_specs_from_text(txt)
        resolved_sock = (parsed["socket"] or cat.get("socket") or "").upper()
        # Dual-DDR sockets (e.g. LGA1700) exist in both DDR4 and DDR5 variants; if the post didn't
        # explicitly mention DDR4/D4 or DDR5/D5, mark memory_type ambiguous instead of assuming the catalog match.
        if resolved_sock in ("AM4", "AM5", "LGA1851") or parsed["memory_type"]:
            resolved_mem = (parsed["memory_type"] or cat.get("memory_type") or "").upper()
            mem_ambiguous = False
        else:
            resolved_mem = ""
            mem_ambiguous = True
        return {
            "brand": cat.get("brand") or parsed["brand"] or "",
            "socket": resolved_sock,
            "memory_type": resolved_mem,
            "memory_type_ambiguous": mem_ambiguous,
            "chipset": cat.get("_chipset") or cat.get("chipset") or parsed["chipset"] or "",
        }
    if kind == "psu":
        parsed = extract_psu_specs_from_text(txt)
        certs = cat.get("certs") or ([] if not parsed["cert"] else [parsed["cert"]])
        raw_mod = cat.get("modularity") or ""
        mod = parsed["modularity"] if (not raw_mod or raw_mod.startswith("$")) else raw_mod
        return {
            "brand": cat.get("brand") or parsed["brand"] or "",
            "watts": int(cat.get("watts") or parsed["watts"] or 0),
            "modularity": mod or "Non-Modular",
            "cert": certs[0] if certs else parsed["cert"] or "",
        }
    if kind == "laptop":
        return {"brand": cat.get("brand") or "", "ram_gb": cat.get("ram_gb") or 0, "gpu_is_dedicated": bool(cat.get("gpu_is_dedicated"))}
    return {}


def match_laptop_catalog_item(text, db):
    laptops = db.get("laptops") or []
    if not laptops or LAPTOP_ACCESSORY_RE.search(text or ""):
        return None, None

    low = (text or "").lower()
    m_gpu = re.search(r"\b(rtx\s*(?:5080|5070\s*ti|5070|5060|5050|4080|4070|4060|4050|3060|3050|2050)|gtx\s*1650)\b", low)
    txt_gpu = re.sub(r"\s+", " ", m_gpu.group(1)).strip() if m_gpu else ""
    m_cpu = re.search(r"\b(i[3579][-\s]*\d{4,5}[a-z]*|ultra\s*[x579][-\s]*\d{3}[a-z]*|ryzen\s*[3579][-\s]*\d{4}[a-z]*|m[1-5](?:\s*(?:pro|max))?)\b", low)
    txt_cpu = re.sub(r"[-\s]+", "", m_cpu.group(1)).lower() if m_cpu else ""
    m_ram = re.search(r"\b(8|16|24|32)\s*gb\b", low)
    txt_ram = int(m_ram.group(1)) if m_ram else 0

    best_score = 0
    best_item = None
    for lap in laptops:
        l_name = (lap.get("name") or "").lower()
        l_slug = (lap.get("slug") or "").lower()
        l_brand = (lap.get("brand") or "").lower()
        l_cpu = re.sub(r"[-\s]+", "", (lap.get("cpu_name") or "").lower())
        l_gpu = re.sub(r"\s+", " ", (lap.get("gpu_name") or "").lower())
        score = 0

        if l_brand and l_brand in low:
            score += 18
        elif l_brand:
            score -= 12

        for kw in ["macbook pro", "macbook air", "galaxy book6", "galaxy book4", "vivobook go", "vivobook", "zenbook", "ideapad slim", "ideapad", "loq-e", "loq", "nitro v16", "nitro v15", "nitro", "tuf gaming", "predator helios", "alienware", "inspiron", "aspire go", "yoga", "v14", "g15"]:
            if kw in low and (kw in l_name or kw in l_slug):
                score += 30
            elif kw in low and kw not in l_name and kw not in l_slug:
                score -= 10

        # Exact SKU match (e.g. 83KH0002BR, ANV15, NP750XGJ, E1504FA)
        for sku_m in re.findall(r"\b([a-z0-9]{6,14})\b", low):
            if any(c.isdigit() for c in sku_m) and any(c.isalpha() for c in sku_m) and sku_m in l_name:
                score += 45

        if txt_gpu:
            if txt_gpu in l_gpu:
                score += 36
            else:
                score -= 55
        elif "rtx " in l_gpu or "gtx " in l_gpu:
            score -= 22

        if txt_cpu:
            if txt_cpu in l_cpu or txt_cpu in re.sub(r"[-\s]+", "", l_name):
                score += 26
            else:
                score -= 22

        if txt_ram and lap.get("ram_gb") == txt_ram:
            score += 10

        if score > best_score:
            best_score = score
            best_item = lap

    if best_item and best_score >= 45:
        return "laptop", best_item
    return None, None


def match_catalog_item(title_and_first_lines, db):
    if LAPTOP_CLUE_RE.search(title_and_first_lines or "") and not LAPTOP_ACCESSORY_RE.search(title_and_first_lines or ""):
        return match_laptop_catalog_item(title_and_first_lines, db)

    has_component_clue = bool(re.search(r"\b(placa\s*de\s*v[íi]deo|tarjeta\s*de\s*video|tarjeta\s*gr[áa]fica|gpu|rtx|geforce|radeon|ryzen|core\s*i[3579]|intel\s*core|ddr[45]|mem[óo]ria\s*ram|procesador|placa[\s-]*m[ãa]e|motherboard|mobo|fonte)\b", title_and_first_lines, re.I))
    if not has_component_clue and EXCLUDE_SYSTEM_RE.search(title_and_first_lines):
        return None, None

    is_explicit_mobo = bool(re.search(r"placa[\s-]*m[ãa]e|motherboard|\bmobo\b", title_and_first_lines or "", re.I)) and not re.search(r"\bkit\s*upgrade\b|\+\s*(?:processador|ryzen|core\s*i)", title_and_first_lines or "", re.I)
    if is_explicit_mobo:
        mkind, mitem = match_mobo_catalog_item(title_and_first_lines, db)
        if mkind and mitem:
            return mkind, mitem

    for slug, pat in GPU_MATCH_RULES:
        if re.search(pat, title_and_first_lines, re.IGNORECASE):
            gpu = next((g for g in db.get("gpus", []) if g["slug"] == slug), None)
            if gpu:
                return "gpu", gpu

    for slug, pat in CPU_MATCH_RULES:
        if re.search(pat, title_and_first_lines, re.IGNORECASE):
            cpu = next((c for c in db.get("cpus", []) if c["slug"] == slug), None)
            if cpu:
                return "cpu", cpu

    mkind, mitem = match_mobo_catalog_item(title_and_first_lines, db)
    if mkind and mitem:
        return mkind, mitem

    pkind, pitem = match_psu_catalog_item(title_and_first_lines, db)
    if pkind and pitem:
        return pkind, pitem

    for slug, pat in RAM_MATCH_RULES:
        if re.search(pat, title_and_first_lines, re.IGNORECASE):
            ram = next((r for r in db.get("rams", []) if r["slug"] == slug), None)
            if ram:
                return "ram", ram

    return None, None


def infer_br_store_name(url_str, title_str=""):
    u = (url_str or "").lower()
    t = (title_str or "").lower()
    if "kabum" in u or "kabum" in t: return "KaBuM!"
    if "pichau" in u or "pichau" in t: return "Pichau"
    if "terabyte" in u or "terabyte" in t: return "Terabyte"
    if "amazon.com.br" in u or "amzn.to" in u or "amazon" in t: return "Amazon BR"
    if "mercadolivre" in u or "meli.la" in u or "mercado livre" in t: return "Mercado Livre"
    if "shopee" in u or "shopee" in t: return "Shopee"
    if "magalu" in u or "magazine" in u: return "Magalu"
    return "E-commerce BR"


def fetch_channel_query(ch_id, ch_name, query=""):
    q_param = f"?q={urllib.parse.quote(query)}" if query else ""
    url = f"https://t.me/s/{ch_id}{q_param}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
        },
    )
    try:
        raw = urllib.request.urlopen(req, timeout=6).read().decode("utf-8", errors="ignore")
    except Exception:
        return []

    results = []
    parts = re.split(r'<div class="tgme_widget_message_wrap', raw)[1:]
    for part in parts:
        post_m = re.search(r'data-post="([^"]+)"', part)
        post_id = post_m.group(1) if post_m else None
        if not post_id:
            continue

        txt_m = re.search(r'<div class="tgme_widget_message_text[^>]*>(.*?)</div>', part, re.DOTALL)
        if not txt_m:
            continue
        raw_html = txt_m.group(1)

        raw_hrefs = re.findall(r'href="(https?://[^"]+)"', raw_html)
        footer_exclusions = (
            "t.me/", "bit.ly/canal", "bit.ly/ofertas", "bit.ly/ofeertas",
            "nerdofertas.com/t", "linkmc.click", "adrena.click/ofertas",
            "alertadaspromobot", "linktr.ee", "whatsapp.com", "chat.whatsapp.com",
            "instagram.com", "youtube.com", "tiktok.com", "discord.gg", "x.com/", "twitter.com/"
        )
        try:
            from coupon_tracker import unwrap_affiliate_url as _unwrap_aff
        except Exception:
            _unwrap_aff = lambda u: html.unescape((u or "").strip())

        product_links = []
        for h in raw_hrefs:
            decoded_h = _unwrap_aff(h)
            if any(x in decoded_h.lower() or x in h.lower() for x in footer_exclusions):
                continue
            product_links.append(decoded_h)

        text_with_lines = re.sub(r"<br\s*/?>", "\n", raw_html, flags=re.IGNORECASE)
        clean_text = html.unescape(re.sub(r"<[^>]+>", "", text_with_lines))
        lines = [ln.strip() for ln in clean_text.splitlines() if ln.strip() and ln.strip() != "⠀"]
        if not lines:
            continue

        dt_m = re.search(r'<time datetime="([^"]+)"', part)
        iso_dt = dt_m.group(1) if dt_m else ""

        img_m = re.search(r'tgme_widget_message_photo_wrap[^>]*style="[^"]*background-image:url\([\'"]?(https?://[^\'"\)]+)', part)
        image_url = img_m.group(1) if img_m else None

        title_lines = [
            ln for ln in lines[:4]
            if len(re.sub(r"[^a-zA-Z0-9]", "", ln)) >= 6
            and not re.match(r"^(baixa|baixou|parcelado|cupom|oferta|promo|#)", ln.strip(" ⭐️🔥🚨⚡"), re.IGNORECASE)
        ]
        title = (title_lines[0] if title_lines else lines[0]).strip(" ⭐️🔥🚨⚡🔹")

        price, raw_price, discount_applied, coupon_code, coupon_info, is_conditional_voucher = extract_price_and_coupon(lines)
        if not price:
            continue

        def _score_link(idx_u):
            idx, u = idx_u
            ul = u.lower()
            s = 0
            if any(st in ul for st in ("kabum.com.br", "terabyteshop.com.br", "pichau.com.br", "amazon.com.br", "amzn.to", "mercadolivre.com.br", "meli.la", "s.shopee.com.br", "shopee.com.br", "magazineluiza.com.br", "magazinevoce.com.br", "divulgador.magalu.com", "gigantec.com.br", "patoloco.com.br")):
                s += 50
            if any(pt in ul for pt in ("/produto/", "/dp/", "/mlb", "benchpromos.com.br", "seuhardware", "aoferta.net", "tidd.ly")):
                s += 25
            return (s, idx)

        ranked_links = sorted(enumerate(product_links), key=_score_link, reverse=True)
        buy_url = ranked_links[0][1] if ranked_links else f"https://t.me/{post_id}"
        alt_coupon_url = next((u for _, u in ranked_links if u != buy_url), None) if len(ranked_links) > 1 else None
        results.append({
            "post_id": post_id,
            "channel_id": ch_id,
            "channel_name": ch_name,
            "store_name": infer_br_store_name(buy_url, clean_text),
            "post_url": f"https://t.me/{post_id}",
            "timestamp": iso_dt,
            "title": title[:160],
            "head_text": " ".join(lines[:3])[:260],
            "raw_text": clean_text[:400],
            "price_brl": price,
            "raw_price_brl": raw_price,
            "discount_applied": discount_applied,
            "coupon_code": coupon_code,
            "coupon_info": coupon_info,
            "is_conditional_voucher": is_conditional_voucher,
            "image_url": image_url,
            "buy_url": buy_url,
            "coupon_url": alt_coupon_url,
            "region_id": "br"
        })
    return results


def fetch_mexico_native_promotions():
    """
    Scrapes live Mexican hardware deals and MX-locked coupons from:
    1. Promodescuentos.com (Tarjetas Gráficas & Componentes de PC)
    2. Cyberpuerta.mx live discounted GPU/CPU listings
    3. DDTech.mx live GPU/CPU listings
    """
    posts = []
    seen_ids = set()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "es-MX,es;q=0.9,en-US;q=0.8",
    }

    # 1. Promodescuentos.com (Mexico's largest community deal & coupon platform)
    pd_urls = [
        ("promodescuentos_gpus", "Promodescuentos GPUs", "https://www.promodescuentos.com/search?q=tarjeta+de+video"),
        ("promodescuentos_gpus", "Promodescuentos GPUs", "https://www.promodescuentos.com/search?q=tarjeta+grafica"),
        ("promodescuentos_gpus", "Promodescuentos GPUs", "https://www.promodescuentos.com/grupo/tarjetas-graficas"),
        ("promodescuentos_pc",   "Promodescuentos PC",   "https://www.promodescuentos.com/search?q=procesador"),
        ("promodescuentos_pc",   "Promodescuentos PC",   "https://www.promodescuentos.com/search?q=ryzen"),
        ("promodescuentos_pc",   "Promodescuentos PC",   "https://www.promodescuentos.com/search?q=ddr5"),
        ("promodescuentos_pc",   "Promodescuentos PC",   "https://www.promodescuentos.com/search?q=rtx"),
        ("promodescuentos_pc",   "Promodescuentos PC",   "https://www.promodescuentos.com/search?q=cyberpuerta"),
    ]
    for ch_id, ch_name, url in pd_urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw_html = resp.read().decode("utf-8", errors="ignore")

            for m in re.finditer(r"data-vue[23]='(\{[\s\S]*?\})'\s*>", raw_html):
                try:
                    payload = json.loads(m.group(1))
                    th = payload.get("props", {}).get("thread") or {}
                    tid = str(th.get("threadId") or "")
                    if not tid or tid in seen_ids or th.get("isExpired"):
                        continue

                    price = float(th.get("price") or 0)
                    if price < 350 or price > 95000:
                        continue

                    title = (th.get("title") or "").strip()
                    if not title:
                        continue

                    # Filter out appliances / food processors
                    if re.search(r"\b(procesador\s*de\s*alimentos|licuadora|freidora|air\s*fryer|cafetera|silla|sill[oó]n|refrigerador|lavadora)\b", title, re.I):
                        continue

                    seen_ids.add(tid)
                    voucher = (th.get("voucherCode") or "").strip() or None
                    merchant = (th.get("merchant") or {}).get("merchantName") or "Tienda MX"
                    pub_ts = th.get("publishedAt") or int(time.time())
                    iso_dt = datetime.fromtimestamp(pub_ts, tz=timezone.utc).isoformat()
                    share_url = th.get("shareableLink") or th.get("url") or f"https://www.promodescuentos.com/ofertas/{tid}"
                    next_best = float(th.get("nextBestPrice") or price)

                    posts.append({
                        "post_id": f"pdmx/{tid}",
                        "channel_id": ch_id,
                        "channel_name": ch_name,
                        "store_name": merchant,
                        "post_url": share_url,
                        "timestamp": iso_dt,
                        "title": title[:160],
                        "head_text": f"{title} ${price:,.0f} MXN",
                        "raw_text": f"{title} - {merchant} - ${price:,.0f} MXN",
                        "price_brl": round(price),
                        "raw_price_brl": round(max(price, next_best)),
                        "discount_applied": round(max(0.0, next_best - price)),
                        "coupon_code": voucher,
                        "coupon_info": f"Cupón MX: {voucher}" if voucher else None,
                        "buy_url": share_url,
                        "coupon_url": None,
                        "region_id": "mx"
                    })
                except Exception:
                    continue
        except Exception as e:
            print(f"[PromoRadar MX] Promodescuentos warning ({url}): {e}")

    # 2. Cyberpuerta.mx live discounted GPU & CPU cards
    cp_urls = [
        ("cyberpuerta_ofertas", "Cyberpuerta MX", "https://www.cyberpuerta.mx/Computo-Hardware/Componentes/Tarjetas-de-Video/"),
        ("cyberpuerta_ofertas", "Cyberpuerta MX", "https://www.cyberpuerta.mx/Computo-Hardware/Componentes/Procesadores/Procesadores-para-PC/"),
    ]
    now_iso = datetime.now(timezone.utc).isoformat()
    for ch_id, ch_name, url in cp_urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                page = resp.read().decode("utf-8", errors="ignore")
            for m in re.finditer(r'<a[^>]+href="(https://www\.cyberpuerta\.mx/[^"]+)"[^>]*title="([^"]+)"[\s\S]{1,1800}?class="price"[^>]*>\s*\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)', page):
                prod_url, title, price_str = m.group(1), html.unescape(m.group(2)).strip(), m.group(3)
                price_mxn = round(float(price_str.replace(",", "")))
                if price_mxn < 800 or price_mxn > 95000:
                    continue
                pid = f"cpmx/{abs(hash(prod_url)) % 10000000}"
                if pid in seen_ids:
                    continue
                seen_ids.add(pid)
                posts.append({
                    "post_id": pid,
                    "channel_id": ch_id,
                    "channel_name": ch_name,
                    "store_name": "Cyberpuerta",
                    "post_url": prod_url,
                    "timestamp": now_iso,
                    "title": title[:160],
                    "head_text": f"{title} ${price_mxn} MXN",
                    "raw_text": f"{title} en Cyberpuerta por ${price_mxn} MXN",
                    "price_brl": price_mxn,
                    "raw_price_brl": price_mxn,
                    "discount_applied": 0,
                    "coupon_code": None,
                    "coupon_info": None,
                    "buy_url": prod_url,
                    "coupon_url": None,
                    "region_id": "mx"
                })
        except Exception as e:
            print(f"[PromoRadar MX] Cyberpuerta warning: {e}")

    return posts


def fetch_europe_native_promotions():
    """
    Scrapes live European EUR hardware, smartphone, peripheral & misc deals from Pepper EU sites:
    1. MyDealz.de (Germany)
    2. Dealabs.com (France)
    3. Chollometro.com (Spain)
    """
    posts = []
    seen_ids = set()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8",
    }

    eu_urls = [
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/gruppe/grafikkarten"),
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/search?q=rtx"),
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/search?q=radeon"),
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/search?q=ryzen"),
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/search?q=ddr5+ram"),
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/search?q=mainboard"),
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/search?q=netzteil"),
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/gruppe/notebooks"),
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/gruppe/smartphones"),
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/search?q=maus+tastatur+headset"),
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/search?q=airfryer+heissluftfritteuse"),
        ("mydealz_de",     "MyDealz DE",     "https://www.mydealz.de/search?q=pampers+windeln"),
        ("dealabs_fr",     "Dealabs FR",     "https://www.dealabs.com/groupe/cartes-graphiques"),
        ("dealabs_fr",     "Dealabs FR",     "https://www.dealabs.com/groupe/processeurs"),
        ("dealabs_fr",     "Dealabs FR",     "https://www.dealabs.com/groupe/smartphones"),
        ("dealabs_fr",     "Dealabs FR",     "https://www.dealabs.com/search?q=airfryer"),
        ("dealabs_fr",     "Dealabs FR",     "https://www.dealabs.com/search?q=pampers"),
        ("chollometro_es", "Chollometro ES", "https://www.chollometro.com/categorias/tarjetas-graficas"),
    ]

    def _fetch_one(args):
        ch_id, ch_name, url = args
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=9) as resp:
                return ch_id, ch_name, url, resp.read().decode("utf-8", errors="ignore")
        except Exception as e:
            print(f"[PromoRadar EU] Warning ({url}): {e}")
            return ch_id, ch_name, url, ""

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        pages = list(ex.map(_fetch_one, eu_urls))

    for ch_id, ch_name, page_url, raw_html in pages:
        if not raw_html:
            continue
        for m in re.finditer(r"data-vue[23]='(\{[\s\S]*?\})'\s*>", raw_html):
            try:
                payload = json.loads(m.group(1))
                th = payload.get("props", {}).get("thread") or {}
                tid = str(th.get("threadId") or "")
                uid = f"{ch_id}/{tid}"
                if not tid or uid in seen_ids or th.get("isExpired"):
                    continue

                price = float(th.get("price") or 0)
                if price < 4.0 or price > 7500.0:
                    continue

                title = (th.get("title") or "").strip()
                if not title:
                    continue

                seen_ids.add(uid)
                voucher = (th.get("voucherCode") or "").strip() or None
                merchant = (th.get("merchant") or {}).get("merchantName") or "EU Shop"
                pub_ts = th.get("publishedAt") or int(time.time())
                iso_dt = datetime.fromtimestamp(pub_ts, tz=timezone.utc).isoformat()
                share_url = th.get("shareableLink") or th.get("url") or page_url
                next_best = float(th.get("nextBestPrice") or price)

                posts.append({
                    "post_id": uid,
                    "channel_id": ch_id,
                    "channel_name": ch_name,
                    "store_name": merchant,
                    "post_url": share_url,
                    "timestamp": iso_dt,
                    "title": title[:160],
                    "head_text": f"{title} {price:,.2f} €",
                    "raw_text": f"{title} - {merchant} - {price:,.2f} €",
                    "price_brl": round(price, 2),
                    "raw_price_brl": round(max(price, next_best), 2),
                    "discount_applied": round(max(0.0, next_best - price), 2),
                    "coupon_code": voucher,
                    "coupon_info": f"Code: {voucher}" if voucher else None,
                    "buy_url": share_url,
                    "coupon_url": None,
                    "deal_status": "active",
                    "stock_verified": True,
                    "region_id": "eu"
                })
            except Exception:
                continue

    return posts


def classify_smartphone_deal(title_and_text, price_brl, db, region_id="br"):
    min_p, max_p = (70, 3500) if region_id == "eu" else (420, 18000)
    if price_brl < min_p or price_brl > max_p:
        return None
    low = (title_and_text or "").lower()
    if re.search(r"\b(capa|capinha|pel[íi]cula|carregador|cabo\s*usb|suporte|smartwatch|watch|tablet|ipad|fone\s*bluetooth|earbud|airpods|buds|h[üu]lle|schutzfolie|ladeger[äa]t|coque)\b", low) and not re.search(r"\b(iphone\s*1[3-8]|galaxy\s*[sa]\d{2}|poco\s*[xfmc]\d|redmi\s*note\s*\d+|moto\s*[ge]\d+|edge\s*\d{2}|pixel\s*(?:8|9|10))\b", low):
        return None
    if not re.search(r"\b(smartphone|celular|handy|t[ée]l[ée]phone|m[óo]vil|iphone\s*1[3-8]|galaxy\s*(?:[saz]\d|z\s*(?:fold|flip)\s*\d?)|poco\s*[xfmc]\d|redmi\s*(?:note|1[2-5]|a\d)|xiaomi\s*1[45]t|pixel\s*(?:8|9|10)|moto\s*[ge]\d{2}|motorola\s*edge|realme\s*(?:c\d|gt|\d{2})|rog\s*phone)\b", low):
        return None

    phones = (db or {}).get("smartphones") or []
    best_item = None
    best_score = 0
    norm_txt = re.sub(r"[^a-z0-9]+", " ", low)
    txt_gb = re.search(r"\b(64|128|256|512)\s*gb\b", low)
    for ph in phones:
        pname = (ph.get("name") or "").lower()
        pbrand = (ph.get("brand") or "").lower()
        score = 0
        if pbrand and pbrand in low:
            score += 15
        for mod_pat in [
            r"iphone\s*1[3-8](?:\s*pro(?:\s*max)?|\s*plus|\s*air|\s*e)?",
            r"galaxy\s*s2[3-6](?:\s*ultra|\s*plus|\+|\s*fe|\s*edge)?",
            r"galaxy\s*z\s*(?:fold|flip)\s*[5-8]",
            r"galaxy\s*a[01235]\d(?:\s*5g)?",
            r"poco\s*[xfmc]\d(?:\s*pro|\s*ultra)?",
            r"redmi\s*note\s*1[3-5](?:\s*pro\+?)?",
            r"xiaomi\s*1[45]t(?:\s*pro)?",
            r"pixel\s*(?:8|9|10)(?:\s*pro)?",
            r"edge\s*[56]0(?:\s*pro|\s*fusion|\s*ultra|\s*neo)?",
            r"moto\s*g\d{2}(?:\s*5g)?",
        ]:
            m_t = re.search(mod_pat, low)
            m_p = re.search(mod_pat, pname)
            if m_t and m_p and re.sub(r"\s+", "", m_t.group(0)) == re.sub(r"\s+", "", m_p.group(0)):
                score += 48
            elif m_t and m_t.group(0) in pname:
                score += 40
        if txt_gb and str(ph.get("storage_gb") or "") == txt_gb.group(1):
            score += 12
        # Sanity price check
        ref_p = float(ph.get("price_brl") or 0)
        if ref_p > 0 and (price_brl < ref_p * 0.42 or price_brl > ref_p * 1.45):
            continue
        if score > best_score:
            best_score = score
            best_item = ph

    matched = bool(best_item and best_score >= 40)
    inferred_brand = ""
    if matched and best_item.get("brand"):
        inferred_brand = str(best_item["brand"]).strip()
    elif re.search(r"\b(iphone|apple)\b", low):
        inferred_brand = "Apple"
    elif re.search(r"\b(galaxy|samsung)\b", low):
        inferred_brand = "Samsung"
    elif re.search(r"\b(xiaomi|poco|redmi)\b", low):
        inferred_brand = "Xiaomi"
    elif re.search(r"\b(motorola|moto\s*[ge]\d+|edge\s*[56]0)\b", low):
        inferred_brand = "Motorola"
    elif re.search(r"\b(google\s*pixel|pixel\s*(?:8|9|10))\b", low):
        inferred_brand = "Google"
    elif re.search(r"\brealme\b", low):
        inferred_brand = "Realme"

    hb_price = float(best_item.get("price_brl") or 0) if matched else 0.0
    return {
        "matched_kind": "smartphone",
        "matched_slug": best_item["slug"] if matched else None,
        "matched_name": best_item["name"] if matched else None,
        "brand": inferred_brand,
        "hb_price_brl": hb_price,
        "savings_vs_hb_brl": round(hb_price - price_brl, 2) if hb_price > 0 else 0.0,
        "item_specs": {
            "brand": inferred_brand,
            "ram_gb": int(best_item.get("ram_gb") or 0) if matched else 0,
            "storage_gb": int(best_item.get("storage_gb") or 0) if matched else 0,
        },
    }


def classify_peripheral_deal(title_and_text, price_brl, region_id="br"):
    min_p, max_p = (8, 1000) if region_id == "eu" else (25, 4500)
    if price_brl < min_p or price_brl > max_p:
        return None
    low = (title_and_text or "").lower()
    if re.search(r"\b(mousepad|mouse\s*pad|mauspad|tapis\s*de\s*souris|keycap|wrist|apoio\s*de\s*pulso|cabo\s*coiled|suporte\s*para\s*headset|earpad|almofada)\b", low):
        return None
    if re.search(r"\b(mouse\s*gamer|mouse\s*sem\s*fio|gaming\s*maus|souris\s*(?:gamer|sans\s*fil)|rat[óo]n|superlight|viper\s*v[23]|deathadder|g305|g203|g403|g502|g703|attack\s*shark|darmoshark|cobra\s*pro)\b", low) or re.match(r"^\s*[^a-z]*(?:mouse|maus|souris)\b", low):
        return "mouse"
    if re.search(r"\b(teclado\s*mec[âa]nic|teclado\s*gamer|teclado\s*magn[ée]tico|teclado\s*sem\s*fio|gaming[- ]?tastatur|mechanische\s*tastatur|clavier|kumara|fizz|draconic|aula\s*f75|keychron|huntsman|alloy\s*origins|wooting)\b", low) or re.match(r"^\s*[^a-z]*(?:teclado|tastatur|clavier)\b", low):
        return "keyboard"
    if re.search(r"\b(headset|kopfh[öo]rer|casque\s*gaming|auriculares|cloud\s*(?:ii|iii|stinger|alpha)|h2002d|zeus\s*x?|quantum\s*\d+|blackshark|barracuda|g435|g733|fifine\s*h[689]|arctis)\b", low):
        return "headset"
    return None


def _enrich_peripheral_deal_metadata(txt_probe, price_brl, per_kind, db):
    low = (txt_probe or "").lower()
    brand = ""
    for cand in ("Logitech", "Razer", "HyperX", "Redragon", "Corsair", "SteelSeries", "JBL", "Havit", "Fifine", "Attack Shark", "Fallen", "Keychron", "Akko", "Aula", "Darmoshark", "Dell", "Sony", "Sennheiser"):
        if cand.lower() in low:
            brand = cand
            break
    is_wireless = bool(re.search(r"\b(sem\s*fio|wireless|lightspeed|2\.4\s*g(?:hz)?|bluetooth|tri-?mode|superlight)\b", low))
    is_gamer = bool(re.search(r"\b(gamer|gaming|hero\s*25k|paw\s*3\d{3}|8000\s*hz|magn[ée]tic|hall\s*effect|rgb|mec[âa]nic|superlight|cloud|blackshark|zeus|kumara)\b", low))

    best_item = None
    best_score = 0
    norm_txt_tokens = {t for t in re.sub(r"[^a-z0-9]+", " ", low).split() if len(t) >= 2}
    for pr in ((db or {}).get("peripherals") or []):
        if pr.get("kind") != per_kind:
            continue
        pname = (pr.get("name") or "").lower()
        pbrand = (pr.get("brand") or "").lower()
        score = 10 if (brand and pbrand == brand.lower()) else 0
        ptokens = [t for t in re.sub(r"[^a-z0-9]+", " ", pname).split() if len(t) >= 3 and t not in ("mouse", "teclado", "headset", "gamer", "preto", "branco", "fio", "sem", "usb")]
        hits = sum(1 for t in ptokens if t in norm_txt_tokens)
        score += hits * 18
        ref_p = float(pr.get("price_brl") or 0)
        if ref_p > 0 and (price_brl < ref_p * 0.35 or price_brl > ref_p * 1.55):
            continue
        if score > best_score:
            best_score = score
            best_item = pr

    matched = bool(best_item and best_score >= 36)
    hb_price = float(best_item.get("price_brl") or 0) if matched else 0.0
    return {
        "peripheral_kind": per_kind,
        "matched_kind": "peripheral",
        "brand": (best_item.get("brand") if matched else "") or brand,
        "is_wireless": bool(best_item.get("is_wireless")) if matched else is_wireless,
        "is_gamer": is_gamer,
        "matched_slug": best_item["slug"] if matched else None,
        "matched_name": best_item["name"] if matched else None,
        "hb_price_brl": hb_price,
        "savings_vs_hb_brl": round(hb_price - price_brl, 2) if hb_price > 0 else 0.0,
        "item_specs": {
            "sub_kind": per_kind,
            "brand": (best_item.get("brand") if matched else "") or brand,
            "wireless": bool(best_item.get("is_wireless")) if matched else is_wireless,
            "gamer": is_gamer,
        },
    }


def _enrich_misc_deal_metadata(txt_probe, price_brl, misc_cat_id, misc_specs, db):
    low = (txt_probe or "").lower()
    cat_list = ((db or {}).get("misc_catalog") or {}).get(misc_cat_id) or []
    brand_low = str((misc_specs or {}).get("brand") or "").lower()
    norm_tokens = {t for t in re.sub(r"[^a-z0-9]+", " ", low).split() if len(t) >= 2}
    best_item = None
    best_score = 0
    for it in cat_list:
        iname = (it.get("name") or "").lower()
        ibrand = (it.get("brand") or "").lower()
        score = 16 if (brand_low and ibrand == brand_low) else 0
        itokens = [t for t in re.sub(r"[^a-z0-9]+", " ", iname).split() if len(t) >= 3 and t not in ("fralda", "air", "fryer", "fritadeira", "eletrica", "oleo", "pacote", "cesto")]
        score += sum(15 for t in itokens if t in norm_tokens)
        ref_p = float(it.get("price_brl") or 0)
        if ref_p > 0 and (price_brl < ref_p * 0.35 or price_brl > ref_p * 1.55):
            continue
        if score > best_score:
            best_score = score
            best_item = it

    matched = bool(best_item and best_score >= 38)
    hb_price = float(best_item.get("price_brl") or 0) if matched else 0.0
    return {
        "misc_category": misc_cat_id,
        "misc_specs": misc_specs or {},
        "matched_kind": misc_cat_id,
        "brand": (misc_specs or {}).get("brand") or (best_item.get("brand") if matched else ""),
        "item_specs": misc_specs or {},
        "matched_slug": best_item["slug"] if matched else None,
        "matched_name": best_item["name"] if matched else None,
        "hb_price_brl": hb_price,
        "savings_vs_hb_brl": round(hb_price - price_brl, 2) if hb_price > 0 else 0.0,
    }


def classify_misc_deal(title_and_text, price_brl, misc_categories, region_id="br"):
    low = (title_and_text or "").lower()
    is_eu = region_id == "eu"
    if re.search(r"\b(fralda|pampers|huggies|babysec|pom\s*pom|mamypoko|cremer|windel(?:n|pak)?|couches|pa[ñn]ales|lillydoo|rascal)\b", low) and not re.search(r"\b(len[çc]o|feuchtt[üu]cher|lingettes)\b", low):
        if price_brl < (4 if is_eu else 18) or price_brl > (160 if is_eu else 600):
            return None, {}
        try:
            import misc_scraper
            specs = misc_scraper.parse_diaper_specs(title_and_text, price_brl)
        except Exception:
            specs = {}
        return "diapers", specs
    if re.search(r"\b(air\s*fry(?:er)?|fritadeira\s*(?:el[ée]trica|sem\s*[óo]leo)|hei[ßs]+luftfritteuse|friteuse\s*(?:sans\s*huile|air)|freidora\s*de\s*aire)\b", low):
        if price_brl < (25 if is_eu else 120) or price_brl > (650 if is_eu else 3000):
            return None, {}
        try:
            import misc_scraper
            specs = misc_scraper.parse_air_fryer_specs(title_and_text, price_brl)
        except Exception:
            specs = {}
        return "air_fryer", specs
    for cat in (misc_categories or []):
        if cat.get("builtin"):
            continue
        kws = [str(k).lower().strip() for k in (cat.get("keywords") or cat.get("queries") or [cat.get("name", "")]) if str(k).strip()]
        if any(k in low for k in kws):
            return cat["id"], {"brand": "", "summary": cat.get("name") or cat["id"]}
    return None, {}


def scan_live_promotions(db, extra_queries=None, extra_channels=None, max_age_hours=72.0, force=False, region_id=None, fast_poll=False):
    """
    Scans live promotions strictly isolated by region_id ('br', 'mx', or 'eu').
    Never mixes regional channels, coupons, or caches.
    """
    market_cfg = get_market_config() if get_market_config else {}
    reg = (region_id or market_cfg.get("region_id") or "br").lower().strip()
    if reg not in ("br", "mx", "eu"):
        reg = "br"

    reg_cache = _PROMO_CACHE_BY_REGION.setdefault(reg, {"updated_at": 0, "data": None})
    now_ts = time.time()
    if not force and reg_cache["data"] and (now_ts - reg_cache["updated_at"] < 180):
        return reg_cache["data"]

    misc_cfg = {}
    misc_categories = []
    misc_channels_meta = []
    try:
        import misc_scraper
        misc_cfg = misc_scraper.load_misc_config()
        misc_categories = misc_cfg.get("categories") or []
        misc_channels_meta = misc_cfg.get("telegram_groups") or []
    except Exception:
        misc_cfg = {}

    if reg == "mx":
        raw_posts = fetch_mexico_native_promotions()
        channels_scanned = ["promodescuentos_gpus", "promodescuentos_pc", "cyberpuerta_ofertas"]
    elif reg == "eu":
        raw_posts = fetch_europe_native_promotions()
        channels_scanned = ["mydealz_de", "dealabs_fr", "chollometro_es"]
    else:

        channels = list(DEFAULT_BR_CHANNELS)
        if extra_channels:
            for ch in extra_channels:
                cid = ch.strip().lstrip("@").split("/")[-1]
                if cid and not any(c["id"].lower() == cid.lower() for c in channels):
                    channels.append({"id": cid, "name": f"@{cid}"})
        queries = ["", "RTX", "RX ", "Ryzen"] if fast_poll else (list(DEFAULT_SEARCH_QUERIES) + ["iphone", "galaxy", "poco", "mouse", "teclado", "headset"])
        if not fast_poll and extra_queries:
            for q in extra_queries:
                if q and q not in queries:
                    queries.append(q)

        tasks = [(ch["id"], ch["name"], q) for ch in channels for q in queries]
        if not fast_poll:
            hw_ids = {c["id"].lower() for c in channels}
            for tg in misc_channels_meta:
                if not tg.get("enabled", True):
                    continue
                gid = tg["id"]
                gname = tg.get("name") or f"@{gid}"
                focus = tg.get("focus") or "both"
                if focus == "diapers":
                    g_queries = ["", "fralda", "pampers", "huggies"]
                elif focus == "air_fryer":
                    g_queries = ["", "air fryer", "mouse", "teclado", "headset", "iphone", "galaxy"]
                else:
                    g_queries = ["", "fralda", "air fryer", "iphone", "galaxy", "poco", "mouse", "teclado", "headset"]
                for mc in misc_categories:
                    if not mc.get("builtin"):
                        for cq in (mc.get("queries") or [mc.get("name", "")])[:2]:
                            if cq and cq not in g_queries:
                                g_queries.append(cq)
                for gq in g_queries:
                    if not (gid.lower() in hw_ids and gq in queries):
                        tasks.append((gid, gname, gq))

        raw_posts = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
            futures = [ex.submit(fetch_channel_query, cid, cname, q) for cid, cname, q in tasks]
            for fut in concurrent.futures.as_completed(futures):
                try:
                    raw_posts.extend(fut.result())
                except Exception:
                    pass
        channels_scanned = list(dict.fromkeys([c["id"] for c in channels] + [g["id"] for g in misc_channels_meta if g.get("enabled", True)]))

    by_post = {}
    for p in raw_posts:
        by_post[p["post_id"]] = p

    now_dt = datetime.now(timezone.utc)
    matched_deals = []
    all_promos = []
    smartphone_deals = []
    peripheral_deals = []
    misc_deals = []
    best_by_slug = {}

    for post_id, orig in by_post.items():
        item = dict(orig)
        item["region_id"] = reg
        if not item.get("timestamp"):
            continue
        try:
            dt = datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00"))
            age_hours = max(0.1, (now_dt - dt).total_seconds() / 3600.0)
        except Exception:
            continue
        item["age_hours"] = round(age_hours, 1)
        if item["age_hours"] > max_age_hours:
            continue

        txt_probe = (item.get("head_text", "") or item.get("title", "")) + " " + (item.get("raw_text", "")[:180])
        kind, cat_item = match_catalog_item(item.get("head_text", "") or item.get("title", ""), db)
        if kind and cat_item:
            mobo_floor = 45 if reg == "eu" else (1100 if reg == "mx" else 220)
            psu_floor = 30 if reg == "eu" else (550 if reg == "mx" else 110)
            if kind == "mobo" and float(item.get("price_brl") or 0) < mobo_floor:
                kind, cat_item = None, None
            elif kind == "psu" and float(item.get("price_brl") or 0) < psu_floor:
                kind, cat_item = None, None
        if kind and cat_item:
            hb_price = float(cat_item.get("price_brl") or 0)
            if hb_price > 0 and (item["price_brl"] < hb_price * 0.45 or item["price_brl"] > hb_price * 1.35):
                continue
            item["matched_kind"] = kind
            item["matched_slug"] = cat_item["slug"]
            item["matched_name"] = cat_item["name"]
            item["hb_price_brl"] = hb_price
            item["savings_vs_hb_brl"] = round(hb_price - item["price_brl"], 2) if hb_price > 0 else 0.0
            item["item_specs"] = extract_item_specs(kind, item, cat_item)
            is_cond = bool(item.get("is_conditional_voucher") or re.search(r"\b(no\s*app|pelo\s*app|aplicativo|moedas|live|resgate|resgatem|exclusivo\s*app)\b", item.get("raw_text", ""), re.I))
            item["is_conditional_voucher"] = is_cond
            requires_coup = bool(
                item.get("coupon_code")
                or item.get("coupon_info")
                or item.get("discount_applied", 0) > 0
                or is_cond
                or re.search(r"\b(cupom|cupon|cupón|gutschein|code\s*promo|rabatt|resgate|sacola\s*laranja|moedas|no\s*app)\b", item.get("raw_text", ""), re.I)
            )
            item["requires_coupon"] = requires_coup
            item["promo_price_brl"] = item["price_brl"]
            item["is_expired"] = False
            if reg != "eu":
                item["deal_status"] = "untested"
                item["stock_verified"] = False
            else:
                item.setdefault("deal_status", "active")
                item.setdefault("stock_verified", True)
            item["is_coupon_expired"] = False
            item["coupon_status"] = "unverified" if requires_coup else "none"
            matched_deals.append(item)
        else:
            # Classify isolated tracks: Misc (diapers / air fryer / custom), Smartphone, Peripherals
            misc_cat_id, misc_specs = classify_misc_deal(txt_probe, float(item.get("price_brl") or 0), misc_categories, region_id=reg)
            if misc_cat_id:
                m_copy = dict(item)
                m_copy.update(_enrich_misc_deal_metadata(txt_probe, float(item.get("price_brl") or 0), misc_cat_id, misc_specs, db))
                misc_deals.append(m_copy)
            else:
                ph_match = classify_smartphone_deal(txt_probe, float(item.get("price_brl") or 0), db, region_id=reg)
                if ph_match:
                    s_copy = dict(item)
                    s_copy.update(ph_match)
                    smartphone_deals.append(s_copy)
                else:
                    per_kind = classify_peripheral_deal(txt_probe, float(item.get("price_brl") or 0), region_id=reg)
                    if per_kind:
                        p_copy = dict(item)
                        p_copy.update(_enrich_peripheral_deal_metadata(txt_probe, float(item.get("price_brl") or 0), per_kind, db))
                        peripheral_deals.append(p_copy)

        all_promos.append(item)

    matched_deals.sort(key=lambda d: (-d.get("savings_vs_hb_brl", 0), d.get("price_brl", 999999)))
    all_promos.sort(key=lambda d: d.get("age_hours", 999))
    smartphone_deals.sort(key=lambda d: d.get("age_hours", 999))
    peripheral_deals.sort(key=lambda d: d.get("age_hours", 999))
    misc_deals.sort(key=lambda d: d.get("age_hours", 999))

    # Validate deals and coupons against live store pages & Hardware Barato in-stock index
    cache_filename = "promos_cache.json" if reg == "br" else f"promos_cache_{reg}.json"
    cache_path = os.path.join(BASE_DIR, "data", cache_filename)

    if fast_poll and os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                existing_cache = json.load(f)
            seen_matched_ids = {d.get("post_id") for d in matched_deals if d.get("post_id")}
            for prev_d in existing_cache.get("matched_deals", []):
                pid = prev_d.get("post_id")
                if pid and pid not in seen_matched_ids and float(prev_d.get("age_hours") or 0) <= max_age_hours:
                    matched_deals.append(prev_d)
                    seen_matched_ids.add(pid)
            seen_feed_ids = {p.get("post_id") for p in all_promos if p.get("post_id")}
            for prev_f in existing_cache.get("recent_feed", []):
                pid = prev_f.get("post_id")
                if pid and pid not in seen_feed_ids and float(prev_f.get("age_hours") or 0) <= max_age_hours:
                    all_promos.append(prev_f)
                    seen_feed_ids.add(pid)
            for key_list, dest_list in (("smartphone_deals", smartphone_deals), ("peripheral_deals", peripheral_deals), ("misc_deals", misc_deals)):
                seen_k = {x.get("post_id") for x in dest_list if x.get("post_id")}
                for prev_x in existing_cache.get(key_list, []):
                    pid = prev_x.get("post_id")
                    if pid and pid not in seen_k and float(prev_x.get("age_hours") or 0) <= max_age_hours:
                        dest_list.append(prev_x)
                        seen_k.add(pid)
        except Exception:
            pass

    coupon_status_obj = {"coupons": {}, "deals": {}}
    try:
        import coupon_tracker
        coupon_tracker.scan_texts_for_expiries(all_promos)
        if reg != "eu":
            if fast_poll:
                existing_deals_status = coupon_tracker.load_coupon_status(reg).get("deals", {})
                untested_or_new = [d for d in matched_deals if not existing_deals_status.get(d.get("post_id", ""))]
                if untested_or_new:
                    coupon_tracker.test_deals_batch(untested_or_new, max_items=12, reg_id=reg)
            else:
                coupon_tracker.test_deals_batch(matched_deals, max_items=40, reg_id=reg)
        matched_deals, best_by_slug = coupon_tracker.rewire_deals_and_best_by_slug(matched_deals, all_promos, reg_id=reg)
        coupon_status_obj = coupon_tracker.load_coupon_status(reg)
    except Exception as e:
        print(f"[PromoRadar ({reg})] Warning running coupon_tracker: {e}")

    matched_deals.sort(key=lambda d: (
        1 if d.get("is_expired") else 0,
        1 if d.get("is_coupon_expired") else 0,
        -d.get("savings_vs_hb_brl", 0),
        d.get("price_brl", 999999)
    ))

    payload = {
        "ok": True,
        "region_id": reg,
        "scanned_at": datetime.now().strftime("%H:%M:%S"),
        "last_sitewise_test_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "channels_scanned": channels_scanned,
        "matched_count": len(matched_deals),
        "matched_deals": matched_deals[:80],
        "best_by_slug": best_by_slug,
        "smartphone_deals": smartphone_deals[:40],
        "peripheral_deals": peripheral_deals[:45],
        "misc_deals": misc_deals[:60],
        "misc_channels": misc_channels_meta,
        "recent_feed": all_promos[:60],
        "coupon_status": coupon_status_obj
    }

    reg_cache["updated_at"] = now_ts
    reg_cache["data"] = payload
    _PROMO_CACHE["updated_at"] = now_ts
    _PROMO_CACHE["data"] = payload

    try:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

    return payload

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Scan live hardware promotions and update promo cache")
    parser.add_argument("--notify", action="store_true", help="Send push / toast alerts for detected deals")
    parser.add_argument("--region", default=None, help="Target region (br or mx, default scans both)")
    parser.add_argument("--max-age", type=float, default=24.0, help="Max age in hours")
    parser.add_argument("--force", action="store_true", default=True, help="Force fresh scraping")
    args = parser.parse_args()

    db_br_path = os.path.join(BASE_DIR, "data", "hardware_db.json")
    db_br = {}
    if os.path.exists(db_br_path):
        try:
            with open(db_br_path, "r", encoding="utf-8") as f:
                db_br = json.load(f)
        except Exception:
            pass

    db_mx_path = os.path.join(BASE_DIR, "data", "hardware_db_mx.json")
    db_mx = {}
    if os.path.exists(db_mx_path):
        try:
            with open(db_mx_path, "r", encoding="utf-8") as f:
                db_mx = json.load(f)
        except Exception:
            pass

    db_eu_path = os.path.join(BASE_DIR, "data", "hardware_db_eu.json")
    db_eu = {}
    if os.path.exists(db_eu_path):
        try:
            with open(db_eu_path, "r", encoding="utf-8") as f:
                db_eu = json.load(f)
        except Exception:
            pass

    regions = [args.region.lower()] if args.region else ["br", "mx"]

    for reg in regions:
        print(f"=== Scanning live promotions for region '{reg}' ===")
        db_to_use = db_eu if reg == "eu" else (db_mx if reg == "mx" else db_br)
        res = scan_live_promotions(db_to_use, max_age_hours=args.max_age, region_id=reg, force=args.force)
        print(f"[{reg.upper()}] Matched {res.get('matched_count', 0)} deals, {len(res.get('recent_feed', []))} feed items at {res.get('scanned_at')}")

        # Also embed latest live_promos into the respective hardware_db file for instant offline bootstrap
        if reg == "br" and db_br and os.path.exists(db_br_path):
            db_br["live_promos"] = res
            try:
                with open(db_br_path, "w", encoding="utf-8") as f:
                    json.dump(db_br, f, ensure_ascii=False, indent=2)
                print(f"[BR] Successfully embedded fresh live_promos into hardware_db.json")
            except Exception as e:
                print(f"[BR] Warning saving embedded live_promos: {e}")
        elif reg == "mx" and db_mx and os.path.exists(db_mx_path):
            db_mx["live_promos"] = res
            try:
                with open(db_mx_path, "w", encoding="utf-8") as f:
                    json.dump(db_mx, f, ensure_ascii=False, indent=2)
                print(f"[MX] Successfully embedded fresh live_promos into hardware_db_mx.json")
            except Exception as e:
                print(f"[MX] Warning saving embedded live_promos: {e}")
        elif reg == "eu" and db_eu and os.path.exists(db_eu_path):
            db_eu["live_promos"] = res
            try:
                with open(db_eu_path, "w", encoding="utf-8") as f:
                    json.dump(db_eu, f, ensure_ascii=False, indent=2)
                print(f"[EU] Successfully embedded fresh live_promos into hardware_db_eu.json")
            except Exception as e:
                print(f"[EU] Warning saving embedded live_promos: {e}")

    if args.notify:
        print("=== Checking alert rules and dispatching notifications ===")
        try:
            import server
            server.check_and_notify_deals(force_notify=False)
        except Exception as e:
            print(f"Notification check warning: {e}")

