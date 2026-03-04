import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveAIConfig } from "../_shared/ai-config.ts";
import { callAIStreaming } from "../_shared/ai-providers.ts";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(10000, "Message content too long"),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema).max(50, "Too many messages"),
  currentPreferences: z.any().optional(),
  isContinuation: z.boolean().optional().default(false),
});

// ===== MEMORY MODE PROMPT =====
const MEMORY_PROMPT = `Tu es l'assistant mémoire de Grimoire. Tu gères les connaissances culinaires de l'utilisateur.

## TON RÔLE
Tu aides l'utilisateur à :
- Consulter ce que tu connais de lui (préférences, allergies, équipement...)
- Ajouter de nouvelles préférences
- Supprimer des préférences existantes
- Corriger des informations

## TON STYLE
- Direct et clair
- Tu tutoies l'utilisateur
- Pas d'emojis
- Réponses structurées et lisibles

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
Quand l'utilisateur demande ce que tu sais de lui, utilise get_preferences puis formate clairement par catégorie.

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

Style : direct, efficace, pas d'emojis. Tu tutoies.`;

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
  if (tasteParts.length > 0) sections.push(`GOÛTS\n${tasteParts.join("\n")}`);
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

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
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

    // Resolve AI config with agent_configs support
    const aiConfig = await resolveAIConfig(supabaseClient, userId, {
      agentType: "chat",
      defaultModel: "google/gemini-3-flash-preview",
      requiredCapabilities: ["tools"],
    });
    console.log(`AI: ${aiConfig.provider}/${aiConfig.model}`);

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

    const response = await callAIStreaming(aiConfig, [{ role: "system", content: systemPrompt }, ...messages], { tools, stream: true });

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
