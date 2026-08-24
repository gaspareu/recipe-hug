import { useState, useCallback, useRef, useEffect } from 'react';

import { supabase } from '@/integrations/supabase/client';
import type { Ingredient, Step } from '@/types/recipe';

// A long-running conversation must never hit the Edge Function's message
// limit. Keeping a recent, coherent window also bounds prompt cost and latency.
const MAX_API_MESSAGES = 30;
const IMAGE_SENTINEL = '📷 Image envoyée';
const SUGGESTIONS_REGEX = /\[suggestions\]\s*\[.*?\]\s*\[\/suggestions\]/s;
const STREAM_TIMEOUT_MS = 90_000;

export type RecipeCardStatus = 'proposed' | 'saved';

export interface RecipeCard {
  /** Présent uniquement en état 'saved' (recette en DB). */
  id?: string;
  status: RecipeCardStatus;
  title: string;
  servings: number;
  ingredients: Ingredient[];
  stepsCount: number;
  intro?: string[];
  introClosing?: string;
  tip?: string;
  isUpdate: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  timestamp: Date;
  /** Carte de recette affichée après création/mise à jour, avec lien vers la fiche */
  recipeCard?: RecipeCard;
  /** Cartes des résultats de recherche (branché en Task 4) */
  recipeCards?: RecipeCard[];
}

export type MessageContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

export interface ToolCallAction {
  type: string;
  data: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  title: string;
  status: string;
  is_favorite: boolean;
}

export interface PendingRecipe {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  steps: Step[];
  intro?: string[];
  introClosing?: string;
  tip?: string;
  isUpdate?: boolean;
  originalRecipeId?: string;
  relationToOriginal?: string;
}

export interface ActiveRecipeData {
  id: string;
  title: string;
  servings?: number | null;
  season?: string | null;
  ingredients?: Ingredient[];
  steps?: Step[];
  completedSteps?: number[];
}

export interface ChatEngineConfig {
  welcomeMessage: string;
  initialActiveRecipe: ActiveRecipeData | null;
  /** Handle a tool call. Reçoit la recette active courante, comme buildRequest. */
  onToolCall: (action: ToolCallAction, activeRecipe: ActiveRecipeData | null) => Promise<unknown>;
  /** Build request body for the send */
  buildRequest: (params: {
    apiMessages: Array<{ role: string; content: MessageContent }>;
    activeRecipe: ActiveRecipeData | null;
  }) => Promise<{ endpoint: string; body: Record<string, unknown> }>;
  /** Called when activeRecipe changes */
  onActiveRecipeChange?: (recipe: ActiveRecipeData | null) => void;
  /** Called when pendingRecipe changes */
  onPendingRecipeChange?: (recipe: PendingRecipe | null) => void;
}

