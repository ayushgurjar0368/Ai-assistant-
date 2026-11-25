/**
 * AudioPlayer
 * Plays 24kHz PCM16 little-endian audio received from Gemini Live API.
 * Provides gapless playback, instant interruption handling, and real-time audio analysis.
 */

export interface AudioPlayerOptions {
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onVolumeChange?: (volume: number) => void;
  onError?: (err: Error) => void;
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private options: AudioPlayerOptions;
  private animFrameId: number | null = null;
  private isCurrentlyPlaying = false;
  private volumeCheckInterval: number | null = null;

  constructor(options: AudioPlayerOptions) {
    this.options = options;
  }

  public async init(): Promise<void> {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 24000 });
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.analyserNode.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.startAnalysisLoop();
  }

  /**
   * Enqueue a 24kHz raw PCM16 base64 chunk for gapless playback
   */
  public async playChunk(base64Data: string): Promise<void> {
    try {
      if (!this.audioContext || this.audioContext.state === 'closed') {
        await this.init();
      }

      if (this.audioContext!.state === 'suspended') {
        await this.audioContext!.resume();
      }

      const pcm16Data = this.base64ToInt16Array(base64Data);
      const float32Data = new Float32Array(pcm16Data.length);
      for (let i = 0; i < pcm16Data.length; i++) {
        float32Data[i] = pcm16Data[i] / 32768.0;
      }

      // Create 24kHz audio buffer
      const audioBuffer = this.audioContext!.createBuffer(
        1,
        float32Data.length,
        24000
      );
      audioBuffer.getChannelData(0).set(float32Data);

      const source = this.audioContext!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyserNode!);

      const now = this.audioContext!.currentTime;
      // Add a slight 25ms jitter buffer if nextStartTime fell behind
      if (this.nextStartTime < now) {
        this.nextStartTime = now + 0.025;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

      this.activeSources.push(source);
      this.updatePlayingState(true);

      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
        if (this.activeSources.length === 0) {
          this.updatePlayingState(false);
        }
      };
    } catch (err: any) {
      console.error('[AudioPlayer] Error playing chunk:', err);
      if (this.options.onError) {
        this.options.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /**
   * Immediately stops all queued and playing audio.
   * Crucial for user interruptions / barge-in.
   */
  public stopAll(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Source might already have stopped
      }
    }
    this.activeSources = [];
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
    this.updatePlayingState(false);
    if (this.options.onVolumeChange) {
      this.options.onVolumeChange(0);
    }
  }

  /**
   * Retrieves frequency data array for audio visualizer
   */
  public getFrequencyData(array: Uint8Array): void {
    if (this.analyserNode && this.isCurrentlyPlaying) {
      this.analyserNode.getByteFrequencyData(array as any);
    } else {
      array.fill(0);
    }
  }

  public getIsPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }

  public destroy(): void {
    this.stopAll();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.volumeCheckInterval) {
      clearInterval(this.volumeCheckInterval);
      this.volumeCheckInterval = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {
        // ignore
      }
      this.audioContext = null;
    }
  }

  private updatePlayingState(playing: boolean): void {
    if (this.isCurrentlyPlaying !== playing) {
      this.isCurrentlyPlaying = playing;
      if (this.options.onPlaybackStateChange) {
        this.options.onPlaybackStateChange(playing);
      }
    }
  }

  private startAnalysisLoop(): void {
    if (this.volumeCheckInterval) return;

    const dataArray = new Uint8Array(64);
    this.volumeCheckInterval = window.setInterval(() => {
      if (!this.analyserNode || !this.isCurrentlyPlaying) {
        if (this.options.onVolumeChange) {
          this.options.onVolumeChange(0);
        }
        return;
      }

      this.analyserNode.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length / 255;
      const volume = Math.min(1, avg * 1.8);

      if (this.options.onVolumeChange) {
        this.options.onVolumeChange(volume);
      }
    }, 40);
  }

  private base64ToInt16Array(base64: string): Int16Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }
}
