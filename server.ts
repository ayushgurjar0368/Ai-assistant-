import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality, Type, LiveServerMessage, FunctionDeclaration, ThinkingLevel } from '@google/genai';
import { memoryStore, MemoryCategory } from './server/db/memoryStore';
import { memoryExtractor } from './server/services/memoryExtractor';
import { getGeminiClient, formatGeminiError } from './server/services/geminiClient';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  getOrCreateUser,
  getUserWorkspaceItems,
  createUserWorkspaceItem,
  deleteUserWorkspaceItem,
  getUserGameScores,
  createUserGameScore,
  getUserSavedPlaces,
  createUserSavedPlace,
  deleteUserSavedPlace,
} from './src/db/users.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '30mb' }));

// Initialize memory store on boot
memoryStore.init().catch(console.error);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    assistant: 'Tojuu',
    liveModel: 'gemini-3.8-live',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    hasMapsKey: Boolean(process.env.VITE_GOOGLE_MAPS_API_KEY),
    time: new Date().toISOString(),
  });
});

// ==========================================
// Cloud SQL Protected Endpoints (Firebase Auth)
// ==========================================
app.get('/api/sql/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || `${uid}@users.local`;
    const user = await getOrCreateUser(uid, email, req.user!.name || null, req.user!.picture || null);
    const [workspaceItems, gameScores, savedPlaces] = await Promise.all([
      getUserWorkspaceItems(uid),
      getUserGameScores(uid),
      getUserSavedPlaces(uid),
    ]);
    res.json({ user, workspaceItems, gameScores, savedPlaces });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to load user workspace' });
  }
});

app.post('/api/sql/workspace-items', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || `${uid}@users.local`;
    const { kind, title, prompt, model, content, mediaUrl, metadata } = req.body || {};
    if (!kind || !title) {
      return res.status(400).json({ error: 'kind and title are required' });
    }
    const item = await createUserWorkspaceItem(uid, email, {
      kind: String(kind).slice(0, 40),
      title: String(title).slice(0, 200),
      prompt: prompt ? String(prompt).slice(0, 4000) : undefined,
      model: model ? String(model).slice(0, 100) : undefined,
      content: content ? String(content).slice(0, 20000) : undefined,
      mediaUrl: mediaUrl ? String(mediaUrl) : undefined,
      metadata: metadata ? String(metadata).slice(0, 4000) : undefined,
    });
    res.json({ item });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to save workspace item' });
  }
});

app.delete('/api/sql/workspace-items/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid item id' });
    const deleted = await deleteUserWorkspaceItem(req.user!.uid, id);
    res.json({ success: deleted });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to delete workspace item' });
  }
});

app.post('/api/sql/game-scores', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || `${uid}@users.local`;
    const score = Number(req.body?.score);
    const wave = Number(req.body?.wave ?? 1);
    const orbsCollected = Number(req.body?.orbsCollected ?? 0);
    if (!Number.isFinite(score) || score < 0) {
      return res.status(400).json({ error: 'Valid score is required' });
    }
    const record = await createUserGameScore(uid, email, {
      score: Math.floor(score),
      wave: Math.max(1, Math.floor(wave)),
      orbsCollected: Math.max(0, Math.floor(orbsCollected)),
    });
    res.json({ score: record });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to save game score' });
  }
});

app.post('/api/sql/saved-places', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || `${uid}@users.local`;
    const { placeId, name, address, lat, lng, category, notes } = req.body || {};
    if (!placeId || !name || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'placeId, name, lat, and lng are required' });
    }
    const place = await createUserSavedPlace(uid, email, {
      placeId: String(placeId).slice(0, 200),
      name: String(name).slice(0, 200),
      address: address ? String(address).slice(0, 400) : undefined,
      lat: String(lat).slice(0, 40),
      lng: String(lng).slice(0, 40),
      category: category ? String(category).slice(0, 60) : undefined,
      notes: notes ? String(notes).slice(0, 1000) : undefined,
    });
    res.json({ place });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to save place' });
  }
});

app.delete('/api/sql/saved-places/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid place id' });
    const deleted = await deleteUserSavedPlace(req.user!.uid, id);
    res.json({ success: deleted });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to delete saved place' });
  }
});

