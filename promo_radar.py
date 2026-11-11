"""
Real-Time Flash Promo & Coupon Radar for GPU & Build Analyzer Pro.
Pulls live hardware deals and coupons from public Telegram mirrors of the automated
Brazilian WhatsApp promotion bots (@ofertasadrenaline, @peperaiohardware, @iskandarsouza,
@benchpromos, @kabumofertas, @nerdofertas, @ofertastechbr), extracts product price,
coupon codes/discounts, store links, and matches them against the HardwareBarato catalog.
"""
import re
import html
import json
import time
import urllib.request
import urllib.parse
import concurrent.futures
from datetime import datetime, timezone

DEFAULT_CHANNELS = [
    {"id": "ofertasadrenaline", "name": "Ofertas Adrenaline"},
    {"id": "peperaiohardware",  "name": "Peperaio Hardware"},
    {"id": "iskandarsouza",     "name": "Iskandar Souza"},
    {"id": "benchpromos",       "name": "BenchPromos"},
    {"id": "kabumofertas",      "name": "KaBuM Ofertas"},
    {"id": "nerdofertas",       "name": "Nerd Ofertas"},
    {"id": "ofertastechbr",     "name": "Ofertas Tech BR"},
]

DEFAULT_SEARCH_QUERIES = [
    "",              # latest general messages in channel
    "RTX",           # NVIDIA GPUs
    "RX ",           # AMD GPUs
    "Ryzen",         # AMD CPUs
    "DDR4",          # DDR4 RAM
    "DDR5",          # DDR5 RAM
]

# Words that indicate a complete PC, laptop, monitor, or console rather than a standalone GPU/CPU
EXCLUDE_SYSTEM_RE = re.compile(
    r"\b(notebook|laptop|macbook|pc\s*gamer|computador|all\s*in\s*one|console|playstation|ps5|xbox|monitor|tv\s|smart\s*tv|cadeira|gabinete|water\s*cooler|teclado|mouse|headset|smartphone|celular|iphone|galaxy\s*s)\b",
    re.IGNORECASE,
)

