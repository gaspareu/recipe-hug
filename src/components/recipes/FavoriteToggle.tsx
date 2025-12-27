import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FavoriteToggleProps {
  isFavorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function FavoriteToggle({ isFavorite, onToggle, disabled }: FavoriteToggleProps) {
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
      className="h-8 w-8"
    >
      <Star
        className={cn(
          'h-4 w-4 transition-colors',
          isFavorite ? 'fill-primary text-primary' : 'text-muted-foreground'
        )}
      />
    </Button>
  );
}
