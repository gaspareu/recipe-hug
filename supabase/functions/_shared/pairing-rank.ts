export interface PairingRecipe {
  id: string;
  entry_kind: string | null;
  status: string;
  season: string | null;
  ingredients: Array<{ name?: string }>;
}

export interface PairingMetadata {
  recipe_id: string;
  roles: string[];
  flavors: string[];
  textures: string[];
  equipment: string[];
  allergens: string[];
  allergen_review_state: string;
  dietary_compatibilities: string[];
  dietary_exclusions: string[];
  dietary_review_state: string;
  active_minutes: number | null;
}

export interface PairingConstraints {
  allergies: string[];
  diets: string[];
  restrictions: string[];
  dislikedIngredients: string[];
  unavailableEquipment: string[];
  maxActiveMinutes?: number;
}

export interface RankedPairing {
  recipeId: string;
  score: number;
  reason: string;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('fr');
const intersects = (left: string[], right: string[]) => left.some(value => right.map(normalize).includes(normalize(value)));
const canonicalAllergens = (value: string): string[] | null => {
  const text = normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe');
  const rules: Array<[RegExp, string]> = [
    [/\b(arachid\w*|cacahuet\w*|peanut\w*)\b/, 'arachide'],
    [/\b(lait\w*|lactos\w*|casein\w*|produits? laitier\w*)\b/, 'lait'],
    [/\b(oeuf\w*|egg\w*)\b/, 'oeuf'],
    [/\b(fruits? a coque|noix|noisett\w*|amand\w*|cajou\w*|pistach\w*|pecan\w*|macadamia\w*)\b/, 'fruits_a_coque'],
    [/\b(gluten\w*|ble\w*|seigle\w*|orge\w*|avoine\w*)\b/, 'gluten'],
    [/\b(soja\w*|soy\w*)\b/, 'soja'],
    [/\b(sesame\w*)\b/, 'sesame'],
    [/\b(poisson\w*|fish\w*)\b/, 'poisson'],
    [/\b(crustace\w*|crevett\w*)\b/, 'crustaces'],
    [/\b(mollusqu\w*|coquillag\w*)\b/, 'mollusques'],
    [/\b(celeri\w*)\b/, 'celeri'],
    [/\b(moutard\w*)\b/, 'moutarde'],
    [/\b(lupin\w*)\b/, 'lupin'],
    [/\b(sulfit\w*|sulfur\w*)\b/, 'sulfites'],
  ];
  const parts = text.split(/\s+(?:et|ou)\s+|[,;/+&]/).map(part => part.trim()).filter(Boolean);
  const matches = parts.map(part => rules.filter(([pattern]) => pattern.test(part)).map(([, key]) => key));
  // Un terme inconnu dans un champ composé impose une vérification manuelle.
  return matches.length && matches.every(group => group.length) ? [...new Set(matches.flat())] : null;
};

const allergenConflict = (declared: string[], allergies: string[]): boolean => {
  if (!allergies.length) return false;
  const userGroups = allergies.map(canonicalAllergens);
  const declaredGroups = declared.map(canonicalAllergens);
  // Le texte libre inconnu ne permet pas de conclure à une compatibilité.
  if (userGroups.includes(null) || declaredGroups.includes(null)) return true;
  const userKeys = new Set(userGroups.flatMap(group => group ?? []));
  return declaredGroups.some(group => group?.some(key => userKeys.has(key)));
};

export function rankPairings(
  source: PairingRecipe,
  candidates: PairingRecipe[],
  profiles: PairingMetadata[],
  constraints: PairingConstraints,
  excludedIds: string[] = [],
  feedback: Record<string, string> = {},
): RankedPairing[] {
  const profileMap = new Map(profiles.map(profile => [profile.recipe_id, profile]));
  const sourceProfile = profileMap.get(source.id);
  const excluded = new Set([source.id, ...excludedIds]);
  const strictDiet = constraints.diets.length > 0 || constraints.restrictions.length > 0;
  const results: RankedPairing[] = [];

  for (const candidate of candidates) {
    if (excluded.has(candidate.id) || candidate.status === 'archived' || candidate.entry_kind === null) continue;
    if (feedback[candidate.id] === 'hidden') continue;
    const profile = profileMap.get(candidate.id);
    if (constraints.allergies.length && (!profile || profile.allergen_review_state !== 'reviewed')) continue;
    if (strictDiet && (!profile || profile.dietary_review_state !== 'reviewed')) continue;
    if (strictDiet && ![...constraints.diets, ...constraints.restrictions].every(required =>
      profile?.dietary_compatibilities.some(compatible => normalize(compatible) === normalize(required)))) continue;
    if (constraints.unavailableEquipment.length && !profile) continue;
    if (profile && allergenConflict(profile.allergens, constraints.allergies)) continue;
    if (profile && intersects(profile.dietary_exclusions, [...constraints.diets, ...constraints.restrictions])) continue;
    if (profile && intersects(profile.equipment, constraints.unavailableEquipment)) continue;
    if (constraints.maxActiveMinutes !== undefined && (profile?.active_minutes == null || profile.active_minutes > constraints.maxActiveMinutes)) continue;
    if (candidate.ingredients.some(ingredient => constraints.dislikedIngredients.some(disliked =>
      normalize(ingredient.name ?? '').includes(normalize(disliked))))) continue;

    const roles = profile?.roles ?? [];
    let score = candidate.status === 'validated' ? 3 : candidate.status === 'tested' ? 2 : 0;
    let reason = 'Une fiche complémentaire de votre Livre.';
    if (source.entry_kind === 'complete_dish') {
      if (roles.includes('accompagnement')) { score += 6; reason = 'Un accompagnement pour compléter ce plat.'; }
      else if (roles.includes('sauce')) { score += 5; reason = 'Une sauce pour accompagner ce plat.'; }
    } else if (sourceProfile?.roles.includes('accompagnement')) {
      if (roles.includes('base')) { score += 6; reason = 'Une base pour servir cet accompagnement.'; }
      else if (roles.includes('sauce')) { score += 5; reason = 'Une sauce pour lier cet accompagnement.'; }
    } else if (roles.includes('accompagnement')) {
      score += 4; reason = 'Un accompagnement pour compléter cette préparation.';
    } else if (roles.includes('base')) {
      score += 3; reason = 'Une base à associer à cette préparation.';
    }
    if (source.season && candidate.season === source.season) score += 2;
    if (feedback[candidate.id] === 'relevant') score += 3;
    if (feedback[candidate.id] === 'not_for_me') score -= 5;
    results.push({ recipeId: candidate.id, score, reason });
  }

  return results.sort((a, b) => b.score - a.score || a.recipeId.localeCompare(b.recipeId));
}
