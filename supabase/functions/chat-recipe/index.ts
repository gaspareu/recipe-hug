import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_SYSTEM_PROMPT = `Tu es un chef cuisinier passionné et créatif. Tu aides l'utilisateur à construire sa recette idéale en conversant avec lui.

Comportement :
- Pose des questions pour comprendre les goûts, contraintes (allergies, régime), temps disponible, niveau de cuisine
- Fais des suggestions créatives et des variantes
- Sois concis mais chaleureux dans tes réponses
- Quand l'utilisateur valide la recette (dit "ok", "parfait", "on fait ça", "enregistre", "c'est bon", "génial"), utilise OBLIGATOIREMENT le tool save_recipe pour structurer et sauvegarder la recette
- Quand tu proposes une recette complète et que l'utilisateur semble satisfait, utilise le tool save_recipe

Format des ingrédients :
- Utilise des catégories comme : "Légumes", "Viandes", "Épices", "Produits laitiers", "Féculents", "Fruits", "Condiments", "Autres"
- Sépare bien quantité et unité (ex: "200" et "g", pas "200g")

Ton : amical, enthousiaste, expert culinaire français`;

const PERSONALIZATION_INSTRUCTION = `

IMPORTANT - PERSONNALISATION :
Tu as accès au profil culinaire de l'utilisateur ci-dessous. Utilise ces informations pour :
- Éviter de proposer des ingrédients qu'il n'aime pas ou auxquels il est allergique
- Privilégier les cuisines et techniques qu'il apprécie
- Adapter les recettes à son équipement disponible
- Respecter ses contraintes alimentaires

Ne mentionne pas explicitement que tu connais ces préférences, intègre-les naturellement dans tes suggestions.`;

const SAVE_RECIPE_TOOL = {
  type: "function",
  function: {
    name: "save_recipe",
    description: "Enregistre la recette finale quand l'utilisateur est satisfait et valide la proposition",
    parameters: {
      type: "object",
      properties: {
        title: { 
          type: "string",
          description: "Nom de la recette"
        },
        servings: { 
          type: "number",
          description: "Nombre de portions"
        },
        ingredients: {
          type: "array",
          description: "Liste des ingrédients",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nom de l'ingrédient" },
              quantity: { type: "string", description: "Quantité (nombre uniquement)" },
              unit: { type: "string", description: "Unité de mesure (g, ml, pièce, etc.)" },
              category: { type: "string", description: "Catégorie de l'ingrédient" }
            },
            required: ["name", "quantity", "unit", "category"]
          }
        },
        steps: {
          type: "array",
          description: "Étapes de préparation",
          items: {
            type: "object",
            properties: {
              order: { type: "number", description: "Numéro de l'étape" },
              text: { type: "string", description: "Description de l'étape" }
            },
            required: ["order", "text"]
          }
        }
      },
      required: ["title", "servings", "ingredients", "steps"]
    }
  }
};

