import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveAIConfig } from "../_shared/ai-config.ts";
import { callAIStreaming } from "../_shared/ai-providers.ts";
import { formatPreferencesContext, formatFavoritesContext, formatRecipeContext } from "../_shared/context-format.ts";
import { TM7_MODES, TM7_ACCESSORY_LABELS, buildTm7ReferenceForPrompt } from "../_shared/thermomix/reference.ts";

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
  preparation: z.string().nullable().optional(),
});

// Paramètres machine TM7 d'une étape réinjectée en contexte (tolérant : on
// préserve la structure pour ne pas perdre les réglages lors d'une modification).
const Tm7ParamsSchema = z.object({
  mode: z.string().optional(),
  seconds: z.number().nullable().optional(),
  temperature: z.union([z.number(), z.string()]).nullable().optional(),
  speed: z.union([z.string(), z.number()]).nullable().optional(),
  reverse: z.boolean().nullable().optional(),
  accessory: z.string().nullable().optional(),
  power: z.string().nullable().optional(),
});

const StepSchema = z.object({
  order: z.number(),
  text: z.string(),
  completed: z.boolean().optional(),
  duration_minutes: z.number().nullable().optional(),
  tm7: Tm7ParamsSchema.nullable().optional(),
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
2. AFFINAGE : Affine selon les retours — pose des questions sur les portions, les contraintes alimentaires, l'équipement ou les préférences si ce n'est pas clair.
3. PROPOSITION : appelle `propose_recipe` avec la recette structurée (intro à 2-3 puces, phrase de clôture, astuce de chef, quantités numériques). L'utilisateur crée la recette via le bouton de la carte — n'appelle PAS save_recipe toi-même pour une création.
   - Après l'appel : un mot bref (ex. propose 1-2 variantes ou ajustements possibles). Ne dis JAMAIS que la recette est enregistrée — c'est l'utilisateur qui la crée via le bouton.
   - Si l'utilisateur demande une modification de la proposition (portions, ingrédient, technique) : ajuste et RAPPELLE \`propose_recipe\` avec la version mise à jour.

Format ingrédients : Catégories parmi "Légumes", "Viandes", "Poissons", "Épices", "Produits laitiers", "Féculents", "Fruits", "Condiments", "Huiles", "Autres". Quantité et unité séparées. Ajoute la préparation ("émincé", "en dés") quand c'est pertinent.

Format étapes — TOUTES les recettes sont destinées au Thermomix TM7. Rédige comme un expert Cookidoo :
- UNE action machine = UNE étape distincte (ne regroupe jamais deux opérations machine dans une même étape).
- Pour chaque étape réalisée par l'appareil, renseigne l'objet "tm7" (mode, seconds, temperature, speed, reverse, accessory, power) ET rédige le texte au format Cookidoo, ex. "Mixer 8 min/100°C/vitesse 2".
- Étapes manuelles (éplucher, réserver, dresser) : PAS d'objet "tm7" ; renseigne "duration_minutes" si un temps d'attente s'applique.
- Respecte STRICTEMENT le RÉFÉRENTIEL THERMOMIX TM7 (fourni plus bas) : n'invente jamais une fonction, une vitesse ou une température absente du TM7. "Varoma" = cuisson vapeur (pas de °C) ; "sens inverse" pour mélanger sans hacher.

### Skill : Guidage cuisine
Quand l'utilisateur veut cuisiner une recette (qui est en contexte ou identifiée) :
- Pour démarrer la préparation / "passer en mode cuisine" / être guidé pas à pas : appelle start_cooking (recipe_id) IMMÉDIATEMENT. Cela ouvre le mode cuisine plein écran (étapes en grand, minuteurs, écran maintenu allumé). Si aucune recette n'est encore identifiée, demande laquelle (ou propose search_recipes) avant.
- Une fois en cuisine, guide étape par étape
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

// Clés du référentiel TM7 injectées dans les schémas d'outils (source unique).
const TM7_MODE_KEYS = Object.keys(TM7_MODES);
const TM7_ACCESSORY_KEYS = Object.keys(TM7_ACCESSORY_LABELS);
const TM7_REFERENCE_BLOCK = buildTm7ReferenceForPrompt();

// Schéma commun d'une étape, partagé par save_recipe / extract / create.
const STEP_ITEMS_SCHEMA = {
  type: "object",
  properties: {
    order: { type: "number" },
    text: {
      type: "string",
      description:
        "Texte de l'étape. Pour une action machine : format Cookidoo, ex. « Mixer 8 min/100°C/vitesse 2 » ou « Cuire 15 min/Varoma/vitesse 1 ».",
    },
    duration_minutes: {
      type: "number",
      description:
        "Durée en minutes d'une étape MANUELLE (repos, réfrigération, levée). Omettre pour une action machine (utiliser tm7.seconds).",
    },
    tm7: {
      type: "object",
      description:
        "Réglages Thermomix TM7 quand l'étape est réalisée par l'appareil. OMETTRE pour une étape manuelle (éplucher, réserver, dresser).",
      properties: {
        mode: { type: "string", enum: TM7_MODE_KEYS, description: "Mode TM7" },
        seconds: { type: "number", description: "Durée de l'opération, en secondes" },
        temperature: {
          type: "number",
          description: "Température en °C (37-160). Pour la vapeur : mode « steam » (Varoma) sans température.",
        },
        speed: { type: "string", description: "Vitesse : « 0.5 » à « 10 », « mijotage » ou « Turbo »" },
        reverse: { type: "boolean", description: "Sens inverse : mélange sans hacher" },
        accessory: { type: "string", enum: TM7_ACCESSORY_KEYS, description: "Accessoire utilisé" },
        power: {
          type: "string",
          enum: ["Intense", "Gentle"],
          description:
            "Puissance du rissolage (mode « high_temp » uniquement) : « Intense » par défaut, « Gentle » pour un rissolage doux",
        },
      },
      required: ["mode"],
    },
  },
  required: ["order", "text"],
};

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
      name: "start_cooking",
      description: "Lance le MODE CUISINE plein écran pour une recette : étapes en grand, minuteurs intégrés, écran maintenu allumé. À appeler dès que l'utilisateur veut cuisiner / passer en mode cuisine / être guidé pas à pas pour une recette identifiée.",
      parameters: {
        type: "object",
        properties: {
          recipe_id: { type: "string", description: "L'ID de la recette à cuisiner" },
          recipe_title: { type: "string", description: "Le titre de la recette (pour confirmation)" },
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
      name: "propose_recipe",
      description: "Présente une recette à l'utilisateur sous forme de carte interactive. L'utilisateur l'enregistre lui-même via le bouton de la carte — n'appelle PAS save_recipe toi-même pour une création. Pour la mise à jour d'une recette existante, utilise extract_modified_recipe/save_recipe comme avant.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titre de la recette" },
          servings: { type: "number", description: "Nombre de portions" },
          ingredients: {
            type: "array",
            description: "Liste des ingrédients",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nom de l'ingrédient" },
                quantity: { type: "number", description: "Quantité (nombre — pas une chaîne)" },
                unit: { type: "string", description: "Unité (g, ml, pièce…)" },
                category: { type: "string", description: "Catégorie parmi : Légumes, Viandes, Poissons, Épices, Produits laitiers, Féculents, Fruits, Condiments, Huiles, Autres" },
                preparation: { type: "string", description: "Préparation : « émincé », « en dés »… (optionnel)" },
              },
              required: ["name", "quantity", "unit", "category"],
            },
          },
          steps: {
            type: "array",
            description: "Étapes de préparation (format machine TM7 quand applicable).",
            items: STEP_ITEMS_SCHEMA,
          },
          intro: {
            type: "array",
            items: { type: "string" },
            description: "2-3 puces courtes présentant les points clés de la recette (ingrédients phares, technique)",
          },
          intro_closing: {
            type: "string",
            description: "Phrase de clôture de l'intro (ex. conseil d'assemblage)",
          },
          tip: {
            type: "string",
            description: "Une astuce de chef pour réussir la recette",
          },
        },
        required: ["title", "servings", "ingredients", "steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_recipe",
      description: "Outil hérité : enregistre directement une recette. Ne l'utilise plus pour les créations depuis le chat (→ propose_recipe). Réservé aux mises à jour explicites d'une recette existante quand extract_modified_recipe ne s'applique pas.",
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
                preparation: { type: "string", description: "Préparation : « émincé », « en dés »… (optionnel)" },
              },
              required: ["name", "quantity", "unit", "category"],
            },
          },
          steps: {
            type: "array",
            items: STEP_ITEMS_SCHEMA,
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
                preparation: { type: "string", description: "Préparation : « émincé », « en dés »… (optionnel)" },
              },
              required: ["name", "quantity", "unit"],
            },
          },
          steps: {
            type: "array",
            items: STEP_ITEMS_SCHEMA,
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
                preparation: { type: "string", description: "Préparation : « émincé », « en dés »… (optionnel)" },
              },
              required: ["name", "quantity", "unit"],
            },
          },
          steps: {
            type: "array",
            items: STEP_ITEMS_SCHEMA,
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
      defaultModel: "claude-sonnet-5",
      requiredCapabilities: ["tools"],
    });
    console.log(`AI: ${aiConfig.provider}/${aiConfig.model}`);

    // Build unified system prompt (référentiel TM7 injecté pour la génération d'étapes)
    let systemPrompt = UNIFIED_PROMPT + "\n\n" + TM7_REFERENCE_BLOCK + SUGGESTIONS_INSTRUCTION;

    // Fetch and add user preferences
    const { data: prefs } = await supabaseClient
      .from("user_culinary_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    systemPrompt += formatPreferencesContext(prefs);

    // Add recipes list
    if (recipes && recipes.length > 0) {
      systemPrompt += `\n\n## RECETTES DE L'UTILISATEUR (${recipes.length} recettes)\n`;
      systemPrompt += recipes.map((r) =>
        `- ID: ${r.id} | "${r.title}" | Statut: ${r.status}${r.is_favorite ? " ⭐" : ""}`
      ).join("\n");
    }

    // Fetch favorite recipes (with AI summary) for a richer, rotating context sample
    const { data: favorites } = await supabaseClient
      .from("recipes")
      .select("id, title, ai_summary")
      .eq("user_id", userId)
      .eq("is_favorite", true);

    systemPrompt += formatFavoritesContext(favorites);

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
