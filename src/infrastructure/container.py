"""
Container DI déclaratif avec dependency-injector.

Documentation: https://python-dependency-injector.ets-labs.org/
"""

import logging

from dependency_injector import containers, providers

from src.config import settings
from src.infrastructure.adapters.redis_channel_adapter import RedisMessageChannel
from src.infrastructure.adapters.memory_channel_adapter import InMemoryMessageChannel
from src.application.services.messaging_service import MessagingService
from src.application.services.cancellation_manager import CancellationManager
from src.application.services.dataset_loader import DatasetLoader
from src.application.services.event_parser import EventParser
from src.application.services.stream_processor import StreamProcessor

logger = logging.getLogger(__name__)


class Container(containers.DeclarativeContainer):
    """
    Container DI déclaratif.

    Usage Production:
        container = Container()
        container.config.channel_type.from_value("redis")
        messaging = container.messaging_service()

    Usage Tests (override sans modifier le code):
        with container.message_channel.override(mock_channel):
            messaging = container.messaging_service()
    """

    wiring_config = containers.WiringConfiguration(
        modules=["src.application.data_analysis_agent"]
    )

    config = providers.Configuration()
    """Configuration dynamique pour les sélecteurs."""

    # =========================================================================
    # MESSAGING
    # =========================================================================

    redis_channel = providers.Singleton(
        RedisMessageChannel,
        url=settings.REDIS_URL,
    )
    """Canal Redis (Singleton)."""

    memory_channel = providers.Singleton(InMemoryMessageChannel)
    """Canal In-Memory (Singleton) - pour tests ou dev local."""

    message_channel = providers.Selector(
        config.channel_type,
        redis=redis_channel,
        memory=memory_channel,
    )
    """
    Sélecteur MessageChannel basé sur la configuration.
    Le canal est sélectionné selon settings.CHANNEL_TYPE.
    """

    messaging_service = providers.Singleton(
        MessagingService,
        channel=message_channel,
    )
    """
    Service de messaging (Singleton).
    Encapsule la logique de canaux (connect, subscribe, publish).
    """

    # =========================================================================
    # CANCELLATION
    # =========================================================================

    cancellation_redis_channel = providers.Singleton(
        RedisMessageChannel,
        url=settings.REDIS_URL,
    )
    """Canal Redis dédié pour la cancellation (séparé du messaging)."""

    cancellation_memory_channel = providers.Singleton(InMemoryMessageChannel)
    """Canal In-Memory pour la cancellation (tests/dev)."""

    cancellation_channel = providers.Selector(
        config.channel_type,
        redis=cancellation_redis_channel,
        memory=cancellation_memory_channel,
    )
    """Sélecteur du canal de cancellation."""

    cancellation_manager = providers.Singleton(
        CancellationManager,
        channel=cancellation_channel,
        messaging=messaging_service,
    )
    """
    Gestionnaire de cancellation (Singleton).
    Écoute les signaux cancel:* en background pour des checks instantanés.
    """

    # =========================================================================
    # AGENT SERVICES
    # =========================================================================

    dataset_loader = providers.Singleton(DatasetLoader)
    """Service de chargement des datasets CSV."""

    event_parser = providers.Singleton(EventParser)
    """Service de parsing des events PydanticAI."""

    stream_processor = providers.Singleton(
        StreamProcessor,
        messaging=messaging_service,
        parser=event_parser,
    )
    """Service de traitement du stream PydanticAI."""
