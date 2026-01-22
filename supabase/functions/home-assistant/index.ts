import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema
// Message content can be string or array (for multimodal)
const ContentPartSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string().max(10000),
  }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({
      url: z.string(), // base64 data URL or https URL
    }),
  }),
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
}).optional().nullable();

const RequestSchema = z.object({
  messages: z.array(MessageSchema).max(50, "Too many messages"),
  recipes: z.array(RecipeSchema).optional(),
  mode: z.enum(["orchestration", "creating", "cooking", "editing", "memory"]).default("orchestration"),
  activeRecipe: ActiveRecipeSchema,
  isContinuation: z.boolean().optional().default(false),
});

// ===== ORCHESTRATION MODE PROMPT =====
const ORCHESTRATION_PROMPT = `Tu es Chef, l'assistant culinaire central de cette application. Tu orchestres toutes les interactions.

## TON STYLE
- Chaleureux, enthousiaste et professionnel
- Tu tutoies l'utilisateur
- Réponses concises mais utiles

## ANALYSE D'IMAGES
Si l'utilisateur envoie une image de nourriture ou d'ingrédients :
- Identifie ce que tu vois (plat, ingrédients, état de cuisson, etc.)
- Propose des actions pertinentes : reproduire le plat, identifier les ingrédients, suggérer une recette
- Si c'est une photo d'un plat : propose de créer la recette correspondante
- Si c'est une photo d'ingrédients : propose des recettes possibles avec ces ingrédients

## DÉTECTION D'INTENTION
Analyse chaque message pour déterminer l'intention :

1. **RECHERCHE** : "cherche", "trouve", "j'ai quoi comme", "montre-moi", "une recette de"
   → Utilise search_recipes

2. **CRÉATION** : "crée", "invente", "nouvelle recette", "j'aimerais faire", "une idée de"
   → Utilise start_recipe_creation

3. **CUISINE** : "je vais cuisiner", "on fait", "guide-moi", "c'est parti pour", "je cuisine"
   → Utilise start_cooking (après avoir identifié la recette)

4. **MODIFICATION** : "adapte", "modifie", "version végétarienne", "sans gluten", "change"
   → Utilise start_editing (après avoir identifié la recette)

5. **NAVIGATION** : "mes recettes", "profil", "tableau de bord"
   → Utilise navigate

6. **MÉMOIRE** : "qu'est-ce que tu sais de moi", "mes préférences", "mes allergies", "mon équipement", "modifie ma mémoire", "je suis allergique", "j'ai un nouveau", "ajoute à mes préférences", "retire de mes allergies"
   → Utilise start_memory

## WORKFLOW TYPIQUE

1. L'utilisateur cherche une recette → Tu présentes les résultats
2. Il choisit une recette → Tu proposes : "Tu veux la cuisiner ou la modifier ?"
3. Selon sa réponse → Tu appelles start_cooking ou start_editing

## EXEMPLES DE CONVERSATIONS

### Recherche puis action
User: "J'ai quoi comme recettes de poulet ?"
[APPEL search_recipes avec query="poulet"]
→ "J'ai trouvé 3 recettes : 1. Poulet rôti ✅ 2. Curry de poulet 📝 3. Poulet basquaise 🧪. Laquelle t'intéresse ?"
User: "Le curry, je vais le faire"
[APPEL start_cooking avec recipe_id et title]

### Création directe
User: "Je voudrais créer une tarte aux pommes"
[APPEL start_recipe_creation avec initial_idea="tarte aux pommes"]

### Modification
User: "J'aimerais adapter mon gratin pour qu'il soit végétarien"
[APPEL search_recipes si nécessaire, puis start_editing]

## RÈGLES IMPORTANTES
1. Utilise search_recipes d'abord pour trouver les recettes
2. Ne propose start_cooking ou start_editing qu'APRÈS avoir identifié la recette
3. Pour les créations, passe directement à start_recipe_creation
4. Sois proactif : propose toujours une action après avoir répondu`;

