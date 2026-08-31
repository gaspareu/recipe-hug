# Observabilité et Sentry

Le suivi est volontairement inactif tant que les DSN ne sont pas configurés. Il ne
change donc pas le comportement de l'application locale ni de la production avant
cette configuration.

## Frontend Vercel

Créer ou sélectionner un projet Sentry pour le frontend, puis renseigner dans les
variables Vercel de chaque environnement concerné :

- `VITE_SENTRY_DSN` : DSN public du projet frontend. Il active les erreurs React,
  les erreurs de routes et les traces de navigation.
- `SENTRY_ORG`, `SENTRY_PROJECT` et `SENTRY_AUTH_TOKEN` : secrets utilisés seulement
  au build pour envoyer les source maps. Le token ne doit jamais être préfixé par
  `VITE_` ni ajouté à un fichier versionné.

Les source maps ne sont produites que lorsque les trois secrets de build sont présents.
Elles sont alors masquées du serveur statique et envoyées à Sentry avec la même release
que celle des événements (`recipe-hug@<version>+<commit>`).

## Edge Functions Supabase

Définir le secret Supabase `SENTRY_DSN` avant de déployer les fonctions
`home-assistant` et `export-recipe-cookidoo`. Sans ce secret, elles continuent de
fonctionner mais aucun événement n'est envoyé. Les erreurs envoyées sont normalisées :
elles ne contiennent ni contenu de chat, ni recette, ni identifiant utilisateur, ni
réponse Cookidoo.

## Données et vérification

Le SDK navigateur exclut utilisateurs, cookies, en-têtes HTTP, paramètres de requête,
corps HTTP, données d'IA, variables locales et fil d'Ariane. Les spans de requêtes sont
désactivés et les transactions de navigation sont normalisées par route. Les replays et
les logs structurés Sentry ne sont pas activés pour éviter de collecter du contenu
culinaire ou conversationnel.

Après un déploiement, provoquer une erreur contrôlée dans un environnement non critique
et vérifier dans Sentry l'arrivée de l'événement, la trace de navigation, la release et
la lisibilité de sa stack trace. Une source map ne corrige pas les événements produits
avant son envoi.
