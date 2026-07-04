export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  DEAL_STAGES, DEAL_STAGE_ORDER, STAGE_COLORS, DEAL_TYPES, GCC_COUNTRIES, OPEN_STAGES,
} from "@/lib/constants";

async function getOpportunities() {
  return prisma.opportunity.findMany({
    include: {
      account: { select: { id: true, name: true, country: true } },
      contacts: { include: { contact: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const opportunities = await getOpportunities();
  const view = searchParams.view ?? "pipeline";

  const byStage = DEAL_STAGE_ORDER.reduce<Record<string, typeof opportunities>>(
    (acc, stage) => {
      acc[stage] = opportunities.filter((o) => o.stage === stage);
      return acc;
    },
    {}
  );

  const openStages = OPEN_STAGES;
  const pipelineValue = opportunities
    .filter((o) => openStages.includes(o.stage))
    .reduce((s, o) => s + (o.value ?? 0), 0);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {opportunities.filter((o) => openStages.includes(o.stage)).length} open deals
            · {fmt(pipelineValue)} pipeline
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <Link
              href="?view=pipeline"
              className={`px-3 py-1.5 text-sm ${view === "pipeline" ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Board
            </Link>
            <Link
              href="?view=list"
              className={`px-3 py-1.5 text-sm ${view === "list" ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              List
            </Link>
          </div>
          <Link href="/opportunities/new" className="btn-primary">+ New Deal</Link>
        </div>
      </div>

      {/* BOARD VIEW */}
      {view === "pipeline" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {DEAL_STAGE_ORDER.map((stage) => {
            const cards = byStage[stage] ?? [];
            const stageValue = cards.reduce((s, o) => s + (o.value ?? 0), 0);
            return (
              <div key={stage} className="flex-shrink-0 w-64">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${STAGE_COLORS[stage]}`}>
                      {DEAL_STAGES[stage]}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">{cards.length}</span>
                  </div>
                  {stageValue > 0 && (
                    <span className="text-xs text-gray-500 font-semibold">{fmt(stageValue)}</span>
                  )}
                </div>
                <div className="space-y-2">
                  {cards.map((opp) => (
                    <Link
                      key={opp.id}
                      href={`/opportunities/${opp.id}`}
                      className="card p-3 block hover:shadow-md transition-shadow"
                    >
                      <p className="text-sm font-medium text-gray-800 line-clamp-2">{opp.name}</p>
                      <p className="text-xs text-brand-600 mt-1 hover:underline">
                        {opp.account.name}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500">
                          {DEAL_TYPES[opp.type] ?? opp.type}
                        </span>
                        {opp.value && (
                          <span className="text-xs font-semibold text-gray-700">{fmt(opp.value)}</span>
                        )}
                      </div>
                      {opp.probability != null && (
                        <div className="mt-2">
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-400 rounded-full"
                              style={{ width: `${opp.probability}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{opp.probability}% probability</p>
                        </div>
                      )}
                      {opp.expectedCloseDate && (
                        <p className="text-xs text-gray-400 mt-1">
                          Close:{" "}
                          {new Date(opp.expectedCloseDate).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      )}
                    </Link>
                  ))}
                  {cards.length === 0 && (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                      <p className="text-xs text-gray-400">No deals</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {view === "list" && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-th">Deal Name</th>
                <th className="table-th">Account</th>
                <th className="table-th">Stage</th>
                <th className="table-th">Type</th>
                <th className="table-th">Value</th>
                <th className="table-th">Probability</th>
                <th className="table-th">Close Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {opportunities.length === 0 && (
                <tr>
                  <td colSpan={7} className="table-td text-center text-gray-400 py-10">
                    No opportunities yet.
                  </td>
                </tr>
              )}
              {opportunities.map((opp) => (
                <tr key={opp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-td font-medium">
                    <Link href={`/opportunities/${opp.id}`} className="text-brand-600 hover:underline">
                      {opp.name}
                    </Link>
                  </td>
                  <td className="table-td">
                    <Link href={`/accounts/${opp.account.id}`} className="text-brand-600 hover:underline">
                      {opp.account.name}
                    </Link>
                    <span className="text-xs text-gray-400 ml-1">
                      ({GCC_COUNTRIES[opp.account.country] ?? opp.account.country})
                    </span>
                  </td>
                  <td className="table-td">
                    <span className={`badge ${STAGE_COLORS[opp.stage]}`}>
                      {DEAL_STAGES[opp.stage] ?? opp.stage}
                    </span>
                  </td>
                  <td className="table-td text-gray-500">{DEAL_TYPES[opp.type] ?? opp.type}</td>
                  <td className="table-td font-semibold">{opp.value ? fmt(opp.value) : "—"}</td>
                  <td className="table-td">
                    {opp.probability != null ? `${opp.probability}%` : "—"}
                  </td>
                  <td className="table-td text-gray-500">
                    {opp.expectedCloseDate
                      ? new Date(opp.expectedCloseDate).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
