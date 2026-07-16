import { describe, it, expect } from 'vitest';
import { buildRecipeImageObjectPath } from './storage-paths';

describe('buildRecipeImageObjectPath', () => {
  it('préfixe le chemin par l\'uid (contrat de la policy storage du bucket recipes)', () => {
    expect(buildRecipeImageObjectPath('user-1', 'r-42-1700000000.jpg')).toBe(
      'user-1/r-42-1700000000.jpg',
    );
  });

  it('place l\'uid en 1er segment (ce que vérifie la policy RLS storage.foldername(name)[1])', () => {
    const path = buildRecipeImageObjectPath('abc-uid', 'photo.png');
    expect(path.split('/')[0]).toBe('abc-uid');
  });
});
