export const dynamic = "force-dynamic";

import Link from "next/link";
import { TriangleAlert as AlertTriangle, HistoryIcon as History } from "lucide-react";
import { getCrmHealth } from "@/lib/crmHealth";
import CrmHealthOverview from "./CrmHealthOverview";

export default async function CrmHealthPage() {
  const health = await getCrmHealth();
  const thresholds = health.thresholds;

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM Health</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Prioritized hygiene review generated {new Date(health.generatedAt).toLocaleString()}.
            Every action opens an existing CRM review path.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Thresholds: Opportunity activity {thresholds.recentOpportunityActivityDays} days · stale Leads {thresholds.staleLeadDays} days · stale relationships {thresholds.staleRelationshipDays} days · upcoming commitments {thresholds.upcomingCommitmentDays} days.
          </p>
        </div>
        <Link href="/admin/data-audit/legacy" className="btn-secondary inline-flex items-center gap-2">
          <History size={15} aria-hidden />
          Historical audit tools
        </Link>
      </div>

      <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
        Review only — nothing is deleted, merged, reassigned, qualified, or corrected automatically.
        Protected by the same shared access gate as the rest of the CRM.
      </div>

      <CrmHealthOverview health={health} />
    </div>
  );
}