// ===== CREATING MODE PROMPT =====
const CREATING_PROMPT = `Tu es Chef, un chef cuisinier français passionné avec 20 ans d'expérience. Tu aides l'utilisateur à construire sa recette idéale.

## TON RÔLE
Tu guides l'utilisateur de l'idée à la recette finale, puis tu enregistres avec save_recipe.

## COMPORTEMENT
1. DÉCOUVERTE (1-2 échanges max) : Pose UNE question à la fois pour comprendre l'envie
2. PROPOSITION : Propose une recette avec titre, ingrédients principaux et grandes lignes
3. AFFINAGE : Ajuste selon les retours (portions, variantes, substitutions)
4. VALIDATION : Dès que l'utilisateur approuve → appelle save_recipe IMMÉDIATEMENT

## DÉCLENCHEMENT save_recipe - TRÈS IMPORTANT
Appelle save_recipe OBLIGATOIREMENT quand l'utilisateur dit :
- "ok", "parfait", "super", "génial", "excellent", "top", "nickel"
- "on fait ça", "c'est bon", "ça me va", "j'adore", "validé"
- "enregistre", "sauvegarde", "garde cette recette"
- Toute validation enthousiaste ou approbation claire

NE PAS ATTENDRE de confirmation supplémentaire. Dès la première validation → save_recipe.

## FORMAT INGRÉDIENTS
Catégories : "Légumes", "Viandes", "Poissons", "Épices", "Produits laitiers", "Féculents", "Fruits", "Condiments", "Huiles", "Autres"
Quantité et unité séparées : quantity="200", unit="g" (jamais "200g")

## EXEMPLE
User: "Je voudrais faire une quiche"
Assistant: "Une quiche, excellent ! Classique lorraine ou version légumes comme poireaux-chèvre ? Pour combien ?"
User: "Lorraine pour 4"
Assistant: "Voici ma quiche lorraine crémeuse pour 4 : pâte brisée, 200g lardons, 3 œufs, 20cl crème, muscade. 35-40 min à 180°C. Elle te plaît ?"
User: "Super !"
[→ APPEL save_recipe IMMÉDIAT]

Ton : chaleureux, enthousiaste, naturel. Tu tutoies.`;

// ===== COOKING MODE PROMPT =====
const COOKING_PROMPT = `Tu es Chef, un assistant culinaire qui guide l'utilisateur dans la réalisation d'une recette.

## TON RÔLE
- Guide l'utilisateur étape par étape
- Adapte les quantités si changement de portions
- Suggère des substitutions d'ingrédients
- Explique les techniques de cuisine
- Réponds aux questions sur temps de cuisson, textures, etc.
- Donne des conseils et astuces de chef

## RÈGLES
- Tu ne crées pas de nouvelle recette, tu aides à réaliser celle en contexte
- Sois encourageant et bienveillant
- Anticipe les difficultés potentielles

## QUAND SAUVEGARDER
Si l'utilisateur fait des modifications qu'il veut garder, utilise save_cooking_notes pour enregistrer les notes de cette session.

Ton : chaleureux, encourageant, expert culinaire français.`;

