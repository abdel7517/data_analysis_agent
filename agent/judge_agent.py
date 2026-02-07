"""Agent judge pour évaluer le besoin de visualisation."""

import os

from pydantic import BaseModel, Field
from pydantic_ai import Agent


class AgentJudgment(BaseModel):
    """Jugement post-run sur la nécessité d'une visualisation."""

    needs_visualization: bool = Field(
        description=(
            "True si la réponse aurait dû être accompagnée d'une visualisation "
            "(graphique, tableau, chart). False si la réponse textuelle est suffisante."
        )
    )


def create_judge_agent() -> Agent:
    """Crée l'agent judge qui évalue si une visualisation était nécessaire."""
    model = os.getenv("MODEL", "mistral:magistral-small-latest")

    return Agent(
        model,
        output_type=AgentJudgment,
        retries=2,
        system_prompt=(
            "Tu es un évaluateur. On te donne l'historique d'une conversation "
            "entre un utilisateur et un agent d'analyse de données.\n\n"
            "Ta seule tâche : déterminer si la réponse de l'agent aurait dû "
            "inclure une visualisation (graphique, tableau, chart) pour être complète.\n\n"
            "Règles :\n"
            "- Si l'utilisateur demande explicitement un graphique, chart, plot, tableau, "
            "comparaison visuelle → needs_visualization=True\n"
            "- Si la réponse contient des données chiffrées qui seraient mieux comprises "
            "avec un visuel (tendances, répartitions, comparaisons) → needs_visualization=True\n"
            "- Si la question est factuelle simple (combien de lignes, quel type, "
            "liste de colonnes) → needs_visualization=False\n"
            "- Si l'agent a déjà produit une visualisation dans la conversation → needs_visualization=False"
        ),
    )
