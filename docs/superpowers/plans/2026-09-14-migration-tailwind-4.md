# Migration Tailwind CSS 4

## Objectif

Faire évoluer la chaîne de styles de Tailwind CSS 3.4 vers Tailwind CSS 4, sans
changer le rendu fonctionnel ou éditorial de recipe-hug. Cette migration permet
ensuite d'utiliser `tailwind-merge` 3, qui ne prend plus en charge Tailwind 3.

## Périmètre confirmé

- Frontend Vite/React uniquement : ni schéma Supabase, ni Edge Function, ni
  modification de `supabase/functions/deno.lock`.
- Remplacer l'intégration PostCSS Tailwind 3 par l'intégration Vite officielle
  de Tailwind 4, après avoir vérifié qu'aucun autre plugin PostCSS n'est requis.
- Migrer `src/index.css` des directives `@tailwind` vers la syntaxe Tailwind 4.
- Conserver les tokens visuels actuels : thèmes clair/sombre, variables HSL,
  typographies Lora, rayons, animations de cuisine et styles du Livre.
- Remplacer le plugin `tailwindcss-animate`, non compatible avec Tailwind 4,
  par `tw-animate-css`, l'équivalent recommandé ; contrôler avant installation
  son éditeur, sa provenance npm/GitHub, ses advisories et ses scripts lifecycle.
  Conserver les classes utilisées par les composants Radix/shadcn (`animate-in`,
  `fade-in-*`, `slide-in-*`, etc.).
- Conserver et charger explicitement `@tailwindcss/typography` : le chat utilise
  les utilitaires `prose` et `prose-*`.
- Mettre `tailwind-merge` à la version 3 uniquement dans la même livraison que
  Tailwind 4, puis régénérer exclusivement `package-lock.json`.
- Incrémenter la version applicative, conformément aux règles du dépôt pour une
  évolution notable.
- Définir Tailwind 4 comme compatible avec Safari 16.4+, Chrome 111+ et Firefox
  128+. Si le support produit doit couvrir un navigateur plus ancien, ne pas
  fusionner sans stratégie de repli explicitement validée.

## Étapes d'implémentation

1. Partir du `main` courant et relever les versions publiées ainsi que les notes
   de migration officielles de Tailwind, de ses plugins et de tailwind-merge.
2. Mettre à jour les dépendances frontend nécessaires : `tailwindcss`,
   `@tailwindcss/vite`, `tailwind-merge`, `tw-animate-css` et
   `@tailwindcss/typography`. Relever les versions retenues, leur provenance,
   leurs advisories et leurs scripts lifecycle avant de valider le lockfile.
   Retirer les dépendances devenues inutiles seulement après vérification de
   leurs usages.
3. Ajouter le plugin Tailwind 4 à `vite.config.ts` et retirer la configuration
   PostCSS héritée si elle ne sert plus à aucun autre traitement.
4. Remplacer les directives `@tailwind` de `src/index.css` par l'import Tailwind
   4 et charger explicitement `tailwind.config.ts` avec `@config
   "../tailwind.config.ts"` pendant la phase transitoire. Tailwind 4 ne le lit
   plus automatiquement : cette étape préserve les couleurs sémantiques, les
   polices, rayons et animations existants dès le premier build.
5. Migrer ensuite les tokens vers la configuration CSS-first : déclarer les
   alias nécessaires dans `@theme inline`, conserver le basculement de thème par
   classe avec `@custom-variant dark`, et ne supprimer `tailwind.config.ts`
   qu'après comparaison du CSS produit et du rendu des deux thèmes.
6. Traduire la configuration `container` v3 (`center`, `padding: 2rem`, largeur
   `2xl: 1400px`) en `@utility container` équivalent. Auditer tous les usages de
   `container` pour préserver centrage et largeur sur desktop.
7. Auditer les utilitaires qui dépendent de la configuration actuelle : couleurs
   sémantiques (`bg-background`, `border-border`), polices personnalisées,
   animations, modificateurs Radix, valeurs arbitraires HSL et variables du
   rail de signets. Comparer également les variantes Typography empilées, dont
   `prose-p:first:mt-0` et `prose-p:last:mb-0`, car leur ordre change avec
   Tailwind 4. Corriger les écarts de sortie CSS, sans modifier les conventions
   de l'interface.
8. Mettre à jour les tests qui vérifient des classes ou animations devenues
   obsolètes, en privilégiant un contrôle de comportement ou de rendu plutôt
   qu'un détail d'implémentation.

## Critères d'acceptation

- La production et les tests compilent avec Tailwind 4 et tailwind-merge 3.
- Les thèmes clair/sombre, les composants Radix/shadcn et les animations
  existantes restent fonctionnels.
- Le PWA, le mode cuisine, la page d'accueil et le Livre ne présentent ni style
  manquant ni débordement horizontal, en particulier sur iPhone 15 (393 × 852).
- Le support Safari 16.4+, Chrome 111+ et Firefox 128+ est documenté et vérifié
  au seuil pertinent ; aucun navigateur plus ancien n'est implicitement promis.
- `package-lock.json` est cohérent ; `supabase/functions/deno.lock` est
  inchangé.
- Aucun fichier Supabase généré n'est modifié.

## Validation requise avant sortie de brouillon

1. `npm ci` avec un cache isolé si nécessaire.
2. `npm run check`, `npm run build` et `npm run test:edge` ; confirmer que les
   résultats correspondent au baseline courant, et documenter tout avertissement
   préexistant.
3. Vérification navigateur desktop et mobile : page d'accueil, Livre,
   planification, formulaire de recette, mode cuisine, thèmes clair/sombre,
   dialogues et menus Radix.
4. Vérification Playwright sur iPhone 15, incluant safe areas, clavier et
   absence de défilement horizontal ; compléter par la vérification du navigateur
   minimal retenu ou du repli validé.
5. Revue finale du diff de dépendances, du lockfile, de la taille du bundle et
   de la provenance des nouveaux paquets.

## Hors périmètre

- Refonte visuelle, changement de tokens éditoriaux ou migration du design
  system au-delà de ce qui est nécessaire à la compatibilité Tailwind 4.
- Migration Node, React, Supabase ou Vite.
- Déploiement manuel : la PR restera brouillon jusqu'à validation complète.
