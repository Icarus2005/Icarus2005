import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  COUNTRIES, LEAD_STATUSES, LEAD_STATUS_COLORS, PRODUCTS,
  DIGITAL_MATURITY, LEAD_SOURCES, ACTIVITY_TYPES,
} from "@/lib/constants";
import ConvertLeadButton from "./ConvertLeadButton";

async function getLead(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: {
      activities: { orderBy: { date: "desc" }, take: 20 },
      tasks: { orderBy: { dueDate: "asc" } },
    },
  });
}

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const lead = await getLead(params.id);
  if (!lead) notFound();

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/leads" className="text-sm text-gray-500 hover:text-gray-700">← Leads</Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{lead.name}</h1>
            <span className={`badge ${LEAD_STATUS_COLORS[lead.status] ?? "bg-gray-100 text-gray-700"}`}>
              {LEAD_STATUSES[lead.status] ?? lead.status}
            </span>
            {lead.score != null && (
              <span className={`badge ${lead.score >= 70 ? "bg-green-100 text-green-700" : lead.score >= 40 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                Score {lead.score}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap text-sm text-gray-500">
            {lead.title && <span>{lead.title}</span>}
            {lead.company && (
              <>
                <span className="text-gray-300">·</span>
                <span className="font-medium text-gray-600">{lead.company}</span>
              </>
            )}
            <span className="text-gray-300">·</span>
            <span>{COUNTRIES[lead.region] ?? lead.region}</span>
            {lead.sector && (
              <>
                <span className="text-gray-300">·</span>
                <span>{lead.sector}</span>
              </>
            )}
          </div>
          <div className="flex gap-4 mt-2">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="text-sm text-gray-500 hover:text-brand-600">{lead.email}</a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="text-sm text-gray-500 hover:text-brand-600">{lead.phone}</a>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/leads/${lead.id}/edit`} className="btn-secondary">Edit</Link>
          <ConvertLeadButton
            leadId={lead.id}
            convertedOpportunityId={lead.convertedOpportunityId}
            disqualified={lead.status === "DISQUALIFIED"}
          />
        </div>
      </div>

      {/* Attributes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Product Interest</p>
          <p className="text-lg font-bold text-brand-600 mt-1">
            {lead.productInterest ? (PRODUCTS[lead.productInterest] ?? lead.productInterest) : "—"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Digital Maturity</p>
          <p className="text-lg font-bold text-purple-600 mt-1">
            {lead.digitalMaturity ? (DIGITAL_MATURITY[lead.digitalMaturity] ?? lead.digitalMaturity) : "—"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</p>
          <p className="text-lg font-bold text-orange-600 mt-1">
            {lead.source ? (LEAD_SOURCES[lead.source] ?? lead.source) : "—"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</p>
          <p className="text-sm text-gray-700 mt-2">{lead.tags ?? "—"}</p>
        </div>
      </div>

      {lead.notes && (
        <div className="card p-5 mb-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{lead.notes}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Tasks</h2>
            <Link href={`/tasks/new?leadId=${lead.id}`} className="text-xs text-brand-600 hover:underline">+ Add Task</Link>
          </div>
          {lead.tasks.length === 0 && <p className="text-sm text-gray-400">No tasks.</p>}
          <div className="space-y-2">
            {lead.tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className={`text-sm ${t.status === "DONE" ? "text-gray-400 line-through" : "text-gray-700"}`}>
                  {t.title}
                </span>
                {t.dueDate && (
                  <span className={`text-xs ${t.status !== "DONE" && new Date(t.dueDate) < new Date() ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                    {new Date(t.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Activity</h2>
            <Link href={`/activities/new?leadId=${lead.id}`} className="text-xs text-brand-600 hover:underline">+ Log</Link>
          </div>
          {lead.activities.length === 0 && <p className="text-sm text-gray-400">No activities logged.</p>}
          <div className="space-y-3">
            {lead.activities.map((act) => (
              <div key={act.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {act.type[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{act.subject}</p>
                  {act.notes && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{act.notes}</p>}
                  <span className="text-xs text-gray-400">{ACTIVITY_TYPES[act.type]}</span>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(act.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
