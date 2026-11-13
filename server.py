"""
Local HTTP Server & Live API for Site Analyze Builds.
Serves the web application on http://localhost:8080 and provides:
- GET  /api/hardware   -> returns the full hardware_db.json
- POST /api/refresh    -> scrapes fresh data from https://www.hardwarebarato.com/ and returns updated DB
- GET  /api/my-pc      -> detects current local Windows PC hardware (CPU, GPU, RAM, Motherboard) via PowerShell CIM/WMI
"""
import os
import sys
import json
import time
import base64
import socket
import argparse
import threading
import webbrowser
import subprocess
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from xml.sax.saxutils import escape as xml_escape
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote
import urllib.request
import re
import sources
import config

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "hardware_db.json")
ALERT_CONFIG_PATH = os.path.join(BASE_DIR, "data", "alert_config.json")
NOTIFIED_HISTORY_PATH = os.path.join(BASE_DIR, "data", "notified_history.json")

def detect_local_pc():
    """Detects local Windows PC hardware using PowerShell Get-CimInstance."""
    ps_script = r"""
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed
    $gpu = Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch ' Basic | Virtual | Remote | Parsec ' } | Select-Object -First 1 Name, AdapterRAM
    if (-not $gpu) { $gpu = Get-CimInstance Win32_VideoController | Select-Object -First 1 Name, AdapterRAM }
    $ram = Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum
    $ramSpeed = (Get-CimInstance Win32_PhysicalMemory | Select-Object -First 1 ConfiguredClockSpeed, Speed)
    $board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1 Manufacturer, Product
    $result = @{
        cpu_name = $cpu.Name
        cpu_cores = $cpu.NumberOfCores
        cpu_threads = $cpu.NumberOfLogicalProcessors
        gpu_name = $gpu.Name
        ram_gb = [math]::Round(($ram.Sum / 1GB))
        ram_speed = if ($ramSpeed.ConfiguredClockSpeed) { $ramSpeed.ConfiguredClockSpeed } else { $ramSpeed.Speed }
        mobo_vendor = $board.Manufacturer
        mobo_model = $board.Product
    }
    $result | ConvertTo-Json -Compress
    """
    try:
        out = subprocess.check_output(
            ["powershell", "-NoProfile", "-Command", ps_script],
            timeout=10,
            stderr=subprocess.DEVNULL
        ).decode("utf-8", errors="ignore").strip()
        return json.loads(out)
    except Exception as e:
        return {"error": str(e)}

def send_windows_native_notification(title, line1, line2="", url="", popup_box=False):
    """Fires a native Windows 10/11 OS Toast Notification (and optional Topmost Windows Popup Box) asynchronously."""
    t_esc = xml_escape(str(title or "Alerta de Oferta"))
    l1_esc = xml_escape(str(line1 or ""))
    l2_esc = xml_escape(str(line2 or ""))
    url_esc = xml_escape(str(url or ""), {'"': "&quot;", "'": "&apos;"})

    launch_attr = f'activationType="protocol" launch="{url_esc}"' if url_esc.startswith("http") else ""
    toast_xml = (
        f'<toast {launch_attr}>'
        f'<visual><binding template="ToastGeneric">'
        f'<text>{t_esc}</text>'
        f'<text>{l1_esc}</text>'
        f'<text>{l2_esc}</text>'
        f'</binding></visual>'
        f'<audio src="ms-winsoundevent:Notification.Default"/>'
        f'</toast>'
    )
    xml_b64 = base64.b64encode(toast_xml.encode("utf-8")).decode("ascii")

    popup_snippet = ""
    if popup_box:
        msg_txt = f"{title}\n\n{line1}\n{line2}" + (f"\n\nDeseja abrir a oferta no navegador?\n{url}" if url else "")
        msg_b64 = base64.b64encode(msg_txt.encode("utf-8")).decode("ascii")
        url_b64 = base64.b64encode(str(url or "").encode("utf-8")).decode("ascii")
        popup_snippet = f"""
        $msg = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{msg_b64}'))
        $u = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{url_b64}'))
        $ws = New-Object -ComObject WScript.Shell
        $btn = if ($u -match '^http') {{ 4 + 64 + 4096 }} else {{ 0 + 64 + 4096 }}
        $ans = $ws.Popup($msg, 20, 'GPU & Build Analyzer Pro — Alerta de Pechincha', $btn)
        if ($ans -eq 6 -and $u -match '^http') {{ Start-Process $u }}
        """

    ps_script = f"""
    $toastSent = $false
    try {{
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        $rawXml = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{xml_b64}'))
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($rawXml)
        $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
        $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}}\\WindowsPowerShell\\v1.0\\powershell.exe')
        $notifier.Show($toast)
        $toastSent = $true
    }} catch {{}}

    if (-not $toastSent) {{
        try {{
            Add-Type -AssemblyName System.Windows.Forms
            $balloon = New-Object System.Windows.Forms.NotifyIcon
            $balloon.Icon = [System.Drawing.SystemIcons]::Information
            $balloon.BalloonTipTitle = '{t_esc}'
            $balloon.BalloonTipText = "{l1_esc}`n{l2_esc}"
            $balloon.Visible = $true
            $balloon.ShowBalloonTip(7000)
            Start-Sleep -Seconds 2
            $balloon.Dispose()
        }} catch {{}}
    }}
    {popup_snippet}
    """
    try:
        enc = base64.b64encode(ps_script.encode("utf-16le")).decode("ascii")
        subprocess.Popen(
            ["powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", enc],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
        )
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def send_phone_alert_ntfy(topic, title, message, url="", priority="default", ring=False):
    """Sends a push notification to phone via free ntfy.sh topic.
    By default (ring=False, priority='default'), it arrives as a standard polite notification,
    respecting Do Not Disturb and normal system volume settings.
    Uses JSON POST to support full UTF-8 emojis and clean cross-platform delivery.
    """
    clean_topic = topic.strip().lstrip("/")
    if not clean_topic:
        return {"ok": False, "error": "Tópico ntfy não configurado"}

    payload = {
        "topic": clean_topic,
        "title": title[:200],
        "message": message,
        "priority": 5 if ring else (4 if priority == "urgent" else 3),
        "tags": ["bell", "mag"] if not ring else ["rotating_light", "fire"]
    }
    if ring:
        payload["call"] = "yes"
    if url and url.startswith("http"):
        payload["click"] = url
        payload["actions"] = [{"action": "view", "label": "Abrir Oferta", "url": url}]

    try:
        data_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            "https://ntfy.sh",
            data=data_bytes,
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "GPU-Analyzer-Pro/1.0"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"ok": True, "status": resp.status, "service": "ntfy"}
    except Exception as e:
        return {"ok": False, "error": str(e), "service": "ntfy"}

