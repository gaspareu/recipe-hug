import { ChefHat } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
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
  sendMessage: (content: string, imageDataUrl?: string) => void;
  savePendingRecipe: () => void;
  cancelPendingRecipe: () => void;
  regenerateResponse?: () => void;
  stopGeneration?: () => void;
}

const COOKING_SUGGESTIONS = ['Par quoi remplacer ?', "C'est cuit ?", 'Une astuce ?'];

export function CookingChatSheet({
  open, onOpenChange, autoListen,
  messages, isStreaming, pendingRecipe,
  sendMessage, savePendingRecipe, cancelPendingRecipe, regenerateResponse, stopGeneration,
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
            pendingRecipe={pendingRecipe}
            sendMessage={sendMessage}
            savePendingRecipe={savePendingRecipe}
            cancelPendingRecipe={cancelPendingRecipe}
            regenerateResponse={regenerateResponse}
            stopGeneration={stopGeneration}
            suggestions={COOKING_SUGGESTIONS}
            placeholder="Poser une question…"
            autoListenOnMount={autoListen}
            className="min-h-0 flex-1"
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
