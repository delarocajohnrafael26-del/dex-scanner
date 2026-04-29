import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert } from "@/lib/types";
import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Returns count of alerts that the user IS allowed to dismiss right now
 * (i.e., visible alerts). Used for the nav badge.
 */
export function useActiveAlertCount() {
  const [count, setCount] = useState(0);
  const idRef = useRef(`alerts-count-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let active = true;
    const load = async () => {
      // Pull active alerts joined with their product so we can verify the
      // underlying expiry date is still set. If the user dismissed it (which
      // nulls expiry_N), we must NOT count it — even if the alert row hasn't
      // been marked dismissed yet (e.g. race / older rows).
      const { data } = await supabase
        .from("alerts")
        .select("id, batch_index, expiry_date, product:products(expiry_1, expiry_2, expiry_3)")
        .is("dismissed_at", null);

      const valid = (data ?? []).filter((a: any) => {
        const p = a.product;
        if (!p) return false;
        const key = `expiry_${a.batch_index}` as "expiry_1" | "expiry_2" | "expiry_3";
        return p[key] === a.expiry_date;
      });

      // Auto-clean stale alert rows whose expiry was already removed.
      const stale = (data ?? []).filter((a: any) => !valid.includes(a));
      if (stale.length) {
        await supabase
          .from("alerts")
          .update({ dismissed_at: new Date().toISOString() })
          .in("id", stale.map((s: any) => s.id));
      }

      if (active) setCount(valid.length);
    };
    load();

    const channel = supabase
      .channel(idRef.current)
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, load)
      .subscribe();

    // Also refresh when window regains focus (covers cross-tab dismissals)
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return count;
}

export function canDismissAlert(a: Alert): boolean {
  const days = differenceInCalendarDays(new Date(), parseISO(a.first_shown_at));
  return days >= 5;
}

export function daysUntilDismissable(a: Alert): number {
  const days = differenceInCalendarDays(new Date(), parseISO(a.first_shown_at));
  return Math.max(0, 5 - days);
}
