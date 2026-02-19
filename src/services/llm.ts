export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCallbacks {
  onChunk: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (message: string) => void;
}

function getApiKey(): string {
  return localStorage.getItem("llm_api_key")
    || import.meta.env.VITE_OPENROUTER_API_KEY
    || "";
}

function getModel(): string {
  return localStorage.getItem("llm_model")
    || "arcee-ai/trinity-large-preview:free";
}

export async function chat(
  messages: ChatMessage[],
  callbacks: LLMCallbacks,
): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    callbacks.onError("API 키가 없습니다. 설정에서 OpenRouter 키를 입력하세요.");
    return;
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://pixel-agent-studio.local",
        "X-Title": "Pixel Agent Studio",
      },
      body: JSON.stringify({
        model: getModel(),
        stream: true,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      callbacks.onError(err.error?.message ?? `HTTP ${res.status}`);
      return;
    }

    if (!res.body) {
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content ?? "";
      callbacks.onDone(content);
      return;
    }

    const reader = res.body.getReader();
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
            if (delta) {
              fullText += delta;
              callbacks.onChunk(delta);
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (fullText) callbacks.onDone(fullText);
  } catch (e) {
    callbacks.onError(e instanceof Error ? e.message : String(e));
  }
}
