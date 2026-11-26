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
import concurrent.futures
import webbrowser
from datetime import datetime, timezone
import subprocess
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from xml.sax.saxutils import escape as xml_escape
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote
import urllib.request
import re
import unicodedata
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

def get_alert_config_path(reg_id=None):
    reg = (reg_id or get_active_region_id()).lower()
    return os.path.join(BASE_DIR, "data", "alert_config.json" if reg == "br" else f"alert_config_{reg}.json")

DEFAULT_NOTIFY_CATEGORIES = {
    "gpu": True,
    "cpu": True,
    "ram": True,
    "mobo": True,
    "psu": True,
    "laptop": False,
    "smartphone": False,
    "peripheral": False,
    "air_fryer": False,
    "diapers": False,
    "misc_custom": False,
}

DEFAULT_SPEC_FILTERS = {
    "mobo": {},
    "ram": {},
    "cpu": {},
    "gpu": {},
    "psu": {},
    "laptop": {},
    "smartphone": {},
    "peripheral": {},
    "air_fryer": {},
    "diapers": {},
    "misc_custom": {},
}

_PHONE_NOISE_TOKENS = {
    "celular", "smartphone", "tela", "dual", "chip", "sim", "esim", "5g", "4g",
    "nfc", "ram", "gb", "tb", "de", "com", "para", "sem", "em", "no", "na",
    "preto", "azul", "branco", "verde", "prata", "titanio", "grafite", "cinza",
    "rosa", "dourado", "roxo", "laranja", "amarelo", "vermelho", "black", "white",
}
_PHONE_TIER_WORDS = ("ultra", "pro", "max", "plus", "fe", "lite", "neo", "fusion")


def _strip_accents_lower(text):
    norm = unicodedata.normalize("NFD", str(text or ""))
    return "".join(ch for ch in norm if unicodedata.category(ch) != "Mn").lower()


def _normalize_phone_tokens(text):
    low = _strip_accents_lower(text)
    tokens = []
    for tok in re.findall(r"[a-z0-9]+", low):
        if tok in _PHONE_NOISE_TOKENS:
            continue
        if re.match(r"^(?:64|128|256|512|1024)(?:gb|tb)?$", tok) or re.match(r"^(?:4|6|8|12|16|24)gb$", tok):
            continue
        tokens.append(tok)
    return tokens


def _infer_phone_brand_server(deal, cat_item, specs, txt):
    b = str(specs.get("brand") or deal.get("brand") or (cat_item or {}).get("brand") or "").strip()
    if b:
        return b
    low = _strip_accents_lower(txt)
    if re.search(r"\b(iphone|apple)\b", low):
        return "Apple"
    if re.search(r"\b(samsung|galaxy)\b", low):
        return "Samsung"
    if re.search(r"\b(xiaomi|poco|redmi)\b", low):
        return "Xiaomi"
    if re.search(r"\b(motorola|moto\s*[ge]\d+|edge\s*[56]0)\b", low):
        return "Motorola"
    if re.search(r"\b(google\s*pixel|pixel\s*(?:8|9|10))\b", low):
        return "Google"
    if re.search(r"\brealme\b", low):
        return "Realme"
    return ""


_PERIPH_NOISE_TOKENS = {
    "mouse", "teclado", "headset", "fone", "ouvido", "gamer", "gaming", "sem",
    "fio", "wireless", "bluetooth", "usb", "rgb", "preto", "branco", "rosa",
    "azul", "vermelho", "cinza", "mecanico", "optico", "magnetico", "para", "pc",
    "com", "de", "e",
}


def _infer_peripheral_brand_server(deal, cat_item, specs, txt):
    b = str(specs.get("brand") or deal.get("brand") or (cat_item or {}).get("brand") or "").strip()
    if b:
        return b
    low = _strip_accents_lower(txt)
    for cand in ("Logitech", "Razer", "HyperX", "Redragon", "Corsair", "SteelSeries", "JBL", "Havit", "Fifine", "Attack Shark", "Fallen", "Keychron", "Akko", "Aula", "Darmoshark", "Dell", "Sony", "Sennheiser", "Edifier", "QCY"):
        if cand.lower() in low:
            return cand
    return ""


def _peripheral_deal_matches_model(deal, cat_item, model_entry):
    if isinstance(model_entry, dict):
        m_slug = str(model_entry.get("slug") or "").strip().lower()
        m_name = str(model_entry.get("name") or "").strip()
    else:
        m_slug = ""
        m_name = str(model_entry or "").strip()

    if m_slug and str(deal.get("matched_slug") or "").strip().lower() == m_slug:
        return True

    raw_tokens = re.findall(r"[a-z0-9]+", _strip_accents_lower(m_name or m_slug.replace("-", " ")))
    core_tokens = [t for t in raw_tokens if t not in _PERIPH_NOISE_TOKENS and (len(t) >= 2 or t.isdigit())] or raw_tokens
    if not core_tokens:
        return False

    combined_raw = f"{deal.get('title') or ''} {deal.get('head_text') or ''} {deal.get('matched_name') or ''} {(cat_item or {}).get('name') or ''}"
    deal_tokens = set(re.findall(r"[a-z0-9]+", _strip_accents_lower(combined_raw)))
    return all(t in deal_tokens for t in core_tokens)


def _matches_any_keyword_phrase(hay_text, kw_val):
    if isinstance(kw_val, (list, tuple)):
        phrases = [str(x).strip() for x in kw_val if str(x).strip()]
    else:
        phrases = [p.strip() for p in re.split(r"[,;\n]+", str(kw_val or "")) if p.strip()]
    if not phrases:
        return True
    hay_norm = _strip_accents_lower(hay_text)
    for phr in phrases:
        words = [w for w in re.findall(r"[a-z0-9]+", _strip_accents_lower(phr)) if w]
        if words and all(w in hay_norm for w in words):
            return True
    return False


def _smartphone_deal_matches_model(deal, cat_item, model_entry):
    if isinstance(model_entry, dict):
        m_slug = str(model_entry.get("slug") or "").strip().lower()
        m_name = str(model_entry.get("name") or "").strip()
    else:
        m_slug = ""
        m_name = str(model_entry or "").strip()

    if m_slug and str(deal.get("matched_slug") or "").strip().lower() == m_slug:
        return True

    target_tokens = _normalize_phone_tokens(m_name or m_slug.replace("-", " "))
    if not target_tokens:
        return False

    title_raw = str(deal.get("title") or "")
    matched_raw = str(deal.get("matched_name") or (cat_item or {}).get("name") or "")
    combined_raw = f"{title_raw} {deal.get('head_text') or ''} {matched_raw}"
    deal_tokens = set(_normalize_phone_tokens(combined_raw))

    # Strip brand token when checking model core match? Keep brand + model, e.g. ['samsung', 'galaxy', 's25', 'ultra']
    # Wait: Telegram titles often say "Galaxy S25 Ultra" omitting "Samsung", so allow optional leading brand omit.
    brand_words = {"samsung", "apple", "xiaomi", "motorola", "realme", "google"}
    core_target = [t for t in target_tokens if t not in brand_words] or target_tokens
    if not all(t in deal_tokens for t in core_target):
        return False

    # Guard against matching "Galaxy S25 Ultra" when user asked only for "Galaxy S25" (and vice versa)
    deal_title_low = _strip_accents_lower(title_raw)
    target_set = set(target_tokens)
    for tw in _PHONE_TIER_WORDS:
        deal_has_tier = bool(re.search(rf"\b{tw}\b", deal_title_low))
        if deal_has_tier and tw not in target_set:
            return False
    return True


def _with_alert_pref_defaults(cfg_dict):
    cfg = dict(cfg_dict or {})
    merged_cats = dict(DEFAULT_NOTIFY_CATEGORIES)
    if isinstance(cfg.get("notifyCategories"), dict):
        for k, v in cfg["notifyCategories"].items():
            if k in merged_cats and isinstance(v, bool):
                merged_cats[k] = v
    cfg["notifyCategories"] = merged_cats

    merged_specs = {k: dict(v) for k, v in DEFAULT_SPEC_FILTERS.items()}
    if isinstance(cfg.get("specFilters"), dict):
        for k, v in cfg["specFilters"].items():
            if k in merged_specs and isinstance(v, dict):
                merged_specs[k] = dict(v)
    cfg["specFilters"] = merged_specs
    return cfg


