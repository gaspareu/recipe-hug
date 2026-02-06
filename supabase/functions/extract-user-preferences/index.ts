import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Agent type for this function - uses chat agent config since it's conversational analysis
const AGENT_TYPE = "chat";

// Provider API endpoints
const PROVIDER_ENDPOINTS: Record<string, string> = {
  lovable: "https://ai.gateway.lovable.dev/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

// Models with tool/function calling capability
const TOOL_CAPABLE_MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "google/gemini-3-flash-preview",
  "google/gemini-3-pro-preview",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
];

interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  endpoint: string;
}

// Get API key for specific provider from provider_api_keys or legacy api_key
function getApiKeyForProvider(settings: any, provider: string): string | null {
  if (provider === "lovable") return null;
  const providerApiKeys = settings.provider_api_keys || {};
  const providerKey = providerApiKeys[provider];
  if (providerKey) return providerKey;
  if (settings.provider === provider && settings.api_key) return settings.api_key;
  return null;
}

// Resolve AI configuration
async function resolveAIConfig(supabaseClient: any, userId: string): Promise<AIConfig> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  const defaultConfig: AIConfig = {
    provider: "lovable",
    model: "google/gemini-2.5-flash",
    apiKey: LOVABLE_API_KEY || "",
    endpoint: PROVIDER_ENDPOINTS.lovable,
  };

  console.log(`[AI Config] Resolving config for agent: ${AGENT_TYPE}, user: ${userId}`);

  try {
    const { data: settings, error: settingsError } = await supabaseClient
      .from("user_ai_settings")
      .select("provider, api_key, preferred_model, agent_configs, provider_api_keys")
      .eq("user_id", userId)
      .single();

    if (settingsError || !settings) {
      console.log(`[AI Config] No user settings found, using default: ${defaultConfig.provider}/${defaultConfig.model}`);
      return defaultConfig;
    }

    console.log(`[AI Config] User settings found - global provider: ${settings.provider}, global model: ${settings.preferred_model}`);
    console.log(`[AI Config] Agent configs available: ${Object.keys(settings.agent_configs || {}).join(", ") || "none"}`);
    console.log(`[AI Config] Provider API keys available: ${Object.keys(settings.provider_api_keys || {}).join(", ") || "none"}`);

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

      if (!TOOL_CAPABLE_MODELS.includes(agentConfig.model)) {
        console.warn(`[AI Config] Model ${agentConfig.model} doesn't support tools, falling back to default`);
        return defaultConfig;
      }

      const apiKey = getApiKeyForProvider(settings, agentConfig.provider);
      if (!apiKey) {
        console.warn(`[AI Config] No API key found for provider ${agentConfig.provider}, falling back to default`);
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

    // Fall back to global settings if tool-capable
    if (settings.provider && settings.provider !== "lovable" && settings.preferred_model) {
      console.log(`[AI Config] Checking global fallback: ${settings.provider}/${settings.preferred_model}`);
      
      const globalApiKey = getApiKeyForProvider(settings, settings.provider);
      if (globalApiKey && TOOL_CAPABLE_MODELS.includes(settings.preferred_model)) {
        console.log(`[AI Config] Using global external config: ${settings.provider}/${settings.preferred_model}`);
        return {
          provider: settings.provider,
          model: settings.preferred_model,
          apiKey: globalApiKey,
          endpoint: PROVIDER_ENDPOINTS[settings.provider] || PROVIDER_ENDPOINTS.lovable,
        };
      } else if (!globalApiKey) {
        console.warn(`[AI Config] No API key for provider ${settings.provider}, falling back to default`);
      } else {
        console.warn(`[AI Config] Global model ${settings.preferred_model} doesn't support tools, falling back to default`);
      }
    }

    console.log(`[AI Config] No valid external config, using default: ${defaultConfig.provider}/${defaultConfig.model}`);
    return defaultConfig;
  } catch (error) {
    console.error("[AI Config] Error resolving config:", error);
    return defaultConfig;
  }
}

// Input validation schema
const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(10000, "Message content too long"),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema).max(50, "Too many messages"),
});

