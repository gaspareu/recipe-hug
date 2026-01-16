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

const EXTRACTION_PROMPT = `Tu es un assistant qui analyse des conversations culinaires pour extraire les préférences de l'utilisateur.

Analyse la conversation et extrais UNIQUEMENT les nouvelles informations mentionnées explicitement par l'utilisateur concernant:
1. Préférences de goût (saveurs aimées/détestées, ingrédients aimés/détestés)
2. Équipement cuisine (équipements disponibles ou non disponibles mentionnés)
3. Style culinaire (cuisines favorites, techniques de cuisine favorites, niveau de difficulté préféré)
4. Contraintes alimentaires (allergies, régimes, restrictions)

IMPORTANT:
- N'invente PAS d'informations, extrais seulement ce qui est explicitement dit
- Retourne des tableaux vides pour les catégories sans information
- Sois précis sur les formulations (ex: "pas de four" → unavailable: ["four"])`;

const EXTRACT_PREFERENCES_TOOL = {
  type: "function",
  function: {
    name: "extract_preferences",
    description: "Extrait les préférences culinaires détectées dans la conversation",
    parameters: {
      type: "object",
      properties: {
        taste_preferences: {
          type: "object",
          properties: {
            liked_flavors: { 
              type: "array", 
              items: { type: "string" },
              description: "Saveurs aimées (épicé, sucré, umami, acide, etc.)"
            },
            disliked_flavors: { 
              type: "array", 
              items: { type: "string" },
              description: "Saveurs détestées"
            },
            liked_ingredients: { 
              type: "array", 
              items: { type: "string" },
              description: "Ingrédients aimés"
            },
            disliked_ingredients: { 
              type: "array", 
              items: { type: "string" },
              description: "Ingrédients détestés"
            }
          }
        },
        kitchen_equipment: {
          type: "object",
          properties: {
            available: { 
              type: "array", 
              items: { type: "string" },
              description: "Équipements disponibles mentionnés"
            },
            unavailable: { 
              type: "array", 
              items: { type: "string" },
              description: "Équipements non disponibles (ex: 'pas de four' → 'four')"
            }
          }
        },
        culinary_style: {
          type: "object",
          properties: {
            favorite_cuisines: { 
              type: "array", 
              items: { type: "string" },
              description: "Cuisines favorites (asiatique, française, africaine, etc.)"
            },
            favorite_techniques: { 
              type: "array", 
              items: { type: "string" },
              description: "Techniques favorites (pickles, fermentation, wok, etc.)"
            },
            preferred_difficulty: { 
              type: "string",
              enum: ["facile", "moyen", "difficile"],
              description: "Niveau de difficulté préféré si mentionné"
            }
          }
        },
        dietary_constraints: {
          type: "object",
          properties: {
            allergies: { 
              type: "array", 
              items: { type: "string" },
              description: "Allergies mentionnées"
            },
            diets: { 
              type: "array", 
              items: { type: "string" },
              description: "Régimes (végétarien, vegan, sans gluten, etc.)"
            },
            restrictions: { 
              type: "array", 
              items: { type: "string" },
              description: "Autres restrictions alimentaires"
            }
          }
        }
      },
      required: ["taste_preferences", "kitchen_equipment", "culinary_style", "dietary_constraints"]
    }
  }
};

// Merge arrays without duplicates (case-insensitive)
function mergeArrays(existing: string[], newItems: string[]): string[] {
  const lowerExisting = new Set(existing.map(s => s.toLowerCase()));
  const result = [...existing];
  
  for (const item of newItems) {
    if (!lowerExisting.has(item.toLowerCase())) {
      result.push(item);
      lowerExisting.add(item.toLowerCase());
    }
  }
  
  return result;
}

