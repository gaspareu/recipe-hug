---
name: check
description: Garde-fou qualité rapide du projet recipe-hug — lance tests + typecheck + lint et compare le nombre d'erreurs au baseline de non-régression. À utiliser à volonté pendant le dev et avant tout commit. Déterministe, ~40 s. Pour la revue approfondie (agents), voir /pre-pr.
---

# /check — garde-fou qualité rapide

Vérifie qu'un changement n'introduit **aucune régression**, sans exiger zéro erreur
(le projet porte une dette de types/lint préexistante — cf. baseline ci-dessous).
Rapide et déterministe : à lancer autant de fois que nécessaire pendant le dev.

Pour la revue approfondie par agents (simplification, correctness, sécurité)
avant d'ouvrir une PR, utiliser plutôt **/pre-pr**.

## Baseline de non-régression

Comparer au baseline plutôt que d'exiger zéro. Au **2026-07-23** :

| Commande | Baseline (dette préexistante) |
|----------|-------------------------------|
| `npm run test:run` | **0 échec** (491 tests) — doit rester à 0 |
| `npm run typecheck` | **0 erreur** |
| `npm run lint` | **0 problème** |

> Ces chiffres évoluent avec la dette. Si tu résorbes ou ajoutes de la dette
> légitimement, **mets à jour ce tableau ET celui du `CLAUDE.md`** dans le même commit.

## Procédure

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
   comparer à `origin/main` sur un arbre propre :
   ```bash
   git stash push -u -m baseline && npm run typecheck 2>&1 | grep -cE "error TS"; git stash pop
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
