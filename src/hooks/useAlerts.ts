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
      const { data } = await supabase
        .from("alerts")
        .select("id")
        .is("dismissed_at", null);
      if (active) setCount((data ?? []).length);
    };
    load();
    const channel = supabase
      .channel(idRef.current)
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
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