const EXTRACTION_PROMPT = `Tu es un assistant qui analyse des conversations culinaires pour extraire les préférences de l'utilisateur.

Analyse la conversation et extrais UNIQUEMENT les nouvelles informations mentionnées explicitement par l'utilisateur concernant:
1. Préférences de goût (saveurs aimées/détestées, ingrédients aimés/détestés)
2. Équipement cuisine (équipements disponibles ou non disponibles mentionnés)
3. Style culinaire (cuisines favorites, techniques de cuisine favorites, niveau de difficulté préféré)
4. Contraintes alimentaires (allergies, régimes, restrictions)

IMPORTANT:
- N'invente PAS d'informations, extrais seulement ce qui est explicitement dit
- Retourne des tableaux vides pour les catégories sans information
- Sois précis sur les formulations (ex: "pas de four" → unavailable: ["four"])`;

const EXTRACT_PREFERENCES_TOOL = {
  type: "function",
  function: {
    name: "extract_preferences",
    description: "Extrait les préférences culinaires détectées dans la conversation",
    parameters: {
      type: "object",
      properties: {
        taste_preferences: {
          type: "object",
          properties: {
            liked_flavors: { type: "array", items: { type: "string" }, description: "Saveurs aimées (épicé, sucré, umami, acide, etc.)" },
            disliked_flavors: { type: "array", items: { type: "string" }, description: "Saveurs détestées" },
            liked_ingredients: { type: "array", items: { type: "string" }, description: "Ingrédients aimés" },
            disliked_ingredients: { type: "array", items: { type: "string" }, description: "Ingrédients détestés" }
          }
        },
        kitchen_equipment: {
          type: "object",
          properties: {
            available: { type: "array", items: { type: "string" }, description: "Équipements disponibles mentionnés" },
            unavailable: { type: "array", items: { type: "string" }, description: "Équipements non disponibles (ex: 'pas de four' → 'four')" }
          }
        },
        culinary_style: {
          type: "object",
          properties: {
            favorite_cuisines: { type: "array", items: { type: "string" }, description: "Cuisines favorites (asiatique, française, africaine, etc.)" },
            favorite_techniques: { type: "array", items: { type: "string" }, description: "Techniques favorites (pickles, fermentation, wok, etc.)" },
            preferred_difficulty: { type: "string", enum: ["facile", "moyen", "difficile"], description: "Niveau de difficulté préféré si mentionné" }
          }
        },
        dietary_constraints: {
          type: "object",
          properties: {
            allergies: { type: "array", items: { type: "string" }, description: "Allergies mentionnées" },
            diets: { type: "array", items: { type: "string" }, description: "Régimes (végétarien, vegan, sans gluten, etc.)" },
            restrictions: { type: "array", items: { type: "string" }, description: "Autres restrictions alimentaires" }
          }
        }
      },
      required: ["taste_preferences", "kitchen_equipment", "culinary_style", "dietary_constraints"]
    }
  }
};

// Build request based on provider
function buildRequest(config: AIConfig, conversationText: string): { headers: Record<string, string>; body: any } {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.provider === "anthropic") {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    return {
      headers,
      body: {
        model: config.model,
        max_tokens: 4096,
        system: EXTRACTION_PROMPT,
        messages: [{ role: "user", content: `Analyse cette conversation et extrait les préférences culinaires:\n\n${conversationText}` }],
        tools: [{
          name: EXTRACT_PREFERENCES_TOOL.function.name,
          description: EXTRACT_PREFERENCES_TOOL.function.description,
          input_schema: EXTRACT_PREFERENCES_TOOL.function.parameters,
        }],
        tool_choice: { type: "tool", name: "extract_preferences" },
      },
    };
  }

  headers["Authorization"] = `Bearer ${config.apiKey}`;
  return {
    headers,
    body: {
      model: config.model,
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: `Analyse cette conversation et extrait les préférences culinaires:\n\n${conversationText}` },
      ],
      tools: [EXTRACT_PREFERENCES_TOOL],
      tool_choice: { type: "function", function: { name: "extract_preferences" } },
    },
  };
}

// Extract tool call result based on provider
function extractToolCall(config: AIConfig, response: any): any {
  if (config.provider === "anthropic") {
    const toolUse = response.content?.find((c: any) => c.type === "tool_use");
    return toolUse?.input;
  }
  const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
  return toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : null;
}

// Merge arrays without duplicates (case-insensitive)
function mergeArrays(existing: string[], newItems: string[]): string[] {
  const lowerExisting = new Set(existing.map(s => s.toLowerCase()));
  const result = [...existing];
  
  for (const item of newItems) {
    if (!lowerExisting.has(item.toLowerCase())) {
      result.push(item);
      lowerExisting.add(item.toLowerCase());
    }
  }
  
  return result;
}

