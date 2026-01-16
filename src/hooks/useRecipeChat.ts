import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateRecipe } from './useRecipes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ExtractedRecipe {
  title: string;
  servings: number;
  ingredients: Array<{
    name: string;
    quantity: string;
    unit: string;
    category: string;
  }>;
  steps: Array<{
    order: number;
    text: string;
  }>;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  extractedRecipe: ExtractedRecipe | null;
  updatedAt: Date;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Bonjour ! 👨‍🍳 Je suis votre assistant culinaire. Dites-moi ce qui vous ferait plaisir aujourd'hui, et construisons ensemble votre recette idéale !",
  timestamp: new Date(),
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-recipe`;

// Parse DB conversation to our type
function parseConversation(data: any): Conversation {
  const messages = (data.messages as any[]).map((m: any) => ({
    ...m,
    timestamp: new Date(m.timestamp),
  }));
  
  return {
    id: data.id,
    title: data.title,
    messages,
    extractedRecipe: data.extracted_recipe as ExtractedRecipe | null,
    updatedAt: new Date(data.updated_at),
  };
}

export function useRecipeChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [extractedRecipe, setExtractedRecipe] = useState<ExtractedRecipe | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentConversationIdRef = useRef<string | null>(null);
  
  const navigate = useNavigate();
  const createRecipe = useCreateRecipe();

  // Keep ref in sync with state
  currentConversationIdRef.current = currentConversationId;

  // Load recent conversations on mount
  useEffect(() => {
    loadRecentConversations();
  }, []);

  const loadRecentConversations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoadingHistory(false);
        return;
      }

      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(3);

      if (error) throw error;

      setRecentConversations((data || []).map(parseConversation));
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Auto-save conversation after changes (debounced)
  const saveConversation = useCallback(async (
    msgs: ChatMessage[], 
    recipe: ExtractedRecipe | null,
    convId: string | null
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Filter out welcome message for storage
      const messagesToSave = msgs.filter(m => m.id !== 'welcome').map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      }));

      // Generate title from first user message
      const firstUserMessage = msgs.find(m => m.role === 'user');
      const title = firstUserMessage 
        ? firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')
        : 'Nouvelle conversation';

      if (convId) {
        // Update existing conversation
        const { error } = await supabase
          .from('ai_conversations')
          .update({
            title,
            messages: messagesToSave as unknown as Json,
            extracted_recipe: recipe as unknown as Json,
          })
          .eq('id', convId);

        if (error) throw error;
        return convId;
      } else {
        // Create new conversation
        const { data, error } = await supabase
          .from('ai_conversations')
          .insert({
            user_id: user.id,
            title,
            messages: messagesToSave as unknown as Json,
            extracted_recipe: recipe as unknown as Json,
          })
          .select()
          .single();

        if (error) throw error;
        return data.id;
      }
    } catch (error) {
      console.error('Error saving conversation:', error);
      return null;
    }
  }, []);

  // Debounced save - uses ref to avoid stale closure issues
  const debouncedSave = useCallback((msgs: ChatMessage[], recipe: ExtractedRecipe | null) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const convId = currentConversationIdRef.current;
      const newId = await saveConversation(msgs, recipe, convId);
      if (newId && !convId) {
        setCurrentConversationId(newId);
      }
      // Refresh history
      loadRecentConversations();
    }, 1000);
  }, [saveConversation]);

  const loadConversation = useCallback((conversation: Conversation) => {
    // Add welcome message back at the start
    setMessages([WELCOME_MESSAGE, ...conversation.messages]);
    setExtractedRecipe(conversation.extractedRecipe);
    setCurrentConversationId(conversation.id);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsStreaming(true);

    // Prepare messages for API (exclude welcome message id, just send role/content)
    const apiMessages = newMessages.filter(m => m.id !== 'welcome').map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      abortControllerRef.current = new AbortController();
      
      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Vous devez être connecté pour utiliser l\'assistant');
      }
      
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: apiMessages }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur de communication avec l\'IA');
      }

      if (!response.body) {
        throw new Error('Pas de réponse du serveur');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let toolCallArguments = '';
      let buffer = '';
      let newExtractedRecipe: ExtractedRecipe | null = null;

      // Create assistant message placeholder
      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta;

            if (delta) {
              // Handle text content
              if (delta.content) {
                assistantContent += delta.content;
                setMessages(prev => prev.map(m => 
                  m.id === assistantMessageId 
                    ? { ...m, content: assistantContent }
                    : m
                ));
              }

              // Handle tool calls
              if (delta.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  if (toolCall.function?.arguments) {
                    toolCallArguments += toolCall.function.arguments;
                  }
                }
              }
            }

            // Check for finish reason
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === 'tool_calls' && toolCallArguments) {
              try {
                const recipe = JSON.parse(toolCallArguments);
                console.log('Recipe extracted:', recipe);
                newExtractedRecipe = recipe;
                setExtractedRecipe(recipe);
                
                // Add a message about the recipe being ready
                if (!assistantContent.includes('recette')) {
                  assistantContent += "\n\n✨ Votre recette est prête ! Vous pouvez la consulter et l'enregistrer ci-dessous.";
                  setMessages(prev => prev.map(m => 
                    m.id === assistantMessageId 
                      ? { ...m, content: assistantContent }
                      : m
                  ));
                }
              } catch (e) {
                console.error('Failed to parse recipe:', e, toolCallArguments);
              }
            }
          } catch {
            // Incomplete JSON, put back in buffer
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // Save conversation after streaming completes - use newExtractedRecipe directly
      // to avoid stale extractedRecipe from closure
      setMessages(prev => {
        debouncedSave(prev, newExtractedRecipe);
        return prev;
      });

      // Trigger preference extraction in background (non-blocking)
      // Session is already retrieved above, reuse it
      if (session?.user) {
        const allMessages = newMessages.filter(m => m.id !== 'welcome').map(m => ({
          role: m.role,
          content: m.content,
        }));
        
        // Fire and forget - don't await
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-user-preferences`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ messages: allMessages, userId: session.user.id }),
        }).catch(err => console.log('Preference extraction failed (non-critical):', err));
      }

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Chat error:', error);
        toast.error((error as Error).message || 'Erreur lors de la communication');
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [messages, isStreaming, debouncedSave]);

  const saveRecipe = useCallback(async () => {
    if (!extractedRecipe || isSaving) return;

    setIsSaving(true);
    try {
      // Convert string quantities to numbers for the Ingredient type
      const ingredients = extractedRecipe.ingredients.map(ing => ({
        name: ing.name,
        quantity: parseFloat(ing.quantity) || 0,
        unit: ing.unit,
        category: ing.category,
      }));

      await createRecipe.mutateAsync({
        title: extractedRecipe.title,
        servings: extractedRecipe.servings,
        ingredients,
        steps: extractedRecipe.steps,
        source_type: 'ai',
        status: 'draft',
        is_favorite: false,
        season: null,
        nutrition_tags: null,
        calorie_score: null,
        ai_summary: null,
        source_image_url: null,
      });

      // Delete the conversation after saving the recipe
      if (currentConversationId) {
        await supabase
          .from('ai_conversations')
          .delete()
          .eq('id', currentConversationId);
      }

      toast.success('Recette enregistrée avec succès !');
      navigate('/');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setIsSaving(false);
    }
  }, [extractedRecipe, isSaving, createRecipe, navigate, currentConversationId]);

  const resetChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setMessages([WELCOME_MESSAGE]);
    setExtractedRecipe(null);
    setCurrentConversationId(null);
    setIsStreaming(false);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('ai_conversations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setRecentConversations(prev => prev.filter(c => c.id !== id));
      
      if (currentConversationId === id) {
        resetChat();
      }

      toast.success('Conversation supprimée');
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast.error('Erreur lors de la suppression');
    }
  }, [currentConversationId, resetChat]);

  return {
    messages,
    isStreaming,
    extractedRecipe,
    isSaving,
    recentConversations,
    isLoadingHistory,
    currentConversationId,
    sendMessage,
    saveRecipe,
    resetChat,
    loadConversation,
    deleteConversation,
  };
}
