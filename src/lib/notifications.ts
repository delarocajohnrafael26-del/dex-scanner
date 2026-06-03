import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/lib/types";
import { daysLeft, shouldAlert } from "@/lib/expiry";
import { parseISO } from "date-fns";

const isNative = () => Capacitor.isNativePlatform();

/**
 * Build a stable numeric notification id from a product id + batch.
 * Using a hash so dismissing/rescheduling replaces the same slot.
 */
function notifId(productId: string, batch: number): number {
  let h = 0;
  for (let i = 0; i < productId.length; i++) {
    h = (h * 31 + productId.charCodeAt(i)) | 0;
  }
  // Keep within 32-bit positive range, encode batch in the low bits
  return Math.abs(h) % 100000000 * 10 + batch;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (isNative()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === "granted") return true;
      const req = await LocalNotifications.requestPermissions();
      return req.display === "granted";
    } catch {
      return false;
    }
  }
  // Web / WebView APK (e.g. webintoapp): use the standard Notification API.
  if (typeof Notification === "undefined") return false;
  try {
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

/**
 * Schedule a device-level notification for every active expiry that needs alerting.
 * Runs even when the app is closed (native APK only).
 *
 * Strategy:
 * - Expired items: notify shortly after we sync (within a minute).
 * - Upcoming items: notify at 9:00 AM on the day they cross the 30-day threshold,
 *   AND on the expiry date itself.
 * - We cancel + reschedule each run so the set always matches current data.
 */
export async function scheduleExpiryNotifications() {
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  if (!isNative()) {
    return scheduleWebExpiryNotifications();
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: products } = await supabase.from("products").select("*");
  if (!products) return;

  // Cancel all previously scheduled to keep state in sync
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
  } catch {
    /* ignore */
  }

  const toSchedule: any[] = [];
  const now = new Date();

  for (const p of products as Product[]) {
    ([1, 2, 3] as const).forEach((idx) => {
      const date = (p as any)[`expiry_${idx}`] as string | null;
      if (!date) return;
      const sev = shouldAlert(date);
      if (!sev) return;

      const id = notifId(p.id, idx);
      const title =
        sev === "expired"
          ? `Expired: ${p.name || p.barcode}`
          : `Expiring soon: ${p.name || p.barcode}`;
      const d = daysLeft(date)!;
      const body =
        sev === "expired"
          ? `Batch ${idx} expired ${Math.abs(d)} day(s) ago.`
          : `Batch ${idx} expires in ${d} day(s) (${date}).`;

      // Fire at 9:00 AM local — if that's already past today, fire in 1 minute
      const at = new Date();
      at.setHours(9, 0, 0, 0);
      if (at.getTime() <= now.getTime() + 30_000) {
        at.setTime(now.getTime() + 60_000);
      }

      toSchedule.push({
        id,
        title,
        body,
        schedule: { at },
        smallIcon: "ic_stat_icon_config_sample",
        extra: { productId: p.id, batch: idx, expiry: date },
      });

      // Also schedule a notification on the expiry date itself at 9 AM (if future)
      const expiryDay = parseISO(date);
      expiryDay.setHours(9, 0, 0, 0);
      if (expiryDay.getTime() > now.getTime() + 60_000) {
        toSchedule.push({
          id: id + 1000000000, // distinct slot
          title: `Expires today: ${p.name || p.barcode}`,
          body: `Batch ${idx} reaches its expiry date today.`,
          schedule: { at: expiryDay },
          smallIcon: "ic_stat_icon_config_sample",
          extra: { productId: p.id, batch: idx, expiry: date },
        });
      }
    });
  }

  if (toSchedule.length) {
    try {
      await LocalNotifications.schedule({ notifications: toSchedule });
    } catch (e) {
      console.warn("Failed to schedule notifications", e);
    }
  }
}

/** Cancel a single notification (e.g., when user dismisses an alert). */
export async function cancelExpiryNotification(productId: string, batch: number) {
  if (!isNative()) return;
  const id = notifId(productId, batch);
  try {
    await LocalNotifications.cancel({
      notifications: [{ id }, { id: id + 1000000000 }],
    });
  } catch {
    /* ignore */
  }
}

/**
 * Web/WebView scheduling. Uses a service worker to fire notifications even
 * when the page is backgrounded. Works in webintoapp APKs as long as the OS
 * keeps the WebView's service worker alive.
 */
async function scheduleWebExpiryNotifications() {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg || !reg.active) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: products } = await supabase.from("products").select("*");
  if (!products) return;

  const now = Date.now();
  const horizon = now + 7 * 24 * 60 * 60 * 1000; // schedule up to 7 days out
  const notifications: any[] = [];

  for (const p of products as Product[]) {
    ([1, 2, 3] as const).forEach((idx) => {
      const date = (p as any)[`expiry_${idx}`] as string | null;
      if (!date) return;
      const sev = shouldAlert(date);
      if (!sev) return;
      const tag = `expiry-${p.id}-${idx}`;
      const label = p.name || p.barcode || "Item";
      const d = daysLeft(date)!;

      if (sev === "expired") {
        notifications.push({
          tag,
          at: now + 30_000,
          title: `Expired: ${label}`,
          body: `Batch ${idx} expired ${Math.abs(d)} day(s) ago.`,
          data: { productId: p.id, batch: idx, expiry: date },
        });
      } else {
        // Fire at 9:00 AM next chance.
        const at = new Date();
        at.setHours(9, 0, 0, 0);
        if (at.getTime() <= now + 30_000) at.setTime(at.getTime() + 24 * 60 * 60 * 1000);
        if (at.getTime() <= horizon) {
          notifications.push({
            tag,
            at: at.getTime(),
            title: `Expiring soon: ${label}`,
            body: `Batch ${idx} expires in ${d} day(s) (${date}).`,
            data: { productId: p.id, batch: idx, expiry: date },
          });
        }
        // Also on the expiry day itself at 9:00 AM.
        const day = parseISO(date);
        day.setHours(9, 0, 0, 0);
        if (day.getTime() > now + 60_000 && day.getTime() <= horizon) {
          notifications.push({
            tag: `${tag}-day`,
            at: day.getTime(),
            title: `Expires today: ${label}`,
            body: `Batch ${idx} reaches its expiry date today.`,
            data: { productId: p.id, batch: idx, expiry: date },
          });
        }
      }
    });
  }

  reg.active.postMessage({ type: "SCHEDULE_NOTIFICATIONS", notifications });

  // Try to register periodic background sync (best effort; supported only on
  // some Chromium WebViews / installed PWAs).
  try {
    const periodicSync = (reg as any).periodicSync;
    if (periodicSync && periodicSync.register) {
      await periodicSync.register("expiry-check", {
        minInterval: 6 * 60 * 60 * 1000,
      });
    }
  } catch {
    /* not supported */
  }
}

