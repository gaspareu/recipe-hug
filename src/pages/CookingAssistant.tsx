import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Send, RotateCcw, ChefHat, Loader2, ChevronRight } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCookingAssistant, type ChatMessage } from '@/hooks/useCookingAssistant';
import { useRecipe } from '@/hooks/useRecipes';

const QUICK_SUGGESTIONS = [
  "C'est parti !",
  "Je n'ai pas tous les ingrédients",
  "Comment savoir si c'est cuit ?",
  "Des astuces pour cette recette ?",
];

export default function CookingAssistant() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: recipe, isLoading } = useRecipe(id || '');
  
  if (isLoading) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[400px]" />
        </div>
      </MainLayout>
    );
  }

  if (!recipe) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Recette introuvable</p>
          <Button asChild className="mt-4">
            <Link to="/dashboard">Retour au dashboard</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return <CookingAssistantContent recipe={recipe} onBack={() => navigate(`/recipes/${recipe.id}`)} />;
}

interface CookingAssistantContentProps {
  recipe: NonNullable<ReturnType<typeof useRecipe>['data']>;
  onBack: () => void;
}

function CookingAssistantContent({ recipe, onBack }: CookingAssistantContentProps) {
  const { messages, isStreaming, sendMessage, resetChat, currentStepIndex, totalSteps } = useCookingAssistant(recipe);
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

  const handleNextStep = () => {
    if (!isStreaming && currentStepIndex < totalSteps) {
      sendMessage(`Passons à l'étape ${currentStepIndex + 1}`);
    }
  };

  const showSuggestions = messages.length <= 1;
  const showNextStepButton = !isStreaming && currentStepIndex < totalSteps && messages.length > 1;

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold truncate">{recipe.title}</h1>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={resetChat}
            title="Recommencer"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Chat area */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 px-4" ref={scrollRef}>
            <div className="py-4 space-y-4">
              {messages.map((message, index) => (
                <MessageBubble 
                  key={message.id} 
                  message={message}
                  showNextStep={
                    showNextStepButton && 
                    message.role === 'assistant' && 
                    index === messages.length - 1
                  }
                  onNextStep={handleNextStep}
                  currentStep={currentStepIndex}
                  totalSteps={totalSteps}
                />
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
            <div className="px-4 pb-2 flex flex-wrap gap-2 shrink-0">
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
        </Card>
      </div>
    </MainLayout>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  showNextStep: boolean;
  onNextStep: () => void;
  currentStep: number;
  totalSteps: number;
}

function MessageBubble({ message, showNextStep, onNextStep, currentStep, totalSteps }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <FormattedMessage content={message.content} />
        )}
      </div>
      
      {showNextStep && (
        <Button
          variant="outline"
          size="sm"
          onClick={onNextStep}
          className="mt-2 gap-1"
        >
          Prochaine étape ({currentStep + 1}/{totalSteps})
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function FormattedMessage({ content }: { content: string }) {
  // Parse markdown-like formatting
  const lines = content.split('\n');
  
  return (
    <div className="text-sm space-y-2">
      {lines.map((line, index) => {
        // Empty line
        if (line.trim() === '') {
          return <div key={index} className="h-2" />;
        }
        
        // Headers (## or ###)
        if (line.startsWith('### ')) {
          return (
            <h4 key={index} className="font-semibold text-sm mt-3 first:mt-0">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={index} className="font-bold text-base mt-3 first:mt-0">
              {line.slice(3)}
            </h3>
          );
        }
        
        // List items (- or *)
        if (line.match(/^[\-\*]\s/)) {
          return (
            <div key={index} className="flex gap-2 pl-2">
              <span className="text-primary">•</span>
              <span>{formatInlineText(line.slice(2))}</span>
            </div>
          );
        }
        
        // Numbered list (1. 2. etc)
        const numberedMatch = line.match(/^(\d+)\.\s(.*)$/);
        if (numberedMatch) {
          return (
            <div key={index} className="flex gap-2 pl-2">
              <span className="font-medium text-primary min-w-[1.5rem]">{numberedMatch[1]}.</span>
              <span>{formatInlineText(numberedMatch[2])}</span>
            </div>
          );
        }
        
        // Regular paragraph
        return (
          <p key={index}>{formatInlineText(line)}</p>
        );
      })}
    </div>
  );
}

function formatInlineText(text: string): React.ReactNode {
  // Handle bold (**text**)
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
