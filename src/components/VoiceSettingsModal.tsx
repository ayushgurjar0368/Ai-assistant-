import React from 'react';
import { AuraMood, VoiceOption } from '../types/assistant';
import { X, Sparkles, Volume2, Check, ShieldCheck, HeartHandshake } from 'lucide-react';

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: string;
  onSelectVoice: (voiceId: string) => void;
  currentMood: AuraMood;
  onSelectMood: (mood: AuraMood) => void;
}

const AVAILABLE_VOICES: VoiceOption[] = [
  {
    id: 'Aoede',
    name: 'Aoede',
    gender: 'Female',
    description: 'Charming, witty, charismatic, and breezy female voice with natural cadence.',
    vibe: 'Default Personality',
  },
  {
    id: 'Kore',
    name: 'Kore',
    gender: 'Female',
    description: 'Warm, relaxed, empathetic, and naturally conversational female voice.',
    vibe: 'Warm & Calming',
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    gender: 'Neutral',
    description: 'Upbeat, bright, modern, and energetic vocal rhythm.',
    vibe: 'Bright & Crisp',
  },
  {
    id: 'Leda',
    name: 'Leda',
    gender: 'Female',
    description: 'Confident, sophisticated, articulate, and poised female voice.',
    vibe: 'Classy & Polished',
  },
];

const MOOD_OPTIONS: { id: AuraMood; label: string; dot: string }[] = [
  { id: 'cyberpunk', label: 'Cyberpunk Neon', dot: 'bg-gradient-to-r from-pink-500 to-violet-500' },
  { id: 'aurora', label: 'Boreal Aurora', dot: 'bg-gradient-to-r from-emerald-400 to-cyan-400' },
  { id: 'deep_space', label: 'Deep Space', dot: 'bg-gradient-to-r from-blue-500 to-indigo-600' },
  { id: 'sunset_blush', label: 'Sunset Blush', dot: 'bg-gradient-to-r from-rose-500 to-amber-500' },
  { id: 'electric_violet', label: 'Electric Violet', dot: 'bg-gradient-to-r from-purple-500 to-fuchsia-500' },
];

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({
  isOpen,
  onClose,
  selectedVoice,
  onSelectVoice,
  currentMood,
  onSelectMood,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-zinc-900/95 border border-white/20 p-6 shadow-2xl text-white max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center border border-pink-500/30 text-pink-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-wide">Tojuu Persona & Audio</h2>
              <p className="text-xs text-zinc-400">Live API Voice-to-Voice Settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Personality Bio Card */}
        <div className="mt-5 p-4 rounded-2xl bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-transparent border border-pink-500/20">
          <div className="flex items-center gap-2 text-pink-300 font-semibold text-xs mb-1">
            <HeartHandshake className="w-4 h-4" />
            Tojuu's Core Character
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Young, confident, witty, and charming. Expressive with natural humor, light playful teasing, and sharp emotional awareness. Real-time voice interaction with zero robotic filler.
          </p>
        </div>

        {/* Voice Selection */}
        <div className="mt-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Synthesized Voice Persona
          </label>
          <div className="space-y-2.5">
            {AVAILABLE_VOICES.map((v) => {
              const isSelected = selectedVoice === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => onSelectVoice(v.id)}
                  className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-white/15 border-pink-500/50 shadow-lg'
                      : 'bg-zinc-800/40 border-white/5 hover:bg-zinc-800/80 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-pink-500 text-white shadow-md' : 'bg-zinc-700/60 text-zinc-400'
                      }`}
                    >
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{v.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 font-medium">
                          {v.vibe}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{v.description}</p>
                    </div>
                  </div>
                  {isSelected && <Check className="w-5 h-5 text-pink-400 shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            * Voice updates immediately upon starting your next session turn.
          </p>
        </div>

        {/* Atmospheric Aura */}
        <div className="mt-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Interface Aura Mood
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MOOD_OPTIONS.map((m) => {
              const isSelected = currentMood === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onSelectMood(m.id)}
                  className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white/15 border-white/40 shadow'
                      : 'bg-zinc-800/30 border-white/5 hover:bg-zinc-800/60 hover:border-white/15'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full ${m.dot}`} />
                  <span className="text-xs font-medium text-white truncate">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Safety & Protocol Footer */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Classy & respectful boundaries
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
