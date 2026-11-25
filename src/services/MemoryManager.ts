import { MemoryItem, MemoryCategory, UserSettings } from '../types/assistant';

export class MemoryManager {
  private static defaultUserId = 'default_user';

  public static getUserId(): string {
    let id = localStorage.getItem('tojuu_user_id');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('tojuu_user_id', id);
    }
    return id;
  }

  public static async fetchMemories(
    userId = this.getUserId(),
    category?: MemoryCategory
  ): Promise<MemoryItem[]> {
    try {
      const url = new URL('/api/memories', window.location.origin);
      url.searchParams.set('userId', userId);
      if (category) {
        url.searchParams.set('category', category);
      }
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Failed to fetch memories');
      const data = await res.json();
      return data.memories || [];
    } catch (err) {
      console.error('[MemoryManager] fetchMemories error:', err);
      return [];
    }
  }

  public static async createMemory(params: {
    userId?: string;
    type: MemoryCategory;
    content: string;
    key?: string;
    value?: string;
    importance?: number;
    confidence?: number;
  }): Promise<MemoryItem | null> {
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: params.userId || this.getUserId(),
          ...params,
        }),
      });
      if (!res.ok) throw new Error('Failed to create memory');
      const data = await res.json();
      return data.memory || null;
    } catch (err) {
      console.error('[MemoryManager] createMemory error:', err);
      return null;
    }
  }

  public static async updateMemory(
    id: string,
    updates: Partial<MemoryItem>
  ): Promise<MemoryItem | null> {
    try {
      const res = await fetch(`/api/memories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update memory');
      const data = await res.json();
      return data.memory || null;
    } catch (err) {
      console.error('[MemoryManager] updateMemory error:', err);
      return null;
    }
  }

  public static async deleteMemory(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/memories/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete memory');
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('[MemoryManager] deleteMemory error:', err);
      return false;
    }
  }

  public static async deleteAllMemories(userId = this.getUserId()): Promise<number> {
    try {
      const res = await fetch(`/api/memories?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to wipe memories');
      const data = await res.json();
      return data.count || 0;
    } catch (err) {
      console.error('[MemoryManager] deleteAllMemories error:', err);
      return 0;
    }
  }

  public static async searchMemories(
    query: string,
    userId = this.getUserId(),
    limit = 6
  ): Promise<MemoryItem[]> {
    try {
      const res = await fetch('/api/memories/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, query, limit }),
      });
      if (!res.ok) throw new Error('Failed to search memories');
      const data = await res.json();
      return data.results || [];
    } catch (err) {
      console.error('[MemoryManager] searchMemories error:', err);
      return [];
    }
  }

  public static async getSettings(userId = this.getUserId()): Promise<UserSettings | null> {
    try {
      const res = await fetch(`/api/memories/settings?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      return data.settings || null;
    } catch (err) {
      console.error('[MemoryManager] getSettings error:', err);
      return null;
    }
  }

  public static async updateSettings(
    settings: Partial<UserSettings>,
    userId = this.getUserId()
  ): Promise<UserSettings | null> {
    try {
      const res = await fetch('/api/memories/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...settings }),
      });
      if (!res.ok) throw new Error('Failed to update settings');
      const data = await res.json();
      return data.settings || null;
    } catch (err) {
      console.error('[MemoryManager] updateSettings error:', err);
      return null;
    }
  }
}
