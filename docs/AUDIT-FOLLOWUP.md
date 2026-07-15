# Suivi d'audit — recipe-hug

> Audit complet par revue multi-agents (sécurité backend, SSRF, DB/RLS, cœur IA,
> hooks, UI, tests). Ce document trace **ce qui reste** et garde un journal
> condensé du **traité**, avec un prompt prêt à coller pour reprendre en session
> fraîche. Chaque lot est mené en TDD, conclu par `/security-review` (0 finding) +
> `/simplify`.

## ✅ Traité (journal condensé)

**9 findings HIGH** (branche `fix/high-fuites-securite`) : fail-closed du
chiffrement des clés API ; fuite `GEMINI_API_KEY` (en-tête `x-goog-api-key`) ;
micro `getUserMedia` arrêté (RGPD) ; faux succès des préférences (`mutateAsync`) ;
doublon de recette (`activeRecipeRef`) ; erreurs Anthropic mi-stream propagées ;
tool-calling parallèle (index croissant) ; détection de clé + cause racine ;
échecs de sauvegarde silencieux (`toast`). + ~1360 l de code mort supprimées.

**Refactors & MEDIUM traités ensuite** (une branche par lot) :

| Lot | Objet | Redéploiement edge |
|-----|-------|--------------------|
| §A `AIProviderSettings` | 853 l → 360 l, 6 sous-composants extraits | — (front) |
| §B.1 Gemini streaming | SSE natif `?alt=sse`, erreurs mi-stream propagées, builders de chunk OpenAI partagés | ✅ requis |
| §B.2 `useChatEngine.onToolCall` | `activeRecipe` en 2e arg, refs dupliqués supprimés | — (front) |
| §C `share-recipe` / `claim-shares` | réponse uniforme (fin de l'énumération) + appariement sur identifiant **vérifié** | ✅ requis |
| §C `verify_jwt` | toutes fonctions `= true` sauf `webhook-recipe` (token UUID) ; `config.toml` ajouté au trigger de déploiement | ✅ requis |
| §C validation `analyze-recipe` | sortie LLM validée Zod (`_shared/analyze-output.ts`), échec → 502 | ✅ requis |
| §C validation payloads d'outils | `save_recipe`/`extract`/`create`/`update_preferences` validés Zod (`src/lib/chat-tool-payloads.ts`), schémas tolérants | — (front) |

> **⚠️ Rappel déploiement** : committer ≠ déployer. Les lots marqués « ✅ requis »
> ne sont actifs qu'après redéploiement Supabase (auto au merge sur `main`, ou
> MCP/CLI en hotfix). Tous sont mergés sur `main`.

---

## 🔜 Reste à faire

### B.3 — Helpers partagés (dette « altitude »)