// ===== EDITING MODE PROMPT =====
const EDITING_PROMPT = `Tu es Chef, un chef cuisinier français passionné. Tu aides l'utilisateur à MODIFIER une recette existante ou CRÉER une nouvelle recette inspirée.

## TON RÔLE
- Adapter la recette (végétarien, sans gluten, moins calorique...)
- Suggérer des substitutions créatives
- Proposer des améliorations de techniques
- Ajuster les quantités
- CRÉER de nouvelles recettes inspirées de l'originale

## QUAND MODIFIER LA RECETTE (extract_modified_recipe)
Appelle extract_modified_recipe quand l'utilisateur valide une MODIFICATION :
- "ok", "parfait", "super", "enregistre", "sauvegarde", "applique"

## QUAND CRÉER UNE NOUVELLE RECETTE (create_new_recipe)
Appelle create_new_recipe quand l'utilisateur veut :
- Une version avec une AUTRE protéine ("et avec du poulet ?")
- Réutiliser des RESTES dans un AUTRE plat
- Une recette COMPLÈTEMENT DIFFÉRENTE inspirée

## EXEMPLE MODIFICATION
User: "Je voudrais une version végétarienne"
Assistant: "Pour ta quiche végétarienne, je remplace les lardons par 200g champignons dorés + 1 c.à.c paprika fumé. Je sauvegarde ?"
User: "Super !"
[→ APPEL extract_modified_recipe IMMÉDIAT]

## EXEMPLE NOUVELLE RECETTE
User: "Et si je faisais pareil mais avec du poulet ?"
Assistant: "Je te propose un Coq au Vin ! Mêmes techniques, mais cuisses de poulet et cuisson 1h30. Je crée cette nouvelle recette ?"
User: "Oui !"
[→ APPEL create_new_recipe]

Ton : créatif, expert culinaire, bienveillant.`;

// ===== ORCHESTRATION TOOLS =====
const SEARCH_RECIPES_TOOL = {
  type: "function",
  function: {
    name: "search_recipes",
    description: "Recherche des recettes dans le livre de l'utilisateur.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Terme de recherche" },
        status_filter: { type: "string", enum: ["all", "draft", "tested", "validated", "archived"] },
        favorites_only: { type: "boolean" }
      },
      required: ["query"]
    }
  }
};

const START_COOKING_TOOL = {
  type: "function",
  function: {
    name: "start_cooking",
    description: "Démarre le guidage pour cuisiner une recette. L'utilisateur veut réaliser une recette.",
    parameters: {
      type: "object",
      properties: {
        recipe_id: { type: "string", description: "L'ID de la recette à cuisiner" },
        recipe_title: { type: "string", description: "Le titre de la recette" }
      },
      required: ["recipe_id", "recipe_title"]
    }
  }
};

const START_EDITING_TOOL = {
  type: "function",
  function: {
    name: "start_editing",
    description: "Démarre la modification d'une recette existante.",
    parameters: {
      type: "object",
      properties: {
        recipe_id: { type: "string", description: "L'ID de la recette à modifier" },
        recipe_title: { type: "string", description: "Le titre de la recette" },
        modification_request: { type: "string", description: "Ce que l'utilisateur veut modifier" }
      },
      required: ["recipe_id", "recipe_title"]
    }
  }
};

const START_RECIPE_CREATION_TOOL = {
  type: "function",
  function: {
    name: "start_recipe_creation",
    description: "Démarre une conversation de création de recette. L'utilisateur veut créer une nouvelle recette.",
    parameters: {
      type: "object",
      properties: {
        initial_idea: { type: "string", description: "L'idée initiale de l'utilisateur" }
      },
      required: ["initial_idea"]
    }
  }
};

const NAVIGATE_TOOL = {
  type: "function",
  function: {
    name: "navigate",
    description: "Navigue vers une page de l'application",
    parameters: {
      type: "object",
      properties: {
        destination: { type: "string", enum: ["dashboard", "new_recipe", "profile"] }
      },
      required: ["destination"]
    }
  }
};

const OPEN_RECIPE_TOOL = {
  type: "function",
  function: {
    name: "open_recipe",
    description: "Ouvre une recette spécifique pour la consulter.",
    parameters: {
      type: "object",
      properties: {
        recipe_id: { type: "string" },
        recipe_title: { type: "string" }
      },
      required: ["recipe_id", "recipe_title"]
    }
  }
};

