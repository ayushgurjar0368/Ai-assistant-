import React from 'react';
import { AssistantState, AuraMood } from '../types/assistant';

interface AuraBackgroundProps {
  state: AssistantState;
  mood: AuraMood;
  intensity: number; // 0 to 1
}

const MOOD_GRADIENTS: Record<AuraMood, { primary: string; secondary: string; accent: string }> = {
  cyberpunk: {
    primary: 'rgba(236, 72, 153, 0.25)', // pink-500
    secondary: 'rgba(139, 92, 246, 0.22)', // violet-500
    accent: 'rgba(6, 182, 212, 0.18)', // cyan-500
  },
  aurora: {
    primary: 'rgba(16, 185, 129, 0.25)', // emerald-500
    secondary: 'rgba(56, 189, 248, 0.22)', // sky-400
    accent: 'rgba(168, 85, 247, 0.15)', // purple-500
  },
  deep_space: {
    primary: 'rgba(59, 130, 246, 0.25)', // blue-500
    secondary: 'rgba(99, 102, 241, 0.22)', // indigo-500
    accent: 'rgba(147, 51, 234, 0.18)', // purple-600
  },
  sunset_blush: {
    primary: 'rgba(244, 63, 94, 0.28)', // rose-500
    secondary: 'rgba(251, 146, 60, 0.22)', // orange-400
    accent: 'rgba(234, 179, 8, 0.18)', // yellow-500
  },
  electric_violet: {
    primary: 'rgba(168, 85, 247, 0.3)', // purple-500
    secondary: 'rgba(217, 70, 239, 0.25)', // fuchsia-500
    accent: 'rgba(99, 102, 241, 0.2)', // indigo-500
  },
};

export const AuraBackground: React.FC<AuraBackgroundProps> = ({ state, mood, intensity }) => {
  const colors = MOOD_GRADIENTS[mood] || MOOD_GRADIENTS.cyberpunk;

  // React to audio intensity
  const scale = 1 + intensity * 0.45;
  const pulseOpacity = state === 'disconnected' ? 0.35 : 0.7 + intensity * 0.4;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10 bg-[#06070a]">
      {/* Subtle futuristic grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Central primary glow orb */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] rounded-full blur-[110px] transition-all duration-700 ease-out"
        style={{
          background: `radial-gradient(circle, ${colors.primary} 0%, ${colors.secondary} 45%, transparent 75%)`,
          transform: `translate(-50%, -50%) scale(${scale})`,
          opacity: pulseOpacity,
        }}
      />

      {/* Secondary accent orb - top right */}
      <div
        className="absolute top-[18%] right-[10%] w-[380px] h-[380px] rounded-full blur-[130px] transition-all duration-1000 ease-in-out animate-pulse"
        style={{
          background: colors.secondary,
          opacity: pulseOpacity * 0.8,
          animationDuration: '6s',
        }}
      />

      {/* Tertiary accent orb - bottom left */}
      <div
        className="absolute bottom-[15%] left-[8%] w-[420px] h-[420px] rounded-full blur-[140px] transition-all duration-1000 ease-in-out animate-pulse"
        style={{
          background: colors.accent,
          opacity: pulseOpacity * 0.7,
          animationDuration: '8s',
        }}
      />

      {/* Vignette border */}
      <div className="absolute inset-0 bg-radial-[circle_at_center,transparent_0%,rgba(6,7,10,0.85)_85%]" />
    </div>
  );
};
