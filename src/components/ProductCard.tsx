import { useState } from "react";
import { Product } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { daysLeft, severityColor, severityFor, severityLabel } from "@/lib/expiry";
import { Save, Trash2 } from "lucide-react";

type Props = {
  product: Product;
  onSaved?: (p: Product) => void;
  onDeleted?: (id: string) => void;
};

export const ProductCard = ({ product, onSaved, onDeleted }: Props) => {
  const [draft, setDraft] = useState<Product>(product);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<Product>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase
      .from("products")
      .update({
        name: draft.name,
        category: draft.category,
        expiry_1: draft.expiry_1,
        expiry_2: draft.expiry_2,
        expiry_3: draft.expiry_3,
      })
      .eq("id", draft.id)
      .select()
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved?.(data as Product);
  };

  const remove = async () => {
    if (!confirm(`Delete ${draft.name || draft.barcode}?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", draft.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    onDeleted?.(draft.id);
  };

  const batches: { idx: 1 | 2 | 3; key: "expiry_1" | "expiry_2" | "expiry_3" }[] = [
    { idx: 1, key: "expiry_1" },
    { idx: 2, key: "expiry_2" },
    { idx: 3, key: "expiry_3" },
  ];

  return (
    <Card className="overflow-hidden border-border/60 bg-card shadow-soft">
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-muted-foreground">{draft.barcode}</p>
            <Input
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Product name"
              className="mt-1 h-auto border-0 bg-transparent p-0 font-display text-lg font-semibold focus-visible:ring-0"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Input
            value={draft.category ?? ""}
            onChange={(e) => update({ category: e.target.value })}
            placeholder="e.g. GROCERIES"
            className="mt-1"
          />
        </div>

        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Expiry batches</Label>
          {batches.map(({ idx, key }) => {
            const val = draft[key];
            const sev = severityFor(val);
            const d = daysLeft(val);
            return (
              <div key={key} className="flex items-center gap-2">
                <div className="w-8 text-center font-mono text-xs text-muted-foreground">B{idx}</div>
                <Input
                  type="date"
                  value={val ?? ""}
                  onChange={(e) => update({ [key]: e.target.value || null } as any)}
                  className="flex-1"
                />
                {val && (
                  <Badge className={`${severityColor[sev]} shrink-0 border-0`}>
                    {sev === "expired" ? `${Math.abs(d!)}d ago` : sev === "none" ? severityLabel[sev] : `${d}d`}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={save} disabled={saving} className="flex-1">
            <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" size="icon" onClick={remove}>
            <Trash2 className="h-4 w-4 text-critical" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
