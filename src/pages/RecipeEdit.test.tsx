import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { vi } from "vitest";
import RecipeEdit from "./RecipeEdit";
import type { Recipe } from "@/types/recipe";

const mockRecipe: Recipe = {
  id: "r1",
  title: "Tarte aux pommes",
  status: "draft",
  servings: 4,
  ingredients: [],
  steps: [],
  nutrition_tags: null,
  season: null,
  source_type: "manual",
  source_image_url: null,
  is_favorite: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  user_id: "u1",
} as unknown as Recipe;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}));

vi.mock("@/hooks/useRecipes", () => ({
  useRecipe: () => ({ data: mockRecipe, isLoading: false }),
  useUpdateRecipe: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRecipe: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn(), getUser: vi.fn() },
    storage: { from: vi.fn() },
  },
}));

describe("RecipeEdit", () => {
  it("affiche les sections repliables avec les données de la recette", () => {
    const router = createMemoryRouter(
      [{ path: "/recipes/:id/edit", element: <RecipeEdit /> }],
      { initialEntries: ["/recipes/r1/edit"] }
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByText("Informations générales")).toBeInTheDocument();
    expect(screen.getByText("Ingrédients")).toBeInTheDocument();
    expect(screen.getByText("Étapes")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Tarte aux pommes")).toBeInTheDocument();
  });
});
