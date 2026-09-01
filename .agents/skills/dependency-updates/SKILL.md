---
name: dependency-updates
description: Revoit et sécurise les mises à jour de dépendances recipe-hug, notamment les PR Dependabot — changelog, SemVer, lockfile, scripts, compatibilité et CI. À utiliser pour une montée de version ou une PR de bot ; pas pour une feature produit.
---

# Dependency updates

Le dépôt utilise Dependabot. Ne pas activer Renovate en parallèle et ne pas merger une
PR sans demande explicite de l'utilisateur.

## Revue

1. Identifier les paquets, le type de dépendance, l'écart de version et le niveau SemVer.
   Les majors restent isolées ; lire le guide de migration officiel avant de modifier le
   code.
2. Consulter les release notes et advisories des sources officielles. Vérifier les
   changements de runtime, peer dependencies, moteurs Node/Deno, scripts d'installation
   et comportement de build.
3. Inspecter `package.json`, le lockfile et tout fichier de configuration modifié. Un
   lockfile anormalement large, une nouvelle source de paquet ou un script lifecycle
   inattendu exige une investigation.
4. Pour React, Vite, TypeScript, Vitest, Supabase, Playwright et les GitHub Actions,
   vérifier explicitement les migrations ou breaking changes même sur une mineure.

## Validation

- Une mise à jour de `package.json` ne doit pas modifier `supabase/functions/deno.lock` :
  le lockfile Edge est isolé du manifeste frontend. Le régénérer uniquement lorsqu'un
  import Deno des fonctions change, avec
  `deno test --config supabase/functions/deno.json --allow-env=ANTHROPIC_API_KEY,GEMINI_API_KEY,OPENAI_API_KEY,AI_KEYS_ENCRYPTION_SECRET --frozen=false supabase/functions/_shared/ supabase/functions/elevenlabs-tts/ supabase/functions/elevenlabs-scribe-token/`.
- Lancer `npm ci`, puis `npm run check:all`.
- Vérifier le parcours navigateur si une dépendance runtime ou UI change.
- Comparer le résultat au baseline du skill `check` et lire les logs CI de la PR.
- Si une vulnérabilité est concernée, confirmer que la version corrigée couvre l'avis et
  qu'aucun chemin vulnérable équivalent ne reste dans le lockfile.

Rendre un verdict : risque faible/moyen/élevé, compatibilité, preuves de validation,
points à tester manuellement et recommandation de merge ou de report. La recommandation
n'est pas une autorisation de merge.
