import { renderHook, act, render, screen } from "@testing-library/react";
import type { Ingredient } from "@/types/recipe";
import { useIngredientChecklist, IngredientChecklist } from "./IngredientChecklist";

const INGREDIENTS: Ingredient[] = [
  { name: "Sel", quantity: 1, unit: "pincée", category: "Épicerie" },
  { name: "Poivre", quantity: 1, unit: "pincée", category: "Épicerie" },
];

beforeEach(() => {
  sessionStorage.clear();
});

describe("useIngredientChecklist", () => {
  it("aucun ingrédient coché au départ", () => {
    const { result } = renderHook(() => useIngredientChecklist(INGREDIENTS, "r1"));
    expect(result.current.isChecked("0-Sel")).toBe(false);
    expect(result.current.allChecked).toBe(false);
  });

  it("toggleChecked coche puis décoche un ingrédient", () => {
    const { result } = renderHook(() => useIngredientChecklist(INGREDIENTS, "r1"));

    act(() => result.current.toggleChecked("0-Sel"));
    expect(result.current.isChecked("0-Sel")).toBe(true);

    act(() => result.current.toggleChecked("0-Sel"));
    expect(result.current.isChecked("0-Sel")).toBe(false);
  });

  it("checkAll coche tout et met allChecked à true", () => {
    const { result } = renderHook(() => useIngredientChecklist(INGREDIENTS, "r1"));

    act(() => result.current.checkAll());
    expect(result.current.isChecked("0-Sel")).toBe(true);
    expect(result.current.isChecked("1-Poivre")).toBe(true);
    expect(result.current.allChecked).toBe(true);
  });

  it("uncheckAll réinitialise l'état", () => {
    const { result } = renderHook(() => useIngredientChecklist(INGREDIENTS, "r1"));

    act(() => result.current.checkAll());
    act(() => result.current.uncheckAll());
    expect(result.current.allChecked).toBe(false);
    expect(result.current.isChecked("0-Sel")).toBe(false);
  });

  it("allChecked vaut false quand la liste est vide", () => {
    const { result } = renderHook(() => useIngredientChecklist([], "r1"));
    expect(result.current.allChecked).toBe(false);
  });

  it("persiste l'état dans sessionStorage sous la clé de la recette", () => {
    const { result } = renderHook(() => useIngredientChecklist(INGREDIENTS, "r1"));

    act(() => result.current.toggleChecked("0-Sel"));

    const stored = JSON.parse(sessionStorage.getItem("recipe-r1-checklist") || "{}");
    expect(stored["0-Sel"]).toBe(true);
  });

  it("recharge l'état initial depuis sessionStorage", () => {
    sessionStorage.setItem("recipe-r1-checklist", JSON.stringify({ "0-Sel": true }));
    const { result } = renderHook(() => useIngredientChecklist(INGREDIENTS, "r1"));
    expect(result.current.isChecked("0-Sel")).toBe(true);
  });

  it("ne persiste rien sans recipeId", () => {
    const { result } = renderHook(() => useIngredientChecklist(INGREDIENTS));

    act(() => result.current.toggleChecked("0-Sel"));

    expect(result.current.isChecked("0-Sel")).toBe(true);
    expect(sessionStorage.length).toBe(0);
  });
});

describe("IngredientChecklist — affichage des quantités", () => {
  it("n'affiche pas '0' quand la quantité vaut 0", () => {
    const ingredients: Ingredient[] = [
      { name: "Poivre noir", quantity: 0, unit: "", category: "Épicerie" },
    ];
    render(<IngredientChecklist ingredients={ingredients} />);
    expect(screen.getByText("Poivre noir")).toBeInTheDocument();
    expect(screen.queryByText(/^0/)).toBeNull();
  });

  it("affiche la quantité quand elle est non nulle", () => {
    const ingredients: Ingredient[] = [
      { name: "Œufs", quantity: 4, unit: "", category: "Frais" },
    ];
    render(<IngredientChecklist ingredients={ingredients} />);
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Œufs")).toBeInTheDocument();
  });

  it("n'affiche pas 'null' quand la quantité vaut null", () => {
    const ingredients: Ingredient[] = [
      { name: "Sel", quantity: null as unknown as number, unit: "g", category: "Épicerie" },
    ];
    render(<IngredientChecklist ingredients={ingredients} />);
    expect(screen.getByText("Sel")).toBeInTheDocument();
    expect(screen.queryByText(/null/)).toBeNull();
  });
});
