import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveAIConfig } from "../_shared/ai-config.ts";
import { callAIStreaming } from "../_shared/ai-providers.ts";

// Input validation schema
const ContentPartSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string().max(10000) }),
  z.object({ type: z.literal("image_url"), image_url: z.object({ url: z.string() }) }),
]);

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.union([
    z.string().max(10000, "Message content too long"),
    z.array(ContentPartSchema),
  ]),
});

const RecipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  is_favorite: z.boolean().optional(),
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

const ActiveRecipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  servings: z.number().optional().nullable(),
  season: z.string().optional().nullable(),
  ingredients: z.array(IngredientSchema).optional(),
  steps: z.array(StepSchema).optional(),
  completedSteps: z.array(z.number()).optional(),
}).optional().nullable();

const RequestSchema = z.object({
  messages: z.array(MessageSchema).max(50, "Too many messages"),
  recipes: z.array(RecipeSchema).optional(),
  activeRecipe: ActiveRecipeSchema,
});

// ===== UNIFIED SYSTEM PROMPT =====
const UNIFIED_PROMPT = `Tu es Chef, l'assistant culinaire de cette application. Tu gères toutes les interactions culinaires dans une seule conversation.

## TON STYLE
- Direct et efficace, sans bavardage inutile
- Tu tutoies l'utilisateur
- Pas d'emojis
- Réponses claires avec des explications quand c'est pertinent

## TES COMPÉTENCES (SKILLS)

### Skill : Recherche & Navigation
- Cherche des recettes dans le livre de l'utilisateur avec search_recipes
- Charge le contenu complet d'une recette (ingrédients, étapes) avec get_recipe_details AVANT de répondre à toute question qui nécessite de connaître les ingrédients ou les étapes
- Ouvre une recette spécifique avec open_recipe
- Navigue vers le dashboard ou le profil avec navigate

### Skill : Création de recette
Quand l'utilisateur veut créer une nouvelle recette :
1. DÉCOUVERTE (1-2 échanges max) : Pose UNE question à la fois pour comprendre l'envie
2. PROPOSITION : Propose une recette avec titre, ingrédients principaux et grandes lignes
3. AFFINAGE : Ajuste selon les retours
4. VALIDATION : Dès que l'utilisateur approuve → appelle save_recipe IMMÉDIATEMENT

Appelle save_recipe quand l'utilisateur dit "ok", "parfait", "super", "génial", "c'est bon", "ça me va", "enregistre", etc.
NE PAS ATTENDRE de confirmation supplémentaire.

Format ingrédients : Catégories parmi "Légumes", "Viandes", "Poissons", "Épices", "Produits laitiers", "Féculents", "Fruits", "Condiments", "Huiles", "Autres". Quantité et unité séparées.

### Skill : Guidage cuisine
Quand l'utilisateur veut cuisiner une recette (qui est en contexte) :
- Guide étape par étape
- Adapte les quantités si changement de portions
- Suggère des substitutions d'ingrédients
- Explique les techniques de cuisine
- Anticipe les erreurs courantes

### Skill : Modification de recette
Quand l'utilisateur veut modifier une recette existante (en contexte) :
- Adapter (végétarien, sans gluten, moins calorique...)
- Suggérer des substitutions
- Ajuster les quantités

Utilise extract_modified_recipe quand l'utilisateur valide une MODIFICATION de la recette en contexte.
Utilise create_new_recipe quand l'utilisateur veut une recette COMPLÈTEMENT DIFFÉRENTE inspirée de l'originale.

### Skill : Profil & Préférences
Quand l'utilisateur parle de ses préférences, allergies, équipement, style culinaire :
- Utilise get_preferences pour consulter
- Utilise update_preferences pour modifier

### Skill : Analyse d'images
Si l'utilisateur envoie une image :
- Identifie ce que tu vois (plat, ingrédients, état de cuisson)
- Propose des actions pertinentes : reproduire le plat, identifier les ingrédients, suggérer une recette

### Skill : Planification de repas
Quand l'utilisateur veut planifier ses repas de la semaine :
- Utilise save_meal_plan pour enregistrer un planning complet
- Propose un mix de recettes existantes du livre et de nouvelles idées
- Respecte les préférences, allergies et l'équipement disponible
- Varie les types de cuisine et les protéines sur la semaine
- Adapte les suggestions à la saison
- Le planning couvre 7 jours (lundi=0 à dimanche=6) avec petit-déjeuner, déjeuner et dîner
- Pour les recettes existantes, utilise leur recipe_id. Pour les nouvelles idées, mets custom_meal avec le nom du plat.
- Quand l'utilisateur valide le planning, appelle save_meal_plan IMMÉDIATEMENT

## RÈGLES IMPORTANTES
1. Ne mentionne JAMAIS les éléments du profil utilisateur (allergies, préférences, équipement) sauf si l'utilisateur te le demande explicitement. Respecte-les silencieusement.
2. Propose toujours une action après avoir répondu.
3. N'hésite pas à utiliser tes outils directement sans demander confirmation quand l'intention est claire.`;

