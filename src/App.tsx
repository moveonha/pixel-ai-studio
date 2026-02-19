import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import Phaser from "phaser";
import "./App.css";
import {
  Agent,
  AgentMessage,
  DEFAULT_AGENTS,
  LLM_PROVIDERS,
  DEFAULT_OPENCLAW_CONFIG,
  type LLMConfig,
  type OpenClawConfig,
} from "./types/agent";
import { createGameConfig } from "./game/config";
import type OfficeScene from "./game/scenes/OfficeScene";
import * as oc from "./services/openclaw";
import type { ConnectionStatus } from "./services/openclaw";
import * as persona from "./services/persona";
// llm.ts는 직접 호출 불필요 — OpenClaw가 LLM + 로컬 도구 모두 처리
import * as tg from "./services/telegram";
import type { TelegramConfig } from "./services/telegram";
import {
  Terminal, Activity, Send, Settings, X, Cpu, Users, Zap, Wifi, WifiOff, MessageCircle,
} from "lucide-solid";

const DEPARTMENTS = [
  { key: "STRATEGY", label: "전략", icon: Zap },
  { key: "PRODUCT", label: "프로덕트", icon: Cpu },
  { key: "ENGINEERING", label: "엔지니어링", icon: Activity },
  { key: "RELIABILITY", label: "신뢰성", icon: Users },
] as const;

