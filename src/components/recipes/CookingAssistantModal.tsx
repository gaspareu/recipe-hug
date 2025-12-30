import { useState, useRef, useEffect } from 'react';
import { X, Send, RotateCcw, ChefHat, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCookingAssistant, type ChatMessage } from '@/hooks/useCookingAssistant';
import type { Recipe } from '@/types/recipe';

interface CookingAssistantModalProps {
  recipe: Recipe;
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_SUGGESTIONS = [
  "C'est parti !",
  "Je n'ai pas tous les ingrédients",
  "Comment savoir si c'est cuit ?",
  "Des astuces pour cette recette ?",
];

export function CookingAssistantModal({ recipe, isOpen, onClose }: CookingAssistantModalProps) {
  const { messages, isStreaming, sendMessage, resetChat } = useCookingAssistant(recipe);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      sendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (!isStreaming) {
      sendMessage(suggestion);
    }
  };

  const showSuggestions = messages.length <= 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ChefHat className="h-5 w-5 text-primary" />
              Assistant - {recipe.title}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={resetChat}
                className="h-8 w-8"
                title="Recommencer"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-4 space-y-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            
            {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {showSuggestions && (
          <div className="px-4 pb-2 flex flex-wrap gap-2">
            {QUICK_SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                onClick={() => handleSuggestionClick(suggestion)}
                disabled={isStreaming}
                className="text-xs"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 border-t shrink-0">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question..."
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
              disabled={isStreaming}
            />
            <Button 
              type="submit" 
              size="icon"
              disabled={!input.trim() || isStreaming}
              className="shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}
