import { useCallback, useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from '@/components/ui/sonner';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Users, ListChecks, ChefHat, History, MessageCircle } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { RecipeImageDisplay } from '@/components/recipes/RecipeImageDisplay';
import { RecipeDetailHeader } from '@/components/recipes/RecipeDetailHeader';
import { RecipeActionsMenu } from '@/components/recipes/RecipeActionsMenu';
import { RecipeStepsList } from '@/components/recipes/RecipeStepsList';
import { RecipeVersionHistory } from '@/components/recipes/RecipeVersionHistory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FavoriteToggle } from '@/components/recipes/FavoriteToggle';
import { IngredientChecklistWithHeader } from '@/components/recipes/IngredientChecklist';
import { CookingModeContainer } from '@/components/cooking/CookingModeContainer';
import { CookingChatSheet } from '@/components/cooking/CookingChatSheet';
import { useRecipe, useToggleFavorite, useUpdateRecipe, useCreateRecipe } from '@/hooks/useRecipes';
import { useRecipeChat } from '@/hooks/useRecipeChat';
import { useGenerateRecipeImage } from '@/hooks/useGenerateRecipeImage';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { buildRecipeImageObjectPath } from '@/lib/storage-paths';
import type { PendingRecipe } from '@/hooks/useChatEngine';
import type { Recipe, Step } from '@/types/recipe';

const NO_COMPLETED_STEPS = new Set<number>();

interface RecipeDetailAssistantProps {
  recipe: Recipe;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cookingRecipeId: string | null;
  cookingServings?: number;
  onCookingOpen: (recipeId: string, servings?: number) => void;
  onCookingClose: () => void;
}

