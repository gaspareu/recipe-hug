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

`.github/workflows/deploy-edge-functions.yml` applique d'abord les migrations,
puis déploie **toutes** les fonctions à chaque merge sur `main` touchant le
backend Supabase (`supabase db push`, puis `supabase functions deploy`, qui
respecte `config.toml`). C'est la voie normale : elle évite la
dérive « repo ≠ prod » des déploiements manuels depuis des sessions parallèles.
Le déploiement MCP/manuel reste utile pour un **hotfix immédiat** hors cycle de
merge — mais penser alors à merger le code correspondant pour ne pas régresser
au prochain déploiement CI.

> Prérequis (une fois) : secrets de dépôt `SUPABASE_ACCESS_TOKEN`
> (Supabase Dashboard → Account → Access Tokens) et `SUPABASE_DB_PASSWORD`.
> Le workflow applique les migrations avant les fonctions afin de préserver
> leurs dépendances aux RPC.

---

## Secrets configurés (Supabase Dashboard)

| Secret | Usage | Obligatoire |
|--------|-------|-------------|
| `ANTHROPIC_API_KEY` | IA par défaut (chat, analyse, génération texte) | Oui |
| `OPENAI_API_KEY` | Génération d'images par défaut (GPT Image 2.5 Flare) | Recommandé ; clé utilisateur OpenAI possible |
| `GEMINI_API_KEY` | Génération d'images Gemini ou repli sans clé OpenAI | Recommandé pour le repli |
| `AI_KEYS_ENCRYPTION_SECRET` | Chiffrement AES-GCM des clés API utilisateur | Oui |
| `APP_URL` | URL publique (`https://recipe-hug.vercel.app`) | Oui |
| `ELEVENLABS_API_KEY` | TTS + transcription Scribe | Oui (vocal) |
| `ELEVENLABS_ZERO_RETENTION_MODE` | Désactive la journalisation TTS/Scribe quand le compte ElevenLabs est éligible | Non (`false` par défaut) |
| `SENTRY_DSN` | Remontée d'erreurs normalisées de `home-assistant` et Cookidoo | Non (observabilité) |

Les secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement par Supabase.

`SENTRY_DSN` ne doit jamais être placé dans le frontend ou dans un commit. Les
erreurs envoyées sont volontairement normalisées : aucun message de chat,
recette, e-mail, mot de passe Cookidoo, JWT ou réponse amont n'est attaché.

> Ne positionner `ELEVENLABS_ZERO_RETENTION_MODE=true` qu'après activation du
> Zero Retention Mode sur le compte ElevenLabs ; sinon les appels peuvent être rejetés.
> La clé ElevenLabs doit être limitée aux endpoints TTS/Scribe utilisés et porter
> un plafond de crédits fournisseur, en complément des quotas applicatifs.

---

## Inventaire des fonctions déployées

Projet : `ifpqsyyvytfpossqycpc`

| Fonction | verify_jwt | Rôle |
|----------|-----------|------|
| `home-assistant` | true | Chat IA unifié (streaming) |
| `analyze-recipe` | true | Analyse nutritionnelle |
| `parse-recipe-image` | true | OCR image → recette |
| `generate-recipe-image` | true | Génération photo plat (GPT Image 2.5 Flare par défaut) |
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

- **Modèle par défaut** : `gpt-image-2.5-flare` via `OPENAI_API_KEY` serveur, pour la génération manuelle et celle du webhook
- **Repli des clés** : sans secret OpenAI serveur, utiliser la clé OpenAI chiffrée de l'utilisateur ; sans clé OpenAI, conserver Gemini via `GEMINI_API_KEY` serveur
- **Endpoint OpenAI** : `https://api.openai.com/v1/images/generations` ; image JPEG 1536×864 renvoyée dans `data[0].b64_json`
- **Choix explicites** : Gemini (`gemini-2.5-flash-image`, API native) et DALL·E 3 restent pris en charge par le module partagé
- **Gemini** : clé via l'en-tête `x-goog-api-key` (jamais dans l'URL) ; réponse `candidates[0].content.parts[].inlineData`

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
  defaultProvider: "openai",     // provider serveur si pas de config user
  defaultModel: "gpt-image-2.5-flare",
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
  accessoires, barème de conversion action → réglage) + normalisation (`normalizeSpeed`,
  `clampTemperature`). Miroir front strictement synchronisé : `src/lib/thermomix/reference.ts`
  (garde-fou `reference.sync.test.ts`). Alimente le prompt IA et le mapper, qui applique les
  contraintes machine (plages, plafond de vitesse en vapeur, durée maximale).
