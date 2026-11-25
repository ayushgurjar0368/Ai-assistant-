import { AssistantState, AuraMood, ToolCallExecution } from '../types/assistant';
import { AudioStreamer } from './AudioStreamer';
import { AudioPlayer } from './AudioPlayer';
import { ToolManager } from './ToolManager';

export interface LiveSessionCallbacks {
  onStateChange: (state: AssistantState) => void;
  onUserVolume: (volume: number) => void;
  onAiVolume: (volume: number) => void;
  onToolExecution: (execution: ToolCallExecution) => void;
  onAuraMoodChange: (mood: AuraMood) => void;
  onMemoryEvent?: (event: { type: string; memory?: any; memories?: any[]; count?: number }) => void;
  onError: (error: string) => void;
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private streamer: AudioStreamer | null = null;
  private player: AudioPlayer | null = null;
  private toolManager: ToolManager;
  private state: AssistantState = 'disconnected';
  private callbacks: LiveSessionCallbacks;
  private voice: string = 'Aoede';
  private userId: string = 'default_user';
  private pingInterval: number | null = null;
  private userMuted = false;

  constructor(callbacks: LiveSessionCallbacks, voice: string = 'Aoede', userId = 'default_user') {
    this.callbacks = callbacks;
    this.voice = voice;
    this.userId = userId;

    this.toolManager = new ToolManager({
      onToolExecution: (exec) => this.callbacks.onToolExecution(exec),
      onAuraMoodChange: (mood) => this.callbacks.onAuraMoodChange(mood),
    });
  }

  public getState(): AssistantState {
    return this.state;
  }

  public getPlayer(): AudioPlayer | null {
    return this.player;
  }

  public setVoice(voice: string): void {
    this.voice = voice;
  }

  public setMuted(muted: boolean): void {
    this.userMuted = muted;
    if (this.streamer) {
      this.streamer.setMuted(muted);
    }
  }

  public isMuted(): boolean {
    return this.userMuted;
  }

  /**
   * Connect to Gemini Live API via backend WebSocket
   */
  public async connect(): Promise<void> {
    if (this.state !== 'disconnected') return;

    this.setState('connecting');

    try {
      // 1. Initialize AudioPlayer
      this.player = new AudioPlayer({
        onPlaybackStateChange: (isPlaying) => {
          if (isPlaying) {
            this.setState('speaking');
          } else {
            // Finished playing turns, revert to listening
            if (this.state === 'speaking') {
              this.setState('listening');
            }
          }
        },
        onVolumeChange: (vol) => {
          this.callbacks.onAiVolume(vol);
        },
        onError: (err) => {
          console.error('[LiveSession] AudioPlayer Error:', err);
        },
      });
      await this.player.init();

      // 2. Initialize AudioStreamer
      this.streamer = new AudioStreamer({
        onAudioChunk: (base64Chunk) => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(
              JSON.stringify({
                type: 'audio',
                data: base64Chunk,
              })
            );
          }
        },
        onVolumeChange: (vol) => {
          this.callbacks.onUserVolume(vol);

          // Barge-in check: if user speaks with sufficient volume while AI is speaking, interrupt immediately
          if (vol > 0.25 && this.state === 'speaking') {
            this.handleLocalInterruption();
          }
        },
        onError: (err) => {
          this.callbacks.onError(`Microphone error: ${err.message}`);
          this.disconnect();
        },
      });

      // 3. Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live?voice=${encodeURIComponent(this.voice)}&userId=${encodeURIComponent(this.userId)}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        try {
          await this.streamer?.start();
          this.streamer?.setMuted(this.userMuted);
          this.setState('listening');
          this.startHeartbeat();
        } catch (err: any) {
          this.callbacks.onError(`Could not start microphone: ${err?.message || err}`);
          this.disconnect();
        }
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'ready':
              this.setState('listening');
              break;

            case 'audio':
              if (msg.data && this.player) {
                await this.player.playChunk(msg.data);
              }
              break;

            case 'interrupted':
              // Gemini detected user speaking / barge-in
              this.handleServerInterruption();
              break;

            case 'turn_complete':
              // Wait for queued chunks to finish in player
              break;

            case 'memories_learned':
            case 'memory_saved':
            case 'memory_deleted':
            case 'all_memories_deleted':
              if (this.callbacks.onMemoryEvent) {
                this.callbacks.onMemoryEvent(msg);
              }
              break;

            case 'tool_call':
              if (msg.functionCalls && Array.isArray(msg.functionCalls)) {
                const responses = await Promise.all(
                  msg.functionCalls.map((call: any) => this.toolManager.handleToolCall(call))
                );

                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                  this.ws.send(
                    JSON.stringify({
                      type: 'tool_response',
                      functionResponses: responses,
                    })
                  );
                }
              }
              break;

            case 'error':
              console.error('[LiveSession Backend Error]:', msg.message);
              this.callbacks.onError(msg.message || 'Error occurred in live session');
              break;

            case 'session_closed':
              this.disconnect();
              break;
          }
        } catch (e: any) {
          console.error('[LiveSession Message Parse Error]:', e);
        }
      };

      this.ws.onerror = (e) => {
        console.error('[LiveSession WS Error]:', e);
        this.callbacks.onError('WebSocket connection error');
        this.disconnect();
      };

      this.ws.onclose = () => {
        if (this.state !== 'disconnected') {
          this.disconnect();
        }
      };
    } catch (err: any) {
      console.error('[LiveSession Connect Error]:', err);
      this.callbacks.onError(err?.message || 'Connection failed');
      this.disconnect();
    }
  }

  /**
   * Handle user barge-in detected locally
   */
  public handleLocalInterruption(): void {
    if (this.player) {
      this.player.stopAll();
    }
    this.setState('listening');
  }

  /**
   * Handle interruption event sent by Gemini Live API
   */
  private handleServerInterruption(): void {
    if (this.player) {
      this.player.stopAll();
    }
    this.setState('listening');
  }

  /**
   * Cleanly disconnect session and release resources
   */
  public disconnect(): void {
    this.stopHeartbeat();

    if (this.streamer) {
      this.streamer.stop();
      this.streamer = null;
    }

    if (this.player) {
      this.player.destroy();
      this.player = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }

    this.callbacks.onUserVolume(0);
    this.callbacks.onAiVolume(0);
    this.setState('disconnected');
  }

  private setState(newState: AssistantState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStateChange(newState);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
