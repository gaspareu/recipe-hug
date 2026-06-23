import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke, mockUpdate, mockEq, mockFrom } = vi.hoisted(() => {
  const mockEq = vi.fn(() => Promise.resolve({ error: null }));
  const mockUpdate = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ update: mockUpdate }));
  return { mockInvoke: vi.fn(), mockUpdate, mockEq, mockFrom };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mockInvoke }, from: mockFrom },
}));

import { triggerRecipeCompletion, type CompletionSource } from './recipe-completion';

const BASE: CompletionSource = {
  title: 'Risotto',
  ingredients: [{ name: 'Riz', quantity: 200, unit: 'g' }],
  steps: [{ order: 1, text: 'Cuire' }],
  ai_summary: null,
  calorie_score: null,
  nutrition_tags: null,
  season: null,
};

const ANALYSIS = {
  data: {
    ai_summary: 'Un risotto crémeux.',
    nutrition_tags: ['protéines'],
    calorie_score: 3,
    season: 'hiver',
  },
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEq.mockResolvedValue({ error: null });
});

describe('triggerRecipeCompletion', () => {
  it('complète les 4 champs quand la recette est vide', async () => {
    mockInvoke.mockResolvedValue(ANALYSIS);
    const onUpdated = vi.fn();

    await triggerRecipeCompletion('r1', BASE, onUpdated);

    expect(mockInvoke).toHaveBeenCalledWith('analyze-recipe', {
      body: { title: 'Risotto', ingredients: BASE.ingredients, steps: BASE.steps },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      ai_summary: 'Un risotto crémeux.',
      calorie_score: 3,
      nutrition_tags: ['protéines'],
      season: 'hiver',
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'r1');
    expect(onUpdated).toHaveBeenCalled();
  });

  it("n'écrase pas les tags et la saison déjà saisis", async () => {
    mockInvoke.mockResolvedValue(ANALYSIS);

    await triggerRecipeCompletion(
      'r1',
      { ...BASE, nutrition_tags: ['léger'], season: 'été' },
      vi.fn(),
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      ai_summary: 'Un risotto crémeux.',
      calorie_score: 3,
    });
  });

  it("n'appelle pas update quand tout est déjà rempli", async () => {
    mockInvoke.mockResolvedValue(ANALYSIS);
    const onUpdated = vi.fn();

    await triggerRecipeCompletion(
      'r1',
      { ...BASE, ai_summary: 'Déjà là', calorie_score: 2, nutrition_tags: ['fer'], season: 'automne' },
      onUpdated,
    );

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('avale les erreurs analyze-recipe sans throw ni update', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const onUpdated = vi.fn();

    await expect(triggerRecipeCompletion('r1', BASE, onUpdated)).resolves.toBeUndefined();

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
