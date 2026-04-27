import { AlertSoundId, getAlertSound, getCustomSound, getAlertVolume } from "./settings";

type Note = { freq: number; start: number; dur: number; type?: OscillatorType; gain?: number };

const PATTERNS: Record<Exclude<AlertSoundId, "off" | "custom">, Note[]> = {
  chime: [
    { freq: 880, start: 0, dur: 0.18 },
    { freq: 660, start: 0.18, dur: 0.3 },
  ],
  beepBeep: [
    { freq: 1000, start: 0, dur: 0.12, type: "square" },
    { freq: 1000, start: 0.22, dur: 0.12, type: "square" },
  ],
  alarm: [
    { freq: 750, start: 0, dur: 0.2, type: "sawtooth" },
    { freq: 950, start: 0.22, dur: 0.2, type: "sawtooth" },
    { freq: 750, start: 0.44, dur: 0.2, type: "sawtooth" },
    { freq: 950, start: 0.66, dur: 0.2, type: "sawtooth" },
  ],
  ding: [{ freq: 1320, start: 0, dur: 0.5, gain: 0.18 }],
  siren: [
    { freq: 600, start: 0, dur: 0.35, type: "sine" },
    { freq: 1100, start: 0.35, dur: 0.35, type: "sine" },
    { freq: 600, start: 0.7, dur: 0.35, type: "sine" },
  ],
  buzzer: [
    { freq: 220, start: 0, dur: 0.45, type: "square", gain: 0.22 },
  ],
};

let customAudio: HTMLAudioElement | null = null;

function playCustom(volume: number) {
  const { dataUrl } = getCustomSound();
  if (!dataUrl) {
    // Fallback to default chime if no custom file uploaded
    playPattern("chime", volume);
    return;
  }
  try {
    if (!customAudio || customAudio.src !== dataUrl) {
      customAudio = new Audio(dataUrl);
    }
    customAudio.currentTime = 0;
    customAudio.volume = volume;
    void customAudio.play();
  } catch {
    /* noop */
  }
}

function playPattern(id: Exclude<AlertSoundId, "off" | "custom">, volume: number) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = PATTERNS[id] ?? PATTERNS.chime;
    const t0 = ctx.currentTime;
    let endsAt = t0;
    for (const n of notes) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = n.type ?? "sine";
      o.frequency.setValueAtTime(n.freq, t0 + n.start);
      const peak = (n.gain ?? 0.25) * volume;
      g.gain.setValueAtTime(0.0001, t0 + n.start);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + n.start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.start + n.dur);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + n.start);
      o.stop(t0 + n.start + n.dur + 0.02);
      endsAt = Math.max(endsAt, t0 + n.start + n.dur + 0.05);
    }
    setTimeout(() => ctx.close?.(), Math.ceil((endsAt - t0) * 1000) + 50);
  } catch {
    /* noop */
  }
}

export function playAlertSound(idOverride?: AlertSoundId, volumeOverride?: number) {
  const id = idOverride ?? getAlertSound();
  if (id === "off") return;
  const volume = volumeOverride ?? getAlertVolume();
  if (id === "custom") {
    playCustom(volume);
    return;
  }
  playPattern(id, volume);
}
