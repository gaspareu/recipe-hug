import { Play, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CookingAssistantButtonProps {
  currentStep: number;
  totalSteps: number;
  onAdvance: () => void;
  isComplete: boolean;
}

export function CookingAssistantButton({ 
  currentStep, 
  totalSteps, 
  onAdvance, 
  isComplete 
}: CookingAssistantButtonProps) {
  const isNotStarted = currentStep === 0;

  const getButtonText = () => {
    if (isComplete) return 'Terminé';
    if (isNotStarted) return 'Démarrer';
    return `Étape suivante (${currentStep + 1}/${totalSteps})`;
  };

  const getIcon = () => {
    if (isComplete) return <Check className="h-5 w-5" />;
    if (isNotStarted) return <Play className="h-5 w-5" />;
    return <ChevronRight className="h-5 w-5" />;
  };

  const tooltipText = isComplete 
    ? 'Toutes les étapes sont terminées' 
    : isNotStarted 
      ? 'Commencer la recette' 
      : 'Passer à l\'étape suivante';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onAdvance}
            size="lg"
            disabled={isComplete}
            className="fixed bottom-6 right-6 h-auto min-h-14 px-6 rounded-full shadow-lg z-50 md:right-[calc(50%-20rem+1.5rem)] gap-2"
          >
            {getIcon()}
            <span className="hidden sm:inline">{getButtonText()}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