def load_alert_config(reg_id=None):
    """Loads alert preferences and target items from alert_config[_<reg>].json."""
    reg = (reg_id or get_active_region_id()).lower()
    fpath = get_alert_config_path(reg)
    if os.path.exists(fpath):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                return _with_alert_pref_defaults(json.load(f))
        except Exception:
            pass

    reg_cfg_path = get_alert_config_path(reg)
    base_cfg = {}
    for cand_path in (reg_cfg_path, ALERT_CONFIG_PATH):
        if os.path.exists(cand_path):
            try:
                with open(cand_path, "r", encoding="utf-8") as f:
                    base_cfg = json.load(f)
                if base_cfg:
                    break
            except Exception:
                pass

    if reg == "mx":
        return _with_alert_pref_defaults(base_cfg if os.path.exists(reg_cfg_path) else {
            "notifyEnabled": base_cfg.get("notifyEnabled", True),
            "intervalMins": base_cfg.get("intervalMins", 10),
            "notifyWinToast": base_cfg.get("notifyWinToast", True),
            "notifyPhone": base_cfg.get("notifyPhone", True),
            "phoneService": base_cfg.get("phoneService", "ntfy"),
            "ntfyTopic": base_cfg.get("ntfyTopic", "meu_alerta_gpu_cecatto"),
            "ntfyRing": base_cfg.get("ntfyRing", False),
            "ntfyPriority": base_cfg.get("ntfyPriority", "default"),
            "trigCB": True,
            "notifyMinCB": 90,
            "trigBF": True,
            "bfMode": "user_or_low",
            "trigHB": True,
            "hbMinBrl": 600,
            "hbMinPct": 8,
            "notifyLogic": "OR",
            "custom_targets": [
                {"slug": "rtx-5060", "name": "RTX 5060", "max_price": 8500},
                {"slug": "rtx-5070", "name": "RTX 5070", "max_price": 14000},
                {"slug": "rtx-4060", "name": "RTX 4060", "max_price": 6800}
            ]
        })
    if reg == "eu":
        return _with_alert_pref_defaults(base_cfg if os.path.exists(reg_cfg_path) else {
            "notifyEnabled": base_cfg.get("notifyEnabled", True),
            "intervalMins": base_cfg.get("intervalMins", 10),
            "notifyWinToast": base_cfg.get("notifyWinToast", True),
            "notifyPhone": base_cfg.get("notifyPhone", True),
            "phoneService": base_cfg.get("phoneService", "ntfy"),
            "ntfyTopic": base_cfg.get("ntfyTopic", "meu_alerta_gpu_cecatto"),
            "ntfyRing": base_cfg.get("ntfyRing", False),
            "ntfyPriority": base_cfg.get("ntfyPriority", "default"),
            "trigCB": True,
            "notifyMinCB": 90,
            "trigBF": True,
            "bfMode": "user_or_low",
            "trigHB": True,
            "hbMinBrl": 25,
            "hbMinPct": 8,
            "notifyLogic": "OR",
            "custom_targets": [
                {"slug": "rtx-5060", "name": "RTX 5060", "max_price": 320},
                {"slug": "rtx-5070", "name": "RTX 5070", "max_price": 550},
                {"slug": "rx-9060-xt-16gb", "name": "RX 9060 XT 16GB", "max_price": 380}
            ]
        })
    return _with_alert_pref_defaults(base_cfg or {
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
    })

def save_alert_config(cfg, reg_id=None):
    """Saves alert preferences to alert_config[_<reg>].json."""
    cfg = _with_alert_pref_defaults(cfg)
    reg = (reg_id or cfg.get("region_id") or get_active_region_id()).lower()
    fpath = get_alert_config_path(reg)
    os.makedirs(os.path.dirname(fpath), exist_ok=True)
    with open(fpath, "w", encoding="utf-8") as f:
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

def format_deal_notification(d, reasons_list=None, coup_code=None, region_id=None):
    """Formats a region-aware push alert using the active region's currency symbol and formatting."""
    reg = (region_id or d.get("region_id") or get_active_region_id()).lower()
    price = d.get("price_brl", 0)
    name = d.get("matched_name") or d.get("title", "Hardware")
    coup = (coup_code or d.get("coupon_code") or d.get("coupon_info") or "").strip()
    coupon_word = "Cupón" if reg == "mx" else ("Code" if reg == "eu" else "Cupom")
    coupon_tag = f" (c/ {coupon_word}: {coup})" if coup else ""
    fmt_p = config.format_currency(price, short=False, region_id=reg)
    prefix = "[MX] 🇲🇽 " if reg == "mx" else ("[EU] 🇪🇺 " if reg == "eu" else "🔥 ")
    title = f"{prefix}{name} — {fmt_p}{coupon_tag}" if reg == "eu" else f"{prefix}{name} por {fmt_p}{coupon_tag}"

    reasons_line = " • ".join(reasons_list) if reasons_list else ("🔥 Oferta Detectada" if reg == "br" else ("🔥 EU Deal Detected" if reg == "eu" else "🔥 Oferta en México"))
    bf_banner = (d.get("bf_alert_banner") or "").strip()
    bf_banner_line = f"{bf_banner}\n" if bf_banner else ""
    mem_warn_text = "⚠️ Conferir se é DDR4 ou DDR5 no anúncio!" if d.get("unverified_memory_type") else ""
    mem_warn_line = f"\n{mem_warn_text}" if (mem_warn_text and "DDR4/DDR5" not in reasons_line) else ""
    coupon_line = f"\n🎟️ {coupon_word}: {coup}" if coup else ""

    savings_brl = d.get("savings_vs_hb_brl", 0)
    hb_price = d.get("hb_price_brl", 0)
    ref_word = "Ahorro vs Ref" if reg == "mx" else ("Saving vs Ref" if reg == "eu" else "Economia vs Ref")
    diff_line = f"\n📉 {ref_word}: -{config.format_currency(savings_brl, short=True, region_id=reg)} (Ref: {config.format_currency(hb_price, short=True, region_id=reg)})" if savings_brl > 0 else ""
    store_or_ch = d.get("store_name") or f"@{d.get('channel_id', 'radar')}"
    channel_word = "Fuente" if reg == "mx" else ("Source" if reg == "eu" else "Fonte")
    channel_line = f"\n📢 {channel_word}: {store_or_ch}"
    deal_title = (d.get("title") or "").strip()[:140]

    message = f"{bf_banner_line}{reasons_line}{mem_warn_line}{coupon_line}{diff_line}{channel_line}\n{deal_title}"
    url = d.get("buy_url") or d.get("post_url") or ""
    extra_flag = f" | {mem_warn_text}" if (mem_warn_text and "DDR4/DDR5" not in reasons_line) else ""
    line1 = f"{(bf_banner + ' • ') if bf_banner else ''}{reasons_line}{extra_flag}{' | ' + coupon_word + ': ' + coup if coup else ''}"
    line2 = f"{store_or_ch} — {deal_title[:80]}"
    return title, message, line1, line2, url

def _dispatch_alert_channels(cfg, deal_dict, reasons, reg_id):
    """Formats and sends a deal notification across enabled Windows & Phone push channels."""
    title, message, line1, line2, url = format_deal_notification(deal_dict, reasons, region_id=reg_id)
    if cfg.get("notifyWinToast", True):
        send_windows_native_notification(title, line1, line2, url)
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
            send_phone_alert_email(cfg.get("smtp", {}), title, message, url)


def _get_item_avg_30d(it):
    """Returns 30-day average price for a catalog item from price_stats or history."""
    if not it:
        return 0.0
    ps = it.get("price_stats") or {}
    if ps.get("avg_30d"):
        return float(ps["avg_30d"])
    hist = [float(h["price"]) for h in (it.get("history") or [])[-30:] if h.get("price")]
    return (sum(hist) / len(hist)) if hist else 0.0


