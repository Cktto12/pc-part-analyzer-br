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
    r"\b(computador\s*completo|pc\s*completo|pc\s*gamer\s*armada|all\s*in\s*one|console|playstation|ps5|xbox|monitor|tv\s|smart\s*tv|cadeira|silla|teclado|mouse|headset|smartphone|celular|iphone|galaxy\s*s)\b",
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
    min_val = 80.0
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


def scan_live_promotions(db, extra_queries=None, extra_channels=None, max_age_hours=72.0, force=False, region_id=None, fast_poll=False):
    """
    Scans live promotions strictly isolated by region_id ('br' or 'mx').
    Never mixes Brazilian and Mexican channels, coupons, or caches.
    """
    market_cfg = get_market_config() if get_market_config else {}
    reg = (region_id or market_cfg.get("region_id") or "br").lower().strip()
    if reg not in ("br", "mx"):
        reg = "br"

    reg_cache = _PROMO_CACHE_BY_REGION.setdefault(reg, {"updated_at": 0, "data": None})
    now_ts = time.time()
    if not force and reg_cache["data"] and (now_ts - reg_cache["updated_at"] < 180):
        return reg_cache["data"]

    if reg == "mx":
        raw_posts = fetch_mexico_native_promotions()
        channels_scanned = ["promodescuentos_gpus", "promodescuentos_pc", "cyberpuerta_ofertas"]
    else:
        channels = list(DEFAULT_BR_CHANNELS)
        if extra_channels:
            for ch in extra_channels:
                cid = ch.strip().lstrip("@").split("/")[-1]
                if cid and not any(c["id"].lower() == cid.lower() for c in channels):
                    channels.append({"id": cid, "name": f"@{cid}"})
        queries = ["", "RTX", "RX ", "Ryzen"] if fast_poll else list(DEFAULT_SEARCH_QUERIES)
        if not fast_poll and extra_queries:
            for q in extra_queries:
                if q and q not in queries:
                    queries.append(q)

        tasks = [(ch["id"], ch["name"], q) for ch in channels for q in queries]
        raw_posts = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=14) as ex:
            futures = [ex.submit(fetch_channel_query, cid, cname, q) for cid, cname, q in tasks]
            for fut in concurrent.futures.as_completed(futures):
                try:
                    raw_posts.extend(fut.result())
                except Exception:
                    pass
        channels_scanned = [c["id"] for c in channels]

    by_post = {}
    for p in raw_posts:
        by_post[p["post_id"]] = p

    now_dt = datetime.now(timezone.utc)
    matched_deals = []
    all_promos = []
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

        kind, cat_item = match_catalog_item(item.get("head_text", "") or item.get("title", ""), db)
        if kind and cat_item:
            if kind == "mobo" and float(item.get("price_brl") or 0) < 220:
                kind, cat_item = None, None
            elif kind == "psu" and float(item.get("price_brl") or 0) < 110:
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
                or re.search(r"\b(cupom|cupon|cupón|resgate|sacola\s*laranja|moedas|no\s*app)\b", item.get("raw_text", ""), re.I)
            )
            item["requires_coupon"] = requires_coup
            item["promo_price_brl"] = item["price_brl"]
            item["is_expired"] = False
            item["deal_status"] = "untested"
            item["is_coupon_expired"] = False
            item["coupon_status"] = "unverified" if requires_coup else "none"
            matched_deals.append(item)

        all_promos.append(item)

    matched_deals.sort(key=lambda d: (-d.get("savings_vs_hb_brl", 0), d.get("price_brl", 999999)))
    all_promos.sort(key=lambda d: d.get("age_hours", 999))

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
        except Exception:
            pass

    coupon_status_obj = {"coupons": {}, "deals": {}}
    try:
        import coupon_tracker
        coupon_tracker.scan_texts_for_expiries(all_promos)
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

    regions = [args.region.lower()] if args.region else ["br", "mx"]

    for reg in regions:
        print(f"=== Scanning live promotions for region '{reg}' ===")
        db_to_use = db_mx if reg == "mx" else db_br
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

    if args.notify:
        print("=== Checking alert rules and dispatching notifications ===")
        try:
            import server
            server.check_and_notify_deals(force_notify=False)
        except Exception as e:
            print(f"Notification check warning: {e}")

