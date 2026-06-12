import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveAIConfig } from "../_shared/ai-config.ts";
import { generateAndStoreRecipeImage } from "../_shared/generate-image.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const { recipeId, title, ingredients } = await req.json();

    if (!recipeId || !title) {
      return new Response(
        JSON.stringify({ error: "Missing recipeId or title" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify recipe ownership
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id, user_id")
      .eq("id", recipeId)
      .single();

    if (recipeError || !recipe || recipe.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Recipe not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve AI configuration
    // La génération d'images nécessite un fournisseur compatible (Gemini ou OpenAI/DALL·E)
    // configuré par l'utilisateur : le fournisseur par défaut (Anthropic) ne génère pas d'images.
    const aiConfig = await resolveAIConfig(supabase, userId, {
      agentType: "generate_image",
      defaultProvider: "gemini",
      defaultModel: "gemini-2.5-flash-image",
      requiredCapabilities: ["image_generation"],
    });
    console.log(`Generating image for recipe ${recipeId} using ${aiConfig.provider}/${aiConfig.model}`);

    // Génération + upload + mise à jour de la recette (source unique _shared)
    let publicUrl: string;
    try {
      publicUrl = await generateAndStoreRecipeImage(supabase, aiConfig, { userId, recipeId, title, ingredients });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("429")) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (error.message.includes("402")) {
          return new Response(
            JSON.stringify({ error: "Payment required, please add credits" }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      throw error;
    }

    console.log("Image generated and saved:", publicUrl);

    return new Response(
      JSON.stringify({ success: true, imageUrl: publicUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating recipe image:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
