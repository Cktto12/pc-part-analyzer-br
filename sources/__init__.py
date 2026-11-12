"""
Data Sources Package.
Provides pluggable multi-source architecture for hardware database extraction and synchronization.
"""
from .base_source import BaseHardwareSource
from .registry import (
    get_registry,
    list_sources,
    get_active_source,
    get_active_source_id,
    set_active_source,
    sync_active_source
)

__all__ = [
    "BaseHardwareSource",
    "get_registry",
    "list_sources",
    "get_active_source",
    "get_active_source_id",
    "set_active_source",
    "sync_active_source"
]
