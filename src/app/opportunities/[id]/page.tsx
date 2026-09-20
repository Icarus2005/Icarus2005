import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  CONTACT_ROLES, USE_CASES, marketLabels, stageColor,
} from "@/lib/constants";
import { HEALTH_STATUSES, HEALTH_COLORS } from "@/lib/products";
import { fmtDate, isOverdue, daysSince } from "@/lib/format";
import { deriveNextInteraction } from "@/lib/nextInteraction";
import ProductBadge from "@/components/ProductBadge";
import Timeline from "@/components/Timeline";

async function getOpportunity(id: string) {
  return prisma.opportunity.findUnique({
    where: { id },
    include: {
      account: true,
      stageRef: true,
      pipeline: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      contacts: { include: { contact: true } },
      activities: {
        include: { contact: true },
        orderBy: { date: "desc" },
      },
      tasks: { orderBy: { dueDate: "asc" } },
    },
  });
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const opp = await getOpportunity(params.id);
  if (!opp) notFound();
  const primaryStakeholder = opp.contacts.find((c) => c.isPrimary)?.contact ?? null;

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/opportunities" className="text-sm text-gray-500 hover:text-gray-700">
          ← Pipeline
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{opp.name}</h1>
            <ProductBadge product={opp.product} size="md" />
            <span className={`badge ${HEALTH_COLORS[opp.healthStatus] ?? "bg-gray-100 text-gray-600"}`}>
              {HEALTH_STATUSES[opp.healthStatus] ?? opp.healthStatus}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <Link href={`/accounts/${opp.account.id}`} className="text-sm text-brand-600 hover:underline">
              {opp.account.name}
            </Link>
            <span className={`badge ${stageColor(opp.stage)}`}>
              {opp.stageRef?.name ?? opp.stage}
            </span>
            <span className="text-sm text-gray-400">
              {opp.pipeline?.name ?? ""} · {daysSince(opp.stageChangedAt)}d in stage
            </span>
            <span className="text-sm text-gray-400">· {marketLabels(opp.markets)}</span>
            {opp.owner && <span className="text-sm text-gray-400">· Owned by {opp.owner.name}</span>}
          </div>
          {opp.useCase && (
            <p className="text-sm text-gray-500 mt-2">{USE_CASES[opp.useCase] ?? opp.useCase}</p>
          )}
          {(() => {
            const next = deriveNextInteraction(
              opp.tasks.filter((t) => t.status === "OPEN"),
              opp.nextAction,
              opp.nextActionDate
            );
            if (!next) return null;
            const overdue = next.date && isOverdue(next.date) && !opp.closedAt;
            return (
              <p className={`text-sm mt-2 ${overdue ? "text-red-600 font-medium" : "text-gray-600"}`}>
                Next: {next.label}
                {next.date ? ` — due ${fmtDate(next.date)}` : ""}
                {next.source === "task" ? " (open task)" : ""}
              </p>
            );
          })()}
          {opp.notes && (
            <p className="text-sm text-gray-600 mt-2 max-w-xl">{opp.notes}</p>
          )}
        </div>
        <Link href={`/opportunities/${opp.id}/edit`} className="btn-secondary">Edit</Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Deal Value</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {opp.value ? fmt(opp.value) : "—"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Probability</p>
          <p className="text-2xl font-bold text-brand-600 mt-1">
            {opp.probability != null ? `${opp.probability}%` : "—"}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Expected Close</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">
            {opp.expectedCloseDate
              ? new Date(opp.expectedCloseDate).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contacts */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Key Contacts</h2>
          {opp.contacts.length === 0 && (
            <p className="text-sm text-gray-400">No contacts linked.</p>
          )}
          <div className="space-y-3">
            {opp.contacts.map(({ contact: c }) => (
              <div key={c.id} className="flex items-center justify-between">
                <div>
                  <Link href={`/contacts/${c.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                    {c.firstName} {c.lastName}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {c.title}
                    {c.role && ` · ${CONTACT_ROLES[c.role] ?? c.role}`}
                  </p>
                </div>
                {c.email && (
                  <a href={`mailto:${c.email}`} className="text-xs text-gray-400 hover:text-brand-600">
                    {c.email}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Activity</h2>
            <Link
              href={`/activities/new?opportunityId=${opp.id}&accountId=${opp.accountId}${primaryStakeholder ? `&contactId=${primaryStakeholder.id}` : ""}`}
              className="text-xs text-brand-600 hover:underline"
            >
              + Log Activity
            </Link>
          </div>
          <Timeline activities={opp.activities} />
        </div>
      </div>
    </div>
  );
}
