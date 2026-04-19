import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/ProductCard";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/lib/types";
import { Search, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { severityFor, Severity } from "@/lib/expiry";
import { cn } from "@/lib/utils";

const filters: { key: Severity | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "expired", label: "Expired" },
  { key: "critical", label: "Critical" },
  { key: "warning", label: "Warning" },
  { key: "safe", label: "Safe" },
];

export default function Products() {
  const [items, setItems] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Severity | "all">("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").order("updated_at", { ascending: false });
    setItems((data ?? []) as Product[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase();
    return items.filter((p) => {
      if (search) {
        const hay = `${p.barcode} ${p.name} ${p.category ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      if (filter !== "all") {
        const worst = [p.expiry_1, p.expiry_2, p.expiry_3].map(severityFor);
        const order = ["expired", "critical", "warning", "safe", "none"];
        const min = worst.reduce((acc, s) => (order.indexOf(s) < order.indexOf(acc) ? s : acc), "none" as Severity);
        if (min !== filter) return false;
      }
      return true;
    });
  }, [items, q, filter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Products</h1>
        <p className="text-sm text-muted-foreground">{items.length} total · {filtered.length} shown</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, barcode, category…"
          className="pl-9"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
            className={cn("shrink-0")}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Filter className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No products match.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onSaved={(np) => setItems((arr) => arr.map((x) => (x.id === np.id ? np : x)))}
              onDeleted={(id) => setItems((arr) => arr.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
