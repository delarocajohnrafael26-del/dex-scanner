import { useEffect, useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { useActiveAlertCount } from "@/hooks/useAlerts";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { getWallpaper } from "@/lib/settings";
import { syncAlerts } from "@/lib/syncAlerts";
import { ensureNotificationPermission, scheduleExpiryNotifications } from "@/lib/notifications";

export const AppLayout = () => {
  const { user, loading } = useAuth();
  const count = useActiveAlertCount();
  const [wallpaper, setWallpaper] = useState<string | null>(null);

  useEffect(() => {
    setWallpaper(getWallpaper());
    const onChange = () => setWallpaper(getWallpaper());
    window.addEventListener("wallpaper-changed", onChange);
    return () => window.removeEventListener("wallpaper-changed", onChange);
  }, []);

  // Keep alerts + device notifications in sync. Re-runs on focus/visibility
  // so newly elapsed expirations are picked up when the user reopens the app.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const run = async () => {
      try {
        await syncAlerts();
        if (!cancelled) await scheduleExpiryNotifications();
      } catch (e) {
        console.warn("alert sync failed", e);
      }
    };
    ensureNotificationPermission().finally(run);

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", run);
    // Periodic refresh while app is open (every 5 min)
    const interval = window.setInterval(run, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", run);
      window.clearInterval(interval);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
  };

  const wallpaperStyle = wallpaper
    ? {
        backgroundImage: `linear-gradient(hsl(var(--background) / 0.85), hsl(var(--background) / 0.92)), url(${wallpaper})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed" as const,
      }
    : undefined;

  return (
    <div className="min-h-screen bg-background" style={wallpaperStyle}>
      <div className="mx-auto max-w-2xl px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{user.email}</span>
          <Button size="sm" variant="ghost" onClick={signOut} className="h-7 px-2">
            <LogOut className="mr-1 h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
        <Outlet />
      </div>
      <BottomNav alertCount={count} />
    </div>
  );
};
