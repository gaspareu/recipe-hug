import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Sparkles, Save } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IngredientEditor } from '@/components/recipes/IngredientEditor';
import { StepsEditor } from '@/components/recipes/StepsEditor';
import { useCreateRecipe } from '@/hooks/useRecipes';
import { useToast } from '@/hooks/use-toast';
import type { Ingredient, Step, RecipeStatus } from '@/types/recipe';

export default function RecipeNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createRecipe = useCreateRecipe();

  const [title, setTitle] = useState('');
  const [servings, setServings] = useState<number | ''>('');
  const [status, setStatus] = useState<RecipeStatus>('draft');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);

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
        source_type: 'manual',
        source_image_url: null,
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

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Nouvelle Recette</h1>
        </div>

        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual">✍️ Manuel</TabsTrigger>
            <TabsTrigger value="capture" disabled>
              <Camera className="mr-1 h-4 w-4" />
              Capture
            </TabsTrigger>
            <TabsTrigger value="ai" disabled>
              <Sparkles className="mr-1 h-4 w-4" />
              IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="mt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
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
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <IngredientEditor ingredients={ingredients} onChange={setIngredients} />
              
              <StepsEditor steps={steps} onChange={setSteps} />

              <Button type="submit" className="w-full" disabled={createRecipe.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {createRecipe.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="capture" className="mt-6">
            <div className="text-center py-12 text-muted-foreground">
              <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Capture photo à venir</p>
              <p className="text-sm">Prenez une photo de votre recette manuscrite</p>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="mt-6">
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Génération IA à venir</p>
              <p className="text-sm">Décrivez une recette et laissez l'IA la créer</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