// Format user preferences for context
function formatPreferencesContext(prefs: any): string {
  if (!prefs) return '';

  const sections: string[] = [];

  // Taste preferences
  const taste = prefs.taste_preferences || {};
  const tasteLines: string[] = [];
  if (taste.liked_flavors?.length > 0) {
    tasteLines.push(`Saveurs aimées : ${taste.liked_flavors.join(', ')}`);
  }
  if (taste.disliked_flavors?.length > 0) {
    tasteLines.push(`Saveurs évitées : ${taste.disliked_flavors.join(', ')}`);
  }
  if (taste.liked_ingredients?.length > 0) {
    tasteLines.push(`Ingrédients favoris : ${taste.liked_ingredients.join(', ')}`);
  }
  if (taste.disliked_ingredients?.length > 0) {
    tasteLines.push(`Ingrédients évités : ${taste.disliked_ingredients.join(', ')}`);
  }
  if (tasteLines.length > 0) {
    sections.push(`Goûts :\n${tasteLines.join('\n')}`);
  }

  // Kitchen equipment
  const equipment = prefs.kitchen_equipment || {};
  const equipLines: string[] = [];
  if (equipment.unavailable?.length > 0) {
    equipLines.push(`Non disponible : ${equipment.unavailable.join(', ')}`);
  }
  if (equipment.available?.length > 0) {
    equipLines.push(`Disponible : ${equipment.available.join(', ')}`);
  }
  if (equipLines.length > 0) {
    sections.push(`Équipement :\n${equipLines.join('\n')}`);
  }

  // Culinary style
  const style = prefs.culinary_style || {};
  const styleLines: string[] = [];
  if (style.favorite_cuisines?.length > 0) {
    styleLines.push(`Cuisines favorites : ${style.favorite_cuisines.join(', ')}`);
  }
  if (style.favorite_techniques?.length > 0) {
    styleLines.push(`Techniques appréciées : ${style.favorite_techniques.join(', ')}`);
  }
  if (style.preferred_difficulty) {
    styleLines.push(`Niveau préféré : ${style.preferred_difficulty}`);
  }
  if (styleLines.length > 0) {
    sections.push(`Style culinaire :\n${styleLines.join('\n')}`);
  }

  // Dietary constraints
  const diet = prefs.dietary_constraints || {};
  const dietLines: string[] = [];
  if (diet.allergies?.length > 0) {
    dietLines.push(`⚠️ ALLERGIES : ${diet.allergies.join(', ')}`);
  }
  if (diet.diets?.length > 0) {
    dietLines.push(`Régime : ${diet.diets.join(', ')}`);
  }
  if (diet.restrictions?.length > 0) {
    dietLines.push(`Restrictions : ${diet.restrictions.join(', ')}`);
  }
  if (dietLines.length > 0) {
    sections.push(`Contraintes alimentaires :\n${dietLines.join('\n')}`);
  }

  if (sections.length === 0) return '';

  return `\n\n--- PROFIL CULINAIRE ---\n${sections.join('\n\n')}\n--- FIN PROFIL ---`;
}

// Format favorite recipes summaries
function formatFavoritesContext(recipes: any[]): string {
  if (!recipes || recipes.length === 0) return '';

  const summaries = recipes.slice(0, 5).map((r, i) => {
    const tags = [r.season, ...(r.nutrition_tags || [])].filter(Boolean).join(', ');
    return `${i + 1}. ${r.title}${tags ? ` (${tags})` : ''}`;
  });

  return `\n\n--- RECETTES FAVORITES ---\n${summaries.join('\n')}\n--- FIN FAVORITES ---`;
}

// Extract user ID from JWT
function extractUserIdFromToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  
  try {
    const token = authHeader.split(' ')[1];
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Chat request received with", messages.length, "messages");

    // Build personalized system prompt
    let systemPrompt = BASE_SYSTEM_PROMPT;
    let userId: string | null = null;

    // Try to get user context if authenticated
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const authHeader = req.headers.get('authorization');
      userId = extractUserIdFromToken(authHeader);

      if (userId) {
        console.log("Loading context for user:", userId);
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch user preferences and favorites in parallel
        const [prefsResult, favoritesResult] = await Promise.all([
          supabase
            .from('user_culinary_preferences')
            .select('*')
            .eq('user_id', userId)
            .single(),
          supabase
            .from('recipes')
            .select('title, season, nutrition_tags')
            .eq('user_id', userId)
            .eq('is_favorite', true)
            .limit(5)
        ]);

        const prefsContext = formatPreferencesContext(prefsResult.data);
        const favoritesContext = formatFavoritesContext(favoritesResult.data || []);

        if (prefsContext || favoritesContext) {
          systemPrompt += PERSONALIZATION_INSTRUCTION + prefsContext + favoritesContext;
          console.log("Added personalization context");
        }
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        tools: [SAVE_RECIPE_TOOL],
        tool_choice: "auto",
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "rate_limit", message: "Trop de requêtes, veuillez patienter." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "payment_required", message: "Crédits IA épuisés." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "ai_error", message: "Erreur du service IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stream the response directly
    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      },
    });

  } catch (error) {
    console.error("Chat recipe error:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return new Response(
      JSON.stringify({ error: "server_error", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
