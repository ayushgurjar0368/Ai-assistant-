import React from 'react';
import { AssistantState } from '../types/assistant';
import { Radio, Mic, Volume2, WifiOff, Loader2 } from 'lucide-react';

interface StatusBarProps {
  state: AssistantState;
  durationSeconds: number;
  isMuted: boolean;
  model: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  state,
  durationSeconds,
  isMuted,
  model,
}) => {
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    switch (state) {
      case 'listening':
        return {
          icon: <Mic className="w-3.5 h-3.5 text-emerald-400" />,
          label: isMuted ? 'Mic Muted' : 'Tojuu is Listening',
          subtext: isMuted ? 'Unmute to speak' : 'Speak anytime — barge-in enabled',
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
          dot: 'bg-emerald-400',
        };
      case 'speaking':
        return {
          icon: <Volume2 className="w-3.5 h-3.5 text-pink-400" />,
          label: 'Tojuu is Speaking',
          subtext: 'Interrupt whenever you wish',
          bg: 'bg-pink-500/10 border-pink-500/30 text-pink-300',
          dot: 'bg-pink-400',
        };
      case 'connecting':
        return {
          icon: <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />,
          label: 'Connecting to Gemini Live',
          subtext: 'Bootstrapping ultra-low latency voice channel...',
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
          dot: 'bg-amber-400',
        };
      case 'disconnected':
      default:
        return {
          icon: <WifiOff className="w-3.5 h-3.5 text-zinc-400" />,
          label: 'Standby Mode',
          subtext: 'Tap central core or press space to awaken Tojuu',
          bg: 'bg-zinc-800/40 border-zinc-700/40 text-zinc-400',
          dot: 'bg-zinc-500',
        };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      {/* State Badge */}
      <div
        className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border backdrop-blur-md transition-all duration-300 ${badge.bg}`}
      >
        <span className={`inline-flex rounded-full h-2 w-2 ${badge.dot}`} />
        {badge.icon}
        <span className="text-xs font-semibold tracking-wider uppercase">
          {badge.label}
        </span>

        {state !== 'disconnected' && (
          <span className="text-[11px] font-mono opacity-60 border-l border-white/20 pl-2">
            {formatTime(durationSeconds)}
          </span>
        )}
      </div>

      {/* Dynamic conversational helper subtext */}
      <p className="text-xs text-zinc-400/80 tracking-wide font-light transition-all duration-300 text-center px-4">
        {badge.subtext}
      </p>

      {/* Protocol Badge */}
      {state !== 'disconnected' && (
        <div className="flex items-center gap-3 text-[10px] text-zinc-500 tracking-widest uppercase font-mono mt-0.5">
          <span className="flex items-center gap-1">
            <Radio className="w-2.5 h-2.5 text-emerald-400" /> {model} 16/24kHz
          </span>
          <span>•</span>
          <span>Voice: Aoede</span>
        </div>
      )}
    </div>
  );
};
