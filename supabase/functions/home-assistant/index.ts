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

const RecipeSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  is_favorite: z.boolean().optional(),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema).max(50, "Too many messages"),
  recipes: z.array(RecipeSchema).optional(),
});

const SYSTEM_PROMPT = `Tu es Chef Michel, l'assistant culinaire personnel de cette application de recettes. Tu aides les utilisateurs à :
- Chercher des recettes dans leur livre de recettes
- Créer de nouvelles recettes
- Naviguer dans l'application
- Répondre à des questions culinaires générales

## TON STYLE
- Chaleureux, enthousiaste et professionnel
- Tu tutoies l'utilisateur
- Réponses concises mais utiles

## OUTILS DISPONIBLES
Tu disposes de plusieurs outils pour interagir avec l'application :

### search_recipes
Utilise cet outil quand l'utilisateur veut chercher une recette, voir ses recettes, ou demande "qu'est-ce que j'ai comme..."
Exemples déclencheurs : "cherche", "trouve", "montre-moi", "j'ai quoi comme", "une recette de", "des idées de"

### open_recipe
Utilise cet outil pour ouvrir une recette spécifique APRÈS avoir fait une recherche et que l'utilisateur a choisi
Ne jamais inventer un ID - utilise uniquement les IDs retournés par search_recipes

### navigate
Utilise cet outil pour naviguer vers d'autres pages :
- "dashboard" : tableau de bord avec toutes les recettes
- "new_recipe" : créer une nouvelle recette (mode manuel ou IA)
- "profile" : profil utilisateur

### create_recipe_with_ai
Utilise cet outil quand l'utilisateur veut créer une nouvelle recette avec l'IA
Exemples : "crée-moi une recette de...", "invente une recette", "je voudrais une nouvelle recette de..."

## EXEMPLES DE CONVERSATIONS

### Recherche de recette
User: "J'ai quoi comme recettes de poulet ?"
Assistant: "Je cherche dans ton livre de recettes..." [APPEL search_recipes avec query="poulet"]
[Après résultat] "J'ai trouvé 3 recettes de poulet : 
1. **Poulet rôti aux herbes** - validée ⭐
2. **Curry de poulet** - en brouillon
3. **Poulet basquaise** - testée

Laquelle veux-tu ouvrir ?"

User: "La première"
Assistant: "Je t'ouvre le Poulet rôti aux herbes !" [APPEL open_recipe avec l'ID correspondant]

### Création de recette
User: "Je voudrais une nouvelle recette de tarte aux pommes"
Assistant: "Excellente idée ! Je te redirige vers la création IA pour te concocter une délicieuse tarte aux pommes." [APPEL create_recipe_with_ai avec prompt="tarte aux pommes"]

### Navigation
User: "Montre-moi toutes mes recettes"
Assistant: "Je t'emmène voir ton livre de recettes !" [APPEL navigate vers "dashboard"]

### Question culinaire
User: "C'est quoi la différence entre mijoter et braiser ?"
Assistant: "Bonne question ! **Mijoter** c'est cuire doucement dans un liquide à feu très doux (frémissement). **Braiser** c'est d'abord saisir la viande puis cuire lentement dans peu de liquide, couvert. Le braisage donne une croûte savoureuse que le mijotage n'a pas !"

## RÈGLES IMPORTANTES
1. Toujours utiliser les outils quand c'est pertinent
2. Ne jamais inventer d'ID de recette
3. Présenter les résultats de recherche de façon claire et numérotée
4. Être proactif : proposer des actions après avoir répondu`;

const SEARCH_RECIPES_TOOL = {
  type: "function",
  function: {
    name: "search_recipes",
    description: "Recherche des recettes dans le livre de recettes de l'utilisateur. Retourne une liste de recettes correspondantes.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Terme de recherche (ingrédient, nom de plat, type de cuisine...)"
        },
        status_filter: {
          type: "string",
          enum: ["all", "draft", "tested", "validated", "archived"],
          description: "Filtre par statut (optionnel, défaut: all)"
        },
        favorites_only: {
          type: "boolean",
          description: "Ne retourner que les favoris (optionnel)"
        }
      },
      required: ["query"]
    }
  }
};

const OPEN_RECIPE_TOOL = {
  type: "function",
  function: {
    name: "open_recipe",
    description: "Ouvre une recette spécifique pour la consulter. Utiliser UNIQUEMENT avec un ID retourné par search_recipes.",
    parameters: {
      type: "object",
      properties: {
        recipe_id: {
          type: "string",
          description: "L'ID unique de la recette à ouvrir"
        },
        recipe_title: {
          type: "string",
          description: "Le titre de la recette (pour confirmation)"
        }
      },
      required: ["recipe_id", "recipe_title"]
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
        destination: {
          type: "string",
          enum: ["dashboard", "new_recipe", "profile"],
          description: "La page de destination"
        }
      },
      required: ["destination"]
    }
  }
};

const CREATE_RECIPE_AI_TOOL = {
  type: "function",
  function: {
    name: "create_recipe_with_ai",
    description: "Redirige vers la création de recette avec un prompt pré-rempli pour l'IA",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "La description de la recette souhaitée par l'utilisateur"
        }
      },
      required: ["prompt"]
    }
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
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
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
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

    const { messages, recipes } = parseResult.data;

    console.log("Home assistant request - messages:", messages.length, "user:", userId);

    // Build context about user's recipes for the AI
    let recipesContext = "";
    if (recipes && recipes.length > 0) {
      recipesContext = `\n\n## RECETTES DE L'UTILISATEUR (${recipes.length} recettes)\n`;
      recipesContext += recipes.map((r) => 
        `- ID: ${r.id} | "${r.title}" | Statut: ${r.status}${r.is_favorite ? ' ⭐' : ''}`
      ).join('\n');
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + recipesContext },
          ...messages,
        ],
        tools: [SEARCH_RECIPES_TOOL, OPEN_RECIPE_TOOL, NAVIGATE_TOOL, CREATE_RECIPE_AI_TOOL],
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
