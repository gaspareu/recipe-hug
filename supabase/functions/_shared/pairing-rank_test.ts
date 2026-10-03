import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { rankPairings, type PairingRecipe, type PairingMetadata } from './pairing-rank.ts';

const recipe = (id: string): PairingRecipe => ({ id, entry_kind: 'preparation', status: 'validated', season: null, ingredients: [] });
const profile = (id: string, roles: string[], reviewed = true): PairingMetadata => ({
  recipe_id: id, roles, flavors: [], textures: [], equipment: [], allergens: [],
  allergen_review_state: reviewed ? 'reviewed' : 'unknown', dietary_compatibilities: [],
  dietary_exclusions: [], dietary_review_state: reviewed ? 'reviewed' : 'unknown', active_minutes: 10,
});

Deno.test('accords : exclut la source, les profils non revus et les éléments masqués', () => {
  const source = recipe('carottes');
  const results = rankPairings(source, [source, recipe('riz'), recipe('yaourt'), recipe('pain')],
    [profile('carottes', ['accompagnement']), profile('riz', ['base']), profile('yaourt', ['sauce'], false), profile('pain', ['base'])],
    { allergies: ['lait'], diets: [], restrictions: [], dislikedIngredients: [], unavailableEquipment: [] },
    [], { pain: 'hidden' });
  assertEquals(results.map(item => item.recipeId), ['riz']);
});

Deno.test('accords : refuse un allergène et un équipement incompatible', () => {
  const unsafe = { ...profile('yaourt', ['sauce']), allergens: ['lait'] };
  const equipment = { ...profile('riz', ['base']), equipment: ['four'] };
  const results = rankPairings(recipe('carottes'), [recipe('yaourt'), recipe('riz')],
    [unsafe, equipment], { allergies: ['lait'], diets: [], restrictions: [], dislikedIngredients: [], unavailableEquipment: ['four'] });
  assertEquals(results, []);
});

Deno.test('accords : une revue sans compatibilité explicite ne valide pas un régime strict', () => {
  const candidate = recipe('riz');
  const reviewed = profile('riz', ['base']);
  const constraints = { allergies: [], diets: ['végan'], restrictions: [], dislikedIngredients: [], unavailableEquipment: [] };
  assertEquals(rankPairings(recipe('carottes'), [candidate], [reviewed], constraints), []);
  assertEquals(rankPairings(recipe('carottes'), [candidate], [{ ...reviewed, dietary_compatibilities: ['végan'] }], constraints).length, 1);
});

Deno.test('accords : normalise les allergènes pluriels et exclut les libellés inconnus', () => {
  const candidate = recipe('sauce');
  const constraints = { allergies: ['arachides'], diets: [], restrictions: [], dislikedIngredients: [], unavailableEquipment: [] };
  assertEquals(rankPairings(recipe('carottes'), [candidate], [{ ...profile('sauce', ['sauce']), allergens: ['arachide'] }], constraints), []);
  assertEquals(rankPairings(recipe('carottes'), [candidate], [{ ...profile('sauce', ['sauce']), allergens: ['lait et arachides'] }], constraints), []);
  assertEquals(rankPairings(recipe('carottes'), [candidate], [{ ...profile('sauce', ['sauce']), allergens: ['lait et allergène inconnu'] }], constraints), []);
  assertEquals(rankPairings(recipe('carottes'), [candidate], [{ ...profile('sauce', ['sauce']), allergens: ['œufs'] }], { ...constraints, allergies: ['oeuf'] }), []);
  assertEquals(rankPairings(recipe('carottes'), [candidate], [{ ...profile('sauce', ['sauce']), allergens: ['ingrédient non répertorié'] }], constraints), []);
  assertEquals(rankPairings(recipe('carottes'), [candidate], [profile('sauce', ['sauce'])], { ...constraints, allergies: ['allergie inconnue'] }), []);
});
