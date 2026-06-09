import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { OfflineBanner } from "./OfflineBanner";

const { mockIsOnline } = vi.hoisted(() => ({
  mockIsOnline: { current: true },
}));

vi.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => mockIsOnline.current,
}));

beforeEach(() => {
  mockIsOnline.current = true;
});

describe("OfflineBanner", () => {
  it("n'affiche rien quand l'utilisateur est en ligne", () => {
    mockIsOnline.current = true;
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("affiche la bannière quand l'utilisateur est hors ligne", () => {
    mockIsOnline.current = false;
    render(<OfflineBanner />);
    expect(
      screen.getByText(/vous êtes hors ligne/i),
    ).toBeInTheDocument();
  });

  it("utilise le rôle status pour l'accessibilité", () => {
    mockIsOnline.current = false;
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("a l'attribut aria-live polite", () => {
    mockIsOnline.current = false;
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("mentionne que certaines fonctionnalités sont indisponibles", () => {
    mockIsOnline.current = false;
    render(<OfflineBanner />);
    expect(
      screen.getByText(/certaines fonctionnalités sont indisponibles/i),
    ).toBeInTheDocument();
  });
});
