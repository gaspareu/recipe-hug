import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(10000, "Message content too long"),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema).max(50, "Too many messages"),
  currentPreferences: z.any().optional(),
  isContinuation: z.boolean().optional().default(false),
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

async function callAI(settings: AISettings, messages: any[], options: { tools?: any[]; stream?: boolean } = {}): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const { provider, preferred_model } = settings;
  const model = preferred_model || DEFAULT_MODELS[provider];
  const apiKey = getApiKeyForProvider(settings, provider);

  if (provider !== "lovable" && !apiKey) {
    console.log(`No API key for provider ${provider}, falling back to Lovable AI`);
    return callLovableAI(LOVABLE_API_KEY!, messages, { ...options, model: DEFAULT_MODELS.lovable });
  }

  switch (provider) {
    case "gemini": return callGeminiAI(apiKey!, model, messages, options);
    case "openai": return callOpenAI(apiKey!, model, messages, options);
    case "anthropic": return callAnthropicAI(apiKey!, model, messages, options);
    default: return callLovableAI(LOVABLE_API_KEY!, messages, { ...options, model });
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
  if (options.stream && response.ok) return transformGeminiStream(response);
  return response;
}

function transformGeminiStream(response: Response): Response {
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
  if (options.stream && response.ok) return transformAnthropicStream(response);
  return response;
}

function transformAnthropicStream(response: Response): Response {
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
            } catch { /* Skip */ }
          }
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

// ===== MEMORY MODE PROMPT =====
const MEMORY_PROMPT = `Tu es Chef, l'assistant mémoire de Grimoire. Tu gères les connaissances culinaires de l'utilisateur.

## TON RÔLE
Tu aides l'utilisateur à :
- Consulter ce que tu connais de lui (préférences, allergies, équipement...)
- Ajouter de nouvelles préférences
- Supprimer des préférences existantes
- Corriger des informations

## TON STYLE
- Chaleureux et bienveillant
- Tu tutoies l'utilisateur
- Réponses concises mais claires
- Tu utilises des emojis pour structurer l'affichage

## STRUCTURE DES PRÉFÉRENCES

### 1. Goûts (taste_preferences)
- liked_flavors : saveurs aimées (sucré, salé, épicé, acide, amer, umami...)
- disliked_flavors : saveurs évitées
- liked_ingredients : ingrédients favoris
- disliked_ingredients : ingrédients évités

### 2. Équipement (kitchen_equipment)
- available : équipement disponible (four, mixeur, robot, wok, plancha, thermomix...)
- unavailable : équipement non disponible

### 3. Style culinaire (culinary_style)
- favorite_cuisines : cuisines préférées (française, italienne, japonaise, mexicaine...)
- favorite_techniques : techniques maîtrisées ou appréciées (cuisson lente, wok, pâtisserie...)
- preferred_difficulty : niveau de difficulté préféré (facile, moyen, difficile)

### 4. Contraintes alimentaires (dietary_constraints)
- allergies : allergies (gluten, lactose, arachides, fruits de mer...)
- diets : régimes (végétarien, vegan, sans porc, halal, casher...)
- restrictions : autres restrictions (faible en sel, diabétique...)

## COMPORTEMENT

### Affichage des préférences
Quand l'utilisateur demande ce que tu sais de lui, utilise get_preferences puis formate joliment.

### Modifications
Quand l'utilisateur veut modifier ses préférences :
1. Confirme ce que tu vas faire
2. Appelle update_preferences avec les modifications
3. Confirme la mise à jour

## DÉCLENCHEMENT DES OUTILS

### update_preferences
Appeler IMMÉDIATEMENT quand l'utilisateur confirme une modification :
- "ok", "oui", "parfait", "c'est bon", "ajoute", "retire", "enlève"
- Toute confirmation claire

Ton : chaleureux, enthousiaste, expert culinaire français.`;

const GET_PREFERENCES_TOOL = {
  type: "function",
  function: {
    name: "get_preferences",
    description: "Récupère les préférences culinaires actuelles de l'utilisateur.",
    parameters: { type: "object", properties: {} },
  },
};

const UPDATE_PREFERENCES_TOOL = {
  type: "function",
  function: {
    name: "update_preferences",
    description: "Met à jour les préférences culinaires de l'utilisateur.",
    parameters: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              operation: { type: "string", enum: ["add", "remove", "set"] },
              category: { type: "string", enum: ["taste_preferences", "kitchen_equipment", "culinary_style", "dietary_constraints"] },
              field: { type: "string" },
              values: { type: "array", items: { type: "string" } },
              value: { type: "string" },
            },
            required: ["operation", "category", "field"],
          },
        },
      },
      required: ["operations"],
    },
  },
};

