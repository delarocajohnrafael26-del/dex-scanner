import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, Product } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Lock, X, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { canDismissAlert, daysUntilDismissable } from "@/hooks/useAlerts";
import { syncAlerts } from "@/lib/syncAlerts";
import { toast } from "sonner";
import { daysLeft, severityColor } from "@/lib/expiry";

type Joined = Alert & { product: Product | null };

export default function Alerts() {
  const [alerts, setAlerts] = useState<Joined[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("alerts")
      .select("*, product:products(*)")
      .is("dismissed_at", null)
      .order("expiry_date", { ascending: true });
    setAlerts((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      await syncAlerts();
      await load();
    })();
  }, []);

  const dismiss = async (a: Joined) => {
    if (!canDismissAlert(a)) {
      toast.error(`Locked for ${daysUntilDismissable(a)} more day(s)`);
      return;
    }
    const { error } = await supabase
      .from("alerts")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Alert cleared");
    setAlerts((arr) => arr.filter((x) => x.id !== a.id));
  };

  const refresh = async () => {
    setSyncing(true);
    await syncAlerts();
    await load();
    setSyncing(false);
    toast.success("Alerts synced");
  };

  const expired = alerts.filter((a) => a.severity === "expired");
  const warning = alerts.filter((a) => a.severity === "warning");

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Alerts</h1>
          <p className="text-sm text-muted-foreground">
            {alerts.length} active · locked 5 days from first appearance
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={syncing}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing && "animate-spin"}`} /> Sync
        </Button>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : alerts.length === 0 ? (
        <Card className="border-safe/40 bg-safe/5 p-10 text-center">
          <Bell className="mx-auto mb-3 h-10 w-10 text-safe" />
          <p className="font-display text-lg font-semibold">All clear</p>
          <p className="mt-1 text-sm text-muted-foreground">No active expiry alerts.</p>
        </Card>
      ) : (
        <div className="space-y-5">
          {expired.length > 0 && <Section title="Expired" items={expired} onDismiss={dismiss} />}
          {warning.length > 0 && (
            <Section title="Near expiration (≤30 days)" items={warning} onDismiss={dismiss} />
          )}
        </div>
      )}

      <Card className="border-border/60 bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">
          🔒 Alerts are locked for <strong>5 days</strong> from first appearance and cannot be dismissed
          during that period. Once unlocked, they re-pop daily until you clear them.
        </p>
      </Card>
    </div>
  );
}

const Section = ({
  title,
  items,
  onDismiss,
}: {
  title: string;
  items: Joined[];
  onDismiss: (a: Joined) => void;
}) => (
  <div>
    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {title} · {items.length}
    </p>
    <div className="space-y-2">
      {items.map((a) => {
        const can = canDismissAlert(a);
        const left = daysUntilDismissable(a);
        const d = daysLeft(a.expiry_date);
        return (
          <Card key={a.id} className="overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <div
                className={`h-12 w-1.5 shrink-0 rounded-full ${
                  a.severity === "expired" ? "bg-critical" : "bg-warning"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {a.product?.name || a.product?.barcode || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Batch {a.batch_index} · expires {format(parseISO(a.expiry_date), "MMM d, yyyy")}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge
                    className={`${severityColor[a.severity === "expired" ? "expired" : "warning"]} border-0 text-[10px]`}
                  >
                    {a.severity === "expired" ? `${Math.abs(d!)}d ago` : `in ${d}d`}
                  </Badge>
                  {!can && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Lock className="h-3 w-3" /> {left}d to unlock
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDismiss(a)}
                disabled={!can}
                className="shrink-0"
                aria-label="Dismiss"
              >
                {can ? <X className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  </div>
);
