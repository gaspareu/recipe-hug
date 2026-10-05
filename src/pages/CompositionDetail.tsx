import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChefHat, Pencil, Trash2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ServingsControl } from '@/components/recipes/ServingsControl';
import { IngredientChecklist } from '@/components/recipes/IngredientChecklist';
import { useComposition, useCompositions, useDeleteComposition } from '@/hooks/useCompositions';
import { useRecipes } from '@/hooks/useRecipes';
import { useDetailServings } from '@/hooks/useDetailServings';
import { ComposedCookingMode } from '@/components/cooking/ComposedCookingMode';
import { resolveCookingRun, aggregateCookingIngredients } from '@/lib/resolve-cooking-run';
import { toast } from '@/components/ui/sonner';
import type { Composition, CookingTarget } from '@/types/livre';
import type { Recipe } from '@/types/recipe';

export default function CompositionDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: composition, isLoading, isError } = useComposition(id);
  const { data: compositions = [] } = useCompositions();
  const { data: recipes = [], isLoading: recipesLoading, isError: recipesError } = useRecipes();
  const deleteComposition = useDeleteComposition();
  const { servings, setServings } = useDetailServings(id, composition?.servings);
  const [session, setSession] = useState<{ target: CookingTarget; recipes: Recipe[]; compositions: Composition[] } | null>(null);
  const recipeMap = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const compositionMap = new Map(compositions.map(item => [item.id, item]));
  let preview: ReturnType<typeof resolveCookingRun> | null = null;
  let previewError: string | null = null;
  if (composition && !recipesLoading && !recipesError) {
    try { preview = resolveCookingRun({ type: composition.kind, id, servings }, recipes, compositions); }
    catch (error) { previewError = error instanceof Error ? error.message : 'Composition invalide'; }
  }

  const handleDelete = async () => {
    if (!composition || !window.confirm(`Supprimer « ${composition.title} » ?`)) return;
    try { await deleteComposition.mutateAsync(composition.id); navigate('/dashboard'); }
    catch { toast('Cette composition est utilisée dans un menu ou un planning. Retirez d’abord ces références.'); }
  };
  if (isLoading) return <MainLayout><p role="status">Chargement de la composition…</p></MainLayout>;
  if (isError) return <MainLayout><p role="alert">Impossible de charger cette composition. <Link to="/dashboard">Retour au Livre</Link></p></MainLayout>;
  if (!composition) return <MainLayout><p>Composition introuvable. <Link to="/dashboard">Retour au Livre</Link></p></MainLayout>;
  const isMenu = composition.kind === 'menu';

  return <MainLayout>
    <div className="mx-auto max-w-5xl space-y-8 pb-32">
      <Button asChild variant="ghost" className="min-h-11 px-0"><Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Retour au livre</Link></Button>
      <header className="max-w-2xl space-y-3">
        <p className="text-sm font-medium text-primary">{isMenu ? 'Menu' : 'Plat composé'}</p>
        <h1 className="font-solitreo text-3xl leading-tight sm:text-4xl">{composition.title}</h1>
        <p className="text-sm text-muted-foreground">{composition.items.length} élément{composition.items.length > 1 ? 's' : ''} · {servings} portion{servings > 1 ? 's' : ''}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11"><Link to={`/compositions/${id}/edit`}><Pencil className="mr-2 h-4 w-4" aria-hidden="true" />{isMenu ? 'Modifier le menu' : 'Modifier la composition'}</Link></Button>
          <Button variant="ghost" className="min-h-11 text-muted-foreground" disabled={deleteComposition.isPending} onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Supprimer</Button>
        </div>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
        <div className="min-w-0 space-y-8 lg:order-2">
          <section className="space-y-4" aria-labelledby="composition-elements">
            <h2 id="composition-elements" className="border-t border-border pt-5 font-solitreo text-2xl">{isMenu ? 'Au menu' : 'Composition'}</h2>
            <ol className="divide-y divide-border">{[...composition.items].sort((a, b) => a.position - b.position).map((item, index) => {
              const linkedRecipe = item.recipe_id ? recipeMap.get(item.recipe_id) : null;
              const linkedDish = item.child_composition_id ? compositionMap.get(item.child_composition_id) : null;
              return <li key={item.id} className="flex items-start gap-3 py-4">
                <span className="mt-1 text-sm tabular-nums text-primary">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  {item.course && <p className="text-sm font-medium text-primary">{item.course}</p>}
                  <h3 className="font-semibold">{linkedRecipe?.title || linkedDish?.title || (recipesLoading ? 'Chargement…' : 'Élément inaccessible')}</h3>
                  {item.quantity_factor !== 1 && <p className="text-sm text-muted-foreground">Quantité × {item.quantity_factor}</p>}
                  {item.notes && <p className="text-base leading-relaxed">{item.notes}</p>}
                  {linkedRecipe && <Link className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4" to={`/recipes/${linkedRecipe.id}`}>Voir la fiche</Link>}
                  {linkedDish && <Link className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4" to={`/compositions/${linkedDish.id}`}>Voir le plat</Link>}
                </div>
              </li>;
            })}</ol>
          </section>
          {composition.assembly_steps.length > 0 && <section className="space-y-4"><h2 className="border-t border-border pt-5 font-solitreo text-2xl">Dressage et service</h2><ol className="list-inside list-decimal space-y-3 text-base leading-relaxed">{composition.assembly_steps.map((step, index) => <li key={index}>{step}</li>)}</ol></section>}
          <p className="text-sm text-muted-foreground">Le partage et l’export se font depuis chaque fiche liée.</p>
        </div>
        <section className="min-w-0 space-y-4 lg:order-1" aria-labelledby="composition-ingredients">
          <ServingsControl value={servings} onChange={setServings} />
          <h2 id="composition-ingredients" className="border-t border-border pt-5 font-solitreo text-2xl">Ingrédients</h2>
          {recipesLoading && <p role="status">Chargement des fiches liées…</p>}
          {recipesError && <p role="alert" className="text-destructive">Impossible de charger les fiches liées.</p>}
          {previewError && <p role="alert" className="text-sm text-destructive">{previewError}</p>}
          {preview && <Tabs defaultValue="all" key={id}>
            <TabsList className="h-auto w-full"><TabsTrigger value="all" className="min-h-11 flex-1">Ensemble</TabsTrigger><TabsTrigger value="segments" className="min-h-11 flex-1">Par préparation</TabsTrigger></TabsList>
            <TabsContent value="all"><IngredientChecklist key={`all-${id}`} ingredients={aggregateCookingIngredients(preview.ingredients)} /></TabsContent>
            <TabsContent value="segments" className="space-y-6">{preview.segments.map(segment => <div key={segment.key} className="space-y-2">
              <h3 className="font-semibold">{segment.course && `${segment.course} · `}{segment.recipe.title}</h3>
              {(!segment.recipe.servings || segment.recipe.servings <= 0) && <p className="text-sm text-muted-foreground">Rendement supposé : 2 portions. <Link className="underline" to={`/recipes/${segment.recipe.id}/edit`}>Préciser le rendement</Link></p>}
              <IngredientChecklist ingredients={segment.ingredients} />
            </div>)}</TabsContent>
          </Tabs>}
        </section>
      </div>
    </div>
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Une session continue{preview && ` · ${preview.steps.length} étapes`}</p>
        <Button className="min-h-12 flex-1 sm:flex-none" disabled={!preview} onClick={() => setSession({ target: { type: composition.kind, id, servings }, recipes: structuredClone(recipes), compositions: structuredClone(compositions) })}><ChefHat className="mr-2 h-4 w-4" aria-hidden="true" />{isMenu ? 'Cuisiner le menu' : 'Cuisiner le plat'}</Button>
      </div>
    </div>
    {session && <ComposedCookingMode target={session.target} recipes={session.recipes} compositions={session.compositions} onClose={() => setSession(null)} />}
  </MainLayout>;
}
