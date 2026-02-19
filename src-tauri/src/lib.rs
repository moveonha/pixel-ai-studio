use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use axum::{
    routing::post,
    extract::Json,
    Router,
};
use tower_http::cors::CorsLayer;

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalPrompt {
    pub prompt: String,
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMConfig {
    pub provider: String, // "openai", "anthropic", "ollama"
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    pub id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub role: String, // "user", "assistant", "system"
    pub content: String,
    pub timestamp: String,
    pub message_type: String, // "chat", "think", "action", "error"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub system_prompt: String,
    pub skills: Vec<String>,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub agent_id: String,
    pub message: String,
    pub context: Option<Vec<AgentMessage>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDiscussionRequest {
    pub topic: String,
    pub participating_agents: Vec<String>,
    pub max_rounds: u32,
}

// ============================================
// State
// ============================================

pub struct AppState {
    pub config: Mutex<Option<LLMConfig>>,
    pub agents: Mutex<HashMap<String, Agent>>,
    pub conversation_history: Mutex<Vec<AgentMessage>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            config: Mutex::new(None),
            agents: Mutex::new(create_default_agents()),
            conversation_history: Mutex::new(Vec::new()),
        }
    }
}

fn create_default_agents() -> HashMap<String, Agent> {
    let mut agents = HashMap::new();

    agents.insert("pm".to_string(), Agent {
        id: "pm".to_string(),
        name: "ALEX".to_string(),
        role: "PM".to_string(),
        color: "#FF6B6B".to_string(),
        skills: vec!["Sprint Planning".to_string(), "Risk Management".to_string(), "Team Coordination".to_string()],
        system_prompt: r#"You are ALEX, an expert Project Manager AI. Your responsibilities:
- Plan and manage sprints effectively
- Coordinate team members and delegate tasks
- Identify risks and propose mitigations
- Ensure project timelines are met
- Communicate clearly with stakeholders
Always respond professionally and focus on actionable items."#.to_string(),
    });

    agents.insert("researcher".to_string(), Agent {
        id: "researcher".to_string(),
        name: "NOVA".to_string(),
        role: "RESEARCHER".to_string(),
        color: "#9B59B6".to_string(),
        skills: vec!["Tech Research".to_string(), "Documentation".to_string(), "API Analysis".to_string()],
        system_prompt: r#"You are NOVA, an expert Research Specialist AI. Your responsibilities:
- Research latest technologies and best practices
- Analyze APIs and third-party services
- Create comprehensive technical documentation
- Benchmark competitors and alternatives
- Provide data-driven recommendations
Always cite sources and provide evidence-based insights."#.to_string(),
    });

    agents.insert("architect".to_string(), Agent {
        id: "architect".to_string(),
        name: "TITAN".to_string(),
        role: "ARCHITECT".to_string(),
        color: "#3498DB".to_string(),
        skills: vec!["System Design".to_string(), "Tech Stack".to_string(), "Database Design".to_string()],
        system_prompt: r#"You are TITAN, an expert System Architect AI. Your responsibilities:
- Design scalable and maintainable system architectures
- Select optimal technology stacks
- Create database schemas and data models
- Define API contracts and interfaces
- Ensure security and performance best practices
Always consider trade-offs and explain your architectural decisions."#.to_string(),
    });

    agents.insert("frontend".to_string(), Agent {
        id: "frontend".to_string(),
        name: "PIXEL".to_string(),
        role: "FRONTEND".to_string(),
        color: "#00D9FF".to_string(),
        skills: vec!["React/Solid".to_string(), "TypeScript".to_string(), "CSS/Animation".to_string()],
        system_prompt: r#"You are PIXEL, an expert Frontend Developer AI. Your responsibilities:
- Build responsive and accessible user interfaces
- Write clean TypeScript/JavaScript code
- Implement smooth animations and interactions
- Optimize frontend performance
- Follow component-based architecture
Always write production-ready code with proper error handling."#.to_string(),
    });

    agents.insert("backend".to_string(), Agent {
        id: "backend".to_string(),
        name: "CORE".to_string(),
        role: "BACKEND".to_string(),
        color: "#2ECC71".to_string(),
        skills: vec!["API Development".to_string(), "Database".to_string(), "Authentication".to_string()],
        system_prompt: r#"You are CORE, an expert Backend Developer AI. Your responsibilities:
- Develop robust RESTful/GraphQL APIs
- Implement secure authentication systems
- Optimize database queries and schemas
- Handle error scenarios gracefully
- Write scalable microservices
Always prioritize security and performance in your implementations."#.to_string(),
    });

    agents.insert("designer".to_string(), Agent {
        id: "designer".to_string(),
        name: "AURORA".to_string(),
        role: "DESIGNER".to_string(),
        color: "#E91E63".to_string(),
        skills: vec!["UI Design".to_string(), "UX Research".to_string(), "Design System".to_string()],
        system_prompt: r#"You are AURORA, an expert UI/UX Designer AI. Your responsibilities:
- Create intuitive and beautiful user interfaces
- Conduct UX research and user testing
- Build consistent design systems
- Ensure accessibility standards (WCAG)
- Create interactive prototypes
Always prioritize user experience and visual consistency."#.to_string(),
    });

    agents.insert("qa".to_string(), Agent {
        id: "qa".to_string(),
        name: "SHIELD".to_string(),
        role: "QA".to_string(),
        color: "#F39C12".to_string(),
        skills: vec!["Test Automation".to_string(), "Bug Detection".to_string(), "Security Testing".to_string()],
        system_prompt: r#"You are SHIELD, an expert QA Engineer AI. Your responsibilities:
- Write comprehensive test cases
- Automate E2E and unit tests
- Detect and document bugs clearly
- Perform security vulnerability testing
- Ensure quality standards are met
Always be thorough and detail-oriented in finding issues."#.to_string(),
    });

    agents.insert("devops".to_string(), Agent {
        id: "devops".to_string(),
        name: "FORGE".to_string(),
        role: "DEVOPS".to_string(),
        color: "#1ABC9C".to_string(),
        skills: vec!["CI/CD".to_string(), "Docker/K8s".to_string(), "Cloud Infrastructure".to_string()],
        system_prompt: r#"You are FORGE, an expert DevOps Engineer AI. Your responsibilities:
- Set up CI/CD pipelines
- Manage container orchestration (Docker, Kubernetes)
- Configure cloud infrastructure (AWS, GCP, Azure)
- Implement monitoring and alerting
- Ensure high availability and disaster recovery
Always automate everything and document infrastructure as code."#.to_string(),
    });

    agents
}

