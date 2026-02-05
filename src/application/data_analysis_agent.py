"""
Agent d'analyse de données avec streaming PydanticAI → SSE.

Ce service :
1. Écoute les messages entrants sur inbox:*
2. Appelle l'agent PydanticAI via agent.iter() (API node-by-node)
3. Publie chaque événement (thinking, text, tool_call, plotly, etc.) via MessagingService

Note: Utilise agent.iter() au lieu de run_stream_events() pour garantir que
FunctionToolResultEvent est correctement émis (cf. pydantic-ai#1007).
"""

import asyncio
import json
import logging
from enum import StrEnum
from pathlib import Path

import pandas as pd
from pydantic import BaseModel, ValidationError
from dependency_injector.wiring import inject, Provide

from pydantic_ai import Agent, FunctionToolCallEvent, FunctionToolResultEvent
from pydantic_ai.messages import (
    PartDeltaEvent,
    PartStartEvent,
    TextPartDelta,
    TextPart,
    ThinkingPartDelta,
    ThinkingPart,
)

from agent.agent import create_agent
from agent.context import AgentContext
from src.application.services.messaging_service import MessagingService
from src.infrastructure.container import Container

logger = logging.getLogger(__name__)

DATA_DIR = Path("data")


class SSEEventType(StrEnum):
    THINKING = "thinking"
    TEXT = "text"
    TOOL_CALL_START = "tool_call_start"
    TOOL_CALL_RESULT = "tool_call_result"
    PLOTLY = "plotly"
    DATA_TABLE = "data_table"
    DONE = "done"
    ERROR = "error"


class ToolResultMarker(StrEnum):
    PLOTLY_JSON = "PLOTLY_JSON:"
    TABLE_JSON = "TABLE_JSON:"


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
                parsed.email, SSEEventType.ERROR, {"message": str(e)}, done=True
            )

    async def _stream_events_to_user(
        self, messaging: MessagingService, parsed: _ParsedMessage
    ):
        """Itère agent.iter() et publie chaque événement typé."""
        context = AgentContext(
            datasets=self._datasets.copy(),
            dataset_info=self._dataset_info,
            email=parsed.email,
        )

        async with self._agent.iter(parsed.message, deps=context) as run:
            async for node in run:
                # --- Model Request Node : génère du texte/thinking ---
                if Agent.is_model_request_node(node):
                    async with node.stream(run.ctx) as stream:
                        async for event in stream:
                            if isinstance(event, PartStartEvent):
                                if isinstance(event.part, ThinkingPart) and event.part.content:
                                    await messaging.publish_event(
                                        parsed.email,
                                        SSEEventType.THINKING,
                                        {"content": event.part.content},
                                    )
                                elif isinstance(event.part, TextPart) and event.part.content:
                                    await messaging.publish_event(
                                        parsed.email,
                                        SSEEventType.TEXT,
                                        {"content": event.part.content},
                                    )

                            elif isinstance(event, PartDeltaEvent):
                                if isinstance(event.delta, ThinkingPartDelta):
                                    await messaging.publish_event(
                                        parsed.email,
                                        SSEEventType.THINKING,
                                        {"content": event.delta.content_delta},
                                    )
                                elif isinstance(event.delta, TextPartDelta):
                                    await messaging.publish_event(
                                        parsed.email,
                                        SSEEventType.TEXT,
                                        {"content": event.delta.content_delta},
                                    )

                # --- Call Tools Node : exécute les tools et retourne les résultats ---
                elif Agent.is_call_tools_node(node):
                    async with node.stream(run.ctx) as stream:
                        async for event in stream:
                            if isinstance(event, FunctionToolCallEvent):
                                await messaging.publish_event(
                                    parsed.email,
                                    SSEEventType.TOOL_CALL_START,
                                    {
                                        "name": event.part.tool_name,
                                        "args": event.part.args,
                                    },
                                )

                            elif isinstance(event, FunctionToolResultEvent):
                                result_str = str(event.result.content)

                                if ToolResultMarker.PLOTLY_JSON in result_str:
                                    plotly_json = result_str.split(
                                        ToolResultMarker.PLOTLY_JSON, 1
                                    )[1]
                                    await messaging.publish_event(
                                        parsed.email,
                                        SSEEventType.PLOTLY,
                                        {"json": json.loads(plotly_json)},
                                    )
                                elif ToolResultMarker.TABLE_JSON in result_str:
                                    table_json = result_str.split(
                                        ToolResultMarker.TABLE_JSON, 1
                                    )[1]
                                    await messaging.publish_event(
                                        parsed.email,
                                        SSEEventType.DATA_TABLE,
                                        {"json": json.loads(table_json)},
                                    )
                                else:
                                    await messaging.publish_event(
                                        parsed.email,
                                        SSEEventType.TOOL_CALL_RESULT,
                                        {
                                            "tool_call_id": event.tool_call_id,
                                            "result": result_str,
                                        },
                                    )

        await messaging.publish_event(parsed.email, SSEEventType.DONE, {}, done=True)
