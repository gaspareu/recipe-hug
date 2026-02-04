import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Agent types for this function
const AGENT_TYPE_EXTRACT = "webhook";
const AGENT_TYPE_IMAGE = "generate_image";

// Provider API endpoints
const PROVIDER_ENDPOINTS: Record<string, string> = {
  lovable: "https://ai.gateway.lovable.dev/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  endpoint: string;
}

// Resolve AI configuration for an agent type
async function resolveAIConfig(
  supabaseAdmin: any,
  userId: string,
  agentType: string,
  defaultModel: string
): Promise<AIConfig> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  const defaultConfig: AIConfig = {
    provider: "lovable",
    model: defaultModel,
    apiKey: LOVABLE_API_KEY || "",
    endpoint: PROVIDER_ENDPOINTS.lovable,
  };

  console.log(`[AI Config] Resolving config for agent: ${agentType}, user: ${userId}, default model: ${defaultModel}`);

  try {
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("user_ai_settings")
      .select("provider, api_key, preferred_model, agent_configs")
      .eq("user_id", userId)
      .single();

    if (settingsError || !settings) {
      console.log(`[AI Config] No user settings found, using default: ${defaultConfig.provider}/${defaultConfig.model}`);
      return defaultConfig;
    }

    console.log(`[AI Config] User settings found - global provider: ${settings.provider}, global model: ${settings.preferred_model}`);
    console.log(`[AI Config] Agent configs available: ${Object.keys(settings.agent_configs || {}).join(", ") || "none"}`);

    // Check agent-specific config first
    const agentConfigs = settings.agent_configs || {};
    const agentConfig = agentConfigs[agentType];

    if (agentConfig?.provider && agentConfig?.model) {
      console.log(`[AI Config] Found agent-specific config: ${agentConfig.provider}/${agentConfig.model}`);
      
      if (agentConfig.provider === "lovable") {
        console.log(`[AI Config] Agent uses Lovable provider, using: lovable/${agentConfig.model}`);
        return {
          provider: "lovable",
          model: agentConfig.model,
          apiKey: LOVABLE_API_KEY || "",
          endpoint: PROVIDER_ENDPOINTS.lovable,
        };
      }

      const apiKey = settings.api_key;
      if (!apiKey) {
        console.warn(`[AI Config] No API key found for external provider, falling back to default`);
        return defaultConfig;
      }

      console.log(`[AI Config] Using agent-specific external config: ${agentConfig.provider}/${agentConfig.model}`);
      return {
        provider: agentConfig.provider,
        model: agentConfig.model,
        apiKey,
        endpoint: PROVIDER_ENDPOINTS[agentConfig.provider] || PROVIDER_ENDPOINTS.lovable,
      };
    }

    // Fall back to global user settings for text extraction
    if (agentType === AGENT_TYPE_EXTRACT && settings.provider && settings.provider !== "lovable" && settings.api_key && settings.preferred_model) {
      console.log(`[AI Config] Using global external config for extraction: ${settings.provider}/${settings.preferred_model}`);
      return {
        provider: settings.provider,
        model: settings.preferred_model,
        apiKey: settings.api_key,
        endpoint: PROVIDER_ENDPOINTS[settings.provider] || PROVIDER_ENDPOINTS.lovable,
      };
    }

    console.log(`[AI Config] No valid external config, using default: ${defaultConfig.provider}/${defaultConfig.model}`);
    return defaultConfig;
  } catch (error) {
    console.error("[AI Config] Error resolving config:", error);
    return defaultConfig;
  }
}

// Build request for text extraction based on provider
function buildExtractRequest(config: AIConfig, systemPrompt: string, text: string): { headers: Record<string, string>; body: any } {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.provider === "anthropic") {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    return {
      headers,
      body: {
        model: config.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: text }],
      },
    };
  }

  headers["Authorization"] = `Bearer ${config.apiKey}`;
  return {
    headers,
    body: {
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    },
  };
}

