import { useState, useRef } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  showPlaceholder?: boolean;
}

export function RecipeImageDisplay({ recipeId, imageUrl, title, onImageChange, onImageRemove,
  isEditable = true, showTitleOverlay = true, showPlaceholder = true,
}: RecipeImageDisplayProps) {
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isGenerating = useIsGeneratingImage(recipeId) && !imageUrl;
  const isBusy = isUploading || isGenerating;
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try { await onImageChange(file); }
    finally { setIsUploading(false); if (inputRef.current) inputRef.current.value = ''; }
  };
  const handleRemove = async () => {
    setIsUploading(true);
    try { await onImageRemove(); }
    finally { setIsUploading(false); }
  };

  return <div className="space-y-2">
    {(imageUrl || showPlaceholder || isBusy) && <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-muted">
      {(imageUrl || showPlaceholder) && <img src={imageUrl || getPlaceholderForRecipe(recipeId)} alt={title || 'Photo de la recette'} className="h-full w-full object-cover" />}
      {title && showTitleOverlay && <div className="absolute inset-0 flex items-center justify-center bg-black/30 p-4"><h2 className="font-solitreo text-center text-2xl text-white">{title}</h2></div>}
      {isBusy && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80" role="status" aria-live="polite"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="text-sm">{isUploading ? 'Envoi de la photo…' : 'Image en cours de génération…'}</span></div>}
    </div>}
    {isEditable && <div className="flex flex-wrap gap-2">
      <Button variant="ghost" className="min-h-11 text-muted-foreground" disabled={isBusy} onClick={() => inputRef.current?.click()}><Camera className="mr-2 h-4 w-4" aria-hidden="true" />{imageUrl ? 'Modifier la photo' : 'Ajouter une photo'}</Button>
      {imageUrl && <Button variant="ghost" className="min-h-11 text-muted-foreground" disabled={isBusy} onClick={handleRemove}><X className="mr-2 h-4 w-4" aria-hidden="true" />Retirer la photo</Button>}
      <input ref={inputRef} type="file" aria-label="Choisir une photo" accept="image/jpeg,image/png,image/webp" onChange={handleFileSelect} className="hidden" disabled={isBusy} />
    </div>}
  </div>;
}
