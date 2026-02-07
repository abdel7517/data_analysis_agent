"""Service de traitement du stream PydanticAI."""
from pydantic_ai import Agent, FunctionToolCallEvent, FunctionToolResultEvent

from src.application.services.event_parser import EventParser
from src.application.services.messaging_service import MessagingService
from src.domain.enums import SSEEventType


class StreamProcessor:
    """Traite les nodes PydanticAI et publie les events SSE."""

    def __init__(self, messaging: MessagingService, parser: EventParser):
        self._messaging = messaging
        self._parser = parser

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
        if Agent.is_model_request_node(node):
            buffer = await self._handle_model_request(node, ctx, email, buffer)
            return buffer, False

        elif Agent.is_call_tools_node(node):
            await self._handle_tool_calls(node, ctx, email)
            return "", False  # Reset buffer après tool call

        elif Agent.is_end_node(node):
            await self._handle_end(email, buffer)
            return buffer, True

        return buffer, False

    async def _handle_model_request(
        self, node, ctx, email: str, buffer: str
    ) -> str:
        """Stream thinking/text et retourne le buffer mis à jour."""
        async with node.stream(ctx) as stream:
            async for event in stream:
                content = self._parser.extract_content(event)
                if content:
                    if self._parser.is_text_event(event):
                        buffer += content
                    await self._messaging.publish_event(
                        email, SSEEventType.THINKING, {"content": content}
                    )
        return buffer

    async def _handle_tool_calls(self, node, ctx, email: str):
        """Publie les tool calls et résultats."""
        async with node.stream(ctx) as stream:
            async for event in stream:
                if isinstance(event, FunctionToolCallEvent):
                    await self._messaging.publish_event(
                        email,
                        SSEEventType.TOOL_CALL_START,
                        {"name": event.part.tool_name, "args": event.part.args},
                    )
                elif isinstance(event, FunctionToolResultEvent):
                    parsed = self._parser.parse_tool_result(event)
                    await self._messaging.publish_event(
                        email, parsed.event_type, parsed.data
                    )

    async def _handle_end(self, email: str, buffer: str):
        """Envoie le texte final et DONE."""
        if buffer.strip():
            await self._messaging.publish_event(
                email, SSEEventType.TEXT, {"content": buffer}
            )
        await self._messaging.publish_event(email, SSEEventType.DONE, {}, done=True)

    async def publish_error(self, email: str, error: str):
        """Publie une erreur et termine le stream."""
        await self._messaging.publish_event(
            email, SSEEventType.ERROR, {"message": error}, done=True
        )
