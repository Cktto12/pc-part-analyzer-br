"""
Live European Union Catalog & Daily Price History Scraper (EUR).
Fetches 100% real, live European retail prices, store links, images, and specs from:
  - Caseking DE (caseking.de JSON-LD ItemList catalogs)
  - Alternate DE (alternate.de HTML productBox catalogs & search listings)
  - dm.de (dmtech official JSON search API for baby diapers)

Zero BRL-to-EUR currency conversion is performed anywhere.
Real EU price histories accumulate daily across Caseking DE, Alternate DE, and dm.de snapshots.
"""
import os
import sys
import re
import html
import json
import time
import threading
import statistics
import urllib.request
import urllib.error
import urllib.parse
import concurrent.futures
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

EU_HEADERS_HTML = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
}

EU_HEADERS_JSON = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}

REAL_EU_STORES = ("Caseking DE", "Alternate DE", "dm.de")


def _clean_text(s):
    s = html.unescape(str(s or ""))
    s = s.replace("\xa0", " ").replace("™", " ").replace("®", " ").replace("©", " ")
    return re.sub(r"\s+", " ", s).strip()


def _slugify(s):
    low = _clean_text(s).lower()
    low = (
        low.replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )
    low = re.sub(r"[^a-z0-9]+", "-", low).strip("-")
    return low[:95] or "eu-item"


def _parse_german_eur(raw):
    if raw is None:
        return 0.0
    if isinstance(raw, (int, float)):
        return float(raw)
    s = html.unescape(str(raw)).replace("\xa0", " ")
    m = re.search(r"([0-9][0-9.,]*)", s)
    if not m:
        return 0.0
    num = m.group(1).strip()
    if "," in num and "." in num:
        # Assume German 1.299,00 if comma is after dot
        if num.rfind(",") > num.rfind("."):
            num = num.replace(".", "").replace(",", ".")
        else:
            num = num.replace(",", "")
    elif "," in num:
        parts = num.split(",")
        if len(parts[-1]) <= 2:
            num = "".join(parts[:-1]).replace(".", "") + "." + parts[-1]
        else:
            num = num.replace(",", "")
    elif num.count(".") >= 1:
        parts = num.split(".")
        if all(len(p) == 3 for p in parts[1:]):
            num = "".join(parts)
    try:
        return round(float(num), 2)
    except ValueError:
        return 0.0


_ALT_LOCK = threading.Lock()
_ALT_LAST_TS = 0.0


def _http_get_text(url, headers=None, timeout=14, throttle_alt=False):
    global _ALT_LAST_TS
    attempts = 3 if throttle_alt else 2
    for attempt in range(attempts):
        if throttle_alt:
            with _ALT_LOCK:
                wait_s = 0.40 - (time.monotonic() - _ALT_LAST_TS)
                if wait_s > 0:
                    time.sleep(wait_s)
                _ALT_LAST_TS = time.monotonic()
        try:
            req = urllib.request.Request(url, headers=headers or EU_HEADERS_HTML)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", errors="ignore")
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt + 1 < attempts:
                time.sleep(2.2 * (attempt + 1))
                continue
            raise


