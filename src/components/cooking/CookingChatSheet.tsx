import { ChevronDown, Plus } from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ChatInterface } from '@/components/chat/ChatInterface';
import type { ChatMessage } from '@/hooks/useChatEngine';
import type { Ingredient } from '@/types/recipe';
import { useViewportHeight } from '@/hooks/useViewportHeight';

interface CookingChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Démarre l'écoute vocale à l'ouverture (ouverture via le micro). */
  autoListen: boolean;
  recipeTitle: string;
  recipeServings?: number | null;
  completedStepsCount?: number;
  context: 'recipe' | 'cooking';
  messages: ChatMessage[];
  isStreaming: boolean;
  toolActivity?: string | null;
  isSavingRecipe?: boolean;
  sendMessage: (content: string, imageDataUrl?: string) => void;
  onCreateRecipe: (messageId: string, data: { servings: number; ingredients: Ingredient[] }) => void;
  onStartCooking?: (recipeId: string, servings: number) => void;
  resetChat: () => void;
  regenerateResponse?: () => void;
  stopGeneration?: () => void;
}

const RECIPE_SUGGESTIONS = ['Adapter les quantités', 'Une alternative végétale ?', 'Comment améliorer cette recette ?'];
const COOKING_SUGGESTIONS = ['Par quoi remplacer ?', "C'est cuit ?", 'Une astuce ?'];

export function CookingChatSheet({
  open, onOpenChange, autoListen,
  recipeTitle, recipeServings, completedStepsCount = 0, context,
  messages, isStreaming, toolActivity,
  isSavingRecipe, sendMessage, onCreateRecipe, onStartCooking,
  resetChat,
  regenerateResponse, stopGeneration,
}: CookingChatSheetProps) {
  useViewportHeight();

  const contextDescription = [
    recipeTitle,
    recipeServings ? `${recipeServings} portion${recipeServings > 1 ? 's' : ''}` : null,
    context === 'cooking' && completedStepsCount > 0
      ? `${completedStepsCount} étape${completedStepsCount > 1 ? 's' : ''} terminée${completedStepsCount > 1 ? 's' : ''}`
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="inset-x-0 bottom-auto top-[var(--app-vh-top,0px)] flex h-[var(--app-vh,100dvh)] max-h-none w-full flex-col gap-0 rounded-none border-0 p-0 shadow-none [&>button:last-child]:hidden"
      >
        <SheetHeader className="min-h-16 shrink-0 flex-row items-center gap-2 space-y-0 border-b border-border bg-background/80 px-3 pt-[env(safe-area-inset-top)] text-left backdrop-blur-sm">
          <SheetClose asChild>
            <button
              type="button"
              className="flex h-11 w-11 touch-manipulation cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Fermer l’assistant"
            >
              <ChevronDown className="h-5 w-5" aria-hidden="true" />
            </button>
          </SheetClose>
          <div className="min-w-0 flex-1 text-center">
            <SheetTitle className="truncate font-solitreo text-[19px] font-normal leading-tight text-foreground">Chef</SheetTitle>
            <SheetDescription className="truncate font-crimson text-xs text-muted-foreground">{contextDescription}</SheetDescription>
          </div>
          <button
            type="button"
            onClick={resetChat}
            disabled={isStreaming || messages.length <= 1}
            className="flex h-11 w-11 touch-manipulation cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Nouvelle conversation"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col pb-[var(--app-safe-area-bottom,env(safe-area-inset-bottom))]">
          {/* Remonté à chaque ouverture : la conversation vit dans le hook parent (useRecipeChat). */}
          {open && (
            <ChatInterface
              messages={messages}
              isStreaming={isStreaming}
              toolActivity={toolActivity}
              isSavingRecipe={isSavingRecipe}
              sendMessage={sendMessage}
              onCreateRecipe={onCreateRecipe}
              onStartCooking={onStartCooking}
              regenerateResponse={regenerateResponse}
              stopGeneration={stopGeneration}
              suggestions={context === 'cooking' ? COOKING_SUGGESTIONS : RECIPE_SUGGESTIONS}
              placeholder="Poser une question"
              autoListenOnMount={autoListen}
              className="min-h-0 flex-1"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