// Merge preferences objects
function mergePreferences(existing: any, extracted: any): any {
  return {
    taste_preferences: {
      liked_flavors: mergeArrays(existing.taste_preferences?.liked_flavors || [], extracted.taste_preferences?.liked_flavors || []),
      disliked_flavors: mergeArrays(existing.taste_preferences?.disliked_flavors || [], extracted.taste_preferences?.disliked_flavors || []),
      liked_ingredients: mergeArrays(existing.taste_preferences?.liked_ingredients || [], extracted.taste_preferences?.liked_ingredients || []),
      disliked_ingredients: mergeArrays(existing.taste_preferences?.disliked_ingredients || [], extracted.taste_preferences?.disliked_ingredients || []),
    },
    kitchen_equipment: {
      available: mergeArrays(existing.kitchen_equipment?.available || [], extracted.kitchen_equipment?.available || []),
      unavailable: mergeArrays(existing.kitchen_equipment?.unavailable || [], extracted.kitchen_equipment?.unavailable || []),
    },
    culinary_style: {
      favorite_cuisines: mergeArrays(existing.culinary_style?.favorite_cuisines || [], extracted.culinary_style?.favorite_cuisines || []),
      favorite_techniques: mergeArrays(existing.culinary_style?.favorite_techniques || [], extracted.culinary_style?.favorite_techniques || []),
      preferred_difficulty: extracted.culinary_style?.preferred_difficulty || existing.culinary_style?.preferred_difficulty || null,
    },
    dietary_constraints: {
      allergies: mergeArrays(existing.dietary_constraints?.allergies || [], extracted.dietary_constraints?.allergies || []),
      diets: mergeArrays(existing.dietary_constraints?.diets || [], extracted.dietary_constraints?.diets || []),
      restrictions: mergeArrays(existing.dietary_constraints?.restrictions || [], extracted.dietary_constraints?.restrictions || []),
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;

    // Validate input
    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);
    
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: parseResult.error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages } = parseResult.data;

    // Resolve AI config
    const aiConfig = await resolveAIConfig(supabaseClient, userId);
    console.log(`Extracting preferences using ${aiConfig.provider}/${aiConfig.model}`);

    if (!aiConfig.apiKey) {
      throw new Error("AI service not configured");
    }

    // Get existing preferences
    const { data: existingPrefs } = await supabaseClient
      .from('user_culinary_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Format conversation
    const conversationText = messages
      .filter((m: any) => m.role === 'user')
      .map((m: any) => m.content)
      .join('\n');

    if (!conversationText.trim()) {
      return new Response(
        JSON.stringify({ success: true, message: "No user messages to analyze" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build and send request
    const { headers, body: requestBody } = buildRequest(aiConfig, conversationText);

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error("AI extraction failed");
    }

    const aiResult = await response.json();
    const extractedPrefs = extractToolCall(aiConfig, aiResult);

    if (!extractedPrefs) {
      console.log("No preferences extracted from conversation");
      return new Response(
        JSON.stringify({ success: true, message: "No new preferences detected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Extracted preferences:", extractedPrefs);

    const defaultPrefs = {
      taste_preferences: { liked_flavors: [], disliked_flavors: [], liked_ingredients: [], disliked_ingredients: [] },
      kitchen_equipment: { available: [], unavailable: [] },
      culinary_style: { favorite_cuisines: [], favorite_techniques: [], preferred_difficulty: null },
      dietary_constraints: { allergies: [], diets: [], restrictions: [] },
    };

    const mergedPrefs = mergePreferences(existingPrefs || defaultPrefs, extractedPrefs);

    // Upsert preferences
    const { error: upsertError } = await supabaseClient
      .from('user_culinary_preferences')
      .upsert({
        user_id: userId,
        taste_preferences: mergedPrefs.taste_preferences,
        kitchen_equipment: mergedPrefs.kitchen_equipment,
        culinary_style: mergedPrefs.culinary_style,
        dietary_constraints: mergedPrefs.dietary_constraints,
      }, { onConflict: 'user_id' });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      throw upsertError;
    }

    console.log("Preferences updated successfully");

    return new Response(
      JSON.stringify({ success: true, preferences: mergedPrefs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Extract preferences error:", error);
    return new Response(
      JSON.stringify({ error: "server_error", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
