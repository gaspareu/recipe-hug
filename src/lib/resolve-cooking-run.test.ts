import { describe, expect, it } from 'vitest';
import { advanceCookingRun, aggregateCookingIngredients, resolveCookingRun } from './resolve-cooking-run';
import type { Recipe } from '@/types/recipe';
import type { Composition, CompositionItem } from '@/types/livre';

const recipe = (id: string, servings: number | null, quantity: number): Recipe => ({
  id, user_id: 'u1', title: id, status: 'validated', entry_kind: 'preparation',
  is_favorite: false, servings, ingredients: [{ name: 'Carotte', quantity, unit: 'g' }],
  steps: [{ order: 1, text: `Préparer ${id}` }], season: null, nutrition_tags: null,
  calorie_score: null, ai_summary: null, source_type: 'manual', source_image_url: null,
  created_at: '', updated_at: '',
});
const item = (id: string, parent: string, position: number, recipeId: string | null, childId: string | null, factor = 1): CompositionItem => ({
  id, user_id: 'u1', composition_id: parent, position, course: null, notes: null,
  recipe_id: recipeId, child_composition_id: childId, quantity_factor: factor,
});
const composition = (id: string, kind: 'dish' | 'menu', items: CompositionItem[], assembly: string[] = []): Composition => ({
  id, user_id: 'u1', kind, title: id, servings: 4, assembly_steps: assembly,
  created_at: '', updated_at: '', items,
});

describe('resolveCookingRun', () => {
  it('concatène un menu, garde chaque occurrence et multiplie les facteurs', () => {
    const dish = composition('dish', 'dish', [
      item('first', 'dish', 0, 'carottes', null),
      item('second', 'dish', 1, 'yaourt', null, 1.5),
    ], ['Dresser']);
    const menu = composition('menu', 'menu', [
      item('menu-a', 'menu', 0, 'carottes', null),
      item('menu-b', 'menu', 1, null, 'dish'),
    ]);
    const run = resolveCookingRun({ type: 'menu', id: 'menu', servings: 4 },
      [recipe('carottes', 4, 600), recipe('yaourt', 2, 100)], [dish, menu]);
    expect(run.steps.map(step => step.sourceTitle)).toEqual(['carottes', 'carottes', 'yaourt', 'dish']);
    expect(new Set(run.steps.map(step => step.key)).size).toBe(4);
    expect(run.segments.map(segment => segment.ingredients[0].quantity)).toEqual([600, 600, 300]);
    expect(run.steps[3].assembly).toBe(true);
  });

  it('utilise deux portions pour une fiche ancienne sans rendement', () => {
    const run = resolveCookingRun({ type: 'recipe', id: 'legacy', servings: 4 }, [recipe('legacy', null, 100)], []);
    expect(run.ingredients[0].quantity).toBe(200);
  });

  it('signale une fiche supprimée au lieu de lancer une session incomplète', () => {
    const dish = composition('dish', 'dish', [item('missing', 'dish', 0, 'absent', null)]);
    expect(() => resolveCookingRun({ type: 'dish', id: 'dish', servings: 2 }, [], [dish]))
      .toThrow('inaccessible');
  });

  it('n’additionne pas les quantités historiques en texte', () => {
    const ingredients = [
      { name: 'Sel', quantity: 'une pincée', unit: '' },
      { name: 'Sel', quantity: 'une pincée', unit: '' },
      { name: 'Carotte', quantity: 100, unit: 'g' },
      { name: 'Carotte', quantity: 200, unit: 'g' },
    ] as unknown as Recipe['ingredients'];
    expect(aggregateCookingIngredients(ingredients).map(ingredient => ingredient.quantity)).toEqual([
      'une pincée', 'une pincée', 300,
    ]);
  });

  it('ne marque pas les étapes sautées et revient à la première étape inachevée', () => {
    const run = resolveCookingRun({ type: 'menu', id: 'menu', servings: 4 }, [recipe('a', 4, 1), recipe('b', 4, 1)], [
      composition('menu', 'menu', [item('a', 'menu', 0, 'a', null), item('b', 'menu', 1, 'b', null)]),
    ]);
    const jumpedToLast = advanceCookingRun(run.steps, 1, new Set<string>());
    expect(jumpedToLast.index).toBe(0);
    expect([...jumpedToLast.completed]).toEqual([run.steps[1].key]);
    const finished = advanceCookingRun(run.steps, 0, jumpedToLast.completed);
    expect(finished.index).toBe(2);
    expect(finished.completed.size).toBe(2);
  });
});
