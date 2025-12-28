import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Generating recipe for prompt:', prompt);

    const systemPrompt = `Tu es un chef cuisinier expert. Génère une recette complète basée sur la demande de l'utilisateur.

Réponds UNIQUEMENT avec un JSON valide au format suivant, sans texte explicatif:
{
  "title": "Nom de la recette",
  "servings": 4,
  "ingredients": [
    {"name": "nom ingrédient", "quantity": "100", "unit": "g", "category": "légumes"},
    ...
  ],
  "steps": [
    {"order": 1, "text": "Description de l'étape"},
    ...
  ]
}

Règles:
- Utilise des quantités réalistes
- Les catégories possibles: légumes, fruits, viandes, poissons, produits laitiers, épices, autres
- Les étapes doivent être claires et détaillées
- Génère entre 5-15 ingrédients et 4-10 étapes selon la complexité`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response:', content);

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in response');
    }

    const recipeData = JSON.parse(jsonMatch[0]);

    // Validate structure
    if (!recipeData.title || !Array.isArray(recipeData.ingredients) || !Array.isArray(recipeData.steps)) {
      throw new Error('Invalid recipe structure');
    }

    console.log('Generated recipe:', recipeData.title);

    return new Response(
      JSON.stringify(recipeData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating recipe:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate recipe';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