// ===== ALL TOOLS =====
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_recipe_details",
      description: "Charge le contenu complet d'une recette (ingrédients + étapes) pour pouvoir répondre à des questions précises sur cette recette. À utiliser AVANT de répondre à toute question impliquant les ingrédients ou la préparation d'une recette identifiée.",
      parameters: {
        type: "object",
        properties: {
          recipe_id: { type: "string", description: "L'ID de la recette à charger" },
          recipe_title: { type: "string", description: "Le titre de la recette (pour confirmation)" },
        },
        required: ["recipe_id", "recipe_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_recipes",
      description: "Recherche des recettes dans le livre de l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Terme de recherche" },
          status_filter: { type: "string", enum: ["all", "draft", "tested", "validated", "archived"] },
          favorites_only: { type: "boolean" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_recipe",
      description: "Ouvre une recette spécifique pour la consulter.",
      parameters: {
        type: "object",
        properties: {
          recipe_id: { type: "string" },
          recipe_title: { type: "string" },
        },
        required: ["recipe_id", "recipe_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Navigue vers une page de l'application",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string", enum: ["dashboard", "new_recipe", "profile", "meal_planning"] },
        },
        required: ["destination"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_recipe",
      description: "Enregistre une nouvelle recette. APPELER IMMÉDIATEMENT quand l'utilisateur valide.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          servings: { type: "number" },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: "string" },
                unit: { type: "string" },
                category: { type: "string" },
              },
              required: ["name", "quantity", "unit", "category"],
            },
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                order: { type: "number" },
                text: { type: "string" },
              },
              required: ["order", "text"],
            },
          },
        },
        required: ["title", "servings", "ingredients", "steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_modified_recipe",
      description: "Enregistre les modifications de la recette actuelle.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          servings: { type: "number" },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string" },
                category: { type: "string" },
              },
              required: ["name", "quantity", "unit"],
            },
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                order: { type: "number" },
                text: { type: "string" },
              },
              required: ["order", "text"],
            },
          },
        },
        required: ["title", "servings", "ingredients", "steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_new_recipe",
      description: "Crée une NOUVELLE recette séparée inspirée de la recette actuelle.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          servings: { type: "number" },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string" },
                category: { type: "string" },
              },
              required: ["name", "quantity", "unit"],
            },
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                order: { type: "number" },
                text: { type: "string" },
              },
              required: ["order", "text"],
            },
          },
          relation_to_original: { type: "string" },
        },
        required: ["title", "servings", "ingredients", "steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_preferences",
      description: "Récupère les préférences culinaires actuelles de l'utilisateur.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
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
                field: { type: "string", description: "Le champ à modifier (ex: liked_flavors, disliked_ingredients, special_ingredients, available, favorite_cuisines, allergies, diets, etc.)" },
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
  },
  {
    type: "function",
    function: {
      name: "save_meal_plan",
      description: "Enregistre un planning de repas hebdomadaire. Appeler quand l'utilisateur valide le planning proposé.",
      parameters: {
        type: "object",
        properties: {
          week_start: { type: "string", description: "Date du lundi de la semaine au format YYYY-MM-DD" },
          meals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day_of_week: { type: "number", description: "Jour de la semaine (0=lundi, 6=dimanche)" },
                meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner"] },
                recipe_id: { type: "string", description: "ID d'une recette existante (si applicable)" },
                custom_meal: { type: "string", description: "Nom du plat si pas de recette existante" },
                notes: { type: "string", description: "Notes ou précisions optionnelles" },
              },
              required: ["day_of_week", "meal_type"],
            },
          },
        },
        required: ["week_start", "meals"],
      },
    },
  },
];