def fetch_caseking_pages(urls, max_workers=5):
    """Fetches and parses Schema.org ItemList JSON-LD products from Caseking DE (?sz=40&page=N)."""
    def _one(url):
        try:
            raw = _http_get_text(url, headers=EU_HEADERS_HTML, timeout=14)
        except Exception as e:
            print(f"[EU Caseking] Warning on {url}: {e}")
            return []
        found = []
        for ld_raw in re.findall(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', raw, re.S):
            try:
                data = json.loads(ld_raw)
            except Exception:
                continue
            objs = data if isinstance(data, list) else [data]
            for d in objs:
                if not isinstance(d, dict) or d.get("@type") != "ItemList":
                    continue
                for entry in (d.get("itemListElement") or []):
                    it = entry.get("item") or {}
                    name = html.unescape(str(it.get("name") or "")).strip()
                    clean_name = _clean_text(name)
                    prod_url = (it.get("url") or "").strip()
                    if prod_url.startswith("/"):
                        prod_url = "https://www.caseking.de" + prod_url
                    offers = it.get("offers") or {}
                    if isinstance(offers, list):
                        offers = offers[0] if offers else {}
                    price_eur = _parse_german_eur(offers.get("price"))
                    img = it.get("image") or ""
                    if isinstance(img, list):
                        img = img[0] if img else ""
                    if clean_name and prod_url and price_eur > 0:
                        found.append({
                            "name": re.sub(r"\s+", " ", html.unescape(name)).strip(),
                            "clean_name": clean_name,
                            "price_eur": round(price_eur, 2),
                            "regular_price_eur": round(price_eur, 2),
                            "url": prod_url,
                            "image": str(img).strip(),
                            "store": "Caseking DE",
                            "spec_text": "",
                        })
        return found

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        batches = list(ex.map(_one, urls))

    out = []
    seen_urls = set()
    for b in batches:
        for it in b:
            if it["url"] in seen_urls:
                continue
            seen_urls.add(it["url"])
            out.append(it)
    return out


def fetch_alternate_pages(urls, max_workers=2):
    """Fetches and parses Alternate DE productBox cards (extracting selling price, not strikethrough MSRP)."""
    def _one(url):
        try:
            raw = _http_get_text(url, headers=EU_HEADERS_HTML, timeout=16, throttle_alt=True)
        except Exception as e:
            print(f"[EU Alternate] Warning on {url}: {e}")
            return []
        parts = re.split(r'(?=<a\b[^>]*class="[^"]*productBox[^"]*")', raw)
        cards = [p for p in parts if "productBox" in p[:140]]
        found = []
        for card in cards:
            m_href = re.search(r'href="([^"]+)"', card[:280])
            if not m_href:
                continue
            href = html.unescape(m_href.group(1)).strip()
            if href.startswith("/"):
                href = "https://www.alternate.de" + href
            elif not href.startswith("http"):
                continue

            m_name = re.search(r'class="[^"]*product-name(?:\s+[^"]*)?"[^>]*>(.*?)</div>', card, re.S)
            if not m_name:
                m_name = re.search(r'class="[^"]*product-name(?:\s+[^"]*)?"[^>]*>(.*?)</(?:span|p|h\d)>', card, re.S)
            raw_name = re.sub(r"<[^>]+>", " ", m_name.group(1)) if m_name else ""
            raw_name = re.sub(r"\s+", " ", html.unescape(raw_name)).strip()
            if not raw_name:
                continue

            m_sub = re.search(r'class="[^"]*product-name-sub[^"]*"[^>]*>(.*?)</(?:span|div)>', card, re.S)
            sub_txt = re.sub(r"<[^>]+>", " ", m_sub.group(1)) if m_sub else ""
            sub_txt = re.sub(r"\s+", " ", html.unescape(sub_txt)).strip()

            # Selling price uses exact <span class="price ..."> (ignore strikethrough UVP <span class=" line-through">)
            m_price = re.search(r'<span\s+class="price(?:\s+[^"]*)?"[^>]*>\s*(.*?)\s*</span>', card, re.S)
            price_eur = _parse_german_eur(m_price.group(1) if m_price else None)
            if price_eur <= 0:
                continue

            m_reg = re.search(r'<span\s+class="[^"]*line-through[^"]*"[^>]*>\s*(.*?)\s*</span>', card, re.S)
            reg_eur = _parse_german_eur(m_reg.group(1) if m_reg else None)
            if reg_eur < price_eur:
                reg_eur = price_eur

            # Skip unavailable items marked "Nicht auf Lager" only? Keep stocked/orderable items unless clearly unavailable
            m_img = re.search(r'(?:data-src|src)="(/p/[^"]+)"', card)
            img = ("https://www.alternate.de" + m_img.group(1)) if m_img else ""

            spec_text = _clean_text(re.sub(r"<[^>]+>", " ", card))
            full_clean = _clean_text(f"{raw_name} {sub_txt}" if sub_txt else raw_name)
            found.append({
                "name": raw_name,
                "sub_name": sub_txt,
                "clean_name": full_clean,
                "price_eur": round(price_eur, 2),
                "regular_price_eur": round(reg_eur, 2),
                "url": href,
                "image": img,
                "store": "Alternate DE",
                "spec_text": spec_text,
            })
        return found

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        batches = list(ex.map(_one, urls))

    out = []
    seen_urls = set()
    for b in batches:
        for it in b:
            if it["url"] in seen_urls:
                continue
            seen_urls.add(it["url"])
            out.append(it)
    return out


def fetch_dm_diapers():
    """Fetches real European baby diaper packs & EUR/unit pricing from dm.de JSON search API."""
    queries = [
        "windeln+pampers",
        "windeln+babylove",
        "windeln+lillydoo",
        "windeln+hipp",
        "baby+dry+windeln",
    ]
    base_api = "https://product-search.services.dmtech.com/de/search/crawl?query={q}&searchType=product&type=search-static&pageSize=30"

    def _one(q):
        url = base_api.format(q=q)
        try:
            raw = _http_get_text(url, headers=EU_HEADERS_JSON, timeout=14, throttle_alt=False)
            return json.loads(raw).get("products") or []
        except Exception as e:
            print(f"[EU dm.de] Warning on query {q}: {e}")
            return []

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        batches = list(ex.map(_one, queries))

    exclude_re = re.compile(
        r"feuchtt[üu]cher|wipes|windeltorte|windeleimer|windelbeutel|wickelunterlage|wickeltasche|"
        r"wundschutz|creme|puder|schwimm|einlagen|stilleinlagen|bade|t[üu]cher|waschlappen|"
        r"unterhose|bettschutzeinlage|m[üu]llbeutel|nachf[üu]llkassette",
        re.I,
    )
    require_re = re.compile(r"windel|pants|höschen|baby-dry|premium\s*protection|new\s*baby", re.I)

    seen_urls = set()
    diapers = []
    for prods in batches:
        for p in prods:
            brand = _clean_text(p.get("brandName") or "")
            title = _clean_text(p.get("title") or "")
            full_name = f"{brand} {title}".strip() if brand and brand.lower() not in title.lower() else title
            low = full_name.lower()
            if not full_name or not require_re.search(low) or exclude_re.search(low):
                continue

            td = p.get("tileData") or {}
            self_path = (td.get("self") or "").strip()
            if not self_path:
                continue
            prod_url = self_path if self_path.startswith("http") else f"https://www.dm.de{self_path}"
            if prod_url in seen_urls:
                continue

            price_raw = (((td.get("price") or {}).get("price") or {}).get("current") or {}).get("value")
            price_eur = _parse_german_eur(price_raw)
            if price_eur < 3.0 or price_eur > 250.0:
                continue

            tile_infos = " ".join(str(x) for x in ((td.get("price") or {}).get("tileInfos") or []))
            units = 0
            m_units = re.search(r"\b(\d{1,3})\s*St\b", f"{tile_infos} {full_name}", re.I)
            if m_units:
                units = int(m_units.group(1))
            if units < 10:
                continue

            imgs = td.get("images") or []
            img_url = ""
            if imgs and isinstance(imgs[0], dict):
                img_url = (imgs[0].get("tileSrc") or imgs[0].get("src") or "").strip()

            seen_urls.add(prod_url)
            diapers.append({
                "brand": brand or "dm.de",
                "title": title,
                "name": full_name,
                "price_eur": round(price_eur, 2),
                "units": units,
                "tile_infos": tile_infos,
                "url": prod_url,
                "image": img_url,
                "store": "dm.de",
            })

    return diapers


def merge_eu_history(prev_item, price_eur, store_name, min_valid=1.0):
    """
    Preserves ONLY genuine EU price snapshots (eu_live=True or verified EU store).
    Drops any legacy converted BRL-derived histories.
    """
    hist_by_date = {}
    if isinstance(prev_item, dict):
        for h in (prev_item.get("history") or []):
            if not isinstance(h, dict):
                continue
            d_str = str(h.get("date") or "")[:10]
            st = str(h.get("store") or "")
            is_eu_live = bool(h.get("eu_live")) or (st in REAL_EU_STORES)
            try:
                pv = round(float(h.get("price") or 0), 2)
            except (TypeError, ValueError):
                pv = 0.0
            if d_str and is_eu_live and pv >= min_valid:
                hist_by_date[d_str] = {
                    "date": d_str,
                    "price": pv,
                    "store": st if st in REAL_EU_STORES else store_name,
                    "eu_live": True,
                }

    today_str = datetime.now().strftime("%Y-%m-%d")
    if price_eur >= min_valid:
        cur = hist_by_date.get(today_str)
        if not cur or price_eur < cur["price"]:
            hist_by_date[today_str] = {
                "date": today_str,
                "price": round(float(price_eur), 2),
                "store": store_name,
                "eu_live": True,
            }

    return sorted(hist_by_date.values(), key=lambda x: x["date"])[-600:]


def compute_eu_price_stats(price_eur, history, min_valid=1.0, discount_ratio=0.92):
    prices = []
    for h in (history or []):
        try:
            pv = float(h.get("price") or 0)
        except (TypeError, ValueError):
            pv = 0.0
        if pv >= min_valid:
            prices.append(pv)
    if price_eur > 0:
        prices.append(float(price_eur))
    if not prices:
        prices = [round(float(price_eur or 0), 2)]

    p_cur = round(float(price_eur), 2)
    min_all = round(min(prices), 2)
    min_90d = round(min(prices[-90:]), 2)
    avg_30d = round(statistics.mean(prices[-30:]), 2)
    avg_90d = round(statistics.mean(prices[-90:]), 2)
    median_180d = round(statistics.median(prices[-180:]), 2)

    if len(prices) >= 3:
        sorted_recent = sorted(prices[-90:])
        p20_idx = max(0, int(len(sorted_recent) * 0.20) - 1)
        target_price = round(min(sorted_recent[p20_idx], avg_90d * discount_ratio), 2)
    else:
        target_price = round(min_all * discount_ratio, 2) if p_cur > 0 else 0.0

    vs_avg_90d_pct = round(((p_cur - avg_90d) / avg_90d) * 100, 1) if avg_90d > 0 else 0.0
    vs_min_90d_pct = round(((p_cur - min_90d) / min_90d) * 100, 1) if min_90d > 0 else 0.0
    vs_target_eur = round(p_cur - target_price, 2)

    if p_cur <= target_price * 1.03 or vs_avg_90d_pct <= -4.0:
        p_status = "great"
    elif vs_avg_90d_pct <= 5.0:
        p_status = "normal"
    elif vs_avg_90d_pct <= 14.0:
        p_status = "rising"
    else:
        p_status = "inflated"

    return {
        "target_price": target_price,
        "min_all_time": min_all,
        "min_90d": min_90d,
        "avg_30d": avg_30d,
        "avg_90d": avg_90d,
        "median_180d": median_180d,
        "vs_avg_90d_pct": vs_avg_90d_pct,
        "vs_min_90d_pct": vs_min_90d_pct,
        "vs_target_brl": vs_target_eur,
        "status": p_status,
    }


def _build_cpu_match_rules(ref_cpus):
    """Generates precision regex rules for EVERY CPU slug in the reference benchmark DB."""
    from promo_radar import CPU_MATCH_RULES

    rules_map = {slug: pat for slug, pat in CPU_MATCH_RULES}
    all_slugs = sorted({c.get("slug") for c in (ref_cpus or []) if c.get("slug")}, key=lambda s: (-len(s), s))
    out = []

    for slug in all_slugs:
        if slug == "xeon-e5-2680-v4":
            out.append((slug, re.compile(r"\be5[-\s]*2680\s*v4\b", re.I)))
            continue
        if slug.startswith("threadripper"):
            m_tr = re.search(r"(\d{4}(?:wx|x)?)", slug)
            if m_tr:
                tok = m_tr.group(1)
                out.append((slug, re.compile(rf"\bthreadripper\b.*?\b{tok}\b", re.I)))
            continue
        # Intel Core Ultra: e.g. core-ultra-7-265kf, core-ultra-5-225
        m_ultra = re.match(r"core-ultra-(\d)-(\d{3}[a-z]*?)(?:-plus)?$", slug)
        if m_ultra:
            tier, code = m_ultra.group(1), m_ultra.group(2)
            plus_pat = r"\s*plus" if slug.endswith("-plus") else r"(?!\s*plus\b)"
            pat = rf"\b(?:intel\s*)?(?:core\s*)?ultra\s*{tier}\s*(?:processor\s*)?{code}{plus_pat}(?![a-z0-9])"
            out.append((slug, re.compile(pat, re.I)))
            continue
        # Intel Core i3/i5/i7/i9: e.g. core-i5-14600kf
        m_intel = re.match(r"core-(i\d)-(\d{5}[a-z]*)$", slug)
        if m_intel:
            ser, code = m_intel.group(1), m_intel.group(2)
            pat = rf"\b(?:core\s*)?{ser}[-\s]*{code}(?![a-z0-9])"
            out.append((slug, re.compile(pat, re.I)))
            continue
        # AMD Ryzen: e.g. ryzen-7-9800x3d, ryzen-5-5600gt, ryzen-9-9950x3d2
        m_ryz = re.match(r"ryzen-(\d)-(\d{4}[a-z0-9]*)$", slug)
        if m_ryz:
            ser, code = m_ryz.group(1), m_ryz.group(2)
            pat = rf"\bryzen\s*{ser}\s*{code}(?![a-z0-9])"
            out.append((slug, re.compile(pat, re.I)))
            continue
        if slug in rules_map:
            out.append((slug, re.compile(rules_map[slug], re.I)))

    return out


def _build_gpus_eu(ref_gpus, prev_by_slug):
    from promo_radar import GPU_MATCH_RULES

    extra_rules = [
        ("arc-a380", r"\barc\s*a380\b"),
        ("arc-a310", r"\barc\s*a310\b"),
        ("rx-6500-xt-4gb", r"\brx\s*6500\s*xt\b"),
        ("rx-6400", r"\brx\s*6400\b"),
        ("rx-7800-xt", r"\brx\s*7800\s*xt\b"),
        ("rx-7900-xt", r"\brx\s*7900\s*xt(?!\s*x)\b"),
        ("rx-7900-gre", r"\brx\s*7900\s*gre\b"),
        ("rtx-4070-super", r"\b(?:rtx|geforce)?\s*4070\s*super\b"),
        ("rtx-4070-ti-super", r"\b(?:rtx|geforce)?\s*4070\s*ti\s*super\b"),
        ("rtx-4060-ti-16gb", r"\b(?:rtx|geforce)?\s*4060\s*ti\b.*?\b16\s*gb\b|\b16\s*gb\b.*?\b(?:rtx|geforce)?\s*4060\s*ti\b"),
        ("rtx-4060-ti-8gb", r"\b(?:rtx|geforce)?\s*4060\s*ti\b(?!.*?\b16\s*gb\b)"),
    ]
    # Keep GPU_MATCH_RULES precedence (specific first, e.g. Ti/16GB before base)
    all_rules = list(GPU_MATCH_RULES) + [r for r in extra_rules if r[0] not in {x[0] for x in GPU_MATCH_RULES}]
    compiled = [(sl, re.compile(pat, re.I)) for sl, pat in all_rules]

    ck_urls = [
        "https://www.caseking.de/en/pc-components/graphics-cards/nvidia?sz=40&page=1",
        "https://www.caseking.de/en/pc-components/graphics-cards/nvidia?sz=40&page=2",
        "https://www.caseking.de/en/pc-components/graphics-cards/nvidia?sz=40&page=3",
        "https://www.caseking.de/en/pc-components/graphics-cards/amd?sz=40&page=1",
        "https://www.caseking.de/en/pc-components/graphics-cards/amd?sz=40&page=2",
        "https://www.caseking.de/en/pc-components/graphics-cards/intel?sz=40&page=1",
    ]
    alt_urls = [
        "https://www.alternate.de/Grafikkarten?page=1",
        "https://www.alternate.de/Grafikkarten?page=2",
        "https://www.alternate.de/Grafikkarten?page=3",
        "https://www.alternate.de/Grafikkarten?page=4",
        "https://www.alternate.de/Grafikkarten?page=5",
        "https://www.alternate.de/Grafikkarten?page=6",
    ]

    offers = fetch_caseking_pages(ck_urls) + fetch_alternate_pages(alt_urls)
    exclude_re = re.compile(
        r"\b(wireview|water\s*block|waterblock|k[üu]hler|cooler|bracket|riser|backplate|"
        r"cable|kabel|adapter|bundle|halterung|st[üu]tze|w[äa]rmeleit|halter|gpu-halter|aio)\b",
        re.I,
    )

    best_by_slug = {}
    for off in offers:
        p_eur = off["price_eur"]
        if p_eur < 85.0 or p_eur > 5500.0:
            continue
        title = off["clean_name"]
        if exclude_re.search(title):
            continue
        # Ensure it looks like a graphics card (avoid PCs, notebooks, PSUs matching numbers)
        if re.search(r"\b(notebook|laptop|pc-system|komplett-pc|gaming-pc|workstation|netzteil|monitor)\b", title, re.I):
            continue
        for slug, pat in compiled:
            if pat.search(title):
                prev = best_by_slug.get(slug)
                if not prev or p_eur < prev["price_eur"]:
                    best_by_slug[slug] = off
                break

    ref_map = {g["slug"]: g for g in (ref_gpus or []) if g.get("slug")}
    gpus_out = []
    for slug, off in best_by_slug.items():
        ref = ref_map.get(slug)
        if not ref:
            continue
        item = json.loads(json.dumps(ref))
        p_eur = off["price_eur"]
        reg_eur = off["regular_price_eur"]
        hist = merge_eu_history(prev_by_slug.get(slug), p_eur, off["store"], min_valid=70.0)
        stats = compute_eu_price_stats(p_eur, hist, min_valid=70.0, discount_ratio=0.92)

        item["price_brl"] = p_eur
        item["regular_price_brl"] = reg_eur
        item["coupon_price_brl"] = None
        item["installment_price_brl"] = p_eur
        item["coupon"] = None
        item["coupon_label"] = None
        item["store_name"] = off["store"]
        item["offer_url"] = off["url"]
        item["href"] = off["url"]
        item["offer_title"] = off["name"]
        if off.get("image"):
            item["image"] = off["image"]
        item["price_stats"] = stats
        item["history"] = hist
        gpus_out.append(item)

    gpus_out.sort(key=lambda x: x.get("price_brl", 99999))
    return gpus_out


def _build_cpus_eu(ref_cpus, prev_by_slug):
    rules = _build_cpu_match_rules(ref_cpus)
    ck_urls = [
        "https://www.caseking.de/en/pc-components/cpus-processors?sz=40&page=1",
        "https://www.caseking.de/en/pc-components/cpus-processors?sz=40&page=2",
        "https://www.caseking.de/en/pc-components/cpus-processors?sz=40&page=3",
    ]
    alt_urls = [
        "https://www.alternate.de/CPUs?page=1",
        "https://www.alternate.de/CPUs?page=2",
        "https://www.alternate.de/CPUs?page=3",
        "https://www.alternate.de/CPUs?page=4",
        "https://www.alternate.de/CPUs?page=5",
    ]
    offers = fetch_caseking_pages(ck_urls) + fetch_alternate_pages(alt_urls)
    exclude_re = re.compile(
        r"\b(k[üu]hler|cooler|l[üu]fter|paste|w[äa]rmeleit|frame|sockelrahmen|mainboard|"
        r"motherboard|bundle|upgrade-kit|kit\b|aio|wasserk[üu]hl|notebook|laptop|pc-system|gaming-pc)\b",
        re.I,
    )

    best_by_slug = {}
    for off in offers:
        p_eur = off["price_eur"]
        title = off["clean_name"]
        if exclude_re.search(title):
            continue
        is_tr = "threadripper" in title.lower()
        if p_eur < 45.0 or p_eur > (12000.0 if is_tr else 2500.0):
            continue
        for slug, pat in rules:
            if pat.search(title):
                prev = best_by_slug.get(slug)
                if not prev or p_eur < prev["price_eur"]:
                    best_by_slug[slug] = off
                break

    ref_map = {c["slug"]: c for c in (ref_cpus or []) if c.get("slug")}
    cpus_out = []
    for slug, off in best_by_slug.items():
        ref = ref_map.get(slug)
        if not ref:
            continue
        item = json.loads(json.dumps(ref))
        p_eur = off["price_eur"]
        reg_eur = off["regular_price_eur"]
        hist = merge_eu_history(prev_by_slug.get(slug), p_eur, off["store"], min_valid=35.0)
        stats = compute_eu_price_stats(p_eur, hist, min_valid=35.0, discount_ratio=0.92)

        item["price_brl"] = p_eur
        item["regular_price_brl"] = reg_eur
        item["coupon"] = None
        item["coupon_label"] = None
        item["store_name"] = off["store"]
        item["offer_url"] = off["url"]
        item["href"] = off["url"]
        item["offer_title"] = off["name"]
        if off.get("image"):
            item["image"] = off["image"]
        item["price_stats"] = stats
        item["history"] = hist
        cpus_out.append(item)

    cpus_out.sort(key=lambda x: x.get("price_brl", 99999))
    return cpus_out


def _detect_mobo_brand(name):
    low = name.lower()
    for b in ["ASUS", "MSI", "Gigabyte", "ASRock", "Biostar", "NZXT", "Colorful"]:
        if b.lower() in low:
            return b
    return name.split()[0] if name.split() else "PC"


def _build_motherboards_eu(prev_by_slug):
    urls_ck = [
        "https://www.caseking.de/en/pc-components/mainboards?sz=40&page=1",
        "https://www.caseking.de/en/pc-components/mainboards?sz=40&page=2",
    ]
    urls_alt = [
        "https://www.alternate.de/Mainboards?page=1",
        "https://www.alternate.de/Mainboards?page=2",
        "https://www.alternate.de/Mainboards?page=3",
    ]
    offers = fetch_caseking_pages(urls_ck) + fetch_alternate_pages(urls_alt)
    excl = re.compile(r"\b(io-?shield|backplate|wifi-karte|adapter|kabel|mount|halter|waterblock)\b", re.I)

    by_slug = {}
    for off in offers:
        p_eur = off["price_eur"]
        if p_eur < 55.0 or p_eur > 1200.0:
            continue
        clean = re.sub(r",?\s*Mainboard\b.*$", "", off["clean_name"], flags=re.I).strip()
        blob = f"{clean} {off['spec_text']}".upper()
        if excl.search(blob):
            continue

        # Socket inference from explicit tag OR chipset
        if re.search(r"\bAM5\b|\bB650E?\b|\bB850\b|\bB840\b|\bX670E?\b|\bX870E?\b|\bA620\b", blob):
            socket = "AM5"
        elif re.search(r"\bAM4\b|\bB550\b|\bB450\b|\bA520\b|\bA320\b|\bX570\b|\bX470\b", blob):
            socket = "AM4"
        elif re.search(r"\bLGA\s*1851\b|\b1851\b|\bZ890\b|\bB860\b|\bH810\b", blob):
            socket = "LGA1851"
        elif re.search(r"\bLGA\s*1700\b|\b1700\b|\bZ790\b|\bZ690\b|\bB760\b|\bB660\b|\bH610\b", blob):
            socket = "LGA1700"
        else:
            continue

        if socket in ("AM5", "LGA1851"):
            mem_type = "DDR5"
        elif socket == "AM4":
            mem_type = "DDR4"
        else:
            mem_type = "DDR4" if re.search(r"\bDDR4\b|\bD4\b", blob) else "DDR5"

        slug = _slugify(clean)
        prev = by_slug.get(slug)
        if not prev or p_eur < prev["price_brl"]:
            hist = merge_eu_history(prev_by_slug.get(slug), p_eur, off["store"], min_valid=45.0)
            by_slug[slug] = {
                "slug": slug,
                "name": clean,
                "brand": _detect_mobo_brand(clean),
                "socket": socket,
                "memory_type": mem_type,
                "tdp_w": 40,
                "price_brl": p_eur,
                "regular_price_brl": off["regular_price_eur"],
                "store_name": off["store"],
                "offer_url": off["url"],
                "href": off["url"],
                "image": off.get("image") or "",
                "coupon": None,
                "coupon_label": None,
                "price_stats": compute_eu_price_stats(p_eur, hist, min_valid=45.0),
                "history": hist,
            }

    out = sorted(by_slug.values(), key=lambda x: x["price_brl"])
    return out[:90]


def _build_rams_eu(prev_by_slug):
    urls_ck = [
        "https://www.caseking.de/en/pc-components/memory?sz=40&page=1",
        "https://www.caseking.de/en/pc-components/memory?sz=40&page=2",
    ]
    urls_alt = [
        "https://www.alternate.de/Arbeitsspeicher?page=1",
        "https://www.alternate.de/Arbeitsspeicher?page=2",
        "https://www.alternate.de/Arbeitsspeicher?page=3",
    ]
    offers = fetch_caseking_pages(urls_ck) + fetch_alternate_pages(urls_alt)
    excl = re.compile(r"\b(so-?dimm|sodimm|laptop|notebook|ecc|rdimm|lrdimm|server|camm2|dummy)\b", re.I)

    by_slug = {}
    for off in offers:
        p_eur = off["price_eur"]
        if p_eur < 18.0 or p_eur > 1200.0:
            continue
        clean = re.sub(r",?\s*Arbeitsspeicher\b.*$", "", off["clean_name"], flags=re.I).strip()
        blob = f"{clean} {off['spec_text']}"
        if excl.search(blob):
            continue

        if re.search(r"\bDDR5\b", blob, re.I):
            mem_type = "DDR5"
        elif re.search(r"\bDDR4\b", blob, re.I):
            mem_type = "DDR4"
        else:
            continue

        # Parse capacity: e.g. "32 GB" or "2x 16 GB" or "48GB"
        cap_gb = 0
        m_cap = re.search(r"\b(8|16|24|32|48|64|96|128|192)\s*GB\b", clean, re.I)
        if m_cap:
            cap_gb = int(m_cap.group(1))
        else:
            m_kit = re.search(r"(\d)\s*x\s*(4|8|16|24|32|48)\s*GB", blob, re.I)
            if m_kit:
                cap_gb = int(m_kit.group(1)) * int(m_kit.group(2))
        if cap_gb < 8 or cap_gb > 192:
            continue

        # Parse speed MT/s: e.g. DDR5-6000, 6000 MT/s, 6000 MHz, 3200
        m_spd = re.search(r"(?:DDR[45][-\s]*|@?\s*)(\d{4})\s*(?:MT/s|MHz)?", clean, re.I)
        if not m_spd:
            m_spd = re.search(r"\b([2-9]\d{3})\s*(?:MT/s|MHz)\b", blob, re.I)
        speed = int(m_spd.group(1)) if m_spd else (5600 if mem_type == "DDR5" else 3200)
        if speed < 2133 or speed > 9600:
            speed = 5600 if mem_type == "DDR5" else 3200

        slug = _slugify(clean)
        prev = by_slug.get(slug)
        if not prev or p_eur < prev["price_brl"]:
            hist = merge_eu_history(prev_by_slug.get(slug), p_eur, off["store"], min_valid=12.0)
            by_slug[slug] = {
                "slug": slug,
                "name": clean,
                "memory_type": mem_type,
                "capacity_gb": cap_gb,
                "speed_mtps": speed,
                "tdp_w": 8,
                "price_brl": p_eur,
                "regular_price_brl": off["regular_price_eur"],
                "store_name": off["store"],
                "offer_url": off["url"],
                "href": off["url"],
                "image": off.get("image") or "",
                "coupon": None,
                "coupon_label": None,
                "price_stats": compute_eu_price_stats(p_eur, hist, min_valid=12.0),
                "history": hist,
            }

    out = sorted(by_slug.values(), key=lambda x: x["price_brl"])
    return out[:75]


def _build_psus_eu(prev_by_slug):
    urls_ck = [
        "https://www.caseking.de/en/pc-components/power-supplies?sz=40&page=1",
        "https://www.caseking.de/en/pc-components/power-supplies?sz=40&page=2",
    ]
    urls_alt = [
        "https://www.alternate.de/Netzteile?page=1",
        "https://www.alternate.de/Netzteile?page=2",
        "https://www.alternate.de/Netzteile?page=3",
    ]
    offers = fetch_caseking_pages(urls_ck) + fetch_alternate_pages(urls_alt)
    excl = re.compile(r"\b(kabel|cable|adapter|usv|ups|ladeger[äa]t|tester|halterung|bracket)\b", re.I)

    by_slug = {}
    for off in offers:
        p_eur = off["price_eur"]
        if p_eur < 35.0 or p_eur > 750.0:
            continue
        clean = re.sub(r",?\s*PC-Netzteil\b.*$", "", off["clean_name"], flags=re.I).strip()
        blob = f"{clean} {off['spec_text']}"
        if excl.search(clean):
            continue

        m_w = re.search(r"\b(\d{3,4})\s*(?:W\b|Watt\b)", blob, re.I)
        watts = int(m_w.group(1)) if m_w else 0
        if watts < 400 or watts > 2000:
            continue

        low_b = blob.lower()
        if "semi" in low_b or "teilmodular" in low_b:
            modularity = "Semi-Modular"
        elif any(k in low_b for k in ("vollmodular", "full-modular", "fully modular", "modular", "kabel-management", "cable management")):
            modularity = "Modular"
        else:
            modularity = "Non-Modular"

        certs = []
        for c_pat, c_lbl in [
            (r"80\s*plus\s*titanium", "80 Plus Titanium"),
            (r"80\s*plus\s*platinum", "80 Plus Platinum"),
            (r"80\s*plus\s*gold", "80 Plus Gold"),
            (r"80\s*plus\s*silver", "80 Plus Silver"),
            (r"80\s*plus\s*bronze", "80 Plus Bronze"),
            (r"80\s*plus\s*(?:white|standard)", "80 Plus White"),
            (r"cybenetics\s*titanium", "Cybenetics Titanium"),
            (r"cybenetics\s*platinum", "Cybenetics Platinum"),
            (r"cybenetics\s*gold", "Cybenetics Gold"),
        ]:
            if re.search(c_pat, low_b):
                certs.append(c_lbl)
        if not certs:
            certs = ["80 Plus Bronze"]

        brand = "PC PSU"
        for b in ["be quiet!", "Seasonic", "Corsair", "MSI", "ASUS", "Gigabyte", "Thermaltake", "Cooler Master", "FSP", "DeepCool", "EVGA", "Lian Li", "NZXT", "Phanteks", "SilverStone", "Kolink", "Enermax", "Chieftec", "XPG", "Fractal Design"]:
            if b.lower() in clean.lower():
                brand = b
                break

        slug = _slugify(clean)
        prev = by_slug.get(slug)
        if not prev or p_eur < prev["price_brl"]:
            hist = merge_eu_history(prev_by_slug.get(slug), p_eur, off["store"], min_valid=25.0)
            by_slug[slug] = {
                "slug": slug,
                "name": clean,
                "brand": brand,
                "watts": watts,
                "modularity": modularity,
                "certs": certs,
                "price_brl": p_eur,
                "regular_price_brl": off["regular_price_eur"],
                "store_name": off["store"],
                "offer_url": off["url"],
                "href": off["url"],
                "image": off.get("image") or "",
                "coupon": None,
                "coupon_label": None,
                "price_stats": compute_eu_price_stats(p_eur, hist, min_valid=25.0),
                "history": hist,
            }

    out = sorted(by_slug.values(), key=lambda x: x["price_brl"])
    return out[:75]


def _build_laptops_eu(prev_by_slug):
    from laptop_scraper import enrich_laptop_specs

    urls = [
        "https://www.alternate.de/Gaming-Notebooks?page=1",
        "https://www.alternate.de/Gaming-Notebooks?page=2",
        "https://www.alternate.de/Gaming-Notebooks?page=3",
        "https://www.alternate.de/Apple/MacBook",
        "https://www.alternate.de/Notebook/Alle-Notebooks?page=1",
        "https://www.alternate.de/Notebook/Alle-Notebooks?page=2",
        "https://www.alternate.de/Business-Notebooks?page=1",
        "https://www.alternate.de/Business-Notebooks?page=2",
        "https://www.alternate.de/Creator-Notebooks",
    ]
    offers = fetch_alternate_pages(urls)
    excl = re.compile(
        r"\b(tasche|rucksack|sleeve|h[üu]lle|ladeger[äa]t|netzteil|dock|docking|st[äa]nder|"
        r"k[üu]hler|folie|schutzfolie|garantie|carepack|adapter|kabel|maus|tastatur|monitor|ersatzteil|"
        r"general[üu]berholt|refurbished|b-?ware|vorf[üu]hr)\b",
        re.I,
    )
    require_re = re.compile(r"\b(notebook|laptop|macbook|thinkpad|zenbook|ideapad|vivobook|nitro|victus|legion|rog|loq|probook|elitebook|omnibook|xps|inspiron|katana|cyborg|stealth|thin|tuf)\b", re.I)

    by_slug = {}
    for off in offers:
        p_eur = off["price_eur"]
        if p_eur < 299.0 or p_eur > 5500.0:
            continue
        clean = _clean_text(off["name"])
        blob = f"{clean} {off['spec_text']}"
        if excl.search(clean) or not require_re.search(blob):
            continue

        # Normalize German storage "SSD 1 TB" / "1.000 GB" / "512 GB" cleanly into title
        spec_clean = _clean_text(off["spec_text"])
        raw_slug = _slugify(clean)
        if raw_slug in by_slug and p_eur >= by_slug[raw_slug]["price_brl"]:
            continue

        hist = merge_eu_history(prev_by_slug.get(raw_slug), p_eur, off["store"], min_valid=200.0)
        # Provide Alternate's spec bullet text to enrich_laptop_specs
        raw_payload = {
            "slug": raw_slug,
            "name": clean,
            "offer_title": f"{clean} {spec_clean}",
            "href": off["url"],
            "offer_url": off["url"],
            "image": off.get("image") or "",
            "store_name": off["store"],
            "price_brl": round(p_eur * 6.0, 2),  # temporary calibration ONLY for enrich heuristics
            "regular_price_brl": round(off["regular_price_eur"] * 6.0, 2),
            "installment_price_brl": p_eur,
            "installments": 1,
            "attrs": {
                "Padrão": ["QWERTZ (DE)"] if "macbook" not in clean.lower() else ["QWERTZ / ISO"],
            },
            "history": [],
        }
        enriched = enrich_laptop_specs(raw_payload)
        # Overwrite with 100% REAL EUR values & real EU history/stats immediately
        enriched["price_brl"] = round(p_eur, 2)
        enriched["regular_price_brl"] = round(off["regular_price_eur"], 2)
        enriched["installment_price_brl"] = round(p_eur, 2)
        enriched["installments"] = 1
        enriched["store_name"] = off["store"]
        enriched["offer_url"] = off["url"]
        enriched["href"] = off["url"]
        enriched["offer_title"] = clean
        if off.get("image"):
            enriched["image"] = off["image"]
        enriched["history"] = hist
        enriched["price_stats"] = compute_eu_price_stats(p_eur, hist, min_valid=200.0, discount_ratio=0.92)
        by_slug[raw_slug] = enriched

    out = sorted(by_slug.values(), key=lambda x: x["price_brl"])
    return out[:75]


def _canonical_phone_key(name):
    clean = _clean_text(name)
    # Strip trailing ", Handy ..." or color tokens and extract brand/model + storage
    m_st = re.search(r"\b(64|128|256|512)\s*GB\b|\b(1)\s*TB\b", clean, re.I)
    st_key = "1024gb" if (m_st and m_st.group(2)) else (f"{m_st.group(1)}gb" if m_st else "base")
    core = re.sub(r",?\s*Handy.*$", "", clean, flags=re.I)
    core = re.sub(r"\b(64|128|256|512)\s*GB\b|\b1\s*TB\b|\b5G\b|\bDual[-\s]*SIM\b", " ", core, flags=re.I)
    core = _slugify(core)
    return f"{core}-{st_key}"


def _build_smartphones_eu(prev_by_slug):
    from smartphone_scraper import enrich_smartphone

    urls = [
        "https://www.alternate.de/Smartphone/Samsung-Smartphones?page=1",
        "https://www.alternate.de/Smartphone/Samsung-Smartphones?page=2",
        "https://www.alternate.de/Smartphone/Samsung-Smartphones?page=3",
        "https://www.alternate.de/Smartphone/Apple-Smartphones?page=1",
        "https://www.alternate.de/Smartphone/Apple-Smartphones?page=2",
        "https://www.alternate.de/Smartphone/Google-Pixel?page=1",
        "https://www.alternate.de/Smartphone/Google-Pixel?page=2",
        "https://www.alternate.de/Smartphone/Xiaomi-Smartphones?page=1",
        "https://www.alternate.de/Smartphone/Xiaomi-Smartphones?page=2",
        "https://www.alternate.de/Smartphone/Motorola-Smartphones",
        "https://www.alternate.de/Smartphone/Alle-Smartphones?page=1",
        "https://www.alternate.de/Smartphone/Alle-Smartphones?page=2",
        "https://www.alternate.de/Smartphone/Alle-Smartphones?page=3",
    ]
    offers = fetch_alternate_pages(urls)
    excl = re.compile(
        r"\b(s\s*pen|eingabestift|stift|displayschutz|schutzfolie|panzerglas|h[üu]lle|case|cover|"
        r"bumper|kabel|ladeger[äa]t|powerbank|halterung|armband|watch|buds|kopfh[öo]rer|"
        r"tablet|galaxy\s*tab|ipad|adapter|folie|glas|clear\s*case|silikon|"
        r"general[üu]berholt|refurbished|b-?ware|vorf[üu]hr|dep)\b",
        re.I,
    )
    brand_re = re.compile(r"\b(galaxy|iphone|pixel|xiaomi|redmi|poco|motorola|moto\s*[ge]|edge\s*[456]0|oneplus|realme|honor)\b", re.I)

    by_model_key = {}
    for off in offers:
        p_eur = off["price_eur"]
        if p_eur < 115.0 or p_eur > 2600.0:
            continue
        clean = _clean_text(off["name"])
        if excl.search(clean) or not brand_re.search(clean):
            continue
        # Reject smartwatch / tablet titles sneaking past
        if re.search(r"\b(watch\d*|galaxy\s*ring|galaxy\s*fit|tab\s*[sa]\d+|pad\s*\d+)\b", clean, re.I):
            continue

        # Build clean display name preserving model + storage + 5G
        disp_name = re.sub(r",?\s*Handy\b", "", clean, flags=re.I).strip()
        key = _canonical_phone_key(clean)
        prev = by_model_key.get(key)
        if not prev or p_eur < prev["price_eur"]:
            off_copy = dict(off)
            off_copy["disp_name"] = disp_name
            off_copy["canon_slug"] = key
            by_model_key[key] = off_copy

    phones_out = []
    for key, off in by_model_key.items():
        p_eur = off["price_eur"]
        reg_eur = off["regular_price_eur"]
        slug = off["canon_slug"]
        hist = merge_eu_history(prev_by_slug.get(slug), p_eur, off["store"], min_valid=80.0)

        # Extract processor/display cues from Alternate spec_text into Zoom-compatible attrs
        sp_txt = off["spec_text"]
        attrs = {}
        m_proc = re.search(r"Prozessor:\s*([^\n]+?)(?:\s+Hauptkamera|\s+Frontkamera|\s+€|\s+Sofort|$)", sp_txt)
        if m_proc:
            attrs["Processador"] = [m_proc.group(1).strip()]
        m_disp = re.search(r"\((\d+(?:[.,]\d+)?)\s*Zoll\)", sp_txt)
        if m_disp:
            attrs["Tamanho da Tela"] = [m_disp.group(1).replace(",", ".")]
        m_ram = re.search(r"\b(4|6|8|12|16)\s*GB\b", off.get("sub_name") or "")
        if m_ram:
            attrs["Memória Ram"] = [f"{m_ram.group(1)} GB"]

        raw_payload = {
            "slug": slug,
            "name": f"{off['disp_name']} ({off.get('sub_name') or ''})".strip().rstrip("()").strip(),
            "price_brl": round(p_eur * 6.0, 2),  # temporary scale for spec-tier heuristics only
            "store_name": off["store"],
            "offer_url": off["url"],
            "image_url": off.get("image") or "",
            "num_parcels": 1,
            "total_parceled_brl": round(p_eur, 2),
            "attrs": attrs,
            "history": [],
        }
        enriched = enrich_smartphone(raw_payload)
        enriched["name"] = off["disp_name"]
        enriched["price_brl"] = round(p_eur, 2)
        enriched["regular_price_brl"] = round(reg_eur, 2)
        enriched["total_parceled_brl"] = round(p_eur, 2)
        enriched["num_parcels"] = 1
        enriched["store_name"] = off["store"]
        enriched["offer_url"] = off["url"]
        enriched["href"] = off["url"]
        enriched["image_url"] = off.get("image") or ""
        enriched["image"] = off.get("image") or ""
        enriched["coupon"] = None
        enriched["coupon_label"] = None
        enriched["history"] = hist
        enriched["price_stats"] = compute_eu_price_stats(p_eur, hist, min_valid=80.0, discount_ratio=0.92)
        phones_out.append(enriched)

    phones_out.sort(key=lambda x: (-x.get("perf_score", 0), x.get("price_brl", 9999)))
    return phones_out


def _build_peripherals_eu(prev_by_slug):
    from peripherals_scraper import enrich_peripheral

    ck_mouse = [
        "https://www.caseking.de/en/peripherals/mice?sz=40&page=1",
        "https://www.caseking.de/en/peripherals/mice?sz=40&page=2",
    ]
    alt_mouse = [
        "https://www.alternate.de/Eingabeger%C3%A4te/M%C3%A4use?page=1",
        "https://www.alternate.de/Eingabeger%C3%A4te/M%C3%A4use?page=2",
    ]
    ck_kb = [
        "https://www.caseking.de/en/peripherals/keyboards?sz=40&page=1",
        "https://www.caseking.de/en/peripherals/keyboards?sz=40&page=2",
    ]
    alt_kb = [
        "https://www.alternate.de/Eingabeger%C3%A4te/Tastaturen?page=1",
        "https://www.alternate.de/Eingabeger%C3%A4te/Tastaturen?page=2",
    ]
    alt_hs = [
        "https://www.alternate.de/Headsets?page=1",
        "https://www.alternate.de/Headsets?page=2",
    ]

    mice_raw = fetch_caseking_pages(ck_mouse) + fetch_alternate_pages(alt_mouse)
    kb_raw = fetch_caseking_pages(ck_kb) + fetch_alternate_pages(alt_kb)
    hs_raw = fetch_alternate_pages(alt_hs)

    excl = re.compile(
        r"\b(mousepad|mauspad|deskmat|keycap|tastenkappen|switch(?:es)?\s*(?:pack|set|35|70|90|110)|"
        r"kabel|coiled|st[äa]nder|halter|ohrpolster|earpad|handballenauflage|wrist|skates|grip|tape|"
        r"receiver|dongle|combo|set\b|bundle|adapter|tasche|case|bungee|gewicht)\b",
        re.I,
    )

    out = []
    seen_slugs = set()
    for kind, raw_list in [("mouse", mice_raw), ("keyboard", kb_raw), ("headset", hs_raw)]:
        count = 0
        # Sort cheapest/popular first but keep diversity across price tiers
        dedup = {}
        for off in raw_list:
            p_eur = off["price_eur"]
            if p_eur < 14.0 or p_eur > 550.0:
                continue
            clean = _clean_text(off["name"])
            if excl.search(clean):
                continue
            if kind == "mouse" and re.search(r"\b(tastatur|keyboard|headset|mauspad)\b", clean, re.I):
                continue
            if kind == "keyboard" and re.search(r"\b(maus\b|mouse\b|headset|switch\s*tester)\b", clean, re.I):
                continue
            if kind == "headset" and re.search(r"\b(mikrofonarm|popfilter|soundkarte)\b", clean, re.I):
                continue

            clean_disp = re.sub(r",?\s*(?:Gaming-)?(?:Maus|Tastatur|Headset)\b.*$", "", clean, flags=re.I).strip() or clean
            slug = _slugify(clean_disp)
            if slug in seen_slugs:
                continue
            prev = dedup.get(slug)
            if not prev or p_eur < prev["price_eur"]:
                off_c = dict(off)
                off_c["clean_disp"] = clean_disp
                off_c["slug"] = slug
                dedup[slug] = off_c

        for slug, off in sorted(dedup.items(), key=lambda kv: kv[1]["price_eur"]):
            if count >= 28:
                break
            seen_slugs.add(slug)
            p_eur = off["price_eur"]
            reg_eur = off["regular_price_eur"]
            hist = merge_eu_history(prev_by_slug.get(slug), p_eur, off["store"], min_valid=8.0)

            enriched = enrich_peripheral({
                "kind": kind,
                "slug": slug,
                "name": off["clean_disp"],
                "price_brl": round(p_eur * 6.0, 2),  # temporary calibration ONLY for tier/cb heuristics
                "store_name": off["store"],
                "offer_url": off["url"],
                "image_url": off.get("image") or "",
                "attrs": {"Info": [off.get("spec_text") or off["clean_name"]]},
                "history": [],
            })
            enriched["price_brl"] = round(p_eur, 2)
            enriched["regular_price_brl"] = round(reg_eur, 2)
            enriched["store_name"] = off["store"]
            enriched["offer_url"] = off["url"]
            enriched["href"] = off["url"]
            enriched["image_url"] = off.get("image") or ""
            enriched["image"] = off.get("image") or ""
            enriched["coupon"] = None
            enriched["coupon_label"] = None

            if kind == "keyboard" and isinstance(enriched.get("specs"), dict):
                low_all = f"{off['clean_name']} {off.get('spec_text', '')}".lower()
                eu_layout = "ANSI (US)" if re.search(r"\b(?:us|ansi)\b|us-layout", low_all) else "QWERTZ (DE)"
                sp = enriched["specs"]
                sp["layout"] = eu_layout
                sp["summary"] = f"{sp.get('switch_type', 'Mecânico')} • {sp.get('form_factor', 'Full-Size')} • {eu_layout} • {'Sem fio' if enriched.get('is_wireless') else 'USB'}"

            enriched["history"] = hist
            enriched["price_stats"] = compute_eu_price_stats(p_eur, hist, min_valid=8.0, discount_ratio=0.90)
            out.append(enriched)
            count += 1

    return out


def _build_air_fryers_eu(prev_by_slug):
    urls = [
        "https://www.alternate.de/Heissluftfritteuse?page=1",
        "https://www.alternate.de/Heissluftfritteuse?page=2",
        "https://www.alternate.de/Heissluftfritteuse?page=3",
    ]
    offers = fetch_alternate_pages(urls)
    excl = re.compile(
        r"\b(backpapier|silikon|form\b|einsatz|rost\b|zubeh[öo]r|ersatzkorb|spie[ßs]|"
        r"reiniger|buch|kochbuch|pizzaofen|mikrowelle|toaster|kontaktgrill|multikocher)\b",
        re.I,
    )
    req_re = re.compile(r"hei[ßs]luftfritteuse|air\s*fryer|airfryer|actifry|dual\s*zone", re.I)

    by_slug = {}
    for off in offers:
        p_eur = off["price_eur"]
        if p_eur < 35.0 or p_eur > 650.0:
            continue
        clean = _clean_text(off["name"])
        blob = f"{clean} {off['spec_text']}"
        low = blob.lower()
        if excl.search(clean) or not req_re.search(blob):
            continue

        brand = "Air Fryer"
        for b in ["Philips", "Ninja", "Cosori", "Tefal", "WMF", "Severin", "Medion", "Russell Hobbs", "Xiaomi", "DeLonghi", "Moulinex", "Princess", "Emerio", "Hisense", "Gorenje", "AEG", "Bosch"]:
            if b.lower() in clean.lower():
                brand = b
                break

        liters = 0.0
        m_l = re.search(r"(\d+(?:[.,]\d)?)\s*(?:l\b|liter)", low)
        if m_l:
            try:
                lv = float(m_l.group(1).replace(",", "."))
                if 1.5 <= lv <= 30.0:
                    liters = lv
            except ValueError:
                pass
        is_oven = bool(re.search(r"\boven\b|ofent[üu]r|doppel|dual|twin|2\s*f[äa]cher|1[0-5]\s*liter", low))
        is_digital = bool(re.search(r"digital|touch|led|display|app|wi-?fi", low))
        m_w = re.search(r"([12]\.?[0-9]{3})\s*watt|\b(1[2-9]\d{2}|2[0-6]\d{2})\s*w\b", low)
        watts = 1500
        if m_w:
            watts = int((m_w.group(1) or m_w.group(2)).replace(".", ""))
        elif liters >= 6:
            watts = 1800

        ppl = round(p_eur / liters, 2) if liters > 0 else 0.0
        parts = [brand]
        if liters > 0:
            parts.append(f"{liters:g}L")
        parts.append("Oven / Dual" if is_oven else "Cesto")
        parts.append("Digital" if is_digital else "Analógica")
        parts.append(f"{watts}W")
        if ppl > 0:
            parts.append(f"€ {ppl:.0f}/L")
        summary = " • ".join(parts)

        disp_name = re.sub(r",?\s*Hei[ßs]luftfritteuse.*$", "", clean, flags=re.I).strip() or clean
        if brand.lower() not in disp_name.lower():
            disp_name = f"{brand} {disp_name}"
        slug = _slugify(clean)
        if slug in by_slug and p_eur >= by_slug[slug]["price_brl"]:
            continue

        hist = merge_eu_history(prev_by_slug.get(slug), p_eur, off["store"], min_valid=20.0)
        stats = compute_eu_price_stats(p_eur, hist, min_valid=20.0, discount_ratio=0.90)

        cap_score = min(40.0, ((liters or 4.5) / 12.0) * 40.0)
        feat_score = 18.0 + (12.0 if is_oven else 4.0) + (10.0 if is_digital else 2.0)
        pwr_score = min(20.0, (watts / 2200.0) * 20.0)
        overall_score = round(max(35.0, min(99.0, cap_score + feat_score + pwr_score)), 1)
        eff_ppl = ppl if ppl > 0 else (p_eur / 4.5)
        eff_score = max(20.0, min(70.0, 88.0 - max(0.0, eff_ppl - 10.0) * 1.35))
        cb_score = round(max(30.0, min(99.0, eff_score * 0.72 + overall_score * 0.28)), 1)

        by_slug[slug] = {
            "slug": slug,
            "category_id": "air_fryer",
            "name": clean,
            "brand": brand,
            "price_brl": p_eur,
            "regular_price_brl": off["regular_price_eur"],
            "store_name": off["store"],
            "offer_url": off["url"],
            "href": off["url"],
            "image_url": off.get("image") or "",
            "image": off.get("image") or "",
            "specs": {
                "brand": brand,
                "liters": liters,
                "is_oven": is_oven,
                "is_digital": is_digital,
                "watts": watts,
                "price_per_liter": ppl,
                "summary": summary,
            },
            "source": "alternate_de",
            "history": hist,
            "price_stats": stats,
            "overall_score": overall_score,
            "cb_score": cb_score,
        }

    out = sorted(by_slug.values(), key=lambda x: (-x["cb_score"], x["price_brl"]))
    return out[:36]


def _build_diapers_eu(prev_by_slug):
    raw_list = fetch_dm_diapers()
    by_slug = {}

    for d in raw_list:
        p_eur = d["price_eur"]
        units = d["units"]
        name = d["name"]
        low = name.lower()
        brand = d["brand"]

        size = ""
        m_gr = re.search(r"\bGr\.?\s*(\d\+?|1|2|3|4\+|4|5\+|5|6\+|6|7|8)\b", name, re.I)
        if m_gr:
            size = f"Gr. {m_gr.group(1)}"
        else:
            m_kg = re.search(r"\((\d+-\d+\s*kg)\)", low)
            if m_kg:
                size = m_kg.group(1)

        is_pants = bool(re.search(r"pants|höschen|höschenwindel", low))
        style = "Pants (Pull-up)" if is_pants else "Tape (Classic)"
        ppu = round(p_eur / max(1, units), 2)

        parts = [brand]
        if size:
            parts.append(size)
        parts.append(style)
        parts.append(f"{units} St")
        parts.append(f"€ {ppu:.2f}/unit")
        summary = " • ".join(parts)

        slug = _slugify(name)
        if slug in by_slug and p_eur >= by_slug[slug]["price_brl"]:
            continue

        hist = merge_eu_history(prev_by_slug.get(slug), p_eur, d["store"], min_valid=2.0)
        stats = compute_eu_price_stats(p_eur, hist, min_valid=2.0, discount_ratio=0.90)

        tier_pts = 24.0 if any(b in brand.lower() for b in ("pampers", "lillydoo", "hipp")) else 20.0
        econ_pts = max(18.0, min(52.0, (0.65 - min(0.65, ppu)) * 95.0))
        pack_pts = min(14.0, (units / 180.0) * 14.0)
        style_pts = 10.0 if is_pants else 7.0
        overall_score = round(max(35.0, min(99.0, tier_pts + econ_pts + pack_pts + style_pts)), 1)
        cb_score = round(max(30.0, min(99.0, econ_pts * 1.15 + tier_pts * 0.75 + pack_pts * 0.5)), 1)

        by_slug[slug] = {
            "slug": slug,
            "category_id": "diapers",
            "name": name,
            "brand": brand,
            "price_brl": p_eur,
            "regular_price_brl": p_eur,
            "store_name": d["store"],
            "offer_url": d["url"],
            "href": d["url"],
            "image_url": d.get("image") or "",
            "image": d.get("image") or "",
            "specs": {
                "brand": brand,
                "size": size or "Standard",
                "style": style,
                "is_pants": is_pants,
                "units": units,
                "price_per_unit": ppu,
                "summary": summary,
            },
            "source": "dm_de",
            "history": hist,
            "price_stats": stats,
            "overall_score": overall_score,
            "cb_score": cb_score,
        }

    out = sorted(by_slug.values(), key=lambda x: (x["specs"]["price_per_unit"], x["price_brl"]))
    return out[:36]


def _prev_map(db, key):
    if not isinstance(db, dict):
        return {}
    return {it.get("slug"): it for it in (db.get(key) or []) if isinstance(it, dict) and it.get("slug")}


def build_eu_database(br_ref_db, existing_eu_db=None, eu_promo_path=None):
    """Builds the 100% real European Union EUR database with zero BRL conversion."""
    print("[EU Scraper] Fetching 100% live European retail data (Caseking DE, Alternate DE, dm.de)...")
    prev_misc = (existing_eu_db or {}).get("misc_catalog") or {}

    gpus = _build_gpus_eu(br_ref_db.get("gpus"), _prev_map(existing_eu_db, "gpus"))
    cpus = _build_cpus_eu(br_ref_db.get("cpus"), _prev_map(existing_eu_db, "cpus"))
    motherboards = _build_motherboards_eu(_prev_map(existing_eu_db, "motherboards"))
    rams = _build_rams_eu(_prev_map(existing_eu_db, "rams"))
    psus = _build_psus_eu(_prev_map(existing_eu_db, "psus"))
    laptops = _build_laptops_eu(_prev_map(existing_eu_db, "laptops"))
    smartphones = _build_smartphones_eu(_prev_map(existing_eu_db, "smartphones"))
    peripherals = _build_peripherals_eu(_prev_map(existing_eu_db, "peripherals"))
    air_fryers = _build_air_fryers_eu({it.get("slug"): it for it in (prev_misc.get("air_fryer") or []) if isinstance(it, dict) and it.get("slug")})
    diapers = _build_diapers_eu({it.get("slug"): it for it in (prev_misc.get("diapers") or []) if isinstance(it, dict) and it.get("slug")})

    live_promos = None
    if eu_promo_path and os.path.exists(eu_promo_path):
        try:
            with open(eu_promo_path, "r", encoding="utf-8") as f:
                live_promos = json.load(f)
        except Exception:
            live_promos = None

    eu_db = {
        "region_id": "eu",
        "currency_code": "EUR",
        "currency_symbol": "€",
        "exchange_rate": 1.0,
        "data_origin": "eu_live_retailers",
        "source_id": "eu_live_retailers",
        "source_name": "Caseking DE, Alternate DE & dm.de (Live EUR)",
        "source": "https://www.caseking.de/en",
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "gpus": gpus,
        "cpus": cpus,
        "motherboards": motherboards,
        "rams": rams,
        "psus": psus,
        "laptops": laptops,
        "smartphones": smartphones,
        "peripherals": peripherals,
        "misc_catalog": {
            "air_fryer": air_fryers,
            "diapers": diapers,
        },
        "live_promos": live_promos,
    }

    print(
        f"[EU Scraper] Built real EU catalog: GPUs={len(gpus)}, CPUs={len(cpus)}, "
        f"Mobos={len(motherboards)}, RAMs={len(rams)}, PSUs={len(psus)}, "
        f"Laptops={len(laptops)}, Smartphones={len(smartphones)}, "
        f"Peripherals={len(peripherals)}, AirFryers={len(air_fryers)}, Diapers={len(diapers)}"
    )
    return eu_db


if __name__ == "__main__":
    data_dir = os.path.join(BASE_DIR, "data")
    br_path = os.path.join(data_dir, "hardware_db.json")
    eu_path = os.path.join(data_dir, "hardware_db_eu.json")
    eu_promo_path = os.path.join(data_dir, "promos_cache_eu.json")

    with open(br_path, "r", encoding="utf-8") as f:
        br_ref_db = json.load(f)

    prev_eu = None
    if os.path.exists(eu_path):
        try:
            with open(eu_path, "r", encoding="utf-8") as f:
                prev_eu = json.load(f)
        except Exception:
            prev_eu = None

    eu_db = build_eu_database(br_ref_db, existing_eu_db=prev_eu, eu_promo_path=eu_promo_path)

    # Guard against accidental empty scrape overwriting valid cache
    if len(eu_db.get("gpus") or []) < 5 or len(eu_db.get("cpus") or []) < 5:
        print("[EU Scraper] ERROR: Insufficient GPU/CPU matches returned. Aborting overwrite.")
        sys.exit(1)

    with open(eu_path, "w", encoding="utf-8") as f:
        json.dump(eu_db, f, ensure_ascii=False, indent=2)
    print(f"[EU Scraper] Saved 100% real European database to {eu_path}")
