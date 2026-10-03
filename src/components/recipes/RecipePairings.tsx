import { Link } from 'react-router-dom';
import { Plus, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRecipes } from '@/hooks/useRecipes';
import { usePairingFeedback, usePairingRecommendations } from '@/hooks/usePairings';
import type { Recipe } from '@/types/recipe';
import { toast } from '@/components/ui/sonner';

export function RecipePairings({ recipe }: { recipe: Recipe }) {
  const { data: recipes = [] } = useRecipes();
  const { data: suggestions = [], isPending, isError } = usePairingRecommendations(recipe.id, recipe.status !== 'archived');
  const feedback = usePairingFeedback();
  const recipesById = new Map(recipes.map(candidate => [candidate.id, candidate]));

  const submitFeedback = async (candidateRecipeId: string, signal: 'relevant' | 'not_for_me' | 'hidden') => {
    try { await feedback.mutateAsync({ sourceRecipeId: recipe.id, candidateRecipeId, signal }); }
    catch { toast('Impossible d’enregistrer votre avis'); }
  };

  return <Card className="rounded-2xl border-border bg-card">
    <CardHeader><CardTitle className="font-solitreo text-xl font-normal">Accords possibles</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">Choisissez des fiches existantes, puis ajustez le plat avant de l’enregistrer. Les compatibilités alimentaires non vérifiées sont exclues des suggestions automatiques.</p>
      {isPending && <p className="text-sm">Recherche d’accords…</p>}
      {isError && <p className="text-sm text-muted-foreground">Suggestions indisponibles pour le moment. Vous pouvez composer manuellement.</p>}
      {!isPending && !isError && suggestions.length === 0 && <p className="text-sm text-muted-foreground">Aucun accord vérifié dans le Livre pour le moment.</p>}
      {suggestions.map(suggestion => {
        const candidate = recipesById.get(suggestion.recipeId);
        if (!candidate) return null;
        return <div key={candidate.id} className="rounded-xl border border-border p-3">
          <Link to={`/recipes/${candidate.id}`} className="font-semibold text-primary underline">{candidate.title}</Link>
          <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button asChild size="sm" variant="outline"><Link to={`/compositions/new?kind=dish&recipes=${recipe.id},${candidate.id}`}><Plus className="mr-1 h-3.5 w-3.5" /> Composer</Link></Button>
            <Button size="icon" variant="ghost" aria-label={`Accord pertinent : ${candidate.title}`} onClick={() => submitFeedback(candidate.id, 'relevant')}><ThumbsUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" aria-label={`Pas pour moi : ${candidate.title}`} onClick={() => submitFeedback(candidate.id, 'not_for_me')}><ThumbsDown className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" aria-label={`Masquer cet accord : ${candidate.title}`} onClick={() => submitFeedback(candidate.id, 'hidden')}><X className="h-4 w-4" /></Button>
          </div>
        </div>;
      })}
      <Button asChild variant="outline" className="w-full"><Link to={`/compositions/new?kind=dish&recipes=${recipe.id}`}><Plus className="mr-2 h-4 w-4" /> Composer librement</Link></Button>
    </CardContent>
  </Card>;
}
