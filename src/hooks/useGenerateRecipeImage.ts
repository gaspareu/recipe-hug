import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface GenerateImageParams {
  recipeId: string;
  title: string;
  ingredients?: Array<{ name: string }>;
}

export function useGenerateRecipeImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ recipeId, title, ingredients }: GenerateImageParams) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-recipe-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ recipeId, title, ingredients }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to generate image: ${response.status}`);
      }

      const data = await response.json();
      return data.imageUrl as string;
    },
    onSuccess: (_imageUrl, variables) => {
      // Invalidate recipe queries to reflect the new image
      queryClient.invalidateQueries({ queryKey: ['recipe', variables.recipeId] });
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
  });
}
