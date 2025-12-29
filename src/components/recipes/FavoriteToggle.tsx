import { useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface FavoriteToggleProps {
  isFavorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
  variant?: 'default' | 'overlay';
  size?: 'icon' | 'default';
}

export function FavoriteToggle({ isFavorite, onToggle, disabled, variant = 'default', size = 'icon' }: FavoriteToggleProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Trigger animation
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 400);
    
    // Call toggle
    onToggle();
    
    // Show toast
    if (isFavorite) {
      toast('Retiré des favoris', {
        icon: '💔',
        duration: 2000,
      });
    } else {
      toast('Ajouté aux favoris', {
        icon: '❤️',
        duration: 2000,
      });
    }
  };

  if (size === 'default') {
    return (
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={disabled}
        className="overflow-hidden"
      >
        <Heart
          className={cn(
            'h-4 w-4 mr-2 transition-all duration-200',
            isFavorite 
              ? 'fill-primary text-primary' 
              : 'text-muted-foreground',
            isAnimating && 'animate-favorite-pop'
          )}
        />
        {isFavorite ? 'Favori' : 'Ajouter aux favoris'}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'h-8 w-8 transition-all duration-200 overflow-hidden',
        variant === 'overlay' && 'bg-background/80 backdrop-blur-sm hover:bg-background/90 rounded-full shadow-sm'
      )}
    >
      <Heart
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
}