import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { Ingredient } from "@/types/recipe";
import { IngredientEditor } from "./IngredientEditor";

// Radix UI Select utilise des Pointer Events et scrollIntoView que jsdom ne supporte pas.
// Ces polyfills locaux permettent à userEvent d'interagir avec les combobox sans erreur.
beforeEach(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    name: "Sel",
    category: "Épice",
    quantity: 1,
    unit: "pincée",
    ...overrides,
  };
}

function setup(ingredients: Ingredient[], onChange = vi.fn()) {
  render(<IngredientEditor ingredients={ingredients} onChange={onChange} />);
  return { onChange };
}

/**
 * Retourne les boutons de suppression (Trash2) en excluant :
 * - le bouton "Ajouter" (possède du texte visible)
 * - les SelectTrigger shadcn (role="combobox")
 * Les boutons Trash2 sont des <button> sans aria-label ni texte visible,
 * uniquement une SVG, et leur role implicite est "button" (pas "combobox").
 */
function getDeleteButtons(): HTMLElement[] {
  return screen
    .getAllByRole("button")
    .filter(
      (btn) =>
        btn.querySelector("svg") !== null &&
        !btn.getAttribute("aria-label") &&
        !btn.textContent?.trim() &&
        btn.getAttribute("role") !== "combobox" &&
        btn.getAttribute("aria-autocomplete") === null,
    );
}

// ──────────────────────────────────────────────────────────
// Rendu de base
// ──────────────────────────────────────────────────────────

