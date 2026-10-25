# Boucle de correction Cookidoo — validation du 25 octobre 2026

Branche `codex/cookidoo-correction-autonome`, depuis le merge de la PR #195
(`3adc33a`). Version applicative 1.11.1, adaptateur `cookidoo-classic-v5`.

## Incident observé

Sur trois tentatives du risotto en production le 25 octobre, entre 11:07 et 11:09 UTC,
la v4 s'est arrêtée après une correction. La validation avait signalé successivement
des incohérences d'ingrédients concernant le bouillon, le sel puis le riz. Les tentatives
duraient environ 9 à 11 secondes sur un budget de 60 secondes. Aucun export Cookidoo
n'avait été créé pour cette recette. Les candidats bruts n'étant pas conservés, ces
traces ne prouvent pas si le défaut suivant était latent ou introduit par le patch.

Le résultat `needs_input` générique imposait une précision ou de l'eau pour relancer
un échec technique, sans expliquer quel ingrédient ou quelle action bloquait.

## Changement

- Une génération, puis jusqu'à trois patchs ciblés sous le même signal de 60 secondes.
  Chaque tour conserve le dernier candidat et recalcule les indices autorisés après
  insertions ou suppressions. Toute la validation est réexécutée avant un résultat prêt.
- Arrêt sur patch interdit, JSON inexploitable, absence de scope fiable, cycle,
  diagnostic répété, plafond ou expiration. Les erreurs fournisseur ne sont pas rejouées.
- Diagnostics d'ingrédients distinguant ajout absent, préparation non référencée,
  quantité manquante, quantité inconnue, ajout nul et somme modifiée. Les règles
  de conservation des ingrédients et quantités restent strictes.
- Un échec technique produit `failed`, sans recette ni confirmation d'envoi. Une
  explication déterministe précise la cause, les ingrédients et les étapes source
  disponibles. La relance n'impose aucune précision ni eau artificielle.
- `needs_input` reste réservé aux blocages culinaires du plan validé. Le prompt
  demande une question concrète et interdit de déléguer les erreurs techniques
  à l'utilisateur. La confirmation avant envoi Cookidoo reste obligatoire.
- Les noms d'ingrédients destinés au propriétaire ne sont pas ajoutés aux journaux.
  Les journaux contiennent uniquement les codes fermés, indices et raison d'arrêt.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `npm run check` | 596 tests réussis, types sans erreur, lint 0 erreur / 26 avertissements préexistants, détection de code mort sans résultat |
| `npm run test:edge` | 285 tests réussis, 0 échec |
| `npm run build` | Réussi |
| `deno check --config supabase/functions/deno.json --frozen` : fonction, benchmark et bootstrap de simulation | Réussi |
| Chromium | 6 tests réussis : authentification, aperçu/envoi/reprise desktop/mobile, précision culinaire, échec technique et relance desktop/mobile |
| Inspection visuelle mobile | Message lisible, bouton de relance visible, aucun champ de précision imposé ni débordement horizontal |
| Supabase développement avec quota et IA simulés, Cookidoo bloqué | Pain et bao réussis, patch forcé, réutilisation après titre/favori, source intacte ; reprise après précision puis erreur fournisseur réussie |
| Revues correctness et sécurité | Un constat de persistance corrigé ; relectures ciblées sans blocage restant |

Les régressions synthétiques couvrent notamment trois défauts successifs de type
risotto, la référence d'une préparation sans nouvel ajout, la conservation des
corrections, les indices après insertion, le plafond de trois corrections, les
blocages répétés, l'expiration pendant une correction et la confidentialité.

La revue a trouvé qu'une reprise après précision suivie d'une erreur fournisseur
pouvait réafficher l'ancien aperçu et l'ancienne question. Les chemins d'échec et
d'expiration effacent désormais cet état périmé, tout en conservant le contexte
utilisateur. Le test intégré vérifie `needs_input → précision → 503 → failed`,
avec message technique courant, aperçu et confirmation absents.

Le quota quotidien du compte de test a été atteint lors des répétitions. Le bootstrap
local simule désormais explicitement cette RPC ; la fonction déployée garde le quota
réel. Authentification, base, réservation et persistance du projet dev restent réelles.

## Limites

Le cas exact de production ne peut pas être rejoué sans le candidat IA brut. Les
fixtures sont synthétiques et ne constituent pas un nouveau test fournisseur ou
Cookidoo/TM7 réel. Aucun gain réel de latence, coût ou réussite culinaire n'est affirmé.
Le modèle reste inchangé. La boucle peut encore échouer et s'arrête explicitement.
Les noms simples d'ingrédients et le graphe de préparations restent des contrôles
structurels conservateurs, pas une compréhension culinaire complète.

Aucune écriture en production ni déploiement direct. Livraison par branche et PR.
La version v5 invalidera le cache v4 lors de sa livraison par le flux PR/CI habituel.
