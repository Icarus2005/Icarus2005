import Link from "next/link";
import { ACTIVITY_TYPES } from "@/lib/constants";
import { fmtDate, fmtDateYear } from "@/lib/format";
import type { RelationshipTimelineEntry } from "@/lib/relationshipMemory";
import ProductBadge from "@/components/ProductBadge";

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

const relationshipKindStyle: Record<RelationshipTimelineEntry["kind"], string> = {
  activity: "bg-brand-100 text-brand-700",
  meeting: "bg-violet-100 text-violet-700",
  proposal: "bg-amber-100 text-amber-700",
  email: "bg-sky-100 text-sky-700",
};

/**
 * Read-only, source-preserving relationship history. It combines records for
 * display without converting Meetings or Proposals into Activities.
 */
export function RelationshipTimeline({ entries }: { entries: RelationshipTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5">
        <p className="text-sm font-medium text-gray-700">No linked history is documented in the CRM.</p>
        <p className="mt-1 text-xs text-gray-500">This is a documentation gap, not confirmation that no commercial engagement occurred.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <article key={entry.key} className="flex items-start gap-3 border-b border-gray-100 py-3 last:border-0">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase ${relationshipKindStyle[entry.kind]}`}>
            {entry.kind[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${relationshipKindStyle[entry.kind]}`}>
                {entry.kind === "activity" ? (ACTIVITY_TYPES[entry.label] ?? entry.label) : entry.label}
              </span>
              {entry.product && entry.product !== "UNASSIGNED" && <ProductBadge product={entry.product} />}
            </div>
            {entry.href ? (
              <Link href={entry.href} className="mt-1.5 block text-sm font-semibold text-gray-900 hover:text-brand-700">{entry.title}</Link>
            ) : (
              <p className="mt-1.5 text-sm font-semibold text-gray-900">{entry.title}</p>
            )}
            {entry.detail && <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{entry.detail}</p>}
            <p className="mt-1 text-[11px] text-gray-400">{entry.provenance}</p>
          </div>
          <time className="shrink-0 text-xs text-gray-400" dateTime={new Date(entry.date).toISOString()}>
            {fmtDateYear(entry.date)}
          </time>
        </article>
      ))}
    </div>
  );
}
