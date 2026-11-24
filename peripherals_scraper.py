"""
Live Brazilian Peripherals Catalog Scraper (Zoom.com.br) — Mouse, Keyboard & Headset.
Fetches real Brazilian peripherals, live best offers, stores, images, technical specs,
and daily price histories from Zoom.com.br, enriching every model with domain metrics:
- Mouse: Sensor tier, DPI, Weight (g), Wireless/2.4GHz, Polling Hz, Buttons, Connection
- Keyboard: Switch type (Hall Effect/Mechanical/Optical/Membrane), Form factor (60%/75%/TKL/Full), ABNT2/ANSI, Wireless, Hot-swap
- Headset: Driver mm, Connection (2.4GHz/BT/USB/P2), ANC, Mic type, Surround profile
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

PERIPHERAL_SHELVES = [
    ("mouse", "/mouse"),
    ("mouse", "/search?q=mouse+gamer+sem+fio+logitech+razer+redragon"),
    ("mouse", "/search?q=mouse+gamer+superlight+viper+attack+shark"),
    ("keyboard", "/teclado"),
    ("keyboard", "/search?q=teclado+mecanico+gamer+abnt2"),
    ("keyboard", "/search?q=teclado+gamer+magnetico+redragon+logitech+hyperx"),
    ("headset", "/search?q=headset+gamer+hyperx+logitech+razer+havit"),
    ("headset", "/search?q=headset+gamer+sem+fio+fifine+jbl+corsair"),
    ("headset", "/fone-de-ouvido-e-headset"),
]

PERIPH_BRANDS = [
    "Logitech", "Razer", "HyperX", "Redragon", "Corsair", "SteelSeries", "JBL",
    "Havit", "Fifine", "Attack Shark", "Fallen", "Motospeed", "Akko", "Keychron",
    "Royal Kludge", "Aula", "Epomaker", "Dell", "Microsoft", "Samsung", "Sony",
    "Audio-Technica", "Sennheiser", "Edifier", "Anker", "Baseus", "QCY", "Apple",
    "Pichau", "Husky", "Fortrek", "Multilaser", "C3Tech", "KBM", "SuperFrame", "Machenike", "Darmoshark"
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


def _detect_brand(name, attrs):
    b = (attrs.get("Marca") or [""])[0].strip()
    if b:
        return b
    low = name.lower()
    for cand in PERIPH_BRANDS:
        if cand.lower() in low:
            return cand
    return name.split()[0] if name else "Periférico"


def _compute_price_stats(price_brl, history):
    prices = [float(h["price"]) for h in (history or []) if h.get("price") and float(h["price"]) > 15]
    if price_brl > 0:
        prices.append(price_brl)
    min_all = round(min(prices), 2) if prices else price_brl
    min_90d = round(min(prices[-90:]), 2) if prices else price_brl
    avg_30d = round(statistics.mean(prices[-30:]), 2) if prices else price_brl
    avg_90d = round(statistics.mean(prices[-90:]), 2) if prices else price_brl
    median_180d = round(statistics.median(prices[-180:]), 2) if prices else price_brl
    target_price = round(min(avg_90d * 0.90, min_90d * 1.05), 2) if prices else price_brl
    vs_avg_90d_pct = round(((price_brl - avg_90d) / avg_90d) * 100, 1) if avg_90d > 0 else 0.0
    vs_min_90d_pct = round(((price_brl - min_90d) / min_90d) * 100, 1) if min_90d > 0 else 0.0
    p_status = "great" if price_brl <= target_price else ("fair" if price_brl <= avg_90d * 1.04 else "high")
    return {
        "target_price": target_price,
        "min_all_time": min_all,
        "min_90d": min_90d,
        "avg_30d": avg_30d,
        "avg_90d": avg_90d,
        "median_180d": median_180d,
        "vs_avg_90d_pct": vs_avg_90d_pct,
        "vs_min_90d_pct": vs_min_90d_pct,
        "status": p_status,
    }


def enrich_peripheral(raw):
    kind = raw["kind"]
    name = raw["name"]
    low = name.lower()
    attrs = raw.get("attrs") or {}
    attr_blob = (json.dumps(attrs, ensure_ascii=False) + " " + name).lower()
    price_brl = float(raw.get("price_brl") or 0)
    brand = _detect_brand(name, attrs)
    is_wireless = bool(re.search(r"sem\s*fio|wireless|bluetooth|lightspeed|hyperspeed|2\.4\s*ghz|tri-?mode", attr_blob))
    is_gamer = bool(re.search(r"gamer|pro\s*x|superlight|viper|deathadder|cobra|cloud|quantum|kraken|blackshark|barracuda|g305|g203|g403|g502|g703|kumara|fizz|draconic|alloy|huntsman|apex|k70|h2002d|zeus|hero", low))

    specs = {}
    perf_score = 50
    build_score = 55
    feature_score = 55

    if kind == "mouse":
        m_dpi = re.search(r"(\d{3,5})\s*dpi", attr_blob)
        dpi_max = int(m_dpi.group(1)) if m_dpi else (32000 if "superlight 2" in low or "viper v3" in low else (25600 if "hero" in low or "superlight" in low else (16000 if is_gamer and price_brl >= 180 else (12000 if is_gamer else 3200))))
        if "superlight 2" in low or "hero 2" in attr_blob or "3950" in attr_blob or "focus pro" in attr_blob:
            sensor_tier = "Flagship (HERO 2 / PAW3950)"
            perf_score = 97
        elif "3395" in attr_blob or "superlight" in low or "viper" in low or "deathadder v3" in low or "g502" in low or "g pro" in low:
            sensor_tier = "Top Esports (PAW3395 / HERO 25K)"
            perf_score = 90
        elif "g305" in low or "g203" in low or "3327" in attr_blob or "3311" in attr_blob or (is_gamer and price_brl >= 120):
            sensor_tier = "Óptico Gamer Preciso"
            perf_score = 78
        elif is_gamer:
            sensor_tier = "Óptico Gamer Entrada"
            perf_score = 64
        else:
            sensor_tier = "Óptico Escritório"
            perf_score = 48

        m_wt = re.search(r"\b(\d{2,3})\s*g\b", attr_blob)
        weight_g = int(m_wt.group(1)) if (m_wt and 35 <= int(m_wt.group(1)) <= 160) else (60 if "superlight" in low or "attack shark" in low or "viper v3" in low else (75 if is_gamer and is_wireless else (95 if is_gamer else 90)))
        polling_hz = 8000 if ("8k" in low or "superlight 2" in low or "viper v3" in low) else (1000 if is_gamer else 125)
        m_btn = re.search(r"(\d+)\s*bot", attr_blob)
        buttons = int(m_btn.group(1)) if m_btn else (6 if is_gamer else 3)

        build_score = min(98, max(45, (92 if weight_g <= 65 else (82 if weight_g <= 85 else 68)) + (6 if brand in ("Logitech", "Razer", "Corsair", "HyperX") else 0)))
        feature_score = min(98, max(40, (25 if is_wireless else 10) + (25 if polling_hz >= 4000 else (18 if polling_hz >= 1000 else 6)) + (35 if perf_score >= 85 else 24) + min(15, buttons * 2)))
        specs = {
            "sensor_tier": sensor_tier,
            "dpi_max": dpi_max,
            "weight_g": weight_g,
            "polling_hz": polling_hz,
            "buttons": buttons,
            "connection": "Sem fio 2.4GHz / BT" if is_wireless else "Com fio USB",
            "summary": f"{sensor_tier} • {weight_g}g • {polling_hz}Hz • {'Sem fio' if is_wireless else 'Com fio'}",
        }

    elif kind == "keyboard":
        is_magnetic = bool(re.search(r"magn[ée]tic|hall\s*effect|rapid\s*trigger|\bhe\b", attr_blob))
        is_optical = bool(re.search(r"[óo]ptico|optical", attr_blob))
        is_mech = is_magnetic or is_optical or bool(re.search(r"mec[âa]nic|mechanical|switch\s*(red|blue|brown|outemu|gateron|cherry|kailh|akko|huano)|kumara|fizz|draconic|alloy|huntsman|apex|keychron|aula\s*f75", attr_blob))
        switch_type = "Magnético (Hall Effect)" if is_magnetic else ("Óptico Gamer" if is_optical else ("Mecânico" if is_mech else "Membrana / Chiclet"))
        layout = "ABNT2 (Ç)" if (re.search(r"abnt2?", attr_blob) or (brand in ("Multilaser", "Vinik", "C3Tech", "Intelbras", "Dell", "Logitech", "Redragon", "HyperX") and "ansi" not in attr_blob)) else "ANSI (US)"
        if re.search(r"\b60%|\b61\s*teclas|fizz|draconic", attr_blob):
            form_factor = "60% Compacto"
        elif re.search(r"\b65%|\b68\s*teclas", attr_blob):
            form_factor = "65% Compacto"
        elif re.search(r"\b75%|\b82\s*teclas|\b84\s*teclas|f75", attr_blob):
            form_factor = "75% Compacto"
        elif re.search(r"\btkl\b|80%|87\s*teclas|kumara", attr_blob):
            form_factor = "TKL (80%)"
        else:
            form_factor = "Full-Size (100%)"
        hot_swap = is_magnetic or bool(re.search(r"hot[\s-]*swap|remov[íi]ve", attr_blob)) or (is_mech and price_brl >= 200)
        has_rgb = bool(re.search(r"\brgb\b|iluminad|rainbow|led", attr_blob)) or is_mech

        perf_score = 96 if is_magnetic else (88 if is_optical else (82 if is_mech and price_brl >= 250 else (74 if is_mech else 48)))
        build_score = min(98, max(45, (86 if is_mech and price_brl >= 300 else (76 if is_mech else 56)) + (8 if hot_swap else 0) + (4 if is_wireless else 0)))
        feature_score = min(98, max(40, (28 if is_mech else 12) + (18 if hot_swap else 0) + (20 if is_wireless else 8) + (14 if layout.startswith("ABNT2") else 8) + (14 if has_rgb else 5)))
        specs = {
            "switch_type": switch_type,
            "layout": layout,
            "form_factor": form_factor,
            "hot_swap": hot_swap,
            "rgb": has_rgb,
            "connection": "Sem fio 2.4GHz / BT" if is_wireless else "Com fio USB",
            "summary": f"{switch_type} • {form_factor} • {layout} • {'Sem fio' if is_wireless else 'USB'}",
        }

    else:  # headset
        m_drv = re.search(r"\b(40|45|50|53)\s*mm\b", attr_blob)
        driver_mm = int(m_drv.group(1)) if m_drv else (53 if any(k in low for k in ("cloud", "h2002", "zeus")) else (50 if is_gamer else 40))
        has_anc = bool(re.search(r"\banc\b|cancelamento\s*(?:ativo\s*)?de\s*ru[íi]do", attr_blob))
        has_surround = bool(re.search(r"7\.1|spatial|dts|dolby|surround", attr_blob))
        is_usb = bool(re.search(r"\busb\b", attr_blob))
        if is_wireless:
            conn_str = "Sem fio 2.4GHz / BT" if (is_gamer or "2.4" in attr_blob or "lightspeed" in attr_blob) else "Bluetooth"
        elif is_usb:
            conn_str = "USB (Placa de Som)"
        else:
            conn_str = "P2 3.5mm"
        mic_type = "Destacável" if any(k in low for k in ("cloud", "h2002", "zeus", "fifine", "pro x", "barracuda", "blackshark")) else ("Boom Integrado" if is_gamer else "Embutido")

        perf_score = 92 if any(k in low for k in ("cloud iii", "cloud alpha", "pro x", "arctis", "blackshark v2 pro", "airpods pro", "wh-1000")) else (
            84 if any(k in low for k in ("cloud ii", "cloud stinger", "h2002d", "zeus", "fifine h6", "fifine h9", "quantum 400", "quantum 610", "g435", "g733", "barracuda")) else (
                76 if (is_gamer and price_brl >= 180) else (66 if is_gamer else 54)
            )
        )
        build_score = min(98, max(45, (84 if driver_mm >= 50 else 68) + (8 if mic_type == "Destacável" else 0) + (6 if brand in ("HyperX", "Logitech", "Razer", "Sony", "JBL", "Corsair", "Apple") else 0)))
        feature_score = min(98, max(40, (24 if is_wireless else 12) + (18 if has_anc else 0) + (16 if has_surround else 8) + (22 if driver_mm >= 50 else 12) + (14 if mic_type == "Destacável" else 8)))
        specs = {
            "driver_mm": driver_mm,
            "connection": conn_str,
            "has_anc": has_anc,
            "has_surround": has_surround,
            "mic_type": mic_type,
            "summary": f"Driver {driver_mm}mm • {conn_str} • Mic {mic_type}" + (" • ANC" if has_anc else ""),
        }

    overall_score = int(round(perf_score * 0.48 + build_score * 0.27 + feature_score * 0.25))
    price_ref = {"mouse": 220.0, "keyboard": 280.0, "headset": 290.0}.get(kind, 250.0)
    cb_raw = (overall_score / max(0.35, (price_brl / price_ref) ** 0.38))
    cb_score = max(25, min(99, int(round(cb_raw))))

    return {
        "slug": raw["slug"],
        "kind": kind,
        "name": name,
        "brand": brand,
        "is_wireless": is_wireless,
        "is_gamer": is_gamer,
        "price_brl": round(price_brl, 2),
        "store_name": raw.get("store_name") or "Loja BR",
        "offer_url": raw.get("offer_url") or "",
        "image_url": raw.get("image_url") or "",
        "perf_score": perf_score,
        "build_score": build_score,
        "feature_score": feature_score,
        "overall_score": overall_score,
        "cb_score": cb_score,
        "specs": specs,
        "price_stats": _compute_price_stats(price_brl, raw.get("history") or []),
        "history": raw.get("history") or [],
    }


def fetch_zoom_peripheral_listings():
    seen = set()
    items = []

    def _fetch(pair):
        kind, path = pair
        try:
            req = urllib.request.Request(ZOOM_BASE_URL + path, headers=SCRAPER_HEADERS)
            raw_html = urllib.request.urlopen(req, timeout=12).read().decode("utf-8", errors="ignore")
            m = re.search(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', raw_html, re.S)
            if not m:
                return []
            d = json.loads(m.group(1))
            hits = d.get("props", {}).get("initialReduxState", {}).get("hits", {})
            return [(kind, h) for h in (hits.get("hits") or hits.get("results") or [])]
        except Exception:
            return []

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(_fetch, PERIPHERAL_SHELVES))

    per_kind_count = {"mouse": 0, "keyboard": 0, "headset": 0}
    for batch in results:
        for kind, h in batch:
            if per_kind_count[kind] >= 26:
                continue
            slug = (h.get("seoUrl") or "").strip().lower()
            name = (h.get("name") or "").strip()
            low = name.lower()
            if not slug or slug in seen:
                continue
            if kind == "mouse" and ("mousepad" in low or "mouse pad" in low or "combo" in low or "kit " in low or "teclado" in low):
                continue
            if kind == "keyboard" and ("kit " in low or "combo" in low or "mousepad" in low or "adesivo" in low or "keycap" in low or "suporte" in low):
                continue
            if kind == "headset" and not re.search(r"headset|headphone|fone|cloud|quantum|kraken|blackshark|barracuda|h2002|zeus|airpods|buds|arctis|g435|g733", low):
                continue
            if kind == "headset" and re.search(r"suporte|almofada|earpad|cabo|adaptador|capa|case\b", low):
                continue
            price = h.get("price") or (h.get("bestOffer") or {}).get("price") or 0
            try:
                price_f = float(price)
            except (TypeError, ValueError):
                price_f = 0.0
            if price_f < 25 or price_f > 4500:
                continue
            seen.add(slug)
            per_kind_count[kind] += 1
            items.append((kind, h))

    return items


def fetch_zoom_peripheral_detail(pair, existing_history=None):
    kind, hit = pair
    slug = (hit.get("seoUrl") or "").strip().lower()
    raw_url = hit.get("url") or f"/{kind}/{slug}"
    full_url = raw_url if raw_url.startswith("http") else f"{ZOOM_BASE_URL}{raw_url}"
    name = (hit.get("name") or slug).strip()

    attrs = {}
    best_offer = {}
    ph_days = []
    img_url = hit.get("image") or ""
    prod_name = name

    try:
        req = urllib.request.Request(full_url, headers=SCRAPER_HEADERS)
        html_str = urllib.request.urlopen(req, timeout=11).read().decode("utf-8", errors="ignore")
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
    except Exception:
        pass

    price_brl = float(best_offer.get("price") or hit.get("price") or 0.0)
    if best_offer.get("imageUrl"):
        img_url = best_offer["imageUrl"]
    store_name = best_offer.get("sellerName") or "Loja BR"

    floor_valid = max(18.0, price_brl * 0.35) if price_brl > 0 else 18.0
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
        cur = hist_by_date.get(today_str)
        if not cur or price_brl < cur["price"]:
            hist_by_date[today_str] = {"date": today_str, "price": round(price_brl, 2), "store": store_name}
    history = sorted(hist_by_date.values(), key=lambda x: x["date"])[-365:]

    return enrich_peripheral({
        "kind": kind,
        "slug": slug,
        "name": prod_name,
        "price_brl": price_brl,
        "store_name": store_name,
        "offer_url": full_url,
        "image_url": img_url,
        "attrs": attrs,
        "history": history,
    })


def build_peripherals_catalog(existing_peripherals=None):
    print("Fetching live Brazilian Peripherals (Mouse, Keyboard, Headset) from Zoom.com.br...")
    prev_hist_map = {}
    for it in (existing_peripherals or []):
        if it.get("slug") and it.get("history"):
            prev_hist_map[it["slug"]] = it["history"]

    pairs = fetch_zoom_peripheral_listings()
    print(f"Found {len(pairs)} unique Zoom peripherals. Enriching specs & daily price histories...")

    def _worker(pair):
        slug = (pair[1].get("seoUrl") or "").strip().lower()
        return fetch_zoom_peripheral_detail(pair, existing_history=prev_hist_map.get(slug))

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        items = [it for it in ex.map(_worker, pairs) if it and it.get("price_brl", 0) >= 25]

    print(f"Enriched {len(items)} peripherals successfully.")
    return items


def refresh_live_peripheral_prices(db):
    items = db.get("peripherals") or []
    if not items:
        return 0, 0
    pairs = fetch_zoom_peripheral_listings()
    by_slug = {(h.get("seoUrl") or "").strip().lower(): h for _, h in pairs if h.get("seoUrl")}
    today_str = datetime.now().strftime("%Y-%m-%d")
    updated = 0
    dropped = 0
    for it in items:
        h = by_slug.get(it.get("slug"))
        if not h:
            continue
        new_p = float(h.get("price") or (h.get("bestOffer") or {}).get("price") or 0)
        if new_p < 25:
            continue
        old_p = float(it.get("price_brl") or 0)
        if old_p > 0 and new_p < old_p * 0.99:
            dropped += 1
        it["price_brl"] = round(new_p, 2)
        hist = it.get("history")
        if isinstance(hist, list):
            if hist and hist[-1].get("date") == today_str:
                if new_p < float(hist[-1].get("price") or 999999):
                    hist[-1]["price"] = round(new_p, 2)
            else:
                hist.append({"date": today_str, "price": round(new_p, 2), "store": it.get("store_name") or "zoom"})
                if len(hist) > 365:
                    it["history"] = hist[-365:]
        updated += 1
    return updated, dropped


if __name__ == "__main__":
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "hardware_db.json")
    db = {}
    if os.path.exists(db_path):
        with open(db_path, "r", encoding="utf-8") as f:
            db = json.load(f)
    periphs = build_peripherals_catalog(existing_peripherals=db.get("peripherals"))
    db["peripherals"] = periphs
    db["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(db_path, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(periphs)} peripherals to {db_path}")
