# Edge Functions — Guide opérationnel

> Ce fichier complète `EDGE_FUNCTIONS.md` avec les informations de déploiement et d'exploitation.

## Déploiement via MCP Supabase

### Structure de fichiers à respecter

Le bundler MCP résout les imports relatifs à partir des **noms de fichiers fournis** dans le tableau `files`. Pour que les imports `../_shared/*.ts` fonctionnent, préfixer tous les noms par `functions/` et inclure les fichiers partagés :

```jsonc
// mcp deploy_edge_function
{
  "name": "home-assistant",
  "entrypoint_path": "functions/home-assistant/index.ts",
  "files": [
    { "name": "functions/home-assistant/index.ts", "content": "..." },
    { "name": "functions/_shared/cors.ts", "content": "..." },
    { "name": "functions/_shared/ai-config.ts", "content": "..." },
    { "name": "functions/_shared/ai-types.ts", "content": "..." },
    { "name": "functions/_shared/ai-providers.ts", "content": "..." },
    { "name": "functions/_shared/decrypt-keys.ts", "content": "..." },
    { "name": "functions/_shared/context-format.ts", "content": "..." }
  ]
}
```

⚠️ Sans le préfixe `functions/` (ex. `index.ts` seul à la racine), les imports `../_shared/` échouent au bundling (`Module not found`). Ne pas inclure les fichiers de test (`*_test.ts`).

⚠️ **Penser à redéployer** : modifier `supabase/functions/` dans le repo ne change rien en prod tant que la fonction n'est pas redéployée (MCP ou CLI). Vérifier après coup avec `get_edge_function` que la version a augmenté.

### Via CLI Supabase (local → remote)

```bash
supabase functions deploy <nom-fonction> --project-ref ifpqsyyvytfpossqycpc
```
Les imports `../_shared/` fonctionnent normalement avec la CLI.

### Déploiement automatique (CI) — voie privilégiée

`.github/workflows/deploy-edge-functions.yml` déploie **toutes** les fonctions
à chaque merge sur `main` touchant `supabase/functions/**` (`supabase functions
deploy`, qui respecte `config.toml`). C'est la voie normale : elle évite la
dérive « repo ≠ prod » des déploiements manuels depuis des sessions parallèles.
Le déploiement MCP/manuel reste utile pour un **hotfix immédiat** hors cycle de
merge — mais penser alors à merger le code correspondant pour ne pas régresser
au prochain déploiement CI.

> Prérequis (une fois) : secret de dépôt `SUPABASE_ACCESS_TOKEN`
> (Supabase Dashboard → Account → Access Tokens).

---

## Secrets configurés (Supabase Dashboard)

| Secret | Usage | Obligatoire |
|--------|-------|-------------|
| `ANTHROPIC_API_KEY` | IA par défaut (chat, analyse, génération texte) | Oui |
| `GEMINI_API_KEY` | Génération d'images côté serveur | Oui (images) |
| `AI_KEYS_ENCRYPTION_SECRET` | Chiffrement AES-GCM des clés API utilisateur | Oui |
| `APP_URL` | URL publique (`https://recipe-hug.vercel.app`) | Oui |
| `ELEVENLABS_API_KEY` | TTS + transcription Scribe | Oui (vocal) |

Les secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement par Supabase.

---

## Inventaire des fonctions déployées

Projet : `ifpqsyyvytfpossqycpc`

| Fonction | verify_jwt | Rôle |
|----------|-----------|------|
| `home-assistant` | true | Chat IA unifié (streaming) |
| `analyze-recipe` | true | Analyse nutritionnelle |
| `parse-recipe-image` | true | OCR image → recette |
| `generate-recipe-image` | true | Génération photo plat (Gemini) |
| `webhook-recipe` | **false** | Réception webhook externe |
| `manage-ai-keys` | true | CRUD clés API chiffrées |
| `validate-ai-key` | true | Test validité clé API |
| `elevenlabs-tts` | true | Text-to-speech |
| `elevenlabs-scribe-token` | true | Token STT temps réel |
| `share-recipe` | true | Partage recette par email/tél |
| `claim-shares` | true | Réclamer recettes partagées |
| `manage-cookidoo-credentials` | true | CRUD identifiants Cookidoo chiffrés (AES-GCM) |
| `export-recipe-cookidoo` | true | Export d'une recette vers Cookidoo (Thermomix) |

> **Politique** : `verify_jwt = true` partout (le gateway exige un JWT valide avant
> d'exécuter la fonction — défense en profondeur ; le front envoie déjà le JWT sur
> tous les appels). **Seule `webhook-recipe` est à `false`** : elle s'authentifie
> par un token webhook (UUID) et non par un JWT, donc la vérification du gateway
> rejetterait les appels externes légitimes. L'auth reste aussi gérée dans le corps
> des fonctions (double barrière). Défini dans `supabase/config.toml`.

---

## Génération d'images — détails techniques

