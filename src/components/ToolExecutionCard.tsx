import React, { useEffect, useState } from 'react';
import { ToolCallExecution } from '../types/assistant';
import { ExternalLink, Clock, Sparkles, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface ToolExecutionCardProps {
  execution: ToolCallExecution | null;
  onDismiss: () => void;
}

export const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({
  execution,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (execution) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300);
      }, 7000);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [execution, onDismiss]);

  if (!execution) return null;

  const getToolMeta = () => {
    switch (execution.name) {
      case 'openWebsite':
        return {
          icon: <ExternalLink className="w-4 h-4 text-cyan-400" />,
          title: 'Opening Website',
          desc: execution.args.label || execution.args.url,
          url: execution.result?.url || execution.args.url,
        };
      case 'getCurrentTime':
        return {
          icon: <Clock className="w-4 h-4 text-amber-400" />,
          title: 'Checked Local Time',
          desc: execution.result?.currentTime
            ? `${execution.result.currentTime} (${execution.result.timezone})`
            : 'Fetching time...',
        };
      case 'changeAuraMood':
        return {
          icon: <Sparkles className="w-4 h-4 text-pink-400" />,
          title: 'Interface Aura Shift',
          desc: `Switched mood to ${execution.args.mood || 'custom'}`,
        };
      default:
        return {
          icon: <Sparkles className="w-4 h-4 text-violet-400" />,
          title: `Action: ${execution.name}`,
          desc: JSON.stringify(execution.args),
        };
    }
  };

  const meta = getToolMeta();

  return (
    <div
      className={`fixed bottom-24 sm:bottom-12 left-1/2 -translate-x-1/2 z-40 max-w-sm w-[90%] transition-all duration-300 ease-out transform ${
        visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-4 opacity-0 scale-95 pointer-events-none'
      }`}
    >
      <div className="relative p-3.5 rounded-2xl bg-zinc-900/90 border border-white/20 backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3 text-white">
        {/* Glow corner accent */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl pointer-events-none" />

        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/10">
            {meta.icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold tracking-wide text-white truncate">
                {meta.title}
              </span>
              {execution.status === 'success' && (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              {execution.status === 'error' && (
                <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              )}
            </div>
            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
              {meta.desc}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {meta.url && (
            <a
              href={meta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 text-xs rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 font-medium transition-colors flex items-center gap-1"
            >
              Visit <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button
            onClick={() => {
              setVisible(false);
              setTimeout(onDismiss, 200);
            }}
            className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Dismiss tool card"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
