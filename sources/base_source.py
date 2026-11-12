"""
Base interface for all Hardware Data Sources.
Standardizes how external catalogs (Hardware Barato, direct stores, local caches, APIs)
are extracted, normalized, and served to the application.
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import os
import json
from datetime import datetime

class BaseHardwareSource(ABC):
    source_id: str = "base"
    source_name: str = "Base Data Source"
    description: str = "Fonte genérica de dados"
    is_online: bool = True
    priority: int = 100

    def get_info(self) -> Dict[str, Any]:
        """Returns metadata about this source for the frontend UI."""
        return {
            "id": self.source_id,
            "name": self.source_name,
            "description": self.description,
            "is_online": self.is_online,
            "priority": self.priority
        }

    @abstractmethod
    def fetch_catalog(self, output_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetches and normalizes hardware data.
        Returns a standardized catalog dict:
        {
            "updated_at": "YYYY-MM-DD HH:MM:SS",
            "source_id": self.source_id,
            "source_name": self.source_name,
            "gpus": [...],
            "cpus": [...],
            "rams": [...],
            "motherboards": [...],
            "psus": [...]
        }
        """
        pass

    def fetch_promos(self, extra_channels=None, max_age_hours=72) -> List[Dict[str, Any]]:
        """Optional: Fetches live promotions if supported by this source."""
        return []
