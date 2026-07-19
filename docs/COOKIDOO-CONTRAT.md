# Contrat de l'API Cookidoo (export TM7) — ce qu'on sait et comment

> **Objet.** L'API « Mes recettes créées » de Cookidoo est **non officielle et non
> documentée**. Ce document trace, pour chaque élément du contrat, **d'où vient
> l'information** : observée en réel, déduite, ou simplement supposée. C'est le
> garde-fou contre le principal piège de ce chantier — écrire du code (et des
> tests verts !) contre un format inventé.
>
> Doc opérationnelle du connecteur : `supabase/functions/CLAUDE.md`.
> Dernière vérification : **19 juillet 2026** (sondes d'écriture réelles, cf. §10).

## Niveaux de confiance

| Marqueur | Signification |
|---|---|
| ✅ **Observé** | Capturé sur le trafic réseau réel de `cookidoo.fr` (session authentifiée). Fiable. |
| 🟡 **Déduit** | Inféré d'une observation adjacente ou d'une réponse d'API. Solide mais non prouvé directement. |
| ⚠️ **Hypothèse** | Non vérifié. Le code dégrade proprement si c'est faux. |

### Comment ces informations ont été obtenues

1. Session authentifiée sur `cookidoo.fr` (compte réel, pays `fr`, locale `fr-FR`).
2. Lecture de l'API interne depuis la console du navigateur (`fetch` avec `credentials: 'include'`).
3. Capture réseau d'un remplacement de photo dans l'éditeur → flux Cloudinary en 3 temps.
4. **Sondes d'écriture réelles** (19/07/2026) : création, PATCH, relecture et suppression de
   recettes jetables `ZZ-SONDE-*`. C'est la source la plus fiable — elle prouve ce que
   l'API **stocke**, pas seulement ce qu'elle affiche.

> ⚠️ **Leçon n°1.** Avant la vérification de juillet, l'implémentation reposait sur le README d'un
> projet open-source tiers. Deux éléments centraux s'y sont révélés **faux**, avec une suite de
> tests entièrement verte.
>
> ⚠️ **Leçon n°2 (19/07).** Les projets tiers se trompent aussi **entre eux**, et sur des points
> qu'ils annoncent « vérifiés ». Trois d'entre eux affirment qu'un en-tête `Accept` particulier est
> obligatoire en écriture sous peine de perte silencieuse des annotations : **c'est faux sur
> `cookidoo.fr`** (§3). Une convergence de sources tierces ne vaut pas une capture.
>
> ⚠️ **Leçon n°3 (19/07).** L'API **valide** strictement la structure (JSON Schema), mais accepte
> des valeurs qu'elle **dégrade ensuite silencieusement** : un mode inconnu passe en `200 OK` puis
> perd toute interactivité sur l'appareil. Un aller-retour réussi ne prouve donc **pas** que le
> résultat est exploitable. Le seul oracle est la **vue device** (§8).
>
> ⚠️ **Leçon n°4 (19/07).** Ce document a contenu, pendant quelques heures, trois affirmations
> fausses issues d'un raisonnement par analogie avec des projets tiers (l'en-tête `Accept`
> obligatoire, l'encodage Varoma « inventé », l'absence de validation). **Toutes ont été démenties
> par l'expérience directe.** Ne rien inscrire ici qui ne soit adossé à une requête réelle.

---

## 1. Authentification

- ✅ Par **cookies**, pas de Bearer token. Cookies requis : `_oauth2_proxy` et `v-authenticated`
  (plus `v-is-authenticated`, `tmde-lang`).
- 🟡 En-tête `x-requested-with: xmlhttprequest` — présent sur toutes nos requêtes ; son caractère
  obligatoire n'a pas été testé par omission.
- 🟡 Rate limit d'environ **10 requêtes/minute** (observé empiriquement) → d'où les temporisations
  et le backoff du client. Aucun 429 rencontré lors des sondes (requêtes espacées de ~2,5 s).
- ⚠️ Les **IP datacenter** peuvent être bloquées (Akamai). Non reproduit ; le CLI local
  (IP résidentielle) reste le plan B.
- ⚠️ Un projet tiers signale (12/07/2026) que le CIAM rejette les User-Agent non-navigateur avec un
  403. Non reproduit sur `.fr` — à surveiller si `auth.ts` échoue soudainement.

## 2. Endpoints

