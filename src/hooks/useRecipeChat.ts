import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateRecipe } from './useRecipes';
import { toast } from 'sonner';

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

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Bonjour ! 👨‍🍳 Je suis votre assistant culinaire. Dites-moi ce qui vous ferait plaisir aujourd'hui, et construisons ensemble votre recette idéale !",
  timestamp: new Date(),
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-recipe`;

export function useRecipeChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [extractedRecipe, setExtractedRecipe] = useState<ExtractedRecipe | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const navigate = useNavigate();
  const createRecipe = useCreateRecipe();

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);

    // Prepare messages for API (exclude welcome message id, just send role/content)
    const apiMessages = [...messages.filter(m => m.id !== 'welcome'), userMessage].map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      abortControllerRef.current = new AbortController();
      
      const response = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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
      let isToolCall = false;
      let buffer = '';

      // Create assistant message placeholder
      const assistantMessageId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }]);

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
                isToolCall = true;
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
  }, [messages, isStreaming]);

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

      toast.success('Recette enregistrée avec succès !');
      navigate('/');
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setIsSaving(false);
    }
  }, [extractedRecipe, isSaving, createRecipe, navigate]);

  const resetChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([WELCOME_MESSAGE]);
    setExtractedRecipe(null);
    setIsStreaming(false);
  }, []);

  return {
    messages,
    isStreaming,
    extractedRecipe,
    isSaving,
    sendMessage,
    saveRecipe,
    resetChat,
  };
}
