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
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-5">
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
