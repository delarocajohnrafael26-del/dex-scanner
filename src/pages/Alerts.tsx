import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, Product } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, X, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { syncAlerts } from "@/lib/syncAlerts";
import { toast } from "sonner";
import { daysLeft, severityColor } from "@/lib/expiry";
import { playAlertSound } from "@/lib/sounds";
import { dismissExpiry } from "@/lib/dismissExpiry";
import { scheduleExpiryNotifications } from "@/lib/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Joined = Alert & { product: Product | null };

export default function Alerts() {
  const [alerts, setAlerts] = useState<Joined[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState<Joined | null>(null);
  const prevCountRef = useRef<number | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("alerts")
      .select("*, product:products(*)")
      .is("dismissed_at", null)
      .order("expiry_date", { ascending: true });
    const next = (data ?? []) as any as Joined[];
    // Play sound if new alerts appeared since last load
    if (prevCountRef.current !== null && next.length > prevCountRef.current) {
      playAlertSound();
    }
    prevCountRef.current = next.length;
    setAlerts(next);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      await syncAlerts();
      await load();
      // Initial sound if there are any active alerts on entry
      if ((prevCountRef.current ?? 0) > 0) playAlertSound();
    })();
  }, []);

  const confirmDismiss = async () => {
    if (!pending) return;
    const a = pending;
    setPending(null);
    try {
      await dismissExpiry({
        productId: a.product_id,
        batch: a.batch_index,
        expiryDate: a.expiry_date,
        alertId: a.id,
      });
    } catch (e: any) {
      return toast.error(e.message ?? "Failed to dismiss");
    }
    toast.success("Alert cleared & expiry date removed");
    setAlerts((arr) => arr.filter((x) => x.id !== a.id));
    prevCountRef.current = Math.max(0, (prevCountRef.current ?? 1) - 1);
    // Refresh device notifications to reflect the cleared expiry
    scheduleExpiryNotifications().catch(() => {});
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
            {alerts.length} active · dismiss anytime
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
          {expired.length > 0 && (
            <Section title="Expired" items={expired} onDismiss={setPending} />
          )}
          {warning.length > 0 && (
            <Section title="Near expiration (≤30 days)" items={warning} onDismiss={setPending} />
          )}
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss this alert?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.product?.name || pending?.product?.barcode || "This alert"} ·
              batch {pending?.batch_index} · expires{" "}
              {pending && format(parseISO(pending.expiry_date), "MMM d, yyyy")}.
              It will stop appearing in your alerts list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDismiss}>Yes, dismiss</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDismiss(a)}
                className="shrink-0"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  </div>
);