export function useChatEngine(config: ChatEngineConfig) {
  const { welcomeMessage, initialActiveRecipe } = config;

  // Use refs for callbacks to avoid stale closures in streaming
  const onToolCallRef = useRef(config.onToolCall);
  const buildRequestRef = useRef(config.buildRequest);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: welcomeMessage, timestamp: new Date() },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  // State updates are asynchronous. This ref prevents two synchronous sources
  // (voice, keyboard, pointer) from starting concurrent assistant requests.
  const isStreamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [activeRecipe, setActiveRecipe] = useState<ActiveRecipeData | null>(initialActiveRecipe);
  const [pendingRecipe, setPendingRecipe] = useState<PendingRecipe | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // Stocke les recettes en attente de confirmation, indexées par messageId.
  // Permet à useHomeChat de les récupérer pour createProposedRecipe.
  const proposedPendingRef = useRef<Map<string, PendingRecipe>>(new Map());

  const getProposedPending = useCallback(
    (messageId: string): PendingRecipe | null => proposedPendingRef.current.get(messageId) ?? null,
    [],
  );

  const clearProposedPending = useCallback((messageId: string) => {
    proposedPendingRef.current.delete(messageId);
  }, []);

  const updateMessageCard = useCallback((messageId: string, patch: Partial<RecipeCard>) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId && m.recipeCard ? { ...m, recipeCard: { ...m.recipeCard, ...patch } } : m,
    ));
  }, []);

  // Recette active lue pendant le streaming (les callbacks sont mémoïsés sans
  // `activeRecipe` en dépendance, pour éviter les closures périmées) : elle est
  // injectée en 2e argument d'onToolCall. Synchronisée après le rendu, et de façon
  // synchrone dans executeToolCall (get_recipe_details) pour l'auto-retry.
  const activeRecipeRef = useRef(activeRecipe);

  // Les refs « dernière valeur » sont mises à jour après le commit (elles ne sont
  // lues que dans des callbacks asynchrones de streaming, jamais pendant le rendu).
  useEffect(() => {
    onToolCallRef.current = config.onToolCall;
    buildRequestRef.current = config.buildRequest;
    activeRecipeRef.current = activeRecipe;
  });

  // Tracks a recipe loaded via get_recipe_details during a streaming turn,
  // so runAssistantRequest can retry with the enriched context.
  const retryWithRecipeRef = useRef<ActiveRecipeData | null>(null);

  // Exécute un tool call et retourne le contenu (éventuellement enrichi) du
  // message assistant. Le contenu courant est passé par le parser : le relire
  // via un updater setMessages à effet de bord n'est pas fiable (React peut
  // différer son exécution et le batch écraserait alors le contenu ajouté).
  const executeToolCall = useCallback(async (
    name: string,
    argsStr: string,
    assistantMessageId: string,
    currentContent: string,
  ): Promise<string> => {
    try {
      const args = JSON.parse(argsStr);
      const result = await onToolCallRef.current({ type: name, data: args }, activeRecipeRef.current);

      // Handle get_recipe_details: store recipe for auto-retry, don't alter content
      if (name === 'get_recipe_details' && result) {
        const recipe = result as ActiveRecipeData;
        // Synchronise le ref immédiatement : l'auto-retry (extract_modified_recipe)
        // survient dans le même tour, avant tout re-rendu — c'est cette valeur qui
        // sera injectée en 2e argument d'onToolCall au tour suivant.
        activeRecipeRef.current = recipe;
        setActiveRecipe(recipe);
        retryWithRecipeRef.current = recipe;
        return currentContent;
      }

      // Handle { card, pending } : carte de recette proposée (useHomeChat uniquement).
      // useRecipeChat renvoie null pour ces mêmes outils (setPendingRecipe), donc ce
      // bloc ne s'exécute que si le handler a renvoyé un objet avec 'card' et 'pending'.
      if (result && typeof result === 'object' && 'card' in result && 'pending' in result) {
        const { card, pending } = result as { card: RecipeCard; pending: PendingRecipe };
        proposedPendingRef.current.set(assistantMessageId, pending);
        setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, recipeCard: card } : m));
        return currentContent;
      }

      // Handle search results — accepte le nouveau format { summaries, cards }
      // (useHomeChat) ou le format tableau legacy (useRecipeChat / tests directs).
      if (name === 'search_recipes' && result) {
        const { summaries, cards } = Array.isArray(result)
          ? { summaries: result as SearchResult[], cards: [] as RecipeCard[] }
          : result as { summaries: SearchResult[]; cards: RecipeCard[] };
        let content = currentContent;
        content += summaries.length === 0
          ? "\n\nJe n'ai trouvé aucune recette correspondante. Tu veux que je t'en crée une nouvelle ?"
          : `\n\nJ'ai trouvé : ${summaries.map(r => r.title).join(', ')}.`;
        setMessages(prev => prev.map(m => m.id === assistantMessageId
          ? { ...m, content, recipeCards: cards.length > 0 ? cards : undefined }
          : m));
        return content;
      }
    } catch (e) {
      console.error('Failed to parse/execute tool call:', e, argsStr);
    }
    return currentContent;
  }, []);

  const parseTextActions = useCallback((content: string, assistantMessageId: string): string => {
    const actionRegex = /\{\s*"action"\s*:\s*"([^"]+)"\s*,\s*"parameters"\s*:\s*(\{[^}]*\})\s*\}/g;
    let match;
    let cleaned = content;

    while ((match = actionRegex.exec(content)) !== null) {
      const actionType = match[1];
      try {
        const parameters = JSON.parse(match[2]);
        const actionMap: Record<string, string> = {
          search_recipes: 'search_recipes', open_recipe: 'open_recipe',
          navigate: 'navigate', save_recipe: 'save_recipe',
          extract_modified_recipe: 'extract_modified_recipe',
          create_new_recipe: 'create_new_recipe', propose_recipe: 'propose_recipe',
          get_preferences: 'get_preferences', update_preferences: 'update_preferences',
          start_cooking: 'start_cooking',
        };
        const toolType = actionMap[actionType];
        if (toolType) {
          onToolCallRef.current({ type: toolType, data: { ...parameters } }, activeRecipeRef.current);
        }
        cleaned = cleaned.replace(match[0], '').trim();
      } catch (e) {
        console.error('Failed to parse fallback action:', e);
      }
    }

    if (cleaned !== content) {
      setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: cleaned } : m));
    }
    return cleaned;
  }, []);

  // --- SSE streaming parser ---
  const parseSSEStream = useCallback(async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    assistantMessageId: string,
    userContent: string,
  ) => {
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantContent = '';
    const toolCalls = new Map<number, { name: string; arguments: string }>();
    let pendingAnimationFrame: number | null = null;
    let pendingContent = '';

    const flushContent = () => {
      pendingAnimationFrame = null;
      setMessages(prev => prev.map(m =>
        m.id === assistantMessageId ? { ...m, content: pendingContent } : m,
      ));
    };

    const scheduleContentFlush = () => {
      if (pendingAnimationFrame !== null) return;
      // Coalesce token deltas to one React update per animation frame. The
      // fallback keeps unit tests and older runtimes deterministic.
      if (typeof requestAnimationFrame === 'function') {
        pendingAnimationFrame = requestAnimationFrame(flushContent);
      } else {
        pendingAnimationFrame = -1;
        queueMicrotask(flushContent);
      }
    };

    const flushPendingContent = () => {
      if (pendingAnimationFrame === null) return;
      if (pendingAnimationFrame !== -1 && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(pendingAnimationFrame);
      }
      flushContent();
    };

    const executePendingToolCalls = async () => {
      flushPendingContent();
      for (const { name, arguments: args } of [...toolCalls.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, toolCall]) => toolCall)) {
        if (name && args) {
          assistantContent = await executeToolCall(name, args, assistantMessageId, assistantContent);
        }
      }
      toolCalls.clear();
    };

    let receivedDoneMarker = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value as BufferSource, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          receivedDoneMarker = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            assistantContent += delta.content;
            pendingContent = assistantContent;
            scheduleContentFlush();
          }

          if (delta?.tool_calls) {
            for (const toolCall of delta.tool_calls) {
              const index = typeof toolCall.index === 'number' ? toolCall.index : 0;
              const previous = toolCalls.get(index) ?? { name: '', arguments: '' };
              if (toolCall.function?.name) previous.name = toolCall.function.name;
              if (toolCall.function?.arguments) previous.arguments += toolCall.function.arguments;
              toolCalls.set(index, previous);
            }
          }

          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason === 'tool_calls') {
            await executePendingToolCalls();
          }
        } catch {
          buffer = line + '\n' + buffer;
          break;
        }
      }
      if (receivedDoneMarker) {
        // Some lightweight test readers only implement read(). A browser
        // ReadableStream reader always provides cancel(), but it is optional for
        // this early-exit optimization.
        const cancel = (reader as { cancel?: () => Promise<void> }).cancel;
        if (cancel) await cancel.call(reader).catch(() => {});
        break;
      }
    }

    // Fallback: execute accumulated tool call if finish_reason was missing
    await executePendingToolCalls();
    flushPendingContent();

    // Fallback: parse actions from text
    assistantContent = parseTextActions(assistantContent, assistantMessageId);

    return assistantContent;
  }, [executeToolCall, parseTextActions]);

  // Convertit les messages du fil en messages au format attendu par l'API.
  const toApiMessages = useCallback((chatMessages: ChatMessage[]): Array<{ role: string; content: MessageContent }> => {
    const recentMessages = chatMessages
      .filter(m => m.id !== 'welcome')
      .slice(-MAX_API_MESSAGES);
    // Do not start a provider conversation with an orphan assistant response.
    if (recentMessages[0]?.role === 'assistant') recentMessages.shift();

    return recentMessages.map((m, index) => {
      // An image only needs to be available for the turn in which it was sent.
      // Replaying base64 images on future turns is slow and needlessly expensive.
      const isCurrentImage = Boolean(m.imageUrl) && index === recentMessages.length - 1 && m.role === 'user';
      if (isCurrentImage && m.imageUrl) {
        const parts: MessageContent = [];
        if (m.content && m.content !== IMAGE_SENTINEL) parts.push({ type: 'text', text: m.content });
        parts.push({ type: 'image_url', image_url: { url: m.imageUrl } });
        return { role: m.role, content: parts };
      }
      const content = m.role === 'assistant'
        ? m.content.replace(SUGGESTIONS_REGEX, '').trim()
        : m.content === IMAGE_SENTINEL ? 'Image partagée précédemment.' : m.content;
      return { role: m.role, content };
    });
  }, []);

  // Envoie la requête à l'assistant et stream la réponse dans un nouveau message.
  const runAssistantRequest = useCallback(async (
    apiMessages: Array<{ role: string; content: MessageContent }>,
    lastUserContent: string,
  ) => {
    if (isStreamingRef.current) return;
    isStreamingRef.current = true;
    setIsStreaming(true);
    setSearchResults([]);
    retryWithRecipeRef.current = null;

    const assistantMessageId = `assistant-${Date.now()}`;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, STREAM_TIMEOUT_MS);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Vous devez être connecté');

      const { endpoint, body } = await buildRequestRef.current({ apiMessages, activeRecipe });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Erreur de communication avec l'assistant");
      }
      if (!response.body) throw new Error('No response body');

      setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }]);

      const reader = response.body.getReader();
      await parseSSEStream(reader, assistantMessageId, lastUserContent);

      // Auto-retry: if the AI called get_recipe_details, re-run the same request
      // with the recipe now available as activeRecipe in the system prompt.
      const loadedRecipe = retryWithRecipeRef.current;
      if (loadedRecipe) {
        retryWithRecipeRef.current = null;
        setMessages(prev => prev.filter(m => m.id !== assistantMessageId));
        const { endpoint: ep2, body: body2 } = await buildRequestRef.current({
          apiMessages,
          activeRecipe: loadedRecipe,
        });
        const response2 = await fetch(ep2, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify(body2),
          signal: abortController.signal,
        });
        if (!response2.ok) {
          const errorData = await response2.json().catch(() => ({}));
          throw new Error(errorData.error || "Erreur de communication avec l'assistant");
        }
        if (!response2.body) throw new Error('No response body');
        const retryMessageId = `assistant-${Date.now()}`;
        setMessages(prev => [...prev, { id: retryMessageId, role: 'assistant', content: '', timestamp: new Date() }]);
        const reader2 = response2.body.getReader();
        await parseSSEStream(reader2, retryMessageId, lastUserContent);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError' && !timedOut) {
        // Arrêt volontaire : on garde le contenu déjà streamé tel quel.
        return;
      }
      console.error('Chat error:', error);
      // Affiche l'erreur dans le fil plutôt que de la masquer : l'utilisateur
      // doit savoir que sa demande a échoué (crédits IA épuisés, réseau, etc.).
      const message = timedOut
        ? "La réponse a pris trop de temps. Réessaie."
        : error instanceof Error ? error.message : "Erreur de communication avec l'assistant";
      setMessages(prev => [
        ...prev.filter(m => m.id !== assistantMessageId),
        { id: `error-${Date.now()}`, role: 'assistant', content: `⚠️ ${message}`, timestamp: new Date() },
      ]);
    } finally {
      window.clearTimeout(timeoutId);
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
        isStreamingRef.current = false;
        setIsStreaming(false);
      }
    }
  }, [activeRecipe, parseSSEStream]);

  // Interrompt la réponse en cours de génération.
  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Cleanup au démontage : abandonne toute requête de streaming en cours pour
  // ne pas laisser un fetch/reader actif ni déclencher de setMessages après
  // le démontage du composant.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Send a message
  const sendMessage = useCallback(async (content: string, imageDataUrl?: string) => {
    if ((!content.trim() && !imageDataUrl) || isStreaming || isStreamingRef.current) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim() || (imageDataUrl ? IMAGE_SENTINEL : ''),
      imageUrl: imageDataUrl,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);

    const apiMessages = toApiMessages([...messages.filter(m => m.id !== 'welcome'), userMessage]);
    await runAssistantRequest(apiMessages, content);
  }, [messages, isStreaming, toApiMessages, runAssistantRequest]);

  // Relance la génération de la dernière réponse assistant : on retire les
  // messages assistant qui suivent le dernier message utilisateur et on
  // renvoie la même requête.
  const regenerateResponse = useCallback(async () => {
    if (isStreaming || isStreamingRef.current) return;

    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) return;

    const truncated = messages.slice(0, lastUserIndex + 1);
    setMessages(truncated);

    const apiMessages = toApiMessages(truncated);
    await runAssistantRequest(apiMessages, truncated[lastUserIndex].content);
  }, [messages, isStreaming, toApiMessages, runAssistantRequest]);

  const resetChat = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([{ id: 'welcome', role: 'assistant', content: welcomeMessage, timestamp: new Date() }]);
    setActiveRecipe(initialActiveRecipe);
    setPendingRecipe(null);
    setSearchResults([]);
    proposedPendingRef.current.clear();
  }, [welcomeMessage, initialActiveRecipe]);

  return {
    messages, isStreaming, activeRecipe, pendingRecipe, searchResults,
    setActiveRecipe, setPendingRecipe, setSearchResults, setMessages,
    sendMessage, resetChat, regenerateResponse, stopGeneration,
    getProposedPending, clearProposedPending, updateMessageCard,
  };
}
