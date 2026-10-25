# Autocorrection Cookidoo bornée

1. Contrat v4 : chaque fragment source est conservé ou remplacé une seule fois ; une préparation transférée est référencée sans nouvel ajout d'ingrédients.
2. Validation des références, quantités et transitions ; diagnostics fermés avec indices des étapes/fragments/ingrédients concernés.
3. Après une proposition JSON exploitable mais invalide, un seul appel de réparation renvoie des remplacements d'étapes sur les indices autorisés. Les autres étapes et métadonnées restent identiques. Revalidation globale avant tout aperçu.
4. Schémas JSON distincts pour génération et réparation, sous le même délai global de 60 s. Pas de repli automatique après une erreur fournisseur ni de correction arbitraire de réglages ou quantités.
5. Régressions Parmentier (action poêle/bol répétée), transferts, correction hors périmètre, erreurs introduites, délais et confidentialité. Adapter les outils simulés et le banc d'essai existants.
6. Check, tests Edge, build, parcours dev simulé, puis revue pre-pr. Aucun changement de données ou de modèle en production, aucun envoi Cookidoo réel.

Limite explicite : le suivi porte sur les fragments et préparations déclarés ; il ne prouve pas toute la sémantique d'une phrase composite. En cas d'ambiguïté, conserver le passage manuel et demander confirmation dans l'aperçu.
