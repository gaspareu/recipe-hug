# Recettes classiques et adaptation Cookidoo à la demande

Date : 10 octobre 2026. Statut : implémenté dans `codex/cookidoo-adaptation-cache`, validation avant livraison.

## Objectif

Créer les recettes du Livre pour une préparation classique, sans imposer le Thermomix. Depuis le détail d'une recette, préparer une version adaptée au TM7, la vérifier puis l'envoyer vers Cookidoo. La cuisson de cette version se fait dans Cookidoo. La recette affichée dans Recipe Hug reste la recette d'origine.

Conserver la version adaptée en base pour la réutiliser lors des prochains envois, sans nouvel appel IA si le contenu culinaire n'a pas changé.

## État initial vérifié

Lecture du code livré dans la branche `codex/cookidoo-guided-export`, distincte du checkout principal local qui contient des changements sans rapport avec cette demande.

- `supabase/functions/home-assistant/index.ts` impose encore le TM7 dans le prompt et les schémas de génération des étapes.
- `src/types/recipe.ts` et `src/lib/chat-tool-payloads.ts` portent des paramètres `tm7` dans les étapes du Livre.
- `src/components/recipes/ExportToCookidooButton.tsx` propose déjà un aperçu séparé et une confirmation avant envoi.
- `supabase/functions/_shared/cookidoo/preparation.ts` ne peut actuellement qu'ajouter des réglages aux étapes existantes. Il interdit leur réécriture, leur découpage et la modification des ingrédients ; les actions explicitement au saladier restent manuelles.
- L'aperçu est signé pour quinze minutes et n'est pas conservé en base. `cookidoo_exports` journalise les tentatives ; ce journal ne constitue pas une version adaptée réutilisable.
- Le connecteur relit déjà le contenu et les commandes destinées à l'appareil après l'envoi. Conserver ces contrôles.

## 1. Séparer les deux recettes

**Recette du Livre :** ingrédients, quantités, portions, étapes et ustensiles classiques. C'est la référence pour l'affichage, l'édition, les courses, le partage et le mode cuisine Recipe Hug.

**Version Cookidoo :** copie dérivée avec étapes adaptées, quantités par action, accessoires et commandes TM7. Elle appartient à la même personne et référence sa recette source. Elle n'apparaît pas comme une deuxième recette dans le Livre et n'alimente pas les courses ou les informations nutritionnelles de la source.

Aucune écriture de l'adaptation dans `recipes.ingredients` ou `recipes.steps`. Une erreur ou une annulation d'export ne doit jamais modifier la source.

## 2. Retirer la spécialisation TM7 du chat

- Réécrire le prompt de `home-assistant` pour produire des recettes classiques, avec des actions, durées et mesures explicites.
- Retirer le référentiel machine du prompt général et les paramètres TM7 des outils qui créent les nouvelles recettes. Vérifier aussi les outils de modification, le contexte de recette et les descriptions d'outils côté frontend.
- Empêcher les préférences de matériel d'imposer indirectement une génération TM7. Les autres préférences culinaires restent applicables.
- Si la personne demande une adaptation TM7 dans le chat, expliquer où la lancer : « Enregistrez la recette, puis choisissez “Envoyer vers Cookidoo” depuis sa fiche. » Ne pas générer de commandes machine dans la recette classique.
- Le chat peut expliquer ce parcours et répondre à une question sur Cookidoo ; il ne pilote plus l'adaptation ou l'envoi.
- Conserver la lecture des anciennes recettes avec leurs champs TM7. Ne pas supprimer ni réécrire leurs données en masse. Une recette importée conserve le contenu de son document source ; l'import ne déclenche aucune adaptation automatique.
- Examiner les mots clés vocaux : retirer le biais systématique TM7 du chat général sans empêcher la reconnaissance de ces noms lorsqu'ils sont prononcés.

## 3. Parcours dans le détail d'une recette

1. Action **« Envoyer vers Cookidoo »** dans la fiche.
2. Si nécessaire, proposer **« Connecter Cookidoo »**, en conservant le contexte de la recette pour revenir au parcours.
3. Chercher une adaptation compatible avec la recette actuelle. Si elle existe, la charger ; sinon lancer son adaptation et enregistrer le résultat validé.
4. Afficher un aperçu **« Version pour Cookidoo »** : ingrédients et mesures, étapes, réglages, accessoires, changements par rapport à l'original et éventuels points à compléter.
5. Confirmer avec **« Envoyer cette version »**, ou **« Mettre à jour sur Cookidoo »** si la destination existe déjà. Un nouvel aperçu est nécessaire après une modification culinaire.
6. Afficher le résultat dans la fiche, avec **« Ouvrir dans Cookidoo »**. La recette du Livre reste affichée et le suivi de cuisson de la version adaptée se fait dans Cookidoo.

