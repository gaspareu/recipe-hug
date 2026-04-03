import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, X, Camera, PenLine } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IngredientEditor } from '@/components/recipes/IngredientEditor';
import { StepsEditor } from '@/components/recipes/StepsEditor';
import { ImageUploader } from '@/components/recipes/ImageUploader';
import { useCreateRecipe } from '@/hooks/useRecipes';
import { supabase } from '@/integrations/supabase/client';

import type { Ingredient, Step, RecipeStatus } from '@/types/recipe';

type CreationMode = 'choose' | 'manual' | 'photo';

const AVAILABLE_TAGS = [
  'protéines', 'fibres', 'léger', 'végétarien', 'végan',
  'sans gluten', 'sans lactose', 'vitamines', 'fer',
  'oméga-3', 'énergétique', 'réconfortant'
];

const SEASONS = ['printemps', 'été', 'automne', 'hiver', 'toutes saisons'];

async function uploadImageToStorage(file: File, userId: string): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${userId}/recipe-sources/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('recipe-images')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(`Upload échoué : ${error.message}`);

  const { data } = supabase.storage.from('recipe-images').getPublicUrl(path);
  return data.publicUrl;
}

async function parseImageWithAI(
  imageUrl: string,
  accessToken: string,
): Promise<{ title: string; servings: number | null; ingredients: Ingredient[]; steps: Step[] }> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-recipe-image`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ image_url: imageUrl }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? `Erreur IA : ${response.status}`);
  }

  const result = await response.json();
  if (!result.success) throw new Error(result.error ?? 'Analyse échouée');
  return result.recipe;
}

export default function RecipeNew() {
  const navigate = useNavigate();
  const createRecipe = useCreateRecipe();

  const [mode, setMode] = useState<CreationMode>('choose');

  // Photo mode state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState<number | ''>('');
  const [status, setStatus] = useState<RecipeStatus>('draft');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [nutritionTags, setNutritionTags] = useState<string[]>([]);
  const [season, setSeason] = useState<string>('');

  const handleImageSelected = useCallback(async (file: File) => {
    setAnalyzeError(null);
    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    setIsAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !session.access_token) throw new Error('Non authentifié');

      const publicUrl = await uploadImageToStorage(file, session.user.id);
      setUploadedImageUrl(publicUrl);

      const parsed = await parseImageWithAI(publicUrl, session.access_token);

      setTitle(parsed.title ?? '');
      setServings(parsed.servings ?? '');
      setIngredients(parsed.ingredients ?? []);
      setSteps(parsed.steps ?? []);
      setMode('photo');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setAnalyzeError(message);
      console.error('Image parsing error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleImageRemoved = useCallback(() => {
    setPreviewUrl(null);
    setUploadedImageUrl(null);
    setAnalyzeError(null);
    setTitle('');
    setServings('');
    setIngredients([]);
    setSteps([]);
  }, []);

  const addTag = (tag: string) => {
    if (!nutritionTags.includes(tag) && nutritionTags.length < 3) {
      setNutritionTags([...nutritionTags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    setNutritionTags(nutritionTags.filter(t => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const newRecipe = await createRecipe.mutateAsync({
        title: title.trim(),
        status,
        servings: servings || null,
        ingredients,
        steps,
        nutrition_tags: nutritionTags.length > 0 ? nutritionTags : null,
        season: season || null,
        source_type: uploadedImageUrl ? 'image' : 'manual',
        source_image_url: uploadedImageUrl ?? null,
        skipImageGeneration: !!uploadedImageUrl,
        is_favorite: false,
      });
      navigate(`/recipes/${newRecipe.id}`);
    } catch (error) {
      console.error('Error creating recipe:', error);
    }
  };

  // ── Mode selector ──────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Nouvelle recette</h1>
          </div>

          <p className="text-muted-foreground">Comment veux-tu créer ta recette ?</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className="flex flex-col items-center gap-4 rounded-xl border-2 border-border hover:border-primary/60 bg-card p-8 transition-colors cursor-pointer text-left"
            >
              <div className="rounded-full bg-muted p-4">
                <PenLine className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Saisir manuellement</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Remplis le formulaire ingrédient par ingrédient
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode('photo')}
              className="flex flex-col items-center gap-4 rounded-xl border-2 border-border hover:border-primary/60 bg-card p-8 transition-colors cursor-pointer text-left"
            >
              <div className="rounded-full bg-muted p-4">
                <Camera className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Créer depuis une photo</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Prends en photo une recette, l'IA l'analyse automatiquement
                </p>
              </div>
            </button>
          </div>
        </div>
      </MainLayout>
    );
  }

  // ── Photo mode : show uploader if no image yet, then form ──────
  const showUploader = mode === 'photo' && !previewUrl && !isAnalyzing;
  const showForm = mode === 'manual' || (mode === 'photo' && (previewUrl || isAnalyzing));

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">
              {mode === 'photo' ? 'Recette depuis photo' : 'Nouvelle recette'}
            </h1>
          </div>
          {showForm && (
            <Button
              type="submit"
              form="recipe-new-form"
              disabled={createRecipe.isPending || isAnalyzing || !title.trim()}
            >
              <Save className="mr-2 h-4 w-4" />
              {createRecipe.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          )}
        </div>

        {/* Photo uploader */}
        {showUploader && (
          <div className="space-y-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode('choose')}
              className="text-muted-foreground"
            >
              ← Changer de mode
            </Button>
            <ImageUploader
              onImageSelected={handleImageSelected}
              onImageRemoved={handleImageRemoved}
              previewUrl={previewUrl}
              isLoading={isAnalyzing}
              disabled={isAnalyzing}
            />
          </div>
        )}

        {/* Image preview + analysis state */}
        {mode === 'photo' && (previewUrl || isAnalyzing) && (
          <div className="space-y-3">
            <ImageUploader
              onImageSelected={handleImageSelected}
              onImageRemoved={handleImageRemoved}
              previewUrl={previewUrl}
              isLoading={isAnalyzing}
              disabled={isAnalyzing}
            />
            {analyzeError && (
              <p className="text-sm text-destructive">{analyzeError}</p>
            )}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <form id="recipe-new-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Titre *</Label>
                <Input
                  id="title"
                  placeholder="Ex: Tarte aux pommes de mamie"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isAnalyzing}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="servings">Portions</Label>
                  <Input
                    id="servings"
                    type="number"
                    min="1"
                    placeholder="4"
                    value={servings}
                    onChange={(e) => setServings(e.target.value ? parseInt(e.target.value) : '')}
                    disabled={isAnalyzing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Statut</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as RecipeStatus)} disabled={isAnalyzing}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Brouillon</SelectItem>
                      <SelectItem value="tested">Testé</SelectItem>
                      <SelectItem value="validated">Validé</SelectItem>
                      <SelectItem value="archived">Archivé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="season">Saison</Label>
                <Select
                  value={season || 'none'}
                  onValueChange={(v) => setSeason(v === 'none' ? '' : v)}
                  disabled={isAnalyzing}
                >
                  <SelectTrigger id="season">
                    <SelectValue placeholder="Sélectionner une saison" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    {SEASONS.map(s => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tags nutritionnels (max 3)</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {nutritionTags.map(tag => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                {nutritionTags.length < 3 && (
                  <Select onValueChange={addTag} value="" disabled={isAnalyzing}>
                    <SelectTrigger>
                      <SelectValue placeholder="Ajouter un tag..." />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_TAGS.filter(t => !nutritionTags.includes(t)).map(tag => (
                        <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <IngredientEditor ingredients={ingredients} onChange={setIngredients} />
            <StepsEditor steps={steps} onChange={setSteps} />

            <Button
              type="submit"
              className="w-full"
              disabled={createRecipe.isPending || isAnalyzing || !title.trim()}
            >
              <Save className="mr-2 h-4 w-4" />
              {createRecipe.isPending ? 'Enregistrement...' : 'Enregistrer la recette'}
            </Button>
          </form>
        )}
      </div>
    </MainLayout>
  );
}