def send_phone_alert_whatsapp(phone, apikey, message):
    """Sends a WhatsApp text or voice call alert to phone via CallMeBot API."""
    clean_phone = "".join(c for c in phone if c.isdigit() or c == "+")
    clean_key = apikey.strip()
    if not clean_phone or not clean_key:
        return {"ok": False, "error": "Telefone ou API Key CallMeBot ausente"}
    encoded_text = quote(message)
    url = f"https://api.callmebot.com/whatsapp.php?phone={clean_phone}&text={encoded_text}&apikey={clean_key}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
            if "error" in content.lower() and "ok" not in content.lower():
                return {"ok": False, "error": content.strip()[:200], "service": "whatsapp"}
            return {"ok": True, "service": "whatsapp", "response": content.strip()[:100]}
    except Exception as e:
        return {"ok": False, "error": str(e), "service": "whatsapp"}

def send_phone_alert_email(smtp_cfg, title, body_text, url=""):
    """Sends an email notification via SMTP (Gmail, Outlook, etc.).
    Phones configured with push email will chime and show the lockscreen banner.
    """
    server_host = smtp_cfg.get("host", "").strip()
    port = int(smtp_cfg.get("port", 587))
    user = smtp_cfg.get("user", "").strip()
    password = smtp_cfg.get("password", "").strip()
    recipient = smtp_cfg.get("recipient", "").strip() or user
    use_ssl = bool(smtp_cfg.get("ssl", False) or port == 465)

    if not server_host or not user or not password or not recipient:
        return {"ok": False, "error": "Configuração SMTP incompleta (servidor, usuário, senha ou destinatário)"}

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🔥 [GPU Analyzer Pro] {title}"
    msg["From"] = user
    msg["To"] = recipient

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 12px;">
      <h2 style="color: #38bdf8; margin-top: 0;">🔥 ALERTA DE OFERTA / PECHINCHA</h2>
      <p style="font-size: 16px; font-weight: bold; color: #10b981;">{title}</p>
      <div style="background: #1e293b; padding: 15px; border-radius: 8px; margin: 15px 0; white-space: pre-wrap; font-family: monospace; font-size: 13px; line-height: 1.5;">{body_text}</div>
      {f'<p><a href="{url}" style="display: inline-block; background: #10b981; color: #022c22; font-weight: bold; padding: 10px 20px; border-radius: 6px; text-decoration: none;">Abrir Oferta Imediatamente &rarr;</a></p>' if url else ''}
      <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;">
      <p style="font-size: 11px; color: #64748b;">Notificação enviada automaticamente pelo GPU & Build Analyzer Pro.</p>
    </div>
    """
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        if use_ssl:
            with smtplib.SMTP_SSL(server_host, port, timeout=12) as s:
                s.login(user, password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(server_host, port, timeout=12) as s:
                s.starttls()
                s.login(user, password)
                s.send_message(msg)
        return {"ok": True, "service": "email"}
    except Exception as e:
        return {"ok": False, "error": str(e), "service": "email"}

def load_alert_config():
    """Loads alert preferences and target items from alert_config.json."""
    if os.path.exists(ALERT_CONFIG_PATH):
        try:
            with open(ALERT_CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "notifyEnabled": True,
        "intervalMins": 10,
        "notifyWinToast": True,
        "notifyPhone": True,
        "phoneService": "ntfy",
        "ntfyTopic": "meu_alerta_gpu_cecatto",
        "ntfyRing": False,
        "ntfyPriority": "default",
        "trigCB": True,
        "notifyMinCB": 92,
        "trigBF": True,
        "bfMode": "user_or_low",
        "trigHB": True,
        "hbMinBrl": 150,
        "hbMinPct": 8,
        "notifyLogic": "OR",
        "custom_targets": [
            {"slug": "rtx-5060", "name": "RTX 5060", "max_price": 2300},
            {"slug": "rtx-5070", "name": "RTX 5070", "max_price": 3800}
        ]
    }

def save_alert_config(cfg):
    """Saves alert preferences to alert_config.json."""
    os.makedirs(os.path.dirname(ALERT_CONFIG_PATH), exist_ok=True)
    with open(ALERT_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

def get_active_region_id():
    return (config.get_market_config().get("region_id") or "br").lower()

def get_db_path(reg_id=None):
    reg = (reg_id or get_active_region_id()).lower()
    return os.path.join(BASE_DIR, "data", "hardware_db.json" if reg == "br" else f"hardware_db_{reg}.json")

def get_promos_cache_path(reg_id=None):
    reg = (reg_id or get_active_region_id()).lower()
    return os.path.join(BASE_DIR, "data", "promos_cache.json" if reg == "br" else f"promos_cache_{reg}.json")

def get_notified_history_path(reg_id=None):
    reg = (reg_id or get_active_region_id()).lower()
    return os.path.join(BASE_DIR, "data", "notified_history.json" if reg == "br" else f"notified_history_{reg}.json")

def load_notified_history(reg_id=None):
    """Loads notified deals history, pruning items older than 48 hours."""
    fpath = get_notified_history_path(reg_id)
    if os.path.exists(fpath):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
                now = time.time()
                return {k: v for k, v in data.items() if now - v < 172800}
        except Exception:
            pass
    return {}

def save_notified_history(history, reg_id=None):
    fpath = get_notified_history_path(reg_id)
    os.makedirs(os.path.dirname(fpath), exist_ok=True)
    try:
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

def format_deal_notification(d, reasons_list=None, coup_code=None):
    """Formats a region-aware push alert using the active region's currency symbol and formatting."""
    price = d.get("price_brl", 0)
    name = d.get("matched_name") or d.get("title", "Hardware")
    coup = (coup_code or d.get("coupon_code") or d.get("coupon_info") or "").strip()
    coupon_tag = f" (c/ Cupom: {coup})" if coup else ""
    fmt_p = config.format_currency(price, short=False)
    title = f"🔥 {name} por {fmt_p}{coupon_tag}"

    reasons_line = " • ".join(reasons_list) if reasons_list else "🔥 Oferta Detectada"
    coupon_line = f"\n🎟️ Cupom: {coup}" if coup else ""

    savings_brl = d.get("savings_vs_hb_brl", 0)
    hb_price = d.get("hb_price_brl", 0)
    diff_line = f"\n📉 Economia vs Ref: -{config.format_currency(savings_brl, short=True)} (Ref: {config.format_currency(hb_price, short=True)})" if savings_brl > 0 else ""
    store_or_ch = d.get("store_name") or f"@{d.get('channel_id', 'radar')}"
    channel_line = f"\n📢 Fonte: {store_or_ch}"
    deal_title = (d.get("title") or "").strip()[:140]

    message = f"{reasons_line}{coupon_line}{diff_line}{channel_line}\n{deal_title}"
    url = d.get("buy_url") or d.get("post_url") or ""
    line1 = f"{reasons_line}{' | Cupom: ' + coup if coup else ''}"
    line2 = f"{store_or_ch} — {deal_title[:80]}"
    return title, message, line1, line2, url

