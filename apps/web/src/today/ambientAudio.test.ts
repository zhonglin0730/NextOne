import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmbientAudio } from "./ambientAudio";

const parameter = () => ({
  value: 0,
  linearRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
  cancelAndHoldAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  setValueAtTime: vi.fn(),
});
const node = () => ({
  gain: parameter(),
  frequency: parameter(),
  Q: parameter(),
  connect: vi.fn((target: unknown) => target),
  disconnect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
});

describe("ambient audio races", () => {
  let ready: Promise<void>;
  let contexts: FakeContext[];
  class FakeContext {
    state = "suspended";
    sampleRate = 8000;
    currentTime = 0;
    destination = node();
    sources: ReturnType<typeof node>[] = [];
    gains: ReturnType<typeof node>[] = [];
    constructor() {
      contexts.push(this);
    }
    async resume() {
      await ready;
      this.state = "running";
    }
    async suspend() {
      this.state = "suspended";
    }
    async close() {
      this.state = "closed";
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(32000) };
    }
    createBufferSource() {
      const source = node();
      this.sources.push(source);
      return source;
    }
    createGain() {
      const gain = node();
      this.gains.push(gain);
      return gain;
    }
    createBiquadFilter() {
      return node();
    }
    createOscillator() {
      return node();
    }
  }
  beforeEach(() => {
    vi.useFakeTimers();
    contexts = [];
    ready = Promise.resolve();
    vi.stubGlobal("AudioContext", FakeContext);
    vi.stubGlobal("window", { setTimeout });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not start a stale scene after switching to silence during resume", async () => {
    let resume!: () => void;
    ready = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const audio = new AmbientAudio();
    const first = audio.play("rain", 0.35);
    const second = audio.play("forest", 0.35);
    await audio.play("off", 0.35);
    resume();
    await Promise.all([first, second]);
    await vi.advanceTimersByTimeAsync(450);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.sources).toHaveLength(0);
    expect(contexts[0]?.state).toBe("suspended");
    audio.dispose();
    await vi.advanceTimersByTimeAsync(450);
    expect(contexts[0]?.state).toBe("closed");
  });
  it("honors a volume change made while the context is preparing", async () => {
    let resume!: () => void;
    ready = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const audio = new AmbientAudio();
    const playing = audio.play("rain", 0.35);
    audio.setVolume(0);
    resume();
    await playing;
    const output = contexts[0]?.gains.at(-1)?.gain;
    expect(output?.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.5);
    audio.setVolume(0.2);
    expect(output?.cancelAndHoldAtTime).toHaveBeenCalledWith(0);
    expect(output?.setTargetAtTime).toHaveBeenLastCalledWith(0.2, 0, 0.12);
    audio.dispose();
    await vi.advanceTimersByTimeAsync(450);
    expect(contexts[0]?.state).toBe("closed");
  });
});
