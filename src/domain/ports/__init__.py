"""
Ports (Interfaces) - Contrats que les adapters doivent implementer.
"""

from src.domain.ports.message_channel_port import MessageChannel, Message

__all__ = ["MessageChannel", "Message"]
