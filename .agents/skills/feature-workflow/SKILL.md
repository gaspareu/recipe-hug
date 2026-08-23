---
name: feature-workflow
description: Conduit une nouvelle feature recipe-hug de la demande à un diff prêt pour revue — critères d'acceptation, impacts frontend/Supabase, tests, vérification UI et garde-fous. À utiliser pour une évolution produit ; pas pour un diagnostic isolé ni une simple mise à jour de dépendance.
---

# Feature workflow

Transformer la demande en comportement vérifiable, puis livrer le plus petit changement
cohérent qui respecte l'architecture du dépôt.

## Cadrage

1. Lire les `AGENTS.md` applicables et inspecter les chemins concernés avant de proposer
   l'implémentation.
2. Formuler les critères d'acceptation et signaler les choix qui modifieraient le
   périmètre produit. Planifier quand plusieurs couches ou étapes dépendent les unes des
   autres.
3. Travailler hors `main`, dans un worktree et une branche dédiés. Ne créer ni push ni
   PR sans demande explicite.

## Implémentation

- Colocaliser les tests avec le comportement modifié et privilégier un test de régression
  observable plutôt qu'un test de structure.
- Garder la logique métier non triviale dans `src/hooks/`. Encapsuler les accès Supabase
  dans un hook TanStack Query ; composer l'UI avec les composants existants.
- Pour une évolution UI, charger `ui-ux-pro-max`, respecter le français, le responsive,
  l'accessibilité et les états chargement/vide/erreur.
- Pour un changement de schéma, créer une migration horodatée et la tester sur un
  environnement Supabase isolé. Une demande de feature n'autorise pas une écriture en
  production.
- Pour une edge function, suivre `supabase/functions/AGENTS.md` et ajouter les tests des
  modules partagés pertinents.

## Vérification

1. Utiliser `check` pendant l'implémentation.
2. Vérifier le flux réel dans le navigateur si le comportement est visible ou interactif.
3. Lancer `npm run test:edge` si le backend Deno est concerné, et `npm run build` si les
   imports, Vite ou la PWA changent.
4. Quand le travail est prêt, passer une seule fois par `pre-pr`. Utiliser ensuite
   `git-github` uniquement si l'utilisateur demande le commit, le push ou la PR.

Rendre un bilan centré sur les critères satisfaits, les preuves de validation et les
actions externes encore nécessaires.
