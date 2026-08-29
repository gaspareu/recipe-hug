export const ELEVENLABS_TTS_VOICE_ID = "onwK4e9ZLuTAKqWW03F9";
export const ELEVENLABS_REQUEST_TIMEOUT_MS = 20_000;
export const MAX_TTS_TEXT_LENGTH = 5_000;
export const MAX_TTS_BODY_BYTES = 64 * 1024;

export type TtsRequestResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export type VoiceQuotaDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };

export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes = MAX_TTS_BODY_BYTES,
): Promise<JsonBodyResult> {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large" };
  }
  if (!request.body) return { ok: false, status: 400, error: "Invalid JSON body" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413, error: "Request body too large" };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  } finally {
    reader.releaseLock();
  }
}

export function parseTtsRequest(value: unknown): TtsRequestResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Invalid JSON body" };
  }

  const text = (value as Record<string, unknown>).text;
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: "Text is required" };
  }

  const normalizedText = text.trim();
  if (normalizedText.length > MAX_TTS_TEXT_LENGTH) {
    return {
      ok: false,
      error: `Text too long (max ${MAX_TTS_TEXT_LENGTH} characters)`,
    };
  }

  return { ok: true, text: normalizedText };
}

export function mapElevenLabsError(upstreamStatus: number): {
  status: number;
  message: string;
} {
  if (upstreamStatus === 429) {
    return { status: 429, message: "Voice service rate limit reached" };
  }
  if (upstreamStatus >= 500) {
    return { status: 503, message: "Voice service temporarily unavailable" };
  }
  return { status: 502, message: "Voice service request failed" };
}

export function parseVoiceQuotaDecision(value: unknown): VoiceQuotaDecision | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;

  const record = row as Record<string, unknown>;
  if (typeof record.allowed !== "boolean") return null;
  if (typeof record.retry_after_seconds !== "number" || !Number.isFinite(record.retry_after_seconds)) {
    return null;
  }

  return {
    allowed: record.allowed,
    retryAfterSeconds: Math.max(0, Math.ceil(record.retry_after_seconds)),
  };
}

export function createTimeoutSignal(timeoutMs = ELEVENLABS_REQUEST_TIMEOUT_MS): {
  signal: AbortSignal;
  clear: () => void;
  reset: (nextTimeoutMs?: number) => void;
} {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
  };
  const reset = (nextTimeoutMs = timeoutMs) => {
    clear();
    timeoutId = setTimeout(() => controller.abort(), nextTimeoutMs);
  };
  reset();
  return {
    signal: controller.signal,
    clear,
    reset,
  };
}
