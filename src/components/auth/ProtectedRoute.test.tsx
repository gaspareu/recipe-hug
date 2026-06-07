import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { user: null as { id: string } | null, loading: false },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuth }));

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>Contenu protégé</div>
            </ProtectedRoute>
          }
        />
        <Route path="/auth" element={<div>Page de connexion</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockAuth.user = null;
  mockAuth.loading = false;
});

describe("ProtectedRoute", () => {
  it("affiche un indicateur de chargement tant que l'auth se résout", () => {
    mockAuth.loading = true;
    const { container } = renderProtected();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Contenu protégé")).not.toBeInTheDocument();
  });

  it("redirige vers /auth quand aucun utilisateur n'est connecté", () => {
    mockAuth.user = null;
    renderProtected();
    expect(screen.getByText("Page de connexion")).toBeInTheDocument();
    expect(screen.queryByText("Contenu protégé")).not.toBeInTheDocument();
  });

  it("rend les enfants quand l'utilisateur est authentifié", () => {
    mockAuth.user = { id: "u1" };
    renderProtected();
    expect(screen.getByText("Contenu protégé")).toBeInTheDocument();
    expect(screen.queryByText("Page de connexion")).not.toBeInTheDocument();
  });
});
