import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { TablesUpdate, TablesInsert } from '@/integrations/supabase/types';

export interface TastePreferences {
  liked_flavors: string[];
  disliked_flavors: string[];
  liked_ingredients: string[];
  disliked_ingredients: string[];
  special_ingredients: string[];
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
    special_ingredients: [],
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
          .update(preferences as unknown as TablesUpdate<'user_culinary_preferences'>)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_culinary_preferences')
          .insert({ user_id: user.id, ...DEFAULT_PREFERENCES, ...preferences } as unknown as TablesInsert<'user_culinary_preferences'>);
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
