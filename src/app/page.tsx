export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  DEAL_STAGES, STAGE_COLORS, ACTIVITY_TYPES, COUNTRIES,
  LEAD_STATUSES, LEAD_STATUS_COLORS, OPEN_STAGES,
} from "@/lib/constants";

async function getDashboardData() {
  const [
    leads,
    openOpportunities,
    closedOpportunities,
    recentActivities,
    pipelineByStage,
    openTasks,
  ] = await Promise.all([
    prisma.lead.findMany({ select: { status: true, region: true, createdAt: true } }),
    prisma.opportunity.findMany({
      where: { stage: { in: OPEN_STAGES } },
      select: { value: true, stage: true },
    }),
    prisma.opportunity.findMany({
      where: { stage: { in: ["CLOSED_WON", "CLOSED_LOST"] } },
      select: {
        stage: true,
        value: true,
        createdAt: true,
        closedAt: true,
        account: { select: { industry: true } },
      },
    }),
    prisma.activity.findMany({
      take: 6,
      orderBy: { date: "desc" },
      include: {
        lead: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.opportunity.groupBy({
      by: ["stage"],
      _count: { id: true },
      _sum: { value: true },
    }),
    prisma.task.findMany({
      where: { status: "OPEN" },
      orderBy: { dueDate: "asc" },
      take: 6,
      include: {
        lead: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
      },
    }),
  ]);

  return { leads, openOpportunities, closedOpportunities, recentActivities, pipelineByStage, openTasks };
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const pipelineValue = data.openOpportunities.reduce((s, o) => s + (o.value ?? 0), 0);
  const activeLeads = data.leads.filter((l) => l.status !== "DISQUALIFIED").length;

  const won = data.closedOpportunities.filter((o) => o.stage === "CLOSED_WON");
  const wonValue = won.reduce((s, o) => s + (o.value ?? 0), 0);

  // Avg time-to-close for won deals (days)
  const closedWithDates = won.filter((o) => o.closedAt);
  const avgDaysToClose = closedWithDates.length
    ? Math.round(
        closedWithDates.reduce(
          (s, o) => s + (new Date(o.closedAt!).getTime() - new Date(o.createdAt).getTime()) / 86_400_000,
          0
        ) / closedWithDates.length
      )
    : null;

  // Win/loss by vertical (account industry)
  const verticals = new Map<string, { won: number; lost: number }>();
  for (const o of data.closedOpportunities) {
    const key = o.account?.industry || "Other";
    const entry = verticals.get(key) ?? { won: 0, lost: 0 };
    if (o.stage === "CLOSED_WON") entry.won++;
    else entry.lost++;
    verticals.set(key, entry);
  }

  // Leads by region
  const leadsByRegion = new Map<string, number>();
  for (const l of data.leads) {
    if (l.status === "DISQUALIFIED") continue;
    leadsByRegion.set(l.region, (leadsByRegion.get(l.region) ?? 0) + 1);
  }

  // Leads by status
  const leadsByStatus = new Map<string, number>();
  for (const l of data.leads) {
    leadsByStatus.set(l.status, (leadsByStatus.get(l.status) ?? 0) + 1);
  }

  const now = new Date();

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">ArqOne Sales Overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active Leads", value: activeLeads, href: "/leads", color: "text-brand-600" },
          { label: "Open Deals", value: data.openOpportunities.length, href: "/opportunities", color: "text-orange-600" },
          { label: "Pipeline Value", value: fmt(pipelineValue), href: "/opportunities", color: "text-purple-600" },
          { label: "Won (Total)", value: fmt(wonValue), href: "/opportunities?view=list", color: "text-green-600" },
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
            {OPEN_STAGES.map((stage) => {
              const row = data.pipelineByStage.find((r) => r.stage === stage);
              const count = row?._count?.id ?? 0;
              const val = row?._sum?.value ?? 0;
              const pct = pipelineValue > 0 ? (val / pipelineValue) * 100 : 0;
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
                    <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {avgDaysToClose != null && (
            <p className="text-xs text-gray-500 mt-4 pt-3 border-t border-gray-50">
              Avg. time-to-close (won deals): <span className="font-semibold text-gray-700">{avgDaysToClose} days</span>
            </p>
          )}
        </div>

        {/* Leads panel */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Leads</h2>
            <Link href="/leads" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-2 mb-5">
            {Object.entries(LEAD_STATUSES).map(([k, v]) => (
              <div key={k} className="flex justify-between items-center">
                <span className={`badge ${LEAD_STATUS_COLORS[k]}`}>{v}</span>
                <span className="text-sm font-semibold text-gray-900">{leadsByStatus.get(k) ?? 0}</span>
              </div>
            ))}
          </div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Region</h3>
          <div className="space-y-1.5">
            {Array.from(leadsByRegion.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([region, count]) => (
                <div key={region} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{COUNTRIES[region] ?? region}</span>
                  <span className="text-sm font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-full">{count}</span>
                </div>
              ))}
            {leadsByRegion.size === 0 && <p className="text-sm text-gray-400">No leads yet</p>}
          </div>
        </div>

        {/* Win / Loss by vertical */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Win / Loss by Vertical</h2>
          {verticals.size === 0 && <p className="text-sm text-gray-400">No closed deals yet</p>}
          <div className="space-y-2">
            {Array.from(verticals.entries()).map(([vertical, { won: w, lost }]) => (
              <div key={vertical} className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{vertical}</span>
                <div className="flex gap-2">
                  <span className="badge bg-green-100 text-green-700">{w} won</span>
                  <span className="badge bg-red-100 text-red-700">{lost} lost</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming tasks */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Upcoming Tasks</h2>
            <Link href="/tasks" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          {data.openTasks.length === 0 && <p className="text-sm text-gray-400">Nothing due. Nice.</p>}
          <div className="space-y-2">
            {data.openTasks.map((t) => {
              const overdue = t.dueDate && new Date(t.dueDate) < now;
              return (
                <div key={t.id} className="flex justify-between items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 truncate">{t.title}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {t.lead?.name ?? t.opportunity?.name ?? t.account?.name ?? ""}
                    </p>
                  </div>
                  {t.dueDate && (
                    <span className={`text-xs shrink-0 ${overdue ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                      {new Date(t.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
            <Link href="/activities" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          {data.recentActivities.length === 0 && <p className="text-sm text-gray-400">No activities yet</p>}
          <div className="space-y-3">
            {data.recentActivities.map((act) => (
              <div key={act.id} className="flex items-start gap-3 py-1 border-b border-gray-50 last:border-0">
                <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {act.type[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{act.subject}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {ACTIVITY_TYPES[act.type]}
                    {act.account ? ` · ${act.account.name}` : act.lead ? ` · ${act.lead.name}` : ""}
                  </p>
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
