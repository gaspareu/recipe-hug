import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRecipes } from '@/hooks/useRecipes';
import { useComposition, useCompositions, useSaveComposition } from '@/hooks/useCompositions';
import { toast } from '@/components/ui/sonner';
import type { CompositionDraftItem, CompositionKind } from '@/types/livre';

const emptyItem = (): CompositionDraftItem => ({ recipe_id: null, child_composition_id: null, course: null, notes: null, quantity_factor: 1 });

export default function CompositionEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const requestedKind: CompositionKind = params.get('kind') === 'menu' ? 'menu' : 'dish';
  const existing = useComposition(id ?? '');
  const { data: compositions = [] } = useCompositions();
  const { data: recipes = [] } = useRecipes();
  const save = useSaveComposition();
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState(() => {
    const requested = Number(params.get('servings'));
    return Number.isSafeInteger(requested) && requested > 0 ? requested : 2;
  });
  const [items, setItems] = useState<CompositionDraftItem[]>(() => {
    const ids = (params.get('recipes') ?? '').split(',').filter(Boolean).slice(0, 10);
    return ids.length ? ids.map(recipeId => ({ ...emptyItem(), recipe_id: recipeId })) : [emptyItem()];
  });
  const [assemblyText, setAssemblyText] = useState('');
  const kind = existing.data?.kind ?? requestedKind;

  useEffect(() => {
    if (!existing.data) return;
    const composition = existing.data;
    /* eslint-disable react-hooks/set-state-in-effect -- chargement initial du formulaire éditable */
    setTitle(composition.title);
    setServings(composition.servings);
    setItems(composition.items.map(item => ({
      recipe_id: item.recipe_id,
      child_composition_id: item.child_composition_id,
      course: item.course,
      notes: item.notes,
      quantity_factor: item.quantity_factor,
    })));
    setAssemblyText(composition.assembly_steps.join('\n'));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [existing.data]);

  const choices = [
    ...recipes.filter(recipe => recipe.status !== 'archived' || items.some(item => item.recipe_id === recipe.id)).map(recipe => ({
      key: `recipe:${recipe.id}`, label: recipe.title,
    })),
    ...(kind === 'menu' ? compositions.filter(composition => composition.kind === 'dish').map(composition => ({
      key: `dish:${composition.id}`, label: `${composition.title} · plat composé`,
    })) : []),
  ];

  const updateItem = (index: number, patch: Partial<CompositionDraftItem>) => {
    setItems(current => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  };
  const moveItem = (index: number, direction: -1 | 1) => {
    setItems(current => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!title.trim() || !Number.isInteger(servings) || servings <= 0 || items.some(item =>
      (!item.recipe_id && !item.child_composition_id) ||
      !Number.isFinite(item.quantity_factor) || item.quantity_factor <= 0 || item.quantity_factor > 100)) {
      toast('Vérifiez le titre, les portions, les éléments et leurs coefficients');
      return;
    }
    try {
      const savedId = await save.mutateAsync({
        id,
        kind,
        title,
        servings,
        assembly_steps: assemblyText.split('\n').map(step => step.trim()).filter(Boolean),
        items,
      });
      navigate(`/compositions/${savedId}`);
    } catch (error) {
      console.error('Erreur enregistrement composition', error);
      toast('Impossible d’enregistrer ce plat ou menu');
    }
  };

  if (id && existing.isLoading) return <MainLayout><p>Chargement de la composition…</p></MainLayout>;
  if (id && !existing.data) return <MainLayout><p>Composition introuvable.</p></MainLayout>;

  return (
    <MainLayout>
      <div className="mx-auto max-w-2xl space-y-6 pb-12">
        <Button asChild variant="ghost"><Link to={id ? `/compositions/${id}` : '/dashboard'}><ArrowLeft className="mr-2 h-4 w-4" /> Retour</Link></Button>
        <header>
          <p className="text-sm uppercase tracking-widest text-muted-foreground">Le Livre</p>
          <h1 className="font-solitreo text-3xl">{id ? 'Modifier' : 'Créer'} {kind === 'menu' ? 'un menu' : 'un plat composé'}</h1>
          <p className="text-sm text-muted-foreground">Les fiches restent indépendantes et leurs changements seront repris à la prochaine ouverture.</p>
        </header>

        <div className="space-y-2"><Label htmlFor="composition-title">Nom *</Label><Input id="composition-title" value={title} onChange={event => setTitle(event.target.value)} placeholder={kind === 'menu' ? 'Dîner automnal' : 'Carottes, riz et yaourt'} /></div>
        <div className="space-y-2"><Label htmlFor="composition-servings">Portions *</Label><Input id="composition-servings" type="number" min={1} value={servings} onChange={event => setServings(Number(event.target.value))} /></div>

        <section className="space-y-3" aria-label="Éléments de la composition">
          <div className="flex items-center justify-between"><h2 className="font-solitreo text-2xl">{kind === 'menu' ? 'Services' : 'Préparations'}</h2><Button variant="outline" onClick={() => setItems(current => [...current, emptyItem()])}><Plus className="mr-2 h-4 w-4" /> Ajouter</Button></div>
          {items.map((item, index) => (
            <div key={index} className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between"><strong>{kind === 'menu' ? 'Service' : 'Élément'} {index + 1}</strong><div className="flex gap-1">
                <Button size="icon" variant="ghost" aria-label={`Monter l’élément ${index + 1}`} disabled={index === 0} onClick={() => moveItem(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Descendre l’élément ${index + 1}`} disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Retirer l’élément ${index + 1}`} disabled={items.length === 1} onClick={() => setItems(current => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
              </div></div>
              <Select value={item.recipe_id ? `recipe:${item.recipe_id}` : item.child_composition_id ? `dish:${item.child_composition_id}` : ''}
                onValueChange={value => updateItem(index, { recipe_id: value.startsWith('recipe:') ? value.slice(7) : null, child_composition_id: value.startsWith('dish:') ? value.slice(5) : null })}>
                <SelectTrigger aria-label={`Fiche ou plat pour l’élément ${index + 1}`}><SelectValue placeholder="Choisir une fiche ou un plat" /></SelectTrigger>
                <SelectContent>{choices.map(choice => <SelectItem key={choice.key} value={choice.key}>{choice.label}</SelectItem>)}</SelectContent>
              </Select>
              {item.recipe_id && recipes.find(recipe => recipe.id === item.recipe_id)?.servings == null && <p className="text-xs text-amber-700 dark:text-amber-300">Cette fiche n’indique pas son rendement. Les quantités utiliseront 2 portions comme base. <Link className="underline" to={`/recipes/${item.recipe_id}/edit`}>Corriger la fiche</Link></p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label htmlFor={`factor-${index}`}>Coefficient</Label><Input id={`factor-${index}`} type="number" min="0.1" max="100" step="0.1" value={item.quantity_factor} onChange={event => updateItem(index, { quantity_factor: Number(event.target.value) })} /></div>
                {kind === 'menu' && <div className="space-y-1"><Label htmlFor={`course-${index}`}>Service</Label><Input id={`course-${index}`} value={item.course ?? ''} onChange={event => updateItem(index, { course: event.target.value })} placeholder="Entrée, plat, dessert…" /></div>}
              </div>
              <div className="space-y-1"><Label htmlFor={`notes-${index}`}>Note de service</Label><Input id={`notes-${index}`} value={item.notes ?? ''} onChange={event => updateItem(index, { notes: event.target.value })} /></div>
            </div>
          ))}
        </section>

        <div className="space-y-2"><Label htmlFor="assembly">Dressage ou service, une étape par ligne</Label><Textarea id="assembly" value={assemblyText} onChange={event => setAssemblyText(event.target.value)} placeholder="Dresser les carottes sur le riz, puis ajouter le yaourt." /></div>
        <Button className="w-full min-h-12" disabled={save.isPending} onClick={handleSave}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
      </div>
    </MainLayout>
  );
}
