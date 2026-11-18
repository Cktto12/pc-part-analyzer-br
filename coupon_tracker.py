# -*- coding: utf-8 -*-
"""
Coupon Tracker & Live Deal Validator for GPU & Build Analyzer Pro.

Tracks coupon lifecycles, detects expiry announcements from group messages
("expirou", "acabou", "esgotou", "expiró", "agotado"), directly tests store links and coupons,
cross-verifies Brazilian offers and coupons against Hardware Barato's live in-stock store index,
and rewires product pricing so unverified/expired coupons or out-of-stock items never mislead the user.
Supports Brazilian and Mexican stores and locales.
"""

import os
import re
import json
import time
import html
import threading
import urllib.request
import urllib.error
import concurrent.futures

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATUS_FILE = os.path.join(BASE_DIR, "data", "coupon_status.json")
_STATUS_LOCK = threading.Lock()

# In-memory 5-minute cache for Hardware Barato live in-stock store & coupon verification
_HB_LIVE_CACHE = {}
_HB_CACHE_LOCK = threading.Lock()

CHROME_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,es-MX,es;q=0.8,en-US;q=0.7"
}


def get_status_file(reg_id=None):
    reg = (reg_id or "br").lower().strip()
    return os.path.join(BASE_DIR, "data", "coupon_status.json" if reg == "br" else f"coupon_status_{reg}.json")


# Non-coupon words that can follow or precede 'expirou'/'acabou'
STOP_WORDS = {
    "PARA", "ESTA", "ESSA", "HOJE", "AQUI", "MAIS", "PELO", "SITE", "LOJA",
    "SHOPEE", "KABUM", "MAGALU", "MERCADO", "AMAZON", "PROMO", "OFERTA",
    "LINK", "DISPONIVEL", "DISPONÍVEL", "VALOR", "PRECO", "PREÇO", "ESTOQUE",
    "PRODUTO", "AINDA", "LIVRE", "AGORA", "TUDO", "NAQUELE", "KKKKKKK",
    "CUPOMO", "BLUSINHAS", "RESGATE", "SUBSTITUEM", "APARECER", "IFP43VOM",
    "QUEM", "ESSE", "QUAL", "ONDE", "QUANDO", "MUITO", "POUCO", "GRATIS", "GRÁTIS",
    "HTTPS", "HTTP", "WWW", "COM", "BR", "MX", "CYBERPUERTA", "DDTECH", "PROMODESCUENTOS"
}

EXPIRY_REGEXES = [
    re.compile(r"\b([A-Z0-9]{4,22})\s+(?:expirou|acabou|esgotou|encerrou|morreu|invalido|inválido|finalizou|expiró|expiro|agotó|agoto|terminó|termino|venció|vencio)\b", re.IGNORECASE),
    re.compile(r"(?:cupom|cupón|cupon|c[oó]digo)\s+([A-Z0-9]{4,22})\s+(?:expirou|acabou|esgotou|encerrou|invalido|inválido|expiró|expiro|agotó|agoto|terminó|termino|venció|vencio)\b", re.IGNORECASE),
    re.compile(r"(?:expirou|acabou|esgotou|encerrou|finalizou|expiró|expiro|agotó|agoto|terminó|termino|venció|vencio)\s+(?:o\s+|el\s+)?(?:cupom\s+|cupón\s+|cupon\s+)?[:\-]?\s*\b([A-Z0-9]{4,22})\b", re.IGNORECASE),
    re.compile(r"(?:o|el)\s+(?:cupom|cupón|cupon)\s+([A-Z0-9]{4,22})\s+(?:expirou|expiró)", re.IGNORECASE),
    re.compile(r"(?:cupom|cupón|cupon)\s+(?:expirou|expiró|esgotado|agotado|inv[aá]lido)[\s\S]{1,80}?(?:cupom|cupón|cupon|c[oó]digo)\s*[:\-]?\s*\b([A-Z0-9]{4,22})\b", re.IGNORECASE),
]

OOS_PATTERNS_BR = [
    (r"an[uú]ncio\s+pausado", "Anúncio pausado no Mercado Livre"),
    (r"publica[cç][aã]o\s+pausada", "Publicação pausada no Mercado Livre"),
    (r"este\s+produto\s+est[aá]\s+esgotado", "Produto esgotado no Mercado Livre"),
    (r"an[uú]ncio\s+finalizado", "Anúncio finalizado no Mercado Livre"),
    (r"ops!\s*produto\s*indispon[ií]vel", "Produto indisponível na KaBuM"),
    (r"produto-esgotado", "Produto esgotado na KaBuM"),
    (r"avise-me\s+quando\s+chegar", "Sem estoque na loja (avise-me)"),
    (r"produto\s+indispon[ií]vel", "Produto indisponível na loja"),
    (r"atualmente\s+indispon[ií]vel", "Atualmente indisponível na Amazon"),
    (r"n[aã]o\s+dispon[ií]vel\s+em\s+estoque", "Não disponível em estoque"),
    (r"produto\s+sem\s+estoque", "Produto sem estoque"),
]

OOS_PATTERNS_MX = [
    (r"producto\s+agotado", "Producto agotado en tienda MX"),
    (r"sin\s+existencias", "Sin existencias en tienda MX"),
    (r"fuera\s+de\s+stock", "Fuera de stock en tienda MX"),
    (r"publicaci[óo]n\s+pausada", "Publicación pausada en Mercado Libre MX"),
    (r"este\s+producto\s+est[áa]\s+agotado", "Producto agotado en Mercado Libre MX"),
    (r"art[íi]culo\s+agotado", "Artículo agotado"),
    (r"av[íi]same\s+cuando\s+haya\s+stock", "Sin existencias (avísame)"),
    (r"temporalmente\s+agotado", "Temporalmente agotado"),
    (r"stock\s+agotado", "Stock agotado"),
]