def check_and_notify_deals(cfg=None, db=None, force_notify=False):
    """Evaluates latest promo deals against user alert rules and dispatches Windows and Phone alerts."""
    reg_id = get_active_region_id()
    if cfg is None:
        cfg = load_alert_config()
    if not cfg.get("notifyEnabled", True) and not force_notify:
        return {"notified": 0, "status": "disabled"}

    if db is None:
        db = convert_db_to_active_region()

    from promo_radar import scan_live_promotions
    res = scan_live_promotions(db, max_age_hours=24, region_id=reg_id)
    matched = res.get("matched_deals", [])
    history = load_notified_history(reg_id)
    notified_count = 0

    min_cb = int(cfg.get("notifyMinCB", 92))
    hb_brl = float(cfg.get("hbMinBrl", 150))
    hb_pct = float(cfg.get("hbMinPct", 8))
    trig_cb = bool(cfg.get("trigCB", True))
    trig_hb = bool(cfg.get("trigHB", True))
    targets = cfg.get("custom_targets", [])

    for d in matched:
        post_id = d.get("post_id") or f"{d.get('channel_id')}_{d.get('matched_slug')}_{round(d.get('price_brl', 0))}"
        price_key = f"{d.get('matched_slug')}_{round(d.get('price_brl', 0))}"
        if not force_notify and (post_id in history or price_key in history):
            continue

        qualifies = False
        reasons = []

        # 1. Check target list (e.g. RTX 5060 <= 2300, RTX 5070 <= 3800)
        matched_slug = d.get("matched_slug")
        price = d.get("price_brl", 999999)
        for tgt in targets:
            if tgt.get("slug") == matched_slug and price <= tgt.get("max_price", 0):
                qualifies = True
                reasons.append(f"🎯 Meta Atingida (≤ {config.format_currency(tgt['max_price'])})")
                break

        # 2. Check high CB or pechincha
        cb = d.get("cb_score", 0)
        is_pech = bool(d.get("is_pechincha"))
        if trig_cb and (cb >= min_cb or is_pech):
            qualifies = True
            if cb > 0:
                reasons.append(f"🏆 CB {cb}/100")
            if is_pech:
                reasons.append("🔥 PECHINCHA")

        # 3. Check savings vs Catalog / Base Database
        savings_brl = d.get("savings_vs_hb_brl", 0)
        hb_price = d.get("hb_price_brl", 0)
        savings_pct = (savings_brl / max(1, hb_price)) * 100 if hb_price > 0 else 0
        if trig_hb and (savings_brl >= hb_brl or savings_pct >= hb_pct):
            qualifies = True
            reasons.append(f"📉 −{config.format_currency(savings_brl, short=True)} (−{savings_pct:.0f}%) vs Database")

        if qualifies:
            title, message, line1, line2, url = format_deal_notification(d, reasons)

            # 1. Native Windows Toast Notification (Runs in background even if site is closed!)
            if cfg.get("notifyWinToast", True):
                send_windows_native_notification(title, line1, line2, url)

            # 2. Phone Push Notification (ntfy.sh / WhatsApp / Email) with emojis
            if cfg.get("notifyPhone", True):
                svc = cfg.get("phoneService", "ntfy")
                if svc == "ntfy" and cfg.get("ntfyTopic"):
                    send_phone_alert_ntfy(
                        topic=cfg["ntfyTopic"],
                        title=title,
                        message=message,
                        url=url,
                        priority=cfg.get("ntfyPriority", "default"),
                        ring=bool(cfg.get("ntfyRing", False))
                    )
                elif svc == "whatsapp" and cfg.get("waNumber") and cfg.get("waApikey"):
                    send_phone_alert_whatsapp(
                        phone=cfg["waNumber"],
                        apikey=cfg["waApikey"],
                        message=f"*{title}*\n\n{message}\n{url}"
                    )
                elif svc == "email" and cfg.get("smtp"):
                    send_phone_alert_email(
                        cfg.get("smtp", {}),
                        title,
                        message,
                        url
                    )

            history[post_id] = time.time()
            history[price_key] = time.time()
            notified_count += 1
            if force_notify:
                break

    save_notified_history(history)
    return {"notified": notified_count, "total_matched": len(matched)}

