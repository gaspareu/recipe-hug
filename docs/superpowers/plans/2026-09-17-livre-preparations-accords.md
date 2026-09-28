# Livre modulaire : préparations, accompagnements, plats et menus

**Statut :** plan de V1 ; les deux arbitrages de session et d'accords sont validés. L'architecture détaillée est jointe à ce plan.

**Date :** 2026-09-17

**Périmètre :** Livre, mode cuisine, recommandations, planning et liste de courses. Aucun code applicatif ni schéma n'est modifié par ce document.

Voir les graphes et les exemples chiffrés dans [l'architecture du Livre](2026-09-19-livre-architecture.md).

## Intention et vocabulaire

Le Livre doit distinguer une préparation réutilisable, un accompagnement et un plat qui constitue déjà un repas. On peut associer librement ces fiches pour créer un plat composé, puis réunir plusieurs plats dans un menu. L'inspiration est le traitement des [accompagnements](https://ottolenghi.co.uk/pages/sides-recipes) et des [accords](https://books.ottolenghi.co.uk/type/flavour-pairing/) chez Ottolenghi : les propositions de service relient des recettes consultables séparément. Il s'agit d'une direction produit pour recipe-hug, pas d'une reproduction de leurs contenus.

| Notion affichée | Sens dans l'application | Exemple |
| --- | --- | --- |
| **Préparation** | Fiche autonome et réutilisable, avec ses ingrédients et étapes. | Pain bao |
| **Accompagnement** | Rôle d'une préparation ; peut être mangé seul ou associé à un plat. | Carottes au cumin |
| **Plat complet** | Fiche existante qui constitue déjà un repas et se cuisine directement. | Pâtes au poulet |
| **Accord** | Suggestion de fiches complémentaires, expliquée et modifiable avant enregistrement. | Ajouter une sauce aux carottes |
| **Plat composé** | Composition enregistrée de fiches ordonnées, avec une éventuelle instruction d'assemblage/service. | Carottes + yaourt + riz |
| **Menu** | Suite ordonnée de plats complets, plats composés et, si utile, préparations seules, regroupés par service. | Entrée de légumes, plat de carottes, dessert |
| **Planning** | Calendrier hebdomadaire de repas existant. Un créneau peut pointer vers une fiche, un plat composé ou un menu. | Dîner de jeudi : menu automnal |

Un accord suggéré n'est jamais enregistré automatiquement. L'utilisateur choisit, retire, remplace et ordonne les fiches avant de créer un plat composé ou un menu.

## État constaté dans ce dépôt

- `recipes` contient déjà titre, portions, ingrédients JSON, étapes JSON, saison, tags, statut et favoris. `src/types/recipe.ts` et `src/hooks/useRecipes.ts` la traitent comme une seule unité. Les recettes existantes mélangent aujourd'hui préparations et plats complets ; elles restent intactes et visibles, sans classement ou découpage automatique de leurs étapes.
- `src/components/cooking/CookingMode.tsx` reçoit une seule `Recipe` : progression numérique, portions, ingrédients cochés, minuteurs et chat Chef sont tous rattachés à cette recette. `CookingModeContainer.tsx` et `useHomeChat.ts` démarrent avec un `recipeId` unique.
- `meal_plans` porte actuellement un `recipe_id` ou un `custom_meal` par créneau ; `useMealPlans.ts`, `MealPlanning.tsx` et `GroceryListSheet.tsx` construisent l'affichage et les courses à partir d'une recette par repas.
- Les préférences culinaires disposent déjà des goûts, allergies/restrictions, régimes et équipements (`useUserPreferences.ts`). Le chat dispose de `search_recipes`, `get_recipe_details` et `start_cooking` dans `home-assistant`, mais d'aucun contrat de composition ou de recommandation d'accords.

## Décisions proposées pour la V1

1. **Garder `recipes` comme source des fiches culinaires.** Ajouter une classification facultative `préparation` / `plat complet` et des rôles culinaires multiples pour les préparations (`accompagnement`, base, sauce, garniture, dessert, etc.), puis temps, saveurs dominantes, texture, équipement, préparation à l'avance et compatibilités alimentaires. Ces données complètent les champs existants ; elles ne remplacent pas `nutrition_tags`. Les recettes historiques restent visibles sous « À classer » tant qu'elles ne sont pas revues ; une suggestion de classification par l'IA doit être vérifiable et corrigeable par l'utilisateur. À la création d'une fiche, demander si c'est une préparation ou un plat complet.
2. **Créer une composition distincte**, avec un type `dish` ou `menu`. Un plat composé référence des fiches (`préparation` ou `plat complet`) ; un menu référence des plats composés ou des fiches seules. Le menu ne contient pas de menu, et le plat composé ne contient pas de plat composé : deux niveaux suffisent et évitent les cycles. Les éléments gardent un ordre, un service éventuel, des notes et un coefficient de quantité (défaut 1). Les instructions d'assemblage sont saisies ou acceptées explicitement, jamais inventées dans les étapes sources.
3. **Conserver les recettes liées vivantes.** Une modification d'une fiche se reflète dans les compositions à la prochaine ouverture. Au démarrage du mode cuisine, la session fige cependant les ingrédients et étapes chargés, pour éviter qu'une édition externe change la progression en cours. Archiver une fiche l'exclut des nouvelles suggestions mais conserve les compositions enregistrées ; une suppression définitive doit signaler les compositions à corriger avant de réussir.
4. **Distinguer le menu du planning.** Le menu décrit ce que l'on sert ensemble ; le planning décrit quand on le sert. Un menu peut être enregistré une fois et placé dans plusieurs semaines.
5. **Livrer un moteur hybride.** Une première passe déterministe applique les contraintes et classe les préparations du Livre. L'IA réordonne un petit ensemble de candidats et formule des raisons culinaires courtes. Le serveur revérifie les identifiants et contraintes après la réponse IA. Si l'IA est indisponible, les suggestions déterministes restent utilisables.

## Parcours dans le Livre

### Parcourir et composer

- L'entrée `/dashboard` présente clairement **Préparations** (dont accompagnements), **Plats** (complets et composés) et **Menus**, ainsi qu'un accès aux fiches **À classer**. La recherche couvre leurs titres ; les filtres actuels saison, statut et favoris restent disponibles là où ils ont un sens. La présentation reste éditoriale, lisible sur mobile et peu dépendante des photos. Elle ne suppose aucun changement de navigation globale.
- La fiche d'une préparation conserve lecture, édition, favori, partage, historique, assistant et cuisine. Elle ajoute « Accords possibles » : deux ou trois propositions à la fois, chacune avec les éléments proposés, une raison concrète et les éventuelles données à vérifier. L'utilisateur peut ignorer, remplacer ou ajouter manuellement une préparation.
- Le composeur affiche une vue du plat ou du menu, l'ordre des éléments, les portions, la liste des ingrédients et les instructions d'assemblage. Il propose **Enregistrer** puis **Cuisiner**. Le choix manuel reste disponible même sans moteur IA ou sans métadonnées enrichies.
- Une préparation ou un plat complet peut toujours se cuisiner directement, sans passer par une composition artificielle. Les anciennes fiches et URL `/recipes/:id` continuent de fonctionner.

### Exemple de flux cible

1. Ouvrir « Carottes rôties au cumin » dans le Livre.
2. Voir « Avec un yaourt citronné : apporte fraîcheur et acidité » et « Avec du riz : apporte une base neutre ».
3. Choisir ces deux accords, fixer quatre portions, permuter l'ordre si besoin et enregistrer « Carottes, yaourt citronné et riz ».
4. Ajouter ce plat au dîner du jeudi, ou le mettre dans un menu avec une entrée et un dessert.
5. Lancer **Cuisiner** : une session unique présente toutes les préparations et une liste globale d'ingrédients.

## Contrat du mode cuisine composé

- **Entrée unique** : `CookingTarget = { type: 'recipe' | 'dish' | 'menu', id, servings }`. Le mode actuel reste le cas `recipe` ; une couche de chargement résout les compositions et crée un `CookingRun` commun.
- **Concaténation explicite** : parcourir les éléments dans l'ordre choisi, puis les étapes de chaque fiche source dans leur ordre. Insérer des séparateurs tels que « Préparation 1/3 — Carottes rôties » ou « Plat complet — Pâtes au poulet » et, pour un menu, « Entrée / Plat / Dessert ». Les éventuelles étapes de dressage viennent après les fiches du plat composé. La V1 est séquentielle ; `parallel_with` garde son sens *à l'intérieur* de chaque recette, sans calendrier automatique entre fiches.
- **Identités stables** : chaque étape et minuteur porte l'identifiant de l'élément de composition + celui de la fiche source + l'ordre de l'étape (ou la fiche seule lorsqu'il n'y a pas de composition). Deux occurrences de la même recette ne fusionnent donc pas leur progression. Le retour arrière et le redémarrage restent possibles, avec un résumé par fiche et un total global.
- **Portions et ingrédients** : partir du rendement de chaque fiche, appliquer `portions demandées ÷ portions de la fiche × coefficients des éléments traversés` (menu puis plat composé), puis réutiliser la logique de mise à l'échelle existante. Si le rendement historique manque, afficher l'hypothèse actuelle de deux portions et demander sa correction au moment de composer. Présenter une liste globale agrégée **et** le détail par fiche ; ne sommer automatiquement que les mêmes ingrédients et unités compatibles. Les unités ou noms ambigus restent sur des lignes séparées avec leur provenance.
- **Chef en contexte** : transmettre le titre de la composition, la fiche/étape active et les étapes terminées avec leurs identifiants, au lieu de faire passer le menu pour une recette unique. Les commandes « autre recette » et « modifier cette préparation » doivent cibler explicitement l'élément concerné. Éviter d'envoyer les étapes de tout un grand menu dans chaque requête si seul le contexte actif suffit.
- **Résilience** : chargement, préparation inaccessible, erreur de données et absence d'étapes ont des états explicites. Les minuteurs commencés avant un changement de préparation restent visibles. Le mode plein écran garde l'accessibilité clavier/lecteur d'écran, les cibles tactiles et les safe areas mobiles.

## Moteur de recommandation

### Données et génération de candidats

- Partir uniquement des fiches et compositions **du compte authentifié**. Exclure les recettes archivées et privilégier `tested`/`validated` ; une option peut autoriser les brouillons de l'utilisateur. Un plat complet peut recevoir un accompagnement ; une préparation peut recevoir une base, une sauce ou un plat complet. Ne jamais suggérer la fiche source comme son propre accord.
- Appliquer d'abord les exclusions explicites (allergies, restrictions, ingrédients refusés, équipement indisponible). Les ingrédients sont aujourd'hui du texte libre : une absence de tag allergène **ne prouve pas** la compatibilité. Face à une allergie ou restriction stricte et à des métadonnées inconnues, écarter le candidat des accords automatiques jusqu'à vérification ; la recherche manuelle peut encore l'afficher avec « compatibilité à vérifier ». Prévoir la revue des métadonnées par l'utilisateur.
- Classer les candidats selon la complémentarité des rôles, des saveurs et textures, la saison, la durée/charge de préparation, le nombre de portions et les goûts de l'utilisateur. Dédupliquer les accords trop semblables. Les accords automatiques sélectionnables référencent toujours une fiche existante. Quand le Livre est trop petit, le moteur peut afficher un manque générique tel que « ajouter une sauce » ou « ajouter une base » ; cette indication n'est ni sélectionnable ni enregistrable tant que l'utilisateur n'a pas choisi ou créé une fiche correspondante.

### IA contrôlée et retour utilisateur

- Ajouter une fonction Edge dédiée, par exemple `recommend-pairings`, avec `verify_jwt = true`. Elle valide le JWT, déduit l'utilisateur côté serveur, lit ses données avec un client soumis à la RLS et utilise la configuration IA existante (`resolveAIConfig`) ; aucun `user_id` fourni par le client n'est accepté comme autorité. Un éventuel client service role est limité à la configuration interne qui l'exige et chaque lecture associée reste filtrée par l'identifiant authentifié. Entrée bornée : fiche ou composition source, nombre de convives et contraintes de temps/occasion facultatives. Sortie structurée : identifiants de candidats existants, type de plat/menu proposé, raison courte, éventuelles réserves. N'envoyer au fournisseur IA que les métadonnées culinaires nécessaires des candidats déjà filtrés, repérées par des jetons temporaires plutôt que par leurs UUID internes, sans identité, texte complet de recette, allergie ni ingrédient refusé. La fonction conserve la correspondance jeton-identifiant et revérifie les candidats avant de répondre. Limiter les candidats, les sorties et la fréquence ; si un cache est ajouté, sa clé inclut le compte, la source et les versions des recettes/préférences pour empêcher tout résultat partagé entre utilisateurs.
- Rejeter après génération toute proposition dont l'identifiant n'appartient pas au compte, qui viole une contrainte connue, qui double une préparation ou dont la composition est invalide. En cas d'échec IA, afficher le classement local explicable. Les raisons doivent parler de cuisine (« acidité contre richesse », « sauce pour lier »), sans inventer des caractéristiques absentes des données.
- Permettre « pertinent / pas pour moi » et « masquer cet accord » pour améliorer le classement futur. Mesurer, sans journaliser les textes complets des recettes ni les allergies dans la télémétrie, l'affichage, le choix et l'enregistrement des accords. Ne pas lancer de recherche d'embeddings avant d'avoir évalué les résultats de cette V1.

## Données et intégrations

- Ajouter par migration un champ facultatif de classification sur `recipes` (`entry_kind = preparation | complete_dish | null`) et une table facultative 1:1 `recipe_pairing_profiles` pour les métadonnées utiles aux accords et leur état de revue. `null` signifie « À classer » pour les anciennes recettes. Ajouter des tables de compositions et d'éléments (par exemple `compositions` et `composition_items`) avec `user_id`, `kind`, ordre, référence de fiche **ou** de plat composé enfant, et coefficient. Contraintes : exactement une référence par élément ; plat composé → fiche ; menu → plat composé ou fiche ; aucune référence à un autre compte ; ordre stable ; pas de cycle. Activer la RLS propriétaire sur les nouvelles tables et vérifier les droits réels de la Data API. Créer les migrations sur un environnement Supabase isolé, puis régénérer les types DB du projet. Ne pas éditer `src/integrations/supabase/types.ts` à la main.
- Faire évoluer `meal_plans` en ajoutant une référence de composition, en conservant les lignes `recipe_id` et `custom_meal` existantes. Auditer les données avant d'imposer une contrainte d'exclusivité. Adapter `useMealPlans`, l'UI du planning et l'outil `save_meal_plan` du chat pour sélectionner ou enregistrer une fiche, un plat composé ou un menu et pour fournir une liste de courses sans compter deux fois le même menu.
- Réutiliser `src/lib/grocery-list.ts` pour la liste de courses, puis étendre prudemment sa normalisation d'unités ; les ingrédients doivent être résolus récursivement depuis les compositions et mis à l'échelle avant agrégation. Les intitulés personnalisés sans recette restent signalés comme nécessitant des ingrédients à prévoir.
- Les flux de partage et d'export Cookidoo traitent aujourd'hui une recette. Dans la V1, le partage/export d'une fiche reste disponible ; pour un plat composé/menu, afficher clairement « exporter les recettes séparément » et prévoir une évolution explicite si un export composé devient souhaité. Ne pas fabriquer une recette fusionnée dans `recipes` pour contourner ces contrats.

### Points d'entrée à modifier pendant l'implémentation

| Zone | Fichiers ou emplacement de départ | Contrat à faire évoluer |
| --- | --- | --- |
| Livre et fiches | `src/pages/Dashboard.tsx`, `src/pages/RecipeDetail.tsx`, `src/App.tsx` | Trois vues du Livre, fiches et routes distinctes des plats/menus ; conserver les URL des recettes. |
| Données | `src/types/recipe.ts`, `src/hooks/useRecipes.ts`, nouveaux hooks de composition, `supabase/migrations/` | Métadonnées facultatives, lecture/édition des compositions, RLS et types générés. |
| Cuisine | `src/components/cooking/CookingModeContainer.tsx`, `CookingMode.tsx`, `src/hooks/useCookingTimers.ts`, `src/hooks/useRecipeChat.ts` | Résolution d'une cible, progression par élément, ingrédients, minuteurs et contexte Chef. |
| Accords | Nouvelle Edge Function et modules `supabase/functions/_shared/`, nouveau hook de recommandations | Génération de candidats, classement/IA, validation et repli. |
| Planning | `src/hooks/useMealPlans.ts`, `src/pages/MealPlanning.tsx`, `src/lib/grocery-list.ts`, `supabase/functions/home-assistant/index.ts` | Créneaux pointant vers une composition, quantités et outils du chat. |

## Ordre de réalisation proposé

| Lot | Livrable observable | Vérification principale |
| --- | --- | --- |
| 0. Cadrage technique | Repartir du `main` à jour dans un worktree dédié, inventorier les recettes existantes et préciser les champs de métadonnées réellement disponibles. | Aucune perte des changements locaux ; état actuel du Livre et des données confirmé. |
| 1. Données et Livre | Migrations, hooks TanStack Query, classification des fiches, édition d'une composition et vues Préparations / Plats / Menus. | Une vieille recette non classée s'ouvre toujours ; pain bao, carottes au cumin et pâtes au poulet se classent distinctement ; un plat composé et un menu se créent, s'éditent et se rouvrent ; isolation entre comptes. |
| 2. Cuisine composée | Résolution des éléments, concaténation, portions, ingrédients, minuteurs et contexte Chef. | Le plat d'exemple se cuisine de bout en bout ; une préparation seule garde exactement son parcours ; même recette utilisée deux fois sans collision. |
| 3. Accords intelligents | Métadonnées revues, classement déterministe, fonction Edge IA, explications, repli hors IA et retours utilisateur. | Suggestions cohérentes et modifiables ; aucune référence hors compte ; contraintes strictes respectées ou explicitement non vérifiées. |
| 4. Planning et courses | Créneau pointant vers plat/menu, courses agrégées, outil de planification du chat mis à jour. | Le dîner planifié ouvre le bon objet et additionne correctement les ingrédients/portions. |

## Critères d'acceptation transversaux

1. Une recette existante reste lisible, modifiable, partageable et cuisinable sans conversion forcée ; une classification manuelle distingue préparation, accompagnement et plat complet.
2. Un accord peut être proposé automatiquement ou composé à la main ; rien n'est enregistré sans validation de l'utilisateur.
3. Une session de cuisine de plat composé/menu concatène réellement les étapes, en nommant leur fiche source et sans perdre minuteurs, cases à cocher, portions ni navigation arrière.
4. Le planning et les courses reconnaissent les compositions ; les quantités incompatibles ne sont pas additionnées artificiellement.
5. Aucune composition ni suggestion ne peut lire ou référencer une recette d'un autre utilisateur. Les allergies inconnues ne sont jamais présentées comme garanties compatibles.
6. L'interface fonctionne sur mobile (référence 393 × 852), au clavier et en lecteur d'écran, avec états vides/erreur/chargement ; peu de photos et une lecture de type livre.
7. Lors de l'implémentation : tests de migration/RLS et de concaténation/portions, tests des hooks et du repli IA, `npm run check:all`, puis parcours réel dans le navigateur.

## Décisions confirmées le 2026-09-19

- Le mode cuisine d'un menu est **une seule session continue**, avec repères de service et possibilité de sauter directement à un plat.
- En V1, les accords existent comme **suggestions** et comme **compositions enregistrées** après choix de l'utilisateur. Il n'y a pas de relation éditoriale permanente entre deux fiches. Les retours « pertinent / pas pour moi » servent uniquement à personnaliser les suggestions.
