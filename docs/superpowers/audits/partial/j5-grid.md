# Grille J5 — Partager une recette + réception

## Mécanisme de partage (inféré du backend)

Pas de lien/token partageable. Le partage fonctionne par **identifiant de compte** (email ou téléphone) :
- Si le destinataire existe → recette copiée directement dans son compte, statut `claimed` immédiat.
- Si le destinataire n'existe pas → enregistrement `pending` dans `recipe_shares`. À la prochaine connexion du destinataire, `claim-shares` est (supposément) appelé pour transférer les recettes en attente.

| Écran | D1 UX | D2 Visuel | D3 Fonctionnel | Notes |
|-------|-------|-----------|----------------|-------|
| ShareRecipeDialog | 🔴 | 🟢 | 🔴 | Pas de feedback visuel sur le résultat (succès/erreur silencieux) ; validation zod présente mais erreurs non affichées à l'utilisateur ; pas d'info sur ce que reçoit le destinataire |
| Auth (destinataire) | 🟡 | 🟢 | 🔴 | Aucun message d'accueil indiquant une recette reçue ; le claim est supposé se déclencher après connexion mais aucun trigger visible dans Auth.tsx ; destinataire non-utilisateur reçoit invitation sans contexte |
| Flux claim (backend) | — | — | 🔴 | `claim-shares` n'est jamais appelé automatiquement après login (absent de Auth.tsx et main.tsx) ; recettes `pending` restent bloquées indéfiniment ; `listUsers()` sur `share-recipe` charge TOUS les users (scalabilité ⚫) |

## Problèmes détaillés

### 🔴 ShareRecipeDialog — Aucun feedback utilisateur
**Description :** Le bloc `try/catch` de `handleShare` fait `setValue(''); setOpen(false)` en cas de succès ET log l'erreur en console uniquement en cas d'échec. L'expéditeur ne sait pas si le partage a réussi ou échoué. Il n'y a aucun `toast`, aucun message de confirmation, aucune indication du statut (`claimed` vs `pending`).

**Suggestion :** Afficher un `toast.success("Recette envoyée !")` ou `toast.info("Recette en attente — le destinataire recevra la recette à sa première connexion")` selon le statut retourné par le backend. Afficher le message d'erreur zod sous le champ input.

---

### 🔴 ShareRecipeDialog — Erreurs de validation non affichées
**Description :** Le schema zod est validé, mais en cas d'erreur (`result.success === false`), la fonction `return` simplement sans afficher le message d'erreur à l'utilisateur. L'input reste vide d'indication, le bouton reste actif. L'utilisateur ne comprend pas pourquoi le partage n'a pas eu lieu.

**Suggestion :** Ajouter un state `error` local et afficher `result.error.errors[0].message` sous le champ concerné.

---

### 🔴 Flux claim — `claim-shares` jamais déclenché automatiquement
**Description :** `claim-shares` doit être appelé après la connexion d'un nouvel utilisateur pour récupérer ses recettes `pending`. Or `Auth.tsx` ne contient aucun appel à cette fonction edge. `main.tsx` non plus. Il n'existe aucun trigger visible (ni webhook Supabase, ni appel dans `useAuth`). Les recettes partagées à des non-utilisateurs restent donc bloquées à `pending` indéfiniment.

**Suggestion :** Appeler `supabase.functions.invoke('claim-shares')` dans le handler post-login de `useAuth` (après confirmation que `user` est défini), ou via un `useEffect` dans App.tsx conditionné à la première connexion.

---

### ⚫ share-recipe — `listUsers()` non paginé charge tous les comptes
**Description :** Pour vérifier si le destinataire existe, `share-recipe` appelle `adminClient.auth.admin.listUsers()` sans paramètre de pagination. Cela charge l'intégralité des utilisateurs de la base en mémoire. À l'échelle (des milliers d'users), cette opération est un risque de timeout, de surcharge mémoire et expose inutilement des données.

**Suggestion :** Utiliser `adminClient.from('profiles').select('id').eq('email', identifier).single()` ou toute table de profils, plutôt que de lister tous les users auth. Alternativement, Supabase Auth Admin API propose des filtres par email.

---

### 🔴 Auth (destinataire non-utilisateur) — Parcours de réception non guidé
**Description :** Un destinataire qui reçoit une notification (email ou SMS — supposée, non vérifiée dans le code) arrive sur la page Auth sans aucun contexte : pas de message "Vous avez reçu une recette de X", pas de pré-remplissage d'email, pas de redirection post-login vers la recette reçue. L'expérience d'onboarding est générique.

**Suggestion :** Passer un paramètre dans l'URL du lien partagé (ex: `?share=pending&from=X`) pour adapter le message d'accueil sur Auth et déclencher `claim-shares` immédiatement après inscription.

---

### 🟡 ShareRecipeDialog — Onglet "Téléphone" sans indication de format
**Description :** Le placeholder `+33612345678` donne un exemple mais il n'y a aucun indicateur de pays, aucune aide à la saisie. Le regex backend accepte 7-15 chiffres avec `+` optionnel, mais côté frontend l'utilisateur n'est pas guidé. L'onglet téléphone suggère une notification SMS mais aucune infrastructure d'envoi SMS n'est visible dans le code de `share-recipe`.

**Suggestion :** Clarifier si le partage par téléphone envoie réellement un SMS (infrastructure à vérifier/implémenter) ou si c'est seulement un identifiant de compte. Si pas de SMS, retirer l'onglet téléphone pour éviter de créer une attente fausse.
