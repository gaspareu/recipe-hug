import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(2000, "Prompt too long"),
});

// ===== AI PROVIDER SUPPORT =====
type AIProvider = "lovable" | "gemini" | "openai" | "anthropic";

interface AISettings {
  provider: AIProvider;
  api_key: string | null;
  preferred_model: string | null;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  lovable: "google/gemini-3-flash-preview",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o",
  anthropic: "claude-3-5-sonnet-latest",
};

async function getUserAISettings(supabaseClient: any, userId: string): Promise<AISettings> {
  try {
    const { data, error } = await supabaseClient
      .from("user_ai_settings")
      .select("provider, api_key, preferred_model")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return { provider: "lovable", api_key: null, preferred_model: null };
    return { provider: data.provider || "lovable", api_key: data.api_key, preferred_model: data.preferred_model };
  } catch {
    return { provider: "lovable", api_key: null, preferred_model: null };
  }
}

async function callAINonStreaming(settings: AISettings, messages: any[]): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const { provider, api_key, preferred_model } = settings;
  const model = preferred_model || DEFAULT_MODELS[provider];

  if (provider !== "lovable" && !api_key) {
    return callLovableAINonStreaming(LOVABLE_API_KEY!, messages, DEFAULT_MODELS.lovable);
  }

  switch (provider) {
    case "gemini": return callGeminiAINonStreaming(api_key!, model, messages);
    case "openai": return callOpenAINonStreaming(api_key!, model, messages);
    case "anthropic": return callAnthropicAINonStreaming(api_key!, model, messages);
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
    role: msg.role === "system" ? "user" : msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.role === "system" ? `[System]: ${msg.content}` : msg.content }],
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
    body: JSON.stringify({ contents: mergedMessages, generationConfig: { temperature: 0.7, maxOutputTokens: 8192 } }),
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
  const systemMessage = messages.find((m) => m.role === "system")?.content || "";
  const chatMessages = messages.filter((m) => m.role !== "system").map((msg) => ({ role: msg.role, content: msg.content }));
  const body: any = { model, max_tokens: 8192, messages: chatMessages };
  if (systemMessage) body.system = systemMessage;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text;
}

const systemPrompt = `Tu es un chef cuisinier français passionné avec 20 ans d'expérience dans des restaurants étoilés. Tu crées des recettes détaillées, créatives et accessibles.

## TON STYLE
- Recettes gourmandes avec des touches personnelles et astuces de chef
- Étapes détaillées avec les "pourquoi" (ex: "pour éviter que ça colle", "pour développer les arômes")
- Temps indicatifs dans les étapes quand pertinent
- Conseils de présentation en dernière étape

## FORMAT DE SORTIE
Réponds UNIQUEMENT avec un JSON valide, sans texte avant/après:
{
  "title": "Nom créatif et appétissant",
  "servings": 4,
  "ingredients": [
    {"name": "nom", "quantity": "100", "unit": "g", "category": "catégorie"}
  ],
  "steps": [
    {"order": 1, "text": "Description détaillée avec timing et astuces"}
  ]
}

Catégories: légumes, fruits, viandes, poissons, produits laitiers, épices, autres

Génère maintenant une recette créative et détaillée selon la demande de l'utilisateur.`;

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

    const { prompt } = parseResult.data;
    console.log("Generating recipe for user:", userId, "prompt:", prompt);

    const aiSettings = await getUserAISettings(supabaseClient, userId);
    console.log("AI provider:", aiSettings.provider);

    const content = await callAINonStreaming(aiSettings, [
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
