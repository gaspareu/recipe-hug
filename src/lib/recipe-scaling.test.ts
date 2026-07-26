import { describe, it, expect } from 'vitest';
import { scaleIngredients } from './recipe-scaling';
import type { Ingredient } from '@/types/recipe';

const base: Ingredient[] = [
  { name: 'Farine', quantity: 200, unit: 'g' },
  { name: 'Œufs', quantity: 2, unit: '' },
  { name: 'Sel', quantity: 0, unit: 'pincée' },
];

describe('scaleIngredients', () => {
  it('double les quantités quand on double les portions', () => {
    const out = scaleIngredients(base, 2, 4);
    expect(out[0].quantity).toBe(400);
    expect(out[1].quantity).toBe(4);
  });

  it('arrondit à 2 décimales et supprime les décimales inutiles', () => {
    const out = scaleIngredients([{ name: 'Lait', quantity: 100, unit: 'ml' }], 3, 4);
    // 100 * 4/3 = 133.33
    expect(out[0].quantity).toBe(133.33);
  });

  it('laisse les quantités à 0 inchangées (pincée, qs)', () => {
    const out = scaleIngredients(base, 2, 6);
    expect(out[2].quantity).toBe(0);
  });

  it('ne divise pas par zéro : baseServings <= 0 renvoie les ingrédients inchangés', () => {
    const out = scaleIngredients(base, 0, 4);
    expect(out).toEqual(base);
  });

  it('renvoie une nouvelle liste sans muter l\'entrée (immutabilité)', () => {
    const out = scaleIngredients(base, 2, 4);
    expect(out).not.toBe(base);
    expect(base[0].quantity).toBe(200);
  });
});
