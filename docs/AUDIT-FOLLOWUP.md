# Suivi d'audit — recipe-hug

> Audit complet réalisé par revue multi-agents (9 lots : sécurité backend, SSRF,
> DB/RLS, cœur IA, hooks, UI, tests). Ce document liste **ce qui a été traité** et
> **ce qui reste**, avec un prompt prêt à coller pour reprendre en session fraîche.

## ✅ Traité — branche `fix/high-fuites-securite` (PR)

Les **9 findings HIGH** ont été corrigés en TDD, chaque itération conclue par
`/security-review` (aucune nouvelle vuln) + `/simplify` :

| # | Finding | Correctif |
|---|---------|-----------|
| 1 | Fail-open du chiffrement des clés API | fail-closed (`manage-ai-keys` 500 ; `decryptProviderKeys` + `deriveKey` lèvent si secret absent/vide) |
| 2 | Fuite `GEMINI_API_KEY` (3 chemins natifs) | clé via en-tête `x-goog-api-key` ; `generate-recipe-image` ne renvoie plus `error.message` brut |
| 3 | Micro `getUserMedia` jamais arrêté (RGPD) | `stop()` sur les pistes du flux de pré-vol |
| 4 | Faux succès des préférences (chat) | `updatePreferencesAsync` (mutateAsync) dans les hooks de chat |
| 5 | Doublon de recette (closure périmée) | `activeRecipeRef` synchronisé dans `get_recipe_details` |
| 8 | Erreurs Anthropic mi-stream avalées | `controller.error` propage l'échec au client |
| 9 | Tool-calling parallèle écrasé sur index 0 | index de tool_call croissant (finish_reason par bloc conservé) |
| 6 | Détection de clé cassée + cause racine | `hasApiKeyForProvider`/`maskedKeys` ; champ trompeur `AISettings.provider_api_keys` supprimé |
| 7 | Échecs de sauvegarde silencieux | `toast.error`/`toast.success` (AIProviderSettings, CulinaryPreferencesContent) |
| — | Code mort (~1360 l) | 6 composants non montés supprimés (RecipeCard, RecipeGridItem, WebhookIntegration, CulinaryPreferencesEditor, ThemeSelector) |

**⚠️ Déploiement** : les edge functions modifiées (`ai-providers`, `manage-ai-keys`,
`generate-recipe-image`, `validate-ai-key`, `decrypt-keys`, `generate-image`) ne
sont actives qu'après redéploiement Supabase (auto au merge sur `main`, ou MCP/CLI en hotfix).

---

## 🔜 Reste à faire

### A. Découpage `AIProviderSettings` — ✅ fait (branche `refactor/aiprovidersettings-decoupage`)

853 l → **360 l** (< 800). Les 6 sous-composants inline extraits vers
`src/components/profile/ai-provider/` : `ProviderBadge`, `ApiKeyStatusIndicator`,
`CapabilityBadge`, `ProviderApiKeyInput`, `ProviderCard`, `AgentConfigRow`. Comportement
inchangé — filet `AIProviderSettings.test.tsx` 2/2 + suite 382/382 vertes, `build` OK.
`/security-review` : 0 finding. `/simplify` : tables statiques des badges hissées en
constantes module (le reste — `CollapsibleCard` partagé, type `ByokProvider`, helper
`hasKeyForProvider` — relève de §B, non traité ici). **Prochaine étape : §B.1 (Gemini streaming).**

### B. Chantiers « altitude » (dette de conception révélée par `/simplify`)