def normalize_br_store_key(url_str="", store_name=""):
    u = (url_str or "").lower()
    s = (store_name or "").lower()
    if "kabum" in u or "kabum" in s:
        return "kabum", "KaBuM!"
    if "terabyte" in u or "terabyte" in s:
        return "terabyte", "Terabyte"
    if "pichau" in u or "pichau" in s:
        return "pichau", "Pichau"
    if "shopee" in u or "shopee" in s:
        return "shopee", "Shopee"
    if "mercadolivre" in u or "meli.la" in u or "mercado livre" in s or "mercado-livre" in s:
        return "mercado-livre", "Mercado Livre"
    if "amazon.com.br" in u or "amzn.to" in u or "amazon" in s:
        return "amazon", "Amazon BR"
    if "magalu" in u or "magazine" in u or "magalu" in s or "magazine-luiza" in s:
        return "magazine-luiza", "Magalu"
    if "gigantec" in u or "gigantec" in s:
        return "gigantec", "Gigantec"
    if "patoloco" in u or "pato-loco" in s:
        return "pato-loco", "Pato Loco"
    if "guerradigital" in u or "guerra-digital" in s:
        return "guerra-digital", "Guerra Digital"
    if "fgtec" in u or "fgtec" in s:
        return "fgtec", "FGTEC"
    if "mainfostore" in u or "ma-infostore" in s:
        return "ma-infostore", "MA Infostore"
    return None, (store_name or "Loja")


