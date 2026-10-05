import { Link } from 'react-router-dom';
import { Plus, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRecipes } from '@/hooks/useRecipes';
import { usePairingFeedback, usePairingRecommendations } from '@/hooks/usePairings';
import type { Recipe } from '@/types/recipe';
import { toast } from '@/components/ui/sonner';

export function RecipePairings({ recipe, servings }: { recipe: Recipe; servings?: number }) {
  const { data: recipes = [] } = useRecipes();
  const { data: suggestions = [], isPending, isError } = usePairingRecommendations(recipe.id, recipe.status !== 'archived');
  const feedback = usePairingFeedback();
  const recipesById = new Map(recipes.map(candidate => [candidate.id, candidate]));

  const submitFeedback = async (candidateRecipeId: string, signal: 'relevant' | 'not_for_me' | 'hidden') => {
    try { await feedback.mutateAsync({ sourceRecipeId: recipe.id, candidateRecipeId, signal }); }
    catch { toast('Impossible d’enregistrer votre avis'); }
  };

  const complete = recipe.entry_kind === 'complete_dish';
  const composeUrl = (ids: string[]) => `/compositions/new?${new URLSearchParams({ kind: 'dish', recipes: ids.join(','), ...(servings ? { servings: String(servings) } : {}) })}`;
  return <Card className="rounded-none border-0 bg-transparent shadow-none">
    <CardHeader><CardTitle role="heading" aria-level={2} className="font-solitreo text-2xl font-normal">{complete ? 'Ajouter un accompagnement' : 'Avec quoi les servir ?'}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">Des suggestions issues de votre Livre. Choisissez une fiche, puis ajustez la composition avant de l’enregistrer.</p>
      {isPending && <p className="text-sm">Recherche d’accords…</p>}
      {isError && <p className="text-sm text-muted-foreground">Suggestions indisponibles pour le moment. Vous pouvez composer manuellement.</p>}
      {!isPending && !isError && suggestions.length === 0 && <p className="text-sm text-muted-foreground">Aucun accord vérifié dans le Livre pour le moment.</p>}
      {suggestions.filter(suggestion => recipesById.has(suggestion.recipeId)).slice(0, 3).map(suggestion => {
        const candidate = recipesById.get(suggestion.recipeId);
        if (!candidate) return null;
        return <div key={candidate.id} className="rounded-xl border border-border p-3">
          <Link to={`/recipes/${candidate.id}`} className="font-semibold text-primary underline">{candidate.title}</Link>
          <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button asChild size="sm" variant="outline" className="min-h-11"><Link to={composeUrl([recipe.id, candidate.id])}><Plus className="mr-1 h-3.5 w-3.5" /> Choisir</Link></Button>
            <Button size="icon" variant="ghost" className="h-11 w-11" disabled={feedback.isPending} aria-label={`Accord pertinent : ${candidate.title}`} onClick={() => submitFeedback(candidate.id, 'relevant')}><ThumbsUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-11 w-11" disabled={feedback.isPending} aria-label={`Pas pour moi : ${candidate.title}`} onClick={() => submitFeedback(candidate.id, 'not_for_me')}><ThumbsDown className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-11 w-11" disabled={feedback.isPending} aria-label={`Masquer cet accord : ${candidate.title}`} onClick={() => submitFeedback(candidate.id, 'hidden')}><X className="h-4 w-4" /></Button>
          </div>
        </div>;
      })}
      <Button asChild variant="outline" className="min-h-11 w-full"><Link to={composeUrl([recipe.id])}><Plus className="mr-2 h-4 w-4" /> {complete ? 'Choisir un accompagnement…' : 'Composer un plat…'}</Link></Button>
    </CardContent>
  </Card>;
}
