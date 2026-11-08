# Aperçu isolé du clavier et du composeur

Depuis la racine :

```sh
npx vite --config e2e/fixtures/chat-preview/vite.config.ts
```

Ouvrir http://127.0.0.1:8081. L'aperçu utilise les composants Home et ChatInterface
réels, avec réponses retardées de cinq secondes et suggestions simulées. La fin de flux arrive
500 ms après le contenu. Écrire « réponse longue » pour vérifier les relances
sur un historique dépassant la hauteur de l’écran. Aucun
compte, variable d'environnement ou appel Supabase/IA n'est utilisé. La voix et
le mode cuisine sont neutralisés. Les alias ne s'appliquent qu'à cet aperçu.

Vérifier au clavier : accueil, focus, effacement, texte multiligne, envoi, rédaction
pendant l'attente, arrêt, puis nouvelle conversation. Sur mobile, Entrée ajoute une
ligne ; sur bureau, Entrée envoie et Maj+Entrée ajoute une ligne. L'envoi conserve
le focus, les suggestions initiales ne reviennent pas après effacement.

Pour le clavier virtuel, ouvrir aussi cet aperçu dans un navigateur mobile ou un
simulateur : redimensionner un viewport sur ordinateur ne suffit pas à le valider.