def fetch_hb_live_slug_info(kind, slug):
    """
    Fetches Hardware Barato's live in-stock offer list ('data') and verified coupon list ('coupons')
    for a given hardware slug (cached for 5 minutes).
    """
    if not slug:
        return None
    cat_map = {
        "gpu": "placas-de-video",
        "cpu": "processadores",
        "ram": "memorias-ram",
        "mobo": "placas-mae",
        "psu": "fontes"
    }
    cat = cat_map.get((kind or "gpu").lower(), "placas-de-video")
    cache_key = f"{cat}/{slug}"
    now = time.time()

    with _HB_CACHE_LOCK:
        cached = _HB_LIVE_CACHE.get(cache_key)
        if cached and (now - cached["ts"] < 300):
            return cached["data"]

    url = f"https://www.hardwarebarato.com/produtos/{cat}/{slug}"
    try:
        req = urllib.request.Request(url, headers=CHROME_HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw_html = resp.read().decode("utf-8", errors="ignore")
        pushes = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', raw_html, re.DOTALL)
        unescaped = "".join(pushes).replace('\\"', '"').replace('\\\\', '\\')

        def extract_arr(key):
            idx = unescaped.find(f'"{key}":[')
            if idx == -1:
                return []
            start = unescaped.find('[', idx)
            depth = 0
            for i in range(start, len(unescaped)):
                if unescaped[i] == '[':
                    depth += 1
                elif unescaped[i] == ']':
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(unescaped[start:i + 1])
                        except Exception:
                            return []
            return []

        offers = extract_arr("data")
        coupons = extract_arr("coupons")

        by_store = {}
        active_coupons = {}

        active_coupons_details = {}
        for c in coupons:
            if c.get("archivedAt") is not None:
                continue
            st = (c.get("storeName") or "").lower().strip()
            code = (c.get("code") or "").upper().strip()
            min_val = c.get("minPrice") or c.get("min_price") or c.get("minSpend") or c.get("minValue")
            min_spend = (float(min_val) / 100.0) if (isinstance(min_val, (int, float)) and min_val > 0) else None
            desc = (c.get("description") or c.get("title") or "").strip()
            if st and code:
                active_coupons.setdefault(st, set()).add(code)
                active_coupons_details.setdefault(st, {})[code] = {
                    "min_spend": min_spend,
                    "desc": desc,
                    "discount": c.get("discount"),
                    "discount_type": c.get("discountType")
                }

        for o in offers:
            st = (o.get("storeName") or "").lower().strip()
            p_raw = o.get("price")
            if not st or not isinstance(p_raw, (int, float)) or p_raw <= 0:
                continue
            p = round(float(p_raw) / 100.0, 2)
            c_obj = o.get("coupon") if isinstance(o.get("coupon"), dict) else None
            c_price = round(float(c_obj["price"]) / 100.0, 2) if (c_obj and isinstance(c_obj.get("price"), (int, float))) else None
            c_code = (c_obj.get("code") or "").upper().strip() if c_obj else None
            if c_code:
                active_coupons.setdefault(st, set()).add(c_code)

            by_store.setdefault(st, []).append({
                "price": p,
                "coupon_price": c_price,
                "coupon_code": c_code,
                "url": o.get("url") or "",
                "name": o.get("name") or ""
            })

        for st in by_store:
            by_store[st].sort(key=lambda x: x["price"])

        info = {
            "slug": slug,
            "kind": kind,
            "by_store": by_store,
            "active_coupons": {k: list(v) for k, v in active_coupons.items()},
            "active_coupons_details": active_coupons_details,
            "total_offers": len(offers)
        }
        with _HB_CACHE_LOCK:
            _HB_LIVE_CACHE[cache_key] = {"ts": now, "data": info}
        return info
    except Exception:
        return None


def parse_price_str(s):
    """Parses monetary string into float for BRL and MXN (e.g. '3.180', '2.140,02', 'R$ 2.440', '$ 7,499.00')."""
    if not s:
        return None
    s = s.strip().replace("R$", "").replace("MX$", "").replace("MXN", "").replace("$", "").replace("\xa0", "").strip()
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    elif "." in s and len(s.split(".")[-1]) == 3:
        s = s.replace(".", "")
    try:
        val = float(s)
        return val if val > 0 else None
    except Exception:
        return None

parse_brl_str = parse_price_str


def extract_store_price_and_availability(body, final_url=""):
    """
    Extracts (live_price, is_available, active_page_coupons) from merchant HTML.
    Crucially:
    - On KaBuM, extracts 'priceWithDiscount' (Pix price) from __NEXT_DATA__, NOT 'price' (installment price),
      and checks 'available' boolean.
    - On Shopee and Mercado Livre '/social/' hub pages, returns None for live_price so random carousel/shell
      values are never mistaken for the product's price.
    """
    if not body:
        return None, True, set()

    u_low = (final_url or "").lower()
    page_coupons = set()

    # 1. KaBuM! (__NEXT_DATA__ contains exact Pix price and stock status)
    if "kabum.com.br" in u_low:
        m_nd = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', body)
        if m_nd:
            s_nd = m_nd.group(1)
            avail_m = re.search(r'"available"\s*:\s*(true|false)', s_nd)
            if avail_m and avail_m.group(1) == "false":
                return None, False, page_coupons
            pwd_m = re.findall(r'"priceWithDiscount"\s*:\s*([0-9]+(?:\.[0-9]+)?)', s_nd)
            valid_pwd = [float(x) for x in pwd_m if float(x) > 50]
            if valid_pwd:
                return round(valid_pwd[0], 2), True, page_coupons

    # 2. Pichau (Next.js __NEXT_DATA__ and HTML Pix price & stock verification)
    if "pichau.com.br" in u_low:
        # Check out-of-stock indicators
        if re.search(r'indispon[íi]vel|produto\s*esgotado|avise-me\s*quando\s*chegar|"inStock"\s*:\s*false|"available"\s*:\s*false', body, re.I):
            return None, False, page_coupons
        m_nd_p = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', body)
        if m_nd_p:
            s_p = m_nd_p.group(1)
            if re.search(r'"inStock"\s*:\s*false|"available"\s*:\s*false', s_p):
                return None, False, page_coupons
            pix_m = re.findall(r'"(?:pixPrice|finalPrice|price)"\s*:\s*([0-9]+(?:\.[0-9]+)?)', s_p)
            valid_pix = [float(x) for x in pix_m if float(x) > 50]
            if valid_pix:
                return round(min(valid_pix), 2), True, page_coupons
        # Fallback HTML Pix price
        pix_html = re.search(r'(?:à\s*vista|no\s*Pix)[^<]{0,100}?(?:R\$|\$)\s*([0-9\.,]+)', body, re.I)
        if pix_html:
            p = parse_price_str(pix_html.group(1))
            if p and p > 50:
                return p, True, page_coupons

    # 3. Terabyte (valVista cash/Pix price & explicit stock checks)
    if "terabyteshop.com.br" in u_low:
        if re.search(r'id=[\'"]btn-comprar-esgotado[\'"]|class=[\'"][^\'"]*tit-indisponivel[^\'"]*[\'"]|Produto\s*Indispon[íi]vel|avise-me\s*quando\s*chegar', body, re.I):
            return None, False, page_coupons
        tb_vista = re.search(r'id=[\'"]valVista[\'"][^>]*>\s*R?\$?\s*([0-9\.,]+)', body, re.I)
        if not tb_vista:
            tb_vista = re.search(r'class=[\'"][^\'"]*val-prod[^\'"]*[\'"][^>]*>\s*R?\$?\s*([0-9\.,]+)', body, re.I)
        if tb_vista:
            p = parse_price_str(tb_vista.group(1))
            if p and p > 50:
                return p, True, page_coupons

    # 4. Amazon BR (priceToPay / apexPriceToPay cash price & stock check)
    if "amazon.com.br" in u_low or "amzn.to" in u_low:
        if re.search(r'Não temos previsão de quando este produto estará novamente em estoque|Atualmente indisponível|Disponibilidade:\s*Não disponível', body, re.I):
            return None, False, page_coupons
        az_m = re.search(r'class=[\'"][^\'"]*(?:priceToPay|apexPriceToPay)[^\'"]*[\'"][\s\S]{1,300}?class=[\'"]a-offscreen[\'"][^>]*>\s*R?\$?\s*([0-9\.,]+)', body, re.I)
        if az_m:
            p = parse_price_str(az_m.group(1))
            if p and p > 50:
                return p, True, page_coupons

    # 5. Shopee (100% client-rendered SPA shell -> do not guess price/stock from empty HTML)
    if "shopee.com" in u_low or "s.shopee" in u_low:
        return None, None, page_coupons

    # 6. Mercado Livre /social/ affiliate feed -> not a single product page
    if ("mercadolivre.com" in u_low or "mercadolibre.com" in u_low) and "/social/" in u_low:
        return None, None, page_coupons

    # 7. Mercado Livre / Mercado Libre direct product page (Cash price, ignore previous old price)
    if "mercadolivre.com" in u_low or "mercadolibre.com" in u_low:
        if re.search(r'class=[\'"][^\'"]*ui-pdp-buybox__quantity__unavailable[^\'"]*[\'"]|Estoque esgotado|O vendedor pausou o anúncio', body, re.I):
            return None, False, page_coupons
        pdp_match = re.search(r'class=[\'"][^\'"]*ui-pdp-price__second-line[^\'"]*[\'"][\s\S]{1,500}?class=[\'"][^\'"]*andes-money-amount__fraction[^\'"]*[\'"][^>]*>([\d\.]+)<', body)
        if not pdp_match:
            pdp_match = re.search(r'class=[\'"][^\'"]*ui-pdp-price[^\'"]*[\'"][\s\S]{1,500}?(?<!andes-money-amount--previous[\s\S]{0,80})class=[\'"][^\'"]*andes-money-amount__fraction[^\'"]*[\'"][^>]*>([\d\.]+)<', body)
        if pdp_match:
            cents_match = re.search(r'class=[\'"][^\'"]*ui-pdp-price[^\'"]*[\'"][\s\S]{1,700}?class=[\'"][^\'"]*andes-money-amount__cents[^\'"]*[\'"][^>]*>(\d{2})<', body)
            cents = ("." + cents_match.group(1)) if cents_match else ""
            p = parse_price_str(pdp_match.group(1) + cents)
            if p and p > 50:
                return p, True, page_coupons

    # 8. Cyberpuerta & DDTech (Mexico)
    if "cyberpuerta.mx" in u_low or "ddtech.mx" in u_low:
        cp_match = re.search(r'class=[\'"][^\'"]*price[^\'"]*[\'"][^>]*>\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)', body)
        if cp_match:
            p = parse_price_str(cp_match.group(1))
            if p and p > 50:
                return p, True, page_coupons

    # 6. Meta tags (Amazon, Magalu, Pichau, Terabyte, Cyberpuerta)
    meta_p = re.findall(r'<meta[^>]+property=[\'"]product:price:amount[\'"][^>]+content=[\'"]([\d\.,]+)[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+content=[\'"]([\d\.,]+)[\'"][^>]+property=[\'"]product:price:amount[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+itemprop=[\'"]price[\'"][^>]+content=[\'"]([\d\.,]+)[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+content=[\'"]([\d\.,]+)[\'"][^>]+itemprop=[\'"]price[\'"]', body, re.I)
    for m in meta_p:
        p = parse_price_str(m)
        if p and p > 50:
            return p, True, page_coupons

    # 7. JSON-LD schema (offers.price)
    json_ld = re.findall(r'<script[^>]+type=[\'"]application/ld\+json[\'"][^>]*>([\s\S]*?)</script>', body, re.I)
    for block in json_ld:
        try:
            data = json.loads(block)
            offers = data.get('offers')
            if isinstance(offers, dict):
                avail = str(offers.get('availability', '')).lower()
                if 'outofstock' in avail or 'discontinued' in avail:
                    return None, False, page_coupons
                if 'price' in offers:
                    p = parse_price_str(str(offers['price']))
                    if p and p > 50:
                        return p, True, page_coupons
            elif isinstance(offers, list) and offers:
                avail = str(offers[0].get('availability', '')).lower()
                if 'outofstock' in avail or 'discontinued' in avail:
                    return None, False, page_coupons
                if 'price' in offers[0]:
                    p = parse_price_str(str(offers[0]['price']))
                    if p and p > 50:
                        return p, True, page_coupons
        except Exception:
            pass

    # 8. Promodescuentos thread price
    if "promodescuentos.com" in u_low:
        pd_match = re.search(r'class=[\'"][^\'"]*thread-price[^\'"]*[\'"][^>]*>\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*)', body)
        if pd_match:
            p = parse_price_str(pd_match.group(1))
            if p and p > 50:
                return p, True, page_coupons

    return None, None, page_coupons


def extract_store_price(body, final_url=""):
    p, _, _ = extract_store_price_and_availability(body, final_url)
    return p


def _load_coupon_status_unlocked(reg_id=None):
    fpath = get_status_file(reg_id)
    if os.path.exists(fpath):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    if "coupons" not in data:
                        data["coupons"] = {}
                    if "deals" not in data:
                        data["deals"] = {}
                    return data
        except Exception:
            pass
    return {"coupons": {}, "deals": {}, "updated_at": time.strftime("%Y-%m-%d %H:%M:%S")}


def _save_coupon_status_unlocked(data, reg_id=None):
    fpath = get_status_file(reg_id)
    try:
        os.makedirs(os.path.dirname(fpath), exist_ok=True)
        data["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[CouponTracker ({reg_id or 'br'})] Erro ao salvar status: {e}")


def load_coupon_status(reg_id=None):
    with _STATUS_LOCK:
        return _load_coupon_status_unlocked(reg_id)


def save_coupon_status(data, reg_id=None):
    with _STATUS_LOCK:
        _save_coupon_status_unlocked(data, reg_id)


def record_coupon_status(coupon_code, status, reason, source="channel_report", reg_id=None):
    if not coupon_code:
        return
    code = coupon_code.strip().upper()
    if code in STOP_WORDS or len(code) < 4:
        return

    with _STATUS_LOCK:
        data = _load_coupon_status_unlocked(reg_id)
        data["coupons"][code] = {
            "status": status,  # "expired", "verified", "unverified", "out_of_stock"
            "reason": reason,
            "source": source,
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        _save_coupon_status_unlocked(data, reg_id)
        return data["coupons"][code]


def record_deal_status(post_id, status, reason, source="live_test", url=None, reg_id=None, live_price=None, stock_verified=False, coupon_status=None, store_name=None, final_url=None):
    if not post_id and not url:
        return
    with _STATUS_LOCK:
        data = _load_coupon_status_unlocked(reg_id)
        entry = {
            "status": status,
            "reason": reason,
            "source": source,
            "live_price": live_price,
            "stock_verified": bool(stock_verified),
            "coupon_status": coupon_status,
            "store_name": store_name,
            "final_url": final_url,
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        if post_id:
            data["deals"][post_id] = entry
            data["deals"][post_id.lower()] = entry
        if url:
            data["deals"][url] = entry
        _save_coupon_status_unlocked(data, reg_id)
        return entry


def scan_texts_for_expiries(texts_or_messages, reg_id=None):
    data = load_coupon_status(reg_id)
    detected = {"coupons": {}, "deals": {}}

    for msg in texts_or_messages:
        if isinstance(msg, dict):
            text = (msg.get("title", "") + "\n" + msg.get("head_text", "") + "\n" + msg.get("raw_text", "")).strip()
            ch_id = msg.get("channel_id", "")
            post_id = msg.get("post_id", "")
        else:
            text = str(msg).strip()
            ch_id = ""
            post_id = ""

        if not text:
            continue

        clean = html.unescape(re.sub(r"<[^>]+>", " ", text))
        low = clean.lower()

        if not any(k in low for k in ["acabou", "expir", "esgot", "encerr", "finaliz", "invalido", "inválido", "morreu", "agot", "venc"]):
            continue

        ref_post = re.search(r"t\.me/([^/\s]+)/(\d+)", clean)
        ref_post_id = f"{ref_post.group(1)}/{ref_post.group(2)}" if ref_post else None

        for pat in EXPIRY_REGEXES:
            for m in pat.finditer(clean):
                code = m.group(1).upper()
                if code in STOP_WORDS or len(code) < 4:
                    continue
                reason = f"Grupo/Canal @{ch_id or 'radar'} avisou: '{clean[:80]}...'"
                data["coupons"][code] = {
                    "status": "expired",
                    "reason": reason,
                    "source": "channel_report",
                    "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
                detected["coupons"][code] = data["coupons"][code]

        if ref_post_id and any(k in low for k in ["acabou", "esgotou", "expirou", "encerrado", "finalizado", "agotado", "expiró"]):
            data["deals"][ref_post_id] = {
                "status": "out_of_stock",
                "reason": f"Canal avisou término: '{clean[:80]}...'",
                "source": "channel_report",
                "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            detected["deals"][ref_post_id] = data["deals"][ref_post_id]

        if post_id and re.search(r"^\s*\[?(?:esgotou|acabou|encerrado|expirado|finalizado|agotado|expiró)\]?", clean, re.I):
            data["deals"][post_id] = {
                "status": "out_of_stock",
                "reason": "Post editado para Esgotado / Agotado",
                "source": "channel_report",
                "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            detected["deals"][post_id] = data["deals"][post_id]

    if detected["coupons"] or detected["deals"]:
        save_coupon_status(data, reg_id)

    return detected


def _infer_slug_from_cache(post_id=None, buy_url=None, reg_id="br"):
    """Looks up matched_slug, matched_kind, requires_coupon, and age_hours from promos_cache if not explicitly passed."""
    try:
        cache_path = os.path.join(BASE_DIR, "data", "promos_cache.json" if reg_id == "br" else f"promos_cache_{reg_id}.json")
        if os.path.exists(cache_path):
            with open(cache_path, "r", encoding="utf-8") as f:
                c_data = json.load(f)
            for d in c_data.get("matched_deals", []):
                if (post_id and d.get("post_id") == post_id) or (buy_url and d.get("buy_url") == buy_url):
                    return (
                        d.get("matched_slug"),
                        d.get("matched_kind", "gpu"),
                        bool(d.get("requires_coupon") or d.get("coupon_code") or d.get("coupon_info")),
                        float(d.get("age_hours") or 1.0),
                        d.get("store_name") or ""
                    )
    except Exception:
        pass
    return None, "gpu", False, 1.0, ""


def test_deal_url_and_coupon(
    buy_url,
    coupon_code=None,
    expected_price=None,
    timeout=8,
    post_id=None,
    reg_id=None,
    matched_slug=None,
    matched_kind=None,
    requires_coupon=None,
    age_hours=None,
    store_name=None
):
    """
    Comprehensive 2-Layer Store & Coupon Validator:
    Layer 1: Direct HTTP store inspection (KaBuM __NEXT_DATA__, ML, Amazon, etc.)
    Layer 2: Hardware Barato Live In-Stock Offer & Coupon Cross-Verification (solves Terabyte/Pichau 403,
             Shopee SPA shells, ML social hubs, and verifies whether a coupon code is actually active!)
    """
    reg = (reg_id or "br").lower().strip()
    if not matched_slug and (post_id or buy_url):
        inf_slug, inf_kind, inf_req, inf_age, inf_store = _infer_slug_from_cache(post_id, buy_url, reg)
        matched_slug = matched_slug or inf_slug
        matched_kind = matched_kind or inf_kind
        if requires_coupon is None:
            requires_coupon = inf_req
        if age_hours is None:
            age_hours = inf_age
        if not store_name:
            store_name = inf_store

    if requires_coupon is None:
        requires_coupon = bool(coupon_code)
    if age_hours is None:
        age_hours = 1.0

    clean_coup = (coupon_code or "").strip().upper() or None

    res = {
        "valid": False,
        "status": "untested",  # "active" | "unverified_coupon" | "expired" | "out_of_stock" | "untested"
        "coupon_status": "unverified" if (clean_coup or requires_coupon) else "none",
        "stock_verified": False,
        "reason": "Aguardando verificação na loja",
        "final_url": buy_url,
        "live_price": None,
        "tested_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    if not buy_url or not buy_url.startswith("http"):
        res["reason"] = "Sem URL de compra válida"
        return res

    final_url = buy_url
    direct_live_price = None
    direct_is_available = None
    http_error_code = None

    # --- LAYER 1: Direct Store HTTP Check ---
    store_key, store_label = normalize_br_store_key(final_url or buy_url, store_name)
    res["store_name"] = store_label

    try:
        req = urllib.request.Request(buy_url, headers=CHROME_HEADERS)
        opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler)
        with opener.open(req, timeout=timeout) as resp:
            final_url = resp.geturl()
            res["final_url"] = final_url
            code = resp.getcode()
            body = resp.read().decode("utf-8", errors="ignore")
            low = body.lower()

            # Resolve meta refresh, JavaScript redirects, or intermediate aggregator links
            # (e.g. adrena.click, seuhardware, aoferta.net, benchpromos, etc.)
            meta_refresh = re.search(r'<meta[^>]*http-equiv=[\'"]refresh[\'"][^>]*content=[\'"][^;]*;\s*url=([^\'"]+)', body, re.I)
            js_redirect = re.search(r'(?:window\.location(?:\.replace|\.href)?|location\.href)\s*=\s*[\'"](https?://[^\'"]+)[\'"]', body, re.I)
            target_url = None
            if meta_refresh:
                target_url = meta_refresh.group(1).strip()
            elif js_redirect:
                target_url = js_redirect.group(1).strip()
            elif any(k in final_url for k in ["benchpromos.com.br", "promocoes", "adrena.click", "seuhardware", "aoferta.net"]):
                outgoing = re.findall(r'href=[\'"](https?://(?:meli\.la|mercadolivre|kabum|pichau|terabyteshop|s\.shopee|amazon)[^\'"]*)[\'"]', body, re.I)
                if outgoing:
                    target_url = outgoing[0].strip()

            if target_url and target_url != final_url and target_url.startswith("http"):
                try:
                    req_out = urllib.request.Request(target_url, headers=CHROME_HEADERS)
                    with opener.open(req_out, timeout=timeout) as resp_out:
                        final_url = resp_out.geturl()
                        res["final_url"] = final_url
                        body = resp_out.read().decode("utf-8", errors="ignore")
                        low = body.lower()
                except urllib.error.HTTPError as he_out:
                    final_url = getattr(he_out, "url", target_url) or target_url
                    res["final_url"] = final_url
                    http_error_code = he_out.code
                except Exception:
                    final_url = target_url
                    res["final_url"] = final_url

            store_key, store_label = normalize_br_store_key(final_url or buy_url, store_name)
            res["store_name"] = store_label

            if code in (404, 410):
                res["valid"] = False
                res["status"] = "out_of_stock"
                res["reason"] = f"Página não encontrada na loja (HTTP {code})"
                record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, store_name=store_label, final_url=final_url)
                return res

            # Check region-appropriate Out-Of-Stock patterns
            oos_list = OOS_PATTERNS_MX if reg == "mx" else OOS_PATTERNS_BR
            for pat, reason_text in oos_list:
                if re.search(pat, low):
                    res["valid"] = False
                    res["status"] = "out_of_stock"
                    res["reason"] = reason_text
                    record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, store_name=store_label, final_url=final_url)
                    return res

            direct_live_price, direct_is_available, _ = extract_store_price_and_availability(body, final_url)
            if direct_is_available is False:
                res["valid"] = False
                res["status"] = "out_of_stock"
                res["reason"] = "Produto esgotado / indisponível na loja"
                record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, store_name=store_label, final_url=final_url)
                return res

    except urllib.error.HTTPError as he:
        http_error_code = he.code
        if getattr(he, "url", None):
            final_url = he.url
            res["final_url"] = final_url
            store_key, store_label = normalize_br_store_key(final_url or buy_url, store_name)
            res["store_name"] = store_label
        if he.code in (404, 410):
            res["valid"] = False
            res["status"] = "out_of_stock"
            res["reason"] = f"Produto removido / página não encontrada na loja (HTTP {he.code})"
            record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, store_name=store_label, final_url=final_url)
            return res
    except Exception:
        pass

    # --- LAYER 2: Cross-Verify Against Hardware Barato Live In-Stock Index (Brazil) ---
    store_key, store_label = normalize_br_store_key(final_url or buy_url, store_name)
    res["store_name"] = store_label
    hb_info = fetch_hb_live_slug_info(matched_kind, matched_slug) if (reg == "br" and matched_slug) else None

    store_min_base = None
    store_min_coup = None
    store_active_coupons = set()
    store_has_stock = None

    if hb_info and store_key:
        store_offers = hb_info["by_store"].get(store_key, [])
        store_active_coupons = set(hb_info["active_coupons"].get(store_key, []))
        if len(store_offers) == 0:
            store_has_stock = False
        else:
            store_has_stock = True
            store_min_base = store_offers[0]["price"]
            coup_prices = [o["coupon_price"] for o in store_offers if o.get("coupon_price")]
            if coup_prices:
                store_min_coup = min(coup_prices)

            # Check if final_url has a specific product ID on Terabyte or KaBuM that matches an in-stock offer
            m_prod_id = re.search(r"/produto/(\d+)", final_url)
            if m_prod_id:
                pid = m_prod_id.group(1)
                matching_pid_offers = [o for o in store_offers if f"/produto/{pid}" in (o.get("url") or "")]
                if matching_pid_offers:
                    store_min_base = matching_pid_offers[0]["price"]
                    if matching_pid_offers[0].get("coupon_price"):
                        store_min_coup = matching_pid_offers[0]["coupon_price"]
                elif store_key == "terabyte" and direct_live_price is None:
                    # Specific Terabyte product ID is NOT in Hardware Barato's live in-stock list!
                    res["valid"] = False
                    res["status"] = "out_of_stock"
                    res["reason"] = f"Produto esgotado na {store_label} (anúncio #{pid} sem estoque ativo)"
                    record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, store_name=store_label, final_url=final_url)
                    return res

    # If the store has 0 units of this hardware model in stock in Brazil right now
    if store_has_stock is False and direct_live_price is None:
        res["valid"] = False
        res["status"] = "out_of_stock"
        res["reason"] = f"Produto esgotado na {store_label} (0 unidades em estoque hoje)"
        record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, store_name=store_label, final_url=final_url)
        return res

    effective_live_price = direct_live_price or store_min_base
    res["live_price"] = effective_live_price

    # Evaluate price & coupon honesty
    if effective_live_price and expected_price and expected_price > 50:
        if not clean_coup and not requires_coupon:
            # Direct offer (no coupon needed): store price must match expected promo within 6%
            if effective_live_price > expected_price * 1.06:
                res["valid"] = False
                res["status"] = "out_of_stock"
                res["reason"] = f"Oferta encerrada na {store_label} — menor preço em estoque hoje: R$ {effective_live_price:,.2f} (era R$ {expected_price:,.2f})"
                record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=False, store_name=store_label, final_url=final_url)
                return res
            else:
                res["valid"] = True
                res["status"] = "active"
                res["coupon_status"] = "none"
                res["stock_verified"] = True
                res["reason"] = f"Confirmado em estoque na {store_label} por R$ {effective_live_price:,.2f} (sem depender de cupom)"
                record_deal_status(post_id, "active", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=True, coupon_status="none", store_name=store_label, final_url=final_url)
                return res
        else:
            # Offer requires a coupon or app voucher
            store_coupon_details = hb_info.get("active_coupons_details", {}).get(store_key, {}) if hb_info else {}
            coup_rule = store_coupon_details.get(clean_coup) if clean_coup else None
            is_coupon_confirmed = bool(clean_coup and clean_coup in store_active_coupons)

            # Minimum purchase spend validation (Argon Item 2)
            if is_coupon_confirmed and coup_rule:
                min_spend = coup_rule.get("min_spend")
                if min_spend and expected_price and expected_price < (min_spend - 5.0):
                    res["valid"] = False
                    res["status"] = "expired"
                    res["coupon_status"] = "expired"
                    res["reason"] = f"Cupom {clean_coup} exige gasto mínimo de R$ {min_spend:,.2f} na {store_label} (item anunciado: R$ {expected_price:,.2f})"
                    record_coupon_status(clean_coup, "expired", res["reason"], source="live_test", reg_id=reg)
                    record_deal_status(post_id, "expired", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=True, coupon_status="expired", store_name=store_label, final_url=final_url)
                    return res

            if is_coupon_confirmed and store_min_coup and store_min_coup <= expected_price * 1.06:
                res["valid"] = True
                res["status"] = "active"
                res["coupon_status"] = "verified"
                res["stock_verified"] = True
                res["reason"] = f"Cupom {clean_coup} confirmado ativo na {store_label} (R$ {store_min_coup:,.2f})"
                record_coupon_status(clean_coup, "verified", res["reason"], source="live_test", reg_id=reg)
                record_deal_status(post_id, "active", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=True, coupon_status="verified", store_name=store_label, final_url=final_url)
                return res

            # If store base price already matches expected_price without needing a coupon
            if effective_live_price <= expected_price * 1.03:
                res["valid"] = True
                res["status"] = "active"
                res["coupon_status"] = "verified"
                res["stock_verified"] = True
                res["reason"] = f"Em estoque na {store_label} já por R$ {effective_live_price:,.2f} direto!"
                record_deal_status(post_id, "active", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=True, coupon_status="verified", store_name=store_label, final_url=final_url)
                return res

            # If store base price is way too high even for a coupon (>22% or >R$ 400 above expected)
            max_plausible_base = max(expected_price * 1.22, expected_price + 400)
            if effective_live_price > max_plausible_base:
                res["valid"] = False
                res["status"] = "expired"
                res["coupon_status"] = "expired"
                res["reason"] = f"Oferta encerrada na {store_label} — preço atual subiu para R$ {effective_live_price:,.2f} (anunciado R$ {expected_price:,.2f})"
                if clean_coup:
                    record_coupon_status(clean_coup, "expired", res["reason"], source="live_test", reg_id=reg)
                record_deal_status(post_id, "expired", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=False, coupon_status="expired", store_name=store_label, final_url=final_url)
                return res

            # If post is > 6 hours old and coupon is NOT in store's active coupon list -> expired coupon!
            if age_hours > 6.0 and not is_coupon_confirmed:
                res["valid"] = False
                res["status"] = "expired"
                res["coupon_status"] = "expired"
                coup_lbl = f"Cupom {clean_coup}" if clean_coup else "Cupom/desconto do grupo"
                res["reason"] = f"{coup_lbl} expirado/inativo na {store_label} — preço atual em estoque sem cupom: R$ {effective_live_price:,.2f}"
                if clean_coup:
                    record_coupon_status(clean_coup, "expired", res["reason"], source="live_test", reg_id=reg)
                record_deal_status(post_id, "expired", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=True, coupon_status="expired", store_name=store_label, final_url=final_url)
                return res

            # Fresh post (<= 6h) with product in stock, but coupon requires cart/app verification
            res["valid"] = True
            res["status"] = "unverified_coupon"
            res["coupon_status"] = "unverified"
            res["stock_verified"] = True
            coup_lbl = f"cupom {clean_coup}" if clean_coup else "cupom/app"
            res["reason"] = f"Em estoque na {store_label} por R$ {effective_live_price:,.2f} (sem cupom). Valor de R$ {expected_price:,.2f} depende do {coup_lbl} aplicar no carrinho"
            if clean_coup:
                record_coupon_status(clean_coup, "unverified", res["reason"], source="live_test", reg_id=reg)
            record_deal_status(post_id, "unverified_coupon", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=True, coupon_status="unverified", store_name=store_label, final_url=final_url)
            return res

    # If we could not extract a live price from either Layer 1 or Layer 2:
    # NEVER falsely claim "Confirmado ativo na loja"!
    if age_hours > 8.0:
        res["valid"] = False
        res["status"] = "expired"
        res["reason"] = f"Oferta antiga ({age_hours:.1f}h) sem confirmação de estoque ativo na {store_label}"
        record_deal_status(post_id, "expired", res["reason"], url=buy_url, reg_id=reg, stock_verified=False, store_name=store_label, final_url=final_url)
        return res

    res["valid"] = False
    res["status"] = "untested"
    res["stock_verified"] = False
    res["reason"] = f"Estoque/preço na {store_label} não pôde ser confirmado automaticamente (verifique no link)"
    record_deal_status(post_id, "untested", res["reason"], url=buy_url, reg_id=reg, stock_verified=False, store_name=store_label, final_url=final_url)
    return res


