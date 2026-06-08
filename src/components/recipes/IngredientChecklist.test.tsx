import { renderHook, act } from "@testing-library/react";
import type { Ingredient } from "@/types/recipe";
import { useIngredientChecklist } from "./IngredientChecklist";

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
