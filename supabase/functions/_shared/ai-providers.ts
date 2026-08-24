// ===== Shared AI Provider Call Helpers =====

import { AIConfig } from "./ai-types.ts";

export type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: string;
  content: string | MessageContentPart[];
}

export interface ToolDefinition {
  type?: string;
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
}

interface ToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface AIResponse {
  choices?: Array<{ message?: { content?: string; tool_calls?: ToolCall[] } }>;
  content?: Array<{ type: string; text?: string; input?: unknown }>;
}

interface StreamCallOptions {
  tools?: ToolDefinition[];
  stream?: boolean;
  signal?: AbortSignal;
}

interface InlineImageData {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  data: string;
}

/** The home assistant accepts validated data URLs and preserves their real MIME type. */
function parseInlineImageData(url: string): InlineImageData {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
  if (!match) throw new Error("Unsupported image data URL");
  return { mimeType: match[1] as InlineImageData["mimeType"], data: match[2] };
}

// ============================================================
// NON-STREAMING CALLS
// ============================================================

/** Call AI (non-streaming) and return the text content */
export async function callAINonStreaming(config: AIConfig, messages: ChatMessage[]): Promise<string> {
  if (config.provider === "anthropic") {
    return callAnthropicNonStreaming(config, messages);
  }

  // OpenAI-compatible format (OpenAI, Gemini OpenAI-compat)
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, messages }),
  });

  if (!response.ok) throw new Error(`AI error (${config.provider}): ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content;
}

/**
 * Sonnet 5 & Opus activent le thinking adaptatif par défaut quand le champ
 * `thinking` est absent (contrairement à Sonnet 4.6 / Haiku 4.5). On le
 * désactive explicitement pour préserver la latence et le coût actuels, éviter
 * les troncatures (thinking + réponse partagent `max_tokens`) et toute
 * interaction avec un `tool_choice` forcé. Les modèles Haiku sont laissés tels
 * quels (thinking déjà inactif par défaut).
 */
function applyAnthropicThinking(body: Record<string, unknown>, model: string): void {
  if (/^claude-(sonnet-5|opus)/.test(model)) {
    body.thinking = { type: "disabled" };
  }
}

async function callAnthropicNonStreaming(config: AIConfig, messages: ChatMessage[]): Promise<string> {
  const systemMessage = messages.find((m) => m.role === "system")?.content || "";
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((msg) => ({ role: msg.role, content: msg.content }));

  const body: Record<string, unknown> = { model: config.model, max_tokens: 8192, messages: chatMessages };
  applyAnthropicThinking(body, config.model);
  if (systemMessage) body.system = systemMessage;

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text;
}

// ============================================================
// STREAMING CALLS (returns raw Response for SSE piping)
// ============================================================

/** Call AI (streaming) and return a Response (SSE-compatible) */
export async function callAIStreaming(
  config: AIConfig,
  messages: ChatMessage[],
  options: StreamCallOptions = {}
): Promise<Response> {
  const stream = options.stream ?? true;

  switch (config.provider) {
    case "gemini":
      return callGeminiStreaming(config, messages, { ...options, stream });
    case "anthropic":
      return callAnthropicStreaming(config, messages, { ...options, stream });
    default:
      // OpenAI-compatible (OpenAI)
      return callOpenAICompatStreaming(config, messages, { ...options, stream });
  }
}

async function callOpenAICompatStreaming(config: AIConfig, messages: ChatMessage[], options: StreamCallOptions): Promise<Response> {
  const body: Record<string, unknown> = { model: config.model, messages, stream: options.stream ?? true };
  if (options.tools?.length) body.tools = options.tools;

  return fetch(config.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiMessage {
  role: string;
  parts: GeminiPart[];
}

async function callGeminiStreaming(config: AIConfig, messages: ChatMessage[], options: StreamCallOptions): Promise<Response> {
  // Convert to Gemini native format
  const geminiMessages: GeminiMessage[] = messages.map((msg) => {
    if (msg.role === "system") {
      return { role: "user", parts: [{ text: `[System]: ${msg.content}` }] };
    }
    return {
      role: msg.role === "assistant" ? "model" : "user",
      parts: typeof msg.content === "string"
        ? [{ text: msg.content }]
        : msg.content.map((c) => {
            if (c.type === "text") return { text: c.text };
            const image = parseInlineImageData(c.image_url.url);
            return { inlineData: image };
          }),
    };
  });

  // Merge consecutive same-role messages (Gemini requirement)
  const mergedMessages: GeminiMessage[] = [];
  for (const msg of geminiMessages) {
    if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === msg.role) {
      mergedMessages[mergedMessages.length - 1].parts.push(...msg.parts);
    } else {
      mergedMessages.push(msg);
    }
  }

  const body: Record<string, unknown> = { contents: mergedMessages, generationConfig: { temperature: 0.7, maxOutputTokens: 8192 } };
  if (options.tools?.length) {
    body.tools = [{
      functionDeclarations: options.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    }];
  }

  // Use native Gemini endpoint (not OpenAI-compat) for streaming.
  // Clé via l'en-tête `x-goog-api-key`, jamais en query string (une erreur
  // réseau bas niveau exposerait l'URL — donc la clé — dans son message).
  // En streaming, `?alt=sse` demande un flux SSE (`data: {...}` ligne par
  // ligne) parsé incrémentalement par transformGeminiStreamToOpenAI ; sans lui
  // Gemini renvoie un unique tableau JSON qu'il faudrait bufferiser en entier.
  const endpoint = options.stream
    ? `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?alt=sse`
    : `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (options.stream && response.ok) return transformGeminiStreamToOpenAI(response);
  return response;
}

