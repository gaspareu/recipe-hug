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
| `home-assistant` | false | Chat IA unifié (streaming) |
| `analyze-recipe` | false | Analyse nutritionnelle |
| `parse-recipe-image` | false | OCR image → recette |
| `generate-recipe-image` | **true** | Génération photo plat (Gemini) |
| `webhook-recipe` | false | Réception webhook externe |
| `manage-ai-keys` | false | CRUD clés API chiffrées |
| `validate-ai-key` | false | Test validité clé API |
| `elevenlabs-tts` | false | Text-to-speech |
| `elevenlabs-scribe-token` | false | Token STT temps réel |
| `share-recipe` | false | Partage recette par email/tél |
| `claim-shares` | false | Réclamer recettes partagées |
| `manage-cookidoo-credentials` | false | CRUD identifiants Cookidoo chiffrés (AES-GCM) |
| `export-recipe-cookidoo` | false | Export d'une recette vers Cookidoo (Thermomix) |

> `generate-recipe-image` a `verify_jwt: true` car elle modifie des données utilisateur (upload Storage + update recipes).

---

## Génération d'images — détails techniques

- **Modèle** : `gemini-2.5-flash-image` (API native, pas l'endpoint OpenAI-compat)
- **Endpoint** : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key={GEMINI_API_KEY}`
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

## Connecteur Cookidoo (export Thermomix)

Export d'une recette recipe-hug vers le compte Cookidoo de l'utilisateur (« Mes recettes créées »).

- **Source unique** : `supabase/functions/_shared/cookidoo/{auth,client,mapper,types}.ts`. Le CLI
  `connector/cookidoo/cli.ts` importe **ces mêmes modules** (entrypoint mince, zéro duplication).
- **Modules** :
  - `mapper.ts` (pur, testé `mapper_test.ts`) → recipe-hug → payload Cookidoo + annotations TTS/STEAMING.
  - `auth.ts` → login PKCE/cookie (`_oauth2_proxy` + `v-authenticated`, **pas** de Bearer token).
  - `client.ts` → endpoints `/created-recipes` (create → attendre ~5 s → patch ; rate limit ~10 req/min).
- **Fonctions** :
  - `manage-cookidoo-credentials` — GET (statut, email masqué) / POST (upsert chiffré AES-GCM) / DELETE.
    Mot de passe chiffré via `AI_KEYS_ENCRYPTION_SECRET`, jamais renvoyé en clair. Stocké dans
    `user_cookidoo_credentials` (vue `_safe` sans `password_enc`).
  - `export-recipe-cookidoo` — lit la recette (RLS) + déchiffre les creds → login → map → create → patch.
    **Échecs métier renvoyés en HTTP 200 avec `{ ok:false, error }`** (supabase-js met `data` à null sur non-2xx),
    erreurs classifiées : `auth_failed` / `ip_blocked` / `rate_limited`.
- **⚠️ Risque IP** : Cookidoo peut bloquer les IP datacenter. Si `ip_blocked`, le CLI local
  (IP résidentielle) reste le plan B — il partage exactement le même code `_shared/cookidoo`.
- **Déploiement** : via CLI Supabase (les imports `../_shared/cookidoo/` sont suivis nativement).
