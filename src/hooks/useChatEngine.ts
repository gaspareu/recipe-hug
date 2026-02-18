import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  timestamp: Date;
}

export type MessageContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

export type ChatMode = 'orchestration' | 'creating' | 'cooking' | 'editing' | 'memory';

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
  ingredients: any[];
  steps: any[];
  isUpdate?: boolean;
  originalRecipeId?: string;
  relationToOriginal?: string;
}

export interface ActiveRecipeData {
  id: string;
  title: string;
  servings?: number | null;
  season?: string | null;
  ingredients?: any[];
  steps?: any[];
  completedSteps?: number[];
}

export interface ModeSwitchResult {
  modeSwitch: ChatMode;
  recipe?: ActiveRecipeData;
  initialContext?: string;
}

export interface ChatEngineConfig {
  welcomeMessage: string;
  initialMode: ChatMode;
  initialActiveRecipe: ActiveRecipeData | null;
  /** Handle a tool call; return ModeSwitchResult to trigger agent continuation */
  onToolCall: (action: ToolCallAction) => Promise<any>;
  /** Build request body for the main send. Returns { endpoint, body } */
  buildRequest: (params: {
    apiMessages: Array<{ role: string; content: MessageContent }>;
    mode: ChatMode;
    activeRecipe: ActiveRecipeData | null;
  }) => Promise<{ endpoint: string; body: Record<string, any> }>;
  /** Build request body for agent continuation after mode switch */
  buildContinuationRequest: (params: {
    newMode: ChatMode;
    recipe: ActiveRecipeData | null;
    initialContext: string;
  }) => Promise<{ endpoint: string; body: Record<string, any> }>;
  /** Called when mode changes */
  onModeChange?: (mode: ChatMode) => void;
  /** Called when activeRecipe changes */
  onActiveRecipeChange?: (recipe: ActiveRecipeData | null) => void;
  /** Called when pendingRecipe changes */
  onPendingRecipeChange?: (recipe: PendingRecipe | null) => void;
}

