"""
Data Source Registry & Dispatcher.
Manages pluggable database providers and persists active source configuration.
"""
import os
import json
from typing import Dict, List, Any, Optional
from .base_source import BaseHardwareSource
from .hardware_barato_source import HardwareBaratoSource
from .local_cache_source import LocalCacheSource

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ACTIVE_SOURCE_FILE = os.path.join(BASE_DIR, "data", "active_source.json")

# Registered provider instances
REGISTRY: Dict[str, BaseHardwareSource] = {
    "hardware_barato": HardwareBaratoSource(),
    "local_cache": LocalCacheSource(),
}

def get_registry() -> Dict[str, BaseHardwareSource]:
    return REGISTRY

def register_source(source: BaseHardwareSource):
    REGISTRY[source.source_id] = source

def get_active_source_id() -> str:
    if os.path.exists(ACTIVE_SOURCE_FILE):
        try:
            with open(ACTIVE_SOURCE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                sid = data.get("active_source")
                if sid in REGISTRY:
                    return sid
        except Exception:
            pass
    return "hardware_barato"

def get_active_source() -> BaseHardwareSource:
    sid = get_active_source_id()
    return REGISTRY.get(sid, REGISTRY["hardware_barato"])

def set_active_source(source_id: str) -> bool:
    if source_id not in REGISTRY:
        return False
    os.makedirs(os.path.dirname(ACTIVE_SOURCE_FILE), exist_ok=True)
    with open(ACTIVE_SOURCE_FILE, "w", encoding="utf-8") as f:
        json.dump({"active_source": source_id}, f, indent=2)
    return True

def list_sources() -> List[Dict[str, Any]]:
    active_id = get_active_source_id()
    sources = []
    for sid, source in sorted(REGISTRY.items(), key=lambda x: x[1].priority):
        info = source.get_info()
        info["is_active"] = (sid == active_id)
        sources.append(info)
    return sources

def sync_active_source(output_path: Optional[str] = None) -> Dict[str, Any]:
    active = get_active_source()
    target_path = output_path or os.path.join(BASE_DIR, "data", "hardware_db.json")
    return active.fetch_catalog(target_path)
