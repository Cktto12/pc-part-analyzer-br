# -*- coding: utf-8 -*-
"""
Coupon Tracker & Live Deal Validator for GPU & Build Analyzer Pro.

Tracks coupon lifecycles, detects expiry announcements from group messages
("expirou", "acabou", "esgotou"), directly tests store links and coupons,
and rewires product pricing so expired coupons never block newer real promotions.
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
    "HTTPS", "HTTP", "WWW", "COM", "BR"
}

EXPIRY_REGEXES = [
    # "MELIMAIS12H expirou" or "MERCADO25 acabou" or "BLACK25OFF esgotou"
    re.compile(r"\b([A-Z0-9]{4,22})\s+(?:expirou|acabou|esgotou|encerrou|morreu|invalido|inválido|finalizou)\b", re.IGNORECASE),
    # "Cupom ZAFADINHO10 expirou" or "cupom 40SITETODO acabou"
    re.compile(r"(?:cupom|c[oó]digo)\s+([A-Z0-9]{4,22})\s+(?:expirou|acabou|esgotou|encerrou|invalido|inválido)\b", re.IGNORECASE),
    # "expirou o cupom ZAFADINHO10" or "acabou o cupom XXX"
    re.compile(r"(?:expirou|acabou|esgotou|encerrou|finalizou)\s+(?:o\s+)?(?:cupom\s+)?[:\-]?\s*\b([A-Z0-9]{4,22})\b", re.IGNORECASE),
    # "o cupom PS5PRIME expirou"
    re.compile(r"o\s+cupom\s+([A-Z0-9]{4,22})\s+expirou", re.IGNORECASE),
    # "🚨 Cupom Expirou! ... Cupom: L1QU1D4B0M02"
    re.compile(r"(?:cupom\s+expirou|cupom\s+esgotado|cupom\s+inv[aá]lido)[\s\S]{1,80}?(?:cupom|c[oó]digo)\s*[:\-]?\s*\b([A-Z0-9]{4,22})\b", re.IGNORECASE),
]

OOS_PATTERNS = [
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
    (r"produto\s+sem\s+estoque", "Produto sem estoque")
]


def parse_brl_str(s):
    """Parses Brazilian monetary string into float (e.g. '3.180', '2.140,02', 'R$ 2.440')."""
    if not s:
        return None
    s = s.strip().replace("R$", "").replace("\xa0", "").strip()
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif "." in s and len(s.split(".")[-1]) == 3:
        s = s.replace(".", "")
    try:
        val = float(s)
        return val if val > 0 else None
    except Exception:
        return None


def extract_store_price(body, final_url=""):
    """
    Extracts the current live checkout/store price from product page HTML.
    Supports Mercado Livre (UI PDP + Andes), KaBuM, Pichau, Terabyte, Shopee, Amazon, and Schema.org.
    """
    if not body:
        return None

    # 1. Mercado Livre
    if "mercadolivre.com" in final_url:
        pdp_match = re.search(r'class=[\'"][^\'"]*ui-pdp-price[^\'"]*[\'"][\s\S]{1,500}?class=[\'"][^\'"]*andes-money-amount__fraction[^\'"]*[\'"][^>]*>([\d\.]+)<', body)
        if pdp_match:
            cents_match = re.search(r'class=[\'"][^\'"]*ui-pdp-price[^\'"]*[\'"][\s\S]{1,700}?class=[\'"][^\'"]*andes-money-amount__cents[^\'"]*[\'"][^>]*>(\d{2})<', body)
            cents = ("." + cents_match.group(1)) if cents_match else ""
            p = parse_brl_str(pdp_match.group(1) + cents)
            if p and p > 50:
                return p
        fractions = re.findall(r'class=[\'"][^\'"]*andes-money-amount__fraction[^\'"]*[\'"][^>]*>([\d\.]+)<', body)
        if fractions:
            p = parse_brl_str(fractions[0])
            if p and p > 50:
                return p

    # 2. Meta tags (KaBuM, Pichau, Terabyte, Amazon, Magalu)
    meta_p = re.findall(r'<meta[^>]+property=[\'"]product:price:amount[\'"][^>]+content=[\'"]([\d\.,]+)[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+content=[\'"]([\d\.,]+)[\'"][^>]+property=[\'"]product:price:amount[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+itemprop=[\'"]price[\'"][^>]+content=[\'"]([\d\.,]+)[\'"]', body, re.I)
    meta_p += re.findall(r'<meta[^>]+content=[\'"]([\d\.,]+)[\'"][^>]+itemprop=[\'"]price[\'"]', body, re.I)
    for m in meta_p:
        p = parse_brl_str(m)
        if p and p > 50:
            return p

    # 3. JSON-LD schema (offers.price)
    json_ld = re.findall(r'<script[^>]+type=[\'"]application/ld\+json[\'"][^>]*>([\s\S]*?)</script>', body, re.I)
    for block in json_ld:
        try:
            data = json.loads(block)
            offers = data.get('offers')
            if isinstance(offers, dict) and 'price' in offers:
                p = parse_brl_str(str(offers['price']))
                if p and p > 50: return p
            elif isinstance(offers, list) and offers and 'price' in offers[0]:
                p = parse_brl_str(str(offers[0]['price']))
                if p and p > 50: return p
        except Exception:
            pass

    # 4. Fallback: prominent BRL regex
    prices = re.findall(r'R\$\s*([\d\.]+(?:,\d{2})?)', body)
    for pr in prices[:6]:
        p = parse_brl_str(pr)
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

        # Check if the text has any expiry indicator
        if not any(k in low for k in ["acabou", "expir", "esgot", "encerr", "finaliz", "invalido", "inválido", "morreu"]):
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
                reason = f"Grupo @{ch_id or 'radar'} avisou: '{clean[:80]}...'"
                data["coupons"][code] = {
                    "status": "expired",
                    "reason": reason,
                    "source": "channel_report",
                    "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
                detected["coupons"][code] = data["coupons"][code]

        # 2. Check if a referenced post was explicitly marked expired
        if ref_post_id and any(k in low for k in ["acabou", "esgotou", "expirou", "encerrado", "finalizado"]):
            data["deals"][ref_post_id] = {
                "status": "out_of_stock",
                "reason": f"Grupo avisou término: '{clean[:80]}...'",
                "source": "channel_report",
                "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            detected["deals"][ref_post_id] = data["deals"][ref_post_id]

        # 3. If post itself begins with [ESGOTOU], [ACABOU], [ENCERRADO]
        if post_id and re.search(r"^\s*\[?(?:esgotou|acabou|encerrado|expirado|finalizado)\]?", clean, re.I):
            data["deals"][post_id] = {
                "status": "out_of_stock",
                "reason": "Post editado para Esgotado/Acabou",
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
    3. Checks page HTML for out-of-stock / pausado indicators.
    4. Extracts the actual live store checkout price and compares against expected promo price.
    5. If store price went up (e.g. from R$ 2.140 to R$ 3.180), flags deal as expired.
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
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
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
                                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8"
                            }
                        )
                        with opener.open(req_out, timeout=timeout) as resp_out:
                            final_url = resp_out.geturl()
                            body = resp_out.read().decode("utf-8", errors="ignore")
                            low = body.lower()
                    except Exception:
                        pass

            # Check out of stock patterns
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
                if f"cupom {c_low} expirado" in low or f"cupom {c_low} inválido" in low or f"cupom {c_low} esgotado" in low:
                    res["valid"] = False
                    res["status"] = "expired"
                    res["reason"] = f"Cupom {coupon_code} reportado inválido ou esgotado na loja"
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
                        res["reason"] = f"Preço na loja subiu para R$ {live_price:,.2f} (oferta de R$ {expected_price:,.2f} encerrada)"
                        if post_id or buy_url:
                            record_deal_status(post_id, "expired", res["reason"], source="live_test", url=buy_url)
                        return res
                    else:
                        res["valid"] = True
                        res["status"] = "active"
                        res["reason"] = f"Confirmado ativo na loja por R$ {live_price:,.2f}"
                        if post_id or buy_url:
                            record_deal_status(post_id, "active", res["reason"], source="live_test", url=buy_url)
                        return res
                else:
                    # Offer with coupon: check if store price is compatible with coupon deduction
                    max_allowed_store_price = max(expected_price * 1.35, expected_price + 600)
                    if live_price > max_allowed_store_price:
                        res["valid"] = False
                        res["status"] = "expired"
                        res["reason"] = f"Preço na loja subiu para R$ {live_price:,.2f} (incompatível com cupom {coupon_code})"
                        if post_id or buy_url:
                            record_deal_status(post_id, "expired", res["reason"], source="live_test", url=buy_url)
                        record_coupon_status(coupon_code, "expired", res["reason"], source="live_test")
                        return res
                    else:
                        res["valid"] = True
                        res["status"] = "active"
                        res["reason"] = f"Produto ativo na loja por R$ {live_price:,.2f} (cupom {coupon_code})"
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

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        futures = [ex.submit(_worker, d) for d in to_test]
        for fut in concurrent.futures.as_completed(futures):
            try:
                deal_id, r = fut.result()
                results[deal_id] = r
            except Exception:
                pass

    return results


def rewire_deals_and_best_by_slug(matched_deals, all_promos=None):
    """
    Crucial rewiring logic:
    1. Crosses all deals with the persistent coupon_status registry.
    2. If a deal's coupon is expired:
       - Sets `coupon_status = 'expired'`
       - Rewires `price_brl` back to `raw_price_brl` (revokes the dead coupon discount).
       - Flags `coupon_discount_revoked = True`.
    3. If a deal is out_of_stock or expired:
       - Sets `is_expired = True`.
    4. Recomputes `best_by_slug`:
       - STRICTLY EXCLUDES any deal that is expired or out_of_stock!
       - Ensures that a dead promo or expired coupon NEVER shadows newer legitimate promotions!
    """
    status_data = load_coupon_status()
    coupon_map = status_data.get("coupons", {})
    deal_map = status_data.get("deals", {})

    rewired_deals = []
    best_by_slug = {}

    for d in matched_deals:
        item = dict(d)
        post_id = item.get("post_id", "")
        coupon = (item.get("coupon_code") or "").strip().upper()

        # Check deal-level status (case-insensitive post_id and buy_url)
        buy_url = item.get("buy_url", "")
        deal_info = deal_map.get(post_id) or deal_map.get(post_id.lower()) or (deal_map.get(buy_url) if buy_url else None)
        if deal_info and deal_info.get("status") in ("expired", "out_of_stock"):
            item["is_expired"] = True
            item["deal_status"] = deal_info.get("status")
            item["deal_status_reason"] = deal_info.get("reason")
        else:
            item["is_expired"] = False
            item["deal_status"] = "active"

        # Check coupon-level status
        if coupon and coupon in coupon_map:
            c_info = coupon_map[coupon]
            item["coupon_status"] = c_info.get("status", "untested")
            item["coupon_status_reason"] = c_info.get("reason", "")
            if c_info.get("status") == "expired":
                item["is_coupon_expired"] = True
                # REWIRE PRICING: Revoke the dead coupon discount!
                raw_price = item.get("raw_price_brl")
                disc = item.get("discount_applied", 0)
                if raw_price and raw_price > item["price_brl"]:
                    item["price_brl"] = raw_price
                    item["coupon_discount_revoked"] = True
                elif disc > 0:
                    item["price_brl"] = round(item["price_brl"] + disc, 2)
                    item["coupon_discount_revoked"] = True
                # Recompute savings vs catalog
                hb_price = item.get("hb_price_brl", 0)
                if hb_price > 0:
                    item["savings_vs_hb_brl"] = round(hb_price - item["price_brl"], 2)
        else:
            item["coupon_status"] = "untested" if coupon else "none"
            item["is_coupon_expired"] = False

        # Only allow active, non-expired deals to be candidates for best_by_slug
        slug = item.get("matched_slug")
        if slug and not item.get("is_expired") and item.get("deal_status") == "active" and not item.get("is_coupon_expired"):
            if slug not in best_by_slug or item["price_brl"] < best_by_slug[slug]["price_brl"]:
                best_by_slug[slug] = item

        rewired_deals.append(item)

    # Sort rewired deals by age, active first, best savings
    rewired_deals.sort(
        key=lambda x: (
            x.get("is_expired", False),
            x.get("is_coupon_expired", False),
            x.get("age_hours", 0) > 24,
            -x.get("savings_vs_hb_brl", 0),
            x.get("price_brl", 999999),
        )
    )

    return rewired_deals, best_by_slug
