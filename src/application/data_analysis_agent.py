"""
Agent d'analyse de données - Orchestrateur.

Ce service :
1. Écoute les messages entrants sur inbox:*
2. Appelle l'agent PydanticAI via agent.iter() (API node-by-node)
3. Délègue le streaming aux services spécialisés
4. Gère le retry automatique pour les visualisations manquantes
"""

import asyncio
import logging

from pydantic import BaseModel, ValidationError
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage
from dependency_injector.wiring import inject, Provide

from agent.agent import create_agent
from agent.context import AgentContext
from src.application.services.messaging_service import MessagingService
from src.application.services.cancellation_manager import CancellationManager
from src.application.services.dataset_loader import DatasetLoader
from src.application.services.stream_processor import StreamProcessor
from src.application.services.visualization_retry_manager import VisualizationRetryManager
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
        self._retry_manager: VisualizationRetryManager | None = None

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
        retry_manager: VisualizationRetryManager = Provide[Container.retry_manager],
    ):
        """Écoute les messages entrants et stream les réponses."""
        self._cancellation = cancellation
        self._stream_processor = stream_processor
        self._retry_manager = retry_manager
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

        logger.info(f"[AGENT:{parsed.email}] New request: {parsed.message[:50]}...")

        try:
            await self._process_request(parsed)
        except Exception as e:
            logger.error(f"[AGENT:{parsed.email}] Error: {e}", exc_info=True)
            await self._stream_processor.publish_error(parsed.email, str(e))

    async def _process_request(self, parsed: _ParsedMessage):
        """Exécute l'agent avec retry automatique pour les visualisations."""
        email = parsed.email
        context = AgentContext(
            datasets=self._dataset_loader.datasets,
            dataset_info=self._dataset_loader.info,
            email=email,
        )

        # Initialiser l'état de retry pour cette requête
        self._retry_manager.start_request(email)

        prompt = parsed.message
        message_history: list[ModelMessage] = []
        run_count = 0

        while True:
            run_count += 1
            buffer = ""

            logger.debug(
                f"[AGENT:{email}] Starting run #{run_count}, "
                f"history_len={len(message_history)}, prompt_len={len(prompt)}"
            )

            async with self._agent.iter(
                prompt,
                deps=context,
                message_history=message_history,
            ) as run:
                async for node in run:

                    if await self._cancellation.handle_if_cancelled(email):
                        logger.info(f"[AGENT:{email}] Cancelled during run #{run_count}")
                        return

                    if Agent.is_end_node(node):
                        logger.debug(f"[AGENT:{email}] Run #{run_count} ended")
                        break

                    buffer, _ = await self._stream_processor.process_node(
                        node, run.ctx, email, buffer
                    )

                # Évaluer et finaliser ou obtenir les paramètres de retry
                decision = await self._retry_manager.finalize_or_retry(email, run, buffer)

                if decision is None:
                    # Finalisé (succès ou erreur) - réponse déjà publiée
                    logger.info(f"[AGENT:{email}] Request completed after {run_count} run(s)")
                    return

                # Retry nécessaire - préparer le prochain run
                logger.debug(f"[AGENT:{email}] Preparing retry with prompt: {decision.retry_prompt[:50]}...")
                message_history = decision.message_history
                prompt = decision.retry_prompt
