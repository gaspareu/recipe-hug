import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Tu es un chef cuisinier passionné et créatif. Tu aides l'utilisateur à construire sa recette idéale en conversant avec lui.

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Chat request received with", messages.length, "messages");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
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
