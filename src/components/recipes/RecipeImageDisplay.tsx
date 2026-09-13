import { useState, useRef } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getPlaceholderForRecipe } from '@/lib/recipePlaceholder';
import { useIsGeneratingImage } from '@/lib/imageGenerationStore';

interface RecipeImageDisplayProps {
  recipeId: string;
  imageUrl: string | null;
  title?: string;
  onImageChange: (file: File) => Promise<void>;
  onImageRemove: () => Promise<void>;
  isEditable?: boolean;
  showTitleOverlay?: boolean;
}

export function RecipeImageDisplay({
  recipeId,
  imageUrl,
  title,
  onImageChange,
  onImageRemove,
  isEditable = true,
  showTitleOverlay = true,
}: RecipeImageDisplayProps) {
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayUrl = imageUrl || getPlaceholderForRecipe(recipeId);
  const hasCustomImage = !!imageUrl;

  // Génération d'image IA en arrière-plan : on n'affiche l'indicateur que tant
  // qu'aucune image n'est encore disponible (le refetch la fera apparaître).
  const isGenerating = useIsGeneratingImage(recipeId) && !imageUrl;

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

  const handleRemove = async () => {
    setIsUploading(true);
    try {
      await onImageRemove();
    } finally {
      setIsUploading(false);
    }
  };

  const openFilePicker = () => {
    if (isEditable && !isUploading && !isGenerating && inputRef.current) {
      inputRef.current.click();
    }
  };

  const isBusy = isUploading || isGenerating;

  return (
    <div
      className={cn(
        'relative w-full aspect-[16/9] overflow-hidden bg-muted group'
      )}
    >
      <img
        src={displayUrl}
        alt={title || "Photo de la recette"}
        className="h-full w-full object-cover"
      />

      {/* Title centered on image */}
      {title && showTitleOverlay && !isBusy && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <h2 className="text-center font-solitreo text-2xl sm:text-3xl leading-tight line-clamp-3 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-white font-bold">
            {title}
          </h2>
        </div>
      )}

      {/* Les actions sont des boutons nommés, jamais l'image entière cliquable. */}
      {isEditable && !isBusy && (
        <Button type="button" variant="secondary" size="icon" className="absolute bottom-2 right-2 h-11 w-11 rounded-full" onClick={openFilePicker} aria-label={hasCustomImage ? 'Changer l’image' : 'Ajouter une image'} disabled={isBusy}>
          <Camera className="h-5 w-5" aria-hidden="true" />
        </Button>
      )}

      {/* Remove button for custom images */}
      {isEditable && hasCustomImage && !isBusy && (
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="absolute top-2 right-2 h-11 w-11"
          onClick={handleRemove}
          aria-label="Supprimer l’image"
        >
          <X className="h-4 w-4" />
        </Button>
      )}

      {/* Overlay de chargement : upload manuel ou génération d'image IA en fond.
          Le libellé n'apparaît que pour la génération (l'upload n'a qu'un spinner). */}
      {isBusy && (
        <div
          className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-2 text-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          {isGenerating && !isUploading && (
            <span className="text-sm font-medium">Image en cours de génération…</span>
          )}
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
