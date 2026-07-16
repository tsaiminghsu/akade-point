/**
 * Web Audio API sound manager.
 * Lazy-initializes AudioContext on first user gesture (browser autoplay policy).
 */

type SoundKey =
  | 'reel_spin'
  | 'reel_stop'
  | 'win_small'
  | 'win_big'
  | 'win_mega'
  | 'win_epic'
  | 'win_legendary'
  | 'scatter_land'
  | 'free_spin_start'
  | 'coin_shower'
  | 'wild_land'
  | 'ambient';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundKey, AudioBuffer>();
  private activeNodes = new Map<SoundKey, AudioBufferSourceNode>();
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private initialized = false;

  /** Call on first user interaction to unlock AudioContext */
  init(): void {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.4;
    this.musicGain.connect(this.masterGain);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 1.0;
    this.sfxGain.connect(this.masterGain);
    this.initialized = true;

    // Load audio files
    this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const manifest: Partial<Record<SoundKey, string>> = {
      reel_spin:       '/temple-of-desert-god/audio/reel_spin.mp3',
      reel_stop:       '/temple-of-desert-god/audio/reel_stop.mp3',
      win_small:       '/temple-of-desert-god/audio/win_small.mp3',
      win_big:         '/temple-of-desert-god/audio/win_big.mp3',
      win_mega:        '/temple-of-desert-god/audio/win_mega.mp3',
      win_epic:        '/temple-of-desert-god/audio/win_epic.mp3',
      win_legendary:   '/temple-of-desert-god/audio/win_legendary.mp3',
      scatter_land:    '/temple-of-desert-god/audio/scatter_land.mp3',
      free_spin_start: '/temple-of-desert-god/audio/free_spin_start.mp3',
      coin_shower:     '/temple-of-desert-god/audio/coin_shower.mp3',
      wild_land:       '/temple-of-desert-god/audio/wild_land.mp3',
    };

    for (const [key, url] of Object.entries(manifest)) {
      this.loadSound(key as SoundKey, url);
    }
  }

  private async loadSound(key: SoundKey, url: string): Promise<void> {
    if (!this.ctx) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return; // gracefully skip missing audio
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.buffers.set(key, audioBuffer);
    } catch {
      // Audio files optional — game works without sound
    }
  }

  play(key: SoundKey, loop = false, channel: 'sfx' | 'music' = 'sfx'): void {
    if (!this.ctx || !this.initialized) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;

    // Stop previous instance of same sound
    this.stop(key);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const gainNode = channel === 'music' ? this.musicGain : this.sfxGain;
    if (gainNode) source.connect(gainNode);
    source.start(0);
    this.activeNodes.set(key, source);

    source.onended = () => {
      this.activeNodes.delete(key);
    };
  }

  stop(key: SoundKey): void {
    const node = this.activeNodes.get(key);
    if (node) {
      try { node.stop(); } catch { /* already stopped */ }
      this.activeNodes.delete(key);
    }
  }

  stopAll(): void {
    for (const key of this.activeNodes.keys()) {
      this.stop(key);
    }
  }

  setMasterVolume(vol: number): void {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
  }

  setSfxVolume(vol: number): void {
    if (this.sfxGain) this.sfxGain.gain.value = Math.max(0, Math.min(1, vol));
  }
}

export const soundEngine = new SoundEngine();
