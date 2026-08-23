---
name: check
description: Garde-fou qualité rapide du projet recipe-hug — lance tests, typecheck et lint puis compare les résultats au baseline de non-régression. À utiliser pendant le développement et avant tout commit. Pour la revue approfondie, utiliser le skill pre-pr.
---

# check — garde-fou qualité rapide

Vérifie qu'un changement n'introduit **aucune régression** par rapport au
baseline ci-dessous.
Rapide et déterministe : à lancer autant de fois que nécessaire pendant le dev.

Pour la revue approfondie (simplification, correctness, sécurité) avant d'ouvrir
une PR, utiliser plutôt le skill **pre-pr**.

## Baseline de non-régression

Baseline vérifié au **2026-08-22** :

| Commande | Baseline (dette préexistante) |
|----------|-------------------------------|
| `npm run test:run` | **0 échec** (499 tests) — doit rester à 0 |
| `npm run typecheck` | **0 erreur** |
| `npm run lint` | **0 problème** |

> Ces chiffres évoluent avec la dette. Si tu résorbes ou ajoutes de la dette
> légitimement, **mets à jour ce tableau ET celui d'`AGENTS.md`** dans le même commit.

## Procédure

La commande agrégée couvre les trois garde-fous :

```bash
npm run check
```

Pour diagnostiquer ou comparer précisément au baseline, lancer séparément :

1. **Tests** (bloquant — doit rester à 0 échec) :
   ```bash
   npm run test:run
   ```

2. **Typecheck** — compter les erreurs et comparer au baseline :
   ```bash
   npm run typecheck 2>&1 | grep -cE "error TS"
   ```

3. **Lint** — compter les problèmes et comparer au baseline :
   ```bash
   npm run lint 2>&1 | grep -E "✖"
   ```

4. **En cas de doute sur le baseline** (chiffre supérieur : est-ce ma faute ?),
   comparer à `origin/main` dans un worktree temporaire ou, avec accord explicite,
   via un stash sur un arbre propre. Ne jamais masquer les changements de l'utilisateur.
   ```bash
   git worktree add /tmp/recipe-hug-baseline origin/main
   ```
   Les erreurs réellement ajoutées se trouvent dans les fichiers que tu as touchés :
   filtrer la sortie sur ces chemins pour les identifier.

5. **Build** (optionnel, plus lent — à lancer si tu as touché des imports, la
   config Vite/PWA, ou avant un merge sensible) :
   ```bash
   npm run build
   ```

## Verdict à rendre

Formuler un verdict explicite, par exemple :

- ✅ **Aucune régression** — tests 0 échec, typecheck 0 = 0, lint 0 = 0.
- ⚠️ **Régression** — typecheck 2 > 0 (**+2**) : 2 erreurs ajoutées dans
  `src/…` → à corriger avant de conclure.

Ne jamais affirmer « ça compile / c'est bon » sans avoir lancé les commandes et lu
leur sortie (cf. règle de vérification avant complétion).
