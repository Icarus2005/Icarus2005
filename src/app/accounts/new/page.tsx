"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { GCC_COUNTRIES, SECTORS, COMPANY_SIZES } from "@/lib/constants";

export default function NewAccountPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    // Remove empty strings so Prisma uses defaults/null
    const body = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== "")
    );
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const acc = await res.json();
      router.push(`/accounts/${acc.id}`);
    } else {
      setError("Failed to create account. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/accounts" className="text-sm text-gray-500 hover:text-gray-700">
          ← Accounts
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Account</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label className="label">Company Name *</label>
          <input name="name" required className="input" placeholder="e.g. ACME Real Estate" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Country *</label>
            <select name="country" defaultValue="UAE" className="input">
              {Object.entries(GCC_COUNTRIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Sector *</label>
            <select name="sector" defaultValue="PRIVATE" className="input">
              {Object.entries(SECTORS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Industry</label>
            <input name="industry" className="input" placeholder="e.g. Real Estate" />
          </div>
          <div>
            <label className="label">Company Size</label>
            <select name="size" defaultValue="" className="input">
              <option value="">Select size</option>
              {Object.entries(COMPANY_SIZES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Website</label>
          <input name="website" type="url" className="input" placeholder="https://example.com" />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea name="description" rows={3} className="input resize-none" placeholder="Brief description..." />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Create Account"}
          </button>
          <Link href="/accounts" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
