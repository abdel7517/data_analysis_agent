"""
Service de gestion des annulations basé sur Pub/Sub.

Écoute les signaux de cancellation en background et maintient
un set local pour des vérifications instantanées (sans I/O).
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Optional, Set

from src.domain.ports.message_channel_port import MessageChannel
from src.domain.enums import SSEEventType

if TYPE_CHECKING:
    from src.application.services.messaging_service import MessagingService

logger = logging.getLogger(__name__)


class CancellationManager:
    """
    Gestionnaire de cancellation utilisant Redis Pub/Sub.

    Au lieu de polling (GET à chaque node), écoute les signaux
    en background et maintient un set local pour des checks O(1).

    Usage:
        async with cancellation_manager:
            # Dans la boucle agent
            if cancellation.is_cancelled(email):  # Instantané!
                return
    """

    CANCEL_PATTERN = "cancel:*"

    def __init__(self, channel: MessageChannel, messaging: MessagingService):
        """
        Args:
            channel: Canal de messaging injecté (Redis ou InMemory)
            messaging: Service de messaging pour publier les événements
        """
        self._channel = channel
        self._messaging = messaging
        self._cancelled: Set[str] = set()
        self._listener_task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self) -> None:
        """Démarre le listener Pub/Sub en background."""
        logger.info(f"Démarrage CancellationManager sur {self.CANCEL_PATTERN}...")
        await self._channel.connect()
        await self._channel.subscribe(self.CANCEL_PATTERN)
        self._running = True
        self._listener_task = asyncio.create_task(self._listen())
        logger.info("CancellationManager démarré")

    async def stop(self) -> None:
        """Arrête proprement le listener."""
        self._running = False
        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None
        await self._channel.disconnect()
        logger.info("CancellationManager arrêté")

    async def _listen(self) -> None:
        """Background task: écoute les messages de cancellation."""
        try:
            async for message in self._channel.listen():
                if not self._running:
                    break
                # channel = "cancel:user@email.com"
                email = message.channel.split(":", 1)[1]
                self._cancelled.add(email)
                logger.info(f"[CANCEL] Signal reçu pour {email}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Erreur dans listener cancellation: {e}")

    def is_cancelled(self, email: str) -> bool:
        """
        Vérifie si une annulation a été demandée.

        Check instantané O(1), pas d'I/O.

        Args:
            email: Email de l'utilisateur

        Returns:
            True si une cancellation a été reçue
        """
        return email in self._cancelled

    def clear(self, email: str) -> None:
        """
        Nettoie le flag de cancellation après traitement.

        Args:
            email: Email de l'utilisateur
        """
        self._cancelled.discard(email)
        logger.debug(f"Cancellation cleared pour {email}")

    async def handle_if_cancelled(self, email: str) -> bool:
        """
        Vérifie si une cancellation a été demandée et la traite.

        Si cancelled:
        - Log l'arrêt
        - Clear le flag
        - Publie DONE
        - Retourne True

        Args:
            email: Email de l'utilisateur

        Returns:
            True si cancelled (l'appelant doit return), False sinon
        """
        if not self.is_cancelled(email):
            return False

        logger.info(f"[CANCEL] Arrêt pour {email}")
        self.clear(email)
        await self._messaging.publish_event(email, SSEEventType.DONE, {}, done=True)
        return True

    async def __aenter__(self) -> "CancellationManager":
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.stop()
