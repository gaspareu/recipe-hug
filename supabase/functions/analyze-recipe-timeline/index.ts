import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Step {
  order: number;
  text: string;
}

interface AnalyzedStep {
  order: number;
  duration_minutes: number;
  parallel_with: number[];
  start_offset: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prepare steps for analysis
    const stepsText = (steps as Step[])
      .sort((a, b) => a.order - b.order)
      .map((s, i) => `Étape ${i + 1}: ${s.text}`)
      .join("\n");

    const systemPrompt = `Tu es un expert culinaire. Analyse les étapes d'une recette et estime:
1. La durée en minutes de chaque étape
2. Les étapes qui peuvent être faites en parallèle (pendant qu'une autre se déroule)

Réponds UNIQUEMENT avec l'appel de fonction, pas de texte.`;

    const userPrompt = `Analyse ces étapes de recette et estime les durées et le parallélisme:

${stepsText}

Pour chaque étape, indique:
- duration_minutes: durée estimée en minutes (inclure temps de cuisson, repos, etc.)
- parallel_with: numéros des étapes qui peuvent être faites EN MÊME TEMPS que celle-ci

Exemple: si l'étape 2 dit "Pendant ce temps, préparez...", elle peut être faite en parallèle avec l'étape 1.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
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
                          description: "Numéros des étapes qui peuvent être faites en parallèle" 
                        },
                      },
                      required: ["order", "duration_minutes", "parallel_with"],
                    },
                  },
                },
                required: ["steps"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_timeline" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ error: "AI response format error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const analysisResult = JSON.parse(toolCall.function.arguments);
    const analyzedSteps = analysisResult.steps as Array<{
      order: number;
      duration_minutes: number;
      parallel_with: number[];
    }>;

    // Calculate start_offset for Gantt chart positioning
    // Build a map of original step orders to their positions
    const originalSteps = (steps as Step[]).sort((a, b) => a.order - b.order);
    const orderMap = new Map<number, number>();
    originalSteps.forEach((s, i) => orderMap.set(s.order, i + 1));

    // Calculate start offsets considering parallelism
    const stepsWithOffsets: AnalyzedStep[] = [];
    const stepEndTimes = new Map<number, number>();
    
    for (const step of analyzedSteps.sort((a, b) => a.order - b.order)) {
      let startOffset = 0;
      
      // If this step can run in parallel with others, find the earliest start time
      if (step.parallel_with.length > 0) {
        // Start at the same time as the parallel step
        const parallelStarts = step.parallel_with
          .map(p => stepEndTimes.get(p) !== undefined ? stepEndTimes.get(p)! - (analyzedSteps.find(s => s.order === p)?.duration_minutes || 0) : 0)
          .filter(t => t >= 0);
        
        if (parallelStarts.length > 0) {
          startOffset = Math.min(...parallelStarts);
        }
      } else {
        // Sequential: start after previous step ends
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
      });
    }

    const timelineData = {
      analyzed_at: new Date().toISOString(),
      total_time: Math.max(...Array.from(stepEndTimes.values())),
      steps: stepsWithOffsets,
    };

    // Save to database using service role for the update
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
      // Still return the data even if save fails
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
