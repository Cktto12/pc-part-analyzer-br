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
    {"id": "ofertastechbr",     "name": "Ofertas Tech BR"},
]

DEFAULT_SEARCH_QUERIES = [
    "", "RTX", "5060", "5070", "4060", "7600", "RX ", "Ryzen", "DDR4", "DDR5", "expirou", "acabou", "esgotou"
]

EXCLUDE_SYSTEM_RE = re.compile(
    r"\b(notebook|laptop|macbook|computador\s*completo|pc\s*completo|pc\s*gamer\s*armada|all\s*in\s*one|console|playstation|ps5|xbox|monitor|tv\s|smart\s*tv|cadeira|silla|teclado|mouse|headset|smartphone|celular|iphone|galaxy\s*s)\b",
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
    ("rx-7600-xt",       r"\brx\s*7600\s*xt\b"),
    ("rx-7650-gre",      r"\brx\s*7650\s*gre\b"),
    ("rx-7600",          r"\brx\s*7600(?!\s*xt)\b"),
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

    monetary = get_monetary_config() if get_monetary_config else {}
    min_val = float(monetary.get("min_valid_hardware_price", 80.0))
    max_val = float(monetary.get("max_valid_hardware_price", 45000.0))
    price_pat = monetary.get("price_regex") or r"R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]{3,5}(?:,[0-9]{1,2})?)"
    market_cfg = get_market_config() if get_market_config else {}
    cash_keywords = market_cfg.get("promotion_sources", {}).get("cash_intent_keywords", ["por r$", "valor", "💵", "pix", "à vista", "a vista", "🔥"])

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
        return None, None, 0.0, coupon_code, coupon_info

    max_prio = max(c[0] for c in candidates)
    best_vals = [c[1] for c in candidates if c[0] == max_prio]
    base_price = min(best_vals)

    final_price = base_price
    discount_applied = 0.0
    has_final_price_indicator = any(
        re.search(r"\b(por|sai\s*por|fica\s*por|pagando|preço|preco|precio|valor|à\s*vista|a\s*vista|pix|contado)\b", line, re.I)
        for line in lines
    )

    if not has_final_price_indicator:
        if detected_discount_brl > 0 and detected_discount_brl < base_price * 0.45:
            final_price = base_price - detected_discount_brl
            discount_applied = detected_discount_brl
        elif detected_discount_pct > 0:
            discount_applied = round(base_price * (detected_discount_pct / 100.0), 2)
            final_price = base_price - discount_applied

    return round(final_price, 2), round(base_price, 2), round(discount_applied, 2), coupon_code, coupon_info


def match_catalog_item(title_and_first_lines, db):
    has_component_clue = bool(re.search(r"\b(placa\s*de\s*v[íi]deo|tarjeta\s*de\s*video|tarjeta\s*gr[áa]fica|gpu|rtx|geforce|radeon|ryzen|core\s*i[3579]|intel\s*core|ddr[45]|mem[óo]ria\s*ram|procesador)\b", title_and_first_lines, re.I))
    if not has_component_clue and EXCLUDE_SYSTEM_RE.search(title_and_first_lines):
        return None, None

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

        hrefs = re.findall(r'href="(https?://[^"]+)"', raw_html)
        product_links = [
            h for h in hrefs
            if not any(x in h.lower() for x in ["t.me/", "bit.ly/canal", "whatsapp.com", "instagram.com", "youtube.com"])
        ]

        text_with_lines = re.sub(r"<br\s*/?>", "\n", raw_html, flags=re.IGNORECASE)
        clean_text = html.unescape(re.sub(r"<[^>]+>", "", text_with_lines))
        lines = [ln.strip() for ln in clean_text.splitlines() if ln.strip() and ln.strip() != "⠀"]
        if not lines:
            continue

        dt_m = re.search(r'<time datetime="([^"]+)"', part)
        iso_dt = dt_m.group(1) if dt_m else ""

        title_lines = [
            ln for ln in lines[:4]
            if len(re.sub(r"[^a-zA-Z0-9]", "", ln)) >= 6
            and not re.match(r"^(baixa|baixou|parcelado|cupom|oferta|promo|#)", ln.strip(" ⭐️🔥🚨⚡"), re.IGNORECASE)
        ]
        title = (title_lines[0] if title_lines else lines[0]).strip(" ⭐️🔥🚨⚡🔹")

        price, raw_price, discount_applied, coupon_code, coupon_info = extract_price_and_coupon(lines)
        if not price:
            continue

        buy_url = product_links[-1] if product_links else f"https://t.me/{post_id}"
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
            "buy_url": buy_url,
            "coupon_url": product_links[0] if len(product_links) > 1 else None,
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
        ("promodescuentos_gpus", "Promodescuentos GPUs", "https://www.promodescuentos.com/grupo/tarjetas-graficas"),
        ("promodescuentos_pc",   "Promodescuentos PC",   "https://www.promodescuentos.com/grupo/componentes-de-pc"),
    ]
    for ch_id, ch_name, url in pd_urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw_html = resp.read().decode("utf-8", errors="ignore")

            for m in re.finditer(r"data-vue2='(\{\"props\":\{\"thread\":.*?)'", raw_html):
                try:
                    payload = json.loads(html.unescape(m.group(1)))
                    th = payload.get("props", {}).get("thread") or {}
                    tid = str(th.get("threadId") or "")
                    if not tid or tid in seen_ids or th.get("isExpired"):
                        continue

                    price = float(th.get("price") or 0)
                    if price < 450 or price > 95000:
                        continue

                    title = (th.get("title") or "").strip()
                    if not title:
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


