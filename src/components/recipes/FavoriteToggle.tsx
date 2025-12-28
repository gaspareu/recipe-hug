import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FavoriteToggleProps {
  isFavorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
  variant?: 'default' | 'overlay';
}

export function FavoriteToggle({ isFavorite, onToggle, disabled, variant = 'default' }: FavoriteToggleProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      className={cn(
        'h-8 w-8 transition-all duration-200',
        variant === 'overlay' && 'bg-background/80 backdrop-blur-sm hover:bg-background/90 rounded-full shadow-sm'
      )}
    >
      <Heart
        className={cn(
          'h-4 w-4 transition-all duration-200',
          isFavorite 
            ? 'fill-primary text-primary animate-heart-pulse' 
            : 'text-muted-foreground hover:text-primary'
        )}
      />
    </Button>
  );
}