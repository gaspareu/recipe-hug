# Guide de développement

Ce document définit le workflow recommandé pour développer `recipe-hug` avec Codex.
Les règles impératives restent dans `AGENTS.md` et dans les `AGENTS.md` imbriqués.

## Setup cible

| Couche | Choix | Rôle |
|---|---|---|
| Code et PR | GitHub + connecteur GitHub Codex | issues, branches, diff, revues et CI |
| Frontend | Vercel + connecteur Vercel Codex | previews, builds et logs runtime |
| Données | Supabase + skill et MCP Supabase | schéma, migrations, logs et advisors |
| Validation UI | navigateur intégré / Playwright | reproduction et vérification visuelle |
| Qualité | skills projet + GitHub Actions | garde-fous déterministes et revue |
| Dépendances | Dependabot | npm et GitHub Actions |

Le set minimal de plugins est donc **GitHub + Vercel + Supabase**. Le navigateur est
une capacité intégrée. `Codex Security` est un complément facultatif pertinent pour les
audits ponctuels, mais il ne remplace ni la CI, ni les RLS, ni la revue `pre-pr`.
Un gestionnaire de tickets externe n'est pas nécessaire tant que GitHub Issues/Projects
suffit au projet.

Permissions recommandées : `ask_before_writes` pour GitHub et Vercel ; `always_ask`
pour tout connecteur visant la production Supabase, puis `ask_before_writes` seulement
sur l'environnement de développement. Le MCP de production versionné demande déjà une
approbation pour chaque appel.

### Actions uniques restantes

État vérifié le **2026-08-23**. Revalider ces constats avant d'agir sur une plateforme
distante.

1. Recopier les cinq valeurs actuellement placées dans Database Vault vers
   **Edge Functions → Secrets** sur `recipe-hug-dev`. Les fonctions utilisent
   `Deno.env.get(...)` : Vault ne les injecte pas automatiquement. Ne jamais recopier une
   donnée utilisateur ni un secret sans vérifier qu'il peut être utilisé hors production.
2. Dans les règles GitHub de `main`, exiger une PR, garder les checks `Frontend` et
   `Edge functions`, ajouter `Dependency review`, puis activer la résolution des
   conversations. Pour un projet solo, zéro approbation obligatoire évite
   l'auto-approbation impossible.
3. Activer `Automatically delete head branches`. N'activer l'auto-merge qu'après la
   règle de PR et uniquement pour des mises à jour de dépendances à faible risque.
4. Créer un compte E2E jetable dans `recipe-hug-dev` correspondant aux secrets GitHub
   `TEST_EMAIL` et `TEST_PASSWORD`. Le workflow CI pointe désormais sur ce projet dev.
5. Traiter les warnings des advisors dans des migrations dédiées : privilèges `EXECUTE`
   des fonctions `SECURITY DEFINER`, appels `auth.uid()` dans les policies et deux clés
   étrangères sans index.
6. Traiter la dette `npm audit` dans une PR dédiée : l'audit courant ne signale aucun
   niveau critique, mais plusieurs avis élevés restent dans React Router et la chaîne
   de build/PWA. Ne pas lancer `npm audit fix` sans revue du diff et validation complète.

### Historique de réparation Supabase

Le **2026-08-23**, l'entrée distante surnuméraire `20260719170220_cookidoo_exports` a
été retirée de `supabase_migrations.schema_migrations`. Elle contenait le SQL déjà
représenté dans le dépôt par `20260719000000_cookidoo_exports`, lui-même marqué appliqué
côté distant. Cette opération a modifié uniquement l'historique de suivi, sans supprimer
ni rejouer le schéma : la table `cookidoo_exports`, ses 15 colonnes, ses 2 index et sa
policy RLS ont été revérifiés après l'opération. Le dépôt et le distant comptent désormais
34 versions chacun, sans version manquante ni surnuméraire. Une tentative de validation
par branche temporaire a ensuite été refusée avant création par Supabase, car Branching
nécessite un plan Pro ; aucune branche et aucun coût n'ont été engendrés.

Le même jour, le projet Free `recipe-hug-dev` (`dltaxjvwtxjpbzcwdqvu`) a été créé en
`eu-west-1` pour isoler le développement. Les 34 migrations ont été rejouées depuis une
base vide avec leurs timestamps d'origine. Le résultat contient les mêmes 10 tables que
la production, toutes avec RLS, ainsi que 33 policies, 3 vues et 5 fonctions. Le serveur
MCP `supabase-dev` est versionné dans `.codex/config.toml` et les variables Vite locales
sont conservées dans `.env.development.local`, qui est gitignoré.

Les 13 edge functions ont ensuite été déployées en version 1 sur ce projet et leur état
`ACTIVE` a été vérifié. Supabase Auth autorise l'email/mot de passe, avec
`http://localhost:8080` comme Site URL et les redirects localhost/Vercel Preview ; Google
OAuth reste désactivé. Sur Vercel, les trois variables `VITE_SUPABASE_*` de Production
restent reliées à la production, tandis que Preview et Development utilisent
`recipe-hug-dev`.

## Nouvelle feature

Utiliser le skill `feature-workflow`.

1. Partir de `main` à jour dans un worktree dédié et une branche `codex/<sujet>`.
2. Transformer la demande en critères d'acceptation observables. Identifier les impacts
   frontend, edge functions, migration, sécurité et E2E avant de modifier le code.
3. Écrire ou adapter les tests au plus près du comportement, puis implémenter par petits
   lots. La logique métier reste dans les hooks et les accès Supabase dans TanStack Query.
