# Grille D4 — Comportement PWA

## Contexte technique
- Plugin : `vite-plugin-pwa` avec `registerType: "autoUpdate"`
- Manifest : fichier statique `public/manifest.json` (désactivé côté plugin via `manifest: false`)
- Service worker : généré par Workbox via le plugin
- Registration SW : **non visible dans `src/main.tsx`** — délégué au plugin vite-plugin-pwa qui injecte le code automatiquement au build

| Critère | Statut | Notes |
|---------|--------|-------|
| Manifest complet (name, short_name, display, theme_color, icons) | 🟡 | name/short_name/display/theme_color/background_color présents. Icônes 192 et 512 présentes + apple-touch-icon. Manque : `screenshots` (requis pour install prompt "enhanced" sur Chrome), `id` field (PWA identity stable), icônes séparées `purpose: "any"` et `purpose: "maskable"` (actuellement fusionnées en une seule déclaration ce qui peut poser problème sur certains OS) |
| Service worker actif | 🟢 | Généré automatiquement par vite-plugin-pwa/Workbox à chaque build. `registerType: "autoUpdate"` assure la mise à jour silencieuse. |
| Stratégie de cache définie | 🟢 | 3 stratégies configurées : `CacheFirst` pour Google Fonts (365j), `CacheFirst` pour gstatic fonts (365j), `NetworkFirst` pour toutes les URLs Supabase (timeout 10s, fallback cache 24h). Assets statiques précachés via `globPatterns`. |
| Comportement offline documenté | 🟡 | Le cache Supabase (`NetworkFirst`) permet un fallback partiel sur les données récentes. Mais il n'existe pas de page offline dédiée ni de gestion explicite des états "hors-ligne" dans l'UI. Les recettes récemment consultées seraient accessibles via le cache API (50 entrées max, 24h), mais aucun indicateur UI ne prévient l'utilisateur qu'il est en mode dégradé. |
| Prompt d'installation | 🟡 | Non implémenté côté application. vite-plugin-pwa peut générer un composant `PWAInstallPrompt` mais il n'est pas utilisé dans le code. L'installation est donc possible uniquement via le prompt natif du navigateur (Chrome/Edge), sans aucune incitation in-app. |

## Problèmes détaillés

### 🟡 Manifest — `purpose` fusionné "any maskable"
**Description :** Les deux icônes déclarent `"purpose": "any maskable"` en une seule chaîne. La spécification PWA recommande de séparer ces usages en deux entrées distinctes par icône (une avec `"purpose": "any"`, une avec `"purpose": "maskable"`), car les navigateurs peuvent les traiter différemment. Sur Android, une icône maskable mal délimitée peut être rognée de façon inattendue.

**Suggestion :** Dupliquer les entrées d'icônes en séparant les purposes :
```json
{ "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
{ "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" }
```

---

### 🟡 Prompt d'installation — Aucune incitation in-app
**Description :** Il n'y a aucun composant d'invitation à installer l'app (banner, snackbar, bouton dans les settings). Sur iOS Safari, l'installation via "Ajouter à l'écran d'accueil" est entièrement manuelle sans aucun guide. Les utilisateurs mobiles ne découvriront probablement pas la possibilité d'installer l'app.

**Suggestion :** Implémenter le composant `useRegisterSW` ou `PWAInstallPrompt` fourni par vite-plugin-pwa, ou afficher une bannière contextuelle "Installer l'app" la première fois sur mobile, avec instructions spécifiques iOS.

---

### 🟡 Offline — Pas d'indicateur d'état réseau dans l'UI
**Description :** Même si le cache Workbox permet d'afficher des données récentes sans connexion, l'UI n'informe jamais l'utilisateur qu'il navigue en mode hors-ligne ou que les données affichées peuvent être obsolètes. Les mutations (création, modification de recette) en offline échoueront silencieusement.

**Suggestion :** Utiliser `window.navigator.onLine` + événements `online/offline` pour afficher un bandeau discret "Mode hors-ligne — données en cache" et désactiver les actions de modification avec un message explicatif.

---

### 🟡 Manifest — Absence de `screenshots`
**Description :** Le champ `screenshots` est requis pour que Chrome affiche un "rich install dialog" (avec prévisualisation de l'app) plutôt qu'un prompt générique. Sans ce champ, l'expérience d'installation est minimaliste.

**Suggestion :** Ajouter 2-3 screenshots de l'app (format portrait 1080x1920 ou 390x844) dans `public/screenshots/` et les référencer dans le manifest.
