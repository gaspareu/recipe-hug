import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Users, ListChecks, Sparkles, Loader2, Leaf } from 'lucide-react';
import { CookingAssistantButton } from '@/components/recipes/CookingAssistantButton';
import { CookingAssistantModal } from '@/components/recipes/CookingAssistantModal';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { RecipeStatusSelect } from '@/components/recipes/RecipeStatusSelect';
import { FavoriteToggle } from '@/components/recipes/FavoriteToggle';
import { IngredientChecklistWithHeader } from '@/components/recipes/IngredientChecklist';
import { useRecipe, useToggleFavorite, useUpdateRecipe } from '@/hooks/useRecipes';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { RecipeStatus } from '@/types/recipe';
export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { data: recipe, isLoading } = useRecipe(id || '');
  const toggleFavorite = useToggleFavorite();
  const updateRecipe = useUpdateRecipe();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const handleToggleFavorite = () => {
    if (!recipe) return;
    toggleFavorite.mutate({ id: recipe.id, is_favorite: !recipe.is_favorite });
  };

  const handleStatusChange = (newStatus: RecipeStatus) => {
    if (!recipe) return;
    updateRecipe.mutate({ id: recipe.id, status: newStatus });
  };

  const handleAnalyze = async () => {
    if (!recipe) return;
    
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-recipe', {
        body: {
          title: recipe.title,
          ingredients: recipe.ingredients,
          steps: recipe.steps,
        },
      });

      if (error) throw error;

      await updateRecipe.mutateAsync({
        id: recipe.id,
        ai_summary: data.ai_summary,
        nutrition_tags: data.nutrition_tags,
        calorie_score: data.calorie_score,
        season: data.season,
      });

      toast({
        title: 'Analyse terminée',
        description: 'Le résumé nutritionnel a été généré',
      });
    } catch (error) {
      console.error('Error analyzing recipe:', error);
      toast({
        title: 'Erreur',
        description: "Impossible d'analyser la recette",
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </MainLayout>
    );
  }

  if (!recipe) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Recette introuvable</p>
          <Button asChild className="mt-4">
            <Link to="/dashboard">Retour au dashboard</Link>
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{recipe.title}</h1>
              <TooltipProvider>
                <div className="flex items-center gap-1">
                  <FavoriteToggle
                    isFavorite={recipe.is_favorite}
                    onToggle={handleToggleFavorite}
                    disabled={toggleFavorite.isPending}
                    tooltipText={recipe.is_favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="h-9 w-9"
                      >
                        {isAnalyzing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Analyser</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
          </div>
          
          <Button variant="outline" asChild>
            <Link to={`/recipes/${recipe.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Éditer
            </Link>
          </Button>
        </div>

        <div className="overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            <RecipeStatusSelect 
              status={recipe.status} 
              onStatusChange={handleStatusChange}
              disabled={updateRecipe.isPending}
            />
            
            {recipe.season && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <Badge variant="outline" className="flex items-center gap-1 shrink-0">
                  <Leaf className="h-3 w-3" />
                  {recipe.season}
                </Badge>
              </>
            )}
            
            {recipe.nutrition_tags && recipe.nutrition_tags.length > 0 && (
              <>
                <Separator orientation="vertical" className="h-4" />
                {recipe.nutrition_tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="shrink-0">
                    {tag}
                  </Badge>
                ))}
              </>
            )}
            
            {recipe.calorie_score && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <Badge variant="outline" className="shrink-0">
                  Score: {recipe.calorie_score}/5
                </Badge>
              </>
            )}
          </div>
        </div>

        {recipe.ai_summary && (
          <p className="text-sm text-muted-foreground">{recipe.ai_summary}</p>
        )}

        {recipe.ingredients.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5" />
                Ingrédients
                {recipe.servings && (
                  <span className="text-sm font-normal text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {recipe.servings} portions
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Aucun ingrédient</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <IngredientChecklistWithHeader 
              ingredients={recipe.ingredients}
              renderHeader={(toggleButton) => (
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <ListChecks className="h-5 w-5" />
                      Ingrédients
                      {recipe.servings && (
                        <span className="text-sm font-normal text-muted-foreground flex items-center gap-1 ml-1">
                          <Users className="h-3.5 w-3.5" />
                          {recipe.servings} portions
                        </span>
                      )}
                    </span>
                    {toggleButton}
                  </CardTitle>
                </CardHeader>
              )}
            />
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Étapes ({recipe.steps.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {recipe.steps.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucune étape</p>
            ) : (
              <ol className="space-y-4">
                {recipe.steps
                  .sort((a, b) => a.order - b.order)
                  .map((step) => (
                    <li key={step.order} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                        {step.order}
                      </span>
                      <p className="text-sm leading-relaxed pt-0.5">{step.text}</p>
                    </li>
                  ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <CookingAssistantButton onClick={() => setIsAssistantOpen(true)} />
        
        <CookingAssistantModal
          recipe={recipe}
          isOpen={isAssistantOpen}
          onClose={() => setIsAssistantOpen(false)}
        />
      </div>
    </MainLayout>
  );
}
