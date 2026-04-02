"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DEAL_STAGES, DEAL_STAGE_ORDER, DEAL_TYPES } from "@/lib/constants";

export default function NewOpportunityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillAccountId = searchParams.get("accountId") ?? "";
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then(setAccounts);
  }, []);

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
    const res = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const opp = await res.json();
      router.push(`/opportunities/${opp.id}`);
    } else {
      setError("Failed to create opportunity.");
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
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <div>
          <label className="label">Deal Name *</label>
          <input name="name" required className="input" placeholder="e.g. Mobility Data Subscription - Dubai" />
        </div>

        <div>
          <label className="label">Account *</label>
          <select name="accountId" required defaultValue={prefillAccountId} className="input">
            <option value="">Select account...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Stage</label>
            <select name="stage" defaultValue="LEAD" className="input">
              {DEAL_STAGE_ORDER.map((s) => (
                <option key={s} value={s}>{DEAL_STAGES[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select name="type" defaultValue="DATA_PRODUCT" className="input">
              {Object.entries(DEAL_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Value (USD)</label>
            <input name="value" type="number" min="0" step="1000" className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Probability (%)</label>
            <input name="probability" type="number" min="0" max="100" className="input" placeholder="50" />
          </div>
        </div>

        <div>
          <label className="label">Expected Close Date</label>
          <input name="expectedCloseDate" type="date" className="input" />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea name="notes" rows={3} className="input resize-none" placeholder="Context, requirements, key info..." />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Create Opportunity"}
          </button>
          <Link href="/opportunities" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
