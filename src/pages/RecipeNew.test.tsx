import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import RecipeNew from "./RecipeNew";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}));

vi.mock("@/hooks/useRecipes", () => ({
  useCreateRecipe: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn(), getUser: vi.fn() },
    storage: { from: vi.fn() },
  },
}));

describe("RecipeNew", () => {
  it("affiche les sections repliables en mode manuel", () => {
    render(
      <MemoryRouter>
        <RecipeNew />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Saisir manuellement"));

    expect(screen.getByText("Informations générales")).toBeInTheDocument();
    expect(screen.getByText("Ingrédients")).toBeInTheDocument();
    expect(screen.getByText("Étapes")).toBeInTheDocument();
    expect(screen.getByLabelText(/Titre/)).toBeInTheDocument();
  });
});
