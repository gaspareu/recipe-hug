import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageUploader } from './ImageUploader';
import { IngredientEditor } from './IngredientEditor';
import { StepsEditor } from './StepsEditor';
import { useCreateRecipe } from '@/hooks/useRecipes';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Ingredient, Step, RecipeStatus } from '@/types/recipe';

interface ParsedRecipe {
  title: string;
  servings: number | null;
  ingredients: Ingredient[];
  steps: Step[];
}

export function RecipeFromImage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createRecipe = useCreateRecipe();

  // Image state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState<number | ''>('');
  const [status, setStatus] = useState<RecipeStatus>('draft');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);

  const handleImageSelected = useCallback((file: File) => {
    // Validate file size (5 MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Fichier trop volumineux',
        description: 'La taille maximale est de 5 Mo',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setHasAnalyzed(false);
  }, [toast]);

  const handleImageRemoved = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setImageUrl(null);
    setHasAnalyzed(false);
    // Reset form
    setTitle('');
    setServings('');
    setIngredients([]);
    setSteps([]);
  }, [previewUrl]);

  const uploadImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('recipe-images')
      .upload(filePath, file);

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('recipe-images')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);

    try {
      // Upload image first
      const uploadedUrl = await uploadImage(selectedFile);
      setImageUrl(uploadedUrl);

      // Call edge function to parse the image
      const { data, error } = await supabase.functions.invoke('parse-recipe-image', {
        body: { image_url: uploadedUrl },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success || !data.recipe) {
        throw new Error(data.error || 'Impossible d\'analyser l\'image');
      }

      const parsed: ParsedRecipe = data.recipe;

      // Fill form with parsed data
      setTitle(parsed.title || '');
      setServings(parsed.servings || '');
      setIngredients(parsed.ingredients || []);
      setSteps(parsed.steps || []);
      setHasAnalyzed(true);

      toast({
        title: 'Analyse terminée',
        description: 'Les données ont été extraites. Vérifiez et corrigez si nécessaire.',
      });

    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: 'Erreur d\'analyse',
        description: error instanceof Error ? error.message : 'Impossible d\'analyser l\'image',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({
        title: 'Erreur',
        description: 'Le titre est obligatoire',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createRecipe.mutateAsync({
        title: title.trim(),
        status,
        is_favorite: false,
        servings: servings || null,
        ingredients,
        steps,
        season: null,
        nutrition_tags: null,
        calorie_score: null,
        ai_summary: null,
        source_type: 'image',
        source_image_url: imageUrl,
      });

      toast({
        title: 'Succès',
        description: 'Recette créée avec succès !',
      });
      navigate('/dashboard');
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de créer la recette',
        variant: 'destructive',
      });
    }
  };

  const handleReset = () => {
    handleImageRemoved();
  };

  return (
    <div className="space-y-6">
      <ImageUploader
        onImageSelected={handleImageSelected}
        onImageRemoved={handleImageRemoved}
        previewUrl={previewUrl}
        isLoading={isAnalyzing}
        disabled={isAnalyzing}
      />

      {selectedFile && !hasAnalyzed && !isAnalyzing && (
        <Button
          onClick={handleAnalyze}
          className="w-full"
          size="lg"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Analyser avec l'IA
        </Button>
      )}

      {hasAnalyzed && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Données extraites</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Recommencer
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title-capture">Titre *</Label>
              <Input
                id="title-capture"
                placeholder="Ex: Tarte aux pommes de mamie"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="servings-capture">Portions</Label>
                <Input
                  id="servings-capture"
                  type="number"
                  min="1"
                  placeholder="4"
                  value={servings}
                  onChange={(e) => setServings(e.target.value ? parseInt(e.target.value) : '')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status-capture">Statut</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as RecipeStatus)}>
                  <SelectTrigger id="status-capture">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Brouillon</SelectItem>
                    <SelectItem value="tested">Testé</SelectItem>
                    <SelectItem value="validated">Validé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <IngredientEditor ingredients={ingredients} onChange={setIngredients} />
          
          <StepsEditor steps={steps} onChange={setSteps} />

          <Button type="submit" className="w-full" disabled={createRecipe.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {createRecipe.isPending ? 'Enregistrement...' : 'Enregistrer la recette'}
          </Button>
        </form>
      )}
    </div>
  );
}
