"""
Market & Regional Configuration Manager for GPU & Build Analyzer Pro.
Provides localized monetary basis (currencies, decimal/thousand formats),
regional promotion channels (Telegram feeds, deal bots), monitored retailer stores,
and seasonal sale periods. Allows seamless slotting of new countries/regions.
"""
import os
import json
from typing import Dict, Any, List, Optional

CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
REGIONS_DIR = os.path.join(CONFIG_DIR, "regions")
ACTIVE_CONFIG_PATH = os.path.join(CONFIG_DIR, "market_config.json")

# In-memory cache for fast lookups
_CACHED_CONFIG: Optional[Dict[str, Any]] = None

def get_market_config(force_reload: bool = False) -> Dict[str, Any]:
    """Returns the currently active market configuration dictionary."""
    global _CACHED_CONFIG
    if not force_reload and _CACHED_CONFIG is not None:
        return _CACHED_CONFIG

    if os.path.exists(ACTIVE_CONFIG_PATH):
        try:
            with open(ACTIVE_CONFIG_PATH, "r", encoding="utf-8") as f:
                _CACHED_CONFIG = json.load(f)
                return _CACHED_CONFIG
        except Exception:
            pass

    # Fallback to Brazil profile
    br_path = os.path.join(REGIONS_DIR, "br.json")
    if os.path.exists(br_path):
        with open(br_path, "r", encoding="utf-8") as f:
            _CACHED_CONFIG = json.load(f)
            save_market_config(_CACHED_CONFIG)
            return _CACHED_CONFIG

    # Minimal default fallback
    _CACHED_CONFIG = {
        "region_id": "br",
        "region_name": "Brasil",
        "country_code": "BR",
        "flag_emoji": "🇧🇷",
        "monetary": {
            "currency_code": "BRL",
            "currency_symbol": "R$",
            "symbol_position": "prefix",
            "locale": "pt-BR",
            "decimal_separator": ",",
            "thousands_separator": ".",
            "decimal_digits": 2,
            "min_valid_hardware_price": 80.0,
            "max_valid_hardware_price": 45000.0,
            "vram_step_bonus_factor": 240.0
        },
        "promotion_sources": {"enabled": True, "channels": []},
        "stores": []
    }
    return _CACHED_CONFIG


def save_market_config(cfg: Dict[str, Any]) -> bool:
    """Saves custom changes directly into market_config.json."""
    global _CACHED_CONFIG
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(ACTIVE_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        _CACHED_CONFIG = cfg
        return True
    except Exception as e:
        print(f"Error saving market config: {e}")
        return False


def list_available_regions() -> List[Dict[str, Any]]:
    """Scans config/regions/ and returns metadata for each available country profile."""
    regions = []
    if not os.path.exists(REGIONS_DIR):
        return regions

    for fname in sorted(os.listdir(REGIONS_DIR)):
        if fname.endswith(".json") and fname != "template.json":
            fpath = os.path.join(REGIONS_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    monetary = data.get("monetary", {})
                    regions.append({
                        "region_id": data.get("region_id", fname.replace(".json", "")),
                        "region_name": data.get("region_name", fname),
                        "country_code": data.get("country_code", ""),
                        "flag_emoji": data.get("flag_emoji", "🌐"),
                        "currency_code": monetary.get("currency_code", "BRL"),
                        "currency_symbol": monetary.get("currency_symbol", "R$"),
                        "locale": monetary.get("locale", "pt-BR"),
                        "store_count": len(data.get("stores", [])),
                        "channel_count": len(data.get("promotion_sources", {}).get("channels", []))
                    })
            except Exception:
                continue
    return regions


def set_active_region(region_id: str) -> bool:
    """
    Slots in a specific regional profile by loading config/regions/{region_id}.json
    and writing it as the active market_config.json.
    """
    global _CACHED_CONFIG
    target_file = os.path.join(REGIONS_DIR, f"{region_id}.json")
    if not os.path.exists(target_file):
        return False

    try:
        with open(target_file, "r", encoding="utf-8") as f:
            profile = json.load(f)
        save_market_config(profile)
        _CACHED_CONFIG = profile
        return True
    except Exception as e:
        print(f"Error activating region {region_id}: {e}")
        return False


def get_monetary_config() -> Dict[str, Any]:
    """Returns the monetary section of the active configuration."""
    return get_market_config().get("monetary", {})


def get_promotion_channels() -> List[Dict[str, Any]]:
    """Returns the promo channels configured for the active region."""
    return get_market_config().get("promotion_sources", {}).get("channels", [])


def get_stores() -> List[Dict[str, Any]]:
    """Returns the retail stores monitored for the active region."""
    return get_market_config().get("stores", [])


def format_currency(val: float, short: bool = False) -> str:
    """Formats a monetary value using the active regional monetary rules."""
    if val is None:
        return "--"
    mon = get_monetary_config()
    sym = mon.get("currency_symbol", "R$")
    dec_sep = mon.get("decimal_separator", ",")
    thou_sep = mon.get("thousands_separator", ".")
    digits = 0 if short else mon.get("decimal_digits", 2)
    pos = mon.get("symbol_position", "prefix")

    try:
        num = float(val)
        if short:
            int_part = f"{int(round(num)):,}".replace(",", thou_sep)
            formatted = int_part
        else:
            fmt_str = f"{num:,.{digits}f}"
            # Swap standard Python ',' and '.' with configured separators
            if thou_sep == "." and dec_sep == ",":
                formatted = fmt_str.replace(",", "X").replace(".", ",").replace("X", ".")
            elif thou_sep == " " and dec_sep == ",":
                formatted = fmt_str.replace(",", " ").replace(".", ",")
            else:
                formatted = fmt_str

        return f"{sym} {formatted}" if pos == "prefix" else f"{formatted} {sym}"
    except Exception:
        return f"{sym} {val}"
