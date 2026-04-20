import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScanLine, Plus, Bell, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/lib/types";
import { toast } from "sonner";
import { syncAlerts } from "@/lib/syncAlerts";
import { useActiveAlertCount } from "@/hooks/useAlerts";
import { barcodeCandidates, normalizeBarcode } from "@/lib/barcode";

export default function Scan() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string>("");
  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [productCount, setProductCount] = useState(0);
  const alertCount = useActiveAlertCount();
  const nav = useNavigate();

  useEffect(() => {
    syncAlerts();
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => setProductCount(count ?? 0));
  }, []);

  const lookup = async (barcode: string) => {
    setOpen(false);
    const normalized = normalizeBarcode(barcode);
    setCode(normalized);
    setProduct(null);
    setNotFound(false);
    const candidates = barcodeCandidates(normalized);
    const { data } = await supabase
      .from("products")
      .select("*")
      .in("barcode", candidates)
      .limit(1)
      .maybeSingle();
    if (data) {
      setProduct(data as Product);
      toast.success("Product found");
    } else {
      setNotFound(true);
    }
  };

  const createProduct = async () => {
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setCreating(false);
      return toast.error("Please sign in");
    }
    const { data, error } = await supabase
      .from("products")
      .insert({
        barcode: code,
        name: newName || "Unnamed",
        category: newCategory || null,
        user_id: user.id,
      })
      .select()
      .single();
    setCreating(false);
    if (error) return toast.error(error.message);
    toast.success("Product added");
    setProduct(data as Product);
    setNotFound(false);
    setNewName("");
    setNewCategory("");
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="gradient-hero overflow-hidden border-0 text-primary-foreground shadow-glow">
        <div className="space-y-5 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest opacity-80">Expiry Tracker</p>
              <h1 className="mt-1 font-display text-2xl font-bold leading-tight">
                Scan. Track. <br />Never waste.
              </h1>
            </div>
            <button
              onClick={() => nav("/alerts")}
              className="relative rounded-full bg-white/15 p-2.5 backdrop-blur-sm hover:bg-white/25"
              aria-label="Alerts"
            >
              <Bell className="h-5 w-5" />
              {alertCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-critical px-1 text-[10px] font-bold text-critical-foreground">
                  {alertCount}
                </span>
              )}
            </button>
          </div>

          <Button
            size="lg"
            onClick={() => setOpen(true)}
            className="h-14 w-full bg-white text-primary hover:bg-white/90"
          >
            <ScanLine className="mr-2 h-5 w-5" />
            <span className="font-display text-base font-semibold">Scan Barcode</span>
          </Button>

          <div className="flex items-center gap-3 text-xs opacity-90">
            <Package className="h-4 w-4" />
            <span>{productCount} products in database</span>
          </div>
        </div>
      </Card>

      {/* Result area */}
      {product && (
        <div>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Scanned product
          </p>
          <ProductCard product={product} onSaved={(p) => setProduct(p)} />
        </div>
      )}

      {notFound && (
        <Card className="border-warning/40 bg-warning/5 p-5">
          <Badge className="bg-warning text-warning-foreground">Not found</Badge>
          <p className="mt-3 text-sm text-foreground">
            <span className="font-mono text-xs">{code}</span> isn't in your database yet.
          </p>
          <div className="mt-4 space-y-3">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Product name" />
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Category (e.g. GROCERIES)"
            />
            <Button onClick={createProduct} disabled={creating} className="w-full">
              <Plus className="mr-2 h-4 w-4" /> {creating ? "Adding…" : "Add product"}
            </Button>
          </div>
        </Card>
      )}

      {/* Manual lookup */}
      <Card className="p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Or type a barcode
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = (e.currentTarget.elements.namedItem("manual") as HTMLInputElement).value.trim();
            if (v) lookup(v);
          }}
          className="flex gap-2"
        >
          <Input name="manual" placeholder="e.g. 4800361339568" className="flex-1 font-mono" />
          <Button type="submit" variant="secondary">Find</Button>
        </form>
      </Card>

      {open && <BarcodeScanner onDetected={lookup} onClose={() => setOpen(false)} />}
    </div>
  );
}
