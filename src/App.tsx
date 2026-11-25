import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AssistantState, AuraMood, ToolCallExecution, MemoryItem } from './types/assistant';
import { LiveSession } from './services/LiveSession';
import { MemoryManager } from './services/MemoryManager';
import { AuraBackground } from './components/AuraBackground';
import { CentralOrb } from './components/CentralOrb';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { StatusBar } from './components/StatusBar';
import { HeaderControls } from './components/HeaderControls';
import { ToolExecutionCard } from './components/ToolExecutionCard';
import { VoiceSettingsModal } from './components/VoiceSettingsModal';
import { MemoryDashboardModal } from './components/MemoryDashboardModal';
import { MemoryNotification } from './components/MemoryNotification';
import { TopNav, WorkspaceTab } from './components/TopNav';
import { ChatWorkspace } from './components/ChatWorkspace';
import { MediaStudio } from './components/MediaStudio';
import { ThreeSceneView } from './components/ThreeSceneView';
import { ThreeGameView } from './components/ThreeGameView';
import { WorldMapView } from './components/WorldMapView';
import { useAuth } from './contexts/AuthContext';
import { syncMemoryToFirestore, deleteFirestoreMemory } from './lib/firebase';
import { AlertCircle, X, Brain } from 'lucide-react';

export default function App() {
  const { user, authError, clearAuthError } = useAuth();
  const [localUserId] = useState<string>(() => MemoryManager.getUserId());
  const userId = user?.uid || localUserId;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('voice');
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  const [state, setState] = useState<AssistantState>('disconnected');
  const [userVolume, setUserVolume] = useState<number>(0);
  const [aiVolume, setAiVolume] = useState<number>(0);
  const [mood, setMood] = useState<AuraMood>('cyberpunk');
  const [voice, setVoice] = useState<string>('Aoede');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [activeTool, setActiveTool] = useState<ToolCallExecution | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState<boolean>(false);
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [learnedMemory, setLearnedMemory] = useState<MemoryItem | null>(null);
  const [memoryToastMessage, setMemoryToastMessage] = useState<string | null>(null);

  const sessionRef = useRef<LiveSession | null>(null);
  const durationTimerRef = useRef<number | null>(null);

  // Case A: Top-level Google Maps Platform Demo Key Quota Listener
  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const refreshMemoryCount = useCallback(async () => {
    try {
      const items = await MemoryManager.fetchMemories(userId);
      setMemoryCount(items.length);
    } catch {
      // ignore
    }
  }, [userId]);

  useEffect(() => {
    void refreshMemoryCount();
  }, [refreshMemoryCount]);

  // Disconnect voice session cleanly if user switches signed-in account
  useEffect(() => {
    if (sessionRef.current) {
      sessionRef.current.disconnect();
      sessionRef.current = null;
    }
  }, [userId]);

  const mirrorMemoryToCloud = useCallback(
    (mem: MemoryItem) => {
      if (!user || !user.emailVerified) return;
      void syncMemoryToFirestore({
        uid: user.uid,
        memoryId: mem.id,
        type: mem.type || 'fact',
        content: mem.content,
        confidence: mem.confidence ?? 0.9,
        importance: mem.importance ?? 0.7,
        active: mem.active !== false,
        source: mem.source || 'conversation',
      }).catch((err) => console.error('[Firestore memory sync]:', err));
    },
    [user]
  );

  // Initialize or update LiveSession instance
  const initSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.disconnect();
    }

    const session = new LiveSession(
      {
        onStateChange: (newState) => {
          setState(newState);
        },
        onUserVolume: (vol) => {
          setUserVolume(vol);
        },
        onAiVolume: (vol) => {
          setAiVolume(vol);
        },
        onToolExecution: (execution) => {
          setActiveTool(execution);
        },
        onAuraMoodChange: (newMood) => {
          setMood(newMood);
        },
        onMemoryEvent: (event) => {
          if (event.type === 'memories_learned' && event.memories && event.memories.length > 0) {
            setLearnedMemory(event.memories[0]);
            event.memories.forEach(mirrorMemoryToCloud);
            void refreshMemoryCount();
          } else if (event.type === 'memory_saved' && event.memory) {
            setLearnedMemory(event.memory);
            mirrorMemoryToCloud(event.memory);
            void refreshMemoryCount();
          } else if (event.type === 'memory_deleted') {
            setMemoryToastMessage('Memory forgotten.');
            if (user && user.emailVerified && event.memory?.id) {
              void deleteFirestoreMemory(user.uid, event.memory.id).catch(console.error);
            }
            void refreshMemoryCount();
          } else if (event.type === 'all_memories_deleted') {
            setMemoryToastMessage('All memories erased.');
            void refreshMemoryCount();
          }
        },
        onError: (err) => {
          setErrorMessage(err);
        },
      },
      voice,
      userId
    );

    sessionRef.current = session;
    return session;
  }, [voice, userId, refreshMemoryCount, mirrorMemoryToCloud, user]);

  // Duration timer when connected
  useEffect(() => {
    if (state !== 'disconnected') {
      const startTime = Date.now();
      durationTimerRef.current = window.setInterval(() => {
        setDurationSeconds(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      setDurationSeconds(0);
      setUserVolume(0);
      setAiVolume(0);
    }

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
      }
    };
  }, [state]);

  // Toggle connection / Awakening
  const handleToggleConnection = useCallback(async () => {
    setErrorMessage(null);

    if (state === 'disconnected') {
      const session = sessionRef.current || initSession();
      try {
        await session.connect();
      } catch (err: any) {
        setErrorMessage(err?.message || 'Could not connect to Tojuu Live API.');
      }
    } else if (state === 'speaking') {
      sessionRef.current?.handleLocalInterruption();
    } else {
      sessionRef.current?.disconnect();
    }
  }, [state, initSession]);

  // Toggle mute
  const handleToggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    sessionRef.current?.setMuted(nextMuted);
  }, [isMuted]);

  // Change voice
  const handleSelectVoice = (newVoice: string) => {
    setVoice(newVoice);
    if (sessionRef.current) {
      sessionRef.current.setVoice(newVoice);
    }
  };

  // Switch workspace tab safely
  const handleSelectTab = (tab: WorkspaceTab) => {
    if (tab !== 'voice' && state !== 'disconnected') {
      sessionRef.current?.disconnect();
    }
    setActiveTab(tab);
  };

  // Keyboard shortcuts only active in voice mode
  useEffect(() => {
    if (activeTab !== 'voice') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        void handleToggleConnection();
      } else if (e.code === 'KeyM' && state !== 'disconnected') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.code === 'KeyB') {
        e.preventDefault();
        setIsMemoryOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, state, handleToggleConnection, handleToggleMute]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionRef.current?.disconnect();
    };
  }, []);

  const totalIntensity = state === 'speaking' ? aiVolume : userVolume;
  const activeBannerError = errorMessage || authError;

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#06070a] text-white selection:bg-pink-500/30 font-sans">
      {/* Case A: Persistent Top-Level Google Maps Platform Quota Banner */}
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Workspace Mode Switcher & Auth Header */}
      <TopNav activeTab={activeTab} onSelectTab={handleSelectTab} />

      {/* Active Workspace View */}
      {activeTab === 'voice' && (
        <div className="relative flex-1 min-h-[calc(100dvh-56px)] w-full flex flex-col justify-between overflow-hidden">
          {/* Dynamic Aura Mesh Background */}
          <AuraBackground state={state} mood={mood} intensity={totalIntensity} />

          {/* Voice Header Controls */}
          <HeaderControls
            state={state}
            mood={mood}
            isMuted={isMuted}
            memoryCount={memoryCount}
            onToggleMute={handleToggleMute}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenMemory={() => setIsMemoryOpen(true)}
          />

          {/* Main Interactive Stage */}
          <main className="flex-1 flex flex-col items-center justify-center px-4 w-full max-w-lg mx-auto z-20">
            <div className="mb-2">
              <StatusBar
                state={state}
                durationSeconds={durationSeconds}
                isMuted={isMuted}
                model="gemini-3.8-live"
              />
            </div>

            <CentralOrb
              state={state}
              mood={mood}
              userVolume={userVolume}
              aiVolume={aiVolume}
              isMuted={isMuted}
              onToggleConnection={handleToggleConnection}
              onToggleMute={handleToggleMute}
            />

            <div className="w-full max-w-xs sm:max-w-sm mt-1">
              <WaveformVisualizer
                state={state}
                mood={mood}
                player={sessionRef.current?.getPlayer() || null}
                userVolume={userVolume}
              />
            </div>

            <button
              type="button"
              onClick={() => setIsMemoryOpen(true)}
              className="mt-4 flex items-center gap-2 text-xs text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md transition-all cursor-pointer group"
            >
              <Brain className="w-3.5 h-3.5 text-pink-400 group-hover:scale-110 transition-transform" />
              <span>
                {state === 'disconnected'
                  ? `${memoryCount} memories saved • Tap to explore`
                  : state === 'speaking'
                  ? 'Tojuu is speaking • Interrupt anytime'
                  : 'Listening with persistent memory context'}
              </span>
            </button>
          </main>

          <footer className="w-full py-4 text-center z-20 select-none">
            <div className="flex items-center justify-center gap-4 text-[11px] text-zinc-500">
              <span className="hidden sm:inline">
                Press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px] border border-zinc-700">
                  Space
                </kbd>{' '}
                to {state === 'disconnected' ? 'awaken' : 'interrupt'}
              </span>
              <span className="hidden sm:inline">•</span>
              <span>Persistent Long-Term Memory</span>
              <span>•</span>
              <span>Gemini Live Audio-to-Audio</span>
            </div>
          </footer>

          <ToolExecutionCard execution={activeTool} onDismiss={() => setActiveTool(null)} />

          <MemoryNotification
            memory={learnedMemory}
            message={memoryToastMessage || undefined}
            onDismiss={() => {
              setLearnedMemory(null);
              setMemoryToastMessage(null);
            }}
          />

          <VoiceSettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            selectedVoice={voice}
            onSelectVoice={handleSelectVoice}
            currentMood={mood}
            onSelectMood={setMood}
          />

          <MemoryDashboardModal
            isOpen={isMemoryOpen}
            onClose={() => setIsMemoryOpen(false)}
            userId={userId}
            onMemoryChanged={() => void refreshMemoryCount()}
          />
        </div>
      )}

      {activeTab === 'chat' && <ChatWorkspace />}
      {activeTab === 'studio' && <MediaStudio />}
      {activeTab === 'scene3d' && <ThreeSceneView />}
      {activeTab === 'game3d' && <ThreeGameView />}
      {activeTab === 'map' && <WorldMapView />}

      {/* Top-Level Error Banner Toast */}
      {activeBannerError && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92%] p-3.5 rounded-2xl bg-red-950/90 border border-red-500/40 backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3 text-red-200 animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-xs font-medium truncate">{activeBannerError}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              clearAuthError();
            }}
            className="p-1 rounded-lg hover:bg-white/10 text-red-300 hover:text-white cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
