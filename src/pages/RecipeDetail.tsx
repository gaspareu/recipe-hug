import { useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from '@/components/ui/sonner';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Users, ListChecks, Leaf, ChefHat, History } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { RecipeImageDisplay } from '@/components/recipes/RecipeImageDisplay';
import { RecipeActionsMenu } from '@/components/recipes/RecipeActionsMenu';
import { RecipeStepsList } from '@/components/recipes/RecipeStepsList';
import { RecipeVersionHistory } from '@/components/recipes/RecipeVersionHistory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RecipeStatusSelect } from '@/components/recipes/RecipeStatusSelect';
import { FavoriteToggle } from '@/components/recipes/FavoriteToggle';
import { IngredientChecklistWithHeader } from '@/components/recipes/IngredientChecklist';
import { CookingModeContainer } from '@/components/cooking/CookingModeContainer';
import { useRecipe, useToggleFavorite, useUpdateRecipe } from '@/hooks/useRecipes';
import { useGenerateRecipeImage } from '@/hooks/useGenerateRecipeImage';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { buildRecipeImageObjectPath } from '@/lib/storage-paths';
import type { RecipeStatus, Step } from '@/types/recipe';

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { user } = useAuth();
  const { data: recipe, isLoading } = useRecipe(id || '');
  const toggleFavorite = useToggleFavorite();
  const updateRecipe = useUpdateRecipe();
  const generateImage = useGenerateRecipeImage();
  const [cooking, setCooking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Valeurs dérivées calculées AVANT tout early return : les Hooks doivent être
  // appelés dans le même ordre à chaque rendu (sinon React #310 → page blanche).
  const steps = useMemo(() => (recipe?.steps || []) as Step[], [recipe?.steps]);
  const totalSteps = steps.length;

  const handleToggleFavorite = () => {
    if (!recipe) return;
    toggleFavorite.mutate({ id: recipe.id, is_favorite: !recipe.is_favorite });
  };

  const handleStatusChange = (newStatus: RecipeStatus) => {
    if (!recipe) return;
    updateRecipe.mutate(
      { id: recipe.id, status: newStatus },
      { onError: () => toast('Impossible de changer le statut') },
    );
  };

  const imageChange = useAsyncAction(
    async (file: File) => {
      if (!recipe || !user) return;
      const fileExt = file.name.split('.').pop();
      const fileName = `${recipe.id}-${Date.now()}.${fileExt}`;
      // Chemin scopé par uid : la policy storage du bucket `recipes` exige que
      // le 1er segment soit l'uid (INSERT/UPDATE/DELETE cohérents).
      const filePath = buildRecipeImageObjectPath(user.id, fileName);
      const { error: uploadError } = await supabase.storage.from('recipes').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('recipes').getPublicUrl(filePath);
      await updateRecipe.mutateAsync({ id: recipe.id, source_image_url: publicUrl });
    },
    { successMessage: 'Image mise à jour', errorMessage: "L'envoi de l'image a échoué" },
  );

  const imageRemove = useAsyncAction(
    async () => {
      if (!recipe) return;
      await updateRecipe.mutateAsync({ id: recipe.id, source_image_url: null });
    },
    { errorMessage: "Impossible de retirer l'image" },
  );

  const analyze = useAsyncAction(
    async () => {
      if (!recipe) return;
      const { data, error } = await supabase.functions.invoke('analyze-recipe', {
        body: { title: recipe.title, ingredients: recipe.ingredients, steps: recipe.steps },
      });
      if (error) throw error;
      await updateRecipe.mutateAsync({
        id: recipe.id, ai_summary: data.ai_summary,
        nutrition_tags: data.nutrition_tags, calorie_score: data.calorie_score, season: data.season,
      });
    },
    { errorMessage: "L'analyse a échoué" },
  );

  if (isLoading) {
    return <MainLayout><div className="max-w-2xl mx-auto space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-[200px]" /><Skeleton className="h-[200px]" /></div></MainLayout>;
  }
  if (!recipe) {
    return <MainLayout><div className="text-center py-12"><p className="text-muted-foreground">Recette introuvable</p><Button asChild className="mt-4"><Link to="/dashboard">Retour au dashboard</Link></Button></div></MainLayout>;
  }

  const handleAnalyzeAndGenerate = () => {
    const ingredients = recipe.ingredients as Array<{ name: string }>;
    analyze.run();
    generateImage.mutate({ recipeId: recipe.id, title: recipe.title, ingredients }, {
      onSuccess: () => toast('Image générée avec succès'),
      onError: (error) => toast(`Erreur : ${error.message}`, { description: "La génération d'image a échoué" }),
    });
  };
  const isAnalyzing = generateImage.isPending || analyze.showLoader;

  return (
    <MainLayout>
      <div className={`max-w-2xl mx-auto space-y-6 ${totalSteps > 0 ? 'pb-24' : ''}`}>
        {/* Image avec actions en surimpression */}
        <motion.div
          className="relative"
          initial={reduceMotion ? false : { scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
        >
          <RecipeImageDisplay recipeId={recipe.id} imageUrl={recipe.source_image_url} title={recipe.title} onImageChange={imageChange.run} onImageRemove={imageRemove.run} />
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/50 to-transparent pointer-events-none rounded-t-lg" />
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Retour" className="absolute top-3 left-3 bg-background/60 backdrop-blur-sm hover:bg-background/80">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <div className="absolute top-3 right-3 flex items-center gap-1" data-testid="action-buttons">
            <TooltipProvider>
              <FavoriteToggle isFavorite={recipe.is_favorite} onToggle={handleToggleFavorite} disabled={toggleFavorite.isPending} tooltipText={recipe.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} variant="overlay" />
              <RecipeActionsMenu recipeId={recipe.id} onAnalyzeAndGenerate={handleAnalyzeAndGenerate} isAnalyzing={isAnalyzing} onOpenHistory={() => setHistoryOpen(true)} />
            </TooltipProvider>
          </div>
        </motion.div>

        {/* Badges : statut → saison → nutrition → score (rangée scrollable).
            Le fondu à droite signale qu'il reste des tags à faire défiler ; sur
            fond uni sans débordement il est invisible (dégradé vers la même
            couleur de fond). */}
        <div className="relative">
          <div className="overflow-x-auto pb-1 -mb-1">
            <div className="flex items-center gap-2 min-w-max py-1 pr-8">
              <RecipeStatusSelect status={recipe.status} onStatusChange={handleStatusChange} disabled={updateRecipe.isPending} />
              {recipe.season && <><Separator orientation="vertical" className="h-4" /><Badge variant="outline" className="flex items-center gap-1 shrink-0"><Leaf className="h-3 w-3" />{recipe.season}</Badge></>}
              {recipe.nutrition_tags && recipe.nutrition_tags.length > 0 && <><Separator orientation="vertical" className="h-4" />{recipe.nutrition_tags.map((tag, i) => <Badge key={i} variant="secondary" className="shrink-0">{tag}</Badge>)}</>}
              {recipe.calorie_score && <><Separator orientation="vertical" className="h-4" /><Badge variant="outline" className="shrink-0">Score: {recipe.calorie_score}/5</Badge></>}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" aria-hidden="true" />
        </div>

        {recipe.ai_summary && <p className="text-sm text-muted-foreground">{recipe.ai_summary}</p>}

        {recipe.ingredients.length === 0 ? (
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" />Ingrédients{recipe.servings && <span className="text-sm font-normal text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />{recipe.servings} portions</span>}</CardTitle></CardHeader><CardContent><p className="text-muted-foreground text-sm">Aucun ingrédient</p></CardContent></Card>
        ) : (
          <Card>
            <IngredientChecklistWithHeader ingredients={recipe.ingredients} recipeId={id} renderHeader={toggleButton => (
              <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between"><span className="flex items-center gap-2"><ListChecks className="h-5 w-5" />Ingrédients{recipe.servings && <span className="text-sm font-normal text-muted-foreground flex items-center gap-1 ml-1"><Users className="h-3.5 w-3.5" />{recipe.servings} portions</span>}</span>{toggleButton}</CardTitle></CardHeader>
            )} />
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span>Étapes</span>
              {totalSteps > 0 && <span className="text-sm font-normal text-muted-foreground">{totalSteps} étapes</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RecipeStepsList steps={steps} />
          </CardContent>
        </Card>

        {/* Historique des versions (ouvert depuis le menu d'actions) */}
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetContent className="w-full sm:w-[400px] md:w-[540px] max-w-full flex flex-col p-0">
            <SheetHeader className="p-4 pb-2 border-b">
              <SheetTitle className="flex items-center gap-2"><History className="h-4 w-4" />Historique des versions</SheetTitle>
            </SheetHeader>
            <RecipeVersionHistory recipeId={recipe.id} onRestore={() => setHistoryOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* CTA principal : ouvrir le mode cuisine */}
        {totalSteps > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] bg-background/80 backdrop-blur-sm border-t border-border z-10">
            <div className="max-w-2xl mx-auto">
              <Button onClick={() => setCooking(true)} size="lg" className="w-full h-12 gap-2 text-base font-semibold">
                <ChefHat className="h-5 w-5" aria-hidden="true" />
                Cuisiner
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Mode cuisine plein écran (overlay) */}
      {cooking && <CookingModeContainer recipeId={recipe.id} onClose={() => setCooking(false)} />}
    </MainLayout>
  );
}
