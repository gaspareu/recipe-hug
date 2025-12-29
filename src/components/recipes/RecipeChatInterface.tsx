import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, RotateCcw, Loader2, History, Trash2, MessageSquare } from 'lucide-react';
import { useRecipeChat, type Conversation } from '@/hooks/useRecipeChat';
import { RecipePreviewCard } from './RecipePreviewCard';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

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
    recentConversations,
    isLoadingHistory,
    currentConversationId,
    sendMessage,
    saveRecipe,
    resetChat,
    loadConversation,
    deleteConversation,
  } = useRecipeChat();

  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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
    setShowHistory(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
    setShowHistory(false);
  };

  const handleLoadConversation = (conversation: Conversation) => {
    loadConversation(conversation);
    setShowHistory(false);
  };

  const showSuggestions = messages.length === 1 && !showHistory; // Only welcome message

  return (
    <div className="flex flex-col h-[600px] border rounded-lg bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-medium text-sm">Assistant Culinaire IA</h3>
        <div className="flex items-center gap-1">
          {recentConversations.length > 0 && (
            <Button
              variant={showHistory ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              disabled={isStreaming}
            >
              <History className="h-4 w-4 mr-1" />
              Historique
            </Button>
          )}
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
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="border-b p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground mb-2">Conversations récentes :</p>
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : recentConversations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">
              Aucune conversation
            </p>
          ) : (
            <div className="space-y-2">
              {recentConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-md hover:bg-muted transition-colors group",
                    currentConversationId === conv.id && "bg-muted"
                  )}
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <button
                    onClick={() => handleLoadConversation(conv)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm font-medium truncate">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(conv.updatedAt, { addSuffix: true, locale: fr })}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
