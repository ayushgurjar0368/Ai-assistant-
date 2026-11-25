import React from 'react';
import {
  Mic,
  MessageSquareText,
  Sparkles,
  Box,
  Gamepad2,
  MapPin,
  LogIn,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export type WorkspaceTab = 'voice' | 'chat' | 'studio' | 'scene3d' | 'game3d' | 'map';

interface TopNavProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
}

const TABS: Array<{ id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'chat', label: 'Chat', icon: MessageSquareText },
  { id: 'studio', label: 'Studio', icon: Sparkles },
  { id: 'scene3d', label: '3D Scene', icon: Box },
  { id: 'game3d', label: '3D Game', icon: Gamepad2 },
  { id: 'map', label: 'World Map', icon: MapPin },
];

export const TopNav: React.FC<TopNavProps> = ({ activeTab, onSelectTab }) => {
  const { user, loading, signInWithGoogle, signOut } = useAuth();

  return (
    <nav
      aria-label="Tojuu Workspace Navigation"
      className="w-full h-14 px-3 sm:px-5 bg-[#090b10] border-b border-white/10 flex items-center justify-between gap-3 z-40 shrink-0"
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-pink-500/30 to-cyan-500/30 border border-white/15 flex items-center justify-center">
          <span className="font-mono font-bold text-xs tracking-tight text-white">TJ</span>
        </div>
        <span className="hidden md:inline text-sm font-semibold tracking-tight text-zinc-100">
          Tojuu
        </span>
      </div>

      {/* Mode Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                active
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Google Sign-In / Profile */}
      <div className="flex items-center gap-2 shrink-0">
        {loading ? (
          <div className="w-20 h-8 rounded-lg bg-white/5 animate-pulse" />
        ) : user ? (
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-5 h-5 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <UserIcon className="w-4 h-4 text-zinc-300" />
              )}
              <span className="text-xs text-zinc-200 max-w-[110px] truncate">
                {user.displayName || user.email}
              </span>
            </div>
            <button
              type="button"
              onClick={signOut}
              title="Sign Out"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={signInWithGoogle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400/30 text-xs font-medium text-pink-100 transition-colors cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </nav>
  );
};
