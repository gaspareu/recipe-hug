# Grille J1 — Créer une recette via le chat IA

| Écran | D1 UX | D2 Visuel | D3 Fonctionnel | Notes |
|-------|-------|-----------|----------------|-------|
| Home | 🟡 | 🟢 | 🟢 | Navigation swipe OK, safe areas incomplets (pas de pb-safe-area-inset-bottom), header semi-transparent peut créer friction au scroll |
| ChatInterface | 🟡 | 🟢 | 🟡 | Input/suggestions/pending recipe UX cohérente, pending recipe bar manque d'espacement visuel, voice partial transcript affordance floue |
| RecipeDetail | 🟡 | 🟢 | 🟢 | Back button sur image fragile au load lent, assistant sheet width limitée sur très petit mobile, step checklist excellent |

## Problèmes détaillés

### Home — D1 UX — Mineur (🟡)
**Safe areas incomplets:** Le layout gère `pt-[env(safe-area-inset-top)]` mais pas `pb-[env(safe-area-inset-bottom)]`. Sur iPhone avec home indicator, le dernier message du chat peut être partiellement caché.
- **Impact:** Utilisateur doit scroller pour lire le dernier message sur some devices
- **Fix suggéré:** Ajouter `pb-[env(safe-area-inset-bottom)]` au scroll container ou au bottom input area

### Home — D1 UX — Mineur (🟡)
**Header position absolue crée zone morte:** Header en `absolute top-0 z-10` avec padding peut occulter le contenu en haut du chat lors du défilement rapide ou au chargement du welcome screen.
- **Impact:** Les premiers messages peuvent être cachés sous le header semi-opaque
- **Fix suggéré:** Soit sticky header, soit utiliser `pt-[calc(header-height + safe-area)]` sur le chat container

### ChatInterface — D1 UX — Mineur (🟡)
**Pending recipe bar manque transition visuelle:** La barre de confirmation apparaît mais sans animation d'entrée. L'utilisateur ne perçoit pas clairement le changement de contexte entre "recette générée" et "confirmation demandée".
- **Impact:** Risque que l'utilisateur ne remarque pas qu'il doit confirmer
- **Fix suggéré:** Ajouter AnimatePresence + motion.div sur pendingRecipe bar (comme le speaking indicator)

### ChatInterface — D1 UX — Mineur (🟡)
**Voice partial transcript manque affordance de cancel:** Le partial transcript s'affiche mais il n'y a pas de bouton visible pour arrêter l'enregistrement à part le mic button qui change d'état. Sur mobile, la découverte n'est pas évidente.
- **Impact:** Utilisateur confus sur comment interrompre l'enregistrement vocal
- **Fix suggéré:** Afficher le mic button en mode "stop" avec feedback visuel clair dès que isListening=true

### ChatInterface — D3 Fonctionnel — Mineur (🟡)
**Input textarea max-height sans scroll visual:** Textarea max-h-[200px] avec auto-expand, mais aucun visual scroll bar feedback quand texte dépasse. Utilisateur ne sait pas s'il peut encore taper ou si le texte est tronqué.
- **Impact:** Friction légère pour les messages longs
- **Fix suggéré:** Ajouter une pseudo-classe scroll-indicator ou rendre la scrollbar visible quand h > 100px

### RecipeDetail — D1 UX — Mineur (🟡)
**Back button position absolute sur image au load:** Le bouton back est positionné `absolute top-3 left-3` sur l'image hero. Si l'image met du temps à charger, le bouton flotte en gris sur fond blanc.
- **Impact:** Utilisateur cherche le bouton back, le voit mais avec peu de contraste
- **Fix suggéré:** Ajouter la barre de contraste dès l'écran blanc (gradient noir/transparent toujours visible)

### RecipeDetail — D1 UX — Mineur (🟡)
**Assistant Sheet width limité sur très petit mobile:** Sheet config: `w-full sm:w-[400px]`. Sur 390px (breakpoint mobile), la sheet reste full-width (OK), mais sur écrans 368-390px, elle peut dépasser le viewport sans scroll x.
- **Impact:** Sur très petit mobile, certaines action buttons en sheet peuvent être inaccessibles à la première interaction
- **Fix suggéré:** Vérifier que `w-full` s'applique bien à -390px et que overflow est géré

### RecipeDetail — D2 Visuel — 🟢
Hiérarchie, espacement, et cohérence UI excellents. Badges scrollables bien intégrées. Image display avec overlay gradient parfait.

### RecipeDetail — D3 Fonctionnel — 🟢
Parcours J1 complet: chat → pending recipe save → navigate to RecipeDetail. Assistant sheet pour modifications. Tout est accessible sans scroll obligatoire sur first load (actions visibles, ingredients checkable).

---

## Résumé des problèmes majeurs par ordre de priorité

1. **Safe areas bottom manquants** (Home, toutes pages) — 🟡 mineur mais touche UX famille (enfants sur petits appareils)
2. **Pending recipe bar sans animation** (ChatInterface) — 🟡 mineur, risque de confusion utilisateur
3. **Back button fragile sur slow load** (RecipeDetail) — 🟡 mineur mais frustrant
4. **Voice affordance floue** (ChatInterface) — 🟡 mineur, surtout si voice mode est feature clé pour famille

## Observations positives

✅ Navigation swipe découvrable et fluide (left swipe → dashboard)  
✅ Textarea resize auto + pending recipe pending state bien géré  
✅ Step checklist avec visual state (circle → checkmark) excellente UX  
✅ Image display + overlay actions cohérentes  
✅ Suggestions dynamiques bien intégrées  
✅ Markdown rendering dans chat clair et lisible  
