import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_SYSTEM_PROMPT = `Tu es un assistant culinaire qui guide l'utilisateur dans la réalisation d'une recette spécifique.

Tu as en contexte la recette complète (titre, ingrédients, étapes, portions, saison).

Comportement :
- Guide l'utilisateur étape par étape dans la réalisation
- Adapte les quantités si l'utilisateur change le nombre de portions
- Suggère des substitutions d'ingrédients selon la saison française, les disponibilités ou les allergies
- Explique les techniques de cuisine mentionnées dans les étapes
- Réponds aux questions sur les temps de cuisson, textures attendues, etc.
- Si l'utilisateur envoie une photo, analyse-la pour valider l'avancement ou la présentation
- Donne des conseils pratiques et astuces de chef

Ton : chaleureux, encourageant, expert culinaire français. Tu accompagnes comme un chef bienveillant.

IMPORTANT : Tu ne crées pas de nouvelle recette, tu aides à réaliser celle en contexte.`;

const PERSONALIZATION_INSTRUCTION = `

IMPORTANT - PROFIL UTILISATEUR :
Tu as accès au profil culinaire de l'utilisateur. Utilise ces informations pour :
- Proposer des substitutions adaptées à ses allergies/contraintes
- Suggérer des alternatives si un équipement lui manque
- Adapter tes conseils à son niveau de difficulté préféré

Ne mentionne pas explicitement que tu connais ces préférences, intègre-les naturellement.`;

// Format user preferences for context
function formatPreferencesContext(prefs: any): string {
  if (!prefs) return '';

  const sections: string[] = [];

  // Focus on constraints and equipment for cooking assistant
  const equipment = prefs.kitchen_equipment || {};
  if (equipment.unavailable?.length > 0) {
    sections.push(`Équipement non disponible : ${equipment.unavailable.join(', ')}`);
  }

  const diet = prefs.dietary_constraints || {};
  if (diet.allergies?.length > 0) {
    sections.push(`⚠️ ALLERGIES : ${diet.allergies.join(', ')}`);
  }
  if (diet.diets?.length > 0) {
    sections.push(`Régime : ${diet.diets.join(', ')}`);
  }
  if (diet.restrictions?.length > 0) {
    sections.push(`Restrictions : ${diet.restrictions.join(', ')}`);
  }

  const style = prefs.culinary_style || {};
  if (style.preferred_difficulty) {
    sections.push(`Niveau culinaire : ${style.preferred_difficulty}`);
  }

  if (sections.length === 0) return '';

  return `\n\n--- PROFIL UTILISATEUR ---\n${sections.join('\n')}\n--- FIN PROFIL ---`;
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
    const { messages, recipeContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Cooking assistant request received with", messages.length, "messages");
    console.log("Recipe context:", recipeContext?.title);

    // Build context message with recipe details
    let contextMessage = BASE_SYSTEM_PROMPT;

    // Try to get user preferences if authenticated
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const authHeader = req.headers.get('authorization');
      const userId = extractUserIdFromToken(authHeader);

      if (userId) {
        console.log("Loading preferences for user:", userId);
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { data: prefs } = await supabase
          .from('user_culinary_preferences')
          .select('*')
          .eq('user_id', userId)
          .single();

        const prefsContext = formatPreferencesContext(prefs);

        if (prefsContext) {
          contextMessage += PERSONALIZATION_INSTRUCTION + prefsContext;
          console.log("Added personalization context");
        }
      }
    }
    
    if (recipeContext) {
      contextMessage += `\n\n--- RECETTE EN COURS ---\n`;
      contextMessage += `Titre : ${recipeContext.title}\n`;
      
      if (recipeContext.servings) {
        contextMessage += `Portions : ${recipeContext.servings}\n`;
      }
      
      if (recipeContext.season) {
        contextMessage += `Saison : ${recipeContext.season}\n`;
      }
      
      if (recipeContext.ingredients && recipeContext.ingredients.length > 0) {
        contextMessage += `\nIngrédients :\n`;
        for (const ing of recipeContext.ingredients) {
          contextMessage += `- ${ing.quantity} ${ing.unit} ${ing.name}${ing.category ? ` (${ing.category})` : ''}\n`;
        }
      }
      
      if (recipeContext.steps && recipeContext.steps.length > 0) {
        contextMessage += `\nÉtapes :\n`;
        const sortedSteps = [...recipeContext.steps].sort((a: any, b: any) => a.order - b.order);
        for (const step of sortedSteps) {
          const status = step.completed ? '✓' : '○';
          contextMessage += `${status} ${step.order}. ${step.text}\n`;
        }
        
        // Add progress summary
        if (recipeContext.completedStepsCount !== undefined) {
          contextMessage += `\nProgression : ${recipeContext.completedStepsCount}/${recipeContext.totalSteps} étapes terminées`;
        }
      }
      
      contextMessage += `\n--- FIN DE LA RECETTE ---`;
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
          { role: "system", content: contextMessage },
          ...messages,
        ],
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

    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      },
    });

  } catch (error) {
    console.error("Cooking assistant error:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return new Response(
      JSON.stringify({ error: "server_error", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
