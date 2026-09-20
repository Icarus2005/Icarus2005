"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ACTIVITY_TYPES } from "@/lib/constants";
import { BUSINESS_LINES, PRODUCTS_META } from "@/lib/products";
import OwnerSelect from "@/components/OwnerSelect";

function NewActivityPageForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillAccountId = searchParams.get("accountId") ?? "";
  const prefillContactId = searchParams.get("contactId") ?? "";
  const prefillOpportunityId = searchParams.get("opportunityId") ?? "";
  const prefillLeadId = searchParams.get("leadId") ?? "";
  const prefillProduct = searchParams.get("product") ?? "";

  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [contacts, setContacts] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [opportunities, setOpportunities] = useState<{ id: string; name: string }[]>([]);
  const [leads, setLeads] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [leadId, setLeadId] = useState(prefillLeadId);
  const [opportunityId, setOpportunityId] = useState(prefillOpportunityId);
  // Controlled (not defaultValue) because options load asynchronously —
  // defaultValue is only applied at mount, so it silently fails to prefill
  // once the option list arrives after the initial render.
  const [accountId, setAccountId] = useState(prefillAccountId);
  const [contactId, setContactId] = useState(prefillContactId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Optional follow-up task, created only if the checkbox is selected — kept
  // as separate React state rather than named form fields, since it posts
  // to a different endpoint (/api/tasks) and must never collide with the
  // Activity form's own `ownerId` field in the same FormData submission.
  const [createTask, setCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskClientCommitmentDate, setTaskClientCommitmentDate] = useState("");
  const [taskOwnerId, setTaskOwnerId] = useState("");
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);

  // Product inherits from the linked lead/opportunity automatically.
  const productInherited = Boolean(leadId || opportunityId);

  useEffect(() => {
    Promise.all([
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/contacts").then((r) => r.json()),
      fetch("/api/opportunities").then((r) => r.json()),
      fetch("/api/leads").then((r) => r.json()),
    ]).then(([a, c, o, l]) => {
      setAccounts(a);
      setContacts(c);
      setOpportunities(o);
      setLeads(l);
    });
  }, []);

  useEffect(() => {
    fetch("/api/team")
      .then((r) => r.json())
      .then((list: { id: string; name: string; active: boolean }[]) => setOwners(list.filter((m) => m.active)))
      .catch(() => {});
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
      // Optional follow-up task — only created when the checkbox is
      // explicitly selected, never as a side effect of logging the
      // Activity. Linked to the same Account/Contact/Lead/Opportunity
      // context the Activity itself was just linked to.
      if (createTask && taskTitle.trim()) {
        const taskBody: Record<string, string> = { title: taskTitle };
        if (taskDueDate) taskBody.dueDate = taskDueDate;
        if (taskClientCommitmentDate) taskBody.clientCommitmentDate = taskClientCommitmentDate;
        if (taskOwnerId) taskBody.ownerId = taskOwnerId;
        if (typeof body.accountId === "string") taskBody.accountId = body.accountId;
        if (typeof body.contactId === "string") taskBody.contactId = body.contactId;
        if (typeof body.leadId === "string") taskBody.leadId = body.leadId;
        if (typeof body.opportunityId === "string") taskBody.opportunityId = body.opportunityId;
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(taskBody),
        });
      }
      // Navigate back contextually
      if (prefillLeadId) router.push(`/leads/${prefillLeadId}`);
      else if (prefillOpportunityId) router.push(`/opportunities/${prefillOpportunityId}`);
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
          <label className="label">Lead</label>
          <select name="leadId" value={leadId} onChange={(e) => setLeadId(e.target.value)} className="input">
            <option value="">Select lead...</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}{l.company ? ` (${l.company})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Account</label>
          <select name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
            <option value="">Select account...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Contact</label>
          <select name="contactId" value={contactId} onChange={(e) => setContactId(e.target.value)} className="input">
            <option value="">Select contact...</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Opportunity</label>
          <select name="opportunityId" value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} className="input">
            <option value="">Select opportunity...</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Product</label>
            {productInherited ? (
              <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                Inherited from the linked {opportunityId ? "deal" : "lead"}.
              </p>
            ) : (
              <select name="product" defaultValue={prefillProduct} className="input">
                <option value="">No product context</option>
                {BUSINESS_LINES.map((k) => (
                  <option key={k} value={k}>{PRODUCTS_META[k].label}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="label">Logged By</label>
            <OwnerSelect />
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea name="notes" rows={4} className="input resize-none" placeholder="Meeting notes, key takeaways, next steps..." />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={createTask}
              onChange={(e) => setCreateTask(e.target.checked)}
              className="accent-brand-600"
            />
            Create follow-up task
          </label>
          {createTask && (
            <div className="mt-3 space-y-4 bg-gray-50 border border-gray-100 rounded-xl p-4">
              <div>
                <label className="label">Task Title *</label>
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  required={createTask}
                  className="input"
                  placeholder="e.g. Send proposal follow-up"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Due Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="input"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Internal follow-up target — not a date the client agreed to.</p>
                </div>
                <div>
                  <label className="label">Client Commitment Date</label>
                  <input
                    type="date"
                    value={taskClientCommitmentDate}
                    onChange={(e) => setTaskClientCommitmentDate(e.target.value)}
                    className="input"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Only if the client actually agreed to a date.</p>
                </div>
              </div>
              <div>
                <label className="label">Task Owner</label>
                <select value={taskOwnerId} onChange={(e) => setTaskOwnerId(e.target.value)} className="input">
                  <option value="">Unassigned</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
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

export default function NewActivityPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading...</div>}>
      <NewActivityPageForm />
    </Suspense>
  );
}