// Merge preferences objects (add new items without removing existing)
function mergePreferences(existing: any, extracted: any): any {
  return {
    taste_preferences: {
      liked_flavors: mergeArrays(
        existing.taste_preferences?.liked_flavors || [],
        extracted.taste_preferences?.liked_flavors || []
      ),
      disliked_flavors: mergeArrays(
        existing.taste_preferences?.disliked_flavors || [],
        extracted.taste_preferences?.disliked_flavors || []
      ),
      liked_ingredients: mergeArrays(
        existing.taste_preferences?.liked_ingredients || [],
        extracted.taste_preferences?.liked_ingredients || []
      ),
      disliked_ingredients: mergeArrays(
        existing.taste_preferences?.disliked_ingredients || [],
        extracted.taste_preferences?.disliked_ingredients || []
      ),
    },
    kitchen_equipment: {
      available: mergeArrays(
        existing.kitchen_equipment?.available || [],
        extracted.kitchen_equipment?.available || []
      ),
      unavailable: mergeArrays(
        existing.kitchen_equipment?.unavailable || [],
        extracted.kitchen_equipment?.unavailable || []
      ),
    },
    culinary_style: {
      favorite_cuisines: mergeArrays(
        existing.culinary_style?.favorite_cuisines || [],
        extracted.culinary_style?.favorite_cuisines || []
      ),
      favorite_techniques: mergeArrays(
        existing.culinary_style?.favorite_techniques || [],
        extracted.culinary_style?.favorite_techniques || []
      ),
      preferred_difficulty: extracted.culinary_style?.preferred_difficulty || 
        existing.culinary_style?.preferred_difficulty || null,
    },
    dietary_constraints: {
      allergies: mergeArrays(
        existing.dietary_constraints?.allergies || [],
        extracted.dietary_constraints?.allergies || []
      ),
      diets: mergeArrays(
        existing.dietary_constraints?.diets || [],
        extracted.dietary_constraints?.diets || []
      ),
      restrictions: mergeArrays(
        existing.dietary_constraints?.restrictions || [],
        extracted.dietary_constraints?.restrictions || []
      ),
    },
  };
}

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

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

    const userId = claimsData.claims.sub as string;

    // Validate input
    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);
    
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: parseResult.error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages } = parseResult.data;

    console.log("Extracting preferences for user:", userId);
    console.log("Messages count:", messages.length);

    // Get existing preferences using user's auth context
    const { data: existingPrefs } = await supabaseClient
      .from('user_culinary_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Format conversation for extraction
    const conversationText = messages
      .filter((m: any) => m.role === 'user')
      .map((m: any) => m.content)
      .join('\n');

    if (!conversationText.trim()) {
      return new Response(
        JSON.stringify({ success: true, message: "No user messages to analyze" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call AI to extract preferences
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          { role: "user", content: `Analyse cette conversation et extrait les préférences culinaires:\n\n${conversationText}` },
        ],
        tools: [EXTRACT_PREFERENCES_TOOL],
        tool_choice: { type: "function", function: { name: "extract_preferences" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI extraction error:", response.status, errorText);
      throw new Error("AI extraction failed");
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.log("No preferences extracted from conversation");
      return new Response(
        JSON.stringify({ success: true, message: "No new preferences detected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extractedPrefs = JSON.parse(toolCall.function.arguments);
    console.log("Extracted preferences:", extractedPrefs);

    // Merge with existing preferences
    const defaultPrefs = {
      taste_preferences: { liked_flavors: [], disliked_flavors: [], liked_ingredients: [], disliked_ingredients: [] },
      kitchen_equipment: { available: [], unavailable: [] },
      culinary_style: { favorite_cuisines: [], favorite_techniques: [], preferred_difficulty: null },
      dietary_constraints: { allergies: [], diets: [], restrictions: [] },
    };

    const mergedPrefs = mergePreferences(existingPrefs || defaultPrefs, extractedPrefs);

    // Upsert preferences using user's auth context (RLS will enforce ownership)
    const { error: upsertError } = await supabaseClient
      .from('user_culinary_preferences')
      .upsert({
        user_id: userId,
        taste_preferences: mergedPrefs.taste_preferences,
        kitchen_equipment: mergedPrefs.kitchen_equipment,
        culinary_style: mergedPrefs.culinary_style,
        dietary_constraints: mergedPrefs.dietary_constraints,
      }, { onConflict: 'user_id' });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      throw upsertError;
    }

    console.log("Preferences updated successfully");

    return new Response(
      JSON.stringify({ success: true, preferences: mergedPrefs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Extract preferences error:", error);
    return new Response(
      JSON.stringify({ error: "server_error", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
