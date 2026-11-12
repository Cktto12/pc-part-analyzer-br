"""
Local Cache Data Source Provider.
Serves cached catalog snapshot directly from disk (data/hardware_db.json).
Enables instant offline loading without requiring internet connectivity.
"""
import os
import json
from typing import Dict, Any, Optional
from datetime import datetime
from .base_source import BaseHardwareSource

class LocalCacheSource(BaseHardwareSource):
    source_id = "local_cache"
    source_name = "Database Local (Cache Offline)"
    description = "Snapshot local armazenado em data/hardware_db.json (ideal para modo offline / sem internet)"
    is_online = False
    priority = 20

    def fetch_catalog(self, output_path: Optional[str] = None) -> Dict[str, Any]:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        db_path = os.path.join(base_dir, "data", "hardware_db.json")

        if os.path.exists(db_path):
            with open(db_path, "r", encoding="utf-8") as f:
                db = json.load(f)
            db["source_id"] = self.source_id
            db["source_name"] = self.source_name
            return db

        # Fallback empty standard structure
        fallback = {
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "source_id": self.source_id,
            "source_name": self.source_name,
            "gpus": [],
            "cpus": [],
            "rams": [],
            "motherboards": [],
            "psus": []
        }
        return fallback
