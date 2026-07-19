# Export Cookidoo asynchrone et journalisé — conception

> Statut : validé le 19 juillet 2026. Implémentation à venir.
> Contrat de l'API Cookidoo : `docs/COOKIDOO-CONTRAT.md`.

## Problème

L'export d'une recette vers Cookidoo est **synchrone et bloquant** : le dialogue
reste ouvert une quinzaine de secondes (création, trois PATCH espacés, upload
d'image, contrôle du guided cooking). L'utilisateur attend sans pouvoir rien
faire d'autre, et chaque étape ajoutée au processus allonge cette attente.

Deux conséquences observées :

1. **L'expérience est bloquée** par une opération dont le résultat n'est pas
   immédiatement utile.
2. **Rien n'est conservé.** Les échecs et les avertissements partent dans
   `console.error`, avec la rétention courte des logs edge et aucune possibilité
   de requêter par recette. Le constat du backlog — « la recette n'est pas du
   tout bien set-up sur Cookidoo » — n'est donc pas diagnosticable après coup :
   il faut refaire un export en observant le réseau.

## Objectifs

- Rendre la main immédiatement après le déclenchement de l'export.
- Pouvoir **enrichir le processus** (vérifications supplémentaires) sans dégrader
  l'expérience.
- Conserver une trace exploitable de chaque export, suffisante pour diagnostiquer
  la **qualité** du contenu envoyé, pas seulement son succès technique.
- Conserver les retours utilisateur pertinents (succès, échec, avertissements).

## Non-objectifs

- Pas de reprise automatique des exports en échec (risque de doublon, et le rate
  limit Cookidoo est d'environ 10 requêtes/minute). L'utilisateur relance.
- Pas de file d'attente ni de worker : le volume est d'un export à la fois, par
  utilisateur, déclenché manuellement.
- Pas de reprise partielle : un export échoué est rejoué en entier.

## Architecture

### Deux phases

**Phase synchrone (< 1 s).** Tout ce qui peut échouer vite et de façon
déterministe reste bloquant : authentification, lecture de la recette (RLS),
mapping, puis `validateCookidooPayload`. Un payload invalide répond
immédiatement — inutile de faire attendre l'utilisateur pour lui dire que sa
recette n'est pas exportable.

La fonction insère ensuite une ligne de journal au statut `pending` et répond :

```json
{ "ok": true, "export_id": "<uuid>", "status": "pending" }
```

**Phase asynchrone** (`EdgeRuntime.waitUntil`). Le travail réseau se poursuit
hors du cycle requête/réponse : login Cookidoo, création ou mise à jour,
remplissage, image, puis contrôle du guided cooking via la vue appareil. La ligne
de journal est mise à jour avec le résultat complet.

`EdgeRuntime.waitUntil` est le mécanisme officiel de Supabase pour les tâches de
fond. La durée reste plafonnée par les limites wall-clock/CPU de l'isolate ; un
export mesuré à une quinzaine de secondes s'y inscrit largement.

### Journal : table `cookidoo_exports`

Une seule table sert à la fois de **suivi d'état** (pour la notification) et de
**journal d'analyse**. Les séparer créerait deux sources de vérité pour la même
information.

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid pk | identifiant du job, renvoyé au client |
| `user_id` | uuid | propriétaire (RLS) |
| `recipe_id` | uuid | recette exportée |
| `status` | text | `pending` / `success` / `failed` |
| `cookidoo_recipe_id` | text | id Cookidoo obtenu |
| `cookidoo_url` | text | lien direct vers la recette |
| `updated` | boolean | mise à jour d'une recette existante plutôt que création |
| `error_code` | text | `auth_failed`, `ip_blocked`, `rate_limited`, `partial_created`… |
| `error_message` | text | message brut, pour analyse |
| `warnings` | text[] | `no_image`, `image_not_transferred`, `steps_not_guided`… |
| `unguided_steps` | int[] | index des étapes dégradées par Cookidoo |
| `diagnostics` | jsonb | qualité du payload envoyé (ci-dessous) |
| `duration_ms` | int | durée de la phase asynchrone |
| `created_at` / `finished_at` | timestamptz | détection des interruptions |

RLS : lecture réservée à `user_id = auth.uid()`, cohérente avec le reste du
projet. Écriture par la fonction edge.

### Contenu de `diagnostics`

C'est la partie qui répond au besoin de diagnostic qualité :

```jsonc
{
  "steps_total": 12,
  "steps_with_tm7": 4,          // étapes portant des paramètres machine
  "steps_guided": 4,            // étapes ayant reçu une annotation TTS ou MODE
  "annotations": { "TTS": 3, "MODE": 1, "INGREDIENT": 9 },
  "ingredients_count": 11,
  "has_image": true,
  "tools": ["TM7"]
}
```

Avec ça, une requête SQL suffit à répondre à « pourquoi mes recettes sont mal
configurées sur Cookidoo » : si `steps_with_tm7` est très inférieur à
`steps_total`, le problème est en amont (génération IA), pas dans le connecteur.

### Notification : interrogation périodique

Le client interroge sa ligne toutes les 2 secondes tant que le statut est
`pending`, via `refetchInterval` de TanStack Query, et s'arrête dès que le
statut est final. Le toast s'affiche alors, même si l'utilisateur a navigué
ailleurs dans l'application (le hook vit au-dessus des pages).

**Pourquoi pas Realtime.** C'était le choix initial, écarté après vérification :
Realtime n'est utilisé nulle part dans ce projet. L'introduire pour une
notification unique sur une opération de ~15 s coûterait une publication de
réplication, une RLS Realtime à valider, un websocket, et un filet anti-course —
l'export pouvant se terminer avant que l'abonnement soit actif. L'interrogation
périodique réutilise un pattern déjà présent partout, tient en ~7 requêtes
légères par export, et n'a pas de mode de panne « événement manqué ».

**Fin de l'attente.** Au-delà de 2 minutes sur un statut `pending`,
l'interrogation s'arrête et le résultat est déclaré inconnu — un isolate tué
avant la fin laisse la ligne `pending` pour toujours, et il ne faut pas
interroger indéfiniment.

### Retours utilisateur

| Moment | Toast |
|---|---|
| Réponse immédiate | *Envoi lancé vers Cookidoo…* |
| Payload invalide (synchrone) | *Recette non exportable : …* |
| Fin, succès | *Recette envoyée* + action **Ouvrir** + avertissements |
| Fin, échec | *Échec de l'envoi* + message lisible |

> Prérequis : le composant `<Toaster />` doit être monté dans l'application.
> Il ne l'était pas (correctif `fix/toaster-manquant`) — sans lui, aucun de ces
> toasts ne s'affiche.

## Découpage

`export-recipe-cookidoo/index.ts` fait déjà 280 lignes et mêle authentification,
orchestration réseau et gestion d'erreurs. L'asynchrone l'alourdirait encore.

| Fichier | Responsabilité |
|---|---|
| `_shared/cookidoo/diagnostics.ts` *(nouveau)* | `buildExportDiagnostics(payload)` — fonction pure, sans réseau |
| `_shared/cookidoo/run-export.ts` *(nouveau)* | Orchestration login → create/update → fill → image → contrôle, dépendances injectées |
| `export-recipe-cookidoo/index.ts` *(allégé)* | Auth, validation, création du job, `waitUntil`, réponse |
| `src/hooks/useCookidooExport.ts` *(nouveau)* | Déclenchement + interrogation périodique, hors des composants |
| `supabase/migrations/…_cookidoo_exports.sql` *(nouveau)* | Table, RLS (lecture propriétaire, écriture service role) |

Extraire `run-export.ts` rend l'orchestration testable, ce qu'elle n'est pas
aujourd'hui.

## Gestion des erreurs

- **Échec dans la phase asynchrone** : capturé, classifié par `classifyError`,
  écrit dans la ligne (`status: failed`), remonté par Realtime. Aucune reprise.
- **Rollback existant conservé** : si le remplissage échoue après création, la
  recette Cookidoo est supprimée ; si la suppression échoue aussi, la ligne passe
  en `status: failed` avec `error_code: partial_created` et l'identifiant Cookidoo
  dans `cookidoo_recipe_id`, pour permettre un nettoyage manuel.
- **Isolate tué avant la fin** : un handler `beforeunload` tente de marquer
  l'interruption. Si l'écriture n'aboutit pas, la ligne reste `pending` avec
  `finished_at` nul — état détectable en SQL, et traité côté client comme
  « inconnu » au-delà de deux minutes plutôt que par une attente infinie.
- **Contrôle du guided cooking** : best-effort, comme aujourd'hui. Son échec
  n'invalide pas l'export.

## Tests

| Niveau | Objet |
|---|---|
| Deno, pur | `buildExportDiagnostics` : comptages, étape sans `tm7`, recette sans image |
| Deno, injecté | `run-export` : succès, échec au remplissage → rollback, échec du contrôle → export valide |
| Vitest | `useCookidooExport` : interrogation tant que `pending`, arrêt au statut final, abandon après 2 minutes |
| Vitest | Toasts : succès avec lien, échec avec message |

Les tests Deno doivent vivre sous `supabase/functions/_shared/` — la CI n'exécute
que ce répertoire.

## Risques

| Risque | Traitement |
|---|---|
| Limite wall-clock de l'isolate | Export mesuré ~15 s, marge confortable. `beforeunload` trace le cas limite. |
| Ligne bloquée en `pending` (isolate tué) | L'interrogation abandonne après 2 minutes ; la ligne reste détectable en SQL (`finished_at` nul). |
| Test local des tâches de fond | `[edge_runtime] policy = "per_worker"` dans `config.toml`, sinon l'instance est tuée à la fin de la requête. |
| Perte du retour si l'onglet est fermé | Déjà le cas aujourd'hui ; le journal conserve désormais la trace. |

## Séquence de livraison

1. `fix/toaster-manquant` — prérequis, indépendant et déjà prêt.
2. Migration `cookidoo_exports` + `diagnostics.ts` (pur, testable seul).
3. `run-export.ts` extrait, `index.ts` allégé, passage en `waitUntil`.
4. Interrogation périodique et toasts côté front.
