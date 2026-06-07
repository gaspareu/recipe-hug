import { parseRecipe } from './useRecipes';

describe('parseRecipe', () => {
  it('conserve les ingrédients et étapes fournis', () => {
    const data = {
      id: '1',
      title: 'Tarte',
      ingredients: [{ name: 'Pomme', quantity: 3, unit: null }],
      steps: [{ description: 'Éplucher' }],
    };
    const result = parseRecipe(data);
    expect(result.ingredients).toEqual([{ name: 'Pomme', quantity: 3, unit: null }]);
    expect(result.steps).toEqual([{ description: 'Éplucher' }]);
  });

  it('remplace des ingrédients null par un tableau vide', () => {
    const result = parseRecipe({ id: '1', title: 'X', ingredients: null, steps: null });
    expect(result.ingredients).toEqual([]);
    expect(result.steps).toEqual([]);
  });

  it('remplace des ingrédients absents par un tableau vide', () => {
    const result = parseRecipe({ id: '1', title: 'X' });
    expect(result.ingredients).toEqual([]);
    expect(result.steps).toEqual([]);
  });

  it('préserve les autres champs de la recette', () => {
    const data = {
      id: 'abc',
      title: 'Soupe',
      status: 'validated',
      is_favorite: true,
      servings: 4,
    };
    const result = parseRecipe(data);
    expect(result.id).toBe('abc');
    expect(result.title).toBe('Soupe');
    expect(result.status).toBe('validated');
    expect(result.is_favorite).toBe(true);
    expect(result.servings).toBe(4);
  });
});
