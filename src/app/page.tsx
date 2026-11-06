export const dynamic = "force-dynamic";

import Link from "next/link";
import { TriangleAlert as AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, CircleAlert, Clock3 } from "lucide-react";
import ProductSelector from "@/components/ProductSelector";
import ProductBadge from "@/components/ProductBadge";
import {
  dashboardViewHref,
  getDailyActionDashboard,
  visibleDashboardItems,
  type AtRiskItem,
  type TodayAction,
  type UpcomingItem,
} from "@/lib/dailyActionDashboard";
import { fmtDate, fmtMoney } from "@/lib/format";
import { parseProductParam, PRODUCTS_META } from "@/lib/products";
import { stageColor } from "@/lib/constants";

const todayStyles: Record<TodayAction["timing"], { label: string; badge: string; border: string }> = {
  commitmentOverdue: { label: "Overdue commitment", badge: "bg-red-100 text-red-700", border: "border-l-red-600" },
  overdue: { label: "Overdue", badge: "bg-red-100 text-red-700", border: "border-l-red-500" },
  today: { label: "Due today", badge: "bg-amber-100 text-amber-700", border: "border-l-amber-500" },
  missing: { label: "Missing next Task", badge: "bg-violet-100 text-violet-700", border: "border-l-violet-500" },
  unscheduled: { label: "Needs Scheduling", badge: "bg-sky-100 text-sky-700", border: "border-l-sky-500" },
};

const upcomingStyles: Record<UpcomingItem["type"], { label: string; badge: string }> = {
  task: { label: "Task", badge: "bg-blue-50 text-blue-700" },
  commitment: { label: "Client commitment", badge: "bg-emerald-50 text-emerald-700" },
  meeting: { label: "Meeting", badge: "bg-violet-50 text-violet-700" },
  close: { label: "Expected close", badge: "bg-amber-50 text-amber-700" },
};

function EmptyState({ icon: Icon, children }: { icon: typeof CheckCircle2; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-8 text-center">
      <Icon size={22} className="mx-auto text-emerald-500" aria-hidden />
      <p className="mt-2 text-sm font-medium text-gray-700">{children}</p>
    </div>
  );
}

