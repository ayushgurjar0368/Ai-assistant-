import { GoogleGenAI, Type } from '@google/genai';
import { memoryStore, MemoryCategory, MemoryItem } from '../db/memoryStore';

export class MemoryExtractor {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
    }
  }

  /**
   * Asynchronously analyze recent dialogue exchange to extract structured long-term memories
   */
  public async extractFromTurns(
    userId: string,
    userText: string,
    assistantText: string
  ): Promise<MemoryItem[]> {
    if (!this.ai || !userText || userText.trim().length < 4) {
      return [];
    }

    const settings = await memoryStore.getUserSettings(userId);
    if (!settings.memoryEnabled) {
      return [];
    }

    // Skip trivial phrases
    const trivialRegex = /^(hi|hello|hey|yeah|yes|no|nope|ok|okay|cool|nice|thanks|thank you|bye|goodbye|what's up|how are you)[\s!.]*$/i;
    if (trivialRegex.test(userText.trim())) {
      return [];
    }

    // Load existing memories for context
    const existing = await memoryStore.getAllMemories(userId, undefined, true);
    const existingSummary = existing
      .slice(0, 15)
      .map((m) => `[id:${m.id}] (${m.type}) ${m.content}`)
      .join('\n');

    const prompt = `You are the memory extraction engine for Tojuu, an intelligent voice AI companion.
Analyze the following conversational turn between the user and Tojuu.
Determine if the user shared durable personal facts, preferences, habits, projects, goals, or corrections.

USER SAID: "${userText}"
TOJUU REPLIED: "${assistantText}"

EXISTING MEMORIES:
${existingSummary || '(No previous memories stored)'}

RULES:
1. ONLY extract meaningful, durable information (e.g. preferences, projects, technical skills, habits, facts, goals, dislikes).
2. DO NOT extract trivial phrases, temporary status, immediate commands ("open youtube"), or generic small talk.
3. NEVER store sensitive security credentials, passwords, tokens, API keys, or financial data.
4. CONFIDENCE SCORING:
   - 0.90 to 1.0: Explicit, strongly confirmed ("I love dark roast coffee", "My name is Alex")
   - 0.70 to 0.89: Clear implication or likely preference ("I usually write in TypeScript")
   - 0.50 to 0.69: Tentative or uncertain ("I might try learning Rust soon")
   - Under 0.50: DO NOT RETURN
5. IMPORTANCE SCORING:
   - 0.9: Critical (Identity, major projects, primary career)
   - 0.7: Important (Daily habits, strong preferences, tech stack)
   - 0.5: Useful (Interests, casual hobbies)
   - 0.3: Minor
6. MEMORY CORRECTIONS:
   - If the user contradicts an existing memory (e.g. user says they switched to iPhone, but existing memory says Android), set "replacesMemoryId" to that memory's ID.

Return JSON array with items matching this format:
{
  "memories": [
    {
      "type": "profile" | "preference" | "dislike" | "fact" | "project" | "goal" | "interest" | "hobby" | "habit" | "important_date" | "technical_skill" | "instruction",
      "key": "short_unique_key_such_as_favorite_beverage_or_active_project_tojuu",
      "value": "concise_value",
      "content": "Full natural sentence describing what Tojuu should remember",
      "confidence": 0.95,
      "importance": 0.8,
      "replacesMemoryId": "optional_id_to_supersede"
    }
  ]
}`;

    try {
      // Prefer fast and responsive gemini-3.1-flash-lite, with fallback to gemini-3.8-flash
      let rawJson = '';
      try {
        const res = await this.ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });
        rawJson = res.text || '';
      } catch (liteErr) {
        const res = await this.ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });
        rawJson = res.text || '';
      }

      if (!rawJson) return [];

      const parsed = JSON.parse(rawJson);
      const items: any[] = parsed.memories || (Array.isArray(parsed) ? parsed : []);
      const savedItems: MemoryItem[] = [];

      for (const item of items) {
        if (!item.content || typeof item.confidence !== 'number' || item.confidence < 0.5) {
          continue;
        }

        // If this supersedes an existing memory, delete or update the old one
        if (item.replacesMemoryId) {
          await memoryStore.deleteMemory(item.replacesMemoryId);
        }

        const validTypes: MemoryCategory[] = [
          'profile',
          'preference',
          'dislike',
          'fact',
          'project',
          'goal',
          'interest',
          'hobby',
          'habit',
          'important_date',
          'communication_style',
          'technical_skill',
          'instruction',
        ];
        const category: MemoryCategory = validTypes.includes(item.type) ? item.type : 'fact';

        const created = await memoryStore.createMemory({
          userId,
          type: category,
          key: item.key,
          value: item.value,
          content: item.content,
          confidence: Math.min(1.0, Math.max(0.5, item.confidence)),
          importance: Math.min(1.0, Math.max(0.1, item.importance || 0.5)),
          source: 'conversation_extraction',
          active: true,
        });

        savedItems.push(created);
        console.log(`[MemoryExtractor] Learned new memory for ${userId}: "${item.content}"`);
      }

      return savedItems;
    } catch (err: any) {
      console.error('[MemoryExtractor] Failed extraction:', err?.message || err);
      return [];
    }
  }

  /**
   * Generates a concise high-level summary of a voice session
   */
  public async summarizeSession(userId: string, transcript: string): Promise<MemoryItem | null> {
    if (!this.ai || !transcript || transcript.trim().length < 50) {
      return null;
    }

    const settings = await memoryStore.getUserSettings(userId);
    if (!settings.memoryEnabled) {
      return null;
    }

    const prompt = `Summarize the following voice session between the user and Tojuu AI in 1-2 concise, high-value sentences focusing on topics discussed, user goals, and key decisions.
Transcript:
${transcript}`;

    try {
      const res = await this.ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
      });

      const summaryText = res.text?.trim();
      if (!summaryText) return null;

      const created = await memoryStore.createMemory({
        userId,
        type: 'conversation_summary',
        content: `Session Summary: ${summaryText}`,
        confidence: 0.95,
        importance: 0.6,
        source: 'session_summary',
        active: true,
      });

      return created;
    } catch (e) {
      return null;
    }
  }
}

export const memoryExtractor = new MemoryExtractor();