async function callAnthropicStreaming(config: AIConfig, messages: ChatMessage[], options: StreamCallOptions): Promise<Response> {
  const systemMessage = messages.find((m) => m.role === "system")?.content || "";
  const chatMessages = messages.filter((m) => m.role !== "system").map((msg) => ({
    role: msg.role,
    content: typeof msg.content === "string"
      ? msg.content
      : msg.content.map((c) => {
          if (c.type === "text") return { type: "text", text: c.text };
          const image = parseInlineImageData(c.image_url.url);
          return { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.data } };
        }),
  }));

  const body: Record<string, unknown> = { model: config.model, max_tokens: 8192, messages: chatMessages };
  applyAnthropicThinking(body, config.model);
  // Prompt caching : le prompt système (volumineux : persona + préférences +
  // liste des recettes) et les définitions d'outils sont stables au sein d'une
  // conversation. Un cache_control sur le bloc système met en cache tout le
  // préfixe tools+system → les tours suivants le relisent à ~0,1x le prix.
  // (ordre de rendu Anthropic : tools → system → messages.)
  if (systemMessage) {
    body.system = [{ type: "text", text: systemMessage, cache_control: { type: "ephemeral" } }];
  }
  if (options.tools?.length) {
    body.tools = options.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }
  if (options.stream) body.stream = true;

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (options.stream && response.ok) return transformAnthropicStreamToOpenAI(response);
  return response;
}

// ============================================================
// STREAM TRANSFORMERS
// ============================================================
//
// Anthropic et Gemini (streaming) sont normalisés vers le format de chunks
// OpenAI attendu par le front (`useChatEngine`). Les builders ci-dessous
// produisent ces chunks et sont partagés par les deux transforms ;
// `surfaceStreamError` propage une erreur survenue APRÈS le 200 initial (sinon
// le flux se clôturerait proprement et le client prendrait une réponse
// tronquée pour un succès).

const encoder = new TextEncoder();
const DONE_CHUNK = encoder.encode("data: [DONE]\n\n");

/** Encode un objet en événement SSE `data: {...}`. */
const sse = (payload: object): Uint8Array => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

interface OpenAIToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function: { name?: string; arguments?: string };
}

/** Chunk OpenAI : delta de contenu textuel. */
function openAIContentChunk(text: string) {
  return { choices: [{ index: 0, delta: { content: text } }] };
}

/**
 * Chunk OpenAI : delta d'appel d'outil. `id`/`name` ne sont émis qu'au premier
 * chunk d'un outil ; les chunks suivants ne portent que la suite des `arguments`.
 */