function TodayList({ items, showAll }: { items: TodayAction[]; showAll: boolean }) {
  if (items.length === 0) return <EmptyState icon={CheckCircle2}>No overdue commitments, due-today Tasks, unscheduled Tasks or missing qualified-Lead actions.</EmptyState>;
  const visibleItems = visibleDashboardItems(items, 12, showAll);
  return (
    <div className="space-y-2.5">
      {visibleItems.map((item) => {
        const style = todayStyles[item.timing];
        return (
          <article key={item.key} className={`rounded-xl border border-gray-100 border-l-4 ${style.border} bg-white p-3.5`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {item.conditions.map((condition) => {
                    const conditionStyle = todayStyles[condition];
                    return (
                      <span key={condition} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${conditionStyle.badge}`}>
                        {conditionStyle.label}
                      </span>
                    );
                  })}
                  <ProductBadge product={item.product} />
                </div>
                <Link href={item.href} className="mt-2 block truncate text-sm font-semibold text-gray-900 hover:text-brand-700">
                  {item.label}
                </Link>
                {item.context && <p className="mt-0.5 truncate text-xs text-gray-500">{item.context}</p>}
                <p className="mt-1 text-[11px] text-gray-400">{item.explanation}</p>
              </div>
              {item.date && <span className={`shrink-0 text-xs font-semibold ${item.timing === "overdue" ? "text-red-600" : "text-amber-700"}`}>{fmtDate(item.date)}</span>}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2.5">
              <Link href={item.href} className="text-xs text-gray-500 hover:text-gray-800">Open record</Link>
              <Link href={item.actionHref} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800">
                {item.actionLabel}<ArrowRight size={12} aria-hidden />
              </Link>
            </div>
          </article>
        );
      })}
      {!showAll && items.length > visibleItems.length && (
        <p className="px-2 pt-1 text-center text-[11px] text-gray-400">
          Showing the 12 highest-priority actions of {items.length}. Use View all for the complete action list.
        </p>
      )}
    </div>
  );
}

function AtRiskList({ items, showAll }: { items: AtRiskItem[]; showAll: boolean }) {
  if (items.length === 0) return <EmptyState icon={CheckCircle2}>No open deals or active Leads currently need attention.</EmptyState>;
  const commercial = items.filter((item) => item.category === "commercial");
  const hygiene = items.filter((item) => item.category === "hygiene");
  const groups = [
    {
      label: "Commercial risks",
      description: "Cooling relationships, inactive deals, passed close dates or explicit risk status.",
      items: visibleDashboardItems(commercial, 8, showAll),
      total: commercial.length,
    },
    {
      label: "CRM hygiene & missing data",
      description: "Incomplete canonical links or next-action records without a commercial risk signal.",
      items: visibleDashboardItems(hygiene, 8, showAll),
      total: hygiene.length,
    },
  ].filter((group) => group.total > 0);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label} className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{group.label}</h3>
              <p className="mt-0.5 text-[10px] text-gray-400">{group.description}</p>
            </div>
            <span className="text-[11px] text-gray-400">{group.total}</span>
          </div>
          {group.items.map((item) => (
            <article key={item.key} className={`rounded-xl border p-3.5 ${item.category === "commercial" ? "border-amber-100 bg-amber-50/30" : "border-slate-200 bg-slate-50/60"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${item.category === "commercial" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-700"}`}>
                  {item.category === "commercial" ? "Commercial risk" : "CRM hygiene"}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{item.entity}</span>
                <ProductBadge product={item.product} />
              </div>
              <Link href={item.href} className="mt-2 block truncate text-sm font-semibold text-gray-900 hover:text-brand-700">{item.label}</Link>
              {item.context && <p className="mt-0.5 truncate text-xs text-gray-500">{item.context}</p>}
            </div>
            {item.category === "commercial"
              ? <AlertTriangle size={17} className="shrink-0 text-amber-600" aria-hidden />
              : <CircleAlert size={17} className="shrink-0 text-slate-500" aria-hidden />}
          </div>
          <ul className="mt-2.5 space-y-1">
            {item.reasons.map((reason) => (
              <li key={`${reason.kind}:${reason.text}`} className="flex items-start gap-2 text-[11px] leading-4 text-gray-700">
                <span className={`mt-0.5 shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase ${reason.kind === "commercial" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
                  {reason.kind === "commercial" ? "Risk" : "Hygiene"}
                </span>
                {reason.text}
              </li>
            ))}
          </ul>
          {item.nextInteraction && (
            <p className="mt-2 rounded-lg bg-white/80 px-2.5 py-2 text-[11px] text-gray-600">
              <span className="font-semibold text-gray-700">Next:</span> {item.nextInteraction.label}
              {item.nextInteraction.date ? ` · ${fmtDate(item.nextInteraction.date)}` : " · no date"}
            </p>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-amber-100 pt-2.5">
            <Link href={item.href} className="text-xs text-gray-500 hover:text-gray-800">Open record</Link>
            <Link href={item.actionHref} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800">
              {item.actionLabel}<ArrowRight size={12} aria-hidden />
            </Link>
          </div>
            </article>
          ))}
          {!showAll && group.total > group.items.length && (
            <p className="px-2 text-center text-[11px] text-gray-400">
              Showing {group.items.length} of {group.total}; CRM Health retains the complete review list.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function UpcomingList({ items }: { items: UpcomingItem[] }) {
  if (items.length === 0) return <EmptyState icon={CalendarDays}>No recorded Tasks, commitments, meetings or expected closes in the next seven days.</EmptyState>;
  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const style = upcomingStyles[item.type];
        return (
          <Link key={item.key} href={item.href} className="flex gap-3 rounded-xl border border-gray-100 bg-white p-3.5 transition-colors hover:border-brand-200 hover:bg-brand-50/20">
            <div className="w-14 shrink-0 rounded-lg bg-gray-50 px-1.5 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Dubai</p>
              <p className="mt-0.5 text-xs font-bold text-gray-800">{fmtDate(item.date)}</p>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}>{style.label}</span>
                <ProductBadge product={item.product} />
              </div>
              <p className="mt-1.5 truncate text-sm font-semibold text-gray-900">{item.label}</p>
              {item.context && <p className="truncate text-xs text-gray-500">{item.context}</p>}
              <p className="mt-1 text-[11px] text-gray-400">{item.explanation}</p>
              {item.relatedDates && item.relatedDates.length > 1 && (
                <p className="mt-1 text-[11px] font-medium text-gray-500">
                  {item.relatedDates.map((entry) => `${entry.type === "commitment" ? "Client commitment" : "Internal target"}: ${fmtDate(entry.date)}`).join(" · ")}
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default async function DashboardPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ product?: string; view?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const product = parseProductParam(searchParams.product);
  const dashboard = await getDailyActionDashboard(product ?? "");
  const showAllToday = searchParams.view === "today";
  const showAllAttention = searchParams.view === "attention";
  const label = product ? PRODUCTS_META[product].label : "All business lines";
  const productQuery = product ? `?product=${product}` : "";
  const maxStageValue = Math.max(...dashboard.metrics.stages.map((stage) => stage.value), 1);

  return (
    <div className="p-5 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Daily commercial command centre</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-950">What should I do today?</h1>
          <p className="mt-1 text-sm text-gray-500">Prioritized from recorded CRM Tasks, Activities and dates · Asia/Dubai calendar · {label}</p>
        </div>
        <Link href="/admin/data-audit" className="btn-secondary inline-flex items-center gap-2">
          <CircleAlert size={15} aria-hidden /> CRM Health
        </Link>
      </header>

      <div className="mt-5"><ProductSelector /></div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="card p-4 md:p-5" aria-labelledby="today-heading">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Clock3 size={17} className="text-red-600" aria-hidden />
                <h2 id="today-heading" className="text-sm font-bold uppercase tracking-wide text-gray-900">Today</h2>
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">{dashboard.today.length}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">Overdue commitments and Tasks first, then due today, missing next actions and Needs Scheduling.</p>
            </div>
            <Link
              href={showAllToday ? `${product ? `/?product=${product}` : "/"}#today-heading` : dashboardViewHref(product, "today")}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              {showAllToday ? "Prioritized view" : "View all"}
            </Link>
          </div>
          <div className={showAllToday ? "pr-1" : "max-h-[680px] overflow-y-auto pr-1"}><TodayList items={dashboard.today} showAll={showAllToday} /></div>
        </section>

        <section className="card p-4 md:p-5" aria-labelledby="attention-heading">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle size={17} className="text-amber-600" aria-hidden />
                <h2 id="attention-heading" className="text-sm font-bold uppercase tracking-wide text-gray-900">Needs Attention</h2>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">{dashboard.attentionSummary.records}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {dashboard.attentionSummary.commercialFlags} commercial risk flag{dashboard.attentionSummary.commercialFlags === 1 ? "" : "s"} · {dashboard.attentionSummary.hygieneFlags} CRM hygiene flag{dashboard.attentionSummary.hygieneFlags === 1 ? "" : "s"} across {dashboard.attentionSummary.records} record{dashboard.attentionSummary.records === 1 ? "" : "s"}.
              </p>
            </div>
            <Link
              href={showAllAttention ? `${product ? `/?product=${product}` : "/"}#attention-heading` : dashboardViewHref(product, "attention")}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              {showAllAttention ? "Prioritized view" : "View all"}
            </Link>
          </div>
          <div className={showAllAttention ? "pr-1" : "max-h-[680px] overflow-y-auto pr-1"}><AtRiskList items={dashboard.atRisk} showAll={showAllAttention} /></div>
        </section>

        <section className="card p-4 md:p-5" aria-labelledby="upcoming-heading">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays size={17} className="text-blue-600" aria-hidden />
                <h2 id="upcoming-heading" className="text-sm font-bold uppercase tracking-wide text-gray-900">Upcoming</h2>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{dashboard.upcoming.length}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">Recorded commitments and dates through the next seven Dubai days.</p>
            </div>
          </div>
          <div className="max-h-[680px] overflow-y-auto pr-1"><UpcomingList items={dashboard.upcoming} /></div>
        </section>
      </div>

      <section className="mt-8" aria-labelledby="pipeline-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Commercial context</p>
            <h2 id="pipeline-heading" className="mt-1 text-lg font-bold text-gray-900">Pipeline snapshot</h2>
          </div>
          <Link href={`/opportunities${productQuery}`} className="text-xs font-medium text-brand-600 hover:underline">Open Opportunities</Link>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: "Active Leads", value: String(dashboard.metrics.activeLeads), href: `/leads${productQuery}` },
            { label: "Open deals", value: String(dashboard.metrics.openOpportunities), href: `/opportunities${productQuery}` },
            { label: "Pipeline", value: fmtMoney(dashboard.metrics.pipelineValue), href: `/opportunities${productQuery}` },
            { label: "Weighted", value: fmtMoney(dashboard.metrics.weightedValue), href: `/opportunities${productQuery}` },
            { label: "Commit", value: fmtMoney(dashboard.metrics.commitValue), href: `/opportunities${productQuery}` },
          ].map((metric) => (
            <Link key={metric.label} href={metric.href} className="card p-4 transition-shadow hover:shadow-md">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{metric.label}</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{metric.value}</p>
            </Link>
          ))}
        </div>

        <div className="card mt-4 p-5">
          <h3 className="text-sm font-semibold text-gray-700">Open pipeline by stage</h3>
          {dashboard.metrics.stages.length === 0 ? (
            <p className="mt-4 text-sm text-gray-400">No open Opportunities for this view.</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
              {dashboard.metrics.stages.map((stage) => (
                <Link key={stage.key} href={`/opportunities${productQuery}`} className="group">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${stageColor(stage.key)}`}>{stage.name}</span>
                      <span className="text-xs text-gray-400">{stage.count}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-700 group-hover:text-brand-700">{fmtMoney(stage.value)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(stage.value / maxStageValue) * 100}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
