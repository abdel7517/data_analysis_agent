import { useState, useRef, useCallback } from "react";
import { useSSE } from "./useSSE";
import { SSEEventType, BlockType } from "@/types/chat";
import type { Block, Message, SSEEvent } from "@/types/chat";

/**
 * Hook de gestion du chat avec streaming SSE
 *
 * Architecture:
 * - messages[] : Historique complet (messages finalisés)
 * - streamingBlocks[] : Blocs du message en cours de streaming
 * - streamingMessageIdRef : ID pré-assigné pour key React stable (préserve instance composant)
 *
 * Utilise functional updates (setStreamingBlocks(prev => ...)) pour garantir
 * la lecture de la dernière valeur même en cas d'événements SSE rapides.
 */

// Générateurs d'IDs uniques pour les clés React
// Utilise crypto.randomUUID() (standard RFC 4122) pour des IDs vraiment uniques
const nextBlockId = () => crypto.randomUUID();
const nextMessageId = () => crypto.randomUUID();

export function useChat(email: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingBlocks, setStreamingBlocks] = useState<Block[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ID pré-assigné au message assistant AVANT le streaming.
  // Utilisé comme key React pour que le composant streaming et le message finalisé
  // partagent la même instance → les animations de fermeture fonctionnent.
  const streamingMessageIdRef = useRef<string | null>(null);

  // ID du bloc en cours de streaming.
  // Utilisé par ensureBlockConsistency pour identifier le seul bloc autorisé à avoir done:false.
  const streamingBlockIdRef = useRef<string | null>(null);

  // --- Helpers d'accumulation ---

  // Cohérence : tout bloc done:false dont l'ID ne correspond pas au bloc
  // en cours de streaming est finalisé (done:true).
  const ensureBlockConsistency = (blocks: Block[]): Block[] =>
    blocks.map((block) =>
      !block.done && block.id !== streamingBlockIdRef.current
        ? ({ ...block, done: true } as Block)
        : block,
    );

  // Finalise tous les blocs (done:false → done:true) pour la copie vers messages[]
  const finalizeAllBlocks = (blocks: Block[]): Block[] =>
    blocks.map((b) => (!b.done ? ({ ...b, done: true } as Block) : b));

  // Reset des refs de streaming (fin normale, erreur, ou échec réseau)
  const resetStreamingState = () => {
    streamingMessageIdRef.current = null;
    streamingBlockIdRef.current = null;
    setIsLoading(false);
  };

  // Concatène un chunk de contenu au bloc en cours, ou crée un nouveau bloc
  // Utilisé par THINKING et TEXT (même logique, seul le BlockType diffère)
  const appendContentChunk = (
    type: BlockType.THINKING | BlockType.TEXT,
    content: string,
  ) => {
    setStreamingBlocks((prev) => {
      const blocks = ensureBlockConsistency(prev);
      const idx = blocks.findIndex((b) => b.id === streamingBlockIdRef.current);
      const current = idx !== -1 ? blocks[idx] : null;
      if (current?.type === type) {
        const updated = [...blocks];
        updated[idx] = {
          ...current,
          content: (current as { content: string }).content + content,
        };
        return updated;
      }
      const id = nextBlockId();
      streamingBlockIdRef.current = id;
      return [...blocks, { type, content, id, done: false } as Block];
    });
  };

  // Ajoute un bloc de visualisation instantané (done:true dès la création)
  // Utilisé par PLOTLY et DATA_TABLE (même logique, seul le BlockType diffère)
  const appendJsonBlock = (
    type: BlockType.PLOTLY | BlockType.DATA_TABLE,
    json: string,
  ) => {
    setStreamingBlocks((prev) => {
      const blocks = ensureBlockConsistency(prev);
      return [...blocks, { type, json, id: nextBlockId(), done: true } as Block];
    });
  };

  // Finalise tous les blocs, copie dans messages[], et reset le state streaming
  // Utilisé par DONE et ERROR (ERROR passe un bloc erreur supplémentaire)
  const commitMessage = (extraBlocks: Block[] = []) => {
    setStreamingBlocks((prev) => {
      const finalized = [...finalizeAllBlocks(prev), ...extraBlocks];
      if (finalized.length > 0) {
        const messageId = streamingMessageIdRef.current || nextMessageId();
        setMessages((msgs) => [
          ...msgs,
          { id: messageId, role: "assistant" as const, blocks: finalized },
        ]);
      }
      return [];
    });
    resetStreamingState();
  };

  // --- Gestionnaire SSE ---

  const handleSSEMessage = useCallback((data: SSEEvent) => {
    if (!data.type) return;

    switch (data.type) {
      case SSEEventType.THINKING:
        appendContentChunk(BlockType.THINKING, data.data.content);
        break;

      case SSEEventType.TEXT:
        appendContentChunk(BlockType.TEXT, data.data.content);
        break;

      case SSEEventType.TOOL_CALL_START: {
        const id = nextBlockId();
        streamingBlockIdRef.current = id;
        setStreamingBlocks((prev) => {
          const blocks = ensureBlockConsistency(prev);
          return [
            ...blocks,
            {
              type: BlockType.TOOL_CALL,
              name: data.data.name,
              args: data.data.args,
              result: null,
              done: false,
              id,
            },
          ];
        });
        break;
      }

      case SSEEventType.TOOL_CALL_RESULT: {
        setStreamingBlocks((prev) => {
          const blocks = ensureBlockConsistency(prev);
          const idx = blocks.findLastIndex(
            (b) => b.type === BlockType.TOOL_CALL && !b.done,
          );
          if (idx === -1) return blocks;
          const block = blocks[idx];
          if (block.type !== BlockType.TOOL_CALL) return blocks;

          const updated = [...blocks];
          updated[idx] = { ...block, result: data.data.result, done: true };
          return updated;
        });
        break;
      }

      case SSEEventType.PLOTLY:
        appendJsonBlock(BlockType.PLOTLY, data.data.json);
        break;

      case SSEEventType.DATA_TABLE:
        appendJsonBlock(BlockType.DATA_TABLE, data.data.json);
        break;

      case SSEEventType.DONE:
        commitMessage();
        break;

      case SSEEventType.ERROR:
        commitMessage([{
          type: BlockType.ERROR,
          message: data.data.message,
          id: nextBlockId(),
          done: true,
        }]);
        break;

      case SSEEventType.WARNING:
        setStreamingBlocks((prev) => {
          const blocks = ensureBlockConsistency(prev);
          return [
            ...blocks,
            {
              type: BlockType.WARNING,
              message: data.data.message,
              id: nextBlockId(),
              done: true,
            },
          ];
        });
        break;

      case SSEEventType.RETRYING:
        appendContentChunk(BlockType.THINKING, data.data.message);
        break;
    }
  }, []);

  const { connect, disconnect } = useSSE(email, handleSSEMessage);

  // --- Envoi de message ---

  /**
   * Envoie un message utilisateur et démarre le streaming SSE
   *
   * Flow:
   * 1. Ajoute le message user dans messages[]
   * 2. Pré-assigne un ID au message assistant (streamingMessageIdRef)
   * 3. Ouvre la connexion SSE (connect)
   * 4. POST /api/chat → backend publie dans Redis → agent commence le traitement
   * 5. Les événements SSE arrivent dans handleSSEMessage
   */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || !email) return;

      setMessages((prev) => [
        ...prev,
        { id: nextMessageId(), role: "user" as const, content: text.trim() },
      ]);
      setIsLoading(true);
      setStreamingBlocks([]);
      // Pré-assigne un ID stable pour le message assistant qui va streamer.
      // Ce même ID sera utilisé à la finalisation (DONE) pour que React garde
      // la même instance du composant → animations fluides.
      streamingMessageIdRef.current = nextMessageId();

      connect();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, message: text.trim() }),
        });
        if (!res.ok) throw new Error("Erreur serveur");
      } catch (err) {
        console.error("Erreur envoi message:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: nextMessageId(),
            role: "assistant" as const,
            blocks: [
              {
                id: nextBlockId(),
                type: BlockType.ERROR,
                message: "Erreur de connexion au serveur.",
                done: true,
              },
            ],
          },
        ]);
        resetStreamingState();
        disconnect();
      }
    },
    [email, isLoading, connect, disconnect],
  );

  // Reset complet : vide l'historique, le streaming, et déconnecte le SSE
  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingBlocks([]);
    resetStreamingState();
    disconnect();
  }, [disconnect]);

  // Arrête la réponse en cours de streaming
  // Envoie un signal de cancellation au backend et ferme la connexion SSE
  const stopResponse = useCallback(async () => {
    if (!email || !isLoading) return;

    try {
      await fetch(`/api/chat/cancel/${encodeURIComponent(email)}`, {
        method: "POST",
      });
    } catch (err) {
      console.error("Erreur arrêt réponse:", err);
    }

    // Finalise les blocs en cours et ferme la connexion
    commitMessage();
    disconnect();
  }, [email, isLoading, disconnect]);

  return {
    messages,
    streamingBlocks,
    isLoading,
    sendMessage,
    clearMessages,
    stopResponse,
    streamingMessageId: streamingMessageIdRef.current,
  };
}
