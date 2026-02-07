"""Service de traitement du stream PydanticAI."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from pydantic_ai import Agent, FunctionToolCallEvent, FunctionToolResultEvent

from src.application.services.event_parser import EventParser
from src.application.services.messaging_service import MessagingService
from src.domain.enums import SSEEventType

if TYPE_CHECKING:
    from src.application.services.visualization_retry_manager import (
        VisualizationRetryManager,
    )

logger = logging.getLogger(__name__)


class StreamProcessor:
    """Traite les nodes PydanticAI et publie les events SSE."""

    def __init__(
        self,
        messaging: MessagingService,
        parser: EventParser,
        retry_manager: VisualizationRetryManager,
    ):
        self._messaging = messaging
        self._parser = parser
        self._retry_manager = retry_manager

    async def process_node(
        self, node, ctx, email: str, buffer: str
    ) -> tuple[str, bool]:
        """
        Traite un node et retourne (buffer_updated, is_end).

        Args:
            node: Node PydanticAI à traiter
            ctx: Contexte du run
            email: Email de l'utilisateur
            buffer: Buffer de texte accumulé

        Returns:
            Tuple (nouveau_buffer, is_end)
        """
        node_type = type(node).__name__
        logger.debug(f"[STREAM:{email}] Processing node: {node_type}")

        if Agent.is_model_request_node(node):
            buffer = await self._handle_model_request(node, ctx, email, buffer)
            logger.debug(f"[STREAM:{email}] ModelRequest done, buffer_len={len(buffer)}")
            return buffer, False

        elif Agent.is_call_tools_node(node):
            await self._handle_tool_calls(node, ctx, email)
            logger.debug(f"[STREAM:{email}] ToolCalls done, buffer reset")
            return "", False  # Reset buffer après tool call

        elif Agent.is_end_node(node):
            logger.debug(f"[STREAM:{email}] EndNode reached")
            return buffer, True

        logger.debug(f"[STREAM:{email}] Unknown node type: {node_type}")
        return buffer, False

    async def _handle_model_request(
        self, node, ctx, email: str, buffer: str
    ) -> str:
        """Stream thinking/text et retourne le buffer mis à jour."""
        event_count = 0
        async with node.stream(ctx) as stream:
            async for event in stream:
                event_count += 1
                content = self._parser.extract_content(event)
                if content:
                    if self._parser.is_text_event(event):
                        buffer += content
                    await self._messaging.publish_event(
                        email, SSEEventType.THINKING, {"content": content}
                    )
        logger.debug(f"[STREAM:{email}] ModelRequest stream finished, {event_count} events processed")
        return buffer

    async def _handle_tool_calls(self, node, ctx, email: str):
        """Publie les tool calls et notifie le manager des visualisations."""
        async with node.stream(ctx) as stream:
            async for event in stream:
                if isinstance(event, FunctionToolCallEvent):
                    tool_name = event.part.tool_name
                    logger.debug(f"[STREAM:{email}] ToolCall START: {tool_name}")
                    await self._messaging.publish_event(
                        email,
                        SSEEventType.TOOL_CALL_START,
                        {"name": tool_name, "args": event.part.args},
                    )
                elif isinstance(event, FunctionToolResultEvent):
                    parsed = self._parser.parse_tool_result(event)
                    logger.debug(
                        f"[STREAM:{email}] ToolCall RESULT: type={parsed.event_type.value}"
                    )
                    # Notifier le manager si visualisation produite
                    if parsed.event_type in (SSEEventType.PLOTLY, SSEEventType.DATA_TABLE):
                        logger.debug(f"[STREAM:{email}] Visual output detected!")
                        self._retry_manager.record_visual(email)
                    await self._messaging.publish_event(
                        email, parsed.event_type, parsed.data
                    )

    async def publish_error(self, email: str, error: str):
        """Publie une erreur et termine le stream."""
        logger.debug(f"[STREAM:{email}] Publishing error: {error}")
        await self._messaging.publish_event(
            email, SSEEventType.ERROR, {"message": error}, done=True
        )
