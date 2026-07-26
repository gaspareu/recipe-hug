import { useState, useCallback, useRef, useEffect } from 'react';

import { supabase } from '@/integrations/supabase/client';
import type { Ingredient, Step } from '@/types/recipe';

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
    let toolCallName = '';
    let toolCallArguments = '';

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
        if (jsonStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            assistantContent += delta.content;
            setMessages(prev => prev.map(m =>
              m.id === assistantMessageId ? { ...m, content: assistantContent } : m
            ));
          }

          if (delta?.tool_calls) {
            for (const toolCall of delta.tool_calls) {
              if (toolCall.function?.name) toolCallName = toolCall.function.name;
              if (toolCall.function?.arguments) toolCallArguments += toolCall.function.arguments;
            }
          }

          const finishReason = parsed.choices?.[0]?.finish_reason;
          if (finishReason === 'tool_calls' && toolCallName && toolCallArguments) {
            assistantContent = await executeToolCall(toolCallName, toolCallArguments, assistantMessageId, assistantContent);
            toolCallName = '';
            toolCallArguments = '';
          }
        } catch {
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }

    // Fallback: execute accumulated tool call if finish_reason was missing
    if (toolCallName && toolCallArguments) {
      assistantContent = await executeToolCall(toolCallName, toolCallArguments, assistantMessageId, assistantContent);
    }

    // Fallback: parse actions from text
    assistantContent = parseTextActions(assistantContent, assistantMessageId);

    return assistantContent;
  }, [executeToolCall, parseTextActions]);

  // Convertit les messages du fil en messages au format attendu par l'API.
  const toApiMessages = useCallback((chatMessages: ChatMessage[]): Array<{ role: string; content: MessageContent }> => {
    return chatMessages.filter(m => m.id !== 'welcome').map(m => {
      if (m.imageUrl) {
        const parts: MessageContent = [];
        if (m.content && m.content !== '📷 Image envoyée') parts.push({ type: 'text', text: m.content });
        parts.push({ type: 'image_url', image_url: { url: m.imageUrl } });
        return { role: m.role, content: parts };
      }
      return { role: m.role, content: m.content };
    });
  }, []);

  // Envoie la requête à l'assistant et stream la réponse dans un nouveau message.
  const runAssistantRequest = useCallback(async (
    apiMessages: Array<{ role: string; content: MessageContent }>,
    lastUserContent: string,
  ) => {
    setIsStreaming(true);
    setSearchResults([]);
    retryWithRecipeRef.current = null;

    const assistantMessageId = `assistant-${Date.now()}`;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

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
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Arrêt volontaire : on garde le contenu déjà streamé tel quel.
        return;
      }
      console.error('Chat error:', error);
      // Affiche l'erreur dans le fil plutôt que de la masquer : l'utilisateur
      // doit savoir que sa demande a échoué (crédits IA épuisés, réseau, etc.).
      const message = error instanceof Error ? error.message : "Erreur de communication avec l'assistant";
      setMessages(prev => [
        ...prev.filter(m => m.id !== assistantMessageId),
        { id: `error-${Date.now()}`, role: 'assistant', content: `⚠️ ${message}`, timestamp: new Date() },
      ]);
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
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
    if ((!content.trim() && !imageDataUrl) || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim() || (imageDataUrl ? '📷 Image envoyée' : ''),
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
    if (isStreaming) return;

    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user');
    if (lastUserIndex === -1) return;

    const truncated = messages.slice(0, lastUserIndex + 1);
    setMessages(truncated);

    const apiMessages = toApiMessages(truncated);
    await runAssistantRequest(apiMessages, truncated[lastUserIndex].content);
  }, [messages, isStreaming, toApiMessages, runAssistantRequest]);

  const resetChat = useCallback(() => {
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
