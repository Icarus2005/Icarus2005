export function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function fmtDateYear(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function daysSince(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));
}

// Every date this helper is asked about (Task.dueDate, Lead/Opportunity
// nextActionDate) is an internal ArqOne calendar-day target, not a precise
// timestamp — see src/lib/dubaiTime.ts for why "overdue" means the Asia/
// Dubai calendar day has fully passed, not "before the current instant".
import { isOverdueDubai } from "./dubaiTime";

export function isOverdue(d: Date | string | null | undefined): boolean {
  return isOverdueDubai(d);
}