Texte explicatif du dialogue : « Nous adaptons une copie de cette recette pour votre Thermomix TM7. Votre recette dans le Livre reste inchangée. Vous pourrez ensuite la suivre dans Cookidoo. »

Pour une copie réutilisée : « Votre version Cookidoo est déjà prête. Aucun nouveau travail d'adaptation n'est nécessaire. »

Prévoir un état persistant dans la fiche et une reprise après navigation/rechargement. Les toasts ne doivent pas être le seul moyen de connaître l'avancement. Conserver les composants et l'identité visuelle existants ; clavier, annonces accessibles et boutons utilisables sur mobile.

## 4. Faire une véritable adaptation culinaire

Créer un contrat d'adaptation complet et versionné, distinct du schéma de génération classique et du format final de l'API Cookidoo.

- Autoriser la réécriture et le découpage des étapes : par exemple, remplacer le mélange au saladier par les actions adaptées dans le bol, avec un lien vers les étapes sources.
- Préserver le plat, les portions, les ingrédients alimentaires et leurs quantités. Toute répartition entre plusieurs étapes doit être explicite et contrôlée ; éviter les conversions arbitraires de cuillères en grammes.
- Représenter séparément les besoins techniques, par exemple l'eau destinée à produire la vapeur. N'en proposer une quantité que sur une règle étayée et validée ; sinon demander cette précision dans l'aperçu. Ne pas inventer une valeur pour rendre la recette exportable.
- Conserver les actions réellement manuelles : façonnage, repos, dressage et cuisson au four. Ne pas convertir une température de four en température du bol.
- Vérifier les combinaisons de mode, durée, vitesse, température et accessoire contre le référentiel et les capacités effectivement prises en charge par le connecteur.
- Ne pas considérer un verbe ou un réglage techniquement valide comme une preuve de pertinence culinaire. Couvrir les transformations par des recettes de référence ; bloquer une adaptation dont une donnée essentielle manque.
- Fournir un résumé des changements et distinguer les points bloquants des simples remarques. Un point bloquant empêche l'envoi et se résout dans la copie adaptée, sans obliger à modifier l'original.
- Valider la sortie côté serveur avant de la marquer prête. Une réponse IA invalide ne doit jamais devenir une copie réutilisable.

L'aperçu et les validations ne constituent pas une certification Vorwerk. Les contrôles de relecture restent nécessaires à chaque envoi, y compris avec une adaptation déjà enregistrée.

## 5. Conserver et réutiliser l'adaptation

Ajouter une table dédiée, nom proposé `recipe_cookidoo_adaptations` :

| Donnée | Rôle |
|---|---|
| `id`, `recipe_id`, `user_id` | Identifier la copie et son propriétaire |
| `source_fingerprint` | Empreinte du contenu culinaire ayant servi à l'adaptation |
| `adapter_version`, `target`, `schema_version` | Identifier les règles compatibles et le format enregistré |
| `adapted_recipe` | Instantané complet de la version adaptée |
| `changes`, `warnings`, `validation_status` | Expliquer et vérifier l'adaptation |
| `created_at`, `updated_at` | Suivre sa préparation |

Prévoir une contrainte d'unicité par propriétaire, recette, empreinte et version d'adaptation. Les tentatives d'envoi restent dans `cookidoo_exports`, avec un lien vers l'adaptation utilisée. Le lien vers la recette distante reste distinct de la version adaptée : une nouvelle adaptation peut mettre à jour la même recette Cookidoo.

Règles de réutilisation :

- Construire l'empreinte à partir d'un contenu canonique : portions, ingrédients/quantités/unités/préparations, étapes et informations culinaires utiles. Ne pas utiliser seulement `updated_at`, que les métadonnées d'export peuvent modifier.
- Une modification culinaire rend l'ancienne adaptation obsolète pour un nouvel envoi. Conserver son lien distant et ses tentatives ; recalculer la copie au prochain export.
- Un favori, un classement, une note administrative, un titre ou une photo ne déclenchent pas une nouvelle adaptation culinaire. Répercuter séparément le titre et la photo au prochain envoi, en affichant leur valeur effective dans l'aperçu.
- Réutiliser une adaptation prête malgré l'expiration d'une ancienne confirmation. Renouveler l'autorisation d'envoi sans rappeler l'IA.
- Invalider les copies lorsqu'une nouvelle version des règles corrige une incompatibilité ; un simple changement de modèle IA ne force pas la régénération de toutes les copies.
- Compter les quotas IA uniquement lors d'une nouvelle adaptation effective, pas lors d'un chargement ou d'un renvoi.
- Ne pas ajouter de synchronisation bidirectionnelle : un renvoi met à jour la version détenue par Recipe Hug. Si la destination a été modifiée directement dans Cookidoo depuis le dernier envoi, détecter le conflit et présenter le remplacement avant confirmation.

