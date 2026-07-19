"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CircleDot, GripVertical } from "lucide-react";
import ProductBadge from "@/components/ProductBadge";
import { marketLabels, stageColor } from "@/lib/constants";
import { HEALTH_COLORS, HEALTH_STATUSES } from "@/lib/products";
import { fmtMoney, fmtDate, daysSince, isOverdue } from "@/lib/format";

export type BoardStage = {
  id: string;
  key: string;
  name: string;
  isWon: boolean;
  isLost: boolean;
  defaultProbability: number;
};

export type BoardOpp = {
  id: string;
  name: string;
  product: string;
  stageId: string | null;
  stage: string;
  value: number | null;
  probability: number | null;
  markets: string;
  healthStatus: string;
  nextAction: string | null;
  nextActionDate: string | null;
  stageChangedAt: string;
  expectedCloseDate: string | null;
  closedAt: string | null;
  account: { id: string; name: string };
  owner: { id: string; name: string } | null;
};

function ownerInitials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Card({ opp, dragging }: { opp: BoardOpp; dragging: boolean }) {
  const inStage = daysSince(opp.stageChangedAt);
  const nextOverdue = opp.nextActionDate && isOverdue(opp.nextActionDate) && !opp.closedAt;
  return (
    <div
      className={`card p-3.5 bg-white transition-all ${
        dragging ? "opacity-40 rotate-1" : "hover:shadow-md hover:border-brand-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/opportunities/${opp.id}`}
          className="text-sm font-medium text-gray-800 line-clamp-2 hover:text-brand-700"
          draggable={false}
        >
          {opp.name}
        </Link>
        <span
          title={HEALTH_STATUSES[opp.healthStatus] ?? opp.healthStatus}
          className={`shrink-0 mt-0.5 badge ${HEALTH_COLORS[opp.healthStatus] ?? "bg-gray-100 text-gray-600"}`}
        >
          {HEALTH_STATUSES[opp.healthStatus]?.split(" ")[0] ?? opp.healthStatus}
        </span>
      </div>
      <p className="text-xs text-brand-600 mt-0.5">{opp.account.name}</p>

      <div className="flex items-center justify-between mt-2">
        <ProductBadge product={opp.product} />
        {opp.value != null && (
          <span className="text-sm font-semibold text-gray-800">{fmtMoney(opp.value)}</span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-500 flex-wrap">
        {opp.probability != null && <span>{opp.probability}%</span>}
        {opp.expectedCloseDate && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock size={11} aria-hidden /> {fmtDate(opp.expectedCloseDate)}
          </span>
        )}
        {inStage != null && (
          <span className="inline-flex items-center gap-1" title="Days in stage">
            <CircleDot size={11} aria-hidden /> {inStage}d in stage
          </span>
        )}
        {marketLabels(opp.markets) !== "—" && (
          <span className="text-gray-400">{marketLabels(opp.markets)}</span>
        )}
      </div>

      {opp.nextAction && (
        <div
          className={`mt-2 pt-2 border-t border-gray-50 text-[11px] flex items-start gap-1.5 ${
            nextOverdue ? "text-red-600" : "text-gray-500"
          }`}
        >
          {nextOverdue && <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden />}
          <span className="line-clamp-1">{opp.nextAction}</span>
          {opp.nextActionDate && <span className="shrink-0 font-medium">{fmtDate(opp.nextActionDate)}</span>}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        {opp.owner ? (
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[9px] font-bold flex items-center justify-center">
              {ownerInitials(opp.owner.name)}
            </span>
            <span className="text-[11px] text-gray-400">{opp.owner.name}</span>
          </span>
        ) : (
          <span />
        )}
        <GripVertical size={13} className="text-gray-200" aria-hidden />
      </div>
    </div>
  );
}

/**
 * Product pipeline board with native drag-and-drop stage moves.
 * Dropping a card PUTs the new stage; probability defaults, stageChangedAt and
 * closedAt are stamped server-side by the opportunity API.
 */
export default function PipelineBoard({
  stages,
  opportunities,
}: {
  stages: BoardStage[];
  opportunities: BoardOpp[];
}) {
  const router = useRouter();
  const [opps, setOpps] = useState<BoardOpp[]>(opportunities);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function moveTo(oppId: string, stage: BoardStage) {
    const opp = opps.find((o) => o.id === oppId);
    if (!opp || opp.stageId === stage.id) return;
    setError("");
    const prev = opps;
    // Optimistic move
    setOpps((cur) =>
      cur.map((o) =>
        o.id === oppId
          ? {
              ...o,
              stageId: stage.id,
              stage: stage.key,
              probability: stage.defaultProbability,
              stageChangedAt: new Date().toISOString(),
              closedAt: stage.isWon || stage.isLost ? new Date().toISOString() : null,
            }
          : o
      )
    );
    const res = await fetch(`/api/opportunities/${oppId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: stage.key }),
    });
    if (!res.ok) {
      setOpps(prev);
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Could not move the deal — change was rolled back.");
    } else {
      router.refresh();
    }
  }

  return (
    <div>
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg mb-3">
          {error}
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
        {stages.map((stage) => {
          const inColumn = opps.filter((o) =>
            stage.isWon || stage.isLost
              ? o.closedAt && o.stageId === stage.id
              : !o.closedAt && o.stageId === stage.id
          );
          const stageValue = inColumn.reduce((s, o) => s + (o.value ?? 0), 0);
          const weighted = inColumn.reduce(
            (s, o) => s + ((o.value ?? 0) * (o.probability ?? 0)) / 100,
            0
          );
          const isTarget = dropStage === stage.id;
          return (
            <div
              key={stage.id}
              data-stage-key={stage.key}
              className={`flex-shrink-0 w-[300px] rounded-xl transition-colors ${
                isTarget ? "bg-brand-50/70 ring-2 ring-brand-300 ring-dashed" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDropStage(stage.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropStage(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/opportunity-id");
                setDropStage(null);
                setDraggingId(null);
                if (id) moveTo(id, stage);
              }}
            >
              <div className="sticky top-0 z-10 bg-[#f7f8fb] pb-2 px-0.5 rounded-t-xl">
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`badge ${stageColor(stage.key)}`}>{stage.name}</span>
                    <span className="text-xs text-gray-400 font-medium shrink-0">{inColumn.length}</span>
                  </div>
                  <span className="text-xs text-gray-500 font-semibold shrink-0">{fmtMoney(stageValue)}</span>
                </div>
                {!stage.isWon && !stage.isLost && stageValue > 0 && (
                  <p className="text-[11px] text-gray-400 mt-0.5">weighted {fmtMoney(weighted)}</p>
                )}
              </div>
              <div className="space-y-2.5 min-h-[80px] px-0.5 pb-1">
                {inColumn.map((opp) => (
                  <div
                    key={opp.id}
                    data-opp-id={opp.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/opportunity-id", opp.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(opp.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDropStage(null);
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <Card opp={opp} dragging={draggingId === opp.id} />
                  </div>
                ))}
                {inColumn.length === 0 && (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center">
                    <p className="text-xs text-gray-400">
                      {isTarget ? "Drop here" : `No deals in ${stage.name}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
