import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChefHat, Pencil, Trash2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useComposition, useCompositions, useDeleteComposition } from '@/hooks/useCompositions';
import { useRecipes } from '@/hooks/useRecipes';
import { ComposedCookingMode } from '@/components/cooking/ComposedCookingMode';
import { resolveCookingRun } from '@/lib/resolve-cooking-run';
import { aggregateIngredients } from '@/lib/grocery-list';
import { toast } from '@/components/ui/sonner';
import type { Composition, CookingTarget } from '@/types/livre';
import type { Recipe } from '@/types/recipe';

export default function CompositionDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: composition, isLoading } = useComposition(id);
  const { data: compositions = [] } = useCompositions();
  const { data: recipes = [] } = useRecipes();
  const deleteComposition = useDeleteComposition();
  const [servings, setServings] = useState<number | ''>('');
  const [session, setSession] = useState<{ target: CookingTarget; recipes: Recipe[]; compositions: Composition[] } | null>(null);
  const recipeMap = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const compositionMap = new Map(compositions.map(item => [item.id, item]));
  const requestedServings = servings || composition?.servings || 2;
  let preview: ReturnType<typeof resolveCookingRun> | null = null;
  let previewError: string | null = null;
  if (composition) {
    try { preview = resolveCookingRun({ type: composition.kind, id, servings: requestedServings }, recipes, compositions); }
    catch (error) { previewError = error instanceof Error ? error.message : 'Composition invalide'; }
  }

  const handleDelete = async () => {
    if (!composition || !window.confirm(`Supprimer « ${composition.title} » ?`)) return;
    try { await deleteComposition.mutateAsync(composition.id); navigate('/dashboard'); }
    catch { toast('Cette composition est utilisée dans un menu ou un planning. Retirez d’abord ces références.'); }
  };

  if (isLoading) return <MainLayout><p>Chargement de la composition…</p></MainLayout>;
  if (!composition) return <MainLayout><p>Composition introuvable. <Link to="/dashboard">Retour au Livre</Link></p></MainLayout>;

  return (
    <MainLayout>
      <div className="mx-auto max-w-2xl space-y-6 pb-12">
        <Button asChild variant="ghost"><Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Livre</Link></Button>
        <header className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">{composition.kind === 'menu' ? 'Menu' : 'Plat composé'}</p>
          <h1 className="font-solitreo text-4xl">{composition.title}</h1>
          <p className="text-muted-foreground">{composition.items.length} élément{composition.items.length > 1 ? 's' : ''} · {composition.servings} portions par défaut</p>
        </header>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link to={`/compositions/${id}/edit`}><Pencil className="mr-2 h-4 w-4" /> Modifier</Link></Button>
          <Button variant="outline" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" /> Supprimer</Button>
        </div>

        <section className="space-y-3"><h2 className="font-solitreo text-2xl">Composition</h2>
          {composition.items.map((item, index) => {
            const linkedRecipe = item.recipe_id ? recipeMap.get(item.recipe_id) : null;
            const linkedDish = item.child_composition_id ? compositionMap.get(item.child_composition_id) : null;
            return <div key={item.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{item.course || `Élément ${index + 1}`}</p>
              <h3 className="font-solitreo text-xl">{linkedRecipe?.title || linkedDish?.title || 'Élément inaccessible'}</h3>
              {item.quantity_factor !== 1 && <p className="text-sm text-muted-foreground">Coefficient × {item.quantity_factor}</p>}
              {item.notes && <p className="mt-1 text-sm">{item.notes}</p>}
              {linkedRecipe && <Link className="text-sm text-primary underline" to={`/recipes/${linkedRecipe.id}`}>Ouvrir la fiche</Link>}
              {linkedDish && <Link className="text-sm text-primary underline" to={`/compositions/${linkedDish.id}`}>Ouvrir le plat</Link>}
            </div>;
          })}
        </section>
        {composition.assembly_steps.length > 0 && <section className="space-y-2"><h2 className="font-solitreo text-2xl">Dressage et service</h2><ol className="list-inside list-decimal space-y-1 font-crimson">{composition.assembly_steps.map((step, index) => <li key={index}>{step}</li>)}</ol></section>}

        <section className="space-y-3"><h2 className="font-solitreo text-2xl">Cuisiner</h2>
          <div className="flex items-end gap-3"><div className="space-y-1"><Label htmlFor="cooking-servings">Portions</Label><Input id="cooking-servings" type="number" min={1} value={servings} placeholder={String(composition.servings)} onChange={event => setServings(event.target.value ? Number(event.target.value) : '')} className="w-28" /></div>
            <Button className="min-h-11" disabled={!preview || requestedServings <= 0} onClick={() => setSession({ target: { type: composition.kind, id, servings: requestedServings }, recipes: structuredClone(recipes), compositions: structuredClone(compositions) })}><ChefHat className="mr-2 h-4 w-4" /> Cuisiner tout</Button></div>
          {previewError && <p role="alert" className="text-sm text-destructive">{previewError}</p>}
          {preview && <><p className="text-sm text-muted-foreground">Une session continue · {preview.steps.length} étapes</p><ul className="space-y-1 text-sm">{aggregateIngredients(preview.ingredients.map(ingredient => ({ name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit, category: ingredient.category || 'Autres' }))).map(ingredient => <li key={ingredient.name + ingredient.quantities.join(',')}>{ingredient.quantities.join(', ')} {ingredient.name}</li>)}</ul></>}
        </section>
        <p className="text-sm text-muted-foreground">Le partage et l’export se font depuis chaque fiche liée.</p>
      </div>
      {session && <ComposedCookingMode target={session.target} recipes={session.recipes} compositions={session.compositions} onClose={() => setSession(null)} />}
    </MainLayout>
  );
}
