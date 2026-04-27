import { Link, useLocation } from "react-router-dom";
import { ScanLine, Package, Calendar, Bell, Upload, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", icon: ScanLine, label: "Scan" },
  { to: "/products", icon: Package, label: "Products" },
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/alerts", icon: Bell, label: "Alerts" },
  { to: "/import", icon: Upload, label: "Import" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export const BottomNav = ({ alertCount = 0 }: { alertCount?: number }) => {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-lg">
      <div className="mx-auto grid max-w-2xl grid-cols-6">
        {items.map(({ to, icon: Icon, label }) => {
          const active = pathname === to || (to !== "/" && pathname.startsWith(to));
          const showBadge = label === "Alerts" && alertCount > 0;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                {showBadge && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-critical px-1 text-[10px] font-bold text-critical-foreground">
                    {alertCount > 99 ? "99+" : alertCount}
                  </span>
                )}
              </div>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