| Méthode | Chemin | Statut | Rôle |
|---|---|---|---|
| `GET` | `/created-recipes/{lang}` | ✅ | Liste. Racine `{meta, items[]}` — **pas** `recipes`/`data`. |
| `GET` | `/created-recipes/{lang}/{id}` | ✅ | Détail. **La vue dépend de l'en-tête `Accept`** (§3). |
| `POST` | `/created-recipes/{lang}` | ✅ | Création. Corps `{recipeName}` → renvoie **l'objet recette complet**, pas seulement l'id. |
| `PATCH` | `/created-recipes/{lang}/{id}` | ✅ | Mise à jour partielle. Réponse = recette complète en vue *full*. |
| `DELETE` | `/created-recipes/{lang}/{id}` | ✅ | Suppression → `204`, puis `410 Gone` à la relecture. |
| `POST` | `/created-recipes/{lang}/image/signature` | ✅ | Signature d'upload d'image (§5). |
| `GET` | `/created-recipes/{lang}/device/recipes/{id}` | ✅ | **Vue appareil** — ce que reçoit le TM7. **L'oracle de validation** (§8). |
| `GET` | `/created-recipes/.well-known/home` | ✅ | Catalogue HAL de tous les liens de l'API (utile pour découvrir des endpoints). |
| `GET` | `/created-recipes/{lang}/config` | ✅ | Quotas : `recipeLimit: 150`, seuil d'alerte à 5. |

- ✅ L'identifiant d'une recette est **`recipeId`** (ULID, ex. `01KXX65BV0ZNC35F8P4AFEPGJC`), **pas** `id`.
- ✅ Le `PATCH` de renommage (`{name}`) **fonctionne** — vérifié sur sonde. Le traitement
  best-effort du code (warning `title_not_updated`) reste un filet de sécurité acceptable.
- ✅ **Un PATCH combiné `{name, prepTime, instructions}` passe sans erreur** et applique tous les
  champs. Le découpage en plusieurs PATCH n'est donc **pas** une obligation de l'API.
  *(Un projet tiers annonce un `validationError` sur PATCH combiné : non reproduit sur `.fr`.)*

## 3. Une seule ressource, deux vues — pilotées par `Accept`

C'est le piège principal de cette API, et la correction majeure du 19/07.

Le même `GET /created-recipes/{lang}/{id}` renvoie **deux représentations différentes** selon
l'en-tête `Accept` :

| `Accept` envoyé | Réponse |
|---|---|
| `application/json` | Vue aplatie façon schema.org : `recipeIngredient` / `recipeInstructions` sont des **tableaux de chaînes**, `tool`, `recipeYield`. **Aucune annotation.** |
| `application/vnd.vorwerk.customer-recipe.full+json` | Vue complète : `ingredients`, `instructions` (avec `annotations`), `tools`, `yield`, `hints`, `missedUsages`. |

> ✅ **Conséquence directe** : on **peut** valider le format d'écriture par simple lecture, à
> condition de demander la vue *full*. C'est le moyen de contrôle le moins coûteux et le moins
> risqué — préférer une relecture à une nouvelle sonde d'écriture.

**Ce qui a été démenti** : la vue *full* n'est **pas** requise en écriture. Deux sondes ayant reçu
le **même payload**, l'une PATCHée avec `Accept: application/json` et l'autre avec la vue *full*,
sont **strictement identiques** en base, annotations comprises. Le `PATCH` répond d'ailleurs
toujours en `full+json`, quel que soit l'`Accept` demandé.

