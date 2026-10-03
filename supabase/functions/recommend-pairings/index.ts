import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { rankPairings, type PairingConstraints, type PairingMetadata, type PairingRecipe } from '../_shared/pairing-rank.ts';
import { buildPairingPrompt, parsePairingAIResponse } from '../_shared/pairing-ai.ts';
import { resolveAIConfig } from '../_shared/ai-config.ts';
import { callAINonStreaming } from '../_shared/ai-providers.ts';

const RequestSchema = z.object({
  recipe_id: z.string().uuid(),
  max_active_minutes: z.number().int().min(0).max(600).optional(),
  include_drafts: z.boolean().optional(),
});

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Méthode non autorisée' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Authentification requise' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) return response({ error: 'Configuration indisponible' }, 503);

  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return response({ error: 'Entrée invalide' }, 400);
    const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: claims, error: claimsError } = await client.auth.getClaims(authorization.slice(7));
    if (claimsError || !claims?.claims?.sub) return response({ error: 'Jeton invalide' }, 401);
    const userId = claims.claims.sub;

    const { data: source, error: sourceError } = await client.from('recipes')
      .select('id, title, entry_kind, status, season, ingredients').eq('id', parsed.data.recipe_id).eq('user_id', userId).maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return response({ error: 'Fiche introuvable' }, 404);

    const [{ data: candidates, error: candidatesError }, { data: profiles, error: profilesError },
      { data: preferences, error: preferencesError }, { data: feedback, error: feedbackError }] = await Promise.all([
      client.from('recipes').select('id, title, entry_kind, status, season, ingredients')
        .eq('user_id', userId).neq('status', 'archived').limit(200),
      client.from('recipe_pairing_profiles').select('*').eq('user_id', userId).limit(200),
      client.from('user_culinary_preferences').select('dietary_constraints, taste_preferences, kitchen_equipment')
        .eq('user_id', userId).maybeSingle(),
      client.from('pairing_feedback').select('candidate_recipe_id, signal')
        .eq('user_id', userId).eq('source_recipe_id', source.id).limit(200),
    ]);
    if (candidatesError || profilesError || preferencesError || feedbackError) {
      throw candidatesError || profilesError || preferencesError || feedbackError;
    }
    const dietary = preferences?.dietary_constraints as Record<string, unknown> | undefined;
    const taste = preferences?.taste_preferences as Record<string, unknown> | undefined;
    const equipment = preferences?.kitchen_equipment as Record<string, unknown> | undefined;
    const strings = (value: unknown): string[] => Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string').map(entry => entry.trim()).filter(Boolean)
      : [];
    const constraints: PairingConstraints = {
      allergies: strings(dietary?.allergies), diets: strings(dietary?.diets),
      restrictions: strings(dietary?.restrictions),
      dislikedIngredients: strings(taste?.disliked_ingredients),
      unavailableEquipment: strings(equipment?.unavailable),
      maxActiveMinutes: parsed.data.max_active_minutes,
    };
    const allowed = (candidates ?? []).filter(candidate =>
      parsed.data.include_drafts || candidate.status === 'tested' || candidate.status === 'validated');
    const signals = Object.fromEntries((feedback ?? []).map(item => [item.candidate_recipe_id, item.signal]));
    const toRecipe = (row: typeof source): PairingRecipe => ({
      id: row.id, entry_kind: row.entry_kind, status: row.status, season: row.season,
      ingredients: Array.isArray(row.ingredients) ? row.ingredients.filter((item): item is { name: string } =>
        typeof item === 'object' && item !== null && !Array.isArray(item) && typeof item.name === 'string') : [],
    });
    const ranked = rankPairings(toRecipe(source), allowed.map(toRecipe),
      (profiles ?? []) as PairingMetadata[], constraints, [], signals).slice(0, 8);
    if (ranked.length === 0) return response({ suggestions: [], mode: 'deterministic' });

    try {
      const aiConfig = await resolveAIConfig(client, userId, {
        agentType: 'pairing', defaultModel: 'claude-haiku-4-5',
      });
      if (aiConfig.apiKey) {
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!serviceRoleKey) throw new Error('Quota IA indisponible');
        const quotaClient = createClient(url, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: quotaAllowed, error: quotaError } = await quotaClient.rpc(
          'consume_pairing_ai_quota', { p_user_id: userId },
        );
        if (quotaError || quotaAllowed !== true) throw new Error('Quota IA atteint ou indisponible');
        const candidateMap = new Map(allowed.map(candidate => [candidate.id, candidate]));
        const profileMap = new Map((profiles ?? []).map(profile => [profile.recipe_id, profile]));
        const sourceProfile = profileMap.get(source.id);
        const prompt = buildPairingPrompt({
          title: source.title, roles: sourceProfile?.roles ?? [],
          flavors: sourceProfile?.flavors ?? [], textures: sourceProfile?.textures ?? [],
          season: source.season,
        }, ranked.map((item, index) => {
          const candidate = candidateMap.get(item.recipeId)!;
          const profile = profileMap.get(item.recipeId);
          return {
            id: `C${index + 1}`, title: candidate.title, roles: profile?.roles ?? [],
            flavors: profile?.flavors ?? [], textures: profile?.textures ?? [],
            season: candidate.season, activeMinutes: profile?.active_minutes ?? null,
          };
        }));
        const raw = await callAINonStreaming(aiConfig, [
          { role: 'system', content: 'Classe les accords culinaires vérifiés et renvoie seulement leurs ID en JSON.' },
          { role: 'user', content: prompt },
        ], AbortSignal.timeout(8000));
        const aiSuggestions = parsePairingAIResponse(raw, ranked);
        if (aiSuggestions) return response({ suggestions: aiSuggestions, mode: 'ai' });
      }
    } catch (error) {
      console.warn('recommend-pairings: repli local après échec IA', error instanceof Error ? error.name : 'erreur inconnue');
    }
    return response({ suggestions: ranked.slice(0, 3), mode: 'deterministic' });
  } catch (error) {
    console.error('recommend-pairings:', error instanceof Error ? error.message : 'Erreur inconnue');
    return response({ error: 'Suggestions indisponibles' }, 500);
  }
});
