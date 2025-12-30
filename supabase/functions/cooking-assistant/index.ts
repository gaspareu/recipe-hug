import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Tu es un assistant culinaire qui guide l'utilisateur dans la réalisation d'une recette spécifique.

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, recipeContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Cooking assistant request received with", messages.length, "messages");
    console.log("Recipe context:", recipeContext?.title);

    // Build context message with recipe details
    let contextMessage = SYSTEM_PROMPT;
    
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
        const sortedSteps = [...recipeContext.steps].sort((a, b) => a.order - b.order);
        for (const step of sortedSteps) {
          contextMessage += `${step.order}. ${step.text}\n`;
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