export default function App() {
  let gameContainerRef!: HTMLDivElement;
  let chatContainerRef!: HTMLDivElement;
  let inputRef!: HTMLTextAreaElement;
  let game: Phaser.Game | null = null;
  let officeScene: OfficeScene | null = null;

  const [agents] = createSignal<Agent[]>(DEFAULT_AGENTS);
  const [selectedAgent, setSelectedAgent] = createSignal<Agent | null>(null);
  const [chatMessages, setChatMessages] = createSignal<AgentMessage[]>([]);
  const [gameReady, setGameReady] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);

  const [llmConfig, setLlmConfig] = createSignal<LLMConfig>({
    provider: "openrouter",
    api_key: localStorage.getItem("llm_api_key") || import.meta.env.VITE_OPENROUTER_API_KEY || "",
    model: localStorage.getItem("llm_model") || LLM_PROVIDERS[0].models[0],
  });

  const storedOc = localStorage.getItem("openclaw_config");
  const envToken = import.meta.env.VITE_OPENCLAW_TOKEN || "";
  const parsedOc: OpenClawConfig = storedOc
    ? JSON.parse(storedOc)
    : { ...DEFAULT_OPENCLAW_CONFIG };
  if (!parsedOc.token && envToken) {
    parsedOc.token = envToken;
    parsedOc.enabled = true;
    localStorage.setItem("openclaw_config", JSON.stringify(parsedOc));
  }
  const [ocConfig, setOcConfig] = createSignal<OpenClawConfig>(parsedOc);
  const [ocStatus, setOcStatus] = createSignal<ConnectionStatus>("disconnected");
  let ocInitNotified = false;

  const storedTg = localStorage.getItem("telegram_config");
  const [tgConfig, setTgConfig] = createSignal<TelegramConfig>(
    storedTg ? JSON.parse(storedTg) : { ...tg.DEFAULT_TELEGRAM_CONFIG },
  );
  const [tgConnected, setTgConnected] = createSignal(false);

  const agentDefs = DEFAULT_AGENTS.map((a, i) => ({
    id: a.id, name: a.name, texture: a.sprite, color: a.color, chairIndex: i,
  }));

  persona.preloadAll(DEFAULT_AGENTS.map((a) => a.id));

  let tgBroadcastEnabled = true;

  let _workingAgent: Agent | null = null;
  let _workingSource: "gui" | "telegram" = "gui";

  function pushMessage(msg: AgentMessage) {
    setChatMessages((prev) => [...prev, msg]);
    scrollChat();
  }

  function broadcastToTg(agentName: string, content: string, msgType: string) {
    if (!tgBroadcastEnabled) return;
    if (!tgConfig().enabled || !tgConnected()) return;
    tg.sendMessage(tg.formatAgentMessage(agentName, content, msgType));
  }

  function addSystemMessage(content: string) {
    pushMessage({
      id: Date.now().toString(),
      agent_id: "system", agent_name: "SYSTEM", agent_color: "#00f2fe",
      role: "system", content,
      timestamp: now(), message_type: "action",
    });
  }

  function addAgentMessage(agentId: string, content: string, type: AgentMessage["message_type"] = "chat") {
    const agent = agents().find((a) => a.id === agentId);
    if (!agent) return;
    pushMessage({
      id: Date.now().toString() + agentId,
      agent_id: agentId, agent_name: agent.name, agent_color: agent.color,
      role: "assistant", content,
      timestamp: now(), message_type: type,
    });
    broadcastToTg(agent.name, content, type);
  }

  function addOcMessage(content: string, type: AgentMessage["message_type"] = "action") {
    pushMessage({
      id: Date.now().toString(),
      agent_id: "openclaw", agent_name: "OPENCLAW", agent_color: "#FF5A36",
      role: "assistant", content,
      timestamp: now(), message_type: type,
    });
    if (type === "chat") broadcastToTg("OPENCLAW", content, type);
  }

  function now() {
    return new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }

  function scrollChat() {
    setTimeout(() => chatContainerRef && (chatContainerRef.scrollTop = chatContainerRef.scrollHeight), 50);
  }

  const ROLE_KEYWORDS: Record<string, string[]> = {
    pm: ["일정", "계획", "로드맵", "스프린트", "우선순위", "관리", "태스크", "plan", "schedule"],
    researcher: ["리서치", "조사", "분석", "비교", "트렌드", "벤치마크", "research", "analyze"],
    architect: ["아키텍처", "설계", "구조", "패턴", "마이그레이션", "architecture", "design pattern"],
    designer: ["디자인", "UI", "UX", "색상", "레이아웃", "figma", "컴포넌트 디자인"],
    frontend: ["프론트", "컴포넌트", "React", "CSS", "Tailwind", "페이지", "화면", "frontend"],
    backend: ["백엔드", "API", "서버", "DB", "데이터베이스", "엔드포인트", "backend", "database"],
    qa: ["테스트", "버그", "QA", "품질", "검증", "커버리지", "test", "bug"],
    devops: ["배포", "CI", "CD", "도커", "쿠버네티스", "인프라", "deploy", "docker"],
  };

  function detectAgent(text: string): Agent | null {
    const sel = selectedAgent();
    if (sel) return sel;

    const lower = text.toLowerCase();
    let bestId = "";
    let bestScore = 0;
    for (const [id, keywords] of Object.entries(ROLE_KEYWORDS)) {
      const score = keywords.filter((k) => lower.includes(k.toLowerCase())).length;
      if (score > bestScore) { bestScore = score; bestId = id; }
    }
    if (bestId) return agents().find((a) => a.id === bestId) ?? null;
    return agents().find((a) => a.id === "pm") ?? null;
  }

  let _dispatching = false;

  function dispatchWork(text: string, source: "gui" | "telegram" = "gui") {
    if (_dispatching) return;
    _dispatching = true;

    if (text.includes("회의") || text.includes("meeting")) {
      _dispatching = false;
      officeScene?.startMeeting();
      addSystemMessage("📋 에이전트들이 회의실로 이동합니다.");
      setTimeout(() => agents().forEach((a) => {
        addAgentMessage(a.id, `회의 참석 (${a.specialty})`);
      }), 3000);
      return;
    }
    if (text.includes("업무") || text.includes("work")) {
      _dispatching = false;
      officeScene?.endMeetingAndWork();
      addSystemMessage("💻 에이전트들이 자리로 돌아갑니다.");
      return;
    }
    if (text.includes("휴식") || text.includes("break")) {
      _dispatching = false;
      agents().forEach((a) => officeScene?.setAgentIdle(a.id));
      addSystemMessage("☕ 자유 시간입니다.");
      return;
    }

    if (!ocConfig().enabled || !oc.isConnected()) {
      _dispatching = false;
      addSystemMessage("⚠ OpenClaw Gateway 미연결. 설정에서 연결을 활성화하세요.");
      return;
    }

    const agent = detectAgent(text);
    if (!agent) {
      _dispatching = false;
      addSystemMessage("⚠ 에이전트를 찾을 수 없습니다.");
      return;
    }

    _workingAgent = agent;
    _workingSource = source;
    if (source === "telegram") tgBroadcastEnabled = false;

    officeScene?.setAgentWorking(agent.id);
    officeScene?.showAgentMessage(agent.id, "작업 중...");
    addSystemMessage(`📡 ${agent.name} (${agent.role}) 작업 시작 — OpenClaw 경유`);

    const systemPrompt = persona.getPersonaSync(agent.id);
    oc.sendChat(text, { systemPrompt: systemPrompt || undefined, agentId: agent.id });
  }

  function handleSend() {
    const val = inputRef?.value?.trim() ?? "";
    if (!val) return;
    addSystemMessage(`> ${val}`);
    dispatchWork(val, "gui");
    inputRef.value = "";
  }

  function handleAgentClick(id: string) {
    const agent = agents().find((a) => a.id === id);
    if (agent) { setSelectedAgent(agent); officeScene?.focusAgent(id); }
  }

  function saveLlmConfig(config: LLMConfig) {
    setLlmConfig(config);
    localStorage.setItem("llm_api_key", config.api_key);
    localStorage.setItem("llm_model", config.model);
    setShowSettings(false);
    addSystemMessage(`LLM 설정 저장: ${config.model}`);
  }

  function saveOcConfig(config: OpenClawConfig) {
    setOcConfig(config);
    localStorage.setItem("openclaw_config", JSON.stringify(config));
    if (config.enabled) {
      connectOpenClaw(config);
    } else {
      oc.disconnect();
    }
    setShowSettings(false);
    addSystemMessage(config.enabled ? `OpenClaw 연결: ${config.host}:${config.port}` : "OpenClaw 비활성화");
  }

  function saveTgConfig(cfg: TelegramConfig) {
    setTgConfig(cfg);
    localStorage.setItem("telegram_config", JSON.stringify(cfg));
    tg.configure(cfg);
    if (cfg.enabled && cfg.botToken && cfg.chatId) {
      connectTelegram();
    } else {
      tg.stop();
      setTgConnected(false);
    }
    setShowSettings(false);
    addSystemMessage(cfg.enabled ? `Telegram 봇 활성화 (Chat: ${cfg.chatId})` : "Telegram 비활성화");
  }

  function connectTelegram() {
    tg.start({
      onMessage: (text, from) => {
        pushMessage({
          id: Date.now().toString(),
          agent_id: "telegram", agent_name: `TG:${from}`, agent_color: "#0088cc",
          role: "user", content: text,
          timestamp: now(), message_type: "chat",
        });
        dispatchWork(text, "telegram");
      },
      onError: (msg) => addSystemMessage(`⚠ TG: ${msg}`),
      onStatusChange: (connected) => {
        setTgConnected(connected);
        if (connected) addSystemMessage("✅ Telegram 봇 연결됨");
      },
    });
  }

  function finishWork() {
    const agent = _workingAgent;
    const source = _workingSource;
    _dispatching = false;
    _workingAgent = null;
    if (source === "telegram") tgBroadcastEnabled = true;
    return { agent, source };
  }

  function connectOpenClaw(config: OpenClawConfig) {
    oc.disconnect();
    ocInitNotified = false;
    oc.configure(config.host, config.port);
    oc.connect({
      onStatus: (s) => {
        setOcStatus(s);
        if (s === "connected" && !ocInitNotified) {
          ocInitNotified = true;
          addSystemMessage(`✅ OpenClaw Gateway 연결됨 (${config.host}:${config.port})`);
        }
      },
      onResponse: (_id, text) => {
        const wa = _workingAgent;
        if (wa) {
          const { source } = finishWork();
          addAgentMessage(wa.id, text, "chat");
          officeScene?.showAgentMessage(wa.id, "완료!");
          setTimeout(() => officeScene?.setAgentIdle(wa.id), 3000);
          if (source === "telegram") {
            tg.sendMessage(tg.formatAgentMessage(wa.name, text, "chat"));
          }
        } else {
          addOcMessage(text, "chat");
        }
      },
      onToolCall: (tool, args) => {
        const argsStr = tool === "shell"
          ? (args.command as string) ?? JSON.stringify(args)
          : JSON.stringify(args).slice(0, 120);
        const wa = _workingAgent;
        if (wa) {
          officeScene?.showAgentMessage(wa.id, `🔧 ${tool}...`);
          addAgentMessage(wa.id, `🔧 ${tool}: ${argsStr}`, "tool_call");
        } else {
          addOcMessage(`🔧 ${tool}: ${argsStr}`, "tool_call");
        }
      },
      onToolResult: (tool, output, exitCode) => {
        const short = output.length > 300 ? output.slice(0, 300) + "…" : output;
        const prefix = exitCode !== undefined ? `[exit ${exitCode}] ` : "";
        const wa = _workingAgent;
        if (wa) {
          addAgentMessage(wa.id, `📋 ${tool} ${prefix}${short}`, "tool_result");
        } else {
          addOcMessage(`📋 ${tool} ${prefix}${short}`, "tool_result");
        }
      },
      onError: (_code, message) => {
        const wa = _workingAgent;
        if (wa) {
          finishWork();
          addAgentMessage(wa.id, `❌ ${message}`, "error");
          officeScene?.showAgentMessage(wa.id, "오류!");
          setTimeout(() => officeScene?.setAgentIdle(wa.id), 2000);
        } else {
          addOcMessage(`❌ ${message}`, "error");
        }
      },
    });
  }

  onMount(() => {
    const config = createGameConfig(gameContainerRef);
    game = new Phaser.Game(config);
    game.registry.set("agentDefs", agentDefs);
    game.registry.set("onAgentClick", handleAgentClick);

    const checkInterval = setInterval(() => {
      officeScene = game?.scene?.getScene("office") as OfficeScene | null;
      if (officeScene?.scene.isActive()) {
        setGameReady(true);
        clearInterval(checkInterval);
        addSystemMessage("PIXEL AGENT STUDIO 온라인");
      }
    }, 500);

    const cfg = ocConfig();
    if (cfg.enabled) connectOpenClaw(cfg);

    const tgCfg = tgConfig();
    if (tgCfg.enabled && tgCfg.botToken && tgCfg.chatId) {
      tg.configure(tgCfg);
      connectTelegram();
    }
  });

  onCleanup(() => {
    oc.disconnect();
    tg.stop();
    game?.destroy(true);
    game = null;
    officeScene = null;
  });

  const getStatusColor = (s: string) =>
    ({ idle: "#555", working: "#00f2fe", reviewing: "#f39c12", meeting: "#9b59b6", moving: "#2ecc71" }[s] || "#555");

  const agentsByDept = (dept: string) => agents().filter((a) => a.department === dept);

  return (
    <div class="studio-root font-pixel">
      <div class="worker-dashboard">

        {/* ===== LEFT SIDEBAR ===== */}
        <aside class="sidebar side-left">
          <div class="sidebar-header">
            <div class="header-logo">P</div>
            <div>
              <div class="text-sm font-bold tracking-wider text-white">PIXEL AGENT STUDIO</div>
              <div class="text-[11px] text-gray-500 mt-0.5">
                {gameReady() ? (
                  <span class="text-emerald-400">● 엔진 가동 중</span>
                ) : (
                  <span class="text-yellow-400 animate-pulse">○ 로딩 중...</span>
                )}
                <span class="ml-2 text-gray-600">v0.1.0</span>
              </div>
            </div>
          </div>

          <div class="sidebar-scroll no-scrollbar">
            {/* Selected Agent Detail */}
            <Show when={selectedAgent()}>
              {(agent) => (
                <div class="agent-detail-panel">
                  <div class="flex items-center gap-3">
                    <div
                      class="agent-detail-avatar"
                      style={{
                        "border-color": agent().color,
                        "background-image": `url(/assets/character/${agent().sprite}.png)`,
                        "background-size": "2496px 72px",
                        "background-position": "-866px -10px",
                        "background-repeat": "no-repeat",
                        "image-rendering": "pixelated",
                      }}
                    />
                    <div class="flex-1 min-w-0">
                      <div class="text-base font-bold" style={{ color: agent().color }}>{agent().name}</div>
                      <div class="text-[12px] text-gray-400">{agent().title} · {agent().role}</div>
                    </div>
                    <button class="close-btn" onClick={() => setSelectedAgent(null)}>
                      <X class="w-3 h-3" />
                    </button>
                  </div>
                  <div class="mt-3 grid grid-cols-2 gap-2">
                    <div class="detail-stat">
                      <span class="detail-stat-label">전문</span>
                      <span class="detail-stat-value">{agent().specialty}</span>
                    </div>
                    <div class="detail-stat">
                      <span class="detail-stat-label">레벨</span>
                      <span class="detail-stat-value">{agent().level}</span>
                    </div>
                    <div class="detail-stat">
                      <span class="detail-stat-label">완료</span>
                      <span class="detail-stat-value">{agent().completed_tasks}</span>
                    </div>
                    <div class="detail-stat">
                      <span class="detail-stat-label">상태</span>
                      <span class="detail-stat-value flex items-center gap-1">
                        <span class="w-1.5 h-1.5 rounded-full" style={{ background: getStatusColor(agent().status) }} />
                        {agent().status}
                      </span>
                    </div>
                  </div>
                  <div class="mt-2 text-[12px] text-gray-500 px-2 py-1.5 bg-black/40 border border-gray-800">
                    📋 {agent().current_task}
                  </div>
                  <div class="mt-1.5 text-[11px] px-2 py-1 bg-emerald-950/30 border border-emerald-900/50 rounded">
                    <span class="text-emerald-400">🧠 전문가 페르소나</span>
                    <span class="text-gray-500 ml-1">
                      {persona.getPersonaSync(agent().id) ? "로드됨" : "로딩 중..."}
                    </span>
                  </div>
                </div>
              )}
            </Show>

            {/* Agent List by Department */}
            <For each={DEPARTMENTS}>
              {(dept) => {
                const DeptIcon = dept.icon;
                return (
                  <Show when={agentsByDept(dept.key).length > 0}>
                    <div class="dept-section">
                      <div class="dept-header">
                        <DeptIcon class="w-3 h-3 text-gray-500" />
                        <span>{dept.label}</span>
                      </div>
                      <For each={agentsByDept(dept.key)}>
                        {(a) => (
                          <div
                            class={`agent-card ${selectedAgent()?.id === a.id ? "active" : ""}`}
                            onClick={() => { setSelectedAgent(a); officeScene?.focusAgent(a.id); }}
                          >
                            <div
                              class="agent-card-avatar"
                              style={{
                                "border-color": a.color,
                                "background-image": `url(/assets/character/${a.sprite}.png)`,
                                "background-size": "2496px 72px",
                                "background-position": "-873px -18px",
                                "background-repeat": "no-repeat",
                                "image-rendering": "pixelated",
                              }}
                            />
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-1.5">
                                <span class="text-sm font-bold text-white">{a.name}</span>
                                <span class="agent-status-dot" style={{ background: getStatusColor(a.status) }} />
                              </div>
                              <div class="text-[11px] text-gray-500 truncate">{a.current_task}</div>
                            </div>
                            <div class="text-[10px] text-gray-600 font-bold shrink-0">{a.role}</div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                );
              }}
            </For>
          </div>

          {/* Bottom Settings Bar */}
          <div class="sidebar-footer">
            <button class="settings-btn" onClick={() => setShowSettings(true)}>
              <Settings class="w-4 h-4" />
              <span>설정</span>
            </button>
            <div class="flex-1 flex items-center justify-end gap-2">
              <Show when={tgConfig().enabled}>
                <span class={`oc-status-badge ${tgConnected() ? "connected" : "disconnected"}`}
                      style={{ "--badge-color": "#0088cc" } as Record<string, string>}>
                  <MessageCircle class="w-3 h-3" />
                  <span>TG</span>
                </span>
              </Show>
              <Show when={ocConfig().enabled}>
                <span class={`oc-status-badge ${ocStatus()}`}>
                  {ocStatus() === "connected" ? <Wifi class="w-3 h-3" /> : <WifiOff class="w-3 h-3" />}
                  <span>OC</span>
                </span>
              </Show>
              <span class="text-[10px] text-gray-600 truncate">
                {llmConfig().api_key ? llmConfig().model.split("/").pop() : ""}
              </span>
            </div>
          </div>
        </aside>

        {/* ===== CENTER - Phaser3 ===== */}
        <main class="viewport-main">
          <header class="hud-header">
            <div class="hud-left">
              <Activity class="w-4 h-4 text-green-400" />
              <span>SKYOFFICE ENGINE</span>
            </div>
            <div class="hud-right">
              <Show when={gameReady()}>
                <div class="stat-pill">LIVE</div>
              </Show>
              <Show when={selectedAgent()}>
                <div class="stat-pill" style={{ color: selectedAgent()!.color }}>
                  {selectedAgent()!.name}
                </div>
              </Show>
            </div>
          </header>
          <div class="game-container" ref={gameContainerRef} />
        </main>

        {/* ===== RIGHT SIDEBAR ===== */}
        <aside class="sidebar side-right">
          <div class="sidebar-header">
            <Terminal class="w-5 h-5 text-cyan-400" />
            <span>COMMS</span>
          </div>
          <div class="comms-area">
            <div class="messages-scroll no-scrollbar ko-text" ref={chatContainerRef}>
              <Show
                when={chatMessages().length > 0}
                fallback={
                  <div class="empty-comms">
                    <Terminal class="w-8 h-8 mb-2 opacity-30" />
                    <span class="text-xs opacity-30">대기 중...</span>
                  </div>
                }
              >
                <For each={chatMessages()}>
                  {(m) => (
                    <div class={`msg-block ${m.message_type === "tool_call" || m.message_type === "tool_result" ? "msg-tool" : ""} ${m.message_type === "error" ? "msg-error" : ""}`}>
                      <div class="m-meta">
                        <span style={{ color: m.agent_color }}>{m.agent_name}</span>
                        <span class="text-gray-600">{m.timestamp}</span>
                      </div>
                      <div class={`m-content ${m.message_type === "tool_call" || m.message_type === "tool_result" ? "m-content-tool" : ""}`}>
                        {m.content}
                      </div>
                    </div>
                  )}
                </For>
              </Show>
            </div>
            <div class="comms-input-bar">
              <textarea
                ref={inputRef}
                class="comms-input"
                placeholder={selectedAgent() ? `${selectedAgent()!.name} (${selectedAgent()!.role}) 전문가에게 질문...` : "에이전트를 선택하고 메시지..."}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button class="pixel-btn-send" onClick={handleSend}>
                <Send class="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ===== LLM SETTINGS MODAL ===== */}
      <Show when={showSettings()}>
        <SettingsModal
          config={llmConfig()}
          ocConfig={ocConfig()}
          ocStatus={ocStatus()}
          tgConfig={tgConfig()}
          tgConnected={tgConnected()}
          onSave={saveLlmConfig}
          onSaveOc={saveOcConfig}
          onSaveTg={saveTgConfig}
          onClose={() => setShowSettings(false)}
        />
      </Show>
    </div>
  );
}


/* ===== Settings Modal Component ===== */
function SettingsModal(props: {
  config: LLMConfig;
  ocConfig: OpenClawConfig;
  ocStatus: ConnectionStatus;
  tgConfig: TelegramConfig;
  tgConnected: boolean;
  onSave: (c: LLMConfig) => void;
  onSaveOc: (c: OpenClawConfig) => void;
  onSaveTg: (c: TelegramConfig) => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = createSignal(props.config.provider);
  const [apiKey, setApiKey] = createSignal(props.config.api_key);
  const [model, setModel] = createSignal(props.config.model);
  const [showKey, setShowKey] = createSignal(false);

  const [ocEnabled, setOcEnabled] = createSignal(props.ocConfig.enabled);
  const [ocHost, setOcHost] = createSignal(props.ocConfig.host);
  const [ocPort, setOcPort] = createSignal(props.ocConfig.port);
  const [ocToken, setOcToken] = createSignal(props.ocConfig.token);

  const [tgEnabled, setTgEnabled] = createSignal(props.tgConfig.enabled);
  const [tgBotToken, setTgBotToken] = createSignal(props.tgConfig.botToken);
  const [tgChatId, setTgChatId] = createSignal(props.tgConfig.chatId);
  const [tgVerifyStatus, setTgVerifyStatus] = createSignal<string>("");

  const currentModels = () => {
    const p = LLM_PROVIDERS.find((lp) => lp.id === provider());
    return p ? [...p.models] : [];
  };

  const statusLabel = () => {
    const s = props.ocStatus;
    if (s === "connected") return "연결됨";
    if (s === "connecting") return "연결 중...";
    if (s === "error") return "오류";
    return "미연결";
  };

  const statusColor = () => {
    const s = props.ocStatus;
    if (s === "connected") return "#2ecc71";
    if (s === "connecting") return "#f39c12";
    if (s === "error") return "#e74c3c";
    return "#555";
  };

  async function handleVerifyTgBot() {
    if (!tgBotToken()) { setTgVerifyStatus("❌ 봇 토큰을 입력하세요"); return; }
    setTgVerifyStatus("확인 중...");
    tg.configure({ enabled: true, botToken: tgBotToken(), chatId: tgChatId() });
    const result = await tg.verifyBot();
    setTgVerifyStatus(result.ok ? `✅ @${result.username}` : `❌ ${result.error}`);
  }

  function handleSaveAll() {
    props.onSave({ provider: provider(), api_key: apiKey(), model: model() });
    props.onSaveOc({ enabled: ocEnabled(), host: ocHost(), port: ocPort(), token: ocToken() });
    props.onSaveTg({ enabled: tgEnabled(), botToken: tgBotToken(), chatId: tgChatId() });
  }

  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
      <div class="modal-panel">
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <Settings class="w-5 h-5 text-cyan-400" />
            <span class="text-sm font-bold">설정</span>
          </div>
          <button class="close-btn" onClick={props.onClose}>
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="modal-body">
          {/* OpenClaw Section */}
          <div class="setting-section">
            <div class="setting-section-title">
              <Wifi class="w-4 h-4 text-orange-400" />
              <span>OpenClaw Gateway</span>
              <span class="ml-auto text-[11px] font-normal flex items-center gap-1">
                <span class="w-2 h-2 rounded-full" style={{ background: statusColor() }} />
                {statusLabel()}
              </span>
            </div>

            <div class="setting-row">
              <label class="setting-label flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ocEnabled()}
                  onChange={(e) => setOcEnabled(e.currentTarget.checked)}
                  class="accent-orange-400"
                />
                Gateway 연결 활성화
              </label>
            </div>

            <Show when={ocEnabled()}>
              <div class="setting-row">
                <label class="setting-label">Host</label>
                <div class="flex gap-2 w-full">
                  <input
                    class="setting-input flex-1"
                    value={ocHost()}
                    onInput={(e) => setOcHost(e.currentTarget.value)}
                    placeholder="127.0.0.1"
                  />
                  <input
                    class="setting-input"
                    style={{ width: "80px" }}
                    type="number"
                    value={ocPort()}
                    onInput={(e) => setOcPort(parseInt(e.currentTarget.value) || 18789)}
                    placeholder="18789"
                  />
                </div>
              </div>
              <div class="setting-row">
                <label class="setting-label">Token (선택)</label>
                <input
                  class="setting-input w-full"
                  type="password"
                  value={ocToken()}
                  onInput={(e) => setOcToken(e.currentTarget.value)}
                  placeholder="비워두면 localhost 신뢰"
                />
              </div>
              <div class="text-[10px] text-gray-600 px-1 leading-relaxed">
                OpenClaw Gateway가 로컬에서 실행 중이어야 합니다.
                <code class="text-orange-400/70 ml-1">openclaw gateway start</code>
              </div>
            </Show>
          </div>

          {/* Telegram Section */}
          <div class="setting-section">
            <div class="setting-section-title">
              <MessageCircle class="w-4 h-4 text-sky-400" />
              <span>Telegram 봇</span>
              <span class="ml-auto text-[11px] font-normal flex items-center gap-1">
                <span class="w-2 h-2 rounded-full" style={{ background: props.tgConnected ? "#2ecc71" : "#555" }} />
                {props.tgConnected ? "연결됨" : "미연결"}
              </span>
            </div>

            <div class="setting-row">
              <label class="setting-label flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={tgEnabled()}
                  onChange={(e) => setTgEnabled(e.currentTarget.checked)}
                  class="accent-sky-400"
                />
                Telegram 브릿지 활성화
              </label>
            </div>

            <Show when={tgEnabled()}>
              <div class="setting-row">
                <label class="setting-label">Bot Token</label>
                <div class="flex gap-2 w-full">
                  <input
                    class="setting-input flex-1"
                    type="password"
                    value={tgBotToken()}
                    onInput={(e) => setTgBotToken(e.currentTarget.value)}
                    placeholder="123456:ABC-DEF..."
                  />
                  <button class="key-toggle" onClick={handleVerifyTgBot}>검증</button>
                </div>
              </div>
              <Show when={tgVerifyStatus()}>
                <div class="text-[11px] px-1 py-0.5"
                     classList={{ "text-emerald-400": tgVerifyStatus().startsWith("✅"), "text-red-400": tgVerifyStatus().startsWith("❌"), "text-yellow-400": !tgVerifyStatus().startsWith("✅") && !tgVerifyStatus().startsWith("❌") }}>
                  {tgVerifyStatus()}
                </div>
              </Show>
              <div class="setting-row">
                <label class="setting-label">Chat ID</label>
                <input
                  class="setting-input w-full"
                  value={tgChatId()}
                  onInput={(e) => setTgChatId(e.currentTarget.value)}
                  placeholder="개인 채팅 ID (숫자)"
                />
              </div>
              <div class="text-[10px] text-gray-600 px-1 leading-relaxed">
                @BotFather에서 봇 생성 후 토큰을 입력하세요.
                Chat ID는 봇에게 메시지 보낸 뒤
                <code class="text-sky-400/70 ml-1">/getUpdates</code>로 확인 가능합니다.
              </div>
            </Show>
          </div>

          {/* LLM Section */}
          <div class="setting-section">
            <div class="setting-section-title">
              <Cpu class="w-4 h-4 text-purple-400" />
              <span>LLM 설정 (직접 연결)</span>
            </div>

            <div class="setting-row">
              <label class="setting-label">Provider</label>
              <select
                class="setting-select"
                value={provider()}
                onChange={(e) => {
                  setProvider(e.currentTarget.value as "openrouter");
                  const p = LLM_PROVIDERS.find((lp) => lp.id === e.currentTarget.value);
                  if (p) setModel(p.models[0]);
                }}
              >
                <For each={[...LLM_PROVIDERS]}>
                  {(p) => <option value={p.id}>{p.name}</option>}
                </For>
              </select>
            </div>

            <div class="setting-row">
              <label class="setting-label">API Key</label>
              <div class="flex gap-2 w-full">
                <input
                  class="setting-input flex-1"
                  type={showKey() ? "text" : "password"}
                  placeholder="sk-or-..."
                  value={apiKey()}
                  onInput={(e) => setApiKey(e.currentTarget.value)}
                />
                <button class="key-toggle" onClick={() => setShowKey(!showKey())}>
                  {showKey() ? "숨기기" : "보기"}
                </button>
              </div>
            </div>

            <div class="setting-row">
              <label class="setting-label">Model</label>
              <select
                class="setting-select"
                value={model()}
                onChange={(e) => setModel(e.currentTarget.value)}
              >
                <For each={currentModels()}>
                  {(m) => <option value={m}>{m.split("/").pop()}</option>}
                </For>
              </select>
            </div>
          </div>

          <div class="setting-section">
            <div class="setting-section-title">
              <Activity class="w-4 h-4 text-green-400" />
              <span>엔진 정보</span>
            </div>
            <div class="grid grid-cols-2 gap-3 text-[11px]">
              <div class="info-chip"><span class="text-gray-500">Phaser</span> <span>v3.90</span></div>
              <div class="info-chip"><span class="text-gray-500">Agents</span> <span>8</span></div>
              <div class="info-chip"><span class="text-gray-500">Map</span> <span>SkyOffice</span></div>
              <div class="info-chip"><span class="text-gray-500">Framework</span> <span>SolidJS</span></div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="modal-btn-cancel" onClick={props.onClose}>취소</button>
          <button class="modal-btn-save" onClick={handleSaveAll}>저장</button>
        </div>
      </div>
    </div>
  );
}
