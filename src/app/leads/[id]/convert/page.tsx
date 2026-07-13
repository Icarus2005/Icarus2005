"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Building2, GitBranch, User } from "lucide-react";
import ProductBadge from "@/components/ProductBadge";
import { productLabel, parseProductList } from "@/lib/products";
import { marketLabels } from "@/lib/constants";
import { fmtMoney } from "@/lib/format";

type Lead = {
  id: string;
  name: string;
  company: string | null;
  markets: string;
  primaryProduct: string;
  secondaryProducts: string | null;
  estimatedValue: number | null;
  convertedOpportunityId: string | null;
  owner: { id: string; name: string } | null;
};

type Pipeline = {
  id: string;
  name: string;
  productKey: string;
  active: boolean;
  stages: { id: string; key: string; name: string; isWon: boolean; isLost: boolean; active: boolean; defaultProbability: number }[];
};

export default function ConvertLeadPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [converting, setConverting] = useState(false);

  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [secondarySelected, setSecondarySelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch(`/api/leads/${params.id}`).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      fetch("/api/pipelines").then((r) => r.json()),
    ])
      .then(([l, p]: [Lead, Pipeline[]]) => {
        setLead(l);
        setPipelines(p);
        setName(`${productLabel(l.primaryProduct)} — ${l.company?.trim() || l.name}`);
        setValue(l.estimatedValue != null ? String(l.estimatedValue) : "");
      })
      .catch(() => setLoadError("Could not load the lead."));
  }, [params.id]);

  if (loadError) {
    return (
      <div className="p-8">
        <div role="alert" className="card p-6 text-red-600">{loadError}</div>
      </div>
    );
  }
  if (!lead) return <div className="p-8 text-gray-400">Loading…</div>;

  if (lead.convertedOpportunityId) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="card p-6">
          <p className="text-gray-700">This lead has already been converted.</p>
          <Link href={`/opportunities/${lead.convertedOpportunityId}`} className="btn-primary mt-4 inline-flex">
            View Deal
          </Link>
        </div>
      </div>
    );
  }

  const unclassified = lead.primaryProduct === "UNASSIGNED";
  const pipeline = pipelines.find((p) => p.productKey === lead.primaryProduct && p.active);
  const initialStage = pipeline?.stages.find((s) => s.active && !s.isWon && !s.isLost);
  const secondaries = parseProductList(lead.secondaryProducts);
  const companyName = lead.company?.trim() || lead.name;

  function toggleSecondary(key: string) {
    const next = new Set(secondarySelected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSecondarySelected(next);
  }

  async function handleConvert() {
    setConverting(true);
    setError("");
    const res = await fetch(`/api/leads/${lead!.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || undefined,
        value: value !== "" ? Number(value) : undefined,
        secondaries: Array.from(secondarySelected).map((product) => ({ product })),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/opportunities/${data.opportunityId}`);
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Conversion failed.");
      setConverting(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href={`/leads/${lead.id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {lead.name}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Convert Lead</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Review exactly what will be created before converting. Nothing is created silently.
        </p>
      </div>

      {unclassified ? (
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" aria-hidden />
            <div>
              <p className="font-medium text-gray-800">This lead has no primary product.</p>
              <p className="text-sm text-gray-500 mt-1">
                Assign a business line before converting so the opportunity lands on the right pipeline.
              </p>
              <Link href={`/leads/${lead.id}/edit`} className="btn-primary mt-4 inline-flex">
                Assign Primary Product
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* What will be created */}
          <div className="card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">Primary Opportunity</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Product</p>
                <div className="mt-1"><ProductBadge product={lead.primaryProduct} size="md" /></div>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Pipeline</p>
                <p className="mt-1 flex items-center gap-1.5 text-gray-700">
                  <GitBranch size={14} className="text-gray-400" aria-hidden />
                  {pipeline?.name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Initial Stage</p>
                <p className="mt-1 text-gray-700">{initialStage?.name ?? "—"} ({initialStage?.defaultProbability ?? 0}%)</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Owner</p>
                <p className="mt-1 flex items-center gap-1.5 text-gray-700">
                  <User size={14} className="text-gray-400" aria-hidden />
                  {lead.owner?.name ?? "Unassigned"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Account</p>
                <p className="mt-1 flex items-center gap-1.5 text-gray-700">
                  <Building2 size={14} className="text-gray-400" aria-hidden />
                  {companyName} <span className="text-xs text-gray-400">(found or created — shared across products)</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Markets</p>
                <p className="mt-1 text-gray-700">{marketLabels(lead.markets)}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-100">
              <div className="col-span-2">
                <label className="label" htmlFor="cv-name">Opportunity Name</label>
                <input id="cv-name" value={name} onChange={(e) => setName(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="cv-value">Value (USD)</label>
                <input
                  id="cv-value"
                  type="number"
                  min="0"
                  step="1000"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="input"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Optional secondary opportunities */}
          {secondaries.length > 0 && (
            <div className="card p-6">
              <h2 className="text-sm font-semibold text-gray-800">Additional Opportunities (optional)</h2>
              <p className="text-xs text-gray-500 mt-1 mb-3">
                This lead also flagged interest in other business lines. Each creates a <strong>separate</strong> opportunity
                on its own product pipeline — products are never combined into one deal.
              </p>
              <div className="space-y-2">
                {secondaries.map((key) => {
                  const p = pipelines.find((pl) => pl.productKey === key && pl.active);
                  const checked = secondarySelected.has(key);
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        checked ? "border-brand-400 bg-brand-50/50" : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSecondary(key)}
                        className="accent-brand-600"
                      />
                      <ProductBadge product={key} />
                      <span className="text-sm text-gray-600">
                        {productLabel(key)} — {companyName}
                      </span>
                      <span className="ml-auto text-xs text-gray-400">{p?.name ?? ""}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleConvert} disabled={converting} className="btn-primary disabled:opacity-60">
              {converting
                ? "Converting…"
                : `Convert${secondarySelected.size > 0 ? ` (creates ${1 + secondarySelected.size} opportunities)` : ""}`}
            </button>
            <Link href={`/leads/${lead.id}`} className="btn-secondary">Cancel</Link>
          </div>
        </div>
      )}
    </div>
  );
}
