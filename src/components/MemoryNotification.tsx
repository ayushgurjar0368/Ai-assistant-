import React, { useEffect, useState } from 'react';
import { Brain, Check, X } from 'lucide-react';
import { MemoryItem } from '../types/assistant';

interface MemoryNotificationProps {
  memory: MemoryItem | null;
  message?: string;
  onDismiss: () => void;
}

export const MemoryNotification: React.FC<MemoryNotificationProps> = ({
  memory,
  message,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (memory || message) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [memory, message, onDismiss]);

  if (!memory && !message) return null;

  return (
    <div
      className={`fixed top-18 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%] transition-all duration-300 ease-out transform ${
        visible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95 pointer-events-none'
      }`}
    >
      <div className="p-3 rounded-2xl bg-zinc-900/90 border border-pink-500/40 backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-pink-500/20 flex items-center justify-center shrink-0 border border-pink-500/30 text-pink-300">
            <Brain className="w-4 h-4 animate-pulse" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-pink-300 flex items-center gap-1">
              <Check className="w-3 h-3 text-pink-400" /> Tojuu Remembered
            </span>
            <p className="text-xs text-zinc-200 truncate font-medium">
              {message || memory?.content}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 200);
          }}
          className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
