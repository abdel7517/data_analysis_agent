"""
Agent d'analyse de données avec streaming PydanticAI → SSE.

Ce service :
1. Écoute les messages entrants sur inbox:*
2. Appelle l'agent PydanticAI via run_stream_events()
3. Publie chaque événement (thinking, text, tool_call, plotly, etc.) via MessagingService
"""

import asyncio
import json
import logging
from pathlib import Path

import pandas as pd
from pydantic import BaseModel, ValidationError
from dependency_injector.wiring import inject, Provide

from pydantic_ai import (
    AgentRunResultEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
)
from pydantic_ai.messages import (
    PartDeltaEvent,
    TextPartDelta,
    ThinkingPartDelta,
)

from agent.agent import create_agent
from agent.context import AgentContext
from src.application.services.messaging_service import MessagingService
from src.infrastructure.container import Container

logger = logging.getLogger(__name__)

DATA_DIR = Path("data")


class _ParsedMessage(BaseModel):
    email: str
    message: str


class DataAnalysisAgent:
    """Wrapper qui stream les événements PydanticAI via MessagingService."""

    def __init__(self):
        self._agent = None
        self._datasets: dict[str, pd.DataFrame] = {}
        self._dataset_info: str = ""

    def _load_datasets(self) -> tuple[dict[str, pd.DataFrame], str]:
        """Charge les CSV du dossier data/ et génère dataset_info."""
        datasets = {}
        if DATA_DIR.exists():
            for csv_file in sorted(DATA_DIR.glob("*.csv")):
                datasets[csv_file.stem] = pd.read_csv(csv_file)

        if not datasets:
            return {}, "No datasets available."

        parts = []
        for name, df in datasets.items():
            cols = ", ".join(f"{c} ({df[c].dtype})" for c in df.columns)
            parts.append(f"- **{name}**: {df.shape[0]} rows, columns: {cols}")
        return datasets, "\n".join(parts)

    def initialize(self):
        """Crée l'agent PydanticAI avec les datasets disponibles."""
        self._datasets, self._dataset_info = self._load_datasets()
        self._agent = create_agent(self._dataset_info)
        logger.info(f"Agent initialisé avec {len(self._datasets)} dataset(s)")

    @inject
    async def serve(
        self,
        messaging: MessagingService = Provide[Container.messaging_service],
    ):
        """Écoute les messages entrants et stream les réponses."""
        self.initialize()

        async with messaging:
            logger.info("DataAnalysisAgent en écoute...")
            async for msg in messaging.listen():
                asyncio.create_task(self._handle_message(messaging, msg))

    async def _handle_message(self, messaging: MessagingService, msg):
        """Parse le message et lance le streaming."""
        try:
            parsed = _ParsedMessage(**msg.data)
        except ValidationError as e:
            logger.warning(f"Message invalide: {e}")
            return

        logger.info(f"Message de {parsed.email}: {parsed.message[:50]}...")

        try:
            await self._stream_events_to_user(messaging, parsed)
        except Exception as e:
            logger.error(f"Erreur pour {parsed.email}: {e}", exc_info=True)
            await messaging.publish_event(
                parsed.email, "error", {"message": str(e)}, done=True
            )

    async def _stream_events_to_user(
        self, messaging: MessagingService, parsed: _ParsedMessage
    ):
        """Itère run_stream_events() et publie chaque événement typé."""
        context = AgentContext(
            datasets=self._datasets.copy(),
            dataset_info=self._dataset_info,
            email=parsed.email,
        )

        async for event in self._agent.run_stream_events(
            parsed.message, deps=context
        ):
            if isinstance(event, PartDeltaEvent):
                if isinstance(event.delta, ThinkingPartDelta):
                    await messaging.publish_event(
                        parsed.email,
                        "thinking",
                        {"content": event.delta.content_delta},
                    )
                elif isinstance(event.delta, TextPartDelta):
                    await messaging.publish_event(
                        parsed.email,
                        "text",
                        {"content": event.delta.content_delta},
                    )

            elif isinstance(event, FunctionToolCallEvent):
                await messaging.publish_event(
                    parsed.email,
                    "tool_call_start",
                    {
                        "name": event.part.tool_name,
                        "args": event.part.args,
                    },
                )

            elif isinstance(event, FunctionToolResultEvent):
                result_str = str(event.result)

                if "PLOTLY_JSON:" in result_str:
                    plotly_json = result_str.split("PLOTLY_JSON:", 1)[1]
                    await messaging.publish_event(
                        parsed.email,
                        "plotly",
                        {"json": json.loads(plotly_json)},
                    )
                elif "TABLE_JSON:" in result_str:
                    table_json = result_str.split("TABLE_JSON:", 1)[1]
                    await messaging.publish_event(
                        parsed.email,
                        "data_table",
                        {"json": json.loads(table_json)},
                    )
                else:
                    await messaging.publish_event(
                        parsed.email,
                        "tool_call_result",
                        {
                            "tool_call_id": event.tool_call_id,
                            "result": result_str,
                        },
                    )

            elif isinstance(event, AgentRunResultEvent):
                break

        await messaging.publish_event(parsed.email, "done", {}, done=True)
