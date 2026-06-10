---
name: git-github
description: Bonnes pratiques git/GitHub du projet recipe-hug — branches, commits conventionnels en français, validation avant push, pull requests, fichiers protégés, redéploiement des edge functions. À consulter avant tout commit, push ou création de PR.
---

# Git & GitHub — bonnes pratiques du projet

## Branches

- **Jamais de commit direct sur `main`** (un hook le bloque). `main` est déployée
  automatiquement sur Vercel : tout passe par une branche + PR.
- Nommage : `claude/<sujet-en-kebab-case>-<suffixe>` pour les sessions Claude,
  sinon `feat/...`, `fix/...`, `chore/...`.
- Créer la branche depuis `main` à jour : `git fetch origin main` puis
  `git checkout -b <branche> origin/main`.

## Commits

- **Convention** : `type: description en français` — types observés dans
  l'historique : `feat`, `fix`, `test`, `docs`, `ci`, `chore`, `refactor`.
- La description résume le **pourquoi/quoi** en une ligne (< 72 caractères si
  possible) ; détails éventuels dans le corps après une ligne vide.
- Commits **atomiques** : une intention par commit (ne pas mélanger un fix et
  du refactoring).
- Ne jamais committer : `.env`, secrets, clés API, `node_modules`, artefacts de
  build (`dist/`).

## Validation avant commit/push

Lancer au minimum :

```bash
npm run test:run     # Vitest (single run)
npm run build        # inclut la vérification TypeScript
```

Si les edge functions sont touchées :

```bash
deno test supabase/functions/_shared/decrypt-keys_test.ts
deno test supabase/functions/_shared/ai-providers_test.ts
```

La CI (`.github/workflows/ci.yml`) rejoue tests + build + deno test ;
`typecheck` et `lint` y sont informatifs (dette préexistante). Ne pas pousser
si les tests échouent localement.

## Push

- Toujours `git push -u origin <branche>`.
- En cas d'échec **réseau** uniquement : réessayer jusqu'à 4 fois avec backoff
  exponentiel (2s, 4s, 8s, 16s).
- **Interdit** : push sur `main`, `--force` (utiliser `--force-with-lease`
  uniquement sur sa propre branche de travail, jamais sur une branche
  partagée). Un hook bloque ces cas.

## Pull requests

- **Ne créer une PR que sur demande explicite** de l'utilisateur.
- Titre et description en **français**, format : contexte → changements →
  validation (résultats de tests).
- Vérifier que la CI est verte avant de proposer le merge ; ne jamais merger
  sans accord de l'utilisateur.
- Utiliser les outils MCP GitHub (pas de `gh` CLI dans les conteneurs web).

## Fichiers protégés

**Ne jamais éditer** (auto-générés, un hook le bloque) :

- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`

## ⚠️ Edge functions : committer ≠ déployer

Modifier `supabase/functions/` dans le repo **ne change rien en production**
tant que la fonction n'est pas redéployée (MCP Supabase ou CLI). Après tout
commit touchant une edge function :

1. Redéployer la fonction (voir `supabase/functions/CLAUDE.md` pour la
   structure `files` exigée par le déploiement MCP).
2. Vérifier avec `get_edge_function` que la version a augmenté.
3. **Attention aux sessions parallèles** : un déploiement depuis une autre
   branche écrase la prod avec son propre état du code. Avant de déployer,
   vérifier que sa branche contient bien les derniers correctifs mergés
   (rebaser sur `main` si besoin).

## Récapitulatif des garde-fous automatiques (hooks)

| Hook | Effet |
|------|-------|
| `git commit`/`git push` sur `main` | Bloqué — créer une branche |
| `git push --force`/`-f` | Bloqué — `--force-with-lease` si vraiment nécessaire |
| Édition de `src/integrations/supabase/{client,types}.ts` | Bloquée — fichiers auto-générés |
| Édition sous `supabase/functions/` | Rappel non bloquant : penser au redéploiement |