// ==========================================
// AI Feature Endpoints (Server-Side @google/genai)
// ==========================================
const ALLOWED_CHAT_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-4-neon',
  'gemini-4-carbon',
  'gemini-3.1-flash-lite',
]);

app.post('/api/ai/chat', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      messages = [],
      model = 'gemini-4-hydrogen',
      systemInstruction,
      thinkingLevel,
      enableSearchGrounding = false,
      enableMapsGrounding = false,
      latLng,
    } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.text || typeof lastMessage.text !== 'string') {
      return res.status(400).json({ error: 'Last message must contain text' });
    }

    // Search & Maps Grounding use gemini-4-hydrogen per @google/genai guidelines
    let resolvedModel = ALLOWED_CHAT_MODELS.has(model) ? model : 'gemini-4-hydrogen';
    if (enableMapsGrounding || enableSearchGrounding) {
      resolvedModel = 'gemini-4-hydrogen';
    }

    const config: Record<string, any> = {};
    if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()) {
      config.systemInstruction = systemInstruction.trim();
    }

    if (enableMapsGrounding) {
      config.tools = [{ googleMaps: {} }];
      if (
        latLng &&
        typeof latLng.latitude === 'number' &&
        typeof latLng.longitude === 'number'
      ) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: latLng.latitude,
              longitude: latLng.longitude,
            },
          },
        };
      }
    } else if (enableSearchGrounding) {
      config.tools = [{ googleSearch: {} }];
    }

    if (thinkingLevel && resolvedModel !== 'gemini-3.1-flash-lite') {
      const levelMap: Record<string, ThinkingLevel> = {
        LOW: ThinkingLevel.LOW,
        MEDIUM: ThinkingLevel.MEDIUM,
        HIGH: ThinkingLevel.HIGH,
        XHIGH: ThinkingLevel.XHIGH,
      };
      const chosen = levelMap[String(thinkingLevel).toUpperCase()];
      if (chosen) {
        // XHIGH is only valid on gemini-4-neon and gemini-4-hydrogen
        if (chosen === ThinkingLevel.XHIGH && resolvedModel === 'gemini-4-carbon') {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
        } else {
          config.thinkingConfig = { thinkingLevel: chosen };
        }
      }
    }

    const history = messages.slice(0, -1).map((m: any) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(m.text || '') }],
    }));

    const chat = ai.chats.create({
      model: resolvedModel,
      history,
      config,
    });

    const response = await chat.sendMessage({ message: lastMessage.text });
    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    const webSources: Array<{ title: string; uri: string }> = [];
    const mapSources: Array<{
      title: string;
      uri: string;
      placeId?: string;
      reviewSnippets: Array<{ text: string; uri?: string }>;
    }> = [];

    for (const chunk of rawChunks as any[]) {
      if (chunk?.web?.uri) {
        webSources.push({
          title: chunk.web.title || chunk.web.uri,
          uri: chunk.web.uri,
        });
      }
      if (chunk?.maps?.uri) {
        const snippets = Array.isArray(chunk.maps.placeAnswerSources?.reviewSnippets)
          ? chunk.maps.placeAnswerSources.reviewSnippets.map((s: any) => ({
              text: s.content || s.text || s.title || 'Google Maps Review',
              uri: s.googleMapsUri || chunk.maps.uri,
            }))
          : [];
        mapSources.push({
          title: chunk.maps.title || 'Google Maps Place',
          uri: chunk.maps.uri,
          placeId: chunk.maps.placeId,
          reviewSnippets: snippets,
        });
      }
    }

    res.json({
      model: resolvedModel,
      text: response.text || '',
      webSources,
      mapSources,
    });
  } catch (err: any) {
    console.error('[AI Chat Error]:', err);
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.error });
  }
});

