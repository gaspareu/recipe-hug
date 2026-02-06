import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(10000, "Message content too long"),
});

const IngredientSchema = z.object({
  name: z.string(),
  quantity: z.union([z.string(), z.number()]).nullable().optional(),
  unit: z.string().nullable().optional(),
  category: z.string().optional(),
});

const StepSchema = z.object({
  order: z.number(),
  text: z.string(),
  completed: z.boolean().optional(),
});

const RecipeContextSchema = z.object({
  title: z.string(),
  servings: z.number().optional(),
  season: z.string().optional().nullable(),
  ingredients: z.array(IngredientSchema).optional(),
  steps: z.array(StepSchema).optional(),
  completedStepsCount: z.number().optional(),
  totalSteps: z.number().optional(),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema).max(50, "Too many messages"),
  recipeContext: RecipeContextSchema.optional(),
  mode: z.enum(["cooking", "editing"]).optional().default("cooking"),
});

// ===== AI PROVIDER TYPES =====
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
  lovable: "google/gemini-3-flash-preview",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
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

    if (error || !data) {
      return { provider: "lovable", api_key: null, preferred_model: null, provider_api_keys: {} };
    }

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

async function callAI(
  settings: AISettings,
  messages: any[],
  options: { tools?: any[]; stream?: boolean } = {}
): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const { provider, preferred_model } = settings;
  const model = preferred_model || DEFAULT_MODELS[provider];
  const stream = options.stream ?? true;
  const apiKey = getApiKeyForProvider(settings, provider);

  if (provider !== "lovable" && !apiKey) {
    console.log(`No API key for provider ${provider}, falling back to Lovable AI`);
    return callLovableAI(LOVABLE_API_KEY!, messages, { ...options, model: DEFAULT_MODELS.lovable, stream });
  }

  switch (provider) {
    case "gemini":
      return callGeminiAI(apiKey!, model, messages, options);
    case "openai":
      return callOpenAI(apiKey!, model, messages, options);
    case "anthropic":
      return callAnthropicAI(apiKey!, model, messages, options);
    default:
      return callLovableAI(LOVABLE_API_KEY!, messages, { ...options, model, stream });
  }
}

async function callLovableAI(apiKey: string, messages: any[], options: any): Promise<Response> {
  const body: any = { model: options.model, messages, stream: options.stream ?? true };
  if (options.tools?.length) body.tools = options.tools;

  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callGeminiAI(apiKey: string, model: string, messages: any[], options: any): Promise<Response> {
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

  const body: any = { contents: mergedMessages, generationConfig: { temperature: 0.7, maxOutputTokens: 8192 } };
  if (options.tools?.length) {
    body.tools = [{ functionDeclarations: options.tools.map((t: any) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }];
  }

  const endpoint = options.stream
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (options.stream && response.ok) return transformGeminiStreamToOpenAI(response);
  return response;
}

function transformGeminiStreamToOpenAI(response: Response): Response {
  const reader = response.body!.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); break; }
        buffer += decoder.decode(value, { stream: true });
        try {
          const jsonMatch = buffer.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const chunks = JSON.parse(jsonMatch[0]);
            for (const chunk of chunks) {
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
              const toolCalls = chunk.candidates?.[0]?.content?.parts?.[0]?.functionCall;
              const openAIChunk: any = { choices: [{ delta: {}, index: 0 }] };
              if (text) openAIChunk.choices[0].delta.content = text;
              if (toolCalls) openAIChunk.choices[0].delta.tool_calls = [{ id: `call_${Date.now()}`, type: "function", function: { name: toolCalls.name, arguments: JSON.stringify(toolCalls.args) } }];
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
            }
            buffer = "";
          }
        } catch { /* Keep accumulating */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

async function callOpenAI(apiKey: string, model: string, messages: any[], options: any): Promise<Response> {
  const body: any = { model, messages, stream: options.stream ?? true };
  if (options.tools?.length) body.tools = options.tools;

  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callAnthropicAI(apiKey: string, model: string, messages: any[], options: any): Promise<Response> {
  const systemMessage = messages.find((m) => m.role === "system")?.content || "";
  const chatMessages = messages.filter((m) => m.role !== "system").map((msg) => ({ role: msg.role, content: msg.content }));

  const body: any = { model, max_tokens: 8192, messages: chatMessages };
  if (systemMessage) body.system = systemMessage;
  if (options.tools?.length) body.tools = options.tools.map((t: any) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
  if (options.stream) body.stream = true;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (options.stream && response.ok) return transformAnthropicStreamToOpenAI(response);
  return response;
}

function transformAnthropicStreamToOpenAI(response: Response): Response {
  const reader = response.body!.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "content_block_delta") {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: data.delta?.text || "" }, index: 0 }] })}\n\n`));
              } else if (data.type === "tool_use") {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: data.id, type: "function", function: { name: data.name, arguments: JSON.stringify(data.input) } }] }, index: 0 }] })}\n\n`));
              }
            } catch { /* Skip invalid */ }
          }
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

