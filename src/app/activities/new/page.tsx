"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ACTIVITY_TYPES } from "@/lib/constants";

export default function NewActivityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillAccountId = searchParams.get("accountId") ?? "";
  const prefillContactId = searchParams.get("contactId") ?? "";
  const prefillOpportunityId = searchParams.get("opportunityId") ?? "";

  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [opportunities, setOpportunities] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/contacts").then((r) => r.json()),
      fetch("/api/opportunities").then((r) => r.json()),
    ]).then(([a, c, o]) => {
      setAccounts(a);
      setContacts(c);
      setOpportunities(o);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const body = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== ""));
    const res = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      // Navigate back contextually
      if (prefillOpportunityId) router.push(`/opportunities/${prefillOpportunityId}`);
      else if (prefillAccountId) router.push(`/accounts/${prefillAccountId}`);
      else router.push("/activities");
    } else {
      setError("Failed to log activity.");
      setSaving(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/activities" className="text-sm text-gray-500 hover:text-gray-700">
          ← Activities
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Log Activity</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Type *</label>
            <select name="type" required defaultValue="MEETING" className="input">
              {Object.entries(ACTIVITY_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date *</label>
            <input name="date" type="date" required defaultValue={today} className="input" />
          </div>
        </div>

        <div>
          <label className="label">Subject *</label>
          <input name="subject" required className="input" placeholder="e.g. Discovery call with Ahmed" />
        </div>

        <div>
          <label className="label">Account</label>
          <select name="accountId" defaultValue={prefillAccountId} className="input">
            <option value="">Select account...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Contact</label>
          <select name="contactId" defaultValue={prefillContactId} className="input">
            <option value="">Select contact...</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Opportunity</label>
          <select name="opportunityId" defaultValue={prefillOpportunityId} className="input">
            <option value="">Select opportunity...</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea name="notes" rows={4} className="input resize-none" placeholder="Meeting notes, key takeaways, next steps..." />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Log Activity"}
          </button>
          <Link href="/activities" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
