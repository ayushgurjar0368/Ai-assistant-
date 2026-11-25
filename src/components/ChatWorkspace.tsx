import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Globe,
  MapPin,
  Cpu,
  Mic,
  Square,
  Trash2,
  ExternalLink,
  BookmarkPlus,
  Loader2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { syncCreationToFirestore } from '../lib/firebase';

interface WebSource {
  title: string;
  uri: string;
}

interface MapSource {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets: Array<{ text: string; uri?: string }>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  model?: string;
  webSources?: WebSource[];
  mapSources?: MapSource[];
}

const PERSONA_PRESETS: Array<{ id: string; label: string; prompt: string }> = [
  {
    id: 'tojuu',
    label: 'Tojuu Companion',
    prompt:
      'You are Tojuu, an intelligent, witty, warm, and confident AI companion. Keep answers clear, insightful, and naturally conversational.',
  },
  {
    id: 'architect',
    label: 'Systems Architect',
    prompt:
      'You are a principal distributed systems architect. Provide structured, deeply reasoned, trade-off-aware technical guidance.',
  },
  {
    id: 'coder',
    label: 'TypeScript Engineer',
    prompt:
      'You are a senior full-stack TypeScript engineer. Write clean, production-grade code explanations and highlight edge cases clearly.',
  },
  {
    id: 'researcher',
    label: 'Research Analyst',
    prompt:
      'You are a rigorous research analyst. Synthesize verified facts cleanly, cite sources accurately, and note uncertainties transparently.',
  },
];

const MODEL_OPTIONS = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', note: 'General & Grounding' },
  { id: 'gemini-4-neon', label: 'Gemini 4 Neon', note: 'Complex & Interactive' },
  { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', note: 'Deep Reasoning' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', note: 'Fast Tasks' },
];

