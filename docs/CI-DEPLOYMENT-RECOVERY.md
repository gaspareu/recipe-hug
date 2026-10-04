# Remise en état CI et déploiements — 4 octobre 2026

## Corrections préparées

Branche `codex/fix-ci-e2e`, basée sur `5042cf6` : attentes « Le Livre » dans les E2E,
lecture du thème simulée sans modification du profil, collecte de `test-results/`
par la CI (le reporter Playwright est `list`, sans rapport HTML), sélection de
l’environnement GitHub `Production` par le job de déploiement backend.

Validation locale : 16 E2E réussis contre le projet de développement,
579 tests unitaires réussis, typecheck sans erreur, lint sans erreur
(26 avertissements préexistants), Knip sans résultat, build de production réussi.
Les E2E créent puis nettoient leurs recettes et repas sur le compte test.

## Base de développement

Projet exclusivement concerné : `dltaxjvwtxjpbzcwdqvu`.
Les trois migrations versionnées manquantes ont été appliquées via MCP :

| Fichier du dépôt | Version créée par MCP |
| --- | --- |
| `20260825102102_grant_authenticated_snapshot_table_privileges.sql` | `20261004065823` |
| `20260826000000_add_voice_rate_limits.sql` | `20261004065829` |
| `20261003075820_livre_modulaire_v1.sql` | `20261004065644` |

La colonne `meal_plans.composition_id` est présente et la RLS est active sur les
six nouvelles tables. Les versions MCP diffèrent des noms de fichiers :
l’historique reste à réconcilier. Ne pas rejouer ces migrations SQL.

Après approbation explicite, utiliser la procédure officielle Supabase
`migration repair`, qui ne réexécute pas le SQL et ne supprime pas les tables.
Vérifier à nouveau le schéma et l’historique avant ces commandes.

```bash
npx supabase link --project-ref dltaxjvwtxjpbzcwdqvu
npx supabase migration repair 20261004065644 20261004065823 20261004065829 --status reverted --linked
npx supabase migration repair 20260825102102 20260826000000 20261003075820 --status applied --linked
```

Employer un accès CLI authentifié au projet dev ; saisir le mot de passe par
invite ou configuration locale secrète, jamais dans un commit ou cette documentation.

## Secrets du déploiement de production

Les secrets `SUPABASE_ACCESS_TOKEN` et `SUPABASE_DB_PASSWORD` sont configurés dans
l’environnement GitHub `Production`. Le job de déploiement sélectionne désormais
cet environnement avec `environment: Production`. La condition qui limite le job
à `main` reste obligatoire : aucune branche de PR ne doit recevoir ces secrets.

Le mot de passe correspond à PostgreSQL du projet de production
`ifpqsyyvytfpossqycpc`. Ne pas utiliser le mot de passe dev et ne pas coller de
secret dans un chat ou une documentation.

Lien : https://github.com/gaspareu/recipe-hug/settings/environments

Le run `37185113729` a échoué avant migration et déploiement : sans sélection de
l’environnement, le secret `SUPABASE_DB_PASSWORD` était inaccessible au job.
La migration du Livre et `recommend-pairings` étaient déjà présentes en production
lors de la vérification du 4 octobre. Après fusion, le workflow modifié relance
l’application des migrations manquantes puis déploie toutes les fonctions de `main`.
Vérifier la réussite des deux étapes dans GitHub Actions ; les checks de PR
n’exécutent pas ce déploiement ni les E2E authentifiés.
