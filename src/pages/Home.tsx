import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, User, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHomeChat } from '@/hooks/useHomeChat';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { ChatInterface } from '@/components/chat/ChatInterface';

export default function Home() {
  const navigate = useNavigate();
  const {
    messages, isStreaming, pendingRecipe,
    sendMessage, resetChat, savePendingRecipe, cancelPendingRecipe,
  } = useHomeChat();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { handlers: swipeHandlers, style: swipeStyle } = useSwipeNavigation({
    targetRoute: '/dashboard', direction: 'left', threshold: 80,
  });

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, []);

  const defaultSuggestions = ['Planifier ma semaine', 'Chercher une recette de poulet', 'Créer une recette de tarte', 'Voir toutes mes recettes'];

  const hasConversation = messages.length > 1;

  return (
    <div className="h-[100dvh] flex flex-col bg-background pt-[env(safe-area-inset-top)]" {...swipeHandlers} style={swipeStyle}>
      {/* Minimal header */}
      <header className="absolute top-0 left-0 right-0 z-10 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="container max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={resetChat} disabled={isStreaming || !hasConversation} title="Nouvelle conversation" className="h-9 w-9">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => navigate('/meal-planning')} title="Planning repas" className="h-9 w-9">
              <CalendarDays className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} title="Livre de recettes" className="h-9 w-9">
              <BookOpen className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate('/profile')} title="Profil" className="h-9 w-9">
              <User className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 flex flex-col container max-w-3xl mx-auto w-full pt-16 pb-[env(safe-area-inset-bottom)]">
        <ChatInterface
          messages={messages}
          isStreaming={isStreaming}
          pendingRecipe={pendingRecipe}
          sendMessage={sendMessage}
          savePendingRecipe={savePendingRecipe}
          cancelPendingRecipe={cancelPendingRecipe}
          suggestions={defaultSuggestions}
          placeholder="Poser une question"
          showWelcomeScreen={true}
          skipFirstMessage={true}
          welcomeContent={
            <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-24">
              <h1 className="text-3xl md:text-4xl font-display text-foreground text-center mb-2">
                Toujours prêt à cuisiner.
              </h1>
              <p className="text-muted-foreground text-center text-sm md:text-base">
                Chef, votre assistant culinaire personnel
              </p>
            </div>
          }
        />
      </div>
    </div>
  );
}
