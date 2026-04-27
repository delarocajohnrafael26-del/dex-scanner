// Local user-customizable settings (per-device, persisted in localStorage)

export type AlertSoundId =
  | "off"
  | "chime"
  | "beepBeep"
  | "alarm"
  | "ding"
  | "siren"
  | "buzzer";

export const ALERT_SOUND_OPTIONS: { id: AlertSoundId; label: string }[] = [
  { id: "off", label: "Off (silent)" },
  { id: "chime", label: "Chime (default)" },
  { id: "beepBeep", label: "Double Beep" },
  { id: "alarm", label: "Alarm" },
  { id: "ding", label: "Soft Ding" },
  { id: "siren", label: "Siren" },
  { id: "buzzer", label: "Buzzer" },
];

const KEY_SOUND = "dexscanner.alertSound";
const KEY_WALLPAPER = "dexscanner.wallpaper";

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
