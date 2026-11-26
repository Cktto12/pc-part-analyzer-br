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
import urllib.parse
import concurrent.futures

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATUS_FILE = os.path.join(BASE_DIR, "data", "coupon_status.json")
_STATUS_LOCK = threading.Lock()

# In-memory 5-minute cache for Hardware Barato live in-stock store & coupon verification
_HB_LIVE_CACHE = {}
_HB_CACHE_LOCK = threading.Lock()
_HB_SLUG_LOCKS = {}
_HB_GLOBAL_COUPONS = {"ts": 0.0, "by_store": {}, "details": {}}

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
    "PARA", "ESTA", "ESSA", "ESSE", "HOJE", "AQUI", "MAIS", "MENOS", "PELO", "SITE", "LOJA",
    "SHOPEE", "KABUM", "MAGALU", "MERCADO", "LIVRE", "AMAZON", "PROMO", "OFERTA",
    "LINK", "DISPONIVEL", "DISPONÍVEL", "VALOR", "PRECO", "PREÇO", "ESTOQUE",
    "PRODUTO", "AINDA", "AGORA", "TUDO", "NAQUELE", "KKKKKKK", "PISCOU",
    "CUPOMO", "BLUSINHAS", "RESGATE", "SUBSTITUEM", "APARECER", "IFP43VOM",
    "QUEM", "QUAL", "ONDE", "QUANDO", "MUITO", "POUCO", "GRATIS", "GRÁTIS",
    "PIX", "NOPIX", "APP", "NOAPP", "PELOAPP", "MOEDAS", "SEGUIR", "TECNOLOGIA",
    "CLIENTES", "MEMBROS", "EXCLUSIVO", "NOTES", "INTEL", "AMD", "NVIDIA",
    "HTTPS", "HTTP", "WWW", "COM", "BR", "MX", "CYBERPUERTA", "DDTECH", "PROMODESCUENTOS"
}

_HYPE_NEGATION_RE = re.compile(
    r"(?:piscou\s+acabou|achou\s+que\s+acabou|n[ãa]o\s+acabou|n[ãa]o\s+expirou|n[ãa]o\s+esgotou|ainda\s+n[ãa]o\s+(?:acabou|expirou|esgotou)|quase\s+(?:acabando|esgotando)|esgotando)",
    re.IGNORECASE,
)

