import { describe, expect, it } from 'vitest';
import { annotateCookingText, formatCookingQuantity, getStepIngredients } from './cooking-ingredients';
import type { Ingredient, Step } from '@/types/recipe';

const ingredients: Ingredient[] = [
  { name: 'Oignon jaune', quantity: 1, unit: 'pièce' },
  { name: 'Gousses d’ail', quantity: 2, unit: '' },
  { name: "Huile d'olive", quantity: 2, unit: 'c. à soupe' },
  { name: 'Pois chiches', quantity: 400, unit: 'g' },
  { name: 'Sel', quantity: 0, unit: 'pincée' },
];

describe('getStepIngredients', () => {
  it('utilise en priorité les noms structurés de l’étape', () => {
    const step: Step = {
      order: 1,
      text: 'Préparez les aromates.',
      ingredient_names: ['Oignon jaune', 'Gousses d’ail'],
    };

    expect(getStepIngredients(step, ingredients).map(item => item.name)).toEqual([
      'Oignon jaune',
      'Gousses d’ail',
    ]);
  });

  it('détecte les ingrédients dans le texte des recettes historiques', () => {
    const step: Step = {
      order: 1,
      text: "Émincez les oignons et l’ail, puis faites-les revenir dans l’huile.",
    };

    expect(getStepIngredients(step, ingredients).map(item => item.name)).toEqual([
      'Oignon jaune',
      'Gousses d’ail',
      "Huile d'olive",
    ]);
  });

  it('revient à la détection textuelle si une association structurée est obsolète', () => {
    const step: Step = {
      order: 2,
      text: 'Ajoutez les pois chiches.',
      ingredient_names: ['Ingrédient supprimé'],
    };

    expect(getStepIngredients(step, ingredients).map(item => item.name)).toEqual(['Pois chiches']);
  });

  it('retourne une liste vide sans correspondance', () => {
    expect(getStepIngredients({ order: 3, text: 'Laissez mijoter.' }, ingredients)).toEqual([]);
  });

  it('ne confond pas deux ingrédients qui partagent un nom générique', () => {
    const oils: Ingredient[] = [
      { name: 'Huile de sésame', quantity: 1, unit: 'c. à soupe' },
      { name: "Huile d'olive", quantity: 2, unit: 'c. à soupe' },
    ];

    expect(getStepIngredients(
      { order: 4, text: "Ajoutez l'huile de sésame." },
      oils,
    ).map(item => item.name)).toEqual(['Huile de sésame']);
  });
});

describe('formatCookingQuantity', () => {
  it('formate les décimales en français', () => {
    expect(formatCookingQuantity({ name: 'Lait', quantity: 12.5, unit: 'cl' })).toBe('12,5 cl');
  });

  it('masque le zéro mais conserve l’unité conventionnelle', () => {
    expect(formatCookingQuantity({ name: 'Sel', quantity: 0, unit: 'pincée' })).toBe('pincée');
  });
});

describe('annotateCookingText', () => {
  it('repère les ingrédients dans la phrase en conservant le texte original', () => {
    const text = 'Mettre l’eau dans le bol et ajouter les pois chiches.';
    const segments = annotateCookingText(text, [ingredients[3], { name: 'Eau', quantity: 500, unit: 'ml' }]);

    expect(segments.map(segment => segment.text).join('')).toBe(text);
    expect(segments.filter(segment => segment.ingredient).map(segment => segment.ingredient?.name)).toEqual([
      'Eau',
      'Pois chiches',
    ]);
  });

  it('ne confond pas deux ingrédients qui partagent le même mot générique', () => {
    const oils: Ingredient[] = [
      { name: 'Huile de sésame', quantity: 1, unit: 'c. à soupe' },
      { name: "Huile d'olive", quantity: 2, unit: 'c. à soupe' },
    ];

    const annotated = annotateCookingText("Ajouter l'huile de sésame.", oils);
    expect(annotated.filter(segment => segment.ingredient).map(segment => segment.ingredient?.name)).toEqual([
      'Huile de sésame',
    ]);
  });

  it('repère une quantité existante afin de pouvoir la remplacer', () => {
    const text = 'Ajouter 200 g de farine puis 10 cl de lait.';
    const annotated = annotateCookingText(text, [
      { name: 'Farine', quantity: 300, unit: 'g' },
      { name: 'Lait', quantity: 15, unit: 'cl' },
    ]);

    expect(annotated.map(segment => segment.text).join('')).toBe(text);
    expect(annotated.filter(segment => segment.ingredient).map(segment => segment.replacementSuffix)).toEqual([
      ' de farine',
      ' de lait',
    ]);
  });

  it('repère un nombre nu pour une unité de comptage implicite', () => {
    const annotated = annotateCookingText('Ajouter 2 œufs.', [
      { name: 'Œufs', quantity: 3, unit: 'pièce' },
    ]);
    const ingredientSegment = annotated.find(segment => segment.ingredient);

    expect(ingredientSegment?.replacementSuffix).toBe(' œufs');
    expect(ingredientSegment?.quantityWithoutUnit).toBe(true);
  });

  it('conserve l’unité après une quantité écrite en toutes lettres', () => {
    const annotated = annotateCookingText('Ajouter une gousse d’ail.', [
      { name: 'Ail', quantity: 3, unit: 'gousse' },
    ]);
    const ingredientSegment = annotated.find(segment => segment.ingredient);

    expect(ingredientSegment?.replacementUnit).toBe('gousse');
    expect(ingredientSegment?.replacementSuffix).toBe(' d’ail');
  });
});
