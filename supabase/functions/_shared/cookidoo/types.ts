/**
 * Types du connecteur Cookidoo.
 *
 * `Recipe`/`Ingredient`/`Step` reflètent le modèle métier de l'app
 * (src/types/recipe.ts) — gardés ici en autonomie pour que le connecteur
 * tourne seul (Deno ou Node) sans dépendre du build de l'app.
 *
 * Les types `Cookidoo*` décrivent le payload des endpoints internes
 * /created-recipes (reverse-engineerés, non-officiels).
 */

// ── Modèle recipe-hug (miroir de src/types/recipe.ts) ────────────────────────
export interface Ingredient {
  name: string;
  category?: string;
  quantity: number | null;
  unit: string;
}

export interface Step {
  order: number;
  text: string;
  duration_minutes?: number;
  parallel_with?: number[];
}

export interface Recipe {
  title: string;
  servings?: number | null;
  ingredients: Ingredient[];
  steps: Step[];
}

// ── Payload Cookidoo (/created-recipes) ──────────────────────────────────────
export type ThermomixTool = "TM7" | "TM6" | "TM5" | "TM31";

export interface CookidooIngredient {
  type: "INGREDIENT";
  text: string;
}

/** Annotation d'étape : c'est ce qui rend une étape « guided cooking » sur le TM7. */
export interface Annotation {
  type: "TTS" | "INGREDIENT";
  data: Record<string, unknown>;
  /** Empan de caractères annoté dans le texte de l'étape. */
  position: { offset: number; length: number };
}

export interface CookidooStep {
  type: "STEP";
  text: string;
  annotations: Annotation[];
}

export interface CookidooRecipePayload {
  name: string;
  image: null;
  isImageOwnedByUser: boolean;
  tools: ThermomixTool[];
  yield: { value: number; unitText: string };
  prepTime: number; // secondes
  cookTime: number; // secondes
  totalTime: number; // secondes
  ingredients: CookidooIngredient[];
  instructions: CookidooStep[];
  hints: string;
  workStatus: "PRIVATE";
  recipeMetadata: { requiresAnnotationsCheck: boolean };
}