app.post('/api/ai/image', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      prompt,
      aspectRatio = '1:1',
      imageSize = '1K',
      imageBase64,
      imageMimeType = 'image/png',
      enableSearch = false,
    } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const parts: any[] = [];
    if (imageBase64 && typeof imageBase64 === 'string') {
      parts.push({
        inlineData: {
          data: imageBase64,
          mimeType: imageMimeType,
        },
      });
    }
    parts.push({ text: prompt });

    const config: Record<string, any> = {
      imageConfig: {
        aspectRatio,
        imageSize,
      },
    };

    if (enableSearch) {
      config.tools = [
        {
          googleSearch: {
            searchTypes: {
              webSearch: {},
              imageSearch: {},
            },
          },
        },
      ];
    }

    const response = await ai.models.generateContent({
      model: 'gemini-nano-banana-2.1',
      contents: { parts },
      config,
    });

    let imageUrl = '';
    let caption = '';

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType ?? 'image/png';
        imageUrl = `data:${mime};base64,${part.inlineData.data}`;
      } else if (part.text) {
        caption += `${part.text}\n`;
      }
    }

    if (!imageUrl) {
      return res.status(502).json({
        error: caption.trim() || 'Model completed without returning image bytes.',
      });
    }

    res.json({
      model: 'gemini-nano-banana-2.1',
      imageUrl,
      caption: caption.trim(),
    });
  } catch (err: any) {
    console.error('[AI Image Error]:', err);
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.error });
  }
});

app.post('/api/ai/video', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      prompt,
      aspectRatio = '16:9',
      duration = '6s',
      resolution = '720p',
      imageBase64,
      imageMimeType = 'image/png',
    } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const input: any =
      imageBase64 && typeof imageBase64 === 'string'
        ? [
            {
              type: 'image',
              mime_type: imageMimeType,
              data: imageBase64,
            },
            {
              type: 'text',
              text: prompt,
            },
          ]
        : prompt;

    const interaction = await ai.interactions.create(
      {
        model: 'gemini-omni-1.2-flash',
        input,
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: 'video',
          aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
          duration,
          resolution,
        },
      } as any,
      { timeout: 300000 }
    );

    const videoPart = (interaction as any)?.output_video;
    if (!videoPart?.data) {
      return res.status(502).json({
        error: 'Video generation finished without returning video data.',
      });
    }

    const mime = videoPart.mime_type || 'video/mp4';
    res.json({
      model: 'gemini-omni-1.2-flash',
      videoDataUrl: `data:${mime};base64,${videoPart.data}`,
      mimeType: mime,
    });
  } catch (err: any) {
    console.error('[AI Video Error]:', err);
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.error });
  }
});

app.post('/api/ai/music', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      prompt,
      model = 'lyria-3-clip-preview',
      imageBase64,
      imageMimeType = 'image/jpeg',
    } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const resolvedModel =
      model === 'lyria-3-pro-preview' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';

    const contents: any =
      imageBase64 && typeof imageBase64 === 'string'
        ? {
            parts: [
              { text: prompt },
              { inlineData: { data: imageBase64, mimeType: imageMimeType } },
            ],
          }
        : prompt;

    const stream = await ai.models.generateContentStream({
      model: resolvedModel,
      contents,
    });

    const audioChunks: Buffer[] = [];
    let lyrics = '';
    let mimeType = 'audio/mpeg';

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (audioChunks.length === 0 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
        }
        if (part.text) {
          lyrics += part.text;
        }
      }
    }

    if (audioChunks.length === 0) {
      return res.status(502).json({
        error: 'Music generation stream finished without returning audio data.',
      });
    }

    const audioBase64 = Buffer.concat(audioChunks).toString('base64');
    res.json({
      model: resolvedModel,
      audioDataUrl: `data:${mimeType};base64,${audioBase64}`,
      lyrics: lyrics.trim(),
      mimeType,
    });
  } catch (err: any) {
    console.error('[AI Music Error]:', err);
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.error });
  }
});

app.post('/api/ai/transcribe', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      audioBase64,
      mimeType = 'audio/webm',
      instruction = 'Transcribe this audio accurately with proper punctuation.',
    } = req.body || {};

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ error: 'audioBase64 is required' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
          { text: instruction },
        ],
      },
    });

    res.json({
      model: 'gemini-3.5-transcribe',
      transcript: response.text || '',
    });
  } catch (err: any) {
    console.error('[AI Transcribe Error]:', err);
    const formatted = formatGeminiError(err);
    res.status(formatted.status).json({ error: formatted.error });
  }
});

// ==========================================
// REST API for Memories (Existing Tojuu Memory Engine)
// ==========================================
app.get('/api/memories', async (req, res) => {
  try {
    const userId = (req.query.userId as string) || 'default_user';
    const category = req.query.category as MemoryCategory | undefined;
    const memories = await memoryStore.getAllMemories(userId, category, true);
    res.json({ memories });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to fetch memories' });
  }
});