def run_sitewise_coupon_validator():
    """Runs a continuous sitewise validation of links and coupons in regional promos_cache and updates the regional DB."""
    try:
        reg_id = get_active_region_id()
        cache_path = get_promos_cache_path(reg_id)
        if not os.path.exists(cache_path):
            return
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        deals = data.get("matched_deals", [])
        if not deals:
            return

        import coupon_tracker
        results = coupon_tracker.test_deals_batch(deals, max_items=50)
        rewired, best_slug = coupon_tracker.rewire_deals_and_best_by_slug(deals, data.get("recent_feed", []))
        data["matched_deals"] = rewired
        data["best_by_slug"] = best_slug
        data["coupon_status"] = coupon_tracker.load_coupon_status()
        data["last_sitewise_test_at"] = time.strftime("%Y-%m-%d %H:%M:%S")

        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        target_db_path = get_db_path(reg_id)
        if os.path.exists(target_db_path):
            with open(target_db_path, "r", encoding="utf-8") as f:
                db = json.load(f)
            db["live_promos"] = data
            with open(target_db_path, "w", encoding="utf-8") as f:
                json.dump(db, f, ensure_ascii=False, indent=2)

        print(f"[Sitewise Validator ({reg_id.upper()})] {len(results)} ofertas/cupons verificados na base em segundo plano.")
    except Exception as e:
        print(f"[Sitewise Validator Erro] {e}")

