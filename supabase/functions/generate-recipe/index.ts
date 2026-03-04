import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveAIConfig } from "../_shared/ai-config.ts";
import { callAINonStreaming } from "../_shared/ai-providers.ts";

const RequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(2000, "Prompt too long"),
});

const systemPrompt = `Tu es un assistant culinaire expert. Tu crées des recettes détaillées et accessibles.

## TON STYLE
- Recettes claires avec des explications pratiques
- Étapes détaillées avec les raisons techniques quand c'est utile (ex: "pour éviter que ça colle", "pour développer les arômes")
- Temps indicatifs dans les étapes quand pertinent
- Conseils de présentation en dernière étape

## FORMAT DE SORTIE
Réponds UNIQUEMENT avec un JSON valide, sans texte avant/après :
{
  "title": "Nom clair et descriptif",
  "servings": 4,
  "ingredients": [
    {"name": "nom", "quantity": "100", "unit": "g", "category": "catégorie"}
  ],
  "steps": [
    {"order": 1, "text": "Description détaillée avec timing et astuces"}
  ]
}

Catégories : légumes, fruits, viandes, poissons, produits laitiers, épices, autres

Génère une recette détaillée selon la demande de l'utilisateur.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.claims.sub as string;
    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: parseResult.error.errors[0]?.message || "Invalid input" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { prompt } = parseResult.data;
    console.log("Generating recipe for user:", userId, "prompt:", prompt);

    const aiConfig = await resolveAIConfig(supabaseClient, userId, {
      agentType: "generate",
      defaultModel: "google/gemini-3-flash-preview",
    });
    console.log(`AI: ${aiConfig.provider}/${aiConfig.model}`);

    const content = await callAINonStreaming(aiConfig, [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ]);

    if (!content) {
      throw new Error("No content in AI response");
    }

    console.log("AI response received");

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    const recipeData = JSON.parse(jsonMatch[0]);

    if (!recipeData.title || !Array.isArray(recipeData.ingredients) || !Array.isArray(recipeData.steps)) {
      throw new Error("Invalid recipe structure");
    }

    console.log("Generated recipe:", recipeData.title);

    return new Response(JSON.stringify(recipeData), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error generating recipe:", error);
    return new Response(JSON.stringify({ error: "Failed to generate recipe" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
