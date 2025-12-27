export interface Ingredient {
  name: string;
  category?: string;
  quantity: number;
  unit: string;
}

export interface Step {
  order: number;
  text: string;
}

export type RecipeStatus = 'draft' | 'tested' | 'validated' | 'archived';

export interface Recipe {
  id: string;
  user_id: string;
  title: string;
  status: RecipeStatus;
  is_favorite: boolean;
  servings: number | null;
  ingredients: Ingredient[];
  steps: Step[];
  season: string | null;
  nutrition_tags: string[] | null;
  calorie_score: number | null;
  ai_summary: string | null;
  source_type: 'manual' | 'image' | 'ai';
  source_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export type RecipeFormData = Omit<Recipe, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