const START_MEMORY_TOOL = {
  type: "function",
  function: {
    name: "start_memory",
    description: "Ouvre l'assistant mémoire pour consulter ou modifier les préférences culinaires de l'utilisateur (goûts, allergies, équipement, style culinaire).",
    parameters: { type: "object", properties: {} }
  }
};

const BACK_TO_ORCHESTRATION_TOOL = {
  type: "function",
  function: {
    name: "back_to_orchestration",
    description: "Retourne au mode orchestration. Utiliser quand l'utilisateur veut changer de sujet ou faire autre chose.",
    parameters: { type: "object", properties: {} }
  }
};

// ===== CREATING MODE TOOLS =====
const SAVE_RECIPE_TOOL = {
  type: "function",
  function: {
    name: "save_recipe",
    description: "Enregistre la recette créée. APPELER IMMÉDIATEMENT quand l'utilisateur valide.",
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
              category: { type: "string" }
            },
            required: ["name", "quantity", "unit", "category"]
          }
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              order: { type: "number" },
              text: { type: "string" }
            },
            required: ["order", "text"]
          }
        }
      },
      required: ["title", "servings", "ingredients", "steps"]
    }
  }
};

// ===== EDITING MODE TOOLS =====
const EXTRACT_MODIFIED_RECIPE_TOOL = {
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
              category: { type: "string" }
            },
            required: ["name", "quantity", "unit"]
          }
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              order: { type: "number" },
              text: { type: "string" }
            },
            required: ["order", "text"]
          }
        }
      },
      required: ["title", "servings", "ingredients", "steps"]
    }
  }
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
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              category: { type: "string" }
            },
            required: ["name", "quantity", "unit"]
          }
        },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              order: { type: "number" },
              text: { type: "string" }
            },
            required: ["order", "text"]
          }
        },
        relation_to_original: { type: "string" }
      },
      required: ["title", "servings", "ingredients", "steps"]
    }
  }
};

// Format user preferences for context
function formatPreferencesContext(prefs: any): string {
  if (!prefs) return "";
  const sections: string[] = [];

  const taste = prefs.taste_preferences || {};
  if (taste.disliked_ingredients?.length > 0) {
    sections.push(`Ingrédients évités : ${taste.disliked_ingredients.join(", ")}`);
  }

  const diet = prefs.dietary_constraints || {};
  if (diet.allergies?.length > 0) {
    sections.push(`⚠️ ALLERGIES : ${diet.allergies.join(", ")}`);
  }
  if (diet.diets?.length > 0) {
    sections.push(`Régime : ${diet.diets.join(", ")}`);
  }

  const equipment = prefs.kitchen_equipment || {};
  if (equipment.unavailable?.length > 0) {
    sections.push(`Équipement non disponible : ${equipment.unavailable.join(", ")}`);
  }

  if (sections.length === 0) return "";
  return `\n\n--- PROFIL UTILISATEUR ---\n${sections.join("\n")}\n--- FIN PROFIL ---`;
}

// Format active recipe context
function formatRecipeContext(recipe: any, mode: string): string {
  if (!recipe) return "";

  let context = `\n\n--- RECETTE ${mode === "editing" ? "À MODIFIER" : "EN COURS"} ---\n`;
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
    const sortedSteps = [...recipe.steps].sort((a: any, b: any) => a.order - b.order);
    for (const step of sortedSteps) {
      if (mode === "cooking") {
        const status = step.completed ? "✓" : "○";
        context += `${status} ${step.order}. ${step.text}\n`;
      } else {
        context += `${step.order}. ${step.text}\n`;
      }
    }
  }

  context += `--- FIN DE LA RECETTE ---`;
  return context;
}

