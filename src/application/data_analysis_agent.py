"""
Agent d'analyse de données - Orchestrateur.

Ce service :
1. Écoute les messages entrants sur inbox:*
2. Appelle l'agent PydanticAI via agent.iter() (API node-by-node)
3. Délègue le streaming aux services spécialisés
"""

import asyncio
import logging

from pydantic import BaseModel, ValidationError
from dependency_injector.wiring import inject, Provide

from agent.agent import create_agent
from agent.context import AgentContext
from src.application.services.messaging_service import MessagingService
from src.application.services.cancellation_manager import CancellationManager
from src.application.services.dataset_loader import DatasetLoader
from src.application.services.stream_processor import StreamProcessor
from src.infrastructure.container import Container

logger = logging.getLogger(__name__)


class _ParsedMessage(BaseModel):
    email: str
    message: str


class DataAnalysisAgent:
    """Orchestrateur qui coordonne les services pour le traitement des messages."""

    def __init__(self):
        self._agent = None
        self._dataset_loader: DatasetLoader | None = None
        self._cancellation: CancellationManager | None = None
        self._stream_processor: StreamProcessor | None = None

    @inject
    def initialize(
        self,
        dataset_loader: DatasetLoader = Provide[Container.dataset_loader],
    ):
        """Charge les datasets et crée l'agent."""
        self._dataset_loader = dataset_loader
        self._dataset_loader.load()
        self._agent = create_agent(self._dataset_loader.info)
        logger.info(f"Agent initialisé avec {len(self._dataset_loader.datasets)} dataset(s)")

    @inject
    async def serve(
        self,
        messaging: MessagingService = Provide[Container.messaging_service],
        cancellation: CancellationManager = Provide[Container.cancellation_manager],
        stream_processor: StreamProcessor = Provide[Container.stream_processor],
    ):
        """Écoute les messages entrants et stream les réponses."""
        self._cancellation = cancellation
        self._stream_processor = stream_processor
        self.initialize()

        async with messaging, cancellation:
            logger.info("DataAnalysisAgent en écoute...")
            async for msg in messaging.listen():
                asyncio.create_task(self._handle_message(msg))

    async def _handle_message(self, msg):
        """Parse et traite un message."""
        try:
            parsed = _ParsedMessage(**msg.data)
        except ValidationError as e:
            logger.warning(f"Message invalide: {e}")
            return

        logger.info(f"Message de {parsed.email}: {parsed.message[:50]}...")

        try:
            await self._process_request(parsed)
        except Exception as e:
            logger.error(f"Erreur pour {parsed.email}: {e}", exc_info=True)
            await self._stream_processor.publish_error(parsed.email, str(e))

    async def _process_request(self, parsed: _ParsedMessage):
        """Exécute l'agent et stream les résultats."""
        context = AgentContext(
            datasets=self._dataset_loader.datasets,
            dataset_info=self._dataset_loader.info,
            email=parsed.email,
        )
        buffer = ""

        async with self._agent.iter(parsed.message, deps=context) as run:
            async for node in run:
                if await self._cancellation.handle_if_cancelled(parsed.email):
                    return

                buffer, is_end = await self._stream_processor.process_node(
                    node, run.ctx, parsed.email, buffer
                )
                if is_end:
                    return