def test_deals_batch(deals, max_items=60, reg_id=None):
    """
    Tests URLs, live store prices, and coupons for candidate deals concurrently.
    Pre-warms Hardware Barato live slug cache for all unique slugs first so store checks are instant.
    """
    reg = (reg_id or "br").lower().strip()
    by_slug_cheapest = {}
    for d in deals:
        s = d.get("matched_slug")
        if s and (s not in by_slug_cheapest or d.get("price_brl", 999999) < by_slug_cheapest[s].get("price_brl", 999999)):
            by_slug_cheapest[s] = d

    prioritized = list(by_slug_cheapest.values())
    seen_ids = {d.get("post_id") for d in prioritized}

    remaining = [d for d in deals if d.get("post_id") not in seen_ids]
    remaining.sort(key=lambda x: (x.get("age_hours", 999) > 12, x.get("age_hours", 999), -x.get("savings_vs_hb_brl", 0)))

    to_test = (prioritized + remaining)[:max_items]

    # Pre-warm Hardware Barato live slug cache in parallel for Brazil
    if reg == "br":
        unique_slugs = {(d.get("matched_kind", "gpu"), d.get("matched_slug")) for d in to_test if d.get("matched_slug")}
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
            list(ex.map(lambda ks: fetch_hb_slug_live_data_safe(ks[0], ks[1]), unique_slugs))

    results = {}

    def _worker(deal):
        url = deal.get("buy_url") or deal.get("post_url")
        coup = deal.get("coupon_code")
        exp_price = deal.get("promo_price_brl") or deal.get("price_brl")
        p_id = deal.get("post_id")
        r = test_deal_url_and_coupon(
            url,
            coupon_code=coup,
            expected_price=exp_price,
            post_id=p_id,
            reg_id=reg,
            matched_slug=deal.get("matched_slug"),
            matched_kind=deal.get("matched_kind"),
            requires_coupon=bool(deal.get("requires_coupon") or coup or deal.get("coupon_info")),
            age_hours=float(deal.get("age_hours") or 1.0),
            store_name=deal.get("store_name")
        )
        deal_id = p_id or url
        return deal_id, r

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        futures = [ex.submit(_worker, d) for d in to_test]
        for fut in concurrent.futures.as_completed(futures):
            try:
                deal_id, res = fut.result()
                results[deal_id] = res
            except Exception:
                pass

    return results


