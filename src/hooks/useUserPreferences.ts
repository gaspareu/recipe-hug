import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface TastePreferences {
  liked_flavors: string[];
  disliked_flavors: string[];
  liked_ingredients: string[];
  disliked_ingredients: string[];
}

export interface KitchenEquipment {
  available: string[];
  unavailable: string[];
}

export interface CulinaryStyle {
  favorite_cuisines: string[];
  favorite_techniques: string[];
  preferred_difficulty: 'facile' | 'moyen' | 'difficile' | null;
}

export interface DietaryConstraints {
  allergies: string[];
  diets: string[];
  restrictions: string[];
}

export interface UserCulinaryPreferences {
  id: string;
  user_id: string;
  taste_preferences: TastePreferences;
  kitchen_equipment: KitchenEquipment;
  culinary_style: CulinaryStyle;
  dietary_constraints: DietaryConstraints;
  created_at: string;
  updated_at: string;
}

// Default empty preferences
const DEFAULT_PREFERENCES: Omit<UserCulinaryPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  taste_preferences: {
    liked_flavors: [],
    disliked_flavors: [],
    liked_ingredients: [],
    disliked_ingredients: [],
  },
  kitchen_equipment: {
    available: [],
    unavailable: [],
  },
  culinary_style: {
    favorite_cuisines: [],
    favorite_techniques: [],
    preferred_difficulty: null,
  },
  dietary_constraints: {
    allergies: [],
    diets: [],
    restrictions: [],
  },
};

export function useUserPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['user-preferences', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('user_culinary_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      // Parse JSONB fields if they exist
      if (data) {
        return {
          ...data,
          taste_preferences: data.taste_preferences as unknown as TastePreferences,
          kitchen_equipment: data.kitchen_equipment as unknown as KitchenEquipment,
          culinary_style: data.culinary_style as unknown as CulinaryStyle,
          dietary_constraints: data.dietary_constraints as unknown as DietaryConstraints,
        } as UserCulinaryPreferences;
      }
      
      return null;
    },
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async (preferences: Partial<Omit<UserCulinaryPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
      if (!user) throw new Error('Not authenticated');

      const { data: existing } = await supabase
        .from('user_culinary_preferences')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('user_culinary_preferences')
          .update(preferences as any)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_culinary_preferences')
          .insert({ user_id: user.id, ...DEFAULT_PREFERENCES, ...preferences } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
    },
  });

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updatePreferences: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
}

// Helper to format preferences for AI context
export function formatPreferencesForContext(prefs: UserCulinaryPreferences | null): string {
  if (!prefs) return '';

  const sections: string[] = [];

  // Taste preferences
  const taste = prefs.taste_preferences;
  const tasteLines: string[] = [];
  if (taste.liked_flavors.length > 0) {
    tasteLines.push(`Saveurs aimées : ${taste.liked_flavors.join(', ')}`);
  }
  if (taste.disliked_flavors.length > 0) {
    tasteLines.push(`Saveurs évitées : ${taste.disliked_flavors.join(', ')}`);
  }
  if (taste.liked_ingredients.length > 0) {
    tasteLines.push(`Ingrédients favoris : ${taste.liked_ingredients.join(', ')}`);
  }
  if (taste.disliked_ingredients.length > 0) {
    tasteLines.push(`Ingrédients évités : ${taste.disliked_ingredients.join(', ')}`);
  }
  if (tasteLines.length > 0) {
    sections.push(`Goûts :\n${tasteLines.join('\n')}`);
  }

  // Kitchen equipment
  const equipment = prefs.kitchen_equipment;
  const equipLines: string[] = [];
  if (equipment.unavailable.length > 0) {
    equipLines.push(`Non disponible : ${equipment.unavailable.join(', ')}`);
  }
  if (equipment.available.length > 0) {
    equipLines.push(`Disponible : ${equipment.available.join(', ')}`);
  }
  if (equipLines.length > 0) {
    sections.push(`Équipement :\n${equipLines.join('\n')}`);
  }

  // Culinary style
  const style = prefs.culinary_style;
  const styleLines: string[] = [];
  if (style.favorite_cuisines.length > 0) {
    styleLines.push(`Cuisines favorites : ${style.favorite_cuisines.join(', ')}`);
  }
  if (style.favorite_techniques.length > 0) {
    styleLines.push(`Techniques appréciées : ${style.favorite_techniques.join(', ')}`);
  }
  if (style.preferred_difficulty) {
    styleLines.push(`Niveau préféré : ${style.preferred_difficulty}`);
  }
  if (styleLines.length > 0) {
    sections.push(`Style culinaire :\n${styleLines.join('\n')}`);
  }

  // Dietary constraints
  const diet = prefs.dietary_constraints;
  const dietLines: string[] = [];
  if (diet.allergies.length > 0) {
    dietLines.push(`⚠️ Allergies : ${diet.allergies.join(', ')}`);
  }
  if (diet.diets.length > 0) {
    dietLines.push(`Régime : ${diet.diets.join(', ')}`);
  }
  if (diet.restrictions.length > 0) {
    dietLines.push(`Restrictions : ${diet.restrictions.join(', ')}`);
  }
  if (dietLines.length > 0) {
    sections.push(`Contraintes alimentaires :\n${dietLines.join('\n')}`);
  }

  if (sections.length === 0) return '';

  return `--- PROFIL CULINAIRE ---\n${sections.join('\n\n')}\n--- FIN PROFIL ---`;
}

// Helper to format favorite recipes summaries
export function formatFavoritesForContext(recipes: Array<{ title: string; season: string | null; nutrition_tags: string[] | null }>): string {
  if (!recipes || recipes.length === 0) return '';

  const summaries = recipes.slice(0, 5).map((r, i) => {
    const tags = [r.season, ...(r.nutrition_tags || [])].filter(Boolean).join(', ');
    return `${i + 1}. ${r.title}${tags ? ` (${tags})` : ''}`;
  });

  return `--- RECETTES FAVORITES ---\n${summaries.join('\n')}\n--- FIN FAVORITES ---`;
}