EXPIRY_REGEXES = [
    re.compile(r"\b([A-Z0-9][A-Z0-9_\-]{3,21})\s+(?:expirou|acabou|esgotou|encerrou|morreu|invalido|inválido|finalizou|expiró|expiro|agotó|agoto|terminó|termino|venció|vencio)\b", re.IGNORECASE),
    re.compile(r"(?:^|\n)\s*([A-Z0-9][A-Z0-9_\-]{3,21})\s*\n+\s*(?:expirou|acabou|esgotou|encerrou|morreu|invalido|inválido|finalizou|foi\s+de\s+base|j[aá]\s+era)\b", re.IGNORECASE),
    re.compile(r"(?:cupom|cupón|cupon|c[oó]digo)\s+([A-Z0-9][A-Z0-9_\-]{3,21})\s+(?:expirou|acabou|esgotou|encerrou|invalido|inválido|expiró|expiro|agotó|agoto|terminó|termino|venció|vencio)\b", re.IGNORECASE),
    re.compile(r"(?:expirou|acabou|esgotou|encerrou|finalizou|expiró|expiro|agotó|agoto|terminó|termino|venció|vencio)\s+(?:o\s+|el\s+)?(?:cupom\s+|cupón\s+|cupon\s+)?[:\-]?\s*\b([A-Z0-9][A-Z0-9_\-]{3,21})\b", re.IGNORECASE),
    re.compile(r"(?:o|el)\s+(?:cupom|cupón|cupon)\s+([A-Z0-9][A-Z0-9_\-]{3,21})\s+(?:expirou|expiró)", re.IGNORECASE),
    re.compile(r"(?:cupom|cupón|cupon)\s+(?:expirou|expiró|esgotado|agotado|inv[aá]lido)[\s\S]{1,80}?(?:cupom|cupón|cupon|c[oó]digo)\s*[:\-]?\s*\b([A-Z0-9][A-Z0-9_\-]{3,21})\b", re.IGNORECASE),
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

OOS_PATTERNS_EU = [
    (r"\bausverkauft\b", "Ausverkauft in EU store"),
    (r"derzeit\s+nicht\s+verf[üu]gbar", "Derzeit nicht verfügbar"),
    (r"nicht\s+auf\s+lager", "Nicht auf Lager"),
    (r"aktuell\s+nicht\s+lieferbar", "Aktuell nicht lieferbar"),
    (r"rupture\s+de\s+stock", "Rupture de stock"),
    (r"\bindisponible\b", "Indisponible"),
    (r"producto\s+agotado|sin\s+stock", "Agotado en tienda ES"),
    (r"currently\s+unavailable|out\s+of\s+stock", "Out of stock"),
]


def unwrap_affiliate_url(url_str):
    """Decodes HTML entities and unwraps affiliate redirectors (e.g. awin1 cread.php?ued=...)."""
    u = html.unescape((url_str or "").strip())
    for _ in range(3):
        low = u.lower()
        if "awin1.com" in low or "cread.php" in low:
            try:
                parsed = urllib.parse.urlparse(u)
                qs = urllib.parse.parse_qs(parsed.query)
                ued = qs.get("ued") or qs.get("p")
                if ued and ued[0]:
                    candidate = html.unescape(urllib.parse.unquote(ued[0]).strip())
                    if candidate.startswith("http"):
                        u = candidate
                        continue
            except Exception:
                pass
        break
    return u


def normalize_br_store_key(url_str="", store_name=""):
    unwrapped = unwrap_affiliate_url(url_str)
    u = (unwrapped or url_str or "").lower()
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
    if "amazon.com.br" in u or "amzn.to" in u or "a.co/" in u or "link.amazon" in u or "amazon" in s:
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
    if "waz.com.br" in u or "waz" == s.strip():
        return "waz", "WAZ"
    if "microgem" in u or "microgem" in s:
        return "microgem", "Microgem"
    if "ciapc" in u or "ciapc" in s:
        return "ciapc", "CiaPC"
    return None, (store_name or "Loja")


def fetch_hb_live_slug_info(kind, slug):
    """
    Fetches Hardware Barato's live in-stock offer list ('data') and verified coupon list ('coupons')
    for a given hardware slug (cached for 5 minutes).
    """
    if not slug or (kind or "").lower() == "laptop":
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
        if cached:
            ttl = 300 if cached["data"] is not None else 20
            if now - cached["ts"] < ttl:
                return cached["data"]
        slug_lock = _HB_SLUG_LOCKS.setdefault(cache_key, threading.Lock())

    with slug_lock:
        now = time.time()
        with _HB_CACHE_LOCK:
            cached = _HB_LIVE_CACHE.get(cache_key)
            if cached:
                ttl = 300 if cached["data"] is not None else 20
                if now - cached["ts"] < ttl:
                    return cached["data"]

        url = f"https://www.hardwarebarato.com/produtos/{cat}/{slug}"
        try:
            req = urllib.request.Request(url, headers=CHROME_HEADERS)
            with urllib.request.urlopen(req, timeout=5) as resp:
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
                _HB_LIVE_CACHE[cache_key] = {"ts": time.time(), "data": info}
                if time.time() - _HB_GLOBAL_COUPONS["ts"] > 600:
                    _HB_GLOBAL_COUPONS["by_store"] = {}
                    _HB_GLOBAL_COUPONS["details"] = {}
                _HB_GLOBAL_COUPONS["ts"] = time.time()
                for st_k, codes_set in active_coupons.items():
                    _HB_GLOBAL_COUPONS["by_store"].setdefault(st_k, set()).update(codes_set)
                for st_k, det_map in active_coupons_details.items():
                    _HB_GLOBAL_COUPONS["details"].setdefault(st_k, {}).update(det_map)
            return info
        except Exception:
            with _HB_CACHE_LOCK:
                _HB_LIVE_CACHE[cache_key] = {"ts": time.time(), "data": None}
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
            stock_m = re.search(r'"hasStock"\s*:\s*(true|false)', s_nd)
            if (avail_m and avail_m.group(1) == "false") or (stock_m and stock_m.group(1) == "false"):
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
    if "amazon.com.br" in u_low or "amzn.to" in u_low or "a.co/" in u_low:
        if re.search(r'Não temos previsão de quando este produto estará novamente em estoque|Atualmente indisponível|Disponibilidade:\s*Não disponível|Este item não está disponível|id=[\'"]outOfStock[\'"]', body, re.I):
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

    # Parse JSON-LD Schema.org availability BEFORE meta tags so OOS overrides stale price meta tags
    json_ld_prices = []
    json_ld_blocks = re.findall(r'<script[^>]+type=[\'"]application/ld\+json[\'"][^>]*>([\s\S]*?)</script>', body, re.I)
    def _iter_jsonld_items(obj):
        if isinstance(obj, dict):
            yield obj
            if isinstance(obj.get("@graph"), list):
                for sub in obj["@graph"]:
                    yield from _iter_jsonld_items(sub)
        elif isinstance(obj, list):
            for sub in obj:
                yield from _iter_jsonld_items(sub)

    for block in json_ld_blocks:
        try:
            parsed_ld = json.loads(block)
            for item in _iter_jsonld_items(parsed_ld):
                offers = item.get("offers")
                offer_list = [offers] if isinstance(offers, dict) else (offers if isinstance(offers, list) else [])
                for off in offer_list:
                    if not isinstance(off, dict):
                        continue
                    avail = str(off.get("availability", "")).lower()
                    if any(tok in avail for tok in ("outofstock", "soldout", "discontinued")):
                        return None, False, page_coupons
                    if "price" in off:
                        p = parse_price_str(str(off["price"]))
                        if p and p > 50:
                            json_ld_prices.append(p)
        except Exception:
            pass

    # 6. Meta tags (Amazon, Magalu, Pichau, Terabyte, Cyberpuerta)
    meta_p = re.findall(r'<meta[^>]+property=[\'"]product:price:amount[\'"][^>]+content=[\'"]([\d\.,]+)[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+content=[\'"]([\d\.,]+)[\'"][^>]+property=[\'"]product:price:amount[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+itemprop=[\'"]price[\'"][^>]+content=[\'"]([\d\.,]+)[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+content=[\'"]([\d\.,]+)[\'"][^>]+itemprop=[\'"]price[\'"]', body, re.I)
    for m in meta_p:
        p = parse_price_str(m)
        if p and p > 50:
            return p, True, page_coupons

    # 7. JSON-LD schema fallback prices
    if json_ld_prices:
        return json_ld_prices[0], True, page_coupons

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
                    if "group_coupons" not in data:
                        data["group_coupons"] = {}
                    return data
        except Exception:
            pass
    return {"coupons": {}, "deals": {}, "group_coupons": {}, "updated_at": time.strftime("%Y-%m-%d %H:%M:%S")}


def _save_coupon_status_unlocked(data, reg_id=None):
    fpath = get_status_file(reg_id)
    try:
        os.makedirs(os.path.dirname(fpath), exist_ok=True)
        # Keep coupon_status files lean over time
        if isinstance(data.get("deals"), dict) and len(data["deals"]) > 2400:
            sorted_d = sorted(data["deals"].items(), key=lambda kv: str((kv[1] or {}).get("updated_at") or ""), reverse=True)[:2200]
            data["deals"] = dict(sorted_d)
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


def _iso_to_epoch(ts_str):
    if not ts_str:
        return None
    try:
        from datetime import datetime, timezone
        s = str(ts_str).strip()
        if "T" in s:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
        dt = datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
        return dt.timestamp()
    except Exception:
        return None


def _get_global_hb_store_coupons(store_key, reg_id="br"):
    if not store_key or (reg_id or "br").lower() != "br":
        return set(), {}
    now = time.time()
    need_warm = False
    with _HB_CACHE_LOCK:
        if not _HB_GLOBAL_COUPONS["by_store"] or (now - _HB_GLOBAL_COUPONS["ts"] > 600):
            need_warm = True
    if need_warm:
        fetch_hb_slug_live_data_safe("gpu", "rtx-5060")
    with _HB_CACHE_LOCK:
        codes = set(_HB_GLOBAL_COUPONS["by_store"].get(store_key, set()))
        details = dict(_HB_GLOBAL_COUPONS["details"].get(store_key, {}))
    return codes, details


def record_coupon_status(coupon_code, status, reason, source="channel_report", reg_id=None, reported_ts=None):
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
            "reported_ts": float(reported_ts or time.time()),
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        _save_coupon_status_unlocked(data, reg_id)
        return data["coupons"][code]


def record_deal_status(post_id, status, reason, source="live_test", url=None, reg_id=None, live_price=None, stock_verified=False, coupon_status=None, store_name=None, final_url=None):
    if not post_id and not url:
        return
    with _STATUS_LOCK:
        data = _load_coupon_status_unlocked(reg_id)
        now_ts = time.time()
        entry = {
            "status": status,
            "reason": reason,
            "source": source,
            "live_price": live_price,
            "stock_verified": bool(stock_verified),
            "coupon_status": coupon_status,
            "store_name": store_name,
            "final_url": final_url,
            "tested_ts": now_ts,
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        if post_id:
            data["deals"][post_id] = entry
            data["deals"][post_id.lower()] = entry
        if url:
            data["deals"][url] = entry
        _save_coupon_status_unlocked(data, reg_id)
        return entry


def record_group_coupon_announcements(messages, reg_id=None):
    """Records coupon codes seen in recent group messages and clears stale expiries when explicitly reactivated."""
    if not messages:
        return {}
    reg = (reg_id or "br").lower().strip()
    now_ts = time.time()
    updated = {}
    with _STATUS_LOCK:
        data = _load_coupon_status_unlocked(reg)
        gc = data.setdefault("group_coupons", {})
        coupons_map = data.setdefault("coupons", {})
        changed = False

        for msg in messages:
            if not isinstance(msg, dict):
                continue
            codes = []
            for c in (msg.get("coupon_codes") or []):
                cu = str(c).strip().upper()
                if cu and cu not in STOP_WORDS and len(cu) >= 4 and cu not in codes:
                    codes.append(cu)
            c0 = str(msg.get("coupon_code") or "").strip().upper()
            if c0 and c0 not in STOP_WORDS and len(c0) >= 4 and c0 not in codes:
                codes.insert(0, c0)
            if not codes:
                continue

            post_ts = _iso_to_epoch(msg.get("timestamp")) or now_ts
            if (now_ts - post_ts) > 48 * 3600:
                continue

            txt = (msg.get("title", "") + "\n" + msg.get("head_text", "") + "\n" + msg.get("raw_text", "")).strip()
            clean_for_chk = _HYPE_NEGATION_RE.sub(" ", html.unescape(re.sub(r"<[^>]+>", " ", txt)))
            is_reactivation = bool(re.search(r"\b(?:voltou|retornou|ativ[oa]\s+novamente|novo\s+cupom)\b", txt, re.I))
            is_expiry_msg = any(k in clean_for_chk.lower() for k in ("expirou", "acabou", "esgotou", "encerrou", "morreu", "invalido", "inválido", "finalizou"))
            if is_expiry_msg and not is_reactivation:
                continue

            st_key, st_label = normalize_br_store_key(msg.get("buy_url") or "", msg.get("store_name") or "")
            ch_id = msg.get("channel_id") or ""
            for code in codes:
                prev = gc.get(code)
                channels = list(prev.get("channels", [])) if prev else []
                if ch_id and ch_id not in channels:
                    channels.append(ch_id)
                gc[code] = {
                    "store_key": st_key or (prev.get("store_key") if prev else None),
                    "store_name": st_label if st_label not in ("Loja", "E-commerce BR") else ((prev.get("store_name") if prev else None) or st_label),
                    "channels": channels[-10:],
                    "seen_count": (int(prev.get("seen_count", 0)) + 1) if prev else 1,
                    "first_seen_ts": prev.get("first_seen_ts", post_ts) if prev else post_ts,
                    "last_seen_ts": max(float(prev.get("last_seen_ts", 0) or 0), post_ts) if prev else post_ts,
                    "sample_info": (msg.get("coupon_info") or (prev.get("sample_info") if prev else ""))[:120],
                    "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
                updated[code] = gc[code]
                changed = True

                prev_c = coupons_map.get(code)
                if prev_c and prev_c.get("status") == "expired" and is_reactivation:
                    prev_rep = float(prev_c.get("reported_ts") or 0)
                    if post_ts > prev_rep + 1800:
                        coupons_map[code] = {
                            "status": "unverified",
                            "reason": f"Cupom {code} reativado em @{ch_id or 'grupo'}",
                            "source": "channel_report",
                            "reported_ts": post_ts,
                            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                        }

        # Prune group coupons older than 7 days
        for k in list(gc.keys()):
            if (now_ts - float(gc[k].get("last_seen_ts") or 0)) > 7 * 86400:
                del gc[k]
                changed = True

        if changed:
            _save_coupon_status_unlocked(data, reg)
    return updated


def scan_texts_for_expiries(texts_or_messages, reg_id=None):
    data = load_coupon_status(reg_id)
    detected = {"coupons": {}, "deals": {}}
    now_ts = time.time()

    for msg in texts_or_messages:
        if isinstance(msg, dict):
            text = (msg.get("title", "") + "\n" + msg.get("head_text", "") + "\n" + msg.get("raw_text", "")).strip()
            ch_id = msg.get("channel_id", "")
            post_id = msg.get("post_id", "")
            reply_to_post_id = msg.get("reply_to_post_id")
            post_ts = _iso_to_epoch(msg.get("timestamp")) or now_ts
        else:
            text = str(msg).strip()
            ch_id = ""
            post_id = ""
            reply_to_post_id = None
            post_ts = now_ts

        if not text:
            continue

        clean = html.unescape(re.sub(r"<[^>]+>", " ", text))
        # Strip hype/negation phrases ("PISCOU ACABOU", "NÃO ACABOU", "esgotando") BEFORE checking expiries
        clean_eff = _HYPE_NEGATION_RE.sub(" ", clean)
        low_eff = clean_eff.lower()

        has_exp_kw = any(k in low_eff for k in ["acabou", "expir", "esgot", "encerr", "finaliz", "invalido", "inválido", "morreu", "agot", "venc", "foi de base"])
        if not has_exp_kw and not (reply_to_post_id and any(k in low_eff for k in ["subiu", "pausad", "ja era", "já era"])):
            continue

        ref_post = re.search(r"t\.me/([^/\s]+)/(\d+)", clean_eff)
        ref_post_id = f"{ref_post.group(1)}/{ref_post.group(2)}" if ref_post else None

        for pat in EXPIRY_REGEXES:
            for m in pat.finditer(clean_eff):
                raw_code = m.group(1).strip("-_ ")
                code = raw_code.upper()
                if code in STOP_WORDS or len(code) < 4 or code.isdigit() or not re.search(r"[A-Z]", code):
                    continue
                prev_c = data["coupons"].get(code)
                prev_rep = float((prev_c or {}).get("reported_ts") or 0)
                if prev_c and prev_c.get("source") == "channel_report" and prev_rep > post_ts + 60:
                    continue
                reason = f"Grupo/Canal @{ch_id or 'radar'} avisou: '{clean[:80]}...'"
                data["coupons"][code] = {
                    "status": "expired",
                    "reason": reason,
                    "source": "channel_report",
                    "reported_ts": post_ts,
                    "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
                detected["coupons"][code] = data["coupons"][code]

        target_post_ids = [pid for pid in (reply_to_post_id, ref_post_id) if pid]
        if target_post_ids and any(k in low_eff for k in ["acabou", "esgot", "expir", "encerr", "finaliz", "agot", "morreu", "subiu", "pausad", "foi de base", "já era", "ja era"]):
            for tgt_pid in target_post_ids:
                entry = {
                    "status": "out_of_stock",
                    "reason": f"Resposta/Canal avisou término: '{clean[:80]}...'",
                    "source": "channel_report",
                    "tested_ts": post_ts,
                    "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
                data["deals"][tgt_pid] = entry
                data["deals"][tgt_pid.lower()] = entry
                detected["deals"][tgt_pid] = entry

        if post_id and (
            re.search(r"^\s*\[?(?:esgotou|esgotado|acabou|encerrado|expirado|finalizado|agotado|expir[oó])\]?", clean_eff, re.I)
            or re.search(r"(?:^|\n)\s*(?:edit\s*:\s*|❌\s*|🚫\s*)(?:esgotou|esgotado|acabou|encerrado|expirado|finalizado)\b", clean_eff, re.I)
        ):
            entry = {
                "status": "out_of_stock",
                "reason": "Post editado para Esgotado / Acabou",
                "source": "channel_report",
                "tested_ts": post_ts,
                "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            data["deals"][post_id] = entry
            data["deals"][post_id.lower()] = entry
            detected["deals"][post_id] = entry

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
            for grp in ("matched_deals", "smartphone_deals", "peripheral_deals", "misc_deals"):
                for d in c_data.get(grp, []):
                    if (post_id and d.get("post_id") == post_id) or (buy_url and d.get("buy_url") == buy_url):
                        return (
                            d.get("matched_slug"),
                            d.get("matched_kind", "gpu"),
                            bool(d.get("requires_coupon") or d.get("coupon_code") or d.get("coupon_codes") or d.get("coupon_info")),
                            float(d.get("age_hours") or 1.0),
                            d.get("store_name") or "",
                        )
    except Exception:
        pass
    return None, "gpu", False, 1.0, ""


def _is_direct_store_product_url(url_str):
    low = (url_str or "").lower()
    if any(s in low for s in ("kabum.com.br/produto", "terabyteshop.com.br/produto", "amazon.com.br/dp", "amazon.com.br/gp/product", "mercadolivre.com.br/p/", "produto.mercadolivre.com.br/mlb")):
        return True
    if "pichau.com.br/" in low:
        try:
            return len(urllib.parse.urlparse(low).path.strip("/")) > 3
        except Exception:
            return False
    return False


def _is_bot_challenge_html(body, final_url=""):
    low = (body or "").lower()
    if not low:
        return False
    if any(k in low for k in (
        "validatecaptcha", "api-services-support@amazon.com", "opfcaptcha",
        "cf-browser-verification", "just a moment...", "attention required! | cloudflare",
        "enable javascript and cookies to continue", "g-recaptcha", "hcaptcha"
    )):
        return True
    u_low = (final_url or "").lower()
    if "amazon.com" in u_low and len(body) < 12000 and "producttitle" not in low and "pricetopay" not in low:
        return True
    return False


def _extract_ml_social_product_url(body_html):
    """Extracts the primary featured product link from a Mercado Livre /social/ hub page."""
    unescaped = html.unescape(body_html or "")
    # Prefer featured card first (c_id=/home/card-featured or reco_item_pos=0)
    m_all = re.findall(
        r'https?://(?:www\.|produto\.)?mercadolivre\.com\.br/(?:[^"\'\s<>\\]+?/p/MLB\d+[^"\'\s<>\\]*|p/MLB\d+[^"\'\s<>\\]*|MLB[-_]?\d+[^"\'\s<>\\]*)',
        unescaped,
        re.I,
    )
    best = None
    best_score = -999
    for raw_u in m_all:
        u = raw_u.rstrip("\\\"',).;")
        ul = u.lower()
        if "/c/" in ul or "/social/" in ul or "categories" in ul:
            continue
        score = 0
        if "card-featured" in ul:
            score += 50
        if "reco_item_pos=0" in ul:
            score += 30
        if "/p/mlb" in ul or "produto.mercadolivre" in ul:
            score += 20
        if score > best_score:
            best_score = score
            # Strip tracking hash so redirector loads the clean PDP fast
            best = u.split("#")[0]
    return best


def _extract_aggregator_outgoing_url(body_html, base_url):
    unescaped = html.unescape(body_html or "")
    candidates = re.findall(
        r'(https?://(?:www\.)?(?:awin1\.com/cread\.php\?[^"\'\s<>\\]+|meli\.la/[^"\'\s<>\\]+|mercadolivre\.com\.br/[^"\'\s<>\\]+|kabum\.com\.br/produto/[^"\'\s<>\\]+|pichau\.com\.br/[^"\'\s<>\\]+|terabyteshop\.com\.br/produto/[^"\'\s<>\\]+|amzn\.to/[^"\'\s<>\\]+|amazon\.com\.br/[^"\'\s<>\\]+|s\.shopee\.com\.br/[^"\'\s<>\\]+|magazinevoce\.com\.br/[^"\'\s<>\\]+|divulgador\.magalu\.com/[^"\'\s<>\\]+))',
        unescaped,
        re.I,
    )
    skip_tokens = ("t.me/", "adrena.click/ofertas", "nerdofertas.com/t", "linktr.ee", "/politica", "/privacidade", "whatsapp.com", "escolha.cc", "instagram.com", "youtube.com")
    scored = []
    for raw_u in candidates:
        u = unwrap_affiliate_url(raw_u.rstrip("\\\"',).;"))
        u_low = u.lower()
        if u_low == (base_url or "").lower() or any(t in u_low for t in skip_tokens):
            continue
        # Skip generic homepages like 'https://www.amazon.com.br/' without a product path
        try:
            path = urllib.parse.urlparse(u_low).path.strip("/")
            if not path and "awin1.com" not in raw_u.lower():
                continue
        except Exception:
            pass
        score = 0
        if "/produto/" in u_low or "/dp/" in u_low or "/p/mlb" in u_low or "produto.mercadolivre" in u_low:
            score += 60
        if any(s in u_low for s in ("kabum.com.br", "terabyteshop.com.br", "pichau.com.br", "amazon.com.br", "mercadolivre.com.br")):
            score += 30
        if "awin1.com/cread.php" in raw_u.lower() or "meli.la" in u_low or "amzn.to" in u_low or "s.shopee" in u_low:
            score += 10
        scored.append((score, u))
    if not scored:
        return None
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def _extract_page_product_title(body, final_url=""):
    if not body or _is_bot_challenge_html(body, final_url):
        return ""
    # Prefer Amazon productTitle, JSON-LD Product name, og:title, h1, then <title>
    candidates = []
    m_az = re.search(r'id=["\']productTitle["\'][^>]*>(.*?)</span>', body, re.I | re.S)
    if m_az:
        candidates.append(m_az.group(1))
    m_og = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', body, re.I) or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']', body, re.I)
    if m_og:
        candidates.append(m_og.group(1))
    m_h1 = re.search(r'<h1[^>]*>(.*?)</h1>', body, re.I | re.S)
    if m_h1:
        candidates.append(m_h1.group(1))
    m_t = re.search(r'<title[^>]*>(.*?)</title>', body, re.I | re.S)
    if m_t:
        candidates.append(m_t.group(1))

    generic_titles = {"amazon.com.br", "mercado livre", "shopee brasil", "kabum!", "pichau", "terabyteshop", "magalu", "just a moment..."}
    for raw_c in candidates:
        cleaned = html.unescape(re.sub(r"<[^>]+>", " ", raw_c))
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if cleaned and cleaned.lower() not in generic_titles and len(cleaned) >= 10:
            return cleaned[:200]
    return ""


def _strip_vram_suffix(slug):
    return re.sub(r"-(?:4gb|6gb|8gb|10gb|12gb|16gb|24gb)$", "", (slug or "").lower().strip())


def _check_resolved_page_mismatch(matched_kind, matched_slug, item_specs, final_url, page_title):
    """Detects when a resolved store page clearly depicts a different GPU or Intel/AMD motherboard than claimed."""
    kind = (matched_kind or "").lower().strip()
    if kind not in ("gpu", "mobo"):
        return False, ""
    url_path = ""
    try:
        url_path = urllib.parse.unquote(urllib.parse.urlparse(final_url or "").path or "")
    except Exception:
        url_path = ""
    probe = f"{page_title or ''} {url_path}".strip()
    if not probe or len(probe) < 6:
        return False, ""

    if kind == "gpu" and matched_slug:
        try:
            import promo_radar
            cleaned = promo_radar._strip_gpu_comparison_clauses(probe)
            page_slug = promo_radar.match_gpu_slug_in_text(cleaned, allow_bare_with_gpu_title=False)
            if page_slug and _strip_vram_suffix(page_slug) != _strip_vram_suffix(matched_slug):
                return True, f"Link aponta para {page_slug.upper()} na loja (esperado {matched_slug.upper()})"
        except Exception:
            pass

    if kind == "mobo":
        try:
            import promo_radar
            page_sp = promo_radar.extract_mobo_specs_from_text(probe)
            deal_sp = item_specs if isinstance(item_specs, dict) else {}
            deal_sock = (deal_sp.get("socket") or "").upper()
            deal_plat = (deal_sp.get("platform") or promo_radar._platform_from_socket(deal_sock)).upper()
            deal_chip = (deal_sp.get("chip_base") or (deal_sp.get("chipset") or "")[:4]).lower()
            page_plat = (page_sp.get("platform") or promo_radar._platform_from_socket(page_sp.get("socket"))).upper()
            page_chip = (page_sp.get("chip_base") or "").lower()
            if deal_plat and page_plat and deal_plat != page_plat:
                return True, f"Link da loja é placa {page_plat} ({page_sp.get('socket') or page_sp.get('chipset')}), não {deal_plat}"
            if deal_chip and page_chip and deal_chip != page_chip and deal_chip in promo_radar._MOBO_CHIPSET_INFO and page_chip in promo_radar._MOBO_CHIPSET_INFO:
                return True, f"Link da loja é chipset {page_chip.upper()}, diferente de {deal_chip.upper()}"
        except Exception:
            pass

    return False, ""


def _fetch_resolved_product_page(start_url, timeout=5):
    """
    Follows HTTP redirects, affiliate wrappers (awin1 ued=), meta/JS redirects,
    ML /social/ hubs, and aggregator pages (benchpromos, seuhardware, aoferta, pechinchou, etc.) up to 4 hops.
    Returns (final_url, status_code, body, http_error_code, redirected_lost_product).
    """
    cur = unwrap_affiliate_url(start_url)
    had_product_path = bool(re.search(r"/(?:produto|dp)/\w+", cur, re.I))
    opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler)
    visited = set()
    final_url = cur
    code = None
    body = ""

    for _ in range(4):
        if not cur or cur in visited:
            break
        visited.add(cur)
        had_product_path = had_product_path or bool(re.search(r"/(?:produto|dp)/\w+", cur, re.I))
        try:
            req = urllib.request.Request(cur, headers=CHROME_HEADERS)
            with opener.open(req, timeout=timeout) as resp:
                resp_url = resp.geturl()
                final_url = unwrap_affiliate_url(resp_url)
                code = resp.getcode()
                body = resp.read(512000).decode("utf-8", errors="ignore")
        except urllib.error.HTTPError as he:
            err_url = unwrap_affiliate_url(getattr(he, "url", None) or cur)
            had_product_path = had_product_path or bool(re.search(r"/(?:produto|dp)/\w+", err_url, re.I))
            lost_prod = had_product_path and ("kabum.com.br" in err_url.lower() or "terabyteshop.com.br" in err_url.lower()) and not re.search(r"/produto/\d+", err_url)
            return err_url, he.code, "", he.code, lost_prod
        except Exception:
            return final_url, code, body, None, False

        had_product_path = had_product_path or bool(re.search(r"/(?:produto|dp)/\w+", resp_url, re.I) or re.search(r"/(?:produto|dp)/\w+", final_url, re.I))

        if final_url != resp_url and final_url not in visited:
            cur = final_url
            continue

        if _is_direct_store_product_url(final_url):
            break

        target_url = None
        f_low = final_url.lower()
        meta_refresh = re.search(r'<meta[^>]*http-equiv=[\'"]refresh[\'"][^>]*content=[\'"][^;]*;\s*url=([^\'"]+)', body, re.I)
        js_redirect = re.search(r'(?:window\.location(?:\.replace|\.href)?|location\.href)\s*=\s*[\'"](https?://[^\'"]+)[\'"]', body, re.I)
        if meta_refresh:
            target_url = unwrap_affiliate_url(meta_refresh.group(1).strip())
        elif js_redirect:
            target_url = unwrap_affiliate_url(js_redirect.group(1).strip())
        elif "mercadolivre.com.br/social/" in f_low:
            target_url = _extract_ml_social_product_url(body)
        elif "pechinchou.com.br" in f_low and re.search(r"oferta\s+encerrada|promo[çc][ãa]o\s+encerrada|cupom\s+esgotado", body, re.I):
            break
        elif any(k in f_low for k in ("benchpromos.com.br", "promocoes", "adrena.click", "seuhardware", "aoferta.net", "nerdofertas", "linkmc.click", "tidd.ly", "pechinchou.com.br", "pechin.co", "curt.link", "link.amazon")):
            target_url = _extract_aggregator_outgoing_url(body, final_url)

        if target_url and target_url.startswith("http") and target_url not in visited:
            cur = target_url
            continue
        break

    lost_prod = had_product_path and ("kabum.com.br" in final_url.lower() or "terabyteshop.com.br" in final_url.lower()) and not re.search(r"/produto/\d+", final_url)
    return final_url, code, body, None, lost_prod


def _collect_candidate_coupons(coupon_code=None, coupon_codes=None):
    out = []
    seen = set()
    for c in list(coupon_codes or []) + ([coupon_code] if coupon_code else []):
        cu = str(c or "").strip().upper()
        if cu and cu not in STOP_WORDS and len(cu) >= 4 and cu not in seen:
            seen.add(cu)
            out.append(cu)
    return out


def _is_channel_coupon_expired(coup_entry, post_ts=None):
    if not isinstance(coup_entry, dict) or coup_entry.get("status") != "expired":
        return False
    if coup_entry.get("source") != "channel_report":
        return False
    if post_ts is None:
        return True
    rep_ts = float(coup_entry.get("reported_ts") or 0)
    if rep_ts <= 0:
        return True
    return rep_ts >= (float(post_ts) - 1800.0)


def test_deal_url_and_coupon(
    buy_url,
    coupon_code=None,
    expected_price=None,
    timeout=5,
    post_id=None,
    reg_id=None,
    matched_slug=None,
    matched_kind=None,
    requires_coupon=None,
    age_hours=None,
    store_name=None,
    coupon_codes=None,
    coupon_mode=None,
    title=None,
    item_specs=None,
    post_ts=None,
):
    """
    Comprehensive 2-Layer Store & Coupon Validator:
    Layer 1: Direct HTTP store inspection (KaBuM __NEXT_DATA__, ML PDP/social, Amazon, Pichau, Pechinchou, etc.)
             including bot-challenge filtering and product identity mismatch verification (GPU & Intel/AMD Mobo).
    Layer 2: Hardware Barato Live In-Stock Offer & Global Store Coupon Cross-Verification + Group Expiry Check.
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

    candidate_coupons = _collect_candidate_coupons(coupon_code, coupon_codes)
    if requires_coupon is None:
        requires_coupon = bool(candidate_coupons)
    if age_hours is None:
        age_hours = 1.0

    clean_coup = candidate_coupons[0] if candidate_coupons else None

    res = {
        "valid": False,
        "status": "untested",  # "active" | "unverified_coupon" | "expired" | "out_of_stock" | "mismatch" | "untested"
        "coupon_status": "unverified" if (clean_coup or requires_coupon) else "none",
        "working_coupon_code": clean_coup,
        "stock_verified": False,
        "reason": "Aguardando verificação na loja",
        "final_url": buy_url,
        "page_title": "",
        "live_price": None,
        "tested_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    # Pre-check channel_report coupon expiries
    status_db = load_coupon_status(reg)
    coupons_db = status_db.get("coupons", {})
    group_coupons_db = status_db.get("group_coupons", {})
    surviving_coupons = [c for c in candidate_coupons if not _is_channel_coupon_expired(coupons_db.get(c), post_ts)]
    expired_by_group = [c for c in candidate_coupons if c not in surviving_coupons]

    if candidate_coupons and ((coupon_mode == "stack" and expired_by_group) or (not surviving_coupons)):
        dead_lbl = ", ".join(expired_by_group)
        res["valid"] = False
        res["status"] = "expired"
        res["coupon_status"] = "expired"
        res["working_coupon_code"] = None
        res["reason"] = f"Cupom {dead_lbl} expirado segundo aviso recente nos grupos"
        record_deal_status(post_id, "expired", res["reason"], url=buy_url, reg_id=reg, coupon_status="expired", store_name=store_name, final_url=buy_url)
        return res

    if surviving_coupons:
        clean_coup = surviving_coupons[0]
        res["working_coupon_code"] = clean_coup

    buy_url = unwrap_affiliate_url(buy_url)
    if not buy_url or not buy_url.startswith("http"):
        res["reason"] = "Sem URL de compra válida"
        return res

    final_url = buy_url
    direct_live_price = None
    direct_is_available = None
    http_error_code = None
    page_coupons = set()

    # --- LAYER 1: Direct Store HTTP Check ---
    final_url, code, body, http_error_code, redirected_lost_product = _fetch_resolved_product_page(buy_url, timeout=timeout)
    res["final_url"] = final_url
    store_key, store_label = normalize_br_store_key(final_url or buy_url, store_name)
    res["store_name"] = store_label

    if http_error_code in (404, 410) or code in (404, 410):
        err_code = http_error_code or code
        res["valid"] = False
        res["status"] = "out_of_stock"
        res["reason"] = f"Produto removido / página não encontrada na loja (HTTP {err_code})"
        record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, store_name=store_label, final_url=final_url)
        return res

    if redirected_lost_product:
        res["valid"] = False
        res["status"] = "out_of_stock"
        res["reason"] = f"Anúncio removido/redirecionado na {store_label} (sem página ativa do produto)"
        record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, store_name=store_label, final_url=final_url)
        return res

    bot_blocked = _is_bot_challenge_html(body, final_url)
    if bot_blocked:
        body = ""

    page_title = _extract_page_product_title(body, final_url) if body else ""
    res["page_title"] = page_title

    is_mismatch, mismatch_reason = _check_resolved_page_mismatch(matched_kind, matched_slug, item_specs, final_url, page_title)
    if is_mismatch:
        res["valid"] = False
        res["status"] = "mismatch"
        res["stock_verified"] = False
        res["reason"] = mismatch_reason
        record_deal_status(post_id, "mismatch", res["reason"], url=buy_url, reg_id=reg, stock_verified=False, store_name=store_label, final_url=final_url)
        return res

    if body:
        low = body.lower()
        if "pechinchou.com" in (final_url or "").lower() and re.search(r"oferta\s+encerrada|promo[çc][ãa]o\s+encerrada|cupom\s+esgotado", low):
            res["valid"] = False
            res["status"] = "out_of_stock"
            res["reason"] = "Oferta encerrada / cupom esgotado no Pechinchou"
            record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, store_name=store_label, final_url=final_url)
            return res

        # Check region-appropriate Out-Of-Stock patterns
        oos_list = OOS_PATTERNS_MX if reg == "mx" else (OOS_PATTERNS_EU if reg == "eu" else OOS_PATTERNS_BR)
        for pat, reason_text in oos_list:
            if re.search(pat, low):
                res["valid"] = False
                res["status"] = "out_of_stock"
                res["reason"] = reason_text
                record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, store_name=store_label, final_url=final_url)
                return res

        direct_live_price, direct_is_available, page_coupons = extract_store_price_and_availability(body, final_url)
        if direct_is_available is False:
            res["valid"] = False
            res["status"] = "out_of_stock"
            res["reason"] = "Produto esgotado / indisponível na loja"
            record_deal_status(post_id, "out_of_stock", res["reason"], url=buy_url, reg_id=reg, store_name=store_label, final_url=final_url)
            return res

    # --- LAYER 2: Cross-Verify Against Hardware Barato Live In-Stock Index & Global Coupons (Brazil) ---
    store_key, store_label = normalize_br_store_key(final_url or buy_url, store_name)
    res["store_name"] = store_label
    is_hb_kind = (matched_kind or "").lower() in ("gpu", "cpu", "ram", "mobo", "psu")
    hb_info = fetch_hb_live_slug_info(matched_kind, matched_slug) if (reg == "br" and matched_slug and is_hb_kind and not str(matched_slug).startswith("mobo-") and not str(matched_slug).startswith("psu-")) else None

    store_min_base = None
    store_min_coup = None
    store_active_coupons = set(page_coupons or set())
    store_coupon_details = {}
    store_has_stock = None

    if reg == "br" and store_key:
        g_codes, g_details = _get_global_hb_store_coupons(store_key, reg_id=reg)
        store_active_coupons.update(g_codes)
        store_coupon_details.update(g_details)

    if hb_info and store_key:
        store_offers = hb_info["by_store"].get(store_key, [])
        store_active_coupons.update(hb_info["active_coupons"].get(store_key, []))
        store_coupon_details.update(hb_info.get("active_coupons_details", {}).get(store_key, {}))
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
                elif store_key in ("terabyte", "kabum") and direct_live_price is None:
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
    if effective_live_price and expected_price and expected_price > 15:
        if not surviving_coupons and not requires_coupon:
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
            # Offer requires a coupon or app voucher: test surviving coupon codes against confirmed store coupons & min_spend
            confirmed_code = None
            min_spend_fail_reason = None
            for cand in surviving_coupons:
                coup_rule = store_coupon_details.get(cand)
                in_hb = cand in store_active_coupons
                if in_hb:
                    min_spend = (coup_rule or {}).get("min_spend")
                    if min_spend and expected_price and expected_price < (min_spend - 5.0):
                        min_spend_fail_reason = f"Cupom {cand} exige gasto mínimo de R$ {min_spend:,.2f} na {store_label} (item anunciado: R$ {expected_price:,.2f})"
                        continue
                    confirmed_code = cand
                    break

            max_plausible_base = max(expected_price * 1.25, expected_price + 450)

            # Check min_spend violation when no backup code passed
            if min_spend_fail_reason and not confirmed_code:
                res["valid"] = False
                res["status"] = "expired"
                res["coupon_status"] = "expired"
                res["reason"] = min_spend_fail_reason
                # Deal-level only (do NOT poison global coupon for higher-priced items!)
                record_deal_status(post_id, "expired", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=True, coupon_status="expired", store_name=store_label, final_url=final_url)
                return res

            # If store base price already matches expected_price without needing a coupon
            if effective_live_price <= expected_price * 1.03:
                res["valid"] = True
                res["status"] = "active"
                res["coupon_status"] = "verified"
                res["working_coupon_code"] = confirmed_code or clean_coup
                res["stock_verified"] = True
                res["reason"] = f"Em estoque na {store_label} já por R$ {effective_live_price:,.2f} direto!"
                record_deal_status(post_id, "active", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=True, coupon_status="verified", store_name=store_label, final_url=final_url)
                return res

            if confirmed_code and effective_live_price <= max_plausible_base and (not store_min_coup or store_min_coup <= expected_price * 1.08 or (direct_live_price and direct_live_price <= max_plausible_base)):
                res["valid"] = True
                res["status"] = "active"
                res["coupon_status"] = "verified"
                res["working_coupon_code"] = confirmed_code
                res["stock_verified"] = True
                price_note = f"R$ {store_min_coup:,.2f}" if store_min_coup else f"R$ {effective_live_price:,.2f} base"
                res["reason"] = f"Cupom {confirmed_code} confirmado ativo na {store_label} ({price_note})"
                record_coupon_status(confirmed_code, "verified", res["reason"], source="live_test", reg_id=reg)
                record_deal_status(post_id, "active", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=True, coupon_status="verified", store_name=store_label, final_url=final_url)
                return res

            # If store base price jumped way too high even with a coupon -> offer ended for THIS deal
            if effective_live_price > max_plausible_base:
                res["valid"] = False
                res["status"] = "expired"
                res["coupon_status"] = "expired"
                res["reason"] = f"Oferta encerrada na {store_label} — preço atual subiu para R$ {effective_live_price:,.2f} (anunciado R$ {expected_price:,.2f})"
                record_deal_status(post_id, "expired", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=False, coupon_status="expired", store_name=store_label, final_url=final_url)
                return res

            # If post is > 6 hours old and coupon is NOT confirmed -> expired for this deal
            if age_hours > 6.0 and not confirmed_code:
                res["valid"] = False
                res["status"] = "expired"
                res["coupon_status"] = "expired"
                coup_lbl = f"Cupom {clean_coup}" if clean_coup else "Cupom/desconto do grupo"
                res["reason"] = f"{coup_lbl} expirado/inativo na {store_label} — preço atual em estoque sem cupom: R$ {effective_live_price:,.2f}"
                record_deal_status(post_id, "expired", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=True, coupon_status="expired", store_name=store_label, final_url=final_url)
                return res

            # Fresh post (<= 6h) with product in stock; check if multiple groups corroborated the coupon
            gc_info = group_coupons_db.get(clean_coup) if clean_coup else None
            seen_cnt = int((gc_info or {}).get("seen_count") or 0)
            res["valid"] = True
            res["status"] = "unverified_coupon"
            res["coupon_status"] = "unverified"
            res["stock_verified"] = True
            coup_lbl = f"cupom {clean_coup}" if clean_coup else "cupom/app"
            corroboration = f" (visto {seen_cnt}x nos grupos)" if seen_cnt >= 2 else ""
            res["reason"] = f"Em estoque na {store_label} por R$ {effective_live_price:,.2f} (sem cupom). Valor de R$ {expected_price:,.2f} depende do {coup_lbl} aplicar no carrinho{corroboration}"
            record_deal_status(post_id, "unverified_coupon", res["reason"], url=buy_url, reg_id=reg, live_price=effective_live_price, stock_verified=True, coupon_status="unverified", store_name=store_label, final_url=final_url)
            return res

    # If we could not extract a live price from either Layer 1 or Layer 2:
    # Check if at least the coupon itself is confirmed active globally for this store
    if clean_coup and store_key and clean_coup in store_active_coupons and age_hours <= 6.0:
        res["coupon_status"] = "verified"
    if age_hours > 8.0:
        res["valid"] = False
        res["status"] = "expired"
        res["reason"] = f"Oferta antiga ({age_hours:.1f}h) sem confirmação de estoque ativo na {store_label}"
        record_deal_status(post_id, "expired", res["reason"], url=buy_url, reg_id=reg, stock_verified=False, coupon_status=res["coupon_status"], store_name=store_label, final_url=final_url)
        return res

    res["valid"] = False
    res["status"] = "untested"
    res["stock_verified"] = False
    note = " (proteção anti-bot da loja — confira no link)" if bot_blocked else ""
    res["reason"] = f"Estoque/preço na {store_label} não pôde ser confirmado automaticamente{note}"
    record_deal_status(post_id, "untested", res["reason"], url=buy_url, reg_id=reg, stock_verified=False, coupon_status=res["coupon_status"], store_name=store_label, final_url=final_url)
    return res


def verify_deal_before_notify(deal, reg_id="br", freshness_secs=90):
    """
    Mandatory Pre-Notification Gate called right before dispatching a Windows or Phone alert.
    Re-verifies channel expiries and runs a live store & coupon test if no fresh live_test exists.
    Returns (ok_to_notify: bool, verification_result: dict, block_reason: str).
    """
    reg = (reg_id or (deal.get("region_id") if isinstance(deal, dict) else None) or "br").lower().strip()
    if not isinstance(deal, dict):
        return False, {}, "Oferta inválida"
    if reg == "eu":
        return True, {
            "status": deal.get("deal_status") or "active",
            "stock_verified": True,
            "coupon_status": deal.get("coupon_status") or ("verified" if deal.get("coupon_code") else "none"),
            "working_coupon_code": deal.get("coupon_code"),
        }, ""

    post_id = deal.get("post_id") or ""
    buy_url = deal.get("buy_url") or deal.get("post_url") or ""
    candidate_coupons = _collect_candidate_coupons(deal.get("coupon_code"), deal.get("coupon_codes"))
    coupon_mode = deal.get("coupon_mode")
    post_ts = _iso_to_epoch(deal.get("timestamp"))
    kind = (deal.get("matched_kind") or "gpu").lower()
    is_core_hw = kind in ("gpu", "cpu", "ram", "mobo", "psu")
    req_coup = bool(deal.get("requires_coupon") or candidate_coupons or deal.get("coupon_info"))
    age_hours = float(deal.get("age_hours") or 0.1)

    status_db = load_coupon_status(reg)
    coupons_db = status_db.get("coupons", {})
    deals_map = status_db.get("deals", {})

    # 1. Check deal-level blocks & coupon expiry announcements from Telegram groups
    deal_st = deals_map.get(post_id) or (deals_map.get(post_id.lower()) if post_id else None) or (deals_map.get(buy_url) if buy_url else None)
    if deal_st and deal_st.get("status") in ("expired", "out_of_stock", "mismatch"):
        return False, deal_st, deal_st.get("reason") or f"Status {deal_st.get('status')}"

    surviving = [c for c in candidate_coupons if not _is_channel_coupon_expired(coupons_db.get(c), post_ts)]
    dead = [c for c in candidate_coupons if c not in surviving]
    if candidate_coupons and ((coupon_mode == "stack" and dead) or (not surviving)):
        return False, {"status": "expired", "coupon_status": "expired"}, f"Cupom {', '.join(dead)} expirado nos grupos"

    # 2. Reuse ultra-fresh live test (< freshness_secs) or run live check right now
    ver = None
    now_ts = time.time()
    if deal_st and deal_st.get("source") == "live_test":
        tested_ts = float(deal_st.get("tested_ts") or _iso_to_epoch(deal_st.get("updated_at")) or 0)
        if tested_ts > 0 and (now_ts - tested_ts) <= freshness_secs and deal_st.get("status") in ("active", "unverified_coupon"):
            # Even on cached live_test, run mismatch check cleanly against cached final_url/store
            ver = dict(deal_st)
            ver.setdefault("working_coupon_code", surviving[0] if surviving else None)

    if ver is None:
        if buy_url.startswith("http") and "t.me/" not in buy_url.lower():
            ver = test_deal_url_and_coupon(
                buy_url,
                coupon_code=surviving[0] if surviving else deal.get("coupon_code"),
                coupon_codes=surviving or candidate_coupons,
                coupon_mode=coupon_mode,
                expected_price=deal.get("promo_price_brl") or deal.get("price_brl"),
                timeout=5,
                post_id=post_id or None,
                reg_id=reg,
                matched_slug=deal.get("matched_slug"),
                matched_kind=kind,
                requires_coupon=req_coup,
                age_hours=age_hours,
                store_name=deal.get("store_name"),
                title=deal.get("title"),
                item_specs=deal.get("item_specs"),
                post_ts=post_ts,
            )
        else:
            ver = {
                "status": "active" if deal.get("_isStoreDirect") else "untested",
                "stock_verified": bool(deal.get("_isStoreDirect")),
                "coupon_status": "none",
                "reason": "Sem link direto de loja",
            }

    st = ver.get("status", "untested")
    if st in ("expired", "out_of_stock", "mismatch") or ver.get("coupon_status") == "expired":
        return False, ver, ver.get("reason") or f"Bloqueado na verificação ({st})"

    if reg == "br" and is_core_hw and not ver.get("stock_verified"):
        return False, ver, ver.get("reason") or "Estoque de hardware não confirmado na loja"

    if req_coup and age_hours > 4.0 and ver.get("coupon_status") != "verified":
        return False, ver, ver.get("reason") or "Cupom não confirmado após 4h — bloqueado"

    if not is_core_hw and not ver.get("stock_verified"):
        # For non-HB items on SPA/anti-bot stores (Shopee SPA, Amazon captcha), only allow very fresh posts (< 20 min)
        # that passed 404/OOS/mismatch/expiry checks; block anything older without stock confirmation.
        if st == "untested" and age_hours <= 0.35:
            ver["soft_verified_fresh"] = True
            return True, ver, ""
        return False, ver, ver.get("reason") or "Sem confirmação de estoque/preço na loja"

    return True, ver, ""


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

    # Pre-warm Hardware Barato live slug cache with gentle concurrency (avoids rate limiting)
    if reg == "br":
        unique_slugs = {
            (d.get("matched_kind", "gpu"), d.get("matched_slug"))
            for d in to_test
            if d.get("matched_slug")
            and (d.get("matched_kind") in ("gpu", "cpu", "ram", "mobo", "psu"))
            and not str(d.get("matched_slug")).startswith(("mobo-", "psu-"))
        }
        if unique_slugs:
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
                list(ex.map(lambda ks: fetch_hb_slug_live_data_safe(ks[0], ks[1]), unique_slugs))

    results = {}

    def _worker(deal):
        url = deal.get("buy_url") or deal.get("post_url")
        coup = deal.get("coupon_code")
        coups = deal.get("coupon_codes")
        exp_price = deal.get("promo_price_brl") or deal.get("price_brl")
        p_id = deal.get("post_id")
        r = test_deal_url_and_coupon(
            url,
            coupon_code=coup,
            coupon_codes=coups,
            coupon_mode=deal.get("coupon_mode"),
            expected_price=exp_price,
            timeout=4.5,
            post_id=p_id,
            reg_id=reg,
            matched_slug=deal.get("matched_slug"),
            matched_kind=deal.get("matched_kind"),
            requires_coupon=bool(deal.get("requires_coupon") or coup or coups or deal.get("coupon_info")),
            age_hours=float(deal.get("age_hours") or 1.0),
            store_name=deal.get("store_name"),
            title=deal.get("title"),
            item_specs=deal.get("item_specs"),
            post_ts=_iso_to_epoch(deal.get("timestamp")),
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


def _overlay_deal_status_entry(item, coupons, deals_map, reg_id=None, is_core_hw=True):
    p_id = item.get("post_id", "")
    b_url = item.get("buy_url", "")
    post_ts = _iso_to_epoch(item.get("timestamp"))
    candidate_coupons = _collect_candidate_coupons(item.get("coupon_code"), item.get("coupon_codes"))
    coupon_mode = item.get("coupon_mode")
    req_coup = bool(item.get("requires_coupon") or candidate_coupons or item.get("coupon_info"))
    item["requires_coupon"] = req_coup
    item["promo_price_brl"] = item.get("promo_price_brl") or item.get("price_brl")

    deal_st = (deals_map.get(p_id) if p_id else None) or (deals_map.get(p_id.lower()) if p_id else None) or (deals_map.get(b_url) if b_url else None)

    if deal_st:
        st_val = deal_st.get("status", "untested")
        item["deal_status"] = st_val
        item["deal_status_reason"] = deal_st.get("reason", "")
        item["stock_verified"] = bool(deal_st.get("stock_verified", False))
        if deal_st.get("store_name") and deal_st["store_name"] not in ("E-commerce", "Loja"):
            item["store_name"] = deal_st["store_name"]
        if deal_st.get("live_price"):
            item["live_store_price_brl"] = deal_st["live_price"]
            if st_val == "active" and not req_coup and deal_st["live_price"] < item["price_brl"]:
                item["price_brl"] = deal_st["live_price"]
                if item.get("hb_price_brl"):
                    item["savings_vs_hb_brl"] = round(item["hb_price_brl"] - item["price_brl"], 2)
        if st_val in ("expired", "out_of_stock", "mismatch"):
            item["is_expired"] = True
        else:
            item["is_expired"] = False
    elif is_core_hw:
        if reg_id == "eu" and item.get("deal_status") == "active" and item.get("stock_verified"):
            item["is_expired"] = bool(item.get("is_expired"))
        else:
            item["deal_status"] = "untested"
            item["stock_verified"] = False
            item["is_expired"] = bool(item.get("age_hours", 0) > 8.0)

    # Multi-coupon aware status resolution (promote backup 'ou' code if primary expired)
    surviving = []
    any_verified = None
    first_expired_entry = None
    for code in candidate_coupons:
        cs = coupons.get(code)
        if cs and _is_channel_coupon_expired(cs, post_ts):
            first_expired_entry = first_expired_entry or cs
            continue
        if cs and cs.get("status") == "expired" and not (deal_st and deal_st.get("status") == "unverified_coupon" and item.get("age_hours", 99) <= 6.0):
            first_expired_entry = first_expired_entry or cs
            continue
        surviving.append(code)
        if cs and cs.get("status") == "verified" and not any_verified:
            any_verified = (code, cs)

    all_coupons_dead = bool(candidate_coupons) and ((coupon_mode == "stack" and bool(first_expired_entry) and len(surviving) < len(candidate_coupons)) or (not surviving))

    if all_coupons_dead:
        item["coupon_status"] = "expired"
        item["coupon_status_reason"] = (first_expired_entry or {}).get("reason", "Cupom expirado")
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
    elif surviving:
        if any_verified:
            item["coupon_code"] = any_verified[0]
            item["coupon_status"] = "verified"
            item["coupon_status_reason"] = any_verified[1].get("reason", "")
        else:
            item["coupon_code"] = surviving[0]
            if deal_st and deal_st.get("coupon_status"):
                item["coupon_status"] = deal_st["coupon_status"]
            else:
                c0_st = coupons.get(surviving[0])
                if c0_st:
                    item["coupon_status"] = c0_st.get("status", "unverified")
    elif deal_st and deal_st.get("coupon_status"):
        item["coupon_status"] = deal_st["coupon_status"]
        if item["coupon_status"] == "expired":
            item["is_coupon_expired"] = True
            item["is_expired"] = True


def rewire_deals_and_best_by_slug(matched_deals, all_promos=None, reg_id=None, extra_deal_lists=()):
    """
    Overlays verified live test statuses onto deals list and recomputes best_by_slug.
    Crucial Policy:
    1. Out-of-stock, mismatched, or expired deals are flagged is_expired = True.
    2. Deals with expired coupons (with no surviving backup code) have their coupon revoked and are flagged is_coupon_expired = True.
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
        _overlay_deal_status_entry(item, coupons, deals_map, reg_id=reg_id, is_core_hw=True)
        rewired.append(item)

    if all_promos:
        for p in all_promos:
            _overlay_deal_status_entry(p, coupons, deals_map, reg_id=reg_id, is_core_hw=False)

    for extra_list in (extra_deal_lists or ()):
        if isinstance(extra_list, list):
            for x in extra_list:
                if isinstance(x, dict):
                    _overlay_deal_status_entry(x, coupons, deals_map, reg_id=reg_id, is_core_hw=False)

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
