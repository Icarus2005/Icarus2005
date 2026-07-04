"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DEAL_STAGES, DEAL_STAGE_ORDER, DEAL_TYPES } from "@/lib/constants";

export default function EditOpportunityPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [opp, setOpp] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/opportunities/${params.id}`).then((r) => r.json()).then(setOpp);
  }, [params.id]);

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
    const res = await fetch(`/api/opportunities/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push(`/opportunities/${params.id}`);
    } else {
      setError("Failed to save.");
      setSaving(false);
    }
  }

  if (!opp) return <div className="p-8 text-gray-400">Loading...</div>;

  const closeDate = opp.expectedCloseDate
    ? new Date(opp.expectedCloseDate as string).toISOString().split("T")[0]
    : "";

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href={`/opportunities/${params.id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {String(opp.name)}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Edit Opportunity</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}
        <div>
          <label className="label">Deal Name *</label>
          <input name="name" required defaultValue={String(opp.name ?? "")} className="input" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Stage</label>
            <select name="stage" defaultValue={String(opp.stage ?? "IDENTIFIED")} className="input">
              {DEAL_STAGE_ORDER.map((s) => (
                <option key={s} value={s}>{DEAL_STAGES[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Product</label>
            <select name="type" defaultValue={String(opp.type ?? "MAYA")} className="input">
              {Object.entries(DEAL_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Value (USD)</label>
            <input name="value" type="number" min="0" step="1000" defaultValue={String(opp.value ?? "")} className="input" />
          </div>
          <div>
            <label className="label">Probability (%)</label>
            <input name="probability" type="number" min="0" max="100" defaultValue={String(opp.probability ?? "")} className="input" />
          </div>
        </div>
        <div>
          <label className="label">Expected Close Date</label>
          <input name="expectedCloseDate" type="date" defaultValue={closeDate} className="input" />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="dmFlag"
            name="decisionMakerEngaged"
            type="checkbox"
            defaultChecked={Boolean(opp.decisionMakerEngaged)}
            className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <label htmlFor="dmFlag" className="text-sm text-gray-700">Decision maker engaged</label>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea name="notes" rows={3} defaultValue={String(opp.notes ?? "")} className="input resize-none" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link href={`/opportunities/${params.id}`} className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
