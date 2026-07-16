import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveAIConfig } from "../_shared/ai-config.ts";
import { buildSimpleRequest, extractContentFromResponse } from "../_shared/ai-providers.ts";
import { generateAndStoreRecipeImage } from "../_shared/generate-image.ts";
import { parseWebhookRecipe } from "../_shared/webhook-recipe-parse.ts";

// Validation schemas
const WebhookPayloadSchema = z.object({
  text: z.string().min(1, "Text is required").max(10000, "Text too long"),
});

// Background image generation function (source unique : _shared/generate-image.ts)
async function triggerImageGeneration(
  supabaseAdmin: SupabaseClient,
  recipeId: string,
  title: string,
  ingredients: Array<{ name: string; quantity?: number | null; unit?: string | null }>,
  userId: string
) {
  try {
    const aiConfig = await resolveAIConfig(supabaseAdmin, userId, {
      agentType: "generate_image",
      defaultProvider: "gemini",
      defaultModel: "gemini-2.5-flash-image",
      requiredCapabilities: ["image_generation"],
    });

    if (!aiConfig.apiKey) {
      console.warn("No API key configured, skipping image generation");
      return;
    }

    console.log(`Background image generation using ${aiConfig.provider}/${aiConfig.model}`);
    const publicUrl = await generateAndStoreRecipeImage(supabaseAdmin, aiConfig, { userId, recipeId, title, ingredients });
    console.log("Image generated and saved for recipe:", recipeId, publicUrl);
  } catch (err) {
    console.warn("Background image generation failed:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const validationResult = WebhookPayloadSchema.safeParse(body);

    if (!validationResult.success) {
      console.error("Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ error: "Invalid payload", details: validationResult.error.errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { text } = validationResult.data;
    console.log("Received webhook request with text length:", text.length);

    // Extract token from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header. Use: Authorization: Bearer <your-token>" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const webhook_token = authHeader.replace("Bearer ", "").trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(webhook_token)) {
      return new Response(
        JSON.stringify({ error: "Invalid token format" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("webhook_token", webhook_token)
      .maybeSingle();

    if (profileError) {
      console.error("Error looking up token:", profileError);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "Invalid webhook token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = profile.id;
    console.log("Token validated for user:", userId);

    // Resolve AI config for extraction
    const aiConfig = await resolveAIConfig(supabaseAdmin, userId, {
      agentType: "webhook",
      // Extraction simple : Haiku suffit et coûte ~3x moins cher que Sonnet.
      defaultModel: "claude-haiku-4-5",
    });
    console.log(`Extracting recipe using ${aiConfig.provider}/${aiConfig.model}`);

    const systemPrompt = `Tu es un assistant spécialisé dans l'extraction de recettes culinaires.
À partir du texte fourni, extrais les informations de la recette au format JSON structuré.

INSTRUCTIONS CRITIQUES:
- "title": OBLIGATOIRE. Si aucun titre n'est explicitement mentionné, génère un titre descriptif basé sur les ingrédients principaux (ex: "Cheesecake à la vanille", "Poulet rôti aux herbes")
- "servings": nombre de portions si mentionné, sinon null
- "ingredients": tableau d'objets avec "name" (string), "quantity" (number ou null), "unit" (string ou null)
- "steps": tableau d'OBJETS avec "order" (number commençant à 1) et "text" (string avec l'instruction). NE JAMAIS retourner les étapes comme des chaînes simples.
- "season": saison si mentionnée (printemps, été, automne, hiver), sinon null
- "nutrition_tags": tableau de tags si pertinents (végétarien, vegan, sans gluten, etc.)

EXEMPLE DE FORMAT ATTENDU:
{
  "title": "Cheesecake japonais",
  "servings": 8,
  "ingredients": [{"name": "mascarpone", "quantity": 400, "unit": "g"}],
  "steps": [{"order": 1, "text": "Préchauffer le four à 225°C"}, {"order": 2, "text": "Mélanger les ingrédients"}],
  "season": null,
  "nutrition_tags": []
}

RÉPONDS UNIQUEMENT AVEC LE JSON, sans markdown ni explication.`;

    const { headers, body: requestBody } = buildSimpleRequest(aiConfig, systemPrompt, text, {
      response_format: aiConfig.provider !== "anthropic" ? { type: "json_object" } : undefined,
      temperature: 0.3,
    });

    const aiResponse = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI extraction failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await aiResponse.json();
    const aiContent = extractContentFromResponse(aiConfig, aiResult);

    if (!aiContent) {
      return new Response(
        JSON.stringify({ error: "AI returned no content" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("AI response received");

    const parsed = parseWebhookRecipe(aiContent);
    if (!parsed.ok) {
      console.error("Failed to parse AI response as JSON");
      return new Response(
        JSON.stringify({ error: parsed.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const extractedRecipe = parsed.recipe;

    const { data: newRecipe, error: insertError } = await supabaseAdmin
      .from("recipes")
      .insert({
        user_id: userId,
        title: extractedRecipe.title,
        servings: extractedRecipe.servings,
        ingredients: extractedRecipe.ingredients,
        steps: extractedRecipe.steps,
        season: extractedRecipe.season,
        nutrition_tags: extractedRecipe.nutrition_tags,
        source_type: "webhook",
        status: "draft",
      })
      .select("id, title, ingredients")
      .single();

    if (insertError) {
      console.error("Error inserting recipe:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create recipe" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Recipe created successfully:", newRecipe.id);

    // Trigger background image generation
    triggerImageGeneration(
      supabaseAdmin,
      newRecipe.id,
      newRecipe.title,
      newRecipe.ingredients,
      userId
    ).catch((err) => console.warn("Background image generation failed:", err));

    return new Response(
      JSON.stringify({
        success: true,
        recipe: { id: newRecipe.id, title: newRecipe.title },
        message: `Recette "${newRecipe.title}" créée avec succès`,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
