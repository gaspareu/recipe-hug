---
name: pre-pr
description: Revue approfondie avant d'ouvrir une PR sur recipe-hug — enchaîne le garde-fou /check, puis /simplify, la revue de correctness (agent code-reviewer) et /security-review. À lancer une fois, quand une feature est prête, avant commit/PR. Coûteux (agents LLM, plusieurs minutes) — pour la vérif rapide et répétée, utiliser /check.
---

# /pre-pr — revue approfondie avant PR

Séquence à lancer **une seule fois**, quand le travail est prêt, juste avant
d'ouvrir la PR. Elle chaîne le garde-fou déterministe puis les revues par agents.
Coûteux (agents LLM) — pendant le dev, s'en tenir à **/check**.

Ne pas ouvrir la PR tant que les points **CRITICAL / HIGH** ne sont pas traités.

## Étapes (dans l'ordre)

1. **Garde-fou rapide** — lancer **/check**. Ne pas continuer tant que les tests
   ne sont pas au vert et que typecheck/lint ne sont pas au niveau du baseline
   (pas de régression). Inutile de lancer les agents sur du code cassé.

2. **/simplify** — revue qualité (reuse, simplification, efficiency, altitude) et
   application des correctifs sur le diff courant.

3. **Revue de correctness** — lancer l'agent `pr-review-toolkit:code-reviewer` sur
   le diff (`git diff HEAD` si non commité, sinon `git diff origin/main...HEAD`).
   Traiter les bugs à confiance élevée ; ignorer le style (déjà couvert par /simplify).

4. **/security-review** — revue de sécurité des changements de la branche.

5. **Re-vérifier** — si les étapes 2-4 ont modifié du code, relancer **/check**
   pour confirmer l'absence de régression.

6. **Commit & PR** — passer la main au skill **git-github** (branche, commit
   conventionnel en français, push, PR). Résumer dans la PR les résultats de la
   revue et de la validation.

## Notes

- Les étapes 2-4 sont **indépendantes** mais je les enchaîne séquentiellement ici
  pour dédupliquer et appliquer les correctifs entre chacune proprement.
- **`/code-review ultra`** (revue cloud multi-agents, facturée) est déclenchée
  **par l'utilisateur uniquement** — je ne peux pas la lancer moi-même. La
  proposer comme option manuelle pour une revue exhaustive avant un merge sensible.
- Si des edge functions (`supabase/functions/`) sont touchées, rappeler le
  redéploiement (cf. skill git-github) — committer ne déploie pas.