→ En pratique le client **doit** envoyer la vue *full* sur ses **GET** (sinon il lit une recette
sans annotations et croit à tort qu'elles sont absentes) ; c'est indifférent sur ses PATCH.

### Payload d'écriture (✅ confirmé par sonde : envoyé, stocké, relu à l'identique)

```jsonc
{
  "name": "…",
  "ingredients":  [{ "type": "INGREDIENT", "text": "330 g d'eau minérale" }],
  "instructions": [{ "type": "STEP", "text": "…", "annotations": [ /* §4 */ ] }],
  "tools": ["TM7"],
  "yield": { "value": 4, "unitText": "piece" },
  "prepTime": 1200,          // secondes
  "cookTime": 4242,          // secondes
  "totalTime": 13200,        // secondes
  "hints": "…",
  "workStatus": "PRIVATE"
}
```

- ✅ **`cookTime` est bien persisté et relu** (sonde : `4242` → `4242`). L'ancienne note « absent de
  toute réponse, probablement ignoré » était un artefact de la vue aplatie. **À conserver.**
- ✅ `yield.unitText: "piece"` est accepté et s'affiche « 4 morceaux ».
- 🟡 `missedUsages` (ingrédients non cités dans le texte) est **généré par Cookidoo**, pas par nous.
  Non reproduit sur nos sondes (resté vide malgré un ingrédient non cité) → génération sans doute
  liée aux recettes importées/copiées.

## 4. Annotations — ce qui rend une étape « guidée »

✅ Types confirmés en écriture **et** en lecture : `TTS`, `MODE`, `INGREDIENT`.
✅ Également observés en lecture seule (produits par Cookidoo) : `VOLUME`, `MISSED_INGREDIENT`.

> ✅ **Cookidoo n'annote pas automatiquement.** Une étape envoyée sans `annotations`, dont le texte
> contenait pourtant « 5 min/100°C/vitesse 2 », est relue **sans aucune annotation**. Le mapper est
> donc indispensable : rien n'est déduit du texte côté serveur.

**`TTS`** — réglages manuels temps / température / vitesse :
```json
{ "type": "TTS",
  "data": { "time": 180, "speed": "1", "direction": "CCW",
            "temperature": { "value": "120", "unit": "C" } },
  "position": { "offset": 67, "length": 23 } }
```
- ✅ `time` en **secondes** ; `temperature.value` est une **chaîne**.
- ✅ Le **sens inverse** s'exprime par `direction: "CCW"` — surtout **pas** `reverse: true`.
- ✅ La vitesse **mijotage** s'écrit `"soft"`.
- ✅ Un `TTS` réduit à `{ "time": 300 }` est valide (ni vitesse ni température).
- ✅ Dans un `TTS`, `direction` est **omis** hors sens inverse (jamais vu à `"CW"`).

**`MODE`** — modes nommés de l'appareil :
```json
{ "type": "MODE", "name": "browning",
  "data": { "time": 360, "temperature": { "value": "160", "unit": "C" }, "power": "Intense" },
  "position": { "offset": 43, "length": 10 } }
```
- ✅ `dough` ne porte que `{ time }` — pas de température.
- ✅ `steaming` porte `{ time, speed, direction: "CW", accessory: "Varoma" }` — ici `direction` est
  **explicite**, contrairement au `TTS`.
- ⚠️ Un projet tiers annonce d'autres noms (`blend`, `turbo`, `warm_up`, `rice_cooker`) : le schéma
  de validation comporte bien **8 variantes de `MODE`**, mais ces quatre noms n'ont pas été testés.
- 🛑 **`name: "manual"` et tout nom inconnu sont acceptés par l'API (`200 OK`) puis dégradés en
  simple texte** sur l'appareil (`Type: "CustomerText"`, aucune interactivité). Ne jamais inventer
  de nom : le repli du mapper vers une annotation `TTS` est le bon comportement.

### ✅ Correspondance annotation → intention appareil (vérifiée sur sonde, §8)

| Envoyé | `IntentId` sur l'appareil | Exploitable |
|---|---|---|
| `TTS {time, speed, temperature}` | `cooking-mode/ManualValues` | ✅ |
| `TTS {…, direction:"CCW"}` | `cooking-mode/ManualValues` (`Rotation=counterclockwise`) | ✅ |
| `TTS {…, speed:"soft"}` | `cooking-mode/ManualValues` (`Speed=3`) | ✅ |
| **`TTS {…, temperature:{value:"varoma"}}`** | **`cooking-mode/Steaming` + `Accessory=Varoma`** | ✅ |
| `MODE dough` | `cooking-mode/Dough` | ✅ |
| `MODE steaming` | `cooking-mode/Steaming` | ✅ |
| `MODE browning power:"Intense"` | `cooking-mode/HighTemperature_**FullPower**` | ✅ |
| `MODE browning power:"Gentle"` | `cooking-mode/HighTemperature_**MediumPower**` | ✅ |
| `MODE <nom inconnu>` / `manual` | *(aucune)* → `CustomerText` | ❌ |

- ✅ **`temperature: {value: "varoma"}` (minuscule, sans `unit`) est un encodage valide et
  documenté par le schéma** : Cookidoo le traduit lui-même en `cooking-mode/Steaming` avec
  `Accessory=Varoma`. `"Varoma"` **majuscule est rejeté** en `400`. L'encodage actuel du mapper est
  donc **correct** — ne pas le « corriger ».
- 🛑 **`power` détermine l'intention machine** : coder `"Intense"` en dur force *tous* les rissolages
  à pleine puissance (`FullPower`). C'est le principal défaut fonctionnel identifié.
- ✅ Les vitesses sont multipliées par 10 dans la vue appareil (`"2"` → `Speed=20`), sauf `"soft"`
  → `Speed=3`. Conversion interne à Cookidoo, sans impact sur le payload à envoyer.

**`INGREDIENT`** — liaison texte ↔ ingrédient :
```json
{ "type": "INGREDIENT", "data": { "description": "20 g d'huile" },
  "position": { "offset": 7, "length": 12 } }
```
- ✅ En écriture, `data.description` est une **chaîne simple**.
- ✅ En lecture, Cookidoo la renvoie **toujours** enrichie en objet
  `{ text, annotations: [ /* VOLUME */ ] }` — y compris pour nos propres écritures. C'est **leur**
  analyseur : nous n'avons pas à la produire. *(Sonde : `"20 g d'huile d'olive"` → `{text: "20 g
  d'huile d'olive", annotations: []}`.)*
- ✅ `position` cible le **nom** de l'ingrédient dans le texte de l'étape.
- ✅ Le champ `notes` n'apparaît dans **aucune** annotation réelle — inutile de l'émettre.
- 🟡 `MISSED_INGREDIENT` n'est pas une entrée du tableau `annotations` mais un **champ frère**
  `missedUsages` du `STEP`.

> ⚠️ Les annotations ne doivent pas se chevaucher : notre `TTS` est positionné sur le seul segment de
> réglages (« 20 min/100°C/vitesse 1 »), pas sur toute la phrase.

## 5. Image — flux Cloudinary en 3 temps (✅ intégralement prouvé de bout en bout)

Cookidoo **ré-héberge** l'image sur son CDN. Le champ `image` attend un **identifiant Cloudinary**,
jamais une URL externe.

```
1) POST /created-recipes/{lang}/image/signature      {timestamp, source:"uw"} → {signature}
2) POST https://api-eu.cloudinary.com/v1_1/vorwerk-users-gc/image/upload      (multipart)
      upload_preset=prod-customer-recipe-signed · api_key=993585863591145
      source=uw · signature · timestamp · file=<binaire>                     → {public_id, format}
3) PATCH /created-recipes/{lang}/{id}   {"image":"<public_id>.<format>", "isImageOwnedByUser":true}
```

- ✅ `api_key` et `upload_preset` sont **publics** (visibles dans le widget navigateur) → pas des secrets.
- ✅ La réponse de signature ne contient **que** `{signature}`.
- ✅ **`custom_coordinates` n'est pas requis** : l'upload aboutit sans ce paramètre, ni à la
  signature ni au POST Cloudinary. *(Lève l'ancienne ⚠️ n°1.)*
- ✅ `public_id` de la forme `prod/img/customer-recipe/<aléatoire>`.
- ✅ En écriture on envoie `isImageOwnedByUser` ; en lecture le champ s'appelle
  **`isImageCopyrightOwned`** et reflète bien la valeur envoyée (`true` → `true`).
- ✅ En lecture, `image` devient une URL CDN contenant un placeholder littéral `{transformation}`
  (`https://ugc.assets.tmecosys.com/image/upload/{transformation}/prod/img/customer-recipe/xxx.jpg`),
  à substituer côté client. Cookidoo ajoute aussi un `descriptiveAssets`
  (`{square, portrait, landscape}`) pointant sur le même asset.
- 🔐 **Conséquence sécurité** : ce flux impose de **télécharger l'image côté serveur**. L'origine est
  donc restreinte au stockage Supabase du projet (`isAllowedImageUrl`) pour écarter toute SSRF.

## 6. Référentiel TM7 (source : constructeur, pas l'API)

Origine : specs Vorwerk TM7 (2025) + page officielle des modes Cookidoo. Indépendant de l'API.

- Vitesses **0,5 → 10** (pas de 0,5), plus **Turbo** et **mijotage** ; en cuisson vapeur, vitesse **≤ 5**.
- Températures **37 → 160 °C** ; rissolage **140-160 °C**.
- Accessoires : couteau, fouet papillon, panier de cuisson, Varoma, spatule, gobelet doseur.
- ✅ **Varoma dispose de deux encodages, tous deux valides** : `TTS` avec
  `temperature: {value: "varoma"}` (ce que produit le mapper) **ou** `MODE:steaming` +
  `accessory: "Varoma"`. Les deux aboutissent à `cooking-mode/Steaming` sur l'appareil (§4).
  Attention : `"varoma"` **doit être en minuscules** et **sans** champ `unit`.
- ✅ **L'accessoire a bien un équivalent dans le payload** (`accessory`), au moins pour `steaming`.
  *(Corrige l'affirmation inverse des versions précédentes de ce document.)*
- ⚠️ Les plages **par mode** (`TM7_MODES`) sont des ordres de grandeur « experts » destinés à guider
  l'IA et à détecter les incohérences — pas des limites matérielles officielles, hormis les bornes
  globales de vitesse et de température.

## 7. Ce qui reste à confirmer

Très peu de choses — la découverte de la **vue appareil** (§8) a permis de tout trancher sans TM7.

1. ⚠️ Les modes `blend` / `turbo` / `warm_up` / `rice_cooker` annoncés par un projet tiers. Le
   schéma comporte 8 variantes de `MODE` et 4 sont confirmées ; les 4 autres sont probablement
   celles-là, mais elles n'ont pas été testées. **Test : les envoyer, puis lire la vue appareil.**
2. ⚠️ La liste exacte des vitesses et températures autorisées par le schéma (l'API renvoie
   « must be equal to one of the allowed values » sans énumérer). Sondable valeur par valeur.
3. ⚠️ Comportement sous IP datacenter (§1) — indépendant du contrat.

## 8. ✅ La vue appareil : l'oracle de validation

`GET /created-recipes/{lang}/device/recipes/{id}` renvoie la recette **telle que le TM7 la reçoit**.
C'est le seul moyen fiable de savoir si une annotation est réellement exploitable — et il ne
nécessite **aucun appareil**.

Structure : `Intents[]` (modes utilisés), `Details.PreparationGroups`, `PromptFlow` (enchaînement),
`PromptDetails.Prompts[]` (le cœur).

```jsonc
{ "Type": "CustomerAnnotations",          // ✅ étape guidée, bouton actif
  "PreparationStepIndex": 0,
  "ActionText": "Cuire <b>Cuisson vapeur /20 min</b> au Varoma.",
  "Annotations": [{ "Type": "APP", "IntentId": "cooking-mode/Steaming", "Version": "1",
    "Parameters": [{ "Name": "Time", "Value": "1200" }, { "Name": "Speed", "Value": "50" },
                   { "Name": "Rotation", "Value": "clockwise" },
                   { "Name": "Accessory", "Value": "Varoma" }] }] }

{ "Type": "CustomerText",                 // ❌ dégradé en texte, aucune interactivité
  "ActionText": "Régler 10 min/90°C/vitesse 3 manuellement." }
```

> 🧪 **Règle de validation d'un export** : après le PATCH, relire la vue appareil et vérifier que
> chaque étape censée être guidée a bien `Type: "CustomerAnnotations"`. Toute étape retombée en
> `CustomerText` signale une annotation refusée **sans erreur HTTP**. C'est le test d'intégration
> qui manquait au connecteur.

### Ce que l'API valide, et ce qu'elle laisse passer

- ✅ **Elle valide la structure** (JSON Schema `oneOf`) : un `400` détaillé rejette une température
  hors énumération (`"Varoma"` majuscule), une vitesse inconnue, une `direction` invalide, un
  `type` d'annotation inconnu, un `unit` manquant là où il est requis.
- 🛑 **Elle ne valide pas la sémantique** : un `MODE` de nom inconnu passe en `200 OK`, est stocké
  tel quel, et n'est perdu qu'à la conversion vers la vue appareil. **C'est le seul mode d'échec
  réellement silencieux de cette API.**

---

## 9. Reproduire la vérification

Sur `cookidoo.fr`, connecté, dans la console :

```js
const FULL = 'application/vnd.vorwerk.customer-recipe.full+json';
const h = { accept: FULL, 'x-requested-with': 'xmlhttprequest' };
const g = p => fetch(p, { headers: h, credentials: 'include' }).then(r => r.json());

// Liste → identifiants
await g('/created-recipes/fr-FR');

// Détail annoté (comparer avec accept: 'application/json' pour voir les deux vues)
const r = await g('/created-recipes/fr-FR/<recipeId>');
console.log(JSON.stringify(r.recipeContent.instructions, null, 2));
```

Meilleure source d'annotations authentiques : une recette **officielle copiée** dans « Mes
créations » (`isBasedOn: true`) — les annotations y sont produites par Cookidoo.

## 10. Journal des sondes

| Date | Sonde | Objet | Résultat |
|---|---|---|---|
| 19/07/2026 | `ZZ-SONDE-A` / `ZZ-SONDE-B` | Même payload, `Accept` différent au PATCH | Stockage **identique** → l'en-tête n'agit qu'en lecture |
| 19/07/2026 | `ZZ-SONDE-A` | Étape sans annotation, texte contenant des réglages | Aucune annotation générée → pas de parseur serveur |
| 19/07/2026 | `ZZ-SONDE-A` | `cookTime`, `hints`, `yield`, PATCH combiné, renommage | Tous persistés |
| 19/07/2026 | `ZZ-SONDE-A` | Flux image Cloudinary sans `custom_coordinates` | Succès complet |
| 19/07/2026 | `ZZ-SONDE-B` | `DELETE` | `204`, puis `410` à la relecture |
| 19/07/2026 | `ZZ-SONDE-A` | 9 encodages d'annotation lus via la **vue appareil** | Table de correspondance du §4 ; `manual` et noms inconnus dégradés en `CustomerText` |
| 19/07/2026 | `ZZ-SONDE-A` | Valeurs hors énumération (`"Varoma"`, `speed:"42"`, `direction:"SIDEWAYS"`) | `400` détaillé → l'API valide bien la structure |

---

## 11. Fichiers impactés

### Cœur du contrat (à relire en priorité si l'API change)

| Fichier | Rôle |
|---|---|
| `supabase/functions/_shared/cookidoo/types.ts` | Types du payload et des annotations (`TTS`/`MODE`/`INGREDIENT`). |
| `supabase/functions/_shared/cookidoo/mapper.ts` | Recette → payload : annotations, format des ingrédients, temps. |
| `supabase/functions/_shared/cookidoo/client.ts` | Endpoints, ré-essais/backoff, **en-tête `Accept`**, flux image, garde-fou SSRF. |
| `supabase/functions/_shared/cookidoo/validate.ts` | Contrôle du payload **avant** tout appel réseau — d'autant plus important que l'API ne valide rien (§8). |
| `supabase/functions/_shared/cookidoo/auth.ts` | Login cookies. |
| `supabase/functions/export-recipe-cookidoo/index.ts` | Orchestration : validation → create/update → remplissage → image, anti-doublon, rollback. |

### Référentiel TM7 (deux copies à garder synchronisées)

| Fichier | Rôle |
|---|---|
| `supabase/functions/_shared/thermomix/reference.ts` | **Source de vérité** (edge). |
| `src/lib/thermomix/reference.ts` | Miroir front (Deno ne peut pas importer `src/`). |
| `src/lib/thermomix/reference.sync.test.ts` | Garde-fou : échoue à la moindre divergence. |

### Génération, interface et données

| Fichier | Rôle |
|---|---|
| `supabase/functions/home-assistant/index.ts` | Prompt + schémas d'outils : l'IA produit `step.tm7`. |
| `src/types/recipe.ts` | `Step.tm7`, `Ingredient.preparation`. |
| `src/lib/chat-tool-payloads.ts` | Validation Zod (permissive) des tool-calls. |
| `src/components/recipes/ExportToCookidooButton.tsx` | Dialog d'export (TM7 exclusif), warnings. |
| `src/hooks/useCookidooConnector.ts` | Hook d'export, types de réponse. |
| `supabase/migrations/20260717000000_cookidoo_export_mapping.sql` | `recipes.cookidoo_recipe_id` (anti-doublon) — **non appliquée tant que la branche n'est pas mergée**. |
| `connector/cookidoo/cli.ts` | CLI de secours (IP résidentielle) — **partage les mêmes modules**. |

### Tests

`_shared/cookidoo/{mapper,client,validate}_test.ts`, `_shared/thermomix/reference_test.ts`,
`src/lib/thermomix/reference.sync.test.ts`.
La CI n'exécute que `supabase/functions/_shared/` côté Deno : **tout test Deno doit vivre là**.
