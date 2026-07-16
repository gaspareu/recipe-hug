# Tests E2E (Playwright)

Tests end-to-end **locaux** du parcours authentifié. Pas encore câblés en CI :
ils nécessitent un compte de test et écrivent potentiellement des données réelles.

## Prérequis

1. `.env` (gitignored) avec les variables `VITE_SUPABASE_*` (l'app doit monter).
2. `.env.test` (gitignored) avec le compte de test :
   ```
   TEST_EMAIL=...
   TEST_PASSWORD=...
   ```
3. Le navigateur Playwright : `npx playwright install chromium`.

## Lancer

```bash
npm run test:e2e            # tout
npm run test:e2e -- --ui    # mode UI
```

Playwright démarre `npm run dev` automatiquement (ou réutilise un serveur déjà
lancé sur `http://localhost:8080` ; surcharger via `E2E_BASE_URL`).

## Contenu

- `auth.setup.ts` — connexion unique → session sauvée dans `e2e/.auth/user.json`
  (gitignored : contient un jeton de session).
- `smoke.spec.ts` — protection des routes + rendu des pages clés (déterministe,
  sans IA ni écriture).

## Volontairement exclus (à décider)

- **Création de recette via le chat** : passe par le LLM (`home-assistant`) →
  sortie non déterministe + coût en tokens + écriture de recettes. À stabiliser
  (mock du endpoint ou assertions tolérantes) avant d'en faire un test fiable.
- **Liste de courses** : nécessite de créer un planning de repas (écritures) puis
  de nettoyer. À cadrer.
- **Câblage CI** : demanderait des secrets (compte test) + un compte jetable pour
  éviter la pollution de données.
