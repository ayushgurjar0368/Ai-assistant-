import React, { useState, useEffect } from 'react';
import { MemoryItem, MemoryCategory } from '../types/assistant';
import { MemoryManager } from '../services/MemoryManager';
import {
  X,
  Brain,
  Search,
  Trash2,
  Edit3,
  Plus,
  ShieldCheck,
  AlertTriangle,
  FolderGit2,
  Heart,
  User,
  Sparkles,
  Calendar,
  MessageSquare,
  Target,
  Check,
  ToggleLeft,
  ToggleRight,
  Flame,
} from 'lucide-react';

interface MemoryDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onMemoryChanged?: () => void;
}

type TabCategory = 'all' | 'profile' | 'preference' | 'project' | 'fact' | 'goal' | 'important_date' | 'conversation_summary';

const CATEGORY_TABS: { id: TabCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All', icon: <Brain className="w-3.5 h-3.5" /> },
  { id: 'profile', label: 'About You', icon: <User className="w-3.5 h-3.5" /> },
  { id: 'preference', label: 'Preferences', icon: <Heart className="w-3.5 h-3.5" /> },
  { id: 'project', label: 'Projects', icon: <FolderGit2 className="w-3.5 h-3.5" /> },
  { id: 'fact', label: 'Facts & Habits', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'goal', label: 'Goals', icon: <Target className="w-3.5 h-3.5" /> },
  { id: 'important_date', label: 'Important Dates', icon: <Calendar className="w-3.5 h-3.5" /> },
  { id: 'conversation_summary', label: 'Conversations', icon: <MessageSquare className="w-3.5 h-3.5" /> },
];

