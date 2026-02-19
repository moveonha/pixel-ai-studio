export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface OpenClawCallbacks {
  onStatus: (status: ConnectionStatus) => void;
  onResponse: (id: string | undefined, text: string, tokensUsed?: number) => void;
  onToolCall: (tool: string, args: Record<string, unknown>, status: string) => void;
  onToolResult: (tool: string, output: string, exitCode?: number) => void;
  onError: (code: string, message: string) => void;
}

let callbacks: OpenClawCallbacks | null = null;
let baseUrl = "/oc-api";
let _connected = false;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let lastErrorMsg = "";
let lastErrorAt = 0;
let authStopped = false;

const ERROR_DEDUP_MS = 10_000;
const HEALTH_INTERVAL = 20_000;

function getAuthToken(): string {
  try {
    const raw = localStorage.getItem("openclaw_config");
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg.token) return cfg.token;
    }
  } catch { /* ignore */ }
  return import.meta.env.VITE_OPENCLAW_TOKEN || "";
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export function configure(host: string, port: number) {
  baseUrl = import.meta.env.DEV ? "/oc-api" : `http://${host}:${port}`;
}

export function connect(cbs: OpenClawCallbacks) {
  disconnect();
  callbacks = cbs;
  authStopped = false;
  callbacks.onStatus("connecting");
  checkHealth();
  healthTimer = setInterval(checkHealth, HEALTH_INTERVAL);
}

export function disconnect() {
  if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
  _connected = false;
  callbacks?.onStatus("disconnected");
  callbacks = null;
}

export function isConnected(): boolean {
  return _connected;
}

function emitError(code: string, message: string) {
  if (!callbacks) return;
  const now = Date.now();
  if (message === lastErrorMsg && now - lastErrorAt < ERROR_DEDUP_MS) return;
  lastErrorMsg = message;
  lastErrorAt = now;
  callbacks.onError(code, message);
}

export async function sendChat(
  text: string,
  opts?: { systemPrompt?: string; agentId?: string; user?: string },
): Promise<void> {
  if (!callbacks) return;
  if (!_connected) {
    emitError("NOT_CONNECTED", "Gateway 미연결. 설정을 확인하세요.");
    return;
  }

  const headers = authHeaders();
  headers["x-openclaw-agent-id"] = opts?.agentId ?? "main";

  const messages: { role: string; content: string }[] = [];
  if (opts?.systemPrompt) messages.push({ role: "system", content: opts.systemPrompt });
  messages.push({ role: "user", content: text });

  const body = {
    model: "openclaw",
    stream: true,
    messages,
    ...(opts?.user ? { user: opts.user } : {}),
  };

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      emitError("HTTP_ERROR", err.error?.message ?? `HTTP ${res.status}`);
      return;
    }

    if (!res.body) {
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content ?? "";
      callbacks.onResponse(json.id, content);
      return;
    }

    await readSSE(res.body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    emitError("FETCH_ERROR", msg);
    _connected = false;
    callbacks.onStatus("error");
  }
}

export async function invokeTool(tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${baseUrl}/tools/invoke`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ tool, args }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Tool invoke failed");
  return json.result;
}

// ─── Internal ───

async function readSSE(body: ReadableStream<Uint8Array>) {
  if (!callbacks) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;

        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) fullText += delta;
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (fullText) {
    callbacks.onResponse(undefined, fullText);
  }
}

async function checkHealth() {
  if (!callbacks || authStopped) return;

  try {
    const res = await fetch(`${baseUrl}/tools/invoke`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ tool: "sessions_list", action: "json", args: {} }),
    });

    if (res.status === 401) {
      authStopped = true;
      if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
      _connected = false;
      callbacks.onStatus("error");
      emitError("AUTH", "Gateway 인증 실패. 설정에서 토큰을 확인하세요.");
      return;
    }

    const json = await res.json();
    if (json.ok) {
      if (!_connected) {
        _connected = true;
        lastErrorMsg = "";
        callbacks.onStatus("connected");
      }
    }
  } catch {
    if (_connected) {
      _connected = false;
      callbacks.onStatus("disconnected");
    }
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
    callbacks = null;
  });
}