export const ChatWorkspace: React.FC = () => {
  const { user, getIdToken, refreshSqlWorkspace } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hey there. Pick any Gemini model, toggle Search or Maps grounding, or tap the mic to transcribe your thoughts straight into our thread.',
      model: 'gemini-4-hydrogen',
    },
  ]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-4-hydrogen');
  const [personaId, setPersonaId] = useState('tojuu');
  const [customSystemPrompt, setCustomSystemPrompt] = useState(PERSONA_PRESETS[0].prompt);
  const [groundingMode, setGroundingMode] = useState<'none' | 'search' | 'maps'>('none');
  const [thinkingLevel, setThinkingLevel] = useState<'AUTO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH'>('AUTO');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const listEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSelectPersona = (id: string) => {
    setPersonaId(id);
    const preset = PERSONA_PRESETS.find((p) => p.id === id);
    if (preset) {
      setCustomSystemPrompt(preset.prompt);
    }
  };

  const requestGeoLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      () => {
        // Ignore geolocation denial; Maps grounding still works without latLng
      },
      { timeout: 6000 }
    );
  };

  const handleToggleGrounding = (next: 'none' | 'search' | 'maps') => {
    setGroundingMode(next);
    if (next !== 'none') {
      setSelectedModel('gemini-4-hydrogen');
    }
    if (next === 'maps' && !coords) {
      requestGeoLocation();
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setErrorMsg(null);
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    setInput('');
    setIsSending(true);

    try {
      const apiMessages = nextThread
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          model: selectedModel,
          systemInstruction: customSystemPrompt,
          thinkingLevel: thinkingLevel === 'AUTO' ? undefined : thinkingLevel,
          enableSearchGrounding: groundingMode === 'search',
          enableMapsGrounding: groundingMode === 'maps',
          latLng: groundingMode === 'maps' ? coords : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Chat request failed');
      }

      const replyMsg: ChatMessage = {
        id: `m_${Date.now()}`,
        role: 'model',
        text: data.text || '(No text returned)',
        model: data.model,
        webSources: data.webSources || [],
        mapSources: data.mapSources || [],
      };
      setMessages((prev) => [...prev, replyMsg]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to generate response.');
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleMicTranscribe = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64: base64,
              mimeType: blob.type || 'audio/webm',
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Transcription failed');
          if (data.transcript) {
            setInput((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
          }
        } catch (err: any) {
          setErrorMsg(err?.message || 'Audio transcription failed');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Microphone access denied');
    }
  };

  const handleSaveReply = async (msg: ChatMessage) => {
    if (!user) {
      setErrorMsg('Sign in with Google to save notes to Cloud SQL & Firestore.');
      return;
    }
    try {
      const token = await getIdToken();
      if (!token) return;
      const title = msg.text.slice(0, 60).replace(/\s+/g, ' ').trim() || 'Chat Insight';
      const res = await fetch('/api/sql/workspace-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          kind: 'chat_note',
          title,
          model: msg.model || selectedModel,
          content: msg.text,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save note');
      }
      await syncCreationToFirestore({
        uid: user.uid,
        creationId: `note_${Date.now()}`,
        kind: 'chat_note',
        title,
        summary: msg.text,
        model: msg.model || selectedModel,
      }).catch(console.error);
      await refreshSqlWorkspace();
      setSavedNotice('Saved to your cloud workspace.');
      setTimeout(() => setSavedNotice(null), 2500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not save note');
    }
  };

  return (
    <div className="h-[calc(100dvh-56px)] w-full flex flex-col lg:flex-row bg-[#06070a] text-white overflow-hidden">
      {/* Configuration Sidebar */}
      <aside className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0b0e14] p-4 space-y-4 overflow-y-auto max-h-[38vh] lg:max-h-full">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Model & Grounding
          </h2>
          <button
            type="button"
            onClick={() =>
              setMessages([
                {
                  id: 'welcome',
                  role: 'model',
                  text: 'Thread cleared. Ready for your next prompt.',
                  model: selectedModel,
                },
              ])
            }
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        {/* Model Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
            Gemini Model
          </label>
          <div className="grid grid-cols-1 gap-1.5">
            {MODEL_OPTIONS.map((m) => {
              const disabled = groundingMode !== 'none' && m.id !== 'gemini-4-hydrogen';
              const active = selectedModel === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedModel(m.id)}
                  className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors flex items-center justify-between ${
                    active
                      ? 'bg-cyan-500/15 border-cyan-400/40 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                  } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="text-[10px] text-zinc-400">{m.note}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grounding Toggle */}
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
            Live Grounding
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => handleToggleGrounding('none')}
              className={`px-2 py-2 rounded-xl border text-xs font-medium cursor-pointer ${
                groundingMode === 'none'
                  ? 'bg-white/15 border-white/30 text-white'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => handleToggleGrounding('search')}
              className={`px-2 py-2 rounded-xl border text-xs font-medium flex items-center justify-center gap-1 cursor-pointer ${
                groundingMode === 'search'
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Search
            </button>
            <button
              type="button"
              onClick={() => handleToggleGrounding('maps')}
              className={`px-2 py-2 rounded-xl border text-xs font-medium flex items-center justify-center gap-1 cursor-pointer ${
                groundingMode === 'maps'
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Maps
            </button>
          </div>
          {groundingMode === 'maps' && (
            <p className="text-[11px] text-zinc-400">
              {coords
                ? `Location active (${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)})`
                : 'Uses geolocation when permitted for nearby places.'}
            </p>
          )}
        </div>

        {/* Thinking Depth */}
        {selectedModel !== 'gemini-3.1-flash-lite' && (
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
              Reasoning Depth
            </label>
            <select
              value={thinkingLevel}
              onChange={(e) => setThinkingLevel(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="AUTO">Auto</option>
              <option value="LOW">Low (Fast)</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              {selectedModel !== 'gemini-4-carbon' && <option value="XHIGH">XHigh (Max)</option>}
            </select>
          </div>
        )}

        {/* Role / System Instruction */}
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
            Persona / System Role
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PERSONA_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPersona(p.id)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer ${
                  personaId === p.id
                    ? 'bg-pink-500/20 border-pink-400/40 text-pink-100'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            value={customSystemPrompt}
            onChange={(e) => {
              setPersonaId('custom');
              setCustomSystemPrompt(e.target.value);
            }}
            rows={3}
            className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-zinc-200 focus:outline-none focus:border-pink-400 resize-none"
            placeholder="Custom system instructions..."
          />
        </div>
      </aside>

      {/* Conversation Thread */}
      <section className="flex-1 flex flex-col min-w-0 min-h-0">
        {errorMsg && (
          <div className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl bg-red-950/80 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} className="underline cursor-pointer">
              Dismiss
            </button>
          </div>
        )}
        {savedNotice && (
          <div className="mx-4 mt-3 px-3.5 py-2 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-xs text-emerald-200">
            {savedNotice}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col max-w-3xl ${
                msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
              }`}
            >
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-pink-500/20 border border-pink-400/30 text-white'
                    : 'bg-zinc-900/90 border border-white/10 text-zinc-100'
                }`}
              >
                {msg.text}

                {/* Google Search Grounding Citations */}
                {msg.webSources && msg.webSources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                    <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold flex items-center gap-1">
                      <Globe className="w-3 h-3" /> Search Sources
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {msg.webSources.map((src, i) => (
                        <a
                          key={`${src.uri}_${i}`}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/25 text-xs text-emerald-200 transition-colors"
                        >
                          <span className="truncate max-w-[220px]">{src.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Google Maps Grounding Place & Review Links */}
                {msg.mapSources && msg.mapSources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Google Maps Places
                    </div>
                    <div className="space-y-2">
                      {msg.mapSources.map((place, idx) => (
                        <div
                          key={`${place.uri}_${idx}`}
                          className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/25 space-y-1.5"
                        >
                          <a
                            href={place.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200 hover:underline"
                          >
                            <span>{place.title}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          {place.reviewSnippets.length > 0 && (
                            <div className="space-y-1 pl-2 border-l border-amber-400/30">
                              {place.reviewSnippets.map((snip, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={snip.uri || place.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-[11px] text-zinc-300 hover:text-white"
                                >
                                  “{snip.text}”
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-zinc-500">
                <span>{msg.role === 'user' ? 'You' : msg.model || 'Tojuu'}</span>
                {msg.role === 'model' && msg.id !== 'welcome' && (
                  <button
                    type="button"
                    onClick={() => handleSaveReply(msg)}
                    className="inline-flex items-center gap-1 text-zinc-400 hover:text-cyan-300 cursor-pointer"
                  >
                    <BookmarkPlus className="w-3 h-3" />
                    Save note
                  </button>
                )}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex items-center gap-2 text-xs text-zinc-400 px-2">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Thinking with {selectedModel}...</span>
            </div>
          )}
          <div ref={listEndRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={handleSend}
          className="p-3 sm:p-4 border-t border-white/10 bg-[#090b10] flex items-end gap-2"
        >
          <button
            type="button"
            onClick={handleToggleMicTranscribe}
            disabled={isTranscribing}
            title={isRecording ? 'Stop recording' : 'Record speech to transcribe (gemini-3.5-transcribe)'}
            className={`p-3 rounded-xl border transition-colors cursor-pointer shrink-0 ${
              isRecording
                ? 'bg-red-500/20 border-red-400/50 text-red-200'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-300'
            }`}
          >
            {isTranscribing ? (
              <Loader2 className="w-4 h-4 animate-spin text-cyan-300" />
            ) : isRecording ? (
              <Square className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={1}
            placeholder={
              groundingMode === 'search'
                ? 'Ask anything to search the live web...'
                : groundingMode === 'maps'
                ? 'Ask about nearby restaurants, cafes, landmarks...'
                : 'Ask Tojuu anything (Shift+Enter for newline)...'
            }
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 resize-none max-h-32"
          />

          <button
            type="submit"
            disabled={!input.trim() || isSending}
            className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-zinc-950 font-semibold text-sm flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
            <Send className="w-3.5 h-3.5 sm:hidden" />
          </button>
        </form>
      </section>
    </div>
  );
};