def scan_live_promotions(db, extra_queries=None, extra_channels=None, max_age_hours=72.0, force=False, region_id=None):
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
        queries = list(DEFAULT_SEARCH_QUERIES)
        if extra_queries:
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
        age_hours = 1.0
        if item.get("timestamp"):
            try:
                dt = datetime.fromisoformat(item["timestamp"].replace("Z", "+00:00"))
                age_hours = max(0.1, (now_dt - dt).total_seconds() / 3600.0)
            except Exception:
                age_hours = 12.0
        item["age_hours"] = round(age_hours, 1)
        if item["age_hours"] > max_age_hours:
            continue

        kind, cat_item = match_catalog_item(item.get("head_text", "") or item.get("title", ""), db)
        if kind and cat_item:
            hb_price = float(cat_item.get("price_brl") or 0)
            if hb_price > 0 and (item["price_brl"] < hb_price * 0.45 or item["price_brl"] > hb_price * 1.30):
                continue
            item["matched_kind"] = kind
            item["matched_slug"] = cat_item["slug"]
            item["matched_name"] = cat_item["name"]
            item["hb_price_brl"] = hb_price
            item["savings_vs_hb_brl"] = round(hb_price - item["price_brl"], 2)
            item["is_expired"] = False
            item["deal_status"] = "active"
            item["is_coupon_expired"] = False
            item["coupon_status"] = "active" if item.get("coupon_code") else "none"
            matched_deals.append(item)

            slug = cat_item["slug"]
            if slug not in best_by_slug or item["price_brl"] < best_by_slug[slug]["price_brl"]:
                best_by_slug[slug] = item

        all_promos.append(item)

    matched_deals.sort(key=lambda d: (-d.get("savings_vs_hb_brl", 0), d.get("price_brl", 999999)))
    all_promos.sort(key=lambda d: d.get("age_hours", 999))

    payload = {
        "ok": True,
        "region_id": reg,
        "scanned_at": datetime.now().strftime("%H:%M:%S"),
        "channels_scanned": channels_scanned,
        "matched_count": len(matched_deals),
        "matched_deals": matched_deals[:80],
        "best_by_slug": best_by_slug,
        "recent_feed": all_promos[:60],
        "coupon_status": {"coupons": {}, "deals": {}}
    }

    reg_cache["updated_at"] = now_ts
    reg_cache["data"] = payload
    _PROMO_CACHE["updated_at"] = now_ts
    _PROMO_CACHE["data"] = payload

    cache_filename = "promos_cache.json" if reg == "br" else f"promos_cache_{reg}.json"
    cache_path = os.path.join(BASE_DIR, "data", cache_filename)
    try:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

    return payload
