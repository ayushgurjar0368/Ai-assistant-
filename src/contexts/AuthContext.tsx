import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleAuthProvider, ensureFirestoreUserProfile } from '../lib/firebase';

export interface SqlWorkspaceItem {
  id: number;
  kind: string;
  title: string;
  prompt?: string | null;
  model?: string | null;
  content?: string | null;
  mediaUrl?: string | null;
  metadata?: string | null;
  createdAt?: string | null;
}

export interface SqlGameScore {
  id: number;
  score: number;
  wave: number;
  orbsCollected: number;
  createdAt?: string | null;
}

export interface SqlSavedPlace {
  id: number;
  placeId: string;
  name: string;
  address?: string | null;
  lat: string;
  lng: string;
  category?: string | null;
  notes?: string | null;
  createdAt?: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authError: string | null;
  workspaceItems: SqlWorkspaceItem[];
  gameScores: SqlGameScore[];
  savedPlaces: SqlSavedPlace[];
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshSqlWorkspace: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workspaceItems, setWorkspaceItems] = useState<SqlWorkspaceItem[]>([]);
  const [gameScores, setGameScores] = useState<SqlGameScore[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<SqlSavedPlace[]>([]);
  const tokenRef = useRef<string | null>(null);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!auth.currentUser) {
      tokenRef.current = null;
      return null;
    }
    const token = await auth.currentUser.getIdToken();
    tokenRef.current = token;
    return token;
  }, []);

  const refreshSqlWorkspace = useCallback(async () => {
    if (!auth.currentUser) {
      setWorkspaceItems([]);
      setGameScores([]);
      setSavedPlaces([]);
      return;
    }
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/sql/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to load user workspace');
      }
      const data = await res.json();
      setWorkspaceItems(data.workspaceItems || []);
      setGameScores(data.gameScores || []);
      setSavedPlaces(data.savedPlaces || []);
    } catch (err: any) {
      console.error('[AuthContext] SQL workspace sync error:', err?.message || err);
    }
  }, [getIdToken]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const token = await nextUser.getIdToken();
          tokenRef.current = token;
          await ensureFirestoreUserProfile({
            uid: nextUser.uid,
            email: nextUser.email || '',
            displayName: nextUser.displayName || 'Tojuu User',
            voice: 'Aoede',
            auraMood: 'cyberpunk',
          }).catch((e) => console.error('[Firestore profile sync]:', e));
          await refreshSqlWorkspace();
        } catch (err: any) {
          console.error('[Auth state sync error]:', err);
        }
      } else {
        tokenRef.current = null;
        setWorkspaceItems([]);
        setGameScores([]);
        setSavedPlaces([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [refreshSqlWorkspace]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      setAuthError(err?.message || 'Google Sign-In failed');
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    try {
      tokenRef.current = null;
      await firebaseSignOut(auth);
    } catch (err: any) {
      setAuthError(err?.message || 'Sign-out failed');
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        workspaceItems,
        gameScores,
        savedPlaces,
        signInWithGoogle,
        signOut,
        getIdToken,
        refreshSqlWorkspace,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