/** Session de chat conservée tant que la fiche recette reste montée. */
function RecipeDetailAssistant({
  recipe,
  open,
  onOpenChange,
  cookingRecipeId,
  cookingServings,
  onCookingOpen,
  onCookingClose,
}: RecipeDetailAssistantProps) {
  const updateRecipe = useUpdateRecipe();
  const createRecipe = useCreateRecipe();

  const handleRecipeUpdate = useCallback(async (data: PendingRecipe) => {
    await updateRecipe.mutateAsync({
      id: data.originalRecipeId ?? recipe.id,
      title: data.title,
      servings: data.servings,
      ingredients: data.ingredients,
      steps: data.steps,
    });
  }, [recipe.id, updateRecipe]);

  const handleRecipeCreate = useCallback(async (data: PendingRecipe) => {
    const created = await createRecipe.mutateAsync({
      title: data.title,
      servings: data.servings,
      ingredients: data.ingredients,
      steps: data.steps,
      status: 'draft',
      is_favorite: false,
      source_type: 'ai',
      ai_summary: data.relationToOriginal
        ? `Inspiré de "${recipe.title}". ${data.relationToOriginal}`
        : null,
      season: null,
      nutrition_tags: null,
      calorie_score: null,
      source_image_url: null,
    });
    return created.id;
  }, [createRecipe, recipe.title]);

  const chat = useRecipeChat({
    recipe,
    completedSteps: NO_COMPLETED_STEPS,
    onRecipeUpdate: handleRecipeUpdate,
    onRecipeCreate: handleRecipeCreate,
    onStartCooking: onCookingOpen,
  });

  return (
    <>
      <CookingChatSheet
        open={open}
        onOpenChange={onOpenChange}
        autoListen={false}
        recipeTitle={recipe.title}
        recipeServings={recipe.servings}
        context="recipe"
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        toolActivity={chat.toolActivity}
        isSavingRecipe={chat.isSavingRecipe}
        sendMessage={chat.sendMessage}
        onCreateRecipe={chat.createProposedRecipe}
        onStartCooking={(recipeId, servings) => {
          onOpenChange(false);
          onCookingOpen(recipeId, servings);
        }}
        resetChat={chat.resetChat}
        regenerateResponse={chat.regenerateResponse}
        stopGeneration={chat.stopGeneration}
      />
      {cookingRecipeId && (
        <CookingModeContainer
          recipeId={cookingRecipeId}
          initialServings={cookingServings}
          chatSession={cookingRecipeId === recipe.id ? chat : undefined}
          onStartCooking={onCookingOpen}
          onClose={onCookingClose}
        />
      )}
    </>
  );
}

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { user } = useAuth();
  const { data: recipe, isLoading } = useRecipe(id || '');
  const toggleFavorite = useToggleFavorite();
  const updateRecipe = useUpdateRecipe();
  const generateImage = useGenerateRecipeImage();
  const [cookingTarget, setCookingTarget] = useState<{
    sourceRecipeId: string;
    recipeId: string;
    servings?: number;
  } | null>(null);
  const [assistantState, setAssistantState] = useState({ recipeId: id ?? '', open: false });
  const [historyOpen, setHistoryOpen] = useState(false);

  // Valeurs dérivées calculées AVANT tout early return : les Hooks doivent être
  // appelés dans le même ordre à chaque rendu (sinon React #310 → page blanche).
  const steps = useMemo(() => (recipe?.steps || []) as Step[], [recipe?.steps]);
  const totalSteps = steps.length;
  const assistantOpen = assistantState.recipeId === id && assistantState.open;
  const activeCookingTarget = cookingTarget?.sourceRecipeId === id ? cookingTarget : null;

  const handleToggleFavorite = () => {
    if (!recipe) return;
    toggleFavorite.mutate({ id: recipe.id, is_favorite: !recipe.is_favorite });
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
      <div className="mx-auto max-w-2xl space-y-6 pb-24">
        {/* Image avec actions en surimpression */}
        <motion.div
          className="relative"
          initial={reduceMotion ? false : { scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
        >
          <RecipeImageDisplay recipeId={recipe.id} imageUrl={recipe.source_image_url} title={recipe.title} onImageChange={imageChange.run} onImageRemove={imageRemove.run} showTitleOverlay={false} />
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

        <RecipeDetailHeader title={recipe.title} description={recipe.ai_summary} />

        {recipe.ingredients.length === 0 ? (
          <Card className="rounded-2xl border-border bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-solitreo text-xl font-normal tracking-normal">
                <ListChecks className="h-5 w-5" />
                Ingrédients
                {recipe.servings && <span className="text-sm font-normal text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />{recipe.servings} portions</span>}
              </CardTitle>
            </CardHeader>
            <CardContent><p className="text-muted-foreground text-sm">Aucun ingrédient</p></CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl border-border bg-card">
            <IngredientChecklistWithHeader ingredients={recipe.ingredients} recipeId={id} renderHeader={toggleButton => (
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between font-solitreo text-xl font-normal tracking-normal">
                  <span className="flex items-center gap-2">
                    <ListChecks className="h-5 w-5" />
                    Ingrédients
                    {recipe.servings && <span className="text-sm font-normal text-muted-foreground flex items-center gap-1 ml-1"><Users className="h-3.5 w-3.5" />{recipe.servings} portions</span>}
                  </span>
                  {toggleButton}
                </CardTitle>
              </CardHeader>
            )} />
          </Card>
        )}

        <Card className="rounded-2xl border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between font-solitreo text-xl font-normal tracking-normal">
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

        {/* Accès persistants à Chef et au mode cuisine. */}
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/80 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm">
          <div className="mx-auto flex max-w-2xl gap-2">
            <Button
              onClick={() => setAssistantState({ recipeId: recipe.id, open: true })}
              variant="outline"
              size="lg"
              className="h-12 min-w-0 flex-1 gap-1.5 overflow-hidden px-2 text-sm font-semibold sm:gap-2 sm:px-8 sm:text-base"
              aria-label="Demander à Chef"
            >
              <MessageCircle className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" />
              <span className="truncate">Demander à Chef</span>
            </Button>
            {totalSteps > 0 && (
              <Button
                onClick={() => setCookingTarget({
                  sourceRecipeId: recipe.id,
                  recipeId: recipe.id,
                  servings: recipe.servings ?? undefined,
                })}
                size="lg"
                className="h-12 min-w-0 flex-1 gap-1.5 px-2 text-sm font-semibold sm:gap-2 sm:px-8 sm:text-base"
              >
                <ChefHat className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" />
                Cuisiner
              </Button>
            )}
          </div>
        </div>
      </div>

      <RecipeDetailAssistant
        recipe={recipe}
        open={assistantOpen}
        onOpenChange={(open) => setAssistantState({ recipeId: recipe.id, open })}
        cookingRecipeId={activeCookingTarget?.recipeId ?? null}
        cookingServings={activeCookingTarget?.servings}
        onCookingOpen={(recipeId, servings) => setCookingTarget({
          sourceRecipeId: recipe.id,
          recipeId,
          servings,
        })}
        onCookingClose={() => setCookingTarget(null)}
      />
    </MainLayout>
  );
}
