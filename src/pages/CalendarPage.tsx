import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalIcon, List, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import { severityColor, severityFor, daysLeft, shouldAlert } from "@/lib/expiry";
import { syncAlerts } from "@/lib/syncAlerts";
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
import { toast } from "sonner";

type ExpiryItem = {
  product: Product;
  batch: 1 | 2 | 3;
  date: string;
};

function playAlertSound() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(660, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  } catch {}
}

export default function CalendarPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [view, setView] = useState<"month" | "agenda">("month");
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState<Date | null>(null);
  const [pending, setPending] = useState<ExpiryItem | null>(null);
  const playedRef = useRef(false);

  const loadProducts = async () => {
    const { data } = await supabase.from("products").select("*");
    setProducts((data ?? []) as Product[]);
  };

  useEffect(() => {
    (async () => {
      await syncAlerts();
      await loadProducts();
    })();
  }, []);

  const items: ExpiryItem[] = useMemo(() => {
    const r: ExpiryItem[] = [];
    for (const p of products) {
      ([1, 2, 3] as const).forEach((idx) => {
        const k = (`expiry_${idx}` as const) as "expiry_1" | "expiry_2" | "expiry_3";
        if (p[k]) r.push({ product: p, batch: idx, date: p[k] as string });
      });
    }
    return r.sort((a, b) => a.date.localeCompare(b.date));
  }, [products]);

  // Play alert sound once when entering page if there are warning/expired items
  useEffect(() => {
    if (playedRef.current || items.length === 0) return;
    if (items.some((it) => shouldAlert(it.date))) {
      playAlertSound();
      playedRef.current = true;
    }
  }, [items]);

  const byDate = useMemo(() => {
    const m = new Map<string, ExpiryItem[]>();
    for (const it of items) {
      const arr = m.get(it.date) ?? [];
      arr.push(it);
      m.set(it.date, arr);
    }
    return m;
  }, [items]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) out.push(d);
    return out;
  }, [cursor]);

  const selectedItems = selected
    ? byDate.get(format(selected, "yyyy-MM-dd")) ?? []
    : [];

  const confirmDismiss = async () => {
    if (!pending) return;
    const it = pending;
    setPending(null);
    const key = (`expiry_${it.batch}` as const) as "expiry_1" | "expiry_2" | "expiry_3";
    // Clear the expiry date on the product (dismisses from calendar + alerts)
    const patch: Record<string, null> = { [key]: null };
    const { error } = await supabase
      .from("products")
      .update(patch as any)
      .eq("id", it.product.id);
    if (error) return toast.error(error.message);
    // Also dismiss any matching alert row
    await supabase
      .from("alerts")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("product_id", it.product.id)
      .eq("batch_index", it.batch)
      .eq("expiry_date", it.date);
    toast.success("Alert dismissed");
    await loadProducts();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">{items.length} expiry dates tracked</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <Button
            size="sm"
            variant={view === "month" ? "default" : "ghost"}
            onClick={() => setView("month")}
            className="h-8 px-3"
          >
            <CalIcon className="mr-1 h-3.5 w-3.5" /> Month
          </Button>
          <Button
            size="sm"
            variant={view === "agenda" ? "default" : "ghost"}
            onClick={() => setView("agenda")}
            className="h-8 px-3"
          >
            <List className="mr-1 h-3.5 w-3.5" /> Agenda
          </Button>
        </div>
      </div>

      {view === "month" ? (
        <Card className="p-3">
          <div className="mb-3 flex items-center justify-between px-2">
            <Button size="icon" variant="ghost" onClick={() => setCursor(addMonths(cursor, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="font-display text-base font-semibold">{format(cursor, "MMMM yyyy")}</p>
            <Button size="icon" variant="ghost" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayItems = byDate.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              const isSelected = selected && isSameDay(day, selected);
              const isToday = isSameDay(day, new Date());
              const worst = dayItems.reduce<string>((acc, it) => {
                const s = severityFor(it.date);
                const order = ["expired", "critical", "warning", "safe", "none"];
                return order.indexOf(s) < order.indexOf(acc) ? s : acc;
              }, "none");
              return (
                <button
                  key={key}
                  onClick={() => setSelected(day)}
                  className={cn(
                    "relative aspect-square rounded-md text-xs transition-colors",
                    inMonth ? "text-foreground" : "text-muted-foreground/40",
                    isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                    isToday && !isSelected && "ring-1 ring-primary"
                  )}
                >
                  <span className="absolute left-1.5 top-1 font-medium">{format(day, "d")}</span>
                  {dayItems.length > 0 && (
                    <span
                      className={cn(
                        "absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full",
                        worst === "expired" || worst === "critical"
                          ? "bg-critical"
                          : worst === "warning"
                          ? "bg-warning"
                          : "bg-safe",
                        isSelected && "ring-1 ring-primary-foreground"
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <p className="px-1 font-display text-sm font-semibold">
                {format(selected, "EEEE, MMM d")}
              </p>
              {selectedItems.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">No expirations on this day.</p>
              ) : (
                selectedItems.map((it) => (
                  <ItemRow
                    key={`${it.product.id}-${it.batch}`}
                    item={it}
                    onDismiss={() => setPending(it)}
                  />
                ))
              )}
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(byDate.entries()).slice(0, 60).map(([date, list]) => (
            <div key={date}>
              <div className="mb-2 flex items-baseline gap-2 px-1">
                <p className="font-display text-sm font-semibold">
                  {format(parseISO(date), "EEE, MMM d yyyy")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const d = daysLeft(date)!;
                    return d < 0 ? `${Math.abs(d)} days ago` : d === 0 ? "Today" : `in ${d}d`;
                  })()}
                </p>
              </div>
              <div className="space-y-2">
                {list.map((it) => (
                  <ItemRow
                    key={`${it.product.id}-${it.batch}`}
                    item={it}
                    onDismiss={() => setPending(it)}
                  />
                ))}
              </div>
            </div>
          ))}
          {byDate.size === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">No expiry dates yet.</p>
          )}
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss this alert?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.product.name || pending?.product.barcode || "This batch"} ·
              batch {pending?.batch} · expires{" "}
              {pending && format(parseISO(pending.date), "MMM d, yyyy")}.
              This will remove the expiry date from the product.
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

const ItemRow = ({
  item,
  onDismiss,
}: {
  item: ExpiryItem;
  onDismiss: () => void;
}) => {
  const sev = severityFor(item.date);
  const d = daysLeft(item.date);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.product.name || item.product.barcode}</p>
        <p className="font-mono text-xs text-muted-foreground">
          B{item.batch} · {item.product.barcode}
        </p>
      </div>
      <Badge className={`${severityColor[sev]} border-0`}>
        {sev === "expired" ? `${Math.abs(d!)}d ago` : `${d}d`}
      </Badge>
      <Button
        size="icon"
        variant="ghost"
        onClick={onDismiss}
        className="h-8 w-8 shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
