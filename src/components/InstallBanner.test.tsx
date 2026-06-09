import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { InstallBanner } from "./InstallBanner";

// --- mocks hoistés ---
const { mockInstallPrompt, mockIsMobile } = vi.hoisted(() => ({
  mockInstallPrompt: {
    current: {
      canInstall: false,
      isIosSafari: false,
      isStandalone: false,
      triggerInstall: vi.fn<() => Promise<void>>(),
    },
  },
  mockIsMobile: { current: true },
}));

vi.mock("@/hooks/useInstallPrompt", () => ({
  useInstallPrompt: () => mockInstallPrompt.current,
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockIsMobile.current,
}));

// Helpers pour réinitialiser l'état entre tests
const DISMISS_KEY = "install-banner-dismissed-until";

beforeEach(() => {
  localStorage.removeItem(DISMISS_KEY);
  mockIsMobile.current = true;
  mockInstallPrompt.current = {
    canInstall: false,
    isIosSafari: false,
    isStandalone: false,
    triggerInstall: vi.fn(),
  };
});

describe("InstallBanner", () => {
  describe("conditions de non-affichage", () => {
    it("n'affiche rien quand l'app est déjà installée (isStandalone)", () => {
      mockInstallPrompt.current.isStandalone = true;
      mockInstallPrompt.current.canInstall = true;
      const { container } = render(<InstallBanner />);
      expect(container.firstChild).toBeNull();
    });

    it("n'affiche rien quand l'appareil n'est pas mobile", () => {
      mockIsMobile.current = false;
      mockInstallPrompt.current.canInstall = true;
      const { container } = render(<InstallBanner />);
      expect(container.firstChild).toBeNull();
    });

    it("n'affiche rien quand canInstall et isIosSafari sont tous les deux false", () => {
      mockInstallPrompt.current.canInstall = false;
      mockInstallPrompt.current.isIosSafari = false;
      const { container } = render(<InstallBanner />);
      expect(container.firstChild).toBeNull();
    });

    it("n'affiche rien quand la bannière a déjà été dismissée (localStorage)", () => {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 1_000_000));
      mockInstallPrompt.current.canInstall = true;
      const { container } = render(<InstallBanner />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("variante Android/Chrome (canInstall = true)", () => {
    beforeEach(() => {
      mockInstallPrompt.current.canInstall = true;
    });

    it("affiche la bannière avec le bouton Installer", () => {
      render(<InstallBanner />);
      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Installer" })).toBeInTheDocument();
    });

    it("affiche le texte d'invitation à installer", () => {
      render(<InstallBanner />);
      expect(screen.getByText(/installer l'app pour un accès rapide/i)).toBeInTheDocument();
    });

    it("cliquer sur Installer appelle triggerInstall", async () => {
      const user = userEvent.setup();
      render(<InstallBanner />);
      await user.click(screen.getByRole("button", { name: "Installer" }));
      expect(mockInstallPrompt.current.triggerInstall).toHaveBeenCalledTimes(1);
    });

    it("cliquer sur Plus tard masque la bannière", async () => {
      const user = userEvent.setup();
      render(<InstallBanner />);
      await user.click(screen.getByRole("button", { name: /fermer la bannière/i }));
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    });

    it("cliquer sur Plus tard enregistre le dismiss dans localStorage", async () => {
      const user = userEvent.setup();
      render(<InstallBanner />);
      await user.click(screen.getByRole("button", { name: /fermer la bannière/i }));
      const stored = localStorage.getItem(DISMISS_KEY);
      expect(stored).not.toBeNull();
      expect(Number(stored)).toBeGreaterThan(Date.now());
    });
  });

  describe("variante iOS Safari (isIosSafari = true)", () => {
    beforeEach(() => {
      mockInstallPrompt.current.isIosSafari = true;
    });

    it("affiche la bannière avec les instructions iOS", () => {
      render(<InstallBanner />);
      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByText(/ajouter à l'écran d'accueil/i)).toBeInTheDocument();
    });

    it("n'affiche pas le bouton Installer (iOS utilise le partage natif)", () => {
      render(<InstallBanner />);
      expect(screen.queryByRole("button", { name: "Installer" })).not.toBeInTheDocument();
    });

    it("affiche le bouton Plus tard", () => {
      render(<InstallBanner />);
      expect(screen.getByRole("button", { name: /fermer la bannière/i })).toBeInTheDocument();
    });

    it("cliquer sur Plus tard masque la bannière iOS", async () => {
      const user = userEvent.setup();
      render(<InstallBanner />);
      await user.click(screen.getByRole("button", { name: /fermer la bannière/i }));
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    });
  });
});