// Extract content from response based on provider
function extractContent(config: AIConfig, response: any): string | null {
  if (config.provider === "anthropic") {
    return response.content?.[0]?.text || null;
  }
  return response.choices?.[0]?.message?.content || null;
}

// Validation schemas
const WebhookPayloadSchema = z.object({
  text: z.string().min(1, "Text is required").max(10000, "Text too long (max 10000 chars)"),
});

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
    text: z.string(),
  })),
  season: z.string().nullable().optional(),
  nutrition_tags: z.array(z.string()).optional(),
});

// Background image generation function
async function triggerImageGeneration(
  supabaseAdmin: any,
  recipeId: string,
  title: string,
  ingredients: any[],
  userId: string
) {
  try {
    const aiConfig = await resolveAIConfig(supabaseAdmin, userId, AGENT_TYPE_IMAGE, "google/gemini-2.5-flash-image");
    
    if (!aiConfig.apiKey) {
      console.warn("No API key configured, skipping image generation");
      return;
    }

    console.log(`Background image generation using ${aiConfig.provider}/${aiConfig.model}`);

    const ingredientsList = Array.isArray(ingredients)
      ? ingredients.slice(0, 8).map((i: any) => i.name || i).join(", ")
      : "";

    const prompt = `Professional food photography of "${title}". ${
      ingredientsList ? `Main ingredients: ${ingredientsList}.` : ""
    } Beautifully plated dish on a rustic wooden table, warm natural lighting, shallow depth of field, appetizing presentation. Ultra high resolution, 16:9 aspect ratio.`;

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return;
    }

    const aiData = await response.json();
    const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      console.error("No image in AI response");
      return;
    }

    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const fileName = `${userId}/${recipeId}-${Date.now()}.webp`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("recipe-images")
      .upload(fileName, imageBytes, { contentType: "image/webp", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return;
    }

    const { data: urlData } = supabaseAdmin.storage.from("recipe-images").getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    const { error: updateError } = await supabaseAdmin
      .from("recipes")
      .update({ source_image_url: publicUrl })
      .eq("id", recipeId);

    if (updateError) {
      console.error("Update error:", updateError);
      return;
    }

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
    const aiConfig = await resolveAIConfig(supabaseAdmin, userId, AGENT_TYPE_EXTRACT, "google/gemini-2.5-flash");
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

    const { headers, body: requestBody } = buildExtractRequest(aiConfig, systemPrompt, text);

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
    const aiContent = extractContent(aiConfig, aiResult);

    if (!aiContent) {
      return new Response(
        JSON.stringify({ error: "AI returned no content" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("AI response received");

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

    // Normalize steps
    if (Array.isArray(extractedRecipe.steps)) {
      extractedRecipe.steps = extractedRecipe.steps.map((step: any, index: number) => {
        if (typeof step === 'string') {
          return { order: index + 1, text: step };
        }
        if (step.instruction && !step.text) {
          return { order: step.order || index + 1, text: step.instruction };
        }
        return { order: step.order || index + 1, text: step.text || '' };
      });
    }

    const recipeValidation = ExtractedRecipeSchema.safeParse(extractedRecipe);
    if (!recipeValidation.success) {
      extractedRecipe = {
        title: extractedRecipe.title || "Recette sans titre",
        servings: extractedRecipe.servings ?? extractedRecipe.portions ?? null,
        ingredients: Array.isArray(extractedRecipe.ingredients) ? extractedRecipe.ingredients : [],
        steps: Array.isArray(extractedRecipe.steps) ? extractedRecipe.steps : [],
        season: extractedRecipe.season || null,
        nutrition_tags: Array.isArray(extractedRecipe.nutrition_tags) ? extractedRecipe.nutrition_tags : null,
      };
    } else {
      extractedRecipe = recipeValidation.data;
    }

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
    ).catch(err => console.warn("Background image generation failed:", err));

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
