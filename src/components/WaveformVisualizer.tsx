import React, { useEffect, useRef } from 'react';
import { AssistantState, AuraMood } from '../types/assistant';
import { AudioPlayer } from '../services/AudioPlayer';

interface WaveformVisualizerProps {
  state: AssistantState;
  mood: AuraMood;
  player: AudioPlayer | null;
  userVolume: number;
}

const MOOD_PALETTES: Record<AuraMood, { barStart: string; barEnd: string; glow: string }> = {
  cyberpunk: {
    barStart: '#ec4899',
    barEnd: '#8b5cf6',
    glow: 'rgba(236, 72, 153, 0.5)',
  },
  aurora: {
    barStart: '#10b981',
    barEnd: '#38bdf8',
    glow: 'rgba(16, 185, 129, 0.5)',
  },
  deep_space: {
    barStart: '#3b82f6',
    barEnd: '#818cf8',
    glow: 'rgba(59, 130, 246, 0.5)',
  },
  sunset_blush: {
    barStart: '#f43f5e',
    barEnd: '#f59e0b',
    glow: 'rgba(244, 63, 94, 0.5)',
  },
  electric_violet: {
    barStart: '#a855f7',
    barEnd: '#d946ef',
    glow: 'rgba(168, 85, 247, 0.5)',
  },
};

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  state,
  mood,
  player,
  userVolume,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const palette = MOOD_PALETTES[mood] || MOOD_PALETTES.cyberpunk;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const freqArray = new Uint8Array(64);
    let phase = 0;

    const render = () => {
      phase += 0.05;
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;

      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      const centerY = displayHeight / 2;
      const barCount = 42;
      const barWidth = 3;
      const gap = Math.max(3, (displayWidth - barCount * barWidth) / (barCount + 1));
      const totalWidth = barCount * barWidth + (barCount - 1) * gap;
      const startX = (displayWidth - totalWidth) / 2;

      if (state === 'speaking' && player) {
        player.getFrequencyData(freqArray);
      }

      // Draw mirrored harmonic equalizer bars
      for (let i = 0; i < barCount; i++) {
        const x = startX + i * (barWidth + gap);
        // Distribute frequency bins symmetrically from center
        const centerOffset = Math.abs(i - barCount / 2) / (barCount / 2);
        const binIndex = Math.min(
          freqArray.length - 1,
          Math.floor((1 - centerOffset) * (freqArray.length - 1) * 0.75)
        );

        let heightRatio = 0.08;

        if (state === 'speaking') {
          const rawVal = freqArray[binIndex] / 255;
          const dynamicBoost = Math.sin(phase * 1.5 + i * 0.3) * 0.15;
          heightRatio = Math.max(0.1, Math.min(1.0, rawVal * 1.6 + dynamicBoost));
        } else if (state === 'listening') {
          const wave = Math.sin(phase * 2 + i * 0.35) * 0.5 + 0.5;
          const micEnergy = userVolume * 1.8;
          heightRatio = Math.max(0.08, Math.min(0.9, micEnergy * (0.4 + wave * 0.6) + 0.08));
        } else if (state === 'connecting') {
          const sweep = Math.sin(phase * 3 - i * 0.25);
          heightRatio = Math.max(0.08, 0.15 + sweep * 0.25);
        } else {
          // Disconnected ambient idle
          const idleWave = Math.sin(phase * 0.8 + i * 0.2) * 0.04;
          heightRatio = 0.07 + Math.max(0, idleWave);
        }

        const maxBarHeight = displayHeight * 0.85;
        const barHeight = Math.max(4, heightRatio * maxBarHeight);

        // Gradient for bars
        const gradient = ctx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
        gradient.addColorStop(0, palette.barStart);
        gradient.addColorStop(0.5, '#ffffff');
        gradient.addColorStop(1, palette.barEnd);

        ctx.fillStyle = gradient;
        ctx.shadowColor = palette.glow;
        ctx.shadowBlur = state === 'speaking' || state === 'listening' ? 12 : 4;

        // Rounded bar top and bottom
        const rx = barWidth / 2;
        const y = centerY - barHeight / 2;

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, rx);
        ctx.fill();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [state, mood, player, userVolume, palette]);

  return (
    <div className="w-full h-24 flex items-center justify-center">
      <canvas ref={canvasRef} className="w-full h-full max-w-sm" />
    </div>
  );
};
