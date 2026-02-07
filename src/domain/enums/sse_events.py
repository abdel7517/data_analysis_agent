"""Enums pour les événements SSE."""

from enum import StrEnum


class SSEEventType(StrEnum):
    """Types d'événements SSE envoyés au frontend."""

    THINKING = "thinking"
    TEXT = "text"
    TOOL_CALL_START = "tool_call_start"
    TOOL_CALL_RESULT = "tool_call_result"
    PLOTLY = "plotly"
    DATA_TABLE = "data_table"
    DONE = "done"
    ERROR = "error"


class ToolResultMarker(StrEnum):
    """Marqueurs pour parser les résultats de tools spéciaux."""

    PLOTLY_JSON = "PLOTLY_JSON:"
    TABLE_JSON = "TABLE_JSON:"
