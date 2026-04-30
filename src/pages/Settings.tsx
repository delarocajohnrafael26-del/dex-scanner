import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Download, Upload, Image as ImageIcon, Volume2, Trash2, Play, FileSpreadsheet, Users, Music } from "lucide-react";
import {
  ALERT_SOUND_OPTIONS,
  AlertSoundId,
  getAlertSound,
  setAlertSound,
  getWallpaper,
  setWallpaper,
  getCustomSound,
  setCustomSound,
  getAlertVolume,
  setAlertVolume,
} from "@/lib/settings";
import { playAlertSound } from "@/lib/sounds";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SettingsPage() {
  const [sound, setSound] = useState<AlertSoundId>("chime");
  const [wallpaper, setWp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [customName, setCustomName] = useState<string | null>(null);
  const [volume, setVol] = useState(0.8);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const xlsxMergeRef = useRef<HTMLInputElement>(null);
  const customSoundRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSound(getAlertSound());
    setWp(getWallpaper());
    setTeamName(localStorage.getItem("dex.teamName") ?? "");
    setCustomName(getCustomSound().name);
    setVol(getAlertVolume());
  }, []);

  const onSoundChange = (v: AlertSoundId) => {
    setSound(v);
    setAlertSound(v);
    if (v === "custom" && !getCustomSound().dataUrl) {
      toast.message("Upload a sound file below to use as your custom alert");
      return;
    }
    playAlertSound(v);
  };

  const onVolumeChange = (vals: number[]) => {
    const v = vals[0] ?? 0.8;
    setVol(v);
    setAlertVolume(v);
  };

  const onCustomSoundPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      toast.error("Please pick an audio file (mp3, wav, m4a, ogg…)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Sound file too large (max 2MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setCustomSound(url, file.name);
      setCustomName(file.name);
      setSound("custom");
      setAlertSound("custom");
      toast.success(`Custom sound set: ${file.name}`);
      playAlertSound("custom");
    };
    reader.readAsDataURL(file);
  };

  const clearCustomSound = () => {
    setCustomSound(null, null);
    setCustomName(null);
    if (sound === "custom") {
      setSound("chime");
      setAlertSound("chime");
    }
    toast.success("Custom sound cleared");
  };

  const onWallpaperPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image too large (max 4MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setWallpaper(url);
      setWp(url);
      toast.success("Wallpaper updated");
    };
    reader.readAsDataURL(file);
  };

  const clearWallpaper = () => {
    setWallpaper(null);
    setWp(null);
    toast.success("Wallpaper cleared");
  };

  const saveWorkbook = (wb: XLSX.WorkBook, filename: string, bookType: "xlsx" | "xls") => {
    const data = XLSX.write(wb, { bookType, type: "array", compression: false });
    const mime = bookType === "xls"
      ? "application/vnd.ms-excel"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const readWorkbookFile = async (file: File, options: XLSX.ParsingOptions = {}) => {
    if (file.name.toLowerCase().endsWith(".csv")) {
      return XLSX.read(await file.text(), { ...options, type: "string" });
    }

    const buf = await file.arrayBuffer();
    try {
      return XLSX.read(new Uint8Array(buf), { ...options, type: "array" });
    } catch (err: any) {
      const message = String(err?.message ?? "");
      try {
        const text = await file.text();
        const trimmed = text.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.includes(",")) {
          return XLSX.read(text, { ...options, type: "string" });
        }
      } catch {
        // Ignore text fallback failures and show the clearer Excel error below.
      }
      if (/bad compressed size|corrupt|zip/i.test(message)) {
        throw new Error("This Excel backup is damaged. Download a new backup with the updated app, then restore that file.");
      }
      throw err;
    }
  };

  const downloadBackup = async () => {
    setBusy(true);
    try {
      const [{ data: products }, { data: alerts }, { data: userRes }] = await Promise.all([
        supabase.from("products").select("*"),
        supabase.from("alerts").select("*"),
        supabase.auth.getUser(),
      ]);

      const wb = XLSX.utils.book_new();

      // Meta sheet (used to identify file on restore)
      const metaRows = [
        { key: "format", value: "dex-scanner-backup" },
        { key: "version", value: 1 },
        { key: "exportedAt", value: new Date().toISOString() },
        { key: "user", value: userRes.user?.email ?? "" },
        { key: "alertSound", value: getAlertSound() },
      ];
      const wsMeta = XLSX.utils.json_to_sheet(metaRows, { header: ["key", "value"] });
      wsMeta["!cols"] = [{ wch: 16 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, wsMeta, "Meta");

      // Products sheet
      const productRows = (products ?? []).map((p: any) => ({
        barcode: p.barcode,
        name: p.name ?? "",
        category: p.category ?? "",
        expiry_1: p.expiry_1 ?? "",
        expiry_2: p.expiry_2 ?? "",
        expiry_3: p.expiry_3 ?? "",
      }));
      const wsProducts = XLSX.utils.json_to_sheet(productRows, {
        header: ["barcode", "name", "category", "expiry_1", "expiry_2", "expiry_3"],
      });
      wsProducts["!cols"] = [
        { wch: 16 }, { wch: 32 }, { wch: 14 },
        { wch: 12 }, { wch: 12 }, { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, wsProducts, "Products");

      // Alerts sheet
      const alertRows = (alerts ?? []).map((a: any) => ({ ...a }));
      if (alertRows.length > 0) {
        const wsAlerts = XLSX.utils.json_to_sheet(alertRows);
        XLSX.utils.book_append_sheet(wb, wsAlerts, "Alerts");
      }

      const date = new Date().toISOString().slice(0, 10);
      saveWorkbook(wb, `dex-scanner-backup-${date}.xls`, "xls");
      toast.success(`Backup saved · ${productRows.length} products`);
    } catch (e: any) {
      toast.error(e.message ?? "Backup failed");
    } finally {
      setBusy(false);
    }
  };

  const normalizeDate = (v: any): string | null => {
    if (v === null || v === undefined || v === "") return null;
    // Excel date serial number
    if (typeof v === "number" && isFinite(v)) {
      const d = XLSX.SSF.parse_date_code(v);
      if (d) {
        const mm = String(d.m).padStart(2, "0");
        const dd = String(d.d).padStart(2, "0");
        return `${d.y}-${mm}-${dd}`;
      }
    }
    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    if (!s) return null;
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return null;
  };

  const restoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");

      const lower = file.name.toLowerCase();
      let rawProducts: any[] = [];
      let restoredAlertSound: string | null = null;

      if (lower.endsWith(".json")) {
        // Legacy JSON backup
        const text = await file.text();
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
          rawProducts = json;
        } else if (json && typeof json === "object") {
          rawProducts = json.products ?? json.data?.products ?? [];
          restoredAlertSound = json.alertSound ?? json.settings?.alertSound ?? null;
        }
      } else {
        // Excel: .xlsx / .xls / .csv all handled by XLSX.read
        const wb = await readWorkbookFile(file, { cellDates: true });

        // Optional Meta sheet
        const metaSheet = wb.Sheets["Meta"];
        if (metaSheet) {
          const metaRows: any[] = XLSX.utils.sheet_to_json(metaSheet, { defval: "" });
          const meta: Record<string, any> = {};
          for (const r of metaRows) meta[String(r.key)] = r.value;
          if (meta.alertSound) restoredAlertSound = String(meta.alertSound);
        }

        // Use Products sheet, or fall back to first non-meta sheet
        const productsSheet =
          wb.Sheets["Products"] ||
          wb.Sheets[wb.SheetNames.find((n) => n !== "Meta" && n !== "Alerts") ?? wb.SheetNames[0]];
        if (!productsSheet) throw new Error("No products found in this file");
        rawProducts = XLSX.utils.sheet_to_json(productsSheet, { defval: "", raw: true });
      }

      if (restoredAlertSound) {
        setAlertSound(restoredAlertSound as AlertSoundId);
        setSound(restoredAlertSound as AlertSoundId);
      }

      const products = rawProducts
        .map((p: any) => ({
          ...p,
          barcode: String(p.barcode ?? p.Barcode ?? "").trim(),
        }))
        .filter((p) => p.barcode !== "")
        .map((p: any) => ({
          user_id: uid,
          barcode: p.barcode,
          name: String(p.name ?? p.Name ?? ""),
          category: String(p.category ?? p.Category ?? ""),
          expiry_1: normalizeDate(p.expiry_1 ?? p.Expiry_1 ?? p["Expiry 1"]),
          expiry_2: normalizeDate(p.expiry_2 ?? p.Expiry_2 ?? p["Expiry 2"]),
          expiry_3: normalizeDate(p.expiry_3 ?? p.Expiry_3 ?? p["Expiry 3"]),
        }));

      if (products.length === 0) throw new Error("No valid products with barcodes found in file");
      let imported = 0;
      // Upsert in chunks of 500
      for (let i = 0; i < products.length; i += 500) {
        const chunk = products.slice(i, i + 500);
        const { error } = await supabase
          .from("products")
          .upsert(chunk, { onConflict: "user_id,barcode" });
        if (error) throw error;
        imported += chunk.length;
      }
      toast.success(`Restored ${imported} products`);
    } catch (err: any) {
      toast.error(err.message ?? "Restore failed");
    } finally {
      setBusy(false);
      if (restoreRef.current) restoreRef.current.value = "";
    }
  };

  const saveTeamName = (v: string) => {
    setTeamName(v);
    localStorage.setItem("dex.teamName", v);
  };

  const exportTeamXlsx = async () => {
    setBusy(true);
    try {
      const { data: products, error } = await supabase.from("products").select("*");
      if (error) throw error;
      const member = (teamName || "").trim() || "unknown";
      const rows = (products ?? []).map((p: any) => ({
        barcode: p.barcode,
        name: p.name ?? "",
        category: p.category ?? "",
        expiry_1: p.expiry_1 ?? "",
        expiry_2: p.expiry_2 ?? "",
        expiry_3: p.expiry_3 ?? "",
        scanned_by: member,
        updated_at: p.updated_at ?? new Date().toISOString(),
      }));
      const ws = XLSX.utils.json_to_sheet(rows, {
        header: ["barcode", "name", "category", "expiry_1", "expiry_2", "expiry_3", "scanned_by", "updated_at"],
      });
      ws["!cols"] = [
        { wch: 16 }, { wch: 32 }, { wch: 14 },
        { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 22 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products");
      const date = new Date().toISOString().slice(0, 10);
      const safe = member.replace(/[^a-z0-9_-]+/gi, "_");
      saveWorkbook(wb, `dex-team-${safe}-${date}.xls`, "xls");
      toast.success(`Exported ${rows.length} products`);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const mergeTeamXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");

      const merged = new Map<string, any>();
      const memberCounts: Record<string, number> = {};

      for (const f of files) {
        const wb = await readWorkbookFile(f);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        for (const r of rows) {
          const barcode = String(r.barcode ?? r.Barcode ?? "").trim();
          if (!barcode) continue;
          const member = String(r.scanned_by ?? r.member ?? "unknown").trim() || "unknown";
          memberCounts[member] = (memberCounts[member] ?? 0) + 1;
          const updated = String(r.updated_at ?? "");
          const existing = merged.get(barcode);
          if (!existing || (updated && updated > (existing.updated_at ?? ""))) {
            merged.set(barcode, {
              user_id: uid,
              barcode,
              name: String(r.name ?? existing?.name ?? ""),
              category: String(r.category ?? existing?.category ?? ""),
              expiry_1: r.expiry_1 || existing?.expiry_1 || null,
              expiry_2: r.expiry_2 || existing?.expiry_2 || null,
              expiry_3: r.expiry_3 || existing?.expiry_3 || null,
              updated_at: updated || existing?.updated_at || "",
            });
          }
        }
      }

      const records = Array.from(merged.values()).map(({ updated_at, ...rest }) => rest);
      let imported = 0;
      for (let i = 0; i < records.length; i += 500) {
        const chunk = records.slice(i, i + 500);
        const { error } = await supabase
          .from("products")
          .upsert(chunk, { onConflict: "user_id,barcode" });
        if (error) throw error;
        imported += chunk.length;
      }
      const summary = Object.entries(memberCounts)
        .map(([m, n]) => `${m}: ${n}`)
        .join(" · ");
      toast.success(`Merged ${imported} products from ${files.length} file(s) — ${summary}`);
    } catch (err: any) {
      toast.error(err.message ?? "Merge failed");
    } finally {
      setBusy(false);
      if (xlsxMergeRef.current) xlsxMergeRef.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Personalize sounds, wallpaper & backups</p>
      </div>

      {/* Alert sound */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-primary" />
          <p className="font-display font-semibold">Alert sound</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Played when expired or near-expiry items are detected.
        </p>
        <div className="flex gap-2">
          <Select value={sound} onValueChange={(v) => onSoundChange(v as AlertSoundId)}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALERT_SOUND_OPTIONS.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => playAlertSound(sound)} disabled={sound === "off"}>
            <Play className="mr-1 h-3.5 w-3.5" /> Test
          </Button>
        </div>

        {/* Volume */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Volume</Label>
            <span className="text-xs text-muted-foreground">{Math.round(volume * 100)}%</span>
          </div>
          <Slider
            value={[volume]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={onVolumeChange}
          />
        </div>

        {/* Custom sound upload */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <Music className="h-3.5 w-3.5 text-primary" />
            <Label className="text-xs">Custom sound file</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Upload your own .mp3, .wav, .m4a or .ogg (max 2MB). Selected automatically when added.
          </p>
          {customName ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
              <span className="truncate text-xs">{customName}</span>
              <Button size="sm" variant="ghost" onClick={clearCustomSound}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground">No custom sound uploaded</p>
          )}
          <input
            ref={customSoundRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={onCustomSoundPick}
          />
          <Button
            variant="outline"
            className="w-full"
            onClick={() => customSoundRef.current?.click()}
          >
            <Upload className="mr-1 h-3.5 w-3.5" />
            {customName ? "Replace custom sound" : "Upload custom sound"}
          </Button>
        </div>
      </Card>

      {/* Wallpaper */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <p className="font-display font-semibold">Wallpaper background</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Pick an image from your device. Stored locally on this phone.
        </p>
        {wallpaper ? (
          <div
            className="h-28 w-full rounded-lg border border-border bg-cover bg-center"
            style={{ backgroundImage: `url(${wallpaper})` }}
          />
        ) : (
          <div className="flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            No wallpaper set
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onWallpaperPick}
          />
          <Button className="flex-1" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Choose image
          </Button>
          {wallpaper && (
            <Button variant="outline" onClick={clearWallpaper}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Team Excel — export & merge */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <p className="font-display font-semibold">Team Excel (.xlsx)</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Export your work as an Excel file each teammate can share. Then merge multiple teammates'
          files into one combined list (newest entry per barcode wins).
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="teamName" className="text-xs">Your name / team member</Label>
          <Input
            id="teamName"
            placeholder="e.g. Alex"
            value={teamName}
            onChange={(e) => saveTeamName(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={exportTeamXlsx} disabled={busy}>
            <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Download my work (.xlsx)
          </Button>
          <input
            ref={xlsxMergeRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple
            className="hidden"
            onChange={mergeTeamXlsx}
          />
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => xlsxMergeRef.current?.click()}
            disabled={busy}
          >
            <Upload className="mr-1 h-3.5 w-3.5" /> Merge teammates' files
          </Button>
        </div>
      </Card>

      {/* Backup & Restore */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <p className="font-display font-semibold">Backup & Restore</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Export all your products & settings to an Excel file (.xlsx). Move it to another phone,
          then sign in and restore.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={downloadBackup} disabled={busy}>
            <Download className="mr-1 h-3.5 w-3.5" /> Download backup (.xlsx)
          </Button>
          <input
            ref={restoreRef}
            type="file"
            accept=".xlsx,.xls,.csv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json,text/csv"
            className="hidden"
            onChange={restoreBackup}
          />
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => restoreRef.current?.click()}
            disabled={busy}
          >
            <Upload className="mr-1 h-3.5 w-3.5" /> Restore from file
          </Button>
        </div>
      </Card>
    </div>
  );
}
