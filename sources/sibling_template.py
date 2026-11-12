"""
Template / Example for Adding Sibling Data Sources.
To add a new data source (e.g., direct store scraper, API aggregator):
1. Create a new file in sources/ (e.g. kabum_source.py)
2. Subclass BaseHardwareSource
3. Register it in sources/registry.py

All sources produce the exact same normalized output schema, ensuring 100% frontend compatibility.
"""
from typing import Dict, Any, Optional
from datetime import datetime
from .base_source import BaseHardwareSource

class SiblingStoreTemplateSource(BaseHardwareSource):
    source_id = "custom_store"
    source_name = "Loja Parceira / Fonte Personalizada"
    description = "Exemplo de fonte adicional de dados com esquema unificado"
    is_online = True
    priority = 30

    def fetch_catalog(self, output_path: Optional[str] = None) -> Dict[str, Any]:
        # Implement extraction / normalization here:
        # returns dict with standard schema:
        # { "updated_at": ..., "source_id": self.source_id, "source_name": self.source_name, "gpus": [...], ... }
        raise NotImplementedError("Implement fetch logic for this provider")
