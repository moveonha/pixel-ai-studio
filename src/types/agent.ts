export type AgentRole = 'PM' | 'RESEARCHER' | 'ARCHITECT' | 'FRONTEND' | 'BACKEND' | 'DESIGNER' | 'QA' | 'DEVOPS';
export type AgentStatus = 'idle' | 'working' | 'reviewing' | 'blocked' | 'completed' | 'meeting' | 'moving';
export type ProjectPhase = 'IDLE' | 'PLANNING' | 'ARCHITECTURE' | 'DEVELOPMENT' | 'REVIEW' | 'DEPLOY';

export interface Agent {
  id: string; name: string; role: AgentRole; title: string; status: AgentStatus;
  current_task: string; x: number; y: number; color: string;
  skills: { name: string; level: number; description: string }[];
  avatar: string; sprite: 'adam' | 'ash' | 'lucy' | 'nancy';
  specialty: string; desk_x: number; desk_y: number;
  department: 'STRATEGY' | 'PRODUCT' | 'ENGINEERING' | 'RELIABILITY';
  level: number; completed_tasks: number;
  persona: string;
}

export interface AgentMessage {
  id: string; agent_id: string; agent_name: string; agent_color: string;
  role: 'user' | 'assistant' | 'system'; content: string;
  timestamp: string; message_type: 'chat' | 'think' | 'action' | 'error' | 'tool_call' | 'tool_result';
}

export interface LLMConfig { provider: 'openrouter'; api_key: string; model: string; }

export interface OpenClawConfig {
  enabled: boolean;
  host: string;
  port: number;
  token: string;
}

export const DEFAULT_OPENCLAW_CONFIG: OpenClawConfig = {
  enabled: false,
  host: '127.0.0.1',
  port: 18789,
  token: '',
};

/*
 * Desk positions mapped to actual SkyOffice map chair/computer locations
 *
 * Right side office (computers + chairs):
 *   Row 1 (y≈480-576): chairs at (992,576↑) (1088,480↓/576↑) (1184,480↓/576↑)
 *   Row 2 (y≈736-832): chairs at (992,736↓/832↑) (1088,736↓) (1184,736↓/832↑)
 *
 * Left rooms:
 *   Row of down-chairs y=416: x=224,256,288,480,512,544,576
 *   Meeting chairs: (448,282→) (448,328→) (544,282←) (544,328←)
 *   Conference top: (640,128↓) (672,128↓) (704,128↓)
 */
export const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'pm', name: 'ALEX', role: 'PM', title: 'Director', status: 'working', current_task: '프로젝트 관리',
    x: 1184, y: 480, desk_x: 1184, desk_y: 480, color: '#FF6B6B', avatar: '👔', sprite: 'adam',
    specialty: '프로젝트 총괄', department: 'STRATEGY', level: 99, completed_tasks: 124,
    skills: [{ name: 'Agile', level: 5, description: '' }], persona: 'pm',
  },
  {
    id: 'researcher', name: 'NOVA', role: 'RESEARCHER', title: 'Analyst', status: 'working', current_task: '기술 리서치',
    x: 1088, y: 480, desk_x: 1088, desk_y: 480, color: '#9B59B6', avatar: '🔬', sprite: 'ash',
    specialty: '기술 분석', department: 'STRATEGY', level: 85, completed_tasks: 89,
    skills: [{ name: 'Research', level: 5, description: '' }], persona: 'researcher',
  },
  {
    id: 'architect', name: 'TITAN', role: 'ARCHITECT', title: 'Architect', status: 'working', current_task: '설계 작업',
    x: 992, y: 576, desk_x: 992, desk_y: 576, color: '#3498DB', avatar: '🏗️', sprite: 'lucy',
    specialty: '시스템 설계', department: 'PRODUCT', level: 92, completed_tasks: 56,
    skills: [{ name: 'Architecture', level: 5, description: '' }], persona: 'architect',
  },
  {
    id: 'designer', name: 'AURORA', role: 'DESIGNER', title: 'Lead Designer', status: 'working', current_task: 'UI 디자인',
    x: 1088, y: 576, desk_x: 1088, desk_y: 576, color: '#E91E63', avatar: '✨', sprite: 'nancy',
    specialty: '비주얼 디자인', department: 'PRODUCT', level: 88, completed_tasks: 210,
    skills: [{ name: 'Figma', level: 5, description: '' }], persona: 'designer',
  },
  {
    id: 'frontend', name: 'PIXEL', role: 'FRONTEND', title: 'UI Engineer', status: 'working', current_task: '컴포넌트 작업',
    x: 1184, y: 576, desk_x: 1184, desk_y: 576, color: '#00D9FF', avatar: '🎨', sprite: 'ash',
    specialty: 'UI 구현', department: 'ENGINEERING', level: 82, completed_tasks: 145,
    skills: [{ name: 'React', level: 5, description: '' }], persona: 'frontend',
  },
  {
    id: 'backend', name: 'CORE', role: 'BACKEND', title: 'Server Engineer', status: 'working', current_task: 'API 개발',
    x: 992, y: 736, desk_x: 992, desk_y: 736, color: '#2ECC71', avatar: '⚙️', sprite: 'adam',
    specialty: 'API/DB', department: 'ENGINEERING', level: 90, completed_tasks: 112,
    skills: [{ name: 'Node.js', level: 5, description: '' }], persona: 'backend',
  },
  {
    id: 'qa', name: 'SHIELD', role: 'QA', title: 'QA Lead', status: 'working', current_task: '테스트 작성',
    x: 1088, y: 736, desk_x: 1088, desk_y: 736, color: '#F39C12', avatar: '🛡️', sprite: 'nancy',
    specialty: '품질 보증', department: 'RELIABILITY', level: 87, completed_tasks: 340,
    skills: [{ name: 'Testing', level: 5, description: '' }], persona: 'qa',
  },
  {
    id: 'devops', name: 'FORGE', role: 'DEVOPS', title: 'SRE Engineer', status: 'working', current_task: '배포 파이프라인',
    x: 1184, y: 736, desk_x: 1184, desk_y: 736, color: '#1ABC9C', avatar: '🚀', sprite: 'lucy',
    specialty: '인프라 구축', department: 'RELIABILITY', level: 94, completed_tasks: 78,
    skills: [{ name: 'Docker', level: 5, description: '' }], persona: 'devops',
  },
];

export const AGENT_ZONES = [
  { x: 1, y: 1, w: 5, h: 5, color: '#FF6B6B', name: 'STRATEGY' },
  { x: 7, y: 1, w: 5, h: 5, color: '#3498DB', name: 'PRODUCT' },
  { x: 1, y: 7, w: 5, h: 5, color: '#2ECC71', name: 'ENGINEERING' },
  { x: 7, y: 7, w: 5, h: 5, color: '#F39C12', name: 'RELIABILITY' },
] as const;

export const LLM_PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', models: ['arcee-ai/trinity-large-preview:free', 'anthropic/claude-3.5-sonnet'] },
] as const;