1. **Gemini streaming — ✅ fait (branche `refactor/gemini-streaming`).** Bascule sur le flux
   SSE natif de Gemini (`streamGenerateContent?alt=sse`) → parsing incrémental ligne par ligne
   (fini le regex sur tableau complet). Erreurs mi-stream propagées au client via un
   `surfaceStreamError` commun (fini le `catch {}`) ; `finish_reason: "tool_calls"` émis par
   `functionCall` → les outils Gemini s'exécutent enfin (multi-outils OK). Builders de chunk OpenAI
   partagés (`openAIContentChunk`/`openAIToolCallChunk`/`openAIFinishChunk` + `sse()`) et boucle SSE
   partagée (`transformSSEToOpenAI`, détection d'erreur par-provider) consommés par les deux
   transforms. Filet : 14 tests Deno (dont 6 Gemini) verts + `deno check` OK. `/security-review` :
   0 finding (clé toujours dans l'en-tête). `/simplify` : boucle SSE dupliquée factorisée.
   **⚠️ Redéploiement edge function requis au merge.** Prochaine étape : §B.2 (`useChatEngine.onToolCall`).
2. **`useChatEngine.onToolCall` — ✅ fait (branche `refactor/ontoolcall-activerecipe`).**
   `activeRecipe` injecté en 2e argument d'`onToolCall` (le moteur tient un `activeRecipeRef`
   unique, synchronisé dans le handler `get_recipe_details` pour l'auto-retry du même tour). Les
   contournements `activeRecipeRef` dupliqués de `useHomeChat` **et** `useRecipeChat` supprimés
   (+ imports `useRef`). Filet : 48 tests (useChatEngine/useHomeChat/useRecipeChat), dont les
   regressions #5, verts ; ESLint clean, 0 nouvelle erreur de type. `/security-review` : 0 finding.
   `/simplify` : « ship it » (3/4 angles clean). Front pur, pas de redéploiement.
   Prochaine étape : §C (sécurité MEDIUM).
3. **Helpers partagés** — `notifySaveError(label)`/`notifySaveSuccess(label)` (aligner `useAsyncAction`
   sur `toast.error`/`toast.success`) ; centraliser `json()` + `corsHeaders` + un guard
   `requireEncryptionSecret()` dans `supabase/functions/_shared/` (aujourd'hui dupliqués/inline).
   Révélé par le Lot 3 : les 3 branches pending-recipe (`save_recipe`/`extract_modified_recipe`/
   `create_new_recipe`) sont désormais identiques entre `useHomeChat` et `useRecipeChat` →
   extractibles en helper commun.

### C. Sécurité MEDIUM (review initiale)

- **`share-recipe` — ✅ fait (branche `fix/medium-partage-recette`).** Plus de lookup du
  destinataire : tout partage est créé en « pending » via `buildShareResult` (`_shared/sharing.ts`),
  avec une réponse **uniforme** → l'oracle d'énumération de comptes ET l'injection non sollicitée
  dans le compte d'autrui sont fermés. Le destinataire réclame la recette via `claim-shares`.
- **`claim-shares` — ✅ fait.** Apparie les partages via `shareMatchesVerifiedIdentifier`
  (`_shared/sharing.ts`), qui exige un identifiant **vérifié** (`email_confirmed_at`/`phone_confirmed_at`)
  → un compte à l'email/téléphone d'autrui non confirmé ne peut plus réclamer ses recettes.
  Filet : 8 tests Deno (`sharing_test.ts`). `/security-review` : 0 finding (deux failles confirmées
  fermées, pas de contournement). **⚠️ Redéploiement edge functions requis au merge.**
- **DB/RLS** — décomposé par risque (les migrations s'appliquent auto au merge, non TDD-ables en local) :
  - `verify_jwt` — **✅ fait (branche `fix/medium-verify-jwt`).** Toutes les fonctions passées à
    `verify_jwt = true` sauf `webhook-recipe` (auth par token UUID). Le front envoie déjà le JWT sur
    tous les appels (vérifié call-site par call-site) → sûr. `config.toml` ajouté au trigger du
    workflow de déploiement (sinon non redéployé). Doc `functions/CLAUDE.md` alignée.
  - `get_user_id_by_phone` **exécutable par `anon`** — **✅ fait (branche `fix/c-db-storage-hardening`).**
    Recon MCP : la fonction `SECURITY DEFINER` (lit `auth.users`) restait appelable sans auth (oracle
    d'énumération par téléphone) — l'ACL prod montrait `{postgres, anon, service_role}`, la migration
    d'origine ayant révoqué PUBLIC/authenticated mais **pas** `anon`. Migration `REVOKE ... FROM anon`
    → réservée au `service_role`. ⚠️ Peut casser un flux n8n l'appelant via la clé anon (réversible).
  - Policy storage bucket `recipes` incohérente — **✅ fait (branche `fix/c-db-storage-hardening`).**
    INSERT autorisait le dossier partagé `recipe-images/` alors qu'UPDATE/DELETE exigent `<uid>/`
    (images orphelines, espace partagé). Migration alignant l'INSERT sur `<uid>/` + front (RecipeDetail)
    écrivant via `buildRecipeImageObjectPath(user.id, …)` (helper testé). Images existantes toujours
    lisibles (bucket public). ⚠️ Migration + front à merger ensemble.
  - **Reste (🟠/🔴, cassant — écarté par décision produit) :**
    - `webhook_token` en clair → hash : invaliderait tous les tokens, imposerait une UI « montré une
      seule fois » + un changement de `webhook-recipe`. Token = UUID aléatoire (pas un mot de passe).
      **Écarté** (gain modéré vs rupture UX).
    - Bucket `avatars` public (PII) → privé + URLs signées : casse toutes les URLs d'avatars stockées,
      migration data + `createSignedUrl` partout, déploiement atomique. **Écarté** (rupture).
    - Vues `*_safe` sans `REVOKE` colonne : `profiles_safe` **exclut déjà** `webhook_token` ; le REVOKE
      colonne sur la table de base est defense-in-depth de très faible valeur (RLS scope à sa propre
      ligne, le token est le sien). **Écarté** (faible valeur).
- **Validation des sorties LLM** (« ne jamais faire confiance aux données externes ») :
  - `analyze-recipe` — **✅ fait (branche `fix/medium-validation-llm`).** La sortie du modèle est
    validée contre un schéma Zod (`_shared/analyze-output.ts` → `parseAnalysis`) avant d'être renvoyée
    (et écrite en base) : types + bornes (`calorie_score` 1-5, tags ≤5, longueurs), clés inconnues
    retirées ; échec → 502. Filet : 9 tests Deno. ⚠️ Redéploiement edge function requis au merge.
  - Payloads d'outils dans les hooks de chat — **✅ fait (branche `fix/medium-validation-tool-payloads`).**
    `save_recipe`/`extract_modified_recipe`/`create_new_recipe`/`update_preferences` validés via
    `src/lib/chat-tool-payloads.ts` (`parseRecipePayload`/`parsePreferenceOperations`, Zod) dans
    `useHomeChat` **et** `useRecipeChat` : schémas tolérants (calés sur le contrat réel de `home-assistant`,
    `quantity` string|number, champs optionnels) pour ne pas rejeter de recettes valides ; clés inconnues
    retirées, marqueurs `isUpdate`/`originalRecipeId` préservés ; payload invalide → no-op sûr. Filet :
    14 tests Vitest. Front pur (pas de redéploiement). `/security-review` : 0 finding.

### D. Correctness / conventions MEDIUM (review initiale) — ✅ traité (5 lots, TDD)

Traité en 5 lots, une branche par lot, chacun conclu par `/security-review` (0 finding)
+ `/simplify`. **Front pur → aucun redéploiement edge.** Branches non mergées (PR sur demande).

- **✅ `StepsEditor.tsx` mute la prop pendant le rendu** (branche `fix/medium-correctness-ui-feedback`) —
  `steps.sort()` → `[...steps].sort()` (copie avant tri). Filet : test d'immutabilité de la prop.
- **✅ `Auth.tsx` : erreurs jamais affichées** (branche `fix/medium-correctness-ui-feedback`) —
  état `error` + `<div role="alert">` dans les 3 formulaires, surfaçage des erreurs Zod, reset
  au changement d'onglet/mode. Filet : 4 tests.
- **✅ `useVoiceMode` : pas de cleanup au démontage** (branche `fix/medium-cleanup-lifecycle`) —
  effet de démontage déconnecte Scribe (RGPD : plus de connexion résiduelle), vide la file audio,
  révoque l'URL du blob et met en pause l'audio. Filet : test « déconnecte Scribe au démontage ».
- **✅ `useChatEngine` : `AbortController` non abandonné au démontage** (branche
  `fix/medium-cleanup-lifecycle`) — effet de démontage `abort()` la requête en cours.
  Filet : test « abandonne la requête en cours au démontage ».
- **✅ `useRecipeVersions.useRestoreVersion` : n'invalide pas `['recipes']`** (branche
  `fix/medium-tanstack-invalidation`) — invalidation ajoutée en `onSuccess`. Filet : 2 tests.
- **✅ `savePendingRecipe` (`useHomeChat`) : n'invalide pas `['recipe', id]` après update** (branche
  `fix/medium-tanstack-invalidation`) — `invalidateQueries(['recipe', recipeId])` après refetch.
  Filet : mock `invalidateQueries`. *Dette résiduelle : réimplémente encore les mutations hors
  TanStack Query (`supabase` brut) → à router vers `useCreateRecipe`/`useUpdateRecipe`, voir §B.3.*
- **✅ `useWebhookToken` : `isLoading` bloqué à `true` si non connecté** (branche
  `fix/medium-tanstack-invalidation`) — branche `else` remet `isLoading` à `false`. Filet : test.
  *Dette résiduelle : migration TanStack Query complète, voir §B.3.*
- **✅ `MealPlanning`/`Profile` : appels `supabase` directs** (branche `refactor/medium-extract-page-hooks`) —
  extraits en hooks `useMealPlans` (query + `useAddMealPlan`/`useDeleteMealPlan`) et `useProfile`
  (query + `useUpdateProfile`/`useUploadAvatar`). Comportement inchangé (cache-buster avatar,
  undo optimiste de suppression préservés). Filet : 10 tests.
- **✅ Token webhook affiché en clair dans les exemples de `WebhookIntegrationContent`**
  (branche `fix/medium-webhook-token-clear`) — les exemples cURL/Raccourcis et le header inline
  affichent désormais `<votre-token>` ; les boutons « copier » injectent le vrai token (utilité
  préservée). Le champ token reste `type="password"`. Guide `.md` téléchargé inchangé (action
  explicite de l'utilisateur, avertissement « ne partagez jamais »). Filet : 2 tests.

### E. Tests (review initiale) — zones critiques non couvertes

- **0 test** : `resolveAIConfig` (routage provider + clé — CRITIQUE), `webhook-recipe` (endpoint externe),
  `manage-ai-keys` (chiffrement).
- Partiels : `decryptProviderKeys` (branche repli plaintext), transform Gemini + builders de requête, `useAuth`.
- **Aucun E2E** malgré `@playwright/test` installé (auth, création via chat, liste de courses).

### F. LOW (durcissement)

CORS wildcard → restreindre à `APP_URL` ; rate limiting (webhook, validate-ai-key, share-recipe) ;
KDF sans sel (documenter/imposer un secret 32 o aléatoire, idéalement HKDF) ; `aria-label` sur
boutons-icônes ; `NotFound` en anglais + `<a>` au lieu de `<Link>` ; duplication des constantes
tags/saisons/statuts entre pages/composants ; `ChatInterface` (539 l) à découper.

---

## Prompt de reprise (à coller en nouvelle session)

```
Contexte : audit sécurité de recipe-hug (voir docs/AUDIT-FOLLOWUP.md). Tous les HIGH,
les refactors §A/§B.1/§B.2, les MEDIUM §C traitables sans base live et l'intégralité
de §D (correctness) sont faits — §C et §D sur branches non mergées (PR sur demande).
Continue en TDD, une branche par lot, avec /security-review + /simplify en fin de
chaque itération. Ordre selon le contexte de session :

- §E (tests) : couvrir resolveAIConfig (routage provider + clé — CRITIQUE),
  webhook-recipe (endpoint externe), manage-ai-keys (chiffrement) ; ajouter des E2E
  Playwright (auth, création via chat, liste de courses) — dont la vérif E2E des écrans
  Profile/MealPlanning refactorés en §D.
- §B.3 (helpers partagés) : notifySaveError/notifySaveSuccess ; centraliser
  json()/corsHeaders/requireEncryptionSecret dans _shared/ ; helper pending-recipe
  commun à useHomeChat/useRecipeChat (dette d'altitude §D : savePendingRecipe encore
  en supabase brut ; useWebhookToken à migrer sur TanStack Query).
- §C DB/RLS restant (🟠/🔴, RGPD) : webhook_token haché, policy storage bucket recipes,
  REVOKE colonnes sur vues *_safe, bucket avatars privé (URLs signées) — idéalement
  avec MCP Supabase authentifié pour inspecter le schéma réel.

Rappel : committer ≠ déployer — redéployer les edge functions modifiées après merge.
Jamais de commit/push sur main (hook). PR uniquement sur demande explicite.
```
