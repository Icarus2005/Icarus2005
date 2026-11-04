import Link from "next/link";
import { AlertCircle, CheckCircle2, CircleAlert, Search } from "lucide-react";
import type { CrmHealth, HealthSeverity } from "@/lib/crmHealth";

const severityStyle: Record<HealthSeverity, { border: string; badge: string; icon: typeof AlertCircle }> = {
  urgent: { border: "border-red-200", badge: "bg-red-100 text-red-700", icon: AlertCircle },
  attention: { border: "border-amber-200", badge: "bg-amber-100 text-amber-700", icon: CircleAlert },
  review: { border: "border-gray-200", badge: "bg-gray-100 text-gray-600", icon: Search },
};

export default function CrmHealthOverview({ health }: { health: CrmHealth }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 border-l-4 border-l-red-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Urgent</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{health.summary.urgent}</p>
        </div>
        <div className="card p-4 border-l-4 border-l-amber-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Attention</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{health.summary.attention}</p>
        </div>
        <div className="card p-4 border-l-4 border-l-gray-400">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Review</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{health.summary.review}</p>
        </div>
        <div className="card p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Healthy Rules</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{health.summary.healthyRules}/{health.summary.totalRules}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {health.issues.map((issue) => {
          const style = severityStyle[issue.severity];
          const Icon = style.icon;
          return (
            <section id={`health-${issue.key}`} key={issue.key} className={`card p-5 ${style.border}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  {issue.records.length === 0 ? (
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                  ) : (
                    <Icon size={18} className="mt-0.5 shrink-0 text-gray-500" aria-hidden />
                  )}
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">{issue.title}</h2>
                    <p className="mt-1 text-xs text-gray-500">{issue.description}</p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${issue.records.length === 0 ? "bg-emerald-100 text-emerald-700" : style.badge}`}>
                  {issue.records.length}
                </span>
              </div>

              {issue.records.length > 0 && (
                <details className="mt-4" open={issue.severity === "urgent" && issue.records.length <= 8}>
                  <summary className="cursor-pointer text-xs font-semibold text-brand-600 hover:text-brand-700">
                    Review {issue.records.length} record{issue.records.length === 1 ? "" : "s"}
                  </summary>
                  <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                    {issue.records.map((item, index) => (
                      <div key={`${item.entity}-${item.id}-${index}`} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{item.label}</p>
                          <p className="text-[11px] text-gray-400">{item.detail ?? item.entity}</p>
                        </div>
                        <Link href={item.href} className="text-xs font-medium text-gray-600 hover:text-gray-900">Review</Link>
                        {item.actionHref && item.actionLabel && (
                          <Link href={item.actionHref} className="text-xs font-semibold text-brand-600 hover:text-brand-700">{item.actionLabel}</Link>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
