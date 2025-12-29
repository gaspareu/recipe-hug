import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, RotateCcw, Loader2 } from 'lucide-react';
import { useRecipeChat } from '@/hooks/useRecipeChat';
import { RecipePreviewCard } from './RecipePreviewCard';
import { cn } from '@/lib/utils';

const QUICK_SUGGESTIONS = [
  "Une recette végétarienne rapide",
  "Un dessert au chocolat",
  "Un plat de saison",
  "Un repas équilibré pour 4",
];

export function RecipeChatInterface() {
  const {
    messages,
    isStreaming,
    extractedRecipe,
    isSaving,
    sendMessage,
    saveRecipe,
    resetChat,
  } = useRecipeChat();

  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, extractedRecipe]);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const showSuggestions = messages.length === 1; // Only welcome message

  return (
    <div className="flex flex-col h-[600px] border rounded-lg bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-medium text-sm">Assistant Culinaire IA</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetChat}
          disabled={isStreaming || messages.length === 1}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Nouveau
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === 'user' ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  message.role === 'user'
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {message.content || (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Réflexion...
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* Streaming indicator */}
          {isStreaming && messages[messages.length - 1]?.content && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                En train d'écrire...
              </div>
            </div>
          )}

          {/* Recipe preview card */}
          {extractedRecipe && (
            <div className="mt-4">
              <RecipePreviewCard
                recipe={extractedRecipe}
                onSave={saveRecipe}
                isSaving={isSaving}
              />
            </div>
          )}

          {/* Quick suggestions */}
          {showSuggestions && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-2">Suggestions :</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-1.5"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décrivez ce que vous aimeriez cuisiner..."
            className="min-h-[44px] max-h-[120px] resize-none"
            disabled={isStreaming}
            rows={1}
          />
          <Button
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            size="icon"
            className="flex-shrink-0"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Entrée pour envoyer, Shift+Entrée pour nouvelle ligne
        </p>
      </div>
    </div>
  );
}
