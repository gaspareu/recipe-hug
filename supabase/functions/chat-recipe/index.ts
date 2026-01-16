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

const RequestSchema = z.object({
  messages: z.array(MessageSchema).max(50, "Too many messages"),
});

const BASE_SYSTEM_PROMPT = `Tu es un chef cuisinier français passionné avec 20 ans d'expérience. Tu aides l'utilisateur à construire sa recette idéale en conversant avec lui.

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
- "oui" (en réponse à "Cette recette te convient ?")
- Toute validation enthousiaste ou approbation claire

NE PAS ATTENDRE de confirmation supplémentaire. Dès la première validation → save_recipe.

## FORMAT INGRÉDIENTS
Catégories : "Légumes", "Viandes", "Poissons", "Épices", "Produits laitiers", "Féculents", "Fruits", "Condiments", "Huiles", "Autres"
Quantité et unité séparées : quantity="200", unit="g" (jamais "200g")

## EXEMPLES DE CONVERSATIONS

### Exemple 1 - Demande simple
User: "Je voudrais faire une quiche"
Assistant: "Une quiche, excellent choix ! Classique lorraine avec lardons et crème, ou tu préfères une version légumes comme poireaux-chèvre ? Et pour combien de personnes ?"
User: "Lorraine pour 4"
Assistant: "Parfait ! Voici ma quiche lorraine crémeuse pour 4 : pâte brisée maison, 200g de lardons fumés dorés, 3 œufs, 20cl de crème fraîche épaisse, une pointe de muscade. 35-40 min à 180°C jusqu'à ce qu'elle soit bien dorée. Elle te plaît ?"
User: "Super, on fait ça !"
[→ APPEL save_recipe IMMÉDIAT]

### Exemple 2 - Demande vague
User: "J'ai des courgettes à utiliser"
Assistant: "Chouette les courgettes ! Tu as envie de quoi : des courgettes farcies, un gratin, ou plutôt des spaghettis de courgettes façon pasta légère ?"
User: "Un gratin"
Assistant: "Excellent ! Mon gratin de courgettes à la provençale : courgettes en rondelles, couche de tomates, ail, herbes de Provence, mozzarella fondante. Tu veux une version gratinée classique ou avec un crumble de parmesan croustillant sur le dessus ?"
User: "Avec le crumble, top !"
[→ APPEL save_recipe IMMÉDIAT avec la recette complète]

## TON
Chaleureux, enthousiaste, naturel. Tu tutoies. Des phrases fluides.`;

const PERSONALIZATION_INSTRUCTION = `

IMPORTANT - PERSONNALISATION :
Tu as accès au profil culinaire de l'utilisateur ci-dessous. Utilise ces informations pour :
- Éviter de proposer des ingrédients qu'il n'aime pas ou auxquels il est allergique
- Privilégier les cuisines et techniques qu'il apprécie
- Adapter les recettes à son équipement disponible
- Respecter ses contraintes alimentaires

Ne mentionne pas explicitement que tu connais ces préférences, intègre-les naturellement dans tes suggestions.`;

