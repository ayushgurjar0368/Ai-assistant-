import React, { useState } from 'react';
import { AssistantState, AuraMood } from '../types/assistant';
import { Mic, MicOff, Settings2, Sparkles, Lightbulb, X, Brain } from 'lucide-react';

interface HeaderControlsProps {
  state: AssistantState;
  mood: AuraMood;
  isMuted: boolean;
  memoryCount: number;
  onToggleMute: () => void;
  onOpenSettings: () => void;
  onOpenMemory: () => void;
}

const CONVERSATION_STARTERS = [
  "Remember that I love late-night coding with coffee.",
  "I'm building an AI assistant project called Tojuu.",
  "What do you remember about me so far?",
  "Do you remember my favorite beverage?",
  "Forget that I like coffee.",
  "I'm going to code tonight! (tests memory recall)",
  "What time is it in Tokyo right now?",
  "Can you open YouTube for me?",
  "Shift your visual mood to Aurora!",
  "Introduce yourself with some attitude!",
];

export const HeaderControls: React.FC<HeaderControlsProps> = ({
  state,
  isMuted,
  memoryCount,
  onToggleMute,
  onOpenSettings,
  onOpenMemory,
}) => {
  const [showSparks, setShowSparks] = useState(false);

  return (
    <header className="w-full flex items-center justify-between px-5 py-4 max-w-2xl mx-auto z-30 select-none">
      {/* Brand logo & tagline */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md shadow-lg overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/30 to-violet-500/30 pointer-events-none" />
          <span className="font-extrabold text-lg tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-pink-400 via-purple-300 to-cyan-300 font-mono">
            TJ
          </span>
          <span className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-cyan-400" />
        </div>

        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              Tojuu
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 font-mono uppercase tracking-wider font-semibold">
                Live
              </span>
            </h1>
          </div>
          <p className="text-[11px] text-zinc-400 font-medium tracking-wide">
            Voice-to-Voice Companion
          </p>
        </div>
      </div>

      {/* Right action icons */}
      <div className="flex items-center gap-2">
        {/* Memory Dashboard button */}
        <button
          onClick={onOpenMemory}
          className="relative px-3 py-2 rounded-2xl border bg-pink-500/10 border-pink-500/30 text-pink-300 hover:bg-pink-500/20 hover:text-white backdrop-blur-md transition-all cursor-pointer flex items-center gap-1.5"
          aria-label="What Tojuu Remembers"
          title="Memory Dashboard"
        >
          <Brain className="w-4 h-4 text-pink-400" />
          <span className="text-xs font-semibold">{memoryCount}</span>
        </button>

        {/* Ideas / Prompt sparks button */}
        <button
          onClick={() => setShowSparks(!showSparks)}
          className={`p-2.5 rounded-2xl border backdrop-blur-md transition-all cursor-pointer ${
            showSparks
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10'
          }`}
          aria-label="Conversation Ideas"
          title="Conversation Ideas"
        >
          <Lightbulb className="w-4 h-4" />
        </button>

        {/* Microphone mute toggle */}
        {state !== 'disconnected' && (
          <button
            onClick={onToggleMute}
            className={`p-2.5 rounded-2xl border backdrop-blur-md transition-all cursor-pointer ${
              isMuted
                ? 'bg-red-500/20 border-red-500/40 text-red-300 animate-pulse'
                : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10'
            }`}
            aria-label={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-2.5 rounded-2xl border bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 backdrop-blur-md transition-all cursor-pointer"
          aria-label="Voice & Aura Settings"
          title="Voice & Aura Settings"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      {/* Conversation Sparks Popover */}
      {showSparks && (
        <div className="absolute top-18 right-5 z-50 w-72 p-4 rounded-2xl bg-zinc-900/95 border border-white/20 backdrop-blur-xl shadow-2xl text-white animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
            <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Voice Prompts & Memories
            </span>
            <button
              onClick={() => setShowSparks(false)}
              className="text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {CONVERSATION_STARTERS.map((starter, i) => (
              <div
                key={i}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] text-zinc-300 transition-colors"
              >
                "{starter}"
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-500 mt-2 text-center">
            Just speak naturally — Tojuu updates memory automatically!
          </p>
        </div>
      )}
    </header>
  );
};
