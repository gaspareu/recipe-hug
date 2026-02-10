import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveAIConfig } from "../_shared/ai-config.ts";
import { buildToolCallRequest, extractToolCallResult } from "../_shared/ai-providers.ts";

interface Step {
  order: number;
  text: string;
}

interface AnalyzedStep {
  order: number;
  duration_minutes: number;
  parallel_with: number[];
  start_offset: number;
  is_passive: boolean;
}

const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "analyze_timeline",
    description: "Retourne l'analyse temporelle des étapes de la recette",
    parameters: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              order: { type: "number", description: "Numéro de l'étape (1, 2, 3...)" },
              duration_minutes: { type: "number", description: "Durée estimée en minutes" },
              parallel_with: {
                type: "array",
                items: { type: "number" },
                description: "Numéros des étapes qui peuvent être faites en parallèle",
              },
              is_passive: {
                type: "boolean",
                description: "true si tâche passive (cuisson, repos, marinade), false si tâche active (couper, mélanger)",
              },
            },
            required: ["order", "duration_minutes", "parallel_with", "is_passive"],
          },
        },
      },
      required: ["steps"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { recipeId, steps } = await req.json();

    if (!recipeId || !steps || !Array.isArray(steps)) {
      return new Response(JSON.stringify({ error: "Missing recipeId or steps" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve AI config
    const aiConfig = await resolveAIConfig(supabaseClient, user.id, {
      agentType: "timeline",
      defaultModel: "google/gemini-3-flash-preview",
      requiredCapabilities: ["tools"],
    });
    console.log(`Analyzing timeline using ${aiConfig.provider}/${aiConfig.model}`);

    if (!aiConfig.apiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stepsText = (steps as Step[])
      .sort((a, b) => a.order - b.order)
      .map((s, i) => `Étape ${i + 1}: ${s.text}`)
      .join("\n");

    const systemPrompt = `Tu es un expert culinaire. Analyse les étapes d'une recette pour créer un diagramme de Gantt réaliste.

RÈGLES CRITIQUES pour le parallélisme:
1. Une personne ne peut faire qu'UNE SEULE tâche active à la fois (couper, mélanger, nettoyer, éplucher, etc.)
2. Le parallélisme est UNIQUEMENT possible quand une étape est PASSIVE (cuisson au four, mijotage, repos, marinade, refroidissement)
3. Pendant une tâche passive, on peut faire d'autres tâches actives

EXEMPLES:
- "Faire cuire au four 20 min" = tâche passive → les étapes suivantes peuvent être en parallèle
- "Nettoyer les légumes" = tâche active → NE PEUT PAS être en parallèle avec "Couper la viande"
- "Laisser reposer 10 min" = tâche passive → parallélisme possible
- "Mélanger les ingrédients" = tâche active → pas de parallélisme

Réponds UNIQUEMENT avec l'appel de fonction.`;

    const userPrompt = `Analyse ces étapes de recette:

${stepsText}

Pour chaque étape:
- duration_minutes: durée estimée en minutes
- parallel_with: UNIQUEMENT les numéros d'étapes PASSIVES (cuisson, repos, marinade) pendant lesquelles cette étape peut être réalisée

IMPORTANT: Deux tâches actives (couper, mélanger, nettoyer) ne peuvent JAMAIS être en parallèle car une seule personne cuisine.`;

    const { headers, body } = buildToolCallRequest(aiConfig, systemPrompt, userPrompt, [TOOL_DEFINITION], "analyze_timeline");

    const response = await fetch(aiConfig.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const analysisResult = extractToolCallResult(aiConfig, aiData);

    if (!analysisResult?.steps) {
      console.error("No tool call in response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI response format error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const analyzedSteps = analysisResult.steps as Array<{
      order: number;
      duration_minutes: number;
      parallel_with: number[];
      is_passive: boolean;
    }>;

    // Calculate start offsets
    const stepsWithOffsets: AnalyzedStep[] = [];
    const stepEndTimes = new Map<number, number>();

    for (const step of analyzedSteps.sort((a, b) => a.order - b.order)) {
      let startOffset = 0;

      if (step.parallel_with.length > 0) {
        const parallelStarts = step.parallel_with
          .map(p => stepEndTimes.get(p) !== undefined ? stepEndTimes.get(p)! - (analyzedSteps.find(s => s.order === p)?.duration_minutes || 0) : 0)
          .filter(t => t >= 0);

        if (parallelStarts.length > 0) {
          startOffset = Math.min(...parallelStarts);
        }
      } else {
        const prevStep = step.order - 1;
        if (stepEndTimes.has(prevStep)) {
          startOffset = stepEndTimes.get(prevStep)!;
        }
      }

      stepEndTimes.set(step.order, startOffset + step.duration_minutes);

      stepsWithOffsets.push({
        order: step.order,
        duration_minutes: step.duration_minutes,
        parallel_with: step.parallel_with,
        start_offset: startOffset,
        is_passive: step.is_passive ?? false,
      });
    }

    const timelineData = {
      analyzed_at: new Date().toISOString(),
      total_time: Math.max(...Array.from(stepEndTimes.values())),
      steps: stepsWithOffsets,
    };

    // Save to database
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: updateError } = await supabaseAdmin
      .from("recipes")
      .update({ timeline_data: timelineData })
      .eq("id", recipeId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error saving timeline:", updateError);
    }

    return new Response(JSON.stringify(timelineData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in analyze-recipe-timeline:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
