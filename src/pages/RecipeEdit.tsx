import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, X, Trash2 } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { IngredientEditor } from '@/components/recipes/IngredientEditor';
import { StepsEditor } from '@/components/recipes/StepsEditor';
import { useRecipe, useUpdateRecipe, useDeleteRecipe } from '@/hooks/useRecipes';
import { toast } from 'sonner';
import type { Ingredient, Step, RecipeStatus } from '@/types/recipe';

const AVAILABLE_TAGS = [
  'protéines', 'fibres', 'léger', 'végétarien', 'végan', 
  'sans gluten', 'sans lactose', 'vitamines', 'fer', 
  'oméga-3', 'énergétique', 'réconfortant'
];

const SEASONS = ['printemps', 'été', 'automne', 'hiver', 'toutes saisons'];

export default function RecipeEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { data: recipe, isLoading } = useRecipe(id || '');
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();

  const [title, setTitle] = useState('');
  const [servings, setServings] = useState<number | ''>('');
  const [status, setStatus] = useState<RecipeStatus>('draft');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [nutritionTags, setNutritionTags] = useState<string[]>([]);
  const [season, setSeason] = useState<string>('');

  useEffect(() => {
    if (recipe) {
      setTitle(recipe.title);
      setServings(recipe.servings || '');
      setStatus(recipe.status);
      setIngredients(recipe.ingredients);
      setSteps(recipe.steps);
      setNutritionTags(recipe.nutrition_tags || []);
      setSeason(recipe.season || '');
    }
  }, [recipe]);

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
    
    if (!id || !title.trim()) {
      toast.error('Erreur', {
        description: 'Le titre est obligatoire',
      });
      return;
    }

    try {
      await updateRecipe.mutateAsync({
        id,
        title: title.trim(),
        status,
        servings: servings || null,
        ingredients,
        steps,
        nutrition_tags: nutritionTags.length > 0 ? nutritionTags : null,
        season: season || null,
      });
      
      toast.success('Succès', {
        description: 'Recette mise à jour !',
      });
      navigate(`/recipes/${id}`);
    } catch (error) {
      toast.error('Erreur', {
        description: 'Impossible de mettre à jour la recette',
      });
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    
    try {
      await deleteRecipe.mutateAsync(id);
      toast.success('Succès', {
        description: 'Recette supprimée',
      });
      navigate('/dashboard');
    } catch (error) {
      toast.error('Erreur', {
        description: 'Impossible de supprimer la recette',
      });
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[400px]" />
        </div>
      </MainLayout>
    );
  }

  if (!recipe) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Recette introuvable</p>
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
            <h1 className="text-2xl font-bold">Modifier la recette</h1>
          </div>
          <Button type="submit" form="recipe-edit-form" disabled={updateRecipe.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {updateRecipe.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>

        <form id="recipe-edit-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titre *</Label>
              <Input
                id="title"
                placeholder="Ex: Tarte aux pommes de mamie"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Statut</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as RecipeStatus)}>
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
              <Select value={season || "none"} onValueChange={(v) => setSeason(v === "none" ? "" : v)}>
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
                <Select onValueChange={addTag} value="">
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

          <div className="flex gap-4">
            <Button type="submit" className="flex-1" disabled={updateRecipe.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {updateRecipe.isPending ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
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
        </form>
      </div>
    </MainLayout>
  );
}
