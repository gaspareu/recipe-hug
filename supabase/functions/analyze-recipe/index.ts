import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.union([z.string(), z.number()]).optional(),
  unit: z.string().optional(),
});

const StepSchema = z.object({
  text: z.string(),
});

const RequestSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  ingredients: z.array(IngredientSchema).min(1, "At least one ingredient required").max(100, "Too many ingredients"),
  steps: z.array(StepSchema).max(50, "Too many steps").optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    // Verify JWT
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate input
    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);
    
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: parseResult.error.errors[0]?.message || 'Invalid input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { title, ingredients, steps } = parseResult.data;

    console.log(`Analyzing recipe: ${title} for user: ${claimsData.claims.sub}`);

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

    console.log("AI response received");

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

    console.log("Parsed analysis for recipe:", title);

    return new Response(JSON.stringify(analysis), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error in analyze-recipe function:", error);
    return new Response(JSON.stringify({ error: "Failed to analyze recipe" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
