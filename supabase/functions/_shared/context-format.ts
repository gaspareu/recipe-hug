// Construction des blocs de contexte injectés dans le system prompt du Chef IA.
// Fonctions pures (sans I/O) → testables isolément (voir context-format_test.ts).

// Helper : true si le tableau existe et contient au moins un élément (type-safe).
function has(arr?: string[]): boolean {
  return (arr?.length ?? 0) > 0;
}

export interface UserPreferences {
  taste_preferences?: {
    liked_flavors?: string[];
    disliked_flavors?: string[];
    liked_ingredients?: string[];
    disliked_ingredients?: string[];
    special_ingredients?: string[];
  };
  dietary_constraints?: {
    allergies?: string[];
    diets?: string[];
    restrictions?: string[];
  };
  kitchen_equipment?: {
    available?: string[];
    unavailable?: string[];
  };
  culinary_style?: {
    favorite_cuisines?: string[];
    favorite_techniques?: string[];
    preferred_difficulty?: string;
  };
}

// Format user preferences for context
export function formatPreferencesContext(prefs: UserPreferences | null | undefined): string {
  if (!prefs) return "";
  const sections: string[] = [];

  const taste = prefs.taste_preferences || {};
  if (has(taste.liked_flavors)) sections.push(`Saveurs aimées : ${taste.liked_flavors!.join(", ")}`);
  if (has(taste.disliked_flavors)) sections.push(`Saveurs évitées : ${taste.disliked_flavors!.join(", ")}`);
  if (has(taste.liked_ingredients)) sections.push(`Ingrédients favoris : ${taste.liked_ingredients!.join(", ")}`);
  if (has(taste.disliked_ingredients)) sections.push(`Ingrédients évités : ${taste.disliked_ingredients!.join(", ")}`);
  if (has(taste.special_ingredients)) sections.push(`Aliments particuliers : ${taste.special_ingredients!.join(", ")}`);

  const diet = prefs.dietary_constraints || {};
  if (has(diet.allergies)) sections.push(`ALLERGIES : ${diet.allergies!.join(", ")}`);
  if (has(diet.diets)) sections.push(`Régime : ${diet.diets!.join(", ")}`);
  if (has(diet.restrictions)) sections.push(`Restrictions : ${diet.restrictions!.join(", ")}`);

  const equipment = prefs.kitchen_equipment || {};
  if (has(equipment.available)) sections.push(`Équipement disponible : ${equipment.available!.join(", ")}`);
  if (has(equipment.unavailable)) sections.push(`Équipement non disponible : ${equipment.unavailable!.join(", ")}`);

  const style = prefs.culinary_style || {};
  if (has(style.favorite_cuisines)) sections.push(`Cuisines favorites : ${style.favorite_cuisines!.join(", ")}`);
  if (has(style.favorite_techniques)) sections.push(`Techniques : ${style.favorite_techniques!.join(", ")}`);
  if (style.preferred_difficulty) sections.push(`Difficulté préférée : ${style.preferred_difficulty}`);

  if (sections.length === 0) return "";
  return `\n\n--- PROFIL UTILISATEUR (USAGE SILENCIEUX) ---
IMPORTANT : Ces informations servent de contexte interne. Tu DOIS les respecter (allergies, restrictions, ingrédients évités) mais tu ne dois PAS les mentionner dans tes réponses sauf si l'utilisateur te pose explicitement la question sur ses préférences ou son profil.
${sections.join("\n")}
--- FIN PROFIL ---`;
}

export interface FavoriteRecipe {
  id: string;
  title: string;
  ai_summary?: string | null;
}

export const FAVORITES_SAMPLE_SIZE = 5;

// Format an inspirational sample of favorite recipes for context.
// Random rotation : on mélange puis on garde quelques favoris, pour varier
// l'inspiration d'une session à l'autre sans gonfler le prompt.
export function formatFavoritesContext(favorites: FavoriteRecipe[] | null | undefined): string {
  if (!favorites || favorites.length === 0) return "";

  // Mélange Fisher-Yates sur une copie (immutabilité)
  const shuffled = [...favorites];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const lines = shuffled.slice(0, FAVORITES_SAMPLE_SIZE).map((r, i) => {
    const summary = r.ai_summary?.trim();
    return summary ? `${i + 1}. ${r.title} — ${summary}` : `${i + 1}. ${r.title}`;
  });

  return `\n\n--- RECETTES FAVORITES (échantillon, pour inspiration) ---
Ces recettes que l'utilisateur a mises en favori reflètent ses goûts. Inspire-t'en pour proposer des idées dans le même esprit, sans les recopier ni les citer sauf si c'est pertinent.
${lines.join("\n")}
--- FIN FAVORITES ---`;
}

export interface ActiveRecipeContext {
  id: string;
  title: string;
  // Champs optionnels tolérant `null` : ils proviennent de schémas Zod nullable
  // (activeRecipe côté home-assistant). Les usages ci-dessous gèrent déjà null.
  servings?: number | null;
  season?: string | null;
  ingredients?: Array<{
    quantity?: string | number | null;
    unit?: string | null;
    name: string;
    category?: string | null;
    preparation?: string | null;
  }>;
  steps?: Array<{ order: number; text: string; completed?: boolean }>;
  completedSteps?: number[];
}

// Format active recipe context
export function formatRecipeContext(recipe: ActiveRecipeContext | null | undefined): string {
  if (!recipe) return "";

  let context = `\n\n--- RECETTE EN CONTEXTE ---\n`;
  context += `ID: ${recipe.id}\n`;
  context += `Titre : ${recipe.title}\n`;
  if (recipe.servings) context += `Portions : ${recipe.servings}\n`;
  if (recipe.season) context += `Saison : ${recipe.season}\n`;

  const ingredients = recipe.ingredients ?? [];
  if (ingredients.length > 0) {
    context += `\nIngrédients :\n`;
    for (const ing of ingredients) {
      const qty = ing.quantity ?? "";
      const unit = ing.unit ?? "";
      context += `- ${qty} ${unit} ${ing.name}${ing.category ? ` (${ing.category})` : ""}\n`;
    }
  }

  const steps = recipe.steps ?? [];
  if (steps.length > 0) {
    context += `\nÉtapes :\n`;
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
    const completedSet = new Set(recipe.completedSteps || []);
    for (const step of sortedSteps) {
      const isDone = step.completed || completedSet.has(step.order);
      const status = isDone ? "✓" : "○";
      context += `${status} ${step.order}. ${step.text}\n`;
    }
    if (completedSet.size > 0) {
      context += `\nProgression : ${completedSet.size}/${sortedSteps.length} étapes complétées\n`;
    }
  }

  context += `--- FIN DE LA RECETTE ---`;
  return context;
}
