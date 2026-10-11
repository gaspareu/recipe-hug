// Vérification intégrée sur le projet dev : deux adaptations IA réelles, aucune
// écriture Cookidoo. --local-mock-ai utilise le backend local et une IA simulée. Identifiants lus dans les fichiers ignorés, jamais affichés.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
const env = { ...loadEnv('development', process.cwd(), 'VITE_'), ...loadEnv('test', process.cwd(), 'TEST_') };
assert.equal(env.VITE_SUPABASE_URL, 'https://dltaxjvwtxjpbzcwdqvu.supabase.co');
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: auth, error: authError } = await client.auth.signInWithPassword({ email: env.TEST_EMAIL, password: env.TEST_PASSWORD });
assert.ifError(authError);
const localMock = process.argv.includes('--local-mock-ai');
let server;
if (localMock) {
  // La clé reste en mémoire et dans l'environnement du processus enfant.
  const keys = JSON.parse(execFileSync('node_modules/.bin/supabase', ['projects', 'api-keys', '--project-ref', 'dltaxjvwtxjpbzcwdqvu', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  const serviceKey = keys.find(k => k.name === 'service_role')?.api_key;
  assert(serviceKey, 'Clé de service dev absente');
  server = spawn('deno', ['run', '--config', 'supabase/functions/deno.json', '--frozen', '--allow-env', '--allow-net', 'scripts/verification/cookidoo-adaptation-mock-ai.ts'], { env: { ...process.env, SUPABASE_URL: env.VITE_SUPABASE_URL, SUPABASE_ANON_KEY: env.VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY: serviceKey, AI_KEYS_ENCRYPTION_SECRET: randomBytes(32).toString('hex'), ANTHROPIC_API_KEY: 'mock-provider' }, stdio: ['ignore', 'ignore', 'pipe'] });
  server.stderr.on('data', chunk => { const text = String(chunk); if (/error:/i.test(text)) console.error(text.replace(/eyJ[\w.-]+/g, '[secret]')); });
  process.on('exit', () => server.kill());
  for (let n = 0; n < 30; n++) { try { if ((await fetch('http://127.0.0.1:8000')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 200)); }
}
async function edge(options) {
  if (!localMock) return client.functions.invoke('export-recipe-cookidoo', options);
  const response = await fetch('http://127.0.0.1:8000', { method: options.method ?? 'POST', headers: { Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
  return { data: await response.json(), error: response.ok ? null : new Error('HTTP local inattendu') };
}
const recipes = [
  { title: 'Pain classique', servings: 4, ingredients: [{ name: 'farine', quantity: 300, unit: 'g' }, { name: 'eau', quantity: 180, unit: 'ml' }, { name: 'levure boulangère', quantity: 5, unit: 'g' }, { name: 'sel', quantity: 5, unit: 'g' }], steps: [{ order: 1, text: 'Mélanger la farine, la levure, le sel et l’eau dans un saladier, puis pétrir à la main pendant 8 minutes.' }, { order: 2, text: 'Laisser lever la pâte pendant 1 heure, façonner un pain et laisser lever encore 30 minutes.' }, { order: 3, text: 'Préchauffer le four à 220 °C puis enfourner et cuire 30 minutes.' }] },
  { title: 'Bao classiques', servings: 4, ingredients: [{ name: 'farine', quantity: 315, unit: 'g' }, { name: 'eau', quantity: 80, unit: 'ml' }, { name: 'lait', quantity: 120, unit: 'ml' }, { name: 'levure boulangère', quantity: 1, unit: 'sachet' }, { name: 'huile', quantity: 2, unit: 'c. à soupe' }, { name: 'sucre', quantity: 4, unit: 'c. à soupe' }, { name: 'sel', quantity: 2, unit: 'pincées' }], steps: [{ order: 1, text: 'Mélanger tous les ingrédients dans un saladier et pétrir à la main 8 minutes.' }, { order: 2, text: 'Laisser lever 1 heure, façonner les bao puis laisser reposer 30 minutes.' }, { order: 3, text: 'Cuire les bao à la vapeur pendant 10 minutes.' }] },
];
async function invoke(body) {
  const { data, error } = await edge({ body });
  assert.ifError(error);assert.equal(data?.ok, true, JSON.stringify(data));return data;
}
async function finish(id) {
  for (let n = 0; n < 40; n++) {
    const state = await invoke({ action: 'status', recipe_id: id });
    if (state.adaptation?.status !== 'preparing') return state;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Adaptation non terminée dans le délai du test');
}
const { data: capability, error: capabilityError } = await edge({ method: 'GET' });
assert.ifError(capabilityError);assert(capability.capabilities.includes('cookidoo_adaptation_v2'));
for (const [index, source] of recipes.entries()) {
  const { data: row, error } = await client.from('recipes').insert({ ...source, title: `VERIFY ${source.title} ${Date.now()}`, user_id: auth.user.id }).select('id').single();
  assert.ifError(error);
  try {
    await invoke({ action: 'prepare', recipe_id: row.id, ...(index === 1 ? { technical_water_ml: 500 } : {}) });
    const first = await finish(row.id);
    assert.equal(first.adaptation?.status, 'ready', JSON.stringify({ status: first.adaptation?.status, code: first.adaptation?.error_code, blockers: first.adaptation?.blockers }));
    assert(first.adaptation.guided_steps > 0);
    const cached = await invoke({ action: 'prepare', recipe_id: row.id });
    assert.equal(cached.adaptation.id, first.adaptation.id);assert.equal(cached.adaptation.reused, true);
    await client.from('recipes').update({ title: 'VERIFY nouveau titre', is_favorite: true }).eq('id', row.id);
    const renamed = await invoke({ action: 'prepare', recipe_id: row.id });
    assert.equal(renamed.adaptation.id, first.adaptation.id);assert.equal(renamed.adaptation.recipe.title, 'VERIFY nouveau titre');
    const { data: unchanged, error: readError } = await client.from('recipes').select('ingredients,steps').eq('id', row.id).single();
    assert.ifError(readError);assert.deepEqual(unchanged.ingredients, source.ingredients);assert.deepEqual(unchanged.steps, source.steps);
    console.log(`OK ${source.title} : ${first.adaptation.recipe.steps.length} étapes adaptées, ${first.adaptation.guided_steps} commandes ; copie réutilisée après renommage et favori ; source intacte.`);
  } finally {
    const { error: cleanupError } = await client.from('recipes').delete().eq('id', row.id);
    assert.ifError(cleanupError);
  }
}

server?.kill();