def fetch_hb_slug_live_data_safe(kind, slug):
    try:
        return fetch_hb_live_slug_info(kind, slug)
    except Exception:
        return None


def rewire_deals_and_best_by_slug(matched_deals, all_promos=None, reg_id=None):
    """
    Overlays verified live test statuses onto deals list and recomputes best_by_slug.
    Crucial Policy:
    1. Out-of-stock or expired deals are flagged is_expired = True.
    2. Deals with expired coupons have their coupon revoked and are flagged is_coupon_expired = True.
    3. Deals with unverified coupons keep their live_store_price_brl (price without coupon) visible
       and NEVER overwrite best_by_slug at an unverified coupon price!
    4. Only 100% stock_verified active deals (with no coupon needed, or a store-verified coupon)
       can enter best_by_slug to update catalog prices!
    """
    status_db = load_coupon_status(reg_id)
    coupons = status_db.get("coupons", {})
    deals_map = status_db.get("deals", {})

    rewired = []
    for d in matched_deals:
        item = dict(d)
        p_id = item.get("post_id", "")
        c_code = (item.get("coupon_code") or "").strip().upper()
        b_url = item.get("buy_url", "")
        req_coup = bool(item.get("requires_coupon") or c_code or item.get("coupon_info"))
        item["requires_coupon"] = req_coup
        item["promo_price_brl"] = item.get("promo_price_brl") or item.get("price_brl")

        deal_st = deals_map.get(p_id) or deals_map.get(p_id.lower()) or deals_map.get(b_url)
        coup_st = coupons.get(c_code) if c_code else None

        if deal_st:
            st_val = deal_st.get("status", "untested")
            item["deal_status"] = st_val
            item["deal_status_reason"] = deal_st.get("reason", "")
            item["stock_verified"] = bool(deal_st.get("stock_verified", False))
            if deal_st.get("store_name") and deal_st["store_name"] not in ("E-commerce", "Loja"):
                item["store_name"] = deal_st["store_name"]
            if deal_st.get("live_price"):
                item["live_store_price_brl"] = deal_st["live_price"]
                # If the store's direct price without coupon is already lower than or equal to expected price, use the real lower price
                if st_val == "active" and not req_coup and deal_st["live_price"] < item["price_brl"]:
                    item["price_brl"] = deal_st["live_price"]
                    if item.get("hb_price_brl"):
                        item["savings_vs_hb_brl"] = round(item["hb_price_brl"] - item["price_brl"], 2)
            if st_val in ("expired", "out_of_stock"):
                item["is_expired"] = True
            else:
                item["is_expired"] = False
        else:
            item["deal_status"] = "untested"
            item["stock_verified"] = False
            item["is_expired"] = bool(item.get("age_hours", 0) > 8.0)

        if coup_st:
            c_status_val = coup_st.get("status", "unverified")
            # Do not let an old deal's coupon expiry flag a brand-new post (<= 6h) whose deal_status is unverified_coupon
            if c_status_val == "expired" and deal_st and deal_st.get("status") == "unverified_coupon" and item.get("age_hours", 99) <= 6.0 and coup_st.get("source") != "channel_report":
                c_status_val = "unverified"
            item["coupon_status"] = c_status_val
            item["coupon_status_reason"] = coup_st.get("reason", "") if c_status_val == "expired" else ""
            if c_status_val == "expired":
                item["is_coupon_expired"] = True
                item["is_expired"] = True
                if item.get("live_store_price_brl") and item["live_store_price_brl"] > item["price_brl"]:
                    item["price_brl"] = item["live_store_price_brl"]
                    item["coupon_discount_revoked"] = True
                elif item.get("raw_price_brl") and item["raw_price_brl"] > item["price_brl"]:
                    item["price_brl"] = item["raw_price_brl"]
                    item["coupon_discount_revoked"] = True
                if item.get("hb_price_brl"):
                    item["savings_vs_hb_brl"] = round(item["hb_price_brl"] - item["price_brl"], 2)
        elif deal_st and deal_st.get("coupon_status"):
            item["coupon_status"] = deal_st["coupon_status"]
            if item["coupon_status"] == "expired":
                item["is_coupon_expired"] = True
                item["is_expired"] = True

        rewired.append(item)

    if all_promos:
        for p in all_promos:
            p_id = p.get("post_id", "")
            b_url = p.get("buy_url", "")
            deal_st = deals_map.get(p_id) or deals_map.get(p_id.lower()) or deals_map.get(b_url)
            if deal_st:
                st_val = deal_st.get("status", "untested")
                p["deal_status"] = st_val
                p["deal_status_reason"] = deal_st.get("reason", "")
                p["stock_verified"] = bool(deal_st.get("stock_verified", False))
                if deal_st.get("store_name") and deal_st["store_name"] not in ("E-commerce", "Loja"):
                    p["store_name"] = deal_st["store_name"]
                if deal_st.get("live_price"):
                    p["live_store_price_brl"] = deal_st["live_price"]
                if st_val in ("expired", "out_of_stock"):
                    p["is_expired"] = True
                if deal_st.get("coupon_status"):
                    p["coupon_status"] = deal_st["coupon_status"]
                    if deal_st["coupon_status"] == "expired":
                        p["is_coupon_expired"] = True
                        p["is_expired"] = True

    # Recompute best_by_slug strictly using ONLY stock_verified, active deals that do NOT rely on unverified coupons
    best_by_slug = {}
    for d in rewired:
        slug = d.get("matched_slug")
        if not slug:
            continue
        if d.get("is_expired") or d.get("is_coupon_expired"):
            continue
        if d.get("deal_status") != "active":
            continue
        if not d.get("stock_verified"):
            continue
        if (d.get("requires_coupon") or d.get("is_conditional_voucher")) and d.get("coupon_status") != "verified":
            continue
        if d.get("hb_price_brl") and d.get("price_brl", 999999) >= d["hb_price_brl"]:
            continue

        if slug not in best_by_slug or d.get("price_brl", 999999) < best_by_slug[slug].get("price_brl", 999999):
            best_by_slug[slug] = d

    return rewired, best_by_slug
