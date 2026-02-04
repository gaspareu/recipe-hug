import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Agent type for this function
const AGENT_TYPE = "generate_image";

// Provider API endpoints
const PROVIDER_ENDPOINTS: Record<string, string> = {
  lovable: "https://ai.gateway.lovable.dev/v1/chat/completions",
  openai: "https://api.openai.com/v1/images/generations",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

// Image generation capable models
const IMAGE_GEN_MODELS = [
  "google/gemini-2.5-flash-image",
  "google/gemini-3-pro-image-preview",
  "dall-e-3",
  "gemini-2.0-flash-exp-image-generation",
];

interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  endpoint: string;
}

// Resolve AI configuration for this agent
async function resolveAIConfig(supabaseClient: any, userId: string): Promise<AIConfig> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  const defaultConfig: AIConfig = {
    provider: "lovable",
    model: "google/gemini-2.5-flash-image",
    apiKey: LOVABLE_API_KEY || "",
    endpoint: PROVIDER_ENDPOINTS.lovable,
  };

  console.log(`[AI Config] Resolving config for agent: ${AGENT_TYPE}, user: ${userId}`);

  try {
    const { data: settings, error: settingsError } = await supabaseClient
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
    const agentConfig = agentConfigs[AGENT_TYPE];

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

      if (!IMAGE_GEN_MODELS.includes(agentConfig.model)) {
        console.warn(`[AI Config] Model ${agentConfig.model} doesn't support image generation, falling back to default`);
        return defaultConfig;
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

    console.log(`[AI Config] No agent-specific config, using default: ${defaultConfig.provider}/${defaultConfig.model}`);
    return defaultConfig;
  } catch (error) {
    console.error("[AI Config] Error resolving config:", error);
    return defaultConfig;
  }
}

// Generate image based on provider
async function generateImage(config: AIConfig, prompt: string): Promise<string> {
  if (config.provider === "openai" && config.model === "dall-e-3") {
    // OpenAI DALL-E 3 API
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1792x1024",
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DALL-E error:", response.status, errorText);
      throw new Error(`DALL-E error: ${response.status}`);
    }

    const data = await response.json();
    const base64 = data.data?.[0]?.b64_json;
    if (!base64) throw new Error("No image in DALL-E response");
    
    return `data:image/png;base64,${base64}`;
  }

  // Lovable / Google Gemini format
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI gateway error:", response.status, errorText);
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const aiData = await response.json();
  const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  if (!imageUrl) {
    console.error("No image in response:", JSON.stringify(aiData));
    throw new Error("No image generated");
  }

  return imageUrl;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const { recipeId, title, ingredients } = await req.json();

    if (!recipeId || !title) {
      return new Response(
        JSON.stringify({ error: "Missing recipeId or title" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify recipe ownership
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id, user_id")
      .eq("id", recipeId)
      .single();

    if (recipeError || !recipe || recipe.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Recipe not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve AI configuration for this agent
    const aiConfig = await resolveAIConfig(supabase, userId);
    console.log(`Generating image for recipe ${recipeId} using ${aiConfig.provider}/${aiConfig.model}`);

    // Build prompt
    const ingredientsList = Array.isArray(ingredients)
      ? ingredients.slice(0, 8).map((i: any) => i.name || i).join(", ")
      : "";

    const prompt = `Professional food photography of "${title}". ${
      ingredientsList ? `Main ingredients: ${ingredientsList}.` : ""
    } Beautifully plated dish on a rustic wooden table, warm natural lighting, shallow depth of field, appetizing presentation. Ultra high resolution, 16:9 aspect ratio.`;

    console.log("Generating image with prompt:", prompt);

    // Generate image
    let imageUrl: string;
    try {
      imageUrl = await generateImage(aiConfig, prompt);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("429")) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (error.message.includes("402")) {
          return new Response(
            JSON.stringify({ error: "Payment required, please add credits" }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      throw error;
    }

    // Convert base64 to blob and upload to storage
    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const fileName = `${userId}/${recipeId}-${Date.now()}.webp`;

    const { error: uploadError } = await supabase.storage
      .from("recipe-images")
      .upload(fileName, imageBytes, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to upload image");
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("recipe-images")
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Update recipe with new image URL
    const { error: updateError } = await supabase
      .from("recipes")
      .update({ source_image_url: publicUrl })
      .eq("id", recipeId);

    if (updateError) {
      console.error("Update error:", updateError);
      throw new Error("Failed to update recipe");
    }

    console.log("Image generated and saved:", publicUrl);

    return new Response(
      JSON.stringify({ success: true, imageUrl: publicUrl }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating recipe image:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
