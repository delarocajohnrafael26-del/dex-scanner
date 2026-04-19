import { differenceInCalendarDays, parseISO } from "date-fns";

export type Severity = "expired" | "critical" | "warning" | "safe" | "none";

export function daysLeft(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? parseISO(date) : date;
  return differenceInCalendarDays(d, new Date());
}

export function severityFor(date: string | null | undefined): Severity {
  const d = daysLeft(date);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= 15) return "critical";
  if (d <= 30) return "warning";
  return "safe";
}

export const severityColor: Record<Severity, string> = {
  expired: "bg-critical text-critical-foreground",
  critical: "bg-critical text-critical-foreground",
  warning: "bg-warning text-warning-foreground",
  safe: "bg-safe text-safe-foreground",
  none: "bg-muted text-muted-foreground",
};

export const severityLabel: Record<Severity, string> = {
  expired: "Expired",
  critical: "Critical",
  warning: "Warning",
  safe: "Safe",
  none: "—",
};

export function shouldAlert(date: string | null | undefined): "warning" | "expired" | null {
  const d = daysLeft(date);
  if (d === null) return null;
  if (d < 0) return "expired";
  if (d <= 30) return "warning";
  return null;
}
