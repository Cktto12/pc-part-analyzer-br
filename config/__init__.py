"""Config package for market and regional profiles."""
from .market_manager import (
    ALLOWED_REGIONS,
    get_market_config,
    save_market_config,
    list_available_regions,
    set_active_region,
    get_monetary_config,
    get_promotion_channels,
    get_stores,
    format_currency
)

__all__ = [
    "ALLOWED_REGIONS",
    "get_market_config",
    "save_market_config",
    "list_available_regions",
    "set_active_region",
    "get_monetary_config",
    "get_promotion_channels",
    "get_stores",
    "format_currency"
]
