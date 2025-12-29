import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Users, ListChecks, Sparkles, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RecipeStatusBadge } from '@/components/recipes/RecipeStatusBadge';
import { FavoriteToggle } from '@/components/recipes/FavoriteToggle';
import { IngredientChecklist } from '@/components/recipes/IngredientChecklist';
import { useRecipe, useDeleteRecipe, useToggleFavorite, useUpdateRecipe } from '@/hooks/useRecipes';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { data: recipe, isLoading } = useRecipe(id || '');
  const deleteRecipe = useDeleteRecipe();
  const toggleFavorite = useToggleFavorite();
  const updateRecipe = useUpdateRecipe();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleDelete = async () => {
    if (!id) return;
    
    try {
      await deleteRecipe.mutateAsync(id);
      toast({
        title: 'Succès',
        description: 'Recette supprimée',
      });
      navigate('/dashboard');
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer la recette',
        variant: 'destructive',
      });
    }
  };

  const handleToggleFavorite = () => {
    if (!recipe) return;
    toggleFavorite.mutate({ id: recipe.id, is_favorite: !recipe.is_favorite });
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{recipe.title}</h1>
                <FavoriteToggle
                  isFavorite={recipe.is_favorite}
                  onToggle={handleToggleFavorite}
                  disabled={toggleFavorite.isPending}
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <RecipeStatusBadge status={recipe.status} />
                {recipe.servings && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {recipe.servings} portions
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={handleAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Analyser
            </Button>
            <Button variant="outline" size="icon" asChild>
              <Link to={`/recipes/${recipe.id}/edit`}>
                <Edit className="h-4 w-4" />
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer cette recette ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action est irréversible. La recette "{recipe.title}" sera définitivement supprimée.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {recipe.nutrition_tags && recipe.nutrition_tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {recipe.nutrition_tags.map((tag, index) => (
              <Badge key={index} variant="secondary">
                {tag}
              </Badge>
            ))}
            {recipe.calorie_score && (
              <Badge variant="outline">
                Score calorique: {recipe.calorie_score}/5
              </Badge>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Ingrédients ({recipe.ingredients.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recipe.ingredients.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucun ingrédient</p>
            ) : (
              <IngredientChecklist ingredients={recipe.ingredients} />
            )}
          </CardContent>
        </Card>

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

        {recipe.ai_summary && (
          <Card>
            <CardHeader>
              <CardTitle>Résumé IA</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{recipe.ai_summary}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
