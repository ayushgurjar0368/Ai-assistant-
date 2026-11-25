/**
 * AudioStreamer
 * Captures microphone audio, downsamples to 16kHz PCM16 mono little-endian,
 * and emits base64 audio chunks along with live volume levels for reactive visualizations.
 */

export interface AudioStreamerOptions {
  onAudioChunk: (base64Data: string) => void;
  onVolumeChange?: (volume: number) => void;
  onError?: (err: Error) => void;
}

export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private isStreaming = false;
  private isMuted = false;
  private options: AudioStreamerOptions;

  constructor(options: AudioStreamerOptions) {
    this.options = options;
  }

  public async start(): Promise<void> {
    if (this.isStreaming) return;

    try {
      // Request microphone stream with voice-enhancement flags
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Initialize AudioContext
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const inputSampleRate = this.audioContext.sampleRate;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Buffer size: 2048 or 4096 gives ~50-90ms latency
      const bufferSize = 4096;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!this.isStreaming || this.isMuted) {
          if (this.options.onVolumeChange) {
            this.options.onVolumeChange(0);
          }
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);

        // Calculate RMS volume level (0 to 1) for visualization
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSquares / inputData.length);
        const normalizedVolume = Math.min(1, Math.max(0, rms * 4)); // Boosted for responsive UI

        if (this.options.onVolumeChange) {
          this.options.onVolumeChange(normalizedVolume);
        }

        // Downsample to 16,000 Hz if needed
        const downsampled = this.downsampleTo16k(inputData, inputSampleRate);

        // Convert Float32 to PCM 16-bit little-endian
        const pcmBuffer = this.floatTo16BitPCM(downsampled);
        const base64 = this.arrayBufferToBase64(pcmBuffer);

        this.options.onAudioChunk(base64);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isStreaming = true;
    } catch (err: any) {
      console.error('[AudioStreamer] Error starting audio capture:', err);
      if (this.options.onError) {
        this.options.onError(err instanceof Error ? err : new Error(String(err)));
      }
      throw err;
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsStreaming(): boolean {
    return this.isStreaming;
  }

  public stop(): void {
    this.isStreaming = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        // ignore
      }
      this.audioContext = null;
    }

    if (this.options.onVolumeChange) {
      this.options.onVolumeChange(0);
    }
  }

  /**
   * Resamples an input Float32Array to 16,000 Hz
   */
  private downsampleTo16k(buffer: Float32Array, inputRate: number): Float32Array {
    if (inputRate === 16000) {
      return buffer;
    }

    const ratio = inputRate / 16000;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let sum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        sum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? sum / count : buffer[offsetBuffer] || 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  }

  /**
   * Converts Float32 [-1.0, 1.0] to 16-bit PCM little-endian
   */
  private floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  /**
   * Encodes ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