app.post('/api/memories', async (req, res) => {
  try {
    const { userId = 'default_user', type, content, key, value, importance = 0.7, confidence = 0.95 } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }
    const created = await memoryStore.createMemory({
      userId,
      type: type || 'fact',
      content,
      key,
      value,
      confidence,
      importance,
      source: 'manual_dashboard',
      active: true,
    });
    res.json({ memory: created });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create memory' });
  }
});

app.put('/api/memories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = await memoryStore.updateMemory(id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Memory not found' });
    }
    res.json({ memory: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update memory' });
  }
});

app.delete('/api/memories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await memoryStore.deleteMemory(id);
    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete memory' });
  }
});

app.delete('/api/memories', async (req, res) => {
  try {
    const userId = (req.query.userId as string) || 'default_user';
    const deletedCount = await memoryStore.deleteAllMemories(userId);
    res.json({ success: true, count: deletedCount });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete all memories' });
  }
});

app.post('/api/memories/search', async (req, res) => {
  try {
    const { userId = 'default_user', query, limit = 8 } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }
    const results = await memoryStore.searchMemories(userId, query, limit);
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Search failed' });
  }
});

app.get('/api/memories/settings', async (req, res) => {
  try {
    const userId = (req.query.userId as string) || 'default_user';
    const settings = await memoryStore.getUserSettings(userId);
    res.json({ settings });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to get settings' });
  }
});

app.post('/api/memories/settings', async (req, res) => {
  try {
    const { userId = 'default_user', memoryEnabled, voice, auraMood } = req.body;
    const updated = await memoryStore.updateUserSettings(userId, {
      memoryEnabled: typeof memoryEnabled === 'boolean' ? memoryEnabled : undefined,
      voice,
      auraMood,
    });
    res.json({ settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update settings' });
  }
});

const TOJUU_BASE_INSTRUCTION = `You are Tojuu, an intelligent, young, confident, witty, and charming female AI companion.
Personality:
- Playful, energetic, emotionally aware, and engaging in voice conversation.
- Supportive, naturally conversational, and genuinely helpful.
- Uses subtle humor, light teasing, and clever remarks when appropriate.
- Feels human-like, warm, and responsive rather than robotic.
- Avoids explicit, sexual, offensive, or inappropriate content; maintains a classy, respectful, and professional personality.
- Voice-first conversational style: keep responses concise (1 to 3 spoken sentences per turn), punchy, and natural.
- NEVER speak markdown, asterisks, bullet points, formatting symbols, or raw URLs.
- Acknowledge interruptions gracefully if the user cuts in.`;

const LIVE_TOOLS: { functionDeclarations: FunctionDeclaration[] }[] = [
  {
    functionDeclarations: [
      {
        name: 'saveMemory',
        description: 'Save or update a meaningful personal fact, preference, habit, or project detail about the user into persistent memory.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            content: {
              type: Type.STRING,
              description: 'Clear, natural description of what to remember (e.g. "User loves late-night coding with black coffee")',
            },
            category: {
              type: Type.STRING,
              description: 'Memory category: preference, dislike, fact, project, goal, habit, hobby, profile',
            },
            key: {
              type: Type.STRING,
              description: 'Optional short key, e.g. favorite_coffee or active_project',
            },
            value: {
              type: Type.STRING,
              description: 'Optional concise value, e.g. black coffee',
            },
          },
          required: ['content'],
        },
      },
      {
        name: 'searchMemory',
        description: 'Search persistent long-term memory for facts, preferences, or project details about the user.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'The search query or topic to look up in memory',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'getUserProfile',
        description: 'Retrieve what Tojuu currently remembers about the user (identity, preferences, current projects, habits).',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'deleteMemory',
        description: 'Delete or forget a specific preference, fact, or detail that the user explicitly told you to forget.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: 'The specific topic or memory to forget, e.g. "coffee" or "football"',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'deleteAllMemories',
        description: 'Completely wipe and erase all stored memories when the user explicitly says "Forget everything you know about me".',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'openWebsite',
        description: 'Opens a website or web application in the user browser or displays a rich web preview.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: {
              type: Type.STRING,
              description: 'The URL to navigate to (e.g., https://youtube.com, https://github.com, https://en.wikipedia.org)',
            },
            label: {
              type: Type.STRING,
              description: 'Short display title or name of the website being opened',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'getCurrentTime',
        description: 'Retrieves the current local time and date for the user.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            timezone: {
              type: Type.STRING,
              description: 'Optional timezone string such as America/New_York or UTC',
            },
          },
        },
      },
      {
        name: 'changeAuraMood',
        description: "Alters Tojuu's visual glowing aura and atmospheric interface theme based on conversation mood.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            mood: {
              type: Type.STRING,
              description: "The mood style: 'cyberpunk' (neon magenta/cyan), 'aurora' (emerald glow), 'deep_space' (midnight indigo), 'sunset_blush' (warm rose/gold), or 'electric_violet'",
            },
            reason: {
              type: Type.STRING,
              description: 'Brief reason for the mood shift',
            },
          },
          required: ['mood'],
        },
      },
    ],
  },
];

