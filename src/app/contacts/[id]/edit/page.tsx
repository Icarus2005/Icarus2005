"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CONTACT_ROLES } from "@/lib/constants";

export default function EditContactPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [contact, setContact] = useState<Record<string, string> | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/contacts/${params.id}`).then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
    ]).then(([c, a]) => {
      setContact(c);
      setAccounts(a);
    });
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const body = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== ""));
    const res = await fetch(`/api/contacts/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push(`/contacts/${params.id}`);
    } else {
      setError("Failed to save.");
      setSaving(false);
    }
  }

  if (!contact) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href={`/contacts/${params.id}`} className="text-sm text-gray-500 hover:text-gray-700">
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
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <Link href={`/contacts/${params.id}`} className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
