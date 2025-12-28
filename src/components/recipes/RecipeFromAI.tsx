import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Sparkles, ChefHat, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCreateRecipe } from "@/hooks/useRecipes";
import { IngredientEditor } from "./IngredientEditor";
import { StepsEditor } from "./StepsEditor";
import type { Ingredient, Step } from "@/types/recipe";

const PROMPT_EXAMPLES = [
  "Une recette de tarte aux pommes traditionnelle",
  "Un plat végétarien rapide pour 2 personnes",
  "Des cookies au chocolat moelleux",
  "Un risotto aux champignons crémeux",
];

export function RecipeFromAI() {
  const navigate = useNavigate();
  const createRecipe = useCreateRecipe();
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Generated recipe data
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState<number | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Veuillez entrer une description de recette");
      return;
    }

    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-recipe', {
        body: { prompt: prompt.trim() }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      // Populate form with generated data
      setTitle(data.title || "");
      setServings(data.servings || null);
      setIngredients(data.ingredients || []);
      setSteps(data.steps || []);
      setHasGenerated(true);

      toast.success("Recette générée avec succès !");
    } catch (error) {
      console.error("Error generating recipe:", error);
      toast.error("Erreur lors de la génération. Réessayez.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Le titre est requis");
      return;
    }

    setIsSaving(true);

    try {
      await createRecipe.mutateAsync({
        title: title.trim(),
        status: "draft",
        is_favorite: false,
        servings: servings || null,
        ingredients,
        steps,
        season: null,
        nutrition_tags: null,
        calorie_score: null,
        ai_summary: null,
        source_type: "ai",
        source_image_url: null,
      });

      toast.success("Recette enregistrée !");
      navigate("/dashboard");
    } catch (error) {
      console.error("Error saving recipe:", error);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setTitle("");
    setServings(null);
    setIngredients([]);
    setSteps([]);
    setHasGenerated(false);
  };

  if (!hasGenerated) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="h-5 w-5" />
                <span>Décrivez la recette que vous souhaitez créer</span>
              </div>

              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Une recette de risotto aux champignons pour 4 personnes, crémeuse et savoureuse..."
                className="min-h-[120px] resize-none"
              />

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Idées :</p>
                <div className="flex flex-wrap gap-2">
                  {PROMPT_EXAMPLES.map((example) => (
                    <Button
                      key={example}
                      variant="outline"
                      size="sm"
                      onClick={() => setPrompt(example)}
                      className="text-xs"
                    >
                      {example}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <ChefHat className="mr-2 h-4 w-4" />
                    Générer la recette
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground">
          <p>L'IA va créer une recette complète avec ingrédients et étapes.</p>
          <p>Vous pourrez modifier le résultat avant de l'enregistrer.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">Recette générée par IA</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Nouvelle génération
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Titre de la recette</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nom de la recette"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="servings">Nombre de portions</Label>
          <Input
            id="servings"
            type="number"
            min={1}
            value={servings || ""}
            onChange={(e) => setServings(e.target.value ? parseInt(e.target.value) : null)}
            placeholder="Ex: 4"
          />
        </div>
      </div>

      <IngredientEditor ingredients={ingredients} onChange={setIngredients} />

      <StepsEditor steps={steps} onChange={setSteps} />

      <Button onClick={handleSave} disabled={isSaving} className="w-full">
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enregistrement...
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            Enregistrer la recette
          </>
        )}
      </Button>
    </div>
  );
}