export function useChatEngine(config: ChatEngineConfig) {
  const {
    welcomeMessage,
    initialMode,
    initialActiveRecipe,
    onToolCall,
    buildRequest,
    buildContinuationRequest,
  } = config;

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: welcomeMessage, timestamp: new Date() },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<ChatMode>(initialMode);
  const [activeRecipe, setActiveRecipe] = useState<ActiveRecipeData | null>(initialActiveRecipe);
  const [pendingRecipe, setPendingRecipe] = useState<PendingRecipe | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const pendingModeSwitchRef = useRef<{
    newMode: ChatMode;
    recipe: ActiveRecipeData | null;
    initialContext: string;
  } | null>(null);

  // Expose setters for tool call handlers
  const stateSetters = useRef({ setMode, setActiveRecipe, setPendingRecipe, setSearchResults, setMessages });
  stateSetters.current = { setMode, setActiveRecipe, setPendingRecipe, setSearchResults, setMessages };

  // --- SSE streaming parser (shared) ---
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
            await executeToolCall(toolCallName, toolCallArguments, assistantMessageId, userContent, (c) => { assistantContent = c; });
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
      await executeToolCall(toolCallName, toolCallArguments, assistantMessageId, userContent, (c) => { assistantContent = c; });
    }

    // Fallback: parse actions from text
    assistantContent = parseTextActions(assistantContent, assistantMessageId, userContent);

    return assistantContent;
  }, []);

  const executeToolCall = useCallback(async (
    name: string,
    argsStr: string,
    assistantMessageId: string,
    userContent: string,
    setContent: (c: string) => void,
  ) => {
    try {
      const args = JSON.parse(argsStr);
      const result = await onToolCall({ type: name, data: args });

      // Handle search results
      if (name === 'search_recipes' && result) {
        const list = result as SearchResult[];
        // Get current content from messages
        let currentContent = '';
        setMessages(prev => {
          const msg = prev.find(m => m.id === assistantMessageId);
          currentContent = msg?.content || '';
          return prev;
        });
        
        if (list.length === 0) {
          currentContent += "\n\nJe n'ai trouvé aucune recette correspondante. Tu veux que je t'en crée une nouvelle ?";
        } else {
          currentContent += '\n\n**Résultats trouvés :**\n';
          list.forEach((r, i) => {
            const statusLabel = { draft: '📝 brouillon', tested: '🧪 testée', validated: '✅ validée', archived: '📦 archivée' }[r.status] || r.status;
            currentContent += `${i + 1}. **${r.title}** - ${statusLabel}${r.is_favorite ? ' ⭐' : ''}\n`;
          });
          currentContent += '\nDis-moi laquelle tu veux ouvrir, cuisiner ou modifier !';
        }
        setContent(currentContent);
        setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: currentContent } : m));
      }

      // Handle mode switch
      if (result && typeof result === 'object' && 'modeSwitch' in result) {
        const ms = result as ModeSwitchResult;
        pendingModeSwitchRef.current = {
          newMode: ms.modeSwitch,
          recipe: ms.recipe || null,
          initialContext: ms.initialContext || userContent,
        };
      }
    } catch (e) {
      console.error('Failed to parse/execute tool call:', e, argsStr);
    }
  }, [onToolCall]);

  const parseTextActions = useCallback((content: string, assistantMessageId: string, userContent: string): string => {
    const actionRegex = /\{\s*"action"\s*:\s*"([^"]+)"\s*,\s*"parameters"\s*:\s*(\{[^}]*\})\s*\}/g;
    let match;
    let cleaned = content;

    while ((match = actionRegex.exec(content)) !== null) {
      const actionType = match[1];
      try {
        const parameters = JSON.parse(match[2]);
        const actionMap: Record<string, string> = {
          start_recipe_creation: 'start_recipe_creation', start_cooking: 'start_cooking',
          start_editing: 'start_editing', search_recipes: 'search_recipes',
          open_recipe: 'open_recipe', navigate: 'navigate',
          start_memory: 'start_memory', save_recipe: 'save_recipe',
        };
        const toolType = actionMap[actionType];
        if (toolType) {
          onToolCall({ type: toolType, data: { ...parameters } }).then(result => {
            if (result && typeof result === 'object' && 'modeSwitch' in result) {
              const ms = result as ModeSwitchResult;
              pendingModeSwitchRef.current = {
                newMode: ms.modeSwitch,
                recipe: ms.recipe || null,
                initialContext: ms.initialContext || userContent,
              };
            }
          });
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
  }, [onToolCall]);

  // Continue conversation with new agent after mode switch
  const continueWithNewAgent = useCallback(async (
    newMode: ChatMode,
    recipe: ActiveRecipeData | null,
    initialContext: string,
    previousAssistantMessageId: string,
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const { endpoint, body } = await buildContinuationRequest({ newMode, recipe, initialContext });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
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
                m.id === previousAssistantMessageId ? { ...m, content: assistantContent } : m
              ));
            }
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error continuing with new agent:', error);
    }
  }, [buildContinuationRequest]);

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
    setIsStreaming(true);
    setSearchResults([]);

    const assistantMessageId = `assistant-${Date.now()}`;

    try {
      const apiMessages = [...messages.filter(m => m.id !== 'welcome'), userMessage].map(m => {
        if (m.imageUrl) {
          const parts: MessageContent = [];
          if (m.content && m.content !== '📷 Image envoyée') parts.push({ type: 'text', text: m.content });
          parts.push({ type: 'image_url', image_url: { url: m.imageUrl } });
          return { role: m.role, content: parts };
        }
        return { role: m.role, content: m.content };
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Vous devez être connecté');

      const { endpoint, body } = await buildRequest({ apiMessages, mode, activeRecipe });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (response.status === 429) { toast.error('Trop de requêtes, réessaie dans un moment'); return; }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Erreur de communication avec l'assistant");
      }
      if (!response.body) throw new Error('No response body');

      setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() }]);

      const reader = response.body.getReader();
      await parseSSEStream(reader, assistantMessageId, content);

      // After streaming, check for mode switch continuation
      if (pendingModeSwitchRef.current) {
        const { newMode, recipe, initialContext } = pendingModeSwitchRef.current;
        pendingModeSwitchRef.current = null;
        await new Promise(resolve => setTimeout(resolve, 500));
        await continueWithNewAgent(newMode, recipe, initialContext, assistantMessageId);
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur de communication');
      setMessages(prev => prev.filter(m => m.id !== assistantMessageId));
      pendingModeSwitchRef.current = null;
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, mode, activeRecipe, buildRequest, parseSSEStream, continueWithNewAgent]);

  const resetChat = useCallback(() => {
    setMessages([{ id: 'welcome', role: 'assistant', content: welcomeMessage, timestamp: new Date() }]);
    setMode(initialMode);
    setActiveRecipe(initialActiveRecipe);
    setPendingRecipe(null);
    setSearchResults([]);
  }, [welcomeMessage, initialMode, initialActiveRecipe]);

  const getModeInfo = useCallback(() => {
    switch (mode) {
      case 'creating': return { label: 'Création', icon: '✨', color: 'bg-primary/10 text-primary' };
      case 'cooking': return { label: 'En cuisine', icon: '👨‍🍳', color: 'bg-green-500/10 text-green-600' };
      case 'editing': return { label: 'Modification', icon: '🔧', color: 'bg-orange-500/10 text-orange-600' };
      case 'memory': return { label: 'Mémoire', icon: '🧠', color: 'bg-purple-500/10 text-purple-600' };
      default: return null;
    }
  }, [mode]);

  return {
    messages, isStreaming, mode, activeRecipe, pendingRecipe, searchResults,
    setMode, setActiveRecipe, setPendingRecipe, setSearchResults, setMessages,
    sendMessage, resetChat, getModeInfo,
  };
}
