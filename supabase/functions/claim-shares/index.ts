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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;
    const userPhone = userData.user.phone;

    // Find pending shares matching email or phone
    let query = adminClient
      .from("recipe_shares")
      .select("*")
      .eq("status", "pending");

    const { data: allPending } = await query;

    const matchingShares = (allPending || []).filter((share) => {
      if (share.identifier_type === "email" && userEmail) {
        return share.recipient_identifier.toLowerCase() === userEmail.toLowerCase();
      }
      if (share.identifier_type === "phone" && userPhone) {
        return share.recipient_identifier === userPhone;
      }
      return false;
    });

    if (matchingShares.length === 0) {
      return new Response(
        JSON.stringify({ claimed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let claimedCount = 0;

    for (const share of matchingShares) {
      const snapshot = share.recipe_snapshot as Record<string, unknown>;

      const nutritionTags = snapshot.nutrition_tags as string[] | null;

      const { error: insertError } = await adminClient.from("recipes").insert({
        user_id: userId,
        title: snapshot.title as string,
        servings: snapshot.servings as number | null,
        ingredients: snapshot.ingredients,
        steps: snapshot.steps,
        season: snapshot.season as string | null,
        nutrition_tags: nutritionTags,
        source_image_url: snapshot.source_image_url as string | null,
        ai_summary: "Recette partagée par un ami",
        source_type: "shared",
        status: "draft",
      });

      if (!insertError) {
        await adminClient
          .from("recipe_shares")
          .update({
            status: "claimed",
            recipient_id: userId,
            claimed_at: new Date().toISOString(),
          })
          .eq("id", share.id);
        claimedCount++;
      } else {
        console.error("Failed to insert recipe from share:", insertError);
      }
    }

    return new Response(
      JSON.stringify({ claimed: claimedCount }),
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
