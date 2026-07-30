import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, User, CalendarDays, Menu } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHomeChat } from '@/hooks/useHomeChat';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useViewportHeight } from '@/hooks/useViewportHeight';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { CookingModeContainer } from '@/components/cooking/CookingModeContainer';
import { InstallBanner } from '@/components/InstallBanner';

export default function Home() {
  const navigate = useNavigate();
  const {
    messages, isStreaming, isSavingRecipe,
    sendMessage, resetChat, createProposedRecipe, regenerateResponse, stopGeneration,
    cookingRecipeId, startCooking, stopCooking,
  } = useHomeChat();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { handlers: swipeHandlers, style: swipeStyle } = useSwipeNavigation({
    targetRoute: '/dashboard', direction: 'left', threshold: 80,
  });
  const viewportHeight = useViewportHeight();

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
    <div
      className="h-[100dvh] flex flex-col bg-background pt-[env(safe-area-inset-top)]"
      {...swipeHandlers}
      style={{ ...swipeStyle, ...(viewportHeight ? { height: `${viewportHeight}px` } : {}) }}
    >
      {/* Minimal header */}
      <header className="absolute top-0 left-0 right-0 z-10 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] bg-background/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={resetChat} disabled={isStreaming || !hasConversation} title="Nouvelle conversation" className="h-9 w-9">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menu" className="h-9 w-9">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate('/meal-planning')}>
                <CalendarDays className="mr-2 h-4 w-4" />
                Planning repas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                <BookOpen className="mr-2 h-4 w-4" />
                Livre de recettes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <User className="mr-2 h-4 w-4" />
                Profil
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full pt-16 min-h-0">
        <ChatInterface
          messages={messages}
          isStreaming={isStreaming}
          isSavingRecipe={isSavingRecipe}
          sendMessage={sendMessage}
          onCreateRecipe={createProposedRecipe}
          onStartCooking={startCooking}
          regenerateResponse={regenerateResponse}
          stopGeneration={stopGeneration}
          suggestions={defaultSuggestions}
          placeholder="Poser une question"
          showWelcomeScreen={true}
          skipFirstMessage={true}
          welcomeContent={
            <div className="flex-1 flex flex-col items-center justify-center px-4">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="flex flex-col items-center"
              >
                <img src="/icons/icon-192x192.png" alt="" className="w-[72px] h-[72px] rounded-[18px] mb-[18px] opacity-95" />
                <h1 className="text-3xl md:text-4xl font-solitreo text-foreground text-center mb-2">
                  Toujours prêt à cuisiner.
                </h1>
                <p className="text-muted-foreground text-center text-sm md:text-base">
                  Chef, votre assistant culinaire personnel
                </p>
              </motion.div>
            </div>
          }
        />
      </div>
      {/* Bannière d'installation PWA dans le flux (pas fixed) pour ne pas masquer l'input */}
      <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
        <InstallBanner />
      </div>

      {/* Mode cuisine plein écran (déclenché par l'assistant ou le bouton « Cuisiner ») */}
      {cookingRecipeId && (
        <CookingModeContainer recipeId={cookingRecipeId} onClose={stopCooking} />
      )}
    </div>
  );
}
