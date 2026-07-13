"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { COUNTRIES } from "@/lib/constants";
import {
  BUSINESS_LINES,
  PRODUCTS_META,
  isProductKey,
  type ProductKey,
} from "@/lib/products";
import OwnerSelect from "@/components/OwnerSelect";

type Pipeline = {
  id: string;
  name: string;
  productKey: string;
  active: boolean;
  stages: { id: string; key: string; name: string; isWon: boolean; isLost: boolean; active: boolean; defaultProbability: number }[];
};

function NewOpportunityPageForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillAccountId = searchParams.get("accountId") ?? "";
  const paramProduct = searchParams.get("product");
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [product, setProduct] = useState<string>(
    paramProduct && isProductKey(paramProduct) && paramProduct !== "UNASSIGNED" ? paramProduct : ""
  );
  const [stageKey, setStageKey] = useState("");
  const [markets, setMarkets] = useState<Set<string>>(new Set(["AE"]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then(setAccounts).catch(() => {});
    fetch("/api/pipelines").then((r) => r.json()).then(setPipelines).catch(() => {});
  }, []);

  const pipeline = useMemo(
    () => pipelines.find((p) => p.productKey === product && p.active),
    [pipelines, product]
  );
  const stages = pipeline?.stages.filter((s) => s.active) ?? [];

  function toggleMarket(code: string) {
    const next = new Set(markets);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setMarkets(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!product) {
      setError("Select a product — every opportunity belongs to exactly one business line.");
      return;
    }
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const body: Record<string, unknown> = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== "")
    );
    body.product = product;
    body.markets = Array.from(markets);
    if (stageKey) body.stage = stageKey;
    if (body.value) body.value = Number(body.value);
    if (body.probability) body.probability = Number(body.probability);
    const res = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const opp = await res.json();
      router.push(`/opportunities/${opp.id}`);
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Failed to create opportunity.");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/opportunities" className="text-sm text-gray-500 hover:text-gray-700">
          ← Pipeline
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Opportunity</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          One product per opportunity — it lands on that product&apos;s pipeline.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <div>
          <p className="label mb-2">Product *</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Product">
            {BUSINESS_LINES.map((key: ProductKey) => {
              const meta = PRODUCTS_META[key];
              const active = product === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => { setProduct(key); setStageKey(""); }}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${
                    active
                      ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${meta.dot}`} aria-hidden />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="op-name">Deal Name *</label>
          <input id="op-name" name="name" required className="input" placeholder="e.g. Dubai Mall Location Intelligence Pilot" />
        </div>

        <div>
          <label className="label" htmlFor="op-account">Account *</label>
          <select id="op-account" name="accountId" required defaultValue={prefillAccountId} className="input">
            <option value="">Select account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="op-stage">
              Stage {pipeline ? <span className="font-normal text-gray-400">({pipeline.name})</span> : ""}
            </label>
            <select
              id="op-stage"
              value={stageKey}
              onChange={(e) => setStageKey(e.target.value)}
              className="input"
              disabled={!pipeline}
            >
              <option value="">{pipeline ? "First open stage (default)" : "Select a product first"}</option>
              {stages.map((s) => (
                <option key={s.id} value={s.key}>{s.name} ({s.defaultProbability}%)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="op-owner">Owner</label>
            <OwnerSelect />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="op-value">Value (USD)</label>
            <input id="op-value" name="value" type="number" min="0" step="1000" className="input" placeholder="0" />
          </div>
          <div>
            <label className="label" htmlFor="op-prob">Probability (%)</label>
            <input id="op-prob" name="probability" type="number" min="0" max="100" className="input" placeholder="Stage default" />
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
            <label className="label" htmlFor="op-next">Next Action</label>
            <input id="op-next" name="nextAction" className="input" placeholder="e.g. Send proposal draft" />
          </div>
          <div>
            <label className="label" htmlFor="op-nextdate">Next Action Due</label>
            <input id="op-nextdate" name="nextActionDate" type="date" className="input" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="op-close">Expected Close Date</label>
          <input id="op-close" name="expectedCloseDate" type="date" className="input" />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="dmFlag"
            name="decisionMakerEngaged"
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 accent-brand-600"
          />
          <label htmlFor="dmFlag" className="text-sm text-gray-700">Decision maker engaged</label>
        </div>

        <div>
          <label className="label" htmlFor="op-notes">Notes</label>
          <textarea id="op-notes" name="notes" rows={3} className="input resize-none" placeholder="Context, requirements, key info…" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? "Saving…" : "Create Opportunity"}
          </button>
          <Link href="/opportunities" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

export default function NewOpportunityPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading…</div>}>
      <NewOpportunityPageForm />
    </Suspense>
  );
}
