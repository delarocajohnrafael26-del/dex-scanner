import { supabase } from "@/integrations/supabase/client";
import { cancelExpiryNotification } from "@/lib/notifications";

/**
 * Dismiss an alert AND clear the underlying expiry date on the product
 * so it disappears from Calendar, Alerts list, and the device notification queue.
 */
export async function dismissExpiry(opts: {
  productId: string;
  batch: 1 | 2 | 3;
  expiryDate: string;
  alertId?: string;
}) {
  const { productId, batch, expiryDate, alertId } = opts;
  const key = `expiry_${batch}` as "expiry_1" | "expiry_2" | "expiry_3";

  // Clear the expiry date that triggered the alert
  const patch: Record<string, null> = { [key]: null };
  const { error } = await supabase
    .from("products")
    .update(patch as any)
    .eq("id", productId);
  if (error) throw error;

  // Mark matching alert(s) dismissed
  const q = supabase
    .from("alerts")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("product_id", productId)
    .eq("batch_index", batch)
    .eq("expiry_date", expiryDate);
  if (alertId) {
    await supabase.from("alerts").update({ dismissed_at: new Date().toISOString() }).eq("id", alertId);
  }
  await q;

  // Cancel the scheduled device notification
  await cancelExpiryNotification(productId, batch);
}
