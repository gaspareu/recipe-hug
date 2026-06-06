import { useState, useCallback } from 'react';
import { toast } from '@/components/ui/sonner';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Users, ListChecks, Sparkles, Loader2, Leaf, MessageCircle, CheckCircle, Circle, ImagePlus, History, Share2 } from 'lucide-react';
import { ShareRecipeDialog } from '@/components/recipes/ShareRecipeDialog';
import { CookingAssistantButton } from '@/components/recipes/CookingAssistantButton';
import { MainLayout } from '@/components/layout/MainLayout';
import { RecipeImageDisplay } from '@/components/recipes/RecipeImageDisplay';

import { RecipeVersionHistory } from '@/components/recipes/RecipeVersionHistory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RecipeStatusSelect } from '@/components/recipes/RecipeStatusSelect';
import { FavoriteToggle } from '@/components/recipes/FavoriteToggle';
import { IngredientChecklistWithHeader } from '@/components/recipes/IngredientChecklist';
import { useRecipe, useToggleFavorite, useUpdateRecipe, useCreateRecipe } from '@/hooks/useRecipes';
import { useGenerateRecipeImage } from '@/hooks/useGenerateRecipeImage';
import { useRecipeChat } from '@/hooks/useRecipeChat';
import { useCreateVersion } from '@/hooks/useRecipeVersions';
import { useAuth } from '@/hooks/useAuth';
import { useSwipeClose } from '@/hooks/useSwipeClose';
import { ChatInterface } from '@/components/chat/ChatInterface';

