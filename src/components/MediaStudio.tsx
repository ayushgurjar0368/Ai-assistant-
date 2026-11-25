import React, { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  Film,
  Music,
  AudioLines,
  Upload,
  Mic,
  Square,
  Download,
  BookmarkPlus,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { syncCreationToFirestore } from '../lib/firebase';

type StudioMode = 'image' | 'video' | 'music' | 'transcribe';

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({ base64, mimeType: file.type || 'application/octet-stream' });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const MediaStudio: React.FC = () => {
  const { user, getIdToken, workspaceItems, refreshSqlWorkspace } = useAuth();
  const [mode, setMode] = useState<StudioMode>('image');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Image Generation & Editing
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgAspect, setImgAspect] = useState('1:1');
  const [imgSize, setImgSize] = useState('1K');
  const [imgSearch, setImgSearch] = useState(false);
  const [imgSource, setImgSource] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [imgOutput, setImgOutput] = useState<{ url: string; caption: string } | null>(null);
  const [imgLoading, setImgLoading] = useState(false);

  // Video Generation (Omni Flash via Interactions API)
  const [vidPrompt, setVidPrompt] = useState('');
  const [vidAspect, setVidAspect] = useState<'16:9' | '9:16'>('16:9');
  const [vidDuration, setVidDuration] = useState('6s');
  const [vidResolution, setVidResolution] = useState('720p');
  const [vidSource, setVidSource] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [vidOutput, setVidOutput] = useState<string | null>(null);
  const [vidLoading, setVidLoading] = useState(false);

  // Music Generation (Lyria 3)
  const [musPrompt, setMusPrompt] = useState('');
  const [musModel, setMusModel] = useState<'lyria-3-clip-preview' | 'lyria-3-pro-preview'>('lyria-3-clip-preview');
  const [musImage, setMusImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [musOutput, setMusOutput] = useState<{ audioDataUrl: string; lyrics: string } | null>(null);
  const [musLoading, setMusLoading] = useState(false);

  // Audio Transcription (gemini-3.5-transcribe)
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const saveWorkspaceItem = async (payload: {
    kind: 'image' | 'music' | 'transcript';
    title: string;
    prompt?: string;
    model: string;
    content?: string;
  }) => {
    if (!user) {
      setErrorMsg('Sign in with Google to save creations to Cloud SQL & Firestore.');
      return;
    }
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/sql/workspace-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save item');
      }
      await syncCreationToFirestore({
        uid: user.uid,
        creationId: `${payload.kind}_${Date.now()}`,
        kind: payload.kind,
        title: payload.title,
        summary: payload.content || payload.prompt || payload.title,
        model: payload.model,
      }).catch(console.error);
      await refreshSqlWorkspace();
      setStatusMsg('Saved to Cloud SQL & Firestore library.');
      setTimeout(() => setStatusMsg(null), 2500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Save failed');
    }
  };

  const handleDeleteWorkspaceItem = async (id: number) => {
    const token = await getIdToken();
    if (!token) return;
    await fetch(`/api/sql/workspace-items/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await refreshSqlWorkspace();
  };

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imgPrompt.trim() || imgLoading) return;
    setErrorMsg(null);
    setImgLoading(true);
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt.trim(),
          aspectRatio: imgAspect,
          imageSize: imgSize,
          enableSearch: imgSearch,
          imageBase64: imgSource?.base64,
          imageMimeType: imgSource?.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image generation failed');
      setImgOutput({ url: data.imageUrl, caption: data.caption || '' });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Image generation failed');
    } finally {
      setImgLoading(false);
    }
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vidPrompt.trim() || vidLoading) return;
    setErrorMsg(null);
    setVidLoading(true);
    try {
      const res = await fetch('/api/ai/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: vidPrompt.trim(),
          aspectRatio: vidAspect,
          duration: vidDuration,
          resolution: vidResolution,
          imageBase64: vidSource?.base64,
          imageMimeType: vidSource?.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Video generation failed');
      setVidOutput(data.videoDataUrl);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Video generation failed');
    } finally {
      setVidLoading(false);
    }
  };

  const handleGenerateMusic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!musPrompt.trim() || musLoading) return;
    setErrorMsg(null);
    setMusLoading(true);
    try {
      const res = await fetch('/api/ai/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: musPrompt.trim(),
          model: musModel,
          imageBase64: musImage?.base64,
          imageMimeType: musImage?.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Music generation failed');
      setMusOutput({ audioDataUrl: data.audioDataUrl, lyrics: data.lyrics || '' });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Music generation failed');
    } finally {
      setMusLoading(false);
    }
  };

  const runTranscription = async (base64: string, mimeType: string) => {
    setTranscribing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transcription failed');
      setTranscriptText(data.transcript || '(Empty transcription)');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Audio transcription failed');
    } finally {
      setTranscribing(false);
    }
  };

  const handleToggleRecord = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size === 0) return;
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        await runTranscription(btoa(bin), blob.type || 'audio/webm');
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Microphone access denied');
    }
  };

  return (
    <div className="h-[calc(100dvh-56px)] w-full bg-[#06070a] text-white overflow-y-auto p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Studio Header & Subtabs */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Tojuu Multimodal Studio</h1>
            <p className="text-xs text-zinc-400">
              Create & edit images, animate videos, compose music, and transcribe audio.
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: 'image', label: 'Image (Nano Banana 2.1)', icon: ImageIcon },
                { id: 'video', label: 'Video (Omni 1.2)', icon: Film },
                { id: 'music', label: 'Music (Lyria 3)', icon: Music },
                { id: 'transcribe', label: 'Transcribe (3.5)', icon: AudioLines },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = mode === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMode(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer transition-colors ${
                    active
                      ? 'bg-pink-500/20 border-pink-400/40 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {errorMsg && (
          <div className="px-4 py-3 rounded-xl bg-red-950/80 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} className="underline cursor-pointer">
              Dismiss
            </button>
          </div>
        )}
        {statusMsg && (
          <div className="px-4 py-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-xs text-emerald-200">
            {statusMsg}
          </div>
        )}

        {/* IMAGE MODE */}
        {mode === 'image' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={handleGenerateImage} className="rounded-2xl bg-[#0b0e14] border border-white/10 p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Prompt</label>
                <textarea
                  value={imgPrompt}
                  onChange={(e) => setImgPrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe an image to create, or instructions to edit the uploaded photo..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-sm text-white focus:outline-none focus:border-pink-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Aspect Ratio</label>
                  <select
                    value={imgAspect}
                    onChange={(e) => setImgAspect(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white"
                  >
                    {['1:1', '16:9', '9:16', '4:3', '3:4', '1:4', '4:1'].map((ar) => (
                      <option key={ar} value={ar}>
                        {ar}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Resolution</label>
                  <select
                    value={imgSize}
                    onChange={(e) => setImgSize(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white"
                  >
                    {['1K', '2K', '4K'].map((sz) => (
                      <option key={sz} value={sz}>
                        {sz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={imgSearch}
                    onChange={(e) => setImgSearch(e.target.checked)}
                    className="accent-pink-500"
                  />
                  Ground with Google Web & Image Search
                </label>

                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{imgSource ? 'Replace Source Image' : 'Upload Image to Edit'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const res = await fileToBase64(f);
                      setImgSource({
                        ...res,
                        preview: `data:${res.mimeType};base64,${res.base64}`,
                      });
                    }}
                  />
                </label>
              </div>

              {imgSource && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <img src={imgSource.preview} alt="Source" className="w-14 h-14 rounded-lg object-cover" />
                  <span className="text-xs text-zinc-300 flex-1">Reference image attached for editing</span>
                  <button
                    type="button"
                    onClick={() => setImgSource(null)}
                    className="text-xs text-red-300 hover:text-red-200 cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={!imgPrompt.trim() || imgLoading}
                className="w-full py-2.5 rounded-xl bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {imgLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{imgSource ? 'Edit Image' : 'Generate Image'}</span>
              </button>
            </form>

            <div className="rounded-2xl bg-[#0b0e14] border border-white/10 p-5 flex flex-col items-center justify-center min-h-[320px]">
              {imgOutput ? (
                <div className="w-full space-y-3">
                  <img
                    src={imgOutput.url}
                    alt={imgPrompt}
                    className="w-full max-h-[420px] object-contain rounded-xl bg-black/40"
                  />
                  {imgOutput.caption && (
                    <p className="text-xs text-zinc-300">{imgOutput.caption}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <a
                      href={imgOutput.url}
                      download={`tojuu-image-${Date.now()}.png`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        saveWorkspaceItem({
                          kind: 'image',
                          title: imgPrompt.slice(0, 80),
                          prompt: imgPrompt,
                          model: 'gemini-nano-banana-2.1',
                          content: imgOutput.caption || imgPrompt,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-xs text-cyan-100 cursor-pointer"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" /> Save Record
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-500 text-center">
                  Generated or edited artwork from gemini-nano-banana-2.1 appears here.
                </p>
              )}
            </div>
          </div>
        )}

        {/* VIDEO MODE */}
        {mode === 'video' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={handleGenerateVideo} className="rounded-2xl bg-[#0b0e14] border border-white/10 p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Video Motion Prompt</label>
                <textarea
                  value={vidPrompt}
                  onChange={(e) => setVidPrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe the scene or how the starting frame should animate..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-sm text-white focus:outline-none focus:border-pink-400"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Aspect</label>
                  <select
                    value={vidAspect}
                    onChange={(e) => setVidAspect(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white"
                  >
                    <option value="16:9">16:9 Landscape</option>
                    <option value="9:16">9:16 Portrait</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Duration</label>
                  <select
                    value={vidDuration}
                    onChange={(e) => setVidDuration(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white"
                  >
                    <option value="5s">5s</option>
                    <option value="6s">6s</option>
                    <option value="10s">10s</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Resolution</label>
                  <select
                    value={vidResolution}
                    onChange={(e) => setVidResolution(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white"
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{vidSource ? 'Replace Starting Image' : 'Optional Starting Image (Animate Photo)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const res = await fileToBase64(f);
                      setVidSource({ ...res, preview: `data:${res.mimeType};base64,${res.base64}` });
                    }}
                  />
                </label>
                {vidSource && (
                  <div className="mt-2 flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <img src={vidSource.preview} alt="Starting frame" className="w-14 h-14 rounded-lg object-cover" />
                    <span className="text-xs text-zinc-300 flex-1">Starting keyframe attached</span>
                    <button
                      type="button"
                      onClick={() => setVidSource(null)}
                      className="text-xs text-red-300 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!vidPrompt.trim() || vidLoading}
                className="w-full py-2.5 rounded-xl bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {vidLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{vidSource ? 'Animate Image to Video' : 'Generate Video'}</span>
              </button>
            </form>

            <div className="rounded-2xl bg-[#0b0e14] border border-white/10 p-5 flex flex-col items-center justify-center min-h-[320px]">
              {vidOutput ? (
                <div className="w-full space-y-3">
                  <video src={vidOutput} controls autoPlay loop className="w-full rounded-xl bg-black" />
                  <a
                    href={vidOutput}
                    download={`tojuu-video-${Date.now()}.mp4`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs"
                  >
                    <Download className="w-3.5 h-3.5" /> Download MP4
                  </a>
                </div>
              ) : (
                <p className="text-xs text-zinc-500 text-center">
                  Video generated by gemini-omni-1.2-flash (Interactions API) appears here.
                </p>
              )}
            </div>
          </div>
        )}

        {/* MUSIC MODE */}
        {mode === 'music' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={handleGenerateMusic} className="rounded-2xl bg-[#0b0e14] border border-white/10 p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">Musical Direction</label>
                <textarea
                  value={musPrompt}
                  onChange={(e) => setMusPrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe tempo, instruments, mood, genre, or vocal vibe..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-sm text-white focus:outline-none focus:border-pink-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMusModel('lyria-3-clip-preview')}
                  className={`px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer ${
                    musModel === 'lyria-3-clip-preview'
                      ? 'bg-pink-500/20 border-pink-400/40 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-300'
                  }`}
                >
                  Lyria 3 Clip (30s)
                </button>
                <button
                  type="button"
                  onClick={() => setMusModel('lyria-3-pro-preview')}
                  className={`px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer ${
                    musModel === 'lyria-3-pro-preview'
                      ? 'bg-pink-500/20 border-pink-400/40 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-300'
                  }`}
                >
                  Lyria 3 Pro (Full Track)
                </button>
              </div>

              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{musImage ? 'Replace Cover/Mood Image' : 'Optional Mood Image'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const res = await fileToBase64(f);
                    setMusImage({ ...res, preview: `data:${res.mimeType};base64,${res.base64}` });
                  }}
                />
              </label>

              {musImage && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <img src={musImage.preview} alt="Mood" className="w-12 h-12 rounded-lg object-cover" />
                  <span className="text-xs text-zinc-300 flex-1">Image attached to inspire track</span>
                  <button type="button" onClick={() => setMusImage(null)} className="text-xs text-red-300 cursor-pointer">
                    Remove
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={!musPrompt.trim() || musLoading}
                className="w-full py-2.5 rounded-xl bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {musLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Compose Track</span>
              </button>
            </form>

            <div className="rounded-2xl bg-[#0b0e14] border border-white/10 p-5 flex flex-col justify-center min-h-[280px] space-y-4">
              {musOutput ? (
                <>
                  <audio controls src={musOutput.audioDataUrl} className="w-full" />
                  {musOutput.lyrics && (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 max-h-48 overflow-y-auto text-xs text-zinc-200 whitespace-pre-wrap">
                      {musOutput.lyrics}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <a
                      href={musOutput.audioDataUrl}
                      download={`tojuu-music-${Date.now()}.mp3`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs"
                    >
                      <Download className="w-3.5 h-3.5" /> Download Audio
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        saveWorkspaceItem({
                          kind: 'music',
                          title: musPrompt.slice(0, 80),
                          prompt: musPrompt,
                          model: musModel,
                          content: musOutput.lyrics || musPrompt,
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-xs text-cyan-100 cursor-pointer"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" /> Save Record
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-zinc-500 text-center">
                  Composed audio & lyrics from Lyria 3 appear here.
                </p>
              )}
            </div>
          </div>
        )}

        {/* TRANSCRIBE MODE */}
        {mode === 'transcribe' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-[#0b0e14] border border-white/10 p-5 space-y-4">
              <h2 className="text-sm font-semibold">Audio Input (gemini-3.5-transcribe)</h2>
              <p className="text-xs text-zinc-400">
                Record directly from your microphone or upload an MP3, WAV, M4A, or WebM file for transcription.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleToggleRecord}
                  disabled={transcribing}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                    recording
                      ? 'bg-red-500/25 border-red-400/50 text-red-100'
                      : 'bg-pink-500/20 border-pink-400/40 text-white hover:bg-pink-500/30'
                  }`}
                >
                  {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{recording ? 'Stop & Transcribe' : 'Record Microphone'}</span>
                </button>

                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>Upload Audio File</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const res = await fileToBase64(f);
                      await runTranscription(res.base64, res.mimeType);
                    }}
                  />
                </label>
              </div>
              {transcribing && (
                <div className="flex items-center gap-2 text-xs text-cyan-300">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Transcribing audio with gemini-3.5-transcribe...</span>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-[#0b0e14] border border-white/10 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">Transcript</span>
                {transcriptText && (
                  <button
                    type="button"
                    onClick={() =>
                      saveWorkspaceItem({
                        kind: 'transcript',
                        title: transcriptText.slice(0, 60),
                        model: 'gemini-3.5-transcribe',
                        content: transcriptText,
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/30 text-xs text-cyan-100 cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" /> Save
                  </button>
                )}
              </div>
              <textarea
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                rows={8}
                placeholder="Transcription output will appear here..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>
        )}

        {/* Saved Cloud SQL Library */}
        <div className="rounded-2xl bg-[#0b0e14] border border-white/10 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Saved Cloud Library</h2>
            <span className="text-xs text-zinc-400">
              {user ? `${workspaceItems.length} saved items` : 'Sign in with Google to persist items'}
            </span>
          </div>
          {workspaceItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {workspaceItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-mono">
                        {item.kind}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteWorkspaceItem(item.id)}
                        className="text-zinc-400 hover:text-red-400 cursor-pointer"
                        aria-label="Delete item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <h3 className="text-xs font-semibold text-white mt-1 line-clamp-1">{item.title}</h3>
                    {item.content && (
                      <p className="text-[11px] text-zinc-400 mt-1 line-clamp-3">{item.content}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">{item.model}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