def background_promo_monitor_thread():
    """Background daemon thread: scans for deals, verifies coupons sitewise, and dispatches notifications."""
    time.sleep(10)  # initial delay after server boot
    run_sitewise_coupon_validator()
    while True:
        try:
            cfg = load_alert_config()
            interval_mins = max(2, int(cfg.get("intervalMins", 10)))
            if cfg.get("notifyEnabled", True):
                res = check_and_notify_deals(cfg)
                if res.get("notified", 0) > 0:
                    print(f"[Background Monitor] Enviou {res['notified']} alerta(s) de novas ofertas em segundo plano!")
            run_sitewise_coupon_validator()
        except Exception as e:
            print(f"[Background Monitor Erro] {e}")
            interval_mins = 10
        time.sleep(interval_mins * 60)

def fetch_cyberpuerta_live_gpu_prices():
    """Scrapes live MXN GPU prices and direct .mx product links from Cyberpuerta.mx."""
    urls = [
        "https://www.cyberpuerta.mx/Computo-Hardware/Componentes/Tarjetas-de-Video/",
        "https://www.cyberpuerta.mx/Tarjetas-de-Video-Gigabyte/",
        "https://www.cyberpuerta.mx/Tarjetas-de-Video-AMD-Radeon/"
    ]
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    from promo_radar import GPU_MATCH_RULES
    found = {}

    for url in urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                page = resp.read().decode("utf-8", errors="ignore")
            # Match product blocks with title, href, and MXN price
            for m in re.finditer(r'<a[^>]+href="(https://www\.cyberpuerta\.mx/[^"]+)"[^>]*title="([^"]+)"[\s\S]{1,1800}?class="price"[^>]*>\s*\$([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)', page):
                prod_url, title, price_str = m.group(1), m.group(2), m.group(3)
                price_mxn = float(price_str.replace(",", ""))
                if price_mxn < 1500 or price_mxn > 95000:
                    continue
                for slug, pat in GPU_MATCH_RULES:
                    if re.search(pat, title, re.IGNORECASE):
                        if slug not in found or price_mxn < found[slug]["price"]:
                            found[slug] = {
                                "price": round(price_mxn),
                                "url": prod_url,
                                "title": title.strip(),
                                "store": "Cyberpuerta"
                            }
                        break
        except Exception as e:
            print(f"[Mexico Scraper] Warning on {url}: {e}")
    return found

def localize_item_for_mexico(it, rate, live_mx_map=None):
    """Converts fallback prices to MXN, applies live Cyberpuerta.mx prices if found, and strips 100% of Brazilian stores/coupons/links."""
    def conv_val(v):
        if v is None or not isinstance(v, (int, float)):
            return v
        return int(round(v * rate))

    for k in ("price_brl", "regular_price_brl", "installment_price_brl", "custom_price"):
        if k in it and it[k]:
            it[k] = conv_val(it[k])
    if "price_stats" in it and isinstance(it["price_stats"], dict):
        ps = it["price_stats"]
        for pk in ("target_price", "min_all_time", "min_90d", "avg_30d", "avg_90d", "median_180d", "vs_target_brl"):
            if pk in ps and ps[pk] is not None:
                ps[pk] = conv_val(ps[pk])
    if "history" in it and isinstance(it["history"], list):
        for h in it["history"]:
            if "price" in h and h["price"]:
                h["price"] = conv_val(h["price"])
            h["store"] = "Cyberpuerta / Amazon MX"

    # Strip region-locked Brazilian coupons and links completely!
    it["coupon"] = None
    it["coupon_label"] = None
    slug = it.get("slug", "")
    q_name = quote(it.get("name", slug))

    if live_mx_map and slug in live_mx_map:
        mx_hit = live_mx_map[slug]
        it["price_brl"] = mx_hit["price"]
        it["regular_price_brl"] = mx_hit["price"]
        it["store_name"] = mx_hit["store"]
        it["offer_url"] = mx_hit["url"]
        it["offer_title"] = mx_hit["title"]
        it["href"] = mx_hit["url"]
        today_str = time.strftime("%Y-%m-%d")
        if "history" in it and isinstance(it["history"], list):
            if not it["history"] or it["history"][-1].get("date") != today_str:
                it["history"].append({"date": today_str, "price": mx_hit["price"], "store": mx_hit["store"]})
    elif slug == "rx-580-8gb-ref":
        it["store_name"] = "Mercado Libre MX"
        it["offer_url"] = f"https://listado.mercadolibre.com.mx/{q_name}"
        it["href"] = it["offer_url"]
    else:
        it["store_name"] = "Cyberpuerta"
        it["offer_url"] = f"https://www.cyberpuerta.mx/index.php?cl=search&searchparam={q_name}"
        it["href"] = it["offer_url"]

