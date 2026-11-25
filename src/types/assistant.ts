export type AssistantState = 'disconnected' | 'connecting' | 'listening' | 'speaking';

export type AuraMood = 'cyberpunk' | 'aurora' | 'deep_space' | 'sunset_blush' | 'electric_violet';

export type MemoryCategory =
  | 'profile'
  | 'preference'
  | 'dislike'
  | 'fact'
  | 'project'
  | 'goal'
  | 'interest'
  | 'hobby'
  | 'habit'
  | 'important_date'
  | 'communication_style'
  | 'technical_skill'
  | 'conversation_summary'
  | 'instruction';

export interface MemoryItem {
  id: string;
  userId: string;
  type: MemoryCategory;
  key?: string;
  value?: string;
  content: string;
  confidence: number;
  importance: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  source: string;
  active: boolean;
}

export interface UserSettings {
  userId: string;
  memoryEnabled: boolean;
  voice: string;
  auraMood: string;
  updatedAt: string;
}

export interface ToolCallExecution {
  id: string;
  name: string;
  args: Record<string, any>;
  status: 'executing' | 'success' | 'error';
  result?: any;
  timestamp: number;
}

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  gender: 'Female' | 'Male' | 'Neutral';
  vibe: string;
}

export interface LiveStats {
  connectedAt: number | null;
  durationSeconds: number;
  inputPackets: number;
  outputPackets: number;
  latencyMs: number;
}
