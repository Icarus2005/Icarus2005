"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import OwnerSelect from "@/components/OwnerSelect";

function NewTaskPageForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillLeadId = searchParams.get("leadId") ?? "";
  const prefillAccountId = searchParams.get("accountId") ?? "";
  const prefillOpportunityId = searchParams.get("opportunityId") ?? "";

  const [leads, setLeads] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [opportunities, setOpportunities] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/leads").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/opportunities").then((r) => r.json()),
    ]).then(([l, a, o]) => {
      setLeads(l);
      setAccounts(a);
      setOpportunities(o);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const body = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== ""));
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      if (prefillLeadId) router.push(`/leads/${prefillLeadId}`);
      else if (prefillOpportunityId) router.push(`/opportunities/${prefillOpportunityId}`);
      else router.push("/tasks");
    } else {
      setError("Failed to create task.");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/tasks" className="text-sm text-gray-500 hover:text-gray-700">← Tasks</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Task</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <div>
          <label className="label">Task *</label>
          <input name="title" required className="input" placeholder="e.g. Follow up with Omar on proposal" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Due Date</label>
            <input name="dueDate" type="date" className="input" />
          </div>
          <div>
            <label className="label">Assigned To</label>
            <OwnerSelect />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Linked Lead</label>
            <select name="leadId" defaultValue={prefillLeadId} className="input">
              <option value="">None</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}{l.company ? ` (${l.company})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Linked Deal</label>
            <select name="opportunityId" defaultValue={prefillOpportunityId} className="input">
              <option value="">None</option>
              {opportunities.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Linked Account</label>
          <select name="accountId" defaultValue={prefillAccountId} className="input">
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea name="notes" rows={3} className="input resize-none" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Create Task"}
          </button>
          <Link href="/tasks" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading...</div>}>
      <NewTaskPageForm />
    </Suspense>
  );
}
