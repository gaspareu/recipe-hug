import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveAIConfig } from "../_shared/ai-config.ts";

// Generate image based on provider
async function generateImage(config: any, prompt: string): Promise<string> {
  if (config.provider === "openai" && config.model === "dall-e-3") {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1792x1024",
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("DALL-E error:", response.status, errorText);
      throw new Error(`DALL-E error: ${response.status}`);
    }

    const data = await response.json();
    const base64 = data.data?.[0]?.b64_json;
    if (!base64) throw new Error("No image in DALL-E response");

    return `data:image/png;base64,${base64}`;
  }

  // Google Gemini (OpenAI-compat) format
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI gateway error:", response.status, errorText);
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const aiData = await response.json();
  const imageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

  if (!imageUrl) {
    console.error("No image in response:", JSON.stringify(aiData));
    throw new Error("No image generated");
  }

  return imageUrl;
}

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
      defaultModel: "gemini-2.0-flash-exp-image-generation",
      requiredCapabilities: ["image_generation"],
    });
    console.log(`Generating image for recipe ${recipeId} using ${aiConfig.provider}/${aiConfig.model}`);

    // Build prompt
    const ingredientsList = Array.isArray(ingredients)
      ? ingredients.slice(0, 8).map((i: any) => i.name || i).join(", ")
      : "";

    const prompt = `Professional food photography of "${title}". ${
      ingredientsList ? `Main ingredients: ${ingredientsList}.` : ""
    } Beautifully plated dish on a rustic wooden table, warm natural lighting, shallow depth of field, appetizing presentation. Ultra high resolution, 16:9 aspect ratio.`;

    console.log("Generating image with prompt:", prompt);

    // Generate image
    let imageUrl: string;
    try {
      imageUrl = await generateImage(aiConfig, prompt);
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

    // Convert base64 to blob and upload to storage
    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const fileName = `${userId}/${recipeId}-${Date.now()}.webp`;

    const { error: uploadError } = await supabase.storage
      .from("recipe-images")
      .upload(fileName, imageBytes, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to upload image");
    }

    const { data: urlData } = supabase.storage
      .from("recipe-images")
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    const { error: updateError } = await supabase
      .from("recipes")
      .update({ source_image_url: publicUrl })
      .eq("id", recipeId);

    if (updateError) {
      console.error("Update error:", updateError);
      throw new Error("Failed to update recipe");
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