// Get tools based on mode
function getToolsForMode(mode: string) {
  switch (mode) {
    case "orchestration":
      return [
        SEARCH_RECIPES_TOOL,
        START_COOKING_TOOL,
        START_EDITING_TOOL,
        START_RECIPE_CREATION_TOOL,
        NAVIGATE_TOOL,
        OPEN_RECIPE_TOOL,
        START_MEMORY_TOOL,
      ];
    case "creating":
      return [SAVE_RECIPE_TOOL, BACK_TO_ORCHESTRATION_TOOL];
    case "cooking":
      return [BACK_TO_ORCHESTRATION_TOOL];
    case "editing":
      return [EXTRACT_MODIFIED_RECIPE_TOOL, CREATE_NEW_RECIPE_TOOL, BACK_TO_ORCHESTRATION_TOOL];
    case "memory":
      return [BACK_TO_ORCHESTRATION_TOOL];
    default:
      return [];
  }
}

// Get system prompt based on mode
function getSystemPromptForMode(mode: string): string {
  switch (mode) {
    case "orchestration":
      return ORCHESTRATION_PROMPT;
    case "creating":
      return CREATING_PROMPT;
    case "cooking":
      return COOKING_PROMPT;
    case "editing":
      return EDITING_PROMPT;
    default:
      return ORCHESTRATION_PROMPT;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    // Verify JWT and get user
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

    const userId = claimsData.claims.sub;

    // Validate input
    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: parseResult.error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, recipes, mode, activeRecipe, isContinuation } = parseResult.data;

    console.log("Home assistant - mode:", mode, "messages:", messages.length, "user:", userId, "continuation:", isContinuation);
    if (activeRecipe) console.log("Active recipe:", activeRecipe.title);

    // Build system prompt
    let systemPrompt = getSystemPromptForMode(mode);

    // Add continuation instruction if this is after a mode switch
    if (isContinuation) {
      const continuationInstructions: Record<string, string> = {
        creating: `\n\n## MODE CONTINUATION
Tu viens d'être activé pour aider l'utilisateur à créer une recette. Son idée initiale est dans le message. 
COMMENCE IMMÉDIATEMENT par répondre à son idée avec enthousiasme et pose une première question pour affiner (type de cuisine, portions, préférences...).
NE MENTIONNE PAS le changement de mode, réponds naturellement comme si la conversation continuait.`,
        cooking: `\n\n## MODE CONTINUATION
Tu viens d'être activé pour guider l'utilisateur dans la réalisation d'une recette. 
COMMENCE IMMÉDIATEMENT par saluer chaleureusement et présenter rapidement la recette (titre, portions, temps estimé).
Puis demande si l'utilisateur est prêt à commencer ou s'il a des questions.
NE MENTIONNE PAS le changement de mode.`,
        editing: `\n\n## MODE CONTINUATION
Tu viens d'être activé pour modifier une recette existante. La demande de modification est dans le message.
COMMENCE IMMÉDIATEMENT par analyser la demande et proposer des modifications concrètes.
NE MENTIONNE PAS le changement de mode, réponds naturellement.`,
      };
      systemPrompt += continuationInstructions[mode] || "";
    }

    // Fetch user preferences
    const { data: prefs } = await supabaseClient
      .from("user_culinary_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    const prefsContext = formatPreferencesContext(prefs);
    if (prefsContext) {
      systemPrompt += prefsContext;
    }

    // Add recipes context for orchestration mode
    if (mode === "orchestration" && recipes && recipes.length > 0) {
      systemPrompt += `\n\n## RECETTES DE L'UTILISATEUR (${recipes.length} recettes)\n`;
      systemPrompt += recipes.map((r) =>
        `- ID: ${r.id} | "${r.title}" | Statut: ${r.status}${r.is_favorite ? " ⭐" : ""}`
      ).join("\n");
    }

    // Add active recipe context for cooking/editing modes
    if ((mode === "cooking" || mode === "editing") && activeRecipe) {
      systemPrompt += formatRecipeContext(activeRecipe, mode);
    }

    // Get tools for current mode
    const tools = getToolsForMode(mode);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools: tools.length > 0 ? tools : undefined,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans un moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits épuisés." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erreur du service IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
