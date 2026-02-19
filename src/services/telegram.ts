export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  enabled: false,
  botToken: "",
  chatId: "",
};

export interface TelegramCallbacks {
  onMessage: (text: string, from: string) => void;
  onError: (message: string) => void;
  onStatusChange: (connected: boolean) => void;
}

let config: TelegramConfig = { ...DEFAULT_TELEGRAM_CONFIG };
let callbacks: TelegramCallbacks | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastUpdateId = 0;
let _running = false;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

function baseUrl(): string {
  return import.meta.env.DEV
    ? `/tg-api/bot${config.botToken}`
    : `https://api.telegram.org/bot${config.botToken}`;
}

export function configure(cfg: TelegramConfig): void {
  const wasRunning = _running;
  if (wasRunning) stopPolling();
  config = { ...cfg };
  if (wasRunning && cfg.enabled && cfg.botToken && cfg.chatId) {
    startPolling();
  }
}

export function start(cbs: TelegramCallbacks): void {
  callbacks = cbs;
  if (config.enabled && config.botToken && config.chatId) {
    startPolling();
  }
}

export function stop(): void {
  stopPolling();
  callbacks = null;
}

export function isRunning(): boolean {
  return _running;
}

// ─── Send message TO Telegram ───

export async function sendMessage(text: string): Promise<boolean> {
  if (!config.enabled || !config.botToken || !config.chatId) return false;

  try {
    const res = await fetch(`${baseUrl()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ description: res.statusText }));
      callbacks?.onError(`Telegram 전송 실패: ${err.description ?? res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    callbacks?.onError(`Telegram 전송 오류: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export function formatAgentMessage(
  agentName: string,
  content: string,
  messageType: string,
): string {
  const icon = {
    chat: "💬", action: "⚡", tool_call: "🔧", tool_result: "📋", error: "❌", think: "🧠",
  }[messageType] ?? "💬";

  return `${icon} <b>${escapeHtml(agentName)}</b>\n${escapeHtml(content)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Polling (receive FROM Telegram) ───

function startPolling(): void {
  if (_running) return;
  _running = true;
  consecutiveErrors = 0;
  callbacks?.onStatusChange(true);
  poll();
}

function stopPolling(): void {
  _running = false;
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  callbacks?.onStatusChange(false);
}

async function poll(): Promise<void> {
  if (!_running || !callbacks) return;

  try {
    const params = new URLSearchParams({
      offset: String(lastUpdateId + 1),
      timeout: "25",
      allowed_updates: JSON.stringify(["message"]),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const res = await fetch(`${baseUrl()}/getUpdates?${params}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    consecutiveErrors = 0;

    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        const msg = update.message;
        if (!msg?.text) continue;
        if (String(msg.chat.id) !== config.chatId) continue;

        const from = msg.from?.first_name ?? msg.from?.username ?? "User";
        callbacks.onMessage(msg.text, from);
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      // timeout, just retry
    } else {
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        callbacks?.onError(`Telegram 폴링 연속 ${MAX_CONSECUTIVE_ERRORS}회 실패, 중단됨`);
        stopPolling();
        return;
      }
    }
  }

  if (_running) {
    pollTimer = setTimeout(poll, consecutiveErrors > 0 ? 3000 : 100);
  }
}

// ─── Verify bot token ───

export async function verifyBot(): Promise<{ ok: boolean; username?: string; error?: string }> {
  if (!config.botToken) return { ok: false, error: "봇 토큰이 없습니다" };

  try {
    const res = await fetch(`${baseUrl()}/getMe`);
    const data = await res.json();
    if (data.ok) {
      return { ok: true, username: data.result.username };
    }
    return { ok: false, error: data.description ?? "인증 실패" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── HMR cleanup ───

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopPolling();
    callbacks = null;
  });
}
