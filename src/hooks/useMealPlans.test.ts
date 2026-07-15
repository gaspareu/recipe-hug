import { renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { createQueryWrapper, createTestQueryClient } from "@/test/query-client";
import { createSupabaseMock, type SupabaseMockOptions } from "@/test/supabase-mock";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { from: vi.fn(), auth: { getUser: vi.fn(), getSession: vi.fn() } },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import { useMealPlans, useAddMealPlan, useDeleteMealPlan } from "./useMealPlans";

function installSupabase(options: SupabaseMockOptions = {}) {
  const sb = createSupabaseMock(options);
  mockSupabase.from = sb.from;
  mockSupabase.auth = sb.auth;
  return sb;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useMealPlans", () => {
  it("associe le titre de recette à chaque repas lié", async () => {
    installSupabase({
      resultsByTable: {
        meal_plans: {
          data: [
            { id: "m1", day_of_week: 0, meal_type: "dinner", recipe_id: "r1", custom_meal: null, notes: null },
            { id: "m2", day_of_week: 1, meal_type: "lunch", recipe_id: null, custom_meal: "Pizza", notes: null },
          ],
          error: null,
        },
        recipes: { data: [{ id: "r1", title: "Tarte", ingredients: [] }], error: null },
      },
    });
    const { result } = renderHook(() => useMealPlans("2026-01-05"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.entries[0].recipe_title).toBe("Tarte");
    expect(result.current.data?.entries[1].recipe_title).toBeUndefined();
    expect(result.current.data?.recipesMap["r1"].title).toBe("Tarte");
  });
});

describe("useAddMealPlan", () => {
  it("insère le repas de l'utilisateur et invalide la semaine", async () => {
    const sb = installSupabase({ user: { id: "u1" }, result: { data: null, error: null } });
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAddMealPlan(), {
      wrapper: createQueryWrapper(client),
    });

    await result.current.mutateAsync({
      weekStart: "2026-01-05",
      dayIndex: 2,
      mealType: "dinner",
      recipeId: "r1",
      customMeal: null,
    });

    const builder = sb.from.mock.results[0].value;
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({ user_id: "u1", week_start: "2026-01-05", day_of_week: 2, recipe_id: "r1" }),
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["meal_plans", "2026-01-05"] });
  });

  it("échoue sans utilisateur authentifié", async () => {
    installSupabase({ user: null });
    const { result } = renderHook(() => useAddMealPlan(), { wrapper: createQueryWrapper() });
    await expect(
      result.current.mutateAsync({
        weekStart: "2026-01-05", dayIndex: 0, mealType: "lunch", recipeId: null, customMeal: "X",
      }),
    ).rejects.toThrow(/authentifié/i);
  });
});

describe("useDeleteMealPlan", () => {
  it("supprime le repas par identifiant", async () => {
    const sb = installSupabase({ result: { data: null, error: null } });
    const { result } = renderHook(() => useDeleteMealPlan(), { wrapper: createQueryWrapper() });

    await result.current.mutateAsync("m1");

    const builder = sb.from.mock.results[0].value;
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("id", "m1");
  });

  it("propage une erreur de suppression", async () => {
    installSupabase({ result: { data: null, error: { message: "boom" } } });
    const { result } = renderHook(() => useDeleteMealPlan(), { wrapper: createQueryWrapper() });
    await expect(result.current.mutateAsync("m1")).rejects.toMatchObject({ message: "boom" });
  });
});
