import { aggregateIngredients, groupByCategory, type GroceryIngredient } from './grocery-list';

describe('aggregateIngredients', () => {
  it('retourne une liste vide pour une entrée vide', () => {
    expect(aggregateIngredients([])).toEqual([]);
  });

  it('additionne les quantités numériques de même nom et même unité', () => {
    const input: GroceryIngredient[] = [
      { name: 'Farine', quantity: 200, unit: 'g', category: 'Épicerie' },
      { name: 'Farine', quantity: 300, unit: 'g', category: 'Épicerie' },
    ];
    const result = aggregateIngredients(input);
    expect(result).toEqual([
      { name: 'Farine', quantities: ['500 g'], category: 'Épicerie' },
    ]);
  });

  it('ne fusionne pas deux quantités de même nom mais d\'unités différentes', () => {
    const input: GroceryIngredient[] = [
      { name: 'Lait', quantity: 1, unit: 'L', category: 'Frais' },
      { name: 'Lait', quantity: 200, unit: 'ml', category: 'Frais' },
    ];
    const result = aggregateIngredients(input);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ name: 'Lait', quantities: ['1 L'], category: 'Frais' });
    expect(result).toContainEqual({ name: 'Lait', quantities: ['200 ml'], category: 'Frais' });
  });

  it('traite les quantités sous forme de chaîne numérique comme des nombres', () => {
    const input: GroceryIngredient[] = [
      { name: 'Oeufs', quantity: '2', unit: null, category: 'Frais' },
      { name: 'Oeufs', quantity: 3, unit: null, category: 'Frais' },
    ];
    const result = aggregateIngredients(input);
    expect(result).toEqual([
      { name: 'Oeufs', quantities: ['5'], category: 'Frais' },
    ]);
  });

  it('fusionne en ignorant la casse et les espaces du nom et de l\'unité', () => {
    const input: GroceryIngredient[] = [
      { name: 'Sucre', quantity: 100, unit: 'g', category: 'Épicerie' },
      { name: '  sucre ', quantity: 50, unit: ' G ', category: 'Épicerie' },
    ];
    const result = aggregateIngredients(input);
    expect(result).toHaveLength(1);
    expect(result[0].quantities).toEqual(['150 g']);
  });

  it('conserve distinctes les quantités non numériques de même nom', () => {
    const input: GroceryIngredient[] = [
      { name: 'Sel', quantity: 'une pincée', unit: null, category: 'Épicerie' },
      { name: 'Sel', quantity: 'au goût', unit: null, category: 'Épicerie' },
    ];
    const result = aggregateIngredients(input);
    expect(result).toEqual([
      { name: 'Sel', quantities: ['une pincée', 'au goût'], category: 'Épicerie' },
    ]);
  });

  it('déduplique les quantités non numériques identiques', () => {
    const input: GroceryIngredient[] = [
      { name: 'Poivre', quantity: 'une pincée', unit: null, category: 'Épicerie' },
      { name: 'Poivre', quantity: 'une pincée', unit: null, category: 'Épicerie' },
    ];
    const result = aggregateIngredients(input);
    expect(result).toEqual([
      { name: 'Poivre', quantities: ['une pincée'], category: 'Épicerie' },
    ]);
  });

  it('gère une quantité null sans unité (ingrédient sans mesure)', () => {
    const input: GroceryIngredient[] = [
      { name: 'Persil', quantity: null, unit: null, category: 'Légumes' },
    ];
    const result = aggregateIngredients(input);
    expect(result).toEqual([
      { name: 'Persil', quantities: [], category: 'Légumes' },
    ]);
  });

  it('combine quantité non numérique avec son unité', () => {
    const input: GroceryIngredient[] = [
      { name: 'Vin', quantity: 'un peu de', unit: 'verre', category: 'Cave' },
    ];
    const result = aggregateIngredients(input);
    expect(result[0].quantities).toEqual(['un peu de verre']);
  });

  it('attribue la catégorie « Autres » quand aucune catégorie n\'est fournie', () => {
    const input: GroceryIngredient[] = [
      { name: 'Truc', quantity: 1, unit: null, category: '' },
    ];
    const result = aggregateIngredients(input);
    expect(result[0].category).toBe('Autres');
  });

  it('formate une quantité numérique sans unité sans espace superflu', () => {
    const input: GroceryIngredient[] = [
      { name: 'Citrons', quantity: 2, unit: null, category: 'Fruits' },
    ];
    const result = aggregateIngredients(input);
    expect(result[0].quantities).toEqual(['2']);
  });
});

describe('groupByCategory', () => {
  it('regroupe les items par catégorie', () => {
    const items = [
      { name: 'Pomme', quantities: ['3'], category: 'Fruits' },
      { name: 'Carotte', quantities: ['5'], category: 'Légumes' },
      { name: 'Banane', quantities: ['2'], category: 'Fruits' },
    ];
    const result = groupByCategory(items);
    const fruits = result.find(([cat]) => cat === 'Fruits');
    expect(fruits?.[1]).toHaveLength(2);
  });

  it('trie les catégories par ordre alphabétique (locale fr)', () => {
    const items = [
      { name: 'a', quantities: [], category: 'Légumes' },
      { name: 'b', quantities: [], category: 'Épicerie' },
      { name: 'c', quantities: [], category: 'Boucherie' },
    ];
    const result = groupByCategory(items).map(([cat]) => cat);
    expect(result).toEqual(['Boucherie', 'Épicerie', 'Légumes']);
  });

  it('place toujours « Autres » en dernier', () => {
    const items = [
      { name: 'a', quantities: [], category: 'Autres' },
      { name: 'b', quantities: [], category: 'Légumes' },
      { name: 'c', quantities: [], category: 'Boucherie' },
    ];
    const result = groupByCategory(items).map(([cat]) => cat);
    expect(result[result.length - 1]).toBe('Autres');
    expect(result).toEqual(['Boucherie', 'Légumes', 'Autres']);
  });

  it('retourne un tableau vide pour une entrée vide', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
