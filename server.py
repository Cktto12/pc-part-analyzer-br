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
import base64
import socket
import argparse
import webbrowser
import subprocess
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from xml.sax.saxutils import escape as xml_escape
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "hardware_db.json")

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
    try {{
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        $rawXml = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{xml_b64}'))
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($rawXml)
        $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}}\\WindowsPowerShell\\v1.0\\powershell.exe').Show($toast)
    }} catch {{}}
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
    """
    clean_topic = topic.strip().lstrip("/")
    if not clean_topic:
        return {"ok": False, "error": "Tópico ntfy não configurado"}
    endpoint = f"https://ntfy.sh/{quote(clean_topic)}"
    headers = {
        "Title": title[:200].encode("utf-8"),
        "Priority": priority or ("urgent" if ring else "default"),
        "Tags": "bell,mag" if not ring else "rotating_light,fire",
        "User-Agent": "GPU-Analyzer-Pro/1.0"
    }
    if ring:
        # Ringtone/alarm tag in ntfy only when explicitly requested
        headers["Call"] = "yes"
    if url and url.startswith("http"):
        headers["Click"] = url
        headers["Actions"] = f"view, Abrir Oferta, {url}"

    try:
        req = urllib.request.Request(
            endpoint,
            data=message.encode("utf-8"),
            headers=headers,
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
        if parsed.path == "/api/hardware":
            if not os.path.exists(DB_PATH):
                from scraper import build_database
                db = build_database(DB_PATH)
                return self.send_json(db)
            with open(DB_PATH, "r", encoding="utf-8") as f:
                return self.send_json(json.load(f))
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
                with open(DB_PATH, "r", encoding="utf-8") as f:
                    db = json.load(f)
                from promo_radar import scan_live_promotions
                data = scan_live_promotions(
                    db,
                    extra_queries=extra_q,
                    extra_channels=extra_ch,
                    max_age_hours=max_age,
                    force=force,
                )
                return self.send_json(data)
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, status=500)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/refresh":
            try:
                from scraper import build_database
                db = build_database(DB_PATH)
                return self.send_json({"ok": True, "db": db})
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

                if channel == "ntfy":
                    topic = body.get("topic", "")
                    priority = body.get("priority", "urgent")
                    ring = bool(body.get("ring", True))
                    res = send_phone_alert_ntfy(topic, title, message, url, priority, ring)
                    return self.send_json(res)
                elif channel == "whatsapp":
                    phone = body.get("phone", "")
                    apikey = body.get("apikey", "")
                    res = send_phone_alert_whatsapp(phone, apikey, f"*{title}*\n\n{message}\n{url}")
                    return self.send_json(res)
                elif channel == "email":
                    smtp_cfg = body.get("smtp", {})
                    res = send_phone_alert_email(smtp_cfg, title, message, url)
                    return self.send_json(res)
                else:
                    return self.send_json({"ok": False, "error": f"Canal desconhecido: {channel}"}, status=400)
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