- **Source unique** : `_shared/cookidoo/{auth,client,mapper,types,validate}.ts`. Le CLI
  `connector/cookidoo/cli.ts` importe **ces mêmes modules** (entrypoint mince, zéro duplication).
- **Modules** :
  - `mapper.ts` (pur, testé) → recipe-hug → payload Cookidoo. Annotations **TTS** (temps, vitesse,
    température, Varoma, sens inverse) construites en priorité depuis les champs structurés
    `step.tm7`, avec **repli regex** sur le texte pour les recettes existantes ; annotations
    **INGREDIENT** liant les noms d'ingrédients au texte (c'est ce qui rend une étape « guidée »).
    Le repli texte exclut les phrases mentionnant le four et les durées seules sans indice
    machine (vitesse, température compatible, Varoma ou mention TM7/Thermomix). Le texte et les
    liens ingrédients restent exportés. Une température hors plage est omise, jamais ramenée
    artificiellement à une température TM7 ; les paramètres structurés `step.tm7` restent prioritaires.
    Types d'annotation confirmés : `TTS` (`{time, speed, direction:"CCW", temperature:{value,unit}}`),
    `MODE` (modes nommés : `name:"dough"|"browning"|"steaming"`, `{time, temperature?, power?}`) et
    `INGREDIENT` (`{description: "20 g d'huile"}`). Le sens inverse s'exprime par `direction`,
    la vitesse mijotage par `speed:"soft"`, la cuisson vapeur par `temperature:{value:"varoma"}`
    (minuscule, sans `unit` — Cookidoo la traduit en `cooking-mode/Steaming`).
    ⚠️ `power` (rissolage) pilote l'intention machine : `"Intense"` → `HighTemperature_FullPower`,
    `"Gentle"` → `HighTemperature_MediumPower`. Vient de `step.tm7.power`, défaut `"Intense"`.
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
  - `export-recipe-cookidoo` — contrat `cookidoo_adaptation_v2` annoncé par GET.
    Le chat crée des recettes classiques ; l'adaptation TM7 est exclusivement préparée depuis
    la fiche. POST `prepare` réserve une adaptation persistante puis lance l'IA en arrière-plan ;
    `status` rend son état et un aperçu signé quinze minutes. `send` reçoit uniquement
    `recipe_id`, `adaptation_id`, `confirmation` et les confirmations de conflit éventuelles.
    Aucun contenu adapté fourni par le navigateur n'est envoyé à Cookidoo.

    **Cache** : `recipe_cookidoo_adaptations` conserve la copie, ses changements, notes,
    blocages et précisions utilisateur (`request_context`). Clé propriétaire + recette +
    empreinte culinaire + version de l'adaptateur. Titre, favori et image n'invalident pas la
    copie ; ingrédients, portions et étapes l'invalident. La recette source reste intacte.
    La réservation SQL et son bail empêchent deux préparations concurrentes ; une tentative
    expirée ne peut pas écraser la suivante. Les reprises gardent les précisions précédentes.

    **Validation** : tous les ingrédients alimentaires et leurs quantités sont conservés ;
    chaque étape source est référencée. Les commandes, mesures et accessoires sont rendus
    depuis les données structurées, les actions manuelles reprennent un extrait source ou
    une opération technique autorisée. L'eau vapeur doit être explicitement renseignée,
    ajoutée seule après vidage du bol et réservée à la vapeur. L'aperçu reste à vérifier par
    l'utilisateur : les contrôles structurels ne prouvent pas la réussite culinaire.

    **Contrat compact v3** : les étapes manuelles peuvent référencer `source_parts`
    (numéro source + index de fragment), recopiés par le serveur. Un ingrédient ajouté
    une seule fois peut omettre sa quantité ; plusieurs ajouts exigent une répartition
    explicite et une somme exacte. `machine-contract.ts` porte le schéma, les règles
    fermées et leur description pour le prompt, distincts des conseils TM7 généraux.
    L'API Anthropic reçoit `ADAPTATION_JSON_SCHEMA` ; les autres fournisseurs gardent
    le contrat JSON demandé dans le prompt et la même validation serveur.

    Le contrôle appareil reçoit les instructions attendues et compare l'intention
    (notamment `cooking-mode/Dough`) et la durée, en plus de la présence du guidage.
    La vitesse et la température appareil ne sont pas encore comparées. Un écart
    produit `steps_not_guided`, rendu comme avertissement dans le résultat. L'empan
    d'un mode inclut son libellé lorsqu'il existe ; le rendu Cookidoo réel reste à
    vérifier. Le banc d'essai des modèles est décrit dans
    `scripts/verification/COOKIDOO-BENCHMARK.md` et ne change pas la production.

    **Envoi** : RPC `begin_cookidoo_export` verrouille la recette, vérifie sa révision et réutilise
    tout envoi `pending`/`unknown`. Le journal contient l'adaptation, la phase et le payload
    attendu. Le front interroge `status` toutes les deux secondes pendant la préparation/envoi.
    Login et réseau partagent un délai borné ; chaque écriture vérifie que sa réservation est
    encore active. L'identifiant créé est sauvegardé avant l'attente de cinq secondes.
    Le contrôle final relit la recette et la vue appareil avant d'annoncer le succès.

    **Résultat incertain** : un envoi expiré devient `unknown` et bloque un nouvel envoi.
    `check` vérifie une destination connue. Sans destination vérifiable, `acknowledge_absent`
    requiert une confirmation explicite après consultation de Cookidoo. Les modifications
    distantes, destinations supprimées et créations partielles exigent aussi une confirmation
    liée à la tentative courante ; aucun remplacement/recréation silencieux.

    **Sécurité** : adaptations et journaux en lecture propriétaire uniquement, écritures/RPC
    réservées au service role. Confirmation HMAC liée au propriétaire, aux révisions et à la
    durée de validité. Les erreurs remontées sont des codes traduits en français, jamais les
    réponses brutes du fournisseur. Les anciens clients échouent sans écriture avec ce contrat.

    **CLI** : il partage les modules réseau/mapper/validation. L'adaptation persistante et ses
    confirmations appartiennent au parcours web ; le CLI conserve son contrat propre.
    **Image** : Cookidoo ré-héberge l'image sur son CDN — flux confirmé par inspection réseau :
    signature (`POST /created-recipes/{lang}/image/signature`) → upload multipart Cloudinary →
    `PATCH {image: "<public_id>.<ext>"}` (le champ `image` attend un identifiant Cloudinary, **pas**
    une URL). `uploadRecipeImage` télécharge les octets depuis le stockage Supabase, dont l'origine
    est vérifiée (`isAllowedImageUrl`, anti-SSRF). Isolé et best-effort : un échec n'invalide pas
    l'export (`warnings: ["image_not_transferred"]` / `["no_image"]`).
    **Deux canaux d'erreur, selon la phase** — ne pas les confondre :
    - *Phase synchrone* → **HTTP 200 avec `{ ok:false, error }`** (supabase-js met `data` à null sur
      non-2xx, d'où le 200). Concerne ce qui est détectable sans réseau : `invalid_input`,
      `invalid_payload`, `not_found`, `not_configured`, `decrypt_failed`.
    - *Phase asynchrone* → écrit dans `cookidoo_exports.error_code`, jamais dans la réponse HTTP :
      `auth_failed` / `ip_blocked` / `rate_limited` / `partial_created` / `export_failed`.
      Le front les lit en interrogeant le journal.
- **⚠️ Risque IP** : Cookidoo peut bloquer les IP datacenter. Si `ip_blocked`, le CLI local
  (IP résidentielle) reste le plan B — il partage exactement le même code `_shared/cookidoo`.
- **Contrat de l'API** : provenance de chaque élément (observé / déduit / hypothèse), formats
  d'annotations et flux image détaillés dans **`docs/COOKIDOO-CONTRAT.md`** — à lire avant
  toute modification du mapper ou du client.
- **Contrat validé par sondes d'écriture réelles** (19 juillet 2026) : création, PATCH, image
  Cloudinary, suppression et **rendu appareil** vérifiés de bout en bout. Voir le journal des
  sondes dans `docs/COOKIDOO-CONTRAT.md` §10.
- **Contrôle du guided cooking** : `findUnguidedSteps` relit la **vue appareil**
  (`GET /created-recipes/{lang}/device/recipes/{id}`) après l'export et signale les étapes que
  Cookidoo a dégradées en simple texte (`warnings: ["steps_not_guided"]`). C'est le seul moyen de
  détecter ce mode d'échec : l'API renvoie `200 OK` et stocke l'annotation, qui n'est perdue qu'à
  la conversion vers l'appareil. Les `GET` du client demandent la vue complète
  (`application/vnd.vorwerk.customer-recipe.full+json`) — sans elle, les annotations sont invisibles
  en lecture.
- **Déploiement** : via CLI Supabase (les imports `../_shared/cookidoo/` sont suivis nativement).
