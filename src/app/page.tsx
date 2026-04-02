import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEAL_STAGES, STAGE_COLORS, ACTIVITY_TYPES, GCC_COUNTRIES } from "@/lib/constants";

async function getDashboardData() {
  const [
    totalAccounts,
    totalContacts,
    openOpportunities,
    recentActivities,
    pipelineByStage,
    dealsByCountry,
  ] = await Promise.all([
    prisma.account.count(),
    prisma.contact.count(),
    prisma.opportunity.findMany({
      where: { stage: { notIn: ["CLOSED_WON", "CLOSED_LOST"] } },
      select: { value: true, stage: true },
    }),
    prisma.activity.findMany({
      take: 8,
      orderBy: { date: "desc" },
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, name: true } },
      },
    }),
    prisma.opportunity.groupBy({
      by: ["stage"],
      _count: { id: true },
      _sum: { value: true },
    }),
    prisma.account.groupBy({
      by: ["country"],
      _count: { id: true },
    }),
  ]);

  const pipelineValue = openOpportunities.reduce((s, o) => s + (o.value ?? 0), 0);

  return {
    totalAccounts,
    totalContacts,
    openDeals: openOpportunities.length,
    pipelineValue,
    recentActivities,
    pipelineByStage,
    dealsByCountry,
  };
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const STAGE_ORDER = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION"];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">GCC Sales Overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Accounts", value: data.totalAccounts, href: "/accounts", color: "text-brand-600" },
          { label: "Contacts", value: data.totalContacts, href: "/contacts", color: "text-purple-600" },
          { label: "Open Deals", value: data.openDeals, href: "/opportunities", color: "text-orange-600" },
          { label: "Pipeline Value", value: fmt(data.pipelineValue), href: "/opportunities", color: "text-green-600" },
        ].map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="card p-5 hover:shadow-md transition-shadow">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{kpi.label}</p>
            <p className={`text-3xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline by Stage */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Pipeline by Stage</h2>
          <div className="space-y-3">
            {STAGE_ORDER.map((stage) => {
              const row = data.pipelineByStage.find((r) => r.stage === stage);
              const count = row?._count?.id ?? 0;
              const val = row?._sum?.value ?? 0;
              const pct = data.pipelineValue > 0 ? (val / data.pipelineValue) * 100 : 0;
              return (
                <div key={stage}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${STAGE_COLORS[stage]}`}>{DEAL_STAGES[stage]}</span>
                      <span className="text-xs text-gray-400">{count} deal{count !== 1 ? "s" : ""}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">{fmt(val)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Accounts by Country */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Accounts by Country</h2>
          <div className="space-y-2">
            {data.dealsByCountry
              .sort((a, b) => b._count.id - a._count.id)
              .map((row) => (
                <div key={row.country} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">
                    {GCC_COUNTRIES[row.country] ?? row.country}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-full">
                    {row._count.id}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="card p-6 lg:col-span-3">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
            <Link href="/activities" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-3">
            {data.recentActivities.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No activities yet</p>
            )}
            {data.recentActivities.map((act) => (
              <div key={act.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {act.type[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{act.subject}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {act.account && (
                      <Link href={`/accounts/${act.account.id}`} className="text-xs text-brand-600 hover:underline truncate">
                        {act.account.name}
                      </Link>
                    )}
                    {act.contact && (
                      <span className="text-xs text-gray-400">
                        · {act.contact.firstName} {act.contact.lastName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-gray-400">
                    {ACTIVITY_TYPES[act.type]}
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(act.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