const COOKING_SYSTEM_PROMPT = `Tu es un assistant culinaire qui guide l'utilisateur dans la réalisation d'une recette spécifique.

Tu as en contexte la recette complète (titre, ingrédients, étapes, portions, saison).

Comportement :
- Guide l'utilisateur étape par étape dans la réalisation
- Adapte les quantités si l'utilisateur change le nombre de portions
- Suggère des substitutions d'ingrédients selon la saison française, les disponibilités ou les allergies
- Explique les techniques de cuisine mentionnées dans les étapes
- Réponds aux questions sur les temps de cuisson, textures attendues, etc.
- Si l'utilisateur envoie une photo, analyse-la pour valider l'avancement ou la présentation
- Donne des conseils pratiques et astuces de chef

Ton : chaleureux, encourageant, expert culinaire français. Tu accompagnes comme un chef bienveillant.

IMPORTANT : Tu ne crées pas de nouvelle recette, tu aides à réaliser celle en contexte.`;

const EDITING_SYSTEM_PROMPT = `Tu es un chef cuisinier français passionné avec 20 ans d'expérience. Tu aides l'utilisateur à MODIFIER une recette existante OU à CRÉER une nouvelle recette inspirée.

Tu as en contexte la recette complète (titre, ingrédients, étapes, portions).

## TON RÔLE
- Adapter la recette selon les besoins (végétarien, sans gluten, moins calorique, etc.)
- Suggérer des substitutions d'ingrédients créatives
- Proposer des améliorations de techniques ou de présentation
- Ajuster les quantités pour un nombre différent de portions
- CRÉER de nouvelles recettes inspirées de l'originale (autre protéine, réutilisation de restes, etc.)

## QUAND MODIFIER LA RECETTE (extract_modified_recipe)
Appelle extract_modified_recipe quand l'utilisateur valide une MODIFICATION de la recette actuelle :
- "ok", "parfait", "super", "génial", "excellent", "top", "nickel"
- "enregistre", "sauvegarde", "applique", "valide", "c'est bon"
- "remplace", "mets à jour", "on garde ça", "ça me va"

## QUAND CRÉER UNE NOUVELLE RECETTE (create_new_recipe)
Appelle create_new_recipe quand l'utilisateur veut :
- Une version avec une AUTRE protéine principale ("et avec du poulet ?", "version bœuf ?")
- Réutiliser des RESTES dans un AUTRE plat ("que faire avec les restes ?", "j'ai des restes")
- Une recette COMPLÈTEMENT DIFFÉRENTE inspirée de l'originale
- Un NOUVEAU PLAT basé sur les mêmes techniques ou saveurs

Ton : créatif, expert culinaire, bienveillant. Tu co-crées avec l'utilisateur.`;

const PERSONALIZATION_INSTRUCTION = `

IMPORTANT - PROFIL UTILISATEUR :
Tu as accès au profil culinaire de l'utilisateur. Utilise ces informations pour :
- Proposer des substitutions adaptées à ses allergies/contraintes
- Suggérer des alternatives si un équipement lui manque
- Adapter tes conseils à son niveau de difficulté préféré

Ne mentionne pas explicitement que tu connais ces préférences, intègre-les naturellement.`;

const EXTRACT_RECIPE_TOOL = {
  type: "function",
  function: {
    name: "extract_modified_recipe",
    description: "Extrait la recette modifiée complète pour l'enregistrer.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        servings: { type: "number" },
        ingredients: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" }, category: { type: "string" } }, required: ["name", "quantity", "unit"] } },
        steps: { type: "array", items: { type: "object", properties: { order: { type: "number" }, text: { type: "string" } }, required: ["order", "text"] } },
      },
      required: ["title", "servings", "ingredients", "steps"],
    },
  },
};

