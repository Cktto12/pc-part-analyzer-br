"""
Live Miscellaneous Product & Promo Scraper (Zoom.com.br + Active Brazilian Telegram Groups).
Default categories:
  1. air_fryer  — Air Fryers / Fritadeiras Elétricas sem Óleo (Liters, Oven/Cesto, Digital, R$/Litro)
  2. diapers    — Fraldas Infantis (Brand, Size RN/P/M/G/XG/XXG/XXXG, Pants vs Fita, Units, R$/fralda)
Plus dynamic user-defined categories (`data/misc_config.json`) & instant live search (`search_misc_live`).
Includes verified active 2026 Brazilian Telegram groups where diapers & household promos appear daily.
"""
import os
import sys
import re
import json
import urllib.request
import urllib.parse
import concurrent.futures
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MISC_CONFIG_PATH = os.path.join(BASE_DIR, "data", "misc_config.json")
ZOOM_BASE_URL = "https://www.zoom.com.br"
SCRAPER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
}

# Verified active 2026 Brazilian Telegram channels where diapers, baby items, and Air Fryers appear
DEFAULT_MISC_TELEGRAM_GROUPS = [
    {"id": "ofertasdospequenos", "name": "Ofertas Dos Pequenos", "focus": "diapers", "desc": "Especialista em Fraldas (Pampers, Huggies, Babysec) e itens infantis", "enabled": True},
    {"id": "babyofertas",        "name": "Baby Ofertas",         "focus": "diapers", "desc": "Promoções diárias de fraldas, lenços umedecidos e enxoval", "enabled": True},
    {"id": "promobebe",          "name": "Promo Bebê (Nerd)",    "focus": "diapers", "desc": "Rede Nerd Ofertas focada em bebês, fraldas e casa", "enabled": True},
    {"id": "pechinchou",         "name": "Pechinchou Promoções", "focus": "both",    "desc": "Grande canal BR com Fraldas, Air Fryers, eletroportáteis e cupons", "enabled": True},
    {"id": "nerdofertas",        "name": "Nerd Ofertas",         "focus": "both",    "desc": "Ofertas relâmpago de Air Fryer, Fraldas, casa e tecnologia", "enabled": True},
    {"id": "pelandobr",          "name": "Pelando Promoções",    "focus": "both",    "desc": "Comunidade BR com destaque para Air Fryer, casa e ofertas gerais", "enabled": True},
    {"id": "escolhasegura",      "name": "EscolhaSegura Ofertas","focus": "air_fryer","desc": "Curadoria de Air Fryers, eletrodomésticos, celulares e periféricos", "enabled": True},
]

DEFAULT_MISC_CATEGORIES = [
    {
        "id": "air_fryer",
        "name": "Air Fryer",
        "icon": "🍟",
        "builtin": True,
        "queries": ["air fryer", "fritadeira"],
        "zoom_paths": ["/fritadeira", "/search?q=air+fryer+philips+walita+electrolux+mondial"],
        "keywords": ["air fryer", "airfryer", "fritadeira"],
        "target_price": 0,
    },
    {
        "id": "diapers",
        "name": "Fraldas Infantis",
        "icon": "👶",
        "builtin": True,
        "queries": ["fralda", "pampers", "huggies"],
        "zoom_paths": ["/search?q=fralda+pampers", "/search?q=fralda+huggies", "/search?q=fralda+babysec+pom+pom"],
        "keywords": ["fralda", "pampers", "huggies", "babysec", "pom pom", "mamypoko", "cremer"],
        "target_price": 0,
    },
]


