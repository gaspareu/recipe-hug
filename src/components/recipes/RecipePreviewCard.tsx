import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Sparkles, Users, ChefHat, ListOrdered, ChevronDown, ChevronUp, Save, Loader2 } from 'lucide-react';
import type { ExtractedRecipe } from '@/hooks/useRecipeChat';

interface RecipePreviewCardProps {
  recipe: ExtractedRecipe;
  onSave: () => void;
  isSaving: boolean;
}

export function RecipePreviewCard({ recipe, onSave, isSaving }: RecipePreviewCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Group ingredients by category
  const ingredientsByCategory = recipe.ingredients.reduce((acc, ing) => {
    const category = ing.category || 'Autres';
    if (!acc[category]) acc[category] = [];
    acc[category].push(ing);
    return acc;
  }, {} as Record<string, typeof recipe.ingredients>);

  return (
    <Card className="border-primary/50 bg-primary/5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-2">
          <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg leading-tight">{recipe.title}</CardTitle>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {recipe.servings} portions
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <ChefHat className="h-3 w-3" />
                {recipe.ingredients.length} ingrédients
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <ListOrdered className="h-3 w-3" />
                {recipe.steps.length} étapes
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              Voir les détails
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            {/* Ingredients */}
            <div>
              <h4 className="font-medium text-sm mb-2">Ingrédients</h4>
              <div className="space-y-2">
                {Object.entries(ingredientsByCategory).map(([category, ingredients]) => (
                  <div key={category}>
                    <p className="text-xs text-muted-foreground font-medium mb-1">{category}</p>
                    <ul className="text-sm space-y-0.5 pl-2">
                      {ingredients.map((ing, idx) => (
                        <li key={idx} className="text-muted-foreground">
                          • {ing.quantity} {ing.unit} {ing.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Steps */}
            <div>
              <h4 className="font-medium text-sm mb-2">Étapes</h4>
              <ol className="text-sm space-y-1.5">
                {recipe.steps
                  .sort((a, b) => a.order - b.order)
                  .map((step) => (
                    <li key={step.order} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{step.order}.</span> {step.text}
                    </li>
                  ))}
              </ol>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Button 
          onClick={onSave} 
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enregistrement...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Enregistrer dans mon livre
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