import { supabase } from '@/integrations/supabase/client';
import type { RecipeStatus, Step, Ingredient } from '@/types/recipe';

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: recipe, isLoading, refetch } = useRecipe(id || '');
  const toggleFavorite = useToggleFavorite();
  const updateRecipe = useUpdateRecipe();
  const createRecipe = useCreateRecipe();
  const createVersion = useCreateVersion();
  const generateImage = useGenerateRecipeImage();
  const { user } = useAuth();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);

  const handleToggleFavorite = () => {
    if (!recipe) return;
    toggleFavorite.mutate({ id: recipe.id, is_favorite: !recipe.is_favorite });
  };

  const handleStatusChange = (newStatus: RecipeStatus) => {
    if (!recipe) return;
    updateRecipe.mutate({ id: recipe.id, status: newStatus });
  };

  const handleImageChange = async (file: File) => {
    if (!recipe) return;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${recipe.id}-${Date.now()}.${fileExt}`;
      const filePath = `recipe-images/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('recipes').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('recipes').getPublicUrl(filePath);
      await updateRecipe.mutateAsync({ id: recipe.id, source_image_url: publicUrl });
    } catch (error) {
      console.error('Error uploading image:', error);
    }
  };

  const handleImageRemove = async () => {
    if (!recipe) return;
    try {
      await updateRecipe.mutateAsync({ id: recipe.id, source_image_url: null });
    } catch (error) {
      console.error('Error removing image:', error);
    }
  };

  const handleAnalyze = async () => {
    if (!recipe) return;
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-recipe', {
        body: { title: recipe.title, ingredients: recipe.ingredients, steps: recipe.steps },
      });
      if (error) throw error;
      await updateRecipe.mutateAsync({
        id: recipe.id, ai_summary: data.ai_summary,
        nutrition_tags: data.nutrition_tags, calorie_score: data.calorie_score, season: data.season,
      });
    } catch (error) {
      console.error('Error analyzing recipe:', error);
    } finally { setIsAnalyzing(false); }
  };

  const handleStepToggle = (stepOrder: number) => {
    setCompletedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepOrder)) newSet.delete(stepOrder);
      else newSet.add(stepOrder);
      return newSet;
    });
  };

  const handleAdvanceStep = () => {
    if (!recipe) return;
    const steps = recipe.steps as Step[];
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
    for (let i = 0; i < sortedSteps.length; i++) {
      if (!completedSteps.has(sortedSteps[i].order)) {
        setCompletedSteps(prev => new Set([...prev, sortedSteps[i].order]));
        setCurrentStepIndex(i + 1);
        return;
      }
    }
  };

  if (isLoading) {
    return <MainLayout><div className="max-w-2xl mx-auto space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-[200px]" /><Skeleton className="h-[200px]" /></div></MainLayout>;
  }
  if (!recipe) {
    return <MainLayout><div className="text-center py-12"><p className="text-muted-foreground">Recette introuvable</p><Button asChild className="mt-4"><Link to="/dashboard">Retour au dashboard</Link></Button></div></MainLayout>;
  }

  const steps = (recipe.steps || []) as Step[];
  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
  const totalSteps = steps.length;
  const isComplete = completedSteps.size === totalSteps && totalSteps > 0;

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Recipe Image with action buttons overlay */}
        <div className="relative">
          <RecipeImageDisplay recipeId={recipe.id} imageUrl={recipe.source_image_url} title={recipe.title} onImageChange={handleImageChange} onImageRemove={handleImageRemove} />
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/50 to-transparent pointer-events-none rounded-t-lg" />
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="absolute top-3 left-3 bg-background/60 backdrop-blur-sm hover:bg-background/80">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="absolute top-3 right-3 flex items-center gap-1">
            <TooltipProvider>
              <FavoriteToggle isFavorite={recipe.is_favorite} onToggle={handleToggleFavorite} disabled={toggleFavorite.isPending} tooltipText={recipe.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} variant="overlay" />
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => {
                  const ingredients = recipe.ingredients as Array<{ name: string }>;
                  handleAnalyze();
                  generateImage.mutate({ recipeId: recipe.id, title: recipe.title, ingredients }, {
                    onSuccess: () => toast('Image générée avec succès'),
                    onError: (error) => toast(`Erreur : ${error.message}`, { description: 'La génération d\'image a échoué' }),
                  });
                }} disabled={generateImage.isPending || isAnalyzing} className="h-9 w-9 bg-background/60 backdrop-blur-sm hover:bg-background/80">
                  {(generateImage.isPending || isAnalyzing) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </Button>
              </TooltipTrigger><TooltipContent><p>Analyser & générer image</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild>
                <ShareRecipeDialog recipeId={recipe.id} />
              </TooltipTrigger><TooltipContent><p>Partager</p></TooltipContent></Tooltip>
            </TooltipProvider>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" asChild className="h-9 w-9 bg-background/60 backdrop-blur-sm hover:bg-background/80">
                <Link to={`/recipes/${recipe.id}/edit`}><Edit className="h-4 w-4" /></Link>
              </Button>
            </TooltipTrigger><TooltipContent><p>Éditer</p></TooltipContent></Tooltip>
          </div>
        </div>

        <div className="overflow-x-auto pb-1 -mb-1">
          <div className="flex items-center gap-2 min-w-max py-1">
            <RecipeStatusSelect status={recipe.status} onStatusChange={handleStatusChange} disabled={updateRecipe.isPending} />
            {recipe.season && <><Separator orientation="vertical" className="h-4" /><Badge variant="outline" className="flex items-center gap-1 shrink-0"><Leaf className="h-3 w-3" />{recipe.season}</Badge></>}
            {recipe.nutrition_tags && recipe.nutrition_tags.length > 0 && <><Separator orientation="vertical" className="h-4" />{recipe.nutrition_tags.map((tag, i) => <Badge key={i} variant="secondary" className="shrink-0">{tag}</Badge>)}</>}
            {recipe.calorie_score && <><Separator orientation="vertical" className="h-4" /><Badge variant="outline" className="shrink-0">Score: {recipe.calorie_score}/5</Badge></>}
          </div>
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
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Étapes</span>
              <Sheet open={chatOpen} onOpenChange={setChatOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" title="Assistant culinaire"><MessageCircle className="h-4 w-4" /></Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:w-[400px] md:w-[540px] max-w-full flex flex-col p-0">
                  <AssistantSheetContent
                    recipe={recipe}
                    completedSteps={completedSteps}
                    totalSteps={totalSteps}
                    onClose={() => setChatOpen(false)}
                    onRecipeUpdate={async (data) => {
                      if (user) {
                        await createVersion.mutateAsync({
                          recipeId: recipe.id, userId: user.id, title: recipe.title,
                          servings: recipe.servings, ingredients: recipe.ingredients as Ingredient[],
                          steps: recipe.steps as Step[], season: recipe.season,
                          nutrition_tags: recipe.nutrition_tags, changeDescription: 'Avant modification via assistant',
                        });
                      }
                      await updateRecipe.mutateAsync({ id: recipe.id, title: data.title, servings: data.servings, ingredients: data.ingredients, steps: data.steps });
                      refetch();
                    }}
                    onRecipeCreate={async (data) => {
                      const newRecipe = await createRecipe.mutateAsync({
                        title: data.title, servings: data.servings, ingredients: data.ingredients, steps: data.steps,
                        status: 'draft', is_favorite: false, source_type: 'ai',
                        ai_summary: data.relationToOriginal ? `Inspiré de "${recipe.title}". ${data.relationToOriginal}` : null,
                        season: null, nutrition_tags: null, calorie_score: null, source_image_url: null,
                      });
                      
                      setChatOpen(false);
                      navigate(`/recipes/${newRecipe.id}`);
                    }}
                    recipeId={recipe.id}
                  />
                </SheetContent>
              </Sheet>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {steps.length === 0 ? <p className="text-muted-foreground text-sm">Aucune étape</p> : (
              <ol className="space-y-3">
                {sortedSteps.map((step, index) => {
                  const isDone = completedSteps.has(step.order);
                  const isCurrent = index === currentStepIndex && !isDone;
                  return (
                    <li key={step.order}>
                      <button onClick={() => handleStepToggle(step.order)} className={`w-full text-left flex gap-3 p-3 rounded-lg border transition-colors hover:bg-accent/50 ${isCurrent ? 'border-primary bg-primary/5' : isDone ? 'border-muted bg-muted/30' : 'border-border'}`}>
                        <span className="flex-shrink-0 mt-0.5">{isDone ? <CheckCircle className="h-5 w-5 text-primary" /> : <Circle className={`h-5 w-5 ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`} />}</span>
                        <span className={`text-sm leading-relaxed ${isDone ? 'text-muted-foreground line-through' : ''}`}>{step.text}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>


        {totalSteps > 0 && (
          <div className="fixed bottom-0 left-0 right-0 flex items-center justify-between gap-3 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] bg-background/80 backdrop-blur-sm border-t border-border z-10">
            <span className="text-sm text-muted-foreground">
              Étape {Math.min(completedSteps.size + 1, totalSteps)} / {totalSteps}
            </span>
            <Button
              onClick={handleAdvanceStep}
              disabled={isComplete}
              size="sm"
            >
              {isComplete ? 'Terminé ✓' : 'Étape suivante →'}
            </Button>
          </div>
        )}
        {totalSteps > 0 && <CookingAssistantButton currentStep={completedSteps.size} totalSteps={totalSteps} onPress={() => setChatOpen(!chatOpen)} isComplete={isComplete} />}
      </div>
    </MainLayout>
  );
}

// Assistant Sheet Content
function AssistantSheetContent({
  recipe, completedSteps, totalSteps, onClose, onRecipeUpdate, onRecipeCreate, recipeId,
}: {
  recipe: NonNullable<ReturnType<typeof useRecipe>['data']>;
  completedSteps: Set<number>;
  totalSteps: number;
  onClose: () => void;
  onRecipeUpdate: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[] }) => Promise<void>;
  onRecipeCreate: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[]; relationToOriginal?: string }) => Promise<void>;
  recipeId: string;
}) {
  const { style: swipeStyle, ...swipeHandlers } = useSwipeClose({ onClose, direction: 'right', threshold: 80 });
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');

  return (
    <div className="flex flex-col h-full" style={swipeStyle} {...swipeHandlers}>
      <SheetHeader className="p-4 pb-2 border-b space-y-3">
        <SheetTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">👨‍🍳 Assistant</span>
          {activeTab === 'chat' && <span className="text-sm font-normal text-muted-foreground px-0 pr-[17px]">Étape {Math.min(completedSteps.size + 1, totalSteps)}/{totalSteps}</span>}
        </SheetTitle>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'chat' | 'history')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chat" className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" /><span className="text-xs">Chat</span></TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5"><History className="h-3.5 w-3.5" /><span className="text-xs">Historique</span></TabsTrigger>
          </TabsList>
        </Tabs>
      </SheetHeader>
      {activeTab === 'history' ? (
        <RecipeVersionHistory recipeId={recipeId} onRestore={onClose} />
      ) : (
        <RecipeChatContent recipe={recipe} completedSteps={completedSteps} onRecipeUpdate={onRecipeUpdate} onRecipeCreate={onRecipeCreate} />
      )}
    </div>
  );
}

// Recipe Chat Content using ChatInterface
function RecipeChatContent({
  recipe, completedSteps, onRecipeUpdate, onRecipeCreate,
}: {
  recipe: NonNullable<ReturnType<typeof useRecipe>['data']>;
  completedSteps: Set<number>;
  onRecipeUpdate: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[] }) => Promise<void>;
  onRecipeCreate: (data: { title: string; servings: number; ingredients: Ingredient[]; steps: Step[]; relationToOriginal?: string }) => Promise<void>;
}) {
  const {
    messages, isStreaming, pendingRecipe,
    sendMessage, savePendingRecipe, cancelPendingRecipe,
  } = useRecipeChat({
    recipe, completedSteps,
    onRecipeUpdate: async (data) => await onRecipeUpdate(data),
    onRecipeCreate: async (data) => await onRecipeCreate(data),
  });

  const defaultSuggestions = ["C'est parti !", 'Modifie cette recette', 'Des conseils ?'];

  return (
    <ChatInterface
      messages={messages}
      isStreaming={isStreaming}
      pendingRecipe={pendingRecipe}
      sendMessage={sendMessage}
      savePendingRecipe={savePendingRecipe}
      cancelPendingRecipe={cancelPendingRecipe}
      suggestions={defaultSuggestions}
      placeholder="Poser une question..."
    />
  );
}
