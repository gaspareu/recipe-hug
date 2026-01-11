import { useState, useRef } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Placeholder images
import placeholderLivre from '@/assets/placeholder_livre.jpg';
import placeholderPlat from '@/assets/placeholder_plat.jpg';
import placeholderSalade from '@/assets/placeholder_salade.jpg';

const placeholders = [placeholderLivre, placeholderPlat, placeholderSalade];

function getPlaceholderForRecipe(recipeId: string): string {
  let hash = 0;
  for (let i = 0; i < recipeId.length; i++) {
    hash = recipeId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return placeholders[Math.abs(hash) % placeholders.length];
}

interface RecipeImageDisplayProps {
  recipeId: string;
  imageUrl: string | null;
  title?: string;
  onImageChange: (file: File) => Promise<void>;
  onImageRemove: () => Promise<void>;
  isEditable?: boolean;
}

export function RecipeImageDisplay({
  recipeId,
  imageUrl,
  title,
  onImageChange,
  onImageRemove,
  isEditable = true,
}: RecipeImageDisplayProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayUrl = imageUrl || getPlaceholderForRecipe(recipeId);
  const hasCustomImage = !!imageUrl;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await onImageChange(file);
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsUploading(true);
    try {
      await onImageRemove();
    } finally {
      setIsUploading(false);
    }
  };

  const handleClick = () => {
    if (isEditable && !isUploading && inputRef.current) {
      inputRef.current.click();
    }
  };

  return (
    <div
      className={cn(
        'relative w-full aspect-[16/9] rounded-lg overflow-hidden bg-muted group',
        isEditable && !isUploading && 'cursor-pointer'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <img
        src={displayUrl}
        alt={title || "Photo de la recette"}
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      />

      {/* Dark overlay - always visible, darker on hover */}
      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-colors duration-300" />

      {/* Title centered on image */}
      {title && !isHovered && !isUploading && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <h2 className="text-center font-solitreo text-2xl sm:text-3xl leading-tight line-clamp-3 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-white font-bold">
            {title}
          </h2>
        </div>
      )}

      {/* Overlay on hover for editable state */}
      {isEditable && isHovered && !isUploading && (
        <div className="absolute inset-0 bg-background/60 flex items-center justify-center transition-opacity">
          <div className="flex flex-col items-center gap-2 text-foreground">
            <Camera className="h-8 w-8" />
            <span className="text-sm font-medium">
              {hasCustomImage ? 'Changer l\'image' : 'Ajouter une image'}
            </span>
          </div>
        </div>
      )}

      {/* Remove button for custom images */}
      {isEditable && hasCustomImage && isHovered && !isUploading && (
        <Button
          variant="destructive"
          size="icon"
          className="absolute top-2 right-2 h-8 w-8"
          onClick={handleRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      {/* Loading state */}
      {isUploading && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        disabled={!isEditable || isUploading}
      />
    </div>
  );
}
