import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Agent type for this function
const AGENT_TYPE = "timeline";

// Provider API endpoints
const PROVIDER_ENDPOINTS: Record<string, string> = {
  lovable: "https://ai.gateway.lovable.dev/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

// Models with tool/function calling capability
const TOOL_CAPABLE_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
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

interface Step {
  order: number;
  text: string;
}

interface AnalyzedStep {
  order: number;
  duration_minutes: number;
  parallel_with: number[];
  start_offset: number;
  is_passive: boolean;
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

// Resolve AI configuration for this agent
async function resolveAIConfig(supabaseClient: any, userId: string): Promise<AIConfig> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  const defaultConfig: AIConfig = {
    provider: "lovable",
    model: "google/gemini-3-flash-preview",
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

const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "analyze_timeline",
    description: "Retourne l'analyse temporelle des étapes de la recette",
    parameters: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              order: { type: "number", description: "Numéro de l'étape (1, 2, 3...)" },
              duration_minutes: { type: "number", description: "Durée estimée en minutes" },
              parallel_with: { 
                type: "array", 
                items: { type: "number" },
                description: "Numéros des étapes qui peuvent être faites en parallèle" 
              },
              is_passive: { 
                type: "boolean", 
                description: "true si tâche passive (cuisson, repos, marinade), false si tâche active (couper, mélanger)" 
              },
            },
            required: ["order", "duration_minutes", "parallel_with", "is_passive"],
          },
        },
      },
      required: ["steps"],
    },
  },
};

// Build request based on provider
function buildRequest(config: AIConfig, systemPrompt: string, userPrompt: string): { headers: Record<string, string>; body: any } {
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
        messages: [{ role: "user", content: userPrompt }],
        tools: [{
          name: TOOL_DEFINITION.function.name,
          description: TOOL_DEFINITION.function.description,
          input_schema: TOOL_DEFINITION.function.parameters,
        }],
        tool_choice: { type: "tool", name: "analyze_timeline" },
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
        { role: "user", content: userPrompt },
      ],
      tools: [TOOL_DEFINITION],
      tool_choice: { type: "function", function: { name: "analyze_timeline" } },
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { recipeId, steps } = await req.json();

    if (!recipeId || !steps || !Array.isArray(steps)) {
      return new Response(JSON.stringify({ error: "Missing recipeId or steps" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve AI config
    const aiConfig = await resolveAIConfig(supabaseClient, user.id);
    console.log(`Analyzing timeline using ${aiConfig.provider}/${aiConfig.model}`);

    if (!aiConfig.apiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stepsText = (steps as Step[])
      .sort((a, b) => a.order - b.order)
      .map((s, i) => `Étape ${i + 1}: ${s.text}`)
      .join("\n");

    const systemPrompt = `Tu es un expert culinaire. Analyse les étapes d'une recette pour créer un diagramme de Gantt réaliste.

RÈGLES CRITIQUES pour le parallélisme:
1. Une personne ne peut faire qu'UNE SEULE tâche active à la fois (couper, mélanger, nettoyer, éplucher, etc.)
2. Le parallélisme est UNIQUEMENT possible quand une étape est PASSIVE (cuisson au four, mijotage, repos, marinade, refroidissement)
3. Pendant une tâche passive, on peut faire d'autres tâches actives

EXEMPLES:
- "Faire cuire au four 20 min" = tâche passive → les étapes suivantes peuvent être en parallèle
- "Nettoyer les légumes" = tâche active → NE PEUT PAS être en parallèle avec "Couper la viande"
- "Laisser reposer 10 min" = tâche passive → parallélisme possible
- "Mélanger les ingrédients" = tâche active → pas de parallélisme

Réponds UNIQUEMENT avec l'appel de fonction.`;

    const userPrompt = `Analyse ces étapes de recette:

${stepsText}

Pour chaque étape:
- duration_minutes: durée estimée en minutes
- parallel_with: UNIQUEMENT les numéros d'étapes PASSIVES (cuisson, repos, marinade) pendant lesquelles cette étape peut être réalisée

IMPORTANT: Deux tâches actives (couper, mélanger, nettoyer) ne peuvent JAMAIS être en parallèle car une seule personne cuisine.`;

    const { headers, body } = buildRequest(aiConfig, systemPrompt, userPrompt);

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const analysisResult = extractToolCall(aiConfig, aiData);
    
    if (!analysisResult?.steps) {
      console.error("No tool call in response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI response format error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const analyzedSteps = analysisResult.steps as Array<{
      order: number;
      duration_minutes: number;
      parallel_with: number[];
      is_passive: boolean;
    }>;

    // Calculate start offsets
    const originalSteps = (steps as Step[]).sort((a, b) => a.order - b.order);
    const stepsWithOffsets: AnalyzedStep[] = [];
    const stepEndTimes = new Map<number, number>();
    
    for (const step of analyzedSteps.sort((a, b) => a.order - b.order)) {
      let startOffset = 0;
      
      if (step.parallel_with.length > 0) {
        const parallelStarts = step.parallel_with
          .map(p => stepEndTimes.get(p) !== undefined ? stepEndTimes.get(p)! - (analyzedSteps.find(s => s.order === p)?.duration_minutes || 0) : 0)
          .filter(t => t >= 0);
        
        if (parallelStarts.length > 0) {
          startOffset = Math.min(...parallelStarts);
        }
      } else {
        const prevStep = step.order - 1;
        if (stepEndTimes.has(prevStep)) {
          startOffset = stepEndTimes.get(prevStep)!;
        }
      }
      
      stepEndTimes.set(step.order, startOffset + step.duration_minutes);
      
      stepsWithOffsets.push({
        order: step.order,
        duration_minutes: step.duration_minutes,
        parallel_with: step.parallel_with,
        start_offset: startOffset,
        is_passive: step.is_passive ?? false,
      });
    }

    const timelineData = {
      analyzed_at: new Date().toISOString(),
      total_time: Math.max(...Array.from(stepEndTimes.values())),
      steps: stepsWithOffsets,
    };

    // Save to database
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: updateError } = await supabaseAdmin
      .from("recipes")
      .update({ timeline_data: timelineData })
      .eq("id", recipeId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error saving timeline:", updateError);
    }

    return new Response(JSON.stringify(timelineData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in analyze-recipe-timeline:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
