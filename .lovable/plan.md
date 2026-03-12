
## Retravailler la page Profil

### Objectif
Reduire le nombre de sections repliables en affichant directement les informations personnelles et l'apparence, sans les cacher dans des accordeons. Seules les sections avancees restent en collapsible.

### Structure proposee

```text
+-------------------------------+
| <- Mon Profil                 |
+-------------------------------+
|  [Avatar]  Camera             |
|  Email (disabled)             |
|  Nom d'affichage  [input]     |
|  [Enregistrer]                |
+-------------------------------+
|  Apparence                    |
|  [Clair] [Sombre] [Systeme]   |
+-------------------------------+
| v Preferences culinaires      |  <- collapsible
+-------------------------------+
| v Configuration IA            |  <- collapsible
+-------------------------------+
| v Integrations                |  <- collapsible
+-------------------------------+
```

### Changements dans `Profile.tsx`

1. **Informations personnelles** : retirer le `CollapsibleSection` et afficher directement le contenu (avatar, email, nom, bouton sauvegarder) dans une card statique (`rounded-lg border bg-card shadow-sm p-6`).

2. **Apparence** : retirer le `CollapsibleSection` et afficher directement le `ThemeSelectorContent` dans une card statique avec un titre "Apparence" et le toggle group visible.

3. **Preferences culinaires, Configuration IA, Integrations** : restent en `CollapsibleSection` fermes par defaut (inchange).

### Details techniques

- Seul le fichier `src/pages/Profile.tsx` est modifie
- Les deux premieres sections utilisent une `div` avec les memes classes que la card du `CollapsibleSection` (`rounded-lg border bg-card text-card-foreground shadow-sm`) mais sans le mecanisme collapsible
- Aucun nouveau composant necessaire
- Le `CollapsibleSection` reste utilise pour les 3 sections avancees
