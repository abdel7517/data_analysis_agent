"""Service de parsing des events PydanticAI."""
import json
from dataclasses import dataclass
from typing import Any, Dict

from pydantic_ai import FunctionToolResultEvent
from pydantic_ai.messages import (
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ThinkingPart,
    ThinkingPartDelta,
)

from src.domain.enums import SSEEventType, ToolResultMarker


@dataclass
class ParsedToolResult:
    """Résultat parsé d'un tool call."""

    event_type: str
    data: Dict[str, Any]


class EventParser:
    """Parse les events de streaming PydanticAI."""

    def extract_content(self, event) -> str | None:
        """Extrait le contenu textuel d'un event."""
        if isinstance(event, PartStartEvent):
            if isinstance(event.part, (ThinkingPart, TextPart)):
                return event.part.content or None
        elif isinstance(event, PartDeltaEvent):
            if isinstance(event.delta, (ThinkingPartDelta, TextPartDelta)):
                return event.delta.content_delta or None
        return None

    def is_text_event(self, event) -> bool:
        """Retourne True si l'event est du texte (à bufferiser)."""
        if isinstance(event, PartStartEvent):
            return isinstance(event.part, TextPart)
        elif isinstance(event, PartDeltaEvent):
            return isinstance(event.delta, TextPartDelta)
        return False

    def parse_tool_result(self, event: FunctionToolResultEvent) -> ParsedToolResult:
        """Parse le résultat d'un tool et retourne le type + data."""
        result_str = str(event.result.content)

        if ToolResultMarker.PLOTLY_JSON in result_str:
            data = json.loads(result_str.split(ToolResultMarker.PLOTLY_JSON, 1)[1])
            return ParsedToolResult(SSEEventType.PLOTLY, {"json": data})

        elif ToolResultMarker.TABLE_JSON in result_str:
            data = json.loads(result_str.split(ToolResultMarker.TABLE_JSON, 1)[1])
            return ParsedToolResult(SSEEventType.DATA_TABLE, {"json": data})

        else:
            return ParsedToolResult(
                SSEEventType.TOOL_CALL_RESULT,
                {
                    "tool_call_id": event.tool_call_id,
                    "result": result_str,
                },
            )