const CREATE_NEW_RECIPE_TOOL = {
  type: "function",
  function: {
    name: "create_new_recipe",
    description: "Crée une NOUVELLE recette séparée inspirée de la recette actuelle.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        servings: { type: "number" },
        ingredients: { type: "array", items: { type: "object", properties: { name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" }, category: { type: "string" } }, required: ["name", "quantity", "unit"] } },
        steps: { type: "array", items: { type: "object", properties: { order: { type: "number" }, text: { type: "string" } }, required: ["order", "text"] } },
        relation_to_original: { type: "string" },
      },
      required: ["title", "servings", "ingredients", "steps"],
    },
  },
};

function formatPreferencesContext(prefs: any): string {
  if (!prefs) return "";
  const sections: string[] = [];
  const equipment = prefs.kitchen_equipment || {};
  if (equipment.unavailable?.length > 0) sections.push(`Équipement non disponible : ${equipment.unavailable.join(", ")}`);
  const diet = prefs.dietary_constraints || {};
  if (diet.allergies?.length > 0) sections.push(`⚠️ ALLERGIES : ${diet.allergies.join(", ")}`);
  if (diet.diets?.length > 0) sections.push(`Régime : ${diet.diets.join(", ")}`);
  if (diet.restrictions?.length > 0) sections.push(`Restrictions : ${diet.restrictions.join(", ")}`);
  const style = prefs.culinary_style || {};
  if (style.preferred_difficulty) sections.push(`Niveau culinaire : ${style.preferred_difficulty}`);
  if (sections.length === 0) return "";
  return `\n\n--- PROFIL UTILISATEUR ---\n${sections.join("\n")}\n--- FIN PROFIL ---`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized", message: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      return new Response(JSON.stringify({ error: "unauthorized", message: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.claims.sub as string;
    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: "validation_error", message: parseResult.error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { messages, recipeContext, mode } = parseResult.data;
    console.log("Cooking assistant request - mode:", mode, "messages:", messages.length, "user:", userId);

    const aiSettings = await getUserAISettings(supabaseClient, userId);
    console.log("AI provider:", aiSettings.provider);

    const basePrompt = mode === "editing" ? EDITING_SYSTEM_PROMPT : COOKING_SYSTEM_PROMPT;
    let contextMessage = basePrompt;

    const { data: prefs } = await supabaseClient.from("user_culinary_preferences").select("*").eq("user_id", userId).single();
    const prefsContext = formatPreferencesContext(prefs);
    if (prefsContext) {
      contextMessage += PERSONALIZATION_INSTRUCTION + prefsContext;
    }

    if (recipeContext) {
      contextMessage += `\n\n--- RECETTE ${mode === "editing" ? "À MODIFIER" : "EN COURS"} ---\n`;
      contextMessage += `Titre : ${recipeContext.title}\n`;
      if (recipeContext.servings) contextMessage += `Portions : ${recipeContext.servings}\n`;
      if (recipeContext.season) contextMessage += `Saison : ${recipeContext.season}\n`;
      if (recipeContext.ingredients?.length) {
        contextMessage += `\nIngrédients :\n`;
        for (const ing of recipeContext.ingredients) {
          contextMessage += `- ${ing.quantity} ${ing.unit} ${ing.name}${ing.category ? ` (${ing.category})` : ""}\n`;
        }
      }
      if (recipeContext.steps?.length) {
        contextMessage += `\nÉtapes :\n`;
        const sortedSteps = [...recipeContext.steps].sort((a, b) => a.order - b.order);
        for (const step of sortedSteps) {
          if (mode === "cooking") {
            const status = step.completed ? "✓" : "○";
            contextMessage += `${status} ${step.order}. ${step.text}\n`;
          } else {
            contextMessage += `${step.order}. ${step.text}\n`;
          }
        }
        if (mode === "cooking" && recipeContext.completedStepsCount !== undefined) {
          contextMessage += `\nProgression : ${recipeContext.completedStepsCount}/${recipeContext.totalSteps} étapes terminées`;
        }
      }
      contextMessage += `\n--- FIN DE LA RECETTE ---`;
    }

    const tools = mode === "editing" ? [EXTRACT_RECIPE_TOOL, CREATE_NEW_RECIPE_TOOL] : undefined;

    const response = await callAI(aiSettings, [{ role: "system", content: contextMessage }, ...messages], { tools, stream: true });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      if (response.status === 429) return new Response(JSON.stringify({ error: "rate_limit", message: "Trop de requêtes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "payment_required", message: "Crédits IA épuisés." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "ai_error", message: "Erreur du service IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
  } catch (error) {
    console.error("Cooking assistant error:", error);
    return new Response(JSON.stringify({ error: "server_error", message: error instanceof Error ? error.message : "Erreur inconnue" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
