"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  COUNTRIES,
  DIGITAL_MATURITY,
  LEAD_SOURCES,
  LEAD_STATUSES,
  parseMarkets,
} from "@/lib/constants";
import {
  BUSINESS_LINES,
  PRODUCTS_META,
  SALES_MOTIONS,
  parseProductList,
  type ProductKey,
} from "@/lib/products";
import OwnerSelect from "@/components/OwnerSelect";

export type LeadFormValues = {
  id?: string;
  name?: string;
  company?: string;
  title?: string;
  email?: string;
  phone?: string;
  markets?: string;
  sector?: string;
  primaryProduct?: string;
  secondaryProducts?: string | null;
  digitalMaturity?: string | null;
  source?: string | null;
  salesMotion?: string | null;
  tags?: string | null;
  status?: string;
  score?: number | null;
  estimatedValue?: number | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
  notes?: string | null;
  ownerId?: string | null;
};

export default function LeadForm({
  lead,
  defaultProduct,
}: {
  lead?: LeadFormValues;
  defaultProduct?: string;
}) {
  const router = useRouter();
  const isEdit = Boolean(lead?.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [primary, setPrimary] = useState<string>(
    lead?.primaryProduct && lead.primaryProduct !== "UNASSIGNED"
      ? lead.primaryProduct
      : defaultProduct && defaultProduct !== "UNASSIGNED"
        ? defaultProduct
        : ""
  );
  const [secondary, setSecondary] = useState<Set<string>>(
    new Set(parseProductList(lead?.secondaryProducts))
  );
  const [markets, setMarkets] = useState<Set<string>>(
    new Set(lead?.markets ? parseMarkets(lead.markets) : ["AE"])
  );

  function toggleSecondary(key: string) {
    const next = new Set(secondary);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSecondary(next);
  }
  function toggleMarket(code: string) {
    const next = new Set(markets);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setMarkets(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!primary) {
      setError("Select a primary product — every lead must belong to a business line.");
      return;
    }
    if (markets.size === 0) {
      setError("Select at least one market.");
      return;
    }
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const body: Record<string, unknown> = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== "")
    );
    body.primaryProduct = primary;
    body.secondaryProducts = Array.from(secondary).filter((k) => k !== primary);
    body.markets = Array.from(markets);
    body.ownerId = data.ownerId || null;
    if (isEdit) {
      // allow clearing optional text fields on edit
      for (const k of ["nextAction", "tags", "notes", "nextActionDate"]) {
        if (data[k] === "") body[k] = null;
      }
    }

    const res = await fetch(isEdit ? `/api/leads/${lead!.id}` : "/api/leads", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const saved = await res.json();
      router.push(`/leads/${saved.id ?? lead!.id}`);
      router.refresh();
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Failed to save lead.");
      setSaving(false);
    }
  }

  const nextActionDate = lead?.nextActionDate
    ? new Date(lead.nextActionDate).toISOString().split("T")[0]
    : "";

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-6">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Identity */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="lf-name">Name *</label>
          <input id="lf-name" name="name" required defaultValue={lead?.name ?? ""} className="input" placeholder="Omar Nasser" />
        </div>
        <div>
          <label className="label" htmlFor="lf-company">Company</label>
          <input id="lf-company" name="company" defaultValue={lead?.company ?? ""} className="input" placeholder="Alshaya Group" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label" htmlFor="lf-title">Job Title</label>
          <input id="lf-title" name="title" defaultValue={lead?.title ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="lf-email">Email</label>
          <input id="lf-email" name="email" type="email" defaultValue={lead?.email ?? ""} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="lf-phone">Phone</label>
          <input id="lf-phone" name="phone" defaultValue={lead?.phone ?? ""} className="input" />
        </div>
      </div>

      {/* Product classification */}
      <fieldset className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
        <legend className="text-sm font-semibold text-gray-800 px-1">Product Classification</legend>
        <div className="mb-1">
          <p className="label mb-2">
            Primary Product * <span className="font-normal text-gray-500">— the business line that owns the opportunity and forecast</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Primary product">
            {BUSINESS_LINES.map((key: ProductKey) => {
              const meta = PRODUCTS_META[key];
              const active = primary === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setPrimary(key);
                    if (secondary.has(key)) toggleSecondary(key);
                  }}
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
        <div className="mt-4">
          <p className="label mb-2">
            Secondary Interests <span className="font-normal text-gray-500">— additional ArqOne products relevant for cross-sell (never forecast)</span>
          </p>
          <div className="flex gap-2 flex-wrap">
            {BUSINESS_LINES.filter((k) => k !== primary).map((key) => {
              const meta = PRODUCTS_META[key];
              const active = secondary.has(key);
              return (
                <label
                  key={key}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                    active
                      ? "border-brand-400 bg-white text-gray-800 ring-1 ring-brand-200"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleSecondary(key)}
                    className="accent-brand-600"
                  />
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden />
                  {meta.label}
                </label>
              );
            })}
          </div>
        </div>
      </fieldset>

      {/* Markets */}
      <div>
        <p className="label mb-2">Markets * <span className="font-normal text-gray-500">— select every market this lead is active in</span></p>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(COUNTRIES).map(([code, name]) => {
            const active = markets.has(code);
            return (
              <label
                key={code}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                <input type="checkbox" checked={active} onChange={() => toggleMarket(code)} className="accent-brand-600" />
                {name}
              </label>
            );
          })}
        </div>
      </div>

      {/* Qualification */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label" htmlFor="lf-sector">Sector</label>
          <input id="lf-sector" name="sector" defaultValue={lead?.sector ?? ""} className="input" placeholder="Retail, Gov…" />
        </div>
        <div>
          <label className="label" htmlFor="lf-maturity">Digital Maturity</label>
          <select id="lf-maturity" name="digitalMaturity" defaultValue={lead?.digitalMaturity ?? ""} className="input">
            <option value="">Unknown</option>
            {Object.entries(DIGITAL_MATURITY).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lf-score">Score (0–100)</label>
          <input id="lf-score" name="score" type="number" min="0" max="100" defaultValue={lead?.score ?? ""} className="input" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label" htmlFor="lf-source">Source</label>
          <select id="lf-source" name="source" defaultValue={lead?.source ?? ""} className="input">
            <option value="">Select source</option>
            {Object.entries(LEAD_SOURCES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lf-motion">Sales Motion</label>
          <select id="lf-motion" name="salesMotion" defaultValue={lead?.salesMotion ?? ""} className="input">
            <option value="">Select motion</option>
            {Object.entries(SALES_MOTIONS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lf-value">Estimated Value (USD)</label>
          <input id="lf-value" name="estimatedValue" type="number" min="0" step="1000" defaultValue={lead?.estimatedValue ?? ""} className="input" placeholder="0" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label" htmlFor="lf-status">Status</label>
          <select id="lf-status" name="status" defaultValue={lead?.status ?? "NEW"} className="input">
            {Object.entries(LEAD_STATUSES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="lf-owner">Owner</label>
          <OwnerSelect defaultValue={lead?.ownerId} />
        </div>
        <div>
          <label className="label" htmlFor="lf-tags">Tags</label>
          <input id="lf-tags" name="tags" defaultValue={lead?.tags ?? ""} className="input" placeholder="GITEX, priority" />
        </div>
      </div>

      {/* Next action */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="label" htmlFor="lf-next">Next Action</label>
          <input id="lf-next" name="nextAction" defaultValue={lead?.nextAction ?? ""} className="input" placeholder="e.g. Send benchmark teaser" />
        </div>
        <div>
          <label className="label" htmlFor="lf-nextdate">Next Action Due</label>
          <input id="lf-nextdate" name="nextActionDate" type="date" defaultValue={nextActionDate} className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="lf-notes">Notes</label>
        <textarea id="lf-notes" name="notes" rows={3} defaultValue={lead?.notes ?? ""} className="input resize-none" placeholder="Context, requirements…" />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Lead"}
        </button>
        <Link href={isEdit ? `/leads/${lead!.id}` : "/leads"} className="btn-secondary">Cancel</Link>
      </div>
    </form>
  );
}
