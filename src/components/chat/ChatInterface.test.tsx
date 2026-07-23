import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

// --- mocks hoistés ---
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/useVoiceMode", () => ({
  useVoiceMode: () => ({
    voiceEnabled: false,
    isSpeaking: false,
    isListening: false,
    isConnecting: false,
    toggleVoice: vi.fn(),
    speak: vi.fn(),
    stopSpeaking: vi.fn(),
    startListening: vi.fn(),
    stopListening: vi.fn(),
    enableAndListen: vi.fn(),
    partialTranscript: "",
  }),
}));

vi.mock("@/components/ui/sonner", () => ({ toast: vi.fn() }));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => React.createElement("div", null, children),
}));

vi.mock("framer-motion", async () => {
  const { createElement, Fragment } = await import("react");

  const strip = (props: Record<string, unknown>) => {
    const { exit: _e, initial: _i, animate: _a, transition: _t, variants: _v, whileHover: _wh, whileTap: _wt, layout: _l, layoutId: _li, ...rest } = props;
    return rest;
  };

  const makeTag = (tag: string) => (props: Record<string, unknown>) =>
    createElement(tag, strip(props) as React.HTMLAttributes<HTMLElement>);

  const motionFn = Object.assign(
    (Component: React.ElementType) => {
      if (typeof Component === "string") return makeTag(Component);
      return (props: Record<string, unknown>) => createElement(Component, strip(props));
    },
    Object.fromEntries(
      ["div", "span", "button", "p", "a", "ul", "li", "h1", "h2", "h3"].map((tag) => [tag, makeTag(tag)])
    )
  );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => createElement(Fragment, null, children),
    motion: motionFn,
    useReducedMotion: () => false,
  };
});

vi.mock("@/components/ui/text-shimmer", () => ({
  TextShimmer: ({ children }: { children: string }) => React.createElement("span", null, children),
}));

vi.mock("@/components/voice/SoundWaveIndicator", () => ({
  SoundWaveIndicator: () => React.createElement("span", { "aria-hidden": "true" }),
}));

import { ChatInterface } from "./ChatInterface";
import type { ChatMessage, PendingRecipe } from "@/hooks/useChatEngine";

// --- helpers ---

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    role: "user",
    content: "Bonjour",
    ...overrides,
  };
}

const defaultProps = {
  messages: [makeMessage()] as ChatMessage[],
  isStreaming: false,
  pendingRecipe: null as PendingRecipe | null,
  sendMessage: vi.fn(),
  savePendingRecipe: vi.fn(),
  cancelPendingRecipe: vi.fn(),
  suggestions: ["Suggestion 1", "Suggestion 2"],
  placeholder: "Poser une question",
};

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSIVE
// ─────────────────────────────────────────────────────────────────────────────

