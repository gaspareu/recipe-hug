import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CookingAssistantButtonProps {
  onClick: () => void;
}

export function CookingAssistantButton({ onClick }: CookingAssistantButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onClick}
            size="lg"
            className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 md:right-[calc(50%-20rem+1.5rem)]"
          >
            <Play className="h-6 w-6" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Démarrer l'assistant</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