def load_misc_config():
    cfg = {
        "categories": [dict(c) for c in DEFAULT_MISC_CATEGORIES],
        "telegram_groups": [dict(g) for g in DEFAULT_MISC_TELEGRAM_GROUPS],
    }
    if os.path.exists(MISC_CONFIG_PATH):
        try:
            with open(MISC_CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved.get("categories"), list) and saved["categories"]:
                by_id = {c["id"]: c for c in saved["categories"] if c.get("id")}
                merged_cats = []
                for dc in DEFAULT_MISC_CATEGORIES:
                    if dc["id"] in by_id:
                        m = dict(dc)
                        m.update(by_id[dc["id"]])
                        m["builtin"] = True
                        merged_cats.append(m)
                    else:
                        merged_cats.append(dict(dc))
                for c in saved["categories"]:
                    if c.get("id") and c["id"] not in {d["id"] for d in DEFAULT_MISC_CATEGORIES}:
                        merged_cats.append(c)
                cfg["categories"] = merged_cats
            if isinstance(saved.get("telegram_groups"), list) and saved["telegram_groups"]:
                by_gid = {g["id"].lower(): g for g in saved["telegram_groups"] if g.get("id")}
                merged_grps = []
                for dg in DEFAULT_MISC_TELEGRAM_GROUPS:
                    if dg["id"].lower() in by_gid:
                        m = dict(dg)
                        m.update(by_gid[dg["id"].lower()])
                        merged_grps.append(m)
                    else:
                        merged_grps.append(dict(dg))
                for g in saved["telegram_groups"]:
                    if g.get("id") and g["id"].lower() not in {d["id"].lower() for d in DEFAULT_MISC_TELEGRAM_GROUPS}:
                        merged_grps.append(g)
                cfg["telegram_groups"] = merged_grps
        except Exception:
            pass
    return cfg


