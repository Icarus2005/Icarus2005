import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  GCC_COUNTRIES, SECTORS, COMPANY_SIZES, CONTACT_ROLES,
  DEAL_STAGES, DEAL_TYPES, STAGE_COLORS, ACTIVITY_TYPES,
} from "@/lib/constants";

async function getAccount(id: string) {
  return prisma.account.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { createdAt: "asc" } },
      opportunities: { orderBy: { updatedAt: "desc" } },
      activities: {
        include: { contact: true, opportunity: true },
        orderBy: { date: "desc" },
        take: 20,
      },
    },
  });
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default async function AccountDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const account = await getAccount(params.id);
  if (!account) notFound();

  const openDeals = account.opportunities.filter(
    (o) => !["CLOSED_WON", "CLOSED_LOST"].includes(o.stage)
  );
  const pipelineValue = openDeals.reduce((s, o) => s + (o.value ?? 0), 0);

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/accounts" className="text-sm text-gray-500 hover:text-gray-700">
          ← Accounts
        </Link>
      </div>

      {/* Account Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-sm text-gray-500">
              {GCC_COUNTRIES[account.country] ?? account.country}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-sm text-gray-500">
              {SECTORS[account.sector] ?? account.sector}
            </span>
            {account.industry && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-500">{account.industry}</span>
              </>
            )}
            {account.size && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-sm text-gray-500">{COMPANY_SIZES[account.size] ?? account.size}</span>
              </>
            )}
          </div>
          {account.locationsCount != null && (
            <p className="text-sm text-gray-500 mt-1">{account.locationsCount} locations</p>
          )}
          {account.description && (
            <p className="text-sm text-gray-600 mt-2 max-w-xl">{account.description}</p>
          )}
          {account.pastEngagements && (
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-medium text-gray-600">Past engagements:</span> {account.pastEngagements}
            </p>
          )}
          {account.website && (
            <a
              href={account.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-600 hover:underline mt-1 inline-block"
            >
              {account.website}
            </a>
          )}
        </div>
        <Link href={`/accounts/${account.id}/edit`} className="btn-secondary">
          Edit
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contacts</p>
          <p className="text-2xl font-bold text-brand-600 mt-1">{account.contacts.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Open Deals</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{openDeals.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pipeline Value</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{fmt(pipelineValue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contacts */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Contacts</h2>
            <Link
              href={`/contacts/new?accountId=${account.id}`}
              className="text-xs text-brand-600 hover:underline"
            >
              + Add
            </Link>
          </div>
          {account.contacts.length === 0 && (
            <p className="text-sm text-gray-400">No contacts yet.</p>
          )}
          <div className="space-y-3">
            {account.contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
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

        {/* Opportunities */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Opportunities</h2>
            <Link
              href={`/opportunities/new?accountId=${account.id}`}
              className="text-xs text-brand-600 hover:underline"
            >
              + Add
            </Link>
          </div>
          {account.opportunities.length === 0 && (
            <p className="text-sm text-gray-400">No opportunities yet.</p>
          )}
          <div className="space-y-3">
            {account.opportunities.map((opp) => (
              <div key={opp.id} className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/opportunities/${opp.id}`}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    {opp.name}
                  </Link>
                  <p className="text-xs text-gray-500">
                    {DEAL_TYPES[opp.type] ?? opp.type}
                    {opp.expectedCloseDate &&
                      ` · Close ${new Date(opp.expectedCloseDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`badge ${STAGE_COLORS[opp.stage]}`}>
                    {DEAL_STAGES[opp.stage] ?? opp.stage}
                  </span>
                  {opp.value && (
                    <p className="text-xs text-gray-500 mt-0.5">{fmt(opp.value)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Activity Feed</h2>
            <Link
              href={`/activities/new?accountId=${account.id}`}
              className="text-xs text-brand-600 hover:underline"
            >
              + Log Activity
            </Link>
          </div>
          {account.activities.length === 0 && (
            <p className="text-sm text-gray-400">No activities logged yet.</p>
          )}
          <div className="space-y-3">
            {account.activities.map((act) => (
              <div key={act.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {act.type[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{act.subject}</p>
                  {act.notes && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{act.notes}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{ACTIVITY_TYPES[act.type]}</span>
                    {act.contact && (
                      <span className="text-xs text-gray-400">
                        · {act.contact.firstName} {act.contact.lastName}
                      </span>
                    )}
                    {act.opportunity && (
                      <Link
                        href={`/opportunities/${act.opportunity.id}`}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        · {act.opportunity.name}
                      </Link>
                    )}
                  </div>
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