function openAIToolCallChunk(tc: { index: number; id?: string; name?: string; arguments?: string }) {
  const fn: { name?: string; arguments?: string } = {};
  if (tc.name !== undefined) fn.name = tc.name;
  if (tc.arguments !== undefined) fn.arguments = tc.arguments;
  const toolCall: OpenAIToolCallDelta = { index: tc.index, function: fn };
  if (tc.id !== undefined) {
    toolCall.id = tc.id;
    toolCall.type = "function";
  }
  return { choices: [{ index: 0, delta: { tool_calls: [toolCall] } }] };
}

/** Chunk OpenAI : fin d'un bloc (le consommateur exécute l'outil accumulé). */
function openAIFinishChunk(reason: string) {
  return { choices: [{ index: 0, delta: {}, finish_reason: reason }] };
}

/**
 * Propage une erreur mi-stream au client : coupe la connexion amont et met le
 * flux transformé en erreur (le client l'affiche au lieu de la voir avalée).
 */
async function surfaceStreamError(
  controller: ReadableStreamDefaultController<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  error: { message?: string } | undefined,
): Promise<void> {
  console.error("AI stream error:", error);
  await reader.cancel().catch(() => {}); // libère la connexion amont
  controller.error(new Error(error?.message ?? "Erreur du fournisseur IA pendant la génération"));
}

interface GeminiStreamPart {
  text?: string;
  functionCall?: { name: string; args?: unknown };
}

interface GeminiStreamChunk {
  candidates?: Array<{ content?: { parts?: GeminiStreamPart[] } }>;
  error?: { message?: string; code?: number; status?: string };
}

interface AnthropicStreamEvent {
  type?: string;
  error?: { message?: string };
  content_block?: { type?: string; id?: string; name?: string };
  delta?: { type?: string; partial_json?: string; text?: string };
}

/** Un handler qui retourne une valeur demande l'arrêt du flux en erreur. */
type SSEStop = { error?: { message?: string } };

/**
 * Boucle SSE partagée par les deux fournisseurs de streaming : lit les lignes
 * `data: {...}` de façon incrémentale (le partiel est rebufferisé), délègue
 * chaque objet parsé à `handle`, et clôt par `[DONE]`. Si `handle` renvoie une
 * valeur, le flux est propagé en erreur au client via `surfaceStreamError` —
 * chaque fournisseur détecte sa propre forme d'erreur, le surfaçage est commun.
 */
function transformSSEToOpenAI<T>(
  response: Response,
  handle: (data: T, emit: (chunk: object) => void) => SSEStop | void,
): Response {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (chunk: object) => controller.enqueue(sse(chunk));
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(DONE_CHUNK);
          controller.close();
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let data: T;
          try {
            data = JSON.parse(line.slice(6)) as T;
          } catch {
            // Ligne partielle/non-JSON : ignorée (le partiel est rebufferisé).
            continue;
          }
          const stop = handle(data, emit);
          if (stop) {
            await surfaceStreamError(controller, reader, stop.error);
            return;
          }
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

/**
 * Flux SSE natif de Gemini (`?alt=sse` → `data: {GenerateContentResponse}`)
 * normalisé en chunks OpenAI. Émet un `finish_reason: "tool_calls"` après
 * chaque `functionCall` pour que le consommateur exécute chaque outil
 * (auparavant absent → outils Gemini jamais exécutés).
 */
export function transformGeminiStreamToOpenAI(response: Response): Response {
  let toolCallIndex = -1;
  return transformSSEToOpenAI<GeminiStreamChunk>(response, (data, emit) => {
    if (data.error) return { error: data.error };
    for (const part of data.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) emit(openAIContentChunk(part.text));
      if (part.functionCall) {
        toolCallIndex++;
        emit(openAIToolCallChunk({
          index: toolCallIndex,
          id: `call_${part.functionCall.name}_${toolCallIndex}`,
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args ?? {}),
        }));
        emit(openAIFinishChunk("tool_calls"));
      }
    }
  });
}

/**
 * Flux SSE Anthropic normalisé en chunks OpenAI. Le nom de l'outil arrive dans
 * `content_block_start`, ses arguments en deltas `input_json_delta`, et le bloc
 * clôt sur `content_block_stop` (blocs séquentiels, un seul actif à la fois).
 */