def _get_bf_pricing_alert_tag(price, it):
    """Evaluates whether `price` reaches Black Friday pricing vs item history/range and returns (is_bf, banner, reason)."""
    if not it or price <= 0:
        return False, None, None
    hist = sorted(it.get("history") or [], key=lambda h: h.get("date", ""))
    prices = [float(h["price"]) for h in hist if h.get("price")]
    cur_p = float(it.get("price_brl") or 0)
    all_min = min(prices) if prices else (float((it.get("price_stats") or {}).get("min_all_time") or 0) or cur_p)

    # Mirror bfAnalyzeItem & bfExpectedRange calculations
    from datetime import datetime
    cur_year = datetime.now().year
    last_y = cur_year - 1
    pre = [float(h["price"]) for h in hist if f"{last_y}-09-15" <= (h.get("date") or "") <= f"{last_y}-10-31" and h.get("price")]
    bf = [float(h["price"]) for h in hist if f"{last_y}-11-01" <= (h.get("date") or "") <= f"{last_y}-12-02" and h.get("price")]
    disc = 0.09
    if pre and bf:
        pre_avg = sum(pre) / len(pre)
        bf_min = min(bf)
        if pre_avg > 0:
            disc = max(0.06, max(0.0, 1.0 - bf_min / pre_avg))

    last45 = [float(h["price"]) for h in hist[-45:] if h.get("price")]
    recent_avg = (sum(last45) / len(last45)) if last45 else cur_p
    anchor = (cur_p * 0.55 + recent_avg * 0.45) if (cur_p and recent_avg) else (cur_p or recent_avg or 1000.0)
    bf_low = round(max(anchor * (1.0 - min(0.20, disc * 1.20)), max(anchor * 0.80, min(all_min * 1.15, anchor * 0.85) if all_min else anchor * 0.82)))
    bf_high = round(max(anchor * (1.0 - disc), anchor * (1.0 - disc * 0.50)))

    if all_min > 0 and price <= all_min * 1.01:
        return True, "🚨🔥 PREÇO DE BLACK FRIDAY — MÍNIMO HISTÓRICO! 🔥🚨", f"🔥 Mín. Histórico BF (≤ R$ {all_min:,.0f})"
    if bf_low > 0 and price <= bf_low:
        return True, "🚨🔥 PREÇO DE BLACK FRIDAY (PISO BF)! 🔥🚨", f"🏷️ Piso BF (≤ R$ {bf_low:,.0f})"
    if bf_high > 0 and price <= bf_high:
        return True, "⚡🔥 PREÇO DE BLACK FRIDAY (NA FAIXA)! 🔥⚡", f"🏷️ Faixa BF (≤ R$ {bf_high:,.0f})"
    return False, None, None


def _psu_cert_tier(cert_str):
    low = (cert_str or "").lower()
    if "platinum" in low or "titanium" in low:
        return 3
    if "gold" in low:
        return 2
    if "bronze" in low:
        return 1
    return 0


