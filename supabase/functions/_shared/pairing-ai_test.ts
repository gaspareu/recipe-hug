import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { buildPairingPrompt, parsePairingAIResponse } from './pairing-ai.ts';

const eligible = [
  { recipeId: 'riz', score: 10, reason: 'Une base.' },
  { recipeId: 'sauce', score: 8, reason: 'Une sauce.' },
  { recipeId: 'salade', score: 7, reason: 'Un accompagnement.' },
];

Deno.test('accords IA : accepte le reclassement des seuls candidats vérifiés', () => {
  const result = parsePairingAIResponse(JSON.stringify({ recipe_ids: ['C2', 'C1', 'C3'] }), eligible);
  assertEquals(result?.map(item => item.recipeId), ['sauce', 'riz', 'salade']);
  assertEquals(result?.[0].score, 8);
  assertEquals(result?.[0].reason, 'Une sauce.');
  assertEquals(parsePairingAIResponse(`\`\`\`json\n${JSON.stringify({ recipe_ids: ['C1', 'C2', 'C3'] })}\n\`\`\``, eligible)?.length, 3);
});

Deno.test('accords IA : refuse ID inconnu, doublon et réponse incomplète', () => {
  assertEquals(parsePairingAIResponse('{"recipe_ids":["autre","C1","C3"]}', eligible), null);
  assertEquals(parsePairingAIResponse(JSON.stringify({ recipe_ids: ['C1', 'C1', 'C3'] }), eligible), null);
  assertEquals(parsePairingAIResponse(JSON.stringify({ recipe_ids: ['riz', 'sauce', 'salade'] }), eligible), null);
  assertEquals(parsePairingAIResponse('pas du JSON', eligible), null);
});

Deno.test('accords IA : garde toujours une raison déterministe', () => {
  const result = parsePairingAIResponse(JSON.stringify({ recipe_ids: ['C1', 'C2', 'C3'], reason: 'Sans arachides.' }), eligible);
  assertEquals(result?.[0].reason, 'Une base.');
});

Deno.test('accords IA : transmet un contexte culinaire borné sans contraintes personnelles', () => {
  const prompt = buildPairingPrompt({ title: 'Plat principal', roles: ['base'], flavors: ['doux'], textures: ['croquant'], season: null },
    [{ id: 'C1', title: 'Riz', roles: ['base'], flavors: ['doux'], textures: ['moelleux'], season: null, activeMinutes: 10 }]);
  assertStringIncludes(prompt, '"id":"C1"');
  assertEquals(prompt.includes('allerg'), false);
});
