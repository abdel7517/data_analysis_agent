"""
Configuration centralisee pour le Data Analysis Agent.

Ce fichier charge les variables d'environnement et fournit
une interface unique pour acceder a la configuration.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Classe de configuration centralisee."""

    # === CONFIGURATION MESSAGING ===
    CHANNEL_TYPE: str = os.getenv("CHANNEL_TYPE", "redis")  # "redis" ou "memory"
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")


# Instance globale pour import facile
settings = Settings()