- `notifySaveError(label)`/`notifySaveSuccess(label)` (aligner `useAsyncAction` sur `toast`).
- Centraliser dans `supabase/functions/_shared/` : `json()`, `corsHeaders`, un guard
  `requireEncryptionSecret()` (aujourd'hui dupliqués/inline).
- Les 3 branches pending-recipe (`save_recipe`/`extract_modified_recipe`/`create_new_recipe`)
  sont désormais identiques entre `useHomeChat` et `useRecipeChat` → helper commun.

### C — DB/RLS restant (🟠/🔴, déploiements coordonnés)

Migrations auto-appliquées au merge, non TDD-ables en local, **RGPD-sensibles** —
idéalement à traiter avec **accès Supabase live (MCP authentifié)** pour inspecter
le schéma réel avant migration :

- `webhook_token` stocké en clair → stocker un hash.
- Policy storage du bucket `recipes` incohérente (INSERT dossier partagé vs UPDATE/DELETE en `uid`).
- Vues `*_safe` sans `REVOKE` colonne (defense-in-depth — casse `select('*')` côté front).
- Buckets publics (`avatars` = PII → URLs signées ; casse les avatars existants sans déploiement atomique).

### D — Correctness / conventions MEDIUM (front, TDD-ables)

Lot `fix/medium-correctness-ui-feedback` (branche, en cours) — ✅ traité en TDD :

- ✅ `StepsEditor.tsx` : `steps.sort()` mutait la prop pendant le rendu → `[...steps].sort()`
  (test d'immutabilité ajouté).
- ✅ `Auth.tsx` : messages d'erreur calculés mais jamais affichés (uniquement `console.error`)
  → état `error` rendu dans un `<div role="alert">`, erreurs Zod désormais surfacées, nettoyage
  au changement d'onglet / bascule reset (nouveau `Auth.test.tsx`, 4 cas).

Reste :

- `useVoiceMode` : pas de cleanup au démontage (Scribe reste connecté, file audio continue).
- `savePendingRecipe` (`useHomeChat`) : mutations hors TanStack Query, n'invalide pas `['recipe', id]` après update.
- `useWebhookToken` : hors TanStack Query + `isLoading` bloqué à `true` si non connecté.
- `useChatEngine` : `AbortController` non abandonné au démontage.
- `useRecipeVersions.useRestoreVersion` : n'invalide pas `['recipes']`.
- `MealPlanning`/`Profile` : appels `supabase` directs → extraire des hooks (`useMealPlans`, `useProfile`).
- Token webhook affiché en clair dans les exemples/`.md` de `WebhookIntegrationContent`.

### E — Tests (zones critiques non couvertes)

- **0 test** : `resolveAIConfig` (routage provider + clé — CRITIQUE), `webhook-recipe` (endpoint externe), `manage-ai-keys` (chiffrement).
- Partiels : `decryptProviderKeys` (branche repli plaintext), transform Gemini + builders de requête, `useAuth`.
- **Aucun E2E** malgré `@playwright/test` installé (auth, création via chat, liste de courses).

### F — LOW (durcissement)

CORS wildcard → restreindre à `APP_URL` ; rate limiting (webhook, validate-ai-key,
share-recipe) ; KDF sans sel (documenter/imposer un secret 32 o aléatoire, idéalement
HKDF) ; `aria-label` sur boutons-icônes ; `NotFound` en anglais + `<a>` au lieu de
`<Link>` ; duplication des constantes tags/saisons/statuts entre pages/composants ;
`ChatInterface` (539 l) à découper.

---

## Prompt de reprise (à coller en nouvelle session)

```
Contexte : audit sécurité de recipe-hug (voir docs/AUDIT-FOLLOWUP.md). Tous les
HIGH + les refactors §A/§B.1/§B.2 + les MEDIUM §C traitables sans base live sont
faits et mergés sur main (share-recipe, claim-shares, verify_jwt, validation des
sorties LLM analyze-recipe + payloads d'outils).

Continue en TDD, une branche par lot, avec /security-review + /simplify en fin de
chaque itération. Choisir l'ordre selon le contexte de session :

- §D (correctness MEDIUM) : front, sûr, TDD-able — bon défaut sans accès Supabase.
  Ex. StepsEditor mute la prop, Auth.tsx n'affiche pas ses erreurs, cleanup
  useVoiceMode/useChatEngine, hooks manquants (useMealPlans/useProfile/useWebhookToken).
- §E (tests) : combler resolveAIConfig, webhook-recipe, manage-ai-keys ; E2E Playwright.
- §B.3 (helpers partagés) : notifySave*, json()/corsHeaders/requireEncryptionSecret,
  helper pending-recipe commun aux deux hooks de chat.
- §C DB/RLS restant (🟠/🔴) : webhook_token haché, policy bucket recipes, REVOKE
  colonnes *_safe, avatars privé. RGPD-sensible, migrations auto au merge →
  faire idéalement avec MCP Supabase authentifié (inspecter le schéma réel avant).

Rappel : committer ≠ déployer — redéployer les edge functions modifiées après merge.
Jamais de commit/push sur main (hook). PR uniquement sur demande explicite.
```
