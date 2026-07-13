"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { COUNTRIES, parseMarkets } from "@/lib/constants";
import { FORECAST_CATEGORIES, HEALTH_STATUSES, productLabel } from "@/lib/products";
import OwnerSelect from "@/components/OwnerSelect";
import ProductBadge from "@/components/ProductBadge";

type Pipeline = {
  id: string;
  name: string;
  productKey: string;
  active: boolean;
  stages: { id: string; key: string; name: string; isWon: boolean; isLost: boolean; active: boolean; defaultProbability: number }[];
};

export default function EditOpportunityPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [opp, setOpp] = useState<Record<string, unknown> | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [markets, setMarkets] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/opportunities/${params.id}`).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      fetch("/api/pipelines").then((r) => r.json()),
    ])
      .then(([o, p]) => {
        setOpp(o);
        setPipelines(p);
        setMarkets(new Set(parseMarkets(String(o.markets ?? ""))));
      })
      .catch(() => setLoadError("Could not load this opportunity."));
  }, [params.id]);

  const pipeline = useMemo(
    () => pipelines.find((p) => p.productKey === (opp?.product as string) && p.active),
    [pipelines, opp]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const body: Record<string, unknown> = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== "")
    );
    if (body.value) body.value = Number(body.value);
    if (body.probability) body.probability = Number(body.probability);
    body.ownerId = data.ownerId || null;
    body.markets = Array.from(markets);
    for (const k of ["nextAction", "notes", "nextActionDate", "expectedCloseDate"]) {
      if (data[k] === "") body[k] = null;
    }
    body.decisionMakerEngaged = data.decisionMakerEngaged === "on";
    const res = await fetch(`/api/opportunities/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push(`/opportunities/${params.id}`);
      router.refresh();
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Failed to save.");
      setSaving(false);
    }
  }

  function toggleMarket(code: string) {
    const next = new Set(markets);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setMarkets(next);
  }

  if (loadError) {
    return <div className="p-8"><div role="alert" className="card p-6 text-red-600">{loadError}</div></div>;
  }
  if (!opp) return <div className="p-8 text-gray-400">Loading…</div>;

  const closeDate = opp.expectedCloseDate
    ? new Date(opp.expectedCloseDate as string).toISOString().split("T")[0]
    : "";
  const nextActionDate = opp.nextActionDate
    ? new Date(opp.nextActionDate as string).toISOString().split("T")[0]
    : "";

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href={`/opportunities/${params.id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {String(opp.name)}
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-gray-900">Edit Opportunity</h1>
          <ProductBadge product={String(opp.product)} size="md" />
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          Product is fixed per opportunity — create a separate deal for another business line.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}
        <div>
          <label className="label" htmlFor="oe-name">Deal Name *</label>
          <input id="oe-name" name="name" required defaultValue={String(opp.name ?? "")} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="oe-stage">
              Stage <span className="font-normal text-gray-400">({pipeline?.name ?? productLabel(String(opp.product))})</span>
            </label>
            <select id="oe-stage" name="stage" defaultValue={String(opp.stage ?? "")} className="input">
              {(pipeline?.stages.filter((s) => s.active) ?? []).map((s) => (
                <option key={s.id} value={s.key}>{s.name} ({s.defaultProbability}%)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="oe-owner">Owner</label>
            <OwnerSelect defaultValue={opp.ownerId ? String(opp.ownerId) : null} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="oe-value">Value (USD)</label>
            <input id="oe-value" name="value" type="number" min="0" step="1000" defaultValue={String(opp.value ?? "")} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="oe-prob">Probability (%)</label>
            <input id="oe-prob" name="probability" type="number" min="0" max="100" defaultValue={String(opp.probability ?? "")} className="input" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="oe-forecast">Forecast Category</label>
            <select id="oe-forecast" name="forecastCategory" defaultValue={String(opp.forecastCategory ?? "PIPELINE")} className="input">
              {Object.entries(FORECAST_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="oe-health">Health</label>
            <select id="oe-health" name="healthStatus" defaultValue={String(opp.healthStatus ?? "ON_TRACK")} className="input">
              {Object.entries(HEALTH_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <p className="label mb-2">Markets</p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(COUNTRIES).map(([code, name]) => {
              const active = markets.has(code);
              return (
                <label
                  key={code}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                    active ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <input type="checkbox" checked={active} onChange={() => toggleMarket(code)} className="accent-brand-600" />
                  {name}
                </label>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="label" htmlFor="oe-next">Next Action</label>
            <input id="oe-next" name="nextAction" defaultValue={String(opp.nextAction ?? "")} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="oe-nextdate">Next Action Due</label>
            <input id="oe-nextdate" name="nextActionDate" type="date" defaultValue={nextActionDate} className="input" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="oe-close">Expected Close Date</label>
          <input id="oe-close" name="expectedCloseDate" type="date" defaultValue={closeDate} className="input" />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="dmFlag"
            name="decisionMakerEngaged"
            type="checkbox"
            defaultChecked={Boolean(opp.decisionMakerEngaged)}
            className="w-4 h-4 rounded border-gray-300 accent-brand-600"
          />
          <label htmlFor="dmFlag" className="text-sm text-gray-700">Decision maker engaged</label>
        </div>

        <div>
          <label className="label" htmlFor="oe-notes">Notes</label>
          <textarea id="oe-notes" name="notes" rows={3} defaultValue={String(opp.notes ?? "")} className="input resize-none" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <Link href={`/opportunities/${params.id}`} className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
