# Adaptation Cookidoo : fidélité, vérification et latence

## Critères d'acceptation

- Les instructions manuelles peuvent référencer des fragments source numérotés : le serveur les recopie sans reformulation ni nouvelle génération de texte.
- Les quantités et les contraintes du bol restent validées. Les contraintes machine sont décrites sans contradiction et leurs erreurs portent un code fermé utilisable par la réparation.
- Le mode Pétrin annoté couvre son libellé et sa durée. Le contrôle appareil détecte un mode ou une durée incorrecte, pas seulement une commande quelconque.
- Un banc d'essai compare Sonnet seul et un petit modèle avec repli borné, sur un corpus synthétique de régression. Il mesure la latence jusqu'à une adaptation valide et la fréquence des replis, sans exporter vers Cookidoo ni changer la configuration de production.
- Aucun modèle plus petit n'est activé en production sans résultats de comparaison concluants.

## Travail

1. Ajouter les régressions pour les références source, les règles machine et la vue appareil.
2. Introduire le contrat compact v3 et une description machine cohérente ; conserver la validation des anciens formats pour les outils de vérification existants.
3. Réparer la sélection d'empan du mode Pétrin et vérifier le mode/durée de la vue appareil.
4. Ajouter le banc d'essai versionné avec ses fixtures et ses métriques. Vérifier les accès IA sans lire/afficher les secrets.
5. Lancer check, build, tests Deno et revue pre-pr. Livrer le diff local avec les preuves et limites ; commit/push/PR/déploiement restent des actions distinctes.
