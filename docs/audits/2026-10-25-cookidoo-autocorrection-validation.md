# Validation de l'autocorrection Cookidoo — 25 octobre 2026

Implémentation locale sur `codex/cookidoo-correction-ciblee`, depuis `origin/main`
`07abaef`. Version applicative 1.11.0, adaptation `cookidoo-classic-v4`.

## Comportement

- Chaque fragment source est conservé ou remplacé une seule fois. Les transferts
  réutilisent une préparation existante sans réajouter ses ingrédients.
- Les transformations consomment les anciennes références. Les fragments d'une même
  préparation suivent ensemble les mouvements ; un transfert du bol déplace tout son contenu.
- Les quantités restent conservées, le lavage et l'eau vapeur exigent un bol vide,
  les étapes explicitement manuelles ne deviennent pas des commandes par extraction de texte.
- Une erreur localisable autorise un seul patch des étapes signalées, puis une
  revalidation complète : contrat, fragments, préparations, quantités, machine et payload.
  Les autres étapes et les métadonnées ne peuvent pas être réécrites par le patch.
- Génération et réparation partagent un délai global de 60 secondes, au plus deux
  appels IA. Une erreur fournisseur ou un JSON sans périmètre fiable ne déclenche
  pas de régénération globale. Un patch refusé renvoie `needs_input`, sans recette
  exécutable. L'envoi exige toujours la confirmation de l'aperçu.
- Les diagnostics utilisent des codes fermés et des indices ; aucun contenu de recette,
  sortie IA brute ou secret n'est ajouté aux journaux.

## Vérifications exécutées

| Vérification | Résultat |
| --- | --- |
| `npm run check` après corrections de revue | 595 tests frontend, typecheck sans erreur, lint sans erreur (26 avertissements préexistants), recherche de code mort sans résultat |
| `npm run test:edge` après corrections et nettoyage | 278 réussis, 0 échec |
| `npm run build` | Réussi |
| `deno check --config supabase/functions/deno.json --frozen` sur la fonction, le benchmark et le bootstrap simulé | Réussi |
| Chromium : authentification et parcours Cookidoo | 4 réussis : authentification, aperçu/envoi/reprise simulés à 1280 et 390 px, refus de patch puis clarification sans envoi automatique |
| Intégration Supabase développement, IA simulée, Cookidoo interdit | Pain : 4 étapes / 1 commande ; bao : 6 étapes / 2 commandes ; réparation ciblée forcée, réutilisation de copie, renommage/favori et source intacte |
| Revues correctness et sécurité | Deux passes, six constats corrigés, relecture ciblée sans blocage restant |
| `git diff --check` | Aucun problème |

Les régressions couvrent notamment la répétition poêle/bol du Parmentier, la graisse
oubliée dans une préparation externe, la double utilisation d'une ancienne référence
de pâte, l'eau vapeur avec aliments encore dans le bol, les patchs hors périmètre,
un nouveau défaut introduit par le patch, le délai et la confidentialité.

## Nettoyage après code review

La seconde revue a identifié trois divergences supplémentaires : un transfert
externe au Varoma effaçait fictivement l'eau du bol dans le moteur historique ; un
transfert alimentaire vers le bol rempli d'eau technique restait accepté ; une
répartition `0 + 300` passait le validateur puis échouait au rendu sans localisation.
Ces trois cas ont une régression, avec contrôles positifs des parcours valides.

- Champs communs et listes fermées partagés entre les schémas runtime et transport.
- Décodage JSON borné centralisé à la frontière fournisseur ; le moteur de patch
  reçoit un objet validable, sans sérialisation/décodage intermédiaires.
- Conservation et résolution des quantités centralisées dans `ingredient-uses.ts`.
- Intention vapeur partagée par le contrat machine, le validateur, le rendu,
  le mapper et les contrôles de préparation.
- Le graphe v4 porte l'état exact des préparations et de l'eau ; le rendu v4 ne
  repasse plus par la simulation approximative du bol historique. Le point d'entrée
  historique reste isolé pour conserver ses tests et son contrat de compatibilité.
- Suppression du double mapping/contrôle immédiat dans la fonction et d'un catch
  inatteignable ; validation finale du payload conservée dans `applyActionPlan`.

Après ce nettoyage : `npm run check`, les 278 tests Edge, le contrôle de types Deno
et le parcours intégré dev simulé ont été relancés avec succès. Les quatre tests
navigateur et le build avaient passé avant cette passe ; aucune UI n'a été modifiée.

## Limites et livraison

Le découpage en fragments et la reconnaissance de noms simples d'ingrédients sont
des contrôles conservateurs, pas une preuve de la sémantique culinaire complète.
Les phrases composites ou ambiguës peuvent encore demander une précision.

Aucun essai avec un vrai fournisseur IA ou Cookidoo/TM7 n'a été réalisé ici.
Aucun gain réel de latence ou de coût n'est mesuré ; le modèle reste inchangé.
Le benchmark utilise désormais le même contrat et les mêmes patchs ciblés.

Aucune écriture en production ni déploiement direct. Livraison par branche et PR.
Les modifications Edge nécessiteront la livraison par CI suivant le flux du
dépôt et la vérification de la nouvelle version de fonction pour devenir actives.
