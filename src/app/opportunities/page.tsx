export const dynamic = "force-dynamic";

import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPipelines } from "@/lib/catalog";
import { COUNTRIES, MARKET_SHORT, stageColor } from "@/lib/constants";
import { PRODUCTS_META, BUSINESS_LINES, parseProductParam } from "@/lib/products";
import { fmtMoney, fmtDate, isOverdue } from "@/lib/format";
import ProductSelector from "@/components/ProductSelector";
import ProductBadge from "@/components/ProductBadge";
import SavedViews from "@/components/SavedViews";
import ExportButton from "@/components/ExportButton";
import PipelineBoard, { type BoardOpp, type BoardStage } from "./PipelineBoard";

type SearchParams = {
  product?: string;
  view?: string;
  ownerId?: string;
  market?: string;
  close?: string;
};

function closePeriodRange(close: string): { lte?: Date; gte?: Date } | null {
  const now = new Date();
  if (close === "month") {
    return {
      gte: new Date(now.getFullYear(), now.getMonth(), 1),
      lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
    };
  }
  if (close === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return {
      gte: new Date(now.getFullYear(), q * 3, 1),
      lte: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59),
    };
  }
  return null;
}

async function getOpportunities(sp: SearchParams) {
  const product = parseProductParam(sp.product);
  const range = sp.close ? closePeriodRange(sp.close) : null;
  return prisma.opportunity.findMany({
    where: {
      AND: [
        product ? { product } : {},
        sp.ownerId ? { ownerId: sp.ownerId } : {},
        sp.market ? { markets: { contains: sp.market } } : {},
        range ? { expectedCloseDate: range } : {},
      ],
    },
    include: {
      account: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      stageRef: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const product = parseProductParam(searchParams.product);
  const view = searchParams.view ?? "pipeline";
  const [opportunities, pipelines, owners] = await Promise.all([
    getOpportunities(searchParams),
    getPipelines(),
    prisma.teamMember.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const open = opportunities.filter((o) => !o.closedAt);
  const pipelineValue = open.reduce((s, o) => s + (o.value ?? 0), 0);
  const weightedValue = open.reduce((s, o) => s + ((o.value ?? 0) * (o.probability ?? 0)) / 100, 0);

  const activePipeline = product
    ? pipelines.find((p) => p.productKey === product && p.active)
    : null;

  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...searchParams, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {product ? `${PRODUCTS_META[product].label} Pipeline` : "Pipeline"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {open.length} open deals · {fmtMoney(pipelineValue)} pipeline · {fmtMoney(weightedValue)} weighted
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton entity="opportunities" />
          <Link href={`/opportunities/new${product ? `?product=${product}` : ""}`} className="btn-primary">
            <Plus size={16} aria-hidden /> New Deal
          </Link>
        </div>
      </div>

      {/* Product selector — always ahead of the board */}
      <div className="mb-3">
        <ProductSelector />
      </div>

      {/* Saved views */}
      <div className="mb-4">
        <SavedViews page="opportunities" />
      </div>

      {/* Toolbar */}
      <form method="GET" className="flex gap-3 mb-6 flex-wrap items-center">
        {product && <input type="hidden" name="product" value={product} />}
        {view !== "pipeline" && <input type="hidden" name="view" value={view} />}
        <label className="sr-only" htmlFor="ownerId">Owner</label>
        <select id="ownerId" name="ownerId" defaultValue={searchParams.ownerId ?? ""} className="input w-44">
          <option value="">All Owners</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="market">Market</label>
        <select id="market" name="market" defaultValue={searchParams.market ?? ""} className="input w-44">
          <option value="">All Markets</option>
          {Object.entries(COUNTRIES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="close">Close period</label>
        <select id="close" name="close" defaultValue={searchParams.close ?? ""} className="input w-44">
          <option value="">Any close date</option>
          <option value="month">Closing this month</option>
          <option value="quarter">Closing this quarter</option>
        </select>
        <button type="submit" className="btn-secondary">Apply</button>
        <div className="ml-auto flex rounded-xl border border-gray-200 overflow-hidden">
          <Link
            href={`/opportunities${qs({ view: undefined })}`}
            className={`px-3 py-1.5 text-sm ${view === "pipeline" ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            Board
          </Link>
          <Link
            href={`/opportunities${qs({ view: "list" })}`}
            className={`px-3 py-1.5 text-sm ${view === "list" ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            List
          </Link>
        </div>
      </form>

      {/* ALL PRODUCTS + BOARD: per-product summary instead of a mixed board */}
      {view === "pipeline" && !product && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {BUSINESS_LINES.map((key) => {
              const meta = PRODUCTS_META[key];
              const subset = open.filter((o) => o.product === key);
              const value = subset.reduce((s, o) => s + (o.value ?? 0), 0);
              const weighted = subset.reduce((s, o) => s + ((o.value ?? 0) * (o.probability ?? 0)) / 100, 0);
              return (
                <Link
                  key={key}
                  href={`/opportunities?product=${key}`}
                  className="card p-5 hover:shadow-md hover:border-brand-200 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${meta.dot}`} aria-hidden />
                    <p className="font-semibold text-gray-900">{meta.label}</p>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{fmtMoney(value)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {subset.length} open · {fmtMoney(weighted)} weighted
                  </p>
                  <p className={`text-xs mt-2 font-medium ${meta.text}`}>Open {meta.label} board →</p>
                </Link>
              );
            })}
          </div>
          {open.some((o) => o.product === "UNASSIGNED") && (
            <Link
              href="/opportunities?product=UNASSIGNED"
              className="card p-4 mb-6 flex items-center gap-3 hover:border-amber-300 transition-colors"
            >
              <AlertTriangle size={16} className="text-amber-500" aria-hidden />
              <span className="text-sm text-gray-700">
                {open.filter((o) => o.product === "UNASSIGNED").length} unassigned deal(s) need a product —
                open the Unassigned board to classify them.
              </span>
            </Link>
          )}
          <p className="text-sm text-gray-500 mb-3">
            Select a product above to work its stage board, or review everything in the list below.
          </p>
        </>
      )}

      {/* PRODUCT BOARD — drag a card between stages to move it */}
      {view === "pipeline" && product && activePipeline && (
        <PipelineBoard
          stages={
            activePipeline.stages
              .filter((s) => s.active)
              .map((s) => ({
                id: s.id,
                key: s.key,
                name: s.name,
                isWon: s.isWon,
                isLost: s.isLost,
                defaultProbability: s.defaultProbability,
              })) as BoardStage[]
          }
          opportunities={JSON.parse(JSON.stringify(opportunities)) as BoardOpp[]}
        />
      )}

      {/* LIST VIEW (also the All-Products default table) */}
      {(view === "list" || (view === "pipeline" && !product)) && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-th">Deal</th>
                  <th className="table-th">Account</th>
                  <th className="table-th">Product</th>
                  <th className="table-th">Stage</th>
                  <th className="table-th">Owner</th>
                  <th className="table-th">Markets</th>
                  <th className="table-th text-right">Value</th>
                  <th className="table-th">Next Action</th>
                  <th className="table-th">Close</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {opportunities.length === 0 && (
                  <tr>
                    <td colSpan={9} className="table-td text-center text-gray-400 py-10">
                      No opportunities match these filters.
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
                      <Link href={`/accounts/${opp.account.id}`} className="text-gray-600 hover:underline">
                        {opp.account.name}
                      </Link>
                    </td>
                    <td className="table-td"><ProductBadge product={opp.product} /></td>
                    <td className="table-td">
                      <span className={`badge ${stageColor(opp.stage)}`}>
                        {opp.stageRef?.name ?? opp.stage}
                      </span>
                    </td>
                    <td className="table-td text-gray-500">
                      {opp.owner?.name ?? <span className="text-gray-300">Unassigned</span>}
                    </td>
                    <td className="table-td text-gray-500">
                      {opp.markets.split(",").filter(Boolean).map((m) => MARKET_SHORT[m.trim()] ?? m).join(", ")}
                    </td>
                    <td className="table-td font-semibold text-right">{opp.value ? fmtMoney(opp.value) : "—"}</td>
                    <td className="table-td text-gray-500 max-w-[200px]">
                      {opp.nextAction ? (
                        <span className={isOverdue(opp.nextActionDate) && !opp.closedAt ? "text-red-600" : ""}>
                          <span className="line-clamp-1">{opp.nextAction}</span>
                          {opp.nextActionDate && <span className="text-xs">{fmtDate(opp.nextActionDate)}</span>}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="table-td text-gray-500">{fmtDate(opp.expectedCloseDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
