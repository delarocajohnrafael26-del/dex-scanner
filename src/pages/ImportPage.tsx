import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Product } from "@/lib/types";

type Row = {
  barcode: string;
  name: string;
  category: string | null;
  expiry_1: string | null;
  expiry_2: string | null;
  expiry_3: string | null;
};

function toISODate(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const dt = new Date(Date.UTC(d.y, (d.m ?? 1) - 1, d.d ?? 1));
    return dt.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const dt = new Date(v);
    if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  return null;
}

function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    for (const actual of Object.keys(obj)) {
      if (actual.toLowerCase().trim() === k.toLowerCase()) return obj[actual];
    }
  }
  return null;
}

export default function ImportPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Row[]>([]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number } | null>(null);

  const handleFile = async (file: File) => {
    setResult(null);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(ws, { defval: null });
    const rows: Row[] = json
      .map((r) => {
        const barcode = String(pick(r, ["barcode", "Barcode"]) ?? "").trim();
        if (!barcode) return null;
        return {
          barcode,
          name: String(pick(r, ["product name", "name", "Product Name"]) ?? "").trim(),
          category: (pick(r, ["category", "Category"]) ?? null) as string | null,
          expiry_1: toISODate(pick(r, ["expiry date", "expiry_1", "Expiry Date"])),
          expiry_2: toISODate(pick(r, ["expiry date 2", "expiry_2"])),
          expiry_3: toISODate(pick(r, ["expiry date 3", "expiry_3"])),
        } as Row;
      })
      .filter(Boolean) as Row[];
    setPreview(rows);
    toast.success(`${rows.length} rows ready to import`);
  };

  const runImport = async () => {
    if (!preview.length) return;
    setImporting(true);
    // Upsert in chunks
    const chunks: Row[][] = [];
    for (let i = 0; i < preview.length; i += 200) chunks.push(preview.slice(i, i + 200));
    let inserted = 0;
    let updated = 0;
    for (const chunk of chunks) {
      // Find which exist
      const { data: existing } = await supabase
        .from("products")
        .select("barcode")
        .in("barcode", chunk.map((r) => r.barcode));
      const existingSet = new Set((existing ?? []).map((e: any) => e.barcode));
      const { error } = await supabase
        .from("products")
        .upsert(chunk, { onConflict: "barcode" });
      if (error) {
        toast.error(error.message);
        setImporting(false);
        return;
      }
      for (const r of chunk) {
        if (existingSet.has(r.barcode)) updated++;
        else inserted++;
      }
    }
    setImporting(false);
    setResult({ inserted, updated });
    setPreview([]);
    toast.success(`Imported: ${inserted} new, ${updated} updated`);
  };

  const exportXlsx = async () => {
    setExporting(true);
    const { data } = await supabase.from("products").select("*").order("name");
    const rows = (data ?? []).map((p: Product) => ({
      Barcode: p.barcode,
      "Product Name": p.name,
      Category: p.category ?? "",
      "Expiry Date": p.expiry_1 ?? "",
      "expiry date 2": p.expiry_2 ?? "",
      "expiry date 3": p.expiry_3 ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expiry Tracker");
    XLSX.writeFile(wb, `expiry-tracker-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExporting(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Import / Export</h1>
        <p className="text-sm text-muted-foreground">Sync your Excel database in both directions.</p>
      </div>

      <Card className="border-2 border-dashed border-primary/30 bg-accent/30 p-6 text-center">
        <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-primary" />
        <h2 className="font-display text-lg font-semibold">Import from Excel</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Columns: Barcode, Product Name, Category, Expiry Date, expiry date 2, expiry date 3
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Button onClick={() => inputRef.current?.click()} className="mt-4">
          <Upload className="mr-2 h-4 w-4" /> Choose .xlsx file
        </Button>
      </Card>

      {preview.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display font-semibold">Preview · {preview.length} rows</p>
            <Button onClick={runImport} disabled={importing}>
              {importing ? "Importing…" : "Confirm import"}
            </Button>
          </div>
          <div className="max-h-72 overflow-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Barcode</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Category</th>
                  <th className="p-2 text-left">B1</th>
                  <th className="p-2 text-left">B2</th>
                  <th className="p-2 text-left">B3</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2 font-mono">{r.barcode}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">{r.category}</td>
                    <td className="p-2">{r.expiry_1}</td>
                    <td className="p-2">{r.expiry_2}</td>
                    <td className="p-2">{r.expiry_3}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 50 && (
              <p className="p-2 text-center text-xs text-muted-foreground">
                +{preview.length - 50} more rows…
              </p>
            )}
          </div>
        </Card>
      )}

      {result && (
        <Card className="border-safe/40 bg-safe/5 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-safe" />
            <p className="font-medium">Import complete</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.inserted} new · {result.updated} updated
          </p>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <Download className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="font-display font-semibold">Export database</p>
            <p className="text-xs text-muted-foreground">Download current data as .xlsx</p>
          </div>
          <Button variant="outline" onClick={exportXlsx} disabled={exporting}>
            {exporting ? "…" : "Export"}
          </Button>
        </div>
      </Card>

      <Card className="border-warning/40 bg-warning/5 p-4">
        <div className="flex gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 text-warning" />
          <p className="text-xs text-muted-foreground">
            Import upserts by <span className="font-mono">Barcode</span> — existing products are updated, new ones added. Empty cells leave the existing field unchanged on the next save, but are written as empty on import.
          </p>
        </div>
      </Card>
    </div>
  );
}
