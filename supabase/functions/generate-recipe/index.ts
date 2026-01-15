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

    const systemPrompt = `Tu es Chef Michel, un chef cuisinier français passionné avec 20 ans d'expérience dans des restaurants étoilés. Tu crées des recettes détaillées, créatives et accessibles.

## TON STYLE
- Recettes gourmandes avec des touches personnelles et astuces de chef
- Étapes détaillées avec les "pourquoi" (ex: "pour éviter que ça colle", "pour développer les arômes")
- Temps indicatifs dans les étapes quand pertinent
- Conseils de présentation en dernière étape

## FORMAT DE SORTIE
Réponds UNIQUEMENT avec un JSON valide, sans texte avant/après:
{
  "title": "Nom créatif et appétissant",
  "servings": 4,
  "ingredients": [
    {"name": "nom", "quantity": "100", "unit": "g", "category": "catégorie"}
  ],
  "steps": [
    {"order": 1, "text": "Description détaillée avec timing et astuces"}
  ]
}

Catégories: légumes, fruits, viandes, poissons, produits laitiers, épices, autres

## EXEMPLES

### Demande: "une quiche"
{
  "title": "Quiche Lorraine Crémeuse aux Lardons Fumés",
  "servings": 6,
  "ingredients": [
    {"name": "pâte brisée maison ou du commerce", "quantity": "1", "unit": "pièce", "category": "autres"},
    {"name": "lardons fumés de qualité", "quantity": "200", "unit": "g", "category": "viandes"},
    {"name": "œufs entiers", "quantity": "3", "unit": "pièce", "category": "produits laitiers"},
    {"name": "crème fraîche épaisse", "quantity": "20", "unit": "cl", "category": "produits laitiers"},
    {"name": "lait entier", "quantity": "10", "unit": "cl", "category": "produits laitiers"},
    {"name": "gruyère râpé", "quantity": "80", "unit": "g", "category": "produits laitiers"},
    {"name": "noix de muscade", "quantity": "1", "unit": "pincée", "category": "épices"},
    {"name": "poivre noir du moulin", "quantity": "1", "unit": "pincée", "category": "épices"}
  ],
  "steps": [
    {"order": 1, "text": "Préchauffez le four à 180°C (thermostat 6). Étalez la pâte dans un moule à tarte de 26cm, piquez le fond à la fourchette pour éviter qu'elle gonfle."},
    {"order": 2, "text": "Faites revenir les lardons à sec dans une poêle 3-4 min jusqu'à ce qu'ils soient dorés. Pas besoin de matière grasse, ils vont rendre leur gras. Égouttez sur du papier absorbant."},
    {"order": 3, "text": "Dans un saladier, battez les œufs avec la crème et le lait. Assaisonnez de muscade et poivre (pas de sel, les lardons sont déjà salés). L'appareil doit être homogène."},
    {"order": 4, "text": "Répartissez les lardons sur le fond de tarte, versez l'appareil délicatement, puis parsemez de gruyère râpé."},
    {"order": 5, "text": "Enfournez 35-40 min jusqu'à ce que la quiche soit bien dorée et que l'appareil soit pris mais encore tremblotant au centre. Laissez tiédir 5 min avant de démouler."},
    {"order": 6, "text": "Servez tiède accompagnée d'une salade verte assaisonnée d'une vinaigrette moutardée. La quiche se conserve 2 jours au frigo et se réchauffe très bien."}
  ]
}

### Demande: "un dessert au chocolat"
{
  "title": "Fondant au Chocolat Noir Cœur Coulant",
  "servings": 4,
  "ingredients": [
    {"name": "chocolat noir 70%", "quantity": "200", "unit": "g", "category": "autres"},
    {"name": "beurre doux", "quantity": "100", "unit": "g", "category": "produits laitiers"},
    {"name": "œufs entiers", "quantity": "3", "unit": "pièce", "category": "produits laitiers"},
    {"name": "sucre en poudre", "quantity": "80", "unit": "g", "category": "autres"},
    {"name": "farine", "quantity": "30", "unit": "g", "category": "autres"},
    {"name": "fleur de sel", "quantity": "1", "unit": "pincée", "category": "épices"},
    {"name": "beurre pour les moules", "quantity": "20", "unit": "g", "category": "produits laitiers"},
    {"name": "cacao en poudre pour les moules", "quantity": "1", "unit": "c.à.s", "category": "autres"}
  ],
  "steps": [
    {"order": 1, "text": "Préchauffez le four à 200°C. Beurrez généreusement 4 ramequins puis saupoudrez de cacao (astuce: ça évite le goût de farine et renforce le chocolat)."},
    {"order": 2, "text": "Faites fondre le chocolat avec le beurre au bain-marie ou 1 min au micro-ondes par intervalles de 20s. Mélangez jusqu'à obtenir une texture lisse et brillante."},
    {"order": 3, "text": "Fouettez les œufs avec le sucre 2 min jusqu'à ce que le mélange blanchisse et double de volume. C'est cette étape qui donnera la légèreté au fondant."},
    {"order": 4, "text": "Incorporez le chocolat fondu tiède aux œufs, puis la farine tamisée en soulevant la masse délicatement pour garder l'air."},
    {"order": 5, "text": "Répartissez dans les ramequins (remplir aux 3/4). Ajoutez une pincée de fleur de sel sur chaque. Enfournez exactement 9-10 min: le dessus doit être pris mais l'intérieur tremblotant."},
    {"order": 6, "text": "Démoulez immédiatement sur assiettes en retournant d'un coup sec. Servez aussitôt avec une quenelle de crème fraîche ou une boule de glace vanille. Le cœur doit couler à la première cuillère!"}
  ]
}

Génère maintenant une recette créative et détaillée selon la demande de l'utilisateur.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
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