def _deal_matches_alert_prefs(deal, cfg, catalog_by_slug=None):
    """Returns True if `deal` passes user's enabled categories and per-category hardware spec filters."""
    if not isinstance(deal, dict):
        return False
    deal["unverified_memory_type"] = False
    cfg = _with_alert_pref_defaults(cfg)
    kind = (deal.get("matched_kind") or "gpu").lower().strip()
    if kind not in ("gpu", "cpu", "ram", "mobo", "psu", "laptop", "smartphone", "peripheral", "air_fryer", "diapers"):
        kind = "misc_custom"
    cats = cfg.get("notifyCategories") or DEFAULT_NOTIFY_CATEGORIES
    if not cats.get(kind, kind not in ("laptop", "smartphone", "peripheral", "air_fryer", "diapers", "misc_custom")):
        return False

    sf = (cfg.get("specFilters") or {}).get(kind) or {}
    if not sf:
        return True

    max_price = sf.get("max_price")
    if max_price and float(max_price) > 0:
        if float(deal.get("price_brl") or 0) > float(max_price):
            return False

    slug = deal.get("matched_slug") or ""
    cat_entry = (catalog_by_slug or {}).get(slug)
    cat_item = cat_entry[1] if (cat_entry and len(cat_entry) > 1) else {}
    specs = dict(deal.get("item_specs") or {})
    post_txt = f"{deal.get('title') or ''} {deal.get('head_text') or ''}".strip()
    txt = f"{post_txt} {cat_item.get('name') or ''}".strip()
    is_direct = (deal.get("channel_id") == "catalogo_direto") or bool(deal.get("_isStoreDirect"))

    parsed_mobo_post = {}
    try:
        import promo_radar
        if kind == "mobo":
            parsed_mobo_post = promo_radar.extract_mobo_specs_from_text(post_txt)
            parsed = promo_radar.extract_mobo_specs_from_text(txt)
            for fk in ("socket", "memory_type", "chipset", "brand"):
                if not specs.get(fk) and parsed.get(fk):
                    if fk == "memory_type" and specs.get("memory_type_ambiguous"):
                        continue
                    specs[fk] = parsed[fk]
        elif kind == "psu":
            parsed = promo_radar.extract_psu_specs_from_text(txt)
            for fk in ("watts", "modularity", "cert", "brand"):
                if not specs.get(fk) and parsed.get(fk):
                    specs[fk] = parsed[fk]
    except Exception:
        pass

    if kind == "mobo":
        sock = str(specs.get("socket") or parsed_mobo_post.get("socket") or cat_item.get("socket") or "").strip().upper()
        req_sockets = [str(s).strip().upper() for s in (sf.get("sockets") or []) if str(s).strip()]
        if req_sockets:
            if not sock or sock not in req_sockets:
                return False
        req_mems = [str(m).strip().upper() for m in (sf.get("memory_types") or []) if str(m).strip()]
        if req_mems:
            if is_direct:
                mem = str(specs.get("memory_type") or cat_item.get("memory_type") or parsed_mobo_post.get("memory_type") or "").strip().upper()
            elif sock in ("AM4", "AM5", "LGA1851"):
                mem = str(parsed_mobo_post.get("memory_type") or specs.get("memory_type") or cat_item.get("memory_type") or "").strip().upper()
            else:
                # Dual-DDR socket (e.g. LGA1700) on Telegram/social listing: do NOT rely on fuzzy catalog DDR5 fallback
                if parsed_mobo_post.get("memory_type"):
                    mem = str(parsed_mobo_post["memory_type"]).strip().upper()
                elif not specs.get("memory_type_ambiguous"):
                    mem = str(specs.get("memory_type") or "").strip().upper()
                else:
                    mem = ""

            if mem:
                if mem not in req_mems:
                    return False
            else:
                allow_ambig = sf.get("allow_ambiguous_mem", True) is not False
                if allow_ambig:
                    deal["unverified_memory_type"] = True
                else:
                    return False
        chip_q = (sf.get("chipset_query") or "").strip().lower()
        if chip_q:
            tokens = [t.strip() for t in re.split(r"[,;\s]+", chip_q) if t.strip()]
            hay = f"{specs.get('chipset', '')} {txt} {slug}".lower()
            if tokens and not any(tok in hay for tok in tokens):
                return False

    elif kind == "ram":
        req_mems = [str(m).strip().upper() for m in (sf.get("memory_types") or []) if str(m).strip()]
        if req_mems:
            mem = str(specs.get("memory_type") or cat_item.get("memory_type") or "").strip().upper()
            if not mem:
                m = re.search(r"\b(ddr4|ddr5)\b", txt, re.I)
                mem = m.group(1).upper() if m else ""
            if not mem or mem not in req_mems:
                return False
        min_cap = int(sf.get("min_capacity_gb") or 0)
        if min_cap > 0:
            cap = int(specs.get("capacity_gb") or cat_item.get("capacity_gb") or 0)
            if not cap:
                m_c = re.search(r"\b(8|16|32|48|64|96|128)\s*gb\b", txt, re.I)
                cap = int(m_c.group(1)) if m_c else 0
            if cap < min_cap:
                return False
        min_spd = int(sf.get("min_speed_mtps") or 0)
        if min_spd > 0:
            spd = int(specs.get("speed_mtps") or cat_item.get("speed_mtps") or 0)
            if not spd:
                m_s = re.search(r"\b([2-9]\d{3})\s*(?:mhz|mt/?s)?\b", txt, re.I)
                spd = int(m_s.group(1)) if m_s else 0
            if spd < min_spd:
                return False

    elif kind == "cpu":
        req_sockets = [str(s).strip().upper() for s in (sf.get("sockets") or []) if str(s).strip()]
        if req_sockets:
            sock = str(specs.get("socket") or cat_item.get("socket") or "").strip().upper()
            if not sock or sock not in req_sockets:
                return False
        req_brands = [str(b).strip().lower() for b in (sf.get("brands") or []) if str(b).strip()]
        if req_brands:
            name_l = txt.lower()
            brand = (specs.get("brand") or ("amd" if ("ryzen" in name_l or "threadripper" in name_l) else ("intel" if ("core" in name_l or "xeon" in name_l or "intel" in name_l) else ""))).lower()
            if not brand or brand not in req_brands:
                return False

    elif kind == "gpu":
        req_brands = [str(b).strip().lower() for b in (sf.get("brands") or []) if str(b).strip()]
        if req_brands:
            brand = str(specs.get("brand") or cat_item.get("brand") or "").strip().lower()
            if not brand:
                if "rtx" in txt.lower() or "geforce" in txt.lower():
                    brand = "nvidia"
                elif "radeon" in txt.lower() or "rx " in txt.lower():
                    brand = "amd"
                elif "arc " in txt.lower():
                    brand = "intel"
            if not brand or brand not in req_brands:
                return False
        min_vram = int(sf.get("min_vram_gb") or 0)
        if min_vram > 0:
            vram = int(specs.get("vram_gb") or cat_item.get("vram_gb") or 0)
            if vram < min_vram:
                return False

    elif kind == "psu":
        min_watts = int(sf.get("min_watts") or 0)
        if min_watts > 0:
            watts = int(specs.get("watts") or cat_item.get("watts") or 0)
            if watts < min_watts:
                return False
        req_mods = [str(m).strip().lower() for m in (sf.get("modularity") or []) if str(m).strip()]
        if req_mods:
            mod = str(specs.get("modularity") or cat_item.get("modularity") or "").strip().lower()
            if not mod or mod not in req_mods:
                return False
        min_cert = (sf.get("min_cert") or "").strip().lower()
        if min_cert:
            req_tier = _psu_cert_tier(min_cert)
            certs = cat_item.get("certs") or []
            cert_str = str(specs.get("cert") or (certs[0] if certs else "") or deal.get("title") or "")
            if _psu_cert_tier(cert_str) < req_tier:
                return False

    elif kind == "laptop":
        min_ram = int(sf.get("min_ram_gb") or 0)
        if min_ram > 0:
            ram_gb = int(specs.get("ram_gb") or cat_item.get("ram_gb") or 0)
            if ram_gb < min_ram:
                return False
        if sf.get("dedicated_gpu_only"):
            is_dgpu = bool(specs.get("gpu_is_dedicated") or cat_item.get("gpu_is_dedicated"))
            if not is_dgpu:
                return False

    elif kind == "smartphone":
        deal_brand = _infer_phone_brand_server(deal, cat_item, specs, txt).lower()
        req_brands = [str(b).strip().lower() for b in (sf.get("brands") or []) if str(b).strip()]
        req_models = [m for m in (sf.get("models") or []) if (isinstance(m, dict) and (m.get("slug") or m.get("name"))) or (isinstance(m, str) and m.strip())]

        if req_models:
            model_brands = set()
            for m in req_models:
                mb = _infer_phone_brand_server({"brand": m.get("brand", "")} if isinstance(m, dict) else {}, None, {}, m.get("name", "") if isinstance(m, dict) else str(m)).lower()
                if mb:
                    model_brands.add(mb)
            open_brands = [b for b in req_brands if b not in model_brands]
            brand_open_hit = bool(deal_brand and deal_brand in open_brands)
            model_hit = any(_smartphone_deal_matches_model(deal, cat_item, m) for m in req_models)
            if not (brand_open_hit or model_hit):
                return False
        elif req_brands:
            if not deal_brand or deal_brand not in req_brands:
                return False

    elif kind == "peripheral":
        req_sub = [str(s).strip().lower() for s in (sf.get("sub_kinds") or []) if str(s).strip()]
        sub_k = str(specs.get("sub_kind") or deal.get("peripheral_kind") or cat_item.get("kind") or "").strip().lower()
        if not sub_k:
            low_t = _strip_accents_lower(txt)
            if re.search(r"\b(mouse|superlight|viper|deathadder)\b", low_t):
                sub_k = "mouse"
            elif re.search(r"\b(teclado|keyboard|keychron|kumara|fizz)\b", low_t):
                sub_k = "keyboard"
            elif re.search(r"\b(headset|fone|cloud\s*(?:ii|iii|stinger|alpha)|blackshark)\b", low_t):
                sub_k = "headset"
        if req_sub and (not sub_k or sub_k not in req_sub):
            return False
        if sf.get("wireless_only"):
            is_wl = bool(specs.get("wireless") or deal.get("is_wireless") or cat_item.get("is_wireless") or re.search(r"\b(sem\s*fio|wireless|lightspeed|2\.4\s*g|bluetooth|tri-?mode|superlight)\b", txt, re.I))
            if not is_wl:
                return False
        if sf.get("gamer_only"):
            is_gm = bool(specs.get("gamer") or deal.get("is_gamer") or re.search(r"\b(gamer|gaming|hero\s*25k|paw\s*3\d{3}|hall\s*effect|magn[ée]tic|mec[âa]nic|rgb|superlight|cloud|blackshark|zeus|kumara)\b", txt, re.I))
            if not is_gm:
                return False
        req_brands = [str(b).strip().lower() for b in (sf.get("brands") or []) if str(b).strip()]
        req_models = [m for m in (sf.get("models") or []) if (isinstance(m, dict) and (m.get("slug") or m.get("name"))) or (isinstance(m, str) and m.strip())]
        deal_brand = _infer_peripheral_brand_server(deal, cat_item, specs, txt).lower()
        if req_models:
            model_brands = set()
            for m in req_models:
                mb = _infer_peripheral_brand_server({"brand": m.get("brand", "")} if isinstance(m, dict) else {}, None, {}, m.get("name", "") if isinstance(m, dict) else str(m)).lower()
                if mb:
                    model_brands.add(mb)
            open_brands = [b for b in req_brands if b not in model_brands]
            if not ((deal_brand and deal_brand in open_brands) or any(_peripheral_deal_matches_model(deal, cat_item, m) for m in req_models)):
                return False
        elif req_brands:
            if not deal_brand or deal_brand not in req_brands:
                return False

    elif kind == "air_fryer":
        af_specs = dict(deal.get("misc_specs") or (cat_item.get("specs") if isinstance(cat_item, dict) else {}) or specs)
        if not af_specs or ("liters" not in af_specs and "is_oven" not in af_specs):
            try:
                import misc_scraper
                af_specs = misc_scraper.parse_air_fryer_specs(txt, float(deal.get("price_brl") or 0))
            except Exception:
                af_specs = {}
        req_brands = [_strip_accents_lower(b) for b in (sf.get("brands") or []) if str(b).strip()]
        if req_brands:
            b_val = _strip_accents_lower(af_specs.get("brand") or deal.get("brand") or cat_item.get("brand") or "")
            if not any(rb in b_val or rb in _strip_accents_lower(txt) for rb in req_brands):
                return False
        fmt = str(sf.get("format") or "").strip().lower()
        if fmt == "oven" and not af_specs.get("is_oven"):
            return False
        if fmt == "cesto" and af_specs.get("is_oven"):
            return False
        if sf.get("digital_only") and not af_specs.get("is_digital"):
            return False
        min_l = float(sf.get("min_liters") or 0)
        liters = float(af_specs.get("liters") or 0)
        if min_l > 0 and liters < min_l:
            return False
        max_ppl = float(sf.get("max_price_per_liter") or 0)
        ppl = float(af_specs.get("price_per_liter") or (float(deal.get("price_brl") or 0) / liters if liters > 0 else 0))
        if max_ppl > 0 and (ppl <= 0 or ppl > max_ppl):
            return False
        kw = str(sf.get("keyword") or "").strip()
        if kw and not _matches_any_keyword_phrase(txt, kw):
            return False

    elif kind == "diapers":
        dp_specs = dict(deal.get("misc_specs") or (cat_item.get("specs") if isinstance(cat_item, dict) else {}) or specs)
        if not dp_specs or ("price_per_unit" not in dp_specs and "units" not in dp_specs):
            try:
                import misc_scraper
                dp_specs = misc_scraper.parse_diaper_specs(txt, float(deal.get("price_brl") or 0))
            except Exception:
                dp_specs = {}
        req_brands = [_strip_accents_lower(b) for b in (sf.get("brands") or []) if str(b).strip()]
        if req_brands:
            b_val = _strip_accents_lower(dp_specs.get("brand") or deal.get("brand") or cat_item.get("brand") or "")
            if not any(rb in b_val or rb in _strip_accents_lower(txt) for rb in req_brands):
                return False
        req_sizes = [str(sz).strip().upper() for sz in (sf.get("sizes") or []) if str(sz).strip()]
        if req_sizes:
            d_sz = str(dp_specs.get("size") or "").strip().upper()
            if not d_sz or d_sz not in req_sizes:
                return False
        style_pref = str(sf.get("style") or "").strip().lower()
        if style_pref == "pants" and not dp_specs.get("is_pants"):
            return False
        if style_pref == "fita" and dp_specs.get("is_pants"):
            return False
        max_ppu = float(sf.get("max_price_per_unit") or 0)
        ppu = float(dp_specs.get("price_per_unit") or 0)
        if max_ppu > 0 and (ppu <= 0 or ppu > max_ppu):
            return False
        kw = str(sf.get("keyword") or "").strip()
        if kw and not _matches_any_keyword_phrase(txt, kw):
            return False

    elif kind == "misc_custom":
        kws = sf.get("keywords")
        has_kws = bool(kws) if isinstance(kws, (list, tuple)) else bool(str(kws or "").strip())
        if not has_kws:
            return False
        if not _matches_any_keyword_phrase(txt, kws):
            return False

    return True


