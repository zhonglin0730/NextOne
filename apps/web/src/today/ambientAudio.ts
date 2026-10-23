export type AmbientScene = "off" | "rain" | "ocean" | "forest";

function holdGain(gain: AudioParam, now: number) {
  if (typeof gain.cancelAndHoldAtTime === "function") gain.cancelAndHoldAtTime(now);
  else {
    const value = gain.value;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(value, now);
  }
}

/** Small, offline soundscapes generated locally. No microphone or network access. */
export class AmbientAudio {
  private context: AudioContext | undefined;
  private buffer: AudioBuffer | undefined;
  private voice: { gain: GainNode; nodes: AudioScheduledSourceNode[] } | undefined;
  private request = 0;
  private disposed = false;
  private volume = 0.35;

  async prepare() {
    if (this.disposed) return;
    if (!this.context || this.context.state === "closed") {
      this.context = new AudioContext();
      this.buffer = undefined;
    }
    if (this.context.state !== "running") await this.context.resume();
  }

  async play(scene: AmbientScene, volume: number) {
    const request = ++this.request;
    this.volume = Math.max(0, Math.min(1, volume));
    if (scene === "off" || this.disposed) {
      this.stopVoice();
      const context = this.context;
      if (context)
        window.setTimeout(() => {
          if (request === this.request && context.state !== "closed")
            void context.suspend().catch(() => {});
        }, 400);
      return;
    }
    await this.prepare();
    if (this.disposed || request !== this.request) return;
    const context = this.context!;
    this.stopVoice();
    if (!this.buffer) {
      this.buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
      const samples = this.buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    const noise = context.createBufferSource();
    noise.buffer = this.buffer;
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = scene === "forest" ? "bandpass" : "lowpass";
    filter.frequency.value = scene === "rain" ? 4600 : scene === "ocean" ? 650 : 900;
    filter.Q.value = 0.4;
    const envelope = context.createGain();
    envelope.gain.value = scene === "rain" ? 0.25 : 0.4;
    const output = context.createGain();
    output.gain.value = 0;
    output.gain.linearRampToValueAtTime(this.volume, context.currentTime + 0.5);
    noise.connect(filter).connect(envelope).connect(output).connect(context.destination);
    const nodes: AudioScheduledSourceNode[] = [noise];
    if (scene !== "rain") {
      const wave = context.createOscillator();
      wave.frequency.value = scene === "ocean" ? 0.11 : 0.065;
      const depth = context.createGain();
      depth.gain.value = 0.23;
      wave.connect(depth).connect(envelope.gain);
      wave.start();
      nodes.push(wave);
    }
    noise.start();
    this.voice = { gain: output, nodes };
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (!this.voice || !this.context) return;
    holdGain(this.voice.gain.gain, this.context.currentTime);
    this.voice.gain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.12);
  }

  private stopVoice() {
    if (!this.voice || !this.context) return;
    const { gain, nodes } = this.voice;
    this.voice = undefined;
    const now = this.context.currentTime;
    holdGain(gain.gain, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);
    for (const node of nodes) node.stop(now + 0.35);
    window.setTimeout(() => gain.disconnect(), 400);
  }

  dispose() {
    this.disposed = true;
    ++this.request;
    this.stopVoice();
    const context = this.context;
    this.context = undefined;
    this.buffer = undefined;
    if (context) window.setTimeout(() => void context.close().catch(() => {}), 400);
  }
}