describe("IngredientEditor — rendu", () => {
  it("affiche le bouton « Ajouter »", () => {
    setup([]);
    expect(screen.getByRole("button", { name: /Ajouter/ })).toBeInTheDocument();
  });

  it("affiche le message vide quand aucun ingrédient", () => {
    setup([]);
    expect(screen.getByText(/aucun ingrédient/i)).toBeInTheDocument();
  });

  it("n'affiche pas le message vide quand des ingrédients existent", () => {
    setup([makeIngredient()]);
    expect(screen.queryByText(/aucun ingrédient/i)).not.toBeInTheDocument();
  });

  it("affiche le nom de chaque ingrédient existant", () => {
    setup([makeIngredient({ name: "Farine" }), makeIngredient({ name: "Sucre" })]);
    expect(screen.getByDisplayValue("Farine")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sucre")).toBeInTheDocument();
  });

  it("affiche la quantité de chaque ingrédient", () => {
    setup([makeIngredient({ name: "Farine", quantity: 250 })]);
    expect(screen.getByDisplayValue("250")).toBeInTheDocument();
  });

  it("affiche le bouton « Ajouter »", () => {
    setup([]);
    expect(screen.getByRole("button", { name: /ajouter/i })).toBeInTheDocument();
  });

  it("affiche un bouton de suppression par ingrédient", () => {
    setup([makeIngredient({ name: "A" }), makeIngredient({ name: "B" })]);
    expect(getDeleteButtons()).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────
// Ajout d'un ingrédient
// ──────────────────────────────────────────────────────────

describe("IngredientEditor — ajout", () => {
  it("appelle onChange avec un ingrédient par défaut quand la liste est vide", async () => {
    const user = userEvent.setup();
    const { onChange } = setup([]);
    await user.click(screen.getByRole("button", { name: /ajouter/i }));

    expect(onChange).toHaveBeenCalledOnce();
    const [ingredients] = onChange.mock.calls[0] as [Ingredient[]];
    expect(ingredients).toHaveLength(1);
    expect(ingredients[0]).toMatchObject({
      name: "",
      category: "Autre",
      quantity: 1,
      unit: "pièce",
    });
  });

  it("ajoute un ingrédient à la fin de la liste existante", async () => {
    const user = userEvent.setup();
    const existing = [makeIngredient({ name: "Farine" })];
    const { onChange } = setup(existing);
    await user.click(screen.getByRole("button", { name: /ajouter/i }));

    const [ingredients] = onChange.mock.calls[0] as [Ingredient[]];
    expect(ingredients).toHaveLength(2);
    expect(ingredients[0].name).toBe("Farine");
    expect(ingredients[1].name).toBe("");
  });
});

// ──────────────────────────────────────────────────────────
// Suppression d'un ingrédient
// ──────────────────────────────────────────────────────────

describe("IngredientEditor — suppression", () => {
  it("supprime l'ingrédient correspondant au bouton cliqué", async () => {
    const user = userEvent.setup();
    const ingredients = [
      makeIngredient({ name: "Farine" }),
      makeIngredient({ name: "Sucre" }),
    ];
    const { onChange } = setup(ingredients);

    const deleteButtons = getDeleteButtons();
    expect(deleteButtons).toHaveLength(2);
    await user.click(deleteButtons[0]); // supprime "Farine"

    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [Ingredient[]];
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sucre");
  });

  it("appelle onChange avec un tableau vide quand on supprime le seul ingrédient", async () => {
    const user = userEvent.setup();
    const { onChange } = setup([makeIngredient()]);

    const deleteButtons = getDeleteButtons();
    expect(deleteButtons).toHaveLength(1);
    await user.click(deleteButtons[0]);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("supprime le deuxième ingrédient sans toucher au premier", async () => {
    const user = userEvent.setup();
    const ingredients = [
      makeIngredient({ name: "Farine" }),
      makeIngredient({ name: "Sucre" }),
    ];
    const { onChange } = setup(ingredients);

    const deleteButtons = getDeleteButtons();
    await user.click(deleteButtons[1]); // supprime "Sucre"

    const [result] = onChange.mock.calls[0] as [Ingredient[]];
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Farine");
  });
});

// ──────────────────────────────────────────────────────────
// Édition du champ « nom »
// ──────────────────────────────────────────────────────────

describe("IngredientEditor — édition du nom", () => {
  it("appelle onChange avec le nouveau nom via fireEvent.change", () => {
    const { onChange } = setup([makeIngredient({ name: "Sel" })]);

    const nameInput = screen.getByDisplayValue("Sel");
    fireEvent.change(nameInput, { target: { value: "Poivre" } });

    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [Ingredient[]];
    expect(result[0].name).toBe("Poivre");
  });

  it("ne modifie pas les autres ingrédients lors de l'édition du nom", () => {
    const ingredients = [
      makeIngredient({ name: "Farine" }),
      makeIngredient({ name: "Sucre" }),
    ];
    const { onChange } = setup(ingredients);

    const nameInput = screen.getByDisplayValue("Farine");
    fireEvent.change(nameInput, { target: { value: "Beurre" } });

    const [result] = onChange.mock.calls[0] as [Ingredient[]];
    expect(result[0].name).toBe("Beurre");
    expect(result[1].name).toBe("Sucre");
  });
});

// ──────────────────────────────────────────────────────────
// Édition de la quantité
// ──────────────────────────────────────────────────────────

describe("IngredientEditor — édition de la quantité", () => {
  it("appelle onChange avec la quantité numérique mise à jour", () => {
    const { onChange } = setup([makeIngredient({ quantity: 1 })]);

    const qtyInput = screen.getByDisplayValue("1");
    fireEvent.change(qtyInput, { target: { value: "500" } });

    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [Ingredient[]];
    expect(result[0].quantity).toBe(500);
  });

  it("produit 0 si la valeur saisie n'est pas un nombre", () => {
    const { onChange } = setup([makeIngredient({ quantity: 5 })]);

    const qtyInput = screen.getByDisplayValue("5");
    fireEvent.change(qtyInput, { target: { value: "abc" } });

    // parseFloat("abc") → NaN → || 0
    const [result] = onChange.mock.calls[0] as [Ingredient[]];
    expect(result[0].quantity).toBe(0);
  });

  it("ne modifie pas le nom lors du changement de quantité", () => {
    const { onChange } = setup([makeIngredient({ name: "Farine", quantity: 200 })]);

    const qtyInput = screen.getByDisplayValue("200");
    fireEvent.change(qtyInput, { target: { value: "300" } });

    const [result] = onChange.mock.calls[0] as [Ingredient[]];
    expect(result[0].name).toBe("Farine");
    expect(result[0].quantity).toBe(300);
  });
});

// ──────────────────────────────────────────────────────────
// Sélection de l'unité via le Select shadcn
// ──────────────────────────────────────────────────────────

describe("IngredientEditor — sélection de l'unité", () => {
  it("affiche l'unité courante dans le sélecteur", () => {
    setup([makeIngredient({ unit: "kg" })]);
    // Le SelectTrigger affiche la valeur sélectionnée
    expect(screen.getByText("kg")).toBeInTheDocument();
  });

  it("appelle onChange avec la nouvelle unité choisie", async () => {
    const user = userEvent.setup();
    const { onChange } = setup([makeIngredient({ unit: "g" })]);

    // Ouvre le premier combobox (unité)
    const triggers = screen.getAllByRole("combobox");
    await user.click(triggers[0]); // ouvre le sélecteur d'unité

    // Choisit "kg"
    const option = await screen.findByRole("option", { name: "kg" });
    await user.click(option);

    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [Ingredient[]];
    expect(result[0].unit).toBe("kg");
  });

  it("affiche toutes les unités disponibles à l'ouverture du sélecteur", async () => {
    const user = userEvent.setup();
    setup([makeIngredient({ unit: "g" })]);

    const triggers = screen.getAllByRole("combobox");
    await user.click(triggers[0]);

    // Au moins "kg", "ml", "L" doivent être disponibles
    expect(await screen.findByRole("option", { name: "kg" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ml" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "L" })).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────
// Sélection de la catégorie via le Select shadcn
// ──────────────────────────────────────────────────────────

describe("IngredientEditor — sélection de la catégorie", () => {
  it("affiche la catégorie courante dans le sélecteur", () => {
    setup([makeIngredient({ category: "Légume" })]);
    expect(screen.getByText("Légume")).toBeInTheDocument();
  });

  it("appelle onChange avec la nouvelle catégorie choisie", async () => {
    const user = userEvent.setup();
    const { onChange } = setup([makeIngredient({ category: "Autre" })]);

    const triggers = screen.getAllByRole("combobox");
    // Le second combobox est le sélecteur de catégorie
    await user.click(triggers[1]);

    const option = await screen.findByRole("option", { name: "Fruit" });
    await user.click(option);

    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [Ingredient[]];
    expect(result[0].category).toBe("Fruit");
  });

  it("affiche « Autre » si category est undefined", () => {
    // La source utilise `ingredient.category || 'Autre'`
    const ingredient: Ingredient = { name: "X", quantity: 1, unit: "g" };
    setup([ingredient]);
    // Il doit y avoir au moins un "Autre" affiché (dans le trigger)
    expect(screen.getAllByText("Autre").length).toBeGreaterThanOrEqual(1);
  });

  it("affiche toutes les catégories disponibles à l'ouverture", async () => {
    const user = userEvent.setup();
    setup([makeIngredient({ category: "Autre" })]);

    const triggers = screen.getAllByRole("combobox");
    await user.click(triggers[1]);

    expect(await screen.findByRole("option", { name: "Légume" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Viande" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Épice" })).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────
// Interaction multi-ingrédients
// ──────────────────────────────────────────────────────────

describe("IngredientEditor — interactions multi-ingrédients", () => {
  it("édite le bon ingrédient quand plusieurs sont présents", () => {
    const ingredients = [
      makeIngredient({ name: "Farine", quantity: 200 }),
      makeIngredient({ name: "Sucre", quantity: 50 }),
    ];
    const { onChange } = setup(ingredients);

    // Modifie le nom de "Sucre"
    const sucreInput = screen.getByDisplayValue("Sucre");
    fireEvent.change(sucreInput, { target: { value: "Miel" } });

    const lastCall = onChange.mock.calls.at(-1) as [Ingredient[]];
    // Premier ingrédient inchangé
    expect(lastCall[0][0].name).toBe("Farine");
    // Second modifié
    expect(lastCall[0][1].name).toBe("Miel");
  });

  it("édite la quantité du premier ingrédient sans toucher au second", () => {
    const ingredients = [
      makeIngredient({ name: "Farine", quantity: 200 }),
      makeIngredient({ name: "Sucre", quantity: 50 }),
    ];
    const { onChange } = setup(ingredients);

    const farineQty = screen.getByDisplayValue("200");
    fireEvent.change(farineQty, { target: { value: "350" } });

    const [result] = onChange.mock.calls[0] as [Ingredient[]];
    expect(result[0].quantity).toBe(350);
    expect(result[1].quantity).toBe(50);
  });
});

// ──────────────────────────────────────────────────────────
// Accessibilité / placeholders
// ──────────────────────────────────────────────────────────

describe("IngredientEditor — placeholders", () => {
  it("affiche le placeholder « Nom » sur les champs nom", () => {
    setup([makeIngredient({ name: "" })]);
    expect(screen.getByPlaceholderText("Nom")).toBeInTheDocument();
  });

  it("affiche le placeholder « Qté » sur les champs quantité", () => {
    setup([makeIngredient()]);
    expect(screen.getByPlaceholderText("Qté")).toBeInTheDocument();
  });

  it("le composant est accessible sans erreur dans un conteneur avec plusieurs items", () => {
    // Vérifie simplement que le rendu ne lève pas d'exception
    expect(() =>
      setup([
        makeIngredient({ name: "A" }),
        makeIngredient({ name: "B" }),
        makeIngredient({ name: "C" }),
      ]),
    ).not.toThrow();
    expect(screen.getAllByPlaceholderText("Nom")).toHaveLength(3);
  });
});

// Cas ignoré — note explicative
// ──────────────────────────────────────────────────────────
// Le test "affiche l'unité initiale dans le trigger du Select quand la valeur n'est
// pas dans la liste" n'est pas implémenté car il nécessiterait de modifier le composant
// source (ajout d'un aria-label sur chaque SelectTrigger) pour distinguer de façon
// fiable le trigger « unité » du trigger « catégorie ». On contourne via l'ordre
// des combobox (triggers[0] = unité, triggers[1] = catégorie) dans les tests ci-dessus.