## 6. Sécuriser l'exécution et les reprises

- Le navigateur transmet des identifiants d'adaptation et d'opération ; le serveur recharge les données autorisées. Ne pas faire confiance à une copie JSON modifiable côté client.
- Vérifier l'identité, la propriété de la recette et de l'adaptation, l'empreinte actuelle et la confirmation de la version exacte à envoyer. Une modification entre aperçu et envoi exige un nouvel aperçu.
- Activer la RLS ; lecture limitée au propriétaire, écritures de préparation contrôlées côté serveur, aucun secret Cookidoo dans la table. Vérifier aussi les accès croisés entre recette et adaptation.
- Suivre séparément l'adaptation et l'envoi : états proposés `queued`, `running`, `ready/succeeded`, `needs_input`, `failed`, `unknown`. Conserver les étapes et erreurs nécessaires pour reprendre après navigation.
- Empêcher les doubles adaptations et les doubles envois concurrents avec une réservation atomique, une clé d'idempotence et une reprise bornée des opérations abandonnées.
- Une perte réseau ne prouve pas l'échec : vérifier l'opération et la destination avant une relance. Sauvegarder l'identifiant distant dès la création ; réutiliser celui-ci pour la mise à jour. Si une recette distante a été supprimée, informer avant d'en créer une autre.
- Réutiliser les contrôles de contenu, ingrédients, annotations et commandes appareil. Distinguer « envoyé et vérifié », « envoyé avec points à vérifier » et « résultat inconnu ».

## 7. Textes des notifications

Les phases longues sont visibles dans le dialogue et la fiche : **« Adaptation pour votre TM7… »**, puis **« Envoi vers Cookidoo… »**, puis **« Vérification sur Cookidoo… »**. Pas de succession de toasts pour chaque phase. Un résultat final par opération, même après un changement de page.

| Situation | Titre | Description / action |
|---|---|---|
| Adaptation prête, nouvelle ou réutilisée | Version Cookidoo prête | Vérifiez les ingrédients et les étapes avant de l'envoyer. Affiché dans l'aperçu, sans toast supplémentaire. |
| Précision indispensable | Une précision manque | Complétez les informations indiquées pour préparer la version Cookidoo. Action : « Compléter ». |
| Échec d'adaptation confirmé | Adaptation impossible pour le moment | Votre recette est conservée. Aucun envoi n'a été effectué. Action : « Réessayer ». |
| Source modifiée avant l'envoi | La recette a changé | Préparez une nouvelle version Cookidoo avant de l'envoyer. Action : « Actualiser la version ». |
| Création vérifiée | Recette disponible sur Cookidoo | Retrouvez-la dans « Mes recettes créées » pour la cuisiner. Action : « Ouvrir Cookidoo ». |
| Mise à jour vérifiée | Recette mise à jour sur Cookidoo | La version adaptée est prête à être cuisinée. Action : « Ouvrir Cookidoo ». |
| Contenu envoyé, réglages incomplets | Recette envoyée, des étapes sont à vérifier | Certains réglages n'ont pas été conservés. Vérifiez les étapes indiquées avant de cuisiner. Action : « Voir les détails ». |
| Relecture impossible après envoi | Envoi effectué, vérification incomplète | Ouvrez la recette dans Cookidoo pour vérifier son contenu avant de cuisiner. Action : « Ouvrir Cookidoo ». |
| Photo seule en échec | Recette envoyée sans sa photo | Les ingrédients et les étapes ont été transférés. Action : « Ouvrir Cookidoo ». |
| Compte non connecté | Connectez votre compte Cookidoo | Ajoutez vos identifiants pour envoyer cette recette. Action : « Connecter Cookidoo ». |
| Authentification refusée | Connexion à Cookidoo impossible | Vérifiez vos identifiants dans votre profil. Action : « Vérifier mes identifiants ». |
| Service ou limite temporaire | Cookidoo est momentanément indisponible | Votre version adaptée est conservée. Réessayez plus tard. N'afficher ce message comme échec que si l'absence d'envoi est confirmée. |
| Quota d'adaptation atteint | Adaptation indisponible pour le moment | Vous pourrez réessayer [délai connu]. Les versions déjà préparées restent disponibles. |
| Résultat indéterminé / délai dépassé | Le résultat de l'envoi n'est pas encore confirmé | Nous vérifions son état. Consultez Cookidoo avant de relancer. Action : « Vérifier l'envoi ». |
| Échec d'envoi confirmé, copie prête | La recette n'a pas pu être envoyée | Votre version adaptée est conservée. Vous pouvez réessayer sans la préparer à nouveau. Action : « Réessayer l'envoi ». |
| Création partielle non nettoyée | Une recette incomplète reste sur Cookidoo | Ouvrez-la pour la supprimer avant un nouvel envoi. Action : « Ouvrir Cookidoo ». |

