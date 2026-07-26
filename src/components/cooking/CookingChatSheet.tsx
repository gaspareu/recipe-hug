import { Check, Loader2, X, ChefHat } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ChatInterface } from '@/components/chat/ChatInterface';
import type { ChatMessage, PendingRecipe } from '@/hooks/useChatEngine';

interface CookingChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Démarre l'écoute vocale à l'ouverture (ouverture via le micro). */
  autoListen: boolean;
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingRecipe: PendingRecipe | null;
  isSavingRecipe?: boolean;
  sendMessage: (content: string, imageDataUrl?: string) => void;
  savePendingRecipe: () => void;
  cancelPendingRecipe: () => void;
  regenerateResponse?: () => void;
  stopGeneration?: () => void;
}

const COOKING_SUGGESTIONS = ['Par quoi remplacer ?', "C'est cuit ?", 'Une astuce ?'];

export function CookingChatSheet({
  open, onOpenChange, autoListen,
  messages, isStreaming,
  pendingRecipe, isSavingRecipe,
  sendMessage, savePendingRecipe, cancelPendingRecipe,
  regenerateResponse, stopGeneration,
}: CookingChatSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[85dvh] flex-col gap-0 rounded-t-[22px] p-0">
        <SheetHeader className="flex-row items-center gap-2.5 space-y-0 border-b border-border p-4 pb-3 text-left">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <ChefHat className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <SheetTitle className="font-solitreo text-[19px] leading-none text-foreground">Chef</SheetTitle>
            <SheetDescription className="font-crimson text-xs text-muted-foreground">Votre assistant cuisson</SheetDescription>
          </div>
        </SheetHeader>
        {/* Remonté à chaque ouverture : la conversation vit dans le hook parent (useRecipeChat). */}
        {open && (
          <ChatInterface
            messages={messages}
            isStreaming={isStreaming}
            sendMessage={sendMessage}
            regenerateResponse={regenerateResponse}
            stopGeneration={stopGeneration}
            suggestions={COOKING_SUGGESTIONS}
            placeholder="Poser une question…"
            autoListenOnMount={autoListen}
            className="min-h-0 flex-1"
          />
        )}

        {/* Barre de confirmation de recette */}
        <AnimatePresence>
          {pendingRecipe && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex flex-col gap-3 p-3 mx-4 mb-3 bg-primary/5 border border-primary/20 rounded-2xl">
                <p className="text-sm text-foreground text-center break-words">
                  {pendingRecipe.isUpdate
                    ? `Mettre à jour "${pendingRecipe.title}" ?`
                    : `Enregistrer "${pendingRecipe.title}" ?`}
                </p>
                <div className="flex justify-end items-center gap-2">
                  <Button size="sm" onClick={savePendingRecipe} disabled={isSavingRecipe} className="gap-1">
                    {isSavingRecipe ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {pendingRecipe.isUpdate ? 'Mettre à jour' : 'Créer'}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={cancelPendingRecipe} disabled={isSavingRecipe} className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Annuler">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
