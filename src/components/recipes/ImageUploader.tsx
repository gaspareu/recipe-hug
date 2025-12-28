import { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImageUploaderProps {
  onImageSelected: (file: File) => void;
  onImageRemoved: () => void;
  previewUrl: string | null;
  isLoading?: boolean;
  disabled?: boolean;
}

export function ImageUploader({
  onImageSelected,
  onImageRemoved,
  previewUrl,
  isLoading = false,
  disabled = false,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        onImageSelected(file);
      }
    }
  }, [disabled, onImageSelected]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onImageSelected(files[0]);
    }
  }, [onImageSelected]);

  const handleClick = useCallback(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  }, [disabled]);

  if (previewUrl) {
    return (
      <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
        <img
          src={previewUrl}
          alt="Preview"
          className="w-full max-h-80 object-contain"
        />
        {!isLoading && !disabled && (
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={onImageRemoved}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {isLoading && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Analyse en cours...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'relative border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer',
        'flex flex-col items-center justify-center gap-4 min-h-[200px]',
        isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />
      
      <div className="rounded-full bg-muted p-4">
        {isDragging ? (
          <Upload className="h-8 w-8 text-primary" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      
      <div className="text-center">
        <p className="font-medium">
          {isDragging ? 'Déposez l\'image ici' : 'Cliquez ou déposez une image'}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          JPG, PNG ou WEBP (max 5 Mo)
        </p>
      </div>

      <div className="text-xs text-muted-foreground text-center mt-2 space-y-1">
        <p>💡 Conseils :</p>
        <ul className="list-disc list-inside text-left">
          <li>Photo bien éclairée</li>
          <li>Texte lisible</li>
          <li>Recette complète visible</li>
        </ul>
      </div>
    </div>
  );
}
