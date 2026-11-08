import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGeneratedPairingProfile } from '../../supabase/functions/_shared/recipe-metadata';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), upsert: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: mocks.getUser }, from: vi.fn(() => ({ upsert: mocks.upsert })),
} }));
import { saveGeneratedPairingProfile } from './recipe-metadata';
const profile = { roles: ['base'], flavors: ['doux'], textures: ['crémeux'], equipment: ['casserole'], allergens: ['lait'], dietary_compatibilities: ['végétarien'], dietary_exclusions: ['végan'], active_minutes: 15, make_ahead: true };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
});
describe('profil généré du Livre', () => {
  it('enregistre le profil sans écraser un profil existant ni certifier sa revue', async () => {
    await saveGeneratedPairingProfile('r1', { ...profile, user_id: 'autre', recipe_id: 'autre', allergen_review_state: 'reviewed', dietary_review_state: 'reviewed' });
    expect(mocks.upsert).toHaveBeenCalledWith({ ...profile, user_id: 'u1', recipe_id: 'r1', allergen_review_state: 'unknown', dietary_review_state: 'unknown' }, { onConflict: 'recipe_id', ignoreDuplicates: true });
  });
  it.each([{ ...profile, active_minutes: -1 }, { ...profile, allergens: 'lait' }, { ...profile, make_ahead: 'oui' }, undefined])('ignore un profil malformé : %s', async value => {
    expect(parseGeneratedPairingProfile(value)).toBeNull();
    await saveGeneratedPairingProfile('r1', value);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('remonte une erreur de stockage pour permettre une reprise', async () => {
    mocks.upsert.mockResolvedValue({ error: new Error('échec') });
    await expect(saveGeneratedPairingProfile('r1', profile)).rejects.toThrow('échec');
  });
});

it('régénère le profil lors d’une modification explicite et remet les revues à vérifier', async () => {
  const profile = { roles: ['accompagnement'], flavors: [], textures: [], equipment: [], allergens: [], dietary_compatibilities: [], dietary_exclusions: [], active_minutes: 10, make_ahead: true };
  await saveGeneratedPairingProfile('r1', profile, true);
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ roles: ['accompagnement'], allergen_review_state: 'unknown', dietary_review_state: 'unknown' }), { onConflict: 'recipe_id', ignoreDuplicates: false });
});
