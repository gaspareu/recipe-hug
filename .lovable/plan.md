

## Analyse du mode vocal

### Problemes identifies

**1. Rupture du geste utilisateur pour `getUserMedia` (bug critique)**

Dans `ChatInterface.tsx` (ligne 308), quand l'utilisateur clique sur le micro sans avoir le mode vocal actif :
```typescript
if (!voiceEnabled) { toggleVoice(); setTimeout(() => startListening(), 100); }
```
Le `setTimeout` casse la chaine de geste utilisateur. `startListening()` appelle `navigator.mediaDevices.getUserMedia()` dans `useVoiceMode.ts` (ligne 158), mais le navigateur refuse car l'appel n'est plus dans le contexte direct du clic. Cela provoque une erreur `NotAllowedError` silencieuse sur mobile.

**2. `startListening` fait un appel reseau avant `getUserMedia`... puis un autre apres**

Dans `useVoiceMode.ts`, `startListening` :
1. Appelle `getUserMedia` (ligne 158) — OK, direct dans le handler
2. Puis `getSession()` (ligne 161)
3. Puis `fetch` pour le scribe token (ligne 167)
4. Puis `scribe.connect()` (ligne 185)

Le probleme 1 rend cet ordre sans effet si on passe par le `setTimeout`. Meme sans le setTimeout, la sequence est correcte car `getUserMedia` est appele en premier.

**3. Pas de gestion d'erreur visible pour l'utilisateur en cas d'echec TTS**

Si le TTS echoue (quota ElevenLabs depasse, erreur 500), l'erreur est logguee en console mais l'utilisateur ne voit rien — le mode vocal semble simplement ne rien faire.

**4. `useScribe` initialise a chaque render**

Le hook `useScribe` est appele inconditionnellement (ligne 18), meme quand le mode vocal est desactive. Ce n'est pas un bug bloquant mais c'est sous-optimal.

---

### Plan de correction

#### Tache 1 : Corriger le geste utilisateur pour le micro

Dans `ChatInterface.tsx`, modifier le handler du bouton micro pour appeler `startListening` directement dans le clic (sans `setTimeout`) :
- Fusionner `toggleVoice` + `startListening` en un seul flux synchrone dans le handler
- Dans `useVoiceMode.ts`, creer une nouvelle methode `enableAndListen()` qui active le mode vocal ET demarre l'ecoute en un seul appel, avec `getUserMedia` appele en premier dans la chaine
- Le `getUserMedia` doit etre la toute premiere instruction async du handler de clic

#### Tache 2 : Ajouter du feedback utilisateur en cas d'echec TTS

Dans `useVoiceMode.ts` `playNextInQueue` :
- Ajouter un `toast.error` quand le TTS echoue (ligne 104) pour informer l'utilisateur
- Differencier les erreurs 401 (auth), 429 (quota) et 500 (serveur)

#### Tache 3 : Ameliorer la robustesse du STT

- Ajouter un timeout sur la connexion scribe (si le token ne revient pas en 10s, abandonner)
- Ajouter un indicateur visuel clair quand la connexion scribe est en cours (entre le clic et `isListening = true`)

