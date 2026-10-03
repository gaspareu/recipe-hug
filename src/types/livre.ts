import type { Ingredient, Recipe, Step } from './recipe';

export type CompositionKind = 'dish' | 'menu';

export interface CompositionItem {
  id: string;
  user_id: string;
  composition_id: string;
  position: number;
  course: string | null;
  notes: string | null;
  recipe_id: string | null;
  child_composition_id: string | null;
  quantity_factor: number;
}

export interface Composition {
  id: string;
  user_id: string;
  kind: CompositionKind;
  title: string;
  servings: number;
  assembly_steps: string[];
  created_at: string;
  updated_at: string;
  items: CompositionItem[];
}

export interface CompositionDraftItem {
  recipe_id: string | null;
  child_composition_id: string | null;
  course?: string | null;
  notes?: string | null;
  quantity_factor: number;
}

export interface CompositionDraft {
  id?: string;
  kind: CompositionKind;
  title: string;
  servings: number;
  assembly_steps: string[];
  items: CompositionDraftItem[];
}

export interface PairingProfile {
  recipe_id: string;
  user_id: string;
  roles: string[];
  flavors: string[];
  textures: string[];
  equipment: string[];
  allergens: string[];
  allergen_review_state: 'unknown' | 'reviewed';
  dietary_compatibilities: string[];
  dietary_exclusions: string[];
  dietary_review_state: 'unknown' | 'reviewed';
  active_minutes: number | null;
  make_ahead: boolean;
  updated_at: string;
}

export interface CookingTarget {
  type: 'recipe' | CompositionKind;
  id: string;
  servings: number;
}

export interface CookingSegment {
  key: string;
  course: string | null;
  recipe: Recipe;
  factor: number;
  ingredients: Ingredient[];
}

export interface CookingRunStep {
  key: string;
  segmentKey: string;
  sourceTitle: string;
  course: string | null;
  step: Step;
  ingredients: Ingredient[];
  assembly: boolean;
}

export interface CookingRun {
  target: CookingTarget;
  title: string;
  segments: CookingSegment[];
  steps: CookingRunStep[];
  ingredients: Ingredient[];
}

/** Résumé borné de la session composée transmis à Chef pendant la cuisine. */
export interface CompositionChatContext {
  kind: CompositionKind;
  title: string;
  servings: number;
  currentStep: number;
  totalSteps: number;
  currentCourse: string | null;
  currentPreparation: string;
  currentInstruction: string;
  assembly: boolean;
  sections: Array<{ title: string; course: string | null }>;
}
