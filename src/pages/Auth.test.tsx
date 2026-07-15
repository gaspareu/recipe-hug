import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import Auth from "./Auth";

const signIn = vi.fn();
const signUp = vi.fn();
const resetPassword = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signIn,
    signUp,
    resetPassword,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signInWithOAuth: vi.fn().mockResolvedValue({ error: null }) },
  },
}));

function renderAuth() {
  return render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Auth — affichage des erreurs", () => {
  it("affiche un message quand la connexion échoue (identifiants invalides)", async () => {
    signIn.mockResolvedValue({ error: new Error("Invalid login credentials") });
    renderAuth();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /se connecter/i }));

    expect(
      await screen.findByText("Email ou mot de passe incorrect"),
    ).toBeInTheDocument();
  });

  it("affiche un message quand l'inscription échoue (compte existant)", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ error: new Error("User already registered") });
    renderAuth();

    await user.click(screen.getByRole("tab", { name: /inscription/i }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /créer un compte/i }));

    expect(
      await screen.findByText("Un compte existe déjà avec cet email"),
    ).toBeInTheDocument();
  });

  it("affiche un message quand la réinitialisation échoue", async () => {
    resetPassword.mockResolvedValue({
      error: new Error("too many requests"),
    });
    renderAuth();

    fireEvent.click(screen.getByRole("button", { name: /mot de passe oublié/i }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /envoyer le lien/i }));

    expect(
      await screen.findByText(/trop de demandes/i),
    ).toBeInTheDocument();
  });

  it("n'affiche aucune erreur au rendu initial", () => {
    renderAuth();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
