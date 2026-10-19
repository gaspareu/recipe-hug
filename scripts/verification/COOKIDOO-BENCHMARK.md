# Comparer les modèles d'adaptation Cookidoo

Le script `cookidoo-benchmark.ts` utilise cinq recettes **synthétiques** (pizza,
salade, crêpes, buns, vapeur). Il ne lit pas la production, n'écrit pas dans
Supabase et ne contacte jamais Cookidoo. Il utilise le contrat compact v3 et les
mêmes contrôles de génération, quantités, mapping et validation que le parcours
applicatif. La revue culinaire et le contrôle appareil restent indispensables.

## Exécution

Inventaire sans clé ni appel réseau :

```sh
deno run --config supabase/functions/deno.json --frozen scripts/verification/cookidoo-benchmark.ts
```

Avec une clé Anthropic déjà injectée dans l'environnement (ne jamais la mettre en
argument de commande ni dans le dépôt), première passe bornée à vingt appels :

```sh
deno run --config supabase/functions/deno.json --frozen --allow-env=ANTHROPIC_API_KEY --allow-net=api.anthropic.com scripts/verification/cookidoo-benchmark.ts --live --rounds 1
```

Trois passages sont prévus par défaut, dix au maximum. `--small` et `--large`
permettent de préciser des modèles accessibles au compte ; les valeurs initiales
sont `claude-haiku-5-5` et `claude-sonnet-5-5`, listées dans la documentation
Anthropic consultée le 19 octobre 2026. Cela ne vérifie pas leur disponibilité
sur chaque compte. Aucun paramètre de modèle n'est changé dans l'application.

Chaque politique dispose du même délai de 60 secondes et d'au plus deux appels :
Sonnet → réparation Sonnet, ou Haiku → réparation Sonnet. Une erreur fournisseur
ne déclenche pas de réparation ; une proposition invalide ne devient jamais un
résultat réussi. L'ordre des politiques alterne entre les passages.

Le résumé donne le nombre de résultats valides, les succès au premier appel,
la fréquence du second appel, la médiane et le p95 des **résultats valides**, les
échecs et les jetons consommés par résultat valide (essais échoués inclus).
Un résultat sans aucune commande machine ou avec un blocage n'est pas un succès.
Les sorties brutes, les recettes et la clé ne sont pas journalisées. Les comptes
de jetons ne constituent pas un tarif monétaire ; le prix dépend du modèle.

## Preuves disponibles dans cette modification

- Exécution à blanc : cinq fixtures, deux politiques, zéro appel réseau.
- Régressions déterministes : références source, quantités uniques/partagées,
  contraintes machine avec codes fermés, repli borné, métriques et mode/durée
  Pétrin dans la vue appareil.
- **Mesure fournisseur non exécutée : `ANTHROPIC_API_KEY` absente localement.**
  Aucun gain de latence ou de coût réel n'est affirmé. Le modèle de production
  reste inchangé.

Avant de choisir Haiku, comparer le temps jusqu'à un aperçu valide, les échecs et
les replis, puis revoir manuellement les adaptations du corpus. Distinguer la
compilation initiale du schéma des passages suivants. Conserver Sonnet si la
cascade dégrade la qualité ou la latence totale.

Références : [modèles Claude](https://platform.claude.com/docs/en/models/overview),
[sorties structurées](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
