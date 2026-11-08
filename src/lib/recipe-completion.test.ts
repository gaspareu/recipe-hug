import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke, mockUpdate, mockEq, mockMaybeSingle, mockFrom } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn(() => Promise.resolve({ data: { id: 'r1' }, error: null }));
  const query = { eq: vi.fn(), select: vi.fn(), maybeSingle: mockMaybeSingle };
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  const mockUpdate = vi.fn(() => query);
  return { mockInvoke: vi.fn(), mockUpdate, mockEq: query.eq, mockMaybeSingle,
    mockFrom: vi.fn(() => ({ update: mockUpdate })) };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mockInvoke }, from: mockFrom },
}));

vi.mock('./recipe-metadata', () => ({ saveGeneratedPairingProfile: vi.fn(() => Promise.resolve()) }));
import { saveGeneratedPairingProfile } from './recipe-metadata';

import { triggerRecipeCompletion, type CompletionSource } from './recipe-completion';

const BASE: CompletionSource = {
  updated_at: '2026-11-08T12:00:00Z',
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
  mockMaybeSingle.mockResolvedValue({ data: { id: 'r1' }, error: null });
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

  it("n'appelle pas onUpdated si l'update échoue", async () => {
    mockInvoke.mockResolvedValue(ANALYSIS);
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const onUpdated = vi.fn();

    await expect(triggerRecipeCompletion('r1', BASE, onUpdated)).resolves.toBeUndefined();

    expect(mockUpdate).toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

it('complète le classement et le profil manquants', async () => {
  const profile = { roles: ['base'], flavors: ['doux'], textures: ['crémeux'], equipment: ['casserole'], allergens: ['lait'], dietary_compatibilities: ['végétarien'], dietary_exclusions: ['végan'], active_minutes: 15, make_ahead: true };
  mockInvoke.mockResolvedValue({ data: { ...ANALYSIS.data, entry_kind: 'preparation', pairing_profile: profile }, error: null });
  await triggerRecipeCompletion('r1', { ...BASE, entry_kind: null }, vi.fn());
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ entry_kind: 'preparation' }));
  expect(saveGeneratedPairingProfile).toHaveBeenCalledWith('r1', profile);
});
it('préserve le classement existant', async () => {
  mockInvoke.mockResolvedValue({ data: { ...ANALYSIS.data, entry_kind: 'preparation' }, error: null });
  await triggerRecipeCompletion('r1', { ...BASE, entry_kind: 'complete_dish' }, vi.fn());
  expect(mockUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ entry_kind: 'preparation' }));
});
it('évite un second appel IA si la proposition est complète', async () => {
  const current = { ...BASE, ...ANALYSIS.data, entry_kind: 'preparation' as const, pairing_profile: { roles: ['base'], flavors: ['doux'], textures: ['crémeux'], equipment: ['casserole'], allergens: ['lait'], dietary_compatibilities: ['végétarien'], dietary_exclusions: ['végan'], active_minutes: 15, make_ahead: true } };
  await triggerRecipeCompletion('r1', current, vi.fn());
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(saveGeneratedPairingProfile).toHaveBeenCalledWith('r1', current.pairing_profile);
});

it('ignore une complétion devenue obsolète avant son enregistrement', async () => {
  const profile = { roles: ['base'], flavors: [], textures: [], equipment: [], allergens: [], dietary_compatibilities: [], dietary_exclusions: [], active_minutes: 10, make_ahead: false };
  mockInvoke.mockResolvedValue({ data: { ...ANALYSIS.data, entry_kind: 'preparation', pairing_profile: profile }, error: null });
  // Le classement manuel intermédiaire change updated_at : aucune ligne ne correspond.
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  const onUpdated = vi.fn();
  await triggerRecipeCompletion('r1', BASE, onUpdated);
  expect(mockEq).toHaveBeenCalledWith('updated_at', BASE.updated_at);
  expect(saveGeneratedPairingProfile).not.toHaveBeenCalled();
  expect(onUpdated).not.toHaveBeenCalled();
});
