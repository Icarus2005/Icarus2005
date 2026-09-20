import Link from "next/link";
import { ACTIVITY_TYPES } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

// Reusable relationship-history timeline — shared by the Contact, Account,
// Lead, and Opportunity detail pages (previously each duplicated its own
// near-identical rendering). Read-only: it never creates, edits, or infers
// Activities — it only displays what's already there, newest first (the
// caller's query is expected to `orderBy: { date: "desc" }`).
export type TimelineActivity = {
  id: string;
  type: string;
  subject: string;
  notes: string | null;
  date: string | Date;
  contact?: { id: string; firstName: string; lastName: string } | null;
  account?: { id: string; name: string } | null;
  opportunity?: { id: string; name: string } | null;
};

export default function Timeline({ activities }: { activities: TimelineActivity[] }) {
  if (activities.length === 0) {
    return <p className="text-sm text-gray-400">No interactions recorded yet.</p>;
  }
  return (
    <div className="space-y-3">
      {activities.map((act) => (
        <div key={act.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
          <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
            {act.type[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">{act.subject}</p>
            {act.notes && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{act.notes}</p>}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-gray-400">{ACTIVITY_TYPES[act.type] ?? act.type}</span>
              {act.contact && (
                <span className="text-xs text-gray-400">· {act.contact.firstName} {act.contact.lastName}</span>
              )}
              {act.account && (
                <Link href={`/accounts/${act.account.id}`} className="text-xs text-gray-400 hover:text-brand-600">
                  · {act.account.name}
                </Link>
              )}
              {act.opportunity && (
                <Link href={`/opportunities/${act.opportunity.id}`} className="text-xs text-brand-600 hover:underline">
                  · {act.opportunity.name}
                </Link>
              )}
            </div>
          </div>
          <span className="text-xs text-gray-400 shrink-0">{fmtDate(act.date)}</span>
        </div>
      ))}
    </div>
  );
}
