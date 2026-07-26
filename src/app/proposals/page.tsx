export const dynamic = "force-dynamic";

import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { parseProductParam, PRODUCTS_META } from "@/lib/products";
import { fmtMoney, fmtDate } from "@/lib/format";
import { BOARD_STAGES, STAGE_META } from "@/lib/proposals/stages";
import ProductSelector from "@/components/ProductSelector";
import ProductBadge from "@/components/ProductBadge";

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: { product?: string };
}) {
  const product = parseProductParam(searchParams.product);
  const proposals = await prisma.proposal.findMany({
    where: product ? { product } : {},
    include: {
      account: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      opportunity: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const inFlight = proposals.filter(
    (p) => !["DELIVERED", "ARCHIVED"].includes(p.stage)
  );
  const totalValue = inFlight.reduce((s, p) => s + (p.estimatedValue ?? 0), 0);
  const awaitingReview = proposals.filter((p) => p.stage === "REVIEW").length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {product ? `${PRODUCTS_META[product].label} Proposals` : "Proposals"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {inFlight.length} in flight · {fmtMoney(totalValue)} indicative
            {awaitingReview > 0 ? ` · ${awaitingReview} awaiting review` : ""}
          </p>
        </div>
        <Link href="/meetings" className="btn-secondary">
          <FileText size={15} aria-hidden /> Meetings inbox
        </Link>
      </div>

      <div className="mb-6">
        <ProductSelector />
      </div>

      {proposals.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-brand-50 flex items-center justify-center">
            <FileText size={22} className="text-brand-500" aria-hidden />
          </div>
          <p className="text-gray-600 font-medium">No proposals yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Qualified calls in the{" "}
            <Link href="/meetings" className="text-brand-600 hover:underline">meetings inbox</Link>{" "}
            can be promoted into the pipeline.
          </p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
          {BOARD_STAGES.map((stageKey) => {
            const meta = STAGE_META[stageKey];
            const cards = proposals.filter((p) => p.stage === stageKey);
            const value = cards.reduce((s, p) => s + (p.estimatedValue ?? 0), 0);
            return (
              <div key={stageKey} className="flex-shrink-0 w-[280px]">
                <div className="sticky top-0 z-10 bg-[#f7f8fb] pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`badge ${meta.badge}`}>{meta.label}</span>
                      <span className="text-xs text-gray-400 font-medium">{cards.length}</span>
                    </div>
                    {value > 0 && (
                      <span className="text-xs text-gray-500 font-semibold">{fmtMoney(value)}</span>
                    )}
                  </div>
                  {!meta.automated && (
                    <p className="text-[11px] text-amber-600 mt-0.5">Needs a person</p>
                  )}
                </div>
                <div className="space-y-2.5">
                  {cards.map((p) => (
                    <Link
                      key={p.id}
                      href={`/proposals/${p.id}`}
                      className="card p-3.5 block hover:shadow-md hover:border-brand-200 transition-all"
                    >
                      <p className="text-sm font-medium text-gray-800 line-clamp-2">{p.title}</p>
                      {p.account && (
                        <p className="text-xs text-brand-600 mt-0.5">{p.account.name}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <ProductBadge product={p.product} />
                        {p.estimatedValue != null && (
                          <span className="text-sm font-semibold text-gray-800">
                            {fmtMoney(p.estimatedValue)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400 flex-wrap">
                        <span>{fmtDate(p.stageChangedAt)}</span>
                        {p.owner && <span>· {p.owner.name}</span>}
                        {p.generatedBy === "TEMPLATE" && (
                          <span className="text-amber-600">· template draft</span>
                        )}
                      </div>
                      {p.failureReason && (
                        <p className="text-[11px] text-red-600 mt-1.5 line-clamp-2">
                          {p.failureReason}
                        </p>
                      )}
                    </Link>
                  ))}
                  {cards.length === 0 && (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                      <p className="text-xs text-gray-400">Empty</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
