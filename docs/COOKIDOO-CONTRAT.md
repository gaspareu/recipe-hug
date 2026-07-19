# Contrat de l'API Cookidoo (export TM7) — ce qu'on sait et comment

> **Objet.** L'API « Mes recettes créées » de Cookidoo est **non officielle et non
> documentée**. Ce document trace, pour chaque élément du contrat, **d'où vient
> l'information** : observée en réel, déduite, ou simplement supposée. C'est le
> garde-fou contre le principal piège de ce chantier — écrire du code (et des
> tests verts !) contre un format inventé.
>
> Doc opérationnelle du connecteur : `supabase/functions/CLAUDE.md`.
> Dernière vérification : **18 juillet 2026**.

## Niveaux de confiance

| Marqueur | Signification |
|---|---|
| ✅ **Observé** | Capturé sur le trafic réseau réel de `cookidoo.fr` (session authentifiée, DevTools). Fiable. |
| 🟡 **Déduit** | Inféré d'une observation adjacente ou d'une réponse d'API. Solide mais non prouvé directement. |
| ⚠️ **Hypothèse** | Non vérifié. À confirmer au premier export réel. Le code dégrade proprement si c'est faux. |

### Comment ces informations ont été obtenues

1. Session authentifiée sur `cookidoo.fr` (compte utilisateur réel, pays `fr`, locale `fr-FR`).
2. Lecture de l'API interne depuis la console du navigateur (`fetch` avec `credentials: 'include'`
   et l'en-tête `x-requested-with: xmlhttprequest`).
3. **Capture réseau d'un remplacement de photo** dans l'éditeur d'une recette créée → c'est ce qui a
   révélé le flux Cloudinary en 3 temps.
4. Lecture d'une **recette officielle** (`/recipes/recipe/fr-FR/r779937`), bien plus riche en
   annotations *guided cooking* que les recettes créées → c'est ce qui a révélé le format `TTS`/`MODE`.

> ⚠️ **Leçon.** Avant cette vérification, l'implémentation reposait sur le README d'un projet
> open-source tiers. Deux éléments centraux (annotations machine, image) s'y sont révélés **faux**,
> alors que toute la suite de tests était verte. Ne jamais considérer un contrat comme acquis sans
> capture réelle.

---

## 1. Authentification

- ✅ Par **cookies**, pas de Bearer token. Cookies requis : `_oauth2_proxy` et `v-authenticated`
  (plus `v-is-authenticated`, `tmde-lang`).
- ✅ En-tête `x-requested-with: xmlhttprequest` nécessaire pour obtenir du JSON.
- 🟡 Rate limit d'environ **10 requêtes/minute** (observé empiriquement, jamais mesuré finement) →
  d'où les temporisations et le backoff du client.
- ⚠️ Les **IP datacenter** peuvent être bloquées (Akamai). Non reproduit récemment ; le CLI local
  (IP résidentielle) reste le plan B.

## 2. Endpoints

| Méthode | Chemin | Statut | Rôle |
|---|---|---|---|
| `GET` | `/created-recipes/{lang}` | ✅ | Liste. Racine `{meta, items[]}` — **pas** `recipes`/`data`. |
| `GET` | `/created-recipes/{lang}/{id}` | ✅ | Détail (vue lecture, voir §3). |
| `POST` | `/created-recipes/{lang}` | 🟡 | Création. Corps `{recipeName}` → renvoie l'id. |
| `PATCH` | `/created-recipes/{lang}/{id}` | ✅ | Mise à jour partielle (par champs). |
| `DELETE` | `/created-recipes/{lang}/{id}` | 🟡 | Suppression. |
| `POST` | `/created-recipes/{lang}/image/signature` | ✅ | Signature d'upload d'image (voir §5). |

