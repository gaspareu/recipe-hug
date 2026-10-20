# Correctif Cookidoo : validation du 19 octobre 2026

Branche : `codex/cookidoo-adaptation-resilience`, basée sur `8975c24`.
Version applicative préparée : `1.10.1`. Validation réalisée avant publication de la branche ; aucun déploiement de production effectué.

## Comportement préparé

- Contrat d'adaptation compact v3 : les actions manuelles sont référencées par
  fragments source et recopiées côté serveur ; une quantité utilisée une seule fois
  peut être reprise depuis son total source sans calcul du modèle.
- Les partages de quantités restent explicites et validés. Les fragments manuels
  d'une même étape ne peuvent être inversés ; les instructions four et repos
  explicites ne peuvent disparaître d'une réponse compacte.
- Le prompt machine d'export et le validateur partagent leurs règles. Les erreurs
  personnalisées portent un identifiant fermé et un chemin précis pour la réparation.
- Le parcours Anthropic reçoit un schéma JSON compact ; les autres fournisseurs
  conservent le contrat demandé par prompt et les validations serveur.
- L'annotation Pétrin inclut son libellé et sa durée. La vue appareil est contrôlée
  contre l'intention attendue et la durée : un mode différent ou une mauvaise durée
  n'est plus accepté comme simple présence de guidage. Le résultat porte un
  avertissement `steps_not_guided` si nécessaire ; l'interface existante l'affiche.
- Banc d'essai Sonnet seul contre Haiku puis Sonnet : corpus synthétique de cinq
  recettes, au plus deux appels par essai, délai partagé et métriques de succès,
  latence valide, fréquence de repli et jetons.

## Preuves

| Vérification | Résultat |
|---|---|
| `npm run check` | 595 tests frontend réussis, typecheck sans erreur, lint sans erreur avec 26 avertissements habituels, contrôle de code mort réussi |
| `npm run build` | Réussi |
| `npm run test:edge` | 265 tests réussis, aucun échec |
| `deno check` export Cookidoo, benchmark et bootstrap IA simulée | Réussi |
| Playwright Cookidoo | 3 tests réussis : authentification dev, parcours desktop 1280 px et mobile 390 px |
| Vérification backend intégrée | Supabase dev réel + IA simulée + Cookidoo bloqué : pain et bao adaptés, copie réutilisée après renommage/favori, source inchangée |
| Revue correctness et sécurité `pre-pr` | Deux constats corrigés (ordre manuel et conservation du four) ; régressions ajoutées et corrections revues |
| Benchmark fournisseur réel | Non exécuté : clé Anthropic absente de l'environnement local |

Le premier lancement de Chromium était bloqué par le sandbox macOS ; la relance
ciblée hors sandbox a permis les trois tests navigateur. Les screenshots sont
désormais écrits avec `testInfo.outputPath`, compatible avec la CI Linux.

## Limites

La correction d'empan et le contrôle mode/durée sont couverts par les régressions,
pas encore par un nouvel export Cookidoo réel. La vitesse et la température de la
vue appareil ne sont pas comparées par ce correctif. Les contrôles de fragments ne
prouvent pas toute la fidélité culinaire, notamment au sein d'une phrase composite.

Les tests navigateur utilisent une API Cookidoo simulée. La vérification backend
utilise une IA simulée : elle ne constitue ni une mesure Haiku/Sonnet, ni une
validation physique sur TM7. Aucun gain de latence n'est annoncé et aucun modèle
de production n'a été changé.

Pour lancer la comparaison réelle avec une clé déjà injectée, voir
`scripts/verification/COOKIDOO-BENCHMARK.md`. Choisir le modèle après comparaison du
temps jusqu'à une adaptation valide et revue culinaire, en comptant les échecs et
replis. La livraison suit ensuite branche, PR, CI et merge autorisé.
