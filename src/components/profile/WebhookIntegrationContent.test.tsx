import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const copyToClipboard = vi.fn();

vi.mock("@/hooks/useWebhookToken", () => ({
  useWebhookToken: () => ({
    webhookToken: "SECRET-TOKEN-123",
    isLoading: false,
    isGenerating: false,
    generateToken: vi.fn(),
    copyToClipboard,
  }),
}));

import { WebhookIntegrationContent } from "./WebhookIntegrationContent";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WebhookIntegrationContent — exposition du token", () => {
  it("n'affiche jamais le token en clair dans les exemples", async () => {
    const user = userEvent.setup();
    render(<WebhookIntegrationContent />);

    await user.click(screen.getByRole("button", { name: /exemples d'intégration/i }));

    // Le champ token est masqué (type=password) ; les exemples ne doivent pas
    // le trahir en clair (capture d'écran, partage d'écran).
    expect(document.body.textContent).not.toContain("SECRET-TOKEN-123");
    // Un placeholder est affiché à la place.
    expect(document.body.textContent).toContain("<votre-token>");
  });

  it("copie l'exemple cURL avec le vrai token (utilité préservée)", async () => {
    const user = userEvent.setup();
    render(<WebhookIntegrationContent />);

    await user.click(screen.getByRole("button", { name: /exemples d'intégration/i }));

    const curlPre = screen.getByText(/curl -X POST/);
    const copyBtn = curlPre.parentElement!.querySelector("button")!;
    await user.click(copyBtn);

    expect(copyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining("SECRET-TOKEN-123"),
    );
  });
});
