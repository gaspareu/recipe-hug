import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, ingredients, steps } = await req.json();

    if (!title || !ingredients) {
      return new Response(JSON.stringify({ error: "Title and ingredients are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Analyzing recipe: ${title}`);

    const ingredientsList = ingredients
      .map((i: any) => `${i.quantity || ""} ${i.unit || ""} ${i.name}`.trim())
      .join(", ");

    const stepsList = steps?.map((s: any) => s.text).join(" ") || "";

    const prompt = `Analyse cette recette et génère un résumé descriptif, des tags nutritionnels et la saison idéale.

Recette: ${title}
Ingrédients: ${ingredientsList}
Préparation: ${stepsList}

Réponds en JSON avec ce format exact:
{
  "ai_summary": "Description courte et générique de la recette en 1-2 phrases",
  "nutrition_tags": ["tag1", "tag2"],
  "calorie_score": 3,
  "season": "Saison de la recette en fonction des ingrédients"
}

Pour ai_summary: Une description courte et générique du plat (type de cuisine, caractéristiques principales). Évite les détails trop spécifiques.

Pour nutrition_tags: Choisis 1 à 3 tags maximum parmi: "protéines", "fibres", "léger", "végétarien", "végan", "sans gluten", "sans lactose", "vitamines", "fer", "oméga-3", "énergétique", "réconfortant"

Pour calorie_score: Note de 1 à 5 (1=très calorique >600kcal, 5=très léger <150kcal)

Pour season: Détermine la saison idéale en fonction de la saisonnalité des ingrédients en France. Choisis parmi: "printemps", "été", "automne", "hiver", "toutes saisons". Base-toi sur les calendriers de production française des fruits, légumes et autres ingrédients.

Réponds uniquement avec le JSON, sans markdown ni texte supplémentaire.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;

    console.log("AI response:", aiResponse);

    // Parse JSON from response
    let analysis;
    try {
      // Remove markdown code blocks if present
      const cleanJson = aiResponse
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      analysis = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      throw new Error("Failed to parse AI analysis");
    }

    console.log("Parsed analysis:", analysis);

    return new Response(JSON.stringify(analysis), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error in analyze-recipe function:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