Centraliser la traduction des codes d'erreur. Ne pas afficher de message brut de serveur, de jargon comme « annotations », « payload » ou « signature », ni proposer la ligne de commande dans le parcours normal. Afficher les détails par étape dans un panneau persistant ; ne pas concaténer tous les avertissements dans un toast. L'absence volontaire de photo ne mérite pas d'avertissement.

## 8. Ordre d'implémentation

1. **Contrats et exemples :** définir la recette classique, l'adaptation complète, les états et les cas de référence, dont les bao déjà signalés.
2. **Stockage et orchestration :** migration additive, RLS, empreintes, réutilisation, opérations persistantes et idempotence. Tester sur le projet Supabase de développement.
3. **Adaptateur Cookidoo :** remplacer la simple proposition de réglages par l'adaptation complète, avec traçabilité, validation et résolution des précisions dans la copie.
4. **Fiche recette :** aperçu, réutilisation, confirmation, reprise, lien Cookidoo et nouveaux messages. Préserver la détection de capacités pour les déploiements progressifs.
5. **Chat classique :** retirer la spécialisation TM7 une fois le nouveau parcours disponible. Garantir la compatibilité de lecture des recettes historiques.
6. **Validation et livraison :** skills `check`, `pre-pr` et `git-github`, PR et CI ; après autorisation de livraison, merge puis migrations et fonctions par la CI, frontend Vercel. Aucun déploiement de ce plan seul.

Pas de réadaptation globale des anciennes recettes : première préparation à la demande. Les identifiants Cookidoo existants sont conservés pour éviter les doublons.

## 9. Critères d'acceptation

- Une création depuis le chat ne contient plus de TM7 imposé ni de paramètres machine générés dans la recette du Livre.
- Une recette classique peut être adaptée avec des étapes découpées et des réglages cohérents, tandis que sa source reste strictement inchangée.
- Un second envoi de la même recette réutilise la copie stockée sans appel IA ni nouvelle consommation de quota d'adaptation.
- Une modification culinaire prépare une nouvelle copie ; une modification de favori, titre ou photo ne rappelle pas l'IA.
- Deux clics ou deux onglets ne créent pas deux recettes distantes ; une coupure réseau et un rechargement permettent de retrouver l'état réel.
- Aucun utilisateur ne peut lire, confirmer ou envoyer l'adaptation d'un autre, ni substituer une autre recette source.
- Les recettes déjà exportées gardent leur destination. Les nouvelles commandes restent vérifiées après chaque envoi.
- Les messages indiquent l'étape concernée, le résultat connu et l'action possible. Aucun succès annoncé avant la confirmation effective de l'envoi.
- Tests ciblés : chat, empreintes, quotas, adaptation, RLS, concurrence, reprise, readback et toasts. Vérification UI clavier/mobile ; essai réel Cookidoo sur un petit corpus représentatif, puis vérification sur TM7 pour les fonctions annoncées comme guidées. Distinguer ces preuves des tests simulés.

## Vérification de l’implémentation

- Tests frontend, Edge, types, lint, code mort et build exécutés ; tests navigateur Chromium
  sur bureau et mobile avec endpoint d’adaptation simulé.
- SQL de réservation, cache, révision, isolation propriétaire et permissions vérifié sur dev
  avec transaction annulée (`supabase/tests/cookidoo_adaptations.sql`).
- `node scripts/verification/cookidoo-adaptation-dev.mjs --local-mock-ai` vérifie le vrai
  handler local avec Auth/base/RPC dev, une IA simulée et tout accès Cookidoo interdit.
  Pain et bao : copie persistée/réutilisée après renommage et favori, source inchangée.
- Les secrets IA/chiffrement manquent sur dev : aucun test d’adaptation IA réelle ni nouvel
  envoi Cookidoo/appareil TM7 n’est revendiqué pour cette évolution.
- Livraison production par le flow habituel : revue/PR, CI, merge autorisé puis déploiements
  automatiques. Aucun déploiement production effectué dans cette implémentation.
