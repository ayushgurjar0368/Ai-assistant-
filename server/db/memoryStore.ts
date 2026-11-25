import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  confidence: number; // 0.0 - 1.0 (e.g. >= 0.9 strongly confirmed, 0.7-0.89 likely)
  importance: number; // 0.0 - 1.0 (0.9 critical, 0.7 important, 0.5 useful, 0.3 minor)
  embedding?: number[];
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

interface DatabaseSchema {
  memories: MemoryItem[];
  settings: Record<string, UserSettings>;
  version: number;
}

// Compute cosine similarity between two numeric vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class MemoryStore {
  private dbPath: string;
  private data: DatabaseSchema = {
    memories: [],
    settings: {},
    version: 1,
  };
  private ai: GoogleGenAI | null = null;
  private isLoaded = false;

  constructor(customPath?: string) {
    const dataDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (e) {
        // ignore
      }
    }
    this.dbPath = customPath || path.join(dataDir, 'tojuu-memories.json');

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
    }
  }

  public async init(): Promise<void> {
    if (this.isLoaded) return;
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = await fs.promises.readFile(this.dbPath, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        await this.persist();
      }
      this.isLoaded = true;
    } catch (err) {
      console.error('[MemoryStore] Failed to load database file, initializing empty:', err);
      this.data = { memories: [], settings: {}, version: 1 };
      await this.persist();
      this.isLoaded = true;
    }
  }

  private async persist(): Promise<void> {
    try {
      const tempPath = `${this.dbPath}.tmp`;
      await fs.promises.writeFile(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      await fs.promises.rename(tempPath, this.dbPath);
    } catch (err) {
      console.error('[MemoryStore] Error persisting database to disk:', err);
    }
  }

  public async getEmbedding(text: string): Promise<number[] | undefined> {
    if (!this.ai || !text || text.trim().length === 0) return undefined;
    try {
      const res = await this.ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: text.trim(),
      });
      const values = res.embeddings?.[0]?.values;
      if (Array.isArray(values) && values.length > 0) {
        return values;
      }
    } catch (e) {
      // Embedding failure shouldn't block memory creation
    }
    return undefined;
  }

  public async getUserSettings(userId: string): Promise<UserSettings> {
    await this.init();
    if (!this.data.settings[userId]) {
      this.data.settings[userId] = {
        userId,
        memoryEnabled: true,
        voice: 'Aoede',
        auraMood: 'cyberpunk',
        updatedAt: new Date().toISOString(),
      };
      await this.persist();
    }
    return this.data.settings[userId];
  }

  public async updateUserSettings(userId: string, updates: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getUserSettings(userId);
    this.data.settings[userId] = {
      ...current,
      ...updates,
      userId,
      updatedAt: new Date().toISOString(),
    };
    await this.persist();
    return this.data.settings[userId];
  }

  public async getAllMemories(userId: string, category?: MemoryCategory, onlyActive = true): Promise<MemoryItem[]> {
    await this.init();
    return this.data.memories
      .filter((m) => {
        if (m.userId !== userId) return false;
        if (onlyActive && !m.active) return false;
        if (category && m.type !== category) return false;
        return true;
      })
      .map(({ embedding, ...rest }) => rest as MemoryItem)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getMemoryById(id: string): Promise<MemoryItem | null> {
    await this.init();
    const item = this.data.memories.find((m) => m.id === id);
    return item || null;
  }

  public async createMemory(
    params: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'embedding'>
  ): Promise<MemoryItem> {
    await this.init();

    // Check if memory is enabled for user
    const settings = await this.getUserSettings(params.userId);
    if (!settings.memoryEnabled) {
      console.log(`[MemoryStore] Memory disabled for user ${params.userId}. Skipping create.`);
      const skippedItem: MemoryItem = {
        ...params,
        id: uuidv4(),
        active: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return skippedItem;
    }

    // Check for existing similar memory by key to supersede/merge
    const existing = this.data.memories.find(
      (m) =>
        m.userId === params.userId &&
        m.active &&
        ((params.key && m.key && m.key.toLowerCase() === params.key.toLowerCase()) ||
          (m.type === params.type && m.content.toLowerCase() === params.content.toLowerCase()))
    );

    const now = new Date().toISOString();
    let embedding: number[] | undefined = undefined;
    try {
      embedding = await this.getEmbedding(params.content);
    } catch (e) {
      // ignore
    }

    if (existing) {
      // Supersede old memory with updated information
      existing.content = params.content;
      existing.value = params.value || existing.value;
      existing.confidence = params.confidence;
      existing.importance = Math.max(existing.importance, params.importance);
      existing.updatedAt = now;
      existing.source = params.source || 'conversation_update';
      if (embedding) existing.embedding = embedding;

      await this.persist();
      return existing;
    }

    const newItem: MemoryItem = {
      ...params,
      id: uuidv4(),
      embedding,
      createdAt: now,
      updatedAt: now,
      active: params.active !== false,
    };

    this.data.memories.push(newItem);
    await this.persist();
    return newItem;
  }

  public async updateMemory(id: string, updates: Partial<MemoryItem>): Promise<MemoryItem | null> {
    await this.init();
    const item = this.data.memories.find((m) => m.id === id);
    if (!item) return null;

    Object.assign(item, updates);
    item.updatedAt = new Date().toISOString();

    if (updates.content && updates.content !== item.content) {
      try {
        const emb = await this.getEmbedding(updates.content);
        if (emb) item.embedding = emb;
      } catch (e) {
        // ignore
      }
    }

    await this.persist();
    return item;
  }

  public async deleteMemory(id: string): Promise<boolean> {
    await this.init();
    const index = this.data.memories.findIndex((m) => m.id === id);
    if (index === -1) return false;

    this.data.memories.splice(index, 1);
    await this.persist();
    return true;
  }

  public async deleteMemoryByContentOrKey(userId: string, query: string): Promise<number> {
    await this.init();
    const lower = query.toLowerCase();
    const beforeCount = this.data.memories.length;

    this.data.memories = this.data.memories.filter((m) => {
      if (m.userId !== userId) return true;
      const matchKey = m.key && m.key.toLowerCase().includes(lower);
      const matchVal = m.value && m.value.toLowerCase().includes(lower);
      const matchContent = m.content && m.content.toLowerCase().includes(lower);
      return !(matchKey || matchVal || matchContent);
    });

    const deleted = beforeCount - this.data.memories.length;
    if (deleted > 0) {
      await this.persist();
    }
    return deleted;
  }

  public async deleteAllMemories(userId: string): Promise<number> {
    await this.init();
    const beforeCount = this.data.memories.length;
    this.data.memories = this.data.memories.filter((m) => m.userId !== userId);
    const deleted = beforeCount - this.data.memories.length;
    await this.persist();
    return deleted;
  }

  public async searchMemories(
    userId: string,
    query: string,
    limit = 6,
    minConfidence = 0.5
  ): Promise<MemoryItem[]> {
    await this.init();
    const userMemories = this.data.memories.filter(
      (m) => m.userId === userId && m.active && m.confidence >= minConfidence
    );

    if (userMemories.length === 0) return [];

    let queryEmbedding: number[] | undefined;
    try {
      queryEmbedding = await this.getEmbedding(query);
    } catch (e) {
      // ignore
    }

    const scored = userMemories.map((m) => {
      let score = 0;
      const lowerQuery = query.toLowerCase();

      // Keyword / Substring match
      if (m.content.toLowerCase().includes(lowerQuery)) score += 0.6;
      if (m.key && m.key.toLowerCase().includes(lowerQuery)) score += 0.8;
      if (m.value && m.value.toLowerCase().includes(lowerQuery)) score += 0.7;

      // Semantic Vector match if available
      if (queryEmbedding && m.embedding && m.embedding.length > 0) {
        const sim = cosineSimilarity(queryEmbedding, m.embedding);
        score += sim * 1.0;
      }

      // Weight by importance and confidence
      score += m.importance * 0.3;
      score += (m.confidence - 0.5) * 0.2;

      return { item: m, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => {
      const { embedding, ...rest } = s.item;
      return rest as MemoryItem;
    });
  }

  public async getRelevantContextForSession(userId: string, sessionTopic?: string): Promise<string> {
    await this.init();
    const settings = await this.getUserSettings(userId);
    if (!settings.memoryEnabled) {
      return '';
    }

    const all = await this.getAllMemories(userId, undefined, true);
    if (all.length === 0) {
      return '';
    }

    // Group memories into clean sections for the AI system instruction
    const profile = all.filter((m) => m.type === 'profile');
    const preferences = all.filter((m) => m.type === 'preference');
    const dislikes = all.filter((m) => m.type === 'dislike');
    const projects = all.filter((m) => m.type === 'project');
    const facts = all.filter((m) => ['fact', 'habit', 'hobby', 'interest', 'technical_skill'].includes(m.type));
    const summaries = all.filter((m) => m.type === 'conversation_summary').slice(0, 3);

    let context = 'LONG-TERM MEMORIES ABOUT THIS USER:\n';

    if (profile.length > 0) {
      context += '\n[Profile & Identity]\n';
      profile.forEach((p) => (context += `- ${p.content}\n`));
    }

    if (projects.length > 0) {
      context += '\n[Active Projects]\n';
      projects.forEach((p) => (context += `- ${p.content}\n`));
    }

    if (preferences.length > 0) {
      context += '\n[User Preferences]\n';
      preferences.slice(0, 8).forEach((p) => (context += `- ${p.content}\n`));
    }

    if (dislikes.length > 0) {
      context += '\n[User Dislikes]\n';
      dislikes.slice(0, 5).forEach((d) => (context += `- ${d.content}\n`));
    }

    if (facts.length > 0) {
      context += '\n[Key Facts & Habits]\n';
      facts.slice(0, 8).forEach((f) => (context += `- ${f.content}\n`));
    }

    if (summaries.length > 0) {
      context += '\n[Recent Conversation Summaries]\n';
      summaries.forEach((s) => (context += `- ${s.content}\n`));
    }

    context += `\nGuidelines for using memories:
- Speak naturally like a consistent AI companion who genuinely knows the user.
- NEVER recite memory IDs, database fields, or confidence scores.
- Do NOT force memories into every sentence; reference them casually when naturally relevant (e.g., "Late-night coding? Coffee poured?").
- If the user contradicts an old memory, ALWAYS trust the user's latest statement and invoke saveMemory or deleteMemory tools accordingly.
- If asked to remember or forget something, use the available memory tools immediately.`;

    return context;
  }
}

export const memoryStore = new MemoryStore();