export function transformAnthropicStreamToOpenAI(response: Response): Response {
  // Index de tool_call croissant : chaque bloc `tool_use` obtient le sien
  // (0, 1, …) pour que deux outils émis dans le même message restent distincts
  // au format OpenAI, au lieu d'être écrasés sur l'index 0.
  let toolCallIndex = -1;
  let currentBlockIsTool = false;
  return transformSSEToOpenAI<AnthropicStreamEvent>(response, (data, emit) => {
    switch (data.type) {
      case "error":
        // Erreur émise APRÈS le 200 initial (overloaded, rate-limit…).
        return { error: data.error };
      case "content_block_start": {
        const block = data.content_block;
        if (block?.type === "tool_use") {
          currentBlockIsTool = true;
          toolCallIndex++;
          // Émet le nom de l'outil (arguments accumulés dans les deltas).
          emit(openAIToolCallChunk({ index: toolCallIndex, id: block.id, name: block.name, arguments: "" }));
        } else {
          currentBlockIsTool = false;
        }
        break;
      }
      case "content_block_delta": {
        if (data.delta?.type === "input_json_delta") {
          emit(openAIToolCallChunk({ index: toolCallIndex, arguments: data.delta.partial_json || "" }));
        } else if (data.delta?.text != null) {
          emit(openAIContentChunk(data.delta.text));
        }
        break;
      }
      case "content_block_stop": {
        // Un finish_reason par outil : le consommateur réinitialise son
        // accumulateur à chaque fois, ce qui permet d'exécuter chaque outil
        // d'un message multi-outils.
        if (currentBlockIsTool) {
          emit(openAIFinishChunk("tool_calls"));
          currentBlockIsTool = false;
        }
        break;
      }
    }
  });
}

// ============================================================
// TOOL CALL HELPERS (for non-streaming tool-calling functions)
// ============================================================

/** Build a request with tool calling for any provider */
export function buildToolCallRequest(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  tools: ToolDefinition[],
  forcedToolName?: string
): { headers: Record<string, string>; body: Record<string, unknown> } {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.provider === "anthropic") {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    return {
      headers,
      body: {
        model: config.model,
        max_tokens: 4096,
        ...(/^claude-(sonnet-5|opus)/.test(config.model) ? { thinking: { type: "disabled" } } : {}),
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        })),
        ...(forcedToolName ? { tool_choice: { type: "tool", name: forcedToolName } } : {}),
      },
    };
  }

  headers["Authorization"] = `Bearer ${config.apiKey}`;
  return {
    headers,
    body: {
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools,
      ...(forcedToolName ? { tool_choice: { type: "function", function: { name: forcedToolName } } } : {}),
    },
  };
}

/** Extract the tool call result from any provider's response */
export function extractToolCallResult(config: AIConfig, response: AIResponse): unknown {
  if (config.provider === "anthropic") {
    const toolUse = response.content?.find((c) => c.type === "tool_use");
    return toolUse?.input;
  }
  const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
  return toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : null;
}

// ============================================================
// VISION HELPERS
// ============================================================

/** Build a vision request body for any provider */
export function buildVisionRequest(config: AIConfig, systemPrompt: string, imageUrl: string, userPrompt: string): Record<string, unknown> {
  if (config.provider === "anthropic") {
    return {
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image", source: { type: "url", url: imageUrl } },
        ],
      }],
    };
  }

  return {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  };
}

/** Build request headers for any provider */
export function buildRequestHeaders(config: AIConfig): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.provider === "anthropic") {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }
  return headers;
}

/** Extract text content from any provider's response */
export function extractContentFromResponse(config: AIConfig, response: AIResponse): string | null {
  if (config.provider === "anthropic") {
    return response.content?.[0]?.text || null;
  }
  return response.choices?.[0]?.message?.content || null;
}

/** Build a simple text request (non-tool, non-vision) for any provider */
export function buildSimpleRequest(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  extraOptions?: Record<string, unknown>
): { headers: Record<string, string>; body: Record<string, unknown> } {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.provider === "anthropic") {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    return {
      headers,
      body: {
        model: config.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        ...extraOptions,
      },
    };
  }

  headers["Authorization"] = `Bearer ${config.apiKey}`;
  return {
    headers,
    body: {
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...extraOptions,
    },
  };
}
