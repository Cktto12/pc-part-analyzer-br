"""
Mexico Cyberpuerta & DDTech Data Source Provider.
Provides live Mexican GPU, CPU, RAM, and Component catalogs with MXN pricing,
scraped from Cyberpuerta.mx, DDTech.mx, and Mercado Libre Mexico.
Conforms to the BaseHardwareSource schema.
"""
import os
import sys
import json
from typing import Dict, Any, Optional
from datetime import datetime
from .base_source import BaseHardwareSource

class MexicoCyberpuertaSource(BaseHardwareSource):
    source_id = "cyberpuerta_mlm_mx"
    source_name = "Cyberpuerta & DDTech MX"
    description = "Catálogo mexicano directo con precios en MXN de Cyberpuerta, DDTech y Mercado Libre MX"
    is_online = True
    priority = 15

    def fetch_catalog(self, output_path: Optional[str] = None) -> Dict[str, Any]:
        """Runs the Mexican catalog extractor and saves to data/hardware_db_mx.json."""
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if base_dir not in sys.path:
            sys.path.insert(0, base_dir)

        import server
        target_path = output_path or os.path.join(base_dir, "data", "hardware_db_mx.json")
        db = server.convert_db_to_active_region(force_refresh=True)
        db["source_id"] = self.source_id
        db["source_name"] = self.source_name
        try:
            with open(target_path, "w", encoding="utf-8") as f:
                json.dump(db, f, ensure_ascii=False, indent=2)
        except Exception:
            pass
        return db
