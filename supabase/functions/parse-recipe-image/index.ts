import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveAIConfig } from "../_shared/ai-config.ts";
import { buildVisionRequest, buildRequestHeaders, extractContentFromResponse } from "../_shared/ai-providers.ts";

// SSRF protection: validate URL is safe
function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") return false;

    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return false;
    if (hostname === "169.254.169.254") return false;

    const parts = hostname.split(".");
    if (parts.length === 4) {
      const firstOctet = parseInt(parts[0], 10);
      const secondOctet = parseInt(parts[1], 10);
      if (firstOctet === 10) return false;
      if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) return false;
      if (firstOctet === 192 && secondOctet === 168) return false;
      if (firstOctet === 169 && secondOctet === 254) return false;
    }

    return true;
  } catch {
    return false;
  }
}

const RequestSchema = z.object({
  image_url: z
    .string()
    .url("Invalid URL format")
    .max(2000, "URL too long")
    .refine(isUrlSafe, "URL is not allowed (must be HTTPS and not internal)"),
});

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction de recettes de cuisine à partir d'images.
Analyse l'image fournie et extrais les informations suivantes au format JSON strict:

{
  "title": "string - titre de la recette",
  "servings": "number | null - nombre de portions si visible",
  "ingredients": [
    {
      "name": "string - nom de l'ingrédient",
      "quantity": "string - quantité (ex: '200', '1/2')",
      "unit": "string - unité (ex: 'g', 'ml', 'pièce', 'c. à soupe')",
      "category": "string - catégorie optionnelle (légumes, viandes, épices, etc.)"
    }
  ],
  "steps": [
    {
      "order": "number - numéro de l'étape (1, 2, 3...)",
      "text": "string - description de l'étape"
    }
  ]
}

Règles importantes:
- Si une information n'est pas visible ou lisible, utilise null ou un tableau vide
- Nettoie et structure les données même si l'écriture est manuscrite
- Pour les quantités, sépare le nombre de l'unité. Si les quantités ne sont pas en mesures francaises, converties les. 
- Numérote les étapes dans l'ordre logique
- Réponds UNIQUEMENT avec le JSON, sans texte explicatif ni markdown`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return new Response(JSON.stringify({ error: parseResult.error.errors[0]?.message || "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { image_url } = parseResult.data;

    // Resolve AI configuration
    const aiConfig = await resolveAIConfig(supabaseClient, userId, {
      agentType: "parse_image",
      defaultModel: "google/gemini-2.5-pro",
      requiredCapabilities: ["vision"],
    });
    console.log(`Parsing recipe image for user ${userId} using ${aiConfig.provider}/${aiConfig.model}`);

    // Build and send request
    const requestBody = buildVisionRequest(aiConfig, SYSTEM_PROMPT, image_url, "Analyse cette image de recette et extrais les informations au format JSON.");
    const headers = buildRequestHeaders(aiConfig);

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Trop de requêtes. Veuillez réessayer dans quelques instants." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Crédits IA insuffisants. Veuillez recharger votre compte." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = extractContentFromResponse(aiConfig, aiResponse);

    if (!content) {
      throw new Error("No content in AI response");
    }

    console.log("AI response content received");

    let jsonContent = content.trim();
    if (jsonContent.startsWith("```json")) jsonContent = jsonContent.slice(7);
    if (jsonContent.startsWith("```")) jsonContent = jsonContent.slice(3);
    if (jsonContent.endsWith("```")) jsonContent = jsonContent.slice(0, -3);
    jsonContent = jsonContent.trim();

    const parsedRecipe = JSON.parse(jsonContent);
    console.log("Parsed recipe:", parsedRecipe.title);

    return new Response(
      JSON.stringify({ success: true, recipe: parsedRecipe }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error parsing recipe image:", error);
    return new Response(
      JSON.stringify({ error: "Failed to parse recipe image", success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