const SUGGESTIONS_INSTRUCTION = `

## SUGGESTIONS CONTEXTUELLES
A la FIN de CHAQUE reponse, ajoute exactement 3 suggestions contextuelles.
Format OBLIGATOIRE (une seule ligne, toute fin de reponse) :
[suggestions]["Suggestion 1","Suggestion 2","Suggestion 3"][/suggestions]

Regles :
- Max 5 mots par suggestion, ton direct et neutre
- Pertinentes par rapport a ta derniere reponse
- Pas d'emojis, pas de points d'exclamation
- Formulations sobres et fonctionnelles

Exemples :
- Apres une recette proposee : [suggestions]["Enregistrer cette recette","Version sans gluten","Adapter pour 6"][/suggestions]
- Apres une recherche : [suggestions]["Cuisiner la premiere","Voir le detail","Autre recherche"][/suggestions]
- Apres un conseil : [suggestions]["Etape suivante","Temps de cuisson","Conseil texture"][/suggestions]`;

interface UserPreferences {
  taste_preferences?: {
    liked_flavors?: string[];
    disliked_flavors?: string[];
    liked_ingredients?: string[];
    disliked_ingredients?: string[];
    special_ingredients?: string[];
  };
  dietary_constraints?: {
    allergies?: string[];
    diets?: string[];
    restrictions?: string[];
  };
  kitchen_equipment?: {
    available?: string[];
    unavailable?: string[];
  };
  culinary_style?: {
    favorite_cuisines?: string[];
    favorite_techniques?: string[];
    preferred_difficulty?: string;
  };
}

// Format user preferences for context
function formatPreferencesContext(prefs: UserPreferences | null | undefined): string {
  if (!prefs) return "";
  const sections: string[] = [];

  const taste = prefs.taste_preferences || {};
  if (taste.liked_flavors?.length > 0) sections.push(`Saveurs aimées : ${taste.liked_flavors.join(", ")}`);
  if (taste.disliked_flavors?.length > 0) sections.push(`Saveurs évitées : ${taste.disliked_flavors.join(", ")}`);
  if (taste.liked_ingredients?.length > 0) sections.push(`Ingrédients favoris : ${taste.liked_ingredients.join(", ")}`);
  if (taste.disliked_ingredients?.length > 0) sections.push(`Ingrédients évités : ${taste.disliked_ingredients.join(", ")}`);
  if (taste.special_ingredients?.length > 0) sections.push(`Aliments particuliers : ${taste.special_ingredients.join(", ")}`);

  const diet = prefs.dietary_constraints || {};
  if (diet.allergies?.length > 0) sections.push(`ALLERGIES : ${diet.allergies.join(", ")}`);
  if (diet.diets?.length > 0) sections.push(`Régime : ${diet.diets.join(", ")}`);
  if (diet.restrictions?.length > 0) sections.push(`Restrictions : ${diet.restrictions.join(", ")}`);

  const equipment = prefs.kitchen_equipment || {};
  if (equipment.available?.length > 0) sections.push(`Équipement disponible : ${equipment.available.join(", ")}`);
  if (equipment.unavailable?.length > 0) sections.push(`Équipement non disponible : ${equipment.unavailable.join(", ")}`);

  const style = prefs.culinary_style || {};
  if (style.favorite_cuisines?.length > 0) sections.push(`Cuisines favorites : ${style.favorite_cuisines.join(", ")}`);
  if (style.favorite_techniques?.length > 0) sections.push(`Techniques : ${style.favorite_techniques.join(", ")}`);
  if (style.preferred_difficulty) sections.push(`Difficulté préférée : ${style.preferred_difficulty}`);

  if (sections.length === 0) return "";
  return `\n\n--- PROFIL UTILISATEUR (USAGE SILENCIEUX) ---
IMPORTANT : Ces informations servent de contexte interne. Tu DOIS les respecter (allergies, restrictions, ingrédients évités) mais tu ne dois PAS les mentionner dans tes réponses sauf si l'utilisateur te pose explicitement la question sur ses préférences ou son profil.
${sections.join("\n")}
--- FIN PROFIL ---`;
}