- **Modèle** : `gemini-2.5-flash-image` (API native, pas l'endpoint OpenAI-compat)
- **Endpoint** : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent` — clé via l'en-tête `x-goog-api-key` (jamais en query string : une erreur réseau exposerait l'URL, donc la clé)
- **Format requête** : `{ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }`
- **Format réponse** : `candidates[0].content.parts[].inlineData.data` (base64) + `inlineData.mimeType`
- **Fallback** : si l'utilisateur a configuré un agent config `generate_image` avec DALL-E 3, c'est utilisé à la place

> **Attention** : le modèle `gemini-2.0-flash-exp-image-generation` n'existe plus dans l'API v1beta. Ne pas l'utiliser.

### Modèles image disponibles (clé AI Studio)
Pour vérifier les modèles disponibles pour une clé donnée :
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=VOTRE_CLE&pageSize=100" | jq '.models[].name'
```

---

## Résolution de config IA (`resolveAIConfig`)

```typescript
resolveAIConfig(supabase, userId, {
  agentType: "generate_image",   // identifiant de l'agent
  defaultProvider: "gemini",     // provider serveur si pas de config user
  defaultModel: "gemini-2.5-flash-image",
  requiredCapabilities: ["image_generation"],
})
```

Priorité : `agent_configs[agentType]` → settings globaux utilisateur → `defaultProvider`/`defaultModel` avec clé serveur.

Si `defaultProvider` est omis → fallback Anthropic + `ANTHROPIC_API_KEY`.

---

## Auth OAuth — redirect_to

Le callback OAuth Google doit pointer sur `/auth` (pas `/`) :
```typescript
// src/pages/Auth.tsx
redirectTo: `${window.location.origin}/auth`  // ✅
// redirectTo: window.location.origin          // ❌ React Router redirige / → /home, strippant le ?code=
```

---

## Connecteur Cookidoo (export Thermomix TM7)

Export d'une recette recipe-hug vers le compte Cookidoo de l'utilisateur (« Mes recettes créées »).
**Scope : TM7 uniquement** (TM6/TM5/TM31 retirés).

- **Référentiel TM7** : `_shared/thermomix/reference.ts` — la « base de référence » machine
  (vitesses 0.5-10 + Turbo/mijotage, températures 37-160 °C, Varoma = **mode** vapeur, modes,
  accessoires, barème de conversion action → réglage) + normalisation/validation. Miroir front
  strictement synchronisé : `src/lib/thermomix/reference.ts` (garde-fou `reference.sync.test.ts`).
  Alimente le prompt IA, le mapper et la validation.
- **Source unique** : `_shared/cookidoo/{auth,client,mapper,types,validate}.ts`. Le CLI
  `connector/cookidoo/cli.ts` importe **ces mêmes modules** (entrypoint mince, zéro duplication).
- **Modules** :
  - `mapper.ts` (pur, testé) → recipe-hug → payload Cookidoo. Annotations **TTS** (temps, vitesse,
    température, Varoma, sens inverse) construites en priorité depuis les champs structurés
    `step.tm7`, avec **repli regex** sur le texte pour les recettes existantes ; annotations
    **INGREDIENT** liant les noms d'ingrédients au texte (c'est ce qui rend une étape « guidée »).
    Seuls les types `TTS` et `INGREDIENT` existent (pas de MODE/STEAMING).
  - `validate.ts` (pur, testé) → contrôle structurel du payload **avant** tout appel réseau.
  - `auth.ts` → login PKCE/cookie (`_oauth2_proxy` + `v-authenticated`, **pas** de Bearer token).
  - `client.ts` → endpoints `/created-recipes` (create → attendre ~5 s → patch ; rate limit
    ~10 req/min). Ré-essais avec backoff sur 429 (respecte `Retry-After`) et 5xx ; le POST de
    création n'est **jamais** rejoué sur 5xx (réponse ambiguë → risque de doublon). `fetch`/`sleep`
    injectables via `ClientCtx` → retry testable sans délai réel.
- **Fonctions** :
  - `manage-cookidoo-credentials` — GET (statut, email masqué) / POST (upsert chiffré AES-GCM) / DELETE.
    Mot de passe chiffré via `AI_KEYS_ENCRYPTION_SECRET`, jamais renvoyé en clair. Stocké dans
    `user_cookidoo_credentials` (vue `_safe` sans `password_enc`).
  - `export-recipe-cookidoo` — lit la recette (RLS) + déchiffre les creds → **valide** → login →
    create **ou** update-in-place → patch → image.
    **Anti-doublon** : `recipes.cookidoo_recipe_id` mémorise la recette Cookidoo associée ; un
    ré-export la met à jour au lieu d'en recréer une (`updated: true` dans la réponse).
    **Rollback** : si le remplissage échoue après création, la recette est supprimée ; si la
    suppression échoue aussi → `partial_created` (id + commande CLI dans le message).
    **Image** : `source_image_url` transmise par un PATCH isolé — un échec n'invalide pas l'export
    (`warnings: ["image_not_transferred"]` / `["no_image"]`).
    **Échecs métier renvoyés en HTTP 200 avec `{ ok:false, error }`** (supabase-js met `data` à null sur non-2xx),
    erreurs classifiées : `auth_failed` / `ip_blocked` / `rate_limited` / `invalid_payload` / `partial_created`.
- **⚠️ Risque IP** : Cookidoo peut bloquer les IP datacenter. Si `ip_blocked`, le CLI local
  (IP résidentielle) reste le plan B — il partage exactement le même code `_shared/cookidoo`.
- **⚠️ À confirmer (spike)** : endpoints reverse-engineerés. La forme exacte du champ `image`
  (hypothèse : URL publique directe, bucket `recipe-images` public) et des données d'annotation
  `reverse`/`accessory` reste à valider — inspection réseau sur cookidoo.fr + `cli.ts --get <id>`.
  D'ici là, `recipeMetadata.requiresAnnotationsCheck` vaut `true` (revue guided cooking côté Cookidoo).
- **Déploiement** : via CLI Supabase (les imports `../_shared/cookidoo/` sont suivis nativement).