const BACK_TO_ORCHESTRATION_TOOL = {
  type: "function",
  function: {
    name: "back_to_orchestration",
    description: "Retourne au mode principal.",
    parameters: { type: "object", properties: {} },
  },
};

function formatPreferencesForPrompt(prefs: any): string {
  if (!prefs) return "Aucune préférence enregistrée pour le moment.";
  const sections: string[] = [];
  const taste = prefs.taste_preferences || {};
  const tasteParts: string[] = [];
  if (taste.liked_flavors?.length > 0) tasteParts.push(`Saveurs aimées : ${taste.liked_flavors.join(", ")}`);
  if (taste.disliked_flavors?.length > 0) tasteParts.push(`Saveurs évitées : ${taste.disliked_flavors.join(", ")}`);
  if (taste.liked_ingredients?.length > 0) tasteParts.push(`Ingrédients favoris : ${taste.liked_ingredients.join(", ")}`);
  if (taste.disliked_ingredients?.length > 0) tasteParts.push(`Ingrédients évités : ${taste.disliked_ingredients.join(", ")}`);
  if (tasteParts.length > 0) sections.push(`🧂 GOÛTS\n${tasteParts.join("\n")}`);
  const diet = prefs.dietary_constraints || {};
  const dietParts: string[] = [];
  if (diet.allergies?.length > 0) dietParts.push(`⚠️ Allergies : ${diet.allergies.join(", ")}`);
  if (diet.diets?.length > 0) dietParts.push(`Régimes : ${diet.diets.join(", ")}`);
  if (diet.restrictions?.length > 0) dietParts.push(`Restrictions : ${diet.restrictions.join(", ")}`);
  if (dietParts.length > 0) sections.push(`🚫 CONTRAINTES ALIMENTAIRES\n${dietParts.join("\n")}`);
  const equipment = prefs.kitchen_equipment || {};
  const equipParts: string[] = [];
  if (equipment.available?.length > 0) equipParts.push(`Disponible : ${equipment.available.join(", ")}`);
  if (equipment.unavailable?.length > 0) equipParts.push(`Non disponible : ${equipment.unavailable.join(", ")}`);
  if (equipParts.length > 0) sections.push(`🍳 ÉQUIPEMENT\n${equipParts.join("\n")}`);
  const style = prefs.culinary_style || {};
  const styleParts: string[] = [];
  if (style.favorite_cuisines?.length > 0) styleParts.push(`Cuisines favorites : ${style.favorite_cuisines.join(", ")}`);
  if (style.favorite_techniques?.length > 0) styleParts.push(`Techniques : ${style.favorite_techniques.join(", ")}`);
  if (style.preferred_difficulty) styleParts.push(`Difficulté préférée : ${style.preferred_difficulty}`);
  if (styleParts.length > 0) sections.push(`👨‍🍳 STYLE CULINAIRE\n${styleParts.join("\n")}`);
  if (sections.length === 0) return "Tu n'as pas encore de préférences enregistrées.";
  return sections.join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = claimsData.claims.sub as string;
    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: "validation_error", message: parseResult.error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { messages, currentPreferences, isContinuation } = parseResult.data;
    console.log("Memory assistant - messages:", messages.length, "user:", userId);

    const aiSettings = await getUserAISettings(supabaseClient, userId);
    console.log("AI provider:", aiSettings.provider);

    let systemPrompt = MEMORY_PROMPT;
    if (currentPreferences) {
      systemPrompt += `\n\n--- PRÉFÉRENCES ACTUELLES ---\n${formatPreferencesForPrompt(currentPreferences)}\n--- FIN PRÉFÉRENCES ---`;
    }
    if (isContinuation) {
      systemPrompt += `\n\n## MODE CONTINUATION
Tu viens d'être activé pour gérer la mémoire culinaire de l'utilisateur.
COMMENCE IMMÉDIATEMENT par afficher ses préférences actuelles de manière claire et structurée.
NE MENTIONNE PAS le changement de mode.`;
    }

    const tools = [GET_PREFERENCES_TOOL, UPDATE_PREFERENCES_TOOL, BACK_TO_ORCHESTRATION_TOOL];

    const response = await callAI(aiSettings, [{ role: "system", content: systemPrompt }, ...messages], { tools, stream: true });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Trop de requêtes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Crédits épuisés." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erreur du service IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (error) {
    console.error("memory-assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