const SAVE_RECIPE_TOOL = {
  type: "function",
  function: {
    name: "save_recipe",
    description:
      "APPELER IMMÉDIATEMENT quand l'utilisateur valide/approuve la recette avec des mots comme 'ok', 'parfait', 'super', 'on fait ça', 'génial', 'c'est bon', 'oui'. Ne jamais attendre de confirmation supplémentaire.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Nom appétissant de la recette (ex: 'Quiche lorraine crémeuse', 'Risotto aux champignons forestiers')",
        },
        servings: {
          type: "number",
          description: "Nombre de portions (défaut: 4 si non précisé)",
        },
        ingredients: {
          type: "array",
          description: "Liste complète des ingrédients avec quantités précises",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nom de l'ingrédient" },
              quantity: { type: "string", description: "Quantité numérique uniquement (ex: '200', '2', '0.5')" },
              unit: {
                type: "string",
                description: "Unité : g, kg, ml, L, pièce, c. à soupe, c. à café, pincée, bouquet",
              },
              category: {
                type: "string",
                description:
                  "Une de: Légumes, Viandes, Poissons, Épices, Produits laitiers, Féculents, Fruits, Condiments, Huiles, Autres",
              },
            },
            required: ["name", "quantity", "unit", "category"],
          },
        },
        steps: {
          type: "array",
          description: "Étapes détaillées et actionnables",
          items: {
            type: "object",
            properties: {
              order: { type: "number", description: "Numéro séquentiel 1, 2, 3..." },
              text: {
                type: "string",
                description:
                  "Instruction claire avec temps si pertinent (ex: 'Faire revenir les oignons 5 min à feu doux')",
              },
            },
            required: ["order", "text"],
          },
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

  // Taste preferences
  const taste = prefs.taste_preferences || {};
  const tasteLines: string[] = [];
  if (taste.liked_flavors?.length > 0) {
    tasteLines.push(`Saveurs aimées : ${taste.liked_flavors.join(", ")}`);
  }
  if (taste.disliked_flavors?.length > 0) {
    tasteLines.push(`Saveurs évitées : ${taste.disliked_flavors.join(", ")}`);
  }
  if (taste.liked_ingredients?.length > 0) {
    tasteLines.push(`Ingrédients favoris : ${taste.liked_ingredients.join(", ")}`);
  }
  if (taste.disliked_ingredients?.length > 0) {
    tasteLines.push(`Ingrédients évités : ${taste.disliked_ingredients.join(", ")}`);
  }
  if (tasteLines.length > 0) {
    sections.push(`Goûts :\n${tasteLines.join("\n")}`);
  }

  // Kitchen equipment
  const equipment = prefs.kitchen_equipment || {};
  const equipLines: string[] = [];
  if (equipment.unavailable?.length > 0) {
    equipLines.push(`Non disponible : ${equipment.unavailable.join(", ")}`);
  }
  if (equipment.available?.length > 0) {
    equipLines.push(`Disponible : ${equipment.available.join(", ")}`);
  }
  if (equipLines.length > 0) {
    sections.push(`Équipement :\n${equipLines.join("\n")}`);
  }

  // Culinary style
  const style = prefs.culinary_style || {};
  const styleLines: string[] = [];
  if (style.favorite_cuisines?.length > 0) {
    styleLines.push(`Cuisines favorites : ${style.favorite_cuisines.join(", ")}`);
  }
  if (style.favorite_techniques?.length > 0) {
    styleLines.push(`Techniques appréciées : ${style.favorite_techniques.join(", ")}`);
  }
  if (style.preferred_difficulty) {
    styleLines.push(`Niveau préféré : ${style.preferred_difficulty}`);
  }
  if (styleLines.length > 0) {
    sections.push(`Style culinaire :\n${styleLines.join("\n")}`);
  }

  // Dietary constraints
  const diet = prefs.dietary_constraints || {};
  const dietLines: string[] = [];
  if (diet.allergies?.length > 0) {
    dietLines.push(`⚠️ ALLERGIES : ${diet.allergies.join(", ")}`);
  }
  if (diet.diets?.length > 0) {
    dietLines.push(`Régime : ${diet.diets.join(", ")}`);
  }
  if (diet.restrictions?.length > 0) {
    dietLines.push(`Restrictions : ${diet.restrictions.join(", ")}`);
  }
  if (dietLines.length > 0) {
    sections.push(`Contraintes alimentaires :\n${dietLines.join("\n")}`);
  }

  if (sections.length === 0) return "";

  return `\n\n--- PROFIL CULINAIRE ---\n${sections.join("\n\n")}\n--- FIN PROFIL ---`;
}

// Format favorite recipes summaries
function formatFavoritesContext(recipes: any[]): string {
  if (!recipes || recipes.length === 0) return "";

  const summaries = recipes.slice(0, 5).map((r, i) => {
    const tags = [r.season, ...(r.nutrition_tags || [])].filter(Boolean).join(", ");
    return `${i + 1}. ${r.title}${tags ? ` (${tags})` : ""}`;
  });

  return `\n\n--- RECETTES FAVORITES ---\n${summaries.join("\n")}\n--- FIN FAVORITES ---`;
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

    const { messages } = parseResult.data;

    console.log("Chat request received with", messages.length, "messages for user:", userId);

    // Build personalized system prompt
    let systemPrompt = BASE_SYSTEM_PROMPT;

    // Fetch user preferences and favorites
    const [prefsResult, favoritesResult] = await Promise.all([
      supabaseClient.from("user_culinary_preferences").select("*").eq("user_id", userId).single(),
      supabaseClient
        .from("recipes")
        .select("title, season, nutrition_tags")
        .eq("user_id", userId)
        .eq("is_favorite", true)
        .limit(5),
    ]);

    const prefsContext = formatPreferencesContext(prefsResult.data);
    const favoritesContext = formatFavoritesContext(favoritesResult.data || []);

    if (prefsContext || favoritesContext) {
      systemPrompt += PERSONALIZATION_INSTRUCTION + prefsContext + favoritesContext;
      console.log("Added personalization context");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools: [SAVE_RECIPE_TOOL],
        tool_choice: "auto",
        stream: true,
      }),
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

    // Stream the response directly
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat recipe error:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return new Response(JSON.stringify({ error: "server_error", message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
