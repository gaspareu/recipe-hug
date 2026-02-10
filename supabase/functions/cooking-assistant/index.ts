import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveAIConfig } from "../_shared/ai-config.ts";
import { callAIStreaming } from "../_shared/ai-providers.ts";

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

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
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

    // Resolve AI config with agent_configs support
    const aiConfig = await resolveAIConfig(supabaseClient, userId, {
      agentType: "chat",
      defaultModel: "google/gemini-3-flash-preview",
      requiredCapabilities: ["tools"],
    });
    console.log(`AI: ${aiConfig.provider}/${aiConfig.model}`);

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

    const response = await callAIStreaming(aiConfig, [{ role: "system", content: contextMessage }, ...messages], { tools, stream: true });

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
