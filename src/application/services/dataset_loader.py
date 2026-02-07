"""Service de chargement des datasets."""
import logging
from pathlib import Path
from typing import Dict

import pandas as pd

logger = logging.getLogger(__name__)


class DatasetLoader:
    """Charge et décrit les datasets CSV."""

    def __init__(self, data_dir: Path = Path("data")):
        self._data_dir = data_dir
        self._datasets: Dict[str, pd.DataFrame] = {}
        self._info: str = ""

    def load(self) -> None:
        """Charge tous les CSV du dossier data/."""
        self._datasets = {}
        if not self._data_dir.exists():
            self._info = "No datasets available."
            return

        for csv_file in sorted(self._data_dir.glob("*.csv")):
            self._datasets[csv_file.stem] = pd.read_csv(csv_file)

        self._info = self._generate_info()
        logger.info(f"Chargé {len(self._datasets)} dataset(s)")

    def _generate_info(self) -> str:
        """Génère la description des datasets."""
        if not self._datasets:
            return "No datasets available."

        parts = []
        for name, df in self._datasets.items():
            cols = ", ".join(f"{c} ({df[c].dtype})" for c in df.columns)
            parts.append(f"- **{name}**: {df.shape[0]} rows, columns: {cols}")
        return "\n".join(parts)

    @property
    def datasets(self) -> Dict[str, pd.DataFrame]:
        return self._datasets.copy()

    @property
    def info(self) -> str:
        return self._info
