import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { buildShareResult } from "../_shared/sharing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client for auth
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const senderId = claimsData.claims.sub;

    const { recipeId, identifier, identifierType } = await req.json();

    if (!recipeId || !identifier || !identifierType) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["email", "phone"].includes(identifierType)) {
      return new Response(JSON.stringify({ error: "Invalid identifierType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the recipe (using user client to respect RLS)
    const { data: recipe, error: recipeError } = await userClient
      .from("recipes")
      .select("*")
      .eq("id", recipeId)
      .single();

    if (recipeError || !recipe) {
      return new Response(JSON.stringify({ error: "Recipe not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create snapshot
    const snapshot = {
      title: recipe.title,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      season: recipe.season,
      nutrition_tags: recipe.nutrition_tags,
      source_image_url: recipe.source_image_url,
      ai_summary: recipe.ai_summary,
      calorie_score: recipe.calorie_score,
    };

    // Admin client : lookup du nom de l'expéditeur + enregistrement du partage.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch sender display_name for the share URL
    const { data: senderProfile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", senderId)
      .single();

    const { shareRow, response } = buildShareResult({
      senderId,
      identifier,
      identifierType,
      snapshot,
      senderName: senderProfile?.display_name ?? "",
      appUrl: Deno.env.get("APP_URL") ?? "https://recipe-hug.vercel.app",
    });

    // Toujours enregistré en « pending » : le destinataire réclame la recette
    // via claim-shares (consentement + identifiant vérifié). On ne recherche
    // plus le destinataire — donc aucune insertion directe dans le compte
    // d'autrui, et aucune réponse variant selon son existence (pas d'oracle).
    const { error: shareError } = await adminClient.from("recipe_shares").insert(shareRow);

    if (shareError) {
      console.error("Share error:", shareError);
      return new Response(JSON.stringify({ error: "Failed to create share" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
