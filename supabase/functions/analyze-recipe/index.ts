import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.union([z.string(), z.number()]).optional(),
  unit: z.string().optional(),
});

const StepSchema = z.object({ text: z.string() });

const RequestSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  ingredients: z.array(IngredientSchema).min(1, "At least one ingredient required").max(100, "Too many ingredients"),
  steps: z.array(StepSchema).max(50, "Too many steps").optional(),
});

// ===== AI PROVIDER SUPPORT =====
type AIProvider = "lovable" | "gemini" | "openai" | "anthropic";

interface ProviderApiKeys {
  gemini?: string;
  openai?: string;
  anthropic?: string;
}

interface AISettings {
  provider: AIProvider;
  api_key: string | null;
  preferred_model: string | null;
  provider_api_keys: ProviderApiKeys;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  lovable: "google/gemini-2.5-flash",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
};

function getApiKeyForProvider(settings: AISettings, provider: AIProvider): string | null {
  if (provider === "lovable") return null;
  const providerKey = settings.provider_api_keys?.[provider];
  if (providerKey) return providerKey;
  if (settings.provider === provider && settings.api_key) return settings.api_key;
  return null;
}

async function getUserAISettings(supabaseClient: any, userId: string): Promise<AISettings> {
  try {
    const { data, error } = await supabaseClient
      .from("user_ai_settings")
      .select("provider, api_key, preferred_model, provider_api_keys")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return { provider: "lovable", api_key: null, preferred_model: null, provider_api_keys: {} };
    return {
      provider: data.provider || "lovable",
      api_key: data.api_key,
      preferred_model: data.preferred_model,
      provider_api_keys: data.provider_api_keys || {},
    };
  } catch {
    return { provider: "lovable", api_key: null, preferred_model: null, provider_api_keys: {} };
  }
}

async function callAINonStreaming(settings: AISettings, messages: any[]): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const { provider, preferred_model } = settings;
  // Use faster/cheaper model for analysis tasks
  const model = provider === "lovable" ? DEFAULT_MODELS.lovable : (preferred_model || DEFAULT_MODELS[provider]);
  const apiKey = getApiKeyForProvider(settings, provider);

  if (provider !== "lovable" && !apiKey) {
    console.log(`No API key for provider ${provider}, falling back to Lovable AI`);
    return callLovableAINonStreaming(LOVABLE_API_KEY!, messages, DEFAULT_MODELS.lovable);
  }

  switch (provider) {
    case "gemini": return callGeminiAINonStreaming(apiKey!, model, messages);
    case "openai": return callOpenAINonStreaming(apiKey!, model, messages);
    case "anthropic": return callAnthropicAINonStreaming(apiKey!, model, messages);
    default: return callLovableAINonStreaming(LOVABLE_API_KEY!, messages, model);
  }
}

async function callLovableAINonStreaming(apiKey: string, messages: any[], model: string): Promise<any> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!response.ok) throw new Error(`AI error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content;
}

async function callGeminiAINonStreaming(apiKey: string, model: string, messages: any[]): Promise<any> {
  const geminiMessages = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));
  const mergedMessages: any[] = [];
  for (const msg of geminiMessages) {
    if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === msg.role) {
      mergedMessages[mergedMessages.length - 1].parts.push(...msg.parts);
    } else {
      mergedMessages.push(msg);
    }
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: mergedMessages }),
  });
  if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function callOpenAINonStreaming(apiKey: string, model: string, messages: any[]): Promise<any> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content;
}

async function callAnthropicAINonStreaming(apiKey: string, model: string, messages: any[]): Promise<any> {
  const body: any = { model, max_tokens: 4096, messages: messages.map((msg) => ({ role: msg.role, content: msg.content })) };
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text;
}

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
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

    const { title, ingredients, steps } = parseResult.data;
    console.log(`Analyzing recipe: ${title} for user: ${userId}`);

    const aiSettings = await getUserAISettings(supabaseClient, userId);
    console.log("AI provider:", aiSettings.provider);

    const ingredientsList = ingredients.map((i: any) => `${i.quantity || ""} ${i.unit || ""} ${i.name}`.trim()).join(", ");
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

Pour ai_summary: Une description courte et générique du plat (type de cuisine, caractéristiques principales).
Pour nutrition_tags: Choisis 1 à 3 tags maximum parmi: "protéines", "fibres", "léger", "végétarien", "végan", "sans gluten", "sans lactose", "vitamines", "fer", "oméga-3", "énergétique", "réconfortant"
Pour calorie_score: Note de 1 à 5 (1=très calorique >600kcal, 5=très léger <150kcal)
Pour season: Choisis parmi: "printemps", "été", "automne", "hiver", "toutes saisons"

Réponds uniquement avec le JSON, sans markdown ni texte supplémentaire.`;

    const aiResponse = await callAINonStreaming(aiSettings, [{ role: "user", content: prompt }]);
    console.log("AI response received");

    let analysis;
    try {
      const cleanJson = aiResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      throw new Error("Failed to parse AI analysis");
    }

    console.log("Parsed analysis for recipe:", title);

    return new Response(JSON.stringify(analysis), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error in analyze-recipe function:", error);
    return new Response(JSON.stringify({ error: "Failed to analyze recipe" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
