"""Manager singleton pour les retries de visualisation."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Protocol

from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage

from src.application.services.messaging_service import MessagingService
from src.domain.enums import SSEEventType

logger = logging.getLogger(__name__)

RETRY_PROMPT = "Crée une visualisation (graphique ou tableau) pour illustrer ta réponse précédente."
MAX_RETRIES = 2
ERROR_MESSAGE = (
    "La visualisation n'a pas pu être générée. "
    "Pourriez-vous reformuler votre question ?"
)


# =============================================================================
# TYPES
# =============================================================================


class RunResultProtocol(Protocol):
    """Protocol pour le résultat d'un run PydanticAI."""

    @property
    def output(self) -> str | None:
        ...

    def all_messages(self) -> list[ModelMessage]:
        ...


class RunProtocol(Protocol):
    """Protocol pour un run PydanticAI terminé."""

    @property
    def result(self) -> RunResultProtocol:
        ...


@dataclass
class RetryState:
    """État de retry pour un utilisateur."""

    attempt: int = 0
    has_visual: bool = False

    def increment_attempt(self) -> None:
        self.attempt += 1
        self.has_visual = False

    def mark_visual(self) -> None:
        self.has_visual = True


@dataclass
class RetryDecision:
    """Paramètres pour le prochain retry."""

    retry_prompt: str
    message_history: list[ModelMessage] = field(default_factory=list)


# =============================================================================
# MANAGER
# =============================================================================


class VisualizationRetryManager:
    """
    Manager singleton qui gère les retries de visualisation.

    Utilise un agent "judge" pour évaluer si une visualisation était nécessaire
    après chaque run de l'agent principal.
    """

    def __init__(
        self,
        messaging: MessagingService,
        judge_agent: Agent,
    ):
        self._messaging = messaging
        self._judge = judge_agent
        self._states: dict[str, RetryState] = {}

    def start_request(self, email: str) -> None:
        """Initialise l'état pour une nouvelle requête."""
        self._states[email] = RetryState()
        logger.debug(f"[RETRY:{email}] Request started")

    def record_visual(self, email: str) -> None:
        """Enregistre qu'une visualisation a été produite."""
        if state := self._states.get(email):
            state.mark_visual()
            logger.debug(f"[RETRY:{email}] Visual recorded")

    async def finalize_or_retry(
        self, email: str, run: RunProtocol, buffer: str
    ) -> RetryDecision | None:
        """
        Évalue et finalise le run, ou retourne les paramètres de retry.

        Returns:
            None si finalisé (succès ou échec), RetryDecision si retry nécessaire.
        """
        state = self._states.get(email)

        # Pas d'état → finaliser directement
        if not state:
            logger.debug(f"[RETRY:{email}] No state, finalizing")
            await self._publish_final(email, run, buffer)
            return None

        # Fast path: visualisation produite → succès
        if state.has_visual:
            logger.debug(f"[RETRY:{email}] SUCCESS: visual produced")
            self._reset(email)
            await self._publish_final(email, run, buffer)
            return None

        # Max retries atteint → erreur
        if state.attempt >= MAX_RETRIES:
            logger.warning(f"[RETRY:{email}] FAILED: max retries reached")
            self._reset(email)
            await self._publish_final(email, run, buffer, error_message=ERROR_MESSAGE)
            return None

        # Évaluer via judge agent
        needs_viz = await self._evaluate_need(email, run)

        # Pas besoin de visualisation → succès
        if not needs_viz:
            logger.debug(f"[RETRY:{email}] No visualization needed")
            self._reset(email)
            await self._publish_final(email, run, buffer)
            return None

        # Retry nécessaire
        return await self._trigger_retry(email, run, state)

    # -------------------------------------------------------------------------
    # HELPERS PRIVÉS
    # -------------------------------------------------------------------------

    async def _evaluate_need(self, email: str, run: RunProtocol) -> bool:
        """Appelle le judge agent pour évaluer le besoin de visualisation."""
        try:
            judgment = await self._judge.run(
                "La réponse nécessitait-elle une visualisation ?",
                message_history=run.result.all_messages(),
            )
            needs_viz = judgment.output.needs_visualization
            logger.debug(f"[RETRY:{email}] Judge: needs_viz={needs_viz}")
            return needs_viz
        except Exception as e:
            logger.warning(f"[RETRY:{email}] Judge failed: {e}, defaulting to True")
            return True

    async def _trigger_retry(
        self, email: str, run: RunProtocol, state: RetryState
    ) -> RetryDecision:
        """Déclenche un retry."""
        state.increment_attempt()

        logger.info(f"[RETRY:{email}] Retry {state.attempt}/{MAX_RETRIES}")

        await self._messaging.publish_event(
            email,
            SSEEventType.RETRYING,
            {"message": "Génération de la visualisation..."},
        )

        return RetryDecision(
            retry_prompt=RETRY_PROMPT,
            message_history=run.result.all_messages(),
        )

    async def _publish_final(
        self, email: str, run: RunProtocol, buffer: str, error_message: str | None = None
    ) -> None:
        """Publie le texte final et DONE (ou ERROR si error_message)."""
        final_response = run.result.output if run.result.output else buffer.strip()

        if error_message:
            logger.debug(f"[RETRY:{email}] Publishing error: {error_message}")
            await self._messaging.publish_event(
                email,
                SSEEventType.ERROR,
                {"message": error_message},
                done=True,
            )
        else:
            response_preview = (
                final_response[:100] + "..."
                if len(final_response) > 100
                else final_response
            )
            logger.debug(f"[RETRY:{email}] Publishing final: {response_preview!r}")
            if final_response.strip():
                await self._messaging.publish_event(
                    email, SSEEventType.TEXT, {"content": final_response}
                )
            await self._messaging.publish_event(
                email, SSEEventType.DONE, {}, done=True
            )

        logger.debug(f"[RETRY:{email}] Stream completed")

    def _reset(self, email: str) -> None:
        """Supprime l'état pour cet email."""
        self._states.pop(email, None)
        logger.debug(f"[RETRY:{email}] State reset")