interface ActiveRecipeContext {
  id: string;
  title: string;
  servings?: number;
  season?: string;
  ingredients?: Array<{ quantity?: string | number; unit?: string; name: string; category?: string }>;
  steps?: Array<{ order: number; text: string; completed?: boolean }>;
  completedSteps?: number[];
}

// Format active recipe context
function formatRecipeContext(recipe: ActiveRecipeContext | null | undefined): string {
  if (!recipe) return "";

  let context = `\n\n--- RECETTE EN CONTEXTE ---\n`;
  context += `ID: ${recipe.id}\n`;
  context += `Titre : ${recipe.title}\n`;
  if (recipe.servings) context += `Portions : ${recipe.servings}\n`;
  if (recipe.season) context += `Saison : ${recipe.season}\n`;

  if (recipe.ingredients?.length > 0) {
    context += `\nIngrédients :\n`;
    for (const ing of recipe.ingredients) {
      const qty = ing.quantity ?? "";
      const unit = ing.unit ?? "";
      context += `- ${qty} ${unit} ${ing.name}${ing.category ? ` (${ing.category})` : ""}\n`;
    }
  }

  if (recipe.steps?.length > 0) {
    context += `\nÉtapes :\n`;
    const sortedSteps = [...recipe.steps].sort((a, b) => a.order - b.order);
    const completedSet = new Set(recipe.completedSteps || []);
    for (const step of sortedSteps) {
      const isDone = step.completed || completedSet.has(step.order);
      const status = isDone ? "✓" : "○";
      context += `${status} ${step.order}. ${step.text}\n`;
    }
    if (completedSet.size > 0) {
      context += `\nProgression : ${completedSet.size}/${sortedSteps.length} étapes complétées\n`;
    }
  }

  context += `--- FIN DE LA RECETTE ---`;
  return context;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Missing required environment variables");

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;
    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: parseResult.error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, recipes, activeRecipe } = parseResult.data;
    console.log("Home assistant (unified) - messages:", messages.length, "user:", userId);
    if (activeRecipe) console.log("Active recipe:", activeRecipe.title);

    const aiConfig = await resolveAIConfig(supabaseClient, userId, {
      agentType: "chat",
      defaultModel: "claude-sonnet-4-6",
      requiredCapabilities: ["tools"],
    });
    console.log(`AI: ${aiConfig.provider}/${aiConfig.model}`);

    // Build unified system prompt
    let systemPrompt = UNIFIED_PROMPT + SUGGESTIONS_INSTRUCTION;

    // Fetch and add user preferences
    const { data: prefs } = await supabaseClient
      .from("user_culinary_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    systemPrompt += formatPreferencesContext(prefs);

    // Add recipes list
    if (recipes && recipes.length > 0) {
      systemPrompt += `\n\n## RECETTES DE L'UTILISATEUR (${recipes.length} recettes)\n`;
      systemPrompt += recipes.map((r) =>
        `- ID: ${r.id} | "${r.title}" | Statut: ${r.status}${r.is_favorite ? " ⭐" : ""}`
      ).join("\n");
    }

    // Add active recipe context
    if (activeRecipe) {
      systemPrompt += formatRecipeContext(activeRecipe);
    }

    const response = await callAIStreaming(aiConfig, [{ role: "system", content: systemPrompt }, ...messages], {
      tools: TOOLS,
      stream: true,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("AI error:", response.status, errorText);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans un instant." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      // Anthropic signale un solde insuffisant par un 400 invalid_request_error « credit balance ».
      if (response.status === 402 || errorText.includes("credit balance")) {
        return new Response(JSON.stringify({ error: "Crédits du fournisseur IA épuisés — recharger le compte API Anthropic (Console → Plans & Billing)." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: `Erreur du service IA (${response.status})` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("home-assistant error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