def check_and_notify_deals(cfg=None, db=None, force_notify=False, region_id=None, fast_poll=False):
    """Evaluates latest promo deals against user alert rules and dispatches Windows and Phone alerts with strict regional isolation."""
    reg_id = (region_id or (cfg.get("region_id") if cfg else None) or get_active_region_id()).lower()
    if cfg is None:
        cfg = load_alert_config(reg_id)
    else:
        cfg = _with_alert_pref_defaults(cfg)
    if not cfg.get("notifyEnabled", True) and not force_notify:
        return {"notified": 0, "status": "disabled", "region_id": reg_id}

    if db is None:
        db = convert_db_to_active_region(force_refresh=False)
        if db.get("region_id") != reg_id:
            reg_db_path = get_db_path(reg_id)
            if os.path.exists(reg_db_path):
                try:
                    with open(reg_db_path, "r", encoding="utf-8") as f:
                        db = json.load(f)
                except Exception:
                    pass

    catalog_by_slug = {}
    for grp, kind_name in (("gpus", "gpu"), ("cpus", "cpu"), ("rams", "ram"), ("motherboards", "mobo"), ("psus", "psu"), ("laptops", "laptop"), ("smartphones", "smartphone"), ("peripherals", "peripheral")):
        for it in db.get(grp, []):
            if it.get("slug"):
                catalog_by_slug[it["slug"]] = (kind_name, it)
    for mcid, mitems in (db.get("misc_catalog") or {}).items():
        mkind = mcid if mcid in ("air_fryer", "diapers") else "misc_custom"
        for it in (mitems or []):
            if it.get("slug"):
                catalog_by_slug[it["slug"]] = (mkind, it)

    from promo_radar import scan_live_promotions
    res = scan_live_promotions(db, max_age_hours=24, region_id=reg_id, force=fast_poll, fast_poll=fast_poll)
    matched = list(res.get("matched_deals", []))
    seen_pids = {d.get("post_id") for d in matched if d.get("post_id")}
    notify_cats = cfg.get("notifyCategories") or {}
    if notify_cats.get("smartphone"):
        for sd in (res.get("smartphone_deals") or []):
            sd_copy = dict(sd)
            sd_copy.setdefault("matched_kind", "smartphone")
            if not sd_copy.get("is_expired") and sd_copy.get("deal_status") not in ("expired", "out_of_stock"):
                sd_copy.setdefault("stock_verified", True)
                sd_copy.setdefault("deal_status", "ok")
            if sd_copy.get("post_id") not in seen_pids:
                matched.append(sd_copy)
                if sd_copy.get("post_id"):
                    seen_pids.add(sd_copy.get("post_id"))
    if notify_cats.get("peripheral"):
        for pd in (res.get("peripheral_deals") or []):
            pd_copy = dict(pd)
            pd_copy.setdefault("matched_kind", "peripheral")
            if not pd_copy.get("is_expired") and pd_copy.get("deal_status") not in ("expired", "out_of_stock"):
                pd_copy.setdefault("stock_verified", True)
                pd_copy.setdefault("deal_status", "ok")
            if pd_copy.get("post_id") not in seen_pids:
                matched.append(pd_copy)
                if pd_copy.get("post_id"):
                    seen_pids.add(pd_copy.get("post_id"))
    if notify_cats.get("air_fryer") or notify_cats.get("diapers") or notify_cats.get("misc_custom"):
        for md in (res.get("misc_deals") or []):
            md_copy = dict(md)
            mc = md_copy.get("misc_category") or md_copy.get("matched_kind") or "misc_custom"
            md_copy["matched_kind"] = mc if mc in ("air_fryer", "diapers") else "misc_custom"
            if md_copy.get("misc_specs") and not md_copy.get("item_specs"):
                md_copy["item_specs"] = md_copy["misc_specs"]
            if not md_copy.get("is_expired") and md_copy.get("deal_status") not in ("expired", "out_of_stock"):
                md_copy.setdefault("stock_verified", True)
                md_copy.setdefault("deal_status", "ok")
            if md_copy.get("post_id") not in seen_pids:
                matched.append(md_copy)
                if md_copy.get("post_id"):
                    seen_pids.add(md_copy.get("post_id"))
    if notify_cats.get("misc_custom"):
        mc_sf = (cfg.get("specFilters") or {}).get("misc_custom") or {}
        if mc_sf.get("keywords"):
            for fd in (res.get("recent_feed") or []):
                if fd.get("post_id") in seen_pids:
                    continue
                fd_copy = dict(fd)
                fd_copy["matched_kind"] = "misc_custom"
                fd_copy.setdefault("stock_verified", True)
                fd_copy.setdefault("deal_status", "ok")
                matched.append(fd_copy)
                if fd_copy.get("post_id"):
                    seen_pids.add(fd_copy.get("post_id"))
    history = load_notified_history(reg_id)
    notified_count = 0

    br_channels = {"ofertasadrenaline", "peperaiohardware", "iskandarsouza", "benchpromos", "kabumofertas", "nerdofertas"}

    min_cb = int(cfg.get("notifyMinCB", 90 if reg_id in ("mx", "eu") else 92))
    hb_brl = float(cfg.get("hbMinBrl", 600 if reg_id == "mx" else (25 if reg_id == "eu" else 150)))
    hb_pct = float(cfg.get("hbMinPct", 8))
    trig_cb = bool(cfg.get("trigCB", True))
    trig_bf = bool(cfg.get("trigBF", True))
    trig_hb = bool(cfg.get("trigHB", True))
    trig_avg30d = bool(cfg.get("trigAvg30d", True))
    avg30d_min_pct = float(cfg.get("avg30dMinPct", 5))
    targets = cfg.get("custom_targets", [])

    for d in matched:
        # Never notify expired, out-of-stock, or unverified offers!
        if d.get("is_expired") or d.get("is_coupon_expired"):
            continue
        if d.get("deal_status") in ("expired", "out_of_stock", "untested"):
            continue
        if reg_id == "br" and not d.get("stock_verified", False):
            continue
        if not force_notify and not _deal_matches_alert_prefs(d, cfg, catalog_by_slug):
            continue

        # STRICT REGIONAL ISOLATION CHECK
        d_reg = (d.get("region_id") or reg_id).lower()
        if d_reg != reg_id:
            continue
        if reg_id in ("mx", "eu"):
            ch_id = (d.get("channel_id") or "").lower()
            url_str = (d.get("buy_url") or d.get("post_url") or "").lower()
            if ch_id in br_channels or ".br" in url_str or "t.me/" in url_str:
                continue
        elif reg_id == "br":
            if d.get("region_id") in ("mx", "eu"):
                continue

        post_id = d.get("post_id") or f"{d.get('channel_id')}_{d.get('matched_slug')}_{round(d.get('price_brl', 0))}"
        price_key = f"{d.get('matched_slug')}_{round(d.get('price_brl', 0))}"
        if not force_notify and (post_id in history or price_key in history):
            continue
        # Only notify on genuinely fresh offers published within the last 10 minutes
        if not force_notify:
            age_mins = float(d.get("age_hours") or 0) * 60.0
            ts_str = d.get("timestamp") or ""
            if ts_str:
                try:
                    from datetime import datetime, timezone
                    dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    age_mins = max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 60.0)
                except Exception:
                    pass
            if age_mins > 10.0:
                continue

        qualifies = False
        reasons = []

        # 1. Check target list (e.g. RTX 5060 <= 2300, RTX 5070 <= 4500)
        matched_slug = d.get("matched_slug")
        price = d.get("price_brl", 999999)
        for tgt in targets:
            if tgt.get("slug") == matched_slug and price <= tgt.get("max_price", 0):
                qualifies = True
                reasons.append(f"🎯 Meta Atingida (≤ {config.format_currency(tgt['max_price'], region_id=reg_id)})")
                break

        # 2. Check high CB or pechincha
        cb = d.get("cb_score", 0)
        is_pech = bool(d.get("is_pechincha"))
        if trig_cb and (cb >= min_cb or is_pech):
            qualifies = True
            if cb > 0:
                reasons.append(f"🏆 CB {cb}/100")
            if is_pech:
                reasons.append("🔥 PECHINCHA" if reg_id == "br" else "🔥 GANGA / OFERTÓN")

        # 3. Check savings vs Catalog / Base Database
        savings_brl = d.get("savings_vs_hb_brl", 0)
        hb_price = d.get("hb_price_brl", 0)
        savings_pct = (savings_brl / max(1, hb_price)) * 100 if hb_price > 0 else 0
        if trig_hb and (savings_brl >= hb_brl or savings_pct >= hb_pct):
            qualifies = True
            reasons.append(f"📉 −{config.format_currency(savings_brl, short=True, region_id=reg_id)} (−{savings_pct:.0f}%) vs Database")

        # 4. Check flash price drop vs 30-day rolling average (default >= 5% drop)
        if trig_avg30d and matched_slug in catalog_by_slug and price > 0:
            avg30 = _get_item_avg_30d(catalog_by_slug[matched_slug][1])
            if avg30 > 0:
                drop30_pct = ((avg30 - price) / avg30) * 100.0
                if drop30_pct >= avg30d_min_pct:
                    qualifies = True
                    reasons.append(f"⚡ −{drop30_pct:.1f}% vs Média 30d ({config.format_currency(avg30, short=True, region_id=reg_id)})")

        # 5. ALWAYS warn if it reaches Black Friday pricing!
        if matched_slug in catalog_by_slug and price > 0:
            is_bf, bf_banner, bf_reason = _get_bf_pricing_alert_tag(price, catalog_by_slug[matched_slug][1])
            if is_bf:
                d["bf_alert_banner"] = bf_banner
                d["is_bf_pricing"] = True
                if trig_bf:
                    qualifies = True
                    reasons.append(bf_reason)

        # 5B. Explicit Smartphone alert watch (picked device(s) or explicit max_price)
        d_kind = (d.get("matched_kind") or "").lower()
        if d_kind == "smartphone":
            sp_sf = (cfg.get("specFilters") or {}).get("smartphone") or {}
            if sp_sf.get("models") or float(sp_sf.get("max_price") or 0) > 0:
                qualifies = True
                reasons.append("📱 Smartphone monitorado")
        elif d_kind == "peripheral":
            per_sf = (cfg.get("specFilters") or {}).get("peripheral") or {}
            if per_sf.get("models") or per_sf.get("brands") or per_sf.get("sub_kinds") or float(per_sf.get("max_price") or 0) > 0:
                qualifies = True
                reasons.append("🖱️ Periférico monitorado")
        elif d_kind == "air_fryer":
            af_sf = (cfg.get("specFilters") or {}).get("air_fryer") or {}
            if af_sf.get("brands") or af_sf.get("format") or float(af_sf.get("min_liters") or 0) > 0 or float(af_sf.get("max_price_per_liter") or 0) > 0 or float(af_sf.get("max_price") or 0) > 0 or af_sf.get("keyword"):
                qualifies = True
                reasons.append("🍟 Air Fryer no critério")
        elif d_kind == "diapers":
            dp_sf = (cfg.get("specFilters") or {}).get("diapers") or {}
            if dp_sf.get("brands") or dp_sf.get("sizes") or dp_sf.get("style") or float(dp_sf.get("max_price_per_unit") or 0) > 0 or float(dp_sf.get("max_price") or 0) > 0 or dp_sf.get("keyword"):
                qualifies = True
                reasons.append("👶 Fralda no critério")
        elif d_kind == "misc_custom":
            mc_sf = (cfg.get("specFilters") or {}).get("misc_custom") or {}
            if mc_sf.get("keywords"):
                qualifies = True
                reasons.append("📦 Item personalizado encontrado")

        if qualifies:
            if d.get("unverified_memory_type") and not any("DDR4/DDR5" in str(r) for r in reasons):
                reasons.append("⚠️ Verificar tipo de RAM (DDR4/DDR5)")
            _dispatch_alert_channels(cfg, d, reasons, reg_id)
            history[post_id] = time.time()
            history[price_key] = time.time()
            notified_count += 1
            if force_notify:
                break

    # 6. Scan direct catalog items ONLY when a real price drop vs yesterday occurred or slug is a custom target
    if (trig_bf or trig_avg30d or targets) and not (force_notify and notified_count > 0):
        import coupon_tracker
        target_map = {t.get("slug"): float(t.get("max_price") or 0) for t in targets if t.get("slug")}
        cat_candidates = []
        cat_iter = []
        for grp, kind_name in (("gpus", "gpu"), ("cpus", "cpu"), ("rams", "ram"), ("motherboards", "mobo"), ("psus", "psu"), ("smartphones", "smartphone"), ("peripherals", "peripheral")):
            cat_iter.append((kind_name, db.get(grp, [])))
        for mcid, mitems in (db.get("misc_catalog") or {}).items():
            cat_iter.append((mcid if mcid in ("air_fryer", "diapers") else "misc_custom", mitems or []))
        for kind_name, grp_items in cat_iter:
            for it in grp_items:
                if it.get("slug") == "x99-p4-lga2011" or it.get("is_xeon") or it.get("store_name") == "referencia":
                    continue
                slug = it.get("slug")
                cur_p = float(it.get("price_brl") or 0)
                offer_url = it.get("offer_url") or ""
                if not slug or cur_p <= 0 or not offer_url.startswith("http"):
                    continue
                price_key = f"{slug}_{round(cur_p)}"
                if not force_notify and price_key in history:
                    continue
                hist_list = it.get("history") or []
                prev_day_p = float(hist_list[-2]["price"]) if len(hist_list) >= 2 and hist_list[-2].get("price") else cur_p
                dropped_today = (prev_day_p > 0) and (((prev_day_p - cur_p) / prev_day_p) * 100.0 >= 3.0)
                is_custom_tgt = (slug in target_map and target_map[slug] > 0 and cur_p <= target_map[slug])
                # Skip stale static catalog items unless they are a custom target or dropped >= 3% vs yesterday
                if not force_notify and not is_custom_tgt and not dropped_today:
                    continue
                probe_deal = {"matched_kind": kind_name, "matched_slug": slug, "price_brl": cur_p, "title": it.get("name", ""), "channel_id": "catalogo_direto", "item_specs": {}}
                if not force_notify and not _deal_matches_alert_prefs(
                    probe_deal,
                    cfg,
                    catalog_by_slug,
                ):
                    continue

                reasons = []
                bf_banner = None
                if is_custom_tgt:
                    reasons.append(f"🎯 Meta Atingida (≤ {config.format_currency(target_map[slug], region_id=reg_id)})")
                if trig_avg30d:
                    avg30 = _get_item_avg_30d(it)
                    if avg30 > 0:
                        drop30_pct = ((avg30 - cur_p) / avg30) * 100.0
                        if drop30_pct >= avg30d_min_pct:
                            reasons.append(f"⚡ −{drop30_pct:.1f}% vs Média 30d ({config.format_currency(avg30, short=True, region_id=reg_id)})")
                is_bf, bf_b, bf_reason = _get_bf_pricing_alert_tag(cur_p, it)
                if is_bf:
                    bf_banner = bf_b
                    if trig_bf:
                        reasons.append(bf_reason)
                if probe_deal.get("unverified_memory_type"):
                    reasons.append("⚠️ Verificar tipo de RAM (DDR4/DDR5)")
                if reasons:
                    cat_candidates.append((kind_name, it, cur_p, price_key, reasons, bf_banner, bool(probe_deal.get("unverified_memory_type"))))

        for kind_name, it, cur_p, price_key, reasons, bf_banner, unverified_mem in cat_candidates[:5]:
            slug = it["slug"]
            ver = coupon_tracker.test_deal_url_and_coupon(
                it["offer_url"], expected_price=cur_p, matched_slug=slug, matched_kind=kind_name, reg_id=reg_id
            )
            if not ver.get("stock_verified") or ver.get("status") in ("expired", "out_of_stock"):
                continue
            avg30 = _get_item_avg_30d(it)
            pseudo_deal = {
                "matched_slug": slug,
                "matched_kind": kind_name,
                "matched_name": it.get("name", slug),
                "title": f"{it.get('name', slug)} — Oferta direta na loja",
                "price_brl": cur_p,
                "hb_price_brl": avg30 or cur_p,
                "savings_vs_hb_brl": round(max(0.0, avg30 - cur_p), 2),
                "store_name": ver.get("store_name") or it.get("store_name") or "Loja BR",
                "channel_id": "catalogo_direto",
                "buy_url": ver.get("final_url") or it["offer_url"],
                "post_url": it["offer_url"],
                "deal_status": ver.get("status", "active"),
                "coupon_status": ver.get("coupon_status", "none"),
                "stock_verified": True,
                "requires_coupon": False,
                "unverified_memory_type": unverified_mem,
                "bf_alert_banner": bf_banner,
                "region_id": reg_id
            }
            _dispatch_alert_channels(cfg, pseudo_deal, reasons, reg_id)
            history[price_key] = time.time()
            notified_count += 1
            if force_notify:
                break

    save_notified_history(history, reg_id)
    return {"notified": notified_count, "total_matched": len(matched), "region_id": reg_id}

