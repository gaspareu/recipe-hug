# Snapshot local de données utilisateur

Ce flux copie un sous-ensemble pseudonymisé des données du compte connecté vers
Supabase local. Il ne lit jamais `auth.users`, n'utilise aucune clé `service_role` et
ne peut pas importer vers une URL distante.

Le fichier produit, `.local-data/user-snapshot.json`, est privé et ignoré par Git.
Il ne doit pas être ajouté manuellement au dépôt.

Le snapshot reste une donnée personnelle : les textes libres des recettes, préférences,
notes et conversations peuvent contenir des noms, adresses ou informations privées que
le script ne peut pas reconnaître de manière fiable. La RLS garantit qu'ils proviennent
uniquement du compte authentifié, mais le fichier ne doit pas être partagé ni committé.

## Données incluses

- profil anonymisé (nom fixe, avatar supprimé) ;
- configuration IA sans aucune clé API ;
- préférences culinaires ;
- recettes, versions et planning ;
- conversations uniquement sur activation explicite.

Les identifiants utilisateur et les UUID des lignes de production sont remplacés.
Les champs d'image structurés, images encodées, tokens webhook, clés IA, identifiants
Cookidoo, credentials Cookidoo, partages et journaux d'export Cookidoo ne sont jamais
conservés. Un lien distant saisi dans un texte libre peut en revanche rester présent.

## Prérequis

1. Créer le fichier d'environnement privé avec des permissions restrictives :

   ```bash
   cp .env.local-data.example .env.local-data
   chmod 600 .env.local-data
   ```

   Les scripts refusent un fichier lisible par d'autres utilisateurs sur macOS/Linux.
2. Renseigner les clés publiques source et locale. La clé locale est affichée par
   `supabase status` après le démarrage de la stack locale.
   Générer aussi un mot de passe local aléatoire, par exemple avec
   `openssl rand -base64 24`. Ne pas exposer les ports Supabase locaux sur le réseau.
3. Démarrer Supabase local avec un moteur de conteneurs actif :

```bash
supabase start
```

Si la CLI est installée comme dépendance npm, utiliser `npx supabase` à la place.

## Récupérer un JWT temporaire

Dans l'application de production déjà connectée, ouvrir les outils de développement
du navigateur puis exécuter :

```js
const authKey = Object.keys(localStorage).find(
  (key) => key.startsWith("sb-") && key.endsWith("-auth-token"),
);
copy(JSON.parse(localStorage.getItem(authKey)).access_token);
```

Coller la valeur dans `SUPABASE_SOURCE_ACCESS_TOKEN`. Ce JWT est sensible mais
temporaire : ne pas le partager et supprimer sa valeur après l'export. Si le compte
utilise email/mot de passe, les variables alternatives de l'exemple peuvent être
utilisées à la place.

## Exporter

```bash
npm run db:snapshot:export
```

L'outil lit chaque relation sans filtre administrateur : les politiques RLS décident
donc seules des lignes visibles. Il vérifie ensuite que chaque ligne appartient bien
à l'utilisateur authentifié avant d'écrire le snapshot.

Les conversations peuvent contenir du texte personnel et restent exclues par défaut.
Pour les inclure, utiliser `SUPABASE_SNAPSHOT_INCLUDE_CONVERSATIONS=true`. Les partages
ne sont jamais exportés afin d'éviter tout déclenchement du mécanisme de réclamation.
L'export est refusé si un e-mail non anonymisé ou une valeur ressemblant à un secret
est détecté.

## Importer localement

Pour un environnement reproductible, repartir d'une base locale vide :

```bash
supabase db reset --local
npm run db:snapshot:import
```

L'import crée le compte `SUPABASE_LOCAL_EMAIL` si nécessaire, réécrit toutes les
relations avec son UUID local, insère les données dans l'ordre des clés étrangères,
puis recompte chaque table. Il refuse de continuer si ce compte possède déjà des
données, afin de ne rien écraser.

L'API REST ne fournit pas de transaction couvrant toutes ces insertions. Si une erreur
survient en cours d'import, la base locale peut être partiellement remplie : corriger
la cause, exécuter `supabase db reset --local`, puis relancer l'import. Ne pas utiliser
ce compte local pour d'autres fixtures à conserver.

Il reste ensuite à pointer le front vers les valeurs locales dans `.env` :

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<clé publique locale affichée par supabase status>
```

Le compte local utilise l'e-mail et le mot de passe de `.env.local-data`.
