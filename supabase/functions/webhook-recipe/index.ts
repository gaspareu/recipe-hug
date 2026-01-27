import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Validation schema for incoming webhook payload
const WebhookPayloadSchema = z.object({
  text: z.string().min(1, "Text is required").max(10000, "Text too long (max 10000 chars)"),
  webhook_token: z.string().uuid("Invalid webhook token format"),
});

// Schema for extracted recipe from AI
const ExtractedRecipeSchema = z.object({
  title: z.string(),
  servings: z.number().nullable().optional(),
  ingredients: z.array(z.object({
    name: z.string(),
    quantity: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
  })),
  steps: z.array(z.object({
    order: z.number(),
    instruction: z.string(),
  })),
  season: z.string().nullable().optional(),
  nutrition_tags: z.array(z.string()).optional(),
});

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Parse and validate request body
    const body = await req.json();
    const validationResult = WebhookPayloadSchema.safeParse(body);

    if (!validationResult.success) {
      console.error("Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: "Invalid payload", 
          details: validationResult.error.errors 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { text, webhook_token } = validationResult.data;
    console.log("Received webhook request with text length:", text.length);

    // Create Supabase client with service role for token lookup
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate webhook token and get user
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
      console.warn("Invalid webhook token attempted");
      return new Response(
        JSON.stringify({ error: "Invalid webhook token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = profile.id;
    console.log("Token validated for user:", userId);

    // Call Lovable AI to extract structured recipe from text
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Tu es un assistant spécialisé dans l'extraction de recettes culinaires.
À partir du texte fourni, extrais les informations de la recette au format JSON structuré.

INSTRUCTIONS:
- Extrais le titre, le nombre de portions (si mentionné), les ingrédients et les étapes
- Pour chaque ingrédient, extrais le nom, la quantité (nombre) et l'unité
- Pour les étapes, numérote-les dans l'ordre
- Si une information n'est pas disponible, utilise null
- Détecte la saison si mentionnée (printemps, été, automne, hiver)
- Détecte les tags nutritionnels si pertinents (végétarien, vegan, sans gluten, etc.)

RÉPONDS UNIQUEMENT AVEC LE JSON, sans markdown ni explication.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
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
    const aiContent = aiResult.choices?.[0]?.message?.content;

    if (!aiContent) {
      console.error("No content in AI response");
      return new Response(
        JSON.stringify({ error: "AI returned no content" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("AI response:", aiContent);

    // Parse AI response
    let extractedRecipe;
    try {
      extractedRecipe = JSON.parse(aiContent);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate extracted recipe structure
    const recipeValidation = ExtractedRecipeSchema.safeParse(extractedRecipe);
    if (!recipeValidation.success) {
      console.error("Recipe validation error:", recipeValidation.error.errors);
      // Try to use partial data anyway
      extractedRecipe = {
        title: extractedRecipe.title || "Recette sans titre",
        servings: extractedRecipe.servings || null,
        ingredients: Array.isArray(extractedRecipe.ingredients) ? extractedRecipe.ingredients : [],
        steps: Array.isArray(extractedRecipe.steps) ? extractedRecipe.steps : [],
        season: extractedRecipe.season || null,
        nutrition_tags: Array.isArray(extractedRecipe.nutrition_tags) ? extractedRecipe.nutrition_tags : null,
      };
    } else {
      extractedRecipe = recipeValidation.data;
    }

    // Insert recipe into database
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
      .select("id, title")
      .single();

    if (insertError) {
      console.error("Error inserting recipe:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create recipe" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Recipe created successfully:", newRecipe.id);

    return new Response(
      JSON.stringify({
        success: true,
        recipe: {
          id: newRecipe.id,
          title: newRecipe.title,
        },
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