// ============================================
// Commands
// ============================================

#[tauri::command]
async fn save_llm_config(
    state: State<'_, AppState>,
    config: LLMConfig,
) -> Result<String, String> {
    let mut config_lock = state.config.lock().map_err(|e| e.to_string())?;
    *config_lock = Some(config);
    Ok("Configuration saved".to_string())
}

#[tauri::command]
async fn get_llm_config(state: State<'_, AppState>) -> Result<Option<LLMConfig>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
async fn get_agents(state: State<'_, AppState>) -> Result<Vec<Agent>, String> {
    let agents = state.agents.lock().map_err(|e| e.to_string())?;
    Ok(agents.values().cloned().collect())
}

#[tauri::command]
async fn chat_with_agent(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: ChatRequest,
) -> Result<AgentMessage, String> {
    // Get config
    let config = {
        let config_lock = state.config.lock().map_err(|e| e.to_string())?;
        config_lock.clone().ok_or("LLM not configured. Please set API key first.")?
    };

    // Get agent
    let agent = {
        let agents = state.agents.lock().map_err(|e| e.to_string())?;
        agents.get(&request.agent_id).cloned().ok_or("Agent not found")?
    };

    // Build messages for LLM
    let messages = build_llm_messages(&agent, &request.message, request.context.as_ref());

    // Call LLM API
    let response = call_llm_api(&config, messages).await?;

    // Create response message
    let response_msg = AgentMessage {
        id: uuid::Uuid::new_v4().to_string(),
        agent_id: agent.id.clone(),
        agent_name: agent.name.clone(),
        role: "assistant".to_string(),
        content: response,
        timestamp: chrono::Utc::now().to_rfc3339(),
        message_type: "chat".to_string(),
    };

    // Store in history
    {
        let mut history = state.conversation_history.lock().map_err(|e| e.to_string())?;
        history.push(response_msg.clone());
    }

    // Emit event to frontend
    let _ = app.emit("agent-message", &response_msg);

    Ok(response_msg)
}

#[tauri::command]
async fn agent_discussion(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: AgentDiscussionRequest,
) -> Result<Vec<AgentMessage>, String> {
    let config = {
        let config_lock = state.config.lock().map_err(|e| e.to_string())?;
        config_lock.clone().ok_or("LLM not configured")?
    };

    let agents_map = {
        let agents = state.agents.lock().map_err(|e| e.to_string())?;
        agents.clone()
    };

    let mut discussion_messages: Vec<AgentMessage> = Vec::new();
    let mut context = format!("Topic for discussion: {}\n\n", request.topic);

    for round in 0..request.max_rounds {
        for agent_id in &request.participating_agents {
            if let Some(agent) = agents_map.get(agent_id) {
                let prompt = if round == 0 {
                    format!(
                        "We're discussing: {}\n\nAs {}, share your initial thoughts and recommendations from your area of expertise.",
                        request.topic, agent.role
                    )
                } else {
                    format!(
                        "Previous discussion:\n{}\n\nAs {}, respond to the discussion. Build on others' ideas, identify gaps, or suggest improvements.",
                        context, agent.role
                    )
                };

                let messages = build_llm_messages(&agent, &prompt, None);

                match call_llm_api(&config, messages).await {
                    Ok(response) => {
                        let msg = AgentMessage {
                            id: uuid::Uuid::new_v4().to_string(),
                            agent_id: agent.id.clone(),
                            agent_name: agent.name.clone(),
                            role: "assistant".to_string(),
                            content: response.clone(),
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            message_type: "think".to_string(),
                        };

                        context.push_str(&format!("\n{} ({}): {}\n", agent.name, agent.role, response));
                        discussion_messages.push(msg.clone());

                        // Emit each message as it comes
                        let _ = app.emit("agent-message", &msg);

                        // Small delay for natural conversation feel
                        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                    }
                    Err(e) => {
                        let error_msg = AgentMessage {
                            id: uuid::Uuid::new_v4().to_string(),
                            agent_id: agent.id.clone(),
                            agent_name: agent.name.clone(),
                            role: "assistant".to_string(),
                            content: format!("Error: {}", e),
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            message_type: "error".to_string(),
                        };
                        discussion_messages.push(error_msg.clone());
                        let _ = app.emit("agent-message", &error_msg);
                    }
                }
            }
        }
    }

    // Store all messages
    {
        let mut history = state.conversation_history.lock().map_err(|e| e.to_string())?;
        history.extend(discussion_messages.clone());
    }

    Ok(discussion_messages)
}

#[tauri::command]
async fn get_conversation_history(
    state: State<'_, AppState>,
) -> Result<Vec<AgentMessage>, String> {
    let history = state.conversation_history.lock().map_err(|e| e.to_string())?;
    Ok(history.clone())
}

#[tauri::command]
async fn clear_conversation(state: State<'_, AppState>) -> Result<(), String> {
    let mut history = state.conversation_history.lock().map_err(|e| e.to_string())?;
    history.clear();
    Ok(())
}

#[tauri::command]
async fn test_llm_connection(config: LLMConfig) -> Result<String, String> {
    let messages = vec![
        serde_json::json!({
            "role": "user",
            "content": "Say 'Connection successful!' in one line."
        })
    ];

    call_llm_api(&config, messages).await
}

// ============================================
// LLM API Helpers
// ============================================

fn build_llm_messages(
    agent: &Agent,
    user_message: &str,
    context: Option<&Vec<AgentMessage>>,
) -> Vec<serde_json::Value> {
    let mut messages = vec![
        serde_json::json!({
            "role": "system",
            "content": agent.system_prompt
        })
    ];

    // Add context if provided
    if let Some(ctx) = context {
        for msg in ctx.iter().take(10) { // Last 10 messages for context
            messages.push(serde_json::json!({
                "role": if msg.role == "assistant" { "assistant" } else { "user" },
                "content": format!("[{}] {}", msg.agent_name, msg.content)
            }));
        }
    }

    messages.push(serde_json::json!({
        "role": "user",
        "content": user_message
    }));

    messages
}

async fn call_llm_api(
    config: &LLMConfig,
    messages: Vec<serde_json::Value>,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    match config.provider.as_str() {
        "openai" => call_openai(&client, config, messages).await,
        "anthropic" => call_anthropic(&client, config, messages).await,
        "ollama" => call_ollama(&client, config, messages).await,
        "openrouter" => call_openrouter(&client, config, messages).await,
        _ => Err(format!("Unknown provider: {}", config.provider)),
    }
}

async fn call_openrouter(
    client: &reqwest::Client,
    config: &LLMConfig,
    messages: Vec<serde_json::Value>,
) -> Result<String, String> {
    let base_url = "https://openrouter.ai/api/v1";

    let response = client
        .post(format!("{}/chat/completions", base_url))
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://github.com/paulrobello/claude-office") // Required by OpenRouter
        .header("X-Title", "Pixel Agent Studio") // Required by OpenRouter
        .json(&serde_json::json!({
            "model": config.model,
            "messages": messages,
            "max_tokens": 2000,
            "temperature": 0.7
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("OpenRouter API error: {}", error_text));
    }

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid response format".to_string())
}

async fn call_openai(
    client: &reqwest::Client,
    config: &LLMConfig,
    messages: Vec<serde_json::Value>,
) -> Result<String, String> {
    let base_url = config.base_url.as_deref().unwrap_or("https://api.openai.com/v1");

    let response = client
        .post(format!("{}/chat/completions", base_url))
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": config.model,
            "messages": messages,
            "max_tokens": 2000,
            "temperature": 0.7
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error: {}", error_text));
    }

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    json["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid response format".to_string())
}

async fn call_anthropic(
    client: &reqwest::Client,
    config: &LLMConfig,
    messages: Vec<serde_json::Value>,
) -> Result<String, String> {
    let base_url = config.base_url.as_deref().unwrap_or("https://api.anthropic.com/v1");

    // Extract system message and convert format for Anthropic
    let system_content = messages.first()
        .and_then(|m| m["content"].as_str())
        .unwrap_or("");

    let anthropic_messages: Vec<serde_json::Value> = messages[1..]
        .iter()
        .map(|m| {
            serde_json::json!({
                "role": m["role"].as_str().unwrap_or("user"),
                "content": m["content"].as_str().unwrap_or("")
            })
        })
        .collect();

    let response = client
        .post(format!("{}/messages", base_url))
        .header("x-api-key", &config.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": config.model,
            "max_tokens": 2000,
            "system": system_content,
            "messages": anthropic_messages
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error: {}", error_text));
    }

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    json["content"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid response format".to_string())
}

async fn call_ollama(
    client: &reqwest::Client,
    config: &LLMConfig,
    messages: Vec<serde_json::Value>,
) -> Result<String, String> {
    let base_url = config.base_url.as_deref().unwrap_or("http://localhost:11434");

    let response = client
        .post(format!("{}/api/chat", base_url))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": config.model,
            "messages": messages,
            "stream": false
        }))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Ollama API error: {}", error_text));
    }

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    json["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid response format".to_string())
}

// ============================================
// App Entry
// ============================================

async fn start_server(app_handle: tauri::AppHandle) {
    let app_handle_clone = app_handle.clone();
    
    let app = Router::new()
        .route("/external/prompt", post(move |Json(payload): Json<ExternalPrompt>| {
            let h = app_handle_clone.clone();
            async move {
                println!("Received external prompt: {}", payload.prompt);
                let _ = h.emit("external-prompt", payload);
                "Prompt received"
            }
        }))
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3030").await.unwrap();
    println!("External API server listening on http://127.0.0.1:3030");
    axum::serve(listener, app).await.unwrap();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                start_server(app_handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_llm_config,
            get_llm_config,
            get_agents,
            chat_with_agent,
            agent_discussion,
            get_conversation_history,
            clear_conversation,
            test_llm_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
