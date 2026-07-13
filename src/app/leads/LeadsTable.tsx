"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductBadge from "@/components/ProductBadge";
import {
  LEAD_STATUSES,
  LEAD_STATUS_COLORS,
  LEAD_SOURCES,
  marketLabels,
} from "@/lib/constants";
import { BUSINESS_LINES, PRODUCTS_META, SALES_MOTIONS, parseProductList } from "@/lib/products";
import { fmtMoney, fmtDate, daysSince, isOverdue } from "@/lib/format";

export type LeadRow = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  primaryProduct: string;
  secondaryProducts: string | null;
  markets: string;
  source: string | null;
  salesMotion: string | null;
  score: number | null;
  status: string;
  estimatedValue: number | null;
  nextAction: string | null;
  nextActionDate: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  owner: { id: string; name: string } | null;
};

type Member = { id: string; name: string };

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-gray-300">—</span>;
  const color =
    score >= 70 ? "bg-green-100 text-green-700"
    : score >= 40 ? "bg-yellow-100 text-yellow-700"
    : "bg-gray-100 text-gray-500";
  return <span className={`badge ${color}`}>{score}</span>;
}

export default function LeadsTable({ leads, owners }: { leads: LeadRow[]; owners: Member[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProduct, setBulkProduct] = useState("");
  const [bulkOwner, setBulkOwner] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  const allSelected = leads.length > 0 && selected.size === leads.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  }
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function applyBulk() {
    if (selected.size === 0 || (!bulkProduct && !bulkOwner)) return;
    setApplying(true);
    setError("");
    const body: Record<string, unknown> = { ids: Array.from(selected) };
    if (bulkProduct) body.primaryProduct = bulkProduct;
    if (bulkOwner) body.ownerId = bulkOwner === "UNASSIGN" ? null : bulkOwner;
    const res = await fetch("/api/leads/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSelected(new Set());
      setBulkProduct("");
      setBulkOwner("");
      router.refresh();
    } else {
      const err = await res.json().catch(() => null);
      setError(err?.error ?? "Bulk update failed");
    }
    setApplying(false);
  }

  return (
    <div>
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="card p-3 mb-3 flex items-center gap-3 flex-wrap border-brand-200 ring-1 ring-brand-100">
          <span className="text-sm font-medium text-gray-700">{selected.size} selected</span>
          <label className="sr-only" htmlFor="bulk-product">Assign product</label>
          <select
            id="bulk-product"
            value={bulkProduct}
            onChange={(e) => setBulkProduct(e.target.value)}
            className="input w-52"
          >
            <option value="">Assign primary product…</option>
            {[...BUSINESS_LINES, "UNASSIGNED" as const].map((k) => (
              <option key={k} value={k}>{PRODUCTS_META[k].label}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="bulk-owner">Assign owner</label>
          <select
            id="bulk-owner"
            value={bulkOwner}
            onChange={(e) => setBulkOwner(e.target.value)}
            className="input w-48"
          >
            <option value="">Assign owner…</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
            <option value="UNASSIGN">— Clear owner —</option>
          </select>
          <button
            onClick={applyBulk}
            disabled={applying || (!bulkProduct && !bulkOwner)}
            className="btn-primary disabled:opacity-50"
          >
            {applying ? "Applying…" : "Apply"}
          </button>
          <button onClick={() => setSelected(new Set())} className="btn-secondary">Clear</button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-th w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all leads"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="accent-brand-600"
                  />
                </th>
                <th className="table-th">Lead</th>
                <th className="table-th">Company</th>
                <th className="table-th">Primary Product</th>
                <th className="table-th">Secondary</th>
                <th className="table-th">Owner</th>
                <th className="table-th">Markets</th>
                <th className="table-th">Source</th>
                <th className="table-th">Motion</th>
                <th className="table-th text-center">Score</th>
                <th className="table-th">Status</th>
                <th className="table-th text-right">Est. Value</th>
                <th className="table-th">Last Contact</th>
                <th className="table-th">Next Action</th>
                <th className="table-th text-right">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.length === 0 && (
                <tr>
                  <td colSpan={15} className="table-td text-center text-gray-400 py-10">
                    No leads match these filters.{" "}
                    <Link href="/leads/new" className="text-brand-600 hover:underline">Add one</Link>
                  </td>
                </tr>
              )}
              {leads.map((lead) => {
                const secondary = parseProductList(lead.secondaryProducts);
                const age = daysSince(lead.createdAt);
                const overdue = isOverdue(lead.nextActionDate) && lead.status !== "DISQUALIFIED";
                return (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td">
                      <input
                        type="checkbox"
                        aria-label={`Select ${lead.name}`}
                        checked={selected.has(lead.id)}
                        onChange={() => toggle(lead.id)}
                        className="accent-brand-600"
                      />
                    </td>
                    <td className="table-td font-medium whitespace-nowrap">
                      <Link href={`/leads/${lead.id}`} className="text-brand-600 hover:underline">
                        {lead.name}
                      </Link>
                      {lead.title && <p className="text-xs text-gray-400">{lead.title}</p>}
                    </td>
                    <td className="table-td text-gray-600 whitespace-nowrap">{lead.company ?? "—"}</td>
                    <td className="table-td"><ProductBadge product={lead.primaryProduct} /></td>
                    <td className="table-td">
                      {secondary.length === 0 ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <span className="flex gap-1 flex-wrap">
                          {secondary.map((k) => (
                            <ProductBadge key={k} product={k} muted />
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {lead.owner?.name ?? <span className="text-gray-300">Unassigned</span>}
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">{marketLabels(lead.markets)}</td>
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {lead.source ? (LEAD_SOURCES[lead.source] ?? lead.source) : "—"}
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">
                      {lead.salesMotion ? (SALES_MOTIONS[lead.salesMotion] ?? lead.salesMotion) : "—"}
                    </td>
                    <td className="table-td text-center"><ScoreBadge score={lead.score} /></td>
                    <td className="table-td">
                      <span className={`badge ${LEAD_STATUS_COLORS[lead.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {LEAD_STATUSES[lead.status] ?? lead.status}
                      </span>
                    </td>
                    <td className="table-td text-right font-medium whitespace-nowrap">
                      {lead.estimatedValue != null ? fmtMoney(lead.estimatedValue) : "—"}
                    </td>
                    <td className="table-td text-gray-500 whitespace-nowrap">{fmtDate(lead.lastActivityAt)}</td>
                    <td className="table-td max-w-[180px]">
                      {lead.nextAction ? (
                        <span className={overdue ? "text-red-600" : "text-gray-600"}>
                          <span className="line-clamp-1 text-sm">{lead.nextAction}</span>
                          {lead.nextActionDate && (
                            <span className="text-xs">{fmtDate(lead.nextActionDate)}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="table-td text-right text-gray-500 whitespace-nowrap">
                      {age != null ? `${age}d` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
