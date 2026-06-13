// ===== Génération d'image de recette (source unique) =====
// Partagé par generate-recipe-image et webhook-recipe : prompt, appel au
// fournisseur, upload Storage et mise à jour de la recette.
//
// ⚠️ Gemini : utiliser l'API NATIVE (`:generateContent` + responseModalities),
// PAS l'endpoint OpenAI-compat — voir supabase/functions/CLAUDE.md.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { AIConfig } from "./ai-types.ts";

export function buildRecipeImagePrompt(title: string, ingredients: unknown): string {
  const ingredientsList = Array.isArray(ingredients)
    ? ingredients.slice(0, 8).map((i: unknown) =>
        typeof i === "object" && i !== null && "name" in i ? String((i as { name: unknown }).name) : String(i)
      ).join(", ")
    : "";
  return `Professional food photography of "${title}". ${
    ingredientsList ? `Main ingredients: ${ingredientsList}.` : ""
  } Beautifully plated dish on a rustic wooden table, warm natural lighting, shallow depth of field, appetizing presentation. Ultra high resolution, 16:9 aspect ratio.`;
}

interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
}

/** Appelle le fournisseur d'images et retourne les octets décodés. */
export async function generateImage(config: AIConfig, prompt: string): Promise<GeneratedImage> {
  if (config.provider === "openai" && config.model === "dall-e-3") {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
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
    return { bytes: decodeBase64(base64), mimeType: "image/png" };
  }

  if (config.provider === "gemini") {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini image error:", response.status, errorText);
      throw new Error(`Gemini image error: ${response.status}`);
    }

    const data = await response.json();
    const part = data.candidates?.[0]?.content?.parts?.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
    if (!part) {
      console.error("No image in Gemini response:", JSON.stringify(data).slice(0, 500));
      throw new Error("No image generated");
    }
    return { bytes: decodeBase64(part.inlineData.data), mimeType: part.inlineData.mimeType || "image/png" };
  }

  throw new Error(`Provider ${config.provider}/${config.model} ne supporte pas la génération d'images`);
}

/**
 * Génère l'image, l'uploade dans `recipe-images` et met à jour
 * `recipes.source_image_url`. Retourne l'URL publique. Lève en cas d'échec —
 * l'appelant décide (réponse HTTP ou simple warn en tâche de fond).
 */
export async function generateAndStoreRecipeImage(
  supabase: SupabaseClient,
  config: AIConfig,
  params: { userId: string; recipeId: string; title: string; ingredients: unknown }
): Promise<string> {
  const prompt = buildRecipeImagePrompt(params.title, params.ingredients);
  const { bytes, mimeType } = await generateImage(config, prompt);

  const extension = mimeType.split("/")[1]?.split("+")[0] || "png";
  const fileName = `${params.userId}/${params.recipeId}-${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("recipe-images")
    .upload(fileName, bytes, { contentType: mimeType, upsert: true });
  if (uploadError) {
    console.error("Upload error:", uploadError);
    throw new Error("Failed to upload image");
  }

  const { data: urlData } = supabase.storage.from("recipe-images").getPublicUrl(fileName);
  const publicUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("recipes")
    .update({ source_image_url: publicUrl })
    .eq("id", params.recipeId);
  if (updateError) {
    console.error("Update error:", updateError);
    throw new Error("Failed to update recipe");
  }

  return publicUrl;
}

function decodeBase64(base64: string): Uint8Array {
  const cleaned = base64.replace(/^data:image\/\w+;base64,/, "");
  return Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
}