export const MemoryDashboardModal: React.FC<MemoryDashboardModalProps> = ({
  isOpen,
  onClose,
  userId,
  onMemoryChanged,
}) => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(true);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Manual Add state
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<MemoryCategory>('preference');

  const loadMemories = async () => {
    setIsLoading(true);
    try {
      const [fetched, settings] = await Promise.all([
        MemoryManager.fetchMemories(userId),
        MemoryManager.getSettings(userId),
      ]);
      setMemories(fetched);
      if (settings) {
        setMemoryEnabled(settings.memoryEnabled);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMemories();
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const handleToggleConsent = async () => {
    const nextVal = !memoryEnabled;
    setMemoryEnabled(nextVal);
    await MemoryManager.updateSettings({ memoryEnabled: nextVal }, userId);
    onMemoryChanged?.();
  };

  const handleDelete = async (id: string) => {
    const success = await MemoryManager.deleteMemory(id);
    if (success) {
      setMemories((prev) => prev.filter((m) => m.id !== id));
      onMemoryChanged?.();
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editText.trim()) return;
    const updated = await MemoryManager.updateMemory(id, { content: editText.trim() });
    if (updated) {
      setMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
      setEditingId(null);
      setEditText('');
      onMemoryChanged?.();
    }
  };

  const handleCreateMemory = async () => {
    if (!newContent.trim()) return;
    const created = await MemoryManager.createMemory({
      userId,
      type: newType,
      content: newContent.trim(),
      confidence: 0.98,
      importance: 0.8,
    });
    if (created) {
      setMemories((prev) => [created, ...prev]);
      setNewContent('');
      setIsAdding(false);
      onMemoryChanged?.();
    }
  };

  const handleWipeAll = async () => {
    setIsWiping(true);
    try {
      await MemoryManager.deleteAllMemories(userId);
      setMemories([]);
      setShowWipeConfirm(false);
      onMemoryChanged?.();
    } finally {
      setIsWiping(false);
    }
  };

  // Filter memories
  const filteredMemories = memories.filter((m) => {
    if (activeTab !== 'all') {
      if (activeTab === 'fact') {
        if (!['fact', 'habit', 'hobby', 'interest', 'technical_skill'].includes(m.type)) return false;
      } else if (m.type !== activeTab) {
        return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchContent = m.content.toLowerCase().includes(q);
      const matchKey = m.key && m.key.toLowerCase().includes(q);
      const matchVal = m.value && m.value.toLowerCase().includes(q);
      return matchContent || matchKey || matchVal;
    }
    return true;
  });

  const getCategoryBadge = (type: MemoryCategory) => {
    switch (type) {
      case 'profile':
        return { label: 'Profile', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
      case 'preference':
        return { label: 'Preference', color: 'bg-pink-500/20 text-pink-300 border-pink-500/30' };
      case 'project':
        return { label: 'Project', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
      case 'goal':
        return { label: 'Goal', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
      case 'dislike':
        return { label: 'Dislike', color: 'bg-red-500/20 text-red-300 border-red-500/30' };
      case 'conversation_summary':
        return { label: 'Summary', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
      default:
        return { label: type, color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-2xl rounded-3xl bg-zinc-900/95 border border-white/20 p-5 sm:p-6 shadow-2xl text-white max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500/30 to-violet-500/30 flex items-center justify-center border border-pink-500/40 text-pink-300 shadow-lg">
              <Brain className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">What Tojuu Remembers</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-mono font-medium">
                  {memories.length} Memories
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Persistent long-term companion memory & context
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close memory dashboard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Memory Consent & Quick Actions Bar */}
        <div className="mt-4 p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-zinc-300 font-medium">Memory Storage:</span>
            <button
              onClick={handleToggleConsent}
              className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            >
              {memoryEnabled ? (
                <>
                  <ToggleRight className="w-6 h-6 text-pink-400" />
                  <span className="text-pink-300">Active</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-6 h-6 text-zinc-500" />
                  <span className="text-zinc-500">Disabled</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setIsAdding(!isAdding)}
              className="px-3 py-1.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 border border-pink-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Memory
            </button>
            <button
              onClick={() => setShowWipeConfirm(true)}
              className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Forget Everything
            </button>
          </div>
        </div>

        {/* Manual Add Card */}
        {isAdding && (
          <div className="mt-3 p-4 rounded-2xl bg-zinc-800/80 border border-pink-500/30 animate-fade-in shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-pink-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Teach Tojuu a New Memory
              </span>
              <button
                onClick={() => setIsAdding(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2 mb-2">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as MemoryCategory)}
                className="bg-zinc-900 border border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="preference">Preference</option>
                <option value="project">Project</option>
                <option value="profile">About You</option>
                <option value="fact">Fact / Habit</option>
                <option value="goal">Goal</option>
                <option value="important_date">Important Date</option>
                <option value="dislike">Dislike</option>
              </select>
              <input
                type="text"
                placeholder="e.g. Loves drinking iced matcha latte while coding"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateMemory()}
                className="flex-1 bg-zinc-900 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-pink-500"
              />
              <button
                onClick={handleCreateMemory}
                className="px-3 py-1.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-xs font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Search Input */}
        <div className="relative mt-3 shrink-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search what Tojuu remembers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-2xl bg-zinc-800/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-none shrink-0">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white/20 text-white border border-white/30 shadow'
                  : 'bg-white/5 text-zinc-400 hover:text-zinc-200 border border-transparent'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Memories List */}
        <div className="mt-3 flex-1 overflow-y-auto pr-1 space-y-2.5">
          {isLoading ? (
            <div className="py-12 text-center text-zinc-500 text-xs">
              Loading memories...
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs">
              {searchQuery ? (
                <>No memories matching "{searchQuery}"</>
              ) : (
                <>
                  Tojuu hasn't saved memories in this category yet.
                  <br />
                  <span className="text-[11px] text-zinc-600 mt-1 block">
                    Chat naturally with Tojuu via voice and she'll remember what matters!
                  </span>
                </>
              )}
            </div>
          ) : (
            filteredMemories.map((m) => {
              const badge = getCategoryBadge(m.type);
              const isEditing = editingId === m.id;

              return (
                <div
                  key={m.id}
                  className="p-3.5 rounded-2xl bg-zinc-800/40 hover:bg-zinc-800/70 border border-white/10 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                        {m.confidence >= 0.9 && (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Confirmed
                          </span>
                        )}
                        {m.importance >= 0.8 && (
                          <span className="text-[10px] text-pink-400 flex items-center gap-0.5">
                            <Flame className="w-3 h-3" /> Core
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-500 ml-auto font-mono">
                          {new Date(m.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="flex-1 bg-zinc-900 border border-white/30 rounded-xl px-2.5 py-1 text-xs text-white"
                          />
                          <button
                            onClick={() => handleSaveEdit(m.id)}
                            className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1.5 rounded-lg bg-zinc-700 text-zinc-300"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-200 leading-relaxed font-normal">
                          "{m.content}"
                        </p>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-1 shrink-0 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setEditingId(m.id);
                            setEditText(m.content);
                          }}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                          title="Edit"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-400 hover:text-red-300 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-500 shrink-0">
          <span>Survives page refresh & new sessions</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition-colors"
          >
            Done
          </button>
        </div>

        {/* Wipe Everything Confirmation Modal */}
        {showWipeConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-lg rounded-3xl animate-fade-in">
            <div className="max-w-sm text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 mx-auto flex items-center justify-center mb-3 border border-red-500/40">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                Forget Everything About You?
              </h3>
              <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
                This will permanently delete all {memories.length} stored facts, preferences, projects, and summaries. Tojuu will start completely fresh.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setShowWipeConfirm(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWipeAll}
                  disabled={isWiping}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
                >
                  {isWiping ? 'Erasing...' : 'Yes, Forget Everything'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
