import { useState, useCallback, useRef } from 'react';

import { supabase } from '@/integrations/supabase/client';
import type { Ingredient, Step } from '@/types/recipe';

export interface RecipeCard {
  id: string;
  title: string;
  servings: number;
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
  /** Handle a tool call */
  onToolCall: (action: ToolCallAction) => Promise<unknown>;
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
  onToolCallRef.current = config.onToolCall;
  const buildRequestRef = useRef(config.buildRequest);
  buildRequestRef.current = config.buildRequest;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: welcomeMessage, timestamp: new Date() },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeRecipe, setActiveRecipe] = useState<ActiveRecipeData | null>(initialActiveRecipe);
  const [pendingRecipe, setPendingRecipe] = useState<PendingRecipe | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // Keep mutable refs for state that needs to be read during streaming
  const activeRecipeRef = useRef(activeRecipe);
  activeRecipeRef.current = activeRecipe;

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
      const result = await onToolCallRef.current({ type: name, data: args });

      // Handle search results
      if (name === 'search_recipes' && result) {
        const list = result as SearchResult[];
        let content = currentContent;

        if (list.length === 0) {
          content += "\n\nJe n'ai trouvé aucune recette correspondante. Tu veux que je t'en crée une nouvelle ?";
        } else {
          content += '\n\n**Résultats trouvés :**\n';
          list.forEach((r, i) => {
            const statusLabel = { draft: '📝 brouillon', tested: '🧪 testée', validated: '✅ validée', archived: '📦 archivée' }[r.status] || r.status;
            content += `${i + 1}. **${r.title}** - ${statusLabel}${r.is_favorite ? ' ⭐' : ''}\n`;
          });
          content += '\nDis-moi laquelle tu veux ouvrir, cuisiner ou modifier !';
        }
        setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content } : m));
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
          create_new_recipe: 'create_new_recipe',
          get_preferences: 'get_preferences', update_preferences: 'update_preferences',
        };
        const toolType = actionMap[actionType];
        if (toolType) {
          onToolCallRef.current({ type: toolType, data: { ...parameters } });
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

    const assistantMessageId = `assistant-${Date.now()}`;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Vous devez être connecté');

      const { endpoint, body } = await buildRequestRef.current({ apiMessages, activeRecipe });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Erreur de communication avec l'assistant");
      }
      if (!response.body) throw new Error('No response body');

      setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }]);

      const reader = response.body.getReader();
      await parseSSEStream(reader, assistantMessageId, lastUserContent);
    } catch (error) {
      console.error('Chat error:', error);
      // Affiche l'erreur dans le fil plutôt que de la masquer : l'utilisateur
      // doit savoir que sa demande a échoué (crédits IA épuisés, réseau, etc.).
      const message = error instanceof Error ? error.message : "Erreur de communication avec l'assistant";
      setMessages(prev => [
        ...prev.filter(m => m.id !== assistantMessageId),
        { id: `error-${Date.now()}`, role: 'assistant', content: `⚠️ ${message}`, timestamp: new Date() },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }, [activeRecipe, parseSSEStream]);

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
  }, [welcomeMessage, initialActiveRecipe]);

  return {
    messages, isStreaming, activeRecipe, pendingRecipe, searchResults,
    setActiveRecipe, setPendingRecipe, setSearchResults, setMessages,
    sendMessage, resetChat, regenerateResponse,
  };
}
