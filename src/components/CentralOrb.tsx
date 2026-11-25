import React from 'react';
import { AssistantState, AuraMood } from '../types/assistant';
import { Mic, MicOff, Power, Sparkles, Volume2 } from 'lucide-react';

interface CentralOrbProps {
  state: AssistantState;
  mood: AuraMood;
  userVolume: number;
  aiVolume: number;
  isMuted: boolean;
  onToggleConnection: () => void;
  onToggleMute: () => void;
}

const MOOD_ORB_COLORS: Record<AuraMood, {
  coreFrom: string;
  coreTo: string;
  glow: string;
  ring: string;
}> = {
  cyberpunk: {
    coreFrom: 'from-pink-500',
    coreTo: 'to-violet-600',
    glow: 'rgba(236, 72, 153, 0.65)',
    ring: 'border-pink-500/40',
  },
  aurora: {
    coreFrom: 'from-emerald-400',
    coreTo: 'to-cyan-600',
    glow: 'rgba(16, 185, 129, 0.65)',
    ring: 'border-emerald-400/40',
  },
  deep_space: {
    coreFrom: 'from-blue-500',
    coreTo: 'to-indigo-600',
    glow: 'rgba(59, 130, 246, 0.65)',
    ring: 'border-blue-500/40',
  },
  sunset_blush: {
    coreFrom: 'from-rose-500',
    coreTo: 'to-amber-500',
    glow: 'rgba(244, 63, 94, 0.65)',
    ring: 'border-rose-500/40',
  },
  electric_violet: {
    coreFrom: 'from-purple-500',
    coreTo: 'to-fuchsia-600',
    glow: 'rgba(168, 85, 247, 0.65)',
    ring: 'border-purple-500/40',
  },
};

