"""
Hardware Barato Data Source Provider.
Extracts live GPU, CPU, RAM, Motherboard, and PSU catalogs along with historical price data.
Conforms to the BaseHardwareSource schema.
"""
import os
import sys
import json
from typing import Dict, Any, Optional
from datetime import datetime
from .base_source import BaseHardwareSource

class HardwareBaratoSource(BaseHardwareSource):
    source_id = "hardware_barato"
    source_name = "Database Principal (Web / API)"
    description = "Catálogo completo de hardware com histórico real diário e cupons ativos"
    is_online = True
    priority = 10

    def fetch_catalog(self, output_path: Optional[str] = None) -> Dict[str, Any]:
        """Runs the specialized Flight RSC extractor and enriches catalog with AI/benchmark metrics."""
        # Dynamically import scraper to avoid circular dependencies
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if base_dir not in sys.path:
            sys.path.insert(0, base_dir)

        import scraper
        target_path = output_path or os.path.join(base_dir, "data", "hardware_db.json")
        db = scraper.build_database(target_path)
        db["source_id"] = self.source_id
        db["source_name"] = self.source_name
        return db
