import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

    // Admin client to look up users
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if recipient already exists — targeted lookups, never listUsers()
    let recipientUserId: string | null = null;

    if (identifierType === "email") {
      const { data: userData, error: userError } =
        await adminClient.auth.admin.getUserByEmail(identifier);
      if (userError && userError.status !== 404) {
        console.error("getUserByEmail error:", userError);
        return new Response(JSON.stringify({ error: "Failed to lookup user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (userData?.user) recipientUserId = userData.user.id;
    } else {
      // phone: targeted RPC lookup on auth.users via SECURITY DEFINER function
      const { data: phoneData, error: phoneError } = await adminClient.rpc(
        "get_user_id_by_phone",
        { phone_number: identifier }
      );
      if (phoneError) {
        console.error("get_user_id_by_phone error:", phoneError);
        return new Response(JSON.stringify({ error: "Failed to lookup user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (phoneData) recipientUserId = phoneData as string;
    }

    // Fetch sender display_name for the share URL
    const { data: senderProfile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", senderId)
      .single();

    const senderName = senderProfile?.display_name ?? "";
    const recipeTitle = snapshot.title ?? "";

    const appUrl = Deno.env.get("APP_URL") ?? "https://recipe-hug.vercel.app";
    const shareParams = new URLSearchParams();
    if (senderName) shareParams.set("shared_by", senderName);
    if (recipeTitle) shareParams.set("recipe", recipeTitle);
    const shareUrl = `${appUrl}/auth?${shareParams.toString()}`;

    if (recipientUserId) {
      // User exists: create recipe directly in their account
      const { error: insertError } = await adminClient.from("recipes").insert({
        user_id: recipientUserId,
        title: snapshot.title,
        servings: snapshot.servings,
        ingredients: snapshot.ingredients,
        steps: snapshot.steps,
        season: snapshot.season,
        nutrition_tags: snapshot.nutrition_tags,
        source_image_url: snapshot.source_image_url,
        ai_summary: `Recette partagée par un ami`,
        source_type: "shared",
        status: "draft",
      });

      if (insertError) {
        console.error("Insert error:", insertError);
        return new Response(JSON.stringify({ error: "Failed to create recipe" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Also record the share as claimed
      await adminClient.from("recipe_shares").insert({
        sender_id: senderId,
        recipient_identifier: identifier,
        identifier_type: identifierType,
        recipe_snapshot: snapshot,
        status: "claimed",
        recipient_id: recipientUserId,
        claimed_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({ status: "claimed", message: "Recette envoyée avec succès" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // User doesn't exist: store as pending
      const { error: shareError } = await adminClient.from("recipe_shares").insert({
        sender_id: senderId,
        recipient_identifier: identifier,
        identifier_type: identifierType,
        recipe_snapshot: snapshot,
        status: "pending",
      });

      if (shareError) {
        console.error("Share error:", shareError);
        return new Response(JSON.stringify({ error: "Failed to create share" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ status: "pending", message: "Partage en attente de création de compte", shareUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
