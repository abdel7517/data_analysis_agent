#!/usr/bin/env python3
"""
Data Analysis Agent - Point d'entree principal

Usage:
    python main.py serve [--channel-type TYPE]  Lance l'agent en mode serveur
"""

import argparse
import asyncio
import logging
import sys
from datetime import datetime
from pathlib import Path

# Créer le dossier logs s'il n'existe pas
logs_dir = Path("logs")
logs_dir.mkdir(exist_ok=True)

# Nom du fichier avec date jj_mm_yyyy
log_filename = logs_dir / f"{datetime.now().strftime('%d_%m_%Y')}.log"

# Configuration du logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(log_filename, encoding="utf-8"),
        logging.StreamHandler(),  # Aussi afficher dans la console
    ]
)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

from src.infrastructure.container import Container
from src.config import settings

container = Container()
container.config.channel_type.from_value(settings.CHANNEL_TYPE)


def print_error(message: str):
    """Affiche un message d'erreur formate."""
    print(f"\n[ERREUR] {message}", file=sys.stderr)


def run_serve():
    """
    Lance le DataAnalysisAgent en mode serveur.

    Le MessagingService est injecte automatiquement via @inject dans serve().
    Le type de canal (redis/memory) est configure via container.config.channel_type.
    """
    try:
        from src.application.data_analysis_agent import DataAnalysisAgent

        agent = DataAnalysisAgent()

        print("Demarrage du Data Analysis Agent en mode serveur...")
        print(f"Type de canal: {settings.CHANNEL_TYPE}")
        if settings.CHANNEL_TYPE == "redis":
            print(f"URL Redis: {settings.REDIS_URL}")

        print("\nAgent pret a recevoir des messages sur inbox:*")
        print("Appuyez sur Ctrl+C pour arreter.\n")

        asyncio.run(agent.serve())

    except KeyboardInterrupt:
        print("\nArret demande par l'utilisateur.")
    except ImportError as e:
        print_error(f"Erreur d'import: {e}\nVerifiez que toutes les dependances sont installees: pip install -r requirements.txt")
        sys.exit(1)
    except ConnectionError as e:
        print_error(f"Erreur de connexion: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Erreur inattendue: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Data Analysis Agent - CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemples:
  python main.py serve                     # Lancer l'agent en mode serveur (Redis)
  python main.py serve --channel-type memory  # Lancer en mode memoire (dev local)
        """
    )

    parser.add_argument(
        "command",
        choices=["serve"],
        help="Commande a executer"
    )
    parser.add_argument(
        "--channel-type",
        default=None,
        choices=["redis", "memory"],
        help="Type de canal pour le mode serve (defaut: redis)"
    )

    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(0)

    args = parser.parse_args()

    if args.command == "serve":
        if args.channel_type:
            container.config.channel_type.from_value(args.channel_type)
        run_serve()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nArret demande par l'utilisateur.")
        sys.exit(0)
    except Exception as e:
        print_error(f"Erreur fatale: {e}")
        sys.exit(1)
