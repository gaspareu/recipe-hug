import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import {
  contentEvent,
  toolCallEvent,
  toSSEPayload,
  sseResponse,
  responseFromChunks,
  httpErrorResponse,
} from "@/test/sse";

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: { auth: { getSession: vi.fn() } },
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));

import { useChatEngine, type ChatEngineConfig, type ChatMessage } from "./useChatEngine";

const SESSION = { access_token: "tok", user: { id: "u1" } };

const fetchMock = vi.fn();

function lastMessage(messages: ChatMessage[]): ChatMessage {
  return messages[messages.length - 1];
}

function setup(overrides: Partial<ChatEngineConfig> = {}) {
  const onToolCall = vi.fn().mockResolvedValue(null);
  const buildRequest = vi.fn().mockResolvedValue({
    endpoint: "https://edge.test/home-assistant",
    body: { marker: true },
  });
  const hook = renderHook(() =>
    useChatEngine({
      welcomeMessage: "Bienvenue !",
      initialActiveRecipe: null,
      onToolCall,
      buildRequest,
      ...overrides,
    }),
  );
  return { ...hook, onToolCall, buildRequest };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
  vi.stubGlobal("fetch", fetchMock);
});

// ---------------------------------------------------------------------------
// État initial
// ---------------------------------------------------------------------------
describe("useChatEngine — état initial", () => {
  it("démarre avec le message d'accueil et sans streaming", () => {
    const { result } = setup();
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      id: "welcome",
      role: "assistant",
      content: "Bienvenue !",
    });
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.pendingRecipe).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sendMessage — streaming de contenu
// ---------------------------------------------------------------------------
describe("sendMessage — streaming", () => {
  it("ajoute le message utilisateur puis le contenu streamé de l'assistant", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([contentEvent("Bon"), contentEvent("jour !")]),
    );
    const { result } = setup();

    await act(() => result.current.sendMessage("Salut"));

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[1]).toMatchObject({ role: "user", content: "Salut" });
    expect(result.current.messages[2]).toMatchObject({ role: "assistant", content: "Bonjour !" });
    expect(result.current.isStreaming).toBe(false);
  });

  it("envoie la requête construite par buildRequest avec le token de session", async () => {
    fetchMock.mockResolvedValue(sseResponse([contentEvent("Ok")]));
    const { result, buildRequest } = setup();

    await act(() => result.current.sendMessage("Salut"));

    expect(buildRequest).toHaveBeenCalledWith({
      apiMessages: [{ role: "user", content: "Salut" }],
      activeRecipe: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://edge.test/home-assistant",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: JSON.stringify({ marker: true }),
      }),
    );
  });

  it("transmet l'historique (sans le message d'accueil) à buildRequest", async () => {
    fetchMock.mockResolvedValue(sseResponse([contentEvent("Réponse 1")]));
    const { result, buildRequest } = setup();

    await act(() => result.current.sendMessage("Question 1"));
    fetchMock.mockResolvedValue(sseResponse([contentEvent("Réponse 2")]));
    await act(() => result.current.sendMessage("Question 2"));

    const { apiMessages } = buildRequest.mock.calls[1][0];
    expect(apiMessages).toEqual([
      { role: "user", content: "Question 1" },
      { role: "assistant", content: "Réponse 1" },
      { role: "user", content: "Question 2" },
    ]);
  });

  it("encode une image en partie image_url dans les messages API", async () => {
    fetchMock.mockResolvedValue(sseResponse([contentEvent("Belle photo !")]));
    const { result, buildRequest } = setup();

    await act(() => result.current.sendMessage("", "data:image/png;base64,xyz"));

    expect(result.current.messages[1]).toMatchObject({ content: "📷 Image envoyée" });
    const { apiMessages } = buildRequest.mock.calls[0][0];
    expect(apiMessages[0].content).toEqual([
      { type: "image_url", image_url: { url: "data:image/png;base64,xyz" } },
    ]);
  });

  it("reconstitue les lignes SSE coupées entre deux chunks", async () => {
    const payload = toSSEPayload([contentEvent("Bonjour"), contentEvent(" Chef !")]);
    const mid = Math.floor(payload.length / 2);
    fetchMock.mockResolvedValue(
      responseFromChunks([payload.slice(0, mid), payload.slice(mid)]),
    );
    const { result } = setup();

    await act(() => result.current.sendMessage("Salut"));

    expect(result.current.messages[2]).toMatchObject({ content: "Bonjour Chef !" });
  });

  it("n'envoie rien si le contenu est vide", async () => {
    const { result } = setup();
    await act(() => result.current.sendMessage("   "));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(1);
  });

  it("n'appelle pas le réseau sans session authentifiée", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { result } = setup();

    await act(() => result.current.sendMessage("Salut"));

    expect(fetchMock).not.toHaveBeenCalled();
    // welcome + user + message d'erreur affiché dans le fil
    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[2].content).toBe("⚠️ Vous devez être connecté");
    expect(result.current.isStreaming).toBe(false);
  });

  it("affiche l'erreur dans le fil en cas d'erreur HTTP", async () => {
    fetchMock.mockResolvedValue(httpErrorResponse(500, { error: "boom" }));
    const { result } = setup();

    await act(() => result.current.sendMessage("Salut"));

    expect(result.current.messages.map((m) => m.role)).toEqual(["assistant", "user", "assistant"]);
    expect(result.current.messages[2].content).toBe("⚠️ boom");
    expect(result.current.isStreaming).toBe(false);
  });

  it("affiche un message générique si le corps d'erreur est vide (ex. 429)", async () => {
    fetchMock.mockResolvedValue(httpErrorResponse(429));
    const { result } = setup();

    await act(() => result.current.sendMessage("Salut"));

    expect(result.current.messages[2].content).toBe("⚠️ Erreur de communication avec l'assistant");
    expect(result.current.isStreaming).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tool calls
// ---------------------------------------------------------------------------
describe("sendMessage — tool calls", () => {
  it("exécute le tool call quand finish_reason vaut tool_calls", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        contentEvent("Je te prépare ça."),
        toolCallEvent("save_recipe", { title: "Tarte", servings: 4 }),
      ]),
    );
    const { result, onToolCall } = setup();

    await act(() => result.current.sendMessage("Crée une tarte"));

    expect(onToolCall).toHaveBeenCalledWith(
      { type: "save_recipe", data: { title: "Tarte", servings: 4 } },
      null,
    );
  });

  it("accumule les arguments répartis sur plusieurs événements", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        { choices: [{ delta: { tool_calls: [{ function: { name: "navigate", arguments: '{"desti' } }] } }] },
        {
          choices: [
            {
              delta: { tool_calls: [{ function: { arguments: 'nation":"profile"}' } }] },
              finish_reason: "tool_calls",
            },
          ],
        },
      ]),
    );
    const { result, onToolCall } = setup();

    await act(() => result.current.sendMessage("Va sur mon profil"));

    expect(onToolCall).toHaveBeenCalledWith({ type: "navigate", data: { destination: "profile" } }, null);
  });

  it("exécute un tool call accumulé même sans finish_reason (fallback fin de stream)", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        {
          choices: [
            {
              delta: {
                tool_calls: [{ function: { name: "navigate", arguments: '{"destination":"dashboard"}' } }],
              },
            },
          ],
        },
      ]),
    );
    const { result, onToolCall } = setup();

    await act(() => result.current.sendMessage("Mes recettes"));

    expect(onToolCall).toHaveBeenCalledWith(
      { type: "navigate", data: { destination: "dashboard" } },
      null,
    );
  });

  it("affiche les résultats de search_recipes dans le message assistant", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([contentEvent("Je cherche…"), toolCallEvent("search_recipes", { query: "tarte" })]),
    );
    const hook = setup({
      onToolCall: vi
        .fn()
        .mockResolvedValue([
          { id: "r1", title: "Tarte aux pommes", status: "validated", is_favorite: true },
        ]),
    });

    await act(() => hook.result.current.sendMessage("Cherche une tarte"));

    const last = lastMessage(hook.result.current.messages);
    expect(last.content).toContain("Résultats trouvés");
    expect(last.content).toContain("Tarte aux pommes");
    expect(last.content).toContain("✅ validée");
    expect(last.content).toContain("⭐");
  });

  it("propose de créer une recette quand la recherche ne donne rien", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([toolCallEvent("search_recipes", { query: "introuvable" })]),
    );
    const hook = setup({ onToolCall: vi.fn().mockResolvedValue([]) });

    await act(() => hook.result.current.sendMessage("Cherche un plat introuvable"));

    expect(lastMessage(hook.result.current.messages).content).toContain(
      "aucune recette correspondante",
    );
  });

  it("injecte la recette active courante en second argument de onToolCall", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([toolCallEvent("extract_modified_recipe", { title: "Modif" })]),
    );
    const activeRecipe = { id: "r1", title: "Tarte", servings: 4 };
    const { result, onToolCall } = setup({ initialActiveRecipe: activeRecipe });

    await act(() => result.current.sendMessage("Modifie la tarte"));

    expect(onToolCall).toHaveBeenCalledWith(
      { type: "extract_modified_recipe", data: { title: "Modif" } },
      activeRecipe,
    );
  });

  it("après get_recipe_details, injecte la recette chargée dans le tool call suivant (auto-retry)", async () => {
    // Le moteur charge une recette (get_recipe_details) puis rejoue la requête ;
    // le tool call du 2e tour doit recevoir cette recette en second argument,
    // sans que le consommateur ait à maintenir son propre ref (regression #5).
    const loaded = { id: "r9", title: "Chargée", servings: 2 };
    const onToolCall = vi
      .fn()
      .mockResolvedValueOnce(loaded) // get_recipe_details -> renvoie la recette
      .mockResolvedValueOnce(null); // extract_modified_recipe
    fetchMock
      .mockResolvedValueOnce(sseResponse([toolCallEvent("get_recipe_details", { recipe_id: "r9" })]))
      .mockResolvedValueOnce(sseResponse([toolCallEvent("extract_modified_recipe", { title: "Modif" })]));
    const { result } = setup({ onToolCall });

    await act(() => result.current.sendMessage("modifie la recette r9"));

    expect(onToolCall).toHaveBeenNthCalledWith(
      1,
      { type: "get_recipe_details", data: { recipe_id: "r9" } },
      null,
    );
    expect(onToolCall).toHaveBeenNthCalledWith(
      2,
      { type: "extract_modified_recipe", data: { title: "Modif" } },
      loaded,
    );
  });

  it("interprète une action JSON écrite en texte (fallback) et nettoie le message", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        contentEvent('Je t\'emmène ! {"action": "navigate", "parameters": {"destination": "dashboard"}}'),
      ]),
    );
    const { result, onToolCall } = setup();

    await act(() => result.current.sendMessage("Mes recettes"));

    expect(onToolCall).toHaveBeenCalledWith(
      { type: "navigate", data: { destination: "dashboard" } },
      null,
    );
    const last = lastMessage(result.current.messages);
    expect(last.content).toBe("Je t'emmène !");
  });
});

// ---------------------------------------------------------------------------
// resetChat
// ---------------------------------------------------------------------------
describe("resetChat", () => {
  it("restaure le message d'accueil et vide l'état en cours", async () => {
    fetchMock.mockResolvedValue(sseResponse([contentEvent("Ok")]));
    const { result } = setup();

    await act(() => result.current.sendMessage("Salut"));
    act(() => {
      result.current.setPendingRecipe({ title: "X", servings: 2, ingredients: [], steps: [] });
    });
    expect(result.current.pendingRecipe).not.toBeNull();

    act(() => result.current.resetChat());

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ id: "welcome", content: "Bienvenue !" });
    expect(result.current.pendingRecipe).toBeNull();
    expect(result.current.searchResults).toEqual([]);
  });
});