export const CentralOrb: React.FC<CentralOrbProps> = ({
  state,
  mood,
  userVolume,
  aiVolume,
  isMuted,
  onToggleConnection,
}) => {
  const colors = MOOD_ORB_COLORS[mood] || MOOD_ORB_COLORS.cyberpunk;

  // React to voice activity
  const activeEnergy = state === 'speaking' ? aiVolume : state === 'listening' ? userVolume : 0;
  const pulseScale = 1 + activeEnergy * 0.35;
  const glowBlur = 24 + activeEnergy * 40;

  return (
    <div className="relative flex items-center justify-center my-6">
      {/* Outer ambient energy field that expands with volume */}
      <div
        className="absolute w-64 h-64 rounded-full pointer-events-none transition-all duration-100 ease-out"
        style={{
          boxShadow: `0 0 ${glowBlur}px ${glowBlur * 0.8}px ${colors.glow}`,
          opacity: state === 'disconnected' ? 0.15 : 0.4 + activeEnergy * 0.6,
          transform: `scale(${pulseScale})`,
        }}
      />

      {/* Orbiting dashed tech ring */}
      <div
        className={`absolute w-72 h-72 rounded-full border border-dashed transition-all duration-700 pointer-events-none ${
          state === 'connecting'
            ? 'animate-spin border-cyan-400/60'
            : state === 'speaking'
            ? 'animate-spin border-pink-400/50'
            : state === 'listening'
            ? 'border-white/20'
            : 'border-white/10'
        }`}
        style={{
          animationDuration: state === 'connecting' ? '3s' : '18s',
        }}
      />

      {/* Rhythmic breathing concentric wave */}
      {(state === 'listening' || state === 'speaking') && (
        <div
          className={`absolute w-60 h-60 rounded-full border pointer-events-none animate-ping transition-opacity duration-300 ${colors.ring}`}
          style={{
            animationDuration: state === 'speaking' ? '1.8s' : '2.6s',
            opacity: 0.25 + activeEnergy * 0.4,
          }}
        />
      )}

      {/* Main interactive Core Button */}
      <button
        onClick={onToggleConnection}
        className={`relative z-10 w-44 h-44 sm:w-48 sm:h-48 rounded-full flex flex-col items-center justify-center cursor-pointer select-none transition-transform duration-200 active:scale-95 group focus:outline-none focus:ring-4 focus:ring-white/20 backdrop-blur-xl border border-white/20 shadow-2xl overflow-hidden ${
          state === 'disconnected'
            ? 'bg-zinc-900/80 hover:border-white/40'
            : `bg-gradient-to-tr ${colors.coreFrom} ${colors.coreTo} border-white/40`
        }`}
        style={{
          transform: `scale(${pulseScale})`,
          boxShadow:
            state === 'disconnected'
              ? 'inset 0 2px 12px rgba(255,255,255,0.06), 0 20px 40px rgba(0,0,0,0.6)'
              : 'inset 0 2px 20px rgba(255,255,255,0.4), 0 25px 60px rgba(0,0,0,0.8)',
        }}
        aria-label={
          state === 'disconnected'
            ? 'Wake Tojuu'
            : state === 'connecting'
            ? 'Connecting...'
            : state === 'speaking'
            ? 'Tojuu is speaking, tap to interrupt'
            : 'Tojuu is listening, tap to disconnect'
        }
      >
        {/* Specular glass reflection overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/40 pointer-events-none rounded-full" />

        {/* Center state icon and micro-indicators */}
        <div className="relative z-10 flex flex-col items-center justify-center text-white text-center px-4">
          {state === 'disconnected' && (
            <>
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-2.5 group-hover:scale-110 group-hover:bg-white/20 transition-all duration-300">
                <Power className="w-7 h-7 text-white/90" />
              </div>
              <span className="text-xs uppercase tracking-[0.2em] font-semibold text-white/80">
                Tap To Wake
              </span>
              <span className="text-[10px] text-white/50 tracking-wider mt-0.5">
                Tojuu AI
              </span>
            </>
          )}

          {state === 'connecting' && (
            <>
              <div className="relative w-14 h-14 flex items-center justify-center mb-2">
                <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <Sparkles className="w-5 h-5 text-white absolute animate-pulse" />
              </div>
              <span className="text-xs uppercase tracking-[0.25em] font-semibold text-white animate-pulse">
                Syncing
              </span>
              <span className="text-[10px] text-white/70 tracking-wider mt-0.5">
                Neural Audio Link
              </span>
            </>
          )}

          {state === 'listening' && (
            <>
              <div className="w-14 h-14 rounded-full bg-black/20 flex items-center justify-center mb-2 backdrop-blur-md">
                {isMuted ? (
                  <MicOff className="w-7 h-7 text-red-200 animate-pulse" />
                ) : (
                  <Mic className="w-7 h-7 text-white animate-pulse" />
                )}
              </div>
              <span className="text-xs uppercase tracking-[0.25em] font-semibold text-white drop-shadow">
                {isMuted ? 'Muted' : 'Listening'}
              </span>
              <span className="text-[10px] text-white/80 tracking-wider mt-0.5">
                Speak Naturally
              </span>
            </>
          )}

          {state === 'speaking' && (
            <>
              <div className="w-14 h-14 rounded-full bg-white/25 flex items-center justify-center mb-2 shadow-inner">
                <Volume2 className="w-7 h-7 text-white animate-bounce" />
              </div>
              <span className="text-xs uppercase tracking-[0.25em] font-bold text-white drop-shadow-md">
                Tojuu
              </span>
              <span className="text-[10px] text-white/90 tracking-wider mt-0.5 font-medium">
                Tap to Interrupt
              </span>
            </>
          )}
        </div>

        {/* Dynamic inner sound ring */}
        {(state === 'listening' || state === 'speaking') && (
          <div
            className="absolute inset-1 rounded-full border border-white/30 pointer-events-none transition-all duration-75"
            style={{
              transform: `scale(${1 + activeEnergy * 0.12})`,
              opacity: 0.4 + activeEnergy * 0.6,
            }}
          />
        )}
      </button>
    </div>
  );
};