def _refresh_deals_age_and_prune(deals, max_age_hours=48.0):
    """Recomputes age_hours from ISO timestamps and prunes deals without timestamp or older than max_age_hours."""
    if not isinstance(deals, list):
        return []
    now_dt = datetime.now(timezone.utc)
    fresh = []
    for d in deals:
        if not isinstance(d, dict):
            continue
        ts = d.get("timestamp")
        age_hours = None
        if ts:
            try:
                dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
                age_hours = round(max(0.1, (now_dt - dt).total_seconds() / 3600.0), 1)
            except Exception:
                age_hours = None
        if age_hours is None:
            continue
        item = dict(d)
        item["age_hours"] = age_hours
        if age_hours <= max_age_hours:
            fresh.append(item)
    return fresh


def run_sitewise_coupon_validator(reg_id=None, max_items=60, target_deals=None):
    """Runs a continuous sitewise validation of links and coupons in regional promos_cache and updates the regional DB."""
    try:
        reg = (reg_id or get_active_region_id()).lower()
        cache_path = get_promos_cache_path(reg)
        data = {}
        if os.path.exists(cache_path):
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        deals = _refresh_deals_age_and_prune(data.get("matched_deals", []), max_age_hours=48.0)
        to_validate = _refresh_deals_age_and_prune(target_deals, max_age_hours=48.0) if (isinstance(target_deals, list) and target_deals) else deals
        if not to_validate:
            import coupon_tracker
            return {"ok": True, "tested": 0, "results": {}, "matched_deals": deals, "best_by_slug": data.get("best_by_slug", {}), "coupon_status": coupon_tracker.load_coupon_status(reg)}

        import coupon_tracker
        results = coupon_tracker.test_deals_batch(to_validate, max_items=max_items, reg_id=reg)
        base_deals = deals if deals else to_validate
        rewired, best_slug = coupon_tracker.rewire_deals_and_best_by_slug(base_deals, data.get("recent_feed", []), reg_id=reg)
        data["matched_deals"] = rewired
        data["best_by_slug"] = best_slug
        data["coupon_status"] = coupon_tracker.load_coupon_status(reg)
        data["last_sitewise_test_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        data["region_id"] = reg

        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        target_db_path = get_db_path(reg)
        if os.path.exists(target_db_path):
            with open(target_db_path, "r", encoding="utf-8") as f:
                db = json.load(f)
            db["live_promos"] = data
            with open(target_db_path, "w", encoding="utf-8") as f:
                json.dump(db, f, ensure_ascii=False, indent=2)

        print(f"[Sitewise Validator ({reg.upper()})] {len(results)} ofertas/cupons verificados na base em segundo plano.")
        return {
            "ok": True,
            "tested": len(results),
            "results": results,
            "matched_deals": rewired,
            "best_by_slug": best_slug,
            "coupon_status": data["coupon_status"],
            "last_sitewise_test_at": data["last_sitewise_test_at"]
        }
    except Exception as e:
        print(f"[Sitewise Validator Erro ({reg_id})] {e}")
        return {"ok": False, "error": str(e)}

def background_promo_monitor_thread():
    """Background daemon thread: fast-polls channel feeds every 30s, verifies store links + coupons, and dispatches notifications even when browser tab is closed."""
    time.sleep(5)  # brief delay after server boot
    run_sitewise_coupon_validator()
    cycle = 0
    while True:
        sleep_secs = 30
        try:
            cfg = load_alert_config()
            if cfg.get("intervalSecs"):
                sleep_secs = max(20, int(cfg.get("intervalSecs")))
            else:
                sleep_secs = max(30, int(cfg.get("intervalMins", 1)) * 30)
            if cfg.get("notifyEnabled", True):
                res = check_and_notify_deals(cfg, fast_poll=True)
                if res.get("notified", 0) > 0:
                    print(f"[Background Monitor] Enviou {res['notified']} alerta(s) de novas ofertas em segundo plano!")
            cycle += 1
            if cycle % 10 == 0:
                run_sitewise_coupon_validator()
        except Exception as e:
            print(f"[Background Monitor Erro] {e}")
            sleep_secs = 45
        time.sleep(sleep_secs)

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
    prev_eu_db = None
    if active_region == "eu" and os.path.exists(reg_db_path):
        try:
            with open(reg_db_path, "r", encoding="utf-8") as f:
                prev_eu_db = json.load(f)
        except Exception:
            prev_eu_db = None

    if active_region in ("mx", "eu") and not force_refresh and os.path.exists(reg_db_path):
        try:
            db = prev_eu_db if (active_region == "eu" and prev_eu_db is not None) else json.load(open(reg_db_path, "r", encoding="utf-8"))
            if active_region == "eu" and db.get("data_origin") != "eu_live_retailers":
                raise ValueError("Legacy converted EU DB detected; rebuilding live EU catalog")
            db["region_id"] = active_region
            db["currency_code"] = curr_code
            db["currency_symbol"] = curr_sym
            db["exchange_rate"] = 1.0 if active_region == "eu" else rate
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

    if active_region == "eu":
        import eu_scraper
        eu_promo_path = get_promos_cache_path("eu")
        try:
            db = eu_scraper.build_eu_database(raw_db, existing_eu_db=prev_eu_db, eu_promo_path=eu_promo_path)
            if len(db.get("gpus") or []) >= 5 and len(db.get("cpus") or []) >= 5:
                db["region_id"] = "eu"
                db["currency_code"] = curr_code
                db["currency_symbol"] = curr_sym
                db["exchange_rate"] = 1.0
                try:
                    with open(reg_db_path, "w", encoding="utf-8") as f:
                        json.dump(db, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass
                return db
        except Exception as e:
            print(f"[Europe Scraper] Build failed: {e}")

        if prev_eu_db and prev_eu_db.get("data_origin") == "eu_live_retailers":
            return prev_eu_db
        raise RuntimeError("Failed to fetch live European retail data and no real eu_live_retailers cache exists.")

    db = json.loads(json.dumps(raw_db))

    if active_region == "mx":
        live_mx_gpus = fetch_cyberpuerta_live_gpu_prices()
        for group in ("gpus", "cpus", "motherboards", "rams", "psus", "laptops"):
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
        db["region_id"] = active_region
        db["currency_code"] = curr_code
        db["currency_symbol"] = curr_sym
        db["exchange_rate"] = rate
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

    def end_headers(self):
        # Always prevent browser 304 stale caching of HTML/JS/JSON assets
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # Allow GitHub Pages (HTTPS) to talk to localhost (Private Network Access CORS)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, data, status=200):
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
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
            req_reg = (qs.get("region", [""])[0] or qs.get("market", [""])[0]).lower().strip()
            if req_reg and req_reg in config.ALLOWED_REGIONS:
                config.set_active_region(req_reg)
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
                
                reg_cache_file = get_promos_cache_path(reg_id)
                cache_is_fresh = False
                if not force and not extra_q and not extra_ch and os.path.exists(reg_cache_file):
                    try:
                        cache_age_sec = time.time() - os.path.getmtime(reg_cache_file)
                        cache_is_fresh = cache_age_sec <= 900.0
                    except Exception:
                        cache_is_fresh = False

                if cache_is_fresh:
                    try:
                        with open(reg_cache_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        fresh_deals = _refresh_deals_age_and_prune(data.get("matched_deals", []), max_age_hours=max_age)
                        import coupon_tracker
                        rewired, best_slug = coupon_tracker.rewire_deals_and_best_by_slug(fresh_deals, data.get("recent_feed", []), reg_id=reg_id)
                        data["matched_deals"] = rewired
                        data["best_by_slug"] = best_slug
                        data["coupon_status"] = coupon_tracker.load_coupon_status(reg_id)
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
                slug = qs.get("slug", [""])[0] or None
                kind = qs.get("kind", [""])[0] or None
                age_hours = float(qs["age_hours"][0]) if qs.get("age_hours") and qs["age_hours"][0] else None
                import coupon_tracker
                res = coupon_tracker.test_deal_url_and_coupon(
                    url, coupon_code=code, expected_price=price, post_id=post_id,
                    matched_slug=slug, matched_kind=kind, age_hours=age_hours
                )
                return self.send_json({"ok": True, "result": res})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/test-all-coupons":
            try:
                qs = parse_qs(parsed.query)
                reg = (qs.get("region", [None])[0] or get_active_region_id()).lower()
                max_items = int(qs.get("max_items", ["60"])[0])
                out = run_sitewise_coupon_validator(reg_id=reg, max_items=max_items)
                return self.send_json(out, status=200 if out.get("ok") else 500)
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/coupon-status":
            try:
                import coupon_tracker
                return self.send_json({"ok": True, "status": coupon_tracker.load_coupon_status()})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/misc/config":
            try:
                import misc_scraper
                return self.send_json({"ok": True, "config": misc_scraper.load_misc_config()})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/misc/search":
            try:
                qs = parse_qs(parsed.query)
                q = qs.get("q", [""])[0].strip()
                cat = qs.get("cat", ["custom"])[0].strip()
                ch_raw = qs.get("channels", [""])[0].strip()
                ch_list = [c.strip() for c in ch_raw.split(",") if c.strip()] if ch_raw else None
                import misc_scraper
                return self.send_json(misc_scraper.search_misc_live(q, category_id=cat, channels=ch_list))
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
                post_id = body.get("post_id")
                slug = body.get("slug") or body.get("matched_slug")
                kind = body.get("kind") or body.get("matched_kind")
                import coupon_tracker
                res = coupon_tracker.test_deal_url_and_coupon(
                    url, coupon_code=code, expected_price=price, post_id=post_id,
                    matched_slug=slug, matched_kind=kind
                )
                return self.send_json({"ok": True, "result": res})
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        elif parsed.path == "/api/test-all-coupons":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                reg = (body.get("region") or get_active_region_id()).lower()
                max_items = int(body.get("max_items") or 20)
                target_deals = body.get("deals")
                out = run_sitewise_coupon_validator(reg_id=reg, max_items=max_items, target_deals=target_deals)
                return self.send_json(out, status=200 if out.get("ok") else 500)
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
        elif parsed.path == "/api/misc/config":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8")) if length > 0 else {}
                import misc_scraper
                saved = misc_scraper.save_misc_config(body)
                return self.send_json({"ok": True, "config": saved})
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
                req_reg = (body.get("region_id") or body.get("region") or parse_qs(parsed.query).get("region", [""])[0]).lower().strip()
                if req_reg and req_reg in config.ALLOWED_REGIONS:
                    config.set_active_region(req_reg)
                active_reg = get_active_region_id()
                if active_reg in ("mx", "eu"):
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
                reg_id = str(body.get("region") or get_active_region()).lower().strip()
                if reg_id not in ("br", "mx", "eu"):
                    reg_id = "br"

                # Deduplication check: prevent duplicate notifications across browser & background monitor
                if post_id and not force:
                    history = load_notified_history(reg_id)
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
                    history = load_notified_history(reg_id)
                    history[post_id] = time.time()
                    save_notified_history(history, reg_id)

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
    if "--cron-once" in sys.argv:
        print("[Cloud Cron] Iniciando varredura automatizada 24/7 de promoções e alertas...")

        # 0. Refresh base catalog (full 600-day rebuild if > 6h, otherwise fast ~1.5s live store price sync)
        br_db_path = get_db_path("br")
        if not os.path.exists(br_db_path) or (time.time() - os.path.getmtime(br_db_path) > 6 * 3600):
            print("[Cloud Cron] Base de dados desatualizada (> 6h). Atualizando catálogo base do Hardware Barato...")
            try:
                from scraper import build_database
                build_database(br_db_path)
            except Exception as e:
                print(f"[Cloud Cron] Aviso ao reconstruir banco base: {e}")
        else:
            try:
                from scraper import refresh_live_catalog_prices
                refresh_live_catalog_prices(br_db_path)
            except Exception as e:
                print(f"[Cloud Cron] Aviso no refresh rápido de lojas: {e}")

        reg_arg = None
        for i, a in enumerate(sys.argv):
            if a == "--region" and i + 1 < len(sys.argv):
                reg_arg = sys.argv[i + 1].lower()

        regions_to_scan = [reg_arg] if reg_arg in ("br", "mx", "eu") else ["br", "mx", "eu"]

        for reg in regions_to_scan:
            print(f"[Cloud Cron] Processando região: {reg.upper()}")
            try:
                config.set_active_region(reg)
            except Exception:
                pass

            # Pre-scan live promotions to ensure fresh store-verified caches
            try:
                raw_db = convert_db_to_active_region(force_refresh=True)
                import promo_radar
                print(f"[Cloud Cron ({reg.upper()})] Varrendo promoções e validando lojas em tempo real...")
                promo_data = promo_radar.scan_live_promotions(raw_db, max_age_hours=48.0, force=True, region_id=reg)
                if reg in ("eu", "mx") and isinstance(promo_data, dict):
                    reg_db_path = get_db_path(reg)
                    if os.path.exists(reg_db_path):
                        with open(reg_db_path, "r", encoding="utf-8") as f:
                            reg_db = json.load(f)
                        reg_db["live_promos"] = promo_data
                        with open(reg_db_path, "w", encoding="utf-8") as f:
                            json.dump(reg_db, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"[Cloud Cron ({reg.upper()}) Promo Scan Erro] {e}")

            cfg = load_alert_config(reg)
            cfg["notifyEnabled"] = True
            cfg["notifyWinToast"] = False  # Headless Linux no GitHub Actions runner
            cfg["notifyPhone"] = bool(cfg.get("notifyPhone", False)) if reg == "eu" else True

            # 1. Dispara alertas de celular para esta região
            res = check_and_notify_deals(cfg=cfg, force_notify=False, region_id=reg)
            print(f"[Cloud Cron ({reg.upper()})] Alertas disparados: {res.get('notified', 0)}")

            # 2. Executa validação de links e cupons sitewise para esta região
            try:
                run_sitewise_coupon_validator(reg_id=reg)
            except Exception as e:
                print(f"[Cloud Cron ({reg.upper()}) Sitewise Erro] {e}")

        # Always restore default region to Brazil ('br') in config/market_config.json
        try:
            config.set_active_region("br")
        except Exception:
            pass
        print("[Cloud Cron] Concluído com sucesso!")
        sys.exit(0)

    bind_host, bind_port, should_open = parse_args()
    run_server(bind_host, bind_port, open_browser=should_open)
