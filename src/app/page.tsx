export const dynamic = "force-dynamic";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPipelines } from "@/lib/catalog";
import {
  LEAD_STATUSES,
  LEAD_STATUS_COLORS,
  ACTIVITY_TYPES,
  stageColor,
} from "@/lib/constants";
import {
  PRODUCTS_META,
  BUSINESS_LINES,
  parseProductParam,
  inheritedProduct,
  HEALTH_STATUSES,
  HEALTH_COLORS,
} from "@/lib/products";
import { leadProductWhere, oppProductWhere, taskProductWhere, activityProductWhere } from "@/lib/filters";
import { fmtMoney, fmtDate } from "@/lib/format";
import ProductSelector from "@/components/ProductSelector";
import ProductBadge from "@/components/ProductBadge";

async function getDashboardData(product: string) {
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const [leads, opportunities, overdueTasks, recentActivities] = await Promise.all([
    prisma.lead.findMany({
      where: leadProductWhere(product),
      select: { status: true, markets: true, primaryProduct: true },
    }),
    prisma.opportunity.findMany({
      where: oppProductWhere(product),
      include: {
        stageRef: true,
        owner: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        AND: [
          { status: "OPEN", dueDate: { lt: now } },
          taskProductWhere(product),
        ],
      },
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
      take: 6,
      orderBy: { date: "desc" },
      include: {
        lead: { select: { id: true, name: true, primaryProduct: true } },
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, name: true, product: true } },
      },
    }),
  ]);
  return { leads, opportunities, overdueTasks, recentActivities, monthEnd, now };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { product?: string };
}) {
  const product = parseProductParam(searchParams.product);
  const [{ leads, opportunities, overdueTasks, recentActivities, monthEnd, now }, pipelines] =
    await Promise.all([getDashboardData(product ?? ""), getPipelines()]);

  const open = opportunities.filter((o) => !o.closedAt);
  const pipelineValue = open.reduce((s, o) => s + (o.value ?? 0), 0);
  const weightedValue = open.reduce((s, o) => s + ((o.value ?? 0) * (o.probability ?? 0)) / 100, 0);
  const commitValue = open
    .filter((o) => o.forecastCategory === "COMMIT")
    .reduce((s, o) => s + (o.value ?? 0), 0);
  const activeLeads = leads.filter((l) => l.status !== "DISQUALIFIED").length;
  const atRisk = open.filter((o) => o.healthStatus !== "ON_TRACK");
  const closingThisMonth = open.filter(
    (o) => o.expectedCloseDate && new Date(o.expectedCloseDate) <= monthEnd && new Date(o.expectedCloseDate) >= now
  );

  // Pipeline by product (All Products view)
  const byProduct = new Map<string, { count: number; value: number; weighted: number }>();
  for (const o of open) {
    const entry = byProduct.get(o.product) ?? { count: 0, value: 0, weighted: 0 };
    entry.count++;
    entry.value += o.value ?? 0;
    entry.weighted += ((o.value ?? 0) * (o.probability ?? 0)) / 100;
    byProduct.set(o.product, entry);
  }

  // Pipeline by stage (product view uses its own pipeline's ordered stages)
  const productPipeline = product ? pipelines.find((p) => p.productKey === product && p.active) : null;
  const stageRows = productPipeline
    ? productPipeline.stages
        .filter((s) => s.active && !s.isWon && !s.isLost)
        .map((s) => {
          const subset = open.filter((o) => o.stageId === s.id);
          return {
            key: s.key,
            name: s.name,
            count: subset.length,
            value: subset.reduce((x, o) => x + (o.value ?? 0), 0),
          };
        })
    : (() => {
        const m = new Map<string, { name: string; count: number; value: number }>();
        for (const o of open) {
          const name = o.stageRef?.name ?? o.stage;
          const e = m.get(o.stage) ?? { name, count: 0, value: 0 };
          e.count++;
          e.value += o.value ?? 0;
          m.set(o.stage, e);
        }
        return Array.from(m.entries()).map(([key, e]) => ({ key, ...e }));
      })();

  // Pipeline by owner
  const byOwner = new Map<string, { name: string; count: number; value: number }>();
  for (const o of open) {
    const key = o.owner?.id ?? "none";
    const e = byOwner.get(key) ?? { name: o.owner?.name ?? "Unassigned", count: 0, value: 0 };
    e.count++;
    e.value += o.value ?? 0;
    byOwner.set(key, e);
  }

  // Leads by status
  const leadsByStatus = new Map<string, number>();
  for (const l of leads) leadsByStatus.set(l.status, (leadsByStatus.get(l.status) ?? 0) + 1);

  const qs = product ? `?product=${product}` : "";

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {product ? `${PRODUCTS_META[product].label} Dashboard` : "Dashboard"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {product ? PRODUCTS_META[product].description : "ArqOne sales across all business lines"}
          </p>
        </div>
      </div>

      <div className="mb-6">
        <ProductSelector />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: "Active Leads", value: String(activeLeads), href: `/leads${qs}`, color: "text-brand-600" },
          { label: "Open Pipeline", value: fmtMoney(pipelineValue), href: `/opportunities${qs}`, color: "text-purple-600" },
          { label: "Weighted", value: fmtMoney(weightedValue), href: `/opportunities${qs}`, color: "text-indigo-600" },
          { label: "Commit", value: fmtMoney(commitValue), href: `/opportunities${qs}`, color: "text-green-600" },
          { label: "Overdue Tasks", value: String(overdueTasks.length), href: `/tasks${qs}`, color: overdueTasks.length ? "text-red-600" : "text-gray-400" },
          { label: "Deals at Risk", value: String(atRisk.length), href: `/opportunities${qs}`, color: atRisk.length ? "text-amber-600" : "text-gray-400" },
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
            Pipeline by Stage{productPipeline ? ` — ${productPipeline.name}` : ""}
          </h2>
          {stageRows.length === 0 && <p className="text-sm text-gray-400">No open deals.</p>}
          <div className="space-y-3">
            {stageRows.map((row) => {
              const pct = pipelineValue > 0 ? (row.value / pipelineValue) * 100 : 0;
              return (
                <div key={row.key}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${stageColor(row.key)}`}>{row.name}</span>
                      <span className="text-xs text-gray-400">{row.count} deal{row.count !== 1 ? "s" : ""}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-700">{fmtMoney(row.value)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* All-products: pipeline by product. Product view: at-risk intelligence */}
          {!product ? (
            <>
              <h2 className="text-sm font-semibold text-gray-700 mt-6 mb-3 pt-4 border-t border-gray-100">
                Pipeline by Product
              </h2>
              <div className="space-y-2.5">
                {BUSINESS_LINES.filter((k) => byProduct.has(k) || true).map((k) => {
                  const meta = PRODUCTS_META[k];
                  const e = byProduct.get(k) ?? { count: 0, value: 0, weighted: 0 };
                  const pct = pipelineValue > 0 ? (e.value / pipelineValue) * 100 : 0;
                  return (
                    <div key={k}>
                      <div className="flex justify-between items-center mb-1">
                        <Link href={`/?product=${k}`} className="flex items-center gap-2 hover:underline">
                          <span className={`w-2 h-2 rounded-full ${meta.dot}`} aria-hidden />
                          <span className="text-sm text-gray-700 font-medium">{meta.label}</span>
                          <span className="text-xs text-gray-400">{e.count} deal{e.count !== 1 ? "s" : ""}</span>
                        </Link>
                        <span className="text-sm font-semibold text-gray-700">
                          {fmtMoney(e.value)} <span className="text-xs text-gray-400 font-normal">({fmtMoney(e.weighted)} wtd)</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${meta.dot}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {byProduct.has("UNASSIGNED") && (
                  <Link href="/?product=UNASSIGNED" className="flex items-center gap-2 text-xs text-amber-600 pt-1 hover:underline">
                    <AlertTriangle size={12} aria-hidden />
                    {byProduct.get("UNASSIGNED")!.count} unassigned deal(s) excluded from product lines
                  </Link>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-gray-700 mt-6 mb-3 pt-4 border-t border-gray-100">
                Deal Health — {PRODUCTS_META[product].label}
              </h2>
              {atRisk.length === 0 ? (
                <p className="text-sm text-gray-400">All open deals are on track.</p>
              ) : (
                <div className="space-y-2">
                  {atRisk.map((o) => (
                    <Link key={o.id} href={`/opportunities/${o.id}`} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded px-1 -mx-1">
                      <span className="text-sm text-gray-700 truncate">{o.name}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className={`badge ${HEALTH_COLORS[o.healthStatus]}`}>{HEALTH_STATUSES[o.healthStatus]}</span>
                        {o.value != null && <span className="text-sm font-medium text-gray-600">{fmtMoney(o.value)}</span>}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Leads by status */}
          <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Leads</h2>
              <Link href={`/leads${qs}`} className="text-xs text-brand-600 hover:underline">View all</Link>
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

          {/* Pipeline by owner */}
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

          {/* Closing this month */}
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
                  <span className="text-sm font-medium text-gray-700 shrink-0">
                    {o.value != null ? fmtMoney(o.value) : "—"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Overdue tasks */}
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Overdue Tasks</h2>
            <Link href={`/tasks${qs}`} className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          {overdueTasks.length === 0 && <p className="text-sm text-gray-400">Nothing overdue. Nice.</p>}
          <div className="space-y-2">
            {overdueTasks.map((t) => (
              <div key={t.id} className="flex justify-between items-start gap-2 py-1.5 border-b border-gray-50 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm text-gray-700 truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <ProductBadge product={inheritedProduct(t)} />
                    <p className="text-xs text-gray-400 truncate">
                      {t.lead?.name ?? t.opportunity?.name ?? t.account?.name ?? ""}
                    </p>
                  </div>
                </div>
                {t.dueDate && (
                  <span className="text-xs shrink-0 text-red-600 font-semibold">{fmtDate(t.dueDate)}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
            <Link href={`/activities${qs}`} className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          {recentActivities.length === 0 && <p className="text-sm text-gray-400">No activities yet.</p>}
          <div className="space-y-3">
            {recentActivities.map((act) => (
              <div key={act.id} className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {act.type[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{act.subject}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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