# Specific GPU pattern rules (ordered from most specific to least specific!)
GPU_MATCH_RULES = [
    ("rtx-5090",         r"\brtx\s*5090\b"),
    ("rtx-5080",         r"\brtx\s*5080\b"),
    ("rtx-5070-ti",      r"\brtx\s*5070\s*ti\b"),
    ("rtx-5070",         r"\brtx\s*5070(?!\s*ti)\b"),
    ("rtx-5060-ti-16gb", r"\brtx\s*5060\s*ti\b.*?\b16\s*gb\b|\b16\s*gb\b.*?\brtx\s*5060\s*ti\b"),
    ("rtx-5060-ti-8gb",  r"\brtx\s*5060\s*ti\b(?!.*?\b16\s*gb\b)"),
    ("rtx-5060",         r"\brtx\s*5060(?!\s*ti)\b"),
    ("rtx-5050",         r"\brtx\s*5050\b"),
    ("rtx-4080-super",   r"\brtx\s*4080\s*super\b"),
    ("rtx-4080",         r"\brtx\s*4080(?!\s*super)\b"),
    ("rtx-4070-ti",      r"\brtx\s*4070\s*ti\b"),
    ("rtx-4070",         r"\brtx\s*4070(?!\s*ti)\b"),
    ("rtx-4060-ti-8gb",  r"\brtx\s*4060\s*ti\b"),
    ("rtx-4060",         r"\brtx\s*4060(?!\s*ti)\b"),
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


def parse_brl_number(s):
    """Converts Brazilian formatted price string (e.g. '2.645,92' or '2611' or '585,00') to float."""
    s = s.strip()
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    elif "." in s:
        parts = s.split(".")
        if len(parts[-1]) == 3:
            s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


def extract_price_and_coupon(lines):
    """
    Extracts the main cash/promo price (in BRL) and any coupon code / coupon description
    from a list of message lines, avoiding coupon discount amounts ('R$ 100 OFF') and
    installment slices ('12x de R$ 250').
    """
    candidates = []
    coupon_info = None
    coupon_code = None
    detected_discount_brl = 0.0
    detected_discount_pct = 0.0

    full_text = "\n".join(lines)

    # 1. Extract explicit coupon code if present (e.g. "Com cupom AFFNOV04", "Cupom: ZAFADINHO10", "Use o cupom: XYZ")
    m_code = re.search(
        r"(?:cupom|c[oó]digo)\s*(?:de\s*desconto)?\s*[:\-]?\s*\b([A-Z0-9]{4,18})\b",
        full_text,
        re.IGNORECASE,
    )
    if m_code:
        word = m_code.group(1).upper()
        if word not in {"PARA", "ESTA", "ESSA", "HOJE", "AQUI", "MAIS", "PELO", "SITE", "LOJA", "SHOPEE", "KABUM", "MAGALU", "MERCADO"}:
            coupon_code = word

    # Detect explicit discount values like "R$ 300 OFF", "300 de desconto", "cupom de 300"
    for line in lines:
        m_disc = re.search(r"(?:cupom\s*de|desconto\s*de|menos|abatimento|off\s*de)\s*R?\$?\s*([0-9]{2,4})", line, re.I) or re.search(r"R\$\s*([0-9]{2,4})\s*(?:off|de\s*desconto)", line, re.I)
        if m_disc:
            try:
                d_val = float(m_disc.group(1))
                if 30 <= d_val <= 3000:
                    detected_discount_brl = max(detected_discount_brl, d_val)
            except ValueError:
                pass
        m_pct = re.search(r"\b([1-9][0-9]?)\s*%\s*(?:off|de\s*desconto)", line, re.I)
        if m_pct:
            try:
                p_val = float(m_pct.group(1))
                if 3 <= p_val <= 40:
                    detected_discount_pct = max(detected_discount_pct, p_val)
            except ValueError:
                pass

        low = line.lower()
        # Capture coupon description line
        if any(k in low for k in ["cupom", "🎟", "🏷", "resgate", "moedas"]):
            if not coupon_info:
                cleaned_c = re.sub(r"https?://\S+", "", line).strip(" -•🎟️🏷️💵🔥*")
                if len(cleaned_c) >= 4:
                    coupon_info = cleaned_c

        # Check all R$ occurrences in this line
        for m in re.finditer(r"R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]{3,5}(?:,[0-9]{1,2})?)", line, re.IGNORECASE):
            val = parse_brl_number(m.group(1))
            if val < 80 or val > 40000:
                continue
            # Check context around the match in the same line
            start, end = m.span()
            before = line[max(0, start - 22):start].lower()
            after = line[end:min(len(line), end + 22)].lower()

            # Skip if it's a discount amount like "R$ 100 OFF" or "desconto de R$ 150"
            if re.search(r"\b(off|desconto)\b", after) or re.search(r"\b(cupom\s*de|desconto\s*de|resgate|abatimento)\b", before):
                if not detected_discount_brl or val > detected_discount_brl:
                    detected_discount_brl = max(detected_discount_brl, val)
                continue
            # Skip if it's a monthly installment like "10x de R$ 264" or "12x R$ 210"
            if re.search(r"\d+\s*x\s*(?:de\s*)?$", before):
                continue

            # Priority score: lines with "por R$", "valor:", "💵", "à vista", "pix" get highest priority
            prio = 1
            if any(k in low for k in ["por r$", "valor", "💵", "pix", "à vista", "a vista", "🔥"]):
                prio = 3
            elif "parcelado" in low or "12x" in low or "10x" in low:
                prio = 0
            candidates.append((prio, val))

    if not candidates:
        return None, coupon_code, coupon_info

    # Pick highest priority, then lowest cash price among top priority
    max_prio = max(c[0] for c in candidates)
    best_vals = [c[1] for c in candidates if c[0] == max_prio]
    base_price = min(best_vals)

    final_price = base_price
    if detected_discount_brl > 0 and detected_discount_brl < base_price * 0.45:
        final_price = base_price - detected_discount_brl
    elif detected_discount_pct > 0:
        final_price = base_price * (1.0 - (detected_discount_pct / 100.0))

    return round(final_price, 2), coupon_code, coupon_info


def match_catalog_item(title_and_first_lines, db):
    """Matches a deal's title against our GPU / CPU catalog, ignoring full PCs and laptops."""
    if EXCLUDE_SYSTEM_RE.search(title_and_first_lines):
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


def fetch_channel_query(ch_id, ch_name, query=""):
    """Fetches a single public Telegram web preview page and parses its message blocks."""
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
    # Split by message container
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

        # Extract external links inside the message (excluding t.me / bit.ly group invite links)
        hrefs = re.findall(r'href="(https?://[^"]+)"', raw_html)
        product_links = [
            h for h in hrefs
            if not any(x in h.lower() for x in ["t.me/", "bit.ly/canal", "whatsapp.com", "instagram.com", "youtube.com"])
        ]

        # Convert <br/> to newlines and strip HTML tags
        text_with_lines = re.sub(r"<br\s*/?>", "\n", raw_html, flags=re.IGNORECASE)
        clean_text = html.unescape(re.sub(r"<[^>]+>", "", text_with_lines))
        lines = [ln.strip() for ln in clean_text.splitlines() if ln.strip() and ln.strip() != "⠀"]
        if not lines:
            continue

        # Extract timestamp
        dt_m = re.search(r'<time datetime="([^"]+)"', part)
        iso_dt = dt_m.group(1) if dt_m else ""

        # Determine title (first meaningful line that isn't just a hashtag or 'BAIXOU!')
        title_lines = [
            ln for ln in lines[:4]
            if len(re.sub(r"[^a-zA-Z0-9]", "", ln)) >= 6
            and not re.match(r"^(baixa|baixou|parcelado|cupom|oferta|promo|#)", ln.strip(" ⭐️🔥🚨⚡"), re.IGNORECASE)
        ]
        title = (title_lines[0] if title_lines else lines[0]).strip(" ⭐️🔥🚨⚡🏹")

        price, coupon_code, coupon_info = extract_price_and_coupon(lines)
        if not price:
            continue

        results.append({
            "post_id": post_id,
            "channel_id": ch_id,
            "channel_name": ch_name,
            "post_url": f"https://t.me/{post_id}",
            "timestamp": iso_dt,
            "title": title[:160],
            "head_text": " ".join(lines[:3])[:260],
            "price_brl": price,
            "coupon_code": coupon_code,
            "coupon_info": coupon_info,
            "buy_url": product_links[-1] if product_links else f"https://t.me/{post_id}",
            "coupon_url": product_links[0] if len(product_links) > 1 else None,
        })
    return results


# Simple in-memory cache so repeated UI polls are instant
_PROMO_CACHE = {
    "updated_at": 0,
    "data": None,
}


def scan_live_promotions(db, extra_queries=None, extra_channels=None, max_age_hours=96, force=False):
    """
    Scans public Telegram promo channels in parallel, deduplicates posts,
    matches GPUs and CPUs against `db`, and returns both:
    - `matched_deals`: deals mapped directly to catalog GPUs/CPUs (sorted by best savings / lowest price)
    - `best_by_slug`: the lowest valid flash promo per catalog slug within `max_age_hours`
    - `all_hardware_promos`: recent hardware promos across channels
    """
    now = time.time()
    if not force and _PROMO_CACHE["data"] and (now - _PROMO_CACHE["updated_at"] < 90):
        return _PROMO_CACHE["data"]

    channels = list(DEFAULT_CHANNELS)
    if extra_channels:
        for ch in extra_channels:
            ch_clean = ch.strip().lstrip("@").split("/")[-1]
            if ch_clean and not any(c["id"].lower() == ch_clean.lower() for c in channels):
                channels.append({"id": ch_clean, "name": f"@{ch_clean}"})

    queries = list(DEFAULT_SEARCH_QUERIES)
    if extra_queries:
        for q in extra_queries:
            if q and q not in queries:
                queries.append(q)

    tasks = [(ch["id"], ch["name"], q) for ch in channels for q in queries]
    raw_items = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
        futures = [ex.submit(fetch_channel_query, cid, cname, q) for cid, cname, q in tasks]
        for fut in concurrent.futures.as_completed(futures):
            try:
                raw_items.extend(fut.result())
            except Exception:
                pass

    # Deduplicate by post_id
    by_post = {}
    for item in raw_items:
        by_post[item["post_id"]] = item

    now_dt = datetime.now(timezone.utc)
    matched_deals = []
    all_promos = []
    best_by_slug = {}

    for item in by_post.values():
        # Calculate age in hours
        age_hours = 999.0
        if item["timestamp"]:
            try:
                dt = datetime.fromisoformat(item["timestamp"])
                age_hours = max(0.0, (now_dt - dt).total_seconds() / 3600.0)
            except Exception:
                pass
        item["age_hours"] = round(age_hours, 1)

        if age_hours > max_age_hours:
            continue

        kind, cat_obj = match_catalog_item(item["head_text"], db)
        if kind and cat_obj:
            hb_price = cat_obj.get("price_brl") or 0
            # Sanity bounds: avoid matching a cooler/waterblock or a full PC with the GPU's name
            if hb_price > 0 and (item["price_brl"] < hb_price * 0.48 or item["price_brl"] > hb_price * 1.25):
                continue

            savings = round(hb_price - item["price_brl"], 2)
            item["matched_kind"] = kind
            item["matched_slug"] = cat_obj["slug"]
            item["matched_name"] = cat_obj["name"]
            item["hb_price_brl"] = hb_price
            item["savings_vs_hb_brl"] = savings
            matched_deals.append(item)

            slug = cat_obj["slug"]
            if slug not in best_by_slug or item["price_brl"] < best_by_slug[slug]["price_brl"]:
                best_by_slug[slug] = item

        all_promos.append(item)

    matched_deals.sort(key=lambda x: (x["age_hours"] > 24, -x["savings_vs_hb_brl"], x["price_brl"]))
    all_promos.sort(key=lambda x: x["age_hours"])

    payload = {
        "ok": True,
        "scanned_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "channels_scanned": [c["id"] for c in channels],
        "matched_count": len(matched_deals),
        "matched_deals": matched_deals[:80],
        "best_by_slug": best_by_slug,
        "recent_feed": all_promos[:60],
    }
    _PROMO_CACHE["updated_at"] = now
    _PROMO_CACHE["data"] = payload
    return payload


if __name__ == "__main__":
    import os
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, "data", "hardware_db.json")
    cache_path = os.path.join(base_dir, "data", "promos_cache.json")
    
    with open(db_path, "r", encoding="utf-8") as f:
        db = json.load(f)
        
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Iniciando varredura de canais de promoção e cupons...")
    res = scan_live_promotions(db, force=True)
    print(f"Scanned {len(res['channels_scanned'])} channels -> {res['matched_count']} matched catalog deals!")
    
    # Save standalone promos cache for static GitHub Pages hosting
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    print(f"Saved live promos cache to {cache_path}")
    
    # Also embed live promos in hardware_db.json
    db["live_promos"] = res
    with open(db_path, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    print(f"Updated {db_path} with live promos snapshot.")
    
    for d in res["matched_deals"][:15]:
        print(
            f"  [{d['age_hours']}h ago] @{d['channel_id']} | {d['matched_name']}: "
            f"R$ {d['price_brl']} (HB: R$ {d['hb_price_brl']} -> diff: R$ {-d['savings_vs_hb_brl']:+.2f}) "
            f"| Cupom: {d['coupon_code'] or d['coupon_info'] or '-'}"
        )
