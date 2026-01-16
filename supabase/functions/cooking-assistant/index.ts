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
  quantity: z.union([z.string(), z.number()]),
  unit: z.string(),
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

## EXEMPLES DE CONVERSATIONS

### Exemple 1 - Adaptation végétarienne (MODIFICATION)
User: "Je voudrais une version végétarienne"
Assistant: "Excellente idée ! Pour ta quiche lorraine végétarienne, je remplace les lardons par 200g de champignons de Paris émincés et dorés au beurre avec une échalote. Le fumé viendra de 1 c.à.c de paprika fumé dans l'appareil. Le reste reste identique. Tu veux que j'enregistre cette version ?"
User: "Super, on fait ça !"
[→ APPEL extract_modified_recipe IMMÉDIAT avec la recette complète modifiée]

### Exemple 2 - Réduction de portions (MODIFICATION)
User: "Peux-tu adapter pour 2 personnes ?"
Assistant: "Bien sûr ! Je divise tout par 2 : 100g de lardons, 1,5 œufs (mets-en 2 ce sera parfait), 10cl de crème, et une pâte plus petite de 20cm. Cuisson identique mais surveille à partir de 30 min. Je sauvegarde ?"
User: "Parfait"
[→ APPEL extract_modified_recipe IMMÉDIAT]

### Exemple 3 - Autre protéine (NOUVELLE RECETTE)
User: "Et si je faisais la même chose mais avec du poulet ?"
Assistant: "Excellente idée ! Je te propose un Coq au Vin : mêmes techniques que ton boeuf bourguignon, mais avec des cuisses de poulet. La cuisson passe à 1h30 au lieu de 3h, j'ajoute des champignons pour le côté terroir. C'est un grand classique français ! Tu veux que je crée cette nouvelle recette ?"
User: "Oui, vas-y !"
[→ APPEL create_new_recipe avec titre "Coq au Vin Traditionnel"]

### Exemple 4 - Réutilisation de restes (NOUVELLE RECETTE)
User: "J'ai des restes de ce rôti, une idée pour les utiliser ?"
Assistant: "Avec tes restes de rôti de bœuf, je te propose un Hachis Parmentier gourmand : effiloche la viande, mélange avec des oignons caramélisés et un peu de jus de cuisson. Nape d'une purée maison bien crémeuse, gratiné au four 25 min. C'est le plat réconfort parfait ! Je te crée cette nouvelle recette ?"
User: "Oh oui, super idée !"
[→ APPEL create_new_recipe avec titre "Hachis Parmentier au Rôti"]

### Exemple 5 - Recette inspirée (NOUVELLE RECETTE)
User: "Tu aurais une recette similaire mais en version asiatique ?"
Assistant: "Je te propose un Bœuf Sauté aux Légumes façon wok ! Mêmes morceaux de bœuf émincés finement, marinés au soja et gingembre. Cuisson rapide au wok avec des légumes croquants (brocoli, poivrons, champignons noirs). Servi avec du riz jasmin. C'est un voyage gustatif garanti ! Je crée cette recette ?"
User: "Génial, enregistre !"
[→ APPEL create_new_recipe avec titre "Bœuf Sauté aux Légumes façon Wok"]

## FORMAT DE RÉPONSE
- Décris les modifications/créations clairement et concrètement
- Donne les quantités exactes des ingrédients
- Explique brièvement pourquoi ces choix fonctionnent
- Termine par une question ouverte si l'utilisateur n'a pas encore validé

Ton : créatif, expert culinaire, bienveillant. Tu co-crées avec l'utilisateur.`;

const PERSONALIZATION_INSTRUCTION = `

IMPORTANT - PROFIL UTILISATEUR :
Tu as accès au profil culinaire de l'utilisateur. Utilise ces informations pour :
- Proposer des substitutions adaptées à ses allergies/contraintes
- Suggérer des alternatives si un équipement lui manque
- Adapter tes conseils à son niveau de difficulté préféré

Ne mentionne pas explicitement que tu connais ces préférences, intègre-les naturellement.`;

// Tool definition for extracting modified recipe
const EXTRACT_RECIPE_TOOL = {
  type: "function",
  function: {
    name: "extract_modified_recipe",
    description:
      "Extrait la recette modifiée complète pour l'enregistrer. Utiliser quand l'utilisateur veut sauvegarder les modifications sur la recette ACTUELLE.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Titre de la recette (peut être modifié)",
        },
        servings: {
          type: "number",
          description: "Nombre de portions",
        },
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
          description: "Liste complète des ingrédients avec les modifications",
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
          description: "Liste complète des étapes avec les modifications",
        },
      },
      required: ["title", "servings", "ingredients", "steps"],
    },
  },
};

