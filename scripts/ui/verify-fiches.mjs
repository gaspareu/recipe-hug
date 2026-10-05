/** Vérification locale des fiches avec données fictives ; aucune requête vers un backend réel. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const baseURL = process.env.FICHES_BASE_URL || 'http://127.0.0.1:8082';
if (new URL(baseURL).hostname !== '127.0.0.1') throw new Error('Serveur local requis');
const output = process.env.FICHES_OUTPUT || '/private/tmp/recipe-hug-fiches-preview';
await mkdir(output, { recursive: true });
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'demo@example.test', role: 'authenticated', aud: 'authenticated' };
const defaults = { user_id: user.id, status: 'validated', is_favorite: false, servings: 4, season: null, nutrition_tags: [], calorie_score: null, source_type: 'manual', source_image_url: null, created_at: '2026-10-04', updated_at: '2026-10-04' };
const recipes = [
  { ...defaults, id: 'carottes', title: 'Carottes au cumin', entry_kind: 'preparation', ai_summary: 'Des carottes fondantes et parfumées, à servir seules ou à associer à votre repas.', ingredients: [{ name: 'Carottes', quantity: 600, unit: 'g', category: 'Légumes' }, { name: 'Cumin', quantity: 2, unit: 'c. à café', category: 'Épicerie' }, { name: 'Huile d’olive', quantity: 2, unit: 'c. à soupe', category: 'Épicerie' }], steps: [{ order: 1, title: 'Préparer les carottes', text: 'Éplucher les carottes puis les couper en bâtonnets réguliers.' }, { order: 2, title: 'Rôtir au cumin', duration_minutes: 25, text: 'Mélanger avec l’huile et le cumin. Disposer sur une plaque puis enfourner jusqu’à ce que les carottes soient tendres.' }] },
  { ...defaults, id: 'riz', title: 'Riz aux herbes', entry_kind: 'preparation', ingredients: [{ name: 'Riz', quantity: 240, unit: 'g' }], steps: [{ order: 1, text: 'Cuire le riz puis ajouter les herbes.' }] },
  { ...defaults, id: 'sauce', title: 'Sauce au yaourt', entry_kind: 'preparation', ingredients: [{ name: 'Yaourt', quantity: 200, unit: 'g' }], steps: [{ order: 1, text: 'Mélanger le yaourt et le citron.' }] },
];
const items = recipes.map((recipe, index) => ({ id: `item-${index}`, user_id: user.id, composition_id: 'plat', position: index, recipe_id: recipe.id, child_composition_id: null, quantity_factor: 1, course: null, notes: null }));
const compositions = [{ id: 'plat', user_id: user.id, kind: 'dish', title: 'Carottes, riz et sauce au yaourt', servings: 4, assembly_steps: ['Répartir le riz, déposer les carottes et servir la sauce à part.'], created_at: defaults.created_at, updated_at: defaults.updated_at }, { id: 'menu', user_id: user.id, kind: 'menu', title: 'Menu du dimanche', servings: 4, assembly_steps: [], created_at: defaults.created_at, updated_at: defaults.updated_at }];
items.push({ ...items[0], id: 'menu-item', composition_id: 'menu', recipe_id: null, child_composition_id: 'plat', course: 'Plat' });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  // Un serveur Vite local peut être configuré sur un backend distant : le bloquer
  // avant toute navigation, même si les variables du serveur sont incorrectes.
  await page.route('**/*', route => {
    const origin = new URL(route.request().url()).origin;
    if ([new URL(baseURL).origin, 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(origin)) return route.continue();
    return route.abort('blockedbyclient');
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:54321/**', async route => {
    const url = new URL(route.request().url());
    let data = [];
    if (url.pathname.endsWith('/auth/v1/user')) data = user;
    else if (url.pathname.endsWith('/recipes')) {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      data = id ? recipes.find(recipe => recipe.id === id) : recipes;
    } else if (url.pathname.endsWith('/recipe_pairing_profiles')) data = { recipe_id: 'carottes', roles: ['accompagnement'], flavors: [], textures: [], equipment: [], allergens: [], allergen_review_state: 'unknown', dietary_review_state: 'unknown', dietary_compatibilities: [], dietary_exclusions: [], active_minutes: null, make_ahead: false };
    else if (url.pathname.endsWith('/compositions')) data = compositions;
    else if (url.pathname.endsWith('/composition_items')) data = items;
    else if (url.pathname.endsWith('/profiles_safe')) data = { display_name: 'Démo' };
    else if (url.pathname.endsWith('/recommend-pairings')) data = { suggestions: [{ recipeId: 'sauce', score: 10, reason: 'Une sauce fraîche pour accompagner les carottes.' }, { recipeId: 'riz', score: 8, reason: 'Une base douce pour compléter le plat.' }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.addInitScript(({ user }) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const encode = value => btoa(JSON.stringify(value));
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: user.id, exp })}.fixture`, refresh_token: 'fixture', expires_at: exp, expires_in: 3600, token_type: 'bearer', user }));
  }, { user });
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseURL}/recipes/carottes`);
    await page.getByText('Préparation · Accompagnement', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Choisir', exact: true }).first().waitFor();
    await page.getByRole('spinbutton', { name: 'Portions' }).fill('6');
    await page.getByRole('checkbox', { name: '900 g Carottes' }).waitFor();
    const carrotCheck = page.getByRole('checkbox', { name: '900 g Carottes' });
    if (await carrotCheck.getAttribute('aria-checked') === 'true') await carrotCheck.click();
    await carrotCheck.focus();
    await page.keyboard.press('Space');
    assert.equal(await page.getByRole('checkbox', { name: '900 g Carottes' }).getAttribute('aria-checked'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${output}/preparation-${width}.png`, fullPage: true, animations: 'disabled' });
    await page.getByRole('link', { name: 'Choisir', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Créer un plat composé' }).waitFor();
    assert.equal(await page.getByRole('spinbutton', { name: 'Portions' }).inputValue(), '6');
    for (const kind of ['plat', 'menu']) {
      await page.goto(`${baseURL}/compositions/${kind}`);
      await page.getByRole('button', { name: kind === 'plat' ? 'Cuisiner le plat' : 'Cuisiner le menu' }).waitFor();
      await page.getByRole('spinbutton', { name: 'Portions' }).fill('6');
      await page.getByRole('checkbox', { name: '900 g Carottes' }).waitFor();
      await page.getByRole('tab', { name: 'Par préparation' }).click();
      await page.getByRole('checkbox', { name: '900 g Carottes' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `${output}/${kind}-${width}.png`, fullPage: true, animations: 'disabled' });
    }
  }
  assert.deepEqual(errors, []);
  console.log('Fiches vérifiées à 375, 768 et 1440 px : portions, clavier, accords, plat et menu ; aucune erreur JS. Données simulées uniquement.');
  console.log(`Captures : ${output}`);
} finally { await browser.close(); }
