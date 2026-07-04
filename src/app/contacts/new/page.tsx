"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CONTACT_ROLES } from "@/lib/constants";

function NewContactPageForm() {
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
    const body = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== ""));
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const contact = await res.json();
      router.push(`/contacts/${contact.id}`);
    } else {
      setError("Failed to create contact.");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/contacts" className="text-sm text-gray-500 hover:text-gray-700">
          ← Contacts
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Contact</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">First Name *</label>
            <input name="firstName" required className="input" placeholder="Ahmed" />
          </div>
          <div>
            <label className="label">Last Name *</label>
            <input name="lastName" required className="input" placeholder="Al-Rashidi" />
          </div>
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
            <label className="label">Job Title</label>
            <input name="title" className="input" placeholder="Head of Strategy" />
          </div>
          <div>
            <label className="label">Role</label>
            <select name="role" defaultValue="" className="input">
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
            <input name="email" type="email" className="input" placeholder="ahmed@example.com" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" type="tel" className="input" placeholder="+971-50-000-0000" />
          </div>
        </div>

        <div>
          <label className="label">LinkedIn</label>
          <input name="linkedin" type="url" className="input" placeholder="https://linkedin.com/in/..." />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Create Contact"}
          </button>
          <Link href="/contacts" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

export default function NewContactPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading...</div>}>
      <NewContactPageForm />
    </Suspense>
  );
}