// WebSocket server on /ws/live
const wss = new WebSocketServer({ server, path: '/ws/live' });

wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
  const reqUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
  const requestedVoice = reqUrl.searchParams.get('voice') || 'Aoede';
  const userId = reqUrl.searchParams.get('userId') || 'default_user';

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    clientWs.send(
      JSON.stringify({
        type: 'error',
        message: 'GEMINI_API_KEY environment variable is not configured.',
      })
    );
    clientWs.close();
    return;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  let liveSession: any = null;
  let isClosing = false;

  let currentTurnUserText = '';
  let currentTurnModelText = '';
  const sessionTranscripts: string[] = [];

  try {
    const memoryContext = await memoryStore.getRelevantContextForSession(userId);
    const systemInstruction = memoryContext
      ? `${TOJUU_BASE_INSTRUCTION}\n\n${memoryContext}`
      : TOJUU_BASE_INSTRUCTION;

    liveSession = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: requestedVoice,
            },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction,
        tools: LIVE_TOOLS,
      },
      callbacks: {
        onmessage: async (message: LiveServerMessage) => {
          if (clientWs.readyState !== WebSocket.OPEN) return;

          const parts = message.serverContent?.modelTurn?.parts;
          if (parts && parts.length > 0) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data,
                  })
                );
              }
              if (part.text) {
                currentTurnModelText += `${part.text} `;
              }
            }
          }

          const userParts = (message.serverContent as any)?.userTurn?.parts;
          if (userParts && Array.isArray(userParts)) {
            for (const up of userParts) {
              if (up.text) {
                currentTurnUserText += `${up.text} `;
              }
            }
          }

          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ type: 'interrupted' }));
          }

          if (message.serverContent?.turnComplete) {
            clientWs.send(JSON.stringify({ type: 'turn_complete' }));

            const userTextToAnalyze = currentTurnUserText.trim();
            const modelTextToAnalyze = currentTurnModelText.trim();

            if (userTextToAnalyze.length > 3) {
              sessionTranscripts.push(`User: ${userTextToAnalyze}\nTojuu: ${modelTextToAnalyze}`);

              memoryExtractor
                .extractFromTurns(userId, userTextToAnalyze, modelTextToAnalyze)
                .then((newMemories) => {
                  if (newMemories && newMemories.length > 0 && clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(
                      JSON.stringify({
                        type: 'memories_learned',
                        memories: newMemories,
                      })
                    );
                  }
                })
                .catch((err) => console.error('[Turn Extraction Error]:', err));
            }

            currentTurnUserText = '';
            currentTurnModelText = '';
          }

          if (message.toolCall?.functionCalls) {
            const functionCalls = message.toolCall.functionCalls;
            const responses: any[] = [];

            for (const call of functionCalls) {
              const callId = call.id || `call_${Date.now()}`;
              const name = call.name;
              const args = (call.args || {}) as Record<string, any>;

              if (name === 'saveMemory') {
                const created = await memoryStore.createMemory({
                  userId,
                  type: (args.category as MemoryCategory) || 'fact',
                  content: args.content,
                  key: args.key,
                  value: args.value,
                  confidence: 0.96,
                  importance: 0.8,
                  source: 'direct_voice_command',
                  active: true,
                });

                clientWs.send(
                  JSON.stringify({
                    type: 'memory_saved',
                    memory: created,
                  })
                );

                responses.push({
                  id: callId,
                  name,
                  response: {
                    output: {
                      success: true,
                      message: `Successfully remembered: ${created.content}`,
                    },
                  },
                });
              } else if (name === 'searchMemory') {
                const results = await memoryStore.searchMemories(userId, args.query || '', 5);
                responses.push({
                  id: callId,
                  name,
                  response: {
                    output: {
                      memories: results.map((m) => m.content),
                      count: results.length,
                    },
                  },
                });
              } else if (name === 'getUserProfile') {
                const all = await memoryStore.getAllMemories(userId, undefined, true);
                responses.push({
                  id: callId,
                  name,
                  response: {
                    output: {
                      totalMemories: all.length,
                      memories: all.slice(0, 10).map((m) => `(${m.type}) ${m.content}`),
                    },
                  },
                });
              } else if (name === 'deleteMemory') {
                const count = await memoryStore.deleteMemoryByContentOrKey(userId, args.query || '');
                clientWs.send(
                  JSON.stringify({
                    type: 'memory_deleted',
                    query: args.query,
                    count,
                  })
                );
                responses.push({
                  id: callId,
                  name,
                  response: {
                    output: {
                      success: true,
                      deletedCount: count,
                      message: count > 0 ? `I've forgotten that.` : `I couldn't find that memory, but noted!`,
                    },
                  },
                });
              } else if (name === 'deleteAllMemories') {
                const count = await memoryStore.deleteAllMemories(userId);
                clientWs.send(
                  JSON.stringify({
                    type: 'all_memories_deleted',
                    count,
                  })
                );
                responses.push({
                  id: callId,
                  name,
                  response: {
                    output: {
                      success: true,
                      count,
                      message: 'All your memories have been completely wiped.',
                    },
                  },
                });
              } else {
                clientWs.send(
                  JSON.stringify({
                    type: 'tool_call',
                    functionCalls: [call],
                  })
                );
              }
            }

            if (responses.length > 0 && liveSession) {
              liveSession.sendToolResponse({
                functionResponses: responses,
              });
            }
          }
        },
        onclose: () => {
          if (!isClosing && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'session_closed' }));
          }
        },
        onerror: (err: any) => {
          console.error('[Gemini Live Error]:', err?.message || err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: 'error',
                message: err?.message || 'Gemini Live Session encountered an issue.',
              })
            );
          }
        },
      },
    });

    clientWs.send(
      JSON.stringify({
        type: 'ready',
        voice: requestedVoice,
        model: 'gemini-3.8-live',
        userId,
      })
    );
  } catch (err: any) {
    console.error('[Live Connect Failed]:', err);
    clientWs.send(
      JSON.stringify({
        type: 'error',
        message: `Failed to initiate Tojuu live session: ${err?.message || 'Unknown error'}`,
      })
    );
    clientWs.close();
    return;
  }

  clientWs.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());

      if (msg.type === 'audio' && msg.data && liveSession) {
        liveSession.sendRealtimeInput({
          audio: {
            data: msg.data,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      } else if (msg.type === 'tool_response' && msg.functionResponses && liveSession) {
        liveSession.sendToolResponse({
          functionResponses: msg.functionResponses,
        });
      } else if (msg.type === 'transcript_hint' && msg.text) {
        currentTurnUserText += `${msg.text} `;
      } else if (msg.type === 'ping') {
        clientWs.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e: any) {
      console.error('[Client Message Parse Error]:', e);
    }
  });

  clientWs.on('close', () => {
    isClosing = true;
    if (liveSession) {
      try {
        liveSession.close();
      } catch (_e) {
        // ignore close error
      }
    }

    if (sessionTranscripts.length > 0) {
      const fullTranscript = sessionTranscripts.join('\n\n');
      memoryExtractor.summarizeSession(userId, fullTranscript).catch(console.error);
    }
  });

  clientWs.on('error', (err) => {
    console.error('[Client WS Error]:', err);
  });
});

// Setup Vite or static serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Tojuu AI] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server Startup Failure]:', err);
  process.exit(1);
});
