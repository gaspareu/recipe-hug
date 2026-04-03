import { MessageCircle, Check } from 'lucide-react';
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
  onPress: () => void;
  isComplete: boolean;
}

export function CookingAssistantButton({ 
  currentStep, 
  totalSteps, 
  onPress, 
  isComplete 
}: CookingAssistantButtonProps) {
  const getButtonText = () => {
    if (isComplete) return 'Terminé !';
    return `Assistant (${currentStep}/${totalSteps})`;
  };

  const getIcon = () => {
    if (isComplete) return <Check className="h-5 w-5" />;
    return <MessageCircle className="h-5 w-5" />;
  };

  const tooltipText = isComplete 
    ? 'Toutes les étapes sont terminées' 
    : 'Ouvrir l\'assistant culinaire';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onPress}
            size="lg"
            variant={isComplete ? 'secondary' : 'default'}
            className="fixed bottom-6 right-6 h-auto min-h-14 px-6 rounded-full shadow-lg z-50 md:right-[calc(50%-20rem+1.5rem)] gap-2"
          >
            {getIcon()}
            <span className="truncate max-w-[140px] text-sm">{getButtonText()}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