// Tool definition for creating a new recipe
const CREATE_NEW_RECIPE_TOOL = {
  type: "function",
  function: {
    name: "create_new_recipe",
    description:
      "Crée une NOUVELLE recette séparée inspirée de la recette actuelle. Utiliser quand l'utilisateur veut créer une recette DIFFÉRENTE (autre protéine, réutilisation de restes, nouvelle idée inspirée).",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Titre de la nouvelle recette",
        },
        servings: {
          type: "number",
          description: "Nombre de portions",
        },
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
          description: "Liste complète des ingrédients de la nouvelle recette",
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
          description: "Liste complète des étapes de la nouvelle recette",
        },
        relation_to_original: {
          type: "string",
          description:
            "Lien avec la recette originale (ex: 'Variante poulet de...', 'Inspiré de...', 'Réutilisation des restes de...')",
        },
      },
      required: ["title", "servings", "ingredients", "steps"],
    },
  },
};

// Format user preferences for context
function formatPreferencesContext(prefs: any): string {
  if (!prefs) return "";

  const sections: string[] = [];

  const equipment = prefs.kitchen_equipment || {};
  if (equipment.unavailable?.length > 0) {
    sections.push(`Équipement non disponible : ${equipment.unavailable.join(", ")}`);
  }

  const diet = prefs.dietary_constraints || {};
  if (diet.allergies?.length > 0) {
    sections.push(`⚠️ ALLERGIES : ${diet.allergies.join(", ")}`);
  }
  if (diet.diets?.length > 0) {
    sections.push(`Régime : ${diet.diets.join(", ")}`);
  }
  if (diet.restrictions?.length > 0) {
    sections.push(`Restrictions : ${diet.restrictions.join(", ")}`);
  }

  const style = prefs.culinary_style || {};
  if (style.preferred_difficulty) {
    sections.push(`Niveau culinaire : ${style.preferred_difficulty}`);
  }

  if (sections.length === 0) return "";

  return `\n\n--- PROFIL UTILISATEUR ---\n${sections.join("\n")}\n--- FIN PROFIL ---`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized", message: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "unauthorized", message: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Validate input
    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: "validation_error", message: parseResult.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, recipeContext, mode } = parseResult.data;

    console.log("Cooking assistant request - mode:", mode, "messages:", messages.length, "user:", userId);
    console.log("Recipe context:", recipeContext?.title);

    // Choose system prompt based on mode
    const basePrompt = mode === "editing" ? EDITING_SYSTEM_PROMPT : COOKING_SYSTEM_PROMPT;
    let contextMessage = basePrompt;

    // Fetch user preferences
    const { data: prefs } = await supabaseClient
      .from("user_culinary_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    const prefsContext = formatPreferencesContext(prefs);

    if (prefsContext) {
      contextMessage += PERSONALIZATION_INSTRUCTION + prefsContext;
      console.log("Added personalization context");
    }

    if (recipeContext) {
      contextMessage += `\n\n--- RECETTE ${mode === "editing" ? "À MODIFIER" : "EN COURS"} ---\n`;
      contextMessage += `Titre : ${recipeContext.title}\n`;

      if (recipeContext.servings) {
        contextMessage += `Portions : ${recipeContext.servings}\n`;
      }

      if (recipeContext.season) {
        contextMessage += `Saison : ${recipeContext.season}\n`;
      }

      if (recipeContext.ingredients && recipeContext.ingredients.length > 0) {
        contextMessage += `\nIngrédients :\n`;
        for (const ing of recipeContext.ingredients) {
          contextMessage += `- ${ing.quantity} ${ing.unit} ${ing.name}${ing.category ? ` (${ing.category})` : ""}\n`;
        }
      }

      if (recipeContext.steps && recipeContext.steps.length > 0) {
        contextMessage += `\nÉtapes :\n`;
        const sortedSteps = [...recipeContext.steps].sort((a: any, b: any) => a.order - b.order);
        for (const step of sortedSteps) {
          if (mode === "cooking") {
            const status = step.completed ? "✓" : "○";
            contextMessage += `${status} ${step.order}. ${step.text}\n`;
          } else {
            contextMessage += `${step.order}. ${step.text}\n`;
          }
        }

        // Add progress summary only in cooking mode
        if (mode === "cooking" && recipeContext.completedStepsCount !== undefined) {
          contextMessage += `\nProgression : ${recipeContext.completedStepsCount}/${recipeContext.totalSteps} étapes terminées`;
        }
      }

      contextMessage += `\n--- FIN DE LA RECETTE ---`;
    }

    // Build request body
    const requestBody: any = {
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "system", content: contextMessage }, ...messages],
      stream: true,
    };

    // Add tools in editing mode
    if (mode === "editing") {
      requestBody.tools = [EXTRACT_RECIPE_TOOL, CREATE_NEW_RECIPE_TOOL];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limit", message: "Trop de requêtes, veuillez patienter." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "payment_required", message: "Crédits IA épuisés." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "ai_error", message: "Erreur du service IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Cooking assistant error:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return new Response(JSON.stringify({ error: "server_error", message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