def save_misc_config(cfg):
    os.makedirs(os.path.dirname(MISC_CONFIG_PATH), exist_ok=True)
    with open(MISC_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    return cfg


def parse_diaper_specs(title, price_brl):
    low = (title or "").lower()
    brand = "Fralda"
    for b in ["Pampers", "Huggies", "Babysec", "Pom Pom", "MamyPoko", "Cremer", "Personal Baby", "Turma da Mônica"]:
        if b.lower() in low:
            brand = b
            break

    size = ""
    m_sz = re.search(r"\b(?:tam(?:anho)?\.?\s*)?(xxxg|xxg|xg|rn\+?|g|m|p)\b", low)
    if m_sz:
        size = m_sz.group(1).upper()

    is_pants = bool(re.search(r"\bpants\b|cal[çc]a|roupinha|veste\s*f[áa]cil|shortinho", low))
    style = "Pants (Calça)" if is_pants else "Fita (Tradicional)"

    units = 0
    m_pack_mult = re.search(r"(\d+)\s*(?:x|pacotes?|pcts?|kits?)\s*(?:de\s*|com\s*|c/\s*)?(\d{2,3})\s*(?:unid(?:ades?)?|un\.?|tiras?|fraldas?)?", low)
    if m_pack_mult:
        p1, p2 = int(m_pack_mult.group(1)), int(m_pack_mult.group(2))
        if 1 <= p1 <= 12 and 12 <= p2 <= 250:
            units = p1 * p2
    if not units:
        m_u = re.search(r"(?:com\s*|c/\s*)?(\d{2,3})\s*(?:unid(?:ades?)?|un\.?|tiras?|fraldas?)\b", low)
        if m_u:
            u_val = int(m_u.group(1))
            if 10 <= u_val <= 600:
                units = u_val

    price_per_unit = round(price_brl / units, 2) if (units > 0 and price_brl > 0) else 0.0
    summary_parts = [brand]
    if size:
        summary_parts.append(f"Tam. {size}")
    summary_parts.append(style)
    if units > 0:
        summary_parts.append(f"{units} unid.")
    if price_per_unit > 0:
        summary_parts.append(f"R$ {price_per_unit:.2f}/fralda")

    return {
        "brand": brand,
        "size": size or "Vários",
        "style": style,
        "is_pants": is_pants,
        "units": units,
        "price_per_unit": price_per_unit,
        "summary": " • ".join(summary_parts),
    }


def parse_air_fryer_specs(title, price_brl, attrs=None):
    attrs = attrs or {}
    blob = (json.dumps(attrs, ensure_ascii=False) + " " + (title or "")).lower()
    brand = (attrs.get("Marca") or [""])[0].strip()
    if not brand:
        for b in ["Philips Walita", "Walita", "Electrolux", "Mondial", "Oster", "Britânia", "Arno", "Midea", "Philco", "Cadence", "Ninja", "Gaabor", "Xiaomi"]:
            if b.lower() in blob:
                brand = "Philips Walita" if b == "Walita" else b
                break
    brand = brand or "Air Fryer"

    liters = 0.0
    m_l = re.search(r"(\d+(?:[.,]\d)?)\s*(?:l\b|litros?)", blob)
    if m_l:
        try:
            lv = float(m_l.group(1).replace(",", "."))
            if 1.5 <= lv <= 30.0:
                liters = lv
        except ValueError:
            pass
    is_oven = bool(re.search(r"\boven\b|forno|12\s*l|11\s*l|10\s*l|duplo\s*cesto|dual", blob))
    is_digital = bool(re.search(r"digital|touch|led|display|wi-?fi", blob))
    m_w = re.search(r"\b(1[2-9]\d{2}|2[0-2]\d{2})\s*w\b", blob)
    watts = int(m_w.group(1)) if m_w else (1800 if liters >= 6 else 1500)
    price_per_liter = round(price_brl / liters, 2) if (liters > 0 and price_brl > 0) else 0.0

    parts = [brand]
    if liters > 0:
        parts.append(f"{liters:g}L")
    parts.append("Oven / Forno" if is_oven else "Cesto")
    parts.append("Digital" if is_digital else "Mecânica")
    parts.append(f"{watts}W")
    if price_per_liter > 0:
        parts.append(f"R$ {price_per_liter:.0f}/L")

    return {
        "brand": brand,
        "liters": liters,
        "is_oven": is_oven,
        "is_digital": is_digital,
        "watts": watts,
        "price_per_liter": price_per_liter,
        "summary": " • ".join(parts),
    }


def _fetch_zoom_search_hits(path, limit=24):
    try:
        req = urllib.request.Request(ZOOM_BASE_URL + path, headers=SCRAPER_HEADERS)
        raw_html = urllib.request.urlopen(req, timeout=11).read().decode("utf-8", errors="ignore")
        m = re.search(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', raw_html, re.S)
        if not m:
            return []
        d = json.loads(m.group(1))
        hits = d.get("props", {}).get("initialReduxState", {}).get("hits", {})
        return (hits.get("hits") or hits.get("results") or [])[:limit]
    except Exception:
        return []


def _enrich_misc_zoom_hit(cat_id, hit):
    slug = (hit.get("seoUrl") or "").strip().lower()
    name = (hit.get("name") or slug).strip()
    raw_url = hit.get("url") or f"/search?q={urllib.parse.quote(name)}"
    full_url = raw_url if raw_url.startswith("http") else f"{ZOOM_BASE_URL}{raw_url}"
    best_offer = hit.get("bestOffer") or {}
    price = hit.get("price") or best_offer.get("price") or 0
    try:
        price_brl = round(float(price), 2)
    except (TypeError, ValueError):
        price_brl = 0.0
    if price_brl <= 12:
        return None
    store_name = best_offer.get("sellerName") or "Zoom BR"
    img_url = hit.get("image") or best_offer.get("imageUrl") or ""

    if cat_id == "diapers":
        if re.search(r"\b(len[çc]o|pomada|creme|shampoo|sabonete|mamadeira|chupeta|lixeira|trocador|bolsa)\b", name, re.I) and "fralda" not in name.lower():
            return None
        specs = parse_diaper_specs(name, price_brl)
    elif cat_id == "air_fryer":
        if price_brl < 135:
            return None
        if re.search(r"\b(forma\s*de\s*silicone|papel\s*manteiga|forro|grelha|cesto\s*reposi|acess[óo]rio|capa\s*para)\b", name, re.I) and price_brl < 160:
            return None
        specs = parse_air_fryer_specs(name, price_brl)
    else:
        specs = {"brand": name.split()[0] if name else "Item", "summary": store_name}

    return {
        "slug": slug or re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60],
        "category_id": cat_id,
        "name": name,
        "brand": specs.get("brand") or "",
        "price_brl": price_brl,
        "store_name": store_name,
        "offer_url": full_url,
        "image_url": img_url,
        "specs": specs,
        "source": "zoom",
    }


def build_misc_catalog(existing_misc=None):
    cfg = load_misc_config()
    categories = cfg.get("categories") or DEFAULT_MISC_CATEGORIES
    out = {}

    for cat in categories:
        cid = cat["id"]
        paths = list(cat.get("zoom_paths") or [])
        if not paths:
            for q in (cat.get("queries") or [cat.get("name") or cid])[:2]:
                paths.append(f"/search?q={urllib.parse.quote(str(q))}")

        seen = set()
        cat_items = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            batches = list(ex.map(lambda p: _fetch_zoom_search_hits(p, limit=24), paths))

        for batch in batches:
            for h in batch:
                it = _enrich_misc_zoom_hit(cid, h)
                if not it or it["slug"] in seen:
                    continue
                seen.add(it["slug"])
                cat_items.append(it)

        if cid == "diapers":
            cat_items.sort(key=lambda x: (
                0 if (x["specs"].get("price_per_unit") or 0) > 0 else 1,
                x["specs"].get("price_per_unit") or 999,
                x["price_brl"],
            ))
        else:
            cat_items.sort(key=lambda x: x["price_brl"])

        if not cat_items and isinstance(existing_misc, dict) and existing_misc.get(cid):
            cat_items = existing_misc[cid]
        out[cid] = cat_items[:36]

    print("Built misc catalog:", {k: len(v) for k, v in out.items()})
    return out


def search_misc_live(query, category_id="custom", channels=None):
    """Live on-demand search across Zoom BR + selected Brazilian Telegram groups for ANY user query."""
    q = str(query or "").strip()
    if not q:
        return {"ok": False, "error": "Consulta vazia", "zoom_items": [], "telegram_deals": []}

    zoom_path = f"/search?q={urllib.parse.quote(q)}"
    raw_hits = _fetch_zoom_search_hits(zoom_path, limit=24)
    inferred_cat = category_id
    if inferred_cat == "custom":
        if re.search(r"fralda|pampers|huggies|babysec|pom\s*pom", q, re.I):
            inferred_cat = "diapers"
        elif re.search(r"air\s*fry|fritadeira", q, re.I):
            inferred_cat = "air_fryer"

    zoom_items = []
    seen = set()
    for h in raw_hits:
        it = _enrich_misc_zoom_hit(inferred_cat, h)
        if it and it["slug"] not in seen:
            seen.add(it["slug"])
            zoom_items.append(it)

    tg_deals = []
    try:
        import promo_radar
        cfg = load_misc_config()
        grp_list = cfg.get("telegram_groups") or DEFAULT_MISC_TELEGRAM_GROUPS
        if channels:
            wanted = {c.strip().lstrip("@").lower() for c in channels if c.strip()}
            active_grps = [{"id": cid, "name": f"@{cid}"} for cid in wanted]
        else:
            active_grps = [g for g in grp_list if g.get("enabled", True)]

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            futs = [ex.submit(promo_radar.fetch_channel_query, g["id"], g.get("name") or g["id"], q) for g in active_grps]
            seen_posts = set()
            for fut in concurrent.futures.as_completed(futs):
                try:
                    for post in fut.result():
                        pid = post.get("post_id")
                        if not pid or pid in seen_posts:
                            continue
                        seen_posts.add(pid)
                        if inferred_cat == "diapers":
                            post["misc_specs"] = parse_diaper_specs(post.get("title", "") + " " + post.get("raw_text", ""), float(post.get("price_brl") or 0))
                        elif inferred_cat == "air_fryer":
                            post["misc_specs"] = parse_air_fryer_specs(post.get("title", "") + " " + post.get("raw_text", ""), float(post.get("price_brl") or 0))
                        tg_deals.append(post)
                except Exception:
                    pass
        tg_deals.sort(key=lambda d: d.get("timestamp") or "", reverse=True)
    except Exception as e:
        print(f"[MiscSearch] Telegram query warning: {e}")

    return {
        "ok": True,
        "query": q,
        "category_id": inferred_cat,
        "searched_at": datetime.now().strftime("%H:%M:%S"),
        "zoom_items": zoom_items[:24],
        "telegram_deals": tg_deals[:30],
    }


if __name__ == "__main__":
    db_path = os.path.join(BASE_DIR, "data", "hardware_db.json")
    db = {}
    if os.path.exists(db_path):
        with open(db_path, "r", encoding="utf-8") as f:
            db = json.load(f)
    misc_cat = build_misc_catalog(existing_misc=db.get("misc_catalog"))
    db["misc_catalog"] = misc_cat
    db["misc_config"] = load_misc_config()
    save_misc_config(db["misc_config"])
    db["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(db_path, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    print(f"Saved misc_catalog to {db_path}")
