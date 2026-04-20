import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/lib/types";
import { shouldAlert } from "@/lib/expiry";

/**
 * Sync alerts table with current product expiry data for the current user.
 */
export async function syncAlerts() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: products, error: pErr } = await supabase.from("products").select("*");
  if (pErr || !products) return;

  const { data: existingAlerts } = await supabase.from("alerts").select("*");
  const existing = new Map<string, any>();
  (existingAlerts ?? []).forEach((a: any) => {
    existing.set(`${a.product_id}|${a.batch_index}|${a.expiry_date}`, a);
  });

  const inserts: any[] = [];
  const updates: { id: string; last_shown_at: string }[] = [];
  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);

  for (const p of products as Product[]) {
    const batches: [1 | 2 | 3, string | null][] = [
      [1, p.expiry_1],
      [2, p.expiry_2],
      [3, p.expiry_3],
    ];
    for (const [idx, date] of batches) {
      if (!date) continue;
      const sev = shouldAlert(date);
      if (!sev) continue;
      const key = `${p.id}|${idx}|${date}`;
      const found: any = existing.get(key);
      if (!found) {
        inserts.push({
          product_id: p.id,
          batch_index: idx,
          expiry_date: date,
          severity: sev,
          first_shown_at: now,
          last_shown_at: now,
          user_id: user.id,
        });
      } else if (!found.dismissed_at) {
        if ((found.last_shown_at ?? "").slice(0, 10) !== today) {
          updates.push({ id: found.id, last_shown_at: now });
        }
      }
    }
  }

  if (inserts.length) await supabase.from("alerts").insert(inserts);
  for (const u of updates) {
    await supabase.from("alerts").update({ last_shown_at: u.last_shown_at }).eq("id", u.id);
  }
}