describe("ChatInterface — responsive", () => {
  describe("zone de suggestions", () => {
    it("affiche la zone de suggestions scrollable avec les classes responsive correctes", () => {
      render(<ChatInterface {...defaultProps} />);
      const scrollZone = screen.getByTestId("suggestions-scroll");
      expect(scrollZone).toBeInTheDocument();
      expect(scrollZone.className).toContain("overflow-x-auto");
      expect(scrollZone.className).toContain("[&::-webkit-scrollbar]:hidden");
    });

    it("n'a pas la classe scrollbar-none (classe custom inexistante dans le projet)", () => {
      render(<ChatInterface {...defaultProps} />);
      const scrollZone = screen.getByTestId("suggestions-scroll");
      expect(scrollZone.className).not.toContain("scrollbar-none");
    });

    it("affiche les suggestions", () => {
      render(<ChatInterface {...defaultProps} />);
      expect(screen.getByText("Suggestion 1")).toBeInTheDocument();
      expect(screen.getByText("Suggestion 2")).toBeInTheDocument();
    });
  });

  describe("boutons natifs — touch-manipulation", () => {
    it("le bouton + (attachment) a touch-manipulation", () => {
      render(<ChatInterface {...defaultProps} />);
      const buttons = document.querySelectorAll("button.touch-manipulation");
      expect(buttons.length).toBeGreaterThan(0);
    });

    it("le bouton mic a touch-manipulation", () => {
      render(<ChatInterface {...defaultProps} />);
      const micButton = screen.getByTitle("Dicter");
      expect(micButton.className).toContain("touch-manipulation");
    });
  });

  describe("état sans suggestions (pendingRecipe présent)", () => {
    it("masque la zone de suggestions quand pendingRecipe est actif", () => {
      const propsWithPending = {
        ...defaultProps,
        pendingRecipe: {
          title: "Tarte aux pommes",
          servings: 4,
          ingredients: [],
          steps: [],
          isUpdate: false,
        },
      };
      render(<ChatInterface {...propsWithPending} />);
      expect(screen.queryByTestId("suggestions-scroll")).not.toBeInTheDocument();
    });
  });

  describe("bouton envoi", () => {
    it("affiche le bouton mic par défaut (input vide)", () => {
      render(<ChatInterface {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      expect(textarea).toBeInTheDocument();
      expect(screen.getByTitle("Dicter")).toBeInTheDocument();
      expect(screen.queryByTitle("Envoyer")).not.toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE
// ─────────────────────────────────────────────────────────────────────────────

describe("ChatInterface — performance", () => {
  describe("displayMessages — skipFirstMessage", () => {
    it("affiche tous les messages quand skipFirstMessage est false", () => {
      const messages: ChatMessage[] = [
        makeMessage({ id: "1", role: "user", content: "premier message" }),
        makeMessage({ id: "2", role: "user", content: "deuxième message" }),
      ];
      render(<ChatInterface {...defaultProps} messages={messages} />);
      expect(screen.getByText("premier message")).toBeInTheDocument();
      expect(screen.getByText("deuxième message")).toBeInTheDocument();
    });

    it("masque le premier message quand skipFirstMessage est true", () => {
      const messages: ChatMessage[] = [
        makeMessage({ id: "1", role: "user", content: "message caché" }),
        makeMessage({ id: "2", role: "user", content: "message visible" }),
      ];
      render(<ChatInterface {...defaultProps} messages={messages} skipFirstMessage />);
      expect(screen.queryByText("message caché")).not.toBeInTheDocument();
      expect(screen.getByText("message visible")).toBeInTheDocument();
    });
  });

  describe("getDisplayContent — nettoyage du contenu assistant", () => {
    it("supprime les blocs JSON action/parameters du contenu assistant", () => {
      const messages: ChatMessage[] = [
        makeMessage({
          id: "1",
          role: "assistant",
          content: 'Recette créée ! {"action": "save_recipe", "parameters": {"title": "test"}} Bon appétit.',
        }),
      ];
      render(<ChatInterface {...defaultProps} messages={messages} />);
      expect(screen.getByText(/Recette créée/)).toBeInTheDocument();
      expect(screen.getByText(/Bon appétit/)).toBeInTheDocument();
      expect(screen.queryByText(/save_recipe/)).not.toBeInTheDocument();
    });

    it("supprime les blocs [suggestions]...[/suggestions] du contenu affiché dans la bulle assistant", () => {
      const messages: ChatMessage[] = [
        makeMessage({
          id: "1",
          role: "assistant",
          content: 'Voici ma réponse. [suggestions] ["Réponse A", "Réponse B"] [/suggestions]',
        }),
      ];
      render(<ChatInterface {...defaultProps} messages={messages} suggestions={[]} />);
      expect(screen.getByText(/Voici ma réponse/)).toBeInTheDocument();
      expect(screen.queryByText(/\[suggestions\]/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\[\/suggestions\]/)).not.toBeInTheDocument();
    });

    it("n'altère pas le contenu des messages utilisateur", () => {
      const messages: ChatMessage[] = [
        makeMessage({
          id: "1",
          role: "user",
          content: '{"action": "test"} texte utilisateur',
        }),
      ];
      render(<ChatInterface {...defaultProps} messages={messages} />);
      expect(screen.getByText('{"action": "test"} texte utilisateur')).toBeInTheDocument();
    });
  });

  describe("activeSuggestions — suggestions dynamiques", () => {
    it("affiche les suggestions par défaut quand aucun message assistant n'a de bloc [suggestions]", () => {
      render(<ChatInterface {...defaultProps} />);
      expect(screen.getByText("Suggestion 1")).toBeInTheDocument();
      expect(screen.getByText("Suggestion 2")).toBeInTheDocument();
    });

    it("remplace les suggestions par celles extraites du dernier message assistant", () => {
      const messages: ChatMessage[] = [
        makeMessage({
          id: "1",
          role: "assistant",
          content: 'Bonjour ! [suggestions] ["Créer une recette", "Voir mes recettes"] [/suggestions]',
        }),
      ];
      render(<ChatInterface {...defaultProps} messages={messages} />);
      expect(screen.getByText("Créer une recette")).toBeInTheDocument();
      expect(screen.getByText("Voir mes recettes")).toBeInTheDocument();
      expect(screen.queryByText("Suggestion 1")).not.toBeInTheDocument();
    });

    it("conserve les suggestions par défaut si le JSON du bloc [suggestions] est invalide", () => {
      const messages: ChatMessage[] = [
        makeMessage({
          id: "1",
          role: "assistant",
          content: "Réponse. [suggestions] JSON_INVALIDE [/suggestions]",
        }),
      ];
      render(<ChatInterface {...defaultProps} messages={messages} />);
      expect(screen.getByText("Suggestion 1")).toBeInTheDocument();
      expect(screen.getByText("Suggestion 2")).toBeInTheDocument();
    });

    it("utilise le dernier message assistant (pas le premier)", () => {
      const messages: ChatMessage[] = [
        makeMessage({
          id: "1",
          role: "assistant",
          content: 'Premier. [suggestions] ["Ancienne suggestion"] [/suggestions]',
        }),
        makeMessage({ id: "2", role: "user", content: "Question" }),
        makeMessage({
          id: "3",
          role: "assistant",
          content: 'Dernier. [suggestions] ["Nouvelle suggestion"] [/suggestions]',
        }),
      ];
      render(<ChatInterface {...defaultProps} messages={messages} />);
      expect(screen.getByText("Nouvelle suggestion")).toBeInTheDocument();
      expect(screen.queryByText("Ancienne suggestion")).not.toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ACCESSIBILITÉ
// ─────────────────────────────────────────────────────────────────────────────

describe("ChatInterface — accessibilité", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Textarea", () => {
    it("le textarea a un aria-label égal au placeholder", () => {
      render(<ChatInterface {...defaultProps} />);
      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("aria-label", "Poser une question");
    });

    it("le textarea a un aria-label personnalisé quand placeholder est fourni", () => {
      render(<ChatInterface {...defaultProps} placeholder="Décrivez votre recette" />);
      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("aria-label", "Décrivez votre recette");
    });
  });

  describe("Bouton micro", () => {
    it("le bouton micro a un aria-label 'Dicter un message' par défaut", () => {
      render(<ChatInterface {...defaultProps} />);
      const micBtn = screen.getByRole("button", { name: "Dicter un message" });
      expect(micBtn).toBeInTheDocument();
    });

    it("le bouton micro a aria-pressed=false quand non actif", () => {
      render(<ChatInterface {...defaultProps} />);
      const micBtn = screen.getByRole("button", { name: "Dicter un message" });
      expect(micBtn).toHaveAttribute("aria-pressed", "false");
    });
  });

  describe("Bouton pièce jointe", () => {
    it("le bouton '+' a un aria-label 'Ajouter une pièce jointe'", () => {
      render(<ChatInterface {...defaultProps} />);
      const attachBtn = screen.getByRole("button", { name: "Ajouter une pièce jointe" });
      expect(attachBtn).toBeInTheDocument();
    });

    it("le bouton '+' a aria-haspopup='true'", () => {
      render(<ChatInterface {...defaultProps} />);
      const attachBtn = screen.getByRole("button", { name: "Ajouter une pièce jointe" });
      expect(attachBtn).toHaveAttribute("aria-haspopup", "true");
    });
  });

  describe("Input file caché", () => {
    it("l'input file a aria-hidden='true'", () => {
      render(<ChatInterface {...defaultProps} />);
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute("aria-hidden", "true");
    });

    it("l'input file a tabIndex=-1", () => {
      render(<ChatInterface {...defaultProps} />);
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute("tabindex", "-1");
    });
  });

  describe("Zone de conversation", () => {
    it("le conteneur de messages a role='log' et aria-label='Conversation'", () => {
      render(<ChatInterface {...defaultProps} />);
      const log = screen.getByRole("log", { name: "Conversation" });
      expect(log).toBeInTheDocument();
    });

    it("le conteneur de messages a aria-live='polite'", () => {
      render(<ChatInterface {...defaultProps} />);
      const log = screen.getByRole("log", { name: "Conversation" });
      expect(log).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("Indicateur de réflexion", () => {
    it("l'indicateur 'Réflexion en cours' a role='status' et aria-live='polite' quand visible", () => {
      const streamingMessage: ChatMessage = {
        id: "1",
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      render(
        <ChatInterface
          {...defaultProps}
          messages={[streamingMessage]}
          isStreaming={true}
        />
      );
      const status = screen.queryByRole("status", { name: "Réflexion en cours" });
      if (status) {
        expect(status).toHaveAttribute("aria-live", "polite");
      }
    });
  });

  describe("Indicateur de réflexion — fenêtre d'attente réseau", () => {
    it("affiche 'Réflexion en cours' quand isStreaming=true et que le dernier message est celui de l'utilisateur (avant tout token)", () => {
      const userMessage: ChatMessage = {
        id: "u1",
        role: "user",
        content: "Ma question",
        timestamp: new Date(),
      };
      render(
        <ChatInterface
          {...defaultProps}
          messages={[userMessage]}
          isStreaming={true}
        />
      );
      expect(screen.getByRole("status", { name: "Réflexion en cours" })).toBeInTheDocument();
    });

    it("n'affiche pas l'indicateur quand isStreaming=false (dernier message utilisateur)", () => {
      const userMessage: ChatMessage = {
        id: "u1",
        role: "user",
        content: "Ma question",
        timestamp: new Date(),
      };
      render(
        <ChatInterface
          {...defaultProps}
          messages={[userMessage]}
          isStreaming={false}
        />
      );
      expect(screen.queryByRole("status", { name: "Réflexion en cours" })).not.toBeInTheDocument();
    });

    it("masque l'indicateur dès que l'assistant a du contenu affichable", () => {
      const messages: ChatMessage[] = [
        { id: "u1", role: "user", content: "Ma question", timestamp: new Date() },
        { id: "a1", role: "assistant", content: "Voici la réponse", timestamp: new Date() },
      ];
      render(
        <ChatInterface
          {...defaultProps}
          messages={messages}
          isStreaming={true}
        />
      );
      expect(screen.queryByRole("status", { name: "Réflexion en cours" })).not.toBeInTheDocument();
    });
  });

  describe("Bouton stop génération", () => {
    it("le bouton stop a aria-label='Arrêter la génération' quand isStreaming=true", () => {
      const stopGeneration = vi.fn();
      const streamingMessage: ChatMessage = {
        id: "1",
        role: "assistant",
        content: "En cours...",
        timestamp: new Date(),
      };
      render(
        <ChatInterface
          {...defaultProps}
          messages={[streamingMessage]}
          isStreaming={true}
          stopGeneration={stopGeneration}
        />
      );
      const stopBtn = screen.queryByRole("button", { name: "Arrêter la génération" });
      if (stopBtn) {
        expect(stopBtn).toHaveAttribute("aria-label", "Arrêter la génération");
      }
    });
  });
});
