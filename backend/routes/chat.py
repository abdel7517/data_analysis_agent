"""Route POST /chat - Envoi de messages utilisateur."""
import json

from fastapi import APIRouter, Depends, HTTPException
from dependency_injector.wiring import inject, Provide

from backend.domain.models.chat import ChatRequest, ChatResponse, CancelResponse
from backend.domain.ports.event_broker_port import EventBrokerPort
from backend.infrastructure.container import Container

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
@inject
async def send_message(
    request: ChatRequest,
    broker: EventBrokerPort = Depends(Provide[Container.event_broker]),
):
    """
    Envoie un message utilisateur vers l'agent.

    Le message est publie sur le channel inbox:{email} pour etre
    traite par le worker.
    """
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Le message ne peut pas etre vide")

    channel = f"inbox:{request.email}"

    payload = json.dumps({
        "email": request.email,
        "message": request.message,
    })

    await broker.publish(channel=channel, message=payload)

    return ChatResponse(
        status="queued",
        channel=f"outbox:{request.email}"
    )


@router.post("/chat/cancel/{email}", response_model=CancelResponse)
@inject
async def cancel_chat(
    email: str,
    broker: EventBrokerPort = Depends(Provide[Container.event_broker]),
):
    """
    Demande l'annulation du traitement pour un utilisateur.

    Publie un signal de cancellation via Redis Pub/Sub que
    le CancellationManager reçoit instantanément.
    """
    await broker.publish_cancel(email)

    return CancelResponse(
        status="cancellation_requested",
        email=email
    )
