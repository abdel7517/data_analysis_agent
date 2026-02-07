"""Modèles de sortie de l'agent."""
from pydantic import BaseModel, Field


class AgentResult(BaseModel):
    """Résultat structuré de l'agent."""

    response: str = Field(
        description="La réponse finale à afficher à l'utilisateur (insight concis, 2-3 phrases max)."
    )
    needs_visualization: bool = Field(
        description="True si une visualisation (graphique ou tableau) devrait accompagner cette réponse."
    )