4. Lancer `check` pendant le travail. Pour une UI, vérifier aussi le flux dans le
   navigateur ; pour une edge function, lancer `npm run test:edge`.
5. Si le schéma change, créer un fichier dans `supabase/migrations/` et le tester sur une
   branche Supabase isolée. Ne pas appliquer directement une migration expérimentale en
   production.
6. Quand le diff est prêt, lancer `pre-pr` une fois, puis `git-github` pour préparer le
   commit et la PR. La création, le push et le merge restent soumis à une demande
   explicite.

Exemple de demande à Codex :

> Utilise `feature-workflow` pour ajouter … Commence par les critères d'acceptation,
> implémente avec les tests adaptés, vérifie l'UI, puis rends le diff prêt pour `pre-pr`.

## Debug

Utiliser le skill `debug`. Le diagnostic procède de la couche la moins coûteuse vers la
plus distante :

```text
reproduction locale
→ test ciblé / console navigateur / réseau
→ logs du build ou du runtime Vercel
→ logs Auth, API, Postgres ou Edge Supabase
→ état des données et advisors Supabase
```

Toujours relever l'URL, l'environnement, la version affichée en bas du Profil, l'heure
et les étapes de reproduction. Le SHA et la date de build permettent de détecter un
cache PWA ou une preview obsolète.

Un diagnostic n'autorise pas automatiquement un correctif ou une écriture en production.
Quand le fix est demandé, ajouter si possible un test de régression, appliquer le plus
petit changement cohérent, puis vérifier la couche qui avait révélé le problème.

Exemple :

> Utilise `debug` pour diagnostiquer ce bug sur la preview Vercel. Corrige-le seulement
> si la cause est démontrée, ajoute un test de régression et vérifie le parcours réel.

## Supabase et edge functions

- La production est le projet `ifpqsyyvytfpossqycpc` ; son MCP versionné est limité à
  la lecture, aux logs et à la documentation.
- Toute migration est un fichier horodaté committé. Les changements faits dans le
  Dashboard doivent être récupérés sous forme de migration avant la PR.
- Les fichiers `src/integrations/supabase/client.ts` et `types.ts` sont générés et ne
  se modifient jamais à la main.
- Les branches de preview Supabase sont isolées et sans données de production. Prévoir
  un seed minimal non sensible pour les tests.
- Après merge, `.github/workflows/deploy-edge-functions.yml` déploie les fonctions
  touchées. Éviter les déploiements manuels depuis une branche de travail : ils peuvent
  écraser la version de production avec un état non mergé.
- Après un changement de schéma, consulter les advisors sécurité et performance,
  notamment les politiques RLS.

## Pull requests et qualité

`main` ne reçoit jamais de commit direct. Le chemin normal est :

```text
feature-workflow → check → vérification réelle → pre-pr → git-github → CI → merge
```

La CI attend :

- `Dependency review` sur les PR qui modifient les dépendances ;
- `Frontend (tests, build, lint)` ;
- `Edge functions (tests Deno)`.

Les E2E authentifiés tournent après merge pour ne pas fournir de secrets à du code de
PR. Un échec E2E sur `main` doit être traité comme une régression de livraison.

## Dependabot, Renovate et mises à jour

Utiliser le skill `dependency-updates` sur chaque PR de bot.

Politique retenue :

- Dependabot passe le lundi matin ;
- les mineures/patch runtime et développement sont regroupées séparément ;
- les majors restent isolées et nécessitent lecture du guide de migration ;
- un délai de stabilisation retarde les versions toutes fraîches, sans retarder les
  correctifs de sécurité ;
- aucune PR n'est mergée si les checks requis sont rouges ;
- pas de Renovate en parallèle, afin d'éviter les PR et lockfiles concurrents.

Pour une PR simple : inspecter le changelog officiel, le diff de lockfile et les scripts
d'installation, lancer `check:all`, puis vérifier les zones à risque. Une mise à jour de
Vite, React, Supabase, TypeScript, Vitest ou d'une GitHub Action mérite une revue dédiée,
même si SemVer l'annonce comme mineure.

Renovate pourra remplacer — pas compléter — Dependabot si le dépôt devient un monorepo
multi-écosystème ou si son Dependency Dashboard et ses règles d'automerge avancées
deviennent nécessaires.

## Automatisations Codex recommandées

Les automatisations doivent rester en lecture seule et ouvrir un rapport, pas merger ou
déployer seules.

| Fréquence | Tâche | Sortie attendue |
|---|---|---|
| lundi 09:00 | trier les PR Dependabot | risque, changelogs, état CI, ordre de traitement |
| chaque matin | surveiller `main` | CI rouge, déploiement Vercel en échec, E2E post-merge |
| chaque mois | audit Supabase | advisors sécurité/performance et dérive des migrations |
| chaque mois | dette technique | gros bundles, images lourdes, dépendances obsolètes |

Tester chaque prompt manuellement avant de le planifier. Utiliser un worktree de fond
dédié et des permissions étroites. Toute réparation reste une tâche séparée et validée.

## Prompts de travail utiles

- **Feature** : « Utilise `feature-workflow` pour … »
- **Bug** : « Utilise `debug` pour diagnostiquer … ; ne corrige pas sans cause démontrée. »
- **Validation** : « Utilise `check` et donne le verdict par rapport au baseline. »
- **Avant PR** : « La feature est prête, utilise `pre-pr`. »
- **Dépendances** : « Utilise `dependency-updates` pour revoir cette PR Dependabot. »
- **PR** : « Utilise `git-github` pour committer, pousser et ouvrir une PR. »
