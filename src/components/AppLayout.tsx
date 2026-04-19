import { Outlet } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { useActiveAlertCount } from "@/hooks/useAlerts";

export const AppLayout = () => {
  const count = useActiveAlertCount();
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-5">
        <Outlet />
      </div>
      <BottomNav alertCount={count} />
    </div>
  );
};
