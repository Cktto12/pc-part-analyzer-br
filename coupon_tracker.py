# -*- coding: utf-8 -*-
"""
Coupon Tracker & Live Deal Validator for GPU & Build Analyzer Pro.

Tracks coupon lifecycles, detects expiry announcements from group messages
("expirou", "acabou", "esgotou", "expiró", "agotado"), directly tests store links and coupons,
and rewires product pricing so expired coupons never block newer real promotions.
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
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATUS_FILE = os.path.join(BASE_DIR, "data", "coupon_status.json")
_STATUS_LOCK = threading.Lock()

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
    # "MELIMAIS12H expirou" or "MERCADO25 acabou" or "BLACK25OFF esgotou" / "CYBER500 expiró"
    re.compile(r"\b([A-Z0-9]{4,22})\s+(?:expirou|acabou|esgotou|encerrou|morreu|invalido|inválido|finalizou|expiró|expiro|agotó|agoto|terminó|termino|venció|vencio)\b", re.IGNORECASE),
    # "Cupom ZAFADINHO10 expirou" or "cupón CYBER500 expiró"
    re.compile(r"(?:cupom|cupón|cupon|c[oó]digo)\s+([A-Z0-9]{4,22})\s+(?:expirou|acabou|esgotou|encerrou|invalido|inválido|expiró|expiro|agotó|agoto|terminó|termino|venció|vencio)\b", re.IGNORECASE),
    # "expirou o cupom ZAFADINHO10" or "expiró el cupón XXX"
    re.compile(r"(?:expirou|acabou|esgotou|encerrou|finalizou|expiró|expiro|agotó|agoto|terminó|termino|venció|vencio)\s+(?:o\s+|el\s+)?(?:cupom\s+|cupón\s+|cupon\s+)?[:\-]?\s*\b([A-Z0-9]{4,22})\b", re.IGNORECASE),
    # "o cupom PS5PRIME expirou"
    re.compile(r"(?:o|el)\s+(?:cupom|cupón|cupon)\s+([A-Z0-9]{4,22})\s+(?:expirou|expiró)", re.IGNORECASE),
    # "🚨 Cupom Expirou! ... Cupom: L1QU1D4B0M02"
    re.compile(r"(?:cupom|cupón|cupon)\s+(?:expirou|expiró|esgotado|agotado|inv[aá]lido)[\s\S]{1,80}?(?:cupom|cupón|cupon|c[oó]digo)\s*[:\-]?\s*\b([A-Z0-9]{4,22})\b", re.IGNORECASE),
]

OOS_PATTERNS = [
    # Brazilian Out-Of-Stock indicators
    (r"an[uú]ncio\s+pausado", "Anúncio pausado no Mercado Livre"),
    (r"publica[cç][aã]o\s+pausada", "Publicação pausada no Mercado Livre"),
    (r"este\s+produto\s+est[aá]\s+esgotado", "Produto esgotado no Mercado Livre"),
    (r"an[uú]ncio\s+finalizado", "Anúncio finalizado"),
    (r"ops!\s*produto\s*indispon[ií]vel", "Produto indisponível na KaBuM"),
    (r"produto-esgotado", "Produto esgotado na KaBuM"),
    (r"avise-me\s+quando\s+chegar", "Sem estoque na loja (avise-me)"),
    (r"produto\s+indispon[ií]vel", "Produto indisponível"),
    (r"\bsem\s+estoque\b", "Sem estoque na loja"),
    (r"\besgotado\b", "Esgotado na loja"),
    (r"atualmente\s+indispon[ií]vel", "Atualmente indisponível na Amazon"),
    (r"n[aã]o\s+dispon[ií]vel\s+em\s+estoque", "Não disponível em estoque"),
    (r"produto\s+sem\s+estoque", "Produto sem estoque"),
    # Mexican Out-Of-Stock indicators
    (r"producto\s+agotado", "Producto agotado en tienda MX"),
    (r"sin\s+existencias", "Sin existencias en tienda MX"),
    (r"fuera\s+de\s+stock", "Fuera de stock en tienda MX"),
    (r"no\s+disponible", "No disponible en tienda MX"),
    (r"publicaci[óo]n\s+pausada", "Publicación pausada en Mercado Libre MX"),
    (r"este\s+producto\s+est[áa]\s+agotado", "Producto agotado en Mercado Libre MX"),
    (r"art[íi]culo\s+agotado", "Artículo agotado"),
    (r"descontinuado", "Producto descontinuado"),
    (r"av[íi]same\s+cuando\s+haya\s+stock", "Sin existencias (avísame)"),
    (r"temporalmente\s+agotado", "Temporalmente agotado"),
    (r"stock\s+agotado", "Stock agotado"),
]


def parse_price_str(s):
    """Parses monetary string into float for BRL and MXN (e.g. '3.180', '2.140,02', 'R$ 2.440', '$ 7,499.00')."""
    if not s:
        return None
    s = s.strip().replace("R$", "").replace("MX$", "").replace("MXN", "").replace("$", "").replace("\xa0", "").strip()
    if "," in s and "." in s:
        # Check which separator comes last
        if s.rfind(",") > s.rfind("."):
            # Brazilian format: 1.234,56
            s = s.replace(".", "").replace(",", ".")
        else:
            # Mexican / US format: 1,234.56
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


def extract_store_price(body, final_url=""):
    """
    Extracts the current live checkout/store price from product page HTML.
    Supports Mercado Livre (BR & MX), Cyberpuerta, DDTech, KaBuM, Pichau, Terabyte, Shopee, Amazon, and Schema.org.
    """
    if not body:
        return None

    # 1. Mercado Livre / Mercado Libre (BR and MX)
    if "mercadolivre.com" in final_url or "mercadolibre.com" in final_url:
        pdp_match = re.search(r'class=[\'"][^\'"]*ui-pdp-price[^\'"]*[\'"][\s\S]{1,500}?class=[\'"][^\'"]*andes-money-amount__fraction[^\'"]*[\'"][^>]*>([\d\.]+)<', body)
        if pdp_match:
            cents_match = re.search(r'class=[\'"][^\'"]*ui-pdp-price[^\'"]*[\'"][\s\S]{1,700}?class=[\'"][^\'"]*andes-money-amount__cents[^\'"]*[\'"][^>]*>(\d{2})<', body)
            cents = ("." + cents_match.group(1)) if cents_match else ""
            p = parse_price_str(pdp_match.group(1) + cents)
            if p and p > 50:
                return p
        fractions = re.findall(r'class=[\'"][^\'"]*andes-money-amount__fraction[^\'"]*[\'"][^>]*>([\d\.]+)<', body)
        if fractions:
            p = parse_price_str(fractions[0])
            if p and p > 50:
                return p

    # 2. Cyberpuerta & DDTech (Mexico)
    if "cyberpuerta.mx" in final_url or "ddtech.mx" in final_url:
        cp_match = re.search(r'class=[\'"][^\'"]*price[^\'"]*[\'"][^>]*>\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)', body)
        if cp_match:
            p = parse_price_str(cp_match.group(1))
            if p and p > 50:
                return p

    # 3. Meta tags (KaBuM, Pichau, Terabyte, Amazon, Magalu, Cyberpuerta)
    meta_p = re.findall(r'<meta[^>]+property=[\'"]product:price:amount[\'"][^>]+content=[\'"]([\d\.,]+)[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+content=[\'"]([\d\.,]+)[\'"][^>]+property=[\'"]product:price:amount[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+itemprop=[\'"]price[\'"][^>]+content=[\'"]([\d\.,]+)[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+content=[\'"]([\d\.,]+)[\'"][^>]+itemprop=[\'"]price[\'"]', body, re.I)
    for m in meta_p:
        p = parse_price_str(m)
        if p and p > 50:
            return p

    # 4. JSON-LD schema (offers.price)
    json_ld = re.findall(r'<script[^>]+type=[\'"]application/ld\+json[\'"][^>]*>([\s\S]*?)</script>', body, re.I)
    for block in json_ld:
        try:
            data = json.loads(block)
            offers = data.get('offers')
            if isinstance(offers, dict) and 'price' in offers:
                p = parse_price_str(str(offers['price']))
                if p and p > 50: return p
            elif isinstance(offers, list) and offers and 'price' in offers[0]:
                p = parse_price_str(str(offers[0]['price']))
                if p and p > 50: return p
        except Exception:
            pass

    # 5. Promodescuentos thread price
    if "promodescuentos.com" in final_url:
        pd_match = re.search(r'class=[\'"][^\'"]*thread-price[^\'"]*[\'"][^>]*>\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*)', body)
        if pd_match:
            p = parse_price_str(pd_match.group(1))
            if p and p > 50:
                return p

    # 6. Fallback: prominent BRL / MXN regex
    prices = re.findall(r'(?:R\$|MX\$|\$)\s*([\d\.,]+)', body)
    for pr in prices[:8]:
        p = parse_price_str(pr)
        if p and p > 50:
            return p

    return None


def _load_coupon_status_unlocked():
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE, "r", encoding="utf-8") as f:
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


def _save_coupon_status_unlocked(data):
    try:
        os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
        data["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[CouponTracker] Erro ao salvar status: {e}")


def load_coupon_status():
    """Loads persistent coupon and deal status from JSON file (thread-safe)."""
    with _STATUS_LOCK:
        return _load_coupon_status_unlocked()


def save_coupon_status(data):
    """Saves persistent coupon and deal status to JSON file (thread-safe)."""
    with _STATUS_LOCK:
        _save_coupon_status_unlocked(data)


def record_coupon_status(coupon_code, status, reason, source="channel_report"):
    """Records or updates a coupon's status in the persistent store (thread-safe)."""
    if not coupon_code:
        return
    code = coupon_code.strip().upper()
    if code in STOP_WORDS or len(code) < 4:
        return

    with _STATUS_LOCK:
        data = _load_coupon_status_unlocked()
        data["coupons"][code] = {
            "status": status,  # "expired", "active", "out_of_stock"
            "reason": reason,
            "source": source,
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        _save_coupon_status_unlocked(data)
        return data["coupons"][code]


def record_deal_status(post_id, status, reason, source="live_test", url=None):
    """Records or updates a specific deal/post status in the persistent store under post_id, lower-case post_id, and url (thread-safe)."""
    if not post_id and not url:
        return
    with _STATUS_LOCK:
        data = _load_coupon_status_unlocked()
        entry = {
            "status": status,
            "reason": reason,
            "source": source,
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        if post_id:
            data["deals"][post_id] = entry
            data["deals"][post_id.lower()] = entry
        if url:
            data["deals"][url] = entry
        _save_coupon_status_unlocked(data)
        return entry


def scan_texts_for_expiries(texts_or_messages):
    """
    Parses channel messages and extracts coupon codes and posts announced as expired or finished.
    Returns dict of newly detected expired coupons and deals.
    """
    data = load_coupon_status()
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

        # Check if the text has any expiry indicator in Portuguese or Spanish
        if not any(k in low for k in ["acabou", "expir", "esgot", "encerr", "finaliz", "invalido", "inválido", "morreu", "agot", "venc"]):
            continue

        # Extract post links referenced in message
        ref_post = re.search(r"t\.me/([^/\s]+)/(\d+)", clean)
        ref_post_id = f"{ref_post.group(1)}/{ref_post.group(2)}" if ref_post else None

        # 1. Check coupon expiry patterns
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

        # 2. Check if a referenced post was explicitly marked expired
        if ref_post_id and any(k in low for k in ["acabou", "esgotou", "expirou", "encerrado", "finalizado", "agotado", "expiró"]):
            data["deals"][ref_post_id] = {
                "status": "out_of_stock",
                "reason": f"Canal avisou término: '{clean[:80]}...'",
                "source": "channel_report",
                "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            detected["deals"][ref_post_id] = data["deals"][ref_post_id]

        # 3. If post itself begins with [ESGOTOU], [ACABOU], [ENCERRADO], [AGOTADO], [EXPIRÓ]
        if post_id and re.search(r"^\s*\[?(?:esgotou|acabou|encerrado|expirado|finalizado|agotado|expiró)\]?", clean, re.I):
            data["deals"][post_id] = {
                "status": "out_of_stock",
                "reason": "Post editado para Esgotado / Agotado",
                "source": "channel_report",
                "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            detected["deals"][post_id] = data["deals"][post_id]

    if detected["coupons"] or detected["deals"]:
        save_coupon_status(data)

    return detected


def test_deal_url_and_coupon(buy_url, coupon_code=None, expected_price=None, timeout=8, post_id=None):
    """
    Directly tests a deal URL, store live price, and coupon validity:
    1. Follows redirects to final merchant store.
    2. Verifies page accessibility and HTTP status.
    3. Checks page HTML for out-of-stock / pausado indicators (BR & MX).
    4. Extracts the actual live store checkout price and compares against expected promo price.
    5. If store price went up, flags deal as expired.
    6. If coupon is specified, checks if coupon is reported invalid or absent.
    7. Saves result in coupon_status.json and returns test summary.
    """
    res = {
        "valid": True,
        "status": "active",  # "active" | "expired" | "out_of_stock" | "untested"
        "reason": "Produto ativo e acessível na loja",
        "final_url": buy_url,
        "live_price": None,
        "tested_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    if not buy_url or not buy_url.startswith("http"):
        res["status"] = "untested"
        res["reason"] = "Sem URL de compra válida"
        return res

    try:
        req = urllib.request.Request(
            buy_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "pt-BR,pt;q=0.9,es-MX,es;q=0.8,en-US;q=0.7",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
        )
        opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler)
        with opener.open(req, timeout=timeout) as resp:
            final_url = resp.geturl()
            res["final_url"] = final_url
            code = resp.getcode()
            if code in (404, 410):
                res["valid"] = False
                res["status"] = "expired"
                res["reason"] = f"Página da loja retornou erro HTTP {code} (link expirado)"
                if coupon_code:
                    record_coupon_status(coupon_code, "expired", res["reason"], source="live_test")
                return res

            body = resp.read().decode("utf-8", errors="ignore")
            low = body.lower()

            # If landing page is an aggregator bridge (e.g. benchpromos.com.br), resolve the real merchant destination
            if "benchpromos.com.br" in final_url or "promocoes" in final_url:
                outgoing = re.findall(r'href=[\'"](https?://(?:meli\.la|mercadolivre|kabum|pichau|terabyteshop|s\.shopee|amazon)[^\'"]*)[\'"]', body, re.I)
                if outgoing:
                    try:
                        req_out = urllib.request.Request(
                            outgoing[0],
                            headers={
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                                "Accept-Language": "pt-BR,pt;q=0.9,es-MX,es;q=0.8"
                            }
                        )
                        with opener.open(req_out, timeout=timeout) as resp_out:
                            final_url = resp_out.geturl()
                            body = resp_out.read().decode("utf-8", errors="ignore")
                            low = body.lower()
                    except Exception:
                        pass

            # Check out of stock patterns (BR and MX)
            for pat, reason_text in OOS_PATTERNS:
                if re.search(pat, low):
                    res["valid"] = False
                    res["status"] = "out_of_stock"
                    res["reason"] = reason_text
                    if coupon_code:
                        record_coupon_status(coupon_code, "expired", f"{reason_text} ({coupon_code})", source="live_test")
                    return res

            # Check explicit coupon invalidation inside merchant page
            if coupon_code:
                c_low = coupon_code.lower()
                if (f"cupom {c_low} expirado" in low or f"cupom {c_low} inválido" in low or f"cupom {c_low} esgotado" in low or
                    f"cupón {c_low} expirado" in low or f"cupón {c_low} inválido" in low or f"cupón {c_low} agotado" in low):
                    res["valid"] = False
                    res["status"] = "expired"
                    res["reason"] = f"Cupom/Cupón {coupon_code} reportado inválido ou esgotado na loja"
                    record_coupon_status(coupon_code, "expired", res["reason"], source="live_test")
                    return res

            # Extract current store checkout price
            live_price = extract_store_price(body, final_url)
            res["live_price"] = live_price

            if live_price and expected_price and expected_price > 50:
                if not coupon_code:
                    # Direct offer without coupon: store price must match expected promo within 8%
                    if live_price > expected_price * 1.08:
                        res["valid"] = False
                        res["status"] = "expired"
                        res["reason"] = f"Preço na loja subiu para {live_price:,.2f} (oferta de {expected_price:,.2f} encerrada)"
                        if post_id or buy_url:
                            record_deal_status(post_id, "expired", res["reason"], source="live_test", url=buy_url)
                        return res
                    else:
                        res["valid"] = True
                        res["status"] = "active"
                        res["reason"] = f"Confirmado ativo na loja por {live_price:,.2f}"
                        if post_id or buy_url:
                            record_deal_status(post_id, "active", res["reason"], source="live_test", url=buy_url)
                        return res
                else:
                    # Offer with coupon: check if store price is compatible with coupon deduction
                    max_allowed_store_price = max(expected_price * 1.35, expected_price + 600)
                    if live_price > max_allowed_store_price:
                        res["valid"] = False
                        res["status"] = "expired"
                        res["reason"] = f"Preço na loja subiu para {live_price:,.2f} (incompatível com cupom {coupon_code})"
                        if post_id or buy_url:
                            record_deal_status(post_id, "expired", res["reason"], source="live_test", url=buy_url)
                        record_coupon_status(coupon_code, "expired", res["reason"], source="live_test")
                        return res
                    else:
                        res["valid"] = True
                        res["status"] = "active"
                        res["reason"] = f"Produto ativo na loja por {live_price:,.2f} (cupom {coupon_code})"
                        if post_id or buy_url:
                            record_deal_status(post_id, "active", res["reason"], source="live_test", url=buy_url)
                        record_coupon_status(coupon_code, "active", res["reason"], source="live_test")
                        return res

            res["valid"] = True
            res["status"] = "active"
            res["reason"] = "Produto em estoque e página ativa"
            if coupon_code:
                record_coupon_status(coupon_code, "active", "Confirmado ativo na loja", source="live_test")
            if post_id or buy_url:
                record_deal_status(post_id, "active", res["reason"], source="live_test", url=buy_url)
            return res

    except urllib.error.HTTPError as he:
        if he.code in (404, 410):
            res["valid"] = False
            res["status"] = "expired"
            res["reason"] = f"Página não encontrada na loja (HTTP {he.code})"
            if coupon_code:
                record_coupon_status(coupon_code, "expired", res["reason"], source="live_test")
            if post_id or buy_url:
                record_deal_status(post_id, "expired", res["reason"], source="live_test", url=buy_url)
        else:
            res["valid"] = True
            res["status"] = "untested"
            res["reason"] = f"Página protegida ou HTTP {he.code} (considerado ativo)"
        return res
    except Exception as e:
        res["valid"] = True
        res["status"] = "untested"
        res["reason"] = f"Acesso à loja indisponível: {str(e)[:40]}"
        return res


def test_deals_batch(deals, max_items=35):
    """
    Tests URLs, live store prices, and coupons for candidate deals concurrently.
    Prioritizes:
    1. The cheapest candidate for each hardware slug (potential winners of best_by_slug)
    2. Deals with highest savings vs catalog
    """
    by_slug_cheapest = {}
    for d in deals:
        s = d.get("matched_slug")
        if s and (s not in by_slug_cheapest or d.get("price_brl", 999999) < by_slug_cheapest[s].get("price_brl", 999999)):
            by_slug_cheapest[s] = d

    prioritized = list(by_slug_cheapest.values())
    seen_ids = {d.get("post_id") for d in prioritized}

    remaining = [d for d in deals if d.get("post_id") not in seen_ids]
    remaining.sort(key=lambda x: -x.get("savings_vs_hb_brl", 0))

    to_test = (prioritized + remaining)[:max_items]
    results = {}

    def _worker(deal):
        url = deal.get("buy_url") or deal.get("post_url")
        coup = deal.get("coupon_code")
        exp_price = deal.get("price_brl")
        p_id = deal.get("post_id")
        r = test_deal_url_and_coupon(url, coupon_code=coup, expected_price=exp_price, post_id=p_id)
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


def rewire_deals_and_best_by_slug(matched_deals, all_promos=None):
    """
    Overlays verified live test statuses onto deals list and recomputes best_by_slug so
    that expired offers/coupons never block newer, valid deals.
    """
    status_db = load_coupon_status()
    coupons = status_db.get("coupons", {})
    deals_map = status_db.get("deals", {})

    rewired = []
    for d in matched_deals:
        item = dict(d)
        p_id = item.get("post_id", "")
        c_code = (item.get("coupon_code") or "").strip().upper()
        b_url = item.get("buy_url", "")

        deal_st = deals_map.get(p_id) or deals_map.get(p_id.lower()) or deals_map.get(b_url)
        coup_st = coupons.get(c_code) if c_code else None

        # Check post-level status
        if deal_st:
            item["deal_status"] = deal_st.get("status", "active")
            item["deal_status_reason"] = deal_st.get("reason", "")
            if deal_st.get("status") in ("expired", "out_of_stock"):
                item["is_expired"] = True

        # Check coupon-level status
        if coup_st:
            item["coupon_status"] = coup_st.get("status", "active")
            item["coupon_status_reason"] = coup_st.get("reason", "")
            if coup_st.get("status") == "expired":
                item["is_coupon_expired"] = True

        rewired.append(item)

    # Recompute best_by_slug strictly using non-expired, active deals
    best_by_slug = {}
    for d in rewired:
        slug = d.get("matched_slug")
        if not slug:
            continue
        if d.get("is_expired") or d.get("is_coupon_expired"):
            continue
        if d.get("deal_status") in ("expired", "out_of_stock"):
            continue
        if d.get("coupon_status") == "expired":
            continue

        if slug not in best_by_slug or d.get("price_brl", 999999) < best_by_slug[slug].get("price_brl", 999999):
            best_by_slug[slug] = d

    return rewired, best_by_slug
