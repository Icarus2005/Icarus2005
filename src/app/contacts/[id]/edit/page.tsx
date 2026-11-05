"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ACQUISITION_PATHS,
  CONTACT_ROLES,
  LEAD_SOURCE_TYPES,
  RELATIONSHIP_STRENGTHS,
} from "@/lib/constants";

export default function EditContactPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contact, setContact] = useState<Record<string, string> | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [referrers, setReferrers] = useState<{ id: string; firstName: string; lastName: string; accountId: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/contacts/${id}`).then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/contacts").then((r) => r.json()),
    ]).then(([c, a, allContacts]) => {
      setContact(c);
      setAccounts(a);
      setReferrers(allContacts.filter((item: { id: string }) => item.id !== id));
    });
  }, [id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const nullableFields = new Set([
      "title", "role", "email", "phone", "linkedin", "relationshipStrength",
      "sourceType", "sourceDetail", "acquisitionPath", "referredById",
    ]);
    const body = Object.fromEntries(Object.entries(data).map(([key, value]) => [
      key,
      nullableFields.has(key) && value === "" ? null : value,
    ]));
    const res = await fetch(`/api/contacts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push(`/contacts/${id}`);
    } else {
      setError("Failed to save.");
      setSaving(false);
    }
  }

  if (!contact) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href={`/contacts/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {contact.firstName} {contact.lastName}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Edit Contact</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">First Name *</label>
            <input name="firstName" required defaultValue={contact.firstName} className="input" />
          </div>
          <div>
            <label className="label">Last Name *</label>
            <input name="lastName" required defaultValue={contact.lastName} className="input" />
          </div>
        </div>

        <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
          <h2 className="text-sm font-semibold text-gray-800">Relationship memory</h2>
          <p className="mt-1 text-xs text-gray-500">These are deliberate user-recorded facts. Buying role and relationship strength remain separate.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">Relationship Strength</label>
              <select name="relationshipStrength" defaultValue={contact.relationshipStrength ?? ""} className="input">
                <option value="">Unknown</option>
                {Object.entries(RELATIONSHIP_STRENGTHS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Source Type</label>
              <select name="sourceType" defaultValue={contact.sourceType ?? ""} className="input">
                <option value="">Unknown</option>
                {Object.entries(LEAD_SOURCE_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Source Detail</label>
              <input name="sourceDetail" defaultValue={contact.sourceDetail ?? ""} className="input" placeholder="Event, introducer or context" />
            </div>
            <div>
              <label className="label">Acquisition Path</label>
              <select name="acquisitionPath" defaultValue={contact.acquisitionPath ?? ""} className="input">
                <option value="">Unknown</option>
                {Object.entries(ACQUISITION_PATHS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Referred By</label>
              <select name="referredById" defaultValue={contact.referredById ?? ""} className="input">
                <option value="">Not recorded</option>
                {referrers.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}{item.accountId === contact.accountId ? " · same Account" : ""}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-gray-400">Select only when a referral or introduction is known; leave blank rather than inferring.</p>
            </div>
          </div>
        </div>
        <div>
          <label className="label">Account *</label>
          <select name="accountId" required defaultValue={contact.accountId} className="input">
            <option value="">Select account...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Job Title</label>
            <input name="title" defaultValue={contact.title ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Role</label>
            <select name="role" defaultValue={contact.role ?? ""} className="input">
              <option value="">Select role</option>
              {Object.entries(CONTACT_ROLES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" defaultValue={contact.email ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" defaultValue={contact.phone ?? ""} className="input" />
          </div>
        </div>

        <div>
          <label className="label">LinkedIn</label>
          <input name="linkedin" type="url" defaultValue={contact.linkedin ?? ""} className="input" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link href={`/contacts/${id}`} className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
