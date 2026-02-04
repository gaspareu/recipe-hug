import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Agent type for this function
const AGENT_TYPE = "parse_image";

// Provider API endpoints
const PROVIDER_ENDPOINTS: Record<string, string> = {
  lovable: "https://ai.gateway.lovable.dev/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

// Model capabilities - only vision-capable models work for this agent
const VISION_MODELS = [
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-3-pro-preview",
  "google/gemini-3-flash-preview",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "gemini-2.5-pro-preview-05-06",
  "gemini-2.5-flash-preview-05-20",
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
  
  // Default config
  const defaultConfig: AIConfig = {
    provider: "lovable",
    model: "google/gemini-2.5-pro",
    apiKey: LOVABLE_API_KEY || "",
    endpoint: PROVIDER_ENDPOINTS.lovable,
  };

  console.log(`[AI Config] Resolving config for agent: ${AGENT_TYPE}, user: ${userId}`);

  try {
    // Fetch user AI settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from("user_ai_settings")
      .select("provider, api_key, preferred_model, agent_configs")
      .eq("user_id", userId)
      .single();

    if (settingsError) {
      console.log(`[AI Config] No user settings found, using default: ${defaultConfig.provider}/${defaultConfig.model}`);
      return defaultConfig;
    }

    if (!settings) {
      console.log(`[AI Config] Settings empty, using default: ${defaultConfig.provider}/${defaultConfig.model}`);
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

      // Verify the model has vision capability
      if (!VISION_MODELS.includes(agentConfig.model)) {
        console.warn(`[AI Config] Model ${agentConfig.model} doesn't support vision, falling back to default`);
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

    // Fall back to global user settings
    if (settings.provider && settings.provider !== "lovable" && settings.api_key && settings.preferred_model) {
      console.log(`[AI Config] Checking global fallback: ${settings.provider}/${settings.preferred_model}`);
      
      if (!VISION_MODELS.includes(settings.preferred_model)) {
        console.warn(`[AI Config] Global model ${settings.preferred_model} doesn't support vision, falling back to default`);
        return defaultConfig;
      }

      console.log(`[AI Config] Using global external config: ${settings.provider}/${settings.preferred_model}`);
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

// Build request body based on provider
function buildRequestBody(config: AIConfig, systemPrompt: string, imageUrl: string): any {
  if (config.provider === "anthropic") {
    return {
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analyse cette image de recette et extrais les informations au format JSON." },
            { type: "image", source: { type: "url", url: imageUrl } },
          ],
        },
      ],
    };
  }

  // OpenAI / Lovable / Google format
  return {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyse cette image de recette et extrais les informations au format JSON." },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  };
}

// Build request headers based on provider
function buildHeaders(config: AIConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.provider === "anthropic") {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  return headers;
}

// Extract content from response based on provider
function extractContent(config: AIConfig, response: any): string | null {
  if (config.provider === "anthropic") {
    return response.content?.[0]?.text || null;
  }
  return response.choices?.[0]?.message?.content || null;
}

// SSRF protection: validate URL is safe
function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return false;

    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return false;
    if (hostname === "169.254.169.254") return false;

    const parts = hostname.split(".");
    if (parts.length === 4) {
      const firstOctet = parseInt(parts[0], 10);
      const secondOctet = parseInt(parts[1], 10);
      if (firstOctet === 10) return false;
      if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) return false;
      if (firstOctet === 192 && secondOctet === 168) return false;
      if (firstOctet === 169 && secondOctet === 254) return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Input validation schema
const RequestSchema = z.object({
  image_url: z
    .string()
    .url("Invalid URL format")
    .max(2000, "URL too long")
    .refine(isUrlSafe, "URL is not allowed (must be HTTPS and not internal)"),
});

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction de recettes de cuisine à partir d'images.
Analyse l'image fournie et extrais les informations suivantes au format JSON strict:

{
  "title": "string - titre de la recette",
  "servings": "number | null - nombre de portions si visible",
  "ingredients": [
    {
      "name": "string - nom de l'ingrédient",
      "quantity": "string - quantité (ex: '200', '1/2')",
      "unit": "string - unité (ex: 'g', 'ml', 'pièce', 'c. à soupe')",
      "category": "string - catégorie optionnelle (légumes, viandes, épices, etc.)"
    }
  ],
  "steps": [
    {
      "order": "number - numéro de l'étape (1, 2, 3...)",
      "text": "string - description de l'étape"
    }
  ]
}

Règles importantes:
- Si une information n'est pas visible ou lisible, utilise null ou un tableau vide
- Nettoie et structure les données même si l'écriture est manuscrite
- Pour les quantités, sépare le nombre de l'unité. Si les quantités ne sont pas en mesures francaises, converties les. 
- Numérote les étapes dans l'ordre logique
- Réponds UNIQUEMENT avec le JSON, sans texte explicatif ni markdown`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Validate input
    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: parseResult.error.errors[0]?.message || "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { image_url } = parseResult.data;

    // Resolve AI configuration for this agent
    const aiConfig = await resolveAIConfig(supabaseClient, userId);
    console.log(`Parsing recipe image for user ${userId} using ${aiConfig.provider}/${aiConfig.model}`);

    // Build and send request
    const requestBody = buildRequestBody(aiConfig, SYSTEM_PROMPT, image_url);
    const headers = buildHeaders(aiConfig);

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes. Veuillez réessayer dans quelques instants." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA insuffisants. Veuillez recharger votre compte." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = extractContent(aiConfig, aiResponse);

    if (!content) {
      throw new Error("No content in AI response");
    }

    console.log("AI response content received");

    // Parse the JSON from the response
    let jsonContent = content.trim();
    if (jsonContent.startsWith("```json")) {
      jsonContent = jsonContent.slice(7);
    }
    if (jsonContent.startsWith("```")) {
      jsonContent = jsonContent.slice(3);
    }
    if (jsonContent.endsWith("```")) {
      jsonContent = jsonContent.slice(0, -3);
    }
    jsonContent = jsonContent.trim();

    const parsedRecipe = JSON.parse(jsonContent);

    console.log("Parsed recipe:", parsedRecipe.title);

    return new Response(
      JSON.stringify({
        success: true,
        recipe: parsedRecipe,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error parsing recipe image:", error);

    return new Response(
      JSON.stringify({
        error: "Failed to parse recipe image",
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
