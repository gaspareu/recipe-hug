import { useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface FavoriteToggleProps {
  isFavorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
  variant?: 'default' | 'overlay';
  tooltipText?: string;
}

export function FavoriteToggle({ isFavorite, onToggle, disabled, variant = 'default', tooltipText }: FavoriteToggleProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Trigger animation
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 400);
    
    // Call toggle
    onToggle();
  };

  const button = (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={disabled}
      aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      aria-pressed={isFavorite}
      className={cn(
        'h-9 w-9 transition-all duration-200 overflow-hidden',
        variant === 'overlay' && 'bg-background/80 backdrop-blur-sm hover:bg-background/90 rounded-full shadow-sm'
      )}
    >
      <Heart
        aria-hidden="true"
        className={cn(
          'h-4 w-4 transition-all duration-200',
          isFavorite 
            ? 'fill-primary text-primary' 
            : 'text-muted-foreground hover:text-primary',
          isAnimating && 'animate-favorite-pop'
        )}
      />
    </Button>
  );

  if (tooltipText) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {button}
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}