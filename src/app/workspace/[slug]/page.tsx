export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPipelines } from "@/lib/catalog";
import {
  productBySlug,
  inheritedProduct,
  HEALTH_STATUSES,
  HEALTH_COLORS,
} from "@/lib/products";
import { taskProductWhere, activityProductWhere } from "@/lib/filters";
import { LEAD_STATUSES, LEAD_STATUS_COLORS, ACTIVITY_TYPES, stageColor } from "@/lib/constants";
import { fmtMoney, fmtDate, isOverdue } from "@/lib/format";
import ProductBadge from "@/components/ProductBadge";

export default async function ProductWorkspacePage({
  params,
}: {
  params: { slug: string };
}) {
  const meta = productBySlug(params.slug);
  if (!meta) notFound();
  const product = meta.key;
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [leads, opportunities, tasks, activities, pipelines] = await Promise.all([
    prisma.lead.findMany({
      where: { primaryProduct: product },
      select: { id: true, status: true, nextActionDate: true },
    }),
    prisma.opportunity.findMany({
      where: { product },
      include: {
        stageRef: true,
        owner: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
      },
    }),
    prisma.task.findMany({
      where: { AND: [{ status: "OPEN" }, taskProductWhere(product)] },
      include: {
        lead: { select: { id: true, name: true, primaryProduct: true } },
        opportunity: { select: { id: true, name: true, product: true } },
        account: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    prisma.activity.findMany({
      where: activityProductWhere(product),
      include: {
        account: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, primaryProduct: true } },
        opportunity: { select: { id: true, name: true, product: true } },
      },
      orderBy: { date: "desc" },
      take: 6,
    }),
    getPipelines(),
  ]);

  const pipeline = pipelines.find((p) => p.productKey === product && p.active);
  const open = opportunities.filter((o) => !o.closedAt);
  const pipelineValue = open.reduce((s, o) => s + (o.value ?? 0), 0);
  const weighted = open.reduce((s, o) => s + ((o.value ?? 0) * (o.probability ?? 0)) / 100, 0);
  const activeLeads = leads.filter((l) => l.status !== "DISQUALIFIED");
  const overdueActions =
    tasks.filter((t) => isOverdue(t.dueDate)).length +
    activeLeads.filter((l) => isOverdue(l.nextActionDate)).length;
  const atRisk = open.filter((o) => o.healthStatus !== "ON_TRACK");
  const closingThisMonth = open.filter(
    (o) => o.expectedCloseDate && new Date(o.expectedCloseDate) <= monthEnd && new Date(o.expectedCloseDate) >= now
  );

  const leadsByStatus = new Map<string, number>();
  for (const l of activeLeads) leadsByStatus.set(l.status, (leadsByStatus.get(l.status) ?? 0) + 1);

  const byOwner = new Map<string, { name: string; count: number; value: number }>();
  for (const o of open) {
    const key = o.owner?.id ?? "none";
    const e = byOwner.get(key) ?? { name: o.owner?.name ?? "Unassigned", count: 0, value: 0 };
    e.count++;
    e.value += o.value ?? 0;
    byOwner.set(key, e);
  }

  const q = `?product=${product}`;
  const tabs = [
    { label: "Overview", href: `/workspace/${meta.slug}`, active: true },
    { label: "Leads", href: `/leads${q}` },
    { label: "Pipeline", href: `/opportunities${q}` },
    { label: "Accounts", href: `/accounts${q}` },
    { label: "Tasks", href: `/tasks${q}` },
    { label: "Activities", href: `/activities${q}` },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} aria-hidden />
            <h1 className="text-2xl font-bold text-gray-900">{meta.label} Sales Workspace</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">{meta.description}</p>
        </div>
        <Link href={`/opportunities/new${q}`} className="btn-primary">New {meta.label} Deal</Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mt-5 mb-6" role="tablist" aria-label={`${meta.label} workspace sections`}>
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            role="tab"
            aria-selected={Boolean(t.active)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              t.active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: "Active Leads", value: String(activeLeads.length), href: `/leads${q}`, color: "text-brand-600" },
          { label: "Open Deals", value: String(open.length), href: `/opportunities${q}`, color: "text-gray-900" },
          { label: "Total Pipeline", value: fmtMoney(pipelineValue), href: `/opportunities${q}`, color: "text-purple-600" },
          { label: "Weighted", value: fmtMoney(weighted), href: `/opportunities${q}`, color: "text-indigo-600" },
          { label: "Overdue Actions", value: String(overdueActions), href: `/tasks${q}`, color: overdueActions ? "text-red-600" : "text-gray-400" },
          { label: "Deals at Risk", value: String(atRisk.length), href: `/opportunities${q}`, color: atRisk.length ? "text-amber-600" : "text-gray-400" },
        ].map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="card p-4 hover:shadow-md transition-shadow">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{kpi.label}</p>
            <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline by stage */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Pipeline by Stage{pipeline ? ` — ${pipeline.name}` : ""}
          </h2>
          {!pipeline || open.length === 0 ? (
            <p className="text-sm text-gray-400">
              No open {meta.label} deals yet.{" "}
              <Link href={`/opportunities/new${q}`} className="text-brand-600 hover:underline">Create the first one</Link>
            </p>
          ) : (
            <div className="space-y-3">
              {pipeline.stages
                .filter((s) => s.active && !s.isWon && !s.isLost)
                .map((s) => {
                  const subset = open.filter((o) => o.stageId === s.id);
                  const value = subset.reduce((x, o) => x + (o.value ?? 0), 0);
                  const pct = pipelineValue > 0 ? (value / pipelineValue) * 100 : 0;
                  return (
                    <div key={s.id}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`badge ${stageColor(s.key)}`}>{s.name}</span>
                          <span className="text-xs text-gray-400">{subset.length}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{fmtMoney(value)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${meta.dot}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Deals at risk */}
          <h2 className="text-sm font-semibold text-gray-700 mt-6 mb-3 pt-4 border-t border-gray-100">Deals at Risk</h2>
          {atRisk.length === 0 ? (
            <p className="text-sm text-gray-400">All open deals are on track.</p>
          ) : (
            <div className="space-y-2">
              {atRisk.map((o) => (
                <Link key={o.id} href={`/opportunities/${o.id}`} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded px-1 -mx-1">
                  <span className="min-w-0">
                    <span className="text-sm text-gray-700 block truncate">{o.name}</span>
                    <span className="text-xs text-gray-400">{o.account.name} · {o.stageRef?.name ?? o.stage}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className={`badge ${HEALTH_COLORS[o.healthStatus]}`}>{HEALTH_STATUSES[o.healthStatus]}</span>
                    {o.value != null && <span className="text-sm font-medium text-gray-600">{fmtMoney(o.value)}</span>}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Leads by Status</h2>
              <Link href={`/leads${q}`} className="text-xs text-brand-600 hover:underline">View all</Link>
            </div>
            <div className="space-y-2">
              {Object.entries(LEAD_STATUSES).map(([k, v]) => (
                <div key={k} className="flex justify-between items-center">
                  <span className={`badge ${LEAD_STATUS_COLORS[k]}`}>{v}</span>
                  <span className="text-sm font-semibold text-gray-900">{leadsByStatus.get(k) ?? 0}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Pipeline by Owner</h2>
            {byOwner.size === 0 && <p className="text-sm text-gray-400">No open deals.</p>}
            <div className="space-y-2">
              {Array.from(byOwner.values())
                .sort((a, b) => b.value - a.value)
                .map((o) => (
                  <div key={o.name} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{o.name}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {fmtMoney(o.value)} <span className="text-xs text-gray-400 font-normal">({o.count})</span>
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Closing This Month</h2>
            {closingThisMonth.length === 0 && <p className="text-sm text-gray-400">Nothing due to close.</p>}
            <div className="space-y-2">
              {closingThisMonth.map((o) => (
                <Link key={o.id} href={`/opportunities/${o.id}`} className="flex items-center justify-between py-1 hover:bg-gray-50 rounded px-1 -mx-1">
                  <span className="min-w-0">
                    <span className="text-sm text-gray-700 truncate block">{o.name}</span>
                    <span className="text-xs text-gray-400">{fmtDate(o.expectedCloseDate)}</span>
                  </span>
                  <span className="text-sm font-medium text-gray-700 shrink-0">{o.value != null ? fmtMoney(o.value) : "—"}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Product tasks */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">{meta.label} Tasks</h2>
            <Link href={`/tasks${q}`} className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          {tasks.length === 0 && <p className="text-sm text-gray-400">No open tasks.</p>}
          <div className="space-y-2">
            {tasks.map((t) => {
              const overdue = isOverdue(t.dueDate);
              return (
                <div key={t.id} className="flex justify-between items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 truncate">{t.title}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {t.lead?.name ?? t.opportunity?.name ?? t.account?.name ?? ""}
                      {t.owner ? ` · ${t.owner.name}` : ""}
                    </p>
                  </div>
                  {t.dueDate && (
                    <span className={`text-xs shrink-0 flex items-center gap-1 ${overdue ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                      {overdue && <AlertTriangle size={11} aria-hidden />}
                      {fmtDate(t.dueDate)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent product activity */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Recent {meta.label} Activity</h2>
            <Link href={`/activities${q}`} className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          {activities.length === 0 && <p className="text-sm text-gray-400">No activity yet.</p>}
          <div className="space-y-3">
            {activities.map((act) => (
              <div key={act.id} className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {act.type[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{act.subject}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <ProductBadge product={inheritedProduct(act)} />
                    <span className="text-xs text-gray-400">{ACTIVITY_TYPES[act.type] ?? act.type}</span>
                    {(act.account || act.lead) && (
                      <span className="text-xs text-gray-400">· {act.account?.name ?? act.lead?.name}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{fmtDate(act.date)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
