---
name: pre-pr
description: Revue approfondie avant d'ouvrir une PR sur recipe-hug — enchaîne le skill check, une revue de simplification, une revue de correctness et une revue de sécurité. À lancer une fois quand une feature est prête. Pour la vérification rapide, utiliser check.
---

# pre-pr — revue approfondie avant PR

Séquence à lancer **une seule fois**, quand le travail est prêt, juste avant
d'ouvrir la PR. Elle chaîne le garde-fou déterministe puis les revues par agents.
Coûteux (plusieurs revues) — pendant le développement, s'en tenir à **check**.

Ne pas ouvrir la PR tant que les points **CRITICAL / HIGH** ne sont pas traités.

## Étapes (dans l'ordre)

1. **Garde-fou rapide** — lancer le skill **check**. Ne pas continuer tant que les tests
   ne sont pas au vert et que typecheck/lint ne sont pas au niveau du baseline
   (pas de régression). Inutile de lancer les agents sur du code cassé.

2. **Simplification** — relire le diff pour réduire la duplication et la complexité
   accidentelle. Appliquer uniquement les corrections qui préservent le comportement.

3. **Revues correctness et sécurité** — déléguer en parallèle à deux sous-agents
   bornés, l'un chargé des bugs et régressions, l'autre des risques de sécurité.
   Leur fournir le diff (`git diff HEAD` si non commité, sinon
   `git diff origin/main...HEAD`) et les consignes `AGENTS.md`. Ne leur autoriser
   aucune modification ; le parent vérifie puis applique les correctifs retenus.

4. **Re-vérifier** — si les étapes précédentes ont modifié du code, relancer **check**
   pour confirmer l'absence de régression.

5. **Commit & PR** — passer la main au skill **git-github** (branche, commit
   conventionnel en français, push, PR). Résumer dans la PR les résultats de la
   revue et de la validation.

## Notes

- Si des edge functions (`supabase/functions/`) sont touchées, rappeler le
  redéploiement (cf. skill git-github) — committer ne déploie pas.
