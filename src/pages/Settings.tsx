import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Download, Upload, Image as ImageIcon, Volume2, Trash2, Play, FileSpreadsheet, Users } from "lucide-react";
import {
  ALERT_SOUND_OPTIONS,
  AlertSoundId,
  getAlertSound,
  setAlertSound,
  getWallpaper,
  setWallpaper,
} from "@/lib/settings";
import { playAlertSound } from "@/lib/sounds";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSound(getAlertSound());
    setWp(getWallpaper());
  }, []);

  const onSoundChange = (v: AlertSoundId) => {
    setSound(v);
    setAlertSound(v);
    playAlertSound(v);
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

  const downloadBackup = async () => {
    setBusy(true);
    try {
      const [{ data: products }, { data: alerts }, { data: userRes }] = await Promise.all([
        supabase.from("products").select("*"),
        supabase.from("alerts").select("*"),
        supabase.auth.getUser(),
      ]);
      const backup = {
        format: "dex-scanner-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        user: userRes.user?.email ?? null,
        settings: {
          alertSound: getAlertSound(),
          wallpaper: getWallpaper(),
        },
        products: products ?? [],
        alerts: alerts ?? [],
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dex-scanner-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Backup saved · ${products?.length ?? 0} products`);
    } catch (e: any) {
      toast.error(e.message ?? "Backup failed");
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.format !== "dex-scanner-backup") throw new Error("Not a Dex Scanner backup file");
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");

      // Restore settings
      if (data.settings?.alertSound) {
        setAlertSound(data.settings.alertSound);
        setSound(data.settings.alertSound);
      }
      if (data.settings?.wallpaper) {
        setWallpaper(data.settings.wallpaper);
        setWp(data.settings.wallpaper);
      }

      // Restore products (rewrite user_id, drop ids)
      const products = (data.products ?? []).map((p: any) => ({
        user_id: uid,
        barcode: p.barcode,
        name: p.name ?? "",
        category: p.category ?? "",
        expiry_1: p.expiry_1 ?? null,
        expiry_2: p.expiry_2 ?? null,
        expiry_3: p.expiry_3 ?? null,
      }));
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

      {/* Backup & Restore */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <p className="font-display font-semibold">Backup & Restore</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Export all your products & settings to a file. Move it to another phone, then sign in
          and restore.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={downloadBackup} disabled={busy}>
            <Download className="mr-1 h-3.5 w-3.5" /> Download backup
          </Button>
          <input
            ref={restoreRef}
            type="file"
            accept="application/json,.json"
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
