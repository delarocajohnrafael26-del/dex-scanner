// Local user-customizable settings (per-device, persisted in localStorage)

export type AlertSoundId =
  | "off"
  | "chime"
  | "beepBeep"
  | "alarm"
  | "ding"
  | "siren"
  | "buzzer"
  | "custom";

export const ALERT_SOUND_OPTIONS: { id: AlertSoundId; label: string }[] = [
  { id: "off", label: "Off (silent)" },
  { id: "chime", label: "Chime (default)" },
  { id: "beepBeep", label: "Double Beep" },
  { id: "alarm", label: "Alarm" },
  { id: "ding", label: "Soft Ding" },
  { id: "siren", label: "Siren" },
  { id: "buzzer", label: "Buzzer" },
  { id: "custom", label: "Custom upload" },
];

const KEY_SOUND = "dexscanner.alertSound";
const KEY_WALLPAPER = "dexscanner.wallpaper";
const KEY_CUSTOM_SOUND = "dexscanner.customSound"; // data URL
const KEY_CUSTOM_SOUND_NAME = "dexscanner.customSoundName";
const KEY_VOLUME = "dexscanner.alertVolume"; // 0..1

export function getAlertSound(): AlertSoundId {
  const v = (typeof localStorage !== "undefined" && localStorage.getItem(KEY_SOUND)) as AlertSoundId | null;
  return (v && ALERT_SOUND_OPTIONS.some((o) => o.id === v) ? v : "chime") as AlertSoundId;
}
export function setAlertSound(id: AlertSoundId) {
  localStorage.setItem(KEY_SOUND, id);
}

export function getWallpaper(): string | null {
  try {
    return localStorage.getItem(KEY_WALLPAPER);
  } catch {
    return null;
  }
}
export function setWallpaper(dataUrl: string | null) {
  if (dataUrl) localStorage.setItem(KEY_WALLPAPER, dataUrl);
  else localStorage.removeItem(KEY_WALLPAPER);
  window.dispatchEvent(new CustomEvent("wallpaper-changed"));
}

export function getCustomSound(): { dataUrl: string | null; name: string | null } {
  try {
    return {
      dataUrl: localStorage.getItem(KEY_CUSTOM_SOUND),
      name: localStorage.getItem(KEY_CUSTOM_SOUND_NAME),
    };
  } catch {
    return { dataUrl: null, name: null };
  }
}
export function setCustomSound(dataUrl: string | null, name: string | null) {
  if (dataUrl) {
    localStorage.setItem(KEY_CUSTOM_SOUND, dataUrl);
    localStorage.setItem(KEY_CUSTOM_SOUND_NAME, name ?? "Custom sound");
  } else {
    localStorage.removeItem(KEY_CUSTOM_SOUND);
    localStorage.removeItem(KEY_CUSTOM_SOUND_NAME);
  }
}

export function getAlertVolume(): number {
  const v = Number(localStorage.getItem(KEY_VOLUME));
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.8;
}
export function setAlertVolume(v: number) {
  localStorage.setItem(KEY_VOLUME, String(Math.max(0, Math.min(1, v))));
}