def convert_db_to_active_region(raw_db=None, force_refresh=False):
    """Returns a strictly isolated regional database with zero cross-region store/coupon/link leakage."""
    market_cfg = config.get_market_config()
    active_region = (market_cfg.get("region_id") or "br").lower()
    rate = float(market_cfg.get("monetary", {}).get("exchange_rate_vs_brl", 1.0))
    curr_code = market_cfg.get("monetary", {}).get("currency_code", "BRL")
    curr_sym = market_cfg.get("monetary", {}).get("currency_symbol", "R$")

    reg_db_path = get_db_path(active_region)
    if active_region == "mx" and not force_refresh and os.path.exists(reg_db_path):
        try:
            with open(reg_db_path, "r", encoding="utf-8") as f:
                db = json.load(f)
            db["region_id"] = "mx"
            db["currency_code"] = curr_code
            db["currency_symbol"] = curr_sym
            db["exchange_rate"] = rate
            return db
        except Exception:
            pass

    if raw_db is None:
        br_path = get_db_path("br")
        if os.path.exists(br_path):
            with open(br_path, "r", encoding="utf-8") as f:
                raw_db = json.load(f)
        else:
            raw_db = sources.sync_active_source(br_path)

    db = json.loads(json.dumps(raw_db))

    if active_region == "mx":
        live_mx_gpus = fetch_cyberpuerta_live_gpu_prices()
        for group in ("gpus", "cpus", "motherboards", "rams", "psus"):
            for item in db.get(group, []):
                localize_item_for_mexico(item, rate, live_mx_gpus if group == "gpus" else None)

        # Attach ONLY Mexican promos_cache_mx.json (never Brazilian live_promos!)
        mx_promo_path = get_promos_cache_path("mx")
        if os.path.exists(mx_promo_path):
            try:
                with open(mx_promo_path, "r", encoding="utf-8") as f:
                    db["live_promos"] = json.load(f)
            except Exception:
                db["live_promos"] = None
        else:
            db["live_promos"] = None

        db["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        db["source_id"] = "cyberpuerta_mlm_mx"
        db["source_name"] = "Cyberpuerta & Mercado Libre MX"
        db["source"] = "https://www.cyberpuerta.mx/"
        try:
            with open(reg_db_path, "w", encoding="utf-8") as f:
                json.dump(db, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
    else:
        active = sources.get_active_source()
        db["source_id"] = active.source_id
        db["source_name"] = active.source_name

    db["region_id"] = active_region
    db["currency_code"] = curr_code
    db["currency_symbol"] = curr_sym
    db["exchange_rate"] = rate
    return db

class AppRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def send_json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/market-config":
            return self.send_json({
                "ok": True,
                "config": config.get_market_config(),
                "available_regions": config.list_available_regions(),
                "active_region": config.get_market_config().get("region_id", "br")
            })
        elif parsed.path == "/api/sources":
            return self.send_json({
                "ok": True,
                "sources": sources.list_sources(),
                "active_source": sources.get_active_source_id()
            })
        elif parsed.path == "/api/hardware":
            qs = parse_qs(parsed.query)
            force = qs.get("force", ["0"])[0] == "1"
            return self.send_json(convert_db_to_active_region(force_refresh=force))
        elif parsed.path == "/api/my-pc":
            return self.send_json(detect_local_pc())
        elif parsed.path == "/api/tg-raw":
            # Zero-CPU raw byte passthrough so the client browser performs 100% of DOM/regex processing
            qs = parse_qs(parsed.query)
            ch = "".join(c for c in qs.get("ch", [""])[0] if c.isalnum() or c == "_")
            q = qs.get("q", [""])[0].strip()
            if not ch:
                return self.send_json({"error": "Missing channel"}, status=400)
            url = f"https://t.me/s/{ch}" + (f"?q={quote(q)}" if q else "")
            try:
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
                )
                with urllib.request.urlopen(req, timeout=6) as resp:
                    raw = resp.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(raw)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(raw)
            except Exception as e:
                self.send_json({"error": str(e)}, status=502)
            return
        elif parsed.path == "/api/promos":
            try:
                qs = parse_qs(parsed.query)
                force = qs.get("force", ["0"])[0] == "1"
                max_age = float(qs.get("max_age", ["72"])[0])
                extra_q = [q.strip() for q in qs.get("q", []) if q.strip()]
                extra_ch = [c.strip() for c in qs.get("channels", [""])[0].split(",") if c.strip()]
                
                market_cfg = config.get_market_config()
                reg_id = qs.get("region", qs.get("market", [market_cfg.get("region_id", "br")]))[0].lower()
                
                reg_cache_file = os.path.join(BASE_DIR, "data", f"promos_cache_{reg_id}.json")
                if not os.path.exists(reg_cache_file) and reg_id == "br":
                    reg_cache_file = os.path.join(BASE_DIR, "data", "promos_cache.json")
                
                if not force and os.path.exists(reg_cache_file):
                    try:
                        with open(reg_cache_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            return self.send_json(data)
                    except Exception:
                        pass
                
                db = convert_db_to_active_region()
                from promo_radar import scan_live_promotions
                data = scan_live_promotions(
                    db,
                    extra_queries=extra_q,
                    extra_channels=extra_ch,
                    max_age_hours=max_age,
                    force=force,
                    region_id=reg_id
                )
                return self.send_json(data)
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/alert-config":
            return self.send_json(load_alert_config())
        elif parsed.path == "/api/alert-history":
            return self.send_json(load_notified_history(get_active_region_id()))
        elif parsed.path == "/api/test-coupon":
            try:
                qs = parse_qs(parsed.query)
                url = qs.get("url", [""])[0]
                code = qs.get("code", [None])[0]
                price = float(qs.get("price", ["0"])[0]) if qs.get("price") else None
                post_id = qs.get("post_id", [""])[0] or None
                import coupon_tracker
                res = coupon_tracker.test_deal_url_and_coupon(url, coupon_code=code, expected_price=price, post_id=post_id)
                return self.send_json({"ok": True, "result": res})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/coupon-status":
            try:
                import coupon_tracker
                return self.send_json({"ok": True, "status": coupon_tracker.load_coupon_status()})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/test-coupon":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                url = body.get("url", "")
                code = body.get("coupon_code") or body.get("code")
                price = body.get("price")
                import coupon_tracker
                res = coupon_tracker.test_deal_url_and_coupon(url, coupon_code=code, expected_price=price)
                return self.send_json({"ok": True, "result": res})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/mark-coupon-status":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                code = body.get("coupon_code") or body.get("code")
                post_id = body.get("post_id")
                url = body.get("url")
                status = body.get("status", "expired")
                reason = body.get("reason", "Marcado pelo usuário/cliente")
                import coupon_tracker
                res = {}
                if code:
                    res["coupon"] = coupon_tracker.record_coupon_status(code, status, reason, source="user_override")
                if post_id or url:
                    res["deal"] = coupon_tracker.record_deal_status(post_id, status, reason, source="user_override", url=url)
                return self.send_json({"ok": True, "updated": res})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/alert-config":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                save_alert_config(body)
                return self.send_json({"ok": True, "config": body})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/test-background-alert":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                cfg = load_alert_config()
                if body:
                    cfg.update(body)
                res = check_and_notify_deals(cfg, force_notify=True)
                return self.send_json({"ok": True, "result": res})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/market-config/select":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                region_id = body.get("region_id") or body.get("region")
                if not region_id or not config.set_active_region(region_id):
                    return self.send_json({"ok": False, "error": f"Região inválida: {region_id}"}, status=400)
                try:
                    import promo_radar
                    promo_radar._PROMO_CACHE["updated_at"] = 0
                    promo_radar._PROMO_CACHE["data"] = None
                except Exception:
                    pass
                return self.send_json({
                    "ok": True,
                    "active_region": region_id,
                    "config": config.get_market_config(),
                    "available_regions": config.list_available_regions()
                })
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/market-config":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                if not body:
                    return self.send_json({"ok": False, "error": "Config payload vazio"}, status=400)
                config.save_market_config(body)
                return self.send_json({"ok": True, "config": config.get_market_config()})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/sources/select":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                sid = body.get("source_id") or body.get("source")
                if not sid or not sources.set_active_source(sid):
                    return self.send_json({"ok": False, "error": f"Fonte não encontrada: {sid}"}, status=400)
                active = sources.get_active_source()
                return self.send_json({
                    "ok": True,
                    "active_source": sid,
                    "source_name": active.source_name,
                    "sources": sources.list_sources()
                })
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/refresh":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                sid = body.get("source_id") or parse_qs(parsed.query).get("source", [None])[0]
                if sid:
                    sources.set_active_source(sid)
                active_reg = get_active_region_id()
                if active_reg == "mx":
                    return self.send_json({"ok": True, "db": convert_db_to_active_region(force_refresh=True)})
                raw_db = sources.sync_active_source(get_db_path("br"))
                return self.send_json({"ok": True, "db": convert_db_to_active_region(raw_db, force_refresh=True)})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/win-notify":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                res = send_windows_native_notification(
                    title=body.get("title", "🔥 Alerta de Oferta"),
                    line1=body.get("line1", ""),
                    line2=body.get("line2", ""),
                    url=body.get("url", ""),
                    popup_box=bool(body.get("popup_box", False))
                )
                return self.send_json(res)
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/phone-notify":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                channel = body.get("channel", "ntfy")
                title = body.get("title", "🔥 Alerta de Pechincha")
                message = body.get("message", "")
                url = body.get("url", "")
                post_id = body.get("post_id") or body.get("deal_id")
                force = bool(body.get("force", False))

                # Deduplication check: prevent duplicate notifications across browser & background monitor
                if post_id and not force:
                    history = load_notified_history()
                    if post_id in history:
                        return self.send_json({"ok": True, "skipped": True, "reason": "already_notified"})

                if channel == "ntfy":
                    topic = body.get("topic", "")
                    priority = body.get("priority", "default")
                    ring = bool(body.get("ring", False))
                    res = send_phone_alert_ntfy(topic, title, message, url, priority, ring)
                elif channel == "whatsapp":
                    phone = body.get("phone", "")
                    apikey = body.get("apikey", "")
                    res = send_phone_alert_whatsapp(phone, apikey, f"*{title}*\n\n{message}\n{url}")
                elif channel == "email":
                    smtp_cfg = body.get("smtp", {})
                    res = send_phone_alert_email(smtp_cfg, title, message, url)
                else:
                    return self.send_json({"ok": False, "error": f"Canal desconhecido: {channel}"}, status=400)

                # Persist post_id to notified history on success
                if post_id and res.get("ok"):
                    history = load_notified_history()
                    history[post_id] = time.time()
                    save_notified_history(history)

                return self.send_json(res)
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        self.send_json({"error": "Not found"}, status=404)

def get_lan_ip():
    """Returns the primary local network IPv4 address of this machine."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"

def run_server(host="127.0.0.1", port=8080, open_browser=True):
    os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)
    if not os.path.exists(DB_PATH):
        from scraper import build_database
        build_database(DB_PATH)

    server = None
    actual_port = port
    for attempt in range(20):
        try:
            server = ThreadingHTTPServer((host, actual_port), AppRequestHandler)
            break
        except (PermissionError, OSError) as e:
            if getattr(e, "winerror", None) == 10049:
                print(f"[Erro] O IP '{host}' não pertence a nenhuma interface de rede ativa nesta máquina.")
                sys.exit(1)
            print(f"[Aviso] Porta {actual_port} em uso ou bloqueada pelo Windows ({e}). Tentando porta {actual_port + 1}...")
            actual_port += 1

    if server is None:
        print(f"[Erro] Não foi possível abrir nenhuma porta a partir de {port}.")
        sys.exit(1)

    lan_ip = get_lan_ip()
    print(f"\nServidor rodando em {host}:{actual_port}")
    if host == "0.0.0.0":
        browse_url = f"http://localhost:{actual_port}"
        print(f"  -> Acesso neste PC:       http://localhost:{actual_port}")
        print(f"  -> Acesso na rede (LAN):  http://{lan_ip}:{actual_port}")
    elif host in ("127.0.0.1", "localhost"):
        browse_url = f"http://localhost:{actual_port}"
        print(f"  -> Acesso local:          http://localhost:{actual_port}")
    else:
        browse_url = f"http://{host}:{actual_port}"
        print(f"  -> Acesso na rede / PC:   http://{host}:{actual_port}")

    # Inicia o monitor de promoções contínuo em segundo plano (roda mesmo com navegador fechado)
    monitor_thread = threading.Thread(target=background_promo_monitor_thread, daemon=True)
    monitor_thread.start()
    print("  -> Monitor em 2º plano:   ATIVO (Varredura e alertas mesmo com o navegador fechado!)")

    if open_browser:
        try:
            webbrowser.open(browse_url)
        except Exception:
            pass

    server.serve_forever()

def parse_args():
    parser = argparse.ArgumentParser(
        description="Run GPU & Build Analyzer Pro HTTP server."
    )
    parser.add_argument(
        "--ip", "--host", "-H",
        dest="host",
        default=None,
        help="IP/Host to bind (e.g. 0.0.0.0 for all interfaces, 192.168.20.10 for a specific LAN IP, or 127.0.0.1)"
    )
    parser.add_argument(
        "--port", "-p",
        dest="port",
        type=int,
        default=None,
        help="Port to listen on (default: 8080)"
    )
    parser.add_argument(
        "--lan",
        action="store_true",
        help="Shortcut to bind to 0.0.0.0 so other devices on your network can access it"
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not automatically open the web browser on startup"
    )
    parser.add_argument(
        "positional",
        nargs="*",
        help="Optional positional [IP] [PORT] or [PORT] or [IP:PORT]"
    )
    args = parser.parse_args()

    env_port = os.environ.get("PORT")
    default_port = int(env_port) if env_port and env_port.isdigit() else 8080
    host = args.host or ("0.0.0.0" if (args.lan or env_port) else "127.0.0.1")
    port = args.port or default_port

    for item in args.positional:
        if ":" in item:
            h, p = item.rsplit(":", 1)
            if h:
                host = h
            if p.isdigit():
                port = int(p)
        elif item.isdigit():
            port = int(item)
        else:
            host = item

    should_open = (not args.no_browser) and (not env_port)
    return host, port, should_open

if __name__ == "__main__":
    bind_host, bind_port, should_open = parse_args()
    run_server(bind_host, bind_port, open_browser=should_open)
