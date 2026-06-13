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

async function callAnthropicNonStreaming(config: AIConfig, messages: ChatMessage[]): Promise<string> {
  const systemMessage = messages.find((m) => m.role === "system")?.content || "";
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((msg) => ({ role: msg.role, content: msg.content }));

  const body: Record<string, unknown> = { model: config.model, max_tokens: 8192, messages: chatMessages };
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
        : msg.content.map((c) =>
            c.type === "text"
              ? { text: c.text }
              : { inlineData: { mimeType: "image/jpeg", data: c.image_url.url.split(",")[1] } }
          ),
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

  // Use native Gemini endpoint (not OpenAI-compat) for streaming
  const endpoint = options.stream
    ? `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:streamGenerateContent?key=${config.apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
      : msg.content.map((c) =>
          c.type === "text"
            ? { type: "text", text: c.text }
            : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: c.image_url.url.split(",")[1] } }
        ),
  }));

  const body: Record<string, unknown> = { model: config.model, max_tokens: 8192, messages: chatMessages };
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
  });

  if (options.stream && response.ok) return transformAnthropicStreamToOpenAI(response);
  return response;
}

// ============================================================
// STREAM TRANSFORMERS
// ============================================================

function transformGeminiStreamToOpenAI(response: Response): Response {
  const reader = response.body!.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); break; }
        buffer += decoder.decode(value, { stream: true });
        try {
          const jsonMatch = buffer.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const chunks = JSON.parse(jsonMatch[0]);
            for (const chunk of chunks) {
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
              const toolCalls = chunk.candidates?.[0]?.content?.parts?.[0]?.functionCall;
              const openAIChunk: { choices: Array<{ delta: { content?: string; tool_calls?: ToolCall[] }; index: number }> } =
                { choices: [{ delta: {}, index: 0 }] };
              if (text) openAIChunk.choices[0].delta.content = text;
              if (toolCalls) {
                openAIChunk.choices[0].delta.tool_calls = [{
                  id: `call_${Date.now()}`, type: "function",
                  function: { name: toolCalls.name, arguments: JSON.stringify(toolCalls.args) },
                }];
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`));
            }
            buffer = "";
          }
        } catch { /* Keep accumulating */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

export function transformAnthropicStreamToOpenAI(response: Response): Response {
  const reader = response.body!.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const sse = (payload: object) =>
    encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      // Suit le type du content block courant : le SSE Anthropic envoie le nom
      // de l'outil dans `content_block_start` puis les arguments en deltas
      // `input_json_delta`, et clôt avec `content_block_stop`.
      let currentBlockIsTool = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            switch (data.type) {
              case "content_block_start": {
                const block = data.content_block;
                if (block?.type === "tool_use") {
                  currentBlockIsTool = true;
                  // Émet le nom de l'outil (arguments accumulés dans les deltas).
                  controller.enqueue(sse({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: block.id, type: "function", function: { name: block.name, arguments: "" } }] } }] }));
                } else {
                  currentBlockIsTool = false;
                }
                break;
              }
              case "content_block_delta": {
                if (data.delta?.type === "input_json_delta") {
                  controller.enqueue(sse({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: data.delta.partial_json || "" } }] } }] }));
                } else if (data.delta?.text != null) {
                  controller.enqueue(sse({ choices: [{ index: 0, delta: { content: data.delta.text } }] }));
                }
                break;
              }
              case "content_block_stop": {
                // Signale au front la fin de l'appel d'outil pour qu'il l'exécute.
                if (currentBlockIsTool) {
                  controller.enqueue(sse({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }));
                  currentBlockIsTool = false;
                }
                break;
              }
            }
          } catch { /* Skip invalid */ }
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
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