- ✅ L'identifiant d'une recette est **`recipeId`** (ULID, ex. `01KS5YFXA2K6ZX08TBB38FPH3A`), **pas** `id`.
- ⚠️ Le `PATCH` de renommage (champ `recipeName`/`name`) n'a pas été observé → traité en
  **best-effort** dans le code (un rejet ne bloque pas l'export, warning `title_not_updated`).

## 3. Deux schémas différents : écriture ≠ lecture

C'est le piège principal de cette API.

- ✅ **Lecture** (`GET`) : vue aplatie façon schema.org — `recipeIngredient` et `recipeInstructions`
  sont des **tableaux de chaînes**, `tool`, `recipeYield`, et les temps en **ISO 8601** (`"PT20M"`).
  Aucune annotation visible.
- ✅ **Écriture** (`PATCH`, et sa réponse) : structure riche — `ingredients`, `instructions` (avec
  `annotations`), `tools`, `yield`, et les temps en **secondes** (`1200`).

> Conséquence : **on ne peut pas valider le format d'écriture en lisant une recette**. La réponse du
> `PATCH`, elle, renvoie bien la structure d'écriture — c'est le meilleur point d'observation.

### Payload d'écriture (✅ confirmé par la réponse du PATCH)

```jsonc
{
  "name": "…",
  "ingredients":  [{ "type": "INGREDIENT", "text": "330 g d'eau minérale" }],
  "instructions": [{ "type": "STEP", "text": "…", "annotations": [ /* §4 */ ] }],
  "tools": ["TM7"],
  "yield": { "value": 4, "unitText": "piece" },
  "prepTime": 1200,          // secondes
  "totalTime": 13200,        // secondes
  "hints": "…",
  "workStatus": "PRIVATE"
}
```

- ⚠️ **`cookTime`** : nous l'envoyons, mais il n'apparaît dans **aucune** réponse Cookidoo →
  probablement ignoré. Sans effet de bord connu, conservé.
- 🟡 `missedUsages` (ingrédients non cités dans le texte) est **généré par Cookidoo**, pas par nous.

## 4. Annotations — ce qui rend une étape « guidée »

✅ Trois types confirmés (source : recette officielle `r779937` + recette créée).

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
- ⚠️ Valeur de `direction` hors sens inverse (`"CW"` ? champ omis ?) : jamais observée → nous
  **omettons** le champ quand il n'y a pas de sens inverse.

**`MODE`** — modes nommés de l'appareil :
```json
{ "type": "MODE", "name": "browning",
  "data": { "time": 360, "temperature": { "value": "160", "unit": "C" }, "power": "Intense" },
  "position": { "offset": 43, "length": 10 } }
```
- ✅ Noms observés : **`dough`** (Pétrin) et **`browning`** (Rissoler).
- ✅ `power` observé pour le rissolage : `"Intense"` et `"Gentle"`.
- ⚠️ **Liste complète des `name` inconnue.** Les autres modes TM7 retombent donc sur une annotation
  `TTS` (comportement sûr : mieux vaut un réglage manuel correct qu'un mode inventé).
- ⚠️ Nous posons `power: "Intense"` par défaut pour le rissolage (valeur courante).

**`INGREDIENT`** — liaison texte ↔ ingrédient :
```json
{ "type": "INGREDIENT", "data": { "description": "20 g d'huile" },
  "position": { "offset": 7, "length": 12 } }
```
- ✅ En écriture, `data.description` est une **chaîne simple**.
- 🟡 En lecture, Cookidoo renvoie parfois une forme **enrichie** (`description` devient un objet
  `{text, annotations:[{type:"VOLUME", data:{amount,unit,unitText}}]}`). C'est le résultat de **leur**
  analyseur : nous n'avons pas à la produire.
- ✅ `position` cible le **nom** de l'ingrédient dans le texte de l'étape.

> ⚠️ Les annotations ne doivent pas se chevaucher : notre `TTS` est positionné sur le seul segment de
> réglages (« 20 min/100°C/vitesse 1 »), pas sur toute la phrase.

## 5. Image — flux Cloudinary en 3 temps (✅ intégralement observé)

Cookidoo **ré-héberge** l'image sur son CDN. Le champ `image` attend un **identifiant Cloudinary**,
jamais une URL externe.

```
1) POST /created-recipes/{lang}/image/signature      {timestamp, source:"uw"} → {signature}
2) POST https://api-eu.cloudinary.com/v1_1/vorwerk-users-gc/image/upload      (multipart)
      upload_preset=prod-customer-recipe-signed · api_key=993585863591145
      source=uw · signature · timestamp · file=<binaire>                     → {public_id, format}
3) PATCH /created-recipes/{lang}/{id}   {"image":"<public_id>.<format>", "isImageOwnedByUser":false}
```

- ✅ `api_key` et `upload_preset` sont **publics** (visibles dans le widget navigateur) → pas des secrets.
- ✅ En lecture, `image` devient une URL CDN contenant un placeholder littéral `{transformation}`
  (`https://ugc.assets.tmecosys.com/image/upload/{transformation}/prod/img/customer-recipe/xxx.jpg`),
  à substituer côté client.
- 🟡 En écriture on envoie `isImageOwnedByUser` ; en lecture le champ s'appelle `isImageCopyrightOwned`.
- ⚠️ **Paramètres exactement couverts par la signature** : la capture incluait `custom_coordinates`
  (recadrage). Nous ne recadrons pas et ne l'envoyons donc ni à la signature ni à l'upload — cohérent,
  mais non prouvé.
- 🔐 **Conséquence sécurité** : ce flux impose de **télécharger l'image côté serveur** (avant, on ne
  transmettait qu'une URL). L'origine est donc restreinte au stockage Supabase du projet
  (`isAllowedImageUrl`) pour écarter toute SSRF (réseau interne, métadonnées cloud).

## 6. Référentiel TM7 (source : constructeur, pas l'API)

Origine : specs Vorwerk TM7 (2025) + page officielle des modes Cookidoo. Indépendant de l'API.

- Vitesses **0,5 → 10** (pas de 0,5), plus **Turbo** et **mijotage** ; en cuisson vapeur, vitesse **≤ 5**.
- Températures **37 → 160 °C** ; **Varoma** est un **mode** vapeur, pas une valeur en °C ;
  rissolage **140-160 °C**.
- Accessoires : couteau, fouet papillon, panier de cuisson, Varoma, spatule, gobelet doseur.
- ⚠️ Les plages **par mode** (`TM7_MODES`) sont des ordres de grandeur « experts » destinés à guider
  l'IA et à détecter les incohérences — ce ne sont pas des limites matérielles officielles, hormis les
  bornes globales de vitesse et de température.
- ⚠️ L'**accessoire** n'a aucun équivalent dans le payload Cookidoo → il reste seulement lisible dans
  le texte de l'étape.

## 7. Ce qui reste à confirmer

À lever au premier export réel de bout en bout (CLI, IP résidentielle) :

1. Paramètres couverts par la signature Cloudinary (§5).
2. `power: "Intense"` par défaut sur le rissolage (§4).
3. Liste complète des `name` de `MODE` (§4).
4. `PATCH` de renommage lors d'un ré-export (§2).
5. Sort réservé à `cookTime` (§3).

Chacun de ces points est **isolé et non bloquant** : en cas d'échec, l'export aboutit avec un
avertissement plutôt que de casser.

---

## 8. Fichiers impactés

25 fichiers, 12 commits sur `feat/cookidoo-tm7-guided-cooking`.

### Cœur du contrat (à relire en priorité si l'API change)

| Fichier | Rôle |
|---|---|
| `supabase/functions/_shared/cookidoo/types.ts` | Types du payload et des annotations (`TTS`/`MODE`/`INGREDIENT`). |
| `supabase/functions/_shared/cookidoo/mapper.ts` | Recette → payload : annotations, format des ingrédients, temps. |
| `supabase/functions/_shared/cookidoo/client.ts` | Endpoints, ré-essais/backoff, **flux image Cloudinary**, garde-fou SSRF. |
| `supabase/functions/_shared/cookidoo/validate.ts` | Contrôle du payload **avant** tout appel réseau. |
| `supabase/functions/_shared/cookidoo/auth.ts` | Login cookies *(non modifié par ce chantier)*. |
| `supabase/functions/export-recipe-cookidoo/index.ts` | Orchestration : validation → create/update → remplissage → image, anti-doublon, rollback. |

### Référentiel TM7 (deux copies à garder synchronisées)

| Fichier | Rôle |
|---|---|
| `supabase/functions/_shared/thermomix/reference.ts` | **Source de vérité** (edge). |
| `src/lib/thermomix/reference.ts` | Miroir front (Deno ne peut pas importer `src/`). |
| `src/lib/thermomix/reference.sync.test.ts` | Garde-fou : échoue à la moindre divergence entre les deux. |

### Génération et modèle de données

| Fichier | Rôle |
|---|---|
| `supabase/functions/home-assistant/index.ts` | Prompt + schémas d'outils : l'IA produit `step.tm7`. |
| `src/types/recipe.ts` | `Step.tm7`, `Ingredient.preparation`. |
| `src/lib/chat-tool-payloads.ts` | Validation Zod (permissive) des tool-calls. |
| `supabase/functions/_shared/context-format.ts` | Contexte recette réinjecté dans le prompt. |

### Interface et données

| Fichier | Rôle |
|---|---|
| `src/components/recipes/ExportToCookidooButton.tsx` | Dialog d'export (TM7 exclusif), warnings, « mise à jour » vs « envoi ». |
| `src/hooks/useCookidooConnector.ts` | Hook d'export, types de réponse. |
| `supabase/migrations/20260717000000_cookidoo_export_mapping.sql` | `recipes.cookidoo_recipe_id` + date (anti-doublon). |
| `connector/cookidoo/cli.ts` | CLI de secours (IP résidentielle) — **partage les mêmes modules**. |

### Tests

`_shared/cookidoo/{mapper,client,validate}_test.ts`, `_shared/thermomix/reference_test.ts`,
`src/lib/thermomix/reference.sync.test.ts`.
La CI n'exécute que `supabase/functions/_shared/` côté Deno : **tout test Deno doit vivre là** pour
être joué.

### Documentation

`supabase/functions/CLAUDE.md` (opérationnel), `EDGE_FUNCTIONS.md`, `CLAUDE.md`,
`docs/CODEMAPS/{backend,data}.md`, et le présent document.

---

## 9. Reproduire la vérification

Sur `cookidoo.fr`, connecté, dans la console :

```js
const h = { 'x-requested-with': 'xmlhttprequest', accept: 'application/json' };
const g = p => fetch(p, { headers: h, credentials: 'include' }).then(r => r.json());

// Liste → identifiants
await g('/created-recipes/fr-FR');

// Vocabulaire d'annotations le plus riche : une recette OFFICIELLE
const off = await g('/recipes/recipe/fr-FR/r779937');
console.log(JSON.stringify((off.recipeContent?.instructions ?? off.instructions).slice(0, 6), null, 2));
```

Pour le **format d'écriture** : ouvrir l'éditeur d'une recette créée, modifier une étape ou la photo,
enregistrer, et lire le corps de la requête `PATCH` **ainsi que sa réponse** (la réponse renvoie la
structure d'écriture complète). Penser à annuler la modification ensuite.
